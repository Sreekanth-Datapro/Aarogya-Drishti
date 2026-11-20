"""
Cloudflare Workers AI vision client.

Presents a small chat()-compatible surface used by oral analysis and
category suitability checks. Replaces the previous Ollama Cloud client.
"""

from __future__ import annotations

import base64
import json
import os
from types import SimpleNamespace

import httpx


DEFAULT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct"
DEFAULT_TIMEOUT_SECONDS = 120


class CloudflareVisionError(RuntimeError):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        *,
        provider_request_started: bool = False,
        provider_request_success: bool = False,
        provider_response_received: bool = False,
        error_code: str = "PROVIDER_REQUEST_FAILED",
    ):
        super().__init__(message)
        self.status_code = status_code
        self.provider_trace = {
            "provider_request_started": provider_request_started,
            "provider_request_success": provider_request_success,
            "provider_response_received": provider_response_received,
            "provider_http_status": status_code if provider_response_received else None,
            "inference_performed": provider_request_success and provider_response_received,
            "provider_response_validated": False,
            "model_output_usable": False,
            "error_code": error_code,
        }


def _as_data_uri(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _normalize_response_content(content):
    """Workers AI may return result.response as a string or a JSON object."""
    if isinstance(content, str):
        return content
    if isinstance(content, (dict, list)):
        # Keep structured payloads intact so oral_analysis can validate them
        # without a stringify/re-parse round trip that can lose type fidelity.
        return content
    return ""


def _extract_prompt_and_image(messages: list[dict]) -> tuple[str, bytes | None]:
    if not messages:
        raise CloudflareVisionError("Vision request is missing messages.")
    user = messages[-1]
    content = user.get("content")
    images = user.get("images") or []
    prompt = content if isinstance(content, str) else ""
    if isinstance(content, list):
        texts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        ]
        prompt = "\n".join(item for item in texts if item).strip()
    image_bytes = images[0] if images else None
    if image_bytes is not None and not isinstance(image_bytes, (bytes, bytearray)):
        raise CloudflareVisionError("Vision image payload must be raw image bytes.")
    if not prompt:
        raise CloudflareVisionError("Vision request is missing a text prompt.")
    return prompt, bytes(image_bytes) if image_bytes is not None else None


class CloudflareWorkersAIClient:
    """Minimal Workers AI runner used as a drop-in for the former Ollama client."""

    def __init__(
        self,
        account_id: str,
        api_token: str,
        model: str = DEFAULT_MODEL,
        *,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        http_client: httpx.Client | None = None,
    ):
        if not account_id or not api_token:
            raise RuntimeError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN are required.")
        self.account_id = account_id
        self.api_token = api_token
        self.model = model
        self.timeout_seconds = timeout_seconds
        self._http = http_client

    @property
    def url(self) -> str:
        return (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.account_id}/ai/run/{self.model}"
        )

    def chat(
        self,
        model: str | None = None,
        messages: list[dict] | None = None,
        format: str | None = None,
        options: dict | None = None,
        system_prompt: str | None = None,
        **_kwargs,
    ):
        """
        Ollama-compatible chat() used by existing vision wrappers.

        Returns an object with `.message.content` containing the model text.
        """
        del format  # Cloudflare JSON mode is enforced via the prompt.
        prompt, image_bytes = _extract_prompt_and_image(messages or [])
        temperature = 0.0
        if isinstance(options, dict) and options.get("temperature") is not None:
            temperature = float(options["temperature"])

        user_content: list[dict] = [{"type": "text", "text": prompt}]
        if image_bytes is not None:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": _as_data_uri(image_bytes)},
            })

        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt or (
                        "You are a medical screening image assistant. "
                        "Reply with a single JSON object only. "
                        "No markdown fences. No prose before or after the JSON. "
                        "Never diagnose disease or prescribe treatment."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
            "max_tokens": 1500,
            "temperature": temperature,
        }

        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        # Allow tests to inject a client; otherwise open a short-lived one.
        client = self._http or httpx.Client(timeout=self.timeout_seconds)
        close_after = self._http is None
        try:
            response = client.post(
                self.url if model in (None, self.model) else self._url_for(model),
                headers=headers,
                json=payload,
            )
        except httpx.TimeoutException as error:
            raise CloudflareVisionError(
                "Cloudflare Workers AI request timed out.",
                status_code=504,
                provider_request_started=True,
                error_code="PROVIDER_TIMEOUT",
            ) from error
        except httpx.HTTPError as error:
            raise CloudflareVisionError(
                "Cloudflare Workers AI request failed.",
                status_code=503,
                provider_request_started=True,
                error_code="PROVIDER_REQUEST_FAILED",
            ) from error
        finally:
            if close_after:
                client.close()

        try:
            body = response.json()
        except ValueError as error:
            raise CloudflareVisionError(
                "Cloudflare Workers AI returned a non-JSON response.",
                status_code=response.status_code,
                provider_request_started=True,
                provider_response_received=True,
                error_code="PROVIDER_RESPONSE_INVALID",
            ) from error

        if not isinstance(body, dict):
            raise CloudflareVisionError(
                "Cloudflare Workers AI returned an invalid response.",
                status_code=response.status_code,
                provider_request_started=True,
                provider_response_received=True,
                error_code="PROVIDER_RESPONSE_INVALID",
            )
        if not 200 <= response.status_code < 300 or body.get("success") is not True:
            error_code = "PROVIDER_RATE_LIMIT" if response.status_code == 429 else "PROVIDER_HTTP_ERROR"
            raise CloudflareVisionError(
                "Cloudflare Workers AI request failed.",
                status_code=response.status_code,
                provider_request_started=True,
                provider_response_received=True,
                error_code=error_code,
            )

        result = body.get("result")
        content = _normalize_response_content(result.get("response")) if isinstance(result, dict) else ""
        if isinstance(content, str):
            empty = not content.strip()
        elif isinstance(content, dict):
            empty = not content
        elif isinstance(content, list):
            empty = not content
        else:
            empty = True
        if empty:
            raise CloudflareVisionError(
                "Cloudflare Workers AI returned an empty vision response.",
                status_code=response.status_code,
                provider_request_started=True,
                provider_request_success=True,
                provider_response_received=True,
                error_code="PROVIDER_RESPONSE_EMPTY",
            )
        return SimpleNamespace(
            message=SimpleNamespace(content=content),
            provider_trace={
                "provider_request_started": True,
                "provider_request_success": True,
                "provider_response_received": True,
                "provider_http_status": response.status_code,
                "inference_performed": True,
                "provider_response_validated": False,
                "model_output_usable": False,
                "error_code": None,
            },
        )

    def _url_for(self, model: str) -> str:
        return (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.account_id}/ai/run/{model}"
        )


def client_from_env() -> CloudflareWorkersAIClient:
    return CloudflareWorkersAIClient(
        account_id=os.getenv("CLOUDFLARE_ACCOUNT_ID", ""),
        api_token=os.getenv("CLOUDFLARE_AUTH_TOKEN", ""),
        model=os.getenv("CLOUDFLARE_AI_MODEL", DEFAULT_MODEL),
        timeout_seconds=float(os.getenv("CLOUDFLARE_AI_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)),
    )
