import base64
import json
import os
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.db import connect, initialize_database
from app.google_integration import create_calendar_event, sync_google
from app.mail_scan import CalendarLookup, load_threads, message_body, scan_timezone


def meeting(**fields):
    return {"is_event": True, "record_type": "meeting", "title": "Reunião Projeto Atlas",
            "date": "2026-11-08", "time": "15:00", "duration_minutes": 60,
            "description": "Alinhamento", "location": "Meet", "preparation": "",
            "cancelled": False, "origin_message_id": "first", **fields}


class EmailScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = patch.dict(os.environ, {"DATABASE_PATH": str(Path(self.temp.name) / "scan.sqlite"), "USER_TIMEZONE": "America/Sao_Paulo"})
        environment.start()
        self.addCleanup(environment.stop)
        initialize_database()
        with connect() as connection:
            for table in ("email_events", "emails", "tasks", "events", "decision_history"):
                connection.execute(f"DELETE FROM {table}")
        self.clock = patch("app.google_integration.datetime", wraps=datetime).start()
        self.clock.now.return_value = datetime(2026, 11, 5, 15, tzinfo=timezone.utc)
        self.threads = {"atlas": [{"id": "first", "thread_id": "atlas", "subject": "Projeto Atlas",
                                   "sender": "Ana <ana@example.test>", "received_at": "2026-11-04T10:00:00-03:00",
                                   "snippet": "", "body": "Vamos alinhar o Projeto Atlas."}]}
        patch("app.google_integration.google_credentials", return_value=MagicMock()).start()
        patch("app.google_integration.build").start()
        patch("app.google_integration.load_threads", return_value=self.threads).start()
        self.model = patch("app.google_integration.generate_structured_response").start()
        self.calendar = patch("app.google_integration.CalendarLookup").start().return_value
        self.calendar.matching.return_value = False
        self.addCleanup(patch.stopall)

    def scan(self, records):
        self.model.return_value = {"records": records}
        return sync_google(date(2026, 11, 1), date(2026, 11, 5))

    def events(self):
        with connect() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM events ORDER BY source_ref")]

    def add_known(self, status="confirmed", source="atlas", title="Reunião Projeto Atlas", provider=None):
        with connect() as connection:
            connection.execute("INSERT INTO events(id,user_id,source_ref,title,starts_at,ends_at,status,provider_id,updated_at,location,source) VALUES ('known','demo',?,?, '2026-11-08T15:00:00-03:00','2026-11-08T16:00:00-03:00',?,?, '2026-11-04','Meet','email')", (source,title,status,provider))

    def reply(self):
        self.threads["atlas"].append({**self.threads["atlas"][0], "id": "reply", "received_at": "2026-11-05T10:00:00-03:00", "body": "Atualização mais recente"})

    def test_future_event_is_created_once_and_unchanged_thread_reuses_extraction(self):
        self.assertEqual(self.scan([meeting()])["pending_items"], 1)
        self.assertEqual(self.scan([meeting()])["pending_items"], 0)
        self.assertEqual(len(self.events()), 1)
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual(self.events()[0]["starts_at"], "2026-11-08T15:00:00-03:00")

    def test_past_and_ongoing_meetings_do_not_create_approvals(self):
        self.assertEqual(self.scan([meeting(date="2026-11-04")])["skipped"]["past"], 1)
        self.reply()
        self.assertEqual(self.scan([meeting(date="2026-11-05", time="11:30")])["skipped"]["ongoing"], 1)
        self.assertFalse(self.events())
        self.calendar.matching.assert_not_called()

    def test_timezone_and_exact_end_boundary(self):
        self.assertEqual(self.scan([meeting(date="2026-11-05", time="11:00")])["skipped"]["past"], 1)
        self.reply()
        self.assertEqual(self.scan([meeting(date="2026-11-05", time="11:30", time_zone="America/New_York")])["pending_items"], 1)
        self.assertTrue(self.events()[0]["starts_at"].endswith("-05:00"))

    def test_all_day_uses_exclusive_end_and_does_not_assume_nine_am(self):
        item = meeting(date="2026-11-04", time="", all_day=True, end_date="2026-11-06")
        self.assertEqual(self.scan([item])["pending_items"], 1)
        row = self.events()[0]
        self.assertEqual(row["starts_at"], "2026-11-04T00:00:00-03:00")
        self.assertEqual(row["ends_at"], "2026-11-06T00:00:00-03:00")
        self.assertEqual(row["all_day"], 1)
        self.assertNotIn("09:00", row["inferred_fields"])

    def test_past_all_day_event_is_not_created(self):
        result = self.scan([meeting(date="2026-11-04", all_day=True, time="", end_date="2026-11-05")])
        self.assertEqual(result["skipped"]["past"],1)
        self.assertFalse(self.events())

    def test_event_already_in_calendar_does_not_create_local_proposal(self):
        self.calendar.matching.return_value = True
        self.assertEqual(self.scan([meeting()])["pending_items"],0)
        self.assertFalse(self.events())

    def test_closed_local_history_prevents_duplicates_from_another_thread(self):
        for status in ("confirmed", "rejected", "cancelled", "dismissed"):
            with self.subTest(status=status):
                with connect() as connection:
                    connection.execute("DELETE FROM events")
                self.add_known(status, source="other-thread")
                self.assertEqual(self.scan([meeting()])["pending_items"],0)
                self.assertEqual(len(self.events()),1)

    def test_approved_item_is_not_reopened_for_sender_or_description_noise(self):
        self.add_known(provider="google-id")
        result=self.scan([meeting(description="Outra redação sem mudança de horário")])
        self.assertEqual(result["pending_items"],0)
        self.assertEqual(self.events()[0]["status"],"confirmed")

    def test_reschedule_stages_one_update_and_preserves_original_status(self):
        self.add_known(provider="google-id")
        first = self.scan([meeting(time="17:00")])
        self.assertEqual(first["pending_items"],1)
        row=self.events()[0]
        self.assertEqual(row["previous_status"],"confirmed")
        self.assertEqual(row["pending_action"],"update")
        self.assertIn("17:00",row["pending_payload"])
        self.assertEqual(self.scan([meeting(time="17:00")])["pending_items"],0)
        self.reply()
        self.assertEqual(self.scan([meeting(time="18:00")])["pending_items"],1)
        self.assertEqual(self.events()[0]["previous_status"],"confirmed")

    def test_cancelled_new_meeting_is_not_created_and_existing_requires_confirmation(self):
        self.assertEqual(self.scan([meeting(cancelled=True)])["pending_items"],0)
        self.assertFalse(self.events())
        self.add_known(provider="google-id")
        self.reply()
        self.assertEqual(self.scan([meeting(cancelled=True)])["pending_items"],1)
        self.assertEqual(self.events()[0]["pending_action"],"cancel")

    def test_overdue_task_is_kept_and_completed_task_is_not_created(self):
        task=meeting(record_type="deadline",title="Entregar relatório Atlas",date="2026-11-01",responsible="Ana")
        self.assertEqual(self.scan([task])["pending_items"],1)
        self.assertFalse(self.events())
        self.reply()
        self.assertEqual(self.scan([{**task,"completed":True}])["pending_items"],0)
        with connect() as connection:
            self.assertEqual(connection.execute("SELECT status FROM tasks WHERE source='email'").fetchone()[0],"done")

    def test_thread_can_produce_a_meeting_and_multiple_independent_tasks(self):
        items=[meeting(),meeting(record_type="deadline",title="Relatório",date="2026-11-01"),meeting(record_type="deadline",title="Revisar contrato",date="2026-11-09")]
        self.assertEqual(self.scan(items)["pending_items"],3)
        self.assertEqual(self.scan(items)["pending_items"],0)
        with connect() as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks WHERE source='email'").fetchone()[0],2)
        prompt=self.model.call_args.args[0]
        self.assertIn("PARA CADA ITEM",prompt)
        self.assertIn("Projeto Atlas",prompt)

    def test_new_meeting_with_same_title_in_same_thread_is_not_a_reschedule(self):
        self.scan([meeting()])
        self.reply()
        result = self.scan([meeting(), meeting(date="2026-11-10", origin_message_id="reply")])
        self.assertEqual(result["pending_items"], 1)
        self.assertEqual(len(self.events()), 2)

    def test_event_that_finishes_while_extraction_is_running_is_not_created(self):
        def finish_later(*args):
            self.clock.now.return_value = datetime(2026, 11, 9, tzinfo=timezone.utc)
            return {"records": [meeting()]}
        self.model.side_effect = finish_later
        self.assertEqual(self.scan([meeting()])["pending_items"], 0)
        self.assertFalse(self.events())

    def test_unspecified_dates_or_times_are_not_invented(self):
        result=self.scan([meeting(date=""),meeting(title="Sem horário",time=""),meeting(title="Data final inválida",date="2026-11-08",all_day=True,end_date="2026-11-07")])
        self.assertEqual(result["skipped"]["unscheduled"],3)
        self.assertFalse(self.events())

    def test_expired_proposals_are_preserved_in_history_and_calendar_failure_rolls_back(self):
        self.add_known(status="pending")
        with connect() as connection:
            connection.execute("UPDATE events SET starts_at='2026-11-04T10:00:00-03:00',ends_at='2026-11-04T11:00:00-03:00'")
        self.scan([meeting(date="2026-11-04")])
        self.assertEqual(self.events()[0]["status"],"expired")
        self.reply()
        self.calendar.matching.side_effect=OSError("Calendar indisponível")
        with self.assertRaises(OSError):
            self.scan([meeting(time="17:00")])
        self.assertEqual(self.events()[0]["status"],"expired")

    def remote(self, **fields):
        return {"provider_id":"remote-id","calendar_id":"shared","title":"Reunião Projeto Atlas",
                "starts_at":"2026-11-08T15:00:00-03:00","ends_at":"2026-11-08T16:00:00-03:00",
                "description":"","location":"Meet","participants":[],"all_day":False, **fields}

    def test_real_gemini_clock_format_with_seconds_is_accepted_for_meetings_and_tasks(self):
        result=self.scan([meeting(time="15:00:00"),meeting(record_type="deadline",title="Prazo Atlas",time="14:30:00")])
        self.assertEqual(result["pending_items"],2)
        self.assertEqual(result["skipped"]["unscheduled"],0)
        with connect() as connection:
            self.assertIn("14:30:00",connection.execute("SELECT due_at FROM tasks WHERE source='email'").fetchone()[0])

    def test_stale_update_of_approved_past_event_restores_decision_without_deleting_event(self):
        self.add_known(status="pending",provider="google-id")
        with connect() as connection:
            connection.execute("UPDATE events SET ends_at='2026-11-04T11:00:00-03:00',pending_action='update',previous_status='confirmed',pending_payload=?",(json.dumps({"ends_at":"2026-11-04T12:00:00-03:00"}),))
        self.scan([])
        row=self.events()[0]
        self.assertEqual(row["status"],"confirmed")
        self.assertIsNone(row["pending_action"])
        self.assertEqual(row["provider_id"],"google-id")

    def test_future_reschedule_of_old_event_is_not_expired(self):
        self.add_known(status="pending",provider="google-id")
        with connect() as connection:
            connection.execute("UPDATE events SET ends_at='2026-11-04T11:00:00-03:00',pending_action='update',previous_status='confirmed',pending_payload=?",(json.dumps({"ends_at":"2026-11-08T12:00:00-03:00"}),))
        self.scan([])
        self.assertEqual(self.events()[0]["status"],"pending")
        self.assertEqual(self.events()[0]["pending_action"],"update")

    def test_verified_external_reschedule_updates_correct_calendar_after_confirmation(self):
        from fastapi.testclient import TestClient
        from app.main import app
        self.calendar.result={"state":"update","event":self.remote(),"candidates":[]}
        result=self.scan([meeting(time="17:00")])
        self.assertEqual(result["pending_items"],1)
        row=self.events()[0]
        self.assertEqual(row["source"],"calendar")
        self.assertEqual(row["provider_calendar_id"],"shared")
        self.assertEqual(row["pending_action"],"update")
        self.assertEqual(self.scan([meeting(time="17:00")])["pending_items"],0)
        with patch("app.main.update_calendar_event") as update,patch("app.main.create_calendar_event") as create:
            response=TestClient(app).patch(f"/api/events/{row['id']}",json={"status":"confirmed"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(update.call_args.args[0],"remote-id")
        self.assertEqual(update.call_args.kwargs["calendar_id"],"shared")
        create.assert_not_called()

    def test_external_cancel_is_associated_and_never_creates_a_new_google_event(self):
        from fastapi.testclient import TestClient
        from app.main import app
        self.calendar.matching.return_value=True
        self.calendar.result={"state":"exact","event":self.remote(),"candidates":[]}
        self.assertEqual(self.scan([meeting(cancelled=True)])["pending_items"],1)
        row=self.events()[0]
        self.assertEqual(row["pending_action"],"cancel")
        with patch("app.main.delete_calendar_event") as delete,patch("app.main.create_calendar_event") as create:
            response=TestClient(app).patch(f"/api/events/{row['id']}",json={"status":"cancelled"})
        self.assertEqual(response.status_code,200)
        delete.assert_called_once_with("remote-id",calendar_id="shared")
        create.assert_not_called()

    def test_possible_duplicate_is_preserved_for_review_and_not_recreated_on_repeat(self):
        from fastapi.testclient import TestClient
        from app.main import app
        self.calendar.result={"state":"possible","event":None,"candidates":[self.remote()]}
        self.assertEqual(self.scan([meeting()])["pending_items"],1)
        self.assertEqual(self.scan([meeting()])["pending_items"],0)
        result=TestClient(app).get("/api/events").json()["events"][0]
        self.assertTrue(result["possible_duplicate"])
        self.assertEqual(len(result["duplicate_candidates"]),1)

    def test_ambiguous_cancellation_is_review_only_even_after_repeated_scan(self):
        from fastapi.testclient import TestClient
        from app.main import app
        self.calendar.result={"state":"possible","event":None,"candidates":[self.remote()]}
        self.scan([meeting(cancelled=True)])
        self.assertEqual(self.scan([meeting(cancelled=True)])["pending_items"],0)
        row=self.events()[0]
        self.assertTrue(row["review_only"])
        self.assertIsNone(row["provider_id"])
        with patch("app.main.create_calendar_event") as create:
            response=TestClient(app).patch(f"/api/events/{row['id']}",json={"status":"confirmed"})
        self.assertEqual(response.status_code,409)
        create.assert_not_called()

    def test_explicitly_approved_possible_duplicate_is_not_reopened_on_rescan(self):
        from fastapi.testclient import TestClient
        from app.main import app
        self.calendar.result={"state":"possible","event":None,"candidates":[self.remote()]}
        self.scan([meeting()])
        row=self.events()[0]
        with patch("app.main.create_calendar_event",return_value="created-id"):
            response=TestClient(app).patch(f"/api/events/{row['id']}",json={"status":"confirmed"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.scan([meeting()])["pending_items"],0)
        self.assertEqual(self.events()[0]["status"],"confirmed")

    def test_diagnostics_do_not_log_titles_bodies_addresses_or_credentials(self):
        self.threads["atlas"][0]["body"]="private-body test-secret secret@example.test"
        with self.assertLogs("uvicorn.error.eunomia.scan",level="INFO") as log:
            result=self.scan([meeting()])
        text="\n".join(log.output)
        for private in ("private-body","test-secret","secret@example.test","Reunião Projeto Atlas"):
            self.assertNotIn(private,text)
        self.assertIn("scan_id",text)
        self.assertEqual(result["diagnostics"]["counts"]["identified_meetings"],1)
        self.assertEqual(result["threads"],1)

    def test_invitation_uid_is_not_assigned_to_unrelated_meeting_in_same_thread(self):
        self.threads["atlas"][0]["body"]="BEGIN:VEVENT\nUID:private-uid\nEND:VEVENT"
        self.reply()
        self.scan([meeting(),meeting(date="2026-11-10",origin_message_id="reply")])
        calls=self.calendar.matching.call_args_list
        self.assertEqual(calls[0].kwargs["calendar_uid"],"private-uid")
        self.assertIsNone(calls[1].kwargs["calendar_uid"])


class GmailContextTests(unittest.TestCase):
    def test_paginated_search_loads_complete_thread_including_messages_outside_period(self):
        gmail=MagicMock()
        gmail.users.return_value.messages.return_value.list.return_value.execute.side_effect=[
            {"messages":[{"id":"new","threadId":"atlas"}],"nextPageToken":"page2"},
            {"messages":[{"id":"new","threadId":"atlas"},{"id":"other","threadId":"second"}]},
        ]
        def message(mid, stamp, text):
            return {"id":mid,"internalDate":str(stamp),"payload":{"mimeType":"text/html","headers":[],"body":{"data":base64.urlsafe_b64encode(text.encode()).decode()}}}
        gmail.users.return_value.threads.return_value.get.return_value.execute.side_effect=[
            {"messages":[message("new",2000,"<p>Remarcada</p>"),message("old",1000,"<p>Proposta original</p>")]},
            {"messages":[message("other",3000,"<p>Tarefa</p>")]},
        ]
        with patch.dict(os.environ,{"USER_TIMEZONE":"America/Sao_Paulo"}):
            threads=load_threads(gmail,date(2026,11,1),date(2026,11,5))
            lower=int(datetime(2026,11,1,tzinfo=scan_timezone()).timestamp())
        self.assertEqual([m["id"] for m in threads["atlas"]],["old","new"])
        self.assertIn("Proposta original",threads["atlas"][0]["body"])
        calls=gmail.users.return_value.messages.return_value.list.call_args_list
        self.assertIn(f"after:{lower-1}",calls[0].kwargs["q"])
        self.assertEqual(calls[1].kwargs["pageToken"],"page2")
        self.assertEqual(gmail.users.return_value.threads.return_value.get.call_count,2)

    def test_html_and_calendar_invitation_are_available_to_extractor(self):
        encode=lambda text:base64.urlsafe_b64encode(text.encode()).decode()
        payload={"parts":[{"mimeType":"text/html","body":{"data":encode("<style>hidden</style><p>Projeto Atlas &amp; equipe</p>")}},
                          {"mimeType":"text/calendar","body":{"data":encode("BEGIN:VEVENT\nMETHOD:CANCEL\nUID:atlas\nEND:VEVENT")}}]}
        text=message_body(payload)
        self.assertIn("Projeto Atlas & equipe",text)
        self.assertIn("METHOD:CANCEL",text)
        self.assertNotIn("hidden",text)

    def test_remote_calendar_pagination_and_timezone_equivalence(self):
        service=MagicMock()
        credentials=MagicMock()
        credentials.has_scopes.return_value=True
        service.calendarList.return_value.list.return_value.execute.return_value={"items":[{"id":"primary"}]}
        service.events.return_value.list.return_value.execute.side_effect=[
            {"items":[],"nextPageToken":"next"},
            {"items":[{"summary":"Reuniao Projeto Atlas","start":{"dateTime":"2026-11-08T18:00:00Z"},"end":{"dateTime":"2026-11-08T19:00:00Z"}}]},
        ]
        with patch("app.mail_scan.build",return_value=service):
            self.assertTrue(CalendarLookup(credentials).matching("Reunião Projeto Atlas","2026-11-08T15:00:00-03:00","2026-11-08T16:00:00-03:00"))
        self.assertEqual(service.events.return_value.list.call_count,2)
        service.events.return_value.insert.assert_not_called()

    def test_remote_invitation_uid_matches_renamed_calendar_event(self):
        service=MagicMock()
        credentials=MagicMock()
        credentials.has_scopes.return_value=True
        service.calendarList.return_value.list.return_value.execute.return_value={"items":[{"id":"primary"}]}
        service.events.return_value.list.return_value.execute.return_value={"items":[
            {"summary":"Outro título", "iCalUID":"atlas-uid", "start":{"dateTime":"2026-11-08T18:00:00Z"},"end":{"dateTime":"2026-11-08T19:00:00Z"}}
        ]}
        with patch("app.mail_scan.build",return_value=service):
            self.assertTrue(CalendarLookup(credentials).matching("Atlas","2026-11-08T15:00:00-03:00","2026-11-08T16:00:00-03:00",calendar_uid="atlas-uid"))

    def test_unknown_duration_does_not_duplicate_google_event_with_known_end(self):
        service=MagicMock()
        credentials=MagicMock()
        credentials.has_scopes.return_value=True
        service.calendarList.return_value.list.return_value.execute.return_value={"items":[{"id":"primary"}]}
        service.events.return_value.list.return_value.execute.return_value={"items":[
            {"summary":"Atlas", "start":{"dateTime":"2026-11-08T18:00:00Z"},"end":{"dateTime":"2026-11-08T18:30:00Z"}}
        ]}
        with patch("app.mail_scan.build",return_value=service):
            self.assertTrue(CalendarLookup(credentials).matching("Atlas","2026-11-08T15:00:00-03:00","2026-11-08T16:00:00-03:00",end_inferred=True))

    def test_all_day_confirmation_uses_date_fields_in_google(self):
        service=MagicMock()
        service.events.return_value.insert.return_value.execute.return_value={"id":"all-day"}
        with patch("app.google_integration.google_credentials",return_value=object()),patch("app.google_integration.integration_status",return_value={"calendar_connected":True}),patch("app.google_integration.build",return_value=service):
            create_calendar_event(title="Atlas",description="",starts_at=datetime(2026,11,5,tzinfo=scan_timezone()),ends_at=datetime(2026,11,6,tzinfo=scan_timezone()),location="",all_day=True)
        self.assertEqual(service.events.return_value.insert.call_args.kwargs["body"]["start"],{"date":"2026-11-05"})
