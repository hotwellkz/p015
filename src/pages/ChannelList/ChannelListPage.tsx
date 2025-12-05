import { useEffect, useState } from "react";
import { Loader2, Plus, Video, Wand2, Calendar } from "lucide-react";
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
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type { Channel } from "../../domain/channel";

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
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl shadow-brand/10">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {localChannels.map((channel, index) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    index={index}
                    compact
                    onEdit={() => goToEdit(channel.id)}
                    onDelete={() => handleDelete(channel.id)}
                    onGenerate={() => goToGeneration(channel.id)}
                    onAutoGenerate={() => handleAutoGenerate(channel)}
                    onCustomPrompt={() => handleCustomPrompt(channel)}
                  />
                ))}
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

