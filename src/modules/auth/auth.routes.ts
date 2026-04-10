import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as authController from './auth.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/register', asyncHandler(authController.registerHandler));
router.post('/login', asyncHandler(authController.loginHandler));
router.post('/refresh', asyncHandler(authController.refreshHandler));
router.post('/logout', asyncHandler(authController.logoutHandler));
router.get('/me', authMiddleware, asyncHandler(authController.getMeHandler));

export default router;
