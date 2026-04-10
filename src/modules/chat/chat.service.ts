import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { SendMessageInput } from './chat.validation';
import { sendChat, streamChat, sendChatJSON, ChatMessage } from '../../services/openai.service';
import { SYSTEM_PROMPT_MAIN, SYSTEM_PROMPT_ONBOARDING, SYSTEM_PROMPT_EXTRACT_BUSINESS_INFO } from '../../prompts/system';
import { Response } from 'express';

/**
 * Собирает контекст бизнеса для системного промпта.
 */
async function buildBusinessContext(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      user: {
        include: { entrepreneurProfile: true },
      },
      roadmap: {
        include: { steps: { orderBy: { order: 'asc' } } },
      },
    },
  });

  if (!business) return '';

  const profile = business.user.entrepreneurProfile;
  const roadmap = business.roadmap;

  let context = `\n\n## Контекст проекта пользователя:\n`;
  context += `- **Название:** ${business.title}\n`;
  if (business.description) context += `- **Описание:** ${business.description}\n`;
  if (business.industry) context += `- **Отрасль:** ${business.industry}\n`;
  if (business.problemStatement) context += `- **Проблема:** ${business.problemStatement}\n`;
  if (business.targetAudience) context += `- **Целевая аудитория:** ${business.targetAudience}\n`;
  if (business.uniqueValue) context += `- **Уникальное предложение:** ${business.uniqueValue}\n`;
  if (business.competitors) context += `- **Конкуренты:** ${business.competitors}\n`;
  if (business.monetizationModel) context += `- **Монетизация:** ${business.monetizationModel}\n`;
  if (business.legalForm) context += `- **Юр. форма:** ${business.legalForm}\n`;
  if (business.taxSystem) context += `- **Налоговая система:** ${business.taxSystem}\n`;
  context += `- **Статус проекта:** ${business.status}\n`;

  if (profile) {
    context += `\n## Профиль предпринимателя:\n`;
    context += `- **Тип:** ${profile.type === 'DOMAIN_EXPERT' ? 'Эксперт в предметной области (разбирается в сфере, но не в бизнесе)' : profile.type === 'COMPLETE_BEGINNER' ? 'Полный новичок (не разбирается ни в бизнесе, ни в предметке)' : 'Не определён'}\n`;
    if (profile.industryKnowledge) context += `- **Область знаний:** ${profile.industryKnowledge}\n`;
    if (profile.experienceYears) context += `- **Опыт:** ${profile.experienceYears} лет\n`;
  }

  if (roadmap?.steps?.length) {
    context += `\n## Текущий роадмап:\n`;
    for (const step of roadmap.steps) {
      const statusEmoji = step.status === 'COMPLETED' ? '✅' : step.status === 'IN_PROGRESS' ? '🔄' : step.status === 'AVAILABLE' ? '⬜' : '🔒';
      context += `${statusEmoji} ${step.order}. ${step.title} (${step.status})\n`;
      if (step.userReport) context += `   Отчёт: ${step.userReport}\n`;
    }
  }

  return context;
}

/**
 * Получает или создаёт беседу, отправляет сообщение, получает ответ ИИ.
 */
export async function sendMessage(userId: string, input: SendMessageInput, res?: Response) {
  // Проверяем, что бизнес принадлежит пользователю
  const business = await prisma.business.findFirst({
    where: { id: input.businessId, userId },
  });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  // Получаем или создаём беседу
  let conversationId = input.conversationId;
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        businessId: input.businessId,
        title: input.content.substring(0, 100),
      },
    });
    conversationId = conversation.id;
  } else {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, business: { userId } },
    });
    if (!conv) {
      throw new AppError('Беседа не найдена', 404);
    }
  }

  // Сохраняем сообщение пользователя
  await prisma.message.create({
    data: {
      conversationId,
      role: 'USER',
      content: input.content,
    },
  });

  // Собираем историю переписки
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50, // Лимит контекстного окна
  });

  // Строим контекст
  const businessContext = await buildBusinessContext(input.businessId);
  const isOnboarding = business.status === 'IDEA_GENERATION' && messages.length <= 2;
  const systemPrompt = isOnboarding ? SYSTEM_PROMPT_ONBOARDING : SYSTEM_PROMPT_MAIN;

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt + businessContext },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ];

  // Отправляем в LLM
  let aiResponse: string;

  if (input.stream && res) {
    aiResponse = await streamChat(chatMessages, res);
  } else {
    aiResponse = await sendChat(chatMessages);
  }

  // Сохраняем ответ ИИ
  await prisma.message.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      content: aiResponse,
    },
  });

  // Обновляем title беседы, если это первое сообщение
  if (messages.length <= 1) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: input.content.substring(0, 100) },
    });
  }

  // Автоматически извлекаем бизнес-инфо из чата каждые 4 сообщения
  const totalMessages = messages.length + 1; // +1 за новый ответ ИИ
  if (totalMessages >= 4 && totalMessages % 4 === 0) {
    extractAndUpdateBusiness(input.businessId, conversationId).catch(err =>
      console.error('[chat] extractAndUpdateBusiness error:', err)
    );
  }

  if (!input.stream) {
    return {
      conversationId,
      message: aiResponse,
    };
  }
}

/**
 * Фоновое извлечение бизнес-информации из чат-истории и обновление Business.
 */
async function extractAndUpdateBusiness(businessId: string, conversationId: string) {
  const msgs = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 30,
  });

  if (msgs.length < 4) return;

  const chatHistory = msgs
    .map(m => `${m.role === 'USER' ? 'Пользователь' : 'ИИ'}: ${m.content}`)
    .join('\n\n');

  interface ExtractedInfo {
    title?: string | null;
    description?: string | null;
    industry?: string | null;
    problemStatement?: string | null;
    targetAudience?: string | null;
    uniqueValue?: string | null;
    competitors?: string | null;
    monetizationModel?: string | null;
  }

  const extracted = await sendChatJSON<ExtractedInfo>([
    { role: 'system', content: SYSTEM_PROMPT_EXTRACT_BUSINESS_INFO },
    { role: 'user', content: `Вот история диалога:\n\n${chatHistory}` },
  ]);

  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) return;

  const updateData: Record<string, string> = {};
  // Название и описание — всегда обновляем на актуальные из диалога
  if (extracted.title && extracted.title !== 'null' && extracted.title !== biz.title) {
    updateData.title = extracted.title;
  }
  if (extracted.description && extracted.description !== 'null' && extracted.description !== biz.description) {
    updateData.description = extracted.description;
  }
  // Остальные поля — обновляем если появилась новая информация
  if (extracted.industry && extracted.industry !== 'null' && extracted.industry !== biz.industry) {
    updateData.industry = extracted.industry;
  }
  if (extracted.problemStatement && extracted.problemStatement !== 'null' && extracted.problemStatement !== biz.problemStatement) {
    updateData.problemStatement = extracted.problemStatement;
  }
  if (extracted.targetAudience && extracted.targetAudience !== 'null' && extracted.targetAudience !== biz.targetAudience) {
    updateData.targetAudience = extracted.targetAudience;
  }
  if (extracted.uniqueValue && extracted.uniqueValue !== 'null' && extracted.uniqueValue !== biz.uniqueValue) {
    updateData.uniqueValue = extracted.uniqueValue;
  }
  if (extracted.competitors && extracted.competitors !== 'null' && extracted.competitors !== biz.competitors) {
    updateData.competitors = extracted.competitors;
  }
  if (extracted.monetizationModel && extracted.monetizationModel !== 'null' && extracted.monetizationModel !== biz.monetizationModel) {
    updateData.monetizationModel = extracted.monetizationModel;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.business.update({ where: { id: businessId }, data: updateData });
    console.log(`[chat] Business ${businessId} updated:`, Object.keys(updateData));
  }
}

export async function getConversations(userId: string, businessId: string) {
  return prisma.conversation.findMany({
    where: { businessId, business: { userId } },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getConversationMessages(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, business: { userId } },
  });
  if (!conversation) {
    throw new AppError('Беседа не найдена', 404);
  }

  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function deleteConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, business: { userId } },
  });
  if (!conversation) {
    throw new AppError('Беседа не найдена', 404);
  }

  await prisma.conversation.delete({ where: { id: conversationId } });
}
