import { useState, useEffect } from "react";
import { Calendar, Clock, Languages, Users, Sparkles, GripVertical, FileText, ChevronDown, MoreVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel } from "../domain/channel";
import { timestampToIso } from "../utils/firestore";
import AutomationTimers from "./AutomationTimers";
import type { ChannelStateInfo } from "../utils/channelAutomationState";

export type ChannelAutomationState = "current" | "next" | "previous" | "default";

interface ChannelCardProps {
  channel: Channel;
  index?: number; // порядковый номер (0-based)
  compact?: boolean;
  automationState?: ChannelAutomationState; // Состояние автоматизации для подсветки
  automationStateInfo?: ChannelStateInfo; // Полная информация о состоянии автоматизации
  minIntervalMinutes?: number; // Минимальный интервал для вычисления таймеров
  onEdit: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  onAutoGenerate?: () => void;
  onCustomPrompt?: () => void;
}

const platformLabels: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const languageLabels: Record<Channel["language"], string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша"
};

const ChannelCard = ({
  channel,
  index,
  compact = true,
  automationState = "default",
  automationStateInfo,
  minIntervalMinutes = 11,
  onEdit,
  onDelete,
  onGenerate,
  onAutoGenerate,
  onCustomPrompt
}: ChannelCardProps) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const [showDetails, setShowDetails] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMobileActionsMenu, setShowMobileActionsMenu] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSocialClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    url: string
  ) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const hasSocialLinks =
    channel.youtubeUrl || channel.tiktokUrl || channel.instagramUrl;

  const number = (index ?? 0) + 1;
  const updatedDate = new Date(timestampToIso(channel.updatedAt));
  const updatedStr = updatedDate.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const isTouchDevice =
    typeof window !== "undefined" && "ontouchstart" in window;

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails(true);
  };

  const handleCloseDetails = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowDetails(false);
  };

  // Формируем краткое резюме для мобильной версии
  const scheduleInfo = channel.autoSendSchedules && channel.autoSendSchedules.length > 0
    ? `${channel.autoSendSchedules.length} ${channel.autoSendSchedules.length === 1 ? 'публикация' : channel.autoSendSchedules.length < 5 ? 'публикации' : 'публикаций'}/день`
    : null;
  
  const summaryParts = [
    `Язык: ${languageLabels[channel.language]}`,
    scheduleInfo || `${channel.targetDurationSec} сек`,
    channel.niche ? `ниша: ${channel.niche}` : null
  ].filter(Boolean);

  // Определяем CSS классы для подсветки
  const getAutomationClasses = () => {
    switch (automationState) {
      case "current":
        return "channel-card--current border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-500/5 to-transparent shadow-[0_0_20px_rgba(34,197,94,0.15)]";
      case "next":
        return "channel-card--next border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent shadow-[0_0_20px_rgba(250,204,21,0.15)]";
      case "previous":
        return "channel-card--previous border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-500/5 to-transparent shadow-[0_0_20px_rgba(59,130,246,0.15)]";
      default:
        return "";
    }
  };

  const getAutomationLabel = () => {
    switch (automationState) {
      case "current":
        return "Сейчас идёт автоматизация";
      case "next":
        return "Следующий по расписанию";
      case "previous":
        return "Последний запуск";
      default:
        return null;
    }
  };

  const labelColor = automationState === "current" 
    ? "text-emerald-300" 
    : automationState === "next" 
    ? "text-amber-300" 
    : automationState === "previous"
    ? "text-blue-300"
    : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full ${
        isDragging ? "z-50 scale-105 shadow-2xl opacity-50" : ""
      }`}
    >
      {/* Десктопная версия */}
      <div
        className={`hidden md:block group relative rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-white shadow-sm transition hover:border-brand/50 hover:shadow-lg ${getAutomationClasses()}`}
        onMouseLeave={() => {
          if (!isTouchDevice) setShowDetails(false);
        }}
      >
        <div className="flex flex-col justify-between h-full">
          {/* Лейбл состояния автоматизации */}
          {automationState !== "default" && (
            <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>
              {getAutomationLabel()}
            </div>
          )}
          {/* Таймеры и время автоматизации */}
          {automationStateInfo && automationStateInfo.state !== "default" && (
            <AutomationTimers 
              stateInfo={automationStateInfo} 
              minIntervalMinutes={minIntervalMinutes}
              isMobile={false}
            />
          )}
          {/* Заголовок: номер + имя + платформа */}
          <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none text-slate-400 hover:text-slate-200 transition-colors"
              title="Перетащите для изменения порядка"
              aria-label="Перетащить канал"
            >
              <GripVertical size={16} />
            </button>
            <div className="truncate text-sm font-semibold text-white">
              {number}. {channel.name}
            </div>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{platformLabels[channel.platform]}</span>
          </div>
        </div>

        {hasSocialLinks && (
          <div className="flex items-center gap-1">
            {channel.youtubeUrl && (
              <button
                type="button"
                onClick={(e) => handleSocialClick(e, channel.youtubeUrl!)}
                className="group flex h-6 w-6 items-center justify-center rounded-full bg-red-600/20 text-[10px] text-red-400 transition hover:bg-red-600/30"
                title="YouTube"
              >
                YT
              </button>
            )}
            {channel.tiktokUrl && (
              <button
                type="button"
                onClick={(e) => handleSocialClick(e, channel.tiktokUrl!)}
                className="group flex h-6 w-6 items-center justify-center rounded-full bg-black text-[10px] text-white transition hover:bg-black/80"
                title="TikTok"
              >
                TT
              </button>
            )}
            {channel.instagramUrl && (
              <button
                type="button"
                onClick={(e) => handleSocialClick(e, channel.instagramUrl!)}
                className="group flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 text-[10px] text-white transition hover:opacity-90"
                title="Instagram"
              >
                IG
              </button>
            )}
          </div>
        )}
      </div>

      {/* Вторая строка: язык, длительность, аудитория/категория */}
      <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
        <span>
          {channel.targetDurationSec} сек • {languageLabels[channel.language]}
        </span>
        {channel.audience && (
          <>
            <span>•</span>
            <span>{channel.audience}</span>
          </>
        )}
        {channel.niche && (
          <>
            <span>•</span>
            <span>{channel.niche}</span>
          </>
        )}
      </div>

      {/* Третья строка: последнее обновление */}
      <div className="mb-2 text-[11px] text-slate-500">
        Обновлён: {updatedStr}
      </div>

      {/* Краткое описание с line-clamp */}
      <div className="mb-2 text-xs text-slate-300 channel-description">
        {channel.extraNotes ||
          "Описание канала пока не заполнено. Нажмите «Редактировать», чтобы добавить детали."}
      </div>

      {/* Ссылка Подробнее */}
      <button
        type="button"
        onClick={handleDetailsClick}
        className="mb-2 self-start text-[11px] font-medium text-slate-300 underline-offset-2 hover:text-brand-light hover:underline"
      >
        Подробнее
      </button>

      {/* Кнопки действий */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onGenerate}
            className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-dark"
          >
            Сгенерировать
          </button>
          {onAutoGenerate && (
            <button
              type="button"
              onClick={onAutoGenerate}
              className="inline-flex items-center gap-1 rounded-lg bg-brand/80 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-dark"
              title="Автогенерация идеи и сценариев от ИИ"
            >
              <Sparkles size={12} />
              <span className="hidden sm:inline">ИИ-идея</span>
              <span className="sm:hidden">ИИ</span>
            </button>
          )}
          {onCustomPrompt && (
            <button
              type="button"
              onClick={onCustomPrompt}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-slate-800/50 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-brand/50 hover:bg-slate-700/50 hover:text-white"
              title="Отправить свой готовый промпт и запустить генерацию ролика"
            >
              <FileText size={12} />
              <span className="hidden sm:inline">Свой промпт</span>
              <span className="sm:hidden">Промпт</span>
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] text-slate-200 hover:border-brand/50 hover:text-white"
          >
            Редактировать
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full px-2 py-1 text-[13px] text-red-400 hover:bg-red-500/10"
          title="Удалить канал"
        >
          ⋮
        </button>
      </div>

      {/* Детали: десктоп-поповер или мобильная модалка */}
      {!isTouchDevice ? (
        showDetails && (
          <div
            className="absolute inset-x-0 top-0 z-20 translate-y-[-8px] rounded-2xl border border-white/25 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
            onMouseEnter={() => setShowDetails(true)}
            onMouseLeave={() => setShowDetails(false)}
          >
            <div className="mb-2 flex items-center justify между gap-2">
              <div className="text-sm font-semibold text-white">
                {number}. {channel.name}
              </div>
              <button
                type="button"
                onClick={handleCloseDetails}
                className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto text-xs text-slate-200">
              <div>
                <div className="mb-1 font-semibold text-slate-300">Описание</div>
                <p className="whitespace-pre-line">
                  {channel.extraNotes || "Не указано"}
                </p>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-300">
                  Запрещено
                </div>
                <p className="whitespace-pre-line">
                  {channel.blockedTopics || "Не указано"}
                </p>
              </div>
            </div>
          </div>
        )
      ) : (
        showDetails && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
            <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-slate-950 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">
                  {number}. {channel.name}
                </div>
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto text-xs text-slate-200">
                <div>
                  <div className="mb-1 font-semibold text-slate-300">
                    Описание
                  </div>
                  <p className="whitespace-pre-line">
                    {channel.extraNotes || "Не указано"}
                  </p>
                </div>
                <div>
                  <div className="mb-1 font-semibold text-slate-300">
                    Запрещено
                  </div>
                  <p className="whitespace-pre-line">
                    {channel.blockedTopics || "Не указано"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      )}
        </div>
      </div>

      {/* Мобильная версия - карточка с двумя состояниями */}
      <div
        className={`md:hidden w-full rounded-xl border border-white/10 bg-slate-900/60 text-white transition ${getAutomationClasses()}`}
      >
        {/* Сжатое состояние - всегда видно */}
        <div className="px-4 py-3">
          {/* Лейбл состояния автоматизации */}
          {automationState !== "default" && (
            <div className={`mb-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider leading-tight ${labelColor}`}>
              {getAutomationLabel()}
            </div>
          )}
          {/* Таймеры и время автоматизации */}
          {automationStateInfo && automationStateInfo.state !== "default" && (
            <div className="mb-2">
              <AutomationTimers 
                stateInfo={automationStateInfo} 
                minIntervalMinutes={minIntervalMinutes}
                isMobile={true}
              />
            </div>
          )}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing touch-none text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
                  title="Перетащите для изменения порядка"
                  aria-label="Перетащить канал"
                >
                  <GripVertical size={14} />
                </button>
                <div className="text-[15px] sm:text-base font-semibold text-white truncate leading-tight">
                  {number}. {channel.name}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-200 mb-1">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                <span>{platformLabels[channel.platform]}</span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 line-clamp-2 leading-snug">
                {summaryParts.join(" • ")}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {hasSocialLinks && (
                <div className="flex items-center gap-0.5 mr-1">
                  {channel.youtubeUrl && (
                    <button
                      type="button"
                      onClick={(e) => handleSocialClick(e, channel.youtubeUrl!)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 text-[9px] text-red-400"
                      title="YouTube"
                    >
                      YT
                    </button>
                  )}
                  {channel.tiktokUrl && (
                    <button
                      type="button"
                      onClick={(e) => handleSocialClick(e, channel.tiktokUrl!)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[9px] text-white"
                      title="TikTok"
                    >
                      TT
                    </button>
                  )}
                  {channel.instagramUrl && (
                    <button
                      type="button"
                      onClick={(e) => handleSocialClick(e, channel.instagramUrl!)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 text-[9px] text-white"
                      title="Instagram"
                    >
                      IG
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/50 hover:text-white"
                aria-label={isExpanded ? "Свернуть" : "Развернуть"}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Основные кнопки действий - всегда видно */}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onGenerate}
              className="flex-1 min-h-[44px] rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Сгенерировать
            </button>
            {onCustomPrompt && (
              <button
                type="button"
                onClick={onCustomPrompt}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-white/15 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-brand/50 hover:bg-slate-700/50 hover:text-white flex items-center justify-center"
                title="Свой промпт"
              >
                <FileText size={16} />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMobileActionsMenu(!showMobileActionsMenu)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-slate-800/50 text-slate-300 transition hover:bg-slate-700/50"
                aria-label="Дополнительные действия"
              >
                <MoreVertical size={16} />
              </button>
              {showMobileActionsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowMobileActionsMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-lg border border-white/10 bg-slate-900/95 p-2 shadow-xl backdrop-blur-xl">
                    {onAutoGenerate && (
                      <button
                        type="button"
                        onClick={() => {
                          onAutoGenerate();
                          setShowMobileActionsMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Sparkles size={14} />
                        ИИ-идея
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onEdit();
                        setShowMobileActionsMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800/50"
                    >
                      Редактировать
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      type="button"
                      onClick={() => {
                        onDelete();
                        setShowMobileActionsMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
                    >
                      Удалить
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Раскрываемая часть */}
        {isExpanded && (
          <div className="border-t border-white/10 px-4 pb-3 pt-2.5 space-y-2">
            {/* Полное описание */}
            {channel.extraNotes && (
              <div>
                <div className="text-[10px] font-semibold text-slate-400 mb-1">Описание</div>
                <p className="text-xs text-slate-300 line-clamp-3">
                  {channel.extraNotes}
                </p>
              </div>
            )}

            {/* Параметры в виде компактного списка */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-400 mb-1">Параметры</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300">
                  <Clock size={10} />
                  {channel.targetDurationSec} сек
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300">
                  <Languages size={10} />
                  {languageLabels[channel.language]}
                </span>
                {channel.audience && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300">
                    <Users size={10} />
                    {channel.audience}
                  </span>
                )}
                {channel.niche && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300">
                    {channel.niche}
                  </span>
                )}
              </div>
            </div>

            {/* Запрещенные темы */}
            {channel.blockedTopics && (
              <div>
                <div className="text-[10px] font-semibold text-slate-400 mb-1">Запрещено</div>
                <p className="text-xs text-slate-300 line-clamp-2">
                  {channel.blockedTopics}
                </p>
              </div>
            )}

            {/* Все кнопки действий в раскрытом состоянии */}
            <div className="flex flex-wrap gap-2 pt-2">
              {onAutoGenerate && (
                <button
                  type="button"
                  onClick={onAutoGenerate}
                  className="flex items-center gap-1.5 rounded-lg bg-brand/80 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-white transition hover:bg-brand-dark"
                >
                  <Sparkles size={12} />
                  ИИ-идея
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2.5 min-h-[44px] text-xs text-slate-200 transition hover:border-brand/50 hover:text-white"
              >
                Редактировать
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2.5 min-h-[44px] text-xs text-red-400 transition hover:bg-red-500/10"
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelCard;

