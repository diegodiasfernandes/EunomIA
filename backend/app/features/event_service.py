
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.db import connect
from app.google_integration import write_calendar_event


TIMEZONE = ZoneInfo("America/Fortaleza")


def save_event(event: dict, user_id: str, conversation_id: str):
    """Salva um compromisso confirmado no banco de dados."""

    if not user_id:
        raise ValueError("Usuário não identificado.")

    title = event["title"].strip()
    if not title:
        raise ValueError("Título do compromisso obrigatório.")

    try:
        start = datetime.strptime(
            f"{event['date']} {event['time']}",
            "%Y-%m-%d %H:%M",
        ).replace(tzinfo=TIMEZONE)
    except (KeyError, ValueError) as error:
        raise ValueError("Data ou horário inválido.") from error

    # Duração provisória de uma hora.
    end = start + timedelta(hours=1)
    now = datetime.now(TIMEZONE)

    event_id = str(uuid4())
    source_ref = f"chat:{conversation_id}"

    with connect() as connection:
        user = connection.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

        if user is None:
            raise ValueError("Usuário não encontrado.")

        existing = connection.execute(
            """
            SELECT id FROM events
            WHERE user_id = ? AND source_ref = ?
            """,
            (user_id, source_ref),
        ).fetchone()

        if existing:
            return existing["id"]

        connection.execute(
            """
            INSERT INTO events (
                id, user_id, source_ref, title,
                starts_at, ends_at, status,
                source, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                user_id,
                source_ref,
                title,
                start.isoformat(),
                end.isoformat(),
                "confirmed",
                "chat",
                now.isoformat(),
            ),
        )

    return event_id


def sync_event_to_google(event_id: str) -> bool:
    """Sincroniza um compromisso local com o Google Agenda."""

    with connect() as connection:
        event = connection.execute(
            "SELECT * FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()

        if event is None:
            raise ValueError("Compromisso não encontrado.")

        event_data = dict(event)

    if event_data.get("provider_id"):
        return True

    google_event_id = write_calendar_event(event_data)

    if not google_event_id:
        return False

    with connect() as connection:
        connection.execute(
            """
            UPDATE events
            SET provider_id = ?
            WHERE id = ?
            """,
            (google_event_id, event_id),
        )

    return True
