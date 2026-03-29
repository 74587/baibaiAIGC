from __future__ import annotations

import json
import os
from urllib import error, request


def build_chat_endpoint(base_url: str) -> str:
    normalized_base_url = base_url.rstrip("/")
    if normalized_base_url.endswith("/chat/completions"):
        return normalized_base_url
    return f"{normalized_base_url}/chat/completions"


def chat_completion(
    prompt: str,
    *,
    model: str,
    api_key: str,
    base_url: str,
    temperature: float = 0.7,
    timeout: int = 120,
) -> str:
    endpoint = build_chat_endpoint(base_url)

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }
    body = json.dumps(payload).encode("utf-8")

    http_request = request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM request failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"LLM request failed: {exc.reason}") from exc

    data = json.loads(response_body)
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected LLM response payload: {response_body}") from exc


def test_chat_connection(
    *,
    model: str,
    api_key: str,
    base_url: str,
    timeout: int = 20,
) -> dict[str, object]:
    endpoint = build_chat_endpoint(base_url)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "temperature": 0,
        "max_tokens": 1,
    }
    body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
            status_code = getattr(response, "status", 200)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM request failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"LLM request failed: {exc.reason}") from exc

    data = json.loads(response_body)
    if not isinstance(data, dict) or "choices" not in data:
        raise RuntimeError(f"Unexpected LLM response payload: {response_body}")

    return {
        "ok": True,
        "endpoint": endpoint,
        "model": model,
        "status": int(status_code),
    }


def read_api_config(
    api_key: str | None,
    model: str | None,
    base_url: str | None,
) -> tuple[str | None, str | None, str | None]:
    resolved_api_key = api_key or os.getenv("BAIBAIAIGC_API_KEY") or os.getenv("OPENAI_API_KEY")
    resolved_model = model or os.getenv("BAIBAIAIGC_MODEL")
    resolved_base_url = (
        base_url
        or os.getenv("BAIBAIAIGC_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
    )
    return resolved_api_key, resolved_model, resolved_base_url