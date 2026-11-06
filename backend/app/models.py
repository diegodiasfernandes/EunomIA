from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MeetingConflict(BaseModel):
    id: str
    title: str
    certainty: Literal["confirmed", "possible"]
    overlap_minutes: int | None = None
    status: str = "pending"


class MeetingRecord(BaseModel):
    id: str
    title: str
    description: str = ""
    starts_at: datetime
    ends_at: datetime | None = None
    duration_minutes: int | None = None
    status: str
    source: str
    location: str | None = None
    sender: str = ""
    pending_action: Literal["update", "cancel"] | None = None
    previous_status: str | None = None
    link: str | None = None
    participants: list[str] = Field(default_factory=list)
    calendar_synced: bool = False
    all_day: bool = False
    possible_duplicate: bool = False
    duplicate_candidates: list[dict] = Field(default_factory=list)
    review_only: bool = False
    inferred_fields: list[str] = Field(default_factory=list)
    conflict: bool = False
    conflicts_with: list[MeetingConflict] = Field(default_factory=list)


class TaskDeadlineRecord(BaseModel):
    id: str
    title: str
    description: str = ""
    responsible: str | None = None
    due_at: datetime | None = None
    deadline_reference: str | None = None
    status: str
    source: str
    event_id: str | None = None
    inferred_fields: list[str] = Field(default_factory=list)
    sender: str = ""
    pending_action: Literal["update", "cancel"] | None = None
    previous_status: str | None = None
