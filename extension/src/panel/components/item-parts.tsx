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
import { useState, type ReactNode } from "react";
import { formatDue, formatShortDay, formatTime, meetingEnd, type Person } from "../lib/format";
import { useSetStatus } from "../lib/queries";
import type { ApprovalItem, Meeting } from "../lib/types";
import { useToast } from "./Toast";
import { Button, IconButton, cn } from "./ui";

export function useItemActions(item: ApprovalItem, onResolved?: () => void) {
    const toast = useToast();
    const mutation = useSetStatus((googleSynced, status) => {
        if (status === "rejected") toast("info", "Alteração descartada; a decisão anterior foi mantida.");
        else if (status === "cancelled")
            toast("info", item.record.pending_action === "cancel" ? "Cancelamento confirmado." : "Item descartado.");
        else if (item.kind === "deadline" && googleSynced)
            toast("ok", "Tarefa adicionada ao Google Tasks.");
        else if (item.kind === "deadline")
            toast("ok", "Prazo confirmado localmente. Conecte o Google Tasks para sincronizar os próximos.");
        else if (googleSynced) toast("ok", "Evento criado no Google Calendar.");
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
        rejectChange: () => mutation.mutate({ item, status: "rejected" }),
        confirmCancellation: () => mutation.mutate({ item, status: "cancelled" }),
        busy: mutation.isPending ? (mutation.variables?.status ?? null) : null,
        error: mutation.error?.message ?? null,
    };
}

export type ItemActions = ReturnType<typeof useItemActions>;

export function ActionBar({
    item,
    actions,
    calendarConnected,
    tasksConnected,
    onEdit,
}: {
    item: ApprovalItem;
    actions: ItemActions;
    calendarConnected: boolean;
    tasksConnected: boolean;
    onEdit: () => void;
}) {
    const confirmLabel =
        item.record.pending_action === "cancel"
            ? "Confirmar cancelamento"
            : item.record.pending_action === "update"
              ? "Confirmar alteração"
              : item.kind === "deadline"
            ? tasksConnected
                ? "Adicionar ao Google Tasks"
                : "Confirmar prazo"
            : calendarConnected
              ? "Adicionar ao Calendar"
              : "Confirmar reunião";
    const busy = actions.busy !== null;
    const [confirmingCancellation, setConfirmingCancellation] = useState(false);
    const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
    const discard = item.record.pending_action ? actions.rejectChange : actions.discard;

    return (
        <div>
            <div className="flex items-center gap-1.5">
                <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() =>
                        item.record.pending_action === "cancel"
                            ? setConfirmingCancellation(true)
                            : item.kind === "meeting" && item.record.possible_duplicate
                              ? setConfirmingDuplicate(true) : actions.confirm()
                    }
                    disabled={busy || (item.kind === "meeting" && item.record.review_only)}
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
                    disabled={busy || Boolean(item.record.pending_action)}
                    className="border border-line-strong"
                >
                    <PencilSimpleIcon size={17} />
                </IconButton>
                <IconButton
                    label={item.record.pending_action ? "Manter decisão anterior" : "Descartar"}
                    onClick={discard}
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
            {item.kind === "meeting" && item.record.possible_duplicate && <div className="mt-2 rounded-control bg-warn-soft p-3 text-[12px] text-warn" role="status">
                <p className="font-semibold">Possível duplicidade — revise antes de confirmar</p>
                {item.record.review_only && <p>O cancelamento não pôde ser associado com segurança. Confira o evento no Google Agenda.</p>}
                {item.record.duplicate_candidates?.map((candidate, index) => <p key={index} className="mt-1">
                    {candidate.title} · {formatDue(candidate.starts_at)}
                    {candidate.url?.startsWith("https://") && <> · <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="underline">Conferir no Google</a></>}
                </p>)}
            </div>}
            {confirmingDuplicate && <div className="absolute inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
                <div className="rounded-card bg-surface p-4 shadow-card"><h3 id="duplicate-title" className="font-semibold">Possível duplicidade</h3>
                    <p className="mt-2 text-[13px]">Confira as correspondências indicadas. Deseja confirmar esta pendência mesmo assim?</p>
                    <div className="mt-4 flex gap-2"><Button onClick={() => setConfirmingDuplicate(false)}>Voltar</Button><Button onClick={() => { setConfirmingDuplicate(false); actions.confirm(); }}>Confirmar mesmo assim</Button></div>
                </div>
            </div>}
            {confirmingCancellation && (
                <div className="absolute inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
                    <div className="w-full max-w-sm rounded-card bg-surface p-4 shadow-card">
                        <h3 id="cancel-title" className="text-[15px] font-semibold">Confirmar cancelamento</h3>
                        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                            Você deseja realmente cancelar {item.kind === "meeting" ? "o evento" : "a tarefa"} <strong>{item.record.title}</strong>
                            {item.kind === "meeting" ? `, agendado para ${formatShortDay(item.record.starts_at)}, ${item.record.all_day ? "dia inteiro" : `às ${formatTime(item.record.starts_at)}`}` : ""}?
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setConfirmingCancellation(false)}>Voltar</Button>
                            <Button variant="primary" onClick={() => { setConfirmingCancellation(false); actions.confirmCancellation(); }}>Confirmar cancelamento</Button>
                        </div>
                    </div>
                </div>
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
                    {meeting.all_day ? "Dia inteiro" : `${formatTime(meeting.starts_at)} - ${formatTime(meetingEnd(meeting).toISOString())}`}
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
