import type { ChannelScheduleItem } from "../api/channelSchedule";

export type ChannelSchedule = {
  id: string;
  name: string;
  times: string[]; // "HH:MM"
};

export type FreeRange = {
  startMinutes: number; // 0..1439
  endMinutes: number; // 0..1439, включительно
};

export type SuggestedSlot = {
  minutes: number;
};

export function hhmmToMinutes(time: string): number {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [hh, mm] = time.split(":").map(Number);
  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return NaN;
  }
  return hh * 60 + mm;
}

export function minutesToHHMM(m: number): string {
  const minutes = ((m % 1440) + 1440) % 1440;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const hhStr = hh.toString().padStart(2, "0");
  const mmStr = mm.toString().padStart(2, "0");
  return `${hhStr}:${mmStr}`;
}

/**
 * Рассчитывает свободные интервалы времени суток, в которые можно ставить новые публикации,
 * чтобы расстояние до ЛЮБОЙ существующей публикации было >= minIntervalMinutes.
 */
export function calculateFreeRanges(
  channels: ChannelSchedule[],
  minIntervalMinutes: number
): FreeRange[] {
  const clampedInterval = Math.max(1, Math.min(60, minIntervalMinutes || 1));

  if (!channels || channels.length === 0) {
    // Если нет ни одной публикации, всё сутки свободны
    return [
      {
        startMinutes: 0,
        endMinutes: 1439
      }
    ];
  }

  const usedMinutes: number[] = [];

  for (const channel of channels) {
    for (const t of channel.times) {
      const m = hhmmToMinutes(t);
      if (!Number.isNaN(m)) {
        usedMinutes.push(m);
      }
    }
  }

  if (usedMinutes.length === 0) {
    return [
      {
        startMinutes: 0,
        endMinutes: 1439
      }
    ];
  }

  usedMinutes.sort((a, b) => a - b);

  // Массив занятых минут
  const isBlocked = new Array<boolean>(1440).fill(false);
  const radius = clampedInterval - 1;

  for (const t of usedMinutes) {
    const start = Math.max(0, t - radius);
    const end = Math.min(1439, t + radius);
    for (let m = start; m <= end; m++) {
      isBlocked[m] = true;
    }
  }

  const ranges: FreeRange[] = [];

  let currentStart: number | null = null;

  for (let m = 0; m < 1440; m++) {
    if (!isBlocked[m]) {
      if (currentStart === null) {
        currentStart = m;
      }
    } else if (currentStart !== null) {
      const end = m - 1;
      const length = end - currentStart + 1;
      if (length >= clampedInterval) {
        ranges.push({ startMinutes: currentStart, endMinutes: end });
      }
      currentStart = null;
    }
  }

  // Хвостовой диапазон до конца суток
  if (currentStart !== null) {
    const end = 1439;
    const length = end - currentStart + 1;
    if (length >= clampedInterval) {
      ranges.push({ startMinutes: currentStart, endMinutes: end });
    }
  }

  // Сортировка по началу (на всякий случай)
  ranges.sort((a, b) => a.startMinutes - b.startMinutes);

  return ranges;
}

/**
 * Генерирует список предложенных слотов в рамках свободных диапазонов.
 * Каждый слот отстоит от соседнего не менее чем на minIntervalMinutes.
 */
export function generateSuggestedSlots(
  ranges: FreeRange[],
  minIntervalMinutes: number,
  maxSlots: number = 200
): SuggestedSlot[] {
  const clampedInterval = Math.max(1, Math.min(60, minIntervalMinutes || 1));
  const slots: SuggestedSlot[] = [];

  for (const range of ranges) {
    let current = range.startMinutes;
    while (current <= range.endMinutes) {
      slots.push({ minutes: current });
      if (slots.length >= maxSlots) {
        return slots.sort((a, b) => a.minutes - b.minutes);
      }
      current += clampedInterval;
    }
  }

  return slots.sort((a, b) => a.minutes - b.minutes);
}

// Утилита для адаптации из ChannelScheduleItem в ChannelSchedule
export function mapItemsToChannelSchedule(
  items: ChannelScheduleItem[]
): ChannelSchedule[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    times: item.times
  }));
}



