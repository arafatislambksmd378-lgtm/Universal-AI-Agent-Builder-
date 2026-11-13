"""Deterministic mock provider contract."""

from __future__ import annotations

import pytest

from uab_platform.providers.base import ChatMessage, CompletionRequest
from uab_platform.providers.mock import DeterministicMockProvider


def _request(text: str, model: str = "mock-1") -> CompletionRequest:
    return CompletionRequest(model=model, messages=(ChatMessage(role="user", content=text),))


@pytest.mark.asyncio
async def test_same_input_same_output() -> None:
    provider = DeterministicMockProvider()
    first = await provider.complete(_request("hello world"))
    second = await provider.complete(_request("hello world"))
    assert first.content == second.content
    assert first.response_id == second.response_id


@pytest.mark.asyncio
async def test_different_input_different_output() -> None:
    provider = DeterministicMockProvider()
    first = await provider.complete(_request("hello world"))
    second = await provider.complete(_request("goodbye world"))
    assert first.content != second.content


@pytest.mark.asyncio
async def test_zero_cost_and_local_kind() -> None:
    provider = DeterministicMockProvider()
    result = await provider.complete(_request("any"))
    assert result.usage.estimated_cost_microusd == 0
    assert result.usage.total_tokens == result.usage.prompt_tokens + result.usage.completion_tokens
    assert provider.kind.value == "local"


@pytest.mark.asyncio
async def test_health() -> None:
    provider = DeterministicMockProvider()
    health = await provider.health()
    assert health.reachable is True
