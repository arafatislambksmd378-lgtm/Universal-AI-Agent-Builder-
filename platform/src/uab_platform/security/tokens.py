"""JWT access/refresh tokens (HS256).

Stateless by design; the access token is short-lived. Refresh tokens carry a
`typ` claim so an access token can never be replayed at the refresh endpoint.
Revocation: not implemented yet (documented limitation — requires a jti denylist
or refresh rotation table; tracked for BATCH 12).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt

from uab_platform.config import Settings

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    """Raised for any token that fails verification (expired, wrong type, tampered)."""


@dataclass(frozen=True)
class TokenClaims:
    subject: str
    token_type: TokenType
    expires_at: datetime
    jti: str


def issue_token(settings: Settings, subject: str, token_type: TokenType) -> tuple[str, TokenClaims]:
    now = datetime.now(UTC)
    ttl = settings.access_token_ttl_seconds if token_type == "access" else settings.refresh_token_ttl_seconds  # noqa: S105 - literal is a token *type* label, not a credential
    expires = now + timedelta(seconds=ttl)
    jti = uuid.uuid4().hex
    payload = {
        "sub": subject,
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": jti,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, TokenClaims(subject=subject, token_type=token_type, expires_at=expires, jti=jti)


def verify_token(settings: Settings, token: str, expected_type: TokenType) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "typ", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("token invalid") from exc

    token_type = payload.get("typ")
    if token_type != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise TokenError("token subject missing")
    return TokenClaims(
        subject=subject,
        token_type=token_type,
        expires_at=datetime.fromtimestamp(int(payload["exp"]), tz=UTC),
        jti=str(payload.get("jti", "")),
    )
