import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { telegramLoginSessionRepository } from "../repositories/telegramLoginSessionRepo";
import { telegramAccountRepository } from "../repositories/telegramAccountRepo";
import {
  createTempClientState,
  getTempClientState,
  deleteTempClientState
} from "../telegram/client";
import { encrypt } from "../crypto/aes";
import {
  sendPromptFromUserToSyntx,
  TelegramSessionExpiredError
} from "../services/sendPromptFromUserToSyntx";
import { loadSessionString } from "../telegram/sessionStore";
import { createTelegramClientFromStringSession } from "../telegram/client";
import { Api } from "telegram/tl";
import { uploadVideoToDrive, uploadFileToDrive } from "../services/googleDrive";
import { uploadFileToDriveWithOAuth } from "../services/googleDriveOAuth";
import { getUserOAuthTokens, updateUserAccessToken } from "../repositories/userOAuthTokensRepo";
import { google } from "googleapis";
import {
  downloadTelegramVideoToTemp,
  cleanupTempFile
} from "../utils/telegramDownload";
import { generateVideoFileName } from "../utils/fileUtils";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable, getFirebaseError } from "../services/firebaseAdmin";
import { downloadAndUploadVideoToDrive } from "../services/videoDownloadService";

const router = Router();

router.post("/start", authRequired, async (req, res) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    const userId = req.user!.uid;
    const stateId = `${userId}_${Date.now()}`;

    await createTempClientState(stateId, phone);
    const state = getTempClientState(stateId);
    if (!state) {
      return res.status(500).json({ error: "FAILED_TO_CREATE_STATE" });
    }

    const result = await state.client.sendCode(
      {
        apiId: Number(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH ?? ""
      },
      phone
    );

    const phoneCodeHash = (result as { phoneCodeHash?: string }).phoneCodeHash;
    if (!phoneCodeHash) {
      return res.status(500).json({ error: "FAILED_TO_SEND_CODE" });
    }

    await telegramLoginSessionRepository.create({
      id: stateId,
      userId,
      phone,
      mtprotoStateId: stateId,
      phoneCodeHash,
      createdAt: new Date()
    });

    return res.json({ status: "code_sent" });
  } catch (err) {
    console.error("Error in /api/telegram/start", err);
    return res.status(500).json({ error: "FAILED_TO_SEND_CODE" });
  }
});

router.post("/confirm", authRequired, async (req, res) => {
  try {
    const { phone, code, password } = req.body as {
      phone?: string;
      code?: string;
      password?: string;
    };

    if (!phone || !code) {
      return res.status(400).json({ error: "phone and code are required" });
    }

    const userId = req.user!.uid;
    const loginSession =
      await telegramLoginSessionRepository.findByUserIdAndPhone(
        userId,
        phone
      );

    if (!loginSession) {
      return res.status(400).json({ error: "NO_PENDING_LOGIN_SESSION" });
    }

    const state = getTempClientState(loginSession.mtprotoStateId);
    if (!state) {
      return res.status(400).json({ error: "MTPROTO_STATE_NOT_FOUND" });
    }

    try {
      // Используем правильные методы Telegram API
      await state.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCode: code,
          phoneCodeHash: loginSession.phoneCodeHash
        })
      );
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("SESSION_PASSWORD_NEEDED") || err?.errorMessage?.includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) {
          return res
            .status(400)
            .json({ error: "PASSWORD_REQUIRED_FOR_2FA" });
        }
        // Используем правильный метод для проверки пароля
        const pwd = await state.client.invoke(new Api.account.GetPassword());
        if (!pwd.currentAlgo) {
          return res.status(400).json({ error: "PASSWORD_ALGO_NOT_AVAILABLE" });
        }
        // Вычисляем хеш пароля вручную
        const { computeCheck } = await import("telegram/Password");
        const passwordHash = await computeCheck(pwd, password);
        await state.client.invoke(
          new Api.auth.CheckPassword({
            password: passwordHash
          })
        );
      } else {
        return res
          .status(400)
          .json({ error: "INVALID_CODE_OR_LOGIN_FAILED" });
      }
    }

    const stringSession = String(state.client.session.save());
    const encrypted = encrypt(stringSession);

    const account = await telegramAccountRepository.upsertForUser(
      userId,
      phone,
      encrypted
    );

    await telegramLoginSessionRepository.deleteById(loginSession.id);
    deleteTempClientState(loginSession.mtprotoStateId);

    const masked =
      account.phone.length > 6
        ? account.phone.slice(0, 3) + "•••" + account.phone.slice(-2)
        : "•••";

    return res.json({
      status: "authorized",
      phoneMasked: masked
    });
  } catch (err) {
    console.error("Error in /api/telegram/confirm", err);
    return res.status(500).json({ error: "FAILED_TO_CONFIRM" });
  }
});

router.post("/disconnect", authRequired, async (req, res) => {
  const userId = req.user!.uid;
  await telegramAccountRepository.deactivateForUser(userId);
  return res.json({ status: "disconnected" });
});

router.get("/status", authRequired, async (req, res) => {
  const userId = req.user!.uid;
  const acc = await telegramAccountRepository.findActiveByUserId(userId);
  if (!acc || !acc.isActive) {
    return res.json({ connected: false });
  }
  const masked =
    acc.phone.length > 6
      ? acc.phone.slice(0, 3) + "•••" + acc.phone.slice(-2)
      : "•••";
  return res.json({ connected: true, phoneMasked: masked });
});

router.post("/sendPrompt", authRequired, async (req, res) => {
  const { channelId, prompt } = req.body as {
    channelId?: string;
    prompt?: string;
  };
  if (!channelId || !prompt) {
    return res.status(400).json({ error: "channelId and prompt are required" });
  }

  const userId = req.user!.uid;

  try {
    await sendPromptFromUserToSyntx(userId, prompt);
    return res.json({ status: "sent" });
  } catch (err: any) {
    if (err instanceof TelegramSessionExpiredError) {
      return res
        .status(401)
        .json({ error: "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN" });
    }
    if (String(err?.message ?? err) === "NO_ACTIVE_TELEGRAM_ACCOUNT") {
      return res.status(400).json({ error: "NO_ACTIVE_TELEGRAM_ACCOUNT" });
    }
    console.error("Error in /api/telegram/sendPrompt", err);
    return res.status(500).json({ error: "FAILED_TO_SEND_PROMPT" });
  }
});

// Новый эндпоинт для отправки промпта в SyntX через глобальную сессию (не требует userId)
router.post("/sendPromptToSyntx", authRequired, async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Проверяем наличие SYNX_CHAT_ID перед выполнением
  if (!process.env.SYNX_CHAT_ID) {
    Logger.error("SYNX_CHAT_ID is not configured");
    return res.status(500).json({
      error: "SYNX_CHAT_ID_NOT_CONFIGURED",
      message: "SYNX_CHAT_ID не настроен на сервере. Добавьте переменную окружения в Cloud Run."
    });
  }

  try {
    // Используем глобальную сессию (userId не нужен, используем пустую строку)
    await sendPromptFromUserToSyntx("", prompt);
    return res.json({ status: "sent" });
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    
    if (err instanceof TelegramSessionExpiredError) {
      return res
        .status(401)
        .json({ error: "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN" });
    }
    
    if (errorMessage === "TELEGRAM_SESSION_NOT_INITIALIZED") {
      return res.status(400).json({
        error: "TELEGRAM_SESSION_NOT_INITIALIZED",
        message:
          "Telegram сессия не инициализирована. Запустите 'npm run dev:login' в папке backend."
      });
    }
    
    if (errorMessage.includes("SYNX_CHAT_ID is not configured")) {
      return res.status(500).json({
        error: "SYNX_CHAT_ID_NOT_CONFIGURED",
        message: "SYNX_CHAT_ID не настроен на сервере. Добавьте переменную окружения в Cloud Run."
      });
    }
    
    Logger.error("Error in /api/telegram/sendPromptToSyntx", err);
    return res.status(500).json({ 
      error: "FAILED_TO_SEND_PROMPT",
      message: errorMessage || "Ошибка при отправке промпта"
    });
  }
});

// Забрать последнее видео из SyntX и сохранить в Google Drive
router.post("/fetchLatestVideoToDrive", authRequired, async (req, res) => {
  const { channelId } = req.body as { channelId?: string };

  if (!channelId) {
    return res.status(400).json({ error: "channelId is required" });
  }

  const userId = req.user!.uid;
  Logger.info("fetchLatestVideoToDrive: start", { userId, channelId });

  // Проверяем Telegram-сессию
  const stringSession = loadSessionString();
  if (!stringSession) {
    return res.status(503).json({
      error: "TELEGRAM_SESSION_NOT_INITIALIZED",
      message:
        "Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
    });
  }

  const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;
  if (!SYNX_CHAT_ID) {
    return res
      .status(500)
      .json({ error: "SYNX_CHAT_ID is not configured on the server" });
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in /api/telegram/fetchLatestVideoToDrive");
    const firebaseError = getFirebaseError();
    return res.status(503).json({
      error: "FIRESTORE_NOT_AVAILABLE",
      message:
        "Firebase Admin не настроен. Добавьте в backend/.env один из вариантов:\n" +
        "1. FIREBASE_SERVICE_ACCOUNT='{\"type\":\"service_account\",...}' (полный JSON)\n" +
        "2. FIREBASE_PROJECT_ID=..., FIREBASE_CLIENT_EMAIL=..., FIREBASE_PRIVATE_KEY=\"...\" (отдельные переменные)",
      ...(firebaseError && process.env.NODE_ENV !== "production" && {
        details: firebaseError.message
      })
    });
  }

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({ error: "CHANNEL_NOT_FOUND" });
    }

                const channelData = channelSnap.data() as {
                  name?: string;
                  googleDriveFolderId?: string;
                };

                // Определяем папку: сначала из канала (с trim), потом из .env (с trim)
                const channelFolderId = channelData.googleDriveFolderId?.trim() || undefined;
                const defaultParent = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

                // Проверка будет выполнена в uploadVideoToDrive, но для ясности логируем здесь
                Logger.info("Determining Google Drive folder", {
                  channelFolderId: channelFolderId || "not set",
                  defaultParent: defaultParent || "not set",
                  willUse: channelFolderId || defaultParent || "none"
                });

    // Создаем Telegram-клиент
    const client = await createTelegramClientFromStringSession(stringSession);

    try {
      // TODO: Улучшенный поиск видео - получаем последние сообщения и ищем самое свежее видео
      Logger.info("Fetching latest messages from SyntX chat for video search", {
        chatId: SYNX_CHAT_ID,
        limit: 50
      });
      
      const messages = (await client.getMessages(SYNX_CHAT_ID, {
        limit: 50
      })) as Api.Message[];

      Logger.info(`Received ${messages.length} messages from SyntX chat`);

      // Фильтруем сообщения с видео и сортируем по дате (самое свежее первым)
      const videoMessages = messages
        .filter((msg) => {
          try {
            // Проверяем наличие video attachment
            const hasVideo =
              "video" in msg &&
              (msg as any).video != null &&
              !(msg as any).video.deleted;
            
            // Проверяем наличие document с видео-атрибутом
            const doc = (msg as any).document;
            const hasDocVideo =
              doc != null &&
              Array.isArray(doc.attributes) &&
              doc.attributes.some(
                (attr: any) =>
                  attr?.className === "DocumentAttributeVideo" ||
                  attr?.className === "MessageMediaDocument"
              ) &&
              // Дополнительная проверка MIME типа для документов
              (doc.mimeType?.startsWith("video/") ||
                doc.mimeType === "application/octet-stream" ||
                doc.fileName?.match(/\.(mp4|avi|mov|mkv|webm)$/i));

            return hasVideo || hasDocVideo;
          } catch (filterError) {
            Logger.warn("Error filtering video message", {
              messageId: (msg as any).id,
              error: String(filterError)
            });
            return false;
          }
        })
        .sort((a, b) => {
          // Сортируем по дате (самое свежее первым)
          // В Telegram API дата может быть в разных форматах
          let dateA = 0;
          let dateB = 0;
          
          try {
            const msgA = a as any;
            const msgB = b as any;
            
            // Пробуем разные способы получить дату
            if (msgA.date) {
              dateA = msgA.date instanceof Date 
                ? msgA.date.getTime() 
                : typeof msgA.date === 'number' 
                  ? msgA.date * 1000 // Unix timestamp в секундах
                  : new Date(msgA.date).getTime();
            } else if (msgA.id) {
              // Если даты нет, используем ID как fallback (обычно ID больше = новее)
              dateA = msgA.id;
            }
            
            if (msgB.date) {
              dateB = msgB.date instanceof Date 
                ? msgB.date.getTime() 
                : typeof msgB.date === 'number' 
                  ? msgB.date * 1000
                  : new Date(msgB.date).getTime();
            } else if (msgB.id) {
              dateB = msgB.id;
            }
          } catch (sortError) {
            Logger.warn("Error sorting messages by date", {
              error: String(sortError)
            });
          }
          
          return dateB - dateA; // Сортируем по убыванию (новые первыми)
        });

      if (videoMessages.length === 0) {
        Logger.warn("No video messages found in SyntX chat", {
          totalMessages: messages.length,
          chatId: SYNX_CHAT_ID
        });
        return res.status(404).json({
          error: "NO_VIDEO_FOUND",
          message:
            "Видео ещё не готово в чате SyntX. Подождите окончания генерации и попробуйте ещё раз."
        });
      }

      // Берём самое последнее видео
      const videoMessage = videoMessages[0];
      
      Logger.info("Video message found, preparing to download", {
        messageId: videoMessage.id,
        hasVideo: "video" in videoMessage,
        hasDocument: "document" in videoMessage,
        totalVideoMessages: videoMessages.length
      });

      // TODO: Улучшенное скачивание с проверкой размера и прогрессом
      Logger.info("Starting video download from Telegram", {
        messageId: videoMessage.id
      });

      const downloadStartTime = Date.now();
      let fileBuffer: Buffer | undefined;

      try {
        fileBuffer = (await client.downloadMedia(videoMessage, {
          // Опции для скачивания
        })) as Buffer | undefined;
      } catch (downloadError: any) {
        Logger.error("Error during Telegram media download", {
          error: String(downloadError?.message ?? downloadError),
          messageId: videoMessage.id
        });
        throw new Error(`TELEGRAM_DOWNLOAD_ERROR: ${downloadError?.message ?? "Failed to download video"}`);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        Logger.error("Downloaded file buffer is empty or null", {
          messageId: videoMessage.id,
          bufferLength: fileBuffer?.length ?? 0
        });
        return res.status(500).json({
          error: "TELEGRAM_DOWNLOAD_FAILED",
          message: "Не удалось скачать видео из SyntX. Файл пустой или повреждён."
        });
      }

      // TODO: Проверка размера файла (максимум 100MB для безопасности)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
      if (fileBuffer.length > MAX_FILE_SIZE) {
        Logger.error("Downloaded file is too large", {
          messageId: videoMessage.id,
          fileSizeBytes: fileBuffer.length,
          maxSizeBytes: MAX_FILE_SIZE
        });
        return res.status(413).json({
          error: "FILE_TOO_LARGE",
          message: `Файл слишком большой (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB). Максимальный размер: 100 MB.`
        });
      }

      const downloadDuration = Date.now() - downloadStartTime;
      const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
      
      Logger.info("Video downloaded successfully from Telegram", {
        messageId: videoMessage.id,
        fileSizeBytes: fileBuffer.length,
        fileSizeMB,
        downloadDurationMs: downloadDuration,
        downloadSpeedMBps: ((fileBuffer.length / (1024 * 1024)) / (downloadDuration / 1000)).toFixed(2)
      });

      const mimeType = "video/mp4";
      const safeName =
        channelData.name?.replace(/[^\w\d\-]+/g, "_").slice(0, 50) ||
        `channel_${channelId}`;
      const fileName = `${safeName}_${Date.now()}.mp4`;

      // Папка будет определена в uploadVideoToDrive (channelFolderId || defaultParent)
      Logger.info("Preparing to upload video to Google Drive", {
        channelId,
        channelFolderId: channelFolderId || "not set",
        defaultParent: defaultParent || "not set",
        fileName
      });

      const driveResult = await uploadVideoToDrive(
        fileBuffer,
        mimeType,
        fileName,
        channelFolderId
      );

      // Сохраняем информацию о видео в подколлекции канала
      await channelRef.collection("generatedVideos").add({
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink || null,
        driveWebContentLink: driveResult.webContentLink || null,
        createdAt: new Date(),
        source: "syntx"
      });

      Logger.info("Video successfully saved to Google Drive", {
        fileId: driveResult.fileId
      });

      return res.json({
        status: "ok",
        driveFileId: driveResult.fileId,
        webViewLink: driveResult.webViewLink,
        webContentLink: driveResult.webContentLink
      });
    } finally {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    const errorStack = err?.stack;
    
    Logger.error("Error in /api/telegram/fetchLatestVideoToDrive", {
      error: errorMessage,
      stack: errorStack,
      userId,
      channelId
    });

    // Специфичные ошибки
    if (
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED") ||
      errorMessage.includes("Не указана папка для загрузки")
    ) {
      return res.status(400).json({
        error: "NO_DRIVE_FOLDER_CONFIGURED",
        message:
          "Не указана папка для загрузки. Укажите Google Drive Folder ID в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED")) {
      return res.status(503).json({
        error: "GOOGLE_DRIVE_NOT_CONFIGURED",
        message:
          "Google Drive не настроен. Добавьте GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_AUTH_FAILED")) {
      return res.status(503).json({
        error: "GOOGLE_DRIVE_AUTH_FAILED",
        message:
          "Ошибка аутентификации Google Drive. Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND")) {
      // Извлекаем детали из сообщения об ошибке
      const detailsMatch = errorMessage.match(/GOOGLE_DRIVE_FOLDER_NOT_FOUND: (.+)/);
      const details = detailsMatch ? detailsMatch[1] : "Папка не найдена";
      
      return res.status(400).json({
        error: "GOOGLE_DRIVE_FOLDER_NOT_FOUND",
        message: details
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED")) {
      // Извлекаем детальное сообщение из ошибки (там уже есть email Service Account)
      const detailsMatch = errorMessage.match(/GOOGLE_DRIVE_PERMISSION_DENIED: (.+)/);
      const details = detailsMatch ? detailsMatch[1] : "Нет доступа к папке Google Drive";
      
      return res.status(403).json({
        error: "GOOGLE_DRIVE_PERMISSION_DENIED",
        message: details
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")) {
      return res.status(400).json({
        error: "GOOGLE_DRIVE_NOT_A_FOLDER",
        message: "Указанный ID не является папкой Google Drive. Проверьте правильность ID."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_QUOTA_EXCEEDED")) {
      return res.status(429).json({
        error: "GOOGLE_DRIVE_QUOTA_EXCEEDED",
        message:
          "Превышена квота Google Drive API. Попробуйте позже."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FILE_TOO_LARGE")) {
      return res.status(413).json({
        error: "GOOGLE_DRIVE_FILE_TOO_LARGE",
        message:
          "Файл слишком большой для загрузки в Google Drive."
      });
    }

    if (errorMessage.includes("TELEGRAM_DOWNLOAD_ERROR")) {
      return res.status(500).json({
        error: "TELEGRAM_DOWNLOAD_FAILED",
        message:
          "Ошибка при скачивании видео из Telegram. Проверьте подключение и попробуйте позже."
      });
    }

    if (errorMessage.includes("FILE_TOO_LARGE")) {
      return res.status(413).json({
        error: "FILE_TOO_LARGE",
        message:
          "Файл слишком большой для загрузки. Максимальный размер: 100 MB."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_UPLOAD_FAILED")) {
      // Извлекаем детали ошибки из сообщения
      const details = errorMessage.replace("GOOGLE_DRIVE_UPLOAD_FAILED: ", "");
      return res.status(500).json({
        error: "GOOGLE_DRIVE_UPLOAD_FAILED",
        message:
          `Ошибка при сохранении видео в Google Drive: ${details}. Проверьте настройки и попробуйте позже.`
      });
    }

    if (errorMessage.includes("FIRESTORE") || errorMessage.includes("Firebase")) {
      return res.status(503).json({
        error: "FIRESTORE_ERROR",
        message:
          "Ошибка доступа к базе данных. Проверьте настройки Firebase Admin."
      });
    }

    // Общая ошибка с деталями для разработки (в продакшене можно скрыть)
    return res.status(500).json({
      error: "FETCH_VIDEO_TO_DRIVE_FAILED",
      message:
        "Ошибка сервера при загрузке видео из SyntX в Google Drive. Попробуйте позже.",
      // В разработке показываем детали ошибки
      ...(process.env.NODE_ENV !== "production" && { details: errorMessage })
    });
  }
});

// Новый эндпоинт: скачать видео из Telegram во временную папку и загрузить в Google Drive
// Теперь использует общий сервис downloadAndUploadVideoToDrive
router.post("/fetchVideoAndUploadToDrive", authRequired, async (req, res) => {
  const {
    channelId,
    googleDriveFolderId,
    telegramMessageId,
    videoTitle
  } = req.body as {
    channelId?: string;
    googleDriveFolderId?: string;
    telegramMessageId?: number;
    videoTitle?: string;
  };

  if (!channelId) {
    return res.status(400).json({
      status: "error",
      message: "channelId is required"
    });
  }

  const userId = req.user!.uid;
  Logger.info("fetchVideoAndUploadToDrive: start", {
    userId,
    channelId,
    googleDriveFolderId,
    telegramMessageId,
    videoTitle: videoTitle || "not provided"
  });

  // Используем общий сервис для скачивания и загрузки
  try {
    const result = await downloadAndUploadVideoToDrive({
      channelId,
      userId,
      telegramMessageId,
      videoTitle,
      // При ручной загрузке prompt обычно не доступен, но можно передать если есть
      prompt: undefined
    });

    if (result.success) {
      return res.json({
        status: "ok",
        driveFileId: result.driveFileId,
        driveWebViewLink: result.driveWebViewLink,
        fileId: result.driveFileId, // Для обратной совместимости
        webViewLink: result.driveWebViewLink, // Для обратной совместимости
        webContentLink: result.driveWebContentLink,
        fileName: result.fileName
      });
    } else {
      // Обработка ошибок из сервиса
      const errorMessage = result.error || "Unknown error";

      // Обработка специфичных ошибок
      if (errorMessage.includes("NO_VIDEO_FOUND")) {
      return res.status(404).json({
        status: "error",
        message:
          "Видео ещё не готово в чате SyntX. Подождите окончания генерации и попробуйте ещё раз."
      });
    }

    if (errorMessage.includes("TELEGRAM_MESSAGE_NOT_FOUND")) {
      return res.status(404).json({
        status: "error",
        message: errorMessage.replace("TELEGRAM_MESSAGE_NOT_FOUND: ", "")
      });
    }

    if (errorMessage.includes("TELEGRAM_DOWNLOAD_TIMEOUT") || errorMessage.includes("TELEGRAM_TIMEOUT")) {
      return res.status(504).json({
        status: "error",
        message: errorMessage
          .replace("TELEGRAM_DOWNLOAD_TIMEOUT: ", "")
          .replace("TELEGRAM_TIMEOUT: ", "") ||
          "Превышено время ожидания ответа от Telegram. Проверьте подключение к интернету и попробуйте ещё раз."
      });
    }

    if (errorMessage.includes("TELEGRAM_DOWNLOAD_ERROR") || errorMessage.includes("TELEGRAM_DOWNLOAD_FAILED")) {
      return res.status(500).json({
        status: "error",
        message:
          errorMessage.replace("TELEGRAM_DOWNLOAD_ERROR: ", "").replace("TELEGRAM_DOWNLOAD_FAILED: ", "") ||
          "Ошибка при скачивании видео из Telegram. Проверьте подключение и попробуйте позже."
      });
    }

    if (errorMessage.includes("FILE_TOO_LARGE")) {
      return res.status(413).json({
        status: "error",
        message: errorMessage.replace("FILE_TOO_LARGE: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED")) {
      return res.status(400).json({
        status: "error",
        message: errorMessage.replace("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND")) {
      return res.status(400).json({
        status: "error",
        message: errorMessage.replace("GOOGLE_DRIVE_FOLDER_NOT_FOUND: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED")) {
      return res.status(403).json({
        status: "error",
        message: errorMessage.replace("GOOGLE_DRIVE_PERMISSION_DENIED: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_AUTH_FAILED")) {
      return res.status(503).json({
        status: "error",
        message:
          "Ошибка аутентификации Google Drive. Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_QUOTA_EXCEEDED")) {
      return res.status(429).json({
        status: "error",
        message: "Превышена квота Google Drive API. Попробуйте позже."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_UPLOAD_FAILED")) {
      return res.status(500).json({
        status: "error",
        message:
          errorMessage.replace("GOOGLE_DRIVE_UPLOAD_FAILED: ", "") ||
          "Ошибка при загрузке файла в Google Drive. Проверьте настройки и попробуйте позже."
      });
    }

      // Общая ошибка
      return res.status(500).json({
        status: "error",
        message:
          errorMessage ||
          "Ошибка сервера при обработке видео. Попробуйте позже.",
        ...(process.env.NODE_ENV !== "production" && { details: errorMessage })
      });
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    Logger.error("Error in /api/telegram/fetchVideoAndUploadToDrive", {
      error: errorMessage,
      userId,
      channelId
    });

    return res.status(500).json({
      status: "error",
      message: errorMessage || "Ошибка сервера при обработке видео. Попробуйте позже."
    });
  }
});

export default router;


