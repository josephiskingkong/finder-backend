import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { sendChat, sendChatJSON } from '../../services/ai.service';
import type { ChatMessage } from '../../services/openai.service';
import { SYSTEM_PROMPT_ROADMAP_GENERATION, SYSTEM_PROMPT_STEP_ANALYSIS, SYSTEM_PROMPT_EXTRACT_BUSINESS_INFO } from '../../prompts/system';
import { ReportStepInput } from './roadmap.validation';
// RoadmapPhase определён в Prisma schema

interface GeneratedStep {
  phase: string;
  order: number;
  title: string;
  description: string;
  tips: string;
}

/**
 * Генерация персонализированного роадмапа через ИИ.
 * Перед генерацией: извлекает информацию из чат-истории и обновляет Business.
 */
export async function generateRoadmap(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    include: {
      user: { include: { entrepreneurProfile: true } },
    },
  });

  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  // Удаляем старый роадмап, если есть
  const existingRoadmap = await prisma.roadmap.findUnique({ where: { businessId } });
  if (existingRoadmap) {
    await prisma.roadmap.delete({ where: { id: existingRoadmap.id } });
  }

  // --- 1. Загружаем чат-историю этого бизнеса ---
  const conversations = await prisma.conversation.findMany({
    where: { businessId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 100 },
    },
    orderBy: { createdAt: 'asc' },
  });

  const allMessages = conversations.flatMap(c => c.messages);
  let chatSummary = '';

  // --- 2. Если есть чат-история — извлечь бизнес-инфо и обновить Business ---
  if (allMessages.length >= 2) {
    const chatHistory = allMessages
      .map(m => `${m.role === 'USER' ? 'Пользователь' : 'ИИ'}: ${m.content}`)
      .join('\n\n');

    // Суммаризируем чат-историю (последние 30 сообщений для экономии токенов)
    const recentHistory = allMessages.slice(-30)
      .map(m => `${m.role === 'USER' ? 'Пользователь' : 'ИИ'}: ${m.content}`)
      .join('\n\n');

    chatSummary = recentHistory;

    // Извлекаем структурированные данные из чата
    try {
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

      // Обновляем Business только непустыми полями
      const updateData: Record<string, string> = {};
      if (extracted.title && extracted.title !== 'null' && business.title === 'Новый проект') {
        updateData.title = extracted.title;
      }
      if (extracted.description && extracted.description !== 'null') {
        updateData.description = extracted.description;
      }
      if (extracted.industry && extracted.industry !== 'null' && !business.industry) {
        updateData.industry = extracted.industry;
      }
      if (extracted.problemStatement && extracted.problemStatement !== 'null' && !business.problemStatement) {
        updateData.problemStatement = extracted.problemStatement;
      }
      if (extracted.targetAudience && extracted.targetAudience !== 'null' && !business.targetAudience) {
        updateData.targetAudience = extracted.targetAudience;
      }
      if (extracted.uniqueValue && extracted.uniqueValue !== 'null' && !business.uniqueValue) {
        updateData.uniqueValue = extracted.uniqueValue;
      }
      if (extracted.competitors && extracted.competitors !== 'null' && !business.competitors) {
        updateData.competitors = extracted.competitors;
      }
      if (extracted.monetizationModel && extracted.monetizationModel !== 'null' && !business.monetizationModel) {
        updateData.monetizationModel = extracted.monetizationModel;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.business.update({
          where: { id: businessId },
          data: updateData,
        });
        // Обновляем локальный объект для контекста ниже
        Object.assign(business, updateData);
      }
    } catch (err) {
      console.error('[generateRoadmap] Failed to extract business info from chat:', err);
      // Не блокируем генерацию роадмапа — продолжаем с тем что есть
    }
  }

  // --- 3. Формируем контекст для генерации роадмапа ---
  const profile = business.user.entrepreneurProfile;
  let userContext = `Информация о бизнесе:\n`;
  userContext += `- Название: ${business.title}\n`;
  if (business.description) userContext += `- Описание: ${business.description}\n`;
  if (business.industry) userContext += `- Отрасль: ${business.industry}\n`;
  if (business.problemStatement) userContext += `- Проблема: ${business.problemStatement}\n`;
  if (business.targetAudience) userContext += `- ЦА: ${business.targetAudience}\n`;
  if (business.uniqueValue) userContext += `- Уникальное предложение: ${business.uniqueValue}\n`;
  if (business.competitors) userContext += `- Конкуренты: ${business.competitors}\n`;
  if (business.monetizationModel) userContext += `- Модель монетизации: ${business.monetizationModel}\n`;
  userContext += `- Статус: ${business.status}\n`;

  if (profile) {
    userContext += `\nПрофиль:\n`;
    userContext += `- Тип: ${profile.type}\n`;
    if (profile.industryKnowledge) userContext += `- Область: ${profile.industryKnowledge}\n`;
    userContext += `- Есть существующий бизнес: ${profile.hasExistingBusiness ? 'Да' : 'Нет'}\n`;
  }

  // Если есть чат-история — включаем краткую выжимку в контекст
  if (chatSummary) {
    userContext += `\n--- ИСТОРИЯ ОБСУЖДЕНИЯ С ИИ ---\nПользователь уже обсуждал этот проект с ИИ-наставником. Вот последние сообщения (учитывай их при генерации роадмапа — НЕ включай шаги, которые уже обсуждены и решены):\n\n${chatSummary}\n--- КОНЕЦ ИСТОРИИ ---\n`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT_ROADMAP_GENERATION },
    { role: 'user', content: `Сгенерируй роадмап для этого бизнеса. Ответь JSON-объектом с ключом "steps" — массивом шагов.\n\n${userContext}` },
  ];

  // Парсим JSON из ответа
  let steps: GeneratedStep[];
  try {
    const response = await sendChatJSON<{ steps: GeneratedStep[] }>(messages);
    steps = response.steps || [];
  } catch (err) {
    console.error('[generateRoadmap] Failed to generate/parse roadmap:', err);
    throw new AppError('Не удалось сгенерировать роадмап. Попробуйте снова.', 500);
  }

  // Валидация фаз
  const validPhases = [
    'PROBLEMATIZATION', 'PRODUCT_STUDY', 'MARKET_ANALYSIS',
    'MONETIZATION', 'USER_INTERVIEWS', 'MVP_CREATION',
    'REPEAT_CUSTDEV', 'REGISTRATION', 'ACCOUNTING',
  ];

  // Создаём роадмап
  const roadmap = await prisma.roadmap.create({
    data: {
      businessId,
      steps: {
        create: steps
          .filter(s => validPhases.includes(s.phase))
          .map((s: GeneratedStep, idx: number) => ({
            phase: s.phase as any,
            order: idx + 1,
            title: s.title,
            description: s.description,
            tips: s.tips || null,
            status: idx === 0 ? 'AVAILABLE' : 'LOCKED',
          })),
      },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  // Обновляем статус бизнеса
  await prisma.business.update({
    where: { id: businessId },
    data: { status: 'ANALYSIS' },
  });

  return roadmap;
}

/**
 * Получить роадмап бизнеса.
 */
export async function getRoadmap(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  const roadmap = await prisma.roadmap.findUnique({
    where: { businessId },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  if (!roadmap) {
    throw new AppError('Роадмап не найден. Сначала его нужно сгенерировать.', 404);
  }

  return roadmap;
}

/**
 * Отчёт по шагу — юзер сообщает, получилось или нет.
 * ИИ анализирует результат и решает, нужна ли перегенерация оставшихся шагов.
 */
export async function reportStep(userId: string, stepId: string, input: ReportStepInput) {
  const step = await prisma.roadmapStep.findUnique({
    where: { id: stepId },
    include: {
      roadmap: {
        include: {
          business: { include: { user: { include: { entrepreneurProfile: true } } } },
          steps: { orderBy: { order: 'asc' } },
        },
      },
    },
  });

  if (!step || step.roadmap.business.userId !== userId) {
    throw new AppError('Шаг не найден', 404);
  }

  if (step.status !== 'AVAILABLE' && step.status !== 'IN_PROGRESS') {
    throw new AppError('Этот шаг сейчас недоступен для выполнения', 400);
  }

  // Собираем контекст завершённых шагов
  const completedSteps = step.roadmap.steps
    .filter((s: any) => s.status === 'COMPLETED')
    .map((s: any) => `- ${s.title}: ${s.userReport || 'выполнен'}`)
    .join('\n');

  const remainingSteps = step.roadmap.steps
    .filter((s: any) => s.status === 'LOCKED')
    .map((s: any) => `- [${s.phase}] ${s.title}`)
    .join('\n');

  // Получаем анализ от ИИ
  const analysisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPT_STEP_ANALYSIS,
    },
    {
      role: 'user',
      content: `Шаг: "${step.title}"\nОписание шага: ${step.description}\nОтчёт пользователя: ${input.report}\nРезультат: ${input.success ? 'Успешно' : 'Не удалось'}\n${input.feedback ? `Комментарий: ${input.feedback}` : ''}\n\nЗавершённые шаги:\n${completedSteps || 'нет'}\n\nОставшиеся шаги в плане:\n${remainingSteps || 'нет'}`,
    },
  ];

  interface AnalysisResult {
    analysis: string;
    shouldRegenerate: boolean;
    reason?: string;
  }

  let analysisResult: AnalysisResult;
  try {
    analysisResult = await sendChatJSON<AnalysisResult>(analysisMessages);
  } catch {
    // fallback если JSON не распарсится
    const rawAnalysis = await sendChat(analysisMessages);
    analysisResult = { analysis: rawAnalysis, shouldRegenerate: false };
  }

  const aiAnalysis = analysisResult.analysis || '';

  // Обновляем шаг
  const updatedStep = await prisma.roadmapStep.update({
    where: { id: stepId },
    data: {
      status: input.success ? 'COMPLETED' : 'FAILED',
      userReport: input.report,
      userFeedback: input.feedback || (input.success ? 'Успешно' : 'Не удалось'),
      aiAnalysis,
      completedAt: input.success ? new Date() : null,
    },
  });

  // Если ИИ рекомендует перегенерировать оставшиеся шаги
  if (analysisResult.shouldRegenerate && input.success) {
    await regenerateRemainingSteps(step.roadmap, step.order, userId);
  } else if (input.success) {
    // Просто открываем следующий шаг
    const nextStep = step.roadmap.steps.find((s: any) => s.order === step.order + 1);
    if (nextStep) {
      await prisma.roadmapStep.update({
        where: { id: nextStep.id },
        data: { status: 'AVAILABLE' },
      });
    }
  }

  // Возвращаем полный обновлённый роадмап
  const updatedRoadmap = await prisma.roadmap.findUnique({
    where: { id: step.roadmap.id },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  return {
    step: updatedStep,
    aiAnalysis,
    roadmap: updatedRoadmap,
  };
}

/**
 * Перегенерировать оставшиеся (LOCKED) шаги роадмапа на основе нового контекста.
 */
async function regenerateRemainingSteps(
  roadmap: any,
  completedUpToOrder: number,
  userId: string,
) {
  const business = roadmap.business;
  const profile = business.user?.entrepreneurProfile;

  // Удаляем все LOCKED шаги
  await prisma.roadmapStep.deleteMany({
    where: {
      roadmapId: roadmap.id,
      status: 'LOCKED',
    },
  });

  // Собираем контекст завершённых шагов
  const completedSteps = roadmap.steps
    .filter((s: any) => s.status === 'COMPLETED' || s.order <= completedUpToOrder)
    .map((s: any) => `- [${s.phase}] ${s.title}: ${s.userReport || s.description}`)
    .join('\n');

  let userContext = `Информация о бизнесе:\n`;
  userContext += `- Название: ${business.title}\n`;
  if (business.description) userContext += `- Описание: ${business.description}\n`;
  if (business.industry) userContext += `- Отрасль: ${business.industry}\n`;
  if (business.problemStatement) userContext += `- Проблема: ${business.problemStatement}\n`;
  if (business.targetAudience) userContext += `- ЦА: ${business.targetAudience}\n`;

  if (profile) {
    userContext += `\nПрофиль:\n- Тип: ${profile.type}\n`;
    if (profile.industryKnowledge) userContext += `- Область: ${profile.industryKnowledge}\n`;
  }

  userContext += `\n\nУже пройденные шаги:\n${completedSteps}`;
  userContext += `\n\nСгенерируй ТОЛЬКО оставшиеся шаги (НАЧИНАЯ С order ${completedUpToOrder + 1}), учитывая результаты пройденных шагов. Если пользователь изменил направление — адаптируй план.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT_ROADMAP_GENERATION },
    { role: 'user', content: `${userContext}\n\nОтветь JSON-массивом новых шагов.` },
  ];

  const response = await sendChat(messages);

  let newSteps: GeneratedStep[];
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      newSteps = JSON.parse(jsonMatch[0]);
    } else {
      const parsed = JSON.parse(response);
      newSteps = parsed.steps || parsed;
    }
  } catch {
    // Если не получилось — ничего не делаем, оставляем как есть
    return;
  }

  const validPhases = [
    'PROBLEMATIZATION', 'PRODUCT_STUDY', 'MARKET_ANALYSIS',
    'MONETIZATION', 'USER_INTERVIEWS', 'MVP_CREATION',
    'REPEAT_CUSTDEV', 'REGISTRATION', 'ACCOUNTING',
  ];

  const filteredSteps = newSteps.filter(s => validPhases.includes(s.phase));

  // Создаём новые шаги, первый — AVAILABLE
  for (let i = 0; i < filteredSteps.length; i++) {
    const s = filteredSteps[i];
    await prisma.roadmapStep.create({
      data: {
        roadmapId: roadmap.id,
        phase: s.phase as any,
        order: completedUpToOrder + 1 + i,
        title: s.title,
        description: s.description,
        tips: s.tips || null,
        status: i === 0 ? 'AVAILABLE' : 'LOCKED',
      },
    });
  }
}

/**
 * Начать работу над шагом.
 */
export async function startStep(userId: string, stepId: string) {
  const step = await prisma.roadmapStep.findUnique({
    where: { id: stepId },
    include: { roadmap: { include: { business: true } } },
  });

  if (!step || step.roadmap.business.userId !== userId) {
    throw new AppError('Шаг не найден', 404);
  }

  if (step.status !== 'AVAILABLE') {
    throw new AppError('Этот шаг сейчас недоступен', 400);
  }

  return prisma.roadmapStep.update({
    where: { id: stepId },
    data: { status: 'IN_PROGRESS' },
  });
}
