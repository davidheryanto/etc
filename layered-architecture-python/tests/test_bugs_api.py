"""API test — the HTTP boundary with the adapter SWAPPED OUT.

app.dependency_overrides replaces get_bug_service with one wired to a fake repo, so
this test exercises routing, request validation, and domain-error -> status
translation with NO real database. The seam (get_bug_service) is exactly what makes
this swap a one-liner.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from myapp.bugs.api import get_bug_service
from myapp.bugs.service import Bug, BugService
from myapp.main import app


class _FakeRepo:
    def __init__(self, over_limit: bool) -> None:
        self._over = over_limit

    def add(self, bug: Bug) -> Bug:
        bug.id = 1
        return bug

    def count_open_for(self, reporter: str) -> int:
        return 999 if self._over else 0


def _use_fake(over_limit: bool):
    return lambda: BugService(_FakeRepo(over_limit))


@pytest.fixture()
def client() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_report_bug_returns_201(client: TestClient) -> None:
    app.dependency_overrides[get_bug_service] = _use_fake(over_limit=False)

    resp = client.post("/bugs", json={"title": "x", "reporter": "alice"})

    assert resp.status_code == 201
    # Response exposes status, and deliberately omits the internal created_at column.
    assert resp.json() == {"id": 1, "title": "x", "reporter": "alice", "status": "open"}


def test_report_bug_over_limit_returns_429(client: TestClient) -> None:
    app.dependency_overrides[get_bug_service] = _use_fake(over_limit=True)

    resp = client.post("/bugs", json={"title": "x", "reporter": "alice"})

    assert resp.status_code == 429


def test_invalid_request_returns_422(client: TestClient) -> None:
    # Empty title fails Pydantic validation at the boundary — the service is never called.
    resp = client.post("/bugs", json={"title": "", "reporter": "alice"})

    assert resp.status_code == 422
