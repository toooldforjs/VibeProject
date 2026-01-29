import express from 'express';
import dotenv from 'dotenv';
import pool from '../db/database.js';
import { decrypt } from '../utils/encryption.js';

dotenv.config();

const router = express.Router();

/** Расшифровывает jira_pat из БД (поддерживает старые незашифрованные значения) */
const getDecryptedJiraPat = (stored) => {
  if (!stored) return null;
  const dec = decrypt(stored);
  return dec ?? stored;
};

// Функция для создания авторизации для Jira API
// Использует только Bearer токен через Personal Access Token (PAT)
const getAuthHeader = (jiraPat) => {
  if (!jiraPat) {
    throw new Error('PAT не может быть пустым');
  }

  const token = jiraPat.trim();
  if (!token) {
    throw new Error('PAT не может быть пустым');
  }

  return `Bearer ${token}`;
};

// Функция для нормализации базового URL (убирает trailing slash)
const normalizeBaseUrl = (url) => {
  if (!url) return url;
  return url.replace(/\/+$/, '');
};

// Проверка авторизации в Jira API
router.get('/auth', async (req, res) => {
  try {
    // Получаем userId из query параметров
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required. Please provide userId query parameter.'
      });
    }

    // Получаем настройки пользователя из базы данных
    let baseUrl = null;
    let jiraPat = null;

    try {
      const settingsResult = await pool.query(
        'SELECT jira_base_url, jira_pat FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        baseUrl = normalizeBaseUrl(settings.jira_base_url);
        jiraPat = getDecryptedJiraPat(settings.jira_pat);
      }
    } catch (dbError) {
      console.error('Ошибка получения настроек из БД:', dbError);
      return res.status(500).json({
        error: 'Ошибка получения настроек из базы данных',
        message: dbError.message,
      });
    }

    if (!baseUrl || !jiraPat) {
      return res.status(400).json({
        error: 'Jira credentials not configured. Please configure settings in the Settings page.'
      });
    }

    // Используем endpoint /rest/api/3/myself для проверки авторизации
    const url = `${baseUrl}/rest/api/3/myself`;

    console.log('Jira API Auth Request:', { url, authType: 'Bearer' });

    let authHeader;
    try {
      authHeader = getAuthHeader(jiraPat);
    } catch (authError) {
      return res.status(400).json({
        error: 'Ошибка создания заголовка авторизации',
        message: authError.message,
      });
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Сначала читаем ответ как текст
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // Формируем полный ответ с информацией о запросе и ответе
    const authResponse = {
      request: {
        url,
        method: 'GET',
        authType: 'Bearer',
        headers: {
          'Authorization': authHeader.substring(0, 20) + '...', // Показываем только начало токена
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        contentType,
        headers: Object.fromEntries(response.headers.entries()),
      },
      body: null,
      rawBody: responseText,
    };

    // Пытаемся распарсить как JSON, если это возможно
    if (contentType.includes('application/json')) {
      try {
        authResponse.body = JSON.parse(responseText);
      } catch (parseError) {
        authResponse.parseError = parseError.message;
      }
    }

    // Возвращаем полный ответ независимо от статуса
    res.status(200).json(authResponse);
  } catch (error) {
    console.error('Error checking Jira auth:', error);
    res.status(500).json({
      error: 'Failed to check Jira authorization',
      message: error.message,
      stack: error.stack,
    });
  }
});

// Прокси для загрузки вложений/картинок из Jira (для отображения в описании задачи)
router.get('/proxy', async (req, res) => {
  try {
    const userId = req.query.userId;
    let targetUrl = req.query.url;

    if (!userId || !targetUrl) {
      return res.status(400).json({
        error: 'Требуются параметры userId и url',
      });
    }

    let baseUrl = null;
    let jiraPat = null;
    try {
      const settingsResult = await pool.query(
        'SELECT jira_base_url, jira_pat FROM user_settings WHERE user_id = $1',
        [userId]
      );
      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        baseUrl = normalizeBaseUrl(settings.jira_base_url);
        jiraPat = getDecryptedJiraPat(settings.jira_pat);
      }
    } catch (dbError) {
      console.error('Ошибка получения настроек из БД:', dbError);
      return res.status(500).json({ error: 'Ошибка получения настроек' });
    }

    if (!baseUrl || !jiraPat) {
      return res.status(400).json({ error: 'Jira не настроен' });
    }

    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Некорректный url' });
    }

    if (targetUrl.startsWith('/')) {
      targetUrl = baseUrl + targetUrl;
    }

    if (!targetUrl.startsWith(baseUrl)) {
      return res.status(400).json({ error: 'Разрешены только ссылки на Jira' });
    }

    const authHeader = getAuthHeader(jiraPat);
    const proxyResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'image/*,*/*',
      },
    });

    if (!proxyResponse.ok) {
      return res.status(proxyResponse.status).json({
        error: 'Не удалось загрузить ресурс',
        status: proxyResponse.status,
      });
    }

    const contentType = proxyResponse.headers.get('content-type') || 'application/octet-stream';
    res.set('Content-Type', contentType);
    const buffer = await proxyResponse.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Jira proxy error:', error);
    res.status(500).json({
      error: 'Ошибка прокси',
      message: error.message,
    });
  }
});

// Получение задач проекта
router.get('/issues', async (req, res) => {
  try {
    // Получаем userId из query параметров
    const userId = req.query.userId;

    // Получаем тег проекта из query параметров
    const projectKey = req.query.projectKey;

    if (!projectKey || !projectKey.trim()) {
      return res.status(400).json({
        error: 'Project key is required. Please provide projectKey query parameter.'
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required. Please provide userId query parameter.'
      });
    }

    // Получаем настройки пользователя из базы данных
    let baseUrl = null;
    let jiraPat = null;

    try {
      const settingsResult = await pool.query(
        'SELECT jira_base_url, jira_pat FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        baseUrl = normalizeBaseUrl(settings.jira_base_url);
        jiraPat = getDecryptedJiraPat(settings.jira_pat);
      }
    } catch (dbError) {
      console.error('Ошибка получения настроек из БД:', dbError);
      return res.status(500).json({
        error: 'Ошибка получения настроек из базы данных',
        message: dbError.message,
      });
    }

    if (!baseUrl || !jiraPat) {
      return res.status(400).json({
        error: 'Jira credentials not configured. Please configure settings in the Settings page.'
      });
    }

    // JQL запрос для получения всех задач проекта
    const jql = `project = "${projectKey.trim()}" ORDER BY created DESC`;

    // Для Jira Server/Data Center используем POST запрос с телом (более надежно)
    // Пробуем разные версии API
    let url = `${baseUrl}/rest/api/2/search`;
    let apiVersion = '2';
    let usePost = true; // Используем POST по умолчанию для надежности

    // Если указано использовать v3, пробуем его
    if (process.env.JIRA_API_VERSION === '3') {
      url = `${baseUrl}/rest/api/3/search`;
      apiVersion = '3';
    }

    let authHeader;
    try {
      authHeader = getAuthHeader(jiraPat);
    } catch (authError) {
      console.error('Ошибка создания заголовка авторизации:', authError);
      return res.status(400).json({
        error: 'Ошибка создания заголовка авторизации',
        message: authError.message,
      });
    }

    console.log('Jira API Issues Request:', {
      url,
      jql,
      apiVersion,
      method: usePost ? 'POST' : 'GET',
      authType: 'Bearer',
      baseUrl,
      hasPat: !!jiraPat,
      patLength: jiraPat ? jiraPat.length : 0,
      authHeaderPreview: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
    });

    // Используем POST запрос с телом для более надежной работы с Jira Server/Data Center
    const requestBody = {
      jql: jql,
      maxResults: 100,
      fields: ['*all'], // Получаем все поля
      expand: ['renderedFields', 'names', 'schema'], // Расширяем ответ для получения дополнительной информации
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check', // Может помочь для некоторых версий Jira
      },
      body: JSON.stringify(requestBody),
    });

    // Сначала читаем ответ как текст
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // Формируем полный ответ с информацией о запросе и ответе
    const issuesResponse = {
      request: {
        url,
        method: 'POST',
        jql,
        projectKey,
        apiVersion,
        requestBody,
        authType: 'Bearer',
        headers: {
          'Authorization': authHeader.substring(0, 20) + '...', // Показываем только начало токена
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Atlassian-Token': 'no-check',
        },
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        contentType,
        headers: Object.fromEntries(response.headers.entries()),
      },
      body: null,
      rawBody: responseText.substring(0, 5000), // Ограничиваем размер для безопасности
      isHtml: contentType.includes('text/html'),
    };

    // Проверяем статус ответа перед парсингом
    if (response.status === 401) {
      issuesResponse.authError = true;
      issuesResponse.errorMessage = 'Ошибка авторизации (401). Проверьте правильность email и PAT (Personal Access Token).';

      // Пытаемся найти дополнительную информацию в ответе
      if (contentType.includes('application/json')) {
        try {
          issuesResponse.body = JSON.parse(responseText);
          if (issuesResponse.body.errorMessages) {
            issuesResponse.errorMessage = issuesResponse.body.errorMessages.join(', ');
          }
        } catch (e) {
          // Игнорируем ошибку парсинга
        }
      }
    }

    // Пытаемся распарсить как JSON, если это возможно
    if (contentType.includes('application/json')) {
      try {
        issuesResponse.body = JSON.parse(responseText);
        console.log('Jira API Response parsed successfully:', {
          status: response.status,
          hasIssues: !!issuesResponse.body?.issues,
          issuesCount: issuesResponse.body?.issues?.length || 0,
          total: issuesResponse.body?.total,
          errorMessages: issuesResponse.body?.errorMessages,
          errors: issuesResponse.body?.errors,
        });
      } catch (parseError) {
        issuesResponse.parseError = parseError.message;
        console.error('Ошибка парсинга ответа от Jira:', parseError);
        console.error('Response text (first 500 chars):', responseText.substring(0, 500));
      }
    } else if (contentType.includes('text/html')) {
      // Если пришел HTML, пытаемся найти причину в ответе
      if (response.status === 401) {
        issuesResponse.htmlError = 'Jira вернул HTML вместо JSON (401 Unauthorized). Проверьте правильность email и PAT (Personal Access Token). Убедитесь, что используете API Token, а не пароль.';
      } else {
        issuesResponse.htmlError = 'Jira вернул HTML вместо JSON. Возможные причины: неправильная версия API, проблема с правами доступа, или Jira Server не поддерживает этот endpoint.';
      }

      // Пытаемся найти ошибку в HTML
      const errorMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i) ||
        responseText.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
        responseText.match(/error[^>]*>([^<]+)/i);
      if (errorMatch) {
        issuesResponse.htmlErrorTitle = errorMatch[1];
      }
    }

    // Возвращаем полный ответ независимо от статуса
    res.status(200).json(issuesResponse);
  } catch (error) {
    console.error('Error fetching Jira issues:', error);
    res.status(500).json({
      error: 'Failed to fetch Jira issues',
      message: error.message,
      stack: error.stack,
    });
  }
});

// Получение детальной информации о конкретной задаче
router.get('/issue/:issueKey', async (req, res) => {
  try {
    // Получаем userId из query параметров
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required. Please provide userId query parameter.'
      });
    }

    // Получаем настройки пользователя из базы данных
    let baseUrl = null;
    let jiraPat = null;

    try {
      const settingsResult = await pool.query(
        'SELECT jira_base_url, jira_pat FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        baseUrl = normalizeBaseUrl(settings.jira_base_url);
        jiraPat = getDecryptedJiraPat(settings.jira_pat);
      }
    } catch (dbError) {
      console.error('Ошибка получения настроек из БД:', dbError);
      return res.status(500).json({
        error: 'Ошибка получения настроек из базы данных',
        message: dbError.message,
      });
    }

    if (!baseUrl || !jiraPat) {
      return res.status(400).json({
        error: 'Jira credentials not configured. Please configure settings in the Settings page.'
      });
    }

    const { issueKey } = req.params;

    // Пробуем разные версии API
    let url = `${baseUrl}/rest/api/2/issue/${issueKey}?expand=renderedFields`;
    let apiVersion = '2';

    if (process.env.JIRA_API_VERSION === '3') {
      url = `${baseUrl}/rest/api/3/issue/${issueKey}?expand=renderedFields`;
      apiVersion = '3';
    }

    let authHeader;
    try {
      authHeader = getAuthHeader(jiraPat);
    } catch (authError) {
      console.error('Ошибка создания заголовка авторизации:', authError);
      return res.status(400).json({
        error: 'Ошибка создания заголовка авторизации',
        message: authError.message,
      });
    }

    console.log('Jira API Issue Details Request:', {
      url,
      issueKey,
      apiVersion,
      hasPat: !!jiraPat,
      patLength: jiraPat ? jiraPat.length : 0,
      authType: 'Bearer',
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
    });

    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // Специальная обработка для 401
    if (response.status === 401) {
      if (contentType.includes('text/html')) {
        return res.status(401).json({
          error: 'Ошибка авторизации (401). Jira вернул HTML вместо JSON. Проверьте правильность email и PAT (Personal Access Token). Убедитесь, что используете API Token, а не пароль.',
          statusCode: 401,
          details: 'Проверьте настройки подключения к Jira в разделе Настройки.',
        });
      }

      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { raw: responseText };
      }

      return res.status(401).json({
        error: 'Ошибка авторизации (401). Проверьте правильность email и PAT (Personal Access Token).',
        statusCode: 401,
        details: errorData.errorMessages?.join(', ') || errorData.errors || errorData.message || 'Проверьте настройки подключения к Jira в разделе Настройки.',
      });
    }

    if (!contentType.includes('application/json')) {
      return res.status(response.status || 500).json({
        error: `Jira API вернул не-JSON ответ (${contentType})`,
        statusCode: response.status,
        details: responseText.substring(0, 2000),
      });
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { raw: responseText };
      }

      return res.status(response.status).json({
        error: `Jira API error: ${response.statusText}`,
        statusCode: response.status,
        details: errorData.errorMessages || errorData.errors || errorData.message || responseText.substring(0, 2000),
      });
    }

    let issue;
    try {
      issue = JSON.parse(responseText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Не удалось распарсить ответ от Jira API',
        details: responseText.substring(0, 2000),
      });
    }

    const fields = issue.fields;

    // Получаем родительскую задачу/эпик
    let parentKey = null;
    let parentSummary = null;
    let parentType = null;
    let parentIconUrl = null;

    if (fields.parent) {
      parentKey = fields.parent.key;
      parentSummary = fields.parent.fields?.summary || null;
      parentType = fields.parent.fields?.issuetype?.name || null;
      parentIconUrl = fields.parent.fields?.issuetype?.iconUrl || null;
    }

    // Определяем эпик через customfield_10000 (для историй и задач)
    let epicKey = null;
    let epicSummary = null;
    let epicType = 'Epic'; // По умолчанию тип эпика
    let epicIconUrl = null;

    const issueType = fields.issuetype?.name || '';
    const normalizedIssueType = issueType.toLowerCase().trim();
    const isEpic = normalizedIssueType === 'epic';
    const isSubtask = normalizedIssueType === 'sub-task' || normalizedIssueType === 'subtask' || normalizedIssueType === 'подзадача';

    // Для подзадач не ищем эпик, для историй и задач - ищем
    if (!isSubtask && fields.customfield_10000) {
      if (typeof fields.customfield_10000 === 'string') {
        if (fields.customfield_10000.match(/^[A-Z]+-\d+$/)) {
          epicKey = fields.customfield_10000;
        }
      } else if (fields.customfield_10000 && typeof fields.customfield_10000 === 'object') {
        epicKey = fields.customfield_10000.key || null;
        // Пытаемся получить информацию об эпике из объекта
        if (fields.customfield_10000.fields) {
          epicSummary = fields.customfield_10000.fields.summary || null;
          epicType = fields.customfield_10000.fields.issuetype?.name || 'Epic';
          epicIconUrl = fields.customfield_10000.fields.issuetype?.iconUrl || null;
        }
      }

    }

    // Получаем дочерние подзадачи
    const subtasks = fields.subtasks || [];
    const subtaskLinks = subtasks.map(subtask => ({
      key: subtask.key,
      summary: subtask.fields?.summary || subtask.summary || '',
      issueType: {
        name: subtask.fields?.issuetype?.name || subtask.issuetype?.name || 'Sub-task',
        iconUrl: subtask.fields?.issuetype?.iconUrl || subtask.issuetype?.iconUrl || '',
      },
    }));

    // Получаем ссылки на файлы (вложения)
    const attachments = fields.attachment || [];
    const fileLinks = attachments.map(att => ({
      filename: att.filename,
      url: att.content,
      size: att.size,
      mimeType: att.mimeType,
    }));

    const issueData = {
      key: issue.key,
      summary: fields.summary,
      description: fields.description || '',
      descriptionHtml: issue.renderedFields?.description || '',
      issueType: {
        name: fields.issuetype?.name || 'Unknown',
        iconUrl: fields.issuetype?.iconUrl || '',
      },
      creator: {
        displayName: fields.creator?.displayName || 'Unknown',
        emailAddress: fields.creator?.emailAddress || '',
        avatarUrls: fields.creator?.avatarUrls || {},
      },
      assignee: fields.assignee ? {
        displayName: fields.assignee.displayName || 'Unassigned',
        emailAddress: fields.assignee.emailAddress || '',
        avatarUrls: fields.assignee.avatarUrls || {},
      } : null,
      created: fields.created,
      updated: fields.updated,
      status: {
        name: fields.status?.name || 'Unknown',
        statusCategory: fields.status?.statusCategory?.name || 'Unknown',
      },
      parentKey,
      parentSummary,
      parentType,
      parentIconUrl,
      epicKey,
      epicSummary,
      epicType,
      epicIconUrl,
      priority: fields.priority ? {
        name: fields.priority.name,
        iconUrl: fields.priority.iconUrl,
      } : null,
      attachments: fileLinks,
      subtasks: subtaskLinks,
      url: `${baseUrl}/browse/${issue.key}`,
      jiraBaseUrl: baseUrl,
    };

    // Если это эпик, получаем вложенные задачи
    if (isEpic) {
      try {
        // Извлекаем project key из ключа задачи (например, GGBLOCKS-2 -> GGBLOCKS)
        const projectKey = issue.key.split('-')[0];
        
        // Используем JQL для поиска задач, связанных с этим эпиком через "Epic Link"
        const jql = `project = ${projectKey} AND "Epic Link" = ${issue.key} ORDER BY summary ASC`;
        const searchUrl = `${baseUrl}/rest/api/2/search`;

        console.log('Fetching epic tasks:', { epicKey: issue.key, projectKey, jql });

        const searchResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Atlassian-Token': 'no-check',
          },
          body: JSON.stringify({
            jql: jql,
            maxResults: 100,
            fields: ['key', 'summary', 'issuetype', 'status'],
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.issues && Array.isArray(searchData.issues)) {
            issueData.epicTasks = searchData.issues
              .filter(task => task.key !== issue.key) // Исключаем сам эпик
              .map(task => ({
                key: task.key,
                summary: task.fields?.summary || '',
                issueType: {
                  name: task.fields?.issuetype?.name || 'Unknown',
                  iconUrl: task.fields?.issuetype?.iconUrl || '',
                },
                status: {
                  name: task.fields?.status?.name || 'Unknown',
                },
              }));
            console.log('Epic tasks found:', issueData.epicTasks.length);
          } else {
            issueData.epicTasks = [];
          }
        } else {
          const errorText = await searchResponse.text();
          console.error('Error fetching epic tasks:', searchResponse.status, searchResponse.statusText, errorText.substring(0, 500));
          issueData.epicTasks = [];
        }
      } catch (epicTasksError) {
        console.error('Ошибка получения задач эпика:', epicTasksError);
        // Не прерываем выполнение, просто не добавляем задачи эпика
        issueData.epicTasks = [];
      }
    } else {
      issueData.epicTasks = [];
    }

    res.json(issueData);
  } catch (error) {
    console.error('Error fetching Jira issue:', error);
    res.status(500).json({
      error: 'Failed to fetch Jira issue',
      message: error.message
    });
  }
});

// Получение задач эпика
router.get('/epic/:epicKey/tasks', async (req, res) => {
  try {
    const { epicKey } = req.params;
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required. Please provide userId query parameter.'
      });
    }

    // Получаем настройки пользователя из базы данных
    let baseUrl = null;
    let jiraPat = null;

    try {
      const settingsResult = await pool.query(
        'SELECT jira_base_url, jira_pat FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        baseUrl = normalizeBaseUrl(settings.jira_base_url);
        jiraPat = getDecryptedJiraPat(settings.jira_pat);
      }
    } catch (dbError) {
      console.error('Ошибка получения настроек из БД:', dbError);
      return res.status(500).json({
        error: 'Ошибка получения настроек из базы данных',
        message: dbError.message,
      });
    }

    if (!baseUrl || !jiraPat) {
      return res.status(400).json({
        error: 'Jira credentials not configured. Please configure settings in the Settings page.'
      });
    }

    // Извлекаем project key из ключа эпика
    const projectKey = epicKey.split('-')[0];

    // Используем JQL для поиска задач, связанных с этим эпиком через "Epic Link"
    const jql = `project = ${projectKey} AND "Epic Link" = ${epicKey} ORDER BY summary ASC`;
    const searchUrl = `${baseUrl}/rest/api/2/search`;

    let authHeader;
    try {
      authHeader = getAuthHeader(jiraPat);
    } catch (authError) {
      console.error('Ошибка создания заголовка авторизации:', authError);
      return res.status(400).json({
        error: 'Ошибка создания заголовка авторизации',
        message: authError.message,
      });
    }

    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 100,
        fields: ['key', 'summary', 'description', 'issuetype', 'status'],
      }),
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Ошибка получения задач эпика:', searchResponse.status, errorText);
      return res.status(searchResponse.status).json({
        error: 'Ошибка получения задач эпика',
        details: errorText,
        statusCode: searchResponse.status,
      });
    }

    const searchData = await searchResponse.json();
    if (searchData.issues && Array.isArray(searchData.issues)) {
      const tasks = searchData.issues
        .filter(task => task.key !== epicKey) // Исключаем сам эпик
        .map(task => ({
          key: task.key,
          summary: task.fields?.summary || '',
          description: task.fields?.description || '',
          issueType: {
            name: task.fields?.issuetype?.name || 'Unknown',
          },
          status: {
            name: task.fields?.status?.name || 'Unknown',
          },
        }));

      res.json({
        success: true,
        epicKey: epicKey,
        tasks: tasks,
      });
    } else {
      res.json({
        success: true,
        epicKey: epicKey,
        tasks: [],
      });
    }
  } catch (error) {
    console.error('Ошибка получения задач эпика:', error);
    res.status(500).json({
      error: 'Ошибка получения задач эпика',
      message: error.message,
    });
  }
});

export default router;
