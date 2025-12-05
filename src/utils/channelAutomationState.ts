import type { Channel } from "../domain/channel";
import { hhmmToMinutes, minutesToHHMM } from "./scheduleFreeSlots";

export type ChannelAutomationState = "current" | "next" | "previous" | "default";

export interface ChannelStateInfo {
  channelId: string;
  state: ChannelAutomationState;
  timeSlot?: string; // Время слота, который определяет состояние
}

/**
 * Определяет состояние автоматизации для канала на основе его расписания
 */
function getChannelState(
  channel: Channel,
  nowMinutes: number,
  minIntervalMinutes: number
): { state: ChannelAutomationState; timeSlot?: string } {
  if (!channel.autoSendEnabled || !channel.autoSendSchedules || channel.autoSendSchedules.length === 0) {
    return { state: "default" };
  }

  // Собираем все времена из включенных расписаний
  const times = channel.autoSendSchedules
    .filter((schedule) => schedule.enabled && schedule.time)
    .map((schedule) => schedule.time)
    .sort();

  if (times.length === 0) {
    return { state: "default" };
  }

  const validInterval = Math.max(1, Math.min(60, minIntervalMinutes || 11));

  // Проверяем, есть ли активный слот (текущий)
  for (const time of times) {
    const slotMinutes = hhmmToMinutes(time);
    if (Number.isNaN(slotMinutes)) continue;

    const endMinutes = slotMinutes + validInterval;
    let isActive = false;

    if (endMinutes < 1440) {
      isActive = slotMinutes <= nowMinutes && nowMinutes < endMinutes;
    } else {
      const endNormalized = endMinutes % 1440;
      isActive = nowMinutes >= slotMinutes || nowMinutes < endNormalized;
    }

    if (isActive) {
      return { state: "current", timeSlot: time };
    }
  }

  // Если нет активного, ищем следующий слот
  for (const time of times) {
    const slotMinutes = hhmmToMinutes(time);
    if (Number.isNaN(slotMinutes)) continue;

    if (slotMinutes > nowMinutes) {
      return { state: "next", timeSlot: time };
    }
  }

  // Если все слоты прошли, берём самый поздний как следующий (следующий день)
  if (times.length > 0) {
    return { state: "next", timeSlot: times[0] };
  }

  return { state: "default" };
}

/**
 * Определяет состояния всех каналов и возвращает информацию о текущем, следующем и предыдущем
 */
export function calculateChannelStates(
  channels: Channel[],
  minIntervalMinutes: number = 11
): Map<string, ChannelStateInfo> {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const states = new Map<string, ChannelStateInfo>();
  let currentChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;
  let nextChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;
  let previousChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;

  // Сначала определяем состояния для всех каналов
  // Сначала находим текущий канал
  for (const channel of channels) {
    const { state, timeSlot } = getChannelState(channel, nowMinutes, minIntervalMinutes);
    
    if (state === "current" && timeSlot) {
      const minutes = hhmmToMinutes(timeSlot);
      if (!Number.isNaN(minutes)) {
        if (!currentChannel || minutes > currentChannel.minutes) {
          currentChannel = { channelId: channel.id, timeSlot, minutes };
        }
      }
    }
  }

  // Теперь находим следующий канал (исключая текущий)
  for (const channel of channels) {
    // Пропускаем канал с активным слотом
    if (currentChannel && channel.id === currentChannel.channelId) {
      continue;
    }
    
    const { state, timeSlot } = getChannelState(channel, nowMinutes, minIntervalMinutes);
    
    if (state === "next" && timeSlot) {
      const minutes = hhmmToMinutes(timeSlot);
      if (!Number.isNaN(minutes)) {
        // Нормализуем для сравнения (если слот завтра, добавляем 1440)
        const normalizedMinutes = minutes <= nowMinutes ? minutes + 1440 : minutes;
        if (!nextChannel || normalizedMinutes < nextChannel.minutes) {
          nextChannel = { channelId: channel.id, timeSlot, minutes: normalizedMinutes };
        }
      }
    }
  }

  // Теперь определяем предыдущий канал (последний завершившийся)
  // Ищем каналы с последним прошедшим слотом, исключая канал с активным слотом
  const validInterval = Math.max(1, Math.min(60, minIntervalMinutes || 11));
  
  for (const channel of channels) {
    // Пропускаем канал с активным слотом
    if (currentChannel && channel.id === currentChannel.channelId) {
      continue;
    }
    
    if (!channel.autoSendEnabled || !channel.autoSendSchedules) continue;

    const times = channel.autoSendSchedules
      .filter((schedule) => schedule.enabled && schedule.time)
      .map((schedule) => schedule.time)
      .sort();

    for (const time of times) {
      const slotMinutes = hhmmToMinutes(time);
      if (Number.isNaN(slotMinutes)) continue;

      // Проверяем, что слот уже завершился (не активный)
      const endMinutes = slotMinutes + validInterval;
      let isPast = false;
      
      if (endMinutes < 1440) {
        isPast = nowMinutes >= endMinutes;
      } else {
        const endNormalized = endMinutes % 1440;
        isPast = nowMinutes >= endNormalized && nowMinutes < slotMinutes;
      }

      if (isPast) {
        if (!previousChannel || slotMinutes > previousChannel.minutes) {
          previousChannel = { channelId: channel.id, timeSlot: time, minutes: slotMinutes };
        }
      }
    }
  }

  // Если нет прошедших слотов сегодня, берём последний слот вчера (исключая активный канал)
  if (!previousChannel) {
    for (const channel of channels) {
      // Пропускаем канал с активным слотом
      if (currentChannel && channel.id === currentChannel.channelId) continue;
      
      if (!channel.autoSendEnabled || !channel.autoSendSchedules) continue;

      const times = channel.autoSendSchedules
        .filter((schedule) => schedule.enabled && schedule.time)
        .map((schedule) => schedule.time)
        .sort();

      if (times.length > 0) {
        const lastTime = times[times.length - 1];
        const lastMinutes = hhmmToMinutes(lastTime);
        if (!Number.isNaN(lastMinutes)) {
          if (!previousChannel || lastMinutes > previousChannel.minutes) {
            previousChannel = { channelId: channel.id, timeSlot: lastTime, minutes: lastMinutes };
          }
        }
      }
    }
  }

  // Применяем финальные состояния
  for (const channel of channels) {
    if (currentChannel && channel.id === currentChannel.channelId) {
      states.set(channel.id, {
        channelId: channel.id,
        state: "current",
        timeSlot: currentChannel.timeSlot
      });
    } else if (nextChannel && channel.id === nextChannel.channelId) {
      states.set(channel.id, {
        channelId: channel.id,
        state: "next",
        timeSlot: nextChannel.timeSlot
      });
    } else if (previousChannel && channel.id === previousChannel.channelId) {
      states.set(channel.id, {
        channelId: channel.id,
        state: "previous",
        timeSlot: previousChannel.timeSlot
      });
    } else {
      states.set(channel.id, {
        channelId: channel.id,
        state: "default"
      });
    }
  }

  return states;
}

