"""Ollama provider adapter with a mocked HTTP transport (no live daemon required)."""

from __future__ import annotations

import json

import httpx
import pytest

from uab_platform.providers.base import ChatMessage, CompletionRequest
from uab_platform.providers.errors import ProviderUnavailable
from uab_platform.providers.ollama import OllamaProvider


def _request(text: str = "hello") -> CompletionRequest:
    return CompletionRequest(model="llama3.2", messages=(ChatMessage(role="user", content=text),))


def _mock_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_complete_parses_ollama_chat_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        body = json.loads(request.content)
        assert body["stream"] is False
        return httpx.Response(
            200,
            json={
                "model": "llama3.2",
                "created_at": "2026-11-13T00:00:00Z",
                "message": {"role": "assistant", "content": "hi there"},
                "done_reason": "stop",
                "prompt_eval_count": 5,
                "eval_count": 3,
            },
        )

    async with httpx.AsyncClient(transport=_mock_transport(handler), base_url="http://ollama.test") as client:
        provider = OllamaProvider("http://ollama.test", client=client)
        result = await provider.complete(_request())

    assert result.provider == "ollama"
    assert result.content == "hi there"
    assert result.usage.prompt_tokens == 5
    assert result.usage.completion_tokens == 3
    assert result.usage.estimated_cost_microusd == 0


@pytest.mark.asyncio
async def test_404_model_gives_actionable_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model not found"})

    async with httpx.AsyncClient(transport=_mock_transport(handler), base_url="http://ollama.test") as client:
        provider = OllamaProvider("http://ollama.test", client=client)
        with pytest.raises(ProviderUnavailable, match="ollama pull"):
            await provider.complete(_request())


@pytest.mark.asyncio
async def test_connection_failure_is_provider_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    async with httpx.AsyncClient(transport=_mock_transport(handler), base_url="http://ollama.test") as client:
        provider = OllamaProvider("http://ollama.test", client=client)
        health = await provider.health()
    assert health.reachable is False


@pytest.mark.asyncio
async def test_health_ok() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/version":
            return httpx.Response(200, json={"version": "0.12.0"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=_mock_transport(handler), base_url="http://ollama.test") as client:
        provider = OllamaProvider("http://ollama.test", client=client)
        health = await provider.health()
    assert health.reachable is True
