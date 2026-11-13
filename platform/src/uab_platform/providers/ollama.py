"""Ollama provider adapter (local inference, OpenAI-compatible endpoint family).

Talks to a stock Ollama daemon (default ``http://127.0.0.1:11434``) using its
native ``/api/chat`` endpoint. Never sends data anywhere else; never requires
payment; health-checked before routing. When Ollama is not running the adapter
reports ``ProviderUnavailable`` rather than hanging.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx

from uab_platform.providers.base import (
    CompletionRequest,
    CompletionResult,
    ProviderCapabilities,
    ProviderHealth,
    ProviderKind,
    TokenUsage,
)
from uab_platform.providers.errors import ProviderUnavailable


class OllamaProvider:
    name = "ollama"
    kind = ProviderKind.LOCAL

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        *,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = client
        self._timeout = timeout_seconds

    def capabilities(self) -> ProviderCapabilities:
        # Context window depends on the loaded model; the registry surfaces the
        # configured default and defers to /api/show at call time in the future.
        return ProviderCapabilities(chat=True, streaming=True, tools=False, context_window=None)

    async def _request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None) -> httpx.Response:
        try:
            if self._client is not None:
                return await self._client.request(method, path, json=json_body)
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
                return await client.request(method, path, json=json_body)
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(f"ollama unreachable at {self._base_url}: {exc}") from exc

    async def complete(self, request: CompletionRequest) -> CompletionResult:
        response = await self._request(
            "POST",
            "/api/chat",
            json_body={
                "model": request.model,
                "messages": [{"role": m.role, "content": m.content} for m in request.messages],
                "stream": False,
                "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
            },
        )
        if response.status_code == 404:
            raise ProviderUnavailable(
                f"ollama returned 404 for model {request.model!r} — pull it first: `ollama pull {request.model}`"
            )
        if response.status_code != 200:
            raise ProviderUnavailable(f"ollama returned HTTP {response.status_code}: {response.text[:500]}")
        payload = response.json()
        content = str(payload.get("message", {}).get("content", ""))
        prompt_tokens = int(payload.get("prompt_eval_count") or 0)
        completion_tokens = int(payload.get("eval_count") or 0)
        return CompletionResult(
            provider=self.name,
            model=str(payload.get("model") or request.model),
            content=content,
            finish_reason=str(payload.get("done_reason") or "stop"),
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                estimated_cost_microusd=0,
            ),
            response_id=(
                "ollama-" + hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:24]
            ),
            raw=payload,
        )

    async def health(self) -> ProviderHealth:
        try:
            response = await self._request("GET", "/api/version")
        except ProviderUnavailable as exc:
            return ProviderHealth(provider=self.name, reachable=False, detail=str(exc))
        if response.status_code == 200:
            return ProviderHealth(provider=self.name, reachable=True, detail=response.text[:200])
        return ProviderHealth(provider=self.name, reachable=False, detail=f"HTTP {response.status_code}")
