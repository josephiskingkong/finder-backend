import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import * as marketController from './market.controller';

const router = Router();
router.use(authMiddleware);

router.get('/:businessId', asyncHandler(marketController.getMarketHandler));
router.post('/:businessId/generate', asyncHandler(marketController.generateMarketHandler));

export default router;
