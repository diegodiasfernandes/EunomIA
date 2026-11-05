import json
import urllib.error
import urllib.parse
import urllib.request

from .account_session import account_operation, archive_workspace
from .db import connect


class AccountChangedError(ValueError):
    pass


def revoke_token(token: str):
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/revoke",
        data=urllib.parse.urlencode({"token": token}).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise RuntimeError("O Google não confirmou a revogação. Tente desconectar novamente.")
    except urllib.error.HTTPError as error:
        try:
            already_invalid = error.code == 400 and json.loads(error.read()).get("error") == "invalid_token"
        except (ValueError, TypeError):
            already_invalid = False
        finally:
            error.close()
        if not already_invalid:
            raise RuntimeError("Não foi possível revogar a autorização no Google. A desconexão não foi concluída; tente novamente.") from None
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Não foi possível contatar o Google. A desconexão não foi concluída; tente novamente.") from None


@account_operation
def disconnect_google(expected_email: str) -> dict:
    with connect() as connection:
        row = connection.execute("SELECT * FROM integrations WHERE name='google'").fetchone()
        if not row:
            connection.execute("DELETE FROM oauth_states")
            return {"connected": False, "revoked": False}
        email = row["account_email"]
        if email.strip().casefold() != expected_email.strip().casefold():
            raise AccountChangedError("A conta conectada mudou. Atualize o painel e confirme novamente.")
        credentials = json.loads(row["credentials_json"])
        if not isinstance(credentials, dict):
            raise ValueError("A autorização armazenada é inválida. A desconexão não foi concluída.")
        token = credentials.get("refresh_token") or credentials.get("token")
        if token:
            revoke_token(token)
        archive_workspace(connection, email)
        connection.execute("DELETE FROM integrations WHERE name='google'")
        connection.execute("DELETE FROM oauth_states")
    return {"connected": False, "revoked": bool(token)}
