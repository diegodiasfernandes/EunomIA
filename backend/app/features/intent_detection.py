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

Identifique se o usuário deseja criar ou agendar um compromisso.

Regras:
1. Use intent = "create_event" quando a pessoa pedir para marcar,
   agendar, criar ou combinar uma reunião, consulta ou outro compromisso,
   mesmo que ainda não tenha informado data ou horário.
2. Em pedidos de criação incompletos, mantenha intent = "create_event";
   nunca classifique o pedido como "other" só porque faltam detalhes.
3. Use intent = "other" apenas para conversa ou perguntas sem pedido
   de criar um compromisso.
4. Extraia o título, a data e o horário quando estiverem na mensagem.
5. Converta datas relativas como "amanhã" usando a data e hora atuais.
6. Não invente informações ausentes.
7. Se faltar título, data ou horário, retorne o campo em missing_fields.
8. Use datas no formato YYYY-MM-DD.
9. Use horários no formato HH:MM.
10. Para campos desconhecidos, retorne "".
11. Não execute nenhuma ação na agenda.

Mensagem:
{message}
"""

    result = generate_structured_response(
        prompt,
        EVENT_SCHEMA
    )

    return result