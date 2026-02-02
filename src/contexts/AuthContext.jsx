import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const API_URL = "http://localhost:3001/api/auth";

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	// Проверяем, есть ли сохраненный пользователь при загрузке
	useEffect(() => {
		const savedUser = localStorage.getItem("currentUser");
		if (savedUser) {
			try {
				const parsed = JSON.parse(savedUser);
				setUser(parsed);
			} catch (error) {
				localStorage.removeItem("currentUser");
			}
		}
		setLoading(false);
	}, []);

	const register = async (email, password) => {
		try {
			const response = await fetch(`${API_URL}/register`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Ошибка регистрации");
			}

			// Сохраняем пользователя в localStorage
			localStorage.setItem("currentUser", JSON.stringify(data.user));
			setUser(data.user);
			return data.user;
		} catch (error) {
			throw error;
		}
	};

	const login = async (email, password) => {
		try {
			const response = await fetch(`${API_URL}/login`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				const error = new Error(data.error || "Ошибка входа");
				error.errorType = data.errorType;
				error.status = response.status;
				throw error;
			}

			// Сохраняем пользователя в localStorage
			localStorage.setItem("currentUser", JSON.stringify(data.user));
			setUser(data.user);
			return data.user;
		} catch (error) {
			throw error;
		}
	};

	const logout = () => {
		setUser(null);
		localStorage.removeItem("currentUser");
	};

	return <AuthContext.Provider value={{ user, register, login, logout, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}
