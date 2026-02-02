# VibeProject

VibeProject - это упрощенный клиент для Jira, позволяющий обогатить твои задачи нейрослопом от GigaChat.
Функции приложения:

- получение перечня задач проекта или отдельной задачи из Jira;
- добавление заметок к задачам в виде комментов;
- генерация рекомендаций по составлению задач на разработку от GigaChat на основе описания задачи, эпика, системного промпта и контекста проекта.

После запуска проекта нужно перейти в настройки в меню профиля и заполнить там параметры подключения к Jira и GigaChat + параметры запросов к GigaChat.

# Требования

- Node.js 18+
- Podman (или Podman Desktop) с поддержкой `podman compose`
- npm или yarn

# Установка и запуск

## Быстрый старт (запуск всех сервисов одной командой)

**Важно:** Перед запуском убедитесь, что Podman Desktop запущен и работает.

```bash
npm install
npm run dev:all
```

Эта команда автоматически:

- Установит все зависимости проекта
- Запустит базу данных PostgreSQL в Podman
- Запустит backend сервер на `http://localhost:3001`
- Запустит frontend на `http://localhost:5173`

## Ручной запуск (пошагово)

### 1. Запуск базы данных (через Podman)

В корне проекта выполните:

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

Из директории `server` (вы уже в ней после шага 2) выполните:

```bash
npm run dev
```

Backend будет доступен на `http://localhost:3001`

### 4. Установка зависимостей frontend

Перейдите в корневую директорию проекта и установите зависимости:

```bash
cd ..
npm install
```

### 5. Запуск frontend

В корневой директории проекта выполните (это другой `npm run dev` — запускается Vite, а не backend):

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

# Структура проекта

```
VibeProject/
├── server/              # Backend API
│   ├── db/             # База данных
│   ├── routes/         # API маршруты
│   └── server.js       # Главный файл сервера
├── src/                # Frontend React приложение
│   ├── contexts/       # React контексты
│   └── pages/          # Страницы приложения
└── docker-compose.yml  # Конфигурация Docker
```

# База данных

PostgreSQL запускается в контейнере Podman на основе `docker-compose.yml`.
Данные сохраняются в volume `postgres_data`, который создаётся Podman автоматически.
**Параметры подключения:**

- Host: localhost
- Port: 5432
- User: vibe_user
- Password: vibe_password
- Database: vibe_db

Если вы меняете порт/пользователя/пароль в `docker-compose.yml`, не забудьте обновить файл `server/.env`.

# Переменные окружения (server/.env)

Используются только следующие переменные окружения:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — подключение к PostgreSQL
- `PORT` — порт сервера (по умолчанию 3001)
- `ENCRYPTION_KEY` — ключ шифрования для Jira PAT и GigaChat в БД (минимум 16 символов)
- `JIRA_API_VERSION` — опционально: `3` для Jira Cloud API v3

Переменные **JIRA_BASE_URL**, **JIRA_EMAIL**, **JIRA_API_TOKEN**, **JIRA_USE_PAT**, **GIGACHAT_CREDENTIALS**, **GIGACHAT_SCOPE**, **GIGACHAT_MODEL**, **GIGACHAT_TIMEOUT** не определены в коде или .env.
Подключение к Jira и GigaChat настраиваются в приложении (страница Настройки в меню профиля), данные хранятся в БД в зашифрованном виде.
Пример минимального `server/.env` см. в `server/.env.example`.

# Интеграция с Jira

Подключение к Jira настраивается в приложении в разделе "Настройки".
Заполните:

- тег проекта (например, GGBLOCKS),
- PAT (Personal Access Token),
- Base URL (основой URL-адрес Jira).
  PAT - персональный токен доступа. Получить его можно в своем профиле в Jira в разделе "Personal Access Tokens".
  Данные сохраняются в БД в зашифрованном виде.

# Интеграция с GigaChat

Подключение к GigaChat настраивается в приложении в разделе "Настройки".
Заполните:

- Ключ авторизации (получите персональный на developers.sber.ru),
- Версия API (если токен персональный - GIGACHAT_API_PERS),
- Модель (лучше GigaChat-2-Max),
- Таймаут подключения в секундах.
  В разделе "Системный промпт для GigaChat" заполните 2 поля как описано на странице настроек.

# Шифрование настроек GigaChat

Ключ GigaChat и параметры (scope, model, timeout) сохраняются в БД в зашифрованном виде. Для работы шифрования в `server/.env` задайте:

```env
ENCRYPTION_KEY=ваш-секретный-ключ-минимум-16-символов
```

Без `ENCRYPTION_KEY` сохранение настроек GigaChat в Настройках вернёт ошибку.
