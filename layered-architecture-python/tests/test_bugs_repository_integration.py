"""INTEGRATION test — the REAL SqlBugRepository against a REAL database.

We never mock the database. The adapter runs against an actual SQLite engine, so it
proves the SQL, the mapping, and the schema actually work together. In the Lakebase
kit, this same adapter would run against the paired Lakebase branch instead — same
test, real isolated DB, zero mocks.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from myapp.bugs.repository import SqlBugRepository
from myapp.bugs.service import Bug, Status
from myapp.shared.db import Base


@pytest.fixture()
def session() -> Iterator[Session]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)  # BugRow is registered by importing the repository above
    with sessionmaker(bind=engine).begin() as s:
        yield s


def test_add_then_count_open(session: Session) -> None:
    repo = SqlBugRepository(session)

    repo.add(Bug(id=None, title="memory leak", reporter="bob"))
    saved = repo.add(Bug(id=None, title="ui freeze", reporter="bob"))

    assert saved.id is not None  # persistence assigned an id
    assert saved.status is Status.OPEN  # status survived the string<->enum round-trip
    assert repo.count_open_for("bob") == 2
    assert repo.count_open_for("nobody") == 0
