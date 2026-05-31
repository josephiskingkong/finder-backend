import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as businessController from './business.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

router.post('/', asyncHandler(businessController.createBusinessHandler));
router.get('/', asyncHandler(businessController.getBusinessesHandler));
router.get('/:id', asyncHandler(businessController.getBusinessHandler));
router.patch('/:id', asyncHandler(businessController.updateBusinessHandler));
router.delete('/:id', asyncHandler(businessController.deleteBusinessHandler));
router.post('/:id/competitors/analyze', asyncHandler(businessController.analyzeCompetitorsHandler));
router.patch('/profile/entrepreneur-type', asyncHandler(businessController.updateEntrepreneurTypeHandler));

export default router;
