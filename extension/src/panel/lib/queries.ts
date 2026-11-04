import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "./api";
import { isOpenStatus, itemDate, meetingEnd } from "./format";
import type { ApprovalItem, MeetingPatch, SyncRange, TaskPatch } from "./types";

export const queryKeys = {
    dashboard: ["dashboard"] as const,
    events: ["events"] as const,
};

const POLL_MS = 60_000;

export function useDashboard(refetchInterval = POLL_MS) {
    return useQuery({ queryKey: queryKeys.dashboard, queryFn: api.dashboard, refetchInterval });
}

export function useEvents() {
    return useQuery({ queryKey: queryKeys.events, queryFn: api.events, refetchInterval: POLL_MS });
}

function useRefreshAll() {
    const client = useQueryClient();
    return () =>
        Promise.all([
            client.invalidateQueries({ queryKey: queryKeys.dashboard }),
            client.invalidateQueries({ queryKey: queryKeys.events }),
        ]);
}

const byDateAsc = (a: string | null, b: string | null) => {
    if (!a) return b ? 1 : 0;
    if (!b) return -1;
    return new Date(a).getTime() - new Date(b).getTime();
};

export function useWorkspace() {
    const dashboard = useDashboard();
    const events = useEvents();

    const derived = useMemo(() => {
        const meetings = events.data ?? [];
        const tasks = dashboard.data?.tasks ?? [];
        const now = Date.now();

        const approvals: ApprovalItem[] = [
            ...meetings
                .filter((m) => isOpenStatus(m.status))
                .map((record) => ({ kind: "meeting" as const, record })),
            ...tasks
                .filter((t) => isOpenStatus(t.status))
                .map((record) => ({ kind: "deadline" as const, record })),
        ].sort((a, b) => byDateAsc(itemDate(a), itemDate(b)));

        const active = meetings.filter((m) => m.status !== "cancelled" && m.status !== "rejected");
        const upcoming = active
            .filter((m) => meetingEnd(m).getTime() >= now)
            .sort((a, b) => byDateAsc(a.starts_at, b.starts_at));
        const conflicts = active.filter((m) => m.conflict);
        const history = meetings
            .filter(
                (m) =>
                    !isOpenStatus(m.status) &&
                    (m.status !== "confirmed" || m.calendar_synced),
            )
            .sort((a, b) => byDateAsc(b.starts_at, a.starts_at));

        return { approvals, upcoming, conflicts, history };
    }, [dashboard.data, events.data]);

    return {
        google: dashboard.data?.google,
        meetings: events.data ?? [],
        ...derived,
        isLoading: dashboard.isPending || events.isPending,
        isFetching: dashboard.isFetching || events.isFetching,
        hasData: dashboard.data !== undefined && events.data !== undefined,
        error: dashboard.error ?? events.error,
        refetch: () => Promise.all([dashboard.refetch(), events.refetch()]),
    };
}

export function useSetStatus(
    onSuccess: (googleSynced: boolean, status: "confirmed" | "cancelled") => void,
) {
    const refresh = useRefreshAll();
    return useMutation({
        mutationFn: async ({
            item,
            status,
        }: {
            item: ApprovalItem;
            status: "confirmed" | "cancelled";
        }) => {
            if (item.kind === "meeting") {
                const result = await api.setMeetingStatus(item.record.id, status);
                return Boolean(result.calendar_synced);
            }
            const result = await api.setTaskStatus(item.record.id, status);
            return Boolean(result.google_tasks_synced);
        },
        onSuccess: (googleSynced, { status }) => onSuccess(googleSynced, status),
        onSettled: refresh,
    });
}

export function useEditItem() {
    const refresh = useRefreshAll();
    return useMutation({
        mutationFn: (
            input:
                | { kind: "meeting"; id: string; patch: MeetingPatch }
                | { kind: "deadline"; id: string; patch: TaskPatch },
        ) =>
            input.kind === "meeting"
                ? api.editMeeting(input.id, input.patch)
                : api.editTask(input.id, input.patch),
        onSuccess: refresh,
    });
}

export function useAddDraft() {
    const refresh = useRefreshAll();
    return useMutation({
        mutationFn: (item: ApprovalItem) =>
            item.kind === "meeting" ? api.addMeeting(item.record) : api.addTask(item.record),
        onSuccess: refresh,
    });
}

export function useSyncEmails() {
    const refresh = useRefreshAll();
    return useMutation({
        mutationKey: ["sync-emails"],
        mutationFn: (range: SyncRange) => api.syncEmails(range),
        onSuccess: refresh,
    });
}

export function useChat() {
    return useMutation({ mutationFn: (message: string) => api.chat(message) });
}
