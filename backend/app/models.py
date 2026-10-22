from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MeetingConflict(BaseModel):
    id: str
    title: str
    certainty: Literal["confirmed", "possible"]


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
    link: str | None = None
    participants: list[str] = Field(default_factory=list)
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
