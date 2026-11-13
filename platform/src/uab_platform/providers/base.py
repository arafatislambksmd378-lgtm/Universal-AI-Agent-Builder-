"""Provider-independent chat model contract.

The control plane never binds to a concrete vendor SDK. Any provider —
local Ollama, an OpenAI-compatible endpoint, a free-tier aggregator, or an
authorized paid API — implements ``ChatProvider``. Cost policy enforcement
lives in ``uab_platform.providers.registry``; paid providers remain disabled
unless the operator explicitly enables them.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


class ProviderKind(str, enum.Enum):
    LOCAL = "local"
    FREE_TIER = "free_tier"
    PAID = "paid"


@dataclass(frozen=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    # Cost in micro-USD (1e-6 USD). Local and free-tier providers report 0.
    estimated_cost_microusd: int = 0


@dataclass(frozen=True)
class CompletionRequest:
    model: str
    messages: tuple[ChatMessage, ...]
    temperature: float = 0.7
    max_tokens: int = 1024
    stream: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CompletionResult:
    provider: str
    model: str
    content: str
    finish_reason: str
    usage: TokenUsage
    response_id: str
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderCapabilities:
    chat: bool = True
    streaming: bool = False
    tools: bool = False
    embeddings: bool = False
    vision: bool = False
    context_window: int | None = None


@dataclass(frozen=True)
class ProviderHealth:
    provider: str
    reachable: bool
    detail: str = ""


@runtime_checkable
class ChatProvider(Protocol):
    """Structural interface every chat provider implements."""

    name: str
    kind: ProviderKind

    async def complete(self, request: CompletionRequest) -> CompletionResult: ...

    async def health(self) -> ProviderHealth: ...

    def capabilities(self) -> ProviderCapabilities: ...
