import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TEST_DATABASE = Path(tempfile.gettempdir()) / "eunomia-api-tests.sqlite"
os.environ["DATABASE_PATH"] = str(TEST_DATABASE)

from fastapi.testclient import TestClient

from app.main import app


class GoogleIntegrationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        TEST_DATABASE.unlink(missing_ok=True)

    def show_exchange(self, method, path, request_body, response):
        print(f"\n[{self.id()}] {method} {path}")
        print(
            "Entrada:",
            json.dumps(request_body, ensure_ascii=False, indent=2)
            if request_body is not None
            else "<sem corpo>",
        )
        print(f"Retorno HTTP: {response.status_code}")
        print("Saída:", json.dumps(response.json(), ensure_ascii=False, indent=2))

    def test_google_status_returns_connection_state(self):
        path = "/api/integrations/google/status"
        response = self.client.get(path)
        self.show_exchange("GET", path, None, response)

        self.assertEqual(response.status_code, 200)
        self.assertIn("connected", response.json())

    def test_google_sync_uses_the_selected_email_date_range(self):
        result = {"emails": 8, "email_threads_with_events": 2}
        request_body = {"email_since": "2026-09-01", "email_until": "2026-09-29"}
        path = "/api/integrations/google/sync"
        with patch("app.main.sync_google", return_value=result) as sync:
            response = self.client.post(path, json=request_body)
        self.show_exchange("POST", path, request_body, response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["result"], result)
        sync.assert_called_once()
        self.assertEqual(sync.call_args.args[0].isoformat(), "2026-09-01")
        self.assertEqual(sync.call_args.args[1].isoformat(), "2026-09-29")

    def test_google_sync_rejects_an_invalid_email_date_range(self):
        request_body = {"email_since": "2026-09-29", "email_until": "2026-09-01"}
        path = "/api/integrations/google/sync"
        with patch("app.main.sync_google") as sync:
            response = self.client.post(path, json=request_body)
        self.show_exchange("POST", path, request_body, response)

        self.assertEqual(response.status_code, 422)
        sync.assert_not_called()

    def test_google_sync_reports_missing_gemini_configuration(self):
        request_body = {"email_since": "2026-10-01", "email_until": "2026-10-22"}
        path = "/api/integrations/google/sync"
        with patch(
            "app.main.sync_google",
            side_effect=LookupError("GEMINI_API_KEY não configurada"),
        ):
            response = self.client.post(path, json=request_body)

        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY não configurada", response.json()["detail"])

    def test_chat_uses_natural_response_for_non_event_messages(self):
        message = "Como você pode me ajudar?"
        intent = {
            "intent": "other",
            "record_type": "meeting",
            "title": "",
            "date": "",
            "time": "",
            "responsible": "",
            "deadline_reference": "",
            "missing_fields": [],
        }
        with (
            patch(
                "app.features.intent_detection.generate_structured_response",
                return_value=intent,
            ) as structured_response,
            patch(
                "app.main.generate_natural_response",
                return_value="Posso ajudar com sua agenda.",
            ) as natural_response,
        ):
            response = self.client.post("/api/chat", json={"message": message})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"reply": "Posso ajudar com sua agenda.", "action": None},
        )
        self.assertIn(message, structured_response.call_args.args[0])
        self.assertIn(message, natural_response.call_args.args[0])

    def test_chat_returns_event_confirmation_without_persisting_it(self):
        intent = {
            "intent": "create_event",
            "record_type": "meeting",
            "title": "Consulta médica",
            "description": "Consulta de rotina",
            "date": "2030-05-14",
            "time": "10:30",
            "responsible": "",
            "deadline_reference": "",
            "missing_fields": [],
        }
        with patch(
            "app.features.intent_detection.generate_structured_response",
            return_value=intent,
        ) as structured_response:
            response = self.client.post(
                "/api/chat",
                json={"message": "Agende uma consulta médica em 14/05/2030 às 10h30"},
            )

        self.assertIn("14/05/2030 às 10h30", structured_response.call_args.args[0])
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["action"], "record_confirmation_required")
        self.assertEqual(body["record_type"], "meeting")
        self.assertEqual(body["record"]["title"], "Consulta médica")
        self.assertEqual(body["record"]["description"], "Consulta de rotina")
        self.assertEqual(body["record"]["starts_at"], "2030-05-14T10:30:00-03:00")
        self.assertEqual(body["record"]["ends_at"], "2030-05-14T11:30:00-03:00")
        self.assertIn("Confirme", body["reply"])

        events_response = self.client.get("/api/events")
        self.assertEqual(events_response.status_code, 200)
        self.assertNotIn(
            body["record"]["id"],
            [event["id"] for event in events_response.json()["events"]],
        )

    def test_confirming_chat_event_adds_it_to_pending_events(self):
        request_body = {
            "id": "1362d7e6-0b97-44e0-a419-2db508f0972c",
            "title": "Reunião de planejamento",
            "description": "Planejar as próximas entregas",
            "starts_at": "2030-05-14T10:30:00-03:00",
            "ends_at": "2030-05-14T11:30:00-03:00",
            "location": "",
            "status": "detected",
            "source": "manual",
        }

        response = self.client.post("/api/events", json=request_body)
        duplicate_response = self.client.post("/api/events", json=request_body)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["meeting"]["status"], "pending")
        self.assertEqual(
            response.json()["meeting"]["duration_minutes"],
            60,
        )
        self.assertEqual(duplicate_response.status_code, 201)
        events_response = self.client.get("/api/events")
        added_events = [
            event
            for event in events_response.json()["events"]
            if event["id"] == request_body["id"]
        ]
        self.assertEqual(len(added_events), 1)
        self.assertEqual(added_events[0]["title"], request_body["title"])
        self.assertEqual(
            added_events[0]["description"],
            request_body["description"],
        )

    def test_reviewing_email_event_accepts_to_pending_or_rejects(self):
        event_ids = {
            "accepted": "9c0fe3f0-5d77-4e0b-a905-9f3e5beff101",
            "rejected": "1cf4d891-d3eb-41bd-9c25-485344402f81",
        }
        from app.db import connect

        with connect() as connection:
            for action, event_id in event_ids.items():
                connection.execute(
                    """
                    INSERT INTO events(
                        id, user_id, source_ref, title, starts_at, ends_at,
                        status, source, updated_at
                    )
                    VALUES (?, 'demo', ?, ?, ?, ?, 'detected', 'email', ?)
                    """,
                    (
                        event_id,
                        f"thread-{action}",
                        f"Reunião {action}",
                        "2030-06-01T10:00:00-03:00",
                        "2030-06-01T11:00:00-03:00",
                        "2030-05-01T00:00:00-03:00",
                    ),
                )

        accepted = self.client.patch(
            f"/api/events/{event_ids['accepted']}",
            json={"status": "pending"},
        )
        rejected = self.client.patch(
            f"/api/events/{event_ids['rejected']}",
            json={"status": "rejected"},
        )

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["status"], "pending")
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["status"], "rejected")
        events = self.client.get("/api/events").json()["events"]
        self.assertIn("conflict", events[0])
        self.assertIn(
            event_ids["accepted"],
            [event["id"] for event in events if event["status"] == "pending"],
        )

    def test_confirmation_requires_timezone_and_positive_duration(self):
        request_body = {
            "id": "cdce4524-720b-4f2b-a0bb-0d3f858a040a",
            "title": "Reunião",
            "starts_at": "2030-05-14T10:30:00",
            "ends_at": "2030-05-14T11:30:00",
        }
        response = self.client.post("/api/events", json=request_body)

        self.assertEqual(response.status_code, 422)

    def test_chat_requests_missing_event_details_instead_of_creating(self):
        intent = {
            "intent": "create_event",
            "record_type": "meeting",
            "title": "Consulta médica",
            "date": "",
            "time": "",
            "responsible": "",
            "deadline_reference": "",
            "missing_fields": ["date", "time"],
        }
        with patch(
            "app.features.intent_detection.generate_structured_response",
            return_value=intent,
        ):
            response = self.client.post(
                "/api/chat",
                json={"message": "Agende uma consulta médica"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], None)
        self.assertIn("data, horário", response.json()["reply"])

    def test_chat_classifies_and_confirms_a_deadline_as_a_task(self):
        intent = {
            "intent": "create_event",
            "record_type": "deadline",
            "title": "Entregar relatório",
            "description": "Finalizar e enviar o relatório mensal",
            "date": "2030-05-14",
            "time": "",
            "responsible": "Diego",
            "deadline_reference": "até o fim do dia",
            "missing_fields": [],
        }
        with patch(
            "app.features.intent_detection.generate_structured_response",
            return_value=intent,
        ) as structured_response:
            response = self.client.post(
                "/api/chat",
                json={"message": "Tenho que entregar o relatório até 14/05"},
            )

        self.assertIn("prazo de tarefa", structured_response.call_args.args[0])
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["record_type"], "deadline")
        self.assertEqual(body["record"]["title"], "Entregar relatório")
        self.assertEqual(
            body["record"]["description"],
            "Finalizar e enviar o relatório mensal",
        )
        self.assertEqual(body["record"]["due_at"], "2030-05-14T23:59:00-03:00")

        confirmation = self.client.post("/api/tasks", json=body["record"])
        self.assertEqual(confirmation.status_code, 201)
        self.assertEqual(confirmation.json()["task"]["status"], "pending")

        dashboard = self.client.get("/api/dashboard")
        created_task = next(
            task for task in dashboard.json()["tasks"]
            if task["id"] == body["record"]["id"]
        )
        self.assertEqual(created_task["title"], "Entregar relatório")
        self.assertEqual(
            created_task["description"],
            "Finalizar e enviar o relatório mensal",
        )
        self.assertEqual(created_task["responsible"], "Diego")
        self.assertEqual(created_task["deadline_reference"], "até o fim do dia")

    def test_chat_rejects_blank_messages(self):
        response = self.client.post("/api/chat", json={"message": "   "})

        self.assertEqual(response.status_code, 422)

    def test_dashboard_returns_tasks_and_google_state(self):
        response = self.client.get("/api/dashboard")

        self.assertEqual(response.status_code, 200)
        self.assertIn("tasks", response.json())
        self.assertIn("google", response.json())


if __name__ == "__main__":
    unittest.main()
