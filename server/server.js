import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db/database.js';
import { initializeCertificates, setupEnvironmentCertificates } from './utils/certificates.js';
import authRoutes from './routes/auth.js';
import jiraRoutes from './routes/jira.js';
import settingsRoutes from './routes/settings.js';
import gigachatRoutes from './routes/gigachat.js';
import commentsRoutes from './routes/comments.js';
import confluenceRoutes from './routes/confluence.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true
}));
app.use(express.json());

// Инициализация базы данных
initDatabase().catch(console.error);

// Инициализация сертификатов Минцифры для GigaChat
(async () => {
  try {
    await initializeCertificates();
    setupEnvironmentCertificates();
  } catch (error) {
    console.warn('⚠️  Предупреждение: не удалось инициализировать сертификаты Минцифры:', error.message);
    console.log('💡 GigaChat API может работать некорректно без сертификатов');
  }
})();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/gigachat', gigachatRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/confluence', confluenceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 404 — неизвестный маршрут
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Глобальный обработчик ошибок (для next(err) в маршрутах)
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Необработанные отклонения промисов и необработанные исключения
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
