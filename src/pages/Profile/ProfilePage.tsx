import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import sealSad from "../../images/seal-sad.png";
import { AuthUser, logout, me, saveProfile, UserProfile } from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./profile.css";

export const ProfilePage: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    surname: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    gender: "",
    phone: "",
    region: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const response = await me();
        setUser(response.user);
        setProfile(response.user.profile);
      } catch {
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [navigate]);

  const onChange = (key: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      await saveProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="shell profile-page">
        <Header />
        <main className="profile-main profile-loading">Загрузка профиля...</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="shell profile-page">
      <Header />

      <main className="profile-main">
        <section className="profile-hero">
          <img className="profile-avatar" src={sealSad} alt="Аватар пользователя" />
          <h1>{user?.name || "Профиль пользователя"}</h1>
        </section>

        <section className="profile-grid" aria-label="Разделы профиля">
          <article className="profile-panel">
            <h2>👤 Личные данные</h2>
            <div className="profile-fields">
              <div className="profile-row">
                <label>
                  Фамилия
                  <input
                    type="text"
                    placeholder="Иванов"
                    value={profile.surname}
                    onChange={(e) => onChange("surname", e.target.value)}
                  />
                </label>
                <label>
                  Имя
                  <input
                    type="text"
                    placeholder="Иван"
                    value={profile.firstName}
                    onChange={(e) => onChange("firstName", e.target.value)}
                  />
                </label>
              </div>

              <label>
                Отчество
                <input
                  type="text"
                  placeholder="Иванович"
                  value={profile.middleName}
                  onChange={(e) => onChange("middleName", e.target.value)}
                />
              </label>

              <label>
                Дата рождения
                <input
                  type="text"
                  placeholder="01.01.1990"
                  value={profile.birthDate}
                  onChange={(e) => onChange("birthDate", e.target.value)}
                />
              </label>

              <div className="profile-row profile-gender">
                <label>
                  <input
                    type="radio"
                    name="gender"
                    checked={profile.gender === "male"}
                    onChange={() => onChange("gender", "male")}
                  />
                  <span>Мужской</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    checked={profile.gender === "female"}
                    onChange={() => onChange("gender", "female")}
                  />
                  <span>Женский</span>
                </label>
              </div>

              <label>
                Телефон
                <input
                  type="tel"
                  placeholder="+7 (___) ___-__-__"
                  value={profile.phone}
                  onChange={(e) => onChange("phone", e.target.value)}
                />
              </label>

              <label>
                Почта
                <input type="email" value={user?.email || ""} disabled />
              </label>

              <label>
                Регион
                <input
                  type="text"
                  placeholder="Санкт-Петербург"
                  value={profile.region}
                  onChange={(e) => onChange("region", e.target.value)}
                />
              </label>
            </div>

            {error && <div className="profile-error">{error}</div>}

            <div className="profile-actions">
              <button type="button" className="profile-btn" onClick={onSave} disabled={saving}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
              <button type="button" className="profile-btn profile-btn--ghost" onClick={onLogout}>
                Выйти из профиля
              </button>
            </div>
          </article>

          <article className="profile-panel">
            <h2>📋 Последние 3 запроса</h2>
            <ul className="profile-list">
              {(user?.recentQueries || []).slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="profile-panel">
            <h2>⚙️ Настройки</h2>
            <ul className="profile-list">
              <li>Уведомления по почте</li>
              <li>Напоминания о проверке здоровья</li>
              <li>Язык интерфейса</li>
            </ul>
          </article>
        </section>
      </main>

      <Footer />
    </div>
  );
};
