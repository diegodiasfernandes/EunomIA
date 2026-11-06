import json
import unittest
from unittest.mock import MagicMock, patch

from app.assistant import generate_structured_response
from app.event_matching import classify, resolve
from app.scan_diagnostics import diagnosed_scan


class EventMatchingTests(unittest.TestCase):
    def candidate(self, **fields):
        return {"title":"Atlas", "starts_at":"2026-11-08T15:00:00-03:00", "ends_at":"2026-11-08T16:00:00-03:00",
                "participants":["a@example.test","b@example.test"], **fields}

    def remote(self, **fields):
        return {**self.candidate(), "provider_id":"event-id", "calendar_id":"shared", **fields}

    def test_participants_distinguish_exact_match_from_possible_duplicate(self):
        self.assertEqual(classify(self.candidate(),self.remote()),"exact")
        self.assertEqual(classify(self.candidate(participants=["other@example.test"]),self.remote()),"possible")
        self.assertEqual(classify(self.candidate(participants=[]),self.remote()),"possible")

    def test_title_alone_never_proves_same_event(self):
        self.assertNotEqual(classify(self.candidate(starts_at="2026-11-15T15:00:00-03:00",ends_at="2026-11-15T16:00:00-03:00"),self.remote()),"exact")
        self.assertEqual(classify(self.candidate(title="Consulta odontológica",participants=["other@example.test"]),self.remote()),"unrelated")

    def test_verified_uid_allows_date_change_but_not_arbitrary_recurring_occurrence(self):
        candidate=self.candidate(calendar_uid="uid",starts_at="2026-11-09T15:00:00-03:00",ends_at="2026-11-09T16:00:00-03:00")
        self.assertEqual(classify(candidate,self.remote(calendar_uid="uid")),"update")
        self.assertEqual(classify(candidate,self.remote(calendar_uid="uid",recurring=True)),"possible")
        self.assertEqual(classify(self.candidate(calendar_uid="uid"),self.remote(calendar_uid="uid",series_master=True)),"possible")

    def test_multiple_matches_require_review(self):
        result=resolve(self.candidate(),[self.remote(),self.remote(provider_id="second")])
        self.assertEqual(result["state"],"possible")
        self.assertEqual(len(result["candidates"]),2)

    def test_identifier_needs_correct_calendar_and_nonempty_id(self):
        self.assertEqual(classify(self.candidate(title="Outro",participants=[]),self.remote(participants=[])),"unrelated")
        changed=self.candidate(provider_id="event-id",provider_calendar_id="shared",title="Renomeado")
        self.assertEqual(classify(changed,self.remote()),"exact")
        self.assertNotEqual(classify({**changed,"provider_calendar_id":"other"},self.remote()),"exact")


class GeminiDiagnosticsTests(unittest.TestCase):
    def response(self, payload):
        response=MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps(payload).encode()
        return response

    def test_truncated_valid_json_is_not_accepted_as_complete_extraction(self):
        payload={"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":'{"records":[]}'}]}}]}
        with patch.dict("os.environ",{"GEMINI_API_KEY":"private-key"}),patch("app.assistant.urllib.request.urlopen",return_value=self.response(payload)):
            with self.assertRaises(RuntimeError):
                generate_structured_response("private email",{"type":"OBJECT"})

    def test_prompt_blocking_is_reported_without_leaking_content(self):
        @diagnosed_scan
        def scan():
            generate_structured_response("private-email-content",{"type":"OBJECT"})
        payload={"promptFeedback":{"blockReason":"SAFETY"}}
        with patch.dict("os.environ",{"GEMINI_API_KEY":"private-key"}),patch("app.assistant.urllib.request.urlopen",return_value=self.response(payload)),self.assertLogs("uvicorn.error.eunomia.scan",level="INFO") as logs:
            with self.assertRaises(RuntimeError):
                scan()
        text="\n".join(logs.output)
        self.assertIn("blocked_or_empty",text)
        self.assertNotIn("private-key",text)
        self.assertNotIn("private-email-content",text)
