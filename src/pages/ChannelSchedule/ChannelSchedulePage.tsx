import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchChannelSchedule, type ChannelScheduleItem } from "../../api/channelSchedule";
import ChannelScheduleTable from "../../components/ChannelScheduleTable";
import UserMenu from "../../components/UserMenu";
import { calculateScheduleConflicts, type ConflictKey } from "../../utils/scheduleConflicts";
import {
  fetchScheduleSettings,
  updateScheduleSettings,
  type ScheduleSettings
} from "../../api/scheduleSettings";
import {
  calculateFreeRanges,
  generateSuggestedSlots,
  mapItemsToChannelSchedule,
  type FreeRange,
  type SuggestedSlot
} from "../../utils/scheduleFreeSlots";
import {
  calculateActiveTime,
  collectAllTimesMinutes,
  findNextTimeMinutes,
  findPreviousTimeMinutes
} from "../../utils/activeTimeSlot";
import { minutesToHHMM } from "../../utils/scheduleFreeSlots";

const ChannelSchedulePage = () => {
  const navigate = useNavigate();
  const [scheduleItems, setScheduleItems] = useState<ChannelScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Set<ConflictKey>>(new Set());
  const [settings, setSettings] = useState<ScheduleSettings>({
    minIntervalMinutes: 11,
    conflictsCheckEnabled: true
  });
  const [settingsDraft, setSettingsDraft] = useState<ScheduleSettings>({
    minIntervalMinutes: 11,
    conflictsCheckEnabled: true
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccessMessage, setSettingsSuccessMessage] = useState<string | null>(null);
  const [freeRanges, setFreeRanges] = useState<FreeRange[]>([]);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [showAllRanges, setShowAllRanges] = useState(false);
  const [copiedSlot, setCopiedSlot] = useState<string | null>(null);
  const [activeTime, setActiveTime] = useState<string | null>(null);
  const [activeSlotStartMinutes, setActiveSlotStartMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [animateActiveTime, setAnimateActiveTime] = useState<string | null>(null);
  const [nextTime, setNextTime] = useState<string | null>(null);
  const [nextTimeMinutes, setNextTimeMinutes] = useState<number | null>(null);
  const [previousTime, setPreviousTime] = useState<string | null>(null);
  const [previousTimeMinutes, setPreviousTimeMinutes] = useState<number | null>(null);
  const [previousElapsedSeconds, setPreviousElapsedSeconds] = useState<number>(0);

  // Диагностический лог для отслеживания изменений previousTime
  useEffect(() => {
    console.log("📊 PREVIOUS TIME STATE:", {
      previousTime,
      previousTimeMinutes,
      previousElapsedSeconds
    });
  }, [previousTime, previousTimeMinutes, previousElapsedSeconds]);

  const loadSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChannelSchedule();
      setScheduleItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при загрузке расписания");
      console.error("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedule();
  }, []);

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await fetchScheduleSettings();
      setSettings(data);
      setSettingsDraft(data);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Ошибка при загрузке настроек расписания"
      );
      console.error("Failed to load schedule settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  // Пересчитываем конфликты при любом изменении локального состояния расписания
  useEffect(() => {
    if (!loading && !error) {
      if (!settings.conflictsCheckEnabled) {
        setConflicts(new Set());
        setFreeRanges([]);
        setSuggestedSlots([]);
        return;
      }

      const interval = Math.max(1, Math.min(60, settings.minIntervalMinutes || 11));
      const conflictSet = calculateScheduleConflicts(scheduleItems, interval);
      setConflicts(conflictSet);

      const ranges = calculateFreeRanges(
        mapItemsToChannelSchedule(scheduleItems),
        interval
      );
      setFreeRanges(ranges);

      const slots = generateSuggestedSlots(ranges, interval);
      setSuggestedSlots(slots);
    }
  }, [scheduleItems, loading, error, settings.conflictsCheckEnabled, settings.minIntervalMinutes]);

  // Вычисляем активный временной слот и следующий ближайший слот
  useEffect(() => {
    if (loading || error || scheduleItems.length === 0) {
      setActiveTime(null);
      setActiveSlotStartMinutes(null);
      setAnimateActiveTime(null);
      setNextTime(null);
      setNextTimeMinutes(null);
      setPreviousTime(null);
      setPreviousTimeMinutes(null);
      return;
    }

    // Функция пересчёта активного и следующего слота
    const recalculateTimes = () => {
      const minInterval = Math.max(1, Math.min(60, settings.minIntervalMinutes || 11));
      
      // Получаем текущее время
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      
      // Собираем все времена
      const allTimesMinutes = collectAllTimesMinutes(scheduleItems);
      
      // Диагностический лог
      console.log("🔍 RECALCULATE TIMES:", {
        allTimesMinutes,
        nowMinutes,
        scheduleItemsCount: scheduleItems.length
      });
      
      // 1) Вычисляем активный слот
      const activeResult = calculateActiveTime(scheduleItems, minInterval);
      const newActiveTime = activeResult.activeTime;
      const newActiveMinutes = activeResult.activeMinutes;
      
      // Используем функциональное обновление для сравнения
      setActiveTime((prevActiveTime) => {
        // Проверяем, изменился ли активный слот
        if (newActiveTime !== prevActiveTime) {
          // Запускаем анимацию при смене активного слота
          if (newActiveTime) {
            setAnimateActiveTime(newActiveTime);
            // Выключаем анимацию через 2.5 секунды
            setTimeout(() => {
              setAnimateActiveTime((prev) => (prev === newActiveTime ? null : prev));
            }, 2500);
          } else {
            setAnimateActiveTime(null);
          }
        }
        return newActiveTime;
      });
      
      setActiveSlotStartMinutes(newActiveMinutes);
      
      // 2) Вычисляем следующий ближайший слот (исключая активный)
      const nextMinutes = findNextTimeMinutes(allTimesMinutes, nowMinutes, newActiveMinutes);
      
      if (nextMinutes === null) {
        setNextTime(null);
        setNextTimeMinutes(null);
      } else {
        const normalizedNext = nextMinutes % 1440;
        setNextTime(minutesToHHMM(normalizedNext));
        setNextTimeMinutes(normalizedNext);
      }
      
      // 3) Вычисляем предыдущий ближайший слот
      // previousTime всегда фиксируется и остаётся подсвеченным
      // Он не зависит от activeTime, интервалов и условий
      // Обновляется ТОЛЬКО когда наступает следующий слот
      const prevMinutes = findPreviousTimeMinutes(allTimesMinutes, nowMinutes);
      
      // Диагностические логи
      console.log("🔍 PREVIOUS TIME CALCULATION:");
      console.log("  - allTimesMinutes:", allTimesMinutes);
      console.log("  - nowMinutes:", nowMinutes);
      console.log("  - prevMinutes:", prevMinutes);
      
      if (prevMinutes === null) {
        console.log("  ⚠️ prevMinutes is null - no slots found");
        setPreviousTime(null);
        setPreviousTimeMinutes(null);
      } else {
        const normalizedPrev = prevMinutes % 1440;
        const prevTimeStr = minutesToHHMM(normalizedPrev);
        console.log("  ✅ Setting previousTime:", prevTimeStr, "minutes:", normalizedPrev);
        setPreviousTime(prevTimeStr);
        setPreviousTimeMinutes(normalizedPrev);
      }
    };

    recalculateTimes();

    // Обновляем каждые 30 секунд для более плавного обновления
    const intervalId = setInterval(() => {
      recalculateTimes();
    }, 30_000); // 30 секунд

    return () => clearInterval(intervalId);
  }, [scheduleItems, loading, error, settings.minIntervalMinutes]);

  // Обратный отсчёт в секундах
  useEffect(() => {
    if (activeSlotStartMinutes === null) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nowSeconds = nowMinutes * 60 + now.getSeconds();

      const startSeconds = activeSlotStartMinutes * 60;
      const minIntervalSeconds = settings.minIntervalMinutes * 60;

      // Учёт перехода через полночь
      let diff = nowSeconds - startSeconds;
      if (diff < 0) {
        diff += 24 * 60 * 60;
      }

      const remaining = minIntervalSeconds - diff;
      setRemainingSeconds(remaining > 0 ? remaining : 0);
    };

    // Первый расчёт сразу
    updateCountdown();

    // Обновляем каждую секунду
    const intervalId = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeSlotStartMinutes, settings.minIntervalMinutes]);

  // Расчёт прошедшего времени после предыдущей публикации
  useEffect(() => {
    if (previousTimeMinutes == null) {
      setPreviousElapsedSeconds(0);
      return;
    }

    const update = () => {
      const now = new Date();
      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      let prevSeconds = previousTimeMinutes * 60;

      // Учёт перехода через полночь
      if (nowSeconds < prevSeconds) {
        prevSeconds -= 24 * 3600;
      }

      const elapsed = nowSeconds - prevSeconds;
      setPreviousElapsedSeconds(elapsed >= 0 ? elapsed : 0);
    };

    update(); // Первый расчёт сразу
    const id = setInterval(update, 30_000); // Обновляем каждые 30 секунд

    return () => clearInterval(id);
  }, [previousTimeMinutes]);

  const handleSettingsChange = (partial: Partial<ScheduleSettings>) => {
    setSettingsDraft((prev) => ({
      ...prev,
      ...partial
    }));
    setSettingsSuccessMessage(null);
    setSettingsError(null);
  };

  const handleSaveSettings = async () => {
    const value = settingsDraft.minIntervalMinutes;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 60
    ) {
      setSettingsError("Интервал должен быть целым числом от 1 до 60 минут");
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccessMessage(null);

    try {
      const updated = await updateScheduleSettings({
        minIntervalMinutes: value,
        conflictsCheckEnabled: settingsDraft.conflictsCheckEnabled
      });
      setSettings(updated);
      setSettingsDraft(updated);
      setSettingsSuccessMessage("Настройки сохранены");
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Ошибка при сохранении настроек расписания"
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/channels")}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50"
            >
              <ArrowLeft className="h-4 w-4" />
              К каналам
            </button>
            <h1 className="text-2xl font-bold text-white">Расписание каналов</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadSchedule}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </button>
            <UserMenu />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
              Загрузка расписания...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            <p className="font-medium">Ошибка загрузки</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={loadSchedule}
              className="mt-3 rounded bg-red-500/20 px-4 py-2 text-sm hover:bg-red-500/30"
            >
              Попробовать снова
            </button>
          </div>
        ) : scheduleItems.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center">
            <p className="text-slate-400">Нет каналов с настроенным расписанием</p>
          </div>
        ) : (
          <>
            {/* Панель настроек конфликта расписания */}
            <div className="mb-4 rounded-lg border border-white/10 bg-slate-900/60 p-4">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    Настройки проверки конфликтов расписания
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Эти настройки применяются ко всем каналам вашего аккаунта.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={settingsDraft.conflictsCheckEnabled}
                      onChange={(e) =>
                        handleSettingsChange({
                          conflictsCheckEnabled: e.target.checked
                        })
                      }
                      disabled={settingsLoading || isSavingSettings}
                      className="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                    />
                    <span>Проверять конфликты в расписании</span>
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-200">
                      Минимальный интервал между публикациями (мин):
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={settingsDraft.minIntervalMinutes}
                      onChange={(e) =>
                        handleSettingsChange({
                          minIntervalMinutes: Number(e.target.value) || 0
                        })
                      }
                      disabled={settingsLoading || isSavingSettings}
                      className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={
                      settingsLoading ||
                      isSavingSettings ||
                      settingsDraft.minIntervalMinutes < 1 ||
                      settingsDraft.minIntervalMinutes > 60
                    }
                    className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                  >
                    {isSavingSettings ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Если разница между двумя публикациями меньше указанного количества минут, время
                будет подсвечиваться красным.
              </p>

              {settingsError && (
                <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {settingsError}
                </div>
              )}

              {settingsSuccessMessage && (
                <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {settingsSuccessMessage}
                </div>
              )}
            </div>

            {/* Баннер о конфликтах */}
            {settings.conflictsCheckEnabled && conflicts.size > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                <div className="text-sm">
                  <p className="font-medium">
                    Обнаружены конфликты в расписании.
                  </p>
                  <p className="mt-1 text-amber-100/90">
                    Некоторые публикации стоят ближе, чем через {settings.minIntervalMinutes}{" "}
                    минут. Отредактируйте подсвеченные времена, если хотите избежать пересечений.
                  </p>
                </div>
              </div>
            )}

            {/* Панель свободных временных окон */}
            <div className="mb-4 rounded-lg border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    Свободные окна для новых публикаций
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Показываются интервалы и возможные слоты с интервалом не менее{" "}
                    {settings.minIntervalMinutes} минут от всех публикаций.
                  </p>
                </div>
              </div>

              {!settings.conflictsCheckEnabled ? (
                <div className="mt-3 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                  Проверка конфликтов отключена. Включите её в настройках выше, чтобы увидеть
                  свободные окна и предлагаемые слоты.
                </div>
              ) : freeRanges.length === 0 ? (
                <div className="mt-3 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                  Свободных окон для новых публикаций не найдено с текущим интервалом.
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {/* Диапазоны */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Свободные диапазоны
                    </p>
                    <div className="space-y-1 text-xs text-slate-200">
                      {(showAllRanges ? freeRanges : freeRanges.slice(0, 10)).map(
                        (range, idx) => {
                          const length = range.endMinutes - range.startMinutes + 1;
                          const maxSlots = Math.floor(
                            length / Math.max(1, settings.minIntervalMinutes || 1)
                          );
                          const fromH = Math.floor(range.startMinutes / 60)
                            .toString()
                            .padStart(2, "0");
                          const fromM = (range.startMinutes % 60)
                            .toString()
                            .padStart(2, "0");
                          const toH = Math.floor(range.endMinutes / 60)
                            .toString()
                            .padStart(2, "0");
                          const toM = (range.endMinutes % 60)
                            .toString()
                            .padStart(2, "0");

                          return (
                            <div
                              key={`${range.startMinutes}-${range.endMinutes}-${idx}`}
                              className="flex flex-wrap items-center gap-2 rounded bg-slate-900/80 px-3 py-1.5"
                            >
                              <span className="font-mono text-slate-100">
                                {fromH}:{fromM} – {toH}:{toM}
                              </span>
                              <span className="text-slate-400">
                                • {length} мин • до {maxSlots} публикаций
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                    {freeRanges.length > 10 && (
                      <button
                        type="button"
                        onClick={() => setShowAllRanges((prev) => !prev)}
                        className="mt-2 text-xs font-medium text-slate-300 underline underline-offset-2 hover:text-white"
                      >
                        {showAllRanges ? "Свернуть" : "Показать ещё диапазоны"}
                      </button>
                    )}
                  </div>

                  {/* Предлагаемые слоты */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Предлагаемые свободные слоты
                    </p>
                    {suggestedSlots.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Для текущих диапазонов не удалось сгенерировать слоты.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedSlots.map((slot) => {
                          const labelMinutes = slot.minutes;
                          const hh = Math.floor(labelMinutes / 60)
                            .toString()
                            .padStart(2, "0");
                          const mm = (labelMinutes % 60).toString().padStart(2, "0");
                          const label = `${hh}:${mm}`;
                          return (
                            <button
                              key={slot.minutes}
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(label);
                                  setCopiedSlot(label);
                                  setTimeout(() => setCopiedSlot((prev) =>
                                    prev === label ? null : prev
                                  ), 2000);
                                } catch {
                                  // ignore
                                }
                              }}
                              className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-mono text-slate-100 transition hover:border-brand/60 hover:bg-brand/10 hover:text-white"
                              title="Нажмите, чтобы скопировать время в буфер обмена"
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {copiedSlot && (
                      <p className="mt-2 text-xs text-emerald-300">
                        Время {copiedSlot} скопировано. Вставьте его в нужное поле расписания.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <ChannelScheduleTable
              items={scheduleItems}
              onItemsUpdate={setScheduleItems}
              conflicts={conflicts}
              activeTime={activeTime}
              animateActiveTime={animateActiveTime}
              remainingSeconds={remainingSeconds}
              minIntervalMinutes={settings.minIntervalMinutes}
              nextTime={nextTime}
              previousTime={previousTime}
              previousElapsedSeconds={previousElapsedSeconds}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ChannelSchedulePage;

