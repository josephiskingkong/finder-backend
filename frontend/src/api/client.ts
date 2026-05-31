const BASE = '/api';

/**
 * Кастомная ошибка API с полем `meta` от бэка.
 * Используется, например, для 429 Quota Exceeded — там приходит resetAt, limit, plan.
 */
export class ApiError extends Error {
  status: number;
  meta?: Record<string, any>;
  constructor(message: string, status: number, meta?: Record<string, any>) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch (err) {
    // Сетевая ошибка (сервер не запущен, нет сети) — не чистим токены
    throw new ApiError('Сервер недоступен, попробуйте позже', 503);
  }

  if (res.status === 401) {
    try {
      const refreshed = await tryRefresh();
      if (refreshed) {
        headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
        const retry = await fetch(`${BASE}${path}`, { ...options, headers });
        if (!retry.ok) throw new ApiError('Ошибка запроса', retry.status);
        return retry.json();
      }
    } catch (refreshErr: any) {
      // Network error — сервер недоступен, не выбрасываем из аккаунта
      if (refreshErr?.message === 'NETWORK_ERROR') {
        throw new ApiError('Сервер недоступен, попробуйте позже', 503);
      }
    }
    localStorage.clear();
    window.location.href = '/login';
    throw new ApiError('Сессия истекла', 401);
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Ошибка запроса', res.status, data.meta);
  }

  const json = await res.json();
  return json.data ?? json;
}

export async function tryRefreshToken(): Promise<boolean> {
  return tryRefresh()
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const { data } = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch (err: any) {
    // Любая сетевая ошибка (ECONNREFUSED, timeout, aborted) — сервер не запущен
    // Не чистим токены, просто сообщаем что рефреш не удался из-за сети
    throw new Error('NETWORK_ERROR');
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

// SSE стриминг для чата
export function streamMessage(
  body: { content: string; businessId: string; conversationId?: string; stream: true; aiTier?: 'PLUS' | 'PREMIUM' },
  onChunk: (text: string) => void,
  onDone: (err?: string, meta?: Record<string, any>) => void,
  onCompetitors?: (data: unknown) => void,
) {
  (async () => {
    const doFetch = (tok: string | null) => fetch(`${BASE}/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
    });

    let res: Response;
    try {
      res = await doFetch(localStorage.getItem('accessToken'));
    } catch {
      onDone();
      return;
    }

    // Если access token истёк — пробуем refresh и повторяем запрос
    if (res.status === 401) {
      const ok = await tryRefresh().catch(() => false);
      if (ok) {
        try {
          res = await doFetch(localStorage.getItem('accessToken'));
        } catch {
          onDone();
          return;
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
    }

    if (!res.ok || !res.body) {
      let msg = 'Ошибка запроса';
      let meta: Record<string, any> | undefined;
      try {
        const data = await res.json();
        msg = data.error || msg;
        meta = data.meta;
      } catch {}
      console.error('[streamMessage] HTTP error:', res.status, msg);
      onDone(msg, meta);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6);
            if (payload === '[DONE]') { onDone(); return; }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) onChunk(parsed.content);
              if (parsed.competitors && onCompetitors) onCompetitors(parsed.competitors);
            } catch {}
          }
        }
      }
      onDone();
    } catch (err) {
      console.error('[streamMessage] read error:', err);
      onDone();
    }
  })();
}
