import { useState } from "react";
import { StateMessage } from "../../components/ui/StateMessage";
import sealSad from "../../images/seal-sad.webp";
import type { ProfileController } from "./useProfile";

function avatarSource(url: string | undefined, failed: boolean): string {
  if (!url || failed) return sealSad;
  const clean = url.trim();
  const base = clean.split(/[?#]/)[0].toLowerCase();
  if (base.endsWith(".heic") || base.endsWith(".heif")) return sealSad;
  if (/^data:image\//i.test(clean)) return clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  return clean.startsWith("/") ? clean : `/${clean}`;
}

export function ProfileHero({ controller }: { controller: ProfileController }) {
  const [failedUrl, setFailedUrl] = useState("");
  const currentUrl = controller.profile.avatarUrl || "";
  return (
    <section className="profile-hero">
      <div className="profile-hero-visual">
        <img
          className="profile-avatar"
          src={avatarSource(currentUrl, failedUrl === currentUrl)}
          alt=""
          width={88}
          height={88}
          onError={() => setFailedUrl(currentUrl)}
        />
        <div className="profile-avatar-actions">
          <label className="profile-btn profile-btn--ghost profile-avatar-upload-label">
            <input
              type="file"
              className="profile-avatar-file"
              accept="image/*"
              onChange={(event) => void controller.selectAvatar(event)}
              disabled={controller.avatarBusy}
            />
            {controller.avatarBusy ? "Загрузка…" : "Выбрать фото"}
          </label>
          {currentUrl && (
            <button
              type="button"
              className="profile-btn profile-btn--ghost"
              onClick={() => void controller.removeAvatar()}
              disabled={controller.avatarBusy}
            >
              Удалить фото
            </button>
          )}
        </div>
      </div>
      <h1>{controller.user?.name || "Профиль пользователя"}</h1>
    </section>
  );
}

export function ProfileForm({ controller }: { controller: ProfileController }) {
  const { profile, user, changeField } = controller;
  return (
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
              onChange={(event) => changeField("surname", event.target.value)}
            />
          </label>
          <label>
            Имя
            <input
              type="text"
              placeholder="Иван"
              value={profile.firstName}
              onChange={(event) => changeField("firstName", event.target.value)}
            />
          </label>
        </div>
        <label>
          Отчество
          <input
            type="text"
            placeholder="Иванович"
            value={profile.middleName}
            onChange={(event) => changeField("middleName", event.target.value)}
          />
        </label>
        <label>
          Дата рождения
          <input
            type="text"
            placeholder="01.01.1990"
            value={profile.birthDate}
            onChange={(event) => changeField("birthDate", event.target.value)}
          />
        </label>
        <div className="profile-row profile-gender">
          {[
            ["male", "Мужской"],
            ["female", "Женский"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="gender"
                checked={profile.gender === value}
                onChange={() => changeField("gender", value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <label>
          Телефон
          <input
            type="tel"
            placeholder="+7 (___) ___-__-__"
            value={profile.phone}
            onChange={(event) => changeField("phone", event.target.value)}
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
            onChange={(event) => changeField("region", event.target.value)}
          />
        </label>
      </div>
      {controller.error && (
        <StateMessage tone="error" className="profile-error">
          {controller.error}
        </StateMessage>
      )}
      <div className="profile-actions">
        <button
          type="button"
          className="profile-btn"
          onClick={() => void controller.save()}
          disabled={controller.saving}
        >
          {controller.saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <button
          type="button"
          className="profile-btn profile-btn--ghost"
          onClick={() => void controller.signOut()}
        >
          Выйти из профиля
        </button>
      </div>
    </article>
  );
}
