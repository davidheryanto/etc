"""bugs.repository — the INFRASTRUCTURE layer: a driven ADAPTER.

Implements the BugRepository port with SQLAlchemy. This is the ONLY file in the
feature permitted to mention SQL / Session / ORM rows. It imports the core
(service) to learn the port's shape and the domain type; the core never imports it.

  Direction check: repository -> service is INWARD (the adapter depends on the port).
  At runtime the service CALLS this adapter; in source code this adapter DEPENDS ON
  the service. Opposite arrows — that's Dependency Inversion at work.

This file is where the three types EARN their separation (README §14):
  • `created_at` is an infra-only audit column — it exists on the table (`BugRow`)
    but NOT on the domain `Bug`, so it is never mapped upward.
  • the domain `Status` enum is translated to/from a plain string column here.
The `add()` mapping is therefore real abstraction translation, not field copying.

Swappability: a different store is just another file implementing BugRepository
(see tests/ for an in-memory fake). BugService does not change a single character.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from myapp.bugs.service import Bug, BugRepository, Status  # the port + domain types (inward)
from myapp.shared.db import Base


class BugRow(Base):
    """The TABLE — an infrastructure detail, deliberately NOT the same shape as the
    domain `Bug`. It adds `created_at`, an audit column the domain has no reason to
    know about. Keeping ORM model and domain entity distinct is what stops both
    SQLAlchemy AND infra-only columns from leaking up into the service.
    """

    __tablename__ = "bugs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    reporter: Mapped[str]
    status: Mapped[str] = mapped_column(default=Status.OPEN.value)  # domain enum stored as text
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())  # infra-only audit


class SqlBugRepository:  # structurally satisfies BugRepository — no inheritance needed
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, bug: Bug) -> Bug:
        row = BugRow(title=bug.title, reporter=bug.reporter, status=bug.status.value)
        self._session.add(row)
        self._session.flush()  # assign row.id (and let the DB stamp created_at)
        # Map ORM row -> domain. created_at is intentionally dropped: it is an
        # infrastructure concern, absent from the domain entity by design.
        return Bug(id=row.id, title=row.title, reporter=row.reporter, status=Status(row.status))

    def count_open_for(self, reporter: str) -> int:
        stmt = (
            select(func.count())
            .select_from(BugRow)
            .where(BugRow.reporter == reporter, BugRow.status == Status.OPEN.value)
        )
        return self._session.scalar(stmt) or 0
