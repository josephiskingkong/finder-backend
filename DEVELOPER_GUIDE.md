# Founder — Developer Guide

Полная документация для разработчиков и системных администраторов.

---

## Содержание

1. [Архитектура системы](#архитектура-системы)
2. [Требования и зависимости](#требования-и-зависимости)
3. [Инструкция по развертыванию](#инструкция-по-развертыванию)
4. [Структура проекта](#структура-проекта)
5. [Окружения и конфигурация](#окружения-и-конфигурация)
6. [База данных и миграции](#база-данных-и-миграции)
7. [API и интеграции](#api-и-интеграции)
8. [Тестирование](#тестирование)
9. [Администрирование](#администрирование)
10. [Безопасность](#безопасность)
11. [Устранение неполадок](#устранение-неполадок)

---

## Архитектура системы

### Общая схема

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Клиент (React + Vite)                       │
│                    React 19.2.4 + React Router 7.13.1                    │
│                         Lucide Icons + Markdown                         │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTPS / SSE
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API Server (Node.js)                          │
│  Express 5.2.1 + TypeScript 5.9.3 + Helmet + CORS + Rate Limiting      │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │   Auth   │ │ Business │ │   Chat   │ │ Roadmap  │ │ Interview│ │   FNS    │
│  │  JWT     │ │   CRUD   │ │   SSE    │ │   ИИ     │ │Гипотезы  │ │  API     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
│       │            │            │            │            │             │
│       └────────────┴────────────┴────────────┴────────────┘             │
│                         Prisma ORM 6.19.2                                │
│                    PostgreSQL 14+ / 15 / 16                               │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │ Qwen API     │  │ GigaChat API │  │  ФНС API     │                    │
│  │ Qwen-3.5     │  │ Сбер         │  │  api-fns.ru  │                    │
│  │              │  │ GigaChat-2   │  │              │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Модульная архитектура (Feature-based)

```
src/
├── modules/              # Feature-модули
│   ├── auth/            # Аутентификация JWT
│   ├── business/        # Бизнес-проекты
│   ├── chat/            # Чат с ИИ (SSE streaming)
│   ├── roadmap/         # Роадмап шаги
│   ├── interview/       # Интервью и гипотезы
│   ├── fns/             # Интеграция ФНС
│   ├── files/           # Загрузка файлов
│   ├── ai/              # AI tiers и лимиты
│   └── admin/           # Админ-панель
├── services/            # Внешние интеграции
├── middleware/          # Express middleware
├── utils/               # Хелперы
└── config/              # Конфигурация
```

---

## Требования и зависимости

### Системные требования

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| Node.js | 18.x LTS | 20.x LTS |
| PostgreSQL | 14.x | 15.x или 16.x |
| RAM | 2 GB | 4 GB |
| CPU | 2 cores | 4 cores |
| Disk | 10 GB SSD | 20 GB SSD |

### Версии ключевых зависимостей

#### Backend (`package.json`)

```json
{
  "dependencies": {
    "@prisma/client": "^6.19.2",
    "axios": "^1.13.6",
    "bcryptjs": "^3.0.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "express-rate-limit": "^8.3.1",
    "helmet": "^8.1.0",
    "jsonwebtoken": "^9.0.3",
    "multer": "^2.1.1",
    "openai": "^6.32.0",
    "prisma": "^6.19.2",
    "uuid": "^13.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/*": "совместимые версии",
    "nodemon": "^3.1.14",
    "ts-node": "^10.9.2",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

#### Frontend (`frontend/package.json`)

```json
{
  "dependencies": {
    "lucide-react": "^0.577.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^7.13.1",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^5.9.3",
    "vite": "^8.0.1"
  }
}
```

### Внешние сервисы и API ключи

| Сервис | URL | Ключ | Назначение |
|--------|-----|------|------------|
| OpenAI | https://api.openai.com | `OPENAI_API_KEY` | AI чат (PREMIUM tier) |
| GigaChat | https://gigachat.devices.sberbank.ru | `GIGACHAT_AUTH_KEY` | AI чат (PLUS tier) |
| ФНС | https://api-fns.ru | `FNS_API_KEY` | Данные о компаниях |

---

## Инструкция по развертыванию

### 1. Подготовка окружения

```bash
# Проверка Node.js
node -v  # должен быть >= 18.0.0

# Проверка PostgreSQL
psql --version  # должен быть >= 14

# Клонирование репозитория
git clone <repo-url>
cd finder-backend
```

### 2. База данных PostgreSQL

```bash
# Создание базы данных
sudo -u postgres psql -c "CREATE DATABASE finder_db;"
sudo -u postgres psql -c "CREATE USER finder_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE finder_db TO finder_user;"

# Для продакшена - ограничение прав
sudo -u postgres psql -c "REVOKE CREATE ON SCHEMA public FROM PUBLIC;"
sudo -u postgres psql finder_db -c "GRANT CREATE ON SCHEMA public TO finder_user;"
```

### 3. Конфигурация

```bash
# Копирование шаблона конфигурации
cp .env.example .env

# Редактирование .env (см. секцию "Окружения и конфигурация")
nano .env
```

### 4. Установка зависимостей

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 5. Миграции базы данных

```bash
# Генерация Prisma клиента
npm run db:generate

# Применение миграций (dev - создаёт миграционные файлы)
npm run db:migrate

# Или push для продакшена (без создания файлов миграций)
npm run db:push
```

### 6. Инициализация планов подписок

```bash
# Создание записей планов в БД (один раз после миграций)
# Выполнить в Prisma Studio или через SQL:
npx prisma studio
# Или SQL:
psql finder_db -c "
INSERT INTO plan_configs (plan, messages_per_window, window_hours, label, description)
VALUES 
  ('FREE', 5, 24, 'Бесплатный', 'Базовый доступ'),
  ('PLUS', 20, 6, 'Плюс', 'Доступ к GigaChat'),
  ('PREMIUM', 100, 6, 'Премиум', 'Полный доступ к OpenAI')
ON CONFLICT (plan) DO NOTHING;
"
```

### 7. Создание первого администратора

```bash
# Регистрация пользователя через API или Prisma Studio
# Затем обновление роли:
npx prisma studio
# Найти пользователя, изменить role на ADMIN
```

### 8. Запуск

```bash
# Development режим (с hot-reload)
npm run dev

# Или отдельно
npm run dev       # backend на :3000
cd frontend && npm run dev  # frontend на :5173

# Production режим
npm run build
npm start
```

### 9. Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/api/health

# Должен вернуть:
# {"status":"ok","timestamp":"2025-..."}
```

---

## Структура проекта

```
finder-backend/
├── prisma/
│   ├── schema.prisma          # Модели данных Prisma
│   └── migrations/            # Миграционные файлы
├── src/
│   ├── config/
│   │   ├── index.ts           # Конфигурация окружения
│   │   └── database.ts        # Prisma client instance
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification
│   │   └── admin.ts           # Admin role check
│   ├── modules/
│   │   ├── admin/             # Admin API
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.routes.ts
│   │   │   └── admin.service.ts
│   │   ├── ai/                # AI tiers & limits
│   │   ├── auth/              # Authentication
│   │   ├── business/          # Business projects
│   │   ├── chat/              # Chat with AI
│   │   ├── files/             # File uploads
│   │   ├── fns/               # FNS API integration
│   │   └── roadmap/           # Roadmap generation
│   ├── services/
│   │   ├── ai.service.ts      # AI service factory
│   │   ├── ai-quality.service.ts  # Quality checks
│   │   ├── gigachat.service.ts      # GigaChat integration
│   │   ├── openai.service.ts        # OpenAI integration
│   │   ├── subscription.service.ts  # Subscriptions & limits
│   │   └── summary.service.ts       # Chat summarization
│   ├── utils/
│   │   ├── asyncHandler.ts    # Async error wrapper
│   │   ├── errors.ts          # Error classes
│   │   └── response.ts        # Response formatting
│   └── index.ts               # Entry point
├── uploads/                   # File storage
├── .env                       # Environment variables
├── .env.example               # Template
├── package.json
├── tsconfig.json
└── frontend/                   # React frontend
    ├── src/
    ├── public/
    └── package.json
```

---

## Окружения и конфигурация

### Переменные окружения (.env)

#### Обязательные

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/finder_db` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-super-secret-key-change...` |
| `JWT_REFRESH_SECRET` | Refresh token secret | `your-refresh-secret-key...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |

#### Опциональные (есть defaults)

| Переменная | Default | Описание |
|------------|---------|----------|
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment mode |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token TTL |
| `OPENAI_MODEL` | `qwen-3.5-flash` | Default model |
| `OPENAI_POWER_MODEL` | `qwen-3.5-plus` | Heavy tasks model |
| `OPENAI_LIGHT_MODEL` | `qwen-3.5-flash` | Fast/cheap model |
| `OPENAI_CHEAP_MODEL` | `qwen-3.5-flash` | Summarization |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL |
| `UPLOAD_DIR` | `./uploads` | File storage path |
| `MAX_FILE_SIZE` | `10485760` | Max file size (bytes) |

#### GigaChat (для PLUS tier)

| Переменная | Default | Описание |
|------------|---------|----------|
| `GIGACHAT_AUTH_KEY` | (dev key) | Basic auth token |
| `GIGACHAT_CLIENT_ID` | (dev id) | Client ID |
| `GIGACHAT_SCOPE` | `GIGACHAT_API_PERS` | OAuth scope |
| `GIGACHAT_MODEL` | `GigaChat-2` | Model name |
| `GIGACHAT_INSECURE_TLS` | `true` | Disable TLS check (dev only!) |

### Конфигурация TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"],
      "@config/*": ["config/*"],
      "@modules/*": ["modules/*"]
    }
  }
}
```

---

## База данных и миграции

### Схема данных (Prisma)

Основные сущности:

| Модель | Назначение |
|--------|------------|
| `User` | Пользователи с JWT аутентификацией |
| `RefreshToken` | Refresh токены для сессий |
| `EntrepreneurProfile` | Профиль предпринимателя |
| `Business` | Бизнес-проекты |
| `Roadmap` | Роадмапы проектов |
| `RoadmapStep` | Шаги роадмапа (9 фаз) |
| `Conversation` | Чат-сессии |
| `Message` | Сообщения в чате |
| `Attachment` | Загруженные файлы |
| `PlanConfig` | Конфигурация тарифов |
| `FnsCompanyCache` | Кэш данных ФНС |

### Команды миграций

```bash
# Создать миграцию после изменения schema.prisma
npm run db:migrate

# Применить миграции в продакшене
npx prisma migrate deploy

# Сбросить базу (осторожно!)
npx prisma migrate reset

# Открыть Prisma Studio (GUI)
npm run db:studio

# Генерация клиента (после изменения схемы)
npm run db:generate
```

### Фазы роадмапа (RoadmapPhase)

```typescript
enum RoadmapPhase {
  PROBLEMATIZATION   // Проблематизация
  PRODUCT_STUDY      // Изучение продукта
  MARKET_ANALYSIS    // Анализ рынка
  MONETIZATION       // Модель монетизации
  USER_INTERVIEWS    // Пользовательские интервью
  REPEAT_CUSTDEV     // Повторный CustDev
  REGISTRATION       // Регистрация бизнеса
  ACCOUNTING         // Бухгалтерия и налоги
}
```

### Модуль Interview / Гипотезы

Отдельная система для управления гипотезами и проведения интервью:

| Модель | Назначение |
|--------|------------|
| `Hypothesis` | Гипотеза для проверки (statement, category, status) |
| `InterviewQuestion` | Вопросы для проверки гипотезы |
| `InterviewFinding` | Результаты конкретного интервью |

**Статусы гипотез:**
```
PENDING → CONFIRMED (после 3+ подтверждений)
      → REJECTED (после 3+ опровержений)
      → PARTIALLY (смешанные результаты)
```

**Категории гипотез:**
- `problem` — Проблема реальна
- `solution` — Решение подходит
- `value` — Готовы платить
- `price` — Цена приемлема
- `channel` — Каналы привлечения
- `other` — Другое

**API Interview:**
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/interview/hypotheses` | Создать гипотезу |
| POST | `/api/interview/hypotheses/generate` | Сгенерировать ИИ |
| GET | `/api/interview/business/:id/hypotheses` | Список гипотез |
| PATCH | `/api/interview/hypotheses/:id` | Обновить гипотезу |
| POST | `/api/interview/hypotheses/:id/findings` | Записать результат интервью |

### Статусы шагов (StepStatus)

```
LOCKED → AVAILABLE → IN_PROGRESS → COMPLETED
                    ↘ FAILED
                    ↘ SKIPPED
```

---

## API и интеграции

### Внешние API

#### OpenAI API

- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Модели**: qwen-3.5-flash, qwen-3.5-plus
- **Использование**: AI чат, генерация роадмапов, анализ конкурентов
- **Ограничения**: Rate limits по документации OpenAI

#### GigaChat API (Сбер)

- **OAuth**: `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`
- **API**: `https://gigachat.devices.sberbank.ru/api/v1`
- **Модель**: GigaChat-2
- **Особенности**: Требует сертификат Минцифры в продакшене

#### ФНС API

- **Endpoint**: `https://api-fns.ru/api`
- **Методы**: Поиск по ИНН, ОГРН, названию
- **Кэширование**: 7 дней в БД

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/*` | 100 | 15 минут |
| `/api/chat/*` | 20 | 1 минута |

---

## Тестирование

### Структура тестов (рекомендуется создать)

```
__tests__/
├── unit/
│   ├── services/
│   ├── utils/
│   └── validation/
├── integration/
│   ├── auth.test.ts
│   ├── business.test.ts
│   └── chat.test.ts
└── e2e/
    └── full-flow.test.ts
```

### Установка тестовых зависимостей

```bash
npm install --save-dev jest @types/jest supertest @types/supertest
```

### Пример unit-теста (utils/validation)

```typescript
// __tests__/unit/validation/auth.test.ts
import { registerSchema, loginSchema } from '../../../src/modules/auth/auth.validation';

describe('Auth Validation', () => {
  it('should validate correct register data', () => {
    const data = {
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test'
    };
    expect(() => registerSchema.parse(data)).not.toThrow();
  });

  it('should reject invalid email', () => {
    const data = { email: 'invalid', password: 'password123' };
    expect(() => registerSchema.parse(data)).toThrow();
  });

  it('should reject short password', () => {
    const data = { email: 'test@example.com', password: '123' };
    expect(() => registerSchema.parse(data)).toThrow();
  });
});
```

### Пример integration-теста (API)

```typescript
// __tests__/integration/auth.test.ts
import request from 'supertest';
import { app } from '../../src/index';

describe('Auth API', () => {
  it('POST /api/auth/register - should create user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('POST /api/auth/login - should authenticate', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });
});
```

### Запуск тестов

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Администрирование

### Создание администратора

```bash
# Через Prisma Studio
npx prisma studio
# Найти пользователя, установить role = ADMIN
```

### API администратора

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/admin/stats` | Статистика системы |
| GET | `/api/admin/users` | Список пользователей |
| GET | `/api/admin/users/:id` | Детали пользователя |
| PATCH | `/api/admin/users/:id/subscription` | Изменить подписку |
| PATCH | `/api/admin/users/:id/role` | Изменить роль |
| PATCH | `/api/admin/users/:id/blocked` | Блокировка |
| DELETE | `/api/admin/users/:id` | Удалить пользователя |
| GET | `/api/admin/plans` | Конфигурации планов |
| PATCH | `/api/admin/plans/:plan` | Обновить план |

### Управление планами подписки

```bash
# Получить текущие настройки
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/admin/plans

# Обновить лимиты FREE плана
curl -X PATCH \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messagesPerWindow": 10, "windowHours": 24}' \
  http://localhost:3000/api/admin/plans/FREE
```

### Мониторинг и логи

```bash
# PM2 (рекомендуется для продакшена)
npm install -g pm2
pm2 start dist/index.js --name finder-api

# Логи
pm2 logs finder-api

# Мониторинг
pm2 monit
```

### Резервное копирование

```bash
# Бэкап базы данных
pg_dump finder_db > backup_$(date +%Y%m%d).sql

# Бэкап загруженных файлов
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz ./uploads

# Автоматический бэкап через cron (ежедневно в 3:00)
0 3 * * * pg_dump finder_db > /backups/finder_$(date +\%Y\%m\%d).sql
```

---

## Безопасность

### JWT Токены

- Access token: 15 минут
- Refresh token: 7 дней
- Алгоритм: HS256
- Хранение: HttpOnly cookies (рекомендуется) или localStorage

### Заголовки безопасности (Helmet)

```javascript
// Устанавливает:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY
// - X-XSS-Protection: 1; mode=block
// - Strict-Transport-Security (в production)
```

### CORS

```javascript
// Разрешённые origins
const allowedOrigins = [
  'http://localhost:5173',  // Dev frontend
  'https://yourdomain.com'   // Production
];
```

### Валидация входных данных

Все входные данные валидируются через Zod:
- Email формат
- Пароль минимум 8 символов
- UUID формат для ID
- Размеры строк (max 2000 для сообщений)

### Загрузка файлов

- Максимальный размер: 10 MB (конфигурируется)
- Хранение: файловая система (рекомендуется S3 для продакшена)
- Проверка MIME-type
- Уникальные имена файлов (UUID)

### Рекомендации по production

1. **HTTPS**: Обязательно используйте SSL/TLS
2. **Secrets**: Используйте менеджер секретов (AWS Secrets Manager, HashiCorp Vault)
3. **Database**: Отдельный пользователь БД с минимальными правами
4. **Rate limiting**: Настройте более строгие лимиты
5. **Logging**: Используйте structured logging (Winston/Pino)
6. **Monitoring**: Настройте алерты на ошибки

---

## Устранение неполадок

### Проблемы с запуском

| Проблема | Решение |
|----------|---------|
| `Error: Cannot find module '@prisma/client'` | `npm run db:generate` |
| `Database connection failed` | Проверить DATABASE_URL в .env |
| `PORT already in use` | `lsof -ti:3000 \| xargs kill -9` |
| `JWT_SECRET not set` | Заполнить .env |

### Проблемы с ИИ

| Проблема | Решение |
|----------|---------|
| OpenAI timeout | Проверить OPENAI_API_KEY |
| GigaChat SSL error | `GIGACHAT_INSECURE_TLS=true` (dev only) |
| 429 Too Many Requests | Проверить лимиты подписки в БД |

### Проблемы с базой данных

```bash
# Сбросить Prisma клиент
rm -rf node_modules/.prisma
npm run db:generate

# Просмотр текущих миграций
npx prisma migrate status

# Фикс "migrate dev" в продакшене
# Используйте: npx prisma migrate deploy
```

### Дебаг API

```bash
# Проверка health endpoint
curl http://localhost:3000/api/health

# Проверка с токеном
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/auth/me

# Логирование запросов
NODE_ENV=development DEBUG=* npm run dev
```

### Общие ошибки

| Код | Описание | Решение |
|-----|----------|---------|
| 400 | Bad Request | Проверить тело запроса (Zod validation) |
| 401 | Unauthorized | Токен истёк или невалиден |
| 403 | Forbidden | Нет прав (требуется ADMIN) |
| 404 | Not Found | Ресурс не найден |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Проверить логи сервера |

---

## Лицензия

ISC License © Founder Team
