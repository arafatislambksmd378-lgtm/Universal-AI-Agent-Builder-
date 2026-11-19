# ADR-0003: Cost-aware, provider-independent AI routing

- **Status:** Accepted (BATCH 02)
- **Date:** 2026-11-13
- **Context:** The platform must support many providers (OpenAI, Anthropic, Google Gemini/AI
  Studio, Ollama, LM Studio, Groq, OpenRouter…) without ever sending private data to a paid or
  external endpoint without explicit authorization, and without hardcoding provider facts into
  business logic.

## Decision

1. **Provider-agnostic interface first.** `ChatProvider` protocol (`providers/base.py`) with
   structural typing; `ProviderInfo` advertises kind (`local` / `free_tier` / `paid`), free-tier
   quota notes, and whether the provider sees private data.
2. **Deterministic mock provider is the test double** — always available, no network, no keys.
   Every provider/router test runs against it; no test requires a paid API.
3. **Ollama adapter** is the local-risk-free default for real inference (`providers/ollama.py`).
   Ollama being down must degrade readiness/health, never crash the control plane.
4. **Cost policy is enforced in one place** — `ProviderRouter` applies: LOCAL → eligible
   FREE-TIER → PAID only if `UAB_ALLOW_PAID_PROVIDERS=true`; a paid provider is never selected
   by default and never silently.
5. **Privacy default off:** Ollama and Gemini free-tier are the only zero-cost options suitable
   for private data out of the box; `private-by-default` is a per-provider property surfaced in
   `available_models()` so the frontend can label it.

## Consequences

- Adding a provider = one module + one registry entry; router, API and frontend are untouched.
- Tests for policy gates (paid disabled, free-tier toggle, unknown provider) live in
  `test_providers_registry.py` and run in CI without keys.
- The frontend contract exposes model lists and provider kinds, not keys.
- Premium integrations (paid OpenAI/Anthropic workflows, image/video generation budgets) are
  **explicitly deferred to BATCH 11** and activate only with user authorization.

## Rejected alternatives

- **One SDK wrapper per provider called directly from services** — policy logic scatters, paid
  calls slip past review; rejected.
- **Require Ollama for all tests** — breaks CI determinism; rejected (mock is the default).
- **Auto-fall back to paid providers when local is down** — would spend money silently; a clear
  error is raised instead.
