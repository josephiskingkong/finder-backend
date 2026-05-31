import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { AI_TIERS, DEFAULT_AI_TIER } from '../../services/ai.service';
import { getSubscriptionState, getMessageUsage, getPlanLimits } from '../../services/subscription.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';

const router = Router();

router.use(authMiddleware);

/**
 * Список ИИ-уровней с пометкой `enabled` — доступен ли он на текущей подписке пользователя.
 * Front может рисовать выпадающий список с дизейблом недоступных опций и CTA «Обновить тариф».
 */
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const state = await getSubscriptionState(req.user!.userId);
  const tiers = AI_TIERS.map(t => ({
    ...t,
    enabled: state.allowedTiers.includes(t.id),
  }));
  const defaultTier = state.allowedTiers.includes('PREMIUM')
    ? 'PREMIUM'
    : state.allowedTiers[0] || DEFAULT_AI_TIER;

  const allLimits = await getPlanLimits();
  const planLimit = allLimits[state.plan];
  sendSuccess(res, {
    default: defaultTier,
    subscription: {
      plan: state.plan,
      until: state.until,
      isActive: state.isActive,
      limit: planLimit.messagesPerWindow,
      windowHours: planLimit.windowHours,
    },
    tiers,
    /// Витрина лимитов всех планов — фронт может показать сравнительную таблицу на странице тарифов.
    planLimits: allLimits,
  });
}));

/**
 * Текущее использование квоты сообщений: сколько потрачено, сколько осталось, когда сбросится.
 * Фронт дёргает этот эндпоинт после каждого ответа ИИ, чтобы обновить плашку «осталось N/10».
 */
router.get('/usage', asyncHandler(async (req: Request, res: Response) => {
  const usage = await getMessageUsage(req.user!.userId);
  sendSuccess(res, usage);
}));

export default router;
