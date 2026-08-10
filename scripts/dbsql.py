#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "databricks-sql-connector[pyarrow]>=4.0",
#     "rich>=13",
#     "pandas>=2.0",
#     "ipython>=8",
# ]
# ///
"""Run SQL against a Databricks SQL warehouse.

Auth is taken from the `databricks` CLI (`databricks auth token`), so any flow
that CLI supports — PAT, OAuth U2M, Azure CLI passthrough — works unchanged.

Use fully-qualified names (`catalog.schema.table`) — no default catalog/schema
is set, and `USE CATALOG ...` won't work (single-statement cursor).

Examples (assumes symlinked as `dbsql`; otherwise `uv run scripts/dbsql.py ...`):
    # Simple one-liner — string literals are fine inside double quotes
    dbsql "SELECT * FROM prod.bronze.events WHERE event_date='2026-04-29' LIMIT 10"

    # Anything tricky (multi-line, backticks, mixed quotes) — heredoc, no escaping
    dbsql <<'SQL'
    SELECT COUNT(*) FROM parquet.`abfss://data@store.dfs.core.windows.net/x/`
    WHERE col = 'foo'
    SQL

    dbsql --csv  "SELECT ..." > out.csv
    dbsql --json "SELECT ..." | jq .    # JSON Lines: one object per line, not an array
    dbsql -i     "SELECT ..."           # IPython, df pre-loaded
    dbsql @query.sql                    # SQL from file — best for repeatable queries
    dbsql - < query.sql                 # equivalently, pipe a file via stdin

Bash quoting — pick the form that fits the SQL:
  - Simple one-liner with string literals      →  dbsql "..."
  - Multi-line / backticks / mixed quotes      →  dbsql <<'SQL' ... SQL  (literal, no escaping)
  - Same but you want $VAR expansion           →  dbsql <<SQL ... SQL
  - Repeatable / under version control         →  dbsql @file.sql

The script reads stdin when no SQL arg is given, so heredocs Just Work.

Inspecting files, not contents — `binaryFile` returns path/length/modificationTime
without parsing the data, so it works on any format and is cheap over big globs
(it's just a directory listing). Best tool for "when did data land?":
    dbsql <<'SQL'
    WITH f AS (                       -- glob fans out across partitions; no bash loop
      SELECT regexp_extract(path, 'stg/([0-9]{8})/', 1) AS dt, modificationTime AS mtime
      FROM binaryFile.`abfss://data@acct.dfs.core.windows.net/path/2026*/1200/x`
    )
    SELECT dt, min(mtime) AS first_arrival, count(*) AS n_files
    FROM f WHERE dt >= '20260223'     -- dt is derived, so filter in the outer query
    GROUP BY dt ORDER BY dt
    SQL
Globs are lexical, not date-aware: bound the glob (`2026*`) and filter the
extracted `dt` in an outer query/CTE as above — a SELECT alias isn't usable in
`WHERE`. `modificationTime` is filesystem mtime (≈ writer-finish), not a
pipeline event time.

`binaryFile` follows Spark hidden-file rules and skips `_*` / `.*` files even
when named explicitly, so it will not show `_SUCCESS`, `_committed_*`,
`_started_*`, or `_delta_log/`. To confirm marker-file existence, use
`databricks fs ls` only for DBFS/UC Volume paths; for raw `abfss://`, use Azure
storage tooling or a workspace-visible mount/Volume path if one exists.

`modificationTime` comes back as the SQL warehouse timestamp (UTC); prefer it
for absolute times. Treat `databricks fs ls -l` timestamps as existence/order
checks unless you've verified the timezone display. Path date/hour labels may be
business-time partitions, not UTC — compare them against `modificationTime`
explicitly rather than assuming the same zone.

Table metadata, no scan — for managed/Delta tables (the table-side sibling of
`binaryFile`, answering "when was this last written / how big is it?"):
    # last writes + when; DESCRIBE HISTORY is very wide, so project cols
    dbsql "SELECT version, timestamp, operation
           FROM (DESCRIBE HISTORY catalog.schema.table) ORDER BY version DESC LIMIT 5"
    # freshness as ONE value — aggregate it; never pipe HISTORY through tail
    dbsql "SELECT max(timestamp) AS last_write FROM (DESCRIBE HISTORY catalog.schema.table)"
    dbsql "DESCRIBE DETAIL catalog.schema.table" --json   # files/bytes/location
DESCRIBE HISTORY is newest-first and bounded by the table's log retention
(default ~30 days), so `| tail -N` returns the OLDEST retained rows — a
month-old timestamp that reads convincingly as "this table went stale a month
ago". Aggregate (max/min) instead of slicing with shell tools.
(Delta-only. Only DESCRIBE HISTORY can be wrapped in FROM (...) for column
projection — FROM (DESCRIBE DETAIL ...) is a parse error on this warehouse,
so take DETAIL whole via --json. Raw output of either wraps illegibly in
table mode. Also: binaryFile.`<delta-table-dir>` errors — Spark insists on
the delta reader once it sees _delta_log; use DESCRIBE DETAIL for file
counts/sizes of managed tables instead.)

Discovery — when you know a fragment but not the exact name/columns:
    # don't know which catalog/schema holds a table? search ALL of them in one
    # query — system.information_schema spans every catalog you can see, so this
    # beats guessing catalogs one at a time:
    dbsql "SELECT table_catalog, table_schema FROM system.information_schema.tables
           WHERE table_name = 'events_daily'"
    dbsql "SHOW TABLES IN catalog.schema LIKE '*pixel*'"   # within one known schema
    dbsql "SHOW COLUMNS IN catalog.schema.table"
    dbsql "DESCRIBE TABLE EXTENDED catalog.schema.table"   # cols + location + format
(A per-catalog `<catalog>.information_schema.tables` works too, but backtick any
catalog containing a hyphen: `my-catalog`.information_schema.tables — a bare
my-catalog parses as subtraction and errors.)

Schema of raw files at a path (no catalog table) — wrap the path read in
DESCRIBE QUERY; a bare `DESCRIBE parquet.`...`` fails with
TABLE_OR_VIEW_NOT_FOUND because DESCRIBE TABLE doesn't take path tables:
    dbsql <<'SQL'
    DESCRIBE QUERY SELECT * FROM parquet.`abfss://data@acct.dfs.core.windows.net/path/`
    SQL
(Works with json./csv./delta. too — but DESCRIBE needs the QUERY form.)

Bare-directory reads do NOT recurse plain subdirectories. A path-table read of
a directory sees only the files directly in it (plus `key=value` partition
dirs). On a date/hour tree (`<path>/20260612/16/part-*.parquet`) a bare-dir
read is a silent-wrong risk: `binaryFile` returns 0 rows (reads as "no data"),
`parquet` fails with UNABLE_TO_INFER_SCHEMA. Glob to the depth where the files
live (`<path>/*/*` here). Treat an empty result as "check the glob depth",
never as "the feed is dead" — that misread has produced a wrong staleness
conclusion once already.

Partitions — "which partitions exist?" has a shortcut that wraps the binaryFile
recipe above:
    dbsql --partitions abfss://data@acct.dfs.core.windows.net/events/x
    dbsql --partitions abfss://acct…/events/x --regex '/(20[0-9]{6})/'  # custom key
    dbsql --partitions abfss://acct…/events/x --sort mtime              # freshest write first
Lists each partition with file count, MB, and first/last write time, ordered by
partition key descending (ls-style) — the write-time columns are for spotting
backfills/staleness, not the sort key. Use --sort mtime to order by most-recent
write instead. Default key is an 8-digit date; pass --regex (capture group 1)
for other layouts. Globs the prefix as `<path>/*/*` unless it already has a `*`.
Delta table directories refuse this raw-file listing (DELTA_INVALID_FORMAT) —
the error then names the Delta-native alternatives: SHOW PARTITIONS delta.`…`
for the keys, DESCRIBE HISTORY for write times.

Table mode fetches the COMPLETE partition list (it's pre-aggregated, so small)
and prints a whole-result summary line ABOVE the table — count, full key range,
total files/GB — then shows the first --max-rows rows. Trust the summary for
range/totals even when the table below is clipped: the key range comes from the
full listing, so the last visible row is never a data boundary. (A head-piped
listing was once read as "older partitions deleted" when the pipe had simply
cut the output.)

Cost model: the warehouse walks EVERY entry under the glob before aggregating,
so runtime scales with file count, not calendar span (~200k files ≈ 2 min on
the default warehouse; liveness lines on stderr show it's alive). A glob
covering fewer files cuts the time proportionally — note even a glob matching
zero files pays for the walk. The glob must reach the directories that
directly contain files, whatever the layout — the auto glob `/*/*` assumes two
levels, so add or drop `/*` for deeper/shallower trees. E.g. narrowing a
date/hour tree by month is `<path>/YYYYMM*/*`, not `<path>/YYYYMM*` (that
matches the date dirs themselves and finds 0 files; the tool prints a hint
when a listing comes back empty).

Non-SELECT statements (CREATE, INSERT, GRANT, OPTIMIZE, ...) print a status
line to stderr and exit 0; no result set is fetched.

Liveness — fast calls are silent; once a call passes ~5s (above the ~2-4s
floor every call pays for auth + connect), stderr gets a "still running (Ns)"
line saying what's slow and how to make it fast, then periodic heartbeats with
elapsed time, and a "done in Ns" on completion when it ran ≥5s. Lines mean
it's alive, not hung; the first one is flushed early enough to survive a
client-side timeout kill, so even a killed run explains itself (re-run
backgrounded or narrowed rather than assuming breakage).

Every call also appends one JSON Lines record to
~/.local/state/dbsql/latency.jsonl ($XDG_STATE_HOME honoured; rotates once
at 1MB so disk is capped ~2MB): {ts, elapsed, mode, ok, beats, verb, wh,
input, n} — input is what you asked for (the SQL text, or the --partitions
path), as a 120-char whitespace-collapsed preview with any SAS sig= redacted
(never the full text: blobs blow the rotation budget and leak), n is that
input's full length, verb/wh let you segment by query class and warehouse. Ground truth for recalibrating the liveness mark — set it just
above the healthy band — and for drilling into slow/failed calls, e.g.:
    jq -s '[.[]|select(.ok)|.elapsed]|sort|.[(length*95/100|floor)]' \
        ~/.local/state/dbsql/latency.jsonl    # p95 of successful calls
    jq -c 'select(.elapsed > 30) | {ts, elapsed, verb, input}' \
        ~/.local/state/dbsql/latency.jsonl    # what were the slow ones?

`--csv`, `--json`, and `-i` fetch the full result into memory — bound them
with SQL `LIMIT` (`--max-rows` is table-mode-only and errors elsewhere, so a
bound you thought you set can't be silently ignored). With `--partitions`,
the summary line and the 0-partitions hint go to stderr in these modes —
stdout stays pure data. Default table mode is bounded by `--max-rows` (50);
when it clips rows, or clips a long cell value to 200 chars, it warns on
stderr — heed it, silent truncation has produced wrong conclusions. Warnings
print BEFORE the table so they survive `| head` and clipped contexts.
Truncation keeps your ORDER BY, so sort the column you care about DESC to
keep the relevant rows in view. If the downstream consumer closes the pipe
early (`| head`), dbsql exits quietly with 141 (SIGPIPE convention) — not a
failure.

Scope — `dbsql` is for SQL/data inspection only. For Databricks jobs, runs,
clusters, workspace files, or marker-file existence, use the `databricks` CLI
directly (`jobs list-runs --expand-tasks`, `jobs get-run-output`,
`workspace export`, `fs ls` for DBFS/UC Volume paths). For a workspace with no
profile, set `DATABRICKS_HOST` and `DATABRICKS_AUTH_TYPE=azure-cli`.

Env vars:
    DATABRICKS_CONFIG_FILE     config path (default: ~/.databrickscfg)
    DATABRICKS_CONFIG_PROFILE  profile name (default: DEFAULT)
    DATABRICKS_WAREHOUSE_ID    warehouse ID (an explicit --warehouse wins; else
                               falls back to the profile's `warehouse_id` key
                               in the config file)
"""

from __future__ import annotations

import argparse
import configparser
import contextlib
import json
import os
import pathlib
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

def _profile() -> str:
    return os.environ.get("DATABRICKS_CONFIG_PROFILE", "DEFAULT")


def _normalize_host(h: str) -> str:
    return h.strip().removeprefix("https://").removeprefix("http://").rstrip("/")


def _cfg_path() -> pathlib.Path:
    cfg_path = os.environ.get("DATABRICKS_CONFIG_FILE")
    return pathlib.Path(cfg_path) if cfg_path else pathlib.Path.home() / ".databrickscfg"


def _read_cfg() -> tuple[configparser.ConfigParser, pathlib.Path]:
    cfg_file = _cfg_path()
    # default_section is set to a sentinel so an ini [DEFAULT] section is a
    # normal profile, not configparser "defaults" — otherwise a warehouse_id
    # under [DEFAULT] would silently leak into every other profile, pointing
    # dbsql at a warehouse that doesn't exist in that profile's workspace.
    cfg = configparser.ConfigParser(default_section="<none>")
    cfg.read(cfg_file)
    return cfg, cfg_file


def get_host() -> str:
    # Always read from the same profile that mints the token — no env override,
    # so host and token can't disagree.
    cfg, cfg_file = _read_cfg()
    p = _profile()
    if p not in cfg or "host" not in cfg[p]:
        sys.exit(f"profile {p!r} or its host not found in {cfg_file}")
    return _normalize_host(cfg[p]["host"])


def default_warehouse() -> str | None:
    """Warehouse when --warehouse wasn't passed: DATABRICKS_WAREHOUSE_ID env,
    else the active profile's `warehouse_id` key in the config file (a
    dbsql-specific key the official CLI ignores — lets each profile carry its
    own default warehouse without hardcoding IDs here)."""
    env = os.environ.get("DATABRICKS_WAREHOUSE_ID")
    if env:
        return env
    cfg, _ = _read_cfg()
    p = _profile()
    if p in cfg and "warehouse_id" in cfg[p]:
        return cfg[p]["warehouse_id"].strip()
    return None


def get_token() -> str:
    try:
        out = subprocess.check_output(
            ["databricks", "auth", "token", "--profile", _profile()],
            text=True,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        sys.exit("`databricks` CLI not found in PATH")
    except subprocess.CalledProcessError as e:
        err = e.stderr.strip()
        # The common case: the OAuth refresh token has expired, so `databricks
        # auth token` can't mint a fresh access token. Only an interactive
        # browser re-login fixes it — lead with that exact command instead of
        # the CLI's multi-line message.
        if "refresh token" in err.lower() or "reauthenticate" in err.lower():
            sys.exit(
                f"Databricks login for profile {_profile()!r} has expired. Re-login (opens a browser):\n"
                f"    databricks auth login --profile {_profile()}"
            )
        sys.exit(f"`databricks auth token` failed:\n{err}")
    try:
        return json.loads(out)["access_token"]
    except (json.JSONDecodeError, KeyError) as e:
        sys.exit(f"unexpected `databricks auth token` output ({e}): {out!r}")


def read_sql(arg: str | None) -> str:
    if arg is None or arg == "-":
        return sys.stdin.read()
    if arg.startswith("@"):
        return pathlib.Path(arg[1:]).read_text()
    return arg


# Liveness thresholds (seconds). The first mark sits ABOVE the tool's healthy
# floor (~2-4s: token-mint subprocess + connect handshake on every call) so the
# line only fires when a wait is abnormal — at 2s it fired on nearly every
# routine call and read as wallpaper. Early marks are front-loaded because the
# first line doubles as expectation-setting; after them, one heartbeat per minute.
_PROGRESS_MARKS = (5.0, 15.0, 30.0, 60.0)
PROGRESS_EVERY = 60.0
DONE_AT = 5.0  # report total elapsed when the call took at least this long

# Latency log: one JSON Lines record per call, the ground truth for recalibrating
# _PROGRESS_MARKS from real usage (query mix, time-of-day, contention, cold
# starts) instead of synthetic benchmarks. Bounded by one-generation rotation:
# at LATENCY_LOG_MAX the file is renamed to .1 (clobbering the previous .1),
# so disk cost is capped at ~2x LATENCY_LOG_MAX no matter how long it runs.
LATENCY_LOG_MAX = 1_000_000  # bytes; ~100B/record -> ~10k calls per generation
LATENCY_LOG_DIR = (
    pathlib.Path(os.environ.get("XDG_STATE_HOME") or pathlib.Path.home() / ".local/state")
    / "dbsql"
)


def _preview(s: str, cap: int = 120) -> str:
    """Identity for a log record without the blob: whitespace-collapsed,
    secret-redacted (a SAS sig= pasted into a query must never land in a log
    verbatim — house rule for these tools), capped so a heredoc monster can't
    eat the rotation budget. Pair with the full-length field `n` so a clipped
    preview is visibly clipped."""
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(sig=)[^&'\"\s]+", r"\1REDACTED", s, flags=re.IGNORECASE)
    return s[:cap]


def _log_extra(partitions: str | None, sql_text: str, warehouse: str) -> dict:
    """Identity fields for a latency record. `input` is what the user asked
    for — SQL text, or the --partitions path (mode-neutral name: a field
    called `sql` holding a path would lie to consumers). Invariant: `input`
    (capped preview) and `n` (full length) MUST derive from the same string,
    or `n` can't say whether the preview was clipped — for --partitions that
    identity is the user's path, not the generated boilerplate SQL."""
    identity = partitions if partitions else sql_text
    return {
        "verb": "partitions" if partitions else sql_text.split(None, 1)[0].lower(),
        "wh": warehouse,
        "input": _preview(identity),
        "n": len(identity),
    }


def _log_latency(
    elapsed: float, mode: str, ok: bool, beats: int, extra: dict | None = None
) -> None:
    """Telemetry must never break or slow the query path: pure local append,
    all I/O failures swallowed."""
    try:
        LATENCY_LOG_DIR.mkdir(parents=True, exist_ok=True)
        f = LATENCY_LOG_DIR / "latency.jsonl"
        try:
            if f.stat().st_size >= LATENCY_LOG_MAX:
                os.replace(f, f.with_suffix(".jsonl.1"))
        except OSError:
            pass  # no log yet, or lost a rotation race — append regardless
        rec = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "elapsed": round(elapsed, 2),
            "mode": mode,
            "ok": ok,
            "beats": beats,
            **(extra or {}),
        }
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
    except OSError:
        pass


@contextlib.contextmanager
def _progress(hint: str = "", mode: str = "sql", extra: dict | None = None):
    """Threshold-based liveness on stderr around a blocking call: silent when
    fast, a status line at ~5s (flushed immediately, so it survives a client
    timeout kill), heartbeats with elapsed time after, and total elapsed on
    success when slow. The first line carries `hint` — what's slow and the
    lever to make it fast — because the agent/human only reasons from output
    that actually reached them; silence reads as a hang. Every call is also
    recorded via _log_latency for threshold recalibration."""
    start = time.monotonic()
    done = threading.Event()
    beats = 0

    def marks():
        yield from _PROGRESS_MARKS
        m = _PROGRESS_MARKS[-1]
        while True:
            m += PROGRESS_EVERY
            yield m

    def beat():
        nonlocal beats
        first = True
        for m in marks():
            if done.wait(max(0.0, start + m - time.monotonic())):
                return
            line = f"… still running ({time.monotonic() - start:.0f}s)"
            if first and hint:
                line += f" — {hint}"
            first = False
            beats += 1
            print(line, file=sys.stderr, flush=True)

    t = threading.Thread(target=beat, daemon=True)
    t.start()
    ok = False
    try:
        yield
        ok = True
    finally:
        done.set()
        t.join(timeout=1.0)
        elapsed = time.monotonic() - start
        if ok and elapsed >= DONE_AT:
            print(f"… done in {elapsed:.0f}s", file=sys.stderr, flush=True)
        _log_latency(elapsed, mode, ok, beats, extra)


def _partitions_paths(path: str) -> tuple[str, str]:
    """Normalize a --partitions PATH (trailing slash and backticks stripped —
    backtick-quoted; abfss has none) into the two forms the tool needs: the
    glob binaryFile scans (PATH itself if it already carries a `*`, else
    `<PATH>/*/*`), and the directory root with any glob cut back to the last
    complete segment (`…/x/202506*/*` → `…/x`) — the form a delta.`…`
    reference needs, since SHOW PARTITIONS / DESCRIBE HISTORY take a table
    path, not a glob. One function so the query and the error hint can't
    drift apart in how they read the PATH."""
    path = path.rstrip("/").replace("`", "")
    glob = path if "*" in path else f"{path}/*/*"
    root = path.split("*", 1)[0].rsplit("/", 1)[0] if "*" in path else path
    return glob, root


def _partitions_sql(path: str, regex: str, sort: str = "key") -> str:
    """Build the SQL for --partitions: list partitions under an `abfss://`
    prefix (file count, MB, first/last write time). `regex` group 1 is the
    partition key (default: an 8-digit date). `sort` is "key" (partition key
    DESC, ls-style — the default) or "mtime" (most-recently-written first)."""
    glob, _ = _partitions_paths(path)
    # The regex lands in a single-quoted Spark SQL literal, which processes
    # backslash escapes — an unescaped \d would reach regexp_extract as a
    # literal 'd' and silently match nothing. Double the backslashes so the
    # user-facing contract stays "pass a normal regex".
    regex = regex.replace("\\", "\\\\").replace("'", "''")
    order = "last_write DESC, partition DESC" if sort == "mtime" else "partition DESC"
    return f"""WITH f AS (
  SELECT regexp_extract(path, '{regex}', 1) AS partition,
         length AS len, modificationTime AS mtime
  FROM binaryFile.`{glob}`
)
SELECT partition, count(*) AS files, round(sum(len) / 1e6, 1) AS mb,
       min(mtime) AS first_write, max(mtime) AS last_write
FROM f WHERE partition <> ''
GROUP BY partition ORDER BY {order}"""


# binaryFile over a Delta table directory fails loud (DELTA_INVALID_FORMAT on
# `_delta_log`) but prescribes nothing — Spark's message says "use format
# delta", not what command answers the partition question. Make the error
# carry its own fix. No auto-fallback: SHOW PARTITIONS returns keys only, and
# silently swapping in a result without file counts/sizes/write-times would
# look like the listing the caller asked for.
DELTA_PARTITIONS_HINT = (
    "⚠ this path is a Delta table — --partitions lists raw files (binaryFile), "
    "which Spark refuses over a Delta directory. Ask the table instead:\n"
    "    dbsql 'SHOW PARTITIONS delta.`{path}`'    # partition keys (no file stats)\n"
    "    dbsql 'DESCRIBE HISTORY delta.`{path}`'   # write times, for staleness/backfills"
)


# An empty result from a path-table read is usually a wrong-depth path, not an
# empty tree: bare-directory reads don't recurse plain subdirectories (only
# key=value partition dirs), so binaryFile over a <path>/<date>/<hour>/ tree
# returns 0 rows when queried at <path> or <path>/<date>. Once misread as
# "feed went stale" when the files sat one level deeper.
PATH_TABLE_RE = re.compile(
    r"\b(?:binaryFile|parquet|json|csv|text|orc|avro)\s*\.\s*`", re.IGNORECASE
)
EMPTY_PATH_TABLE_HINT = (
    "⚠ 0 rows from a path read — if the tree nests plain subdirectories "
    "(e.g. <path>/<YYYYMMDD>/<HH>/part-*), a bare directory read does NOT "
    "recurse: glob to the depth where the files live (<path>/*/*). Verify "
    "with a depth-matched glob or --partitions before concluding the data "
    "doesn't exist."
)

# 0 partitions is usually a silent operator error, not an empty prefix — say so.
EMPTY_PARTITIONS_HINT = (
    "⚠ 0 partitions — common causes: the glob doesn't reach the directories "
    "that directly contain files (a bare prefix globs as <path>/*/*, i.e. two "
    "levels — add or drop /* to match your tree's depth; e.g. narrowing a "
    "date/hour tree by month is <path>/YYYYMM*/*, not <path>/YYYYMM*), or no "
    "path segment matched the partition-key regex (default: 8-digit date — "
    "see --regex)."
)


def _partitions_summary(df) -> str:
    """One-line whole-result summary for --partitions table mode, printed ABOVE
    the table. The key range is computed from the complete listing, so it stays
    truthful when the table below is clipped by --max-rows or a `| head` pipe —
    the last visible row must never be mistakable for a data boundary."""
    if df.empty:
        return "0 partitions"
    keys = df["partition"].astype(str)
    files = int(df["files"].sum())
    gb = float(df["mb"].sum()) / 1e3
    return (
        f"{len(df):,} partitions: {keys.min()} → {keys.max()}, "
        f"{files:,} files, {gb:,.1f} GB"
    )


def _status_line(sql_text: str, cur) -> str:
    verb = sql_text.lstrip().split(None, 1)[0].upper()
    n = getattr(cur, "rowcount", None)
    status = f"{verb} OK"
    if isinstance(n, int) and n >= 0:
        status += f" ({n:,} rows)"
    return status


def run_query(sql_text: str, warehouse_id: str, limit: int | None = None):
    from databricks import sql

    with sql.connect(
        server_hostname=get_host(),
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=get_token(),
    ) as conn, conn.cursor() as cur:
        cur.execute(sql_text)

        # Two ways a statement can be result-less:
        #   (a) DB-API: cur.description is None — fetch* would raise
        #       ProgrammingError("There is no active result set").
        #   (b) Databricks quirk: connector fabricates a `[('Result', 'string', ...)]`
        #       description and returns a zero-column Arrow table on fetch.
        # Check (a) before fetching, then (b) on the fetched table.
        if cur.description is None:
            return None, False, _status_line(sql_text, cur)

        arrow = cur.fetchall_arrow() if limit is None else cur.fetchmany_arrow(limit + 1)
        if arrow.num_columns == 0:
            return None, False, _status_line(sql_text, cur)

        # integer_object_nulls: by default pyarrow's to_pandas() yields numpy-backed
        # columns, and numpy has no integer NA - so an integer column containing any
        # NULL is upcast to float64 and a bigint id/count `10` serialises as `10.0` in
        # --json/--csv (and prints `10.0` in the table), silently lossy on the
        # agent-facing path. This is a numpy-dtype limitation, not pandas-version
        # specific (it holds on the pandas 3.x we resolve today). Casting such columns
        # to Python int/None instead emits a clean `10`/`null`; all-non-null int columns
        # still come back as native int64, and float/decimal/timestamp/array/struct are
        # unaffected (verified against the warehouse).
        df = arrow.to_pandas(integer_object_nulls=True)
        if limit is not None and len(df) > limit:
            return df.iloc[:limit].reset_index(drop=True), True, None
        return df, False, None


CELL_CAP = 200  # max chars shown per cell in table mode


def print_table(
    df,
    truncated: bool,
    max_rows: int | None = None,
    total_rows: int | None = None,
    lead: str | None = None,
) -> None:
    from rich.console import Console
    from rich.table import Table
    from rich.text import Text

    console = Console()
    err = Console(stderr=True)
    table = Table(show_header=True, header_style="bold cyan", box=None, pad_edge=False)
    for col in df.columns:
        table.add_column(str(col), overflow="fold")

    clipped = 0  # cells whose value was cut to fit CELL_CAP

    def fmt(v):
        nonlocal clipped
        if v is None or (isinstance(v, float) and v != v) or type(v).__name__ == "NaTType":
            return Text("NULL", style="dim italic")
        s = str(v)
        if len(s) > CELL_CAP:
            clipped += 1
            s = s[: CELL_CAP - 3] + "..."
        # Text, not str: rich parses bare strings as console markup, so a cell
        # containing brackets ([INFO] log lines, JSON arrays, ["a","b"]) gets
        # its "tags" silently eaten — and a closing-tag shape like [/x] crashes
        # with MarkupError after the query was already paid for.
        return Text(s)

    for row in df.itertuples(index=False):
        table.add_row(*[fmt(v) for v in row])

    # Summary + warnings go ABOVE the table: a tail-truncating consumer
    # (`| head`, a clipped context window) must still see the completeness
    # caveats. Bottom-positioned warnings died in exactly that pipe once and
    # the clipped table read as a complete result.
    if lead:
        console.print(Text(lead, style="bold"))  # Text: lead may carry user data
    if truncated:
        cap = f" (now {max_rows})" if max_rows is not None else ""
        of_total = f" of {total_rows:,}" if total_rows is not None else ""
        more = "" if total_rows is not None else " — there are more"
        err.print(
            f"[yellow]⚠ showing the first {len(df):,}{of_total} rows{more}. "
            f"Raise --max-rows{cap}, tighten LIMIT/WHERE, or use --csv/--json/-i "
            f"for the full result. Truncation keeps your ORDER BY, so an ASC sort "
            f"hides the newest rows.[/yellow]"
        )
    if clipped:
        err.print(
            f"[yellow]⚠ {clipped:,} cell value(s) clipped to {CELL_CAP} chars for "
            f"display (e.g. a long concat_ws/collect_list) — use --json/--csv/-i "
            f"for full values.[/yellow]"
        )

    console.print(table)
    if truncated and total_rows is not None:
        row_count = f"{len(df):,} of {total_rows:,} rows"
    elif truncated:
        row_count = f"{len(df):,}+ rows"
    else:
        row_count = f"{len(df):,} rows"
    console.print(f"[dim]{row_count} × {len(df.columns)} cols[/dim]")


def main() -> None:
    desc, _, epilog = (__doc__ or "").partition("\n\n")
    p = argparse.ArgumentParser(
        description=desc.strip(),
        epilog=epilog.strip(),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("sql", nargs="?", help="SQL string, '-' for stdin, or '@file.sql'")
    p.add_argument(
        "--warehouse",
        default=None,
        help="Warehouse ID (default: $DATABRICKS_WAREHOUSE_ID, else the "
             f"profile's `warehouse_id` key in {_cfg_path()})",
    )
    p.add_argument(
        "--max-rows", type=int, default=None,
        help="Rows shown in default table mode (default: 50). Errors with "
             "--csv/--json/-i — bound those with SQL LIMIT instead.",
    )
    p.add_argument(
        "--partitions", metavar="ABFSS_PATH",
        help="Instead of running SQL, list partitions under an abfss:// prefix "
             "(files/MB/write-times), ordered by partition key. See --sort, --regex.",
    )
    p.add_argument(
        "--regex", default=None,
        help=r"Partition-key regex for --partitions; capture group 1 is the key "
             r"(default: /([0-9]{8})/ — an 8-digit date segment).",
    )
    p.add_argument(
        "--sort", choices=["key", "mtime"], default=None,
        help="With --partitions: order by partition key descending (default) or "
             "by most-recent write time (mtime).",
    )
    out = p.add_mutually_exclusive_group()
    out.add_argument("--csv", action="store_true", help="Emit CSV to stdout")
    out.add_argument(
        "--json", action="store_true",
        help="Emit JSON Lines (one object per line) to stdout",
    )
    out.add_argument(
        "-i", "--interactive", action="store_true",
        help="Drop into IPython with `df` (pandas) pre-loaded",
    )
    args = p.parse_args()
    if args.warehouse is None:
        args.warehouse = default_warehouse()
    if not args.warehouse:
        p.error(
            "no warehouse configured — pass --warehouse <id>, set "
            "DATABRICKS_WAREHOUSE_ID, or add `warehouse_id = <id>` to profile "
            f"[{_profile()}] in {_cfg_path()}"
        )
    # A silently-ignored bound is worse than an error: an agent that passed
    # --max-rows with --json would believe the output is bounded when the full
    # result is about to flood it. Same hard-error treatment as --regex/--sort.
    if args.max_rows is not None and (args.csv or args.json or args.interactive):
        p.error("--max-rows only applies to table mode — use SQL LIMIT with --csv/--json/-i")
    if args.max_rows is None:
        args.max_rows = 50
    if args.max_rows < 0:
        p.error("--max-rows must be >= 0")

    if not args.partitions and (args.regex is not None or args.sort is not None):
        p.error("--regex and --sort only apply with --partitions")

    if args.partitions:
        if args.sql:
            p.error("--partitions takes no SQL argument")
        if args.regex is not None:
            # Validate client-side: without a capture group the warehouse
            # fails with the undecodable "Specified regexp group (1) cannot
            # exceed 0".
            try:
                if re.compile(args.regex).groups < 1:
                    p.error(
                        "--regex needs a capture group — group 1 is the "
                        "partition key: '/([0-9]{6})/', not '[0-9]{6}'"
                    )
            except re.error as e:
                p.error(f"--regex is not a valid regex: {e}")
        sql_text = _partitions_sql(
            args.partitions, args.regex or r"/([0-9]{8})/", args.sort or "key"
        )
    else:
        if args.sql is None and sys.stdin.isatty():
            p.error("no SQL provided (pass as arg, '-' for stdin, or '@file.sql')")
        sql_text = read_sql(args.sql).strip()
        if not sql_text:
            sys.exit("no SQL provided (pass as arg, '-' for stdin, or '@file')")

    table_mode = not (args.interactive or args.csv or args.json)
    if args.partitions:
        slow_hint = (
            "the warehouse walks every entry under the glob before "
            "aggregating, so time scales with file count (~200k files ≈ "
            "2 min here). A glob over fewer files (e.g. <path>/YYYYMM*/* "
            "for one month of a date/hour tree) cuts it proportionally"
        )
    else:
        slow_hint = "the warehouse may be cold or the query heavy; Ctrl-C aborts"
    # Log identity alongside elapsed so slow/failed records are self-sufficient:
    # verb groups by query class, input is a capped redacted preview of what
    # was asked, n exposes the full length a clipped preview hides, wh
    # segments per warehouse.
    extra = _log_extra(args.partitions, sql_text, args.warehouse)
    # --partitions always fetches the complete list (pre-aggregated, one row per
    # partition) so the summary line above the table can state the true key
    # range/totals; only the table display is capped.
    try:
        with _progress(slow_hint, mode="partitions" if args.partitions else "sql", extra=extra):
            df, truncated, status = run_query(
                sql_text,
                args.warehouse,
                limit=args.max_rows if table_mode and not args.partitions else None,
            )
    except Exception as e:
        if (
            args.partitions
            and type(e).__module__.startswith("databricks.sql")
            and "DELTA_INVALID_FORMAT" in str(e)
        ):
            # Error first, prescription last — the hint is what the next
            # command should be built from.
            print(f"dbsql: {e}", file=sys.stderr)
            _, root = _partitions_paths(args.partitions)
            sys.exit(DELTA_PARTITIONS_HINT.format(path=root))
        raise

    if status is not None:
        print(status, file=sys.stderr)
        return

    # Partitions metadata must reach EVERY output mode, on stderr so stdout
    # stays pure data for --csv/--json consumers: the 0-partitions diagnosis
    # (previously table-only — a wrong-depth glob under --json emitted a blank
    # line and exit 0, reading as "no partitions exist"), and the summary line
    # in csv/json (table mode prints it as the lead instead).
    if args.partitions:
        if df.empty:
            print(EMPTY_PARTITIONS_HINT, file=sys.stderr)
        elif args.csv or args.json:
            print(_partitions_summary(df), file=sys.stderr)
    elif df.empty and PATH_TABLE_RE.search(sql_text):
        # A WHERE-filtered empty result also lands here — the hint is
        # conditional ("if the tree nests…") and stderr-only, so a false
        # positive costs a glance; the false negative cost a wrong conclusion.
        print(EMPTY_PATH_TABLE_HINT, file=sys.stderr)

    if args.interactive:
        import pandas as pd  # noqa: F401  -- exposed for the user
        from IPython import embed

        banner = (
            f"df: {len(df):,} rows × {len(df.columns)} cols\n"
            f"cols: {list(df.columns)}"
        )
        embed(header=banner, colors="neutral")
    elif args.csv:
        df.to_csv(sys.stdout, index=False)
    elif args.json:
        df.to_json(sys.stdout, orient="records", lines=True, date_format="iso")
        sys.stdout.write("\n")
    elif args.partitions:
        total = len(df)
        print_table(
            df.iloc[: args.max_rows],
            truncated=total > args.max_rows,
            max_rows=args.max_rows,
            total_rows=total,
            lead=_partitions_summary(df),
        )
    else:
        print_table(df, truncated=truncated, max_rows=args.max_rows)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # The consumer (| head) closed the pipe after taking what it wanted —
        # pipe mechanics, not a tool failure. Die like GNU tools (128+SIGPIPE),
        # without the multi-screen pandas traceback that otherwise lands on
        # stderr and reads as breakage to an agent.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(141)
    except Exception as e:
        # Warehouse/SQL errors arrive as connector exceptions whose ~40-line
        # traceback wraps one useful line (the server message). Flatten those
        # to that line + exit 1; anything else is a real bug — keep its trace.
        if type(e).__module__.startswith("databricks.sql"):
            sys.exit(f"dbsql: {e}")
        raise
