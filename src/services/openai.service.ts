import OpenAI from 'openai';
import { config } from '../config';
import { Response } from 'express';
import { auditRussianBusinessAnswer, formatAuditIssues } from './ai-quality.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Guardrail-инструкции по РФ-контексту включены напрямую в SYSTEM_PROMPT_MAIN,
 * поэтому здесь мы просто возвращаем сообщения без дублирующего prepend.
 * Функция оставлена для обратной совместимости с вызовами в sendChat/streamChat/sendChatJSON.
 */
export function withQualityGuardrails(messages: ChatMessage[]): ChatMessage[] {
  return messages;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Отправить сообщение в LLM и получить полный ответ.
 * model — явно переданная модель (по умолчанию config.openai.model).
 */
export async function sendChat(messages: ChatMessage[], model = config.openai.model): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: withQualityGuardrails(messages),
    temperature: 0.2,
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content || '';
  const audit = auditRussianBusinessAnswer(content);

  if (audit.errorRate === 0) {
    return content;
  }

  const repairResponse = await openai.chat.completions.create({
    model,
    messages: [
      ...withQualityGuardrails(messages),
      { role: 'assistant', content },
      {
        role: 'user',
        content: `Проверь свой предыдущий ответ как наставник для предпринимателя в РФ. Исправь только найденные проблемы и верни полноценный исправленный ответ на русском языке.\n\nНайденные проблемы:\n${formatAuditIssues(audit.issues)}`,
      },
    ],
    temperature: 0.1,
    max_completion_tokens: 4096,
  });

  const repairedContent = repairResponse.choices[0]?.message?.content || content;
  const repairedAudit = auditRussianBusinessAnswer(repairedContent);

  if (repairedAudit.errorRate > 0) {
    console.warn('[sendChat] AI audit error rate:', repairedAudit.errorRate, formatAuditIssues(repairedAudit.issues));
  }

  return repairedAudit.errorRate <= audit.errorRate ? repairedContent : content;
}

/**
 * Стриминг ответа LLM в HTTP Response (Server-Sent Events).
 * model — явно переданная модель (по умолчанию config.openai.model).
 */
export async function streamChat(messages: ChatMessage[], res: Response, model = config.openai.model): Promise<string> {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  let fullContent = '';

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: withQualityGuardrails(messages),
      temperature: 0.2,
      max_completion_tokens: 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Ошибка при генерации ответа';
    console.error('[streamChat] OpenAI error:', errorMsg);
    if (!fullContent) {
      fullContent = `Произошла ошибка: ${errorMsg}`;
      res.write(`data: ${JSON.stringify({ content: fullContent })}\n\n`);
    }
  }

  const audit = auditRussianBusinessAnswer(fullContent);
  if (audit.errorRate > 0) {
    console.warn('[streamChat] AI audit error rate:', audit.errorRate, formatAuditIssues(audit.issues));
  }

  res.write('data: [DONE]\n\n');
  res.end();

  return fullContent;
}

/**
 * Дешёвый служебный вызов (для rolling summary, экстракции и т.п.).
 * Без guardrail/аудита — задача чисто техническая, а не консультационная,
 * и каждый дополнительный вызов аудита здесь означал бы повышение стоимости.
 */
export async function sendChatCheap(messages: ChatMessage[], maxTokens = 800): Promise<string> {
  const response = await openai.chat.completions.create({
    model: config.openai.cheapModel,
    messages,
    temperature: 0.2,
    max_completion_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content || '';
}

/**
 * Генерация структурированного JSON ответа от LLM (для роадмапа и т.п.).
 * model — явно переданная модель (по умолчанию config.openai.model).
 */
export async function sendChatJSON<T>(messages: ChatMessage[], model = config.openai.model): Promise<T> {
  const response = await openai.chat.completions.create({
    model,
    messages: withQualityGuardrails(messages),
    temperature: 0.1,
    max_completion_tokens: 8192,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content) as T;
}
