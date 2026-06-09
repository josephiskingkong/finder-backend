import prisma from '../../config/database';
import { AppError } from '../../utils/errors';
import { sendChatJSON } from '../../services/ai.service';
import { SYSTEM_PROMPT_MAIN } from '../../prompts/system';
import type { ChatMessage } from '../../services/openai.service';

export interface MarketSize {
  value: number;          // числовое значение в рублях
  unit: 'RUB';
  label: string;          // человеко-читаемая строка ("4,2 млрд ₽")
  basis: string;          // на чём основана оценка
  description: string;    // что входит в этот размер
}

export interface MarketSegment {
  name: string;
  share: number;          // 0..100 — доля от SOM в %
  description: string;
  painPoints: string[];
  channels: string[];
}

export interface MonetizationModel {
  name: string;
  description: string;
  pricing: string;        // напр. "5 000–15 000 ₽ / месяц"
  pros: string[];
  cons: string[];
  fit: string;            // для кого подходит
  unitEconomics: string;  // ключевая метрика этой модели
  recommended: boolean;   // главная рекомендуемая модель
}

interface AiResponse {
  tam: MarketSize;
  sam: MarketSize;
  som: MarketSize;
  segments: MarketSegment[];
  monetizationModels: MonetizationModel[];
}

export interface MarketAnalysisDTO {
  businessId: string;
  tam: MarketSize | null;
  sam: MarketSize | null;
  som: MarketSize | null;
  segments: MarketSegment[];
  monetizationModels: MonetizationModel[];
  lastGeneratedAt: Date | null;
}

function parseJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function toDTO(row: any | null, businessId: string): MarketAnalysisDTO {
  if (!row) return {
    businessId,
    tam: null, sam: null, som: null,
    segments: [], monetizationModels: [],
    lastGeneratedAt: null,
  };
  return {
    businessId,
    tam: parseJson<MarketSize>(row.tam),
    sam: parseJson<MarketSize>(row.sam),
    som: parseJson<MarketSize>(row.som),
    segments: parseJson<MarketSegment[]>(row.segments) || [],
    monetizationModels: parseJson<MonetizationModel[]>(row.monetizationModels) || [],
    lastGeneratedAt: row.lastGeneratedAt || null,
  };
}

export async function getMarketAnalysis(userId: string, businessId: string): Promise<MarketAnalysisDTO> {
  const business = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const row = await (prisma as any).marketAnalysis.findUnique({ where: { businessId } });
  return toDTO(row, businessId);
}

export async function generateMarketAnalysis(
  userId: string,
  businessId: string,
  hint?: string,
): Promise<MarketAnalysisDTO> {
  const business = await (prisma as any).business.findFirst({
    where: { id: businessId, userId },
    include: {
      interviewHypotheses: {
        where: { status: { in: ['CONFIRMED', 'PARTIALLY'] } },
        take: 10,
      },
    },
  });
  if (!business) throw new AppError('Бизнес-проект не найден', 404);

  const confirmedHypotheses = business.interviewHypotheses
    .map((h: any) => `- ${h.statement}`)
    .join('\n') || 'нет';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT_MAIN}

## Задача: Анализ рынка для российского стартапа

Оцени российский рынок по правилу TAM/SAM/SOM, выдели сегменты и предложи модели монетизации.
Все цифры — в РУБЛЯХ, для рынка РФ. Если данных мало — давай осторожную оценку и в поле "basis" объясни, на чём она основана.

ОТВЕТ СТРОГО JSON-объект следующей структуры (без markdown):

{
  "tam": {
    "value": <число в рублях, годовой объём>,
    "unit": "RUB",
    "label": "<человеко-читаемо, напр. '12,5 млрд ₽ / год'>",
    "basis": "<откуда взята оценка: открытые данные, рыночные отчёты, расчёт>",
    "description": "<что включает: вся отрасль РФ>"
  },
  "sam": { ... — доступный сегмент, который теоретически можно охватить },
  "som": { ... — реалистично достижимая доля за 1–3 года },
  "segments": [
    {
      "name": "<сегмент>",
      "share": <число 0..100 — доля от SOM в %>,
      "description": "<кто это, что покупают>",
      "painPoints": ["<боль 1>", "<боль 2>", "<боль 3>"],
      "channels": ["<канал 1>", "<канал 2>"]
    }
    // 3–5 сегментов, сумма share ≈ 100
  ],
  "monetizationModels": [
    {
      "name": "<название модели, напр. 'Подписка SaaS'>",
      "description": "<2 предложения, что это и как работает в данном проекте>",
      "pricing": "<вилка цен в рублях, напр. '5 000–15 000 ₽ / мес'>",
      "pros": ["<плюс 1>", "<плюс 2>", "<плюс 3>"],
      "cons": ["<минус 1>", "<минус 2>"],
      "fit": "<кому подходит: сегменты или сценарии>",
      "unitEconomics": "<ключевая метрика: LTV ≈ X ₽, CAC ≈ Y ₽, маржа ≈ Z%>",
      "recommended": <true для одной главной модели, false для остальных>
    }
    // 3–5 моделей, ровно одна с recommended=true
  ]
}

Правила:
- Все суммы — реалистичные для РФ.
- Никаких размытых формулировок типа "очень большой рынок".
- Числа в "value" — это число (без пробелов и валюты), а человекочитаемая строка в "label".
- 3–5 элементов в segments и monetizationModels.
- "share" суммарно ≈ 100.
- Никакого markdown, только JSON.`,
    },
    {
      role: 'user',
      content: `Проанализируй рынок для проекта.

- Название: ${business.title}
- Описание: ${business.description || 'не указано'}
- Отрасль: ${business.industry || 'не указана'}
- Проблема: ${business.problemStatement || 'не указана'}
- Целевая аудитория: ${business.targetAudience || 'не указана'}
- Уникальное предложение: ${business.uniqueValue || 'не указано'}
- Конкуренты: ${business.competitors || 'не указаны'}
- Монетизация (как видит фаундер): ${business.monetizationModel || 'не указана'}
- Размер рынка (как видит фаундер): ${business.marketSize || 'не указан'}

Подтверждённые гипотезы с интервью:
${confirmedHypotheses}
${hint ? `\nДополнительно от пользователя: ${hint}` : ''}`,
    },
  ];

  let ai: AiResponse;
  try {
    ai = await sendChatJSON<AiResponse>(messages);
  } catch (e) {
    throw new AppError('ИИ не смог сгенерировать анализ рынка. Попробуйте ещё раз.', 500);
  }

  const row = await (prisma as any).marketAnalysis.upsert({
    where: { businessId },
    create: {
      businessId,
      tam: JSON.stringify(ai.tam),
      sam: JSON.stringify(ai.sam),
      som: JSON.stringify(ai.som),
      segments: JSON.stringify(ai.segments || []),
      monetizationModels: JSON.stringify(ai.monetizationModels || []),
      lastGeneratedAt: new Date(),
    },
    update: {
      tam: JSON.stringify(ai.tam),
      sam: JSON.stringify(ai.sam),
      som: JSON.stringify(ai.som),
      segments: JSON.stringify(ai.segments || []),
      monetizationModels: JSON.stringify(ai.monetizationModels || []),
      lastGeneratedAt: new Date(),
    },
  });

  return toDTO(row, businessId);
}
