"""shared.config — configuration read from the ENVIRONMENT (twelve-factor).

The single place per-environment values live. Want Postgres or a Lakebase branch
instead of the local SQLite file? Set DATABASE_URL in the environment — no code
changes anywhere. That is the entire point of "config in the environment": the
same code path runs against any attached database, so dev/prod parity is the default.

    export DATABASE_URL="postgresql+psycopg://user:pw@host/db"   # prod
    # (unset) -> falls back to the runnable SQLite default below  # local
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # A working default keeps the example zero-setup. Override it in real deploys.
    database_url: str = "sqlite:///./myapp.db"


settings = Settings()
