import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  /// Дополнительные структурированные данные, которые фронт может использовать,
  /// например время сброса лимита, код причины и т.п.
  public meta?: Record<string, unknown>;

  constructor(message: string, statusCode: number, meta?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.meta = meta;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.meta ? { meta: err.meta } : {}),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Ошибка валидации',
      details: err.issues.map((e) => ({
        field: e.path.map(String).join('.'),
        message: e.message,
      })),
    });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера',
  });
}

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    schema.parse(req.body);
    next();
  };
}
