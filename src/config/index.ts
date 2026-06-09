import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    /// Основная модель — для лёгких диалоговых вопросов в PREMIUM tier.
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    /// Мощная модель — для тяжёлых задач в PREMIUM tier: анализ рынка, юридика, конкуренты, роадмап.
    powerModel: process.env.OPENAI_POWER_MODEL || 'gpt-5.4-mini',
    /// Лёгкая модель — для быстрых диалоговых вопросов в PREMIUM tier (экономия квоты).
    lightModel: process.env.OPENAI_LIGHT_MODEL || 'gpt-5.4-nano',
    /// Дешёвая модель для служебных задач: rolling summary, извлечение бизнес-инфо и т.п.
    /// `gpt-4o-mini` примерно в 30 раз дешевле `gpt-4o` и для конспектирования качества хватает.
    cheapModel: process.env.OPENAI_CHEAP_MODEL || 'gpt-4o-mini',
  },

  gigachat: {
    /// Готовый Basic-токен из ЛК GigaChat (base64(client_id:client_secret)).
    authKey: process.env.GIGACHAT_AUTH_KEY || 'MDE5ZTNhYzAtMGNjMy03YzM4LThkODEtNDJhZjQ5N2YyNTAxOjU5NTAzMWI2LWM0YzEtNGNlYy1hMGI2LTUyNGRmMjEyMTRjMA==',
    clientId: process.env.GIGACHAT_CLIENT_ID || '019e3ac0-0cc3-7c38-8d81-42af497f2501',
    scope: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS',
    model: process.env.GIGACHAT_MODEL || 'GigaChat-2',
    oauthUrl: process.env.GIGACHAT_OAUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    baseUrl: process.env.GIGACHAT_BASE_URL || 'https://gigachat.devices.sberbank.ru/api/v1',
    /// В dev по умолчанию ослабляем TLS-проверку (Sber использует свой корневой сертификат Минцифры).
    /// В проде следует поставить cert от Минцифры и выставить в false.
    insecureTls: (process.env.GIGACHAT_INSECURE_TLS ?? 'true') === 'true',
  },

  fns: {
    apiKey: process.env.FNS_API_KEY || 'c9ae0d8b435e7c7b7b9a3a82772eed4d24760b54',
    baseUrl: process.env.FNS_BASE_URL || 'https://api-fns.ru/api',
    /// TTL кэша карточек ФНС в миллисекундах (по умолчанию — 7 дней).
    cacheTtlMs: parseInt(process.env.FNS_CACHE_TTL_MS || `${7 * 24 * 60 * 60 * 1000}`, 10),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
} as const;
