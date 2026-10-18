
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
        print(
            "Saída:",
            json.dumps(response.json(), ensure_ascii=False, indent=2),
        )

    def test_google_status_returns_connection_state(self):
        path = "/api/integrations/google/status"
        response = self.client.get(path)
        self.show_exchange("GET", path, None, response)

        self.assertEqual(response.status_code, 200)
        self.assertIn("connected", response.json())

    def test_google_sync_uses_the_selected_email_date_range(self):
        result = {
            "calendar_events": 0,
            "emails": 8,
            "email_threads_with_events": 2,
        }
        request_body = {
            "email_since": "2026-09-01",
            "email_until": "2026-09-29",
        }
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
        request_body = {
            "email_since": "2026-09-29",
            "email_until": "2026-09-01",
        }
        path = "/api/integrations/google/sync"

        with patch("app.main.sync_google") as sync:
            response = self.client.post(path, json=request_body)

        self.show_exchange("POST", path, request_body, response)

        self.assertEqual(response.status_code, 422)
        sync.assert_not_called()

    def test_non_google_routes_are_not_registered(self):
        path = "/api/mock/extracted-events-deadlines"
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_events_route_is_registered(self):
        response = self.client.get("/api/events")

        self.assertEqual(response.status_code, 200)
        self.assertIn("events", response.json())


if __name__ == "__main__":
    unittest.main()
