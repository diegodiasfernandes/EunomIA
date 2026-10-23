from datetime import datetime, timedelta

from ..models import MeetingConflict, MeetingRecord


DEFAULT_UNKNOWN_MEETING_DURATION_MINUTES = 60


def identify_conflicts(meetings: list[MeetingRecord]) -> list[MeetingRecord]:
    active = [
        meeting
        for meeting in meetings
        if meeting.status not in {"cancelled", "rejected"}
    ]
    intervals: dict[str, tuple[datetime, datetime, bool]] = {}
    conflicts: dict[str, list[MeetingConflict]] = {
        meeting.id: [] for meeting in active
    }

    for meeting in active:
        start = meeting.starts_at
        if start.tzinfo is None:
            start = start.astimezone()

        duration_known = meeting.ends_at is not None or meeting.duration_minutes is not None
        if meeting.ends_at is not None:
            end = meeting.ends_at
            if end.tzinfo is None:
                end = end.astimezone()
        else:
            duration = (
                meeting.duration_minutes
                if meeting.duration_minutes is not None
                else DEFAULT_UNKNOWN_MEETING_DURATION_MINUTES
            )
            if duration <= 0:
                raise ValueError("A duração de uma reunião deve ser positiva.")
            end = start + timedelta(minutes=duration)
        if end <= start:
            raise ValueError("O fim da reunião deve ser posterior ao início.")

        intervals[meeting.id] = (start, end, duration_known)

    for index, first in enumerate(active):
        first_start, first_end, first_duration_known = intervals[first.id]
        for second in active[index + 1 :]:
            second_start, second_end, second_duration_known = intervals[second.id]
            if first_start < second_end and second_start < first_end:
                certainty = (
                    "confirmed"
                    if first_duration_known and second_duration_known
                    else "possible"
                )
                conflicts[first.id].append(
                    MeetingConflict(
                        id=second.id,
                        title=second.title,
                        certainty=certainty,
                    )
                )
                conflicts[second.id].append(
                    MeetingConflict(
                        id=first.id,
                        title=first.title,
                        certainty=certainty,
                    )
                )

    for meeting in meetings:
        meeting.conflicts_with = conflicts.get(meeting.id, [])
        meeting.conflict = bool(meeting.conflicts_with)
    return meetings