"""Scan observability without message text, account identifiers or provider URLs."""
from collections import Counter
from contextvars import ContextVar
from functools import wraps
import json
import logging
from uuid import uuid4

logger = logging.getLogger("uvicorn.error.eunomia.scan")
current = ContextVar("scan_diagnostics", default=None)


def count(name, amount=1):
    diagnostic = current.get()
    if diagnostic is not None:
        diagnostic["counts"][name] += amount


def note(stage, reason, **positions):
    diagnostic = current.get()
    if diagnostic is not None:
        data = {"scan_id": diagnostic["scan_id"], "stage": stage, "reason": reason}
        data.update({key: value for key, value in positions.items() if isinstance(value, int)})
        logger.info("scan_diagnostic %s", json.dumps(data, sort_keys=True))


def diagnosed_scan(function):
    @wraps(function)
    def run(*args, **kwargs):
        diagnostic = {"scan_id": str(uuid4()), "counts": Counter()}
        token = current.set(diagnostic)
        note("scan", "started")
        try:
            result = function(*args, **kwargs)
            result["diagnostics"] = {"scan_id": diagnostic["scan_id"], "counts": dict(diagnostic["counts"])}
            note("scan", "completed", **diagnostic["counts"])
            return result
        except Exception:
            note("scan", "failed", **diagnostic["counts"])
            raise
        finally:
            current.reset(token)
    return run
