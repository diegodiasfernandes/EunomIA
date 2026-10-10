from datetime import datetime
from zoneinfo import ZoneInfo

from app.assistant import generate_structured_response


EVENT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "intent": {
            "type": "STRING",
            "enum": ["create_event", "other"]
        },
        "title": {"type": "STRING"},
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "missing_fields": {
            "type": "ARRAY",
            "items": {"type": "STRING"}
        }
    },
    "required": [
        "intent",
        "title",
        "date",
        "time",
        "missing_fields"
    ]
}


def detect_intent(message: str) -> dict:
    if not message.strip():
        raise ValueError("Mensagem vazia")

    now = datetime.now(
        ZoneInfo("America/Fortaleza")
    )

    prompt = f"""
Você é o assistente de agenda EunomIA.

Data e hora atuais: {now.isoformat()}.

Identifique se o usuário deseja criar um compromisso.

Regras:
1. Se o usuário solicitar a criação de um evento,
   use intent = "create_event".
2. Caso contrário, use intent = "other".
3. Extraia o título, a data e o horário.
4. Converta datas relativas como "amanhã".
5. Não invente informações ausentes.
6. Se faltar data ou horário, coloque o nome
   do campo em missing_fields.
7. Use datas no formato YYYY-MM-DD.
8. Use horários no formato HH:MM.
9. Para campos desconhecidos, retorne "".
10. Não execute nenhuma ação na agenda.

Mensagem:
{message}
"""

    result = generate_structured_response(
        prompt,
        EVENT_SCHEMA
    )

    return result