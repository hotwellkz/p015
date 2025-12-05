import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, ChevronDown, Loader2 } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { user, status, logout } = useAuthStore((state) => ({
    user: state.user,
    status: state.status,
    logout: state.logout
  }));

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Закрытие меню при нажатии Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("Ошибка при выходе:", error);
      // Всё равно делаем редирект
      navigate("/auth", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleProfileClick = () => {
    setIsOpen(false);
    navigate("/settings");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-700" />
        <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-700 sm:block" />
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Генерируем инициалы из email или displayName
  const getInitials = () => {
    if (user.displayName) {
      return user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const displayName = user.displayName || user.email || "Пользователь";
  const initials = getInitials();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 transition hover:border-brand/40 hover:bg-slate-800 hover:text-white sm:gap-3"
        aria-label="Меню пользователя"
        aria-expanded={isOpen}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-light">
          {initials}
        </div>
        <span className="hidden max-w-[120px] truncate sm:block">{displayName}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="p-2">
            {/* Информация о пользователе */}
            <div className="rounded-lg border border-white/5 bg-slate-800/40 px-3 py-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-light">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  {user.displayName && (
                    <div className="truncate text-sm font-medium text-white">
                      {user.displayName}
                    </div>
                  )}
                  <div className="truncate text-xs text-slate-400">{user.email}</div>
                </div>
              </div>
            </div>

            {/* Пункты меню */}
            <button
              type="button"
              onClick={handleProfileClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              <User size={16} />
              <span>Профиль</span>
            </button>

            <div className="my-1 h-px bg-white/5" />

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-900/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogOut size={16} />
              )}
              <span>{isLoggingOut ? "Выход..." : "Выйти"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;

