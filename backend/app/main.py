import os
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from .assistant import generate_natural_response
from .db import connect, initialize_database
from .features.intent_detection import detect_intent
from .google_integration import (
    begin_oauth,
    finish_oauth,
    integration_status,
    sync_google,
)
from .models import MeetingRecord, TaskDeadlineRecord


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(
    title="EunomIA Assistant API",
    description="API de chat, agenda e integração com Gmail e Google Calendar.",
    version="0.1.0",
)
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")
allowed_origins = [frontend_origin]
if frontend_origin in {"http://localhost:5173", "http://127.0.0.1:5173"}:
    allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GoogleSyncRequest(BaseModel):
    email_since: date = Field(default_factory=lambda: date.today() - timedelta(days=30))
    email_until: date = Field(default_factory=date.today)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class EventConfirmationRequest(BaseModel):
    id: UUID
    title: str = Field(min_length=1)
    description: str = ""
    starts_at: datetime
    ends_at: datetime
    location: str = ""


class TaskConfirmationRequest(BaseModel):
    id: UUID
    title: str = Field(min_length=1)
    description: str = ""
    responsible: str | None = None
    due_at: datetime | None = None
    deadline_reference: str | None = None


@app.on_event("startup")
def startup():
    initialize_database()


@app.get("/api/dashboard")
def dashboard():
    with connect() as connection:
        tasks = connection.execute(
            """
            SELECT id, title, description, responsible, due_at,
                   deadline_reference, status, source
            FROM tasks
            WHERE user_id = 'demo' AND status = 'pending'
            ORDER BY due_at
            """
        ).fetchall()

    return {
        "tasks": [dict(task) for task in tasks],
        "google": integration_status(),
    }


@app.get("/api/events")
def events():
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, title, description, starts_at, ends_at, location,
                   status, source
            FROM events
            WHERE user_id = 'demo'
            ORDER BY starts_at
            """
        ).fetchall()

    return {"events": [dict(row) for row in rows]}


@app.post("/api/events", status_code=201)
def create_pending_event(request: EventConfirmationRequest):
    if request.starts_at.utcoffset() is None or request.ends_at.utcoffset() is None:
        raise HTTPException(
            status_code=422,
            detail="O compromisso precisa ter data e horário com fuso definido.",
        )
    if request.ends_at <= request.starts_at:
        raise HTTPException(
            status_code=422,
            detail="O horário de término deve ser posterior ao início.",
        )

    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="O título não pode ser vazio.")

    meeting = MeetingRecord(
        id=str(request.id),
        title=title,
        description=request.description.strip(),
        starts_at=request.starts_at,
        ends_at=request.ends_at,
        duration_minutes=int(
            (request.ends_at - request.starts_at).total_seconds() // 60
        ),
        status="detected",
        source="manual",
        location=request.location,
    )
    with connect() as connection:
        existing = connection.execute(
            "SELECT id FROM events WHERE id = ? AND user_id = 'demo'",
            (meeting.id,),
        ).fetchone()
        if existing is None:
            connection.execute(
                """
                INSERT INTO events(
                    id, user_id, title, description, starts_at, ends_at, location,
                    status, source, updated_at
                )
                VALUES (?, 'demo', ?, ?, ?, ?, ?, 'detected', 'manual', ?)
                """,
                (
                    meeting.id,
                    meeting.title,
                    meeting.description,
                    meeting.starts_at.isoformat(),
                    meeting.ends_at.isoformat(),
                    meeting.location or "",
                    datetime.now(ZoneInfo("America/Fortaleza")).isoformat(),
                ),
            )

    return {"meeting": meeting}


@app.post("/api/tasks", status_code=201)
def create_pending_task(request: TaskConfirmationRequest):
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="O título não pode ser vazio.")
    if request.due_at is not None and request.due_at.utcoffset() is None:
        raise HTTPException(
            status_code=422,
            detail="O prazo precisa ter data e horário com fuso definido.",
        )

    task = TaskDeadlineRecord(
        id=str(request.id),
        title=title,
        description=request.description.strip(),
        responsible=request.responsible,
        due_at=request.due_at,
        deadline_reference=request.deadline_reference,
        status="pending",
        source="manual",
    )
    with connect() as connection:
        existing = connection.execute(
            "SELECT id FROM tasks WHERE id = ? AND user_id = 'demo'",
            (task.id,),
        ).fetchone()
        if existing is None:
            connection.execute(
                """
                INSERT INTO tasks(
                    id, user_id, title, description, responsible, due_at,
                    deadline_reference,
                    status, source
                )
                VALUES (?, 'demo', ?, ?, ?, ?, ?, 'pending', 'manual')
                """,
                (
                    task.id,
                    task.title,
                    task.description,
                    task.responsible,
                    task.due_at.isoformat() if task.due_at else None,
                    task.deadline_reference,
                ),
            )

    return {"task": task}


@app.post("/api/chat")
def chat(request: ChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="A mensagem não pode ser vazia.")

    try:
        intent = detect_intent(message)
    except (LookupError, RuntimeError, ValueError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if not isinstance(intent, dict) or intent.get("intent") not in {
        "create_event",
        "other",
    }:
        raise HTTPException(
            status_code=502,
            detail="O detector de intenção retornou um resultado inválido.",
        )

    record_type = intent.get("record_type")
    if record_type not in {"meeting", "deadline"}:
        raise HTTPException(
            status_code=502,
            detail="O detector não identificou se o registro é reunião ou prazo.",
        )

    if intent["intent"] == "other":
        try:
            reply = generate_natural_response(
                "Você é a EunomIA, uma assistente pessoal que conversa em português "
                "brasileiro de forma natural, clara e objetiva. Responda à mensagem "
                "do usuário sem retornar JSON.\n\n"
                f"Mensagem do usuário: {message}"
            )
        except (LookupError, RuntimeError, ValueError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        return {"reply": reply, "action": None}

    event_fields = {"title": "título"}
    if record_type == "meeting":
        event_fields.update({"date": "data", "time": "horário"})
    elif intent.get("time") and not intent.get("date"):
        event_fields["date"] = "data"
    missing_fields = [
        label
        for key, label in event_fields.items()
        if not isinstance(intent.get(key), str) or not intent[key].strip()
    ]
    if missing_fields:
        labels = ", ".join(missing_fields)
        return {
            "reply": f"Para criar o compromisso, preciso que você informe {labels}.",
            "action": None,
        }

    title = intent["title"].strip()
    if record_type == "deadline":
        due_at = None
        if intent.get("date"):
            deadline_time = intent.get("time") or "23:59"
            try:
                due_at = datetime.strptime(
                    f"{intent['date']} {deadline_time}",
                    "%Y-%m-%d %H:%M",
                ).replace(tzinfo=ZoneInfo("America/Fortaleza"))
            except ValueError as error:
                raise HTTPException(
                    status_code=502,
                    detail="O detector retornou um prazo com data ou horário inválido.",
                ) from error

        task = TaskDeadlineRecord(
            id=str(uuid4()),
            title=title,
            description=(intent.get("description") or "").strip(),
            responsible=(intent.get("responsible") or "").strip() or None,
            due_at=due_at,
            deadline_reference=(
                (intent.get("deadline_reference") or "").strip() or None
            ),
            status="pending",
            source="manual",
        )
        due_description = (
            f", com prazo em {due_at.strftime('%d/%m/%Y às %H:%M')}"
            if due_at
            else ""
        )
        return {
            "reply": (
                f"Encontrei esta tarefa: “{task.title}”{due_description}. "
                "Confirme para adicioná-la às pendências."
            ),
            "action": "record_confirmation_required",
            "record_type": "deadline",
            "record": task,
        }

    try:
        starts_at = datetime.strptime(
            f"{intent['date']} {intent['time']}",
            "%Y-%m-%d %H:%M",
        ).replace(tzinfo=ZoneInfo("America/Fortaleza"))
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail="O detector retornou uma data ou horário inválido.",
        ) from error

    ends_at = starts_at + timedelta(hours=1)
    meeting = MeetingRecord(
        id=str(uuid4()),
        title=title,
        description=(intent.get("description") or "").strip(),
        starts_at=starts_at,
        ends_at=ends_at,
        duration_minutes=60,
        location="",
        status="detected",
        source="manual",
    )

    return {
        "reply": (
            f"Encontrei esta reunião: “{meeting.title}”, "
            f"{starts_at.strftime('%d/%m/%Y às %H:%M')}. "
            "Confirme para adicioná-la às pendências."
        ),
        "action": "record_confirmation_required",
        "record_type": "meeting",
        "record": meeting,
    }


@app.get("/api/integrations/google/status")
def google_status():
    return integration_status()


@app.get("/api/integrations/google/auth")
def google_auth():
    try:
        return RedirectResponse(begin_oauth())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/integrations/google/callback")
def google_callback(request: Request, code: str, state: str):
    try:
        finish_oauth(str(request.url), state)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return RedirectResponse("http://localhost:5173/?google=connected")


@app.post("/api/integrations/google/sync")
def google_sync(request: GoogleSyncRequest | None = None):
    request = request or GoogleSyncRequest()
    if request.email_since > request.email_until:
        raise HTTPException(
            status_code=422,
            detail="A data inicial deve ser anterior ou igual à data final.",
        )
    if request.email_until > date.today():
        raise HTTPException(status_code=422, detail="A data final não pode ser futura.")
    try:
        result = sync_google(request.email_since, request.email_until)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (HttpError, GoogleAuthError, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=502,
            detail=f"Falha ao sincronizar com o Google: {error}",
        ) from error
    return {"result": result}
