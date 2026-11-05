import { ArrowsClockwiseIcon, CalendarBlankIcon, GoogleLogoIcon } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { dayLabel, formatDuration, formatTime } from "../lib/format";
import { api } from "../lib/api";
import type { CalendarEvent, GoogleStatus } from "../lib/types";
import { Button, IconButton, Pill, Skeleton } from "./ui";

function eventDate(event: CalendarEvent) {
    // Date-only Calendar values are local civil dates, never UTC timestamps.
    return new Date(event.all_day ? `${event.starts_at}T00:00:00` : event.starts_at);
}

function dateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function allDayRange(event: CalendarEvent) {
    const last = new Date(`${event.ends_at}T00:00:00`);
    last.setDate(last.getDate() - 1);
    const first = eventDate(event).toLocaleDateString("pt-BR");
    return `${first} – ${last.toLocaleDateString("pt-BR")} · Dia inteiro`;
}

export function groupCalendarEvents(events: CalendarEvent[]) {
    const today = dateKey(new Date());
    const groups = new Map<string, CalendarEvent[]>();
    const unique = [...new Map(events.map((event) => [event.id, event])).values()];
    unique.sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime() || a.id.localeCompare(b.id));
    for (const event of unique) {
        const key = dateKey(eventDate(event));
        const visibleDay = key < today ? today : key;
        const items = groups.get(visibleDay) ?? [];
        items.push(event);
        groups.set(visibleDay, items);
    }
    return [...groups.entries()];
}

function CalendarRow({ event }: { event: CalendarEvent }) {
    return (
        <details className="group px-3.5 py-3">
            <summary className="flex cursor-pointer list-none items-start gap-3 rounded-sm [&::-webkit-details-marker]:hidden">
                <span className="w-14 shrink-0 tabular-nums">
                    <span className="block text-[13px] font-semibold">
                        {event.all_day ? "Dia inteiro" : formatTime(event.starts_at)}
                    </span>
                    {!event.all_day && <span className="text-[11.5px] text-ink-3">{formatDuration(event.duration_minutes)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium group-open:whitespace-normal">{event.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{event.location || "Sem local definido"}</span>
                    <span className="block truncate text-[11px] text-ink-3">{event.calendar_name}</span>
                </span>
                <Pill tone={event.origin === "eunomia" ? "ok" : "muted"}>
                    {event.origin === "eunomia" ? "Confirmado" : "Google"}
                </Pill>
            </summary>
            <div className="mt-3 space-y-2 border-t border-line pt-3 text-[12px] text-ink-2">
                {event.description && <p className="whitespace-pre-wrap break-words">{event.description}</p>}
                <p>{event.all_day ? allDayRange(event) : `${new Date(event.starts_at).toLocaleDateString("pt-BR")}, ${formatTime(event.starts_at)} – ${new Date(event.ends_at).toLocaleDateString("pt-BR")}, ${formatTime(event.ends_at)}`} · {event.calendar_name}</p>
                {event.url?.startsWith("https://") && <a className="text-accent-ink underline" href={event.url} target="_blank" rel="noopener noreferrer">Abrir no Google Agenda</a>}
            </div>
        </details>
    );
}

export function CalendarAgenda({ google, connecting, onConnect }: {
    google: GoogleStatus | undefined;
    connecting: boolean;
    onConnect: () => void;
}) {
    const ready = Boolean(google?.connected && google.agenda_connected);
    const agenda = useInfiniteQuery({
        queryKey: ["calendar-agenda", google?.email],
        queryFn: ({ pageParam }) => api.agenda(pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (page) => page.next_from,
        enabled: ready,
        retry: false,
        staleTime: 30_000,
    });
    const pages = agenda.data?.pages ?? [];
    const groups = groupCalendarEvents(pages.flatMap((page) => page.events));
    const warnings = [...new Set(pages.flatMap((page) => page.warnings))];

    return (
        <div className="p-3">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold"><CalendarBlankIcon size={20} />Agenda</h2>
                {ready && <IconButton label="Atualizar agenda" disabled={agenda.isFetching} onClick={() => void agenda.refetch()}>
                    <ArrowsClockwiseIcon size={18} className={agenda.isFetching ? "animate-spin" : ""} />
                </IconButton>}
            </div>
            {!ready ? (
                <div className="space-y-3 px-2 py-5">
                    <p className="text-[13px] text-ink-3">{google?.connected ? "Reconecte sua conta Google para permitir a consulta dos seus calendários." : "Conecte sua conta Google para consultar seus compromissos reais."}</p>
                    <Button onClick={onConnect} disabled={connecting}><GoogleLogoIcon size={16} />{connecting ? "Aguardando autorização…" : "Conectar Google"}</Button>
                </div>
            ) : (
                <>
                    {agenda.error && <div role="alert" className="mb-3 space-y-2 rounded-control bg-danger-soft p-3 text-[13px] text-danger">
                        <p>{agenda.error.message}</p>
                        <p>Os dados já carregados foram mantidos.</p>
                        <Button onClick={() => void agenda.refetch()} disabled={agenda.isFetching}>Tentar novamente</Button>
                        <Button onClick={onConnect} disabled={connecting}>Reconectar Google</Button>
                    </div>}
                    {warnings.map((warning) => <p role="status" key={warning} className="mb-3 rounded-control bg-warn-soft p-3 text-[12px] text-warn">{warning}</p>)}
                    {agenda.isPending ? <div aria-label="Carregando agenda" className="space-y-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-20 w-full" />)}</div> : (
                        <div className="space-y-4">
                            {groups.map(([day, events]) => <section key={day}>
                                <h3 className="mb-2 text-[12.5px] font-semibold text-ink-2">{dayLabel(`${day}T00:00:00`)} — {day.slice(8)}/{day.slice(5, 7)}</h3>
                                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">{events.map((event) => <CalendarRow key={event.id} event={event} />)}</div>
                            </section>)}
                            {!groups.length && !agenda.error && <p className="px-2 py-5 text-[13px] text-ink-3">Nenhum compromisso nos períodos consultados.</p>}
                            {pages.length > 0 && <div className="space-y-2 pb-2">
                                <p className="text-[11px] text-ink-3">Cada carregamento consulta mais 90 dias da sua agenda.</p>
                                <Button onClick={() => void agenda.fetchNextPage()} disabled={agenda.isFetching}>{agenda.isFetchingNextPage ? "Carregando…" : "Ver próximos 90 dias"}</Button>
                            </div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
