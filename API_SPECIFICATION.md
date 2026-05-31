# API Specification

| Endpoint | Метод | Назначение | Параметры | Ответ | Ошибки |
|----------|-------|------------|-----------|-------|--------|
| /api/auth/register | POST | Регистрация пользователя | email, password, firstName, lastName | user, accessToken, refreshToken | 400 |
| /api/auth/login | POST | Авторизация | email, password | user, accessToken, refreshToken | 400, 401 |
| /api/auth/refresh | POST | Обновление токена | refreshToken | accessToken, refreshToken | 400, 401 |
| /api/auth/logout | POST | Выход из системы | refreshToken | - | 400 |
| /api/auth/me | GET | Текущий пользователь | - | user | 401 |
| /api/businesses | GET | Список проектов | - | businesses[] | 401 |
| /api/businesses | POST | Создание проекта | title, description, industry, problemStatement, targetAudience, isExistingBusiness | business | 400, 401 |
| /api/businesses/:id | GET | Детали проекта | id (path) | business | 401, 404 |
| /api/businesses/:id | PATCH | Обновление проекта | id (path), title, description, industry, problemStatement, targetAudience, uniqueValue, competitors, monetizationModel, marketSize, hypotheses, interviewResults, mvpDescription, inn, ogrn, legalForm, taxSystem, okvedCodes | business | 400, 401, 404 |
| /api/businesses/:id | DELETE | Удаление проекта | id (path) | - | 401, 404 |
| /api/businesses/:id/competitors/analyze | POST | Анализ конкурентов ИИ | id (path), limit, aiTier | competitorsResult | 400, 401, 404 |
| /api/businesses/profile/entrepreneur-type | PATCH | Тип предпринимателя | type | profile | 400, 401 |
| /api/chat/message | POST | Отправка сообщения ИИ | content, businessId, conversationId, stream, aiTier | message / SSE stream | 400, 401, 429 |
| /api/chat/business/:businessId/conversations | GET | Беседы проекта | businessId (path) | conversations[] | 401, 404 |
| /api/chat/conversations | POST | Создание беседы | businessId, title | conversation | 400, 401 |
| /api/chat/conversations/:conversationId/messages | GET | Сообщения беседы | conversationId (path) | messages[] | 401, 404 |
| /api/chat/conversations/:conversationId | DELETE | Удаление беседы | conversationId (path) | - | 401, 404 |
| /api/roadmap/generate | POST | Генерация роадмапа ИИ | businessId | roadmap | 400, 401, 404 |
| /api/roadmap/business/:businessId | GET | Получение роадмапа | businessId (path) | roadmap | 401, 404 |
| /api/roadmap/steps/:stepId/start | PATCH | Начать шаг | stepId (path) | step | 400, 401, 404 |
| /api/roadmap/steps/:stepId/report | POST | Отчет по шагу | stepId (path), report, success, feedback | step, aiAnalysis, roadmap | 400, 401, 404 |
| /api/fns/search/inn/:inn | GET | Поиск по ИНН | inn (path) | company | 400, 401 |
| /api/fns/search/ogrn/:ogrn | GET | Поиск по ОГРН | ogrn (path) | company | 400, 401 |
| /api/fns/search/name | GET | Поиск по названию | q (query), limit (query) | companies[] | 400, 401 |
| /api/fns/company/:inn | GET | Детали компании | inn (path) | companyDetails | 400, 401 |
| /api/fns/okved/popular | GET | Популярные ОКВЭД | - | okvedCodes[] | 401 |
| /api/files/upload | POST | Загрузка файла | file (multipart) | attachment | 400, 401 |
| /api/files/business/:businessId | GET | Файлы проекта | businessId (path) | attachments[] | 401, 404 |
| /api/files/:id | DELETE | Удаление файла | id (path) | - | 401, 404 |
| /api/ai/models | GET | Доступные ИИ модели | - | tiers, subscription, planLimits | 401 |
| /api/ai/usage | GET | Использование квоты | - | used, limit, remaining, windowHours, resetsAt | 401 |
| /api/admin/stats | GET | Статистика системы | - | stats | 401, 403 |
| /api/admin/plans | GET | Конфигурации планов | - | planConfigs[] | 401, 403 |
| /api/admin/plans/:plan | PATCH | Обновление плана | plan (path), messagesPerWindow, windowHours, label, description | planConfig | 400, 401, 403 |
| /api/admin/users | GET | Список пользователей | search, plan, role, blocked, page, pageSize (query) | users[], pagination | 401, 403 |
| /api/admin/users/:id | GET | Детали пользователя | id (path) | user | 401, 403, 404 |
| /api/admin/users/:id | DELETE | Удаление пользователя | id (path) | - | 401, 403, 404 |
| /api/admin/users/:id/subscription | PATCH | Обновление подписки | id (path), plan, until | user | 400, 401, 403, 404 |
| /api/admin/users/:id/role | PATCH | Изменение роли | id (path), role | user | 400, 401, 403, 404 |
| /api/admin/users/:id/blocked | PATCH | Блокировка пользователя | id (path), blocked | user | 400, 401, 403, 404 |
