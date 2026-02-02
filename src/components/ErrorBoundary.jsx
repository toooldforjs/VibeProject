import { Component } from "react";
import { Box, Title, Text, Button, Stack, Code } from "@mantine/core";

/**
 * Error Boundary: перехватывает необработанные ошибки в дереве React
 * и показывает пользователю сообщение вместо пустого экрана.
 */
export class ErrorBoundary extends Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}

	componentDidCatch(error, errorInfo) {
		console.error("ErrorBoundary поймал ошибку:", error, errorInfo);
	}

	handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError && this.state.error) {
			const message = this.state.error?.message || "Произошла непредвиденная ошибка";
			return (
				<Box p="xl" maw={500} mx="auto" mt="xl">
					<Stack gap="md">
						<Title order={3}>Что-то пошло не так</Title>
						<Text size="sm" c="dimmed">
							Приложение столкнулось с ошибкой. Можно обновить страницу или нажать «Повторить».
						</Text>
						<Code block>{message}</Code>
						<Button variant="light" onClick={this.handleRetry}>
							Повторить
						</Button>
						<Button variant="subtle" component="a" href="/">
							На главную
						</Button>
					</Stack>
				</Box>
			);
		}
		return this.props.children;
	}
}
