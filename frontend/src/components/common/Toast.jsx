import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import clsx from "clsx";

const ToastContext = createContext(null);

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15 ring-1 ring-emerald-500/30",
    barColor: "bg-emerald-500",
    borderGlow: "border-emerald-500/30 shadow-[0_8px_30px_rgb(16,185,129,0.12)]",
    title: "Success",
  },
  error: {
    icon: AlertCircle,
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/15 ring-1 ring-rose-500/30",
    barColor: "bg-rose-500",
    borderGlow: "border-rose-500/30 shadow-[0_8px_30px_rgb(244,63,94,0.12)]",
    title: "Error",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15 ring-1 ring-amber-500/30",
    barColor: "bg-amber-500",
    borderGlow: "border-amber-500/30 shadow-[0_8px_30px_rgb(245,158,11,0.12)]",
    title: "Warning",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/15 ring-1 ring-blue-500/30",
    barColor: "bg-blue-500",
    borderGlow: "border-blue-500/30 shadow-[0_8px_30px_rgb(59,130,246,0.12)]",
    title: "Notice",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", duration = 4000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex max-w-sm w-full flex-col gap-2.5 pointer-events-none px-3 sm:px-0">
        {toasts.map((toast) => {
          const config = VARIANTS[toast.type] || VARIANTS.info;
          const Icon = config.icon;

          return (
            <div
              key={toast.id}
              className={clsx(
                "animate-toast-in pointer-events-auto relative overflow-hidden rounded-xl border bg-surface-card/95 p-4 backdrop-blur-xl transition-all duration-300 hover:border-surface-border",
                config.borderGlow
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status Icon Badge */}
                <div
                  className={clsx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    config.iconBg
                  )}
                >
                  <Icon className={clsx("h-4 w-4", config.iconColor)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {config.title}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-200 break-words leading-snug">
                    {toast.message}
                  </p>
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 -mr-1 -mt-1 rounded-lg p-1 text-gray-500 transition-colors hover:bg-surface-border/50 hover:text-gray-300"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Progress timer bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-surface-border/40">
                <div
                  className={clsx("h-full animate-toast-progress", config.barColor)}
                  style={{ animationDuration: `${toast.duration}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
