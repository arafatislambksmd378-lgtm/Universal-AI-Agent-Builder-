"""Provider router cost-policy enforcement."""

from __future__ import annotations

import pytest

from uab_platform.config import Settings
from uab_platform.providers.base import ProviderKind
from uab_platform.providers.errors import NoEligibleProvider, ProviderDisabled, ProviderNotFound
from uab_platform.providers.mock import DeterministicMockProvider
from uab_platform.providers.registry import ProviderRouter


class _PaidProvider(DeterministicMockProvider):
    name = "paid-example"
    kind = ProviderKind.PAID


class _FreeTierProvider(DeterministicMockProvider):
    name = "free-example"
    kind = ProviderKind.FREE_TIER


def _settings(**overrides) -> Settings:
    base = dict(environment="test", jwt_secret="t" * 48, database_url="postgresql+psycopg://u:p@127.0.0.1/db")
    base.update(overrides)
    return Settings(**base)


def test_default_resolution_prefers_local() -> None:
    router = ProviderRouter(_settings())
    router.register(DeterministicMockProvider())
    router.register(_FreeTierProvider())
    assert router.resolve().name == "mock"


def test_local_disabled_falls_back_to_free_tier() -> None:
    router = ProviderRouter(_settings(allow_local_providers=False))
    router.register(DeterministicMockProvider())
    router.register(_FreeTierProvider())
    assert router.resolve().name == "free-example"


def test_all_local_and_free_disabled_raises() -> None:
    router = ProviderRouter(_settings(allow_local_providers=False, allow_free_tier_providers=False))
    router.register(DeterministicMockProvider())
    router.register(_FreeTierProvider())
    with pytest.raises(NoEligibleProvider):
        router.resolve()


def test_paid_provider_refused_by_default() -> None:
    router = ProviderRouter(_settings())
    router.register(_PaidProvider())
    with pytest.raises(ProviderDisabled, match="paid"):
        router.resolve("paid-example")


def test_paid_provider_allowed_after_explicit_enable() -> None:
    router = ProviderRouter(_settings(allow_paid_providers=True))
    router.register(_PaidProvider())
    assert router.resolve("paid-example").name == "paid-example"


def test_unknown_provider_raises() -> None:
    router = ProviderRouter(_settings())
    with pytest.raises(ProviderNotFound):
        router.resolve("nope")


def test_paid_never_auto_selected_even_when_enabled() -> None:
    # With only a paid provider available and nothing else, resolve() must still refuse.
    router = ProviderRouter(_settings(allow_paid_providers=False))
    router.register(_PaidProvider())
    with pytest.raises(NoEligibleProvider):
        router.resolve()


def test_paid_auto_selected_only_with_enable_flag_and_nothing_else() -> None:
    router = ProviderRouter(
        _settings(allow_paid_providers=True, allow_local_providers=False, allow_free_tier_providers=False)
    )
    router.register(_PaidProvider())
    assert router.resolve().name == "paid-example"
