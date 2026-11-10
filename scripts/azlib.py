"""Shared pure logic for the `az*` ADLS Gen2 tools (azget, azls).

URL parsing, SAS resolution, human sizes, secret redaction, `--`-passthrough
splitting/auth extraction, the az metadata-capture helper, the
data-plane-403 detector, and the account-key -> read-only-SAS 403 fallback live
here so both commands behave identically. Neither
command imports the other; both import this module (how aws/gsutil share
internally). No tool-specific policy lives here - callers decide what to do with
the parsed/looked-up values.

This is a library, imported as a sibling module; it is not run directly. Both
azget.py and azls.py prepend their own real directory to sys.path before
importing it, so it resolves whether invoked from the repo or via a ~/.local/bin
symlink.
"""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit

AUTH_FLAGS = {"--auth-mode", "--sas-token", "--account-key", "--connection-string"}


def parse_url(url: str) -> tuple[str, str, str, str | None]:
    """(account, container, path, sas). Accepts abfss:// and https:// DFS/blob
    forms (see the tools' docstrings). Query/fragment are stripped from `path`; a
    query that looks like a SAS (`sig=`) is returned separately. Raises ValueError
    on junk."""
    shown = _redact(url)  # never echo a raw SAS sig in an error message
    sp = urlsplit(url.strip())
    if sp.scheme == "abfss":
        if "@" not in sp.netloc:
            raise ValueError(
                f"missing '@' - expected abfss://<container>@<account>.dfs.core.windows.net/<path>, got {shown!r}"
            )
        container, _, host = sp.netloc.partition("@")
        raw_path = sp.path
    elif sp.scheme == "https":
        host = sp.netloc
        if not (host.lower().endswith(".dfs.core.windows.net")
                or host.lower().endswith(".blob.core.windows.net")):
            raise ValueError(
                f"not an ADLS/blob endpoint - host {host!r} isn't *.dfs/blob.core.windows.net: {shown!r}"
            )
        container, _, raw_path = sp.path.lstrip("/").partition("/")
    else:
        raise ValueError(
            f"unrecognized URL - need abfss://... or https://<account>.dfs|blob.core.windows.net/..., got {shown!r}"
        )
    if not container or not host:
        raise ValueError(f"empty container or host in {shown!r}")
    account = host.split(".", 1)[0]
    if not account:
        raise ValueError(f"could not read account from host {host!r} in {shown!r}")
    # Decode %-escapes (https/Storage-Explorer URLs encode spaces etc.) for the
    # az `--path` and local filename; azcopy re-encodes when it builds its URL.
    path = unquote(raw_path.lstrip("/"))
    sas = sp.query if sp.query and "sig=" in sp.query else None
    return account, container, path, sas


def resolve_sas(arg_sas: str | None, url_sas: str | None) -> str | None:
    """Pick the SAS from --sas-token or the SRC URL (error if both given). Returns it
    without a leading '?' so it folds cleanly into `az --sas-token` or an azcopy URL."""
    if arg_sas and url_sas:
        raise ValueError("SAS given twice - via --sas-token and in the SRC URL; use one")
    sas = arg_sas or url_sas
    return sas.lstrip("?") if sas else None


def human_size(n: int) -> str:
    f = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if f < 1024 or unit == "PB":
            return f"{f:.0f} {unit}" if unit == "B" else f"{f:.1f} {unit}"
        f /= 1024
    return f"{n} B"  # unreachable


def extract_auth(passthrough: list[str]) -> list[str]:
    """Pull auth flags (+values) out of the `--` passthrough so a caller can (a) not
    add a conflicting --auth-mode login and (b) reuse them for metadata calls.
    Handles `--flag value` and `--flag=value`."""
    out: list[str] = []
    i = 0
    while i < len(passthrough):
        a = passthrough[i]
        if a.split("=", 1)[0] in AUTH_FLAGS:
            out.append(a)
            if "=" not in a and i + 1 < len(passthrough):
                out.append(passthrough[i + 1])
                i += 1
        i += 1
    return out


def split_passthrough(argv: list[str]) -> tuple[list[str], list[str]]:
    """Split argv at the first `--` into (own args, passthrough args)."""
    if "--" in argv:
        i = argv.index("--")
        return argv[:i], argv[i + 1:]
    return argv, []


def _redact(arg: str) -> str:
    """Mask secret substrings inside a single arg: a SAS signature and the secret
    keys of a connection string (AccountKey / SharedAccessSignature)."""
    arg = re.sub(r"(sig=)[^&'\s]+", r"\1REDACTED", arg)
    arg = re.sub(r"(AccountKey=)[^;'\s]+", r"\1REDACTED", arg)
    arg = re.sub(r"(SharedAccessSignature=)[^;'\s]+", r"\1REDACTED", arg)
    return arg


def _redact_cmd(cmd: list[str]) -> list[str]:
    """Redact a full command for display (--dry-run). --account-key's value is a
    bare secret with no marker, so it's masked positionally (both `--flag value`
    and `--flag=value`); --sas-token / --connection-string values are masked by
    substring so non-secret parts (sv/ss, AccountName) stay visible; every other
    arg is scrubbed for an embedded SAS sig or connection-string key."""
    out: list[str] = []
    i = 0
    while i < len(cmd):
        flag, eq, val = cmd[i].partition("=")
        if flag == "--account-key":
            out.append(f"{flag}=REDACTED" if eq else flag)
            if not eq and i + 1 < len(cmd):
                out.append("REDACTED")
                i += 1
        elif flag in ("--sas-token", "--connection-string"):
            if eq:
                out.append(f"{flag}={_redact(val)}")
            else:
                out.append(flag)
                if i + 1 < len(cmd):
                    out.append(_redact(cmd[i + 1]))
                    i += 1
        else:
            out.append(_redact(cmd[i]))
        i += 1
    return out


def _az_capture(cmd: list[str], *, env: dict | None = None) -> str:
    """Run an az metadata command, return stdout. `env` (default: inherit) lets a
    caller pass a secret to az out of argv (e.g. AZURE_STORAGE_KEY). Raises
    RuntimeError if az exits non-zero, FileNotFoundError if the `az` binary is
    missing - callers map both to their own exit / --json error contract (azlib
    stays policy-free, never exits)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    except FileNotFoundError:
        raise FileNotFoundError("Azure CLI 'az' not found in PATH - install it and run `az login`.")
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or f"az exited {r.returncode}")
    return r.stdout


def mint_account_key_sas(account: str, container: str, *, hours: int = 1) -> str:
    """Data-plane-403 fallback that leans on your CONTROL-plane rights instead.

    Lists the storage account key (`az storage account keys list` - an ARM
    `listKeys` action you can hold even without Storage Blob Data RBAC; it writes a
    control-plane audit entry), then mints a short-lived, READ-ONLY, container-scoped
    service SAS from it (`az storage container generate-sas` - a local HMAC, no
    network call). Returns the SAS query (no leading '?'); raises RuntimeError /
    FileNotFoundError (which the caller maps to its own exit) if either az call
    fails. Only the downgraded read-only SAS is returned, and the master key is
    handed to az via the AZURE_STORAGE_KEY env var, NOT --account-key on argv -
    keeping it out of the process table (`ps`) and any az stderr echo - so the as-me
    tools stay effectively read-only even on this path. Callers must invoke it only
    when the chosen credential was login (not a user-supplied SAS / --account-key)
    and `_is_auth_403` matched the denial (see `should_key_fallback`)."""
    key = _az_capture([
        "az", "storage", "account", "keys", "list",
        "--account-name", account, "--query", "[0].value", "-o", "tsv",
    ]).strip()
    if not key:
        raise RuntimeError("account-key list returned no key")
    now = datetime.now(timezone.utc)
    # Backdate the start 5 min so minor client/storage clock skew can't make Azure
    # reject the SAS as "not yet valid". This path only runs to RECOVER from a 403
    # and the one-shot `minted` guard won't retry, so a skew-induced denial would be
    # terminal and opaque; Azure's own SDKs backdate the start for the same reason.
    start = (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%MZ")
    expiry = (now + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%MZ")
    # Key via env (AZURE_STORAGE_KEY), not --account-key: a master key in argv is
    # visible in the process table for the call's lifetime and could be echoed in
    # az stderr; the env var avoids both. generate-sas is a local HMAC - no network.
    sas = _az_capture([
        "az", "storage", "container", "generate-sas",
        "--account-name", account, "--name", container,
        "--permissions", "rl", "--start", start, "--expiry", expiry,
        "--https-only", "-o", "tsv",
    ], env={**os.environ, "AZURE_STORAGE_KEY": key}).strip()
    if "sig=" not in sas:
        raise RuntimeError("account-key SAS generation produced no signature")
    return sas.lstrip("?")


_AUTH_403_RE = re.compile(
    r"do not have the required permissions|authorizationpermissionmismatch|"
    r"not authorized to perform this operation",
    re.I,
)


def _is_auth_403(text: str) -> bool:
    """True if az/azcopy stderr looks like a data-plane RBAC denial, so a caller can
    collapse Azure's multi-line 'assign one of these roles' block to one line."""
    return bool(_AUTH_403_RE.search(text or ""))


def should_key_fallback(enabled: bool, minted: bool, sas, pass_auth, err: str) -> bool:
    """Whether a 403 should trigger the account-key SAS fallback (`mint_account_key_sas`).
    True only when: it's enabled (not --no-key-fallback), not already attempted this
    run (`minted` - one-shot, so it can't loop), the credential in use was login (no
    user-supplied `sas` or `pass_auth` `--` flags to override), and `err` is a
    data-plane RBAC denial. Centralised so azget and azls share one definition."""
    return enabled and not minted and not sas and not pass_auth and _is_auth_403(err)
