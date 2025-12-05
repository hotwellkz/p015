import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { Logger } from "../utils/logger";

export interface VideoUploadNotificationParams {
  chatId: string;
  channelName: string;
  fileName: string;
  webViewLink?: string;
  webContentLink?: string;
  sizeBytes?: number;
  uploadedAt: Date;
}

/**
 * Отправляет уведомление в Telegram после успешной загрузки видео в Google Drive.
 * Ошибки логируются и не пробрасываются наверх, чтобы не ломать основную логику.
 */
export async function sendVideoUploadNotification(
  params: VideoUploadNotificationParams
): Promise<void> {
  const { chatId, channelName, fileName, webViewLink, webContentLink, sizeBytes, uploadedAt } =
    params;

  const stringSession = loadSessionString();
  if (!stringSession) {
    Logger.error("sendVideoUploadNotification: TELEGRAM_SESSION_NOT_INITIALIZED");
    return;
  }

  let client: any;

  try {
    client = await createTelegramClientFromStringSession(stringSession);

    const sizeMb =
      typeof sizeBytes === "number" ? (sizeBytes / (1024 * 1024)).toFixed(1) : undefined;

    const link = webViewLink || webContentLink || "";
    const dateStr = uploadedAt.toLocaleString("ru-RU");

    let text = "✅ Видео загружено на Google Drive\n\n";
    text += `Канал: ${channelName}\n`;
    text += `Файл: ${fileName}\n`;
    if (sizeMb) text += `Размер: ~${sizeMb} МБ\n`;
    if (link) text += `Ссылка: ${link}\n`;
    text += `Время: ${dateStr}`;

    Logger.info("Sending video upload notification", {
      chatId,
      channelName,
      fileName,
      webViewLink,
      webContentLink,
      sizeBytes
    });

    await client.sendMessage(chatId, { message: text, noWebpage: false });
  } catch (error: any) {
    Logger.error("Failed to send video upload notification", {
      chatId,
      error: error?.message || String(error)
    });
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}
