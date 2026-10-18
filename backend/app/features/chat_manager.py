
from uuid import uuid4
from datetime import datetime
from zoneinfo import ZoneInfo

from app.features.intent_detection import detect_intent
from app.features.event_service import save_event, sync_event_to_google

# Armazena temporariamente as conversas.
conversations = {}


def missing_fields(event):
    """Verifica quais informações ainda faltam."""
    return [
        field for field in ("title", "date", "time")
        if not event.get(field)
    ]


def ask_missing(fields):
    """Pergunta pelas informações ausentes."""
    names = {
        "title": "o nome do compromisso",
        "date": "a data",
        "time": "o horário",
    }

    requested = [names[field] for field in fields]

    return (
        "Para continuar, informe: "
        + ", ".join(requested)
        + "."
    )


def process_message(message: str, conversation_id=None):
    """Processa uma mensagem e mantém o contexto."""

    if not message or not message.strip():
        raise ValueError("Mensagem vazia")

    if conversation_id is None:
        conversation_id = str(uuid4())

    state = conversations.get(conversation_id)

    # Uma confirmação pendente deve ser tratada
    # antes de consultar o Gemini.

    if state and state["status"] == "awaiting_confirmation":
        answer = message.strip().lower()

        if answer in ("sim", "confirmar", "confirmo"):
            event = state["event"].copy()

            try:
                event_id = save_event(
                    event=event,
                    user_id="demo",
                    conversation_id=conversation_id,
                )
            except Exception:
                return {
                    "conversation_id": conversation_id,
                    "status": "awaiting_confirmation",
                    "response": (
                        "Não foi possível salvar o compromisso. "
                        "Tente confirmar novamente."
                    ),
                    "event": event,
                }


            # O compromisso já foi salvo no banco local.
            # Agora tentamos sincronizar com o Google Agenda.
            google_synced = False

            try:
                google_synced = sync_event_to_google(event_id)
            except Exception:
                # Uma falha no Google não apaga o compromisso local.
                google_synced = False

            del conversations[conversation_id]

            if google_synced:
                response_text = (
                    "Compromisso salvo com sucesso "
                    "e sincronizado com o Google Agenda!"
                )
            else:
                response_text = (
                    "Compromisso salvo na agenda local, "
                    "mas ainda não foi sincronizado "
                    "com o Google Agenda."
                )

            return {
                "conversation_id": conversation_id,
                "status": "confirmed",
                "response": response_text,
                "event": event,
                "event_id": event_id,
                "google_synced": google_synced,
            }


        if answer in ("não", "nao", "cancelar"):
            del conversations[conversation_id]

            return {
                "conversation_id": conversation_id,
                "status": "cancelled",
                "response": "Compromisso cancelado.",
                "event": None,
            }

        return {
            "conversation_id": conversation_id,
            "status": "awaiting_confirmation",
            "response": "Responda 'sim' para confirmar ou 'não' para cancelar.",
            "event": state["event"].copy(),
        }


    if state:
        previous = state["event"]

        # O Gemini recebe o contexto do compromisso
        # e a nova mensagem do usuário.
        context = f"""
O usuário está criando um compromisso.
Continue a solicitação anterior de criação de evento.

Dados já informados:
Título: {previous.get('title', '')}
Data: {previous.get('date', '')}
Horário: {previous.get('time', '')}

Nova resposta do usuário:
{message}

Retorne a intenção create_event.
Combine os dados anteriores com os novos.
Preserve os dados anteriores que não foram alterados.
Não invente informações ausentes.
"""
        result = detect_intent(context)

        event = {
            field: result.get(field) or previous.get(field, "")
            for field in ("title", "date", "time")
        }
    else:
        result = detect_intent(message)

        if result.get("intent") != "create_event":
            return {
                "conversation_id": conversation_id,
                "status": "other",
                "response": "Como posso ajudar com sua agenda?",
                "event": None,
            }

        event = {
            field: result.get(field) or ""
            for field in ("title", "date", "time")
        }

    fields = missing_fields(event)

    if fields:
        conversations[conversation_id] = {
            "event": event,
            "status": "collecting",
            "updated_at": datetime.now(
                ZoneInfo("America/Fortaleza")
            ).isoformat(),
        }

        return {
            "conversation_id": conversation_id,
            "status": "collecting",
            "response": ask_missing(fields),
            "event": event.copy(),
            "missing_fields": fields,
        }

    conversations[conversation_id] = {
        "event": event,
        "status": "awaiting_confirmation",
        "updated_at": datetime.now(
            ZoneInfo("America/Fortaleza")
        ).isoformat(),
    }

    return {
        "conversation_id": conversation_id,
        "status": "awaiting_confirmation",
        "response": (
            f"Confirma o compromisso '{event['title']}' "
            f"no dia {event['date']} "
            f"às {event['time']}? "
            "Responda sim ou não."
        ),
        "event": event.copy(),
    }
