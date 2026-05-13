export type UserProfile = {
  surname: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  phone: string;
  region: string;
  /** Публичный URL на API, например `/uploads/avatars/…` */
  avatarUrl?: string;
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
export type DiagnosisPrediction = {
  id: number;
  name: string;
  score: number;
  probability: number;
  personalization?: number;
  definition: string;
  specialist: string;
};

export type DiagnosisResponse = {
  profileUsed: {
    age: number | null;
    gender: string;
    region: string;
  };
  predictions: DiagnosisPrediction[];
  uncertainty: number;
  needClarification: boolean;
  clarifyingSymptoms: Array<{ symptom: string; infoGain: number }>;
  modelInfo?: {
    name: string;
    estimators: number;
    strategy: string;
  };
};

export type DiagnosisQuestion = {
  id: string;
  question: string;
  type: "single" | "multi" | "text";
  options?: Array<{ value: string; label: string }>;
};

export type PreliminaryDiagnosisResponse = {
  predictions: DiagnosisPrediction[];
  relevantSymptoms: string[];
  uncertainty: number;
  needMoreDetails: boolean;
};

export type DoctorCard = {
  id: string;
  fullName: string;
  specialization: string;
  clinic: string;
  region: string;
  nextAvailableAt: string;
  districtId?: string;
  lpuId?: string;
  doctorId?: string;
  idPat?: string;
  slots?: Array<{
    idAppointment: string;
    visitStart: string;
    visitEnd: string;
    room?: string;
    address?: string;
  }>;
};

export type Appointment = {
  id: string;
  doctorId?: string;
  doctorName?: string;
  specialization?: string;
  startsAt: string;
  reason: string;
  status: string;
  source?: string;
};

const CSRF_COOKIE_NAME = "sealara_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function ensureCsrfToken(): Promise<string> {
  let token = getCookie(CSRF_COOKIE_NAME);
  if (token) return token;
  await fetch("/api/health", {
    method: "GET",
    credentials: "include",
  }).catch(() => {});
  token = getCookie(CSRF_COOKIE_NAME);
  return token;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const isMutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string> | undefined) || {}),
  };
  if (isMutating) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const response = await fetch(input, {
    credentials: "include",
    headers,
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

export function register(payload: {
  surname: string;
  name: string;
  patronymic: string;
  birthDate: string;
  gender: "м" | "ж" | "";
  phone: string;
  email: string;
  region: string;
  password: string;
}) {
  return requestJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function detectRegionByPhone(payload: { phone: string }) {
  return requestJson<{ region: string }>("/api/auth/detect-region", {
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

/**
 * Проверка сессии без 401 в Network (эндпоинт `/api/auth/session` всегда отвечает 200).
 */
export async function meOptional(): Promise<AuthResponse | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let message = "Ошибка запроса";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {}
    throw new Error(message);
  }
  const data = (await response.json()) as { user: AuthUser | null };
  if (!data?.user) return null;
  return { user: data.user };
}

export function saveProfile(profile: Partial<UserProfile>) {
  return requestJson<{ profile: UserProfile }>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function uploadAvatar(file: File): Promise<{ profile: UserProfile }> {
  const mimeType = file.type || "";
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
  return requestJson<{ profile: UserProfile }>("/api/profile/avatar", {
    method: "POST",
    body: JSON.stringify({ data, mimeType }),
  });
}

export function deleteAvatar() {
  return requestJson<{ profile: UserProfile }>("/api/profile/avatar", {
    method: "DELETE",
  });
}

export function diagnosisOptions() {
  return requestJson<{ symptoms: string[] }>("/api/diagnosis/options");
}

export function diagnosisQuestions() {
  return requestJson<{ questions: DiagnosisQuestion[] }>("/api/diagnosis/questions", {
    cache: "no-store",
  });
}

export function preliminaryDiagnosis(payload: { answers: Record<string, unknown> }) {
  return requestJson<PreliminaryDiagnosisResponse>("/api/diagnosis/preliminary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function diagnose(payload: {
  symptoms: string[];
  round?: number;
  /** Ответы на опросник — должны уходить в ML (question_vector + лаб. подсказки). */
  answers?: Record<string, unknown>;
}) {
  return requestJson<DiagnosisResponse>("/api/diagnosis/predict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listDoctors(params?: { region?: string; specialization?: string }) {
  const query = new URLSearchParams();
  if (params?.region) query.set("region", params.region);
  if (params?.specialization) query.set("specialization", params.specialization);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<{ source: string; mode: string; items: DoctorCard[] }>(`/api/doctors${suffix}`);
}

export function createAppointment(payload: { doctorId: string; startsAt: string; reason: string }) {
  return requestJson<{ ok: boolean; source: string; mode: string; appointment: Appointment | null }>("/api/appointments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createAppointmentViaSlot(payload: {
  doctorId: string;
  startsAt: string;
  reason: string;
  idAppointment?: string;
  idLpu?: string;
  idPat?: string;
}) {
  return requestJson<{ ok: boolean; source: string; mode: string; appointment: Appointment | null }>("/api/appointments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listMyAppointments() {
  return requestJson<{ source: string; mode: string; items: Appointment[] }>("/api/appointments/my");
}
