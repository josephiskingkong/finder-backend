import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as roadmapController from './roadmap.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

// Сгенерировать роадмап для бизнеса
router.post('/generate', asyncHandler(roadmapController.generateRoadmapHandler));

// Получить роадмап бизнеса
router.get('/business/:businessId', asyncHandler(roadmapController.getRoadmapHandler));

// Начать работу над шагом
router.patch('/steps/:stepId/start', asyncHandler(roadmapController.startStepHandler));

// Отчитаться по шагу
router.post('/steps/:stepId/report', asyncHandler(roadmapController.reportStepHandler));

export default router;
