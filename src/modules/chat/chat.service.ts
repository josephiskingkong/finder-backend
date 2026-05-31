import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { SendMessageInput } from './chat.validation';
import type { ChatMessage } from '../../services/openai.service';
import { sendChat, streamChat, sendChatJSON, DEFAULT_AI_TIER } from '../../services/ai.service';
import type { AiTier } from '../../services/ai.service';
import { SYSTEM_PROMPT_MAIN, SYSTEM_PROMPT_ONBOARDING, SYSTEM_PROMPT_EXTRACT_BUSINESS_INFO } from '../../prompts/system';
import { analyzeCompetitorsForBusiness, CompetitorAnalysisResult } from '../business/competitors.service';
import { assertTierAllowed, assertMessageQuota, getSubscriptionState } from '../../services/subscription.service';
import {
  rebuildSummary,
  shouldRebuildSummary,
  RECENT_BUFFER_SIZE,
} from '../../services/summary.service';
import { clipLongAssistantMessage, estimateTokens } from '../../utils/tokens';
import { Response } from 'express';

/// Триггер-фразы, при которых перед ответом ИИ автоматически подтягиваем данные ФНС.
const COMPETITOR_INTENT_PATTERN = /(конкурент|конкуренц|анализ\s+рынка|анализ\s+конкур|спарси\w*\s+конкур|проверь\s+конкур|кто\s+уже\s+на\s+рынке|кто\s+есть\s+на\s+рынке|похожие\s+(компании|бизнес)|данн(ые|ых)\s+(из\s+)?(ЕГРЮЛ|ЕГРИП|ФНС))/i;

function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify(Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    ));
  }
}

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

  // Обрезаем длинные текстовые поля, чтобы не раздувать input-токены.
  const trim = (s: string | null | undefined, max = 200) =>
    s ? (s.length > max ? s.slice(0, max) + '…' : s) : null;

  let context = `\n\n## Проект:\n`;
  context += `- **Название:** ${business.title}\n`;
  if (business.description) context += `- **Описание:** ${trim(business.description)}\n`;
  if (business.industry) context += `- **Отрасль:** ${business.industry}\n`;
  if (business.problemStatement) context += `- **Проблема:** ${trim(business.problemStatement)}\n`;
  if (business.targetAudience) context += `- **ЦА:** ${trim(business.targetAudience)}\n`;
  if (business.uniqueValue) context += `- **УТП:** ${trim(business.uniqueValue)}\n`;
  if (business.competitors) context += `- **Конкуренты:** ${trim(business.competitors)}\n`;
  if (business.monetizationModel) context += `- **Монетизация:** ${trim(business.monetizationModel)}\n`;
  if (business.legalForm) context += `- **Юр. форма:** ${business.legalForm}\n`;
  if (business.taxSystem) context += `- **Налоги:** ${business.taxSystem}\n`;
  context += `- **Статус:** ${business.status}\n`;

  if (profile) {
    const profileType = profile.type === 'DOMAIN_EXPERT' ? 'DOMAIN_EXPERT' : profile.type === 'COMPLETE_BEGINNER' ? 'COMPLETE_BEGINNER' : profile.type;
    context += `\n## Предприниматель: ${profileType}`;
    if (profile.industryKnowledge) context += `, сфера: ${trim(profile.industryKnowledge, 80)}`;
    if (profile.experienceYears) context += `, опыт: ${profile.experienceYears} лет`;
    context += '\n';
  }

  if (roadmap?.steps?.length) {
    context += `\n## Роадмап:\n`;
    // Ограничиваем 10 шагами; отчёты обрезаем до 100 символов
    const stepsToShow = roadmap.steps.slice(0, 10);
    for (const step of stepsToShow) {
      const statusEmoji = step.status === 'COMPLETED' ? '✅' : step.status === 'IN_PROGRESS' ? '🔄' : step.status === 'AVAILABLE' ? '⬜' : '🔒';
      context += `${statusEmoji} ${step.order}. ${step.title} (${step.status})\n`;
      if (step.userReport) context += `   Отчёт: ${trim(step.userReport, 100)}\n`;
    }
    if (roadmap.steps.length > 10) context += `   … ещё ${roadmap.steps.length - 10} шагов\n`;
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

  // Получаем или создаём беседу, фиксируем выбранный tier ИИ.
  let conversationId = input.conversationId;
  let aiTier: AiTier = input.aiTier || DEFAULT_AI_TIER;

  // Подписка: проверяем, что выбранный tier разрешён планом пользователя.
  // Если пользователь не указал tier — выбираем максимально доступный (PREMIUM > PLUS).
  const subscription = await getSubscriptionState(userId);
  if (input.aiTier) {
    await assertTierAllowed(userId, input.aiTier);
  } else if (subscription.allowedTiers.length === 0) {
    throw new AppError(
      `На вашем тарифе (${subscription.plan}) ИИ-модели пока недоступны. Перейдите на подписку Plus или Premium.`,
      403,
    );
  } else {
    aiTier = subscription.allowedTiers.includes('PREMIUM') ? 'PREMIUM' : subscription.allowedTiers[0];
  }

  // Rate-limit: проверяем квоту сообщений в rolling-window (FREE 10/6ч, PLUS 100/6ч, PREMIUM 500/6ч).
  // Проверяем ДО сохранения сообщения юзера в БД и ДО вызова LLM, чтобы:
  //  - не платить за LLM, если юзер всё равно упёрся в лимит;
  //  - не загрязнять историю чата сообщениями, на которые не было ответа.
  await assertMessageQuota(userId);
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        businessId: input.businessId,
        title: input.content.substring(0, 100),
        aiTier,
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
    // Если фронт прислал явный tier — обновим беседу, иначе используем сохранённый.
    if (input.aiTier && input.aiTier !== conv.aiTier) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { aiTier: input.aiTier } });
      aiTier = input.aiTier;
    } else {
      aiTier = conv.aiTier as AiTier;
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

  // Получаем актуальную беседу с полями rolling-summary.
  const convFull = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { summary: true, summaryUpTo: true, summarizedCount: true },
  });

  // === Сборка контекстного окна (rolling summary + recent buffer) ===
  //
  // 1) RECENT_BUFFER_SIZE последних сообщений → идут в LLM verbatim.
  // 2) Всё, что раньше, — заменяется на одно SYSTEM-сообщение с conv.summary (если он есть).
  //
  // Это в ~3 раза снижает input-токены на длинных беседах без потери качества:
  // тон/недавние факты сохраняются в recent buffer, а долгая память — в summary.
  const recentMessagesDesc = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: RECENT_BUFFER_SIZE,
    select: { role: true, content: true },
  });
  const recentMessages = recentMessagesDesc.reverse();

  const totalMessagesNow = await prisma.message.count({ where: { conversationId } });

  // Строим контекст бизнеса (генерируется из БД на лету).
  const businessContext = await buildBusinessContext(input.businessId);
  // Онбординг определяем по реальному размеру беседы, а не размеру буфера.
  const isOnboarding = business.status === 'IDEA_GENERATION' && totalMessagesNow <= 2;
  const systemPrompt = isOnboarding ? SYSTEM_PROMPT_ONBOARDING : SYSTEM_PROMPT_MAIN;

  // Если пользователь запросил анализ конкурентов — сначала получаем данные ФНС,
  // затем инжектируем в промпт ИИ и дополнительно отправляем карточку в SSE до стрима.
  let competitorsContext = '';
  let competitorsResult: CompetitorAnalysisResult | null = null;
  if (shouldFetchCompetitors(input.content, business.status)) {
    const cr = await buildCompetitorsContext(userId, input.businessId, input.content, aiTier);
    competitorsContext = cr.markdown;
    competitorsResult = cr.result;
  }

  // Если стрим + есть данные конкурентов — отправляем карточку в SSE до начала генерации текста.
  if (input.stream && res && competitorsResult) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${safeJsonStringify({ competitors: competitorsResult })}

`);
  }

  const summaryContext = convFull?.summary
    ? `\n\n## Память о прошлой части беседы:\n${convFull.summary}`
    : '';

  // Для PREMIUM (OpenAI) — competitors в system prompt, он строго следует инструкциям.
  // Для PLUS (GigaChat) — competitors в последнее user-сообщение, он игнорирует
  // вспомогательные system-сообщения, но реагирует на данные в user-запросе.
  const processedRecent = recentMessages.map((m: { role: string; content: string }) => {
    const role = m.role.toLowerCase() as 'user' | 'assistant' | 'system';
    const content = role === 'assistant' ? clipLongAssistantMessage(m.content) : m.content;
    return { role, content };
  });

  if (aiTier === 'PLUS' && competitorsContext) {
    const lastIdx = processedRecent.length - 1;
    if (lastIdx >= 0 && processedRecent[lastIdx].role === 'user') {
      processedRecent[lastIdx] = {
        ...processedRecent[lastIdx],
        content: processedRecent[lastIdx].content
          + '\n\n---\nВАЖНО: проанализируй ТОЛЬКО эти компании из реестра ФНС. Не придумывай других.\n'
          + competitorsContext,
      };
    }
  }

  const fullSystemPrompt = systemPrompt + businessContext
    + (aiTier === 'PREMIUM' && competitorsContext ? '\n' + competitorsContext : '')
    + summaryContext;

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    ...processedRecent,
  ];

  // Отправляем в LLM через выбранный пользователем tier (PREMIUM/PLUS)
  let aiResponse: string;

  if (input.stream && res) {
    aiResponse = await streamChat(chatMessages, res, { tier: aiTier, userMessage: input.content });
  } else {
    aiResponse = await sendChat(chatMessages, { tier: aiTier, userMessage: input.content });
  }

  // Считаем эвристические токены для метрик стоимости (точность ±15%, без сторонних зависимостей).
  // Это пишется в Message.metadata — потом видно в админке/аналитике, сколько уходит на каждого юзера.
  const inputTokens = chatMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const outputTokens = estimateTokens(aiResponse);
  const usedSummary = !!convFull?.summary;

  // Сохраняем ответ ИИ + метаданные о расходе.
  await prisma.message.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      content: aiResponse,
      metadata: safeJsonStringify({
        aiTier,
        tokensIn: inputTokens,
        tokensOut: outputTokens,
        usedSummary,
        recentBufferSize: recentMessages.length,
        competitorsAttached: !!competitorsContext,
        ...(competitorsResult ? { competitorsResult } : {}),
      }),
    },
  });

  // Обновляем title беседы, если это первое сообщение
  if (totalMessagesNow <= 1) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: input.content.substring(0, 100) },
    });
  }

  // totalMessagesNow считалось ДО сохранения ответа ИИ → теперь сообщений на 1 больше.
  const totalAfter = totalMessagesNow + 1;

  // Автоматически извлекаем бизнес-инфо из чата каждые 4 сообщения.
  if (totalAfter >= 4 && totalAfter % 4 === 0) {
    extractAndUpdateBusiness(input.businessId, conversationId).catch(err =>
      console.error('[chat] extractAndUpdateBusiness error:', err)
    );
  }

  // Rolling summary: если беседа разрослась — фоном перестраиваем выжимку.
  // Не блокируем HTTP-ответ: фон работает дешёвой моделью, ошибки только логирует.
  if (shouldRebuildSummary(totalAfter, convFull?.summarizedCount ?? 0)) {
    setImmediate(() => {
      void rebuildSummary(conversationId);
    });
  }

  if (!input.stream) {
    return {
      conversationId,
      message: aiResponse,
      aiTier,
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

export async function createConversation(userId: string, businessId: string, title?: string) {
  // Проверяем что бизнес принадлежит пользователю
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
  });
  if (!business) {
    throw new AppError('Бизнес-проект не найден', 404);
  }

  const conversation = await prisma.conversation.create({
    data: {
      businessId,
      title: title || 'Новый чат',
      aiTier: 'PREMIUM',
    },
  });

  return conversation;
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

/**
 * Решает, нужно ли перед ответом ИИ автоматически дёрнуть анализ конкурентов через ФНС.
 * Триггерится либо по ключевым словам пользователя, либо на этапе анализа рынка.
 */
function shouldFetchCompetitors(userMessage: string, businessStatus: string): boolean {
  if (!userMessage) return false;
  if (COMPETITOR_INTENT_PATTERN.test(userMessage)) return true;
  if (businessStatus === 'ANALYSIS' && /рынок|рынка|конкур|анализ/i.test(userMessage)) return true;
  return false;
}

/**
 * Получает данные конкурентов через `competitors.service` (с кэшем ФНС на 7 дней).
 * Возвращает markdown-блок для промпта ИИ + сырые данные для SSE-фрейма в клиент.
 */
async function buildCompetitorsContext(
  userId: string,
  businessId: string,
  hint: string,
  aiTier?: AiTier,
): Promise<{ markdown: string; result: CompetitorAnalysisResult | null }> {
  const FALLBACK_MARKDOWN = [
    '\n\n## Инструкция по конкурентному анализу (ФНС временно недоступен)',
    'Система попыталась запросить данные из ЕГРЮЛ/ЕГРИП, но сервис ФНС сейчас недоступен.',
    'Проведи анализ конкурентов на основе своих знаний о рынке.',
  ].join('\n');

  try {
    const result = await analyzeCompetitorsForBusiness(userId, businessId, { extraHint: hint, aiTier });
    console.log('[chat] competitors result:', result.foundCount, 'found,', result.totalCandidates, 'total');

    if (result.items.length === 0) {
      return { markdown: FALLBACK_MARKDOWN, result: null };
    }

    const lines: string[] = [];
    lines.push('\n\n## РЕАЛЬНЫЕ КОНКУРЕНТЫ ИЗ ЕГРЮЛ/ЕГРИП — СТРОГО ОБЯЗАТЕЛЬНО К ИСПОЛЬЗОВАНИЮ');
    lines.push('Ниже — реальные компании из государственного реестра ФНС РФ.');
    lines.push('КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:');
    lines.push('- Упоминать любые компании, не перечисленные в этом блоке.');
    lines.push('- Выдумывать названия, ИНН, ОГРН, выручку, руководителей.');
    lines.push('- Проводить анализ по "известным" конкурентам из своих знаний.');
    lines.push('Твой анализ должен быть ТОЛЬКО по компаниям из блока ниже.');
    lines.push('Если компании не профильные (неверный ОКВЭД) — отметь это явно, но всё равно анализируй только их.');
    lines.push('');
    lines.push(result.summaryMarkdown);
    return { markdown: lines.join('\n'), result };
  } catch (err) {
    console.warn('[chat] buildCompetitorsContext failed:', err);
    return { markdown: FALLBACK_MARKDOWN, result: null };
  }
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
