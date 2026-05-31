import { Response } from 'express';
import * as openai from './openai.service';
import * as gigachat from './gigachat.service';
import type { ChatMessage } from './openai.service';
import { config } from '../config';

/**
 * Уровни ИИ-моделей, доступные на фронте:
 * - PREMIUM — OpenAI (GPT) — флагман, лучшие ответы, западная модель.
 * - PLUS    — Сбер GigaChat — российская модель, ниже стоимость, более «локальная».
 *
 * Маршрутизация в этом файле — единственная точка переключения между провайдерами.
 * Все остальные модули (chat.service, roadmap.service, ...) должны пользоваться этим
 * роутером и пробрасывать tier пользователя в опции.
 */
export type AiTier = 'PREMIUM' | 'PLUS';

export const DEFAULT_AI_TIER: AiTier = 'PREMIUM';

export interface AiTierDescriptor {
  id: AiTier;
  label: string;
  provider: 'openai' | 'gigachat';
  model: string;
  description: string;
  /// Можно ли использовать тариф для генерации структурированного JSON (роадмапы и т.п.).
  /// PLUS пока не гарантирует строгий response_format, поэтому JSON-ветка всегда идёт через PREMIUM.
  supportsJson: boolean;
  badge?: 'recommended' | 'beta';
}

export const AI_TIERS: AiTierDescriptor[] = [
  {
    id: 'PREMIUM',
    label: 'Premium',
    provider: 'openai',
    model: 'Расширенный режим',
    description: 'Углублённые ответы и сложные задачи: регистрация, налоги, юридические вопросы.',
    supportsJson: true,
    badge: 'recommended',
  },
  {
    id: 'PLUS',
    label: 'Plus',
    provider: 'gigachat',
    model: 'Стандартный режим',
    description: 'Быстрые ответы на повседневные вопросы предпринимателя.',
    supportsJson: false,
    badge: 'beta',
  },
];

/**
 * Тип задачи — определяет модель внутри PREMIUM tier.
 * heavy — сложные аналитические задачи: рынок, юридика, налоги, конкуренты, роадмап → powerModel.
 * light — простые вопросы, уточнения, диалог → lightModel.
 */
export type TaskWeight = 'heavy' | 'light';

/**
 * Паттерны «тяжёлых» задач для PREMIUM tier.
 * Всё, что не попало сюда — считается light.
 */
const HEAVY_TASK_PATTERN = /анализ\s+рынка|анализ\s+конкур|конкурент|конкуренц|юридич|налог|регистрац|ооо|ип\b|самозанят|усн|осн|псн|нпд|роадмап|план\s+развит|бизнес.?план|финанс|инвест|выручк|монетизац|стратег|фнс|егрюл|егрип|оквэд|спарси|рынок\s+сбыта|целевая\s+аудитор|барьер|масштабир|операционн/i;

/**
 * Классифицирует запрос пользователя: тяжёлая задача (deep analysis) или лёгкая (диалог).
 * Используется только для PREMIUM tier.
 */
export function classifyTaskWeight(userMessage?: string): TaskWeight {
  if (!userMessage) return 'light';
  return HEAVY_TASK_PATTERN.test(userMessage) ? 'heavy' : 'light';
}

/**
 * Возвращает модель OpenAI для PREMIUM tier по весу задачи.
 */
export function getPremiumModel(weight: TaskWeight): string {
  return weight === 'heavy' ? config.openai.powerModel : config.openai.lightModel;
}

export interface SendChatOptions {
  tier?: AiTier;
  /// Сообщение пользователя для автоматического определения веса задачи (только для PREMIUM).
  userMessage?: string;
  /// Явно задать вес задачи (переопределяет автоопределение).
  taskWeight?: TaskWeight;
}

/**
 * Универсальный нестриминговый вызов. По умолчанию идёт в PREMIUM (OpenAI).
 * Для PREMIUM автоматически выбирает powerModel или lightModel по содержанию запроса.
 */
export async function sendChat(messages: ChatMessage[], options: SendChatOptions = {}): Promise<string> {
  const tier = options.tier || DEFAULT_AI_TIER;
  if (tier === 'PLUS') {
    return gigachat.sendChat(messages);
  }
  const weight = options.taskWeight ?? classifyTaskWeight(options.userMessage);
  const model = getPremiumModel(weight);
  return openai.sendChat(messages, model);
}

/**
 * Универсальный стриминг через SSE в `res`.
 * Для PREMIUM автоматически выбирает powerModel или lightModel по содержанию запроса.
 */
export async function streamChat(messages: ChatMessage[], res: Response, options: SendChatOptions = {}): Promise<string> {
  const tier = options.tier || DEFAULT_AI_TIER;
  if (tier === 'PLUS') {
    return gigachat.streamChat(messages, res);
  }
  const weight = options.taskWeight ?? classifyTaskWeight(options.userMessage);
  const model = getPremiumModel(weight);
  return openai.streamChat(messages, res, model);
}

/**
 * JSON-ответы (роадмапы, извлечение данных и т.п.).
 * По умолчанию PREMIUM (OpenAI со строгим response_format).
 * Если пользователь выбрал PLUS — пробуем GigaChat (rawSendChat без audit),
 * fallback на OpenAI при ошибке парсинга.
 */
export async function sendChatJSON<T>(messages: ChatMessage[], options: SendChatOptions = {}): Promise<T> {
  const tier = options.tier || DEFAULT_AI_TIER;
  if (tier === 'PLUS') {
    try {
      // Используем rawSendChat: audit/repair ненужны для JSON-задач и только ломают структуру.
      // Лимит 4096 — GigaChat обрезал JSON при 2048.
      const text = await gigachat.sendChatRaw(messages, 4096);
      return extractJson<T>(text);
    } catch (err) {
      console.warn('[ai.sendChatJSON] GigaChat JSON failed, falling back to OpenAI:', (err as Error).message);
    }
  }
  // JSON-задачи — всегда тяжёлые → powerModel.
  return openai.sendChatJSON<T>(messages, config.openai.powerModel);
}

/**
 * Извлекает первый валидный JSON-объект/массив из текста GigaChat.
 * Обрабатывает:
 *  - чистый JSON
 *  - JSON внутри ```json ... ``` блока
 *  - обрезанный JSON (добавляем закрывающие скобки)
 */
function extractJson<T>(text: string): T {
  const clean = text.trim();

  // 1. Прямой JSON
  try { return JSON.parse(clean) as T; } catch { /* fall through */ }

  // 2. Из markdown-блока
  const block = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) {
    try { return JSON.parse(block[1].trim()) as T; } catch { /* fall through */ }
  }

  // 3. Найдём первый { или [ и попробуем парсить с дозаполнением обрезанного JSON
  const startBrace = clean.indexOf('{');
  const startBracket = clean.indexOf('[');
  const start = startBrace === -1 ? startBracket
    : startBracket === -1 ? startBrace
    : Math.min(startBrace, startBracket);

  if (start !== -1) {
    const opener = clean[start];
    const closer = opener === '{' ? '}' : ']';
    let raw = clean.slice(start);
    // Добавляем закрывающий символ, если обрезано
    if (!raw.trimEnd().endsWith(closer)) raw = raw.trimEnd() + closer;
    try { return JSON.parse(raw) as T; } catch { /* fall through */ }

    // Если всё ещё не работает — убираем последний незакрытый элемент
    const lastComma = raw.lastIndexOf(',');
    if (lastComma !== -1) {
      const truncated = raw.slice(0, lastComma) + closer;
      try { return JSON.parse(truncated) as T; } catch { /* fall through */ }
    }
  }

  throw new Error(`GigaChat вернул невалидный JSON (первые 200 символов: ${clean.slice(0, 200)})`);
}

export function isValidTier(value: unknown): value is AiTier {
  return value === 'PREMIUM' || value === 'PLUS';
}
