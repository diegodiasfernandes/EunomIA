import os

import sqlite3

from contextlib import contextmanager

from datetime import datetime, time, timedelta

from pathlib import Path


def database_path() -> Path:
    configured = os.getenv("DATABASE_PATH", "./eunomia.db")

    path = Path(configured)

    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path

    path.parent.mkdir(parents=True, exist_ok=True)

    return path


@contextmanager
def connect():
    connection = sqlite3.connect(database_path())

    connection.row_factory = sqlite3.Row

    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database():
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                provider_id TEXT,
                source_ref TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                location TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'confirmed',
                source TEXT NOT NULL DEFAULT 'manual',
                preparation TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, provider_id),
                UNIQUE(user_id, source_ref)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
                source_ref TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                responsible TEXT,
                due_at TEXT,
                deadline_reference TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                source TEXT NOT NULL DEFAULT 'manual',
                UNIQUE(user_id, source_ref)
            );

            CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                provider_id TEXT UNIQUE,
                conversation_id TEXT NOT NULL,
                subject TEXT NOT NULL,
                sender TEXT NOT NULL DEFAULT '',
                received_at TEXT NOT NULL,
                snippet TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS email_events (
                email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
                event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                PRIMARY KEY(email_id, event_id)
            );

            CREATE TABLE IF NOT EXISTS integrations (
                name TEXT PRIMARY KEY,
                credentials_json TEXT NOT NULL,
                account_email TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS oauth_states (
                state TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                code_verifier TEXT
            );
            """
        )

        oauth_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(oauth_states)"
            ).fetchall()
        }

        if "code_verifier" not in oauth_columns:
            connection.execute(
                "ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT"
            )

        task_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(tasks)"
            ).fetchall()
        }

        if "source_ref" not in task_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN source_ref TEXT"
            )

        if "responsible" not in task_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN responsible TEXT"
            )

        if "description" not in task_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT ''"
            )

        if "deadline_reference" not in task_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN deadline_reference TEXT"
            )

        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
            idx_tasks_source_ref
            ON tasks(user_id, source_ref)
            """
        )

        connection.execute(
            """
            INSERT OR IGNORE INTO users(
                id,
                email,
                display_name
            )
            VALUES (?, ?, ?)
            """,
            (
                "demo",
                "demo@eunomia.app",
                "Diego",
            ),
        )

        if connection.execute(
            "SELECT COUNT(*) FROM events"
        ).fetchone()[0] == 0:
            _seed_demo_data(connection)


def _seed_demo_data(connection: sqlite3.Connection):
    from uuid import uuid4

    now = datetime.now().astimezone()

    today = now.date()

    event_id = str(uuid4())

    start = datetime.combine(
        today,
        time(15, 0),
        tzinfo=now.tzinfo,
    )

    if start <= now:
        start = datetime.combine(
            today + timedelta(days=1),
            time(15, 0),
            tzinfo=now.tzinfo,
        )

    end = start + timedelta(hours=1)

    connection.execute(
        """
        INSERT INTO events(
            id,
            user_id,
            source_ref,
            title,
            description,
            starts_at,
            ends_at,
            location,
            status,
            source,
            preparation,
            updated_at
        )
        VALUES (
            ?,
            'demo',
            'demo-thread-reuniao-pedro',
            ?,
            ?,
            ?,
            ?,
            ?,
            'detected',
            'email',
            ?,
            ?
        )
        """,
        (
            event_id,
            "Reunião de planejamento com Pedro",
            (
                "Conversa consolidada: sugestão inicial, "
                "confirmação do horário e link da reunião."
            ),
            start.isoformat(),
            end.isoformat(),
            "Google Meet",
            "Revisar a apresentação antes do encontro.",
            now.isoformat(),
        ),
    )

    confirmed_start = start + timedelta(days=1)

    connection.execute(
        """
        INSERT INTO events(
            id,
            user_id,
            title,
            description,
            starts_at,
            ends_at,
            location,
            status,
            source,
            updated_at
        )
        VALUES (
            ?,
            'demo',
            ?,
            ?,
            ?,
            ?,
            ?,
            'confirmed',
            'calendar',
            ?
        )
        """,
        (
            str(uuid4()),
            "Revisão do projeto EunomIA",
            "Revisão semanal do protótipo.",
            confirmed_start.isoformat(),
            (
                confirmed_start
                + timedelta(hours=1)
            ).isoformat(),
            "Sala 2",
            now.isoformat(),
        ),
    )

    connection.execute(
        """
        INSERT INTO tasks(
            id,
            user_id,
            event_id,
            title,
            due_at,
            status,
            source
        )
        VALUES (
            ?,
            'demo',
            ?,
            ?,
            ?,
            'pending',
            'email'
        )
        """,
        (
            str(uuid4()),
            event_id,
            "Revisar a apresentação para a reunião",
            (
                start
                - timedelta(hours=2)
            ).isoformat(),
        ),
    )

    first_email = str(uuid4())
    second_email = str(uuid4())

    for (
        email_id,
        subject,
        sender,
        snippet,
        received_at,
    ) in (
        (
            first_email,
            "Reunião de planejamento",
            "pedro@exemplo.com",
            "Podemos conversar esta semana sobre o planejamento?",
            (
                now
                - timedelta(days=2)
            ).isoformat(),
        ),
        (
            second_email,
            "Re: Reunião de planejamento",
            "pedro@exemplo.com",
            (
                "Confirmado para o horário combinado. "
                "Segue o link; por favor, revise a apresentação."
            ),
            (
                now
                - timedelta(days=1)
            ).isoformat(),
        ),
    ):
        connection.execute(
            """
            INSERT INTO emails(
                id,
                user_id,
                conversation_id,
                subject,
                sender,
                received_at,
                snippet
            )
            VALUES (
                ?,
                'demo',
                'demo-thread-reuniao-pedro',
                ?,
                ?,
                ?,
                ?
            )
            """,
            (
                email_id,
                subject,
                sender,
                received_at,
                snippet,
            ),
        )

        connection.execute(
            """
            INSERT INTO email_events(
                email_id,
                event_id
            )
            VALUES (?, ?)
            """,
            (
                email_id,
                event_id,
            ),
        )
