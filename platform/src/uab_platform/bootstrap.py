"""Operator bootstrap: create (or top-up) the initial platform superadmin.

Usage:
    uab-bootstrap --email admin@example.com --password '...' [--display-name 'Root']
    UAB_BOOTSTRAP_EMAIL=... UAB_BOOTSTRAP_PASSWORD=... uab-bootstrap

Refuses to run when a superadmin already exists unless --force is given.
This is the only supported way to mint a superadmin; the HTTP API never
grants is_superadmin.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from uab_platform.db import session as db_session
from uab_platform.db.models import User
from uab_platform.repositories import users as users_repo
from uab_platform.security.passwords import hash_password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create the initial Universal Agent Builder superadmin.")
    parser.add_argument("--email", default=None, help="superadmin email (or UAB_BOOTSTRAP_EMAIL)")
    parser.add_argument("--password", default=None, help="superadmin password (or UAB_BOOTSTRAP_PASSWORD)")
    parser.add_argument("--display-name", default="Platform Admin", help="display name")
    parser.add_argument("--force", action="store_true", help="add another superadmin even if one exists")
    args = parser.parse_args(argv)

    import os

    email = args.email or os.environ.get("UAB_BOOTSTRAP_EMAIL")
    password = args.password or os.environ.get("UAB_BOOTSTRAP_PASSWORD")
    if not email or not password:
        parser.error("--email and --password are required (or set UAB_BOOTSTRAP_EMAIL / UAB_BOOTSTRAP_PASSWORD)")
    if len(password) < 12:
        parser.error("password must be at least 12 characters")

    with db_session.transaction() as session:
        existing_superadmins = session.scalars(select(User).where(User.is_superadmin.is_(True))).all()
        if existing_superadmins and not args.force:
            print("a superadmin already exists; use --force to add another (not recommended)", file=sys.stderr)
            return 2
        email = email.strip().lower()
        user = users_repo.get_user_by_email(session, email)
        if user is None:
            user = users_repo.create_user(
                session, email=email, password_hash=hash_password(password), display_name=args.display_name
            )
            print(f"created user {user.id} <{user.email}>")
        else:
            user.password_hash = hash_password(password)
            session.add(user)
            print(f"updated password for existing user {user.id} <{user.email}>")
        if not user.is_superadmin:
            user.is_superadmin = True
            session.add(user)
            print("granted is_superadmin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
