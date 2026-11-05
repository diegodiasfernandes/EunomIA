import unittest
from datetime import date, datetime
from unittest.mock import MagicMock, patch

from googleapiclient.errors import HttpError
from httplib2 import Response

from app.calendar_agenda import AgendaAuthorizationError, TZ, list_agenda


def remote_event(event_id="external", **fields):
    return {
        "id": event_id, "summary": "Reunião Google", "status": "confirmed",
        "start": {"dateTime": "2026-11-05T10:00:00-03:00"},
        "end": {"dateTime": "2026-11-05T11:00:00-03:00"}, **fields,
    }


class CalendarAgendaTests(unittest.TestCase):
    def setUp(self):
        self.clock = patch("app.calendar_agenda.datetime", wraps=datetime).start()
        self.clock.now.return_value = datetime(2026, 11, 5, 12, tzinfo=TZ)
        self.creds = patch("app.calendar_agenda.google_credentials").start()
        self.creds.return_value.has_scopes.return_value = True
        self.service = patch("app.calendar_agenda.build").start().return_value
        self.connection = patch("app.calendar_agenda.connect").start().return_value.__enter__.return_value
        self.connection.execute.return_value.fetchall.return_value = []
        self.service.calendarList.return_value.list.return_value.execute.return_value = {
            "items": [{"id": "owner", "primary": True, "summary": "Pessoal"}]
        }
        self.service.events.return_value.list.return_value.execute.return_value = {"items": []}
        self.addCleanup(patch.stopall)

    def events(self, items):
        self.service.events.return_value.list.return_value.execute.return_value = {"items": items}

    def test_requires_connection_and_new_scope_without_calling_calendar(self):
        self.creds.return_value = None
        with self.assertRaises(AgendaAuthorizationError):
            list_agenda()
        self.creds.return_value = MagicMock()
        self.creds.return_value.has_scopes.return_value = False
        with self.assertRaises(AgendaAuthorizationError):
            list_agenda()
        self.service.calendarList.assert_not_called()

    def test_only_remote_registered_events_with_origin_dedup_and_updated_fields(self):
        self.connection.execute.return_value.fetchall.return_value = [
            {"id": "local", "provider_id": "linked", "status": "confirmed", "previous_status": None},
            {"id": "pending", "provider_id": "pending", "status": "pending", "previous_status": None},
            {"id": "cancelled", "provider_id": "cancelled", "status": "cancelled", "previous_status": None},
        ]
        linked = remote_event("linked", summary="Título atualizado no Google")
        self.events([linked, linked, remote_event(), remote_event("pending"), remote_event("cancelled"),
                     remote_event("deleted", status="cancelled"),
                     remote_event("declined", attendees=[{"self": True, "responseStatus": "declined"}])])
        result = list_agenda()
        self.assertEqual(len(result["events"]), 2)
        approved = next(event for event in result["events"] if event["origin"] == "eunomia")
        self.assertEqual(approved["local_id"], "local")
        self.assertEqual(approved["title"], "Título atualizado no Google")
        self.assertEqual(next(event for event in result["events"] if event["origin"] == "google")["calendar_name"], "Pessoal")
        self.assertEqual(result, list_agenda())
        self.assertTrue(all(call.args[0].startswith("SELECT") for call in self.connection.execute.call_args_list))
        for method in ("insert", "patch", "delete", "update"):
            getattr(self.service.events.return_value, method).assert_not_called()

    def test_paginates_calendars_and_events_and_keeps_calendar_identity(self):
        self.service.calendarList.return_value.list.return_value.execute.side_effect = [
            {"items": [{"id": "owner", "primary": True}], "nextPageToken": "cal-page"},
            {"items": [{"id": "shared", "summary": "Equipe"}]},
        ]
        self.service.events.return_value.list.return_value.execute.side_effect = [
            {"items": [remote_event("same")], "nextPageToken": "event-page"},
            {"items": [remote_event("second")]},
            {"items": [remote_event("same")]},
        ]
        events = list_agenda()["events"]
        self.assertEqual(len(events), 3)
        self.assertEqual(len({event["id"] for event in events}), 3)
        self.assertEqual(self.service.calendarList.return_value.list.call_args.kwargs["pageToken"], "cal-page")
        calls = self.service.events.return_value.list.call_args_list
        self.assertEqual(calls[1].kwargs["pageToken"], "event-page")
        self.assertEqual(calls[0].kwargs["timeMin"], "2026-11-05T00:00:00-03:00")
        self.assertTrue(calls[0].kwargs["singleEvents"])
        self.assertFalse(calls[0].kwargs["showDeleted"])

    def test_all_day_dates_sorting_and_past_filter(self):
        self.events([
            remote_event("late", start={"dateTime": "2026-11-06T16:00:00-03:00"}, end={"dateTime": "2026-11-06T17:00:00-03:00"}),
            remote_event("all-day", start={"date": "2026-11-05"}, end={"date": "2026-11-07"}),
            remote_event("past", start={"date": "2026-11-03"}, end={"date": "2026-11-04"}),
        ])
        result = list_agenda(date(2020, 1, 1))
        self.assertEqual(result["from_date"], "2026-11-05")
        self.assertEqual([event["google_event_id"] for event in result["events"]], ["all-day", "late"])
        self.assertTrue(result["events"][0]["all_day"])
        self.assertEqual(result["events"][0]["duration_minutes"], 2880)
        self.assertEqual(result["events"][0]["starts_at"], "2026-11-05")

    def test_recurring_instances_keep_eunomia_origin(self):
        self.connection.execute.return_value.fetchall.return_value = [
            {"id": "local", "provider_id": "series", "status": "pending", "previous_status": "confirmed"}
        ]
        self.events([remote_event("instance", recurringEventId="series")])
        self.assertEqual(list_agenda()["events"][0]["origin"], "eunomia")

    def test_calendar_access_failure_returns_warning(self):
        self.service.events.return_value.list.return_value.execute.side_effect = HttpError(Response({"status": "403"}), b"{}")
        result = list_agenda()
        self.assertTrue(result["warnings"])
        self.assertEqual(result["events"], [])

    def test_skips_holiday_and_contact_calendars_before_fetching_events(self):
        self.service.calendarList.return_value.list.return_value.execute.return_value = {
            "items": [
                {"id": "pt.brazilian#holiday@group.v.calendar.google.com", "summary": "Renomeado"},
                {"id": "usa__en@holiday.calendar.google.com"},
                {"id": "addressbook#contacts@group.v.calendar.google.com"},
                {"id": "owner", "primary": True},
                {"id": "shared", "summary": "Equipe"},
                {"id": "eunomia", "summary": "EunomIA"},
            ]
        }
        self.events([remote_event()])
        result = list_agenda()
        queried = [call.kwargs["calendarId"] for call in self.service.events.return_value.list.call_args_list]
        self.assertEqual(queried, ["owner", "shared", "eunomia"])
        self.assertEqual(len(result["events"]), 3)

    def test_hides_birthdays_in_primary_but_keeps_regular_and_eunomia_events(self):
        self.connection.execute.return_value.fetchall.return_value = [
            {"id": "local", "provider_id": "linked", "status": "confirmed", "previous_status": None}
        ]
        self.events([
            remote_event("birthday", eventType="birthday"),
            remote_event("linked", eventType="default"),
            remote_event("regular", summary="Planejar tarefas para o feriado", eventType="default"),
        ])
        result = list_agenda()["events"]
        self.assertEqual({event["google_event_id"] for event in result}, {"linked", "regular"})
        self.assertEqual(next(event for event in result if event["google_event_id"] == "linked")["origin"], "eunomia")

    def test_provider_outage_is_not_reported_as_empty_agenda(self):
        self.service.events.return_value.list.return_value.execute.side_effect = HttpError(Response({"status": "503"}), b"{}")
        with self.assertRaises(HttpError):
            list_agenda()

    def test_token_loading_preserves_granted_scopes_for_existing_accounts(self):
        import json
        from app.google_integration import google_credentials, integration_status

        old_scopes = ["https://www.googleapis.com/auth/calendar.events"]
        row = {"credentials_json": json.dumps({"scopes": old_scopes}), "account_email": "test@example.test"}
        with (
            patch("app.google_integration.connect") as db,
            patch("app.google_integration.Credentials.from_authorized_user_info") as credentials,
        ):
            db.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = row
            credentials.return_value.expired = False
            google_credentials()
            credentials.assert_called_once_with({"scopes": old_scopes})
            self.assertFalse(integration_status()["agenda_connected"])
            row["credentials_json"] = json.dumps({"scopes": old_scopes + [
                "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
            ]})
            self.assertTrue(integration_status()["agenda_connected"])

    def test_endpoint_returns_auth_error_and_safe_provider_error(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        with patch("app.main.list_agenda", side_effect=AgendaAuthorizationError("Reconecte Google")):
            self.assertEqual(client.get("/api/agenda").status_code, 403)
        with patch("app.main.list_agenda", side_effect=OSError("private token")):
            result = client.get("/api/agenda")
            self.assertEqual(result.status_code, 502)
            self.assertNotIn("private token", result.text)
        with patch("app.main.list_agenda", return_value={"events": []}) as listing:
            self.assertEqual(client.get("/api/agenda?from_date=2026-12-01").status_code, 200)
            listing.assert_called_once_with(date(2026, 12, 1))
