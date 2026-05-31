import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { sendChatJSON } from '../../services/ai.service';
import { SYSTEM_PROMPT_MAIN } from '../../prompts/system';
import type { ChatMessage } from '../../services/openai.service';

interface CanvasData {
  problem?: string;
  segments?: string;
  valueProposition?: string;
  solution?: string;
  channels?: string;
  market?: string;
  metrics?: string;
  costStructure?: string;
  revenueStructure?: string;
  unitEconomics?: string;
  unfairAdvantage?: string;
}

interface CanvasAIResponse {
  problem: string;
  segments: string;
  valueProposition: string;
  solution: string;
  channels: string;
  market: string;
  metrics: string;
  costStructure: string;
  revenueStructure: string;
  unitEconomics: string;
  unfairAdvantage: string;
}

/**
 * Получить или создать канвас бизнеса
 */
export async function getCanvas(userId: string, businessId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
  });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const canvas = await (prisma as any).businessCanvas.findUnique({
    where: { businessId },
  });
  return canvas;
}

/**
 * Обновить поля канваса вручную
 */
export async function updateCanvas(userId: string, businessId: string, data: CanvasData) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
  });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const canvas = await (prisma as any).businessCanvas.upsert({
    where: { businessId },
    create: { businessId, ...data, generationSource: 'manual' },
    update: { ...data, generationSource: 'manual' },
  });
  return canvas;
}

/**
 * Сгенерировать канвас ИИ на основе данных бизнеса
 */
export async function generateCanvas(userId: string, businessId: string, source: string = 'manual') {
  const business = await (prisma as any).business.findFirst({
    where: { id: businessId, userId },
    include: {
      roadmap: { include: { steps: { orderBy: { order: 'asc' } } } },
      chats: {
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 30 } },
        orderBy: { createdAt: 'desc' },
        take: 2,
      },
      interviewHypotheses: {
        where: { status: { in: ['CONFIRMED', 'PARTIALLY'] } },
        take: 10,
      },
    },
  });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const completedSteps = business.roadmap?.steps
    .filter((s: any) => s.status === 'COMPLETED')
    .map((s: any) => s.phase)
    .join(', ') || 'нет';

  const confirmedHypotheses = business.interviewHypotheses
    .map((h: any) => `- ${h.statement}`)
    .join('\n') || 'нет';

  const recentMessages = business.chats
    .flatMap((c: any) => c.messages)
    .map((m: any) => `${m.role === 'USER' ? 'Пользователь' : 'ИИ'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 3000) || 'нет';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT_MAIN}

## Задача: Генерация Карты Бизнес-Модели (адаптация Lean Canvas + Business Model Map)

На основе всей доступной информации о бизнесе заполни 11 блоков карты бизнес-модели.

ПРАВИЛА ФОРМАТИРОВАНИЯ (строго):
- Каждый блок — ровно 3–4 пункта, разделённые переносом строки \\n
- Каждый пункт — одно конкретное утверждение, без нумерации, без маркеров (не писать "1.", "2)", "-", "•")
- Никаких вводных слов типа "Ключевые боли:", "Описание:"
- Лаконично и конкретно, без воды

Пример правильного формата для поля "problem":
"Клиенты тратят часы на ручной учёт в Excel\\nНет интеграции между CRM и бухгалтерией\\nОшибки в отчётах из-за ручного ввода данных"

Ответ СТРОГО в формате JSON-объекта:
{
  "problem": "...",
  "segments": "...",
  "valueProposition": "...",
  "solution": "...",
  "channels": "...",
  "market": "...",
  "metrics": "...",
  "costStructure": "...",
  "revenueStructure": "...",
  "unitEconomics": "...",
  "unfairAdvantage": "..."
}

ТОЛЬКО JSON, без markdown, без нумерации в значениях.`,
    },
    {
      role: 'user',
      content: `Сгенерируй карту бизнес-модели для проекта.

Данные о бизнесе:
- Название: ${business.title}
- Описание: ${business.description || 'не указано'}
- Отрасль: ${(business as any).industry || 'не указана'}
- Проблема: ${(business as any).problemStatement || 'не указана'}
- Целевая аудитория: ${(business as any).targetAudience || 'не указана'}
- Уникальное предложение: ${(business as any).uniqueValue || 'не указано'}
- Конкуренты: ${(business as any).competitors || 'не указаны'}
- Монетизация: ${(business as any).monetizationModel || 'не указана'}
- Размер рынка: ${(business as any).marketSize || 'не указан'}

Завершённые этапы роадмапа: ${completedSteps}

Подтверждённые гипотезы из интервью:
${confirmedHypotheses}

Последние обсуждения с наставником:
${recentMessages}`,
    },
  ];

  let canvasData: CanvasAIResponse;
  try {
    canvasData = await sendChatJSON<CanvasAIResponse>(messages);
  } catch (e) {
    throw new AppError('ИИ не смог сгенерировать канвас. Попробуйте ещё раз.', 500);
  }

  const canvas = await (prisma as any).businessCanvas.upsert({
    where: { businessId },
    create: {
      businessId,
      ...canvasData,
      lastGeneratedAt: new Date(),
      generationSource: source,
    },
    update: {
      ...canvasData,
      lastGeneratedAt: new Date(),
      generationSource: source,
    },
  });

  return canvas;
}
