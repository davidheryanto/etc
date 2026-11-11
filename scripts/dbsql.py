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

Auth follows the profile's `auth_type` in ~/.databrickscfg (see "Auth" below):
`azure-cli` uses your `az login`; anything else uses `databricks auth login`.

Use fully-qualified names (`catalog.schema.table`) — no default catalog/schema
is set, and `USE CATALOG ...` won't work (each statement runs on its own cursor).

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
    dbsql --write @setup.sql            # several ';'-separated statements: run in order,
                                        # stop at the first error (table mode only);
                                        # --write because the file creates/changes things

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
`_started_*`, or `_delta_log/`. To confirm marker-file existence, use `LIST`
(next section).

Listing a directory — `LIST` is the `ls` of the warehouse: one level, files and
sub-directories, INCLUDING the `_*` / `.*` files `binaryFile` hides. Use it to
walk an unfamiliar tree level by level before choosing a glob, and to confirm
a marker file exists:
    dbsql "LIST 'abfss://data@acct.dfs.core.windows.net/path/20260612/16/'"
    dbsql --json "LIST 'abfss://data@acct.dfs.core.windows.net/path/'" | jq -r .name
Columns: path, name (directories end in `/`), size (bytes; 0 for directories),
modification_time (epoch MILLISECONDS, UTC — not a formatted timestamp).
The path is a quoted string, not a backticked path table. `LIST` is a
statement, not a relation: `SELECT ... FROM (LIST '...')` is a parse error, so
filter or format with `--json | jq`. The full `path` column wraps in table
mode; `--json` reads better. Table mode still clips at --max-rows, so a wide
directory (e.g. one entry per day over years) needs `--json`. It does not
recurse: for a whole subtree use `azls -r` (as you), or `--partitions` for a
per-partition rollup. The bytes are read through a Databricks-managed storage
credential, not your Azure login, so a path that shows here can still 403 for
you in azls/azget.

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
live (`<path>/*/*` here; `LIST` a level or two to see the depth instead of
guessing). Treat an empty result as "check the glob depth",
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

Read-only by default. Queries run as YOU (your own login, see "Auth"), with
every grant you hold, so dbsql refuses anything that is not a read unless you
pass --write. Reads are statements that start with SELECT, WITH, FROM, TABLE,
VALUES, DESCRIBE / DESC, SHOW, LIST or EXPLAIN; a WITH or FROM that goes on to
INSERT / MERGE / DELETE / UPDATE is refused too. Everything else (CREATE, INSERT, DROP,
GRANT, OPTIMIZE, VACUUM, SET, USE, any keyword dbsql does not know) needs:
    dbsql --write "OPTIMIZE catalog.schema.table"
    dbsql --write @setup.sql
A refused run exits 1 with nothing executed: a script is checked whole before
its first statement runs. This guards against accidents only; it reads the
leading keyword, it is not a permission boundary. --partitions never needs
--write.

Timeout — a read is cancelled ON THE WAREHOUSE after 1800s (30 min), so a
mistaken glob or join cannot run for hours; the error reads "Statement has
timed out after N seconds". That means the query was too big, not that the
data is missing: narrow it (a tighter glob, a partition filter, a LIMIT on a
smaller scan) or raise the bound. Each statement of a script gets the full
allowance.
    dbsql --timeout 7200 "SELECT ..."   # allow 2 hours
    dbsql --timeout 0    "SELECT ..."   # dbsql sets no limit; the warehouse's own applies
With --write dbsql sets no limit by default (long INSERT / OPTIMIZE runs are
usually meant); pass --timeout to set one.

With --write, a statement that returns no result set (CREATE, INSERT, GRANT,
OPTIMIZE, ...) prints a status line to stderr and exits 0.

Liveness — fast calls are silent; once a call passes ~5s (above the ~2-4s
floor every call pays for auth + connect), stderr gets a "still running (Ns)"
line, then periodic heartbeats, and a "done in Ns" on completion when it ran
≥5s. Each line reports what the WAREHOUSE last said, so slow and stuck look
different:
    … still running (15s): the warehouse is running the statement, last reply 2s ago
    … still running (15s): the statement is queued on the warehouse (starting or busy), ...
    … still running (15s): opening a session (a stopped warehouse takes minutes to start)
    … still running (70s): the statement finished, downloading the result
    … NO REPLY from the warehouse for 40s (65s in; its last status was RUNNING). ...
"running" with a recent reply means wait (or narrow the query); "NO REPLY"
means this connection is stalled, not that the query is slow - Ctrl-C and
re-run. Ctrl-C cancels the statement on the warehouse and exits 130. The first
line also says how to make the call faster, and is flushed early enough to
survive a client-side timeout kill, so even a killed run explains itself
(re-run backgrounded or narrowed rather than assuming breakage).

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
clusters, workspace files, or DBFS/UC Volume listings, use the `databricks` CLI
directly (`jobs list-runs --expand-tasks`, `jobs get-run-output`,
`workspace export`, `fs ls` for DBFS/UC Volume paths). For a workspace with no
profile, set `DATABRICKS_HOST` and `DATABRICKS_AUTH_TYPE=azure-cli`.

Auth — the token comes from one of two logins, chosen by the profile's
`auth_type` key (or $DATABRICKS_AUTH_TYPE, which wins):
    auth_type = azure-cli
        The Azure CLI login. Recommended on Azure: the one login also serves
        azls / azget and the `databricks` CLI, and covers every workspace you
        can reach. Renew with:
            az login
        If your Azure login spans several tenants, add the workspace's tenant
        to the profile as `azure_tenant_id = <tenant-id>`; otherwise the token
        comes from whichever subscription `az account set` last made active.
    auth_type = databricks-cli   (also when the profile has no auth_type)
        The Databricks login, kept per workspace. It expires more often; renew
        with a browser re-login:
            databricks auth login --profile <name>
To use the other login for one call, without editing the profile:
    DATABRICKS_AUTH_TYPE=databricks-cli dbsql "SELECT 1"
When a login has expired, dbsql exits 1 and prints the command that renews it.

Env vars:
    DATABRICKS_AUTH_TYPE       `azure-cli` or `databricks-cli`; overrides the
                               profile's `auth_type` key
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


# Microsoft's fixed application ID for the Azure Databricks service, the same in
# every tenant: the resource an Entra token must be issued for to be accepted
# by a workspace.
_AZURE_DATABRICKS_RESOURCE = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d"


def _auth_type() -> str:
    """Which login mints the token: $DATABRICKS_AUTH_TYPE, else the profile's
    `auth_type` key ("" when neither is set). Same precedence as the Databricks
    SDK, so dbsql and the `databricks` CLI agree on one profile."""
    env = os.environ.get("DATABRICKS_AUTH_TYPE", "").strip()
    if env:
        return env
    cfg, _ = _read_cfg()
    p = _profile()
    return cfg[p].get("auth_type", "").strip() if p in cfg else ""


def _azure_cli_token() -> str:
    cmd = ["az", "account", "get-access-token", "--resource", _AZURE_DATABRICKS_RESOURCE,
           "--query", "accessToken", "--output", "tsv"]
    # Without --tenant, az issues the token from whichever subscription is
    # active, so an `az account set` into another tenant would hand the
    # workspace a token it rejects. The profile key pins the tenant.
    cfg, _ = _read_cfg()
    p = _profile()
    tenant = cfg[p].get("azure_tenant_id", "").strip() if p in cfg else ""
    if tenant:
        cmd += ["--tenant", tenant]
    try:
        out = subprocess.check_output(
            cmd,
            text=True,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        sys.exit(
            f"profile {_profile()!r} uses the Azure CLI login (auth_type = azure-cli), "
            "but `az` was not found in PATH"
        )
    except subprocess.CalledProcessError as e:
        # Whatever az reports (signed out, expired session, MFA required), the
        # fix is the same command, so lead with it and keep az's own text below.
        sys.exit(
            f"The Azure CLI login could not issue a Databricks token for profile {_profile()!r}. "
            "Sign in again (opens a browser):\n"
            "    az login\n"
            f"az said:\n{e.stderr.strip()}"
        )
    token = out.strip()
    if not token:
        sys.exit("`az account get-access-token` returned no token")
    # The connector first tries to swap any token Databricks did not issue for
    # one it did, fails on a workspace without token federation, logs a warning
    # and then uses the Entra token as given, which is what the workspace
    # accepts. That warning would print on every successful call.
    import logging

    logging.getLogger("databricks.sql.auth.token_federation").setLevel(logging.ERROR)
    return token


def get_token() -> str:
    # `databricks auth token` only ever serves the Databricks login's own cache
    # and ignores the profile's auth_type, so the Azure CLI login needs its own
    # call.
    if _auth_type() == "azure-cli":
        return _azure_cli_token()
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


def _quote_end(text: str, i: int) -> int:
    """Index just past the quoted run opening at `i`. A backslash escapes the
    next character, EXCEPT in a raw string (`r'...'`), where it is literal: the
    warehouse ends `r'\\'` at its second quote, and reading on past it would hide
    whatever SQL follows from the read-only check."""
    q, n = text[i], len(text)
    # A backticked name has no backslash escape either (a backtick is doubled).
    literal = q == "`" or (
        i > 0 and text[i - 1] in "rR"
        and not (i > 1 and (text[i - 2].isalnum() or text[i - 2] == "_"))
    )
    j = i + 1
    while j < n and text[j] != q:
        j += 2 if text[j] == "\\" and not literal else 1
    return j + 1


def _line_comment_end(text: str, i: int) -> int:
    """Index of the line break ending the `--` comment at `i` (or len). The
    warehouse CONTINUES a line comment over a backslash-newline, so the next
    physical line is still comment; a bare CR ends one as LF does."""
    j, n = i + 2, len(text)
    while j < n:
        if text.startswith("\\\n", j):
            j += 2
        elif text[j] in "\r\n":
            break
        else:
            j += 1
    return j


def _comment_end(text: str, i: int) -> int:
    """Index just past the block comment opening at `i`. Block comments NEST on
    Databricks (`/* a /* b */ c */` is one comment), so stopping at the first
    `*/` would read the rest of the comment as SQL - and the read-only check
    would then judge a statement by a keyword the warehouse never sees."""
    depth, j, n = 1, i + 2, len(text)
    while j < n and depth:
        if text.startswith("/*", j):
            depth += 1; j += 2
        elif text.startswith("*/", j):
            depth -= 1; j += 2
        else:
            j += 1
    return j


def split_statements(text: str) -> list[str]:
    """Split on top-level ';' — outside '…', "…", `…`, -- line comments and /* */.

    The cursor runs one statement per execute(), so a DDL file needs this. Leading
    comment lines are stripped from each piece (so labels and the status verb name the
    SQL); comment-only and blank pieces are dropped.
    """
    out, buf, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c in ("'", '"', "`"):
            j = _quote_end(text, i)
            buf.append(text[i:j]); i = j
        elif text.startswith("--", i):
            j = _line_comment_end(text, i)
            buf.append(text[i:j]); i = j
        elif text.startswith("/*", i):
            j = _comment_end(text, i)
            buf.append(text[i:j]); i = j
        elif c == ";":
            out.append("".join(buf)); buf = []; i += 1
        else:
            buf.append(c); i += 1
    out.append("".join(buf))
    return [_strip_leading_comments(x) for x in out if _has_sql(x)]


def _strip_leading_comments(piece: str) -> str:
    """`piece` without the whitespace and comments in front of its first token.
    Uses the same comment rules as the read-only check, so the text that is
    checked, labelled and executed starts at the same token."""
    i, n = 0, len(piece)
    while i < n:
        if piece[i].isspace():
            i += 1
        elif piece.startswith("--", i):
            i = _line_comment_end(piece, i)
        elif piece.startswith("/*", i):
            i = _comment_end(piece, i)
        else:
            break
    return piece[i:].strip()


def _has_sql(piece: str) -> bool:
    """False for whitespace or comment-only pieces (e.g. a file's trailing comment)."""
    return bool(_code_only(piece).strip())


# Read-only by default. dbsql runs with the caller's own Databricks grants, so
# without this a mistyped or agent-written statement can write wherever those
# grants reach. This is a seatbelt against accidents, NOT a security boundary
# (the real one is a read-only identity): it looks at the leading keyword only.
# Fail closed — an unknown leading keyword counts as a write, so a new statement
# type needs --write until it is added here.
READ_VERBS = frozenset(
    {"select", "with", "from", "table", "values", "describe", "desc", "show",
     "list", "explain"}
)
# Two read keywords can front a write: a CTE (`WITH x AS (...) INSERT INTO t
# SELECT ...`) and the FROM-first form (`FROM src INSERT INTO t SELECT ...`,
# which this warehouse accepts). So WITH and FROM statements are also searched
# for these. An unquoted column named e.g. `update` trips it; that costs one
# --write, the safe direction to be wrong in.
_FRONTS_WRITE = frozenset({"with", "from"})
_INNER_WRITE = re.compile(r"\b(insert|merge|delete|update)\b", re.I)


def _code_only(stmt: str) -> str:
    """The statement with quoted text and comments blanked, so keywords inside
    a string literal, a backticked name or a comment are never matched."""
    out, i, n = [], 0, len(stmt)
    while i < n:
        c = stmt[i]
        if c in ("'", '"', "`"):
            i = _quote_end(stmt, i)
            out.append(" ")
        elif stmt.startswith("--", i):
            i = _line_comment_end(stmt, i)
        elif stmt.startswith("/*", i):
            i = _comment_end(stmt, i)
            out.append(" ")
        else:
            out.append(c); i += 1
    return "".join(out)


def write_verb(stmt: str) -> str | None:
    """The keyword that makes `stmt` a write, or None when it only reads."""
    code = _code_only(stmt)
    m = re.match(r"[\s(]*([A-Za-z_]+)", code)
    verb = m.group(1).lower() if m else ""
    if verb not in READ_VERBS:
        return verb.upper() or "no leading keyword"
    if verb in _FRONTS_WRITE:
        w = _INNER_WRITE.search(code)
        if w:
            return w.group(1).upper()
    return None


# Default --timeout for reads (seconds). Set above the slowest read that has
# finished successfully (about 18 minutes when this was chosen; recheck against
# the latency log before lowering it), and far below the warehouse's own limit,
# so it stops a mistaken glob or cross join without cancelling real work.
# Writes get no default: a long INSERT OVERWRITE / OPTIMIZE is usually meant.
READ_TIMEOUT = 1800

TIMEOUT_HINT = (
    "\n  The warehouse cancelled the statement at dbsql's --timeout. The query was "
    "too big for the limit; this says nothing about whether the data exists.\n"
    "  Narrow it (tighter glob, partition filter), or re-run with a longer limit:\n"
    "    dbsql --timeout 7200 ...   # same command, allowing 2 hours"
)

# Pause between status checks. The warehouse answers a check at once when the
# statement is done and otherwise holds it ~5s, so this only stops a tight loop
# if it ever answers "still running" immediately.
POLL_GAP = 0.2

CANCEL_WAIT = 5.0  # seconds a Ctrl-C waits for the warehouse to accept the cancel

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


# A reply older than this (seconds) is reported as "no reply". While a statement
# runs, each status check is answered within about 5s (the warehouse holds the
# request that long), so a healthy wait never gets near it.
NO_REPLY_AFTER = 20.0


class _Status:
    """Where a call is, as last reported by the warehouse. run_query writes it on
    the main thread, the heartbeat thread reads it: this is what lets a heartbeat
    say "the warehouse is running the query" or "no reply for 40s" instead of
    only proving that the local timer is alive."""

    def __init__(self) -> None:
        self.phase = "start"   # start | connect | query | fetch | close
        self.state = ""        # warehouse state while phase == "query"
        self.replied = None    # monotonic time of the last status reply
        self.finish = lambda ok: None  # set by _progress: stop beats, log latency

    def at(self, phase: str) -> None:
        self.phase = phase

    def reply(self, state: str) -> None:
        self.state, self.replied = state, time.monotonic()


def _beat_line(elapsed: float, st: _Status, now: float) -> str:
    """One heartbeat line from the last thing the warehouse told us."""
    if st.phase == "query" and st.replied is not None:
        quiet = now - st.replied
        if quiet >= NO_REPLY_AFTER:
            return (
                f"… NO REPLY from the warehouse for {quiet:.0f}s ({elapsed:.0f}s in; "
                f"its last status was {st.state}). The query may still be running "
                "there, but this connection looks stalled: Ctrl-C and re-run if "
                "the gap keeps growing"
            )
        what = {
            "PENDING": "the statement is queued on the warehouse (starting or busy)",
            "RUNNING": "the warehouse is running the statement",
            "SUBMITTED": "the warehouse accepted the statement",
        }.get(st.state, f"warehouse status {st.state}")
        return f"… still running ({elapsed:.0f}s): {what}, last reply {quiet:.0f}s ago"
    what = {
        "connect": "opening a session (a stopped warehouse takes minutes to start)",
        "query": "sending the statement, no reply from the warehouse yet",
        "fetch": "the statement finished, downloading the result",
        "close": "closing the session",
    }.get(st.phase, "signing in to Databricks")
    return f"… still running ({elapsed:.0f}s): {what}"


@contextlib.contextmanager
def _progress(hint: str = "", mode: str = "sql", extra: dict | None = None):
    """Threshold-based liveness on stderr around a blocking call: silent when
    fast, a status line at ~5s (flushed immediately, so it survives a client
    timeout kill), heartbeats with elapsed time after, and total elapsed on
    success when slow. Each line says where the call is (see _Status; the block
    yields one for run_query to fill). The first line also carries `hint` — what's
    slow and the lever to make it fast — because the agent/human only reasons
    from output that actually reached them; silence reads as a hang. Every call
    is also recorded via _log_latency for threshold recalibration."""
    start = time.monotonic()
    status = _Status()
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
            now = time.monotonic()
            line = _beat_line(now - start, status, now)
            if first and hint:
                line += f" — {hint}"
            first = False
            beats += 1
            print(line, file=sys.stderr, flush=True)

    t = threading.Thread(target=beat, daemon=True)
    t.start()
    ok = False
    finished = False

    def finish(ok: bool) -> None:
        # Once only: the interrupt path calls it before a hard exit that skips
        # the `finally` below, the normal path calls it from there.
        nonlocal finished
        if finished:
            return
        finished = True
        done.set()
        t.join(timeout=1.0)
        elapsed = time.monotonic() - start
        if ok and elapsed >= DONE_AT:
            print(f"… done in {elapsed:.0f}s", file=sys.stderr, flush=True)
        _log_latency(elapsed, mode, ok, beats, extra)

    status.finish = finish
    try:
        yield status
        ok = True
    finally:
        finish(ok)


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


# Connector 4.0.x returns the Thrift TOperationState integer where later
# versions return an enum; without this a running statement (1) would read as
# finished and the wait would fall through to a blocking call.
_THRIFT_STATES = {
    0: "PENDING", 1: "RUNNING", 2: "SUCCEEDED", 3: "CANCELLED", 4: "CLOSED",
    5: "FAILED", 7: "PENDING", 8: "FAILED",
}


def _state_name(state) -> str:
    name = getattr(state, "name", None)
    if isinstance(name, str):
        return name
    # An unrecognised state counts as running: keep polling, never fetch early.
    return _THRIFT_STATES.get(state, "RUNNING") if isinstance(state, int) else str(state)


def _wait_for_statement(cur, status: _Status) -> None:
    """Block until the submitted statement leaves PENDING/RUNNING, recording each
    reply in `status`. get_query_state raises the warehouse's own error for a
    failed, timed-out or cancelled statement, so messages stay as they were."""
    while True:
        state = cur.get_query_state()
        name = _state_name(state)
        status.reply(name)
        if name not in ("PENDING", "RUNNING"):
            return
        time.sleep(POLL_GAP)


_exit = os._exit  # indirection so tests can observe the hard exit


def _abort(status: _Status) -> None:
    """Leave now after Ctrl-C (exit 130 = 128+SIGINT), from inside the open
    connection. Unwinding normally would close the session with one more
    request to the warehouse, and interpreter shutdown would join the
    connector's worker threads; on the stalled connection that Ctrl-C is the
    advice for, either can hang. The warehouse drops the idle session itself."""
    import signal

    try:
        # A second Ctrl-C from here on would raise inside this handler and
        # unwind through the very session close this function exists to skip.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
    except ValueError:
        pass  # not the main thread: no SIGINT is delivered here anyway
    status.finish(False)
    sys.stdout.flush(); sys.stderr.flush()
    _exit(130)


def _cancel_on_interrupt(cur) -> None:
    """Ask the warehouse to cancel, without letting the cancel itself hang.
    Ctrl-C is the advice for a stalled connection, where the cancel request
    would stall too, so it runs on a thread with a deadline. SIGINT is ignored
    for that window only: a terminal delivers Ctrl-C to `uv` and to this
    process, and the forwarded duplicate would otherwise abort the cancel."""
    import signal

    sent = threading.Event()

    def cancel():
        try:
            cur.cancel()
            sent.set()
        except Exception:
            pass

    previous = signal.signal(signal.SIGINT, signal.SIG_IGN)
    try:
        t = threading.Thread(target=cancel, daemon=True)
        t.start()
        t.join(CANCEL_WAIT)
    finally:
        signal.signal(signal.SIGINT, previous)
    print(
        "dbsql: interrupted; the warehouse was told to cancel the statement"
        if sent.is_set() else
        "dbsql: interrupted; the cancel did not reach the warehouse in "
        f"{CANCEL_WAIT:.0f}s, so the statement may run on until its timeout",
        file=sys.stderr, flush=True,
    )


def run_query(
    sql_text: str,
    warehouse_id: str,
    limit: int | None = None,
    timeout: int = 0,
    status: _Status | None = None,
):
    from databricks import sql

    status = status or _Status()

    # STATEMENT_TIMEOUT is enforced by the warehouse, which cancels the statement
    # itself - a client-side timer would only stop waiting and leave it running.
    session = {"STATEMENT_TIMEOUT": str(timeout)} if timeout else None
    host, token = get_host(), get_token()
    status.at("connect")
    with sql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=token,
        session_configuration=session,
    ) as conn, conn.cursor() as cur:
        # Submit, then ask for the status ourselves: a plain execute() blocks
        # inside the connector and the heartbeat could only say "still waiting".
        try:
            return _run_on(cur, sql_text, limit, status)
        except KeyboardInterrupt:
            # Cancel on the warehouse, not just abandon. "query" covers the
            # submit too: the warehouse may have accepted a statement whose
            # reply never arrived, so the attempt is made either way.
            if status.phase == "query":
                _cancel_on_interrupt(cur)
            _abort(status)
        finally:
            # What follows is closing the cursor and session; without this the
            # heartbeat would go on reporting the statement's last state.
            status.at("close")


def _run_on(cur, sql_text: str, limit: int | None, status: _Status):
    status.at("query")  # before the submit: if that request stalls, say so
    cur.execute_async(sql_text)
    status.reply("SUBMITTED")
    _wait_for_statement(cur, status)
    status.at("fetch")
    cur.get_async_execution_result()

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
    p.add_argument(
        "--write", action="store_true",
        help="Allow statements that change data or objects (INSERT, CREATE, "
             "DROP, GRANT, OPTIMIZE, ...). Without it dbsql only runs reads: "
             "SELECT / WITH / DESCRIBE / SHOW / LIST / EXPLAIN.",
    )
    p.add_argument(
        "--timeout", type=int, default=None, metavar="SECONDS",
        help=f"Cancel a statement on the warehouse after this many seconds "
             f"(default: {READ_TIMEOUT} for reads, none with --write; 0 = none, "
             "leaving only the warehouse's own limit).",
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

    if args.timeout is not None and args.timeout < 0:
        p.error("--timeout must be >= 0")
    if args.timeout is None:
        args.timeout = 0 if args.write else READ_TIMEOUT

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

    stmts = [] if args.partitions else split_statements(sql_text)
    if not args.partitions:
        if not stmts:
            sys.exit("no SQL provided: the input holds only comments or whitespace")
        if len(stmts) == 1:
            # Run the text the read-only check judged, never the unsplit input: a
            # scanner/warehouse disagreement must not let unchecked SQL through.
            sql_text = stmts[0]
    if not args.write:
        # Checked for the whole script up front, so a file with a write on line 9
        # is refused before statements 1-8 run.
        for k, stmt in enumerate(stmts, 1):
            verb = write_verb(stmt)
            if verb:
                where = (
                    f"statement {k} of {len(stmts)}" if len(stmts) > 1
                    else "this statement"
                )
                sys.exit(
                    f"dbsql: refused, nothing was run: {where} is not a plain read "
                    f"({verb}), so it can change data.\n"
                    f"  statement: {_preview(stmt)}\n"
                    "  dbsql only runs reads (SELECT / WITH / DESCRIBE / SHOW / LIST / "
                    "EXPLAIN) unless you allow writes:\n"
                    "    dbsql --write ...   # same command, with --write added"
                )
    if len(stmts) > 1:
        # A script (DDL file, setup steps): run in order, stop at the first failure.
        # Table mode only — --csv/--json promise one result set on stdout, and -i one df.
        if not table_mode:
            p.error(f"{len(stmts)} statements given; --csv/--json/-i take exactly one")
        for k, stmt in enumerate(stmts, 1):
            print(f"[{k}/{len(stmts)}] {_preview(stmt)}", file=sys.stderr)
            with _progress("the warehouse may be cold or the query heavy; Ctrl-C aborts",
                           mode="sql", extra=_log_extra(None, stmt, args.warehouse)) as live:
                df, truncated, status = run_query(
                    stmt, args.warehouse, limit=args.max_rows, timeout=args.timeout,
                    status=live,
                )
            if status is not None:
                print(status, file=sys.stderr)
            else:
                print_table(df, truncated=truncated, max_rows=args.max_rows)
        return

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
        with _progress(
            slow_hint, mode="partitions" if args.partitions else "sql", extra=extra
        ) as live:
            df, truncated, status = run_query(
                sql_text,
                args.warehouse,
                limit=args.max_rows if table_mode and not args.partitions else None,
                timeout=args.timeout,
                status=live,
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
    except KeyboardInterrupt:
        # Ctrl-C outside an open connection (signing in, opening the session);
        # inside one, run_query has already left through _abort.
        sys.stdout.flush(); sys.stderr.flush()
        _exit(130)
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
            msg = f"dbsql: {e}"
            if "timed out after" in str(e):
                msg += TIMEOUT_HINT
            sys.exit(msg)
        raise
