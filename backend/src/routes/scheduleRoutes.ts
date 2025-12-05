import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

const router = Router();

export interface ScheduleSettings {
  minIntervalMinutes: number;
  conflictsCheckEnabled: boolean;
}

const DEFAULT_SETTINGS: ScheduleSettings = {
  minIntervalMinutes: 11,
  conflictsCheckEnabled: true
};

function getSettingsDocRef(userId: string) {
  // Храним настройки в подколлекции settings внутри документа пользователя
  return db!
    .collection("users")
    .doc(userId)
    .collection("settings")
    .doc("schedule");
}

/**
 * GET /api/schedule/settings
 * Возвращает настройки расписания для текущего пользователя
 */
router.get("/settings", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const docRef = getSettingsDocRef(userId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.json(DEFAULT_SETTINGS);
    }

    const data = snap.data() as Partial<ScheduleSettings> | undefined;

    const settings: ScheduleSettings = {
      minIntervalMinutes:
        typeof data?.minIntervalMinutes === "number"
          ? data.minIntervalMinutes
          : DEFAULT_SETTINGS.minIntervalMinutes,
      conflictsCheckEnabled:
        typeof data?.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled
    };

    res.json(settings);
  } catch (error: any) {
    Logger.error("Failed to get schedule settings", {
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при получении настроек расписания"
    });
  }
});

/**
 * PATCH /api/schedule/settings
 * Обновляет настройки расписания для текущего пользователя
 */
router.patch("/settings", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { minIntervalMinutes, conflictsCheckEnabled } = req.body as Partial<ScheduleSettings>;

    const updates: Partial<ScheduleSettings> = {};

    if (typeof minIntervalMinutes !== "undefined") {
      if (
        typeof minIntervalMinutes !== "number" ||
        !Number.isFinite(minIntervalMinutes) ||
        !Number.isInteger(minIntervalMinutes)
      ) {
        return res.status(400).json({
          error: "Invalid request",
          message: "minIntervalMinutes должен быть целым числом"
        });
      }

      const clamped = Math.max(1, Math.min(60, minIntervalMinutes));
      updates.minIntervalMinutes = clamped;
    }

    if (typeof conflictsCheckEnabled !== "undefined") {
      if (typeof conflictsCheckEnabled !== "boolean") {
        return res.status(400).json({
          error: "Invalid request",
          message: "conflictsCheckEnabled должен быть boolean"
        });
      }
      updates.conflictsCheckEnabled = conflictsCheckEnabled;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Не переданы поля для обновления"
      });
    }

    const docRef = getSettingsDocRef(userId);
    await docRef.set(updates, { merge: true });

    const snap = await docRef.get();
    const data = snap.data() as Partial<ScheduleSettings> | undefined;

    const settings: ScheduleSettings = {
      minIntervalMinutes:
        typeof data?.minIntervalMinutes === "number"
          ? data.minIntervalMinutes
          : DEFAULT_SETTINGS.minIntervalMinutes,
      conflictsCheckEnabled:
        typeof data?.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled
    };

    Logger.info("Schedule settings updated", {
      userId,
      settings
    });

    res.json(settings);
  } catch (error: any) {
    Logger.error("Failed to update schedule settings", {
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении настроек расписания"
    });
  }
});

export default router;



