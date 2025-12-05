import { useState, FormEvent, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type {
  ChannelCreatePayload,
  SupportedPlatform,
  SupportedLanguage,
  GenerationMode
} from "../../domain/channel";
import { createEmptyChannel } from "../../domain/channel";

const STEPS = [
  { id: 1, title: "Название канала" },
  { id: 2, title: "Соцсеть" },
  { id: 3, title: "Язык" },
  { id: 4, title: "Длительность" },
  { id: 5, title: "Ниша" },
  { id: 6, title: "Целевая аудитория" },
  { id: 7, title: "Тон" },
  { id: 8, title: "Запрещённые темы" },
  { id: 9, title: "Режим генерации" },
  { id: 10, title: "Доп. пожелания" }
];

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

const ChannelWizardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { createChannel } = useChannelStore((state) => ({
    createChannel: state.createChannel
  }));

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<ChannelCreatePayload>(() => {
    const empty = createEmptyChannel();
    return {
      name: empty.name,
      platform: empty.platform,
      language: empty.language,
      targetDurationSec: empty.targetDurationSec,
      niche: empty.niche,
      audience: empty.audience,
      tone: empty.tone,
      blockedTopics: empty.blockedTopics,
      extraNotes: empty.extraNotes,
      generationMode: empty.generationMode || "script",
      youtubeUrl: empty.youtubeUrl || null,
      tiktokUrl: empty.tiktokUrl || null,
      instagramUrl: empty.instagramUrl || null
    };
  });

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return true; // platform всегда выбран
      case 3:
        return true; // language всегда выбран
      case 4:
        return true; // duration всегда выбран
      case 5:
        return formData.niche.trim().length > 0;
      case 6:
        return formData.audience.trim().length > 0;
      case 7:
        return formData.tone.trim().length > 0;
      case 8:
        return true; // blockedTopics опционально
      case 9:
        return true; // generationMode всегда выбран
      case 10:
        return true; // extraNotes опционально
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canGoNext() && currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  // Автоскролл к началу контента при смене шага
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentStep]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) {
      setError("Пользователь не авторизован");
      return;
    }

    if (!canGoNext()) {
      setError("Заполните все обязательные поля");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createChannel(user.uid, formData);
      navigate("/channels", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при создании канала"
      );
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Название канала *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Например: Мой канал про технологии"
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 md:rounded-xl md:px-4 md:py-3"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Это название будет отображаться в списке ваших каналов
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Выберите платформу *
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, platform: platform.value })
                  }
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.platform === platform.value
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Язык сценариев *
            </label>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, language: lang.value })
                  }
                  className={`min-h-[44px] rounded-lg border px-2 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.language === lang.value
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Длительность ролика (секунды) *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
              {DURATIONS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, targetDurationSec: duration })
                  }
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.targetDurationSec === duration
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {duration} сек
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Ниша / Тематика *
            </label>
            <input
              type="text"
              value={formData.niche}
              onChange={(e) =>
                setFormData({ ...formData, niche: e.target.value })
              }
              placeholder="Например: Технологии, Кулинария, Спорт, Образование"
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 md:rounded-xl md:px-4 md:py-3"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Основная тематика вашего контента
            </p>
          </div>
        );

      case 6:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Целевая аудитория *
            </label>
            <textarea
              value={formData.audience}
              onChange={(e) =>
                setFormData({ ...formData, audience: e.target.value })
              }
              placeholder="Например: Молодёжь 18-25 лет, интересующаяся технологиями"
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 md:rounded-xl md:px-4 md:py-3"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Опишите вашу целевую аудиторию
            </p>
          </div>
        );

      case 7:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Тон / Стиль контента *
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
              {TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setFormData({ ...formData, tone })}
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.tone === tone
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 md:text-sm">
              Выберите основной тон для ваших сценариев
            </p>
          </div>
        );

      case 8:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Запрещённые темы (опционально)
            </label>
            <textarea
              value={formData.blockedTopics}
              onChange={(e) =>
                setFormData({ ...formData, blockedTopics: e.target.value })
              }
              placeholder="Например: Политика, Насилие, Нецензурная лексика"
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 md:rounded-xl md:px-4 md:py-3"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Укажите темы, которые не должны появляться в сценариях
            </p>
          </div>
        );

      case 9:
        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Режим генерации *
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 md:gap-3">
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "script"
                  })
                }
                className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left transition md:rounded-xl md:px-4 md:py-4 ${
                  (formData.generationMode || "script") === "script"
                    ? "border-brand bg-brand/10 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-semibold md:text-base">Сценарий</div>
                <div className="mt-0.5 text-[10px] text-slate-400 md:mt-1 md:text-xs">
                  Только подробный сценарий
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "prompt"
                  })
                }
                className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left transition md:rounded-xl md:px-4 md:py-4 ${
                  formData.generationMode === "prompt"
                    ? "border-brand bg-brand/10 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-semibold md:text-base">Сценарий + промпт для видео</div>
                <div className="mt-0.5 text-[10px] text-slate-400 md:mt-1 md:text-xs">
                  Сценарий + VIDEO_PROMPT для Sora/Veo
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "video-prompt-only"
                  })
                }
                className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left transition md:rounded-xl md:px-4 md:py-4 ${
                  formData.generationMode === "video-prompt-only"
                    ? "border-brand bg-brand/10 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-semibold md:text-base">Промпт для видео</div>
                <div className="mt-0.5 text-[10px] text-slate-400 md:mt-1 md:text-xs">
                  Только VIDEO_PROMPT для Sora/Veo без текста сценария
                </div>
              </button>
            </div>
            <p className="text-xs text-slate-400 md:text-sm">
              Выберите, что будет генерироваться при создании сценариев
            </p>
          </div>
        );

      case 10: {
        const handleExtraNotesChange = (
          e: React.ChangeEvent<HTMLTextAreaElement>
        ) => {
          const textarea = e.target;
          // Авто-растяжение textarea под контент
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;

          setFormData({ ...formData, extraNotes: textarea.value });
        };

        return (
          <div className="space-y-2 md:space-y-4">
            <label className="block text-xs font-medium text-slate-200 md:text-sm">
              Дополнительные пожелания (опционально)
            </label>
            <textarea
              value={formData.extraNotes || ""}
              onChange={handleExtraNotesChange}
              placeholder="Любые дополнительные требования к сценариям... Например: «бабушка и дедушка — казахи», особенности персонажей, сеттинг, стиль съёмки."
              rows={5}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 min-h-[120px] h-auto resize-y overflow-auto md:rounded-xl md:px-4 md:py-3 md:min-h-[140px]"
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Этот блок используется как обязательные условия при генерации сценария и VIDEO_PROMPT, поэтому подробно опишите важные детали (национальность, характеры, стиль и т.п.).
            </p>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-4 md:py-10">
        {/* Шапка - компактная на мобильных */}
        <div className="mb-4 flex items-center gap-2 md:mb-8 md:gap-4">
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-slate-300 transition hover:border-brand/40 hover:text-white md:px-4 md:py-2"
            title="Назад"
          >
            <ArrowLeft size={18} className="md:mr-2" />
            <span className="hidden md:inline">Назад</span>
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Sparkles size={18} className="text-brand-light flex-shrink-0 md:w-5 md:h-5" />
            <h1 className="text-lg font-semibold truncate md:text-2xl">Мастер создания канала</h1>
          </div>
        </div>

        {/* Индикатор шагов - упрощенный на мобильных */}
        <div className="mb-4 md:mb-8">
          {/* Десктопная версия - полный индикатор */}
          <div className="hidden md:block">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                        currentStep > step.id
                          ? "border-brand bg-brand text-white"
                          : currentStep === step.id
                          ? "border-brand bg-brand/20 text-brand-light"
                          : "border-white/20 bg-slate-900/60 text-slate-400"
                      }`}
                    >
                      {currentStep > step.id ? (
                        <Check size={18} />
                      ) : (
                        <span className="text-sm font-semibold">{step.id}</span>
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs text-center ${
                        currentStep === step.id
                          ? "text-brand-light font-medium"
                          : "text-slate-500"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 transition ${
                        currentStep > step.id ? "bg-brand" : "bg-white/10"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Мобильная версия - горизонтальный скролл по шагам */}
          <div className="md:hidden">
            <div className="overflow-x-auto -mx-3 px-3 pb-2">
              <div className="flex items-center gap-2 min-w-max">
                {STEPS.map((step, index) => (
                  <div key={step.id} className="flex items-center flex-shrink-0">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                          currentStep > step.id
                            ? "border-brand bg-brand text-white"
                            : currentStep === step.id
                            ? "border-brand bg-brand/20 text-brand-light"
                            : "border-white/20 bg-slate-900/60 text-slate-400"
                        }`}
                      >
                        {currentStep > step.id ? (
                          <Check size={14} />
                        ) : (
                          <span className="text-xs font-semibold">{step.id}</span>
                        )}
                      </div>
                    </div>
                    {index < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-3 mx-1 transition ${
                          currentStep > step.id ? "bg-brand" : "bg-white/10"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-2xl shadow-brand/10 md:rounded-2xl md:p-8">
            <div className="mb-3 md:mb-6" ref={contentRef}>
              <h2 className="text-base font-semibold text-white md:text-xl">
                Шаг {currentStep} из {STEPS.length}: {STEPS[currentStep - 1].title}
              </h2>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 md:mb-6 md:px-4 md:py-3 md:text-sm">
                {error}
              </div>
            )}

            <div className="min-h-[200px] md:min-h-[300px] pb-20 md:pb-0">{renderStepContent()}</div>

            {/* Кнопки навигации - закреплены внизу на мобильных */}
            <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 border-t border-white/10 bg-slate-950/95 p-3 backdrop-blur-sm md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto md:mt-8 md:border-t-0 md:bg-transparent md:backdrop-blur-none md:p-0">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-50 hover:border-brand/40 hover:text-white md:flex-initial md:px-5 md:py-3"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Назад</span>
              </button>

              {currentStep < STEPS.length ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-brand-dark md:flex-initial md:px-5 md:py-3"
                >
                  <span>Далее</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !canGoNext()}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-brand-dark md:flex-initial md:px-5 md:py-3"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span className="hidden sm:inline">Создание...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span className="hidden sm:inline">Создать канал</span>
                      <span className="sm:hidden">Создать</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChannelWizardPage;
