import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { sendChatJSON } from '../../services/ai.service';
import { SYSTEM_PROMPT_HYPOTHESIS_GENERATION, SYSTEM_PROMPT_EXTRACT_BUSINESS_INFO } from '../../prompts/system';
import type { ChatMessage } from '../../services/openai.service';
import type { CreateHypothesisInput, UpdateHypothesisInput, AddQuestionInput, RecordFindingInput } from './interview.validation';

interface GeneratedHypothesis {
  statement: string;
  category: 'problem' | 'solution' | 'value' | 'price' | 'channel' | 'other';
  priority: number;
  questions: string[];
}

interface GeneratedHypothesesResponse {
  hypotheses: GeneratedHypothesis[];
}

/**
 * Получить все гипотезы бизнес-проекта
 */
export async function getHypotheses(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
  });

  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  const hypotheses = await (prisma as any).hypothesis.findMany({
    where: { businessId },
    include: {
      questions: { orderBy: { order: 'asc' } },
      findings: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: [
      { status: 'asc' }, // PENDING first
      { priority: 'asc' }, // High priority first
      { createdAt: 'desc' },
    ],
  });

  // Calculate statistics
  const stats = {
    total: hypotheses.length,
    pending: hypotheses.filter((h: any) => h.status === 'PENDING').length,
    confirmed: hypotheses.filter((h: any) => h.status === 'CONFIRMED').length,
    rejected: hypotheses.filter((h: any) => h.status === 'REJECTED').length,
    partially: hypotheses.filter((h: any) => h.status === 'PARTIALLY').length,
    byCategory: {
      problem: hypotheses.filter((h: any) => h.category === 'problem').length,
      solution: hypotheses.filter((h: any) => h.category === 'solution').length,
      value: hypotheses.filter((h: any) => h.category === 'value').length,
      price: hypotheses.filter((h: any) => h.category === 'price').length,
      channel: hypotheses.filter((h: any) => h.category === 'channel').length,
      other: hypotheses.filter((h: any) => h.category === 'other').length,
    },
  };

  return { hypotheses, stats };
}

/**
 * Создать гипотезу вручную
 */
export async function createHypothesis(userId: string, data: CreateHypothesisInput) {
  const business = await prisma.business.findFirst({
    where: { id: data.businessId, userId },
  });

  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  const hypothesis = await (prisma as any).hypothesis.create({
    data: {
      businessId: data.businessId,
      statement: data.statement,
      category: data.category,
      priority: data.priority,
      status: 'PENDING',
      isAiGenerated: false,
    },
    include: {
      questions: true,
      findings: true,
    },
  });

  return hypothesis;
}

/**
 * Генерация гипотез ИИ на основе данных о бизнесе
 */
export async function generateHypotheses(userId: string, businessId: string, count: number = 10) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    include: {
      user: { include: { entrepreneurProfile: true } },
    },
  });

  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  // Get chat history for context
  const conversations = await prisma.conversation.findMany({
    where: { businessId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 50 },
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });

  const allMessages = conversations.flatMap(c => c.messages);
  const chatHistory = allMessages.length > 0
    ? allMessages.map(m => `${m.role === 'USER' ? 'Пользователь' : 'ИИ'}: ${m.content}`).join('\n\n')
    : 'Нет истории чата';

  // Build context for AI
  const context = {
    title: business.title,
    description: business.description || 'Не указано',
    industry: business.industry || 'Не указана',
    problemStatement: business.problemStatement || 'Не указана',
    targetAudience: business.targetAudience || 'Не указана',
    uniqueValue: business.uniqueValue || 'Не указано',
    monetizationModel: business.monetizationModel || 'Не указана',
    entrepreneurType: business.user.entrepreneurProfile?.type || 'UNKNOWN',
    chatHistory,
  };

  // Generate hypotheses using AI
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT_HYPOTHESIS_GENERATION },
    { 
      role: 'user', 
      content: `Сгенерируй ${count} гипотез для проверки на интервью.

Информация о бизнесе:
- Название: ${context.title}
- Описание: ${context.description}
- Отрасль: ${context.industry}
- Проблема: ${context.problemStatement}
- Целевая аудитория: ${context.targetAudience}
- Уникальное предложение: ${context.uniqueValue}
- Модель монетизации: ${context.monetizationModel}
- Тип предпринимателя: ${context.entrepreneurType}

История обсуждений:
${context.chatHistory}

Сгенерируй гипотезы с вопросами для проверки.` 
    },
  ];

  let generated: GeneratedHypothesis[];
  try {
    const raw = await sendChatJSON<GeneratedHypothesesResponse | GeneratedHypothesis[]>(messages);
    // Поддержка обоих форматов: { hypotheses: [...] } и просто [...]
    if (Array.isArray(raw)) {
      generated = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as GeneratedHypothesesResponse).hypotheses)) {
      generated = (raw as GeneratedHypothesesResponse).hypotheses;
    } else if (raw && typeof raw === 'object') {
      // Одиночный объект — оборачиваем
      generated = [raw as unknown as GeneratedHypothesis];
    } else {
      throw new Error('Unexpected AI response format');
    }
  } catch (parseError) {
    console.error('[generateHypotheses] AI parse error:', parseError);
    throw new AppError('ИИ вернул неверный формат ответа. Попробуйте ещё раз.', 500);
  }

  // Save generated hypotheses
  const savedHypotheses = [];
  for (const h of generated.slice(0, count)) {
    const hypothesis = await (prisma as any).hypothesis.create({
      data: {
        businessId,
        statement: h.statement,
        category: h.category || 'other',
        priority: Math.min(Math.max(h.priority || 3, 1), 5),
        status: 'PENDING',
        isAiGenerated: true,
        questions: {
          create: (h.questions || []).map((q, idx) => ({
            question: q,
            questionType: 'open',
            order: idx,
            isAiGenerated: true,
          })),
        },
      },
      include: {
        questions: true,
        findings: true,
      },
    });
    savedHypotheses.push(hypothesis);
  }

  return {
    generated: savedHypotheses.length,
    hypotheses: savedHypotheses,
  };
}

/**
 * Обновить гипотезу
 */
export async function updateHypothesis(
  userId: string, 
  hypothesisId: string, 
  data: UpdateHypothesisInput
) {
  const hypothesis = await (prisma as any).hypothesis.findUnique({
    where: { id: hypothesisId },
    include: { business: true },
  });

  if (!hypothesis || hypothesis.business.userId !== userId) {
    throw new AppError('Гипотеза не найдена', 404);
  }

  const updated = await (prisma as any).hypothesis.update({
    where: { id: hypothesisId },
    data: {
      statement: data.statement,
      category: data.category,
      priority: data.priority,
      status: data.status,
      evidenceSummary: data.evidenceSummary,
    },
    include: {
      questions: true,
      findings: true,
    },
  });

  return updated;
}

/**
 * Удалить гипотезу
 */
export async function deleteHypothesis(userId: string, hypothesisId: string) {
  const hypothesis = await (prisma as any).hypothesis.findUnique({
    where: { id: hypothesisId },
    include: { business: true },
  });

  if (!hypothesis || hypothesis.business.userId !== userId) {
    throw new AppError('Гипотеза не найдена', 404);
  }

  await (prisma as any).hypothesis.delete({
    where: { id: hypothesisId },
  });

  return { success: true };
}

/**
 * Добавить вопрос к гипотезе
 */
export async function addQuestion(
  userId: string, 
  hypothesisId: string, 
  data: AddQuestionInput
) {
  const hypothesis = await (prisma as any).hypothesis.findUnique({
    where: { id: hypothesisId },
    include: { business: true },
  });

  if (!hypothesis || hypothesis.business.userId !== userId) {
    throw new AppError('Гипотеза не найдена', 404);
  }

  const question = await (prisma as any).interviewQuestion.create({
    data: {
      hypothesisId,
      question: data.question,
      questionType: data.questionType,
      order: data.order,
      isAiGenerated: false,
    },
  });

  return question;
}

/**
 * Удалить вопрос
 */
export async function deleteQuestion(userId: string, questionId: string) {
  const question = await (prisma as any).interviewQuestion.findUnique({
    where: { id: questionId },
    include: { hypothesis: { include: { business: true } } },
  });

  if (!question || question.hypothesis.business.userId !== userId) {
    throw new AppError('Вопрос не найден', 404);
  }

  await (prisma as any).interviewQuestion.delete({
    where: { id: questionId },
  });

  return { success: true };
}

/**
 * Записать результат интервью (finding)
 */
export async function recordFinding(
  userId: string, 
  hypothesisId: string, 
  data: RecordFindingInput
) {
  const hypothesis = await (prisma as any).hypothesis.findUnique({
    where: { id: hypothesisId },
    include: { business: true },
  });

  if (!hypothesis || hypothesis.business.userId !== userId) {
    throw new AppError('Гипотеза не найдена', 404);
  }

  // Create finding
  const finding = await (prisma as any).interviewFinding.create({
    data: {
      hypothesisId,
      interviewee: data.interviewee,
      notes: data.notes,
      verdict: data.verdict,
    },
  });

  // Update hypothesis counters
  const confirmedCount = data.verdict === 'confirmed' 
    ? hypothesis.confirmedCount + 1 
    : hypothesis.confirmedCount;
  const rejectedCount = data.verdict === 'rejected'
    ? hypothesis.rejectedCount + 1
    : hypothesis.rejectedCount;

  // Auto-update status based on findings
  let newStatus = hypothesis.status;
  if (confirmedCount >= 3) {
    newStatus = 'CONFIRMED';
  } else if (rejectedCount >= 3) {
    newStatus = 'REJECTED';
  } else if (confirmedCount > 0 || rejectedCount > 0) {
    newStatus = 'PARTIALLY';
  }

  await (prisma as any).hypothesis.update({
    where: { id: hypothesisId },
    data: {
      confirmedCount,
      rejectedCount,
      status: newStatus,
    },
  });

  return finding;
}

/**
 * Получить детали гипотезы со всеми данными
 */
export async function getHypothesisDetails(userId: string, hypothesisId: string) {
  const hypothesis = await (prisma as any).hypothesis.findUnique({
    where: { id: hypothesisId },
    include: {
      business: true,
      questions: { orderBy: { order: 'asc' } },
      findings: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!hypothesis || hypothesis.business.userId !== userId) {
    throw new AppError('Гипотеза не найдена', 404);
  }

  return hypothesis;
}
