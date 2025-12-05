import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

const AccountSettingsPage = () => {
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
          Загрузка настроек...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Настройки аккаунта</h1>
          <p className="mt-2 text-sm text-slate-400">
            Здесь в будущем появятся дополнительные настройки аккаунта.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-8">
          <h2 className="text-lg font-semibold">Профиль</h2>
          <p className="text-sm text-slate-400">
            Вы вошли как{" "}
            <span className="font-semibold text-slate-100">
              {user.email ?? "пользователь Firebase"}
            </span>
            .
          </p>
          <p className="text-sm text-slate-500">
            Telegram-интеграция сейчас управляется только на стороне backend и
            CLI. В веб-интерфейсе никаких действий с Telegram выполнять не
            нужно.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsPage;


