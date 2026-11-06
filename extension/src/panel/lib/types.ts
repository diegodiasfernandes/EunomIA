export type RecordStatus = "pending" | "detected" | "confirmed" | "cancelled" | "rejected" | "done" | "expired" | "dismissed";

export type RecordSource = "email" | "manual" | (string & {});

export interface MeetingConflict {
    id: string;
    title: string;
    certainty: "confirmed" | "possible";
    overlap_minutes: number | null;
    status: string;
}

export interface Meeting {
    id: string;
    title: string;
    description: string;
    starts_at: string;
    ends_at: string | null;
    duration_minutes: number | null;
    status: RecordStatus;
    source: RecordSource;
    location: string | null;
    sender: string;
    pending_action: "update" | "cancel" | null;
    previous_status: RecordStatus | null;
    link: string | null;
    participants: string[];
    calendar_synced: boolean;
    all_day?: boolean;
    possible_duplicate?: boolean;
    review_only?: boolean;
    duplicate_candidates?: { title: string; starts_at: string; ends_at: string; url?: string | null }[];
    inferred_fields: string[];
    conflict: boolean;
    conflicts_with: MeetingConflict[];
}

export interface Task {
    id: string;
    title: string;
    description: string;
    responsible: string | null;
    due_at: string | null;
    deadline_reference: string | null;
    inferred_fields: string[];
    sender: string;
    status: RecordStatus;
    source: RecordSource;
    pending_action: "update" | "cancel" | null;
    previous_status: RecordStatus | null;
}

export interface TaskHistory extends Task {
    google_tasks_synced: boolean;
}

export interface GoogleStatus {
    connected: boolean;
    email: string | null;
    calendar_connected: boolean;
    tasks_connected: boolean;
    agenda_connected?: boolean;
    name?: string | null;
    connection_id?: string;
}

export interface CalendarEvent {
    id: string;
    google_event_id: string;
    local_id: string | null;
    origin: "google" | "eunomia";
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    duration_minutes: number;
    location: string;
    calendar_id: string;
    calendar_name: string;
    time_zone: string;
    url: string | null;
}

export interface AgendaPage {
    events: CalendarEvent[];
    from_date: string;
    next_from: string;
    warnings: string[];
}

export interface Dashboard {
    tasks: Task[];
    google: GoogleStatus;
}

export type ApprovalItem =
    | { kind: "meeting"; record: Meeting }
    | { kind: "deadline"; record: Task };

export type ChatResponse =
    | { reply: string; action: null }
    | {
          reply: string;
          action: "record_confirmation_required";
          record_type: "meeting";
          record: Meeting;
      }
    | {
          reply: string;
          action: "record_confirmation_required";
          record_type: "deadline";
          record: Task;
      };

export interface SyncRange {
    email_since: string;
    email_until: string;
}

export interface SyncResult {
    emails: number;
    threads?: number;
    diagnostics?: { scan_id: string; counts: Record<string, number> };
    email_threads_with_events: number;
    pending_items: number;
}

export interface MeetingPatch {
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    location: string;
}

export interface TaskPatch {
    title: string;
    description: string;
    due_at: string | null;
    responsible: string | null;
    deadline_reference: string | null;
}
