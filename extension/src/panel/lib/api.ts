import axios, { isAxiosError } from "axios";
import type {
    ChatResponse,
    Dashboard,
    Meeting,
    MeetingPatch,
    RecordStatus,
    SyncRange,
    SyncResult,
    Task,
    TaskPatch,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
    /\/+$/,
    "",
);

export class ApiError extends Error {
    readonly status: number | null;
    readonly offline: boolean;

    constructor(message: string, status: number | null = null, offline = false) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.offline = offline;
    }
}

function toApiError(error: unknown): ApiError {
    if (!isAxiosError(error)) return new ApiError("Algo inesperado aconteceu. Tente novamente.");
    if (!error.response) {
        if (error.code === "ECONNABORTED") {
            return new ApiError(
                "A API demorou demais para responder. Tente novamente em instantes.",
            );
        }
        return new ApiError(`Não foi possível acessar a API em ${API_URL}.`, null, true);
    }
    const detail: unknown = error.response.data?.detail;
    if (typeof detail === "string") return new ApiError(detail, error.response.status);
    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) =>
                item && typeof item === "object" && "msg" in item ? String(item.msg) : "",
            )
            .filter(Boolean);
        if (messages.length) return new ApiError(messages.join(" "), error.response.status);
    }
    return new ApiError("Não foi possível concluir esta ação.", error.response.status);
}

const http = axios.create({
    baseURL: API_URL,
    timeout: 20_000,
    headers: { "Content-Type": "application/json" },
});

http.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toApiError(error)),
);

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

export const api = {
    dashboard: () => http.get<Dashboard>("/api/dashboard").then((r) => r.data),

    events: () => http.get<{ events: Meeting[] }>("/api/events").then((r) => r.data.events),

    setMeetingStatus: (id: string, status: Extract<RecordStatus, "confirmed" | "cancelled">) =>
        http
            .patch<{
                id: string;
                status: RecordStatus;
                calendar_synced?: boolean;
            }>(path("/api/events", id), { status })
            .then((r) => r.data),

    setTaskStatus: (
        id: string,
        status: Extract<RecordStatus, "confirmed" | "cancelled" | "done">,
    ) =>
        http
            .patch<{ id: string; status: RecordStatus }>(path("/api/tasks", id), { status })
            .then((r) => r.data),

    editMeeting: (id: string, patch: MeetingPatch) =>
        http.patch(path("/api/events", id), patch).then((r) => r.data),

    editTask: (id: string, patch: TaskPatch) =>
        http.patch(path("/api/tasks", id), patch).then((r) => r.data),

    addMeeting: (meeting: Meeting) => http.post("/api/events", meeting).then((r) => r.data),

    addTask: (task: Task) => http.post("/api/tasks", task).then((r) => r.data),

    chat: (message: string) =>
        http.post<ChatResponse>("/api/chat", { message }, { timeout: 90_000 }).then((r) => r.data),

    // Each thread goes through Gemini, so a scan can take minutes.
    syncEmails: (range: SyncRange) =>
        http
            .post<{ result: SyncResult }>("/api/integrations/google/sync", range, { timeout: 0 })
            .then((r) => r.data.result),

    googleAuthUrl: `${API_URL}/api/integrations/google/auth`,
};
