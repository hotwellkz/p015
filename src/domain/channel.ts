import {
  Timestamp,
  serverTimestamp,
  type FirestoreDataConverter
} from "firebase/firestore";

export type SupportedPlatform =
  | "YOUTUBE_SHORTS"
  | "TIKTOK"
  | "INSTAGRAM_REELS"
  | "VK_CLIPS";

export type SupportedLanguage = "ru" | "en" | "kk";

export type GenerationMode = "script" | "prompt" | "video-prompt-only";

export interface ChannelAutoSendSchedule {
  id: string; // uuid
  enabled: boolean; // включен ли этот конкретный слот
  daysOfWeek: number[]; // 0–6 (вс, пн, вт, ...), локальная неделя
  time: string; // "HH:MM" в локальном времени пользователя (24h формат)
  promptsPerRun: number; // сколько промптов генерировать за один запуск
  lastRunAt?: string | null; // ISO-дата последнего запуска
}

export interface Channel {
  id: string;
  name: string;
  // TODO: slug can be added later for prettier file names, currently not stored explicitly
  platform: SupportedPlatform;
  language: SupportedLanguage;
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string;
  generationMode?: GenerationMode; // По умолчанию "script" для обратной совместимости
  youtubeUrl?: string | null; // Ссылка на YouTube канал
  tiktokUrl?: string | null; // Ссылка на TikTok канал
  instagramUrl?: string | null; // Ссылка на Instagram канал
  // Настройки Telegram / SyntX
  telegramAutoSendEnabled?: boolean;
  telegramAutoScheduleEnabled?: boolean;
  // Google Drive: папка, куда будут сохраняться видео из SyntX для этого канала
  googleDriveFolderId?: string;
  // Автоотправка в Syntx по расписанию
  autoSendEnabled?: boolean; // общий флаг: включена ли автоматика для канала
  timezone?: string; // IANA-таймзона пользователя, например "Asia/Almaty"
  autoSendSchedules?: ChannelAutoSendSchedule[]; // массив расписаний
  // Автоматическое скачивание видео в Google Drive
  autoDownloadToDriveEnabled?: boolean; // по умолчанию false
  autoDownloadDelayMinutes?: number; // по умолчанию 10, min 1, max 60
  // Уведомления о загрузке видео в Google Drive
  uploadNotificationEnabled?: boolean; // по умолчанию false
  uploadNotificationChatId?: string | null; // необязательный chatId для уведомлений
  // Порядок отображения каналов (для drag & drop)
  orderIndex?: number; // чем меньше число, тем выше в списке
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChannelCreatePayload = Omit<
  Channel,
  "id" | "createdAt" | "updatedAt"
>;

type ChannelFirestoreData = Omit<Channel, "id">;

export const channelConverter: FirestoreDataConverter<Channel> = {
  toFirestore(channel: Channel): ChannelFirestoreData {
    const { id, ...rest } = channel;
    
    // Создаём объект для сохранения
    // Firestore не поддерживает undefined, поэтому удаляем все undefined значения
    const data: any = {
      name: rest.name,
      platform: rest.platform,
      language: rest.language,
      targetDurationSec: rest.targetDurationSec,
      niche: rest.niche,
      audience: rest.audience,
      tone: rest.tone,
      blockedTopics: rest.blockedTopics,
      generationMode: rest.generationMode || "script",
      // Явно устанавливаем autoSendEnabled, чтобы Firestore сохранил его
      autoSendEnabled: rest.autoSendEnabled ?? false,
      autoSendSchedules: rest.autoSendSchedules ?? [],
      createdAt: rest.createdAt ?? (serverTimestamp() as unknown as Timestamp),
      updatedAt: serverTimestamp() as unknown as Timestamp
    };
    
    // Добавляем опциональные поля только если они не undefined
    // Firestore не поддерживает undefined, но поддерживает null
    if (rest.timezone !== undefined) {
      data.timezone = rest.timezone;
    }
    if (rest.extraNotes !== undefined) {
      data.extraNotes = rest.extraNotes;
    }
    if (rest.googleDriveFolderId !== undefined) {
      data.googleDriveFolderId = rest.googleDriveFolderId;
    }
    if (rest.youtubeUrl !== undefined) {
      data.youtubeUrl = rest.youtubeUrl;
    }
    if (rest.tiktokUrl !== undefined) {
      data.tiktokUrl = rest.tiktokUrl;
    }
    if (rest.instagramUrl !== undefined) {
      data.instagramUrl = rest.instagramUrl;
    }
    if (rest.telegramAutoSendEnabled !== undefined) {
      data.telegramAutoSendEnabled = rest.telegramAutoSendEnabled;
    }
    if (rest.telegramAutoScheduleEnabled !== undefined) {
      data.telegramAutoScheduleEnabled = rest.telegramAutoScheduleEnabled;
    }
    if (rest.autoDownloadToDriveEnabled !== undefined) {
      data.autoDownloadToDriveEnabled = rest.autoDownloadToDriveEnabled;
    }
    if (rest.autoDownloadDelayMinutes !== undefined) {
      data.autoDownloadDelayMinutes = rest.autoDownloadDelayMinutes;
    }
    if (rest.uploadNotificationEnabled !== undefined) {
      data.uploadNotificationEnabled = rest.uploadNotificationEnabled;
    }
    if (rest.uploadNotificationChatId !== undefined) {
      data.uploadNotificationChatId = rest.uploadNotificationChatId;
    }
    if (rest.orderIndex !== undefined) {
      data.orderIndex = rest.orderIndex;
    }
    
    return data;
  },
  fromFirestore(snapshot, options): Channel {
    const data = snapshot.data(options) as ChannelFirestoreData;
    return {
      id: snapshot.id,
      generationMode: data.generationMode || "script", // Значение по умолчанию для старых каналов
      ...data
    };
  }
};

export const createEmptyChannel = (): Channel => {
  const now = Timestamp.now();
  return {
    id: "",
    name: "",
    platform: "YOUTUBE_SHORTS",
    language: "ru",
    targetDurationSec: 15,
    niche: "",
    audience: "",
    tone: "",
    blockedTopics: "",
    extraNotes: "",
    generationMode: "script",
    youtubeUrl: null,
    tiktokUrl: null,
    instagramUrl: null,
    googleDriveFolderId: undefined,
    telegramAutoSendEnabled: false,
    telegramAutoScheduleEnabled: false,
    autoSendEnabled: false,
    timezone: undefined,
    autoSendSchedules: [],
    autoDownloadToDriveEnabled: false,
    autoDownloadDelayMinutes: 10,
    uploadNotificationEnabled: false,
    uploadNotificationChatId: null,
    orderIndex: 0,
    createdAt: now,
    updatedAt: now
  };
};

