"""users.repository — INFRASTRUCTURE adapter for the users feature (SQLAlchemy).

Implements UserRepository. The only users-file that knows SQL. Imports the core
(the port + domain type); the core never imports it.
"""

from sqlalchemy import select
from sqlalchemy.orm import Mapped, Session, mapped_column

from myapp.shared.db import Base
from myapp.users.service import User, UserRepository


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    display_name: Mapped[str]


class SqlUserRepository:  # structurally satisfies UserRepository
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, user: User) -> User:
        row = UserRow(email=user.email, display_name=user.display_name)
        self._session.add(row)
        self._session.flush()
        return User(id=row.id, email=row.email, display_name=row.display_name)

    def exists_with_email(self, email: str) -> bool:
        stmt = select(UserRow.id).where(UserRow.email == email)
        return self._session.scalar(stmt) is not None
