import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../utils/errors';

/**
 * Проверяет, что текущий пользователь имеет роль ADMIN.
 * Должен ставиться ПОСЛЕ `authMiddleware`.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Требуется авторизация', 401));
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true, isBlocked: true },
    });
    if (!user) return next(new AppError('Пользователь не найден', 404));
    if (user.isBlocked) return next(new AppError('Аккаунт заблокирован', 403));
    if (user.role !== 'ADMIN') return next(new AppError('Доступ только для администратора', 403));
    next();
  } catch (err) {
    next(err);
  }
}
