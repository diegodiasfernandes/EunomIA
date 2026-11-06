import type { ApprovalItem, Meeting, RecordSource, RecordStatus } from "./types";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const shortDayFormat = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
});
const longDayFormat = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
});

const DEFAULT_MEETING_MINUTES = 60;

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

export const formatShortDay = (iso: string) =>
    shortDayFormat.format(new Date(iso)).replace(/\./g, "");

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dayLabel(iso: string) {
    const diff = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff === -1) return "Ontem";
    const label = longDayFormat.format(new Date(iso));
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dayKey(iso: string) {
    const date = new Date(iso);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function meetingEnd(meeting: Meeting) {
    if (meeting.ends_at) return new Date(meeting.ends_at);
    const minutes = meeting.duration_minutes ?? DEFAULT_MEETING_MINUTES;
    return new Date(new Date(meeting.starts_at).getTime() + minutes * 60_000);
}

export function meetingMinutes(meeting: Meeting) {
    return Math.round(
        (meetingEnd(meeting).getTime() - new Date(meeting.starts_at).getTime()) / 60_000,
    );
}

export function formatDuration(minutes: number) {
    if (!Number.isFinite(minutes) || minutes <= 0) return "";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest} min`;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDue(iso: string) {
    return `${formatShortDay(iso)}, ${formatTime(iso)}`;
}

export interface Person {
    name: string;
    email: string;
}

export function parseSenders(raw: string): Person[] {
    const people: Person[] = [];
    const pattern = /"?([^"<,]*?)"?\s*<([^>]+)>|([^\s,<>"]+@[^\s,<>"]+)/g;
    for (const match of raw.matchAll(pattern)) {
        const email = (match[2] ?? match[3] ?? "").trim();
        const name = (match[1] ?? "").trim() || email.split("@")[0];
        if (email && !people.some((person) => person.email === email)) people.push({ name, email });
    }
    return people;
}

export function initials(name: string) {
    const parts = name
        .replace(/[^\p{L}\s]/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0][0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? "");
    return (first + last).toUpperCase();
}

// The API prepends "Remetente(s): ..." to descriptions; senders are rendered separately.
export function cleanDescription(description: string) {
    return description.replace(/^Remetente\(s\):[^\n]*\n*/, "").trim();
}

export const isOpenStatus = (status: RecordStatus) => status === "pending" || status === "detected";

export const STATUS_LABEL: Record<RecordStatus, string> = {
    expired: "Encerrado",
    dismissed: "Já registrado",
    pending: "Aguardando aprovação",
    detected: "Aguardando aprovação",
    confirmed: "Confirmado",
    cancelled: "Descartado",
    rejected: "Ignorado",
    done: "Concluído",
};

export function sourceLabel(source: RecordSource) {
    if (source === "email") return "E-mail";
    if (source === "manual") return "Conversa";
    if (source === "calendar") return "Google Calendar";
    return "Importado";
}

export function itemDate(item: ApprovalItem) {
    return item.kind === "meeting" ? item.record.starts_at : item.record.due_at;
}

export function toDateInput(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

export function toDateTimeInput(iso: string | null) {
    if (!iso) return "";
    const date = new Date(iso);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

export const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
