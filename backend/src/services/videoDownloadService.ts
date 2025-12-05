import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { downloadTelegramVideoToTemp, cleanupTempFile } from "../utils/telegramDownload";
import { uploadFileToDrive } from "./googleDrive";
import { uploadFileToDriveWithOAuth } from "./googleDriveOAuth";
import { getUserOAuthTokens, updateUserAccessToken } from "../repositories/userOAuthTokensRepo";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { google } from "googleapis";
import { generateVideoFileName } from "../utils/fileUtils";
import { sendVideoUploadNotification } from "./notificationService";

const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;

export interface DownloadAndUploadOptions {
  channelId: string;
  userId: string;
  telegramMessageId?: number;
  videoTitle?: string; // сгенерированное название ролика
  prompt?: string; // текст промпта для fallback
  scheduleId?: string; // Для отслеживания автоматических загрузок
}

export interface DownloadAndUploadResult {
  success: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveWebContentLink?: string;
  fileName?: string;
  error?: string;
}

/**
 * Скачивает видео из Telegram и загружает его в Google Drive
 * Используется как для ручной загрузки, так и для автоматической
 */
export async function downloadAndUploadVideoToDrive(
  options: DownloadAndUploadOptions
): Promise<DownloadAndUploadResult> {
  const { channelId, userId, telegramMessageId, videoTitle, prompt, scheduleId } = options;

  // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ
  console.log("AUTO_TASK_START:", {
    channelId,
    userId,
    telegramMessageId,
    scheduleId: scheduleId || "manual",
    timestamp: new Date().toISOString(),
    callStack: new Error().stack?.split("\n").slice(1, 4).join(" | ")
  });

  Logger.info("downloadAndUploadVideoToDrive: start", {
    channelId,
    userId,
    telegramMessageId,
    videoTitle: videoTitle || "not provided",
    scheduleId: scheduleId || "manual",
    timestamp: new Date().toISOString(),
    callStack: new Error().stack?.split("\n").slice(1, 4).join(" | ")
  });

  // Проверяем Telegram-сессию
  const stringSession = loadSessionString();
  if (!stringSession) {
    return {
      success: false,
      error: "Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
    };
  }

  if (!SYNX_CHAT_ID) {
    return {
      success: false,
      error: "SYNX_CHAT_ID is not configured on the server"
    };
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in downloadAndUploadVideoToDrive");
    return {
      success: false,
      error: "Firebase Admin не настроен"
    };
  }

  let tempFilePath: string | null = null;
  let telegramClient: any = null;

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return {
        success: false,
        error: "Канал не найден"
      };
    }

    const channelData = channelSnap.data() as {
      name?: string;
      googleDriveFolderId?: string;
      uploadNotificationEnabled?: boolean;
      uploadNotificationChatId?: string;
    };

    // ПРОВЕРКА 1: Проверяем, не был ли уже загружен файл с таким telegramMessageId
    if (telegramMessageId) {
      Logger.info("downloadAndUploadVideoToDrive: checking for existing upload by telegramMessageId", {
        channelId,
        userId,
        telegramMessageId,
        checkTimestamp: new Date().toISOString()
      });

      // Проверяем в коллекции generatedVideos
      const existingVideoQuery = await channelRef
        .collection("generatedVideos")
        .where("telegramMessageId", "==", telegramMessageId)
        .limit(10) // Получаем несколько записей, чтобы проверить наличие driveFileId
        .get();

      // Фильтруем в памяти, так как Firestore не поддерживает != null напрямую
      const existingVideoDoc = existingVideoQuery.docs.find(
        (doc) => {
          const data = doc.data();
          return data.driveFileId && data.driveFileId.trim() !== "";
        }
      );

      if (existingVideoDoc) {
        const existingVideo = existingVideoDoc.data();
        console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
          taskId: `${channelId}_${telegramMessageId}`,
          reason: "found_in_generatedVideos",
          driveFileId: existingVideo.driveFileId,
          createdAt: existingVideo.createdAt
        });

        Logger.warn("downloadAndUploadVideoToDrive: file already uploaded (found in generatedVideos)", {
          channelId,
          userId,
          telegramMessageId,
          existingDriveFileId: existingVideo.driveFileId,
          existingWebViewLink: existingVideo.driveWebViewLink,
          existingCreatedAt: existingVideo.createdAt
        });

        return {
          success: true,
          driveFileId: existingVideo.driveFileId,
          driveWebViewLink: existingVideo.driveWebViewLink,
          driveWebContentLink: existingVideo.driveWebContentLink,
          fileName: existingVideo.fileName || "unknown"
        };
      }

      // Проверяем в коллекции videoGenerations (если там есть флаг uploadedToDrive и driveFileId)
      const existingGenerationQuery = await channelRef
        .collection("videoGenerations")
        .where("messageId", "==", telegramMessageId)
        .limit(10) // Получаем несколько записей для проверки
        .get();

      // Фильтруем в памяти: ищем запись с uploadedToDrive === true И driveFileId
      const existingGenDoc = existingGenerationQuery.docs.find(
        (doc) => {
          const data = doc.data();
          return data.uploadedToDrive === true && data.driveFileId && data.driveFileId.trim() !== "";
        }
      );

      if (existingGenDoc) {
        const existingGen = existingGenDoc.data();
        console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
          taskId: `${channelId}_${telegramMessageId}`,
          reason: "found_in_videoGenerations",
          driveFileId: existingGen.driveFileId,
          uploadedToDrive: existingGen.uploadedToDrive,
          createdAt: existingGen.createdAt
        });

        Logger.warn("downloadAndUploadVideoToDrive: file already uploaded (found in videoGenerations)", {
          channelId,
          userId,
          telegramMessageId,
          existingDriveFileId: existingGen.driveFileId,
          existingCreatedAt: existingGen.createdAt
        });

        return {
          success: true,
          driveFileId: existingGen.driveFileId,
          driveWebViewLink: existingGen.driveWebViewLink,
          driveWebContentLink: existingGen.driveWebContentLink,
          fileName: existingGen.fileName || "unknown"
        };
      }

      Logger.info("downloadAndUploadVideoToDrive: no existing upload found, proceeding with download and upload", {
        channelId,
        userId,
        telegramMessageId,
        willDownload: true,
        willUpload: true
      });
    } else {
      Logger.info("downloadAndUploadVideoToDrive: no telegramMessageId provided, skipping duplicate check, proceeding with download", {
        channelId,
        userId,
        note: "Will proceed with download and upload"
      });
    }

    // Определяем папку для загрузки: сначала из канала, потом из .env
    const folderIdFromChannel = channelData.googleDriveFolderId?.trim() || undefined;
    const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

    const finalFolderId = folderIdFromChannel || defaultFolderId;

    if (!finalFolderId) {
      return {
        success: false,
        error: "Не указана папка для загрузки. Укажите googleDriveFolderId в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
      };
    }

    Logger.info("Determining Google Drive folder", {
      folderIdFromChannel: folderIdFromChannel || "not set",
      defaultFolderId: defaultFolderId || "not set",
      finalFolderId
    });

    // Создаём Telegram-клиент
    telegramClient = await createTelegramClientFromStringSession(stringSession);

    try {
      // Шаг 1: Скачиваем видео во временную папку
      // ВАЖНО: При автоматическом скачивании telegramMessageId - это ID промпта (текстового сообщения),
      // а не видео. Видео приходит позже. Поэтому передаём messageId как "маркер" для поиска видео ПОСЛЕ него,
      // но не пытаемся получить само сообщение с этим ID.
      Logger.info("Step 1: Downloading video from Telegram to temp folder", {
        chatId: SYNX_CHAT_ID,
        promptMessageId: telegramMessageId || "not specified",
        note: telegramMessageId 
          ? "Will search for video after this prompt message ID" 
          : "Will search for latest video in chat"
      });

      // Передаём messageId только как маркер для поиска видео после него
      // В downloadTelegramVideoToTemp это будет использовано для фильтрации сообщений
      Logger.info("downloadAndUploadVideoToDrive: starting video download from Telegram", {
        channelId,
        userId,
        telegramMessageId,
        chatId: SYNX_CHAT_ID,
        scheduleId: scheduleId || "manual"
      });

      console.log("DOWNLOAD_START:", {
        channelId,
        telegramMessageId,
        chatId: SYNX_CHAT_ID,
        timestamp: new Date().toISOString()
      });

      let downloadResult;
      try {
        downloadResult = await downloadTelegramVideoToTemp(
          telegramClient,
          SYNX_CHAT_ID,
          telegramMessageId // Передаём как маркер, не как конкретное сообщение
        );
        
        console.log("DOWNLOAD_SUCCESS:", {
          filePath: downloadResult.tempPath,
          fileName: downloadResult.fileName,
          messageId: downloadResult.messageId,
          timestamp: new Date().toISOString()
        });
      } catch (downloadError: any) {
        Logger.error("downloadAndUploadVideoToDrive: video download failed", {
          channelId,
          userId,
          telegramMessageId,
          error: downloadError?.message || String(downloadError),
          errorStack: downloadError?.stack,
          errorName: downloadError?.name
        });
        throw new Error(`VIDEO_DOWNLOAD_FAILED: Не удалось скачать видео из Telegram. ${downloadError?.message || String(downloadError)}`);
      }

      tempFilePath = downloadResult.tempPath;

      Logger.info("downloadAndUploadVideoToDrive: video downloaded successfully", {
        channelId,
        tempPath: tempFilePath,
        fileName: downloadResult.fileName,
        messageId: downloadResult.messageId
      });

      // Шаг 2: Загружаем файл в Google Drive
      Logger.info("Step 2: Uploading file to Google Drive", {
        filePath: tempFilePath,
        folderId: finalFolderId
      });

      // Формируем имя файла для Google Drive используя общую функцию
      const driveFileName = generateVideoFileName({
        title: videoTitle,
        prompt: prompt,
        channelName: channelData.name,
        createdAt: new Date()
      });
      
      Logger.info("Generated video file name for Google Drive", {
        channelId,
        originalTitle: videoTitle || "not provided",
        promptLength: prompt?.length || 0,
        channelName: channelData.name || "not provided",
        fileName: driveFileName
      });

      // Пробуем использовать OAuth токен пользователя, если доступен
      Logger.info("downloadAndUploadVideoToDrive: starting Google Drive upload", {
        channelId,
        userId,
        fileName: driveFileName,
        folderId: finalFolderId,
        filePath: tempFilePath,
        scheduleId: scheduleId || "manual"
      });

      console.log("UPLOAD_START:", {
        filePath: tempFilePath,
        fileName: driveFileName,
        folderId: finalFolderId,
        timestamp: new Date().toISOString()
      });

      let driveResult;
      let userTokens;
      
      try {
        userTokens = await getUserOAuthTokens(userId);
        
        Logger.info("downloadAndUploadVideoToDrive: OAuth tokens check", {
          userId,
          hasAccessToken: !!userTokens?.googleDriveAccessToken,
          hasRefreshToken: !!userTokens?.googleDriveRefreshToken,
          tokenExpiry: userTokens?.googleDriveTokenExpiry 
            ? new Date(userTokens.googleDriveTokenExpiry).toISOString() 
            : "not set"
        });
        
        if (userTokens?.googleDriveAccessToken) {
          // Проверяем, не истёк ли токен
          const now = Date.now();
          const isExpired = userTokens.googleDriveTokenExpiry 
            ? userTokens.googleDriveTokenExpiry < now 
            : false;
          
          let accessToken = userTokens.googleDriveAccessToken;
          
          // Если токен истёк, обновляем его
          if (isExpired && userTokens.googleDriveRefreshToken) {
            Logger.info("downloadAndUploadVideoToDrive: OAuth token expired, refreshing", { 
              userId,
              expiryTime: new Date(userTokens.googleDriveTokenExpiry || 0).toISOString(),
              currentTime: new Date().toISOString()
            });
            
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_OAUTH_CLIENT_ID,
              process.env.GOOGLE_OAUTH_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: userTokens.googleDriveRefreshToken });
            
            const { credentials } = await oauth2Client.refreshAccessToken();
            accessToken = credentials.access_token!;
            
            // Сохраняем обновлённый токен
            await updateUserAccessToken(
              userId,
              accessToken,
              credentials.expiry_date || Date.now() + 3600000
            );
            
            Logger.info("downloadAndUploadVideoToDrive: OAuth token refreshed successfully", { 
              userId,
              newExpiryTime: credentials.expiry_date 
                ? new Date(credentials.expiry_date).toISOString() 
                : "not set"
            });
          }
          
          // Используем OAuth токен для загрузки
          Logger.info("downloadAndUploadVideoToDrive: using OAuth token for upload", { 
            userId,
            folderId: finalFolderId,
            fileName: driveFileName
          });
          
          try {
            driveResult = await uploadFileToDriveWithOAuth({
              filePath: tempFilePath,
              fileName: driveFileName,
              mimeType: "video/mp4",
              parentFolderId: finalFolderId,
              accessToken: accessToken
            });
            
            Logger.info("downloadAndUploadVideoToDrive: OAuth upload successful", {
              userId,
              fileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink
            });

            console.log("UPLOAD_SUCCESS:", {
              driveFileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink,
              fileName: driveFileName,
              timestamp: new Date().toISOString()
            });
          } catch (oauthUploadError: any) {
            Logger.error("downloadAndUploadVideoToDrive: OAuth upload failed", {
              userId,
              error: oauthUploadError?.message || String(oauthUploadError),
              errorStack: oauthUploadError?.stack,
              errorCode: oauthUploadError?.code,
              folderId: finalFolderId
            });
            throw oauthUploadError;
          }
        } else {
          // Fallback: используем Service Account (может не работать для загрузки)
          Logger.warn("downloadAndUploadVideoToDrive: no OAuth token found, using Service Account", { 
            userId,
            folderId: finalFolderId
          });
          
          try {
            driveResult = await uploadFileToDrive({
              filePath: tempFilePath,
              fileName: driveFileName,
              mimeType: "video/mp4",
              parentFolderId: finalFolderId
            });
            
            Logger.info("downloadAndUploadVideoToDrive: Service Account upload successful", {
              userId,
              fileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink
            });

            console.log("UPLOAD_SUCCESS:", {
              driveFileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink,
              fileName: driveFileName,
              timestamp: new Date().toISOString()
            });
          } catch (serviceAccountError: any) {
            Logger.error("downloadAndUploadVideoToDrive: Service Account upload failed", {
              userId,
              error: serviceAccountError?.message || String(serviceAccountError),
              errorStack: serviceAccountError?.stack,
              errorCode: serviceAccountError?.code,
              folderId: finalFolderId
            });
            throw serviceAccountError;
          }
        }
      } catch (uploadError: any) {
        // Если OAuth не работает, пробуем Service Account как fallback
        if (userTokens?.googleDriveAccessToken) {
          // Если был OAuth токен, но загрузка не удалась, пробуем Service Account
          Logger.warn("downloadAndUploadVideoToDrive: OAuth upload failed, trying Service Account fallback", {
            error: uploadError?.message,
            userId,
            folderId: finalFolderId
          });
          
          try {
            driveResult = await uploadFileToDrive({
              filePath: tempFilePath,
              fileName: driveFileName,
              mimeType: "video/mp4",
              parentFolderId: finalFolderId
            });
            
            Logger.info("downloadAndUploadVideoToDrive: Service Account fallback upload successful", {
              userId,
              fileId: driveResult.fileId
            });

            console.log("UPLOAD_SUCCESS:", {
              driveFileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink,
              fileName: driveFileName,
              timestamp: new Date().toISOString()
            });
          } catch (serviceAccountError: any) {
            // Если и Service Account не работает, пробрасываем ошибку
            Logger.error("downloadAndUploadVideoToDrive: both OAuth and Service Account uploads failed", {
              userId,
              oauthError: uploadError?.message,
              serviceAccountError: serviceAccountError?.message,
              folderId: finalFolderId
            });
            
            throw new Error(
              `GOOGLE_DRIVE_UPLOAD_FAILED: Не удалось загрузить файл в Google Drive. ` +
              `OAuth ошибка: ${uploadError?.message || String(uploadError)}. ` +
              `Service Account ошибка: ${serviceAccountError?.message || String(serviceAccountError)}. ` +
              `Проверьте права доступа к папке (ID: ${finalFolderId}) и авторизуйтесь через Google OAuth: http://localhost:8080/api/auth/google`
            );
          }
        } else {
          // Если не было OAuth токена, ошибка уже проброшена выше
          throw uploadError;
        }
      }

      Logger.info("downloadAndUploadVideoToDrive: File uploaded to Google Drive successfully", {
        channelId,
        userId,
        telegramMessageId,
        fileId: driveResult.fileId,
        fileName: driveFileName,
        webViewLink: driveResult.webViewLink,
        folderId: finalFolderId,
        scheduleId: scheduleId || "manual",
        uploadedAt: new Date().toISOString()
      });

      // Уведомления в Telegram (если включены)
      try {
        if (channelData.uploadNotificationEnabled === true) {
          const chatId = channelData.uploadNotificationChatId?.trim() || SYNX_CHAT_ID;

          if (chatId) {
            await sendVideoUploadNotification({
              chatId,
              channelName: channelData.name || `channel_${channelId}`,
              fileName: driveFileName,
              webViewLink: driveResult.webViewLink,
              webContentLink: driveResult.webContentLink,
              sizeBytes: undefined,
              uploadedAt: new Date()
            });
          } else {
            Logger.warn("Video upload notification is enabled but no chatId is available", {
              channelId,
              uploadNotificationChatId: channelData.uploadNotificationChatId,
              envSyntxChatIdSet: !!SYNX_CHAT_ID
            });
          }
        }
      } catch (notifyError: any) {
        // Ошибки при отправке уведомления не ломают загрузку файла
        Logger.error("Error while sending video upload notification", {
          channelId,
          error: notifyError?.message || String(notifyError)
        });
      }

      // Шаг 3: Удаляем временный файл
      Logger.info("Step 3: Cleaning up temporary file", {
        tempPath: tempFilePath
      });

      await cleanupTempFile(tempFilePath);
      tempFilePath = null; // Помечаем, что файл удалён

      // Шаг 4: Сохраняем информацию о видео в Firestore
      try {
        // Сохраняем в generatedVideos
        await channelRef.collection("generatedVideos").add({
          driveFileId: driveResult.fileId,
          driveWebViewLink: driveResult.webViewLink || null,
          driveWebContentLink: driveResult.webContentLink || null,
          createdAt: new Date(),
          source: scheduleId ? "auto-scheduled" : "manual",
          telegramMessageId: downloadResult.messageId,
          scheduleId: scheduleId || null,
          fileName: driveFileName
        });

        // Обновляем videoGenerations, если есть запись с таким messageId
        // ВАЖНО: Обновляем uploadedToDrive и driveFileId для идемпотентности
        if (telegramMessageId) {
          const generationQuery = await channelRef
            .collection("videoGenerations")
            .where("messageId", "==", telegramMessageId)
            .limit(1)
            .get();

          if (!generationQuery.empty) {
            const generationDoc = generationQuery.docs[0];
            const updateData = {
              uploadedToDrive: true,
              driveFileId: driveResult.fileId,
              driveWebViewLink: driveResult.webViewLink || null,
              driveWebContentLink: driveResult.webContentLink || null,
              uploadedAt: new Date(),
              fileName: driveFileName,
              status: "completed" // Обновляем статус на completed
            };
            
            await generationDoc.ref.update(updateData);

            Logger.info("downloadAndUploadVideoToDrive: updated videoGenerations with upload info", {
              channelId,
              userId,
              telegramMessageId,
              generationId: generationDoc.id,
              driveFileId: driveResult.fileId,
              uploadedToDrive: true
            });
          } else {
            // Если записи нет, создаём новую для истории
            try {
              await channelRef.collection("videoGenerations").add({
                messageId: telegramMessageId,
                uploadedToDrive: true,
                driveFileId: driveResult.fileId,
                driveWebViewLink: driveResult.webViewLink || null,
                driveWebContentLink: driveResult.webContentLink || null,
                uploadedAt: new Date(),
                fileName: driveFileName,
                status: "completed",
                createdAt: new Date()
              });
              
              Logger.info("downloadAndUploadVideoToDrive: created new videoGenerations record", {
                channelId,
                userId,
                telegramMessageId,
                driveFileId: driveResult.fileId
              });
            } catch (createError) {
              Logger.warn("downloadAndUploadVideoToDrive: failed to create videoGenerations record", {
                channelId,
                userId,
                telegramMessageId,
                error: String(createError)
              });
            }
          }
        }

        // Обновляем последнее видео в канале (опционально)
        await channelRef.update({
          lastVideoDriveFileId: driveResult.fileId,
          lastVideoDriveLink: driveResult.webViewLink || null,
          lastVideoUpdatedAt: new Date()
        });

        Logger.info("downloadAndUploadVideoToDrive: video info saved to Firestore", {
          channelId,
          userId,
          telegramMessageId: downloadResult.messageId,
          driveFileId: driveResult.fileId
        });
      } catch (firestoreError) {
        Logger.warn("Failed to save video info to Firestore", {
          error: String(firestoreError),
          channelId,
          userId,
          telegramMessageId: downloadResult.messageId
        });
        // Не прерываем выполнение, так как файл уже загружен
      }

      Logger.info("Video successfully processed and uploaded to Google Drive", {
        fileId: driveResult.fileId,
        webViewLink: driveResult.webViewLink,
        scheduleId: scheduleId || "manual"
      });

      return {
        success: true,
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink,
        driveWebContentLink: driveResult.webContentLink,
        fileName: driveFileName
      };
    } finally {
      // Отключаемся от Telegram
      try {
        if (telegramClient) {
          await telegramClient.disconnect();
        }
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    const errorStack = err?.stack;

    Logger.error("Error in downloadAndUploadVideoToDrive", {
      error: errorMessage,
      stack: errorStack,
      userId,
      channelId,
      tempFilePath,
      scheduleId
    });

    // Удаляем временный файл в случае ошибки
    if (tempFilePath) {
      Logger.warn("Cleaning up temp file after error", { tempFilePath });
      await cleanupTempFile(tempFilePath).catch((cleanupError) => {
        Logger.error("Failed to cleanup temp file after error", {
          tempPath: tempFilePath,
          error: String(cleanupError)
        });
      });
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

