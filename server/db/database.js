import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'vibe_user',
  password: process.env.DB_PASSWORD || 'vibe_password',
  database: process.env.DB_NAME || 'vibe_db',
});

// Инициализация базы данных
export async function initDatabase() {
  try {
    // Проверяем подключение
    await pool.query('SELECT NOW()');
    console.log('✅ Подключение к базе данных установлено');

    // Создаем таблицу пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Создаем индекс для быстрого поиска по email
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    console.log('✅ Таблица users создана/проверена');

    // Системный пользователь для комментариев от нейросети (автор «Система»)
    const systemEmail = 'system@vibeproject.internal';
    const systemHash = bcrypt.hashSync('system', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [systemEmail, systemHash]
    );
    console.log('✅ Системный пользователь создан/проверен');

    // Создаем таблицу настроек пользователя
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_tag VARCHAR(255),
        jira_email VARCHAR(255),
        jira_pat TEXT,
        jira_base_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);

    // Создаем индекс для быстрого поиска по user_id
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)
    `);

    // Добавляем колонки GigaChat (если их ещё нет)
    await pool.query(`
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gigachat_credentials TEXT;
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gigachat_scope VARCHAR(100);
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gigachat_model VARCHAR(100);
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gigachat_timeout INTEGER;
    `);
    // Инструкции системного промпта для Slop! (редактируются в настройках)
    await pool.query(`
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS slop_system_prompt TEXT;
    `);
    // Дополнительный контекст проекта (глоссарий, описание) — вставляется в конец системного промпта
    await pool.query(`
      ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS project_context TEXT;
    `);

    console.log('✅ Таблица user_settings создана/проверена');

    // Таблица комментариев к задачам (issue_key — ключ задачи Jira, например PROJ-123)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS issue_comments (
        id SERIAL PRIMARY KEY,
        issue_key VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body_markdown TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_key ON issue_comments(issue_key);
      CREATE INDEX IF NOT EXISTS idx_issue_comments_created_at ON issue_comments(created_at DESC);
    `);
    console.log('✅ Таблица issue_comments создана/проверена');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    throw error;
  }
}

export default pool;
