"""Gmail context loading and deterministic scan matching rules."""

import base64
import hashlib
import json
import re
import unicodedata
from datetime import datetime, time, timedelta
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

from googleapiclient.discovery import build
from .scan_diagnostics import count, note

TZ = ZoneInfo("America/Sao_Paulo")


def scan_timezone():
    import os
    return ZoneInfo(os.getenv("USER_TIMEZONE", "America/Sao_Paulo"))


class TextHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag in {"p", "div", "br", "li", "tr", "blockquote"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1
        if tag in {"p", "div", "li", "tr", "blockquote"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def message_body(payload, gmail=None, message_id=None):
    plain, html, calendar = [], [], []

    def visit(part):
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data")
        if not data and body.get("attachmentId") and gmail and mime in {"text/plain", "text/html", "text/calendar"}:
            data = gmail.users().messages().attachments().get(
                userId="me", messageId=message_id, id=body["attachmentId"]
            ).execute().get("data")
        if data:
            raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")
            if mime == "text/plain":
                plain.append(raw)
            elif mime == "text/calendar":
                calendar.append(raw)
            elif mime == "text/html":
                parser = TextHTML()
                parser.feed(raw)
                html.append("".join(parser.parts))
        for child in part.get("parts", []):
            visit(child)

    visit(payload)
    bodies = list(plain)
    for rendered in html:
        if not normalized(rendered) or normalized(rendered) in normalized("\n".join(bodies)):
            continue
        bodies.append(rendered)
    return "\n".join(bodies + calendar).strip()


def load_threads(gmail, since, until):
    tz = scan_timezone()
    lower = int(datetime.combine(since, time.min, tz).timestamp())
    upper = int(datetime.combine(until + timedelta(days=1), time.min, tz).timestamp())
    ids = {}
    seen_messages = set()
    token = None
    while True:
        page = gmail.users().messages().list(
            userId="me", q=f"after:{lower - 1} before:{upper}", maxResults=500,
            **({"pageToken": token} if token else {}),
        ).execute()
        count("gmail_pages")
        for reference in page.get("messages", []):
            if reference["id"] in seen_messages:
                continue
            seen_messages.add(reference["id"])
            count("selected_messages")
            thread_id = reference.get("threadId")
            if not thread_id:
                thread_id = gmail.users().messages().get(userId="me", id=reference["id"], format="minimal").execute()["threadId"]
            ids[thread_id] = None
        token = page.get("nextPageToken")
        if not token:
            break
    threads = {}
    count("threads_found", len(ids))
    for thread_index, thread_id in enumerate(ids, 1):
        response = gmail.users().threads().get(userId="me", id=thread_id, format="full").execute()
        messages = []
        for item in response.get("messages", []):
            if set(item.get("labelIds", [])) & {"TRASH", "SPAM", "DRAFT"}:
                count("messages_filtered")
                note("gmail", "spam_trash_or_draft", thread=thread_index)
                continue
            payload = item.get("payload", {})
            headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
            messages.append({
                "id": item["id"], "thread_id": thread_id,
                "subject": headers.get("subject", "(sem assunto)"),
                "sender": headers.get("from", ""),
                "recipients": headers.get("to", ""), "cc": headers.get("cc", ""),
                "received_at": datetime.fromtimestamp(int(item["internalDate"]) / 1000, tz).isoformat(),
                "snippet": item.get("snippet", ""),
                "body": message_body(payload, gmail, item["id"]),
            })
        if messages:
            threads[thread_id] = sorted({m["id"]: m for m in messages}.values(), key=lambda m: (m["received_at"], m["id"]))
            count("threads_loaded")
            count("context_messages", len(threads[thread_id]))
            count("empty_bodies", sum(not message["body"] for message in threads[thread_id]))
            note("gmail", "thread_loaded", thread=thread_index, messages=len(threads[thread_id]))
    return threads


def normalized(value):
    value = unicodedata.normalize("NFKD", str(value or "")).casefold()
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value))


def meeting_times(extracted):
    day = datetime.strptime(str(extracted.get("date") or ""), "%Y-%m-%d").date()
    tz = scan_timezone()
    if extracted.get("all_day"):
        start = datetime.combine(day, time.min, tz)
        end = (datetime.combine(datetime.strptime(extracted["end_date"], "%Y-%m-%d").date(), time.min, tz)
               if extracted.get("end_date") else start + timedelta(days=1))
    else:
        hour = parse_clock(extracted.get("time"))
        if extracted.get("time_zone"):
            tz = ZoneInfo(extracted["time_zone"])
        start = datetime.combine(day, hour, tz)
        duration = int(extracted.get("duration_minutes") or 60)
        end = start + timedelta(minutes=max(duration, 15) if duration > 0 else 60)
    if end <= start:
        raise ValueError("Invalid meeting end")
    return start, end


def parse_clock(value):
    text = str(value or "").strip()
    for pattern in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(text, pattern).time()
        except ValueError:
            pass
    raise ValueError("Missing or invalid clock time")


def fingerprint(kind, title, start, end=None):
    def canonical(value):
        if not value:
            return ""
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if date.tzinfo:
            return str(int(date.timestamp()))
        return value
    return hashlib.sha256(json.dumps([kind, normalized(title), canonical(start), canonical(end)]).encode()).hexdigest()


class CalendarLookup:
    def __init__(self, credentials):
        self.credentials = credentials
        self.service = None
        self.calendars = None
        self.cache = {}

    def matching(self, title, start, end, calendar_uid=None, end_inferred=False,
                 participants=None, provider_id=None, provider_calendar_id="primary", previous_start=None):
        from .event_matching import resolve
        from .calendar_agenda import _commemorative_calendar, _pages
        if self.service is None:
            if not self.credentials.has_scopes(["https://www.googleapis.com/auth/calendar.events"]):
                raise LookupError("Reconecte o Google para verificar os eventos autorizados.")
            self.service = build("calendar", "v3", credentials=self.credentials)
        if self.calendars is None:
            if not self.credentials.has_scopes(["https://www.googleapis.com/auth/calendar.calendarlist.readonly"]):
                raise LookupError("Reconecte o Google para verificar todos os calendarios autorizados.")
            self.calendars = [c for c in _pages(self.service.calendarList(), minAccessRole="reader") if not _commemorative_calendar(c)]
        events = {}
        for calendar in self.calendars:
            calendar_id = calendar["id"]
            lower = datetime.fromisoformat(start).replace(hour=0, minute=0, second=0) - timedelta(days=1)
            upper = datetime.fromisoformat(end).replace(hour=0, minute=0, second=0) + timedelta(days=2)
            if previous_start:
                previous = datetime.fromisoformat(previous_start)
                lower = min(lower, previous - timedelta(days=1))
                upper = max(upper, previous + timedelta(days=2))
            params = {"calendarId": calendar_id, "singleEvents": True, "showDeleted": False, "maxResults": 2500,
                      "timeMin": lower.isoformat(), "timeMax": upper.isoformat()}
            queries = [params]
            if calendar_uid:
                queries.append({"calendarId": calendar_id, "iCalUID": calendar_uid, "singleEvents": False, "showDeleted": False, "maxResults": 2500})
            for params in queries:
                key = json.dumps(params, sort_keys=True)
                if key not in self.cache:
                    count("calendar_queries")
                    self.cache[key] = list(_pages(self.service.events(), **params))
                for event in self.cache[key]:
                    if event.get("status", "confirmed") != "confirmed" or event.get("eventType") == "birthday":
                        continue
                    if any(p.get("self") and p.get("responseStatus") == "declined" for p in event.get("attendees", [])):
                        continue
                    all_day = "date" in event.get("start", {})
                    first = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
                    last = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date")
                    if not first or not last:
                        continue
                    if all_day:
                        first = datetime.fromisoformat(first).replace(tzinfo=scan_timezone()).isoformat()
                        last = datetime.fromisoformat(last).replace(tzinfo=scan_timezone()).isoformat()
                    event_id = event.get("id") or hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
                    events[(calendar_id, event_id)] = {
                        "provider_id": event_id, "calendar_id": calendar_id, "primary": bool(calendar.get("primary")),
                        "title": event.get("summary", ""), "starts_at": first, "ends_at": last,
                        "all_day": all_day, "description": event.get("description", ""), "location": event.get("location", ""),
                        "participants": [p.get("email", "") for p in event.get("attendees", [])],
                        "calendar_uid": event.get("iCalUID"), "recurring": bool(event.get("recurrence") or event.get("recurringEventId")),
                        "series_master": bool(event.get("recurrence")),
                        "original_start": event.get("originalStartTime", {}).get("dateTime"),
                        "url": event.get("htmlLink"),
                    }
        count("calendar_candidates", len(events))
        self.result = resolve({"title": title, "starts_at": start, "ends_at": end, "calendar_uid": calendar_uid,
                               "end_inferred": end_inferred, "participants": participants or [], "provider_id": provider_id,
                               "provider_calendar_id": provider_calendar_id, "previous_start": previous_start}, list(events.values()))
        count("calendar_" + self.result["state"])
        note("matching", self.result["state"])
        return self.result["state"] == "exact"
