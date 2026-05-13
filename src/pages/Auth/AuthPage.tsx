import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import { detectRegionByPhone, login, register } from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./auth.css";

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [surname, setSurname] = useState("");
  const [name, setName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"м" | "ж" | "">("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [regionTouched, setRegionTouched] = useState(false);
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
        await register({ surname, name, patronymic, birthDate, gender, phone, email, region, password });
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

  const onPhoneChange = async (value: string) => {
    setPhone(value);
    if (mode !== "register" || regionTouched) return;
    const digits = value.replace(/\D+/g, "");
    if (digits.length < 10) return;
    try {
      const response = await detectRegionByPhone({ phone: value });
      if (response.region) setRegion(response.region);
    } catch {
      // Игнорируем — пользователь может ввести регион вручную.
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
              <>
                <div className="auth-grid">
                  <label>
                    Фамилия
                    <input value={surname} onChange={(e) => setSurname(e.target.value)} required />
                  </label>
                  <label>
                    Имя
                    <input value={name} onChange={(e) => setName(e.target.value)} required />
                  </label>
                </div>

                <label>
                  Отчество
                  <input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} />
                </label>

                <div className="auth-grid">
                  <label>
                    Дата рождения
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Пол
                    <select value={gender} onChange={(e) => setGender(e.target.value as "м" | "ж" | "")} required>
                      <option value="">Выберите</option>
                      <option value="м">м</option>
                      <option value="ж">ж</option>
                    </select>
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Телефон
                    <input type="tel" value={phone} onChange={(e) => void onPhoneChange(e.target.value)} required />
                  </label>
                  <label>
                    Регион
                    <input
                      value={region}
                      onChange={(e) => {
                        setRegionTouched(true);
                        setRegion(e.target.value);
                      }}
                    />
                  </label>
                </div>
              </>
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
                minLength={8}
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
