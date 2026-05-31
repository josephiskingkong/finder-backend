import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';

import { config } from './config';
import { errorHandler } from './utils/errors';

// Роуты
import authRoutes from './modules/auth/auth.routes';
import businessRoutes from './modules/business/business.routes';
import chatRoutes from './modules/chat/chat.routes';
import roadmapRoutes from './modules/roadmap/roadmap.routes';
import fnsRoutes from './modules/fns/fns.routes';
import filesRoutes from './modules/files/files.routes';
import aiRoutes from './modules/ai/ai.routes';
import adminRoutes from './modules/admin/admin.routes';
import interviewRoutes from './modules/interview/interview.routes';

const app = express();

// ==================== Middleware ====================
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,
  message: { success: false, error: 'Слишком много запросов. Попробуйте позже.' },
});
app.use('/api/', limiter);

// Для чата — более мягкий лимит
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 20,
  message: { success: false, error: 'Слишком много сообщений. Подождите немного.' },
});
app.use('/api/chat/', chatLimiter);

// ==================== Маршруты API ====================
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/roadmap', roadmapRoutes);
app.use('/api/fns', fnsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/interview', interviewRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== Error handling ====================
app.use(errorHandler);

// ==================== Запуск ====================

// Создаём директорию для загрузок
if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true });
}

app.listen(config.port, () => {
  console.log(`🚀 Founder Backend запущен на порту ${config.port}`);
  console.log(`📋 Среда: ${config.nodeEnv}`);
  console.log(`📡 API: http://localhost:${config.port}/api`);
});

export default app;
