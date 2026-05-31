import prisma from '../config/database';
import { AppError } from '../utils/errors';
import type { AiTier } from './ai.service';

/**
 * Подписки → доступные ИИ-тарифы.
 *
 * FREE    — только будущие бесплатные модели (сейчас пусто).
 * PLUS    — Сбер GigaChat.
 * PREMIUM — все, включая OpenAI.
 */
export type SubscriptionPlan = 'FREE' | 'PLUS' | 'PREMIUM';

export const PLAN_TO_TIERS: Record<SubscriptionPlan, AiTier[]> = {
  // FREE временно получает доступ к PLUS-модели (GigaChat).
  // Когда подключим Qwen/локальную модель — заменим на отдельный 'FREE' tier.
  FREE: ['PLUS'],
  PLUS: ['PLUS'],
  PREMIUM: ['PLUS', 'PREMIUM'],
};

/**
 * Дефолтные лимиты на количество сообщений в чате (rolling window).
 *
 * Используются при первом запуске для seed таблицы `plan_configs`,
 * а также как fallback, если строка в БД отсутствует (например, до миграции).
 *
 * Реальные значения хранятся в таблице `plan_configs` и редактируются админом.
 *
 * Окно 6 часов — короче 24ч, чтобы юзер не блокировался на сутки от случайного бурста.
 * Чистые множители ×10 и ×5: легко объяснить, легко продавать.
 *
 *  FREE   10 / 6ч  →  ~40/день максимум. Хватит попробовать, ловит на upgrade.
 *  PLUS  100 / 6ч  →  ~400/день. Для активного предпринимателя за глаза.
 *  PREM  500 / 6ч  →  ~2000/день. Эффективно безлимит, защита от ботов.
 */
export const DEFAULT_PLAN_LIMITS: Record<
  SubscriptionPlan,
  { messagesPerWindow: number; windowHours: number; label: string; description: string }
> = {
  FREE:    { messagesPerWindow: 10,  windowHours: 6, label: 'Free',    description: 'Базовый доступ к ИИ-наставнику с лимитом сообщений.' },
  PLUS:    { messagesPerWindow: 100, windowHours: 6, label: 'Plus',    description: 'Стандартный режим без существенных ограничений для активного предпринимателя.' },
  PREMIUM: { messagesPerWindow: 500, windowHours: 6, label: 'Premium', description: 'Расширенный режим, приоритетная очередь и анализ конкурентов через ФНС.' },
};

/**
 * In-memory кэш лимитов. TTL небольшой (60 сек), чтобы:
 *  - не дёргать БД на каждое сообщение в чате;
 *  - изменения в админке применялись «почти в реальном времени» (≤1 мин).
 * Кэш можно принудительно инвалидировать вызовом invalidatePlanLimitsCache()
 * после PATCH в админке — тогда новые значения вступят в силу сразу.
 */
let planLimitsCache: { value: Record<SubscriptionPlan, { messagesPerWindow: number; windowHours: number }>; expiresAt: number } | null = null;
const PLAN_LIMITS_TTL_MS = 60_000;

export function invalidatePlanLimitsCache() {
  planLimitsCache = null;
}

/**
 * Возвращает текущие лимиты по всем планам.
 * При первом вызове сидит таблицу `plan_configs` дефолтами, если она пуста.
 */
export async function getPlanLimits(): Promise<Record<SubscriptionPlan, { messagesPerWindow: number; windowHours: number }>> {
  if (planLimitsCache && planLimitsCache.expiresAt > Date.now()) {
    return planLimitsCache.value;
  }
  const rows = await prisma.planConfig.findMany();
  // Если строк нет — это первый запуск после миграции. Сидим дефолтами.
  if (rows.length === 0) {
    await prisma.planConfig.createMany({
      data: (Object.keys(DEFAULT_PLAN_LIMITS) as SubscriptionPlan[]).map(plan => ({
        plan,
        messagesPerWindow: DEFAULT_PLAN_LIMITS[plan].messagesPerWindow,
        windowHours: DEFAULT_PLAN_LIMITS[plan].windowHours,
        label: DEFAULT_PLAN_LIMITS[plan].label,
        description: DEFAULT_PLAN_LIMITS[plan].description,
      })),
      skipDuplicates: true,
    });
    const fresh = await prisma.planConfig.findMany();
    const value = mergeWithDefaults(fresh);
    planLimitsCache = { value, expiresAt: Date.now() + PLAN_LIMITS_TTL_MS };
    return value;
  }
  const value = mergeWithDefaults(rows);
  planLimitsCache = { value, expiresAt: Date.now() + PLAN_LIMITS_TTL_MS };
  return value;
}

function mergeWithDefaults(rows: Array<{ plan: string; messagesPerWindow: number; windowHours: number }>): Record<SubscriptionPlan, { messagesPerWindow: number; windowHours: number }> {
  const out = {} as Record<SubscriptionPlan, { messagesPerWindow: number; windowHours: number }>;
  for (const plan of Object.keys(DEFAULT_PLAN_LIMITS) as SubscriptionPlan[]) {
    const row = rows.find(r => r.plan === plan);
    out[plan] = row
      ? { messagesPerWindow: row.messagesPerWindow, windowHours: row.windowHours }
      : { messagesPerWindow: DEFAULT_PLAN_LIMITS[plan].messagesPerWindow, windowHours: DEFAULT_PLAN_LIMITS[plan].windowHours };
  }
  return out;
}

/**
 * Старая константа для обратной совместимости (читатели вне chat-flow).
 * Превращена в Proxy, чтобы вернуть свежие данные без необходимости переписывать
 * все импорты. Внутри читает кэш или дефолты синхронно.
 */
export const PLAN_LIMITS = new Proxy({} as Record<SubscriptionPlan, { messagesPerWindow: number; windowHours: number }>, {
  get(_target, prop: string) {
    const cached = planLimitsCache?.value;
    if (cached && prop in cached) return cached[prop as SubscriptionPlan];
    const def = DEFAULT_PLAN_LIMITS[prop as SubscriptionPlan];
    return def ? { messagesPerWindow: def.messagesPerWindow, windowHours: def.windowHours } : undefined;
  },
  ownKeys() { return Object.keys(DEFAULT_PLAN_LIMITS); },
  getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
});

export interface SubscriptionState {
  plan: SubscriptionPlan;
  until: Date | null;
  isActive: boolean;
  allowedTiers: AiTier[];
}

/**
 * Возвращает текущее состояние подписки. Если `subscriptionUntil` истёк —
 * считаем, что пользователь упал на FREE (для проверки доступа).
 */
export async function getSubscriptionState(userId: string): Promise<SubscriptionState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscription: true, subscriptionUntil: true, isBlocked: true },
  });
  if (!user) throw new AppError('Пользователь не найден', 404);
  if (user.isBlocked) throw new AppError('Аккаунт заблокирован', 403);

  const now = new Date();
  const expired = user.subscription !== 'FREE' && user.subscriptionUntil !== null && user.subscriptionUntil < now;
  const effectivePlan: SubscriptionPlan = expired ? 'FREE' : (user.subscription as SubscriptionPlan);

  return {
    plan: effectivePlan,
    until: user.subscriptionUntil,
    isActive: !expired,
    allowedTiers: PLAN_TO_TIERS[effectivePlan],
  };
}

/**
 * Бросает 403, если выбранный пользователем `tier` недоступен в его подписке.
 */
export async function assertTierAllowed(userId: string, tier: AiTier): Promise<SubscriptionState> {
  const state = await getSubscriptionState(userId);
  if (!state.allowedTiers.includes(tier)) {
    const required = tier === 'PREMIUM' ? 'PREMIUM' : 'PLUS';
    throw new AppError(
      `Модель «${tier}» недоступна на вашем тарифе (${state.plan}). Перейдите на подписку ${required}.`,
      403,
    );
  }
  return state;
}

export interface QuotaUsage {
  plan: SubscriptionPlan;
  used: number;
  limit: number;
  windowHours: number;
  remaining: number;
  /// Когда «протухнет» самое старое из учтённых сообщений и юзер получит обратно 1 слот.
  /// null, если юзер ещё ничего не отправлял в окне.
  resetAt: Date | null;
}

/**
 * Считает, сколько сообщений USER отправил в чат за rolling-window последних N часов.
 * Идёт через JOIN: message.role='USER' AND message.created_at > NOW() - INTERVAL,
 * фильтр по userId через conversation→business.
 *
 * Не блокирует чат, только сообщает текущее состояние. Используется для:
 *  - проверки квоты перед отправкой (assertMessageQuota);
 *  - вывода в UI остатка «осталось 7 из 10 сообщений за 6 часов».
 */
export async function getMessageUsage(userId: string): Promise<QuotaUsage> {
  const state = await getSubscriptionState(userId);
  const allLimits = await getPlanLimits();
  const limit = allLimits[state.plan];
  const windowStart = new Date(Date.now() - limit.windowHours * 3600 * 1000);

  const recent = await prisma.message.findMany({
    where: {
      role: 'USER',
      createdAt: { gt: windowStart },
      conversation: { business: { userId } },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const used = recent.length;
  // Когда «протухнет» самое старое сообщение — пользователь получит обратно слот.
  const oldest = recent[0]?.createdAt ?? null;
  const resetAt = oldest ? new Date(oldest.getTime() + limit.windowHours * 3600 * 1000) : null;

  return {
    plan: state.plan,
    used,
    limit: limit.messagesPerWindow,
    windowHours: limit.windowHours,
    remaining: Math.max(0, limit.messagesPerWindow - used),
    resetAt,
  };
}

/**
 * Бросает 429 с понятным сообщением и временем сброса, если лимит исчерпан.
 * Должна вызываться ДО вызова LLM, но ПОСЛЕ assertTierAllowed.
 */
export async function assertMessageQuota(userId: string): Promise<QuotaUsage> {
  const usage = await getMessageUsage(userId);
  if (usage.remaining > 0) return usage;

  const minutesUntilReset = usage.resetAt
    ? Math.max(1, Math.ceil((usage.resetAt.getTime() - Date.now()) / 60000))
    : usage.windowHours * 60;

  const hint = usage.plan === 'PREMIUM'
    ? ''
    : usage.plan === 'PLUS'
      ? 'Превышен лимит Plus. Это бывает редко — обычно при автоматизации. Дождитесь сброса или оформите Premium.'
      : `На бесплатном тарифе доступно ${usage.limit} сообщений за ${usage.windowHours} ч. Оформите Plus или Premium, чтобы продолжить без ограничений.`;

  const resetIso = usage.resetAt?.toISOString() || '';
  throw new AppError(
    `Лимит исчерпан (${usage.used}/${usage.limit} за ${usage.windowHours} ч). Сброс через ${minutesUntilReset} мин.${hint ? ` ${hint}` : ''}`,
    429,
    {
      code: 'MESSAGE_QUOTA_EXCEEDED',
      plan: usage.plan,
      used: usage.used,
      limit: usage.limit,
      windowHours: usage.windowHours,
      resetAt: resetIso,
      minutesUntilReset,
    },
  );
}
