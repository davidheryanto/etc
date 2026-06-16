"""bugs.api — the BOUNDARY layer: a driving ADAPTER (FastAPI) + the feature's wiring.

Boundary jobs done here (and ONLY here):
  • parse + validate the request      -> Pydantic ReportBugRequest
  • translate domain errors to status  -> TooManyOpenBugs -> HTTP 429
  • shape the response                 -> BugResponse
  • COMPOSE the use case               -> get_bug_service(): build adapter, inject it

This is the one file in the feature allowed to name the concrete adapter
(SqlBugRepository) — composition must happen somewhere, and the boundary edge is
that place. Everything inner stays on the BugRepository abstraction.

(If you want even the wiring out of the route file, extract get_bug_service into a
`deps.py`; same idea, one more file.)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from myapp.bugs.repository import SqlBugRepository
from myapp.bugs.schemas import BugResponse, ReportBugRequest
from myapp.bugs.service import BugService, TooManyOpenBugs
from myapp.shared.db import get_session

router = APIRouter(prefix="/bugs", tags=["bugs"])


def get_bug_service(session: Session = Depends(get_session)) -> BugService:
    """Composition: pick the adapter, inject it into the use case.

    Tests swap THIS out via app.dependency_overrides to run the route with a fake
    repository and no database at all (see tests/test_bugs_api.py).
    """
    return BugService(SqlBugRepository(session))


@router.post("", status_code=201, response_model=BugResponse)
def report_bug(
    payload: ReportBugRequest,
    service: BugService = Depends(get_bug_service),
) -> BugResponse:
    try:
        bug = service.report_bug(payload.title, payload.reporter)
    except TooManyOpenBugs:
        # Domain error -> HTTP status. This translation is a boundary job; the
        # service never knew the number 429 existed.
        raise HTTPException(status_code=429, detail="too many open bugs for this reporter")
    # Map domain -> wire: the Status enum becomes a plain string; created_at is not exposed.
    return BugResponse(id=bug.id, title=bug.title, reporter=bug.reporter, status=bug.status.value)
