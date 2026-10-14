import json
import os
import urllib.error
import urllib.request


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
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        text = payload["candidates"][0]["content"]["parts"][0]["text"]

    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8")
        raise RuntimeError(
            f"Erro HTTP {error.code} do Gemini: \n {details}"
        ) from error

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

    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
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
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        generated = payload["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(generated)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8")
        raise RuntimeError(
            f"Erro HTTP {error.code} do Gemini:\n{details}"
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Não foi possível consultar o Gemini: {error}") from error
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("O Gemini retornou uma resposta fora do formato JSON esperado.") from error

    if not isinstance(result, dict):
        raise RuntimeError("O Gemini retornou um JSON que não é um objeto.")
    return result
