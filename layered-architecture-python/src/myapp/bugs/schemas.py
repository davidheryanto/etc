"""bugs.schemas — BOUNDARY DTOs (Pydantic): the wire shapes.

Request validation + response serialization for the HTTP edge. These are
DELIBERATELY separate from the domain `Bug`: the public API and the domain model
are allowed to evolve independently, and Pydantic stays out of the core.

Enforced by .importlinter `schemas-are-dtos`: this module is never imported by
service.py or repository.py.
"""

from pydantic import BaseModel, Field


class ReportBugRequest(BaseModel):
    # Note: no `status` and no `id` — a reported bug is OPEN by a domain rule, and
    # the id is assigned by persistence. The request shape != the domain shape.
    title: str = Field(min_length=1, max_length=200)
    reporter: str = Field(min_length=1)


class BugResponse(BaseModel):
    id: int
    title: str
    reporter: str
    status: str
    # `created_at` is intentionally NOT exposed: it is an internal audit column.
    # The wire shape != the table shape — that is the boundary doing its job.
