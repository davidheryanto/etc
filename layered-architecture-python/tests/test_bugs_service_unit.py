"""UNIT test — the use case with a FAKE adapter.

No database, no web server, no framework. This is only possible because BugService
depends on the BugRepository *port*, not on SQL. The fake satisfies the port
structurally (it just has the right methods).

This is where you test business RULES: fast, deterministic, exhaustive.
"""

import pytest

from myapp.bugs.service import (
    MAX_OPEN_BUGS_PER_REPORTER,
    Bug,
    BugService,
    Status,
    TooManyOpenBugs,
)


class FakeBugRepository:
    """In-memory adapter — structurally satisfies BugRepository."""

    def __init__(self, open_count: int = 0) -> None:
        self._open_count = open_count
        self.added: list[Bug] = []

    def add(self, bug: Bug) -> Bug:
        bug.id = len(self.added) + 1
        self.added.append(bug)
        return bug

    def count_open_for(self, reporter: str) -> int:
        return self._open_count


def test_reports_a_bug_when_under_the_limit() -> None:
    service = BugService(FakeBugRepository(open_count=0))

    bug = service.report_bug("crash on save", "alice")

    assert bug.id == 1
    assert bug.title == "crash on save"
    assert bug.reporter == "alice"
    assert bug.status is Status.OPEN  # a freshly reported bug is OPEN by a domain default


def test_blocks_when_at_the_limit() -> None:
    service = BugService(FakeBugRepository(open_count=MAX_OPEN_BUGS_PER_REPORTER))

    with pytest.raises(TooManyOpenBugs):
        service.report_bug("one too many", "alice")
