import { useState } from "react";
import type { ChannelScheduleItem } from "../api/channelSchedule";
import type { ConflictKey } from "../utils/scheduleConflicts";
import ChannelScheduleRow from "./ChannelScheduleRow";

interface ChannelScheduleTableProps {
  items: ChannelScheduleItem[];
  onItemsUpdate: (updatedItems: ChannelScheduleItem[]) => void;
  conflicts: Set<ConflictKey>;
  activeTime: string | null;
  animateActiveTime: string | null;
  remainingSeconds: number;
  minIntervalMinutes: number;
  nextTime: string | null;
  previousTime: string | null;
  previousElapsedSeconds: number;
}

const ChannelScheduleTable = ({
  items,
  onItemsUpdate,
  conflicts,
  activeTime,
  animateActiveTime,
  remainingSeconds,
  minIntervalMinutes,
  nextTime,
  previousTime,
  previousElapsedSeconds
}: ChannelScheduleTableProps) => {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Находим максимальное количество времён для определения количества колонок
  const maxTimes = Math.max(...items.map((item) => item.times.length), 0);
  // Показываем минимум 4 колонки, максимум 10
  const timeColumnsCount = Math.min(Math.max(maxTimes, 4), 10);

  const handleUpdate = (updatedItem: ChannelScheduleItem) => {
    const updatedItems = items.map((item) =>
      item.id === updatedItem.id ? updatedItem : item
    );
    onItemsUpdate(updatedItems);
  };

  const handleError = (message: string) => {
    setToast({ message, type: "error" });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSuccess = (message: string) => {
    setToast({ message, type: "success" });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <>
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg ${
            toast.type === "success"
              ? "bg-green-500/90 text-white"
              : "bg-red-500/90 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-slate-900/50">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-slate-800/50">
              <th className="sticky left-0 z-10 bg-slate-800/50 px-4 py-3 text-left text-sm font-semibold text-slate-300">
                №
              </th>
              <th className="sticky left-[60px] z-10 bg-slate-800/50 px-4 py-3 text-left text-sm font-semibold text-slate-300">
                Название канала
              </th>
              {Array.from({ length: timeColumnsCount }, (_, i) => (
                <th
                  key={i}
                  className="min-w-[80px] px-4 py-3 text-center text-sm font-semibold text-slate-300"
                >
                  {i === 0 ? "Расписание" : ""}
                </th>
              ))}
              {maxTimes > timeColumnsCount && (
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                  Ещё
                </th>
              )}
              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIndex) => (
              <ChannelScheduleRow
                key={item.id}
                item={item}
                timeColumnsCount={timeColumnsCount}
                conflicts={conflicts}
                activeTime={activeTime}
                animateActiveTime={animateActiveTime}
                remainingSeconds={remainingSeconds}
                minIntervalMinutes={minIntervalMinutes}
                nextTime={nextTime}
                previousTime={previousTime}
                previousElapsedSeconds={previousElapsedSeconds}
                onUpdate={handleUpdate}
                onError={handleError}
                onSuccess={handleSuccess}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ChannelScheduleTable;

