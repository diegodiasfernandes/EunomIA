import io
import json
import os
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from uuid import uuid4

from fastapi.testclient import TestClient

from app.account_session import archive_id
from app.db import connect, initialize_database
from app.google_accounts import disconnect_google, revoke_token
from app.google_integration import SCOPES, begin_oauth, finish_oauth, google_credentials, integration_status
from app.main import app


class GoogleAccountsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {"DATABASE_PATH": str(Path(self.temp.name) / "accounts.sqlite")})
        self.env.start()
        self.addCleanup(self.env.stop)
        initialize_database()
        with connect() as connection:
            self.initial_events = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        self.client = TestClient(app)

    def credentials(self):
        return {"token": "fake-token", "refresh_token": "fake-refresh", "client_id": "test", "client_secret": "test", "scopes": SCOPES}

    def authorize(self, email, name="Nome real"):
        state = str(uuid4())
        with connect() as connection:
            connection.execute("INSERT INTO oauth_states(state,created_at,code_verifier) VALUES (?,?,?)", (state, datetime.now(timezone.utc).isoformat(), "verifier"))
        credentials = MagicMock()
        credentials.to_json.return_value = json.dumps(self.credentials())
        credentials.has_scopes.return_value = True
        flow = MagicMock(credentials=credentials)
        service = MagicMock()
        service.users.return_value.getProfile.return_value.execute.return_value = {"emailAddress": email}
        service.userinfo.return_value.get.return_value.execute.return_value = {"name": name}
        with patch("app.google_integration.Flow.from_client_config", return_value=flow), patch("app.google_integration.build", return_value=service):
            with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test", "GOOGLE_CLIENT_SECRET": "test"}):
                return finish_oauth("http://localhost/callback?code=fake&state=" + state, state)

    def add_records(self, label):
        event_id = str(uuid4())
        task_id = str(uuid4())
        email_id = str(uuid4())
        with connect() as connection:
            connection.execute("INSERT INTO events(id,user_id,provider_id,title,starts_at,ends_at,updated_at) VALUES (?,'demo',? ,?,'2026-11-07T10:00:00-03:00','2026-11-07T11:00:00-03:00','2026-11-05')", (event_id, "same-provider-id", label))
            connection.execute("INSERT INTO tasks(id,user_id,title,status) VALUES (?,'demo',?,'pending')", (task_id, label))
            connection.execute("INSERT INTO emails(id,user_id,provider_id,conversation_id,subject,received_at) VALUES (?,'demo','same-message-id','same-thread',?,'2026-11-05')", (email_id, label))
            connection.execute("INSERT INTO email_events(email_id,event_id) VALUES (?,?)", (email_id,event_id))
            connection.execute("INSERT INTO decision_history(user_id,record_type,record_id,action,created_at) VALUES ('demo','meeting',?,'confirmed','2026-11-05')", (event_id,))
        return event_id,task_id,email_id

    def test_disconnect_removes_tokens_and_states_but_preserves_account_records(self):
        self.authorize("a@example.test")
        ids = self.add_records("Conta A")
        with connect() as connection:
            connection.execute("INSERT INTO oauth_states(state,created_at) VALUES ('pending','2026-11-05')")
        with patch("app.google_accounts.revoke_token") as revoke:
            response = self.client.post("/api/integrations/google/disconnect", json={"expected_email": "a@example.test", "confirmed": True})
        self.assertEqual(response.status_code, 200)
        revoke.assert_called_once_with("fake-refresh")
        self.assertFalse(integration_status()["connected"])
        self.assertIsNone(google_credentials())
        self.assertEqual(self.client.get("/api/events").json()["events"], [])
        self.assertEqual(self.client.get("/api/dashboard").json()["tasks"], [])
        self.assertEqual(self.client.get("/api/agenda").status_code, 403)
        with connect() as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM integrations").fetchone()[0],0)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM oauth_states").fetchone()[0],0)
            for table in ("events","tasks","emails","decision_history"):
                self.assertEqual(connection.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id=?",(archive_id("a@example.test"),)).fetchone()[0],1)
            self.assertIsNotNone(connection.execute("SELECT * FROM email_events WHERE event_id=?",(ids[0],)).fetchone())

    def test_switching_accounts_restores_only_matching_records_and_handles_same_provider_ids(self):
        self.authorize("a@example.test")
        ids_a = self.add_records("Conta A")
        with patch("app.google_accounts.revoke_token"):
            disconnect_google("a@example.test")
        self.authorize("b@example.test")
        self.assertEqual(self.client.get("/api/events").json()["events"], [])
        self.add_records("Conta B")
        self.assertEqual(self.client.patch(f"/api/events/{ids_a[0]}", json={"status":"cancelled"}).status_code,404)
        with patch("app.google_accounts.revoke_token"):
            disconnect_google("b@example.test")
        self.authorize("A@example.test")
        self.assertEqual([event["title"] for event in self.client.get("/api/events").json()["events"]],["Conta A"])
        with connect() as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM emails WHERE provider_id='same-message-id'").fetchone()[0],1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM events").fetchone()[0],self.initial_events + 2)

    def test_failed_revocation_keeps_connection_and_workspace(self):
        self.authorize("a@example.test")
        self.add_records("Conta A")
        with patch("app.google_accounts.revoke_token", side_effect=RuntimeError("private details")):
            response = self.client.post("/api/integrations/google/disconnect",json={"expected_email":"a@example.test","confirmed":True})
        self.assertEqual(response.status_code,502)
        self.assertNotIn("private details",response.text)
        self.assertTrue(integration_status()["connected"])
        self.assertEqual(len(self.client.get("/api/events").json()["events"]),1)

    def test_confirmation_and_matching_account_are_required(self):
        self.authorize("a@example.test")
        with patch("app.google_accounts.revoke_token") as revoke:
            self.assertEqual(self.client.post("/api/integrations/google/disconnect",json={"expected_email":"a@example.test"}).status_code,422)
            self.assertEqual(self.client.post("/api/integrations/google/disconnect",json={"expected_email":"a@example.test","confirmed":False}).status_code,422)
            self.assertEqual(self.client.post("/api/integrations/google/disconnect",json={"expected_email":"b@example.test","confirmed":True}).status_code,409)
        revoke.assert_not_called()

    def test_cannot_replace_active_account_and_pending_oauth_is_invalidated(self):
        self.authorize("a@example.test")
        with self.assertRaises(ValueError):
            self.authorize("b@example.test")
        self.assertEqual(integration_status()["email"],"a@example.test")
        with patch("app.google_accounts.revoke_token"):
            disconnect_google("a@example.test")
        with self.assertRaises(ValueError):
            finish_oauth("http://localhost/callback", "old-state")

    def test_profile_session_persistence_and_stale_request_protection(self):
        self.authorize("a@example.test","Nome verdadeiro")
        first = integration_status()
        self.assertEqual(first["name"],"Nome verdadeiro")
        self.assertEqual(self.client.get("/api/integrations/google/status").headers["Cache-Control"], "no-store")
        self.assertNotIn("fake-token", self.client.get("/api/integrations/google/status").text)
        initialize_database()
        self.assertEqual(integration_status()["connection_id"],first["connection_id"])
        with patch("app.google_accounts.revoke_token"):
            disconnect_google("a@example.test")
        self.authorize("b@example.test")
        self.assertEqual(self.client.post("/api/integrations/google/sync",json={},headers={"X-Eunomia-Connection":first["connection_id"]}).status_code,409)
        self.assertEqual(self.client.get("/api/events",headers={"X-Eunomia-Connection":first["connection_id"]}).status_code,409)

    def test_disconnect_waits_for_inflight_sync_before_removing_credentials(self):
        from app.main import google_sync
        self.authorize("a@example.test")
        running, release, finished = threading.Event(), threading.Event(), threading.Event()
        errors = []

        def scan(*args):
            running.set()
            if not release.wait(3):
                raise RuntimeError("test scan timeout")
            return {"emails": 0}

        def disconnect():
            try:
                disconnect_google("a@example.test")
            except Exception as error:
                errors.append(error)
            finally:
                finished.set()

        with patch("app.main.sync_google", side_effect=scan), patch("app.google_accounts.revoke_token") as revoke:
            scanner = threading.Thread(target=google_sync)
            scanner.start()
            self.assertTrue(running.wait(2))
            disconnector = threading.Thread(target=disconnect)
            disconnector.start()
            try:
                self.assertFalse(finished.wait(.05))
                revoke.assert_not_called()
            finally:
                release.set()
                scanner.join(3)
                disconnector.join(3)
        self.assertFalse(errors)
        self.assertTrue(finished.is_set())
        self.assertIsNone(google_credentials())

    def test_oauth_prompts_for_account_selection(self):
        with patch("app.google_integration.Flow.from_client_config") as factory, patch.dict(os.environ,{"GOOGLE_CLIENT_ID":"test","GOOGLE_CLIENT_SECRET":"test"}):
            factory.return_value.authorization_url.return_value=("https://example.test", "test-state")
            factory.return_value.code_verifier="test-verifier"
            begin_oauth()
            self.assertEqual(factory.return_value.authorization_url.call_args.kwargs["prompt"],"consent select_account")

    def test_revocation_success_invalid_token_and_network_failure(self):
        response=MagicMock()
        response.__enter__.return_value.status=200
        with patch("app.google_accounts.urllib.request.urlopen",return_value=response) as request:
            revoke_token("fake")
            self.assertEqual(request.call_args.args[0].full_url,"https://oauth2.googleapis.com/revoke")
            self.assertEqual(request.call_args.args[0].method,"POST")
        invalid=HTTPError("https://example.test",400,"bad",{},io.BytesIO(b'{"error":"invalid_token"}'))
        with patch("app.google_accounts.urllib.request.urlopen",side_effect=invalid):
            revoke_token("fake")
        with patch("app.google_accounts.urllib.request.urlopen",side_effect=URLError("unavailable")):
            with self.assertRaises(RuntimeError):
                revoke_token("fake")
        unavailable = HTTPError("https://example.test",503,"unavailable",{},io.BytesIO(b"private details"))
        with patch("app.google_accounts.urllib.request.urlopen",side_effect=unavailable):
            with self.assertRaises(RuntimeError) as raised:
                revoke_token("fake")
            self.assertNotIn("private details",str(raised.exception))
