export type UserProfile = {
  surname: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  phone: string;
  region: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  profile: UserProfile;
  recentQueries: string[];
};

type AuthResponse = { user: AuthUser };

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  if (!response.ok) {
    let message = "Ошибка запроса";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {}
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function register(payload: { name: string; email: string; password: string }) {
  return requestJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: { email: string; password: string }) {
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  return requestJson<AuthResponse>("/api/auth/me");
}

export function saveProfile(profile: Partial<UserProfile>) {
  return requestJson<{ profile: UserProfile }>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}
