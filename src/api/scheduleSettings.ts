const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

export interface ScheduleSettings {
  minIntervalMinutes: number;
  conflictsCheckEnabled: boolean;
}

const DEFAULT_SETTINGS: ScheduleSettings = {
  minIntervalMinutes: 11,
  conflictsCheckEnabled: true
};

/**
 * Получает настройки расписания для текущего пользователя
 */
export async function fetchScheduleSettings(): Promise<ScheduleSettings> {
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendBaseUrl}/api/schedule/settings`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message || `Ошибка при получении настроек расписания: ${response.status}`
      );
    }

    const data = (await response.json()) as ScheduleSettings;
    return {
      minIntervalMinutes: data.minIntervalMinutes ?? DEFAULT_SETTINGS.minIntervalMinutes,
      conflictsCheckEnabled:
        typeof data.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled
    };
  } catch {
    // При ошибке возвращаем значения по умолчанию
    return DEFAULT_SETTINGS;
  }
}

/**
 * Обновляет настройки расписания
 */
export async function updateScheduleSettings(
  settings: ScheduleSettings
): Promise<ScheduleSettings> {
  const token = await getAuthToken();

  const response = await fetch(`${backendBaseUrl}/api/schedule/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      minIntervalMinutes: settings.minIntervalMinutes,
      conflictsCheckEnabled: settings.conflictsCheckEnabled
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Ошибка при обновлении настроек расписания: ${response.status}`
    );
  }

  const data = (await response.json()) as ScheduleSettings;
  return {
    minIntervalMinutes: data.minIntervalMinutes ?? DEFAULT_SETTINGS.minIntervalMinutes,
    conflictsCheckEnabled:
      typeof data.conflictsCheckEnabled === "boolean"
        ? data.conflictsCheckEnabled
        : DEFAULT_SETTINGS.conflictsCheckEnabled
  };
}

async function getAuthToken(): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Пользователь не авторизован");
  }

  const token = await user.getIdToken();
  return token;
}



