import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "info" | "success" | "error" | "loading";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  href?: string;
  hrefLabel?: string;
}

interface ToastApi {
  show: (
    message: string,
    kind?: ToastKind,
    opts?: { href?: string; hrefLabel?: string; durationMs?: number }
  ) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <Toaster>");
  return ctx;
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    (message, kind = "info", opts) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, message, href: opts?.href, hrefLabel: opts?.hrefLabel }]);
      // loading toasts persist until explicitly dismissed/replaced.
      const duration = opts?.durationMs ?? (kind === "loading" ? 0 : 6000);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className="toast__icon" aria-hidden>
              {t.kind === "success"
                ? "✓"
                : t.kind === "error"
                ? "!"
                : t.kind === "loading"
                ? "⟳"
                : "i"}
            </span>
            <div className="toast__body">
              <p>{t.message}</p>
              {t.href && (
                <a href={t.href} target="_blank" rel="noreferrer">
                  {t.hrefLabel ?? "View"}
                </a>
              )}
            </div>
            <button
              className="toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
