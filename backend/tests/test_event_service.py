
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.features.event_service import save_event, sync_event_to_google


class EventServiceTests(unittest.TestCase):

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.db"

        with self.connect_test() as connection:
            connection.executescript("""
                CREATE TABLE users (
                    id TEXT PRIMARY KEY
                );

                CREATE TABLE events (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    source_ref TEXT,
                    provider_id TEXT,
                    title TEXT NOT NULL,
                    starts_at TEXT NOT NULL,
                    ends_at TEXT NOT NULL,
                    status TEXT,
                    source TEXT,
                    updated_at TEXT
                );

                INSERT INTO users (id)
                VALUES ('test-user');
            """)

        self.connect_patch = patch(
            "app.features.event_service.connect",
            side_effect=self.connect_test,
        )
        self.connect_patch.start()
        self.addCleanup(self.connect_patch.stop)
        self.addCleanup(self.directory.cleanup)

    def connect_test(self):
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        return connection

    def create_event(self):
        event = {
            "title": "Reunião com João",
            "date": "2026-10-19",
            "time": "14:00",
        }

        return save_event(
            event,
            user_id="test-user",
            conversation_id="test-conversation",
        )

    def test_save_event(self):
        event_id = self.create_event()

        repeated_id = self.create_event()

        with self.connect_test() as connection:
            saved = connection.execute(
                "SELECT * FROM events"
            ).fetchall()

        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["id"], event_id)
        self.assertEqual(repeated_id, event_id)
        self.assertEqual(saved[0]["title"], "Reunião com João")
        self.assertEqual(saved[0]["status"], "confirmed")

    def test_sync_event_to_google(self):
        event_id = self.create_event()

        with patch(
            "app.features.event_service.write_calendar_event",
            return_value="google-event-123",
        ) as google_mock:
            result = sync_event_to_google(event_id)

        self.assertTrue(result)
        google_mock.assert_called_once()

        with self.connect_test() as connection:
            saved = connection.execute(
                "SELECT provider_id FROM events WHERE id = ?",
                (event_id,),
            ).fetchone()

        self.assertEqual(saved["provider_id"], "google-event-123")

    def test_sync_does_not_duplicate_event(self):
        event_id = self.create_event()

        with patch(
            "app.features.event_service.write_calendar_event",
            return_value="google-event-123",
        ) as google_mock:
            first_result = sync_event_to_google(event_id)
            second_result = sync_event_to_google(event_id)

        self.assertTrue(first_result)
        self.assertTrue(second_result)
        self.assertEqual(google_mock.call_count, 1)

    def test_google_failure_keeps_local_event(self):
        event_id = self.create_event()

        with patch(
            "app.features.event_service.write_calendar_event",
            side_effect=RuntimeError("Erro na API do Google"),
        ):
            with self.assertRaises(RuntimeError):
                sync_event_to_google(event_id)

        with self.connect_test() as connection:
            saved = connection.execute(
                "SELECT * FROM events WHERE id = ?",
                (event_id,),
            ).fetchone()

        self.assertIsNotNone(saved)
        self.assertEqual(saved["status"], "confirmed")
        self.assertIsNone(saved["provider_id"])


if __name__ == "__main__":
    unittest.main()
