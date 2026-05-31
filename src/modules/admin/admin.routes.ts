import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/admin';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminController from './admin.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/stats', asyncHandler(adminController.getStatsHandler));

// Управление лимитами по тарифам — редактируемые из админки.
router.get('/plans', asyncHandler(adminController.listPlansHandler));
router.patch('/plans/:plan', asyncHandler(adminController.updatePlanHandler));

router.get('/users', asyncHandler(adminController.listUsersHandler));
router.get('/users/:id', asyncHandler(adminController.getUserHandler));
router.patch('/users/:id/subscription', asyncHandler(adminController.updateSubscriptionHandler));
router.patch('/users/:id/role', asyncHandler(adminController.updateRoleHandler));
router.patch('/users/:id/blocked', asyncHandler(adminController.updateBlockedHandler));
router.delete('/users/:id', asyncHandler(adminController.deleteUserHandler));

export default router;
