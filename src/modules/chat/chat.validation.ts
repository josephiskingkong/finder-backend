import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Сообщение не может быть пустым').max(2000, 'Сообщение слишком длинное (максимум 2000 символов)'),
  conversationId: z.string().uuid().optional(),
  businessId: z.string().uuid(),
  stream: z.boolean().optional().default(false),
  /// Уровень ИИ-модели, выбранный пользователем (PREMIUM=OpenAI, PLUS=GigaChat).
  /// Если не передан — берём из беседы, иначе PREMIUM.
  aiTier: z.enum(['PREMIUM', 'PLUS']).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
