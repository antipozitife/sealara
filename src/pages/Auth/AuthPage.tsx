import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import { login, register } from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./auth.css";

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await register({ name, email, password });
      } else {
        await login({ email, password });
      }
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить вход");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell auth-page">
      <Header />

      <main className="auth-main">
        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${mode === "login" ? " auth-tab--active" : ""}`}
              onClick={() => setMode("login")}
            >
              Вход
            </button>
            <button
              type="button"
              className={`auth-tab${mode === "register" ? " auth-tab--active" : ""}`}
              onClick={() => setMode("register")}
            >
              Регистрация
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label>
                Имя
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            )}

            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>

            <label>
              Пароль
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Подождите..." : mode === "register" ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  );
};
