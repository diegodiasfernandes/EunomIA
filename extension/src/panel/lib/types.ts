export type RecordStatus = "pending" | "detected" | "confirmed" | "cancelled" | "rejected" | "done";

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
    link: string | null;
    participants: string[];
    calendar_synced: boolean;
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
}

export interface GoogleStatus {
    connected: boolean;
    email: string | null;
    calendar_connected: boolean;
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
