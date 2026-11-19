"""Repository helpers. Repositories are the only place that talk to the ORM
sessions directly; services/API layers call these instead."""

from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


class PageResult(Generic[ModelT]):
    def __init__(self, items: list[ModelT], total: int) -> None:
        self.items = items
        self.total = total


def paginate(session: Session, stmt: Select[tuple[ModelT]], *, limit: int, offset: int) -> PageResult[ModelT]:
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = session.scalar(count_stmt) or 0
    items = list(session.scalars(stmt.limit(limit).offset(offset)).all())
    return PageResult(items=items, total=int(total))
