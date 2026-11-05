"""Single active workspace, with retained per-account archives."""

from contextvars import ContextVar
from functools import wraps
from hashlib import sha256
from threading import RLock

from fastapi import HTTPException

from .db import connect

account_lock = RLock()
expected_connection = ContextVar("expected_connection", default=None)


def account_operation(function):
    @wraps(function)
    def guarded(*args, **kwargs):
        # Keep account changes and requests using the active workspace serialized.
        with account_lock:
            expected = expected_connection.get()
            if expected is not None:
                with connect() as connection:
                    row = connection.execute(
                        "SELECT connection_id FROM integrations WHERE name='google'"
                    ).fetchone()
                actual = row["connection_id"] if row else "offline"
                if expected != (actual or "legacy"):
                    raise HTTPException(status_code=409, detail="A conta conectada mudou. Atualize o painel antes de continuar.")
            return function(*args, **kwargs)
    return guarded


def archive_id(email: str) -> str:
    return "google-" + sha256(email.strip().casefold().encode()).hexdigest()


def move_workspace(connection, source: str, target: str):
    # Emails have a legacy globally unique provider_id; namespace inactive IDs.
    if source == "demo":
        connection.execute(
            "UPDATE emails SET provider_id = ? || provider_id WHERE user_id=? AND provider_id IS NOT NULL",
            (target + ":", source),
        )
    else:
        connection.execute(
            "UPDATE emails SET provider_id = substr(provider_id, ?) WHERE user_id=? AND provider_id LIKE ?",
            (len(source) + 2, source, source + ":%"),
        )
    for table in ("events", "tasks", "emails", "decision_history"):
        connection.execute(f"UPDATE {table} SET user_id=? WHERE user_id=?", (target, source))


def archive_workspace(connection, email: str):
    target = archive_id(email)
    connection.execute(
        "INSERT OR IGNORE INTO users(id, email, display_name) VALUES (?, ?, ?)",
        (target, target + "@archive.eunomia.local", email),
    )
    move_workspace(connection, "demo", target)


def activate_workspace(connection, email: str):
    # Never attribute pre-connection/local-only data to a newly selected account.
    archive_workspace(connection, "unassigned-local-workspace")
    move_workspace(connection, archive_id(email), "demo")
