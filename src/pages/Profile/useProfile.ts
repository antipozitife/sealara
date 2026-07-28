import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { AuthUser, UserProfile } from "../../lib/auth-api";
import { deleteAvatar, logout, meOptional, saveProfile, uploadAvatar } from "../../lib/auth-api";

const EMPTY_PROFILE: UserProfile = {
  surname: "",
  firstName: "",
  middleName: "",
  birthDate: "",
  gender: "",
  phone: "",
  region: "",
};

export function useProfile(navigate: NavigateFunction) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  const applyProfile = (next: UserProfile) => {
    setProfile(next);
    setUser((current) => (current ? { ...current, profile: next } : null));
  };

  const changeField = (key: keyof UserProfile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await saveProfile(profile);
      applyProfile(response.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const selectAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setError("");
    try {
      const response = await uploadAvatar(file);
      applyProfile(response.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить фото");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setError("");
    try {
      const response = await deleteAvatar();
      applyProfile(response.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить фото");
    } finally {
      setAvatarBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate("/auth");
  };

  return {
    user,
    profile,
    loading,
    saving,
    avatarBusy,
    error,
    changeField,
    save,
    selectAvatar,
    removeAvatar,
    signOut,
  };
}

export type ProfileController = ReturnType<typeof useProfile>;
