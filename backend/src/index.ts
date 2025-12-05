import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
// Инициализация Firebase Admin (должна быть до импорта роутов, которые используют Firestore)
import "./services/firebaseAdmin";
import telegramRoutes from "./routes/telegramRoutes";
import cronRoutes from "./routes/cronRoutes";
import promptRoutes from "./routes/promptRoutes";
import googleDriveRoutes from "./routes/googleDriveRoutes";
import debugRoutes from "./routes/debugRoutes";
import testFirestoreRoutes from "./routes/testFirestoreRoutes";
import authRoutes from "./routes/authRoutes";
import channelRoutes from "./routes/channelRoutes";
import scheduleRoutes from "./routes/scheduleRoutes";
import { processAutoSendTick } from "./services/autoSendScheduler";
import { Logger } from "./utils/logger";
import { getFirestoreInfo, isFirestoreAvailable } from "./services/firebaseAdmin";

const app = express();
const port = process.env.PORT || 8080;

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    credentials: true
  })
);
app.use(express.json());
app.use(express.static("public")); // Для статических файлов (HTML страница для OAuth)

app.use("/api/telegram", telegramRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/google-drive", googleDriveRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/test", testFirestoreRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/schedule", scheduleRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`);
  
  // Логируем информацию о Firebase при старте
  const firestoreInfo = getFirestoreInfo();
  Logger.info("Backend startup: Firebase Admin status", {
    isFirestoreAvailable: isFirestoreAvailable(),
    firestoreInfo: firestoreInfo,
    env: {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set",
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? "set" : "not set",
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? "set" : "not set",
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? "set" : "not set"
    }
  });
});

// Запускаем планировщик автоотправки каждую минуту
// Это работает только если сервер запущен постоянно (например, на VM)
// Для Cloud Run используйте HTTP-эндпоинт /api/cron/manual-tick с Cloud Scheduler
if (process.env.ENABLE_CRON_SCHEDULER !== "false") {
  cron.schedule("* * * * *", async () => {
    Logger.info("Cron scheduler: running auto-send tick");
    try {
      await processAutoSendTick();
    } catch (error) {
      Logger.error("Cron scheduler: error in auto-send tick", error);
    }
  });
  Logger.info("Cron scheduler enabled: auto-send will run every minute");
} else {
  Logger.info("Cron scheduler disabled: use /api/cron/manual-tick with Cloud Scheduler");
}


