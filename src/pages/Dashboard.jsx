import { useState, useEffect, useRef } from 'react';
import { 
  Button, 
  Title, 
  Text, 
  Group, 
  Box, 
  Paper, 
  Stack, 
  Loader, 
  Alert,
  ScrollArea,
  Badge,
  Collapse,
  ActionIcon,
  Avatar,
  Menu,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notifications } from '@mantine/notifications';
import { getStatusColor, getIssueTypeColor } from '../utils/statusColors';

// Простые компоненты-заглушки для иконок
const IconChevronDown = ({ size = 16 }) => <span style={{ fontSize: size }}>▼</span>;
const IconChevronUp = ({ size = 16 }) => <span style={{ fontSize: size }}>▲</span>;

export function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issues, setIssues] = useState(null);
  const [issuesError, setIssuesError] = useState(null);
  const [expandedEpics, setExpandedEpics] = useState(new Set());
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const hasLoadedIssuesRef = useRef(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Загружаем настройки при монтировании
    loadSettings();
  }, [user]);

  useEffect(() => {
    // Автоматически загружаем задачи, если настройки заполнены
    // Используем ref, чтобы предотвратить повторный вызов
    if (settings && areSettingsComplete(settings) && !loadingIssues && !hasLoadedIssuesRef.current) {
      hasLoadedIssuesRef.current = true;
      loadIssues();
    }
  }, [settings]);

  const loadSettings = async () => {
    if (!user?.id) return;

    setLoadingSettings(true);
    try {
      const response = await fetch(`http://localhost:3001/api/settings?userId=${user.id}`);
      const data = await response.json();

      if (response.ok) {
        setSettings({
          projectTag: data.projectTag,
          jiraPat: data.jiraPat,
          jiraBaseUrl: data.jiraBaseUrl,
        });
      } else {
        setSettings({
          projectTag: null,
          jiraPat: null,
          jiraBaseUrl: null,
        });
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
      setSettings({
        projectTag: null,
        jiraPat: null,
        jiraBaseUrl: null,
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  const areSettingsComplete = (settings) => {
    return settings.projectTag && 
           settings.jiraPat && 
           settings.jiraBaseUrl;
  };

  const getMissingSettings = (settings) => {
    const missing = [];
    if (!settings.projectTag) missing.push('Тег проекта');
    if (!settings.jiraPat) missing.push('PAT Jira');
    if (!settings.jiraBaseUrl) missing.push('Base URL Jira');
    return missing;
  };

  const loadIssues = async () => {
    if (!settings || !areSettingsComplete(settings)) {
      return;
    }

    // Предотвращаем повторный вызов, если уже идет загрузка
    if (loadingIssues) {
      return;
    }

    setLoadingIssues(true);
    setIssuesError(null);
    setIssues(null);

    try {
      const response = await fetch(
        `http://localhost:3001/api/jira/issues?projectKey=${encodeURIComponent(settings.projectTag.trim())}&userId=${user.id}`
      );
      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        data = { raw: responseText };
      }

      // Логируем ответ для отладки
      console.log('Jira API Response:', {
        httpStatus: response.status,
        jiraStatus: data.response?.status,
        hasBody: !!data.body,
        bodyType: typeof data.body,
        bodyKeys: data.body ? Object.keys(data.body) : [],
        isHtml: data.isHtml,
        htmlError: data.htmlError,
      });

      if (!response.ok) {
        throw {
          message: data.error || 'Ошибка при получении задач',
          statusCode: response.status,
          details: data.message || data.details || responseText,
        };
      }

      // Проверяем статус ответа от Jira API
      const jiraStatus = data.response?.status;
      if (jiraStatus && jiraStatus !== 200) {
        let errorMessage;
        
        // Специальная обработка для 401
        if (jiraStatus === 401) {
          errorMessage = data.errorMessage || 
                        data.body?.errorMessages?.join(', ') || 
                        data.htmlError ||
                        'Ошибка авторизации (401). Проверьте правильность email и PAT (Personal Access Token). Убедитесь, что используете API Token, а не пароль.';
        } else {
          errorMessage = data.body?.errorMessages?.join(', ') || 
                        (data.body?.errors && typeof data.body.errors === 'object' ? JSON.stringify(data.body.errors) : data.body?.errors) ||
                        data.htmlError || 
                        `Jira API вернул статус ${jiraStatus}`;
        }
        
        throw {
          message: errorMessage,
          statusCode: jiraStatus,
          details: data.rawBody || (typeof data.body === 'string' ? data.body : JSON.stringify(data.body)) || 'Дополнительная информация отсутствует',
        };
      }

      // Проверяем наличие HTML ошибки
      if (data.isHtml || data.htmlError) {
        const statusCode = data.response?.status || 'N/A';
        let errorMessage = data.htmlError || 'Jira вернул HTML вместо JSON';
        
        // Специальное сообщение для 401
        if (statusCode === 401) {
          errorMessage = 'Ошибка авторизации (401). Jira вернул HTML вместо JSON. Проверьте правильность email и PAT (Personal Access Token). Убедитесь, что используете API Token, а не пароль.';
        }
        
        throw {
          message: errorMessage,
          statusCode: statusCode,
          details: data.htmlErrorTitle || (data.rawBody?.substring(0, 500)) || 'Проверьте настройки подключения к Jira',
        };
      }

      // Проверяем, что получили JSON с задачами
      if (!data.body) {
        throw {
          message: 'Пустой ответ от Jira API',
          statusCode: data.response?.status || 'N/A',
          details: 'Ответ не содержит данных. Проверьте настройки подключения.',
        };
      }

      if (!data.body.issues || !Array.isArray(data.body.issues)) {
        // Пытаемся извлечь информацию об ошибке из ответа
        const errorMessages = data.body.errorMessages || [];
        const errors = data.body.errors || {};
        const parseError = data.parseError;
        
        let errorMessage = 'Некорректный формат ответа от сервера';
        if (errorMessages.length > 0) {
          errorMessage = errorMessages.join(', ');
        } else if (Object.keys(errors).length > 0) {
          errorMessage = Object.entries(errors).map(([key, value]) => `${key}: ${value}`).join(', ');
        } else if (parseError) {
          errorMessage = `Ошибка парсинга: ${parseError}`;
        }
        
        throw {
          message: errorMessage,
          statusCode: data.response?.status || 'N/A',
          details: `Ожидался массив issues в ответе. Структура ответа: ${JSON.stringify({
            hasBody: !!data.body,
            bodyKeys: data.body ? Object.keys(data.body) : [],
            bodyType: typeof data.body,
            sample: JSON.stringify(data.body).substring(0, 500),
          })}`,
        };
      }

      // Обрабатываем задачи и строим иерархию
      const processedIssues = processIssues(data.body.issues);
      setIssues(processedIssues);
      
      // Автоматически раскрываем все эпики и задачи
      const allEpicKeys = new Set(processedIssues.epics.map(e => e.key));
      const allTaskKeys = new Set(processedIssues.standaloneTasks.map(t => t.key));
      setExpandedEpics(allEpicKeys);
      setExpandedTasks(allTaskKeys);

      notifications.show({
        title: 'Задачи получены',
        message: `Найдено задач: ${data.body.total || 0}`,
        color: 'green',
      });
    } catch (err) {
      const errorInfo = {
        message: err.message || 'Произошла неизвестная ошибка',
        statusCode: err.statusCode || err.status || 'N/A',
        details: err.details || err.stack || 'Дополнительная информация отсутствует',
      };
      setIssuesError(errorInfo);
      notifications.show({
        title: `Ошибка ${errorInfo.statusCode}`,
        message: errorInfo.message,
        color: 'red',
      });
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Обработка задач для построения иерархии
  const processIssues = (issuesArray) => {
    const issuesMap = new Map();
    const epicKeys = new Set();
    
    // Сначала создаем карту всех задач и находим все эпики
    issuesArray.forEach(issue => {
      const fields = issue.fields;
      const issueType = fields.issuetype?.name || 'Unknown';
      
      if (issueType === 'Epic') {
        epicKeys.add(issue.key);
      }
      
      // Определяем родителя (для подзадач)
      const parentKey = fields.parent?.key || null;
      
      // Определяем эпик через customfield_10000 (номер родительского эпика)
      let epicKey = null;
      if (fields.customfield_10000) {
        // customfield_10000 может быть строкой с ключом эпика или объектом с полем key
        if (typeof fields.customfield_10000 === 'string') {
          // Если это строка, проверяем, что это похоже на ключ задачи (например, EPIC-123)
          if (fields.customfield_10000.match(/^[A-Z]+-\d+$/)) {
            epicKey = fields.customfield_10000;
          }
        } else if (fields.customfield_10000 && typeof fields.customfield_10000 === 'object') {
          // Если это объект, пытаемся получить key
          epicKey = fields.customfield_10000.key || null;
          // Если key нет, но есть значение, которое похоже на ключ
          if (!epicKey && typeof fields.customfield_10000 === 'string') {
            epicKey = fields.customfield_10000;
          }
        }
      }
      
      // Fallback на другие поля, если customfield_10000 не найден
      if (!epicKey) {
        if (fields.epicLink) {
          epicKey = typeof fields.epicLink === 'string' ? fields.epicLink : fields.epicLink.key;
        } else if (fields.customfield_10011) { // Стандартное поле Epic Link в некоторых версиях Jira
          epicKey = typeof fields.customfield_10011 === 'string' ? fields.customfield_10011 : fields.customfield_10011.key;
        } else {
          // Ищем в кастомных полях (проверяем все поля, которые могут содержать ключ эпика)
          for (const [fieldKey, fieldValue] of Object.entries(fields)) {
            if (fieldKey.toLowerCase().includes('epic') && fieldValue) {
              if (typeof fieldValue === 'string' && fieldValue.match(/^[A-Z]+-\d+$/)) {
                epicKey = fieldValue;
                break;
              } else if (fieldValue && typeof fieldValue === 'object' && fieldValue.key) {
                epicKey = fieldValue.key;
                break;
              }
            }
          }
        }
      }
      
      issuesMap.set(issue.key, {
        key: issue.key,
        summary: fields.summary,
        issueType: {
          name: issueType,
          iconUrl: fields.issuetype?.iconUrl || '',
        },
        parentKey, // Родитель для подзадач
        epicKey, // Эпик, к которому относится задача
        parentSummary: fields.parent?.fields?.summary || 
                      fields.parent?.summary ||
                      null,
        status: {
          name: fields.status?.name || 'Unknown',
        },
        children: [],
      });
    });

    // Функция для рекурсивного построения иерархии подзадач
    // Подзадача определяется по наличию parentKey
    const buildSubtaskHierarchy = (parentKey, allIssues) => {
      return Array.from(allIssues.values())
        .filter(issue => issue.parentKey === parentKey)
        .map(issue => ({
          ...issue,
          children: buildSubtaskHierarchy(issue.key, allIssues),
        }));
    };

    // Функция для построения иерархии историй и задач внутри эпика
    const buildEpicChildren = (epicKey, allIssues) => {
      return Array.from(allIssues.values())
        .filter(issue => {
          // Исключаем эпики
          const isEpic = issue.issueType.name === 'Epic';
          
          // Включаем только истории и задачи (не эпики, не подзадачи), которые:
          // 1. Не являются эпиками
          // 2. Не являются подзадачами (не имеют родителя - parentKey)
          // 3. Связаны с этим эпиком
          return !isEpic && 
                 !issue.parentKey && 
                 issue.epicKey === epicKey;
        })
        .map(task => ({
          ...task,
          // Добавляем подзадачи к истории или задаче
          children: buildSubtaskHierarchy(task.key, allIssues),
        }));
    };

    // Строим иерархию для эпиков: включаем истории и задачи, связанные с эпиком
    const epics = Array.from(epicKeys)
      .map(epicKey => {
        const epic = issuesMap.get(epicKey);
        if (!epic) return null;
        
        return {
          ...epic,
          children: buildEpicChildren(epicKey, issuesMap),
        };
      })
      .filter(epic => epic !== null);

    // Находим истории и задачи без эпиков и без родителей (standalone задачи)
    const standaloneTasks = Array.from(issuesMap.values())
      .filter(issue => {
        const isEpic = issue.issueType.name === 'Epic';
        
        // Включаем только истории и задачи, которые:
        // 1. Не являются эпиками
        // 2. Не являются подзадачами (не имеют родителя - parentKey)
        // 3. Не связаны с эпиком
        // 4. Не являются эпиками по ключу
        return !isEpic && 
               !issue.parentKey &&
               !issue.epicKey &&
               !epicKeys.has(issue.key);
      })
      .map(task => ({
        ...task,
        children: buildSubtaskHierarchy(task.key, issuesMap),
      }));

    // Функция для извлечения номера из ключа задачи (например, EPIC-123 -> 123)
    const getIssueNumber = (key) => {
      if (!key) return 0;
      const match = key.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Функция для получения порядка цвета статуса для сортировки
    const getStatusColorOrder = (issueType, statusName) => {
      const color = getStatusColor(issueType, statusName);
      // Порядок: gray (0), blue (1), green (2), red (3)
      const colorOrder = { gray: 0, blue: 1, green: 2, red: 3 };
      return colorOrder[color] || 0;
    };

    // Функция для сортировки задач по цвету статуса
    const sortTasksByStatusColor = (tasks) => {
      return [...tasks].sort((a, b) => {
        const colorOrderA = getStatusColorOrder(a.issueType.name, a.status.name);
        const colorOrderB = getStatusColorOrder(b.issueType.name, b.status.name);
        
        // Сначала по цвету статуса
        if (colorOrderA !== colorOrderB) {
          return colorOrderA - colorOrderB;
        }
        
        // Если цвета одинаковые, сортируем по номеру задачи
        return getIssueNumber(a.key) - getIssueNumber(b.key);
      });
    };

    // Сортируем эпики по номеру
    const sortedEpics = epics.sort((a, b) => {
      return getIssueNumber(a.key) - getIssueNumber(b.key);
    });

    // Сортируем задачи внутри каждого эпика по цвету статуса
    const sortedEpicsWithSortedTasks = sortedEpics.map(epic => ({
      ...epic,
      children: sortTasksByStatusColor(epic.children || []).map(task => ({
        ...task,
        // Рекурсивно сортируем подзадачи
        children: sortTasksByStatusColor(task.children || []),
      })),
    }));

    // Сортируем standalone задачи по цвету статуса
    const sortedStandaloneTasks = sortTasksByStatusColor(standaloneTasks).map(task => ({
      ...task,
      // Рекурсивно сортируем подзадачи
      children: sortTasksByStatusColor(task.children || []),
    }));

    return { epics: sortedEpicsWithSortedTasks, standaloneTasks: sortedStandaloneTasks };
  };

  // Функция для подсчета задач по типам
  const countIssuesByType = (issues) => {
    if (!issues) return { epics: 0, stories: 0, tasks: 0, subtasks: 0 };
    
    let epicsCount = 0;
    let storiesCount = 0;
    let tasksCount = 0;
    let subtasksCount = 0;
    
    // Рекурсивная функция для подсчета задач в дереве
    const countInTree = (items) => {
      if (!items || !Array.isArray(items)) return;
      
      items.forEach(item => {
        if (!item) return;
        
        const issueType = item.issueType?.name || '';
        const normalizedType = issueType.toLowerCase().trim();
        
        if (normalizedType === 'epic') {
          epicsCount++;
        } else if (normalizedType === 'story') {
          storiesCount++;
        } else if (normalizedType === 'task') {
          tasksCount++;
        } else if (normalizedType === 'sub-task' || normalizedType === 'subtask' || normalizedType === 'подзадача') {
          subtasksCount++;
        }
        
        // Рекурсивно обрабатываем детей
        if (item.children && Array.isArray(item.children) && item.children.length > 0) {
          countInTree(item.children);
        }
      });
    };
    
    // Подсчитываем эпики
    if (issues.epics && Array.isArray(issues.epics) && issues.epics.length > 0) {
      countInTree(issues.epics);
    }
    
    // Подсчитываем standalone задачи
    if (issues.standaloneTasks && Array.isArray(issues.standaloneTasks) && issues.standaloneTasks.length > 0) {
      countInTree(issues.standaloneTasks);
    }
    
    return { epics: epicsCount, stories: storiesCount, tasks: tasksCount, subtasks: subtasksCount };
  };

  const handleIssueClick = (issueKey) => {
    navigate(`/issue/${issueKey}`);
  };

  const toggleEpic = (epicKey) => {
    const newExpanded = new Set(expandedEpics);
    if (newExpanded.has(epicKey)) {
      newExpanded.delete(epicKey);
    } else {
      newExpanded.add(epicKey);
    }
    setExpandedEpics(newExpanded);
  };

  const toggleTask = (taskKey) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskKey)) {
      newExpanded.delete(taskKey);
    } else {
      newExpanded.add(taskKey);
    }
    setExpandedTasks(newExpanded);
  };

  const renderIssueItem = (issue, level = 0) => {
    const isEpic = issue.issueType.name === 'Epic';
    const isSubtask = issue.issueType.name === 'Sub-task' || 
                     issue.issueType.name === 'Subtask' ||
                     issue.issueType.name.toLowerCase() === 'подзадача';
    
    // Для эпика показываем только прямые дети (истории и задачи), не подзадачи
    // Для историй/задач показываем подзадачи
    const directChildren = isEpic 
      ? (issue.children || []).filter(child => {
          const childIsSubtask = child.issueType.name === 'Sub-task' || 
                                child.issueType.name === 'Subtask' ||
                                child.issueType.name.toLowerCase() === 'подзадача';
          return !childIsSubtask; // Показываем только истории и задачи, не подзадачи
        })
      : (issue.children || []); // Для историй/задач показываем все дети (подзадачи)
    
    const hasChildren = directChildren.length > 0;
    const isExpanded = isEpic ? expandedEpics.has(issue.key) : expandedTasks.has(issue.key);
    const indent = level * 20;

    return (
      <Box 
        key={issue.key} 
        style={{ 
          marginLeft: `${indent}px`, 
          marginBottom: '8px',
        }}
      >
        <Group 
          gap="xs" 
          align="flex-start" 
          wrap="nowrap"
          p="xs"
          style={{
            borderRadius: '4px',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
            e.stopPropagation();
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.stopPropagation();
          }}
        >
            {hasChildren && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => isEpic ? toggleEpic(issue.key) : toggleTask(issue.key)}
            >
              {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          )}
          {!hasChildren && <Box style={{ width: 24 }} />}
          
          <Badge
            variant="light"
            color={getIssueTypeColor(issue.issueType.name)}
            style={{ cursor: 'pointer', minWidth: '80px' }}
            onClick={() => handleIssueClick(issue.key)}
            leftSection={
              issue.issueType.iconUrl ? (
                <img 
                  src={issue.issueType.iconUrl} 
                  alt={issue.issueType.name}
                  style={{ width: 16, height: 16, marginRight: 4 }}
                />
              ) : null
            }
          >
            {issue.key}
          </Badge>
          
          <Text
            size="sm"
            style={{ 
              cursor: 'pointer', 
              flex: 1,
              fontWeight: isEpic ? 600 : 400,
            }}
            onClick={() => handleIssueClick(issue.key)}
          >
            {issue.summary}
          </Text>
          
          <Badge 
            variant="outline" 
            size="sm"
            color={getStatusColor(issue.issueType.name, issue.status.name)}
          >
            {issue.status.name}
          </Badge>
        </Group>

        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box style={{ marginTop: '8px', marginLeft: '32px' }}>
              {directChildren.map(child => renderIssueItem(child, level + 1))}
            </Box>
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100vw', margin: 0, padding: 0 }}>
      {/* Верхняя панель */}
      <Box
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100vw',
          height: 70,
          padding: '0 20px',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'white',
          zIndex: 100,
          boxSizing: 'border-box',
        }}
      >
        <Title 
          order={2} 
          c="violet" 
          fw={700}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
        >
          VibeProject
        </Title>
        <Group gap="md" style={{ marginLeft: 'auto' }}>
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Avatar
                src={null}
                alt={user?.email || 'Пользователь'}
                color="violet"
                radius="xl"
                style={{ cursor: 'pointer' }}
              >
                {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </Avatar>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>
                <Text size="sm" fw={500}>
                  {user?.email}
                </Text>
              </Menu.Label>
              <Menu.Divider />
              <Menu.Item
                onClick={() => navigate('/settings')}
              >
                Настройки
              </Menu.Item>
              <Menu.Item
                color="red"
                onClick={handleLogout}
              >
                Выйти
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>

      {/* Основной контент */}
      <Box style={{ marginTop: '70px', padding: '0', flex: 1, width: '100vw', maxWidth: '100%', marginLeft: 0, marginRight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Paper shadow="sm" p="md" radius="md" style={{ width: '100%', maxWidth: '100%', margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {loadingSettings && (
              <Group justify="center" p="xl">
                <Loader size="lg" />
              </Group>
            )}

            {!loadingSettings && settings && !areSettingsComplete(settings) && (
              <Alert color="yellow" title="Необходимо заполнить настройки">
                <Stack gap="xs">
                  <Text size="sm">
                    Для автоматической загрузки задач необходимо заполнить следующие настройки:
                  </Text>
                  <Box component="ul" style={{ margin: 0, paddingLeft: '20px' }}>
                    {getMissingSettings(settings).map((setting, index) => (
                      <li key={index}>
                        <Text size="sm">{setting}</Text>
                      </li>
                    ))}
                  </Box>
                  <Button 
                    variant="light" 
                    onClick={() => navigate('/settings')}
                    mt="md"
                  >
                    Перейти в настройки
                  </Button>
                </Stack>
              </Alert>
            )}

            {loadingIssues && (
              <Group justify="center" p="xl">
                <Loader size="lg" />
              </Group>
            )}

            {issuesError && (
              <Alert color="red" title={`Ошибка ${issuesError.statusCode}`}>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {issuesError.message}
                  </Text>
                  {issuesError.details && (
                    <Box>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>
                        Детали ошибки:
                      </Text>
                      <Text
                        size="xs"
                        style={{
                          fontFamily: 'monospace',
                          backgroundColor: 'rgba(0, 0, 0, 0.05)',
                          padding: '8px',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '200px',
                          overflow: 'auto',
                        }}
                      >
                        {issuesError.details}
                      </Text>
                    </Box>
                  )}
                  <Text size="xs" c="dimmed" mt={4}>
                    Код ошибки: {issuesError.statusCode}
                  </Text>
                </Stack>
              </Alert>
            )}

            {issues && !loadingIssues && (() => {
              const counts = countIssuesByType(issues);
              return (
                <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}>
                  <Text size="sm" c="dimmed" mb="md" style={{ flexShrink: 0 }}>
                    Epics: {counts.epics} Stories: {counts.stories} Tasks: {counts.tasks} Subtasks: {counts.subtasks}
                  </Text>

                  <ScrollArea style={{ flex: 1, minHeight: 0 }}>
                    <Stack gap="md">
                      {/* Эпики с подзадачами */}
                      {issues.epics && issues.epics.length > 0 && (
                        <Box>
                          <Title order={4} mb="sm">Эпики</Title>
                          {issues.epics.map(epic => renderIssueItem(epic, 0))}
                        </Box>
                      )}

                      {/* Отдельные задачи */}
                      {issues.standaloneTasks && issues.standaloneTasks.length > 0 && (
                        <Box>
                          <Title order={4} mb="sm">Задачи</Title>
                          {issues.standaloneTasks.map(task => renderIssueItem(task, 0))}
                        </Box>
                      )}

                      {(!issues.epics || issues.epics.length === 0) && 
                       (!issues.standaloneTasks || issues.standaloneTasks.length === 0) && (
                        <Text c="dimmed" ta="center" p="xl">
                          Задачи не найдены
                        </Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </Box>
              );
            })()}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
