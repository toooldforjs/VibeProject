# VibeProject

Приложение для аутентификации пользователей с использованием PostgreSQL в контейнере (через Podman).

## Требования

- Node.js 18+
- Podman (или Podman Desktop) с поддержкой `podman compose`
- npm или yarn

## Установка и запуск

### Быстрый старт (запуск всех сервисов одной командой)

**Важно:** Перед запуском убедитесь, что Podman Desktop запущен и работает.

```bash
npm install
npm run dev:all
```

Эта команда автоматически:
- Запустит базу данных PostgreSQL в Podman
- Запустит backend сервер на `http://localhost:3001`
- Запустит frontend на `http://localhost:5173`

**Если возникает ошибка "could not find a matching machine":**
1. Запустите Podman Desktop из меню Пуск
2. Дождитесь полной загрузки (иконка в системном трее должна быть активной)
3. Попробуйте снова выполнить `npm run dev:all`

### Ручной запуск (пошагово)

### 1. Запуск базы данных (через Podman)

В корне проекта (`VibeProject`) выполните:

```bash
podman compose up -d
```

Если у вас только `podman` без плагина compose, можно использовать совместимость с Docker:

```bash
podman-compose up -d
```

Это запустит PostgreSQL в контейнере Podman на порту 5432.

### 2. Установка зависимостей backend

```bash
cd server
npm install
```

### 3. Запуск backend сервера

```bash
cd server
npm run dev
```

Backend будет доступен на `http://localhost:3001`

### 4. Установка зависимостей frontend

В корневой директории проекта:

```bash
npm install
```

### 5. Запуск frontend

```bash
npm run dev
```

Frontend будет доступен на `http://localhost:5173`

### 6. Дополнительные npm команды

- `npm run dev:all` - запуск всех сервисов (БД + frontend + backend)
- `npm run dev:db` - только база данных
- `npm run start` - frontend и backend (без БД)
- `npm run dev:backend` - только backend
- `npm run dev` - только frontend

## Структура проекта

```
VibeProject/
├── server/              # Backend API
│   ├── db/             # База данных
│   ├── routes/         # API маршруты
│   └── server.js       # Главный файл сервера
├── src/                # Frontend React приложение
│   ├── contexts/       # React контексты
│   └── pages/          # Страницы приложения
└── docker-compose.yml  # Конфигурация Docker
```

## API Endpoints

### POST /api/auth/register
Регистрация нового пользователя

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### POST /api/auth/login
Вход пользователя

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

## База данных

PostgreSQL запускается в контейнере Podman на основе `docker-compose.yml` (Podman понимает этот формат).
Данные сохраняются в volume `postgres_data`, который создаётся Podman автоматически.

**Параметры подключения:**
- Host: localhost
- Port: 5432
- User: vibe_user
- Password: vibe_password
- Database: vibe_db

Если вы меняете порт/пользователя/пароль в `docker-compose.yml`, не забудьте обновить файл `server/.env`.

## Шифрование настроек GigaChat

Ключ GigaChat и параметры (scope, model, timeout) сохраняются в БД в зашифрованном виде. Для работы шифрования в `server/.env` задайте:

```env
ENCRYPTION_KEY=ваш-секретный-ключ-минимум-16-символов
```

Без `ENCRYPTION_KEY` сохранение настроек GigaChat в Настройках вернёт ошибку.

## Переменные окружения (server/.env)

Используются только следующие переменные (остальные в `.env` не читаются):

| Переменная        | Описание |
|-------------------|----------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Подключение к PostgreSQL |
| `PORT`            | Порт сервера (по умолчанию 3001) |
| `ENCRYPTION_KEY`  | Ключ шифрования для Jira PAT и GigaChat в БД (минимум 16 символов) |
| `JIRA_API_VERSION` | Опционально: `3` для Jira Cloud API v3 |

Переменные **JIRA_BASE_URL**, **JIRA_EMAIL**, **JIRA_API_TOKEN**, **JIRA_USE_PAT**, **GIGACHAT_CREDENTIALS**, **GIGACHAT_SCOPE**, **GIGACHAT_MODEL**, **GIGACHAT_TIMEOUT** в коде не используются — Jira и GigaChat настраиваются в приложении (страница Настройки), данные хранятся в БД в зашифрованном виде. Их можно удалить из `server/.env`.

Пример минимального `server/.env` см. в `server/.env.example`.

## Интеграция с Jira

Jira настраивается в приложении: **Настройки** → тег проекта, PAT (Personal Access Token), Base URL. Данные сохраняются в БД в зашифрованном виде.

### API Endpoints Jira

#### GET /api/jira/auth
Проверка авторизации в Jira API.

**Ответ:**
```json
{
  "request": {
    "url": "https://...",
    "method": "GET",
    "authType": "Bearer (PAT)",
    "headers": {...}
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "contentType": "application/json",
    "headers": {...}
  },
  "body": {
    "self": "...",
    "accountId": "...",
    "displayName": "...",
    ...
  },
  "rawBody": "..."
}
```
