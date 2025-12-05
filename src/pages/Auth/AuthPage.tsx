import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate, useLocation, Link } from "react-router-dom";
import type { Location } from "react-router-dom";
import SEOHead from "../../components/SEOHead";

type AuthMode = "login" | "signup";

const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { initialize, status, login, signup, error, user, logout } =
    useAuthStore((state) => ({
      initialize: state.initialize,
      status: state.status,
      login: state.login,
      signup: state.signup,
      error: state.error,
      user: state.user,
      logout: state.logout
    }));

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === "authenticated") {
      const redirectTo =
        (location.state as { from?: Location } | null)?.from?.pathname ??
        "/channels";
      navigate(redirectTo, { replace: true });
    }
  }, [status, navigate, location.state]);

  const isLoading = status === "loading";

  const headline = useMemo(
    () =>
      mode === "login"
        ? "Войдите, чтобы управлять каналами"
        : "Создайте аккаунт и запустите мастер каналов",
    [mode]
  );

  const modeLabel = mode === "login" ? "Войти" : "Зарегистрироваться";

  const secondaryActionLabel =
    mode === "login"
      ? "Нет аккаунта? Зарегистрируйтесь"
      : "Уже есть аккаунт? Войдите";

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setLocalError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await signup({ email, password });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка авторизации";
      setLocalError(message);
    }
  };

  const handleLogout = async () => {
    await logout();
    setEmail("");
    setPassword("");
  };

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Shorts AI Studio",
    description: "Генератор сценариев для коротких вертикальных видео с помощью искусственного интеллекта",
    url: "https://shortsai.ru",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "RUB"
    },
    featureList: [
      "Генерация сценариев для TikTok, Reels, Shorts",
      "Настройка каналов с персональными параметрами",
      "Использование OpenAI для создания контента"
    ]
  };

  return (
    <>
      <SEOHead
        title="Вход в Shorts AI Studio - Генератор сценариев для TikTok и Reels"
        description="Войдите в Shorts AI Studio для создания профессиональных сценариев коротких видео. Генерация уникального контента с помощью искусственного интеллекта."
        keywords="войти, регистрация, генератор сценариев, tiktok, reels, shorts, AI"
        structuredData={structuredData}
      />
      <div className="min-h-screen w-full bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-2">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1 text-sm text-brand-light">
            <Sparkles size={16} />
            Shorts AI Studio
          </div>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Генерируйте сценарии для Shorts, Reels, TikTok и VK Clips за минуты
          </h1>
          <p className="text-lg text-slate-300">
            Настройте каналы с нужным тоном, аудиторией и длительностью, затем
            запускайте генерацию сценариев на базе OpenAI с персональными
            ограничениями. Все каналы и сценарии привязаны к вашему Firebase
            аккаунту.
          </p>
          <ul className="space-y-3 text-slate-300">
            {[
              "Мастер настройки каналов за 9 шагов",
              "Безопасное хранение каналов в Firestore",
              "Генератор сценариев с Hook / Action / Final / Text / Voice / Sound"
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Wand2 size={18} className="mt-1 text-brand-light" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl shadow-brand/10">
          <div className="space-y-2 text-center">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
              Firebase Auth
            </p>
            <h2 className="text-2xl font-semibold text-white">{headline}</h2>
          </div>

          <div className="mt-6 flex gap-2 rounded-full bg-slate-800/60 p-1 text-sm font-medium">
            {(["login", "signup"] as AuthMode[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMode(tab)}
                className={clsx(
                  "flex-1 rounded-full px-3 py-2 transition",
                  mode === tab
                    ? "bg-white text-slate-900"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {tab === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          {(error || localError) && (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {localError ?? error}
            </div>
          )}

          {user && (
            <div className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-100">
              Вы вошли как <span className="font-semibold">{user.email}</span>
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-slate-200"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="founder@studio.me"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-slate-200"
              >
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {modeLabel}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-400">
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-brand-light underline-offset-4 transition hover:text-brand"
            >
              {secondaryActionLabel}
            </button>
          </div>

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-6 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 transition hover:border-white/30 hover:text-white"
            >
              Выйти из аккаунта
            </button>
          )}
        </section>
      </div>

      {/* Footer with Privacy Policy link */}
      <footer className="mx-auto mt-12 max-w-5xl border-t border-white/10 pt-8 text-center">
        <Link
          to="/privacy"
          className="text-sm text-slate-400 underline transition hover:text-slate-200"
        >
          Политика конфиденциальности
        </Link>
      </footer>
    </div>
    </>
  );
};

export default AuthPage;

