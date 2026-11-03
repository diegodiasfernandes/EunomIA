import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, use, useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";

type ToastTone = "ok" | "danger" | "info";

interface ToastState {
    id: number;
    tone: ToastTone;
    text: string;
}

const ToastContext = createContext<(tone: ToastTone, text: string) => void>(() => undefined);

export const useToast = () => use(ToastContext);

const icons = {
    ok: <CheckCircleIcon size={18} weight="fill" className="text-ok" />,
    danger: <WarningCircleIcon size={18} weight="fill" className="text-danger" />,
    info: <InfoIcon size={18} weight="fill" className="text-accent" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timer = useRef<number | undefined>(undefined);

    const show = useCallback((tone: ToastTone, text: string) => {
        window.clearTimeout(timer.current);
        setToast({ id: Date.now(), tone, text });
        timer.current = window.setTimeout(() => setToast(null), 4_800);
    }, []);

    return (
        <ToastContext value={show}>
            {children}
            <div
                className="pointer-events-none absolute inset-x-3 bottom-[84px] z-30 flex justify-center"
                aria-live="polite"
            >
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            key={toast.id}
                            role="status"
                            initial={{ opacity: 0, y: 14, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className={cn(
                                "pointer-events-auto flex max-w-full items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-2.5",
                                "text-[13px] leading-snug font-medium text-ink shadow-toast",
                            )}
                        >
                            <span className="mt-px shrink-0">{icons[toast.tone]}</span>
                            <span>{toast.text}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ToastContext>
    );
}
