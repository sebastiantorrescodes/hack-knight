"""Clerk sign-in for the dashboard API.

The frontend sends the Clerk session token as `Authorization: Bearer <token>`. Places that can't set headers
(<img src> for the live stream, new Audio() for the voice) pass it as `?token=` instead; Clerk tokens only
live about a minute, so one leaking into a log isn't useful for long.

Tokens are verified locally against Clerk's public keys (JWKS), so the backend needs no Clerk secret key:
the Frontend API domain, and so the issuer and JWKS URL, is encoded in the publishable key.
"""
import base64
import logging

import jwt
from fastapi import Header, HTTPException, Query

import settings

log = logging.getLogger("auth")

_jwks = None
_issuer = None


def _frontend_api():
    """pk_test_<base64("example.clerk.accounts.dev$")> -> "example.clerk.accounts.dev"."""
    key = settings.CLERK_PUBLISHABLE_KEY
    try:
        encoded = key.split("_", 2)[2]
        domain = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
    except Exception:
        domain = ""
    if not domain.endswith("$"):
        raise HTTPException(500, "CLERK_PUBLISHABLE_KEY in backend/.env isn't a valid Clerk publishable key")
    return domain[:-1]


def _verifier():
    global _jwks, _issuer
    if _jwks is None:
        if not settings.CLERK_PUBLISHABLE_KEY:
            raise HTTPException(500, "CLERK_PUBLISHABLE_KEY is not set on the server (backend/.env)")
        _issuer = f"https://{_frontend_api()}"
        _jwks = jwt.PyJWKClient(f"{_issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    return _jwks, _issuer


def verify(token):
    """Return the Clerk user id (`sub`) of a valid session token, or raise 401."""
    jwks, issuer = _verifier()
    try:
        key = jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=issuer,
            leeway=10,  # small clock differences between Clerk and this machine
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWKClientConnectionError as e:
        log.error("Can't fetch Clerk's signing keys: %s", e)
        raise HTTPException(503, "Can't reach Clerk to check sign-in")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid session token: {e}")
    # azp is the page origin that asked for the token; only accept our own frontend when origins are pinned
    parties = [o for o in settings.CORS_ORIGINS if o != "*"]
    if parties and claims.get("azp") and claims["azp"] not in parties:
        raise HTTPException(401, "Session token was issued for a different site")
    return claims["sub"]


def current_user(
    authorization: str = Header(default=""),
    token: str = Query(default="", description="Session token, for <img>/<audio> URLs that can't send headers"),
):
    """FastAPI dependency: the signed-in Clerk user id."""
    scheme, _, bearer = authorization.partition(" ")
    raw = bearer.strip() if scheme.lower() == "bearer" else token
    if not raw:
        raise HTTPException(401, "Sign in required")
    return verify(raw)
