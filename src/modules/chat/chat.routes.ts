import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import * as chatController from './chat.controller';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

// Отправить сообщение (создаёт беседу при необходимости)
router.post('/message', asyncHandler(chatController.sendMessageHandler));

// Получить все беседы бизнес-проекта
router.get('/business/:businessId/conversations', asyncHandler(chatController.getConversationsHandler));

// Получить сообщения беседы
router.get('/conversations/:conversationId/messages', asyncHandler(chatController.getMessagesHandler));

// Удалить беседу
router.delete('/conversations/:conversationId', asyncHandler(chatController.deleteConversationHandler));

export default router;
