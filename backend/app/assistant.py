import json
import os
import time
import urllib.error
import urllib.request
from .scan_diagnostics import count, note


class GeminiUnavailableError(RuntimeError):
    """Temporary provider failure after bounded retries."""


def _request_payload(request: urllib.request.Request) -> dict:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            status = error.code
            count("gemini_http_errors")
            if status == 429:
                count("gemini_rate_limited")
            note("gemini", "http_failure", status=status, attempt=attempt + 1)
            error.close()
            if status in {500, 502, 503, 504}:
                if attempt < 2:
                    count("gemini_retries")
                    time.sleep(2 ** attempt)
                    continue
                raise GeminiUnavailableError(
                    "O serviço de análise de e-mails está temporariamente indisponível. "
                    "Tentamos novamente automaticamente, mas o Gemini continua ocupado. "
                    "Aguarde alguns instantes e inicie a varredura novamente."
                ) from None
            raise RuntimeError(
                f"Não foi possível consultar o Gemini (HTTP {status}). "
                "Verifique a chave, as permissões e os limites da API."
            ) from None


def generate_natural_response(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LookupError("GEMINI_API_KEY não configurada")

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        payload = _request_payload(request)
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
    
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Não foi possível consultar o Gemini: {error}") from error
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("O Gemini retornou uma resposta fora do formato esperado.") from error

    if not isinstance(text, str) or not text.strip():
        raise RuntimeError("O Gemini retornou uma resposta natural vazia.")
    return text.strip()


def generate_structured_response(prompt: str, response_structure: dict) -> dict:
    if not isinstance(response_structure, dict) or not response_structure:
        raise ValueError("response_structure deve ser um schema JSON não vazio.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LookupError("GEMINI_API_KEY não configurada")

    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": response_structure,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        count("gemini_requests")
        payload = _request_payload(request)
        usage = payload.get("usageMetadata", {})
        for field in ("promptTokenCount", "candidatesTokenCount", "totalTokenCount"):
            if isinstance(usage.get(field), int):
                count("gemini_" + field, usage[field])
        candidates = payload.get("candidates") or []
        if not candidates or payload.get("promptFeedback", {}).get("blockReason"):
            note("gemini", "blocked_or_empty")
            raise RuntimeError("O Gemini não concluiu a análise desta conversa. Nenhum resultado parcial foi confirmado.")
        finish = candidates[0].get("finishReason", "STOP")
        if finish != "STOP":
            count("gemini_incomplete_responses")
            note("gemini", "output_limit" if finish == "MAX_TOKENS" else "incomplete_response")
            raise RuntimeError("O Gemini interrompeu a análise antes de concluí-la. Reduza o período ou tente novamente; resultados parciais não foram confirmados.")
        generated = payload["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(generated)
    except (urllib.error.URLError, TimeoutError) as error:
        note("gemini", "network_failure")
        raise RuntimeError("Não foi possível consultar o Gemini. Tente novamente em instantes.") from None
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("O Gemini retornou uma resposta fora do formato JSON esperado.") from error

    if not isinstance(result, dict):
        raise RuntimeError("O Gemini retornou um JSON que não é um objeto.")
    return result
