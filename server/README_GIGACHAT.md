# Интеграция с GigaChat API

Этот проект использует официальный SDK GigaChat для работы с API.

## Установка зависимостей

```bash
cd server
npm install
```

## Настройка

### 1. Получение ключа авторизации

Для работы с GigaChat API вам понадобится ключ авторизации:

1. Создайте проект **GigaChat API** в [личном кабинете Studio](https://developers.sber.ru/studio)
2. В интерфейсе проекта, в левой панели выберите раздел **Настройки API**
3. Нажмите кнопку **Получить ключ**
4. Скопируйте и сохраните значение поля **Authorization Key**

⚠️ **Важно**: Ключ авторизации отображается только один раз и не хранится в личном кабинете. При компрометации или утере ключа вы можете сгенерировать его повторно.

### 2. Настройка переменных окружения

Откройте файл `server/.env` и добавьте следующие переменные:

```env
# GigaChat API Configuration
GIGACHAT_CREDENTIALS=ваш_ключ_авторизации_здесь
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat
GIGACHAT_TIMEOUT=600
```

#### Параметры:

- **GIGACHAT_CREDENTIALS** (обязательно) - Ключ авторизации, полученный в личном кабинете Studio
- **GIGACHAT_SCOPE** (опционально) - Версия API:
  - `GIGACHAT_API_PERS` - для физических лиц (по умолчанию)
  - `GIGACHAT_API_B2B` - для ИП и юридических лиц при работе по предоплате
  - `GIGACHAT_API_CORP` - для ИП и юридических лиц при работе по постоплате
- **GIGACHAT_MODEL** (опционально) - Модель GigaChat (по умолчанию `GigaChat`)
- **GIGACHAT_TIMEOUT** (опционально) - Таймаут подключения в секундах (по умолчанию `600`)

### 3. Сертификаты Минцифры

Сертификаты Минцифры загружаются автоматически при первом запуске сервера. Если автоматическая загрузка не сработала, см. [README_CERTIFICATES.md](./README_CERTIFICATES.md).

## Использование API

### Проверка статуса

```bash
GET /api/gigachat/status
```

Проверяет, инициализирован ли клиент GigaChat и правильно ли настроены переменные окружения.

**Ответ:**
```json
{
  "initialized": true,
  "hasCredentials": true,
  "scope": "GIGACHAT_API_PERS",
  "model": "GigaChat",
  "httpsAgentConfigured": true
}
```

### Получение токена доступа

```bash
POST /api/gigachat/token
Content-Type: application/json

{
  "credentials": "ваш_ключ_авторизации",  // опционально, если установлен в .env
  "scope": "GIGACHAT_API_PERS"            // опционально
}
```

Получает токен доступа GigaChat. Токен действителен в течение 30 минут.

**Ответ:**
```json
{
  "success": true,
  "message": "Токен доступа успешно получен",
  "scope": "GIGACHAT_API_PERS",
  "expiresIn": "30 минут"
}
```

### Отправка сообщения

```bash
POST /api/gigachat/chat
Content-Type: application/json

{
  "message": "Привет, как дела?",
  "model": "GigaChat",        // опционально
  "temperature": 0.7,         // опционально
  "maxTokens": 1000           // опционально
}
```

Отправляет сообщение в GigaChat и получает ответ.

**Ответ:**
```json
{
  "success": true,
  "model": "GigaChat",
  "response": "Привет! У меня всё отлично, спасибо!",
  "fullResponse": {
    "choices": [...],
    "usage": {...}
  }
}
```

### Получение списка моделей

```bash
GET /api/gigachat/models
```

Получает список доступных моделей GigaChat.

**Ответ:**
```json
{
  "success": true,
  "models": [
    {
      "id": "GigaChat",
      "object": "model",
      ...
    }
  ]
}
```

## Примеры использования

### Пример с curl

```bash
# Проверка статуса
curl http://localhost:3001/api/gigachat/status

# Отправка сообщения
curl -X POST http://localhost:3001/api/gigachat/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Расскажи про искусственный интеллект"
  }'
```

### Пример с JavaScript (fetch)

```javascript
// Отправка сообщения
const response = await fetch('http://localhost:3001/api/gigachat/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Привет, GigaChat!',
    model: 'GigaChat',
  }),
});

const data = await response.json();
console.log(data.response);
```

## Устранение проблем

### Ошибка: "Клиент GigaChat не инициализирован"

**Причина**: Не установлен `GIGACHAT_CREDENTIALS` в `.env` файле.

**Решение**: Добавьте ключ авторизации в `server/.env`:
```env
GIGACHAT_CREDENTIALS=ваш_ключ_авторизации
```

### Ошибка: "[SSL: CERTIFICATE_VERIFY_FAILED]"

**Причина**: Сертификат Минцифры не установлен.

**Решение**: См. [README_CERTIFICATES.md](./README_CERTIFICATES.md) для инструкций по установке сертификатов.

### Ошибка: "Ошибка получения токена доступа"

**Возможные причины**:
1. Неверный ключ авторизации
2. Неверный scope
3. Проблемы с сетью

**Решение**:
- Проверьте правильность ключа авторизации в `.env`
- Убедитесь, что используете правильный scope для вашего типа аккаунта
- Проверьте интернет-соединение

## Дополнительная информация

- [Официальная документация GigaChat API](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api)
- [JS/TS SDK для GigaChat API](https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat)
- [Быстрый старт для физических лиц](https://developers.sber.ru/docs/ru/gigachat/quickstart/quickstart-persons)
- [Быстрый старт для ИП и юридических лиц](https://developers.sber.ru/docs/ru/gigachat/quickstart/quickstart-legal-entities)
