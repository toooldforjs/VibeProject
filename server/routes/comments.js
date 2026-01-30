import express from 'express';
import pool from '../db/database.js';

const router = express.Router();

function getUserId(req) {
  const id = req.body?.userId ?? req.query?.userId;
  return id != null ? Number(id) : null;
}

/**
 * GET /api/comments?issueKey=PROJ-123
 * Список комментариев по задаче. Сортировка: новые сверху.
 */
router.get('/', async (req, res) => {
  try {
    const issueKey = req.query.issueKey;
    if (!issueKey || typeof issueKey !== 'string') {
      return res.status(400).json({ error: 'Параметр issueKey обязателен' });
    }

    const result = await pool.query(
      `SELECT c.id, c.issue_key, c.user_id, c.body_markdown, c.created_at,
              u.email AS author_email
       FROM issue_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.issue_key = $1
       ORDER BY c.created_at DESC`,
      [issueKey.trim()]
    );

    const comments = result.rows.map((row) => ({
      id: row.id,
      issueKey: row.issue_key,
      userId: row.user_id,
      bodyMarkdown: row.body_markdown,
      createdAt: row.created_at,
      authorEmail: row.author_email,
      authorName: row.author_email === SYSTEM_USER_EMAIL ? 'Система' : (row.author_email ? row.author_email.replace(/@.*$/, '') : 'Пользователь'),
    }));

    res.json({ comments });
  } catch (error) {
    console.error('Ошибка получения комментариев:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

const SYSTEM_USER_EMAIL = 'system@vibeproject.internal';

/**
 * POST /api/comments
 * Body: { issueKey, userId?, body, asSystem? }
 * Если asSystem === true, комментарий создаётся от имени системного пользователя (автор «Система»).
 */
router.post('/', async (req, res) => {
  try {
    const { issueKey, body, asSystem } = req.body;
    let userId = getUserId(req);

    if (asSystem) {
      const systemRow = await pool.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [SYSTEM_USER_EMAIL]
      );
      if (systemRow.rows.length === 0) {
        return res.status(500).json({ error: 'Системный пользователь не найден' });
      }
      userId = systemRow.rows[0].id;
    } else if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }

    if (!issueKey || typeof issueKey !== 'string') {
      return res.status(400).json({ error: 'Параметр issueKey обязателен' });
    }
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Текст комментария не может быть пустым' });
    }

    const result = await pool.query(
      `INSERT INTO issue_comments (issue_key, user_id, body_markdown)
       VALUES ($1, $2, $3)
       RETURNING id, issue_key, user_id, body_markdown, created_at`,
      [issueKey.trim(), userId, text]
    );

    const row = result.rows[0];
    const emailResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const authorEmail = emailResult.rows[0]?.email || '';

    res.status(201).json({
      comment: {
        id: row.id,
        issueKey: row.issue_key,
        userId: row.user_id,
        bodyMarkdown: row.body_markdown,
        createdAt: row.created_at,
        authorEmail,
        authorName: authorEmail === SYSTEM_USER_EMAIL ? 'Система' : (authorEmail ? authorEmail.replace(/@.*$/, '') : 'Пользователь'),
      },
    });
  } catch (error) {
    console.error('Ошибка создания комментария:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/comments/:id?userId=1
 * Удалить комментарий. Разрешено только автору (user_id === userId).
 */
router.delete('/:id', async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }
    if (!Number.isInteger(commentId) || commentId < 1) {
      return res.status(400).json({ error: 'Некорректный id комментария' });
    }

    const result = await pool.query(
      'DELETE FROM issue_comments WHERE id = $1 AND user_id = $2 RETURNING id',
      [commentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Комментарий не найден или у вас нет прав на его удаление',
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления комментария:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
