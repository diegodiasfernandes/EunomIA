"""Read-only Calendar projection. Never imports remote events into local approvals."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .db import connect
from .google_integration import google_credentials

CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
TZ = ZoneInfo("America/Sao_Paulo")


class AgendaAuthorizationError(ValueError):
    pass


def _commemorative_calendar(calendar: dict) -> bool:
    # Use Google's special calendar identifiers, not user-editable names.
    calendar_id = calendar["id"].casefold()
    return (
        calendar_id.endswith("#holiday@group.v.calendar.google.com")
        or calendar_id.endswith("@holiday.calendar.google.com")
        or calendar_id == "addressbook#contacts@group.v.calendar.google.com"
    )


def _pages(resource, **params):
    token = None
    while True:
        page = resource.list(**params, **({"pageToken": token} if token else {})).execute()
        yield from page.get("items", [])
        token = page.get("nextPageToken")
        if not token:
            break


def list_agenda(start_day: date | None = None) -> dict:
    today = datetime.now(TZ).date()
    start_day = max(start_day or today, today)
    end_day = start_day + timedelta(days=90)
    credentials = google_credentials()
    if credentials is None:
        raise AgendaAuthorizationError("Conecte sua conta Google para consultar a agenda.")
    if not credentials.has_scopes([CALENDAR_LIST_SCOPE]):
        raise AgendaAuthorizationError(
            "Reconecte sua conta Google para autorizar a leitura da lista de calendários."
        )
    service = build("calendar", "v3", credentials=credentials)
    with connect() as connection:
        links = {
            (dict(row).get("provider_calendar_id", "primary"), row["provider_id"]): dict(row)
            for row in connection.execute(
                "SELECT id, provider_id, status, previous_status, source, provider_calendar_id FROM events "
                "WHERE user_id = 'demo' AND provider_id IS NOT NULL"
            ).fetchall()
        }
    events = {}
    warnings = []
    lower = datetime.combine(start_day, time.min, TZ)
    upper = datetime.combine(end_day, time.min, TZ)
    for calendar in _pages(service.calendarList(), minAccessRole="reader", showDeleted=False):
        if _commemorative_calendar(calendar):
            continue
        calendar_id = calendar["id"]
        try:
            for event in _pages(
                service.events(), calendarId=calendar_id,
                timeMin=lower.isoformat(), timeMax=upper.isoformat(),
                singleEvents=True, orderBy="startTime", showDeleted=False, maxResults=2500,
            ):
                if event.get("eventType") == "birthday":
                    continue
                if event.get("status", "confirmed") != "confirmed" or any(
                    person.get("self") and person.get("responseStatus") == "declined"
                    for person in event.get("attendees", [])
                ):
                    continue
                start = event.get("start", {})
                end = event.get("end", {})
                all_day = "date" in start
                starts_at = start.get("date") if all_day else start.get("dateTime")
                ends_at = end.get("date") if all_day else end.get("dateTime")
                if not starts_at or not ends_at:
                    continue
                start_dt = (datetime.combine(date.fromisoformat(starts_at), time.min, TZ)
                            if all_day else datetime.fromisoformat(starts_at))
                end_dt = (datetime.combine(date.fromisoformat(ends_at), time.min, TZ)
                          if all_day else datetime.fromisoformat(ends_at))
                if end_dt <= lower or start_dt >= upper:
                    continue
                linked = links.get((calendar_id, event["id"])) or links.get((calendar_id, event.get("recurringEventId")))
                if linked is None and calendar.get("primary"):
                    linked = links.get(("primary", event["id"])) or links.get(("primary", event.get("recurringEventId")))
                if linked and (linked["status"] in {"cancelled", "rejected"} or
                               (linked["status"] != "confirmed" and linked["previous_status"] != "confirmed")):
                    continue
                # IDs are unique within a calendar, not across calendars.
                key = f"{calendar_id}:{event['id']}"
                events[key] = {
                    "id": key, "google_event_id": event["id"],
                    "local_id": linked["id"] if linked else None,
                    "origin": "eunomia" if linked and linked.get("source") != "calendar" else "google",
                    "title": event.get("summary") or "Sem título",
                    "description": event.get("description", ""),
                    "starts_at": starts_at, "ends_at": ends_at, "all_day": all_day,
                    "duration_minutes": int((end_dt - start_dt).total_seconds() / 60),
                    "location": event.get("location", ""),
                    "calendar_id": calendar_id,
                    "calendar_name": calendar.get("summaryOverride") or calendar.get("summary", calendar_id),
                    "time_zone": calendar.get("timeZone", "America/Sao_Paulo"),
                    "url": event.get("htmlLink"),
                    "sort_at": start_dt.timestamp(),
                }
        except HttpError as error:
            if error.resp.status not in {403, 404}:
                raise
            warnings.append(f"Não foi possível consultar o calendário {calendar.get('summary', calendar_id)}.")
    ordered = sorted(events.values(), key=lambda item: (item["sort_at"], item["id"]))
    for event in ordered:
        del event["sort_at"]
    return {"events": ordered, "from_date": start_day.isoformat(),
            "next_from": end_day.isoformat(), "warnings": warnings}
