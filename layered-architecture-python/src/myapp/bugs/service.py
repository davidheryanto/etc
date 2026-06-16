"""bugs.service — the SERVICE layer: the core of the feature.

This one file holds everything that IS the use case, in dependency order:

  • Status           — a domain value: a bug's lifecycle state the business reasons about
  • Bug              — the domain entity (plain data; no SQL, no Pydantic)
  • TooManyOpenBugs  — the domain rule's failure (a DomainError, not an HTTP 429)
  • BugRepository    — the PORT: what this feature NEEDS from persistence, named by
                       role, defined HERE because the service is its consumer
  • BugService       — the use case: orchestrates the rule + the port

THE LAW (enforced by .importlinter `feature-layers`):
    This module imports ONLY stdlib + myapp.shared.*  —  never api.py, repository.py,
    or schemas.py. It is the innermost layer; everything points inward at it.
    If you feel the urge to import "outward" from here, the design is wrong:
    put the new dependency behind a port instead.

NOTE on the three types (see README §14): the domain `Bug` here is intentionally
NOT identical to the wire shape (`BugResponse`) or the table (`BugRow`). `Bug`
carries a `Status` the business cares about; the table additionally has an
infra-only `created_at`; the response hides `created_at`. That divergence is what
makes three separate types earn their keep rather than being copy-paste ceremony.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from myapp.shared.errors import DomainError

# A business rule that is the SAME in every environment, so it lives next to the
# rule it guards. (A *per-environment* cap would instead move to shared.config and be
# read from the environment — that is the test for "policy" vs "config".)
MAX_OPEN_BUGS_PER_REPORTER = 50


class Status(StrEnum):
    """A bug's lifecycle state — a DOMAIN concept, not a storage detail.

    The domain reasons in terms of OPEN/CLOSED; how that is stored (a string
    column, an int, an enum type) is the repository's business, not the service's.
    """

    OPEN = "open"
    CLOSED = "closed"


@dataclass
class Bug:
    """The domain entity — a bug as the business understands it.

    Note what's absent: no table name, no audit timestamp, no serialization. Those
    are other layers' concerns. `id` is None until persistence assigns one; a freshly
    reported bug is OPEN by a domain default.
    """

    id: int | None
    title: str
    reporter: str
    status: Status = Status.OPEN


class TooManyOpenBugs(DomainError):
    """A reporter exceeded the open-bug limit.

    The service raises this knowing NOTHING about HTTP. The boundary later decides
    it becomes a 429. That is what keeps the use case reusable behind a CLI, a
    queue worker, or a test.
    """


class BugRepository(Protocol):
    """DRIVEN port — the persistence this feature needs, in domain language.

    Structural (typing.Protocol): an adapter satisfies it by SHAPE, so it need not
    import or inherit this. The signatures speak the domain (`Bug`, `reporter`) and
    never the technology — no Session, no SQL, no rows. If a tech noun ever appears
    in this interface, the abstraction has leaked and the port is doing nothing.

    Note the port did NOT change when the types around it gained fields: a deep
    interface stays small while the implementation behind it absorbs the detail.
    """

    def add(self, bug: Bug) -> Bug: ...

    def count_open_for(self, reporter: str) -> int: ...


class BugService:
    """The use case. Consumes the port (injected at construction), enforces the
    rule, returns domain types. Pure orchestration — no I/O details, no framework.
    """

    def __init__(self, repo: BugRepository) -> None:
        self._repo = repo

    def report_bug(self, title: str, reporter: str) -> Bug:
        if self._repo.count_open_for(reporter) >= MAX_OPEN_BUGS_PER_REPORTER:
            raise TooManyOpenBugs(reporter)
        # status defaults to OPEN — a domain rule, expressed in the domain, not the DB.
        return self._repo.add(Bug(id=None, title=title, reporter=reporter))
