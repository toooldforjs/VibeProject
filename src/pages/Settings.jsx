import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
	Box,
	Paper,
	Stack,
	Title,
	TextInput,
	Textarea,
	Button,
	Group,
	Text,
	Avatar,
	Menu,
	Loader,
	Divider,
	Select,
} from "@mantine/core";
import { useAuth } from "../contexts/AuthContext";
import { notifications } from "@mantine/notifications";

export function Settings() {
	const navigate = useNavigate();
	const { user, logout } = useAuth();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formData, setFormData] = useState({
		projectTag: "",
		jiraPat: "",
		jiraBaseUrl: "",
		gigachatCredentials: "",
		gigachatScope: "",
		gigachatModel: "",
		gigachatTimeout: "",
		slopSystemPrompt: "",
		projectContext: "",
		projectContextType: "confluence",
		projectContextConfluenceUrl: "",
		confluenceUsername: "",
		confluencePassword: "",
	});

	useEffect(() => {
		if (!user) {
			navigate("/login");
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
					projectTag: data.projectTag || "",
					jiraPat: data.jiraPat || "",
					jiraBaseUrl: data.jiraBaseUrl || "",
					gigachatCredentials: data.gigachatCredentials || (data.gigachatCredentialsSet ? "••••••••••••" : ""),
					gigachatScope: data.gigachatScope || "",
					gigachatModel: data.gigachatModel || "",
					gigachatTimeout: data.gigachatTimeout ?? "",
					slopSystemPrompt: data.slopSystemPrompt ?? "",
					projectContext: data.projectContext ?? "",
					projectContextType: data.projectContextType === "text" ? "text" : "confluence",
					projectContextConfluenceUrl: data.projectContextConfluenceUrl ?? "",
					confluenceUsername: data.confluenceUsername ?? "",
					confluencePassword: data.confluencePassword ?? "",
				});
			} else {
				notifications.show({
					title: "Ошибка",
					message: data.error || "Не удалось загрузить настройки",
					color: "red",
				});
			}
		} catch (error) {
			notifications.show({
				title: "Ошибка",
				message: "Ошибка при загрузке настроек",
				color: "red",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleSave = async () => {
		if (!user?.id) return;

		setSaving(true);
		try {
			const response = await fetch("http://localhost:3001/api/settings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userId: user.id,
					projectTag: formData.projectTag,
					jiraPat: formData.jiraPat,
					jiraBaseUrl: formData.jiraBaseUrl,
					gigachatCredentials: formData.gigachatCredentials || undefined,
					gigachatScope: formData.gigachatScope || undefined,
					gigachatModel: formData.gigachatModel || undefined,
					gigachatTimeout: formData.gigachatTimeout !== "" ? formData.gigachatTimeout : undefined,
					slopSystemPrompt: formData.slopSystemPrompt,
					projectContext: formData.projectContext,
					projectContextType: formData.projectContextType,
					projectContextConfluenceUrl: formData.projectContextConfluenceUrl || undefined,
					confluenceUsername: formData.confluenceUsername || undefined,
					confluencePassword: formData.confluencePassword || undefined,
				}),
			});

			const data = await response.json();

			if (response.ok) {
				notifications.show({
					title: "Успешно",
					message: "Настройки сохранены",
					color: "green",
				});
			} else {
				notifications.show({
					title: "Ошибка",
					message: data.error || "Не удалось сохранить настройки",
					color: "red",
				});
			}
		} catch (error) {
			notifications.show({
				title: "Ошибка",
				message: "Ошибка при сохранении настроек",
				color: "red",
			});
		} finally {
			setSaving(false);
		}
	};

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	return (
		<Box
			style={{ minHeight: "100vh", display: "flex", flexDirection: "column", width: "100vw", margin: 0, padding: 0 }}
		>
			{/* Верхняя панель */}
			<Box
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					width: "100vw",
					height: 70,
					padding: "0 20px",
					borderBottom: "1px solid #e9ecef",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					backgroundColor: "white",
					zIndex: 100,
					boxSizing: "border-box",
				}}
			>
				<Title order={2} c="violet" fw={700} style={{ cursor: "pointer" }} onClick={() => navigate("/dashboard")}>
					VibeProject
				</Title>
				<Group gap="md" style={{ marginLeft: "auto" }}>
					<Menu shadow="md" width={200} position="bottom-end">
						<Menu.Target>
							<Avatar
								src={null}
								alt={user?.email || "Пользователь"}
								color="violet"
								radius="xl"
								style={{ cursor: "pointer" }}
							>
								{user?.email ? user.email.charAt(0).toUpperCase() : "U"}
							</Avatar>
						</Menu.Target>

						<Menu.Dropdown>
							<Menu.Label>
								<Text size="sm" fw={500}>
									{user?.email}
								</Text>
							</Menu.Label>
							<Menu.Divider />
							<Menu.Item onClick={() => navigate("/settings")}>Настройки</Menu.Item>
							<Menu.Item color="red" onClick={handleLogout}>
								Выйти
							</Menu.Item>
						</Menu.Dropdown>
					</Menu>
				</Group>
			</Box>

			{/* Основной контент */}
			<Box
				style={{
					marginTop: "70px",
					padding: "20px",
					flex: 1,
					width: "100vw",
					maxWidth: "100%",
					marginLeft: 0,
					marginRight: 0,
					boxSizing: "border-box",
				}}
			>
				<Paper shadow="sm" p="md" radius="md" style={{ width: "100%", maxWidth: "800px", margin: "0 auto" }}>
					<Stack gap="md">
						<Title order={2}>Настройки</Title>

						<Text size="sm" c="dimmed">
							Настройте параметры подключения к Jira и GigaChat. Данные сохраняются в базу и используются при запросах
							(ключ GigaChat хранится в зашифрованном виде).
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

								<Divider my="lg" />

								<Title order={4}>GigaChat API</Title>
								<Text size="sm" c="dimmed" mb="xs">
									Ключ и параметры сохраняются в БД в зашифрованном виде и используются при запросах к GigaChat (Slop! и
									др.).
								</Text>
								<TextInput
									label="Ключ авторизации (GIGACHAT_CREDENTIALS)"
									placeholder="Введите ключ из личного кабинета Studio"
									type="password"
									value={formData.gigachatCredentials}
									onChange={(e) => setFormData({ ...formData, gigachatCredentials: e.target.value })}
									disabled={loading || saving}
									description="Оставьте пустым или •••• чтобы не менять сохранённый ключ"
								/>
								<Select
									label="Версия API (GIGACHAT_SCOPE)"
									placeholder="Выберите scope"
									value={formData.gigachatScope || null}
									onChange={(v) => setFormData({ ...formData, gigachatScope: v || "" })}
									data={[
										{ value: "GIGACHAT_API_PERS", label: "GIGACHAT_API_PERS" },
										{ value: "GIGACHAT_API_B2B", label: "GIGACHAT_API_B2B" },
										{ value: "GIGACHAT_API_CORP", label: "GIGACHAT_API_CORP" },
									]}
									disabled={loading || saving}
									description="Тип доступа к API GigaChat"
									allowDeselect
									clearable
								/>
								<Select
									label="Модель (GIGACHAT_MODEL)"
									placeholder="Выберите модель"
									value={formData.gigachatModel || null}
									onChange={(v) => setFormData({ ...formData, gigachatModel: v || "" })}
									data={[
										{ value: "GigaChat-2", label: "GigaChat-2" },
										{ value: "GigaChat-2-Pro", label: "GigaChat-2-Pro" },
										{ value: "GigaChat-2-Max", label: "GigaChat-2-Max" },
									]}
									disabled={loading || saving}
									description="Модель GigaChat для запросов"
									allowDeselect
									clearable
								/>
								<TextInput
									label="Таймаут, сек (GIGACHAT_TIMEOUT)"
									placeholder="600"
									value={formData.gigachatTimeout}
									onChange={(e) => setFormData({ ...formData, gigachatTimeout: e.target.value })}
									disabled={loading || saving}
									description="Таймаут подключения в секундах"
								/>

								<Divider my="lg" />

								<Title order={4}>Системный промпт для GigaChat</Title>
								<Text size="sm" c="dimmed" mb="xs">
									Инструкции, которые подставляются в системный промпт при нажатии кнопки Slop! на задаче. Если у задачи
									есть родительский эпик, после инструкций в промпт будет добавлено содержимое эпика.
								</Text>
								<Textarea
									label="Инструкции системного промпта"
									placeholder="Ты senior-level системный аналитик. В запросе пользователя тебе будет передано название и описание задачи на разработку. Сформулируй предложения по написанию текста задачи или составлению его с нуля."
									value={formData.slopSystemPrompt}
									onChange={(e) => setFormData({ ...formData, slopSystemPrompt: e.target.value })}
									disabled={loading || saving}
									minRows={4}
									autosize
								/>

								<Title order={5} mt="xs">
									Дополнительный контекст проекта
								</Title>
								<Text size="sm" c="dimmed" mb="xs">
									Глоссарий и описание проекта, которое поможет нейросети правильно интерпретировать запросы в задачах
									(подставляется в запрос при нажатии Slop!).
								</Text>
								<Select
									label="Источник контекста"
									placeholder="Выберите тип"
									value={formData.projectContextType}
									onChange={(v) => setFormData({ ...formData, projectContextType: v || "confluence" })}
									data={[
										{ value: "text", label: "Текстовое поле" },
										{ value: "confluence", label: "Страница в Confluence" },
									]}
									disabled={loading || saving}
								/>
								{formData.projectContextType === "text" && (
									<Textarea
										label="Текст контекста"
										placeholder="Глоссарий, доменные термины, описание проекта..."
										value={formData.projectContext}
										onChange={(e) => setFormData({ ...formData, projectContext: e.target.value })}
										disabled={loading || saving}
										minRows={4}
										autosize
									/>
								)}
								{formData.projectContextType === "confluence" && (
									<TextInput
										label="Ссылка на страницу Confluence"
										placeholder="https://confluence.example.com/pages/viewpage.action?pageId=123456"
										value={formData.projectContextConfluenceUrl}
										onChange={(e) => setFormData({ ...formData, projectContextConfluenceUrl: e.target.value })}
										disabled={loading || saving}
										description="URL страницы в Confluence. При нажатии Slop! в запрос будет подставлено содержимое этой страницы."
									/>
								)}

								<TextInput
									label="Confluence логин"
									placeholder="Логин для Confluence (on-prem)"
									value={formData.confluenceUsername}
									onChange={(e) => setFormData({ ...formData, confluenceUsername: e.target.value })}
									disabled={loading || saving}
								/>
								<TextInput
									label="Confluence пароль"
									placeholder="Пароль или API-токен"
									type="password"
									value={formData.confluencePassword}
									onChange={(e) => setFormData({ ...formData, confluencePassword: e.target.value })}
									disabled={loading || saving}
									description="Оставьте пустым или •••• чтобы не менять сохранённый пароль"
								/>

								<Group justify="flex-end" mt="md">
									<Button variant="light" onClick={() => navigate("/dashboard")} disabled={saving}>
										Отмена
									</Button>
									<Button onClick={handleSave} loading={saving} disabled={loading}>
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
