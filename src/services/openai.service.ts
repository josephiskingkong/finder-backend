import OpenAI from 'openai';
import { config } from '../config';
import { Response } from 'express';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Отправить сообщение в LLM и получить полный ответ.
 */
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages,
    temperature: 0.7,
    max_completion_tokens: 4096,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Стриминг ответа LLM в HTTP Response (Server-Sent Events).
 */
export async function streamChat(messages: ChatMessage[], res: Response): Promise<string> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullContent = '';

  try {
    const stream = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.7,
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

  res.write('data: [DONE]\n\n');
  res.end();

  return fullContent;
}

/**
 * Генерация структурированного JSON ответа от LLM (для роадмапа и т.п.).
 */
export async function sendChatJSON<T>(messages: ChatMessage[]): Promise<T> {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages,
    temperature: 0.5,
    max_completion_tokens: 8192,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content) as T;
}
