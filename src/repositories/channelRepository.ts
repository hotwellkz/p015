import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../services/firebase";
import type { Channel, ChannelCreatePayload } from "../domain/channel";
import { channelConverter } from "../domain/channel";

const channelCollection = (uid: string) =>
  collection(db, "users", uid, "channels").withConverter(channelConverter);

export interface ChannelRepository {
  getChannels: (uid: string) => Promise<Channel[]>;
  createChannel: (uid: string, data: ChannelCreatePayload) => Promise<Channel>;
  updateChannel: (uid: string, channel: Channel) => Promise<void>;
  deleteChannel: (uid: string, channelId: string) => Promise<void>;
  reorderChannels: (uid: string, orderedIds: string[]) => Promise<void>;
}

export const channelRepository: ChannelRepository = {
  async getChannels(uid) {
    // Получаем все каналы без сортировки на уровне запроса
    // (так как orderIndex может отсутствовать у старых каналов)
    const snapshot = await getDocs(channelCollection(uid));
    const channels = snapshot.docs.map((docSnap) => docSnap.data());
    
    // Сортируем на клиенте: сначала по orderIndex, затем по createdAt
    return channels.sort((a, b) => {
      const aOrder = a.orderIndex ?? a.createdAt?.toMillis() ?? 0;
      const bOrder = b.orderIndex ?? b.createdAt?.toMillis() ?? 0;
      return aOrder - bOrder;
    });
  },

  async createChannel(uid, data) {
    const col = channelCollection(uid);
    
    // Если orderIndex не указан, устанавливаем его в максимальное значение + 1
    // чтобы новый канал появлялся в конце списка
    let orderIndex = data.orderIndex;
    if (orderIndex === undefined) {
      const existingChannels = await this.getChannels(uid);
      const maxOrderIndex = existingChannels.reduce(
        (max, ch) => Math.max(max, ch.orderIndex ?? 0),
        -1
      );
      orderIndex = maxOrderIndex + 1;
    }
    
    // Создаём временный Channel объект для использования конвертера
    // Конвертер правильно обработает undefined значения
    const tempChannel: Channel = {
      id: "", // Временный id, будет заменён Firestore
      name: data.name,
      platform: data.platform,
      language: data.language,
      targetDurationSec: data.targetDurationSec,
      niche: data.niche,
      audience: data.audience,
      tone: data.tone,
      blockedTopics: data.blockedTopics,
      generationMode: data.generationMode || "script",
      telegramAutoSendEnabled: data.telegramAutoSendEnabled ?? false,
      telegramAutoScheduleEnabled: data.telegramAutoScheduleEnabled ?? false,
      autoSendEnabled: data.autoSendEnabled ?? false,
      autoSendSchedules: data.autoSendSchedules ?? [],
      autoDownloadToDriveEnabled: data.autoDownloadToDriveEnabled ?? false,
      autoDownloadDelayMinutes: data.autoDownloadDelayMinutes ?? 10,
      uploadNotificationEnabled: data.uploadNotificationEnabled ?? false,
      uploadNotificationChatId: data.uploadNotificationChatId ?? null,
      orderIndex,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      // Опциональные поля
      extraNotes: data.extraNotes,
      youtubeUrl: data.youtubeUrl,
      tiktokUrl: data.tiktokUrl,
      instagramUrl: data.instagramUrl,
      googleDriveFolderId: data.googleDriveFolderId,
      timezone: data.timezone
    };
    
    // addDoc с конвертером автоматически вызовет toFirestore(), который отфильтрует undefined
    const docRef = await addDoc(col, tempChannel);
    const createdSnap = await getDoc(docRef.withConverter(channelConverter));
    if (!createdSnap.exists()) {
      throw new Error("Не удалось создать канал");
    }
    return createdSnap.data();
  },

  async updateChannel(uid, channel) {
    const docRef = doc(db, "users", uid, "channels", channel.id);
    
    // DEBUG: Логируем, что сохраняется (только в development)
    if (import.meta.env.DEV) {
      console.log("DEBUG updateChannel payload", {
        id: channel.id,
        autoSendEnabled: channel.autoSendEnabled,
        timezone: channel.timezone,
        autoSendSchedules: channel.autoSendSchedules,
        autoSendSchedulesCount: channel.autoSendSchedules?.length || 0,
        fullChannel: channel
      });
    }
    
    // Используем channelConverter.toFirestore() для правильной обработки undefined значений
    const firestoreData = channelConverter.toFirestore(channel);
    
    // Удаляем createdAt из обновления, так как это поле не должно изменяться
    const { createdAt, ...updateData } = firestoreData;
    
    await updateDoc(docRef, updateData);
  },

  async deleteChannel(uid, channelId) {
    const docRef = doc(db, "users", uid, "channels", channelId);
    await deleteDoc(docRef);
  },

  async reorderChannels(uid, orderedIds) {
    // Обновляем orderIndex для каждого канала по порядку в массиве
    const updatePromises = orderedIds.map((channelId, index) => {
      const docRef = doc(db, "users", uid, "channels", channelId);
      return updateDoc(docRef, { orderIndex: index });
    });
    await Promise.all(updatePromises);
  }
};

