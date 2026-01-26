import express from 'express';
import GigaChat from 'gigachat';
import { createHttpsAgent, initializeCertificates } from '../utils/certificates.js';

const router = express.Router();

// Инициализация клиента GigaChat
let gigaChatClient = null;
let httpsAgent = null;

/**
 * Инициализирует клиент GigaChat с настройками из переменных окружения
 */
async function initializeGigaChatClient() {
  try {
    // Инициализируем сертификаты
    await initializeCertificates();
    httpsAgent = createHttpsAgent();

    // Получаем настройки из переменных окружения
    const credentials = process.env.GIGACHAT_CREDENTIALS;
    const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
    const model = process.env.GIGACHAT_MODEL || 'GigaChat';
    const timeout = parseInt(process.env.GIGACHAT_TIMEOUT || '600', 10);

    if (!credentials) {
      console.warn('⚠️  GIGACHAT_CREDENTIALS не установлен в .env файле');
      return null;
    }

    // Создаем клиент GigaChat
    gigaChatClient = new GigaChat({
      credentials: credentials,
      scope: scope,
      model: model,
      timeout: timeout,
      httpsAgent: httpsAgent,
    });

    console.log('✅ Клиент GigaChat инициализирован');
    console.log(`   Scope: ${scope}`);
    console.log(`   Model: ${model}`);
    console.log(`   Timeout: ${timeout}s`);

    // Предварительная авторизация (получение токена)
    try {
      await gigaChatClient.updateToken();
      console.log('✅ Токен доступа GigaChat получен');
    } catch (tokenError) {
      console.warn('⚠️  Не удалось получить токен при инициализации:', tokenError.message);
      console.log('💡 Токен будет получен автоматически при первом запросе');
    }

    return gigaChatClient;
  } catch (error) {
    console.error('❌ Ошибка инициализации клиента GigaChat:', error.message);
    return null;
  }
}

// Инициализация при загрузке модуля
(async () => {
  await initializeGigaChatClient();
})();

/**
 * Получение токена доступа GigaChat
 * POST /api/gigachat/token
 * Body: { credentials?: string, scope?: string }
 * 
 * Если credentials не указан, используется значение из .env
 */
router.post('/token', async (req, res) => {
  try {
    const { credentials, scope } = req.body;

    // Используем credentials из запроса или из .env
    const creds = credentials || process.env.GIGACHAT_CREDENTIALS;
    const apiScope = scope || process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';

    if (!creds) {
      return res.status(400).json({ 
        error: 'Параметр credentials обязателен. Укажите его в теле запроса или в переменной окружения GIGACHAT_CREDENTIALS' 
      });
    }

    // Создаем временный клиент для получения токена
    const tempClient = new GigaChat({
      credentials: creds,
      scope: apiScope,
      httpsAgent: httpsAgent || createHttpsAgent(),
    });

    // Получаем токен
    await tempClient.updateToken();

    // Возвращаем информацию о токене
    res.json({
      success: true,
      message: 'Токен доступа успешно получен',
      scope: apiScope,
      expiresIn: '30 минут',
    });
  } catch (error) {
    console.error('Ошибка получения токена GigaChat:', error);
    res.status(500).json({
      error: 'Ошибка получения токена доступа',
      message: error.message,
    });
  }
});

/**
 * Отправка сообщения в GigaChat
 * POST /api/gigachat/chat
 * Body: { message: string, model?: string, temperature?: number, maxTokens?: number }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, model, temperature, maxTokens } = req.body;

    if (!message) {
      return res.status(400).json({ 
        error: 'Параметр message обязателен' 
      });
    }

    // Проверяем, инициализирован ли клиент
    if (!gigaChatClient) {
      const client = await initializeGigaChatClient();
      if (!client) {
        return res.status(500).json({
          error: 'Клиент GigaChat не инициализирован',
          message: 'Убедитесь, что GIGACHAT_CREDENTIALS установлен в .env файле',
        });
      }
    }

    // Используем модель из запроса или из настроек
    const chatModel = model || process.env.GIGACHAT_MODEL || 'GigaChat';

    // Подготавливаем параметры запроса
    const chatOptions = {
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    };

    // Добавляем опциональные параметры
    if (temperature !== undefined) {
      chatOptions.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      chatOptions.max_tokens = maxTokens;
    }

    // Отправляем запрос
    const response = await gigaChatClient.chat(chatOptions);

    res.json({
      success: true,
      model: chatModel,
      response: response.choices[0]?.message?.content || '',
      fullResponse: response,
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения в GigaChat:', error);
    res.status(500).json({
      error: 'Ошибка отправки сообщения в GigaChat',
      message: error.message,
    });
  }
});

/**
 * Получение списка доступных моделей
 * GET /api/gigachat/models
 */
router.get('/models', async (req, res) => {
  try {
    // Проверяем, инициализирован ли клиент
    if (!gigaChatClient) {
      const client = await initializeGigaChatClient();
      if (!client) {
        return res.status(500).json({
          error: 'Клиент GigaChat не инициализирован',
          message: 'Убедитесь, что GIGACHAT_CREDENTIALS установлен в .env файле',
        });
      }
    }

    // Получаем список моделей
    const models = await gigaChatClient.getModels();

    res.json({
      success: true,
      models: models,
    });
  } catch (error) {
    console.error('Ошибка получения списка моделей:', error);
    res.status(500).json({
      error: 'Ошибка получения списка моделей',
      message: error.message,
    });
  }
});

/**
 * Проверка статуса клиента GigaChat
 * GET /api/gigachat/status
 */
router.get('/status', async (req, res) => {
  try {
    const isInitialized = gigaChatClient !== null;
    const hasCredentials = !!process.env.GIGACHAT_CREDENTIALS;
    const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
    const model = process.env.GIGACHAT_MODEL || 'GigaChat';

    res.json({
      initialized: isInitialized,
      hasCredentials: hasCredentials,
      scope: scope,
      model: model,
      httpsAgentConfigured: httpsAgent !== null,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка проверки статуса',
      message: error.message,
    });
  }
});

export default router;
