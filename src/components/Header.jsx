import { useNavigate } from "react-router-dom";
import { Box, Title, Group, Avatar, Menu, Text } from "@mantine/core";
import { useAuth } from "../contexts/AuthContext";

/**
 * Верхняя панель навигации приложения.
 * Содержит логотип, аватар пользователя и меню с настройками/выходом.
 */
export function Header() {
	const navigate = useNavigate();
	const { user, logout } = useAuth();

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	return (
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
	);
}
