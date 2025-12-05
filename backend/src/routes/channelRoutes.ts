import { Router } from "express";
import { randomUUID } from "crypto";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";
import { authRequired } from "../middleware/auth";
import { runVideoGenerationForChannel } from "../services/videoGenerationService";

const router = Router();

// Типы для расписания
interface ChannelAutoSendSchedule {
  id: string;
  enabled: boolean;
  daysOfWeek: number[];
  time: string; // "HH:MM"
  promptsPerRun: number;
  lastRunAt?: string | null;
}

interface ChannelScheduleItem {
  id: string;
  index: number;
  name: string;
  times: string[];
  platform: string;
  isAutomationEnabled: boolean;
}

/**
 * PATCH /api/channels/reorder
 * Обновляет порядок каналов пользователя
 * Body: { orderedIds: string[] }
 */
router.patch("/reorder", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "orderedIds должен быть непустым массивом"
      });
    }

    // Проверяем, что все каналы принадлежат пользователю
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const channelsSnapshot = await channelsRef.get();
    const userChannelIds = channelsSnapshot.docs.map((doc) => doc.id);
    
    const invalidIds = orderedIds.filter((id) => !userChannelIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Каналы ${invalidIds.join(", ")} не принадлежат пользователю`
      });
    }

    // Обновляем orderIndex для каждого канала
    const batch = db.batch();
    orderedIds.forEach((channelId, index) => {
      const channelRef = channelsRef.doc(channelId);
      batch.update(channelRef, { orderIndex: index });
    });

    await batch.commit();

    Logger.info("Channels reordered", {
      userId,
      channelCount: orderedIds.length
    });

    res.json({
      success: true,
      message: "Порядок каналов обновлён"
    });
  } catch (error: any) {
    Logger.error("Failed to reorder channels", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении порядка каналов"
    });
  }
});

/**
 * GET /api/channels/schedule
 * Возвращает список всех каналов пользователя с их расписанием
 */
router.get("/schedule", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    
    // Получаем все каналы пользователя
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const channelsSnapshot = await channelsRef.get();
    
    const PLATFORM_NAMES: Record<string, string> = {
      YOUTUBE_SHORTS: "YouTube Shorts",
      TIKTOK: "TikTok",
      INSTAGRAM_REELS: "Instagram Reels",
      VK_CLIPS: "VK Клипы"
    };

    const scheduleItems: ChannelScheduleItem[] = channelsSnapshot.docs
      .map((doc, index) => {
        const channelData = doc.data() as any;
        const autoSendSchedules = (channelData.autoSendSchedules || []) as ChannelAutoSendSchedule[];
        
        // Извлекаем времена из включенных расписаний
        const times = autoSendSchedules
          .filter((schedule) => schedule.enabled && schedule.time)
          .map((schedule) => schedule.time)
          .sort(); // Сортируем по времени

        return {
          id: doc.id,
          index: index + 1,
          name: channelData.name || "Без названия",
          times: times,
          platform: PLATFORM_NAMES[channelData.platform] || channelData.platform || "Не указано",
          isAutomationEnabled: channelData.autoSendEnabled === true
        };
      })
      // Сортируем по orderIndex, если есть
      .sort((a, b) => {
        const aData = channelsSnapshot.docs.find((d) => d.id === a.id)?.data() as any;
        const bData = channelsSnapshot.docs.find((d) => d.id === b.id)?.data() as any;
        const aOrder = aData?.orderIndex ?? a.index;
        const bOrder = bData?.orderIndex ?? b.index;
        return aOrder - bOrder;
      })
      // Обновляем индексы после сортировки
      .map((item, index) => ({
        ...item,
        index: index + 1
      }));

    Logger.info("Channel schedule fetched", {
      userId,
      channelCount: scheduleItems.length
    });

    res.json(scheduleItems);
  } catch (error: any) {
    Logger.error("Failed to fetch channel schedule", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при получении расписания каналов"
    });
  }
});

/**
 * PATCH /api/channels/:id/schedule
 * Обновляет расписание канала (только времена)
 * Body: { times: string[] } - массив времён в формате "HH:MM"
 */
router.patch("/:id/schedule", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { times } = req.body;

    if (!Array.isArray(times)) {
      return res.status(400).json({
        error: "Invalid request",
        message: "times должен быть массивом"
      });
    }

    // Валидация и нормализация времён
    const MAX_SLOTS = 10;
    const validatedTimes: string[] = [];
    const seen = new Set<string>();

    for (const time of times) {
      if (typeof time !== "string" || !time.trim()) {
        continue; // Пропускаем пустые значения
      }

      // Проверка формата HH:MM
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({
          error: "Invalid time format",
          message: `Неверный формат времени: "${time}". Используйте формат HH:MM (например, "10:00")`
        });
      }

      const [hours, minutes] = time.split(":").map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return res.status(400).json({
          error: "Invalid time value",
          message: `Неверное значение времени: "${time}". Часы: 0-23, минуты: 0-59`
        });
      }

      // Удаляем дубликаты
      if (!seen.has(time)) {
        seen.add(time);
        validatedTimes.push(time);
      }
    }

    // Проверка лимита
    if (validatedTimes.length > MAX_SLOTS) {
      return res.status(400).json({
        error: "Too many time slots",
        message: `Максимальное количество слотов: ${MAX_SLOTS}`
      });
    }

    // Сортируем по возрастанию
    validatedTimes.sort();

    // Получаем канал
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    const channelData = channelDoc.data() as any;
    const existingSchedules = (channelData.autoSendSchedules || []) as ChannelAutoSendSchedule[];

    // Обновляем расписания: обновляем времена в существующих включённых расписаниях
    // или создаём новые, если времён больше чем расписаний
    const updatedSchedules: ChannelAutoSendSchedule[] = [];
    
    // Сначала обновляем существующие включённые расписания
    const enabledSchedules = existingSchedules.filter(s => s.enabled);
    const disabledSchedules = existingSchedules.filter(s => !s.enabled);
    
    validatedTimes.forEach((time, index) => {
      if (index < enabledSchedules.length) {
        // Обновляем существующее расписание
        updatedSchedules.push({
          ...enabledSchedules[index],
          time: time
        });
      } else {
        // Создаём новое расписание
        updatedSchedules.push({
          id: randomUUID(),
          enabled: true,
          daysOfWeek: [1, 2, 3, 4, 5], // По умолчанию Пн-Пт
          time: time,
          promptsPerRun: 1
        });
      }
    });

    // Добавляем выключенные расписания обратно
    updatedSchedules.push(...disabledSchedules);

    // Обновляем канал
    await channelRef.update({
      autoSendSchedules: updatedSchedules,
      updatedAt: new Date()
    });

    Logger.info("Channel schedule updated", {
      userId,
      channelId,
      timesCount: validatedTimes.length
    });

    // Возвращаем обновлённое расписание в формате для таблицы
    const PLATFORM_NAMES: Record<string, string> = {
      YOUTUBE_SHORTS: "YouTube Shorts",
      TIKTOK: "TikTok",
      INSTAGRAM_REELS: "Instagram Reels",
      VK_CLIPS: "VK Клипы"
    };

    res.json({
      id: channelId,
      name: channelData.name || "Без названия",
      times: validatedTimes,
      platform: PLATFORM_NAMES[channelData.platform] || channelData.platform || "Не указано",
      isAutomationEnabled: channelData.autoSendEnabled === true
    });
  } catch (error: any) {
    Logger.error("Failed to update channel schedule", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении расписания канала"
    });
  }
});

/**
 * POST /api/channels/:id/run-custom-prompt
 * Запускает генерацию видео с кастомным промптом от пользователя
 * Body: { prompt: string, title?: string }
 */
router.post("/:id/run-custom-prompt", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { prompt, title } = req.body;

    // Валидация промпта
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Промпт не может быть пустым"
      });
    }

    const MAX_PROMPT_LENGTH = 15000;
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        error: "Invalid request",
        message: `Промпт слишком длинный. Максимальная длина: ${MAX_PROMPT_LENGTH} символов`
      });
    }

    // Проверяем, что канал существует и принадлежит пользователю
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    Logger.info("run-custom-prompt: starting video generation", {
      channelId,
      userId,
      promptLength: prompt.length,
      hasTitle: !!title
    });

    // Запускаем генерацию видео
    const result = await runVideoGenerationForChannel({
      channelId,
      userId,
      prompt: prompt.trim(),
      source: "custom_prompt",
      title: title?.trim() || undefined
    });

    if (!result.success) {
      Logger.error("run-custom-prompt: video generation failed", {
        channelId,
        userId,
        error: result.error
      });

      return res.status(500).json({
        error: "Video generation failed",
        message: result.error || "Ошибка при запуске генерации видео"
      });
    }

    Logger.info("run-custom-prompt: video generation started successfully", {
      channelId,
      userId,
      messageId: result.messageId,
      jobId: result.jobId
    });

    // Возвращаем информацию о запущенной задаче
    res.status(202).json({
      jobId: result.jobId || `custom_${channelId}_${Date.now()}`,
      status: "queued",
      messageId: result.messageId,
      chatId: result.chatId
    });
  } catch (error: any) {
    Logger.error("run-custom-prompt: unexpected error", {
      channelId: req.params.id,
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при запуске генерации видео"
    });
  }
});

export default router;

