import { Request, Response } from 'express';
import * as authService from './auth.service';
import { registerSchema, loginSchema, refreshSchema } from './auth.validation';
import { sendSuccess, sendCreated } from '../../utils/response';

export async function registerHandler(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  sendCreated(res, result);
}

export async function loginHandler(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  sendSuccess(res, result);
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refresh(refreshToken);
  sendSuccess(res, result);
}

export async function logoutHandler(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  sendSuccess(res, { message: 'Выход выполнен' });
}

export async function getMeHandler(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.userId);
  sendSuccess(res, user);
}
