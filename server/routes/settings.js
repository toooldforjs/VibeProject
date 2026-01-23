import express from 'express';
import pool from '../db/database.js';

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
      'SELECT project_tag, jira_pat, jira_base_url FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        projectTag: null,
        jiraPat: null,
        jiraBaseUrl: null,
      });
    }

    const settings = result.rows[0];
    res.json({
      projectTag: settings.project_tag,
      jiraPat: settings.jira_pat,
      jiraBaseUrl: settings.jira_base_url,
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
    const { projectTag, jiraPat, jiraBaseUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    // Проверяем, существуют ли настройки для пользователя
    const existing = await pool.query(
      'SELECT id FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      // Обновляем существующие настройки
      await pool.query(
        `UPDATE user_settings 
         SET project_tag = $1, jira_pat = $2, jira_base_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4`,
        [projectTag || null, jiraPat || null, jiraBaseUrl || null, userId]
      );
    } else {
      // Создаем новые настройки
      await pool.query(
        `INSERT INTO user_settings (user_id, project_tag, jira_pat, jira_base_url)
         VALUES ($1, $2, $3, $4)`,
        [userId, projectTag || null, jiraPat || null, jiraBaseUrl || null]
      );
    }

    res.json({
      message: 'Настройки успешно сохранены',
      settings: {
        projectTag,
        jiraPat: jiraPat ? '***' : null, // Не возвращаем полный токен
        jiraBaseUrl,
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
