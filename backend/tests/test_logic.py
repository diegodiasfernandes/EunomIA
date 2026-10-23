import json
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from app.assistant import generate_natural_response, generate_structured_response
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
        self.assertEqual(build.call_count, 1)
        self.assertEqual(build.call_args.args[:2], ("gmail", "v1"))
        gmail.users.return_value.messages.return_value.list.assert_called_once()


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
