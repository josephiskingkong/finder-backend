import { Request, Response } from 'express';
import * as chatService from './chat.service';
import { sendMessageSchema } from './chat.validation';
import { sendSuccess } from '../../utils/response';

export async function sendMessageHandler(req: Request, res: Response) {
  const input = sendMessageSchema.parse(req.body);

  if (input.stream) {
    // SSE стриминг — ответ пишется напрямую в res
    await chatService.sendMessage(req.user!.userId, input, res);
  } else {
    const result = await chatService.sendMessage(req.user!.userId, input);
    sendSuccess(res, result);
  }
}

export async function getConversationsHandler(req: Request, res: Response) {
  const businessId = req.params.businessId as string;
  const conversations = await chatService.getConversations(req.user!.userId, businessId);
  sendSuccess(res, conversations);
}

export async function getMessagesHandler(req: Request, res: Response) {
  const messages = await chatService.getConversationMessages(req.user!.userId, req.params.conversationId as string);
  sendSuccess(res, messages);
}

export async function deleteConversationHandler(req: Request, res: Response) {
  await chatService.deleteConversation(req.user!.userId, req.params.conversationId as string);
  sendSuccess(res, { message: 'Беседа удалена' });
}

export async function createConversationHandler(req: Request, res: Response) {
  const { businessId, title } = req.body;
  const conversation = await chatService.createConversation(req.user!.userId, businessId as string, title as string | undefined);
  sendSuccess(res, conversation);
}
