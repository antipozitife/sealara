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
const IS_STANDALONE = typeof __SEALARA_STANDALONE__ !== "undefined" && __SEALARA_STANDALONE__;
export const isFrontendDemo =
  IS_STANDALONE || (typeof __SEALARA_FRONTEND_DEMO__ !== "undefined" && __SEALARA_FRONTEND_DEMO__);
const FRONTEND_DEMO_SESSION_KEY = "sealara-frontend-demo-session";

export function hasFrontendDemoSession(): boolean {
  if (!isFrontendDemo) return false;
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(FRONTEND_DEMO_SESSION_KEY) !== "signed-out";
}

function setFrontendDemoSession(active: boolean) {
  if (typeof localStorage === "undefined") return;
  if (active) localStorage.setItem(FRONTEND_DEMO_SESSION_KEY, "signed-in");
  else localStorage.setItem(FRONTEND_DEMO_SESSION_KEY, "signed-out");
}

let demoProfile: UserProfile = {
  surname: "Демонстрационный",
  firstName: "Пользователь",
  middleName: "",
  birthDate: "01.01.1995",
  gender: "female",
  phone: "+7 900 000-00-00",
  region: "Санкт-Петербург",
};
let demoEmail = "demo@sealara.local";
let demoName = "Демо-профиль";

const demoUser = (): AuthUser => ({
  id: "frontend-demo-user",
  email: demoEmail,
  name: demoName,
  createdAt: "2026-01-01T00:00:00.000Z",
  profile: demoProfile,
  recentQueries: ["Головная боль и слабость", "Насморк и чихание", "Кашель"],
});

const demoPrediction: DiagnosisPrediction = {
  id: 31,
  name: "Аллергический ринит",
  score: 0.78,
  probability: 0.74,
  personalization: 0.04,
  definition: "Демонстрационное справочное совпадение по введённым наблюдениям.",
  specialist: "Аллерголог | Терапевт",
};

let demoAppointments: Appointment[] = [
  {
    id: "demo-appointment-1",
    doctorId: "demo-doctor-1",
    doctorName: "Смирнова Анна Викторовна",
    specialization: "Терапевт",
    startsAt: "2026-08-05T10:30:00.000Z",
    reason: "Демонстрационная запись",
    status: "подтверждена",
    source: "frontend-demo",
  },
];

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
    } catch {
      // Ответ не в JSON-формате — используем сообщение по умолчанию.
    }
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
  if (isFrontendDemo) {
    demoProfile = {
      ...demoProfile,
      surname: payload.surname,
      firstName: payload.name,
      middleName: payload.patronymic,
      birthDate: payload.birthDate,
      gender: payload.gender === "м" ? "male" : payload.gender === "ж" ? "female" : "",
      phone: payload.phone,
      region: payload.region,
    };
    demoEmail = payload.email;
    demoName = `${payload.name} ${payload.surname}`.trim();
    setFrontendDemoSession(true);
    return Promise.resolve({ user: demoUser() });
  }
  return requestJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function detectRegionByPhone(payload: { phone: string }) {
  if (isFrontendDemo) return Promise.resolve({ region: "Санкт-Петербург" });
  return requestJson<{ region: string }>("/api/auth/detect-region", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: { email: string; password: string }) {
  if (isFrontendDemo) {
    demoEmail = payload.email;
    setFrontendDemoSession(true);
    return Promise.resolve({ user: demoUser() });
  }
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  if (isFrontendDemo) {
    setFrontendDemoSession(false);
    return Promise.resolve({ ok: true });
  }
  return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  if (isFrontendDemo) {
    if (!hasFrontendDemoSession()) return Promise.reject(new Error("Требуется вход"));
    return Promise.resolve({ user: demoUser() });
  }
  return requestJson<AuthResponse>("/api/auth/me");
}

/**
 * Проверка сессии без 401 в Network (эндпоинт `/api/auth/session` всегда отвечает 200).
 */
export async function meOptional(): Promise<AuthResponse | null> {
  if (isFrontendDemo) return hasFrontendDemoSession() ? { user: demoUser() } : null;
  const response = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let message = "Ошибка запроса";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Ответ не в JSON-формате — используем сообщение по умолчанию.
    }
    throw new Error(message);
  }
  const data = (await response.json()) as { user: AuthUser | null };
  if (!data?.user) return null;
  return { user: data.user };
}

export function saveProfile(profile: Partial<UserProfile>) {
  if (isFrontendDemo) {
    demoProfile = { ...demoProfile, ...profile };
    return Promise.resolve({ profile: demoProfile });
  }
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
  if (isFrontendDemo) {
    demoProfile = { ...demoProfile, avatarUrl: `data:${mimeType || "image/png"};base64,${data}` };
    return { profile: demoProfile };
  }
  return requestJson<{ profile: UserProfile }>("/api/profile/avatar", {
    method: "POST",
    body: JSON.stringify({ data, mimeType }),
  });
}

export function deleteAvatar() {
  if (isFrontendDemo) {
    demoProfile = { ...demoProfile, avatarUrl: undefined };
    return Promise.resolve({ profile: demoProfile });
  }
  return requestJson<{ profile: UserProfile }>("/api/profile/avatar", {
    method: "DELETE",
  });
}

const diagnosisUrl = (path: string, demo = false) => `/api/diagnosis/${path}${demo ? "?demo=1" : ""}`;

export function diagnosisOptions(demo = false) {
  if (isFrontendDemo) {
    return Promise.resolve({ symptoms: ["кашель", "насморк", "чихание", "слабость", "головная боль"] });
  }
  return requestJson<{ symptoms: string[] }>(diagnosisUrl("options", demo));
}

export function diagnosisQuestions(demo = false) {
  if (isFrontendDemo) {
    return Promise.resolve({
      questions: [
        {
          id: "severity",
          question: "Насколько выражены симптомы?",
          type: "single" as const,
          options: [
            { value: "mild", label: "Слабо" },
            { value: "moderate", label: "Умеренно" },
            { value: "severe", label: "Сильно" },
          ],
        },
        {
          id: "duration",
          question: "Как давно появились наблюдения?",
          type: "single" as const,
          options: [
            { value: "today", label: "Сегодня" },
            { value: "week", label: "В течение недели" },
          ],
        },
      ],
    });
  }
  return requestJson<{ questions: DiagnosisQuestion[] }>(diagnosisUrl("questions", demo), {
    cache: "no-store",
  });
}

export function preliminaryDiagnosis(payload: { answers: Record<string, unknown> }, demo = false) {
  if (isFrontendDemo) {
    return Promise.resolve({
      predictions: [demoPrediction],
      relevantSymptoms: ["насморк", "чихание"],
      uncertainty: 0.32,
      needMoreDetails: true,
    });
  }
  return requestJson<PreliminaryDiagnosisResponse>(diagnosisUrl("preliminary", demo), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function diagnose(
  payload: {
    symptoms: string[];
    round?: number;
    /** Ответы на опросник — должны уходить в ML (question_vector + лаб. подсказки). */
    answers?: Record<string, unknown>;
  },
  demo = false,
) {
  if (isFrontendDemo) {
    return Promise.resolve({
      profileUsed: { age: 31, gender: demoProfile.gender, region: demoProfile.region },
      predictions: [demoPrediction],
      uncertainty: 0.22,
      needClarification: false,
      clarifyingSymptoms: [],
      modelInfo: { name: "Frontend demo", estimators: 100, strategy: "Локальные демонстрационные данные" },
    });
  }
  return requestJson<DiagnosisResponse>(diagnosisUrl("predict", demo), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listDoctors(params?: { region?: string; specialization?: string }) {
  if (isFrontendDemo) {
    return Promise.resolve({
      source: "frontend-demo",
      mode: "demo",
      items: [
        {
          id: "demo-doctor-1",
          fullName: "Смирнова Анна Викторовна",
          specialization: "Терапевт",
          clinic: "Демонстрационная поликлиника",
          region: demoProfile.region,
          nextAvailableAt: "2026-08-05T10:30:00.000Z",
          slots: [
            {
              idAppointment: "demo-slot-1",
              visitStart: "2026-08-05T10:30:00.000Z",
              visitEnd: "2026-08-05T11:00:00.000Z",
              room: "101",
            },
          ],
        },
      ],
    });
  }
  const query = new URLSearchParams();
  if (params?.region) query.set("region", params.region);
  if (params?.specialization) query.set("specialization", params.specialization);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<{ source: string; mode: string; items: DoctorCard[] }>(`/api/doctors${suffix}`);
}

export function createAppointment(payload: { doctorId: string; startsAt: string; reason: string }) {
  return requestJson<{ ok: boolean; source: string; mode: string; appointment: Appointment | null }>(
    "/api/appointments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function createAppointmentViaSlot(payload: {
  doctorId: string;
  startsAt: string;
  reason: string;
  idAppointment?: string;
  idLpu?: string;
  idPat?: string;
}) {
  if (isFrontendDemo) {
    const appointment: Appointment = {
      id: `demo-appointment-${demoAppointments.length + 1}`,
      doctorId: payload.doctorId,
      doctorName: "Смирнова Анна Викторовна",
      specialization: "Терапевт",
      startsAt: payload.startsAt,
      reason: payload.reason,
      status: "подтверждена",
      source: "frontend-demo",
    };
    demoAppointments = [appointment, ...demoAppointments];
    return Promise.resolve({ ok: true, source: "frontend-demo", mode: "demo", appointment });
  }
  return requestJson<{ ok: boolean; source: string; mode: string; appointment: Appointment | null }>(
    "/api/appointments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function listMyAppointments() {
  if (isFrontendDemo) {
    return Promise.resolve({ source: "frontend-demo", mode: "demo", items: demoAppointments });
  }
  return requestJson<{ source: string; mode: string; items: Appointment[] }>("/api/appointments/my");
}
