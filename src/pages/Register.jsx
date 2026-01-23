import { useForm } from '@mantine/form';
import { TextInput, PasswordInput, Button, Paper, Title, Text, Stack, Anchor, Container } from '@mantine/core';
import { useNavigate, Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext';

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Некорректный email'),
      password: (value) => (value.length < 6 ? 'Пароль должен содержать минимум 6 символов' : null),
      confirmPassword: (value, values) =>
        value !== values.password ? 'Пароли не совпадают' : null,
    },
  });

  const handleSubmit = (values) => {
    try {
      register(values.email, values.password);
      notifications.show({
        title: 'Успешная регистрация!',
        message: 'Вы успешно зарегистрированы.',
        color: 'green',
      });
      // Перенаправляем на страницу входа через небольшую задержку
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (error) {
      notifications.show({
        title: 'Ошибка регистрации',
        message: error.message,
        color: 'red',
      });
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
            <Title order={2} ta="center">Регистрация</Title>
            <Text c="dimmed" size="sm" ta="center">
              Создайте новый аккаунт
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
                  placeholder="Минимум 6 символов"
                  size="md"
                  required
                  {...form.getInputProps('password')}
                />

                <PasswordInput
                  label="Подтвердите пароль"
                  placeholder="Повторите пароль"
                  size="md"
                  required
                  {...form.getInputProps('confirmPassword')}
                />

                <Button type="submit" fullWidth mt="md">
                  Зарегистрироваться
                </Button>
              </Stack>
            </form>

            <Text ta="center" size="sm" mt="md">
              Уже есть аккаунт?{' '}
              <Anchor component={Link} to="/login" fw={700}>
                Войти
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Container>
    </div>
  );
}
