import express from 'express';
import pool from '../db/database.js';
import { decrypt } from '../utils/encryption.js';

const router = express.Router();

/**
 * Парсит URL страницы Confluence вида:
 * https://confluence.mydomain.ru/pages/viewpage.action?pageId=474451202
 * Возвращает { baseUrl, pageId } или null.
 */
function parseConfluencePageUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  const trimmed = inputUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const pageId = url.searchParams.get('pageId');
    if (!pageId) return null;
    const baseUrl = url.origin;
    return { baseUrl, pageId };
  } catch {
    return null;
  }
}

/**
 * POST /api/confluence/page
 * Body: { url: string, userId?: number, username?: string, password?: string }
 * Запрашивает контент страницы Confluence on-prem по URL.
 * Если передан userId — используются сохранённые в настройках логин/пароль Confluence (Basic Auth).
 * Либо укажите username и password в теле запроса.
 */
router.post('/page', async (req, res) => {
  const { url: pageUrl, userId, username: bodyUsername, password: bodyPassword } = req.body || {};

  const parsed = parseConfluencePageUrl(pageUrl);
  if (!parsed) {
    return res.status(400).json({
      error: 'Некорректный URL страницы Confluence. Ожидается формат: https://confluence.mydomain.ru/pages/viewpage.action?pageId=474451202',
    });
  }

  const { baseUrl, pageId } = parsed;
  const apiUrl = `${baseUrl}/rest/api/content/${pageId}?expand=body.storage,version,space`;

  let username = bodyUsername;
  let password = bodyPassword;
  if ((username == null || String(username).trim() === '' || password == null) && userId != null) {
    try {
      const row = await pool.query(
        'SELECT confluence_username, confluence_password FROM user_settings WHERE user_id = $1',
        [userId]
      );
      if (row.rows.length > 0 && row.rows[0].confluence_username && row.rows[0].confluence_password) {
        const stored = row.rows[0];
        username = stored.confluence_username;
        const dec = decrypt(stored.confluence_password);
        password = dec ?? stored.confluence_password;
      }
    } catch (dbErr) {
      console.error('Confluence: ошибка загрузки настроек:', dbErr);
    }
  }

  const headers = { Accept: 'application/json' };
  if (username != null && String(username).trim() !== '' && password != null) {
    const token = Buffer.from(`${String(username).trim()}:${password}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${token}`;
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Confluence API вернул ${response.status}`,
        status: response.status,
        body: data,
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('Confluence API error:', err);
    return res.status(500).json({
      error: 'Ошибка при запросе к Confluence',
      message: err.message,
    });
  }
});

export default router;
