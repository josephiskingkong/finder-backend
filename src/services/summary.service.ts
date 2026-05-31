import prisma from '../config/database';
import { sendChatCheap } from './openai.service';
import { estimateTokens } from '../utils/tokens';

/**
 * Параметры rolling summary.
 *
 * - RECENT_BUFFER_SIZE: сколько последних сообщений ВСЕГДА идут в LLM verbatim
 *   (важно для тона, цитат «как ты сказал выше», свежих фактов).
 * - SUMMARY_TRIGGER_THRESHOLD: при каком общем количестве сообщений в беседе
 *   запускаем первое сжатие. До этого порога беседа короткая, экономия не оправдана.
 * - SUMMARY_REFRESH_EVERY: как часто перестраивать summary после первого построения.
 *   Перестройка делается фоном (не блокирует ответ юзеру).
 */
export const RECENT_BUFFER_SIZE = 8;
export const SUMMARY_TRIGGER_THRESHOLD = 14;
export const SUMMARY_REFRESH_EVERY = 8;

/**
 * Системный промпт для сжатия истории. Намеренно жёсткий — мы хотим компактный
 * фактологический конспект, а не пересказ.
 */
const SUMMARIZER_SYSTEM_PROMPT = `Ты — система памяти ИИ-наставника для российских предпринимателей.
Сожми историю переписки в краткий конспект (300–500 токенов), который ИИ сможет использовать как «память» о прошлых сообщениях.

Жёсткие правила:
- Пиши на русском, в bullet-points.
- Фиксируй только факты, решения, цифры, ИНН/ОГРН, договорённости, открытые вопросы.
- НЕ повторяй системные инструкции и общие советы.
- НЕ пересказывай тон и эмоции — только содержание.
- Если в истории уже есть ранее сделанная выжимка (## Память), сохрани её важные пункты и дополни новой информацией.
- Структура:
  ## Бизнес и контекст
  ## Договорённости и решения
  ## Открытые вопросы / задачи
  ## Важные цифры и факты (ИНН, ОГРН, налоги, ставки, даты, имена контрагентов)`;

/**
 * Перестраивает summary беседы.
 *
 * Алгоритм:
 *  1. Берём все сообщения с createdAt <= (now - RECENT_BUFFER) — кандидаты на сжатие.
 *     Используем индекс по сообщению с offset = total - RECENT_BUFFER_SIZE.
 *  2. Если кандидатов меньше SUMMARY_TRIGGER_THRESHOLD — пропускаем.
 *  3. К старому summary (если есть) добавляем новые «старые» сообщения и шлём в дешёвую модель.
 *  4. Сохраняем результат + cutoff (createdAt последнего ужатого сообщения) + summarizedCount.
 *
 * Идемпотентно: если беседа уже свежо ужата, ничего не делает.
 * Никогда не throws — это фоновая задача, ошибки только логирует.
 */
export async function rebuildSummary(conversationId: string): Promise<void> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, summary: true, summaryUpTo: true, summarizedCount: true },
    });
    if (!conv) return;

    const totalMessages = await prisma.message.count({ where: { conversationId } });
    // Не сжимаем, пока беседа короткая.
    if (totalMessages < SUMMARY_TRIGGER_THRESHOLD) return;

    // Сообщения, которые останутся в recent buffer (не трогаем).
    const recentToKeep = RECENT_BUFFER_SIZE;
    const toSummarizeCount = totalMessages - recentToKeep;
    if (toSummarizeCount <= conv.summarizedCount) {
      // Ничего нового не накопилось — пропускаем.
      return;
    }

    // Берём ВСЕ старые сообщения целиком (до recent buffer). Прошлый summary
    // подмешиваем в промпт, чтобы модель использовала его как опору.
    const oldMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: toSummarizeCount,
      select: { role: true, content: true, createdAt: true },
    });
    if (oldMessages.length === 0) return;

    const lastOld = oldMessages[oldMessages.length - 1];

    const historyText = oldMessages
      .map(m => {
        const speaker = m.role === 'USER' ? 'Пользователь' : m.role === 'ASSISTANT' ? 'ИИ' : 'System';
        return `[${speaker}] ${m.content}`;
      })
      .join('\n\n');

    const userPayload = conv.summary
      ? `## Предыдущая выжимка (память):\n${conv.summary}\n\n## Новые старые сообщения для добавления в память:\n${historyText}`
      : `## Сообщения для сжатия в память:\n${historyText}`;

    const summary = await sendChatCheap(
      [
        { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
      900,
    );

    if (!summary.trim()) return;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        summary: summary.trim(),
        summaryUpTo: lastOld.createdAt,
        summarizedCount: oldMessages.length,
      },
    });

    console.log(
      `[summary] rebuilt for ${conversationId}: ${oldMessages.length} msgs → ~${estimateTokens(summary)} tokens`,
    );
  } catch (err: any) {
    console.error('[summary] rebuildSummary failed:', err?.message || err);
  }
}

/**
 * Решает, нужно ли запустить перестройку summary после нового сообщения.
 * Логика: триггер по threshold для первого сжатия, затем — каждые SUMMARY_REFRESH_EVERY новых.
 */
export function shouldRebuildSummary(totalMessages: number, summarizedCount: number): boolean {
  if (totalMessages < SUMMARY_TRIGGER_THRESHOLD) return false;
  // Сколько новых сообщений накопилось сверх того, что уже в summary + recent buffer.
  const pending = totalMessages - RECENT_BUFFER_SIZE - summarizedCount;
  if (summarizedCount === 0) return true; // первое сжатие, как только перевалили threshold
  return pending >= SUMMARY_REFRESH_EVERY;
}
