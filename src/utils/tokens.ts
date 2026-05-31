/**
 * Лёгкая эвристика для подсчёта токенов без сторонних зависимостей.
 *
 * Точная токенизация требует `tiktoken` (нативные bindings, тяжёлый install).
 * Для нашей задачи — отбор сообщений по бюджету и приблизительная оценка стоимости —
 * точности в ±15% более чем достаточно.
 *
 * Коэффициенты подобраны на смеси русского и английского:
 * - английский: ~1 токен на 4 символа
 * - русский (кириллица в UTF-8): ~1 токен на 2.2 символа (CJK-подобное поведение токенайзера)
 *
 * Используем смешанный коэффициент с приоритетом кириллицы.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cyrillicChars = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const otherChars = text.length - cyrillicChars;
  // Кириллица «тяжелее» в большинстве OpenAI-совместимых токенайзеров.
  return Math.ceil(cyrillicChars / 2.2 + otherChars / 4) + 4; // +4 — оверхед на роль/разделители
}

export interface TokenizableMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Идёт по массиву сообщений С КОНЦА (от свежих к старым) и набирает реплики,
 * пока сумма токенов не превысит `budget`. Возвращает массив в исходном порядке.
 *
 * Используется для recent-buffer: берём свежие сообщения с приоритетом, отбрасываем старые.
 * Гарантирует, что хотя бы одно (последнее) сообщение всегда попадёт в буфер,
 * даже если оно само по себе больше бюджета.
 */
export function selectMessagesByBudget<T extends TokenizableMessage>(
  messages: T[],
  budget: number,
): T[] {
  if (messages.length === 0) return [];
  const picked: T[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content);
    if (picked.length > 0 && used + cost > budget) break;
    picked.unshift(messages[i]);
    used += cost;
  }
  return picked;
}

/**
 * Подрезает огромное сообщение ассистента, оставляя начало и конец.
 * В UI хранится полный текст; в LLM-payload подаём сокращённую версию.
 */
export function clipLongAssistantMessage(content: string, maxTokens = 700): string {
  const estimated = estimateTokens(content);
  if (estimated <= maxTokens) return content;
  // Грубо берём первые ~80% бюджета с начала и ~20% с конца.
  const headChars = Math.floor((maxTokens * 0.8) * 2.2);
  const tailChars = Math.floor((maxTokens * 0.2) * 2.2);
  return (
    content.slice(0, headChars).trimEnd() +
    `\n\n... [сокращено для экономии контекста, оригинал был ~${estimated} токенов] ...\n\n` +
    content.slice(-tailChars).trimStart()
  );
}
