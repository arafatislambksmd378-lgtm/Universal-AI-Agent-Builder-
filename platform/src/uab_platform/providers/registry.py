"""Provider registry + cost-policy enforcement.

Routing priority: LOCAL → ELIGIBLE FREE-TIER → USER-AUTHORIZED PAID.
Paid providers are rejected at the registry boundary unless the operator has
explicitly enabled them (``UAB_ALLOW_PAID_PROVIDERS=true``) AND the caller
asks for a paid provider by name. Free-tier and local providers are enabled by
default but can be disabled independently.
"""

from __future__ import annotations

import logging

from uab_platform.config import Settings
from uab_platform.providers.base import ChatProvider, ProviderKind
from uab_platform.providers.errors import NoEligibleProvider, ProviderDisabled, ProviderNotFound

logger = logging.getLogger(__name__)


class ProviderRouter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._providers: dict[str, ChatProvider] = {}

    def register(self, provider: ChatProvider) -> None:
        self._providers[provider.name] = provider

    def names(self) -> list[str]:
        return sorted(self._providers)

    def _enabled(self, provider: ChatProvider) -> bool:
        if provider.kind is ProviderKind.LOCAL:
            return self._settings.allow_local_providers
        if provider.kind is ProviderKind.FREE_TIER:
            return self._settings.allow_free_tier_providers
        if provider.kind is ProviderKind.PAID:
            return self._settings.allow_paid_providers
        return False

    def resolve(self, name: str | None = None) -> ChatProvider:
        """Return a provider: the named one, else the default by cost policy."""
        if name is not None:
            provider = self._providers.get(name)
            if provider is None:
                raise ProviderNotFound(f"no provider registered as {name!r}; available: {self.names()}")
            self._assert_allowed(provider)
            return provider

        for kind in (ProviderKind.LOCAL, ProviderKind.FREE_TIER, ProviderKind.PAID):
            for provider in self._providers.values():
                if provider.kind is kind and self._enabled(provider):
                    return provider
        raise NoEligibleProvider(
            "no eligible provider: enable a local provider (UAB_ALLOW_LOCAL_PROVIDERS), "
            "a free-tier provider (UAB_ALLOW_FREE_TIER_PROVIDERS), or explicitly authorize a paid "
            "provider (UAB_ALLOW_PAID_PROVIDERS=true)"
        )

    def _assert_allowed(self, provider: ChatProvider) -> None:
        if not self._enabled(provider):
            if provider.kind is ProviderKind.PAID:
                raise ProviderDisabled(
                    f"provider {provider.name!r} is a paid provider and paid providers are disabled "
                    "(set UAB_ALLOW_PAID_PROVIDERS=true after explicit authorization)"
                )
            raise ProviderDisabled(f"provider {provider.name!r} is disabled by operator policy")
        if provider.kind is ProviderKind.PAID:
            logger.warning("paid provider %r resolved; confirmed operator authorization flag is set", provider.name)

    def assert_call_allowed(self, provider: ChatProvider) -> None:
        """Final gate invoked before any external call. Defense in depth: resolve()
        and the API layer both funnel here."""
        self._assert_allowed(provider)
