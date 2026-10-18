import os
from datetime import date, timedelta
from pathlib import Path
from .features.chat_manager import process_message


from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from .db import connect, initialize_database
from .google_integration import (
    begin_oauth,
    finish_oauth,
    integration_status,
    sync_google,
)


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(
    title="EunomIA Google Integration API",
    description="Endpoints de conexão e sincronização com Gmail e Google Calendar.",
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
    conversation_id: str | None = None



@app.on_event("startup")
def startup():
    initialize_database()

@app.get("/api/dashboard")
def get_dashboard():
    google = integration_status()

    with connect() as connection:
        tasks = connection.execute(
            """
            SELECT id, title, due_at, status, source, event_id
            FROM tasks
            WHERE user_id = ?
            ORDER BY due_at IS NULL, due_at
            """,
            ("demo",),
        ).fetchall()

    return {
        "google": google,
        "tasks": [dict(task) for task in tasks],
    }


@app.get("/api/events")
def get_events():
    with connect() as connection:
        events = connection.execute(
            """
            SELECT *
            FROM events
            WHERE user_id = ?
            ORDER BY starts_at
            """,
            ("demo",),
        ).fetchall()

    return {
        "events": [dict(event) for event in events],
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


@app.post("/api/chat")
def chat(request: ChatRequest):
    try:
        return process_message(
            message=request.message,
            conversation_id=request.conversation_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Assistente temporariamente indisponível.",
        )
