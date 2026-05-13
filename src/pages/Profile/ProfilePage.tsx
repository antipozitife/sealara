import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import sealSad from "../../images/seal-sad.png";
import {
  AuthUser,
  deleteAvatar,
  logout,
  meOptional,
  saveProfile,
  uploadAvatar,
  UserProfile,
} from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./profile.css";

function normalizeAvatarSrc(url: string | undefined): string {
  if (!url) return "";
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith("/") ? u : `/${u}`;
}

/** В Chrome/Firefox HEIC в теге img не показывается и даёт лишние запросы/ошибки — не подставляем URL. */
function isHeifLikeAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  const base = url.trim().split(/[?#]/)[0].toLowerCase();
  return base.endsWith(".heic") || base.endsWith(".heif");
}

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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const response = await meOptional();
        if (!response) {
          navigate("/auth");
          return;
        }
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

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile.avatarUrl]);

  const onChange = (key: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { profile: next } = await saveProfile(profile);
      setProfile(next);
      setUser((u) => (u ? { ...u, profile: next } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const onAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setError("");
    try {
      const { profile: next } = await uploadAvatar(file);
      setProfile(next);
      setUser((u) => (u ? { ...u, profile: next } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarBusy(true);
    setError("");
    try {
      const { profile: next } = await deleteAvatar();
      setProfile(next);
      setUser((u) => (u ? { ...u, profile: next } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить фото");
    } finally {
      setAvatarBusy(false);
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
          <div className="profile-hero-visual">
            <img
              className="profile-avatar"
              src={
                avatarLoadFailed || !profile.avatarUrl || isHeifLikeAvatarUrl(profile.avatarUrl)
                  ? sealSad
                  : normalizeAvatarSrc(profile.avatarUrl)
              }
              alt=""
              width={88}
              height={88}
              onError={() => setAvatarLoadFailed(true)}
            />
            <div className="profile-avatar-actions">
              <label className="profile-btn profile-btn--ghost profile-avatar-upload-label">
                <input
                  type="file"
                  className="profile-avatar-file"
                  accept="image/*"
                  onChange={onAvatarSelected}
                  disabled={avatarBusy}
                />
                {avatarBusy ? "Загрузка…" : "Выбрать фото"}
              </label>
              {profile.avatarUrl ? (
                <button
                  type="button"
                  className="profile-btn profile-btn--ghost"
                  onClick={() => void onRemoveAvatar()}
                  disabled={avatarBusy}
                >
                  Удалить фото
                </button>
              ) : null}
            </div>
          </div>
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
