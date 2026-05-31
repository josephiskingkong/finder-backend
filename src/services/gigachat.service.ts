import axios, { AxiosError } from 'axios';
import https from 'https';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { auditRussianBusinessAnswer, formatAuditIssues } from './ai-quality.service';
import type { ChatMessage } from './openai.service';
import { withQualityGuardrails } from './openai.service';

/**
 * Клиент Сбер GigaChat.
 *
 * Документация: https://developers.sber.ru/docs/ru/gigachat/api/overview
 *
 * Поток:
 * 1. Получение access_token: POST {oauthUrl} с Basic-авторизацией (config.gigachat.authKey)
 *    и body `scope=GIGACHAT_API_PERS`. Токен живёт ~30 мин, кэшируем в памяти процесса.
 * 2. Запросы к /chat/completions: Bearer access_token, формат OpenAI-совместимый.
 *
 * Замечание про TLS: API Sber обслуживается сертификатом, выпущенным корневым CA Минцифры.
 * Если этот CA не установлен в системе, Node ругнётся на UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 * Поэтому по умолчанию в dev используется `rejectUnauthorized: false`
 * (управляется `GIGACHAT_INSECURE_TLS`). В проде следует установить
 * корневой сертификат Минцифры и выставить переменную в `false`.
 */

const httpsAgent = new https.Agent({ rejectUnauthorized: !config.gigachat.insecureTls });

const oauthClient = axios.create({ timeout: 15000, httpsAgent });
const apiClient = axios.create({
  baseURL: config.gigachat.baseUrl,
  timeout: 60000,
  httpsAgent,
});

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.value;
  }

  if (!config.gigachat.authKey) {
    throw new AppError('GigaChat не настроен (GIGACHAT_AUTH_KEY)', 500);
  }

  try {
    const response = await oauthClient.post(
      config.gigachat.oauthUrl,
      new URLSearchParams({ scope: config.gigachat.scope }).toString(),
      {
        headers: {
          Authorization: `Basic ${config.gigachat.authKey}`,
          RqUID: randomUUID(),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
    );

    const accessToken = response.data?.access_token;
    const expiresAt = Number(response.data?.expires_at) || now + 25 * 60 * 1000;
    if (!accessToken) {
      throw new AppError('GigaChat OAuth не вернул access_token', 502);
    }

    cachedToken = { value: accessToken, expiresAt };
    return accessToken;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const ax = error as AxiosError;
    const status = ax.response?.status;
    if (status === 401 || status === 403) {
      throw new AppError('GigaChat: ключ авторизации недействителен', 502);
    }
    throw new AppError(`Ошибка авторизации GigaChat${status ? ` (HTTP ${status})` : ''}`, 502);
  }
}

interface GigaChatCompletion {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
}

async function postChat(body: Record<string, unknown>, stream: boolean) {
  const token = await getAccessToken();

  try {
    return await apiClient.post('/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      responseType: stream ? 'stream' : 'json',
    });
  } catch (error) {
    const ax = error as AxiosError;
    const status = ax.response?.status;
    if (status === 401) {
      // Токен мог протухнуть — сбросим и попробуем ровно один раз.
      cachedToken = null;
      const fresh = await getAccessToken();
      return apiClient.post('/chat/completions', body, {
        headers: {
          Authorization: `Bearer ${fresh}`,
          'Content-Type': 'application/json',
          Accept: stream ? 'text/event-stream' : 'application/json',
        },
        responseType: stream ? 'stream' : 'json',
      });
    }
    let detail = '';
    if (ax.response?.data) {
      const data = ax.response.data;
      // Пытаемся извлечь человекочитаемую ошибку из структуры GigaChat
      const msg = (data as any)?.error?.message
        ?? (data as any)?.error
        ?? (data as any)?.message
        ?? (data as any)?.detail
        ?? (data as any)?.description;
      if (msg && typeof msg === 'string') {
        detail = msg.slice(0, 400);
      } else {
        try {
          detail = JSON.stringify(data).slice(0, 400);
        } catch {
          detail = Object.prototype.toString.call(data).slice(0, 400);
        }
      }
    }
    console.error('[gigachat] /chat/completions failed', status, detail, ax.response?.data);
    throw new AppError(`Ошибка GigaChat${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}`, 502);
  }
}

/**
 * GigaChat принимает не больше одного `system`-сообщения, и оно должно стоять первым.
 * Склеиваем все системные сообщения в одно, оставляя порядок остальных без изменений.
 */
function normalizeForGigaChat(messages: ChatMessage[]): ChatMessage[] {
  const systemTexts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      const text = (m.content || '').trim();
      if (text) systemTexts.push(text);
    } else {
      rest.push(m);
    }
  }
  if (systemTexts.length === 0) return rest;
  return [{ role: 'system', content: systemTexts.join('\n\n') }, ...rest];
}

async function rawSendChat(messages: ChatMessage[], maxTokens = 2048): Promise<string> {
  const response = await postChat(
    {
      model: config.gigachat.model,
      messages: normalizeForGigaChat(messages),
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
    },
    false,
  );

  const data = response.data as GigaChatCompletion;
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Отправить сообщения в GigaChat и получить ответ без audit/repair.
 * Используется для JSON-задач, где самокоррекция только ломает структуру.
 */
export async function sendChatRaw(messages: ChatMessage[], maxTokens = 4096): Promise<string> {
  return rawSendChat(messages, maxTokens);
}

export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const guarded = withQualityGuardrails(messages);
  const content = await rawSendChat(guarded);
  const audit = auditRussianBusinessAnswer(content);
  if (audit.errorRate === 0) return content;

  // Самокоррекция в рамках того же провайдера: даём GigaChat шанс переписать ответ.
  const repaired = await rawSendChat([
    ...guarded,
    { role: 'assistant', content },
    {
      role: 'user',
      content: `Проверь свой предыдущий ответ как наставник для предпринимателя в РФ. Исправь только найденные проблемы и верни полноценный исправленный ответ на русском языке.\n\nНайденные проблемы:\n${formatAuditIssues(audit.issues)}`,
    },
  ]).catch(() => content);

  const repairedAudit = auditRussianBusinessAnswer(repaired);
  if (repairedAudit.errorRate > 0) {
    console.warn('[gigachat.sendChat] AI audit error rate:', repairedAudit.errorRate, formatAuditIssues(repairedAudit.issues));
  }
  return repairedAudit.errorRate <= audit.errorRate ? repaired : content;
}

export async function streamChat(messages: ChatMessage[], res: Response): Promise<string> {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  let fullContent = '';

  try {
    const response = await postChat(
      {
        model: config.gigachat.model,
        messages: normalizeForGigaChat(withQualityGuardrails(messages)),
        temperature: 0.2,
        max_tokens: 2048,
        stream: true,
      },
      true,
    );

    const stream = response.data as NodeJS.ReadableStream;
    let buffer = '';

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        // SSE-кадры разделены пустой строкой.
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const frame = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          separator = buffer.indexOf('\n\n');

          for (const line of frame.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload) as GigaChatCompletion;
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
              }
            } catch {
              // ignore malformed SSE chunks
            }
          }
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', err => reject(err));
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'Ошибка при генерации ответа GigaChat';
    console.error('[gigachat.streamChat] error:', errorMsg);
    if (!fullContent) {
      fullContent = `Произошла ошибка: ${errorMsg}`;
      res.write(`data: ${JSON.stringify({ content: fullContent })}\n\n`);
    }
  }

  const audit = auditRussianBusinessAnswer(fullContent);
  if (audit.errorRate > 0) {
    console.warn('[gigachat.streamChat] AI audit error rate:', audit.errorRate, formatAuditIssues(audit.issues));
  }

  res.write('data: [DONE]\n\n');
  res.end();
  return fullContent;
}
