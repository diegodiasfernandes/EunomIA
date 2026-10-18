
import unittest
from unittest.mock import patch

from app.features.chat_manager import (
    process_message,
    conversations,
)


class ChatManagerTests(unittest.TestCase):

    def setUp(self):
        conversations.clear()

    @patch("app.features.chat_manager.detect_intent")
    def test_missing_information(self, mock_detect):
        mock_detect.return_value = {
            "intent": "create_event",
            "title": "Reunião com João",
            "date": "",
            "time": "",
            "missing_fields": ["date", "time"],
        }

        result = process_message(
            "Marque uma reunião com João"
        )

        self.assertEqual(
            result["status"], "collecting"
        )
        self.assertIn(
            "date", result["missing_fields"]
        )
        self.assertIn(
            "time", result["missing_fields"]
        )

    @patch("app.features.chat_manager.save_event", return_value="test-event-id")
    @patch("app.features.chat_manager.detect_intent")
    def test_complete_conversation(self, mock_detect, mock_save):
        mock_detect.side_effect = [
            {
                "intent": "create_event",
                "title": "Reunião com João",
                "date": "",
                "time": "",
                "missing_fields": ["date", "time"],
            },
            {
                "intent": "create_event",
                "title": "Reunião com João",
                "date": "2026-10-19",
                "time": "14:00",
                "missing_fields": [],
            },
        ]

        first = process_message(
            "Marque uma reunião com João"
        )

        second = process_message(
            "Amanhã às 14h",
            first["conversation_id"],
        )

        self.assertEqual(
            second["status"],
            "awaiting_confirmation",
        )

        third = process_message(
            "sim",
            first["conversation_id"],
        )

        self.assertEqual(
            third["status"], "confirmed"
        )
        self.assertEqual(
            third["event"]["title"],
            "Reunião com João",
        )
        self.assertEqual(
            third["event"]["time"], "14:00"
        )

    @patch("app.features.chat_manager.detect_intent")
    def test_cancel_event(self, mock_detect):
        mock_detect.return_value = {
            "intent": "create_event",
            "title": "Consulta médica",
            "date": "2026-10-20",
            "time": "10:00",
            "missing_fields": [],
        }

        first = process_message(
            "Marque uma consulta"
        )

        result = process_message(
            "não",
            first["conversation_id"],
        )

        self.assertEqual(
            result["status"], "cancelled"
        )
        self.assertIsNone(result["event"])

    @patch("app.features.chat_manager.detect_intent")
    def test_other_intent(self, mock_detect):
        mock_detect.return_value = {
            "intent": "other",
            "title": "",
            "date": "",
            "time": "",
            "missing_fields": [],
        }

        result = process_message("Olá!")

        self.assertEqual(
            result["status"], "other"
        )


if __name__ == "__main__":
    unittest.main()
