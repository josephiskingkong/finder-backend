import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { DEFAULT_PLAN_LIMITS, invalidatePlanLimitsCache } from '../../services/subscription.service';

export type SubscriptionPlan = 'FREE' | 'PLUS' | 'PREMIUM';
export type UserRole = 'USER' | 'ADMIN';

export interface ListUsersParams {
  search?: string;
  plan?: SubscriptionPlan;
  role?: UserRole;
  blocked?: boolean;
  page?: number;
  pageSize?: number;
}

const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  subscription: true,
  subscriptionUntil: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsers(params: ListUsersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);

  const where: any = {};
  if (params.search) {
    where.OR = [
      { email: { contains: params.search, mode: 'insensitive' } },
      { firstName: { contains: params.search, mode: 'insensitive' } },
      { lastName: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  if (params.plan) where.subscription = params.plan;
  if (params.role) where.role = params.role;
  if (typeof params.blocked === 'boolean') where.isBlocked = params.blocked;

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        ...USER_PUBLIC_FIELDS,
        _count: { select: { businesses: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, items };
}

export async function getUserDetails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...USER_PUBLIC_FIELDS,
      entrepreneurProfile: true,
      businesses: {
        select: { id: true, title: true, status: true, industry: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { businesses: true, refreshTokens: true } },
    },
  });
  if (!user) throw new AppError('Пользователь не найден', 404);
  return user;
}

export async function updateSubscription(userId: string, plan: SubscriptionPlan, until: Date | null) {
  await ensureUserExists(userId);
  return prisma.user.update({
    where: { id: userId },
    data: {
      subscription: plan,
      // FREE — без срока годности.
      subscriptionUntil: plan === 'FREE' ? null : until,
    },
    select: USER_PUBLIC_FIELDS,
  });
}

export async function updateRole(actorUserId: string, targetUserId: string, role: UserRole) {
  if (actorUserId === targetUserId && role !== 'ADMIN') {
    throw new AppError('Нельзя снять роль ADMIN с самого себя', 400);
  }
  await ensureUserExists(targetUserId);
  return prisma.user.update({
    where: { id: targetUserId },
    data: { role },
    select: USER_PUBLIC_FIELDS,
  });
}

export async function setBlocked(actorUserId: string, targetUserId: string, blocked: boolean) {
  if (actorUserId === targetUserId && blocked) {
    throw new AppError('Нельзя заблокировать самого себя', 400);
  }
  await ensureUserExists(targetUserId);
  // При блокировке — инвалидируем все refresh-токены пользователя.
  if (blocked) {
    await prisma.refreshToken.deleteMany({ where: { userId: targetUserId } });
  }
  return prisma.user.update({
    where: { id: targetUserId },
    data: { isBlocked: blocked },
    select: USER_PUBLIC_FIELDS,
  });
}

export async function deleteUser(actorUserId: string, targetUserId: string) {
  if (actorUserId === targetUserId) {
    throw new AppError('Нельзя удалить самого себя', 400);
  }
  await ensureUserExists(targetUserId);
  await prisma.user.delete({ where: { id: targetUserId } });
}

export async function getStats() {
  const [
    totalUsers,
    blockedUsers,
    admins,
    plansAgg,
    totalBusinesses,
    totalConversations,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.groupBy({ by: ['subscription'], _count: { _all: true } }),
    prisma.business.count(),
    prisma.conversation.count(),
  ]);

  const plans: Record<SubscriptionPlan, number> = { FREE: 0, PLUS: 0, PREMIUM: 0 };
  for (const row of plansAgg) {
    plans[row.subscription as SubscriptionPlan] = row._count._all;
  }

  return {
    users: { total: totalUsers, blocked: blockedUsers, admins },
    subscriptions: plans,
    businesses: totalBusinesses,
    conversations: totalConversations,
  };
}

async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('Пользователь не найден', 404);
}

// ====================== ПЛАНЫ И ЛИМИТЫ ======================

const ALL_PLANS: SubscriptionPlan[] = ['FREE', 'PLUS', 'PREMIUM'];

export async function listPlanConfigs() {
  const rows = await prisma.planConfig.findMany();
  // Если таблица только что создана и пуста — отдаём дефолты, чтобы UI не падал.
  if (rows.length === 0) {
    return ALL_PLANS.map(plan => ({
      plan,
      messagesPerWindow: DEFAULT_PLAN_LIMITS[plan].messagesPerWindow,
      windowHours: DEFAULT_PLAN_LIMITS[plan].windowHours,
      label: DEFAULT_PLAN_LIMITS[plan].label,
      description: DEFAULT_PLAN_LIMITS[plan].description,
      updatedAt: null,
      isDefault: true,
    }));
  }
  // Сортируем в каноническом порядке FREE → PLUS → PREMIUM.
  const order = new Map(ALL_PLANS.map((p, i) => [p, i]));
  return rows
    .map(r => ({ ...r, isDefault: false }))
    .sort((a, b) => (order.get(a.plan as SubscriptionPlan) ?? 99) - (order.get(b.plan as SubscriptionPlan) ?? 99));
}

export interface PlanConfigUpdate {
  messagesPerWindow?: number;
  windowHours?: number;
  label?: string;
  description?: string | null;
}

export async function updatePlanConfig(plan: SubscriptionPlan, update: PlanConfigUpdate) {
  if (!ALL_PLANS.includes(plan)) {
    throw new AppError(`Неизвестный план: ${plan}`, 400);
  }
  // Валидация: лимиты должны быть положительными и в разумных пределах.
  if (update.messagesPerWindow !== undefined) {
    if (!Number.isInteger(update.messagesPerWindow) || update.messagesPerWindow < 1 || update.messagesPerWindow > 100_000) {
      throw new AppError('messagesPerWindow должно быть целым числом от 1 до 100000', 400);
    }
  }
  if (update.windowHours !== undefined) {
    if (!Number.isInteger(update.windowHours) || update.windowHours < 1 || update.windowHours > 168) {
      throw new AppError('windowHours должно быть целым числом от 1 до 168 (неделя)', 400);
    }
  }

  // Защита от потери здравого смысла: PREMIUM лимит >= PLUS лимит >= FREE лимит
  // (после применения изменения). Иначе админ случайно сломает дифференциацию тарифов.
  const currentRows = await prisma.planConfig.findMany();
  const map: Record<string, { messagesPerWindow: number; windowHours: number }> = {};
  for (const p of ALL_PLANS) {
    const row = currentRows.find(r => r.plan === p);
    map[p] = row
      ? { messagesPerWindow: row.messagesPerWindow, windowHours: row.windowHours }
      : { messagesPerWindow: DEFAULT_PLAN_LIMITS[p].messagesPerWindow, windowHours: DEFAULT_PLAN_LIMITS[p].windowHours };
  }
  if (update.messagesPerWindow !== undefined) map[plan].messagesPerWindow = update.messagesPerWindow;
  if (update.windowHours !== undefined) map[plan].windowHours = update.windowHours;

  if (!(map.FREE.messagesPerWindow <= map.PLUS.messagesPerWindow && map.PLUS.messagesPerWindow <= map.PREMIUM.messagesPerWindow)) {
    throw new AppError(
      `Нарушена иерархия лимитов: FREE (${map.FREE.messagesPerWindow}) ≤ PLUS (${map.PLUS.messagesPerWindow}) ≤ PREMIUM (${map.PREMIUM.messagesPerWindow}). Платный тариф не может быть слабее бесплатного.`,
      400,
    );
  }

  const row = await prisma.planConfig.upsert({
    where: { plan },
    create: {
      plan,
      messagesPerWindow: update.messagesPerWindow ?? DEFAULT_PLAN_LIMITS[plan].messagesPerWindow,
      windowHours: update.windowHours ?? DEFAULT_PLAN_LIMITS[plan].windowHours,
      label: update.label ?? DEFAULT_PLAN_LIMITS[plan].label,
      description: update.description ?? DEFAULT_PLAN_LIMITS[plan].description,
    },
    update: {
      ...(update.messagesPerWindow !== undefined && { messagesPerWindow: update.messagesPerWindow }),
      ...(update.windowHours !== undefined && { windowHours: update.windowHours }),
      ...(update.label !== undefined && { label: update.label }),
      ...(update.description !== undefined && { description: update.description }),
    },
  });

  // Инвалидируем кэш в subscription.service, чтобы новые значения подхватились мгновенно.
  invalidatePlanLimitsCache();

  return row;
}
