import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Button, 
  Title, 
  Text, 
  Group, 
  Box, 
  Paper, 
  Stack, 
  Loader, 
  Badge,
  Divider,
  Avatar,
  Anchor,
  Menu,
  Modal,
  ScrollArea,
} from '@mantine/core';
import { useAuth } from '../contexts/AuthContext';
import { notifications } from '@mantine/notifications';
import { getStatusColor, getIssueTypeColor } from '../utils/statusColors';

// Простые компоненты-заглушки для иконок
const IconExternalLink = ({ size = 16 }) => <span style={{ fontSize: size }}>↗</span>;
const IconFile = ({ size = 16 }) => <span style={{ fontSize: size }}>📄</span>;

const API_BASE = 'http://localhost:3001';

/** Переписывает img src в HTML описания на прокси-URL для загрузки с авторизацией Jira */
function rewriteDescriptionHtmlImages(html, jiraBaseUrl, userId) {
  if (!html || !jiraBaseUrl || !userId) return html;
  const base = (jiraBaseUrl || '').replace(/\/+$/, '');
  return html.replace(/<img([^>]*)\ssrc="([^"]+)"([^>]*)>/gi, (full, before, src, after) => {
    let url = src.trim();
    if (url.startsWith('/')) {
      url = base + url;
    } else if (!url.startsWith('http')) {
      return full;
    }
    if (url.startsWith(base)) {
      const proxySrc = `${API_BASE}/api/jira/proxy?url=${encodeURIComponent(url)}&userId=${encodeURIComponent(userId)}`;
      return `<img${before} src="${proxySrc}" data-full-src="${proxySrc}" data-inline-image="true"${after}>`;
    }
    return full;
  });
}

export function IssueDetails() {
  const { issueKey } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slopModalOpened, setSlopModalOpened] = useState(false);
  const [slopResponse, setSlopResponse] = useState('');
  const [slopLoading, setSlopLoading] = useState(false);
  const [imageModalOpened, setImageModalOpened] = useState(false);
  const [imageModalSrc, setImageModalSrc] = useState('');
  const descriptionRef = useRef(null);

  useEffect(() => {
    if (issueKey) {
      fetchIssueDetails(issueKey);
    }
  }, [issueKey]);

  const descriptionHtmlWithImages = useMemo(() => {
    if (!issue?.descriptionHtml) return '';
    return rewriteDescriptionHtmlImages(issue.descriptionHtml, issue.jiraBaseUrl, user?.id);
  }, [issue?.descriptionHtml, issue?.jiraBaseUrl, user?.id]);

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    const onDescClick = (e) => {
      const img = e.target.closest?.('img[data-inline-image="true"]') || (e.target.tagName === 'IMG' && e.target.dataset?.inlineImage === 'true' ? e.target : null);
      if (img) {
        e.preventDefault();
        const src = img.dataset?.fullSrc || img.src;
        if (src) {
          setImageModalSrc(src);
          setImageModalOpened(true);
        }
      }
    };
    el.addEventListener('click', onDescClick);
    return () => el.removeEventListener('click', onDescClick);
  }, [descriptionHtmlWithImages]);

  const handleSlopClick = async () => {
    if (!issue || !user) {
      notifications.show({
        title: 'Ошибка',
        message: 'Данные задачи не загружены',
        color: 'red',
      });
      return;
    }

    setSlopLoading(true);
    setSlopModalOpened(true);
    setSlopResponse('Загрузка данных и генерация ответа...');

    try {
      const epicKey =
        issue.issueType?.name?.toLowerCase() === 'epic'
          ? issue.key
          : issue.epicKey || null;

      let systemPrompt;
      let userMessage = `Название задачи: ${issue.summary}. Описание задачи: ${issue.description || 'Описание отсутствует'}`;

      if (epicKey) {
        // Задача в эпике: подгружаем эпик и все задачи эпика
        setSlopResponse('Загрузка данных эпика и генерация ответа...');

        let epicData = null;
        if (issue.issueType?.name?.toLowerCase() === 'epic') {
          epicData = {
            key: issue.key,
            summary: issue.summary,
            description: issue.description || '',
            issueType: issue.issueType,
          };
        } else {
          try {
            const epicResponse = await fetch(
              `http://localhost:3001/api/jira/issue/${epicKey}?userId=${user.id}`
            );
            const epicResponseData = await epicResponse.json();
            if (epicResponse.ok) {
              epicData = {
                key: epicResponseData.key,
                summary: epicResponseData.summary,
                description: epicResponseData.description || '',
                issueType: epicResponseData.issueType,
              };
            }
          } catch (epicErr) {
            console.warn('Не удалось получить данные эпика:', epicErr);
          }
        }

        const epicTasksResponse = await fetch(
          `http://localhost:3001/api/jira/epic/${epicKey}/tasks?userId=${user.id}`
        );
        const epicTasksData = await epicTasksResponse.json();

        if (!epicTasksResponse.ok) {
          throw new Error(epicTasksData.error || 'Ошибка получения задач эпика');
        }

        const tasks = epicTasksData.tasks || [];

        systemPrompt =
          'Ты senior-level системный аналитик. В запросе пользователя тебе будет передано название и описание задачи на разработку. Используй название и описание всех задач этого эпика чтобы сформулировать свои предложения по написанию текста задачи или составлению его с нуля.\n';

        if (epicData) {
          systemPrompt += `${epicData.issueType.name} ${epicData.key} ${epicData.summary} ${epicData.description}\n`;
        }
        tasks.forEach((task) => {
          systemPrompt += `${task.issueType.name} ${task.key} ${task.summary} ${task.description || ''}\n`;
        });
      } else {
        // Задача не в эпике: передаём только название и описание открытой задачи
        systemPrompt =
          'Ты senior-level системный аналитик. В запросе пользователя тебе будет передано название и описание задачи на разработку. Сформулируй предложения по написанию текста задачи или составлению его с нуля.';
      }

      const gigachatResponse = await fetch('http://localhost:3001/api/gigachat/slop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          systemPrompt,
          userMessage,
          model: 'GigaChat-2',
        }),
      });

      const gigachatData = await gigachatResponse.json();

      if (!gigachatResponse.ok) {
        throw new Error(gigachatData.error || 'Ошибка генерации ответа');
      }

      setSlopResponse(gigachatData.response || 'Ответ не получен');
    } catch (err) {
      console.error('Ошибка при вызове Slop!:', err);
      setSlopResponse(`Ошибка: ${err.message}`);
      notifications.show({
        title: 'Ошибка',
        message: err.message,
        color: 'red',
      });
    } finally {
      setSlopLoading(false);
    }
  };

  const fetchIssueDetails = async (key) => {
    setLoading(true);
    setError(null);
    try {
      const userId = user?.id ? `?userId=${user.id}` : '';
      const response = await fetch(`http://localhost:3001/api/jira/issue/${key}${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при загрузке деталей задачи');
      }

      setIssue(data);
    } catch (err) {
      setError(err.message);
      notifications.show({
        title: 'Ошибка',
        message: err.message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Не указано';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
      <Box style={{ marginTop: '70px', padding: '20px', flex: 1, width: '100vw', maxWidth: '100%', marginLeft: 0, marginRight: 0, boxSizing: 'border-box' }}>
        <Paper shadow="sm" p="md" radius="md" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="lg" />
            </Group>
          ) : error ? (
            <Stack gap="md">
              <Text c="red" fw={600}>Ошибка загрузки задачи</Text>
              <Text size="sm" c="dimmed">{error}</Text>
              <Button onClick={() => navigate('/dashboard')} variant="light">
                Вернуться к списку задач
              </Button>
            </Stack>
          ) : issue ? (
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Title order={2} mb="md">
                    {issue.key}: {issue.summary}
                  </Title>
                  <Group gap="md">
                    <Badge 
                      variant="light" 
                      color={getIssueTypeColor(issue.issueType.name)} 
                      size="lg"
                      leftSection={
                        issue.issueType.iconUrl ? (
                          <img 
                            src={issue.issueType.iconUrl} 
                            alt={issue.issueType.name}
                            style={{ width: 18, height: 18, marginRight: 6 }}
                          />
                        ) : null
                      }
                    >
                      {issue.issueType.name}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      size="lg"
                      color={getStatusColor(issue.issueType.name, issue.status.name)}
                    >
                      {issue.status.name}
                    </Badge>
                    {issue.priority && (
                      <Badge variant="dot" size="lg">
                        {issue.priority.name}
                      </Badge>
                    )}
                    {/* Родительская задача для подзадач */}
                    {issue.parentKey && (
                      <Badge
                        variant="light"
                        color={getIssueTypeColor(issue.parentType)}
                        size="lg"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/issue/${issue.parentKey}`)}
                        leftSection={
                          issue.parentIconUrl ? (
                            <img
                              src={issue.parentIconUrl}
                              alt={issue.parentType || 'Parent'}
                              style={{ width: 18, height: 18, marginRight: 6 }}
                            />
                          ) : null
                        }
                      >
                        Parent: {issue.parentKey}
                      </Badge>
                    )}
                    {/* Родительский эпик для историй и задач */}
                    {issue.epicKey && !issue.parentKey && (
                      <Badge
                        variant="light"
                        color={getIssueTypeColor('Epic')}
                        size="lg"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/issue/${issue.epicKey}`)}
                        leftSection={
                          issue.epicIconUrl ? (
                            <img
                              src={issue.epicIconUrl}
                              alt="Epic"
                              style={{ width: 18, height: 18, marginRight: 6 }}
                            />
                          ) : null
                        }
                      >
                        Epic: {issue.epicKey}
                      </Badge>
                    )}
                  </Group>
                </Box>
                <Button 
                  variant="light" 
                  onClick={() => navigate('/dashboard')}
                >
                  Назад к списку
                </Button>
              </Group>

              <Divider />

              <Group gap="md">
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} mb={4}>Автор</Text>
                  <Group gap="xs">
                    <Avatar src={issue.creator.avatarUrls?.['24x24']} size="sm" />
                    <Text size="sm">{issue.creator.displayName}</Text>
                  </Group>
                </Box>

                {issue.assignee && (
                  <Box style={{ flex: 1 }}>
                    <Text size="sm" fw={600} mb={4}>Исполнитель</Text>
                    <Group gap="xs">
                      <Avatar src={issue.assignee.avatarUrls?.['24x24']} size="sm" />
                      <Text size="sm">{issue.assignee.displayName}</Text>
                    </Group>
                  </Box>
                )}
              </Group>

              {issue.parentKey && (
                <Box>
                  <Text size="sm" fw={600} mb={4}>Родительская задача</Text>
                  <Group gap="xs">
                    <Badge
                      variant="light"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/issue/${issue.parentKey}`)}
                    >
                      {issue.parentKey}
                    </Badge>
                    {issue.parentSummary && (
                      <Text size="sm" c="dimmed">
                        {issue.parentSummary}
                      </Text>
                    )}
                  </Group>
                </Box>
              )}

              <Divider />

              <Group gap="md">
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} mb={4}>Дата создания</Text>
                  <Text size="sm">{formatDate(issue.created)}</Text>
                </Box>

                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} mb={4}>Дата обновления</Text>
                  <Text size="sm">{formatDate(issue.updated)}</Text>
                </Box>
              </Group>

              <Divider />

              <Box>
                <Text size="sm" fw={600} mb={4}>Описание</Text>
                {issue.descriptionHtml ? (
                  <Box
                    ref={descriptionRef}
                    component="div"
                    dangerouslySetInnerHTML={{
                      __html: descriptionHtmlWithImages || issue.descriptionHtml,
                    }}
                    style={{
                      border: '1px solid #e9ecef',
                      borderRadius: '4px',
                      padding: '12px',
                      backgroundColor: '#f8f9fa',
                    }}
                    className="issue-description-content"
                  />
                ) : issue.description ? (
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {issue.description}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">Описание отсутствует</Text>
                )}
              </Box>

              {issue.attachments && issue.attachments.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Text size="sm" fw={600} mb={4}>Вложения</Text>
                    <Stack gap="xs">
                      {issue.attachments.map((attachment, idx) => (
                        <Group key={idx} gap="xs">
                          <IconFile size={16} />
                          <Anchor
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                          >
                            {attachment.filename}
                          </Anchor>
                          <Text size="xs" c="dimmed">
                            ({(attachment.size / 1024).toFixed(2)} KB)
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  </Box>
                </>
              )}

              <Divider />

              <Group justify="flex-end">
                <Button
                  variant="filled"
                  color="violet"
                  onClick={handleSlopClick}
                  loading={slopLoading}
                  leftSection={
                    <Text fw={700} size="lg" style={{ lineHeight: 1 }}>
                      AI
                    </Text>
                  }
                >
                  Slop!
                </Button>
                <Anchor
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="light" rightSection={<IconExternalLink size={16} />}>
                    Открыть в Jira
                  </Button>
                </Anchor>
              </Group>

              {/* Дочерние подзадачи */}
              {issue.subtasks && issue.subtasks.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Text size="sm" fw={600} mb="md">Дочерние подзадачи</Text>
                    <Group gap="sm">
                      {issue.subtasks.map((subtask) => (
                        <Badge
                          key={subtask.key}
                          variant="light"
                          color={getIssueTypeColor(subtask.issueType?.name || 'Sub-task')}
                          size="lg"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/issue/${subtask.key}`)}
                          leftSection={
                            subtask.issueType?.iconUrl ? (
                              <img
                                src={subtask.issueType.iconUrl}
                                alt={subtask.issueType.name || 'Sub-task'}
                                style={{ width: 16, height: 16, marginRight: 6 }}
                              />
                            ) : null
                          }
                        >
                          {subtask.key}: {subtask.summary}
                        </Badge>
                      ))}
                    </Group>
                  </Box>
                </>
              )}

              {/* Задачи эпика */}
              {issue.epicTasks && issue.epicTasks.length > 0 && (() => {
                // Функция для получения порядка цвета статуса для сортировки (как на дашборде)
                const getStatusColorOrder = (issueType, statusName) => {
                  const color = getStatusColor(issueType, statusName);
                  // Порядок: gray (0), blue (1), green (2), red (3)
                  const colorOrder = { gray: 0, blue: 1, green: 2, red: 3 };
                  return colorOrder[color] || 0;
                };

                // Функция для извлечения номера из ключа задачи
                const getIssueNumber = (key) => {
                  if (!key) return 0;
                  const match = key.match(/-(\d+)$/);
                  return match ? parseInt(match[1], 10) : 0;
                };

                // Сортируем задачи по цвету статуса (как на дашборде)
                const sortedTasks = [...issue.epicTasks].sort((a, b) => {
                  const colorOrderA = getStatusColorOrder(a.issueType?.name || '', a.status?.name || '');
                  const colorOrderB = getStatusColorOrder(b.issueType?.name || '', b.status?.name || '');
                  
                  // Сначала по цвету статуса
                  if (colorOrderA !== colorOrderB) {
                    return colorOrderA - colorOrderB;
                  }
                  
                  // Если цвета одинаковые, сортируем по номеру задачи
                  return getIssueNumber(a.key) - getIssueNumber(b.key);
                });

                return (
                  <>
                    <Divider />
                    <Box>
                      <Text size="sm" fw={600} mb="md">Задачи эпика</Text>
                      <Stack gap={0}>
                        {sortedTasks.map((task) => (
                          <Group
                            key={task.key}
                            justify="space-between"
                            align="center"
                            wrap="nowrap"
                            p="xs"
                            style={{
                              cursor: 'pointer',
                              borderRadius: '4px',
                              transition: 'background-color 0.2s',
                            }}
                            onClick={() => navigate(`/issue/${task.key}`)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <Badge
                              variant="light"
                              color={getIssueTypeColor(task.issueType?.name || 'Task')}
                              size="lg"
                              style={{
                                fontWeight: 'normal',
                                textTransform: 'none',
                              }}
                              leftSection={
                                task.issueType?.iconUrl ? (
                                  <img
                                    src={task.issueType.iconUrl}
                                    alt={task.issueType.name || 'Task'}
                                    style={{ width: 16, height: 16, marginRight: 6 }}
                                  />
                                ) : null
                              }
                            >
                              {task.key}: {task.summary}
                            </Badge>
                            <Badge
                              variant="light"
                              color={getStatusColor(task.issueType?.name || 'Task', task.status?.name || 'Unknown')}
                              size="lg"
                              style={{
                                fontWeight: 'normal',
                              }}
                            >
                              {task.status?.name || 'Unknown'}
                            </Badge>
                          </Group>
                        ))}
                      </Stack>
                    </Box>
                  </>
                );
              })()}
            </Stack>
          ) : null}
        </Paper>
      </Box>

      {/* Модальное окно для ответа GigaChat */}
      <Modal
        opened={slopModalOpened}
        onClose={() => !slopLoading && setSlopModalOpened(false)}
        title="Ответ GigaChat"
        size="xl"
        centered
        zIndex={1000}
        closeOnClickOutside={!slopLoading}
        closeOnEscape={!slopLoading}
      >
        <ScrollArea style={{ height: 400 }}>
          {slopLoading ? (
            <Stack align="center" justify="center" gap="md" style={{ minHeight: 360 }}>
              <Loader size="lg" type="dots" />
              <Text size="sm" c="dimmed">
                Ожидание ответа от нейросети...
              </Text>
            </Stack>
          ) : (
            <Box
              component="div"
              className="slop-markdown"
              style={{
                fontSize: 'var(--mantine-font-size-sm)',
                lineHeight: 1.6,
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <Text size="sm" mb="xs" component="p">{children}</Text>,
                  h1: ({ children }) => <Title order={3} mb="sm" mt="md">{children}</Title>,
                  h2: ({ children }) => <Title order={4} mb="xs" mt="sm">{children}</Title>,
                  h3: ({ children }) => <Title order={5} mb="xs" mt="sm">{children}</Title>,
                  ul: ({ children }) => <Text size="sm" component="ul" mb="xs" style={{ paddingLeft: 20 }}>{children}</Text>,
                  ol: ({ children }) => <Text size="sm" component="ol" mb="xs" style={{ paddingLeft: 20 }}>{children}</Text>,
                  li: ({ children }) => <Text size="sm" component="li" mb={4}>{children}</Text>,
                  code: ({ className, children }) =>
                    className ? (
                      <Box component="pre" p="xs" mb="xs" style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 4, overflow: 'auto' }}>
                        <Text size="xs" component="code" style={{ whiteSpace: 'pre' }}>{children}</Text>
                      </Box>
                    ) : (
                      <Text size="sm" component="code" style={{ background: 'var(--mantine-color-default-hover)', padding: '2px 6px', borderRadius: 4 }}>{children}</Text>
                    ),
                  blockquote: ({ children }) => (
                    <Text size="sm" component="blockquote" c="dimmed" style={{ borderLeft: '4px solid var(--mantine-color-default-border)', paddingLeft: 12, marginBottom: 8 }}>{children}</Text>
                  ),
                  a: ({ href, children }) => <Anchor size="sm" href={href} target="_blank" rel="noopener noreferrer">{children}</Anchor>,
                  strong: ({ children }) => <Text size="sm" component="strong" fw={700}>{children}</Text>,
                  table: ({ children }) => (
                    <ScrollArea type="auto" mb="xs">
                      <Box component="table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--mantine-font-size-sm)' }}>{children}</Box>
                    </ScrollArea>
                  ),
                  thead: ({ children }) => <Box component="thead">{children}</Box>,
                  tbody: ({ children }) => <Box component="tbody">{children}</Box>,
                  tr: ({ children }) => <Box component="tr" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>{children}</Box>,
                  th: ({ children }) => <Box component="th" style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>{children}</Box>,
                  td: ({ children }) => <Box component="td" style={{ padding: '8px 12px' }}>{children}</Box>,
                }}
              >
                {slopResponse || '—'}
              </ReactMarkdown>
            </Box>
          )}
        </ScrollArea>
        <Group justify="flex-end" mt="md">
          <Button onClick={() => setSlopModalOpened(false)} disabled={slopLoading}>
            Закрыть
          </Button>
        </Group>
      </Modal>

      {/* Модальное окно просмотра изображения из описания */}
      <Modal
        opened={imageModalOpened}
        onClose={() => setImageModalOpened(false)}
        withCloseButton
        size="auto"
        centered
        zIndex={1001}
        padding={0}
        styles={{
          body: { maxWidth: '95vw', maxHeight: '95vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
          content: { overflow: 'hidden' },
        }}
      >
        {imageModalSrc ? (
          <img
            src={imageModalSrc}
            alt="Просмотр"
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : null}
      </Modal>
    </Box>
  );
}
