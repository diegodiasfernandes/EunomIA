import {
    ArrowsClockwiseIcon,
    CalendarBlankIcon,
    CalendarCheckIcon,
    CheckIcon,
    ClockIcon,
    FlagIcon,
    InfoIcon,
    MapPinIcon,
    PencilSimpleIcon,
    TrashIcon,
    UserIcon,
    WarningIcon,
    type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { formatDue, formatShortDay, formatTime, meetingEnd, type Person } from "../lib/format";
import { useSetStatus } from "../lib/queries";
import type { ApprovalItem, Meeting } from "../lib/types";
import { useToast } from "./Toast";
import { Button, IconButton, cn } from "./ui";

export function useItemActions(item: ApprovalItem, onResolved?: () => void) {
    const toast = useToast();
    const mutation = useSetStatus((calendarSynced, status) => {
        if (status === "cancelled") toast("info", "Item descartado.");
        else if (item.kind === "deadline") toast("ok", "Prazo confirmado.");
        else if (calendarSynced) toast("ok", "Evento criado no Google Calendar.");
        else
            toast(
                "ok",
                "Reunião confirmada. Conecte o Google Calendar para sincronizar as próximas.",
            );
        onResolved?.();
    });

    return {
        confirm: () => mutation.mutate({ item, status: "confirmed" }),
        discard: () => mutation.mutate({ item, status: "cancelled" }),
        busy: mutation.isPending ? (mutation.variables?.status ?? null) : null,
        error: mutation.error?.message ?? null,
    };
}

export type ItemActions = ReturnType<typeof useItemActions>;

export function ActionBar({
    item,
    actions,
    calendarConnected,
    onEdit,
}: {
    item: ApprovalItem;
    actions: ItemActions;
    calendarConnected: boolean;
    onEdit: () => void;
}) {
    const confirmLabel =
        item.kind === "deadline"
            ? "Confirmar prazo"
            : calendarConnected
              ? "Adicionar ao Calendar"
              : "Confirmar reunião";
    const busy = actions.busy !== null;

    return (
        <div>
            <div className="flex items-center gap-1.5">
                <Button
                    variant="primary"
                    className="flex-1"
                    onClick={actions.confirm}
                    disabled={busy}
                >
                    {actions.busy === "confirmed" ? (
                        <ArrowsClockwiseIcon size={16} className="motion-safe:animate-spin" />
                    ) : item.kind === "meeting" && calendarConnected ? (
                        <CalendarCheckIcon size={16} weight="bold" />
                    ) : (
                        <CheckIcon size={16} weight="bold" />
                    )}
                    {actions.busy === "confirmed" ? "Confirmando..." : confirmLabel}
                </Button>
                <IconButton
                    label="Editar"
                    onClick={onEdit}
                    disabled={busy}
                    className="border border-line-strong"
                >
                    <PencilSimpleIcon size={17} />
                </IconButton>
                <IconButton
                    label="Descartar"
                    onClick={actions.discard}
                    disabled={busy}
                    className="border border-line-strong hover:bg-danger-soft hover:text-danger"
                >
                    {actions.busy === "cancelled" ? (
                        <ArrowsClockwiseIcon size={16} className="motion-safe:animate-spin" />
                    ) : (
                        <TrashIcon size={17} />
                    )}
                </IconButton>
            </div>
            {actions.error && (
                <p role="alert" className="mt-2 text-[12.5px] leading-snug text-danger">
                    {actions.error}
                </p>
            )}
        </div>
    );
}

function MetaItem({ icon: Glyph, children }: { icon: Icon; children: ReactNode }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <Glyph size={15} className="shrink-0 text-ink-3" />
            <span className="truncate">{children}</span>
        </span>
    );
}

export function ItemMeta({ item, className }: { item: ApprovalItem; className?: string }) {
    const base = cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-2 tabular-nums",
        className,
    );

    if (item.kind === "meeting") {
        const meeting = item.record;
        return (
            <div className={base}>
                <MetaItem icon={CalendarBlankIcon}>{formatShortDay(meeting.starts_at)}</MetaItem>
                <MetaItem icon={ClockIcon}>
                    {formatTime(meeting.starts_at)} -{" "}
                    {formatTime(meetingEnd(meeting).toISOString())}
                </MetaItem>
                {meeting.location && <MetaItem icon={MapPinIcon}>{meeting.location}</MetaItem>}
            </div>
        );
    }

    const task = item.record;
    return (
        <div className={base}>
            <MetaItem icon={FlagIcon}>
                {task.due_at
                    ? `Prazo ${formatDue(task.due_at)}`
                    : task.deadline_reference || "Sem prazo definido"}
            </MetaItem>
            {task.responsible && <MetaItem icon={UserIcon}>{task.responsible}</MetaItem>}
        </div>
    );
}

export function ConflictNote({ meeting, className }: { meeting: Meeting; className?: string }) {
    if (!meeting.conflicts_with.length) return null;
    const [first, ...rest] = meeting.conflicts_with;
    const blocking =
        meeting.status !== "confirmed" &&
        meeting.conflicts_with.some((c) => c.status === "confirmed");
    const overlap = first.overlap_minutes ? ` por ${first.overlap_minutes} min` : "";
    const more = rest.length ? ` e mais ${rest.length}` : "";
    const hint = blocking
        ? "Edite ou descarte um deles antes de confirmar."
        : first.certainty === "possible"
          ? "A duração de um deles foi estimada."
          : "";

    return (
        <p
            className={cn(
                "flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn",
                className,
            )}
        >
            <WarningIcon size={16} weight="bold" className="mt-px shrink-0" />
            <span>
                Conflita com <strong className="font-semibold">{first.title}</strong>
                {overlap}
                {more}. {hint}
            </span>
        </p>
    );
}

export function Assumptions({ items, className }: { items: string[]; className?: string }) {
    if (!items.length) return null;
    return (
        <div className={cn("rounded-control bg-sunken px-3 py-2.5", className)}>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
                <InfoIcon size={15} weight="bold" />O que a EunomIA presumiu
            </p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-ink-2">
                {items.map((text) => (
                    <li key={text} className="flex gap-2">
                        <span
                            aria-hidden
                            className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3"
                        />
                        {text}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function senderSummary(people: Person[]) {
    if (!people.length) return "";
    if (people.length === 1) return people[0].name;
    if (people.length === 2) return `${people[0].name} e ${people[1].name}`;
    return `${people[0].name} e mais ${people.length - 1}`;
}
