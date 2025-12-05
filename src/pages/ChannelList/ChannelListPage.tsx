import { useEffect, useState } from "react";
import { Loader2, Plus, Video, Wand2, Calendar, MoreVertical, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from "@dnd-kit/sortable";
import ChannelCard from "../../components/ChannelCard";
import AIAutoGenerateModal from "../../components/AIAutoGenerateModal";
import CustomPromptModal from "../../components/CustomPromptModal";
import UserMenu from "../../components/UserMenu";
import NotificationBell from "../../components/NotificationBell";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type { Channel } from "../../domain/channel";
import { calculateChannelStates, type ChannelStateInfo } from "../../utils/channelAutomationState";
import { fetchScheduleSettings } from "../../api/scheduleSettings";

const ChannelListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({
    user: state.user
  }));

  const { channels, loading, error, fetchChannels, deleteChannel, reorderChannels } =
    useChannelStore((state) => ({
      channels: state.channels,
      loading: state.loading,
      error: state.error,
      fetchChannels: state.fetchChannels,
      deleteChannel: state.deleteChannel,
      reorderChannels: state.reorderChannels
    }));

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [selectedChannelForAI, setSelectedChannelForAI] =
    useState<Channel | null>(null);
  const [isCustomPromptModalOpen, setIsCustomPromptModalOpen] = useState(false);
  const [selectedChannelForCustomPrompt, setSelectedChannelForCustomPrompt] =
    useState<Channel | null>(null);
  const [localChannels, setLocalChannels] = useState<Channel[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [channelStates, setChannelStates] = useState<Map<string, ChannelStateInfo>>(new Map());
  const [minIntervalMinutes, setMinIntervalMinutes] = useState(11);

  // Синхронизируем локальное состояние с глобальным
  useEffect(() => {
    setLocalChannels(channels);
  }, [channels]);

  // Настройка сенсоров для drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Минимальное расстояние для начала перетаскивания (в пикселях)
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    if (!user?.uid) {
      return;
    }

    const oldIndex = localChannels.findIndex((ch) => ch.id === active.id);
    const newIndex = localChannels.findIndex((ch) => ch.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Оптимистично обновляем локальное состояние
    const newChannels = arrayMove(localChannels, oldIndex, newIndex);
    setLocalChannels(newChannels);

    // Отправляем новый порядок на сервер
    try {
      const orderedIds = newChannels.map((ch) => ch.id);
      await reorderChannels(user.uid, orderedIds);
    } catch (error) {
      // В случае ошибки откатываем изменения
      console.error("Failed to reorder channels:", error);
      setLocalChannels(channels);
      alert("Не удалось сохранить новый порядок каналов. Попробуйте ещё раз.");
    }
  };

  useEffect(() => {
    if (user?.uid) {
      void fetchChannels(user.uid);
    }
  }, [user?.uid, fetchChannels]);

  // Загружаем настройки расписания для получения minIntervalMinutes
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchScheduleSettings();
        setMinIntervalMinutes(settings.minIntervalMinutes || 11);
      } catch (error) {
        console.error("Failed to load schedule settings:", error);
      }
    };
    void loadSettings();
  }, []);

  // Вычисляем состояния каналов
  useEffect(() => {
    if (localChannels.length === 0) {
      setChannelStates(new Map());
      return;
    }

    const recalculateStates = () => {
      const states = calculateChannelStates(localChannels, minIntervalMinutes);
      setChannelStates(states);
    };

    recalculateStates();

    // Обновляем каждые 30 секунд
    const intervalId = setInterval(recalculateStates, 30_000);

    return () => clearInterval(intervalId);
  }, [localChannels, minIntervalMinutes]);

  const handleDelete = async (channelId: string) => {
    if (!user?.uid) {
      return;
    }
    const confirmed = window.confirm(
      "Удалить канал? Его настройки будут потеряны."
    );
    if (!confirmed) {
      return;
    }
    await deleteChannel(user.uid, channelId);
  };

  const goToWizard = () => {
    navigate("/channels/new");
  };

  const goToEdit = (channelId: string) => {
    navigate(`/channels/${channelId}/edit`);
  };

  const goToGeneration = (channelId: string) => {
    navigate(`/channels/${channelId}/generate`);
  };

  const handleAutoGenerate = (channel: Channel) => {
    setSelectedChannelForAI(channel);
    setIsAIModalOpen(true);
  };

  const handleCloseAIModal = () => {
    setIsAIModalOpen(false);
    setSelectedChannelForAI(null);
  };

  const handleCustomPrompt = (channel: Channel) => {
    setSelectedChannelForCustomPrompt(channel);
    setIsCustomPromptModalOpen(true);
  };

  const handleCloseCustomPromptModal = () => {
    setIsCustomPromptModalOpen(false);
    setSelectedChannelForCustomPrompt(null);
  };

  const handleCustomPromptSuccess = () => {
    // Можно добавить обновление списка каналов или показ уведомления
    console.log("Custom prompt sent successfully");
  };

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-3 text-white sm:px-4 sm:py-10 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-8">
        {/* Десктопная версия заголовка */}
        <header className="hidden flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl shadow-brand/10 md:flex">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                Панель канала
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white">
                Ваши каналы ({channels.length})
              </h1>
              <p className="mt-1 text-slate-300">
                Управляйте настройками, запускайте генерации сценариев и создавайте
                новые каналы под разные соцсети.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={goToWizard}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Создать канал</span>
                  <span className="sm:hidden">Создать</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/channels/schedule")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:border-brand/40 hover:text-white"
                >
                  <Calendar size={16} />
                  <span className="hidden sm:inline">Расписание</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/scripts")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:border-brand/40 hover:text-white"
                >
                  <Wand2 size={16} />
                  <span className="hidden sm:inline">Генератор</span>
                </button>
              </div>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          {user && (
            <div className="border-t border-white/5 pt-4">
              <p className="text-xs text-slate-400">
                Вы вошли как <span className="text-slate-300">{user.email}</span>
              </p>
            </div>
          )}
        </header>

        {/* Мобильная версия заголовка */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-white">
              Ваши каналы ({channels.length})
            </h1>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-white/10 bg-slate-900/50 p-2 text-slate-300 transition hover:bg-slate-800/50"
                  aria-label="Меню"
                >
                  <MoreVertical size={20} />
                </button>
                {showMobileMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowMobileMenu(false)}
                    />
                    <div className="absolute right-0 top-full z-40 mt-2 w-48 rounded-lg border border-white/10 bg-slate-900/95 p-2 shadow-xl backdrop-blur-xl">
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/notifications");
                          setShowMobileMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Bell size={16} />
                        Уведомления
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/channels/schedule");
                          setShowMobileMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Calendar size={16} />
                        Расписание
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/scripts");
                          setShowMobileMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Wand2 size={16} />
                        Генератор
                      </button>
                      <div className="my-2 border-t border-white/10" />
                      <div className="px-3 py-2">
                        <UserMenu />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={goToWizard}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <Plus size={18} />
            Создать канал
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 py-16">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
              Загружаем каналы...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/20 px-6 py-4 text-red-100">
            Ошибка: {error}
          </div>
        )}

        {!loading && channels.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-brand-light">
              <Video size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-white">
              Каналы ещё не созданы
            </h2>
            <p className="mt-2 text-slate-400">
              Пройдите мастер настройки, чтобы задать платформу, длительность,
              аудиторию и тон, а затем начните генерацию сценариев.
            </p>
            <button
              type="button"
              onClick={goToWizard}
              className="mt-6 rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Запустить мастер
            </button>
          </div>
        )}

        {localChannels.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localChannels.map((ch) => ch.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-2.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 pb-6 sm:pb-0">
                {localChannels.map((channel, index) => {
                  const stateInfo = channelStates.get(channel.id);
                  return (
                    <ChannelCard
                      key={channel.id}
                      channel={channel}
                      index={index}
                      compact
                      automationState={stateInfo?.state || "default"}
                      automationStateInfo={stateInfo}
                      minIntervalMinutes={minIntervalMinutes}
                      onEdit={() => goToEdit(channel.id)}
                      onDelete={() => handleDelete(channel.id)}
                      onGenerate={() => goToGeneration(channel.id)}
                      onAutoGenerate={() => handleAutoGenerate(channel)}
                      onCustomPrompt={() => handleCustomPrompt(channel)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* AI Auto Generate Modal */}
      {selectedChannelForAI && (
        <AIAutoGenerateModal
          isOpen={isAIModalOpen}
          channel={selectedChannelForAI}
          onClose={handleCloseAIModal}
        />
      )}

      {/* Custom Prompt Modal */}
      {selectedChannelForCustomPrompt && (
        <CustomPromptModal
          channel={selectedChannelForCustomPrompt}
          isOpen={isCustomPromptModalOpen}
          onClose={handleCloseCustomPromptModal}
          onSuccess={handleCustomPromptSuccess}
        />
      )}
    </div>
  );
};

export default ChannelListPage;

