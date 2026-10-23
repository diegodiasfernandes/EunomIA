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
]

USER_ID = "demo"
EMAIL_EVENT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_event": {"type": "BOOLEAN"},
        "record_type": {
            "type": "STRING",
            "enum": ["meeting", "deadline", "other"],
        },
        "title": {"type": "STRING"},
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "duration_minutes": {"type": "NUMBER"},
        "location": {"type": "STRING"},
        "description": {"type": "STRING"},
        "preparation": {"type": "STRING"},
        "responsible": {"type": "STRING"},
        "deadline_reference": {"type": "STRING"},
        "cancelled": {"type": "BOOLEAN"},
        "confirmed": {"type": "BOOLEAN"},
    },
    "required": [
        "is_event",
        "record_type",
        "title",
        "date",
        "time",
        "duration_minutes",
        "location",
        "description",
        "preparation",
        "responsible",
        "deadline_reference",
        "cancelled",
        "confirmed",
    ],
}


def _event_title(extracted: dict, subject: str) -> tuple[str, list[str]]:
    title = str(extracted.get("title") or "").strip()
    if title:
        return title, []
    return (
        subject.strip() or "Compromisso identificado em e-mail",
        ["Título não informado; usado o assunto do e-mail."],
    )


def _description_with_senders(description: str, messages: list[dict]) -> str:
    senders = list(dict.fromkeys(
        str(message.get("sender") or "").strip()
        for message in messages
        if str(message.get("sender") or "").strip()
    ))
    if not senders:
        return description

    sender_line = f"Remetente(s): {', '.join(senders)}"
    return f"{sender_line}\n\n{description}" if description else sender_line


def _sender_for_messages(messages: list[dict]) -> str:
    return ", ".join(dict.fromkeys(
        str(message.get("sender") or "").strip()
        for message in messages
        if str(message.get("sender") or "").strip()
    ))


def _event_schedule(
    extracted: dict,
    received_at: str,
    subject: str,
) -> tuple[str, str, int, list[str]]:
    inferred_fields = []
    received_date = datetime.fromisoformat(received_at).astimezone().date()

    date_value = str(extracted.get("date") or "").strip()
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
    except ValueError:
        date_value = received_date.isoformat()
        inferred_fields.append(
            f"Data não informada ou inválida; considerado o dia do e-mail "
            f"({received_date.strftime('%d/%m/%Y')})."
        )

    time_value = str(extracted.get("time") or "").strip()
    try:
        datetime.strptime(time_value, "%H:%M")
    except ValueError:
        time_value = "09:00"
        inferred_fields.append(
            "Horário não informado ou inválido; considerado 09:00."
        )

    raw_duration = extracted.get("duration_minutes")
    try:
        duration = int(raw_duration) if raw_duration is not None else 0
    except (TypeError, ValueError, OverflowError):
        duration = 0
    if duration <= 0:
        duration = 60
        inferred_fields.append(
            "Duração não informada; considerada uma hora."
        )
    elif duration < 15:
        duration = 15
        inferred_fields.append(
            "Duração inferior a 15 minutos; considerado o mínimo de 15 minutos."
        )

    title, title_inference = _event_title(extracted, subject)
    inferred_fields.extend(title_inference)

    starts_at = datetime.fromisoformat(
        f"{date_value}T{time_value}:00"
    ).astimezone().isoformat()
    return starts_at, title, duration, inferred_fields


def _deadline_schedule(
    extracted: dict,
    subject: str,
) -> tuple[str, str | None, str, list[str]]:
    title, inferred_fields = _event_title(extracted, subject)
    date_value = str(extracted.get("date") or "").strip()
    time_value = str(extracted.get("time") or "").strip()
    due_at = None
    valid_date = False

    if date_value:
        try:
            due_date = datetime.strptime(date_value, "%Y-%m-%d")
            valid_date = True
        except ValueError:
            inferred_fields.append(
                "Data limite inválida; prazo mantido sem data definida."
            )

    if valid_date:
        if time_value:
            try:
                due_time = datetime.strptime(time_value, "%H:%M").time()
            except ValueError:
                due_time = datetime.strptime("23:59", "%H:%M").time()
                inferred_fields.append(
                    "Horário limite inválido; considerado o fim do dia (23:59)."
                )
        else:
            due_time = datetime.strptime("23:59", "%H:%M").time()
            inferred_fields.append(
                "Horário limite não informado; considerado o fim do dia (23:59)."
            )
        due_at = datetime.combine(
            due_date.date(),
            due_time,
            tzinfo=datetime.now().astimezone().tzinfo,
        ).isoformat()

    deadline_reference = str(
        extracted.get("deadline_reference") or ""
    ).strip()
    if not date_value and time_value:
        inferred_fields.append(
            "Horário sem data; prazo mantido sem data definida."
        )
    if not due_at and not deadline_reference:
        if not any("sem data definida" in item for item in inferred_fields):
            inferred_fields.append(
                "Prazo não informado; nenhum prazo foi presumido."
            )

    return title, due_at, deadline_reference, inferred_fields


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

    gmail = build(
        "gmail",
        "v1",
        credentials=credentials,
    )

    now = datetime.now(timezone.utc)

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
                "Consolide as mensagens deste mesmo thread de email. Classifique o registro "
                "como meeting para uma reunião, consulta ou encontro com horário marcado; "
                "deadline para uma tarefa, entrega ou obrigação com prazo; ou other se não "
                "houver compromisso nem tarefa a registrar. Para meeting ou deadline, "
                "is_event deve ser true; para other, false. Uma deadline não é reunião e "
                "não tem duração. Use a mensagem mais recente para refletir alterações e "
                "cancelamentos. Não invente informações; use campos vazios quando não "
                "estiverem claros. Assunto: "
                + ordered[-1]["subject"]
                + " Mensagens (em ordem cronológica): "
                + json.dumps(ordered, ensure_ascii=False),
                EMAIL_EVENT_SCHEMA,
            )

            if not extracted or not extracted.get("is_event"):
                continue
            record_type = extracted.get("record_type", "meeting")
            if record_type == "other":
                continue

            if record_type == "deadline":
                (
                    title,
                    due_at,
                    deadline_reference,
                    inferred_fields,
                ) = _deadline_schedule(extracted, ordered[-1]["subject"])
                task_source_ref = f"email-deadline:{thread_id}"
                task_status = "cancelled" if extracted.get("cancelled") else "detected"
                connection.execute(
                    """
                    INSERT INTO tasks(
                        id, user_id, source_ref, title, description, sender,
                        responsible, due_at, deadline_reference, status, source,
                        inferred_fields
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'email', ?)
                    ON CONFLICT(user_id, source_ref) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        sender = excluded.sender,
                        responsible = excluded.responsible,
                        due_at = excluded.due_at,
                        deadline_reference = excluded.deadline_reference,
                        status = CASE
                            WHEN excluded.status = 'cancelled' THEN 'cancelled'
                            WHEN tasks.status = 'pending' THEN 'pending'
                            ELSE excluded.status
                        END,
                        inferred_fields = excluded.inferred_fields
                    """,
                    (
                        str(uuid4()),
                        USER_ID,
                        task_source_ref,
                        title,
                        _description_with_senders(
                            str(extracted.get("description") or "").strip(),
                            ordered,
                        ),
                        _sender_for_messages(ordered),
                        str(extracted.get("responsible") or "").strip() or None,
                        due_at,
                        deadline_reference,
                        task_status,
                        json.dumps(inferred_fields, ensure_ascii=False),
                    ),
                )
                detected_count += 1
                continue

            (
                starts_at,
                title,
                duration,
                inferred_fields,
            ) = _event_schedule(
                extracted,
                ordered[-1]["received_at"],
                ordered[-1]["subject"],
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
                    sender,
                    status,
                    source,
                    preparation,
                    inferred_fields,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'email', ?, ?, ?)
                ON CONFLICT(user_id, source_ref) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    starts_at = excluded.starts_at,
                    ends_at = excluded.ends_at,
                    location = excluded.location,
                    sender = excluded.sender,
                    status = CASE
                        WHEN excluded.status = 'cancelled' THEN 'cancelled'
                        WHEN events.status = 'pending' THEN 'pending'
                        ELSE excluded.status
                    END,
                    preparation = excluded.preparation,
                    inferred_fields = excluded.inferred_fields,
                    updated_at = excluded.updated_at
                """,
                (
                    str(uuid4()),
                    USER_ID,
                    thread_id,
                    title,
                    _description_with_senders(
                        str(extracted.get("description") or "").strip(),
                        ordered,
                    ),
                    starts_at,
                    (
                        start_dt
                        + timedelta(minutes=duration)
                    ).isoformat(),
                    extracted.get("location", ""),
                    _sender_for_messages(ordered),
                    status,
                    extracted.get("preparation", ""),
                    json.dumps(inferred_fields, ensure_ascii=False),
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
        "emails": len(email_records),
        "email_threads_with_events": detected_count,
    }
