import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import * as canvasController from './canvas.controller';

const router = Router();
router.use(authMiddleware);

router.get('/:businessId', asyncHandler(canvasController.getCanvasHandler));
router.patch('/:businessId', asyncHandler(canvasController.updateCanvasHandler));
router.post('/:businessId/generate', asyncHandler(canvasController.generateCanvasHandler));

export default router;
