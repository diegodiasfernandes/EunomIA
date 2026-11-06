import {
    ArrowRightIcon,
    CalendarCheckIcon,
    CheckCircleIcon,
    EnvelopeSimpleIcon,
    GoogleLogoIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import { plural } from "../lib/format";
import type { ApprovalItem, GoogleStatus, Meeting, SyncResult } from "../lib/types";
import { MeetingRow } from "./Agenda";
import { Button, SectionTitle, Skeleton } from "./ui";

function ConnectCard({
    google,
    onConnect,
    connecting,
}: {
    google: GoogleStatus | undefined;
    onConnect: () => void;
    connecting: boolean;
}) {
    if (!google || (google.calendar_connected && google.tasks_connected)) return null;
    const reauthorize = google.connected;
    const missingTasks = google.calendar_connected && !google.tasks_connected;

    return (
        <section className="rounded-card border border-accent/25 bg-accent-soft p-4">
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface text-accent">
                    <GoogleLogoIcon size={19} weight="bold" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-[14px] font-semibold text-ink">
                        {missingTasks
                            ? "Autorize o Google Tasks"
                            : reauthorize
                              ? "Autorize o Google Calendar e Tasks"
                              : "Conecte sua conta Google"}
                    </h2>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                        {missingTasks
                            ? "Sua conta já tem acesso ao Calendar. Autorize o Google Tasks para criar as tarefas aprovadas."
                            : reauthorize
                              ? "Autorize o acesso ao Calendar e ao Tasks para criar as reuniões e tarefas aprovadas."
                              : "A EunomIA lê seus e-mails para encontrar reuniões e prazos e cria no Google só o que você aprovar."}
                    </p>
                </div>
            </div>
            <Button
                variant="primary"
                className="mt-3 w-full"
                onClick={onConnect}
                disabled={connecting}
            >
                {connecting
                    ? "Aguardando autorização..."
                    : reauthorize
                      ? missingTasks
                          ? "Autorizar Google Tasks"
                          : "Autorizar Calendar e Tasks"
                      : "Conectar Google"}
            </Button>
        </section>
    );
}

function AttentionCard({
    approvals,
    conflicts,
    onReview,
    onConflicts,
}: {
    approvals: ApprovalItem[];
    conflicts: Meeting[];
    onReview: () => void;
    onConflicts: () => void;
}) {
    const meetings = approvals.filter((item) => item.kind === "meeting").length;
    const deadlines = approvals.length - meetings;
    const breakdown = [
        meetings && plural(meetings, "reunião", "reuniões"),
        deadlines && plural(deadlines, "prazo", "prazos"),
    ]
        .filter(Boolean)
        .join(" e ");

    return (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {approvals.length ? (
                <button
                    type="button"
                    onClick={onReview}
                    className="group flex w-full items-end justify-between gap-4 p-4 text-left transition-colors hover:bg-sunken/50"
                >
                    <span>
                        <span className="block text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                            {approvals.length}
                        </span>
                        <span className="mt-2 block text-[14px] font-medium text-ink">
                            {approvals.length === 1
                                ? "item aguardando sua aprovação"
                                : "itens aguardando sua aprovação"}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-ink-3">{breakdown}</span>
                    </span>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-[13px] font-medium text-on-accent transition-transform group-active:translate-y-px">
                        Revisar
                        <ArrowRightIcon
                            size={15}
                            weight="bold"
                            className="transition-transform group-hover:translate-x-0.5"
                        />
                    </span>
                </button>
            ) : (
                <div className="flex items-center gap-3 p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-card bg-ok-soft text-ok">
                        <CheckCircleIcon size={22} weight="fill" />
                    </span>
                    <span>
                        <span className="block text-[14px] font-semibold">Tudo revisado</span>
                        <span className="block text-[12.5px] text-ink-3">
                            Nenhuma reunião ou prazo esperando por você.
                        </span>
                    </span>
                </div>
            )}
            {conflicts.length > 0 && (
                <button
                    type="button"
                    onClick={onConflicts}
                    className="flex w-full items-center gap-2 border-t border-line bg-warn-soft/70 px-4 py-2.5 text-left text-[12.5px] font-medium text-warn transition-colors hover:bg-warn-soft"
                >
                    <WarningIcon size={16} weight="bold" />
                    <span className="flex-1">
                        {plural(
                            conflicts.length,
                            "reunião com conflito de horário",
                            "reuniões com conflito de horário",
                        )}
                    </span>
                    <ArrowRightIcon size={14} weight="bold" />
                </button>
            )}
        </section>
    );
}

export function scanSummary(result: SyncResult) {
    const counts = result.diagnostics?.counts;
    if (!counts) return `Última varredura: ${plural(result.emails, "e-mail analisado", "e-mails analisados")}, ${plural(result.email_threads_with_events, "item encontrado", "itens encontrados")}.`;
    return `${plural(result.emails, "e-mail", "e-mails")} em ${plural(result.threads ?? 0, "conversa", "conversas")}: ${plural(counts.identified_meetings ?? 0, "reunião", "reuniões")} e ${plural(counts.identified_tasks ?? 0, "tarefa", "tarefas")} identificadas; ${plural(result.pending_items, "nova pendência", "novas pendências")}.`;
}

function ScanCard({
    connected,
    syncing,
    lastSync,
    onScan,
}: {
    connected: boolean;
    syncing: boolean;
    lastSync: SyncResult | null;
    onScan: () => void;
}) {
    return (
        <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-sunken text-ink-2">
                    <EnvelopeSimpleIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[14px] font-semibold">Varrer e-mails</h2>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                        {syncing
                            ? "Lendo as mensagens e identificando compromissos. Pode levar alguns minutos."
                            : lastSync
                              ? scanSummary(lastSync)
                              : "A EunomIA procura reuniões e prazos nos e-mails do período que você escolher."}
                    </p>
                </div>
            </div>
            {syncing ? (
                <div
                    className="relative mt-3 h-1 overflow-hidden rounded-full bg-sunken"
                    aria-hidden
                >
                    <span className="absolute inset-0 bg-linear-to-r from-transparent via-accent to-transparent motion-safe:animate-shimmer" />
                </div>
            ) : (
                <Button className="mt-3 w-full" onClick={onScan} disabled={!connected}>
                    Escolher período
                </Button>
            )}
        </section>
    );
}

export function OverviewView({
    google,
    approvals,
    conflicts,
    upcoming,
    loading,
    syncing,
    lastSync,
    connecting,
    onConnect,
    onScan,
    onReview,
    onConflicts,
    onAgenda,
    onOpenMeeting,
}: {
    google: GoogleStatus | undefined;
    approvals: ApprovalItem[];
    conflicts: Meeting[];
    upcoming: Meeting[];
    loading: boolean;
    syncing: boolean;
    lastSync: SyncResult | null;
    connecting: boolean;
    onConnect: () => void;
    onScan: () => void;
    onReview: () => void;
    onConflicts: () => void;
    onAgenda: () => void;
    onOpenMeeting: (meeting: Meeting) => void;
}) {
    if (loading) {
        return (
            <div className="space-y-3 p-3">
                <div className="space-y-3 rounded-card border border-line bg-surface p-4">
                    <Skeleton className="h-10 w-12" />
                    <Skeleton className="h-3.5 w-3/5" />
                    <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-28 w-full rounded-card" />
            </div>
        );
    }

    const next = upcoming.slice(0, 4);

    return (
        <div className="space-y-3 p-3">
            <ConnectCard google={google} onConnect={onConnect} connecting={connecting} />
            <AttentionCard
                approvals={approvals}
                conflicts={conflicts}
                onReview={onReview}
                onConflicts={onConflicts}
            />
            <ScanCard
                connected={Boolean(google?.connected)}
                syncing={syncing}
                lastSync={lastSync}
                onScan={onScan}
            />

            <section className="pt-2">
                <SectionTitle
                    aside={
                        upcoming.length > next.length ? (
                            <button
                                type="button"
                                onClick={onAgenda}
                                className="text-[12.5px] font-medium text-accent-ink hover:underline"
                            >
                                Ver agenda
                            </button>
                        ) : undefined
                    }
                >
                    Próximos compromissos
                </SectionTitle>
                {next.length ? (
                    <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
                        {next.map((meeting) => (
                            <MeetingRow
                                key={meeting.id}
                                meeting={meeting}
                                onOpen={() => onOpenMeeting(meeting)}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="flex items-center gap-2 rounded-card border border-dashed border-line-strong px-4 py-3.5 text-[12.5px] text-ink-3">
                        <CalendarCheckIcon size={16} />
                        Reuniões aprovadas pela EunomIA aparecem aqui.
                    </p>
                )}
            </section>
        </div>
    );
}
