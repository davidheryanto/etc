"""users.service — SERVICE layer for the users feature.

Same SHAPE as bugs.service (entity + error + port + use case), a DIFFERENT rule:
no two users may register the same email. Seeing the identical structure in a
second feature is the point — the layout is a repeatable mould, not a one-off.

THE LAW: imports only stdlib + myapp.shared.*  — never api/repository/schemas.
"""

from dataclasses import dataclass
from typing import Protocol

from myapp.shared.errors import DomainError


@dataclass
class User:
    id: int | None
    email: str
    display_name: str


class EmailAlreadyRegistered(DomainError):
    """The uniqueness invariant was violated. A domain error -> the boundary maps it to 409."""


class UserRepository(Protocol):
    """DRIVEN port — persistence the users feature needs, in domain language."""

    def add(self, user: User) -> User: ...

    def exists_with_email(self, email: str) -> bool: ...


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    def register(self, email: str, display_name: str) -> User:
        if self._repo.exists_with_email(email):
            raise EmailAlreadyRegistered(email)
        return self._repo.add(User(id=None, email=email, display_name=display_name))
