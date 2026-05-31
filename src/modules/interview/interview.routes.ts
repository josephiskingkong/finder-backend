import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import * as interviewController from './interview.controller';

const router = Router();

router.use(authMiddleware);

// Гипотезы
router.get('/business/:businessId/hypotheses', asyncHandler(interviewController.getHypothesesHandler));
router.post('/hypotheses', asyncHandler(interviewController.createHypothesisHandler));
router.post('/hypotheses/generate', asyncHandler(interviewController.generateHypothesesHandler));
router.get('/hypotheses/:id', asyncHandler(interviewController.getHypothesisDetailsHandler));
router.patch('/hypotheses/:id', asyncHandler(interviewController.updateHypothesisHandler));
router.delete('/hypotheses/:id', asyncHandler(interviewController.deleteHypothesisHandler));

// Вопросы для гипотез
router.post('/hypotheses/:hypothesisId/questions', asyncHandler(interviewController.addQuestionHandler));
router.delete('/questions/:id', asyncHandler(interviewController.deleteQuestionHandler));

// Результаты интервью (findings)
router.post('/hypotheses/:hypothesisId/findings', asyncHandler(interviewController.recordFindingHandler));

export default router;
