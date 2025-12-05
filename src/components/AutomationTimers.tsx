import { useEffect, useState } from "react";
import type { ChannelStateInfo } from "../utils/channelAutomationState";

interface AutomationTimersProps {
  stateInfo: ChannelStateInfo;
  minIntervalMinutes: number;
  isMobile?: boolean;
}

/**
 * Форматирует секунды в формат ЧЧ:ММ:СС
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Форматирует дату в формат времени (HH:MM) или с датой если другой день
 */
function formatTime(date: Date | undefined, timeStr?: string): string {
  if (!date && !timeStr) return "";
  
  // Если есть date, используем его (более точный)
  if (date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleString("ru-RU", { 
        day: "2-digit", 
        month: "2-digit", 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    }
  }
  
  // Fallback на timeStr
  if (timeStr) {
    return timeStr;
  }
  
  return "";
}

/**
 * Вычисляет оставшееся время до даты
 */
function calculateTimeUntil(targetDate: Date | undefined): number {
  if (!targetDate) return 0;
  const now = new Date();
  const diff = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
  return Math.max(0, diff);
}

export default function AutomationTimers({ stateInfo, minIntervalMinutes, isMobile = false }: AutomationTimersProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [nextCountdown, setNextCountdown] = useState(0);

  // Обратный отсчёт для текущего канала
  useEffect(() => {
    if (stateInfo.state !== "current" || !stateInfo.currentEndTime) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = calculateTimeUntil(stateInfo.currentEndTime);
      setRemainingSeconds(remaining);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [stateInfo.state, stateInfo.currentEndTime]);

  // Обратный отсчёт для следующего канала
  useEffect(() => {
    if (stateInfo.state !== "next" || !stateInfo.nextStartTime) {
      setNextCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = calculateTimeUntil(stateInfo.nextStartTime);
      setNextCountdown(remaining);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [stateInfo.state, stateInfo.nextStartTime]);

  // Для текущего канала
  if (stateInfo.state === "current") {
    const showCountdown = remainingSeconds > 0;
    const nextTime = formatTime(stateInfo.nextSlotDate, stateInfo.nextSlotTime);
    const previousTime = formatTime(stateInfo.previousSlotDate, stateInfo.previousSlotTime);

    if (isMobile) {
      // Мобильная версия - одна колонка
      return (
        <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          {showCountdown && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">До завершения запуска:</span>
              <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                {formatTimeRemaining(remainingSeconds)}
              </span>
            </div>
          )}
          {nextTime && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Следующая автоматизация:</span>
              <span className="font-mono text-emerald-200 tabular-nums">{nextTime}</span>
            </div>
          )}
          {previousTime && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Последняя автоматизация:</span>
              <span className="font-mono text-emerald-200 tabular-nums">{previousTime}</span>
            </div>
          )}
        </div>
      );
    }

    // Десктопная версия - можно в одну строку или колонку
    return (
      <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        {showCountdown && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">До завершения запуска:</span>
            <span className="font-mono font-semibold text-emerald-300 tabular-nums">
              {formatTimeRemaining(remainingSeconds)}
            </span>
          </div>
        )}
        {nextTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Следующая автоматизация:</span>
            <span className="font-mono text-emerald-200 tabular-nums">{nextTime}</span>
          </div>
        )}
        {previousTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Последняя автоматизация:</span>
            <span className="font-mono text-emerald-200 tabular-nums">{previousTime}</span>
          </div>
        )}
      </div>
    );
  }

  // Для следующего канала (опционально)
  if (stateInfo.state === "next" && stateInfo.nextStartTime) {
    const showCountdown = nextCountdown > 0;
    
    if (!showCountdown) return null;

    if (isMobile) {
      return (
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Запуск через:</span>
            <span className="font-mono font-semibold text-amber-300 tabular-nums">
              {formatTimeRemaining(nextCountdown)}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Запуск через:</span>
          <span className="font-mono font-semibold text-amber-300 tabular-nums">
            {formatTimeRemaining(nextCountdown)}
          </span>
        </div>
      </div>
    );
  }

  // Для предыдущего канала (опционально)
  if (stateInfo.state === "previous" && stateInfo.previousEndTime) {
    const previousTime = formatTime(stateInfo.previousEndTime);
    
    if (!previousTime) return null;

    if (isMobile) {
      return (
        <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Автоматизация была в:</span>
            <span className="font-mono text-blue-200 tabular-nums">{previousTime}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Автоматизация была в:</span>
          <span className="font-mono text-blue-200 tabular-nums">{previousTime}</span>
        </div>
      </div>
    );
  }

  return null;
}

