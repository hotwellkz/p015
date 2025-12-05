import { useState } from "react";
import { Calendar, Clock, Languages, Users, Sparkles, GripVertical, FileText } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel } from "../domain/channel";
import { timestampToIso } from "../utils/firestore";

interface ChannelCardProps {
  channel: Channel;
  index?: number; // порядковый номер (0-based)
  compact?: boolean;
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
  onEdit,
  onDelete,
  onGenerate,
  onAutoGenerate,
  onCustomPrompt
}: ChannelCardProps) => {
  const [showDetails, setShowDetails] = useState(false);
  
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

  if (!compact) {
    // Пока используем только компактный режим
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-white shadow-sm transition hover:border-brand/50 hover:shadow-lg ${
        isDragging ? "z-50 scale-105 shadow-2xl" : ""
      }`}
      onMouseLeave={() => {
        if (!isTouchDevice) setShowDetails(false);
      }}
    >
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
  );
};

export default ChannelCard;

