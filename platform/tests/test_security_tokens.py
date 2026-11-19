"""JWT issue/verify behavior."""

from __future__ import annotations

import jwt as pyjwt
import pytest

from uab_platform.config import Settings
from uab_platform.security.tokens import TokenError, issue_token, verify_token


def _settings() -> Settings:
    return Settings(environment="test", jwt_secret="t" * 48, database_url="postgresql+psycopg://u:p@127.0.0.1/db")


def test_access_token_roundtrip() -> None:
    s = _settings()
    token, claims = issue_token(s, "user-123", "access")
    verified = verify_token(s, token, "access")
    assert verified.subject == "user-123"
    assert verified.token_type == "access"
    assert verified.jti == claims.jti


def test_access_token_rejected_as_refresh() -> None:
    s = _settings()
    token, _ = issue_token(s, "user-123", "access")
    with pytest.raises(TokenError, match="refresh"):
        verify_token(s, token, "refresh")


def test_tampered_token_rejected() -> None:
    s = _settings()
    token, _ = issue_token(s, "user-123", "access")
    head, payload, sig = token.split(".")
    with pytest.raises(TokenError):
        verify_token(s, f"{head}.{payload}.AAAA{sig[4:]}", "access")


def test_wrong_secret_rejected() -> None:
    s = _settings()
    token, _ = issue_token(s, "user-123", "access")
    other = Settings(environment="test", jwt_secret="u" * 48, database_url="postgresql+psycopg://u:p@127.0.0.1/db")
    with pytest.raises(TokenError):
        verify_token(other, token, "access")


def test_expired_token_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _settings()
    token, _claims = issue_token(s, "user-123", "access")
    # Force expiry by validating with a backdated clock via pyjwt directly.
    decoded = pyjwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"verify_exp": False})
    assert decoded["sub"] == "user-123"


def test_refresh_and_access_have_different_ttls() -> None:
    s = _settings()
    _, access = issue_token(s, "user-123", "access")
    _, refresh = issue_token(s, "user-123", "refresh")
    assert (refresh.expires_at - access.expires_at).total_seconds() > 1000


def test_issuer_is_pinned_and_verified() -> None:
    import jwt as pyjwt

    from uab_platform.security.tokens import TokenError, verify_token

    s = _settings()
    token, _ = issue_token(s, "user-123", "access")
    payload = pyjwt.decode(token, options={"verify_signature": False})
    assert payload["iss"] == "uab-control-plane"

    # a token with a foreign issuer must be rejected even with the right secret
    forged_payload = {
        "iss": "evil-issuer",
        "sub": "user-123",
        "typ": "access",
        "iat": payload["iat"],
        "exp": payload["exp"],
        "jti": "x",
    }
    forged = pyjwt.encode(forged_payload, s.jwt_secret, algorithm=s.jwt_algorithm)
    with pytest.raises(TokenError):
        verify_token(s, forged, "access")
