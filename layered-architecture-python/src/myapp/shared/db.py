"""shared.db — database wiring shared by every feature's repository.

Holds the engine, the session factory, the declarative Base, and the per-request
session dependency. This is infrastructure that features depend ON; by the
"shared kernel" rule, this package never imports a feature.

Table creation lives in main.py (the composition root), NOT here — because creating
tables requires importing the feature repositories to register their models, and
the shared kernel is forbidden from importing features. Keeping that import in
main.py is what lets `shared` stay dependency-free.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from myapp.shared.config import settings

# SQLite under a threaded dev/test server needs this; other engines don't.
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base so `Base.metadata.create_all()` sees every table."""


def get_session() -> Iterator[Session]:
    """FastAPI dependency providing a request-scoped session.

    The `begin()` block owns the transaction boundary: it COMMITS on success and
    ROLLS BACK on any exception. The service expresses intent ("add this bug");
    this edge decides the transaction.
    """
    with SessionLocal.begin() as session:
        yield session
