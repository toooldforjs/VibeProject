import { useForm } from '@mantine/form';
import { TextInput, PasswordInput, Button, Paper, Title, Text, Stack, Anchor, Container } from '@mantine/core';
import { useNavigate, Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Некорректный email'),
      password: (value) => (value.length < 1 ? 'Введите пароль' : null),
    },
  });

  const handleSubmit = async (values) => {
    try {
      await login(values.email, values.password);
      notifications.show({
        title: 'Успешный вход!',
        message: 'Добро пожаловать! Вы успешно вошли в систему.',
        color: 'green',
        icon: '✓',
      });
      navigate('/dashboard');
    } catch (error) {
      // Определяем тип ошибки и показываем соответствующее уведомление
      if (error.errorType === 'USER_NOT_FOUND') {
        notifications.show({
          title: 'Пользователь не найден',
          message: 'Пользователь с таким email не зарегистрирован. Проверьте правильность введенного email или зарегистрируйтесь.',
          color: 'orange',
          icon: '⚠',
        });
      } else if (error.errorType === 'INVALID_PASSWORD') {
        notifications.show({
          title: 'Неверный пароль',
          message: 'Введен неверный пароль. Проверьте правильность ввода или воспользуйтесь восстановлением пароля.',
          color: 'red',
          icon: '✗',
        });
      } else {
        notifications.show({
          title: 'Ошибка входа',
          message: error.message || 'Произошла ошибка при входе. Попробуйте еще раз.',
          color: 'red',
          icon: '✗',
        });
      }
    }
  };

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      margin: 0,
      width: '100%',
      height: '100%'
    }}>
      <Container size="lg" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Paper shadow="xl" p="xl" radius="md" style={{ width: 400, maxWidth: 800 }}>
          <Stack gap="md">
            <Title order={1} ta="center" c="violet" fw={700} style={{ marginBottom: '10px' }}>
              VibeProject
            </Title>
            <Title order={2} ta="center">Вход</Title>
            <Text c="dimmed" size="sm" ta="center">
              Войдите в свой аккаунт
            </Text>

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="your@email.com"
                  size="md"
                  required
                  {...form.getInputProps('email')}
                />

                <PasswordInput
                  label="Пароль"
                  placeholder="Введите пароль"
                  size="md"
                  required
                  {...form.getInputProps('password')}
                />

                <Button type="submit" fullWidth mt="md">
                  Войти
                </Button>
              </Stack>
            </form>

            <Text ta="center" size="sm" mt="md">
              Нет аккаунта?{' '}
              <Anchor component={Link} to="/register" fw={700}>
                Зарегистрироваться
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Container>
    </div>
  );
}
