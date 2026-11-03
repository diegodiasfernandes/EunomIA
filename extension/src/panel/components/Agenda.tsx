import { CalendarBlankIcon, WarningIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useMemo } from "react";
import {
    dayKey,
    dayLabel,
    formatDuration,
    formatTime,
    isOpenStatus,
    meetingMinutes,
    STATUS_LABEL,
} from "../lib/format";
import type { Meeting } from "../lib/types";
import { ConflictNote } from "./item-parts";
import { Pill, Skeleton, cn, type Tone } from "./ui";

export type AgendaFilter = "upcoming" | "conflicts" | "history";

function statusTone(meeting: Meeting): Tone {
    if (isOpenStatus(meeting.status)) return "accent";
    if (meeting.status === "confirmed") return "ok";
    return "muted";
}

function shortStatus(meeting: Meeting) {
    return isOpenStatus(meeting.status) ? "Aguardando" : STATUS_LABEL[meeting.status];
}

export function MeetingRow({ meeting, onOpen }: { meeting: Meeting; onOpen: () => void }) {
    const muted = meeting.status === "cancelled" || meeting.status === "rejected";
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-sunken/60"
        >
            {meeting.conflict && !muted && (
                <span
                    aria-hidden
                    className="absolute inset-y-2.5 left-0 w-0.75 rounded-r-full bg-warn"
                />
            )}
            <span className="w-11 shrink-0 tabular-nums">
                <span
                    className={cn(
                        "block text-[13px] font-semibold",
                        muted ? "text-ink-3" : "text-ink",
                    )}
                >
                    {formatTime(meeting.starts_at)}
                </span>
                <span className="block text-[11.5px] text-ink-3">
                    {formatDuration(meetingMinutes(meeting))}
                </span>
            </span>
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        "block truncate text-[13.5px] font-medium group-hover:text-accent-ink",
                        muted ? "text-ink-3 line-through decoration-ink-3/50" : "text-ink",
                    )}
                >
                    {meeting.title}
                </span>
                <span className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                    {meeting.conflict && !muted && (
                        <WarningIcon size={13} weight="bold" className="shrink-0 text-warn" />
                    )}
                    {meeting.conflict && !muted
                        ? "Conflito de horário"
                        : meeting.location || "Sem local definido"}
                </span>
            </span>
            <Pill tone={statusTone(meeting)}>{shortStatus(meeting)}</Pill>
        </button>
    );
}

function groupByDay(meetings: Meeting[]) {
    const groups = new Map<string, { label: string; items: Meeting[] }>();
    for (const meeting of meetings) {
        const key = dayKey(meeting.starts_at);
        const group = groups.get(key) ?? { label: dayLabel(meeting.starts_at), items: [] };
        group.items.push(meeting);
        groups.set(key, group);
    }
    return [...groups.values()];
}

const EMPTY: Record<AgendaFilter, { title: string; body: string }> = {
    upcoming: {
        title: "Nenhum compromisso pela frente",
        body: "Reuniões que você aprovar ou que aguardam aprovação aparecem aqui.",
    },
    conflicts: {
        title: "Sem conflitos de horário",
        body: "A EunomIA compara as reuniões que ela gerencia e avisa quando dois horários se sobrepõem.",
    },
    history: {
        title: "Histórico vazio",
        body: "Reuniões passadas e itens descartados ficam guardados aqui.",
    },
};

export function AgendaView({
    filter,
    onFilter,
    upcoming,
    conflicts,
    history,
    loading,
    onOpen,
}: {
    filter: AgendaFilter;
    onFilter: (filter: AgendaFilter) => void;
    upcoming: Meeting[];
    conflicts: Meeting[];
    history: Meeting[];
    loading: boolean;
    onOpen: (meeting: Meeting) => void;
}) {
    const list = filter === "upcoming" ? upcoming : filter === "conflicts" ? conflicts : history;
    const groups = useMemo(() => groupByDay(list), [list]);

    const filters: { id: AgendaFilter; label: string; count?: number }[] = [
        { id: "upcoming", label: "Próximos" },
        { id: "conflicts", label: "Conflitos", count: conflicts.length },
        { id: "history", label: "Histórico" },
    ];

    return (
        <div className="p-3">
            <div role="radiogroup" aria-label="Filtrar agenda" className="mb-3 flex gap-1.5">
                {filters.map((item) => {
                    const active = filter === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onFilter(item.id)}
                            className={cn(
                                "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors",
                                active
                                    ? "text-surface"
                                    : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink",
                            )}
                        >
                            {active && (
                                <motion.span
                                    layoutId="agenda-filter"
                                    className="absolute inset-0 rounded-full bg-ink"
                                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                                />
                            )}
                            <span className="relative">{item.label}</span>
                            {Boolean(item.count) && (
                                <span
                                    className={cn(
                                        "relative grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                                        active
                                            ? "bg-surface/20 text-surface"
                                            : "bg-warn-soft text-warn",
                                    )}
                                >
                                    {item.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="space-y-2 rounded-card border border-line bg-surface p-3.5">
                    {[0, 1, 2].map((key) => (
                        <div key={key} className="flex items-center gap-3 py-1.5">
                            <Skeleton className="h-8 w-11" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-3/4" />
                                <Skeleton className="h-3 w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : filter === "conflicts" && conflicts.length ? (
                <ul className="space-y-2.5">
                    {conflicts.map((meeting) => (
                        <li
                            key={meeting.id}
                            className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
                        >
                            <MeetingRow meeting={meeting} onOpen={() => onOpen(meeting)} />
                            <ConflictNote meeting={meeting} className="mx-3 mb-3" />
                        </li>
                    ))}
                </ul>
            ) : groups.length ? (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <section key={group.label}>
                            <h3 className="mb-1.5 px-1 text-[12.5px] font-semibold text-ink-2">
                                {group.label}
                            </h3>
                            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
                                {group.items.map((meeting) => (
                                    <MeetingRow
                                        key={meeting.id}
                                        meeting={meeting}
                                        onOpen={() => onOpen(meeting)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-start gap-3 px-2 py-6">
                    <span className="grid size-11 place-items-center rounded-card bg-sunken text-ink-3">
                        <CalendarBlankIcon size={22} />
                    </span>
                    <div>
                        <h2 className="text-[15px] font-semibold">{EMPTY[filter].title}</h2>
                        <p className="mt-1 max-w-[36ch] text-[13px] leading-relaxed text-ink-3">
                            {EMPTY[filter].body}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
