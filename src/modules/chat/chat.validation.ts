import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Сообщение не может быть пустым').max(2000, 'Сообщение слишком длинное (максимум 2000 символов)'),
  conversationId: z.string().uuid().optional(),
  businessId: z.string().uuid(),
  stream: z.boolean().optional().default(false),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
