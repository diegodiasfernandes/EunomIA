import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.assistant import generate_natural_response, generate_structured_response
from app.db import connect, initialize_database
from app.features.conflict_management import identify_conflicts
from app.google_integration import sync_google
from app.models import MeetingRecord
from app.mock_data import load_extracted_schedule_mock, load_raw_email_thread_mock


def make_meeting(
    meeting_id: str,
    title: str,
    starts_at: datetime,
    ends_at: datetime | None = None,
    duration_minutes: int | None = None,
    status: str = "confirmed",
) -> MeetingRecord:
    return MeetingRecord(
        id=meeting_id,
        title=title,
        starts_at=starts_at,
        ends_at=ends_at,
        duration_minutes=duration_minutes,
        status=status,
        source="test",
    )


class AssistantTests(unittest.TestCase):
    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"})
    @patch("app.assistant.urllib.request.urlopen")
    def test_returns_natural_response_from_gemini(self, urlopen):
        response = urlopen.return_value.__enter__.return_value
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": "Resposta natural"}]}}
                ]
            }
        ).encode()

        result = generate_natural_response("Responda brevemente.")

        self.assertEqual(result, "Resposta natural")
        request = urlopen.call_args.args[0]
        self.assertIn("Responda brevemente.", request.data.decode())

    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"})
    @patch("app.assistant.urllib.request.urlopen")
    def test_returns_json_matching_the_supplied_schema(self, urlopen):
        response = urlopen.return_value.__enter__.return_value
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": '{"answer":"42"}'}]}}
                ]
            }
        ).encode()
        response_schema = {
            "type": "OBJECT",
            "properties": {"answer": {"type": "STRING"}},
            "required": ["answer"],
        }

        result = generate_structured_response("Responda em JSON.", response_schema)

        self.assertEqual(result, {"answer": "42"})
        request_body = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(
            request_body["generationConfig"]["responseSchema"], response_schema
        )

    def test_rejects_empty_response_schema(self):
        with self.assertRaises(ValueError):
            generate_structured_response("prompt", {})

    def test_gmail_sync_does_not_call_google_calendar_api(self):
        gmail = MagicMock()
        gmail.users.return_value.messages.return_value.list.return_value.execute.return_value = {}

        with (
            patch("app.google_integration.google_credentials", return_value=object()),
            patch("app.google_integration.build", return_value=gmail) as build,
            patch("app.google_integration.connect"),
        ):
            result = sync_google()

        self.assertEqual(result["emails"], 0)
        self.assertEqual(result["email_threads_with_events"], 0)
        self.assertEqual(result["pending_items"], 0)
        self.assertEqual(build.call_count, 1)
        self.assertEqual(build.call_args.args[:2], ("gmail", "v1"))
        gmail.users.return_value.messages.return_value.list.assert_called_once()

    def test_rescan_reopens_existing_meetings_in_pending(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "rescan.sqlite"
            gmail = MagicMock()
            messages = gmail.users.return_value.messages.return_value
            messages.list.return_value.execute.return_value = {
                "messages": [
                    {"id": "message-rejected"},
                    {"id": "message-pending"},
                    {"id": "message-new"},
                    {"id": "message-confirmed"},
                ]
            }
            received_at = datetime.now(timezone.utc)
            messages.get.return_value.execute.side_effect = [
                {
                    "id": "message-rejected",
                    "threadId": "thread-rejected",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {
                        "headers": [
                            {"name": "Subject", "value": "Reunião recusada"},
                            {"name": "From", "value": "Ana Silva <ana@example.com>"},
                        ]
                    },
                },
                {
                    "id": "message-pending",
                    "threadId": "thread-pending",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {
                        "headers": [{"name": "Subject", "value": "Reunião aceita"}]
                    },
                },
                {
                    "id": "message-new",
                    "threadId": "thread-new",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {
                        "headers": [{"name": "Subject", "value": "Reunião nova"}]
                    },
                },
                {
                    "id": "message-confirmed",
                    "threadId": "thread-confirmed",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {
                        "headers": [{"name": "Subject", "value": "Reunião confirmada"}]
                    },
                },
            ]
            extracted_event = {
                "is_event": True,
                "title": "Reunião",
                "date": "2030-06-01",
                "time": "10:00",
                "duration_minutes": 60,
                "location": "",
                "description": "",
                "preparation": "",
                "cancelled": False,
            }
            extracted_without_schedule = {
                **extracted_event,
                "date": "",
                "time": "",
                "duration_minutes": 0,
            }

            with patch("app.db.database_path", return_value=database):
                initialize_database()
                with connect() as connection:
                    for status, thread_id in (
                        ("rejected", "thread-rejected"),
                        ("pending", "thread-pending"),
                        ("confirmed", "thread-confirmed"),
                    ):
                        connection.execute(
                            """
                            INSERT INTO events(
                                id, user_id, source_ref, title, starts_at,
                                ends_at, status, source, updated_at
                            )
                            VALUES (?, 'demo', ?, ?, ?, ?, ?, 'email', ?)
                            """,
                            (
                                f"event-{status}",
                                thread_id,
                                f"Reunião {status}",
                                "2030-06-01T10:00:00-03:00",
                                "2030-06-01T11:00:00-03:00",
                                status,
                                received_at.isoformat(),
                            ),
                        )

                with (
                    patch(
                        "app.google_integration.google_credentials",
                        return_value=object(),
                    ),
                    patch("app.google_integration.build", return_value=gmail),
                    patch(
                        "app.google_integration.generate_structured_response",
                        side_effect=[
                            extracted_without_schedule,
                            extracted_event,
                            extracted_event,
                            extracted_event,
                        ],
                    ),
                ):
                    result = sync_google(
                        date.today() - timedelta(days=1),
                        date.today(),
                    )

                with connect() as connection:
                    events = {
                        row["source_ref"]: dict(row)
                        for row in connection.execute(
                            """
                            SELECT source_ref, status, starts_at, inferred_fields,
                                   description, sender
                            FROM events
                            WHERE source_ref IN (
                                'thread-rejected', 'thread-pending',
                                'thread-new', 'thread-confirmed'
                            )
                            """
                        )
                    }

            self.assertEqual(result["email_threads_with_events"], 4)
            self.assertEqual(result["pending_items"], 4)
            self.assertEqual(events["thread-rejected"]["status"], "pending")
            self.assertEqual(events["thread-pending"]["status"], "pending")
            self.assertEqual(events["thread-new"]["status"], "pending")
            self.assertEqual(events["thread-confirmed"]["status"], "pending")
            self.assertEqual(
                events["thread-rejected"]["sender"],
                "Ana Silva <ana@example.com>",
            )
            self.assertIn(
                "Remetente(s): Ana Silva <ana@example.com>",
                events["thread-rejected"]["description"],
            )
            self.assertEqual(
                datetime.fromisoformat(events["thread-rejected"]["starts_at"]).hour,
                9,
            )
            inferred_fields = json.loads(
                events["thread-rejected"]["inferred_fields"]
            )
            self.assertTrue(any("Data não informada" in item for item in inferred_fields))
            self.assertTrue(any("Horário não informado" in item for item in inferred_fields))

    def test_cancelled_email_records_are_removed_instead_of_persisted(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "cancelled.sqlite"
            gmail = MagicMock()
            messages = gmail.users.return_value.messages.return_value
            messages.list.return_value.execute.return_value = {
                "messages": [
                    {"id": "cancelled-meeting-message"},
                    {"id": "cancelled-deadline-message"},
                ]
            }
            received_at = datetime.now(timezone.utc)
            messages.get.return_value.execute.side_effect = [
                {
                    "id": "cancelled-meeting-message",
                    "threadId": "cancelled-meeting-thread",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {"headers": [{"name": "Subject", "value": "Reunião cancelada"}]},
                },
                {
                    "id": "cancelled-deadline-message",
                    "threadId": "cancelled-deadline-thread",
                    "internalDate": str(int(received_at.timestamp() * 1000)),
                    "payload": {"headers": [{"name": "Subject", "value": "Prazo cancelado"}]},
                },
            ]
            cancelled_meeting = {
                "is_event": True,
                "record_type": "meeting",
                "title": "Reunião",
                "date": "2030-06-01",
                "time": "10:00",
                "duration_minutes": 60,
                "location": "",
                "description": "",
                "preparation": "",
                "cancelled": True,
            }
            cancelled_deadline = {
                **cancelled_meeting,
                "record_type": "deadline",
                "responsible": "",
                "deadline_reference": "",
            }

            with patch("app.db.database_path", return_value=database):
                initialize_database()
                with connect() as connection:
                    connection.execute(
                        """
                        INSERT INTO events(
                            id, user_id, source_ref, title, starts_at, ends_at,
                            status, source, updated_at
                        )
                        VALUES (
                            'old-meeting', 'demo', 'cancelled-meeting-thread',
                            'Reunião antiga', '2030-06-01T10:00:00-03:00',
                            '2030-06-01T11:00:00-03:00', 'pending', 'email', ?
                        )
                        """,
                        (received_at.isoformat(),),
                    )
                    connection.execute(
                        """
                        INSERT INTO tasks(
                            id, user_id, source_ref, title, status, source
                        )
                        VALUES (
                            'old-deadline', 'demo',
                            'email-deadline:cancelled-deadline-thread',
                            'Prazo antigo', 'pending', 'email'
                        )
                        """
                    )

                with (
                    patch("app.google_integration.google_credentials", return_value=object()),
                    patch("app.google_integration.build", return_value=gmail),
                    patch(
                        "app.google_integration.generate_structured_response",
                        side_effect=[cancelled_meeting, cancelled_deadline],
                    ),
                ):
                    result = sync_google(date.today() - timedelta(days=1), date.today())

                with connect() as connection:
                    event_count = connection.execute(
                        """
                        SELECT COUNT(*) FROM events
                        WHERE source_ref = 'cancelled-meeting-thread'
                        """
                    ).fetchone()[0]
                    task_count = connection.execute(
                        """
                        SELECT COUNT(*) FROM tasks
                        WHERE source_ref IN (
                            'cancelled-meeting-thread',
                            'email-deadline:cancelled-deadline-thread'
                        )
                        """
                    ).fetchone()[0]

            self.assertEqual(result["email_threads_with_events"], 0)
            self.assertEqual(result["pending_items"], 0)
            self.assertEqual(event_count, 0)
            self.assertEqual(task_count, 0)

    def test_email_deadline_is_saved_as_task_without_meeting_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "deadline.sqlite"
            gmail = MagicMock()
            messages = gmail.users.return_value.messages.return_value
            messages.list.return_value.execute.return_value = {
                "messages": [{"id": "deadline-message"}]
            }
            received_at = datetime.now(timezone.utc)
            messages.get.return_value.execute.return_value = {
                "id": "deadline-message",
                "threadId": "deadline-thread",
                "internalDate": str(int(received_at.timestamp() * 1000)),
                "payload": {
                    "headers": [{"name": "Subject", "value": "Enviar relatório"}]
                },
            }
            extracted_deadline = {
                "is_event": True,
                "record_type": "deadline",
                "title": "Enviar relatório",
                "date": "",
                "time": "",
                "duration_minutes": 0,
                "description": "Enviar o relatório mensal",
                "responsible": "Ana",
                "deadline_reference": "",
                "cancelled": False,
            }

            with patch("app.db.database_path", return_value=database):
                initialize_database()
                with (
                    patch(
                        "app.google_integration.google_credentials",
                        return_value=object(),
                    ),
                    patch("app.google_integration.build", return_value=gmail),
                    patch(
                        "app.google_integration.generate_structured_response",
                        return_value=extracted_deadline,
                    ),
                ):
                    result = sync_google(
                        date.today() - timedelta(days=1),
                        date.today(),
                    )

                with connect() as connection:
                    task = connection.execute(
                        """
                        SELECT title, description, responsible, due_at, status,
                               source, inferred_fields
                        FROM tasks
                        WHERE source_ref = 'email-deadline:deadline-thread'
                        """
                    ).fetchone()
                    meeting_count = connection.execute(
                        "SELECT COUNT(*) FROM events WHERE source_ref = 'deadline-thread'"
                    ).fetchone()[0]

            self.assertEqual(result["email_threads_with_events"], 1)
            self.assertEqual(result["pending_items"], 1)
            self.assertIsNotNone(task)
            self.assertEqual(task["status"], "pending")
            self.assertEqual(task["source"], "email")
            self.assertEqual(task["due_at"], None)
            self.assertEqual(task["responsible"], "Ana")
            self.assertIn("Prazo não informado", task["inferred_fields"])
            self.assertEqual(meeting_count, 0)


class MockFixtureTests(unittest.TestCase):
    def test_raw_thread_mock_contains_emails_for_extraction_scenarios(self):
        thread = load_raw_email_thread_mock()
        self.assertEqual(len(thread["emails"]), 11)
        self.assertEqual(thread["emails"][0]["id"], "email_01")

    def test_extracted_mock_separates_meeting_from_task_deadlines(self):
        meetings, deadlines = load_extracted_schedule_mock()
        self.assertEqual(len(meetings), 1)
        self.assertIsNone(meetings[0].ends_at)
        self.assertEqual(len(deadlines), 6)
        self.assertTrue(all(not hasattr(deadline, "conflict") for deadline in deadlines))


class ConflictManagementTests(unittest.TestCase):
    def test_marks_known_overlap_and_mutates_then_returns_same_list(self):
        start = datetime.now().astimezone() + timedelta(days=5)
        meetings = [
            make_meeting(
                "first",
                "Reunião",
                start,
                ends_at=start + timedelta(hours=1),
            ),
            make_meeting(
                "second",
                "Consulta",
                start + timedelta(minutes=30),
                ends_at=start + timedelta(hours=2),
            ),
        ]

        result = identify_conflicts(meetings)

        self.assertIs(result, meetings)
        self.assertEqual([meeting.conflict for meeting in meetings], [True, True])
        self.assertEqual(meetings[0].conflicts_with[0].id, "second")
        self.assertEqual(meetings[0].conflicts_with[0].certainty, "confirmed")

    def test_marks_possible_overlap_when_meeting_duration_is_unknown(self):
        start = datetime.now().astimezone() + timedelta(days=5)
        meetings = [
            make_meeting("first", "Sem duração", start),
            make_meeting(
                "second",
                "Reunião seguinte",
                start + timedelta(minutes=30),
                ends_at=start + timedelta(minutes=90),
            ),
        ]

        identify_conflicts(meetings)

        self.assertTrue(meetings[0].conflict)
        self.assertTrue(meetings[1].conflict)
        self.assertEqual(meetings[0].conflicts_with[0].certainty, "possible")
        self.assertEqual(meetings[0].conflicts_with[0].title, "Reunião seguinte")

    def test_clears_conflicts_and_ignores_cancelled_meetings(self):
        start = datetime.now().astimezone() + timedelta(days=5)
        meetings = [
            make_meeting(
                "cancelled",
                "Cancelada",
                start,
                ends_at=start + timedelta(hours=1),
                status="cancelled",
            ),
            make_meeting(
                "active",
                "Ativa",
                start,
                ends_at=start + timedelta(hours=1),
            ),
        ]

        identify_conflicts(meetings)

        self.assertFalse(meetings[0].conflict)
        self.assertFalse(meetings[1].conflict)
        self.assertEqual(meetings[0].conflicts_with, [])
        self.assertEqual(meetings[1].conflicts_with, [])


if __name__ == "__main__":
    unittest.main()
