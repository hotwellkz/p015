import type { ChannelScheduleItem } from "../api/channelSchedule";

export type ConflictKey = string; // `${channelId}-${time}`

interface TimePoint {
  channelId: string;
  channelName: string;
  time: string; // "HH:MM"
  minutes: number; // HH * 60 + MM
}

/**
 * Рассчитывает набор конфликтующих времён между всеми каналами.
 * Конфликт — когда расстояние между двумя публикациями меньше minIntervalMinutes,
 * учитывая переход через полночь.
 */
export function calculateScheduleConflicts(
  channels: ChannelScheduleItem[],
  minIntervalMinutes: number
): Set<ConflictKey> {
  const conflictSet = new Set<ConflictKey>();

  if (!channels || channels.length === 0) {
    return conflictSet;
  }

  const points: TimePoint[] = [];

  for (const channel of channels) {
    for (const time of channel.times) {
      if (!time || !/^\d{2}:\d{2}$/.test(time)) continue;
      const [hh, mm] = time.split(":").map(Number);
      if (
        Number.isNaN(hh) ||
        Number.isNaN(mm) ||
        hh < 0 ||
        hh > 23 ||
        mm < 0 ||
        mm > 59
      ) {
        continue;
      }

      const minutes = hh * 60 + mm;
      points.push({
        channelId: channel.id,
        channelName: channel.name,
        time,
        minutes
      });
    }
  }

  if (points.length < 2) {
    return conflictSet;
  }

  // Сортируем по времени
  points.sort((a, b) => a.minutes - b.minutes);

  const markConflict = (a: TimePoint, b: TimePoint) => {
    conflictSet.add(`${a.channelId}-${a.time}`);
    conflictSet.add(`${b.channelId}-${b.time}`);
  };

  // Сравниваем соседей
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const diff = next.minutes - current.minutes;
    if (diff < minIntervalMinutes) {
      markConflict(current, next);
    }
  }

  // Учитываем переход через полночь: последний и первый
  const first = points[0];
  const last = points[points.length - 1];
  const wrapDiff = first.minutes + 1440 - last.minutes;
  if (wrapDiff < minIntervalMinutes) {
    markConflict(last, first);
  }

  return conflictSet;
}


