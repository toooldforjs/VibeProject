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

### 2. Настройка в приложении

GigaChat настраивается в приложении, а не в `.env`: **Настройки** → раздел GigaChat API (ключ авторизации, scope, модель, таймаут). Данные сохраняются в БД в зашифрованном виде. Переменные `GIGACHAT_*` в `server/.env` **не используются**.

### 3. Сертификаты Минцифры

Сертификаты Минцифры загружаются автоматически при первом запуске сервера. Если автоматическая загрузка не сработала, см. [README_CERTIFICATES.md](./README_CERTIFICATES.md).

## Использование API

### Проверка статуса

```bash
GET /api/gigachat/status?userId=1
```

Проверяет настройки GigaChat для пользователя. Данные берутся из БД (раздел Настройки).

**Ответ** (передайте `userId` в query):

```json
{
	"hasCredentials": true,
	"scope": "GIGACHAT_API_PERS",
	"model": "GigaChat",
	"timeout": 600,
	"httpsAgentConfigured": true
}
```

### Получение токена доступа

```bash
POST /api/gigachat/token
Content-Type: application/json

{
  "userId": 1
}
```

Получает токен доступа GigaChat по настройкам пользователя из БД. Токен действителен в течение 30 минут.

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
  "userId": 1,                // обязательно
  "message": "Привет, как дела?",
  "model": "GigaChat",        // опционально
  "temperature": 0.7,         // опционально
  "maxTokens": 1000           // опционально
}
```

Отправляет сообщение в GigaChat и получает ответ. Параметр `userId` обязателен (настройки GigaChat берутся из БД по пользователю).

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
GET /api/gigachat/models?userId=1
```

Получает список доступных моделей GigaChat. Параметр `userId` в query обязателен.

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
# Проверка статуса (передайте userId)
curl "http://localhost:3001/api/gigachat/status?userId=1"

# Отправка сообщения (userId обязателен)
curl -X POST http://localhost:3001/api/gigachat/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "message": "Расскажи про искусственный интеллект"
  }'
```

### Пример с JavaScript (fetch)

```javascript
// Отправка сообщения (userId обязателен)
const response = await fetch("http://localhost:3001/api/gigachat/chat", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
	},
	body: JSON.stringify({
		userId: 1,
		message: "Привет, GigaChat!",
		model: "GigaChat",
	}),
});

const data = await response.json();
console.log(data.response);
```

## Устранение проблем

### Ошибка: "Настройки GigaChat не найдены"

**Причина**: Пользователь не заполнил настройки GigaChat в приложении.

**Решение**: Откройте **Настройки** в приложении и заполните раздел GigaChat API (ключ авторизации, scope, модель).

### Ошибка: "[SSL: CERTIFICATE_VERIFY_FAILED]"

**Причина**: Сертификат Минцифры не установлен.

**Решение**: См. [README_CERTIFICATES.md](./README_CERTIFICATES.md) для инструкций по установке сертификатов.

### Ошибка: "Ошибка получения токена доступа"

**Возможные причины**:

1. Неверный ключ авторизации
2. Неверный scope
3. Проблемы с сетью

**Решение**:

- Проверьте ключ авторизации и scope в **Настройках** приложения
- Убедитесь, что используете правильный scope для вашего типа аккаунта
- Проверьте интернет-соединение

## Дополнительная информация

- [Официальная документация GigaChat API](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api)
- [JS/TS SDK для GigaChat API](https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat)
- [Быстрый старт для физических лиц](https://developers.sber.ru/docs/ru/gigachat/quickstart/quickstart-persons)
- [Быстрый старт для ИП и юридических лиц](https://developers.sber.ru/docs/ru/gigachat/quickstart/quickstart-legal-entities)
