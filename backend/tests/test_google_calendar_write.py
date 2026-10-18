import unittest
from unittest.mock import MagicMock, patch

from googleapiclient.errors import HttpError
from httplib2 import Response

from app.google_integration import write_calendar_event


class GoogleCalendarWriteTests(unittest.TestCase):

    def test_existing_google_event_is_reused(self):
        event = {
            "id": "12345678-1234-1234-1234-123456789abc",
            "title": "Reunião de teste",
            "starts_at": "2026-10-20T14:00:00-03:00",
            "ends_at": "2026-10-20T15:00:00-03:00",
        }

        expected_id = "e12345678123412341234123456789abc"

        calendar = MagicMock()

        conflict = HttpError(
            Response({"status": 409}),
            b'{"error": {"message": "Already exists"}}',
        )

        calendar.events.return_value.insert.return_value.execute.side_effect = conflict
        calendar.events.return_value.get.return_value.execute.return_value = {
            "id": expected_id
        }

        with patch(
            "app.google_integration.google_credentials",
            return_value=MagicMock(),
        ), patch(
            "app.google_integration.build",
            return_value=calendar,
        ):
            result = write_calendar_event(event)

        self.assertEqual(result, expected_id)

        calendar.events.return_value.get.assert_called_once_with(
            calendarId="primary",
            eventId=expected_id,
        )


if __name__ == "__main__":
    unittest.main()
