import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { sendChatJSON } from '../../services/ai.service';
import type { AiTier } from '../../services/ai.service';
import * as fnsService from '../fns/fns.service';
import type { FnsCompanyCard } from '../fns/fns.service';

/**
 * Анализ конкурентов для конкретного бизнес-проекта.
 *
 * Алгоритм:
 * 1. Берём контекст бизнеса (название, описание, отрасль, ЦА, регион, уже указанные конкуренты).
 * 2. Просим LLM сгенерировать структурированный список реальных российских конкурентов
 *    (ЮЛ/ИП), которых имеет смысл проверить в ЕГРЮЛ/ЕГРИП.
 * 3. Для каждого кандидата ищем его в ФНС через `fns.service` (с кэшем 7 дней).
 *    Если у кандидата уже указан ИНН — идём сразу по ИНН.
 * 4. Возвращаем объединённый отчёт: что нашли в ФНС + что предложила LLM,
 *    плюс краткое markdown-summary, которое можно отдать пользователю в чат.
 */

/**
 * LLM используется ТОЛЬКО для определения ОКВЭД-кодов по описанию бизнеса.
 * Реальный список конкурентов берётся из ФНС через поиск по ОКВЭД — без галлюцинаций.
 */
const SYSTEM_PROMPT_OKVED_CLASSIFY = `Ты — эксперт по российской классификации видов деятельности (ОКВЭД).
На основе описания бизнеса верни 1–3 наиболее подходящих кода ОКВЭД для поиска конкурентов в ЕГРЮЛ.

Правила:
- Только реальные коды из справочника ОКВЭД-2.
- Предпочитай точные коды (4-5 знаков) общим (2 знака).
- Верни в порядке убывания релевантности.

Ответь СТРОГО JSON без markdown-обёртки:
{"okved": ["62.01", "62.02", "63.11"]}`;

interface OkvedClassification {
  okved: string[];
}

interface CompetitorCandidate {
  name: string;
  legalName?: string | null;
  inn?: string | null;
  ogrn?: string | null;
  searchQueries?: string[] | null;
  reason?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

export interface CompetitorAnalysisItem {
  candidate: CompetitorCandidate;
  /// Совпавшая карточка из ФНС (если нашли).
  fnsCard?: FnsCompanyCard;
  /// Был ли результат отдан из кэша БД (без обращения к ФНС в этом запросе).
  fromCache: boolean;
  matchScore: number;
  notFoundReason?: string;
}

export interface CompetitorAnalysisResult {
  businessId: string;
  generatedAt: string;
  totalCandidates: number;
  foundCount: number;
  items: CompetitorAnalysisItem[];
  summaryMarkdown: string;
}

export interface AnalyzeCompetitorsOptions {
  /// Дополнительная подсказка от пользователя (например, "конкуренты по Москве").
  extraHint?: string;
  /// Выбранный пользователем tier ИИ (PREMIUM/PLUS). Определяет лимит конкурентов.
  aiTier?: AiTier;
}

/** PLUS — 2 конкурента, PREMIUM — 5. */
function tierLimit(tier?: AiTier): number {
  return tier === 'PLUS' ? 2 : 5;
}

export async function analyzeCompetitorsForBusiness(
  userId: string,
  businessId: string,
  options: AnalyzeCompetitorsOptions = {},
): Promise<CompetitorAnalysisResult> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
  });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  const limit = tierLimit(options.aiTier);
  const briefParts: string[] = [];
  briefParts.push(`Название: ${business.title}`);
  if (business.description) briefParts.push(`Описание: ${business.description}`);
  if (business.industry) briefParts.push(`Отрасль: ${business.industry}`);
  if (options.extraHint) briefParts.push(`Дополнительно: ${options.extraHint}`);

  // Шаг 1: LLM определяет ОКВЭД-коды — единственное что мы просим у неё.
  let okvedCodes: string[] = [];
  try {
    // OKVED классификация ВСЕГДА через PREMIUM (OpenAI) — GigaChat ненадёжен для JSON.
    // Это дешёвый внутренний вызов, не зависящий от тарифа пользователя.
    const classified = await sendChatJSON<OkvedClassification>(
      [
        { role: 'system', content: SYSTEM_PROMPT_OKVED_CLASSIFY },
        { role: 'user', content: briefParts.join('\n') },
      ],
      { tier: 'PREMIUM' },
    );
    okvedCodes = (classified.okved || [])
      .filter(c => typeof c === 'string' && /^\d{2}(\.\d{1,2}){0,2}$/.test(c.trim()))
      .map(c => c.trim())
      .slice(0, 3);
  } catch (err) {
    console.warn('[competitors] OKVED classification failed:', (err as Error).message);
  }

  // Если ОКВЭД не определили — поиск по первому значимому слову из отрасли
  if (okvedCodes.length === 0) {
    const rawIndustry = business.industry || business.title || '';
    const keyword = rawIndustry.split(/[,;\s]+/).find(w => w.length >= 4) || rawIndustry.slice(0, 20);
    console.log('[competitors] No OKVED, fallback keyword search:', keyword);
    try {
      const cards = await fnsService.searchByName(keyword, limit);
      return buildResult(businessId, cards, limit);
    } catch (err) {
      console.warn('[competitors] Fallback text search failed:', (err as Error).message);
      return emptyResult(businessId);
    }
  }

  console.log('[competitors] OKVED codes:', okvedCodes, 'limit:', limit);

  // Шаг 2: Реальный поиск компаний из ЕГРЮЛ по ОКВЭД через api-fns.ru
  const perCode = Math.ceil(limit / okvedCodes.length);
  const allCards: FnsCompanyCard[] = [];
  const seenInns = new Set<string>();

  for (const code of okvedCodes) {
    try {
      const cards = await fnsService.searchByOkved(code, perCode + 2);
      console.log('[competitors] OKVED', code, '→', cards.length, 'companies from FNS');
      for (const card of cards) {
        if (!seenInns.has(card.inn)) {
          seenInns.add(card.inn);
          allCards.push(card);
        }
      }
    } catch (err) {
      console.warn('[competitors] searchByOkved failed for', code, ':', (err as Error).message);
    }
  }

  if (allCards.length === 0) {
    return emptyResult(businessId);
  }

  return buildResult(businessId, allCards, limit);
}

async function buildResult(
  businessId: string,
  cards: FnsCompanyCard[],
  limit: number,
): Promise<CompetitorAnalysisResult> {
  const active = cards.filter(c => c.active).slice(0, limit);
  const display = active.length > 0 ? active : cards.slice(0, limit);

  // Обогащаем каждую карточку детальными данными через /egr (руководитель, ОКВЭД, финансы).
  // Лимит уже мал (2–5), поэтому запросы не дорогие.
  const enriched = await Promise.all(
    display.map(card => fnsService.getCompanyDetails(card.inn).catch(() => card)),
  );
  const finalCards = enriched.filter((c): c is FnsCompanyCard => Boolean(c));

  const items: CompetitorAnalysisItem[] = finalCards.map(card => ({
    candidate: { name: card.name, inn: card.inn, ogrn: card.ogrn },
    fnsCard: card,
    fromCache: false,
    matchScore: 1,
  }));

  return {
    businessId,
    generatedAt: new Date().toISOString(),
    totalCandidates: items.length,
    foundCount: items.length,
    items,
    summaryMarkdown: buildSummaryMarkdown(items),
  };
}


function emptyResult(businessId: string): CompetitorAnalysisResult {
  return {
    businessId,
    generatedAt: new Date().toISOString(),
    totalCandidates: 0,
    foundCount: 0,
    items: [],
    summaryMarkdown:
      'Не удалось сформировать список конкурентов: для данной идеи бизнеса слишком мало контекста. ' +
      'Уточните отрасль, описание продукта и регион — и попробуйте снова.',
  };
}

function buildSummaryMarkdown(items: CompetitorAnalysisItem[]): string {
  const lines: string[] = [];
  lines.push('## Конкуренты по данным ФНС РФ');
  lines.push('');

  const found = items.filter(i => i.fnsCard);
  const missed = items.filter(i => !i.fnsCard);

  if (found.length === 0) {
    lines.push('Ни по одному из кандидатов карточка в ЕГРЮЛ/ЕГРИП не найдена.');
  }

  for (const item of found) {
    const card = item.fnsCard!;
    lines.push(`### ${card.name}${card.legalForm ? ` (${card.legalForm})` : ''}`);
    lines.push(`- **ИНН:** ${card.inn}${card.ogrn ? ` · **ОГРН:** ${card.ogrn}` : ''}`);
    if (card.status) lines.push(`- **Статус:** ${card.status}${card.active ? '' : ' ⚠️'}`);
    if (card.registrationDate) lines.push(`- **Дата регистрации:** ${card.registrationDate}`);
    if (card.address) lines.push(`- **Адрес:** ${card.address}`);
    if (card.okvedMain) lines.push(`- **Основной ОКВЭД:** ${card.okvedMain.code} — ${card.okvedMain.name}`);
    if (card.director) lines.push(`- **Руководитель:** ${card.director}${card.directorPosition ? `, ${card.directorPosition}` : ''}`);
    if (card.authorizedCapital) lines.push(`- **Уставный капитал:** ${card.authorizedCapital}`);
    if (card.financials) {
      const f = card.financials;
      const parts: string[] = [];
      if (f.year) parts.push(`год ${f.year}`);
      if (f.revenue !== undefined) parts.push(`выручка ≈ ${formatMoney(f.revenue)} ₽`);
      if (f.netProfit !== undefined) parts.push(`чистая прибыль ≈ ${formatMoney(f.netProfit)} ₽`);
      if (f.employees !== undefined) parts.push(`сотрудников ${f.employees}`);
      if (parts.length) lines.push(`- **Отчётность:** ${parts.join(', ')}`);
    }
    if (item.candidate.reason) lines.push(`- **Почему конкурент:** ${item.candidate.reason}`);
    if (item.fromCache) lines.push(`- _данные из кэша БД_`);
    lines.push('');
  }

  if (missed.length > 0) {
    const apiUnavailable = missed.every(i => i.notFoundReason === 'Данные ФНС временно недоступны');
    if (apiUnavailable) {
      lines.push('> Сервис проверки по ЕГРЮЛ/ЕГРИП временно недоступен. Попробуйте повторить анализ позже.');
    } else {
      lines.push('### Не найдено в ЕГРЮЛ/ЕГРИП');
      for (const item of missed) {
        const name = item.candidate.legalName || item.candidate.name;
        lines.push(`- **${name}** — ${item.notFoundReason || 'нет точного совпадения'}`);
      }
    }
    lines.push('');
  }

  lines.push('> Данные из ФНС РФ (ЕГРЮЛ/ЕГРИП) могут устаревать. Для важных решений проверьте актуальность на nalog.ru или с бухгалтером/юристом.');
  return lines.join('\n');
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Math.round(value).toLocaleString('ru-RU');
}
