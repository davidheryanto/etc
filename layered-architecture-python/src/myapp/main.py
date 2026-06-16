"""main — the COMPOSITION ROOT (the outermost layer).

The only module that knows every concrete piece. It builds the app, creates the
tables, and mounts each feature's router. Because composition is concentrated here,
everything inside the app stays on abstractions — the messy "wire the real things
together" job has exactly one home.

Run it:  uv run uvicorn myapp.main:app --reload   (then open http://127.0.0.1:8000/docs)
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

# Importing the routers transitively imports each feature's repository module,
# which registers its ORM table on Base.metadata — so by the time the lifespan
# handler runs create_all(), every table is known. (This import lives in main.py —
# the composition root — and NOT in shared.db, because the shared kernel is
# forbidden from importing features.)
from myapp.bugs.api import router as bugs_router
from myapp.shared.db import Base, engine
from myapp.users.api import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Create tables on SERVER STARTUP, not at import. This keeps importing this module
    # side-effect-free: tests can import `app` without ever creating a database file.
    # (Example convenience only — real apps run Alembic migrations as a deploy step.)
    Base.metadata.create_all(bind=engine)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Layered architecture reference", lifespan=lifespan)
    app.include_router(bugs_router)
    app.include_router(users_router)
    return app


app = create_app()
