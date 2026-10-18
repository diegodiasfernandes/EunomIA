import base64
import json
import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.exceptions import GoogleAuthError
from oauthlib.oauth2 import OAuth2Error

from .assistant import generate_structured_response
from .db import connect

if os.getenv("ENVIRONMENT", "development") == "development":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar",
]

USER_ID = "demo"
EMAIL_EVENT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_event": {"type": "BOOLEAN"},
        "title": {"type": "STRING"},
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "duration_minutes": {"type": "NUMBER"},
        "location": {"type": "STRING"},
        "description": {"type": "STRING"},
        "preparation": {"type": "STRING"},
        "cancelled": {"type": "BOOLEAN"},
        "confirmed": {"type": "BOOLEAN"},
    },
    "required": [
        "is_event",
        "title",
        "date",
        "time",
        "duration_minutes",
        "location",
        "description",
        "preparation",
        "cancelled",
        "confirmed",
    ],
}


def _client_config() -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise ValueError(
            "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no backend/.env."
        )

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [
                "http://localhost:8000/api/integrations/google/callback"
            ],
        }
    }


def begin_oauth() -> str:
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
    )

    flow.redirect_uri = "http://localhost:8000/api/integrations/google/callback"

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    with connect() as connection:
        connection.execute(
            """
            INSERT INTO oauth_states(state, created_at, code_verifier)
            VALUES (?, ?, ?)
            """,
            (
                state,
                datetime.now(timezone.utc).isoformat(),
                flow.code_verifier,
            ),
        )

    return authorization_url


def finish_oauth(authorization_response: str, state: str) -> str:
    with connect() as connection:
        stored = connection.execute(
            """
            SELECT state, created_at, code_verifier
            FROM oauth_states
            WHERE state = ?
            """,
            (state,),
        ).fetchone()

        if not stored:
            raise ValueError(
                "Estado OAuth inválido ou expirado. Tente conectar novamente."
            )

        connection.execute(
            "DELETE FROM oauth_states WHERE state = ?",
            (state,),
        )

    created_at = datetime.fromisoformat(stored["created_at"])

    if datetime.now(timezone.utc) - created_at > timedelta(minutes=15):
        raise ValueError(
            "A tentativa de conexão expirou. Inicie a conexão novamente."
        )

    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        state=state,
    )

    flow.redirect_uri = "http://localhost:8000/api/integrations/google/callback"
    flow.code_verifier = stored["code_verifier"]

    flow.fetch_token(
        authorization_response=authorization_response
    )

    credentials = flow.credentials
    account_email = ""

    try:
        profile = (
            build("gmail", "v1", credentials=credentials)
            .users()
            .getProfile(userId="me")
            .execute()
        )

        account_email = profile.get("emailAddress", "")

    except (
        HttpError,
        GoogleAuthError,
        OAuth2Error,
        OSError,
    ) as error:
        raise RuntimeError(
            f"Falha ao validar a conta Google: {error}"
        ) from error

    with connect() as connection:
        connection.execute(
            """
            INSERT INTO integrations(name, credentials_json, account_email)
            VALUES ('google', ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                credentials_json = excluded.credentials_json,
                account_email = excluded.account_email
            """,
            (
                credentials.to_json(),
                account_email,
            ),
        )

    return account_email


def google_credentials() -> Credentials | None:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT credentials_json
            FROM integrations
            WHERE name = 'google'
            """
        ).fetchone()

    if not row:
        return None

    credentials = Credentials.from_authorized_user_info(
        json.loads(row["credentials_json"]),
        SCOPES,
    )

    if credentials.expired and credentials.refresh_token:
        from google.auth.transport.requests import Request

        credentials.refresh(Request())

        with connect() as connection:
            connection.execute(
                """
                UPDATE integrations
                SET credentials_json = ?
                WHERE name = 'google'
                """,
                (credentials.to_json(),),
            )

    return credentials


def integration_status() -> dict:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT account_email
            FROM integrations
            WHERE name = 'google'
            """
        ).fetchone()

    return {
        "connected": bool(row),
        "email": row["account_email"] if row else None,
    }


def _email_body(payload: dict) -> str:
    def find_plain_text(part: dict) -> str | None:
        if (
            part.get("mimeType") == "text/plain"
            and part.get("body", {}).get("data")
        ):
            raw = base64.urlsafe_b64decode(
                part["body"]["data"] + "==="
            )
            return raw.decode("utf-8", errors="replace")

        for child in part.get("parts", []):
            found = find_plain_text(child)

            if found:
                return found

        return None

    return find_plain_text(payload) or ""


def _headers(payload: dict) -> dict:
    return {
        header["name"].lower(): header["value"]
        for header in payload.get("headers", [])
        if "name" in header and "value" in header
    }


def sync_google(
    email_since: date | None = None,
    email_until: date | None = None,
) -> dict:
    credentials = google_credentials()

    if credentials is None:
        raise ValueError(
            "Conecte sua conta Google antes de sincronizar."
        )

    email_since = email_since or (
        date.today() - timedelta(days=30)
    )

    email_until = email_until or date.today()

    if email_since > email_until:
        raise ValueError(
            "A data inicial deve ser anterior ou igual à data final."
        )

    calendar = build(
        "calendar",
        "v3",
        credentials=credentials,
    )

    gmail = build(
        "gmail",
        "v1",
        credentials=credentials,
    )

    now = datetime.now(timezone.utc)

    time_min = (
        now - timedelta(days=30)
    ).isoformat()

    time_max = (
        now + timedelta(days=90)
    ).isoformat()

    calendar_items = (
        calendar.events()
        .list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
        )
        .execute()
        .get("items", [])
    )

    calendar_count = 0

    with connect() as connection:
        for item in calendar_items:
            start_value = item.get("start", {}).get("dateTime")
            end_value = item.get("end", {}).get("dateTime")

            if not start_value and item.get("start", {}).get("date"):
                start_value = (
                    item["start"]["date"] + "T09:00:00+00:00"
                )
                end_value = (
                    item["end"]["date"] + "T10:00:00+00:00"
                )

            if not start_value or not end_value:
                continue

            connection.execute(
                """
                INSERT INTO events(
                    id,
                    user_id,
                    provider_id,
                    title,
                    description,
                    starts_at,
                    ends_at,
                    location,
                    status,
                    source,
                    updated_at
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'calendar',
                    ?
                )
                ON CONFLICT(user_id, provider_id) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    starts_at = excluded.starts_at,
                    ends_at = excluded.ends_at,
                    location = excluded.location,
                    status = excluded.status,
                    updated_at = excluded.updated_at
                """,
                (
                    str(uuid4()),
                    USER_ID,
                    item["id"],
                    item.get(
                        "summary",
                        "Compromisso sem título",
                    ),
                    item.get("description", ""),
                    start_value,
                    end_value,
                    item.get("location", ""),
                    (
                        "cancelled"
                        if item.get("status") == "cancelled"
                        else "confirmed"
                    ),
                    now.isoformat(),
                ),
            )

            calendar_count += 1

    gmail_query = (
        f"after:{email_since.strftime('%Y/%m/%d')} "
        f"before:{(email_until + timedelta(days=1)).strftime('%Y/%m/%d')}"
    )

    listed = (
        gmail.users()
        .messages()
        .list(
            userId="me",
            q=gmail_query,
            maxResults=50,
        )
        .execute()
        .get("messages", [])
    )

    threads: dict[str, list[dict]] = {}
    email_records = []

    for listed_message in listed:
        item = (
            gmail.users()
            .messages()
            .get(
                userId="me",
                id=listed_message["id"],
                format="full",
            )
            .execute()
        )

        payload = item.get("payload", {})
        headers = _headers(payload)
        body = _email_body(payload)

        thread_id = item.get(
            "threadId",
            item["id"],
        )

        subject = headers.get(
            "subject",
            "(sem assunto)",
        )

        received_at = datetime.fromtimestamp(
            int(item.get("internalDate", "0")) / 1000,
            timezone.utc,
        ).isoformat()

        email_records.append(
            {
                "id": item["id"],
                "thread_id": thread_id,
                "subject": subject,
                "sender": headers.get("from", ""),
                "received_at": received_at,
                "snippet": item.get("snippet", ""),
                "body": body[:12000],
            }
        )

        threads.setdefault(
            thread_id,
            [],
        ).append(email_records[-1])

    detected_count = 0

    with connect() as connection:
        for record in email_records:
            connection.execute(
                """
                INSERT INTO emails(
                    id,
                    user_id,
                    provider_id,
                    conversation_id,
                    subject,
                    sender,
                    received_at,
                    snippet
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider_id) DO UPDATE SET
                    subject = excluded.subject,
                    sender = excluded.sender,
                    received_at = excluded.received_at,
                    snippet = excluded.snippet
                """,
                (
                    str(uuid4()),
                    USER_ID,
                    record["id"],
                    record["thread_id"],
                    record["subject"],
                    record["sender"],
                    record["received_at"],
                    record["snippet"],
                ),
            )

        for thread_id, messages in threads.items():
            ordered = sorted(
                messages,
                key=lambda message: message["received_at"],
            )

            extracted = generate_structured_response(
                "Consolide as mensagens deste mesmo thread de email sobre um compromisso. "
                "Use a mensagem mais recente para refletir alterações e cancelamentos. "
                "Se não houver compromisso, is_event=false; nesse caso use strings vazias "
                "para data e horário e duration_minutes=0. Não invente datas. Assunto: "
                + ordered[-1]["subject"]
                + " Mensagens (em ordem cronológica): "
                + json.dumps(ordered, ensure_ascii=False),
                EMAIL_EVENT_SCHEMA,
            )

            if not extracted or not extracted.get("is_event"):
                continue
            if not extracted.get("date") or not extracted.get("time"):
                raise ValueError(
                    "O Gemini identificou um compromisso sem data ou horário. "
                    "Revise a conversa no Gmail."
                )
            try:
                datetime.strptime(
                    f"{extracted['date']} {extracted['time']}",
                    "%Y-%m-%d %H:%M",
                )
            except (TypeError, ValueError) as error:
                raise ValueError(
                    "O Gemini retornou uma data ou horário inválido para um compromisso."
                ) from error

            starts_at = datetime.fromisoformat(
                f"{extracted['date']}T{extracted['time']}:00"
            ).astimezone().isoformat()

            duration = max(
                15,
                int(
                    extracted.get("duration_minutes")
                    or 60
                ),
            )

            start_dt = datetime.fromisoformat(starts_at)

            status = (
                "cancelled"
                if extracted.get("cancelled")
                else "detected"
            )

            connection.execute(
                """
                INSERT INTO events(
                    id,
                    user_id,
                    source_ref,
                    title,
                    description,
                    starts_at,
                    ends_at,
                    location,
                    status,
                    source,
                    preparation,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'email', ?, ?)
                ON CONFLICT(user_id, source_ref) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    starts_at = excluded.starts_at,
                    ends_at = excluded.ends_at,
                    location = excluded.location,
                    status = excluded.status,
                    preparation = excluded.preparation,
                    updated_at = excluded.updated_at
                """,
                (
                    str(uuid4()),
                    USER_ID,
                    thread_id,
                    extracted.get("title")
                    or ordered[-1]["subject"],
                    extracted.get("description", ""),
                    starts_at,
                    (
                        start_dt
                        + timedelta(minutes=duration)
                    ).isoformat(),
                    extracted.get("location", ""),
                    status,
                    extracted.get("preparation", ""),
                    now.isoformat(),
                ),
            )

            event = connection.execute(
                """
                SELECT id
                FROM events
                WHERE user_id = ?
                AND source_ref = ?
                """,
                (
                    USER_ID,
                    thread_id,
                ),
            ).fetchone()

            if event:
                for message in ordered:
                    email = connection.execute(
                        """
                        SELECT id
                        FROM emails
                        WHERE provider_id = ?
                        """,
                        (message["id"],),
                    ).fetchone()

                    if email:
                        connection.execute(
                            """
                            INSERT OR IGNORE INTO email_events(
                                email_id,
                                event_id
                            )
                            VALUES (?, ?)
                            """,
                            (
                                email["id"],
                                event["id"],
                            ),
                        )

                preparation = str(
                    extracted.get("preparation") or ""
                ).strip()

                if preparation:
                    due_at = (
                        start_dt
                        - timedelta(hours=2)
                    ).isoformat()

                    connection.execute(
                        """
                        INSERT INTO tasks(
                            id,
                            user_id,
                            event_id,
                            source_ref,
                            title,
                            due_at,
                            status,
                            source
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            'pending',
                            'email'
                        )
                        ON CONFLICT(user_id, source_ref) DO UPDATE SET
                            event_id = excluded.event_id,
                            title = excluded.title,
                            due_at = excluded.due_at
                        """,
                        (
                            str(uuid4()),
                            USER_ID,
                            event["id"],
                            thread_id,
                            preparation,
                            due_at,
                        ),
                    )

                detected_count += 1

    return {
        "calendar_events": calendar_count,
        "emails": len(email_records),
        "email_threads_with_events": detected_count,
    }



def write_calendar_event(event: dict) -> str:
    """Cria ou atualiza um compromisso no Google Agenda."""

    credentials = google_credentials()

    if credentials is None:
        return ""

    calendar = build(
        "calendar",
        "v3",
        credentials=credentials,
    )

    body = {
        "summary": event["title"],
        "description": event.get("description") or "",
        "location": event.get("location") or "",
        "start": {
            "dateTime": event["starts_at"],
        },
        "end": {
            "dateTime": event["ends_at"],
        },
    }

    provider_id = event.get("provider_id")

    if provider_id:
        result = (
            calendar.events()
            .update(
                calendarId="primary",
                eventId=provider_id,
                body=body,
            )
            .execute()
        )
        return result["id"]

    # Gera um ID estável a partir do ID do evento local.
    # O UUID contém apenas caracteres aceitos pelo Google Agenda.
    local_id = event["id"].replace("-", "").lower()
    google_event_id = f"e{local_id}"

    body["id"] = google_event_id

    try:
        result = (
            calendar.events()
            .insert(
                calendarId="primary",
                body=body,
            )
            .execute()
        )
        return result["id"]

    except HttpError as error:
        if error.resp.status == 409:
            # O evento já existe no Google Agenda.
            # Recupera o mesmo evento em vez de criar outro.
            existing = (
                calendar.events()
                .get(
                    calendarId="primary",
                    eventId=google_event_id,
                )
                .execute()
            )
            return existing["id"]

        raise
