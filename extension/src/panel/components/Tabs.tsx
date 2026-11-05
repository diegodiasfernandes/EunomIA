import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { cn } from "./ui";

export type TabId = "overview" | "approvals" | "agenda" | "chat";

const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Visão geral" },
    { id: "approvals", label: "Aprovações" },
    { id: "agenda", label: "Agenda" },
    { id: "chat", label: "Conversa" },
];

export function Tabs({
    value,
    onChange,
    approvals,
}: {
    value: TabId;
    onChange: (tab: TabId) => void;
    approvals: number;
}) {
    function onKeyDown(event: KeyboardEvent) {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const index = TABS.findIndex((tab) => tab.id === value);
        const next =
            TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
        onChange(next.id);
        document.getElementById(`tab-${next.id}`)?.focus();
    }

    return (
        <nav
            role="tablist"
            aria-label="Seções da EunomIA"
            onKeyDown={onKeyDown}
            className="flex gap-0.5 overflow-x-auto border-b border-line px-2 scrollbar-none"
        >
            {TABS.map((tab) => {
                const active = tab.id === value;
                const count =
                    tab.id === "approvals" ? approvals : 0;
                return (
                    <button
                        key={tab.id}
                        id={`tab-${tab.id}`}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        aria-controls="panel-view"
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "relative flex h-10 shrink-0 items-center gap-1.5 rounded-t-md px-2 text-[13px] font-medium transition-colors",
                            active ? "text-accent-ink" : "text-ink-3 hover:text-ink",
                        )}
                    >
                        {tab.label}
                        {count > 0 && (
                            <motion.span
                                key={count}
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                                className={cn(
                                    "grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                                    "bg-accent text-on-accent",
                                )}
                                aria-label={
                                    `${count} pendentes`
                                }
                            >
                                {count}
                            </motion.span>
                        )}
                        {active && (
                            <motion.span
                                layoutId="tab-indicator"
                                className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-accent"
                                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                            />
                        )}
                    </button>
                );
            })}
        </nav>
    );
}
