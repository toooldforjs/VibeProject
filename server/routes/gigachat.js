import express from 'express';
import GigaChat from 'gigachat';
import pool from '../db/database.js';
import { decrypt } from '../utils/encryption.js';
import { createHttpsAgent, initializeCertificates } from '../utils/certificates.js';

const router = express.Router();

let httpsAgent = null;

async function ensureHttpsAgent() {
  if (!httpsAgent) {
    await initializeCertificates();
    httpsAgent = createHttpsAgent();
  }
  return httpsAgent;
}

/**
 * Загружает настройки GigaChat пользователя из БД (credentials расшифровываются)
 */
async function getGigaChatSettingsForUser(userId) {
  if (!userId) return null;
  const result = await pool.query(
    'SELECT gigachat_credentials, gigachat_scope, gigachat_model, gigachat_timeout FROM user_settings WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const credentials = row.gigachat_credentials ? decrypt(row.gigachat_credentials) : null;
  if (!credentials) return null;
  return {
    credentials,
    scope: row.gigachat_scope || 'GIGACHAT_API_PERS',
    model: row.gigachat_model || 'GigaChat',
    timeout: row.gigachat_timeout != null ? parseInt(row.gigachat_timeout, 10) : 600,
  };
}

/**
 * Создаёт клиент GigaChat с заданными настройками
 */
async function createGigaChatClient(settings) {
  const agent = await ensureHttpsAgent();
  const client = new GigaChat({
    credentials: settings.credentials,
    scope: settings.scope,
    model: settings.model,
    timeout: settings.timeout,
    httpsAgent: agent,
  });
  await client.updateToken();
  return client;
}

/**
 * Получение токена доступа GigaChat
 * POST /api/gigachat/token
 * Body: { userId?: number, credentials?: string, scope?: string }
 * Если передан userId, креды берутся из настроек пользователя в БД.
 */
router.post('/token', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Параметр userId обязателен. Настройки GigaChat хранятся в БД (раздел Настройки).',
      });
    }

    const settings = await getGigaChatSettingsForUser(userId);
    if (!settings) {
      return res.status(400).json({ error: 'Настройки GigaChat не найдены. Заполните их в Настройках.' });
    }

    const creds = settings.credentials;
    const apiScope = settings.scope;

    const agent = await ensureHttpsAgent();
    const tempClient = new GigaChat({
      credentials: creds,
      scope: apiScope,
      httpsAgent: agent,
    });
    await tempClient.updateToken();

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
 * Body: { userId: number, message: string, model?: string, temperature?: number, maxTokens?: number }
 */
router.post('/chat', async (req, res) => {
  try {
    const { userId, message, model, temperature, maxTokens } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }
    if (!message) {
      return res.status(400).json({ error: 'Параметр message обязателен' });
    }

    const settings = await getGigaChatSettingsForUser(userId);
    if (!settings) {
      return res.status(400).json({
        error: 'Настройки GigaChat не найдены',
        message: 'Заполните GigaChat API в разделе Настройки',
      });
    }

    const client = await createGigaChatClient(settings);
    const chatModel = model || settings.model;

    const chatOptions = {
      messages: [{ role: 'user', content: message }],
    };
    if (temperature !== undefined) chatOptions.temperature = temperature;
    if (maxTokens !== undefined) chatOptions.max_tokens = maxTokens;

    const response = await client.chat(chatOptions);
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
 * GET /api/gigachat/models?userId=...
 */
router.get('/models', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен (query)' });
    }

    const settings = await getGigaChatSettingsForUser(userId);
    if (!settings) {
      return res.status(400).json({
        error: 'Настройки GigaChat не найдены',
        message: 'Заполните GigaChat API в разделе Настройки',
      });
    }

    const client = await createGigaChatClient(settings);
    const models = await client.getModels();
    res.json({ success: true, models });
  } catch (error) {
    console.error('Ошибка получения списка моделей:', error);
    res.status(500).json({
      error: 'Ошибка получения списка моделей',
      message: error.message,
    });
  }
});

/**
 * Проверка статуса GigaChat для пользователя
 * GET /api/gigachat/status?userId=...
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId;
    const settings = userId ? await getGigaChatSettingsForUser(userId) : null;
    res.json({
      hasCredentials: !!settings,
      scope: settings?.scope || null,
      model: settings?.model || null,
      timeout: settings?.timeout ?? null,
      httpsAgentConfigured: httpsAgent !== null,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка проверки статуса',
      message: error.message,
    });
  }
});

/**
 * Генерация ответа для задачи с использованием системного промпта
 * POST /api/gigachat/slop
 * Body: { userId: number, systemPrompt: string, userMessage: string, model?: string }
 */
router.post('/slop', async (req, res) => {
  try {
    const { userId, systemPrompt, userMessage, model = 'GigaChat-2' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }
    if (!systemPrompt) {
      return res.status(400).json({ error: 'Параметр systemPrompt обязателен' });
    }
    if (!userMessage) {
      return res.status(400).json({ error: 'Параметр userMessage обязателен' });
    }

    const settings = await getGigaChatSettingsForUser(userId);
    if (!settings) {
      return res.status(400).json({
        error: 'Настройки GigaChat не найдены',
        message: 'Заполните GigaChat API в разделе Настройки',
      });
    }

    const client = await createGigaChatClient(settings);
    const chatModel = model || settings.model;

    const chatOptions = {
      model: chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      update_interval: 0,
    };

    const response = await client.chat(chatOptions);
    res.json({
      success: true,
      model: chatModel,
      response: response.choices[0]?.message?.content || '',
      fullResponse: response,
    });
  } catch (error) {
    console.error('Ошибка генерации ответа GigaChat:', error);
    res.status(500).json({
      error: 'Ошибка генерации ответа GigaChat',
      message: error.message,
    });
  }
});

export default router;
