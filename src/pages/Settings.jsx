import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Stack,
  Title,
  TextInput,
  Button,
  Group,
  Text,
  Alert,
  Avatar,
  Menu,
  Loader,
} from '@mantine/core';
import { useAuth } from '../contexts/AuthContext';
import { notifications } from '@mantine/notifications';

export function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    projectTag: '',
    jiraPat: '',
    jiraBaseUrl: '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Загружаем настройки при монтировании компонента
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/settings?userId=${user.id}`);
      const data = await response.json();

      if (response.ok) {
        setFormData({
          projectTag: data.projectTag || '',
          jiraPat: data.jiraPat || '',
          jiraBaseUrl: data.jiraBaseUrl || '',
        });
      } else {
        notifications.show({
          title: 'Ошибка',
          message: data.error || 'Не удалось загрузить настройки',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Ошибка при загрузке настроек',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const response = await fetch('http://localhost:3001/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          ...formData,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        notifications.show({
          title: 'Успешно',
          message: 'Настройки сохранены',
          color: 'green',
        });
        // Перенаправляем на дашборд после сохранения
        navigate('/dashboard');
      } else {
        notifications.show({
          title: 'Ошибка',
          message: data.error || 'Не удалось сохранить настройки',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Ошибка',
        message: 'Ошибка при сохранении настроек',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
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
      <Box style={{ marginTop: '70px', padding: '20px', flex: 1, width: '100vw', maxWidth: '100%', marginLeft: 0, marginRight: 0, boxSizing: 'border-box' }}>
        <Paper shadow="sm" p="md" radius="md" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
          <Stack gap="md">
            <Title order={2}>Настройки</Title>
            
            <Text size="sm" c="dimmed">
              Настройте параметры подключения к Jira для автоматической загрузки задач.
            </Text>

            {loading && (
              <Group justify="center" p="xl">
                <Loader size="lg" />
              </Group>
            )}

            {!loading && (
              <>
            <TextInput
              label="Тег проекта"
              placeholder="Например: GGBLOCKS"
              value={formData.projectTag}
              onChange={(e) => setFormData({ ...formData, projectTag: e.target.value })}
              disabled={loading || saving}
            />

            <TextInput
              label="PAT (Personal Access Token) Jira"
              placeholder="Введите ваш Personal Access Token"
              type="password"
              value={formData.jiraPat}
              onChange={(e) => setFormData({ ...formData, jiraPat: e.target.value })}
              disabled={loading || saving}
              description="API Token из Jira. Создайте его в настройках аккаунта Jira: Account Settings → Security → API tokens"
            />

            <TextInput
              label="Base URL Jira"
              placeholder="https://your-company.atlassian.net"
              value={formData.jiraBaseUrl}
              onChange={(e) => setFormData({ ...formData, jiraBaseUrl: e.target.value })}
              disabled={loading || saving}
              description="Базовый URL вашего Jira (например: https://your-company.atlassian.net)"
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => navigate('/dashboard')}
                disabled={saving}
              >
                Отмена
              </Button>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={loading}
              >
                Сохранить
              </Button>
            </Group>
            </>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
