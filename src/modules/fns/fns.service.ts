import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import prisma from '../../config/database';
import { AppError } from '../../utils/errors';

/**
 * Сервис работы с API ФНС РФ (через провайдера api-fns.ru, ключ — в `config.fns.apiKey`).
 *
 * Документация: https://api-fns.ru/
 *
 * Поддерживаемые операции:
 * - Поиск ЮЛ/ИП по ИНН, ОГРН и наименованию (GET /egr, GET /search)
 * - Получение детальной карточки по ИНН (GET /egr) + бухгалтерская отчётность (GET /bo)
 *
 * Все обращения к ФНС идут через сквозной кэш в БД (`FnsCompanyCache`, `FnsSearchCache`)
 * с TTL `config.fns.cacheTtlMs` (по умолчанию 7 дней), чтобы повторные запросы по
 * одним и тем же организациям между пользователями не били по внешнему API.
 */

/// Экспортируется только ради тестового мока. Не использовать напрямую в продовом коде.
export const fnsClient = axios.create({
  baseURL: config.fns.baseUrl,
  timeout: 15000,
});

// ==================== Типы ====================

export type FnsEntityKind = 'UL' | 'IP';

export interface FnsOkved {
  code: string;
  name: string;
}

export interface FnsCompanyCard {
  kind: FnsEntityKind;
  inn: string;
  ogrn: string;
  kpp?: string;
  name: string;
  fullName?: string;
  legalForm?: string;
  status?: string;
  active: boolean;
  registrationDate?: string;
  terminationDate?: string;
  terminationReason?: string;
  address?: string;
  region?: string;
  director?: string;
  directorPosition?: string;
  authorizedCapital?: string;
  okvedMain?: FnsOkved;
  okvedAdditional?: FnsOkved[];
  /// Бухгалтерская отчётность (последний доступный год)
  financials?: {
    year?: number;
    revenue?: number;
    netProfit?: number;
    employees?: number;
  };
  source: 'api-fns.ru';
  fetchedAt: string;
}

// ==================== Public API ====================

/**
 * Найти ЮЛ/ИП по ИНН (карточка с детализацией и кэшированием на 7 дней).
 */
export async function searchByInn(inn: string): Promise<FnsCompanyCard[]> {
  validateInn(inn);

  const cached = await getCachedCompany(inn);
  if (cached) return [cached];

  const data = await callFns('/egr', { req: inn });
  const cards = parseEgrResponse(data);
  if (cards.length === 0) return [];

  await Promise.all(cards.map(card => upsertCompanyCache(card)));
  await enrichWithFinancials(cards[0]).catch(() => undefined);

  return cards;
}

/**
 * Найти ЮЛ/ИП по ОГРН/ОГРНИП.
 */
export async function searchByOgrn(ogrn: string): Promise<FnsCompanyCard[]> {
  if (!/^\d{13}$|^\d{15}$/.test(ogrn)) {
    throw new AppError('ОГРН должен содержать 13 (ЮЛ) или 15 (ИП) цифр', 400);
  }

  const data = await callFns('/egr', { req: ogrn });
  const cards = parseEgrResponse(data);
  await Promise.all(cards.map(card => upsertCompanyCache(card)));
  return cards;
}

/**
 * Поиск по наименованию/произвольной строке. Возвращает топ-N карточек.
 * Кэширует список ИНН по нормализованному запросу.
 */
export async function searchByName(query: string, limit = 10): Promise<FnsCompanyCard[]> {
  const normalized = normalizeQuery(query);
  if (!normalized || normalized.length < 2) {
    throw new AppError('Поисковый запрос должен содержать минимум 2 символа', 400);
  }

  const searchKey = `name:${normalizeForCache(normalized)}:${limit}`;
  const now = new Date();

  const cachedSearch = await prisma.fnsSearchCache.findUnique({ where: { query: searchKey } });
  if (cachedSearch && cachedSearch.expiresAt > now) {
    const innList = safeParseJson<string[]>(cachedSearch.innList) || [];
    const cards = await Promise.all(innList.map(inn => getCachedCompany(inn)));
    const fresh = cards.filter((c): c is FnsCompanyCard => Boolean(c));
    if (fresh.length > 0) return fresh;
  }

  const data = await callFns('/search', { q: normalized });
  const cards = parseSearchResponse(data).slice(0, limit);

  await Promise.all(cards.map(card => upsertCompanyCache(card)));
  await prisma.fnsSearchCache.upsert({
    where: { query: searchKey },
    create: {
      query: searchKey,
      innList: JSON.stringify(cards.map(c => c.inn)),
      expiresAt: new Date(now.getTime() + config.fns.cacheTtlMs),
    },
    update: {
      innList: JSON.stringify(cards.map(c => c.inn)),
      expiresAt: new Date(now.getTime() + config.fns.cacheTtlMs),
      fetchedAt: now,
    },
  });

  return cards;
}

/**
 * Детальная карточка компании по ИНН (включая бухгалтерскую отчётность, если доступна).
 */
export async function getCompanyDetails(inn: string): Promise<FnsCompanyCard | null> {
  validateInn(inn);

  const cached = await getCachedCompany(inn);
  // /search кэширует «плоские» карточки без руководителя/ОКВЭД/финансов.
  // Если карточка «мелкая» — перезапрашиваем через /egr для обогащения.
  if (cached && isDetailedCard(cached)) return cached;

  const data = await callFns('/egr', { req: inn });
  const cards = parseEgrResponse(data);
  if (cards.length === 0) return cached || null; // если /egr пуст, вернём хотя бы shallow

  const card = cards[0];
  await enrichWithFinancials(card).catch(() => undefined);
  await upsertCompanyCache(card);
  return card;
}

/** Проверяет, что карточка содержит детализацию из /egr (а не только плоские данные /search). */
function isDetailedCard(card: FnsCompanyCard): boolean {
  // /egr-карточки имеют хотя бы одно из: director, fullName, legalForm, okvedMain
  return Boolean(card.director || card.fullName || card.legalForm || card.okvedMain);
}

/**
 * Найти компании по ОКВЭД-коду через api-fns.ru /search с фильтром.
 * Возвращает до `limit` активных компаний в данной нише.
 * Используется для реального поиска конкурентов без участия LLM.
 */
export async function searchByOkved(okvedCode: string, limit = 20): Promise<FnsCompanyCard[]> {
  const cacheKey = `okved:${okvedCode}:${limit}`;
  const now = new Date();

  const cached = await prisma.fnsSearchCache.findUnique({ where: { query: cacheKey } });
  if (cached && cached.expiresAt > now) {
    const innList = safeParseJson<string[]>(cached.innList) || [];
    const cards = await Promise.all(innList.map(inn => getCachedCompany(inn)));
    const fresh = cards.filter((c): c is FnsCompanyCard => Boolean(c));
    if (fresh.length > 0) return fresh;
  }

  // api-fns.ru /search поддерживает фильтр +ОКВЭД(код) в строке запроса
  const data = await callFns('/search', { q: `+ОКВЭД(${okvedCode})+Статус(Действующий)` });
  const cards = parseSearchResponse(data).slice(0, limit);

  if (cards.length > 0) {
    await Promise.all(cards.map(card => upsertCompanyCache(card)));
    await prisma.fnsSearchCache.upsert({
      where: { query: cacheKey },
      create: { query: cacheKey, innList: JSON.stringify(cards.map(c => c.inn)), expiresAt: new Date(now.getTime() + config.fns.cacheTtlMs) },
      update: { innList: JSON.stringify(cards.map(c => c.inn)), expiresAt: new Date(now.getTime() + config.fns.cacheTtlMs), fetchedAt: now },
    });
  }

  return cards;
}

/**
 * Принудительно перечитать карточку компании из ФНС, игнорируя кэш.
 */
export async function refreshCompany(inn: string): Promise<FnsCompanyCard | null> {
  validateInn(inn);
  const data = await callFns('/egr', { req: inn });
  const cards = parseEgrResponse(data);
  if (cards.length === 0) return null;
  const card = cards[0];
  await enrichWithFinancials(card).catch(() => undefined);
  await upsertCompanyCache(card);
  return card;
}

/**
 * Рекомендации популярных ОКВЭД для быстрого подбора (локальный справочник).
 */
export function getPopularOkvedCodes(): Array<{ code: string; name: string; description: string }> {
  return [
    { code: '62.01', name: 'Разработка ПО', description: 'Разработка компьютерного программного обеспечения' },
    { code: '62.02', name: 'ИТ-консалтинг', description: 'Деятельность консультативная в области компьютерных технологий' },
    { code: '47.91', name: 'Интернет-торговля', description: 'Торговля розничная по почте или по информационно-коммуникационной сети Интернет' },
    { code: '56.10', name: 'Общепит', description: 'Деятельность ресторанов и услуги по доставке продуктов питания' },
    { code: '73.11', name: 'Рекламное агентство', description: 'Деятельность рекламных агентств' },
    { code: '85.41', name: 'Образование', description: 'Образование дополнительное детей и взрослых' },
    { code: '96.02', name: 'Парикмахерская', description: 'Предоставление услуг парикмахерскими и салонами красоты' },
    { code: '68.20', name: 'Аренда недвижимости', description: 'Аренда и управление собственным или арендованным недвижимым имуществом' },
    { code: '49.41', name: 'Грузоперевозки', description: 'Деятельность автомобильного грузового транспорта' },
    { code: '41.20', name: 'Строительство', description: 'Строительство жилых и нежилых зданий' },
  ];
}

// ==================== HTTP слой ====================

async function callFns(path: string, params: Record<string, string>): Promise<any> {
  if (!config.fns.apiKey) {
    throw new AppError('Не настроен ключ API ФНС (FNS_API_KEY)', 500);
  }

  const fullParams = { ...params, key: config.fns.apiKey };
  const url = `${config.fns.baseUrl}${path}`;
  console.log('[FNS] Request:', url, fullParams);

  try {
    const response = await fnsClient.get(path, { params: fullParams });
    console.log('[FNS] Response', response.status, JSON.stringify(response.data).slice(0, 500));
    return response.data;
  } catch (error) {
    const ax = error as AxiosError;
    console.warn('[FNS] Error:', ax.response?.status, ax.response?.data);
    if (ax.response?.status === 404) {
      return { items: [] };
    }
    if (ax.response?.status === 401 || ax.response?.status === 403) {
      throw new AppError('Ключ API ФНС недействителен или истёк лимит', 502);
    }
    if (ax.code === 'ECONNABORTED') {
      throw new AppError('Таймаут запроса к API ФНС', 504);
    }
    throw new AppError('Ошибка при запросе к API ФНС', 502);
  }
}

async function enrichWithFinancials(card: FnsCompanyCard): Promise<void> {
  try {
    const data = await callFns('/bo', { req: card.inn });
    const item = data?.items?.[0];
    if (!item) return;

    const report = item.СвОтч || item.report || item;
    const yearKey = Object.keys(report).find(k => /^20\d{2}$/.test(k));
    const year = yearKey ? parseInt(yearKey, 10) : undefined;
    const yearData = yearKey ? report[yearKey] : report;

    card.financials = {
      year,
      revenue: parseNumber(yearData?.['2110'] || yearData?.revenue),
      netProfit: parseNumber(yearData?.['2400'] || yearData?.netProfit),
      employees: parseNumber(item.СЧР || item.employees),
    };
  } catch {
    // BO API часто недоступен или платный — это не критично.
  }
}

// ==================== Парсинг ответов ====================

/**
 * Парсит ответ /egr (детальный, с вложенными ЮЛ/ИП).
 */
function parseEgrResponse(data: any): FnsCompanyCard[] {
  if (!data?.items?.length) return [];

  const cards: FnsCompanyCard[] = [];
  for (const item of data.items) {
    const card = parseEgrItem(item);
    if (card) cards.push(card);
  }
  return cards;
}

function parseEgrItem(item: any): FnsCompanyCard | null {
  const ul = item?.ЮЛ || item?.UL;
  const ip = item?.ИП || item?.IP;
  const entity = ul || ip;
  if (!entity) return null;

  const isUl = Boolean(ul);
  const status = pickString(
    entity.СтатусЮЛ?.Наим,
    entity.СтатусЮЛ,
    entity.Статус?.Наим,
    entity.Статус,
    entity.СтатусИП?.Наим,
    entity.СтатусИП,
  );
  const terminated = Boolean(entity.ДатаПрекр || entity.СвПрекрЮЛ || entity.СвПрекрИП || /прекращ|ликвид/i.test(status || ''));

  const okvedMain = parseOkved(entity.ОснВидДеят || entity.СвОКВЭДОсн);
  const okvedAdditionalRaw = entity.ДопВидДеят || entity.СвОКВЭДДоп || [];
  const okvedAdditional = Array.isArray(okvedAdditionalRaw)
    ? okvedAdditionalRaw.map(parseOkved).filter((o): o is FnsOkved => Boolean(o))
    : [];

  const card: FnsCompanyCard = {
    kind: isUl ? 'UL' : 'IP',
    inn: String(entity.ИНН || entity.INN || ''),
    ogrn: String(entity.ОГРН || entity.ОГРНИП || entity.OGRN || ''),
    kpp: pickString(entity.КПП, entity.KPP),
    name: pickString(
      entity.НаимСокрЮЛ,
      entity.НаимПолнЮЛ,
      entity.ФИОПолн,
      entity.НаимКрат,
      entity.НаимПолн,
      entity.name,
    ) || 'Не указано',
    fullName: pickString(entity.НаимПолнЮЛ, entity.НаимПолн, entity.ФИОПолн, entity.fullName),
    legalForm: pickString(entity.ОПФ?.Наим, entity.ОПФ, entity.legalForm),
    status: status || undefined,
    active: !terminated,
    registrationDate: pickString(entity.ДатаОГРН, entity.ДатаОГРНИП, entity.ДатаОбр, entity.ДатаРег, entity.registrationDate),
    terminationDate: pickString(entity.ДатаПрекр, entity.СвПрекрЮЛ?.ДатаПрекр),
    terminationReason: pickString(entity.ПричПрекр?.Наим, entity.СвПрекрЮЛ?.ПричПрекр?.Наим),
    address: pickString(entity.АдресПолн, entity.Адрес?.АдресПолн, entity.Адрес?.Адрес, entity.Адрес, entity.address),
    region: pickString(entity.Адрес?.Регион?.Наим, entity.Регион?.Наим, entity.Регион),
    director: pickString(entity.Руководитель?.ФИОПолн, entity.Руководитель?.ФИО, entity.director),
    directorPosition: pickString(entity.Руководитель?.НаимДолжн, entity.Руководитель?.Должн),
    authorizedCapital: pickString(entity.УстКап?.Сумма, entity.УстКап, entity.authorizedCapital),
    okvedMain,
    okvedAdditional: okvedAdditional.length > 0 ? okvedAdditional : undefined,
    source: 'api-fns.ru',
    fetchedAt: new Date().toISOString(),
  };

  if (!card.inn) return null;
  return card;
}

/**
 * Парсит ответ /search (упрощённая структура, плоские поля).
 */
function parseSearchResponse(data: any): FnsCompanyCard[] {
  if (!data?.items?.length) return [];

  const cards: FnsCompanyCard[] = [];
  for (const item of data.items) {
    // /search возвращает либо плоский объект, либо тот же ЮЛ/ИП-обёрнутый — обработаем оба.
    if (item?.ЮЛ || item?.ИП || item?.UL || item?.IP) {
      const parsed = parseEgrItem(item);
      if (parsed) cards.push(parsed);
      continue;
    }

    const inn = String(item.ИНН || item.INN || item.inn || '');
    if (!inn) continue;

    const isUl = inn.length === 10;
    cards.push({
      kind: isUl ? 'UL' : 'IP',
      inn,
      ogrn: String(item.ОГРН || item.ОГРНИП || item.OGRN || ''),
      kpp: pickString(item.КПП, item.KPP),
      name: pickString(item.НаимСокр, item.НаимПолн, item.ФИОПолн, item.name) || 'Не указано',
      fullName: pickString(item.НаимПолн, item.ФИОПолн),
      legalForm: pickString(item.ОПФ, item.legalForm),
      status: pickString(item.Статус, item.status),
      active: !/прекращ|ликвид/i.test(String(item.Статус || item.status || '')),
      registrationDate: pickString(item.ДатаОГРН, item.ДатаОГРНИП, item.registrationDate),
      address: pickString(item.АдресПолн, item.Адрес, item.address),
      director: pickString(item.Руководитель, item.director),
      okvedMain: parseOkved(item.ОснВидДеят || item.okved),
      source: 'api-fns.ru',
      fetchedAt: new Date().toISOString(),
    });
  }
  return cards;
}

function parseOkved(raw: any): FnsOkved | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    const match = raw.match(/^\s*(\d{2}(?:\.\d{1,2}){0,3})\s*(.*)$/);
    if (match) return { code: match[1], name: match[2].trim() };
    return { code: '', name: raw };
  }
  if (typeof raw === 'object') {
    const code = pickString(raw.Код, raw.code) || '';
    const name = pickString(raw.Наим, raw.name) || '';
    if (!code && !name) return undefined;
    return { code, name };
  }
  return undefined;
}

// ==================== Кэш-слой ====================

/**
 * Достаёт карточку компании из кэша БД, не обращаясь к ФНС.
 * Возвращает null, если кэш пуст или истёк.
 */
export async function getCachedCompanyByInn(inn: string): Promise<FnsCompanyCard | null> {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return null;
  return getCachedCompany(inn);
}

async function getCachedCompany(inn: string): Promise<FnsCompanyCard | null> {
  const now = new Date();
  const entry = await prisma.fnsCompanyCache.findUnique({ where: { inn } });
  if (!entry) return null;
  if (entry.expiresAt <= now) return null;
  return safeParseJson<FnsCompanyCard>(entry.payload);
}

async function upsertCompanyCache(card: FnsCompanyCard): Promise<void> {
  if (!card.inn) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.fns.cacheTtlMs);
  const payload = JSON.stringify(card);
  await prisma.fnsCompanyCache.upsert({
    where: { inn: card.inn },
    create: {
      inn: card.inn,
      ogrn: card.ogrn || null,
      name: card.name,
      payload,
      expiresAt,
    },
    update: {
      ogrn: card.ogrn || null,
      name: card.name,
      payload,
      expiresAt,
    },
  });
}

// ==================== Хелперы ====================

function validateInn(inn: string) {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) {
    throw new AppError('ИНН должен содержать 10 (ЮЛ) или 12 (ИП/ФЛ) цифр', 400);
  }
}

function normalizeQuery(value: string): string {
  // Сохраняем регистр — ФНС /search чувствителен к нему при полнотекстовом поиске.
  // toLowerCase только для ключа кэша (через normalizeForCache).
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeForCache(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickString(...values: any[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    } else if (typeof value === 'number') {
      return String(value);
    } else if (typeof value === 'object' && typeof value.Наим === 'string') {
      const trimmed = value.Наим.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function parseNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : undefined;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
