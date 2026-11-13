"""Deterministic mock provider.

Used for local development and automated tests. Same input → same output,
zero cost, no network. The response content is derived from a SHA-256 of the
request so tests can assert on stable values.
"""

from __future__ import annotations

import hashlib
import json

from uab_platform.providers.base import (
    CompletionRequest,
    CompletionResult,
    ProviderCapabilities,
    ProviderHealth,
    ProviderKind,
    TokenUsage,
)


def _count_tokens(text: str) -> int:
    # Cheap, deterministic approximation: whitespace-separated words.
    return len(text.split()) if text.strip() else 0


class DeterministicMockProvider:
    name = "mock"
    kind = ProviderKind.LOCAL  # reports as local-class: free, offline, no egress

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(chat=True, streaming=False, tools=False, context_window=8192)

    async def complete(self, request: CompletionRequest) -> CompletionResult:
        canonical = json.dumps(
            {
                "model": request.model,
                "messages": [(m.role, m.content) for m in request.messages],
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
            },
            sort_keys=True,
        )
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        last_user = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        content = f"[mock:{request.model}] {last_user.strip()} (sha256={digest[:16]})"
        prompt_tokens = sum(_count_tokens(m.content) for m in request.messages)
        completion_tokens = _count_tokens(content)
        return CompletionResult(
            provider=self.name,
            model=request.model,
            content=content,
            finish_reason="stop",
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                estimated_cost_microusd=0,
            ),
            response_id=f"mock-{digest[:24]}",
            raw={"deterministic": True},
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(provider=self.name, reachable=True, detail="deterministic mock, always available")
