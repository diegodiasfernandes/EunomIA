import io
import json
import unittest
from urllib.error import HTTPError
from unittest.mock import MagicMock, call, patch

from app.assistant import (
    GeminiUnavailableError,
    generate_natural_response,
    generate_structured_response,
)


def http_error(status):
    return HTTPError("https://example.test", status, "error", {}, io.BytesIO(b"private details"))


@patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"})
class GeminiRetryTests(unittest.TestCase):
    def test_both_response_types_recover_from_temporary_failure(self):
        for structured in (False, True):
            with self.subTest(structured=structured):
                response = MagicMock()
                text = '{"answer":"ok"}' if structured else "ok"
                response.__enter__.return_value.read.return_value = json.dumps(
                    {"candidates": [{"content": {"parts": [{"text": text}]}}]}
                ).encode()
                with (
                    patch("app.assistant.urllib.request.urlopen", side_effect=[http_error(503), response]) as request,
                    patch("app.assistant.time.sleep") as sleep,
                ):
                    result = (
                        generate_structured_response("test", {"type": "OBJECT"})
                        if structured else generate_natural_response("test")
                    )
                self.assertEqual(result, {"answer": "ok"} if structured else "ok")
                self.assertEqual(request.call_count, 2)
                sleep.assert_called_once_with(1)

    def test_persistent_outage_stops_after_three_attempts(self):
        with (
            patch("app.assistant.urllib.request.urlopen", side_effect=[http_error(503) for _ in range(3)]) as request,
            patch("app.assistant.time.sleep") as sleep,
        ):
            with self.assertRaises(GeminiUnavailableError) as raised:
                generate_natural_response("test")
        self.assertEqual(request.call_count, 3)
        self.assertEqual(sleep.call_args_list, [call(1), call(2)])
        self.assertNotIn("private details", str(raised.exception))

    def test_auth_and_quota_errors_are_not_retried(self):
        for status in (400, 401, 403, 429):
            with (
                self.subTest(status=status),
                patch("app.assistant.urllib.request.urlopen", side_effect=http_error(status)) as request,
                patch("app.assistant.time.sleep") as sleep,
            ):
                with self.assertRaises(RuntimeError):
                    generate_natural_response("test")
                request.assert_called_once()
                sleep.assert_not_called()

    def test_sync_returns_service_unavailable_with_clear_message(self):
        from fastapi.testclient import TestClient
        from app.main import app

        with patch("app.main.sync_google", side_effect=GeminiUnavailableError("Temporariamente indisponível")):
            response = TestClient(app).post("/api/integrations/google/sync", json={})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["Retry-After"], "30")
        self.assertEqual(response.json()["detail"], "Temporariamente indisponível")
