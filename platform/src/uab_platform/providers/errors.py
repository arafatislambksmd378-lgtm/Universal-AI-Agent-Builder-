"""Provider routing errors."""

from __future__ import annotations


class ProviderError(Exception):
    """Base error for provider-related failures."""


class ProviderUnavailable(ProviderError):
    """The provider is configured but unreachable or unhealthy."""


class ProviderDisabled(ProviderError):
    """The provider is disabled by operator policy (e.g. paid provider not authorized)."""


class ProviderNotFound(ProviderError):
    """No provider registered under that name."""


class NoEligibleProvider(ProviderError):
    """Policy disallows every registered provider for the requested capability."""
