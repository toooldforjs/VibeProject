import express from 'express';
import pool from '../db/database.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const router = express.Router();

// Middleware для получения user_id из запроса
// В реальном приложении здесь должна быть проверка токена/сессии
// Для упрощения используем userId из body или query
const getUserId = (req) => {
  // В реальном приложении здесь должна быть проверка авторизации
  // Для упрощения получаем userId из body или query
  return req.body.userId || req.query.userId;
};

// Получение настроек пользователя
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    const result = await pool.query(
      'SELECT project_tag, jira_pat, jira_base_url, gigachat_credentials, gigachat_scope, gigachat_model, gigachat_timeout FROM user_settings WHERE user_id = $1',
      [userId]
    );

    const gigachatFromDb = (row) => ({
      gigachatCredentialsSet: !!row?.gigachat_credentials,
      gigachatCredentials: row?.gigachat_credentials ? '••••••••••••' : '',
      gigachatScope: row?.gigachat_scope || '',
      gigachatModel: row?.gigachat_model || '',
      gigachatTimeout: row?.gigachat_timeout != null ? String(row.gigachat_timeout) : '',
    });

    if (result.rows.length === 0) {
      return res.json({
        projectTag: null,
        jiraPat: null,
        jiraBaseUrl: null,
        ...gigachatFromDb(null),
      });
    }

    const settings = result.rows[0];
    res.json({
      projectTag: settings.project_tag,
      jiraPat: settings.jira_pat ? '••••••••••••' : null,
      jiraBaseUrl: settings.jira_base_url,
      ...gigachatFromDb(settings),
    });
  } catch (error) {
    console.error('Ошибка получения настроек:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

// Сохранение настроек пользователя
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectTag, jiraPat, jiraBaseUrl, gigachatCredentials, gigachatScope, gigachatModel, gigachatTimeout } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    // jiraPatNewValue: undefined = не менять, null = очистить, string = зашифрованные данные
    let jiraPatNewValue = undefined;
    if (jiraPat !== undefined && jiraPat !== null) {
      if (jiraPat === '' || (typeof jiraPat === 'string' && jiraPat.trim() === '')) {
        jiraPatNewValue = null;
      } else if (String(jiraPat).trim() !== '••••••••••••') {
        try {
          jiraPatNewValue = encrypt(String(jiraPat).trim());
        } catch (encErr) {
          return res.status(400).json({
            error: 'Ошибка шифрования Jira PAT',
            message: process.env.ENCRYPTION_KEY ? encErr.message : 'Задайте ENCRYPTION_KEY в .env на сервере (минимум 16 символов)',
          });
        }
      }
    }

    // credentialsNewValue: undefined = не менять, null = очистить, string = зашифрованные данные
    let credentialsNewValue = undefined;
    if (gigachatCredentials !== undefined && gigachatCredentials !== null) {
      if (gigachatCredentials === '' || (typeof gigachatCredentials === 'string' && gigachatCredentials.trim() === '')) {
        credentialsNewValue = null;
      } else if (String(gigachatCredentials).trim() !== '••••••••••••') {
        try {
          credentialsNewValue = encrypt(String(gigachatCredentials).trim());
        } catch (encErr) {
          return res.status(400).json({
            error: 'Ошибка шифрования данных GigaChat',
            message: process.env.ENCRYPTION_KEY ? encErr.message : 'Задайте ENCRYPTION_KEY в .env на сервере (минимум 16 символов)',
          });
        }
      }
    }

    const gigachatScopeVal = gigachatScope !== undefined && gigachatScope !== null && String(gigachatScope).trim() !== '' ? String(gigachatScope).trim() : null;
    const gigachatModelVal = gigachatModel !== undefined && gigachatModel !== null && String(gigachatModel).trim() !== '' ? String(gigachatModel).trim() : null;
    const gigachatTimeoutVal = gigachatTimeout !== undefined && gigachatTimeout !== null && String(gigachatTimeout).trim() !== '' ? parseInt(String(gigachatTimeout).trim(), 10) : null;
    if (gigachatTimeoutVal !== null && (Number.isNaN(gigachatTimeoutVal) || gigachatTimeoutVal < 0)) {
      return res.status(400).json({ error: 'GIGACHAT_TIMEOUT должен быть неотрицательным числом' });
    }

    const existing = await pool.query(
      'SELECT id FROM user_settings WHERE user_id = $1',
      [userId]
    );

    const jiraPatForInsert = jiraPatNewValue ?? null;

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE user_settings 
         SET project_tag = $1, jira_base_url = $2, updated_at = CURRENT_TIMESTAMP,
             gigachat_scope = COALESCE($4, gigachat_scope),
             gigachat_model = COALESCE($5, gigachat_model),
             gigachat_timeout = $6
         WHERE user_id = $3`,
        [projectTag || null, jiraBaseUrl || null, userId, gigachatScopeVal, gigachatModelVal, gigachatTimeoutVal]
      );
      if (jiraPatNewValue !== undefined) {
        await pool.query(
          'UPDATE user_settings SET jira_pat = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [jiraPatNewValue, userId]
        );
      }
      if (credentialsNewValue !== undefined) {
        await pool.query(
          'UPDATE user_settings SET gigachat_credentials = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [credentialsNewValue, userId]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO user_settings (user_id, project_tag, jira_pat, jira_base_url, gigachat_credentials, gigachat_scope, gigachat_model, gigachat_timeout)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, projectTag || null, jiraPatForInsert, jiraBaseUrl || null, credentialsNewValue ?? null, gigachatScopeVal, gigachatModelVal, gigachatTimeoutVal]
      );
    }

    res.json({
      message: 'Настройки успешно сохранены',
      settings: {
        projectTag,
        jiraPat: (jiraPatNewValue !== undefined ? jiraPatNewValue !== null : jiraPat === '••••••••••••') ? '***' : null,
        jiraBaseUrl,
        gigachatCredentialsSet: credentialsNewValue !== null || (credentialsNewValue === undefined && gigachatCredentials === '••••••••••••'),
        gigachatScope: gigachatScopeVal,
        gigachatModel: gigachatModelVal,
        gigachatTimeout: gigachatTimeoutVal,
      }
    });
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера' 
    });
  }
});

export default router;
