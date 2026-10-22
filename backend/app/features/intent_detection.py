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
        "record_type": {
            "type": "STRING",
            "enum": ["meeting", "deadline"]
        },
        "title": {"type": "STRING"},
        "description": {"type": "STRING"},
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "responsible": {"type": "STRING"},
        "deadline_reference": {"type": "STRING"},
        "missing_fields": {
            "type": "ARRAY",
            "items": {"type": "STRING"}
        }
    },
    "required": [
        "intent",
        "record_type",
        "title",
        "description",
        "date",
        "time",
        "responsible",
        "deadline_reference",
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

Identifique se o usuário deseja registrar uma reunião ou um prazo de tarefa.

Regras:
1. Use intent = "create_event" quando o usuário pedir para registrar
   uma reunião, consulta, compromisso, tarefa ou prazo, mesmo que faltem dados.
   Também trate como pedido de prazo declarações de obrigação como
   "preciso entregar o relatório até sexta" ou "tenho que pagar a conta amanhã".
2. Use record_type = "meeting" para encontros com horário de início e fim,
   como reuniões e consultas. Exemplo: "marque uma reunião com Ana amanhã às 10".
3. Use record_type = "deadline" para entregas, tarefas e obrigações com prazo,
   como entregar um trabalho, pagar uma conta ou enviar um documento.
   Exemplo: "crie um prazo para entregar o trabalho sexta". Uma tarefa com
   data-limite não é uma reunião.
4. Use intent = "other" apenas para conversa sem pedido de registrar algo;
   nesse caso use record_type = "meeting". Perguntas sobre como executar uma
   tarefa, sem pedido ou declaração de obrigação a registrar, são "other".
5. Extraia título, descrição, data, horário, responsável e referência do prazo.
6. Converta datas relativas usando a data e hora atuais.
7. Não invente informações ausentes.
8. Reuniões precisam de título, data e horário; retorne em missing_fields
   qualquer um desses dados que faltar. Prazo pode não ter data ou horário.
9. Use datas no formato YYYY-MM-DD e horários no formato HH:MM.
10. Para campos desconhecidos, retorne "".
11. Não execute nenhuma ação de gravação.

Mensagem:
{message}
"""

    result = generate_structured_response(
        prompt,
        EVENT_SCHEMA
    )

    return result