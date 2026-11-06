"""Conservative event identity: ambiguity is a review result, not a deletion."""
from datetime import datetime
from difflib import SequenceMatcher
import re
from .mail_scan import normalized, scan_timezone


def people(values):
    return {email.casefold() for value in values for email in re.findall(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", str(value))}


def instant(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=scan_timezone())
    return parsed.timestamp()


def classify(candidate, remote):
    same_start = instant(candidate["starts_at"]) == instant(remote["starts_at"])
    same_end = candidate.get("end_inferred") or instant(candidate["ends_at"]) == instant(remote["ends_at"])
    same_title = normalized(candidate["title"]) == normalized(remote["title"])
    left, right = people(candidate.get("participants", [])), people(remote.get("participants", []))
    participants_conflict = bool(left and right and left != right)
    participants_unknown = bool(right and not left)
    verified_id = bool(candidate.get("provider_id") and candidate.get("provider_id") == remote.get("provider_id") and
                       candidate.get("provider_calendar_id", "primary") in {remote["calendar_id"], "primary" if remote.get("primary") else ""})
    verified_uid = bool(candidate.get("calendar_uid") and candidate["calendar_uid"] == remote.get("calendar_uid"))
    if remote.get("series_master"):
        return "possible" if verified_uid or (same_title and same_start) else "unrelated"
    # A recurring UID identifies a series, not an arbitrary occurrence.
    if verified_uid and remote.get("recurring"):
        previous = candidate.get("previous_start")
        verified_uid = same_start or bool(previous and instant(previous) == instant(remote.get("original_start") or remote["starts_at"]))
    identity = verified_id or verified_uid
    if identity:
        if same_start and same_end:
            return "possible" if participants_conflict else "exact"
        return "update"
    if same_title and same_start and same_end and not participants_conflict and not participants_unknown:
        return "exact"
    similar_title = SequenceMatcher(None, normalized(candidate["title"]), normalized(remote["title"])).ratio() >= .72
    nearby = abs(instant(candidate["starts_at"]) - instant(remote["starts_at"])) <= 86400
    previous = candidate.get("previous_start")
    if (previous and instant(previous) == instant(remote["starts_at"]) and same_title and left and left == right):
        return "update"
    if (same_start and (same_title or similar_title or bool(left & right))) or (nearby and same_title):
        return "possible"
    return "unrelated"


def resolve(candidate, events):
    ranked = [(classify(candidate, remote), remote) for remote in events]
    exact = [remote for verdict, remote in ranked if verdict == "exact"]
    updates = [remote for verdict, remote in ranked if verdict == "update"]
    possible = [remote for verdict, remote in ranked if verdict == "possible"]
    strong = [remote for remote in exact if (candidate.get("provider_id") and candidate.get("provider_id") == remote.get("provider_id")) or
              (candidate.get("calendar_uid") and candidate["calendar_uid"] == remote.get("calendar_uid"))]
    if len(strong) == 1:
        return {"state": "exact", "event": strong[0], "candidates": []}
    if len(exact) == 1 and not updates and not possible:
        return {"state": "exact", "event": exact[0], "candidates": []}
    if len(updates) == 1 and not exact and not possible:
        return {"state": "update", "event": updates[0], "candidates": []}
    candidates = exact + updates + possible
    return {"state": "possible" if candidates else "none", "event": None, "candidates": candidates}
