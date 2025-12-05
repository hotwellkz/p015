import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save, X, Plus, Trash2 } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type {
  Channel,
  SupportedPlatform,
  SupportedLanguage,
  ChannelAutoSendSchedule
} from "../../domain/channel";

const PLATFORMS: { value: SupportedPlatform; label: string }[] = [
  { value: "YOUTUBE_SHORTS", label: "YouTube Shorts" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM_REELS", label: "Instagram Reels" },
  { value: "VK_CLIPS", label: "VK Клипы" }
];

const LANGUAGES: { value: SupportedLanguage; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "kk", label: "Қазақша" }
];

const DURATIONS = [8, 15, 30, 60];

const TONES = [
  "Юмор",
  "Серьёзно",
  "Дерзко",
  "Детское",
  "Образовательное",
  "Вдохновляющее",
  "Развлекательное",
  "Профессиональное"
];

// Валидация URL
const isValidUrl = (url: string | null | undefined): boolean => {
  if (!url || url.trim() === "") {
    return true; // Пустые значения разрешены
  }
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
};

const ChannelEditPage = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { channels, fetchChannels, updateChannel } = useChannelStore(
    (state) => ({
      channels: state.channels,
      fetchChannels: state.fetchChannels,
      updateChannel: state.updateChannel
    })
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [urlErrors, setUrlErrors] = useState<{
    youtube?: string;
    tiktok?: string;
    instagram?: string;
  }>({});

  useEffect(() => {
    if (!user?.uid || !channelId) {
      navigate("/channels", { replace: true });
      return;
    }

    const loadChannel = async () => {
      setLoading(true);
      try {
        await fetchChannels(user.uid);
        const found = channels.find((c) => c.id === channelId);
        if (found) {
          setChannel(found);
        } else {
          setError("Канал не найден");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Ошибка при загрузке канала"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadChannel();
  }, [user?.uid, channelId, navigate, fetchChannels]);

  useEffect(() => {
    if (channels.length > 0 && channelId) {
      const found = channels.find((c) => c.id === channelId);
      if (found) {
        // Убеждаемся, что generationMode и новые поля установлены (для старых каналов)
        setChannel({
          ...found,
          generationMode: found.generationMode || "script",
          youtubeUrl: found.youtubeUrl || null,
          tiktokUrl: found.tiktokUrl || null,
          instagramUrl: found.instagramUrl || null,
          googleDriveFolderId: found.googleDriveFolderId,
          autoSendEnabled: found.autoSendEnabled || false,
          timezone: found.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          autoSendSchedules: found.autoSendSchedules || [],
          autoDownloadToDriveEnabled: found.autoDownloadToDriveEnabled || false,
          autoDownloadDelayMinutes: found.autoDownloadDelayMinutes ?? 10,
          uploadNotificationEnabled: found.uploadNotificationEnabled || false,
          uploadNotificationChatId: found.uploadNotificationChatId ?? ""
        });
        setLoading(false);
      }
    }
  }, [channels, channelId]);

  const validateUrls = (): boolean => {
    const errors: {
      youtube?: string;
      tiktok?: string;
      instagram?: string;
    } = {};

    if (!isValidUrl(channel?.youtubeUrl)) {
      errors.youtube = "Введите корректный URL (должен начинаться с http:// или https://)";
    }
    if (!isValidUrl(channel?.tiktokUrl)) {
      errors.tiktok = "Введите корректный URL (должен начинаться с http:// или https://)";
    }
    if (!isValidUrl(channel?.instagramUrl)) {
      errors.instagram = "Введите корректный URL (должен начинаться с http:// или https://)";
    }

    setUrlErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.uid || !channel) {
      return;
    }

    if (!channel.name.trim()) {
      setError("Название канала обязательно");
      return;
    }

    if (!validateUrls()) {
      setError("Проверьте корректность введённых URL");
      return;
    }

    // Валидация расписания автоотправки
    if (channel.autoSendEnabled) {
      if (!channel.timezone || channel.timezone.trim() === "") {
        setError("Укажите временную зону для автоотправки");
        return;
      }

      const schedules = channel.autoSendSchedules || [];
      for (const schedule of schedules) {
        if (!schedule.time || !schedule.time.match(/^\d{2}:\d{2}$/)) {
          setError("Укажите корректное время в формате HH:MM для всех расписаний");
          return;
        }

        if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
          setError("Выберите хотя бы один день недели для всех расписаний");
          return;
        }

        if (schedule.promptsPerRun < 1 || schedule.promptsPerRun > 10) {
          setError("Количество промптов за запуск должно быть от 1 до 10");
          return;
        }
      }
    }

    setSaving(true);
    setError(null);

    try {
      await updateChannel(user.uid, channel);
      navigate("/channels", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при обновлении канала"
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
          Загрузка канала...
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-xl space-y-4 rounded-2xl border border-red-500/30 bg-red-900/20 p-8 text-center">
          <h1 className="text-2xl font-semibold text-red-200">
            Канал не найден
          </h1>
          <p className="text-red-300">{error || "Канал не существует"}</p>
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition hover:border-brand/40 hover:text-white"
          >
            <ArrowLeft size={16} className="inline mr-2" />
            Назад
          </button>
          <h1 className="text-2xl font-semibold">Редактирование канала</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl shadow-brand/10">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Название канала *
              </label>
              <input
                type="text"
                value={channel.name}
                onChange={(e) =>
                  setChannel({ ...channel, name: e.target.value })
                }
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Название канала"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Платформа *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.value}
                    type="button"
                    onClick={() =>
                      setChannel({ ...channel, platform: platform.value })
                    }
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      channel.platform === platform.value
                        ? "border-brand bg-brand/10 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                    }`}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Язык *
                </label>
                <div className="grid gap-3">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() =>
                        setChannel({ ...channel, language: lang.value })
                      }
                      className={`rounded-xl border px-4 py-3 text-center transition ${
                        channel.language === lang.value
                          ? "border-brand bg-brand/10 text-white"
                          : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Длительность (сек) *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {DURATIONS.map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() =>
                        setChannel({
                          ...channel,
                          targetDurationSec: duration
                        })
                      }
                      className={`rounded-xl border px-4 py-3 text-center transition ${
                        channel.targetDurationSec === duration
                          ? "border-brand bg-brand/10 text-white"
                          : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                      }`}
                    >
                      {duration} сек
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Ниша / Тематика *
              </label>
              <input
                type="text"
                value={channel.niche}
                onChange={(e) =>
                  setChannel({ ...channel, niche: e.target.value })
                }
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Например: Технологии, Кулинария, Спорт"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Целевая аудитория *
              </label>
              <textarea
                value={channel.audience}
                onChange={(e) =>
                  setChannel({ ...channel, audience: e.target.value })
                }
                required
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Опишите целевую аудиторию"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Тон / Стиль *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {TONES.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setChannel({ ...channel, tone })}
                    className={`rounded-xl border px-4 py-3 text-center transition ${
                      channel.tone === tone
                        ? "border-brand bg-brand/10 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Запрещённые темы
              </label>
              <textarea
                value={channel.blockedTopics}
                onChange={(e) =>
                  setChannel({ ...channel, blockedTopics: e.target.value })
                }
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="Темы, которые не должны появляться в сценариях"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Дополнительные пожелания
              </label>
            <textarea
              value={channel.extraNotes || ""}
              onChange={(e) => {
                const textarea = e.target;
                textarea.style.height = "auto";
                textarea.style.height = `${textarea.scrollHeight}px`;

                setChannel({ ...channel, extraNotes: textarea.value });
              }}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 min-h-[140px] h-auto resize-y overflow-auto"
              placeholder="Любые дополнительные требования к сценариям... Например: «бабушка и дедушка — казахи», особенности персонажей, сеттинг, стиль съёмки."
            />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Режим генерации *
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() =>
                    setChannel({
                      ...channel,
                      generationMode: "script"
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    (channel.generationMode || "script") === "script"
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  <div className="font-semibold">Сценарий</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Только подробный сценарий
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChannel({
                      ...channel,
                      generationMode: "prompt"
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    channel.generationMode === "prompt"
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  <div className="font-semibold">Сценарий + промпт для видео</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Сценарий + VIDEO_PROMPT для Sora/Veo
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChannel({
                      ...channel,
                      generationMode: "video-prompt-only"
                    })
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    channel.generationMode === "video-prompt-only"
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  <div className="font-semibold">Промпт для видео</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Только VIDEO_PROMPT для Sora/Veo без текста сценария
                  </div>
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Ссылки на соцсети
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Укажите ссылки на ваши аккаунты в социальных сетях (опционально)
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    YouTube канал (опционально)
                  </label>
                  <input
                    type="url"
                    value={channel.youtubeUrl || ""}
                    onChange={(e) => {
                      const value = e.target.value.trim() || null;
                      setChannel({ ...channel, youtubeUrl: value });
                      // Очищаем ошибку при изменении
                      if (urlErrors.youtube) {
                        setUrlErrors({ ...urlErrors, youtube: undefined });
                      }
                    }}
                    onBlur={() => {
                      if (channel.youtubeUrl && !isValidUrl(channel.youtubeUrl)) {
                        setUrlErrors({
                          ...urlErrors,
                          youtube:
                            "Введите корректный URL (должен начинаться с http:// или https://)"
                        });
                      }
                    }}
                    placeholder="https://www.youtube.com/@example"
                    className={`w-full rounded-xl border px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-brand/40 ${
                      urlErrors.youtube
                        ? "border-red-500/50 bg-red-950/20 focus:border-red-500"
                        : "border-white/10 bg-slate-950/60 focus:border-brand"
                    }`}
                  />
                  {urlErrors.youtube && (
                    <p className="text-xs text-red-400">{urlErrors.youtube}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    TikTok канал (опционально)
                  </label>
                  <input
                    type="url"
                    value={channel.tiktokUrl || ""}
                    onChange={(e) => {
                      const value = e.target.value.trim() || null;
                      setChannel({ ...channel, tiktokUrl: value });
                      // Очищаем ошибку при изменении
                      if (urlErrors.tiktok) {
                        setUrlErrors({ ...urlErrors, tiktok: undefined });
                      }
                    }}
                    onBlur={() => {
                      if (channel.tiktokUrl && !isValidUrl(channel.tiktokUrl)) {
                        setUrlErrors({
                          ...urlErrors,
                          tiktok:
                            "Введите корректный URL (должен начинаться с http:// или https://)"
                        });
                      }
                    }}
                    placeholder="https://www.tiktok.com/@example"
                    className={`w-full rounded-xl border px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-brand/40 ${
                      urlErrors.tiktok
                        ? "border-red-500/50 bg-red-950/20 focus:border-red-500"
                        : "border-white/10 bg-slate-950/60 focus:border-brand"
                    }`}
                  />
                  {urlErrors.tiktok && (
                    <p className="text-xs text-red-400">{urlErrors.tiktok}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    Instagram (опционально)
                  </label>
                  <input
                    type="url"
                    value={channel.instagramUrl || ""}
                    onChange={(e) => {
                      const value = e.target.value.trim() || null;
                      setChannel({ ...channel, instagramUrl: value });
                      // Очищаем ошибку при изменении
                      if (urlErrors.instagram) {
                        setUrlErrors({ ...urlErrors, instagram: undefined });
                      }
                    }}
                    onBlur={() => {
                      if (
                        channel.instagramUrl &&
                        !isValidUrl(channel.instagramUrl)
                      ) {
                        setUrlErrors({
                          ...urlErrors,
                          instagram:
                            "Введите корректный URL (должен начинаться с http:// или https://)"
                        });
                      }
                    }}
                    placeholder="https://www.instagram.com/example"
                    className={`w-full rounded-xl border px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-brand/40 ${
                      urlErrors.instagram
                        ? "border-red-500/50 bg-red-950/20 focus:border-red-500"
                        : "border-white/10 bg-slate-950/60 focus:border-brand"
                    }`}
                  />
                  {urlErrors.instagram && (
                    <p className="text-xs text-red-400">{urlErrors.instagram}</p>
                  )}
                </div>
              </div>

              {/* Google Drive настройки */}
              <div className="mt-6 space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Google Drive Folder ID (опционально)
                </label>
                <input
                  type="text"
                  value={channel.googleDriveFolderId || ""}
                  onChange={(e) =>
                    setChannel({
                      ...channel,
                      googleDriveFolderId: e.target.value.trim() || undefined
                    })
                  }
                  placeholder="Например: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
                <p className="text-xs text-slate-400">
                  Укажите ID папки на Google Drive, в которую будут сохраняться
                  видео из SyntX для этого канала.
                </p>
              </div>
            </div>

            {/* Блок автоотправки в Syntx */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Автоотправка в Syntx
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Настройте автоматическую генерацию и отправку промптов в Syntx-бот по расписанию.
              </p>

              {/* Переключатель включения автоотправки */}
              <div className="mb-6 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoSendEnabled"
                  checked={channel.autoSendEnabled || false}
                  onChange={(e) =>
                    setChannel({
                      ...channel,
                      autoSendEnabled: e.target.checked
                    })
                  }
                  className="h-5 w-5 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                />
                <label
                  htmlFor="autoSendEnabled"
                  className="text-sm font-medium text-slate-200"
                >
                  Включить автоотправку в Syntx
                </label>
              </div>

              {channel.autoSendEnabled && (
                <>
                  {/* Выбор таймзоны */}
                  <div className="mb-6 space-y-2">
                    <label className="block text-sm font-medium text-slate-200">
                      Временная зона
                    </label>
                    <select
                      value={channel.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                      onChange={(e) =>
                        setChannel({
                          ...channel,
                          timezone: e.target.value
                        })
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
                    >
                      <option value="Asia/Almaty">Asia/Almaty (Алматы)</option>
                      <option value="Europe/Moscow">Europe/Moscow (Москва)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (Нью-Йорк)</option>
                      <option value="Europe/London">Europe/London (Лондон)</option>
                    </select>
                    <p className="text-xs text-slate-400">
                      Выберите временную зону для расписания. По умолчанию используется зона вашего браузера.
                    </p>
                  </div>

                  {/* Список расписаний */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-200">
                        Расписание отправки
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newSchedule: ChannelAutoSendSchedule = {
                            id: crypto.randomUUID(),
                            enabled: true,
                            daysOfWeek: [1, 2, 3, 4, 5], // Пн-Пт по умолчанию
                            time: "12:00",
                            promptsPerRun: 1
                          };
                          setChannel({
                            ...channel,
                            autoSendSchedules: [
                              ...(channel.autoSendSchedules || []),
                              newSchedule
                            ]
                          });
                        }}
                        className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20"
                      >
                        <Plus size={16} />
                        Добавить расписание
                      </button>
                    </div>

                    {(channel.autoSendSchedules || []).length === 0 ? (
                      <p className="text-sm text-slate-400">
                        Нет настроенных расписаний. Нажмите "Добавить расписание", чтобы создать новое.
                      </p>
                    ) : (
                      channel.autoSendSchedules?.map((schedule, index) => (
                        <div
                          key={schedule.id}
                          className="rounded-xl border border-white/10 bg-slate-900/40 p-4"
                        >
                          <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={schedule.enabled}
                                onChange={(e) => {
                                  const updated = [...(channel.autoSendSchedules || [])];
                                  updated[index] = {
                                    ...schedule,
                                    enabled: e.target.checked
                                  };
                                  setChannel({
                                    ...channel,
                                    autoSendSchedules: updated
                                  });
                                }}
                                className="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                              />
                              <span className="text-sm font-medium text-slate-200">
                                Расписание {index + 1}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = channel.autoSendSchedules?.filter(
                                  (s) => s.id !== schedule.id
                                ) || [];
                                setChannel({
                                  ...channel,
                                  autoSendSchedules: updated
                                });
                              }}
                              className="rounded-lg p-1 text-red-400 transition hover:bg-red-500/20"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Дни недели */}
                          <div className="mb-4">
                            <label className="mb-2 block text-xs font-medium text-slate-300">
                              Дни недели
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { value: 0, label: "Вс" },
                                { value: 1, label: "Пн" },
                                { value: 2, label: "Вт" },
                                { value: 3, label: "Ср" },
                                { value: 4, label: "Чт" },
                                { value: 5, label: "Пт" },
                                { value: 6, label: "Сб" }
                              ].map((day) => (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(channel.autoSendSchedules || [])];
                                    const currentDays = updated[index].daysOfWeek || [];
                                    if (currentDays.includes(day.value)) {
                                      updated[index] = {
                                        ...schedule,
                                        daysOfWeek: currentDays.filter(
                                          (d) => d !== day.value
                                        )
                                      };
                                    } else {
                                      updated[index] = {
                                        ...schedule,
                                        daysOfWeek: [...currentDays, day.value]
                                      };
                                    }
                                    setChannel({
                                      ...channel,
                                      autoSendSchedules: updated
                                    });
                                  }}
                                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                                    schedule.daysOfWeek?.includes(day.value)
                                      ? "bg-brand text-white"
                                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                  }`}
                                >
                                  {day.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Время и количество промптов */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-xs font-medium text-slate-300">
                                Время (HH:MM)
                              </label>
                              <input
                                type="time"
                                value={schedule.time}
                                onChange={(e) => {
                                  const updated = [...(channel.autoSendSchedules || [])];
                                  updated[index] = {
                                    ...schedule,
                                    time: e.target.value
                                  };
                                  setChannel({
                                    ...channel,
                                    autoSendSchedules: updated
                                  });
                                }}
                                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-medium text-slate-300">
                                Количество промптов за запуск
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={schedule.promptsPerRun}
                                onChange={(e) => {
                                  const value = Math.max(
                                    1,
                                    Math.min(10, parseInt(e.target.value) || 1)
                                  );
                                  const updated = [...(channel.autoSendSchedules || [])];
                                  updated[index] = {
                                    ...schedule,
                                    promptsPerRun: value
                                  };
                                  setChannel({
                                    ...channel,
                                    autoSendSchedules: updated
                                  });
                                }}
                                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Блок автоматического скачивания в Google Drive */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Автоматическое скачивание в Google Drive
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Настройте автоматическое скачивание видео из Telegram и загрузку в Google Drive после автогенерации промпта.
              </p>

              {/* Переключатель включения автоскачивания */}
              <div className="mb-6 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoDownloadToDriveEnabled"
                  checked={channel.autoDownloadToDriveEnabled || false}
                  onChange={(e) =>
                    setChannel({
                      ...channel,
                      autoDownloadToDriveEnabled: e.target.checked
                    })
                  }
                  className="h-5 w-5 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                />
                <label
                  htmlFor="autoDownloadToDriveEnabled"
                  className="text-sm font-medium text-slate-200"
                >
                  Автоматически скачивать видео из Telegram и загружать в Google Drive после автогенерации
                </label>
              </div>

              {channel.autoDownloadToDriveEnabled && (
                <div className="space-y-4">
                  {/* Поле задержки */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Задержка перед скачиванием (минуты)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={channel.autoDownloadDelayMinutes ?? 10}
                      onChange={(e) => {
                        const value = Math.max(
                          1,
                          Math.min(60, parseInt(e.target.value) || 10)
                        );
                        setChannel({
                          ...channel,
                          autoDownloadDelayMinutes: value
                        });
                      }}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Время ожидания перед автоматическим скачиванием видео из Telegram. 
                      По умолчанию: 10 минут. Минимум: 1 минута, максимум: 60 минут.
                    </p>
                  </div>

                  {/* Предупреждение о необходимости настройки Google Drive папки */}
                  {!channel.googleDriveFolderId && (
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                      <p className="text-sm text-yellow-200">
                        ⚠️ Для работы автоматического скачивания необходимо указать ID папки Google Drive выше.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Блок уведомлений */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Уведомления</h3>
              <p className="mb-4 text-sm text-slate-400">
                Настройте уведомления в Telegram после успешной загрузки видео на Google Drive.
              </p>

              {/* Чекбокс включения уведомлений */}
              <div className="mb-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="uploadNotificationEnabled"
                  checked={channel.uploadNotificationEnabled || false}
                  onChange={(e) =>
                    setChannel({
                      ...channel,
                      uploadNotificationEnabled: e.target.checked
                    })
                  }
                  className="h-5 w-5 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                />
                <label
                  htmlFor="uploadNotificationEnabled"
                  className="text-sm font-medium text-slate-200"
                >
                  Отправлять отчёт в Telegram после загрузки видео на Google Drive
                </label>
              </div>

              {/* Поле chatId */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Telegram chat ID для уведомлений (необязательно)
                </label>
                <input
                  type="text"
                  value={channel.uploadNotificationChatId || ""}
                  onChange={(e) =>
                    setChannel({
                      ...channel,
                      uploadNotificationChatId: e.target.value || ""
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
                  placeholder="Оставьте пустым, чтобы использовать основной чат SyntX"
                />
                <p className="text-xs text-slate-400">
                  Если поле пустое — будет использован тот же чат, что и для отправки промптов в SyntX.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate("/channels")}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-brand/40 hover:text-white"
              >
                <X size={16} />
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-brand-dark"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Сохранить изменения
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChannelEditPage;
