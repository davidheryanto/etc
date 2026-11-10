#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Download a file or directory from Azure ADLS Gen2 using your `az` identity.

  azget SRC [DEST]        one file   -> ./<basename> (DEST dir/ -> DEST/<basename>)
  azget -r SRC [DEST]     a prefix   -> recursive, parallel (azcopy)
  azget --dry-run SRC     show the parsed URL + command; touch nothing
  azget --json ...        emit the outcome (or --dry-run preview) as one JSON object
  azget ... -- <args>     forward <args> to the underlying tool (see Auth)

SRC may be any of (all resolve to the same account/container/path):
  abfss://<container>@<account>.dfs.core.windows.net/<path>     # dbsql / Spark form
  https://<account>.dfs.core.windows.net/<container>/<path>     # DFS endpoint
  https://<account>.blob.core.windows.net/<container>/<path>    # blob endpoint
A `?sv=...&sig=...` SAS query (e.g. Storage Explorer's "Copy URL") is recognised
and used as the credential; it never leaks into the path or local filename.

DOWNLOAD-ONLY. Every call is a read (GET blob / list / show / azcopy download).
There is no upload, create, or delete path - your storage is never modified.

Auth: as *you* (`--auth-mode login` / azcopy AzCliCreds), not the dbsql warehouse
connector. If login 403s, authenticate with a SAS:
  --sas-token '?sv=...'   works for BOTH file and -r (folded into the azcopy URL)
  or paste a SAS-bearing SRC URL (single-quote it - the shell splits on '&')
  file-only, via `-- ...`: --account-key / --auth-mode key / --connection-string
    (azcopy can't use these, so they're rejected for -r)
Note: a login identity can hold control-plane rights on a storage account but
NO data-plane (Storage Blob Data) role - it then 403s on the bytes, so expect to
pass a SAS there. A command-line credential is briefly visible via
`ps`/argv; --dry-run output is redacted, but the live call isn't (fine on a personal box).

Account-key fallback (automatic): if login 403s on the data plane but you DO hold
control-plane rights to list the account key (a common setup - it's how Storage
Explorer downloads), azget lists the key and mints a 1h READ-ONLY, container-scoped
SAS to retry with (one stderr notice). Only that read-only SAS is used; the master
key is handed to az via the AZURE_STORAGE_KEY env, never argv (`ps`-visible). A
`listKeys` call writes a control-plane audit entry. Disable with --no-key-fallback.
Skipped when you already passed a SAS / -- auth.

Engines (why two):
  - file -> `az storage fs file download` (SDK): simple, exact. Intentionally
    silent - azget prints the size up front, then nothing until "done" (there is
    no per-file progress bar). For live progress on a large transfer, use
    -r/directory mode, which runs azcopy.
  - recursive -> `azcopy copy --recursive` (parallel, with live progress). We call
    azcopy directly rather than `az storage fs directory download` because the
    latter (preview) materialises ADLS Gen2 directory-marker blobs (hdi_isfolder)
    as local files, which collides with the real directory and fails the transfer.
    Plain azcopy ignores those stubs by default, so it is fast AND reliable.

Size guard: azget looks up the size first and refuses anything over --max-size
(default 1G) unless --yes - the guard against accidentally pulling terabytes (and,
for the silent file download, your only size feedback). A prefix with >=5000
files is treated as too large to size and needs --yes.

Requires:
  - `az login` done (you authenticate as yourself: login / AzCliCreds).
  - Azure CLI with the `az storage fs` group + `--auth-mode login` (core for
    years; tested on 2.83.0). Single-file mode needs only `az`.
  - An ADLS Gen2 (HNS) account: the `az storage fs` size/metadata and single-file
    download calls assume hierarchical namespace; on a flat blob account they
    error opaquely.
  - azcopy with AZCOPY_AUTO_LOGIN_TYPE=AZCLI support (azcopy ~10.19+, late 2023)
    for recursive (-r) downloads; tested on 10.29.1.
  - Python >= 3.11 (provided by the uv shebang).

Examples:
  azget abfss://data@acct.dfs.core.windows.net/path/users.parquet
  azget abfss://data@acct.dfs.core.windows.net/path/users.parquet ./out/
  azget -r https://acct.dfs.core.windows.net/data/path/events/20260524/ ./out/
  azget --sas-token '?sv=...&sig=...' abfss://data@acct.dfs.core.windows.net/path/x.parquet
  azget -r 'https://acct.blob.core.windows.net/data/prefix/?sv=...&sig=...' ./out/   # quote it!
  azget --max-size 10G abfss://.../big.parquet
  azget -y -r abfss://.../huge_prefix/ ./out/

NO path wildcards. Use dbsql (binaryFile/--partitions) to find files, then -r the
directory. `dbsql` reads abfss in place, so you only need azget for the raw bytes.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import signal
import subprocess
import sys
from urllib.parse import quote, urlsplit

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from azlib import (  # noqa: E402  (sibling lib resolved via the line above)
    _az_capture,
    _is_auth_403,
    _redact,
    _redact_cmd,
    extract_auth,
    human_size,
    mint_account_key_sas,
    parse_url,
    resolve_sas,
    should_key_fallback,
    split_passthrough,
)

DIR_LIST_CAP = 5000          # az fs file list per-request limit; >= this => "too big to size"


def parse_size(s: str) -> int:
    """'1G' / '1GB' / '500M' / bare bytes -> int bytes. Raises ValueError on junk."""
    s = s.strip().upper()
    if s.endswith("B"):
        s = s[:-1]
    mult = {"K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4}
    if s and s[-1] in mult:
        return int(float(s[:-1]) * mult[s[-1]])
    return int(s)


def default_file_dest(path: str) -> str:
    base = os.path.basename(path.rstrip("/"))
    return f"./{base}" if base else "."


def resolve_file_dest(dest: str, path: str) -> str:
    """If dest is a directory (trailing slash or existing dir), the file lands
    inside it as <dest>/<basename>; otherwise dest is the file path itself."""
    if dest.endswith("/") or os.path.isdir(dest):
        return os.path.join(dest, os.path.basename(path.rstrip("/")))
    return dest


def build_file_cmd(account, container, path, dest, auth, *, force) -> list[str]:
    cmd = [
        "az", "storage", "fs", "file", "download",
        "--account-name", account, "--file-system", container, "--path", path,
        "--destination", dest, "-o", "none", "--only-show-errors", *auth,
    ]
    if force:
        cmd += ["--overwrite", "true"]
    return cmd


def build_azcopy_cmd(account, container, path, dest, sas, *, force) -> list[str]:
    # Blob endpoint + plain azcopy (ignores hdi_isfolder stubs by default, so no
    # marker/dir collision). Path re-encoded for the URL; trailing slash stripped
    # so --as-subdir lays the prefix out predictably as <dest>/<basename>/.
    enc = quote(path.rstrip("/"), safe="/")
    url = f"https://{account}.blob.core.windows.net/{container}/{enc}".rstrip("/")
    if sas:
        url += "?" + sas
    # --include-directory-stub=false: skip the 0-byte hdi_isfolder marker blobs that
    # represent directories on the blob endpoint. Otherwise azcopy can write a marker
    # as a *file* (e.g. `events/2026`), and `events/2026/part-0.parquet` then needs
    # that same name as a directory -> "mkdir ...: not a directory", every transfer fails.
    # --overwrite defaults to true; force it false unless -f, so recursive matches
    # file mode's skip-if-exists instead of silently clobbering local files.
    return ["azcopy", "copy", url, dest, "--recursive", "--as-subdir=true",
            "--include-directory-stub=false",
            f"--overwrite={'true' if force else 'false'}"]


def file_stat(account, container, path, auth) -> tuple[int, bool]:
    """(size_bytes, is_directory). A directory shows metadata.hdi_isfolder='true'
    and size 0 - detected so a directory pasted without -r errors out instead of
    writing a bogus empty file. NB `fs file show` calls it `size`; `fs file list`
    (dir_size) calls it `contentLength`."""
    out = _az_capture([
        "az", "storage", "fs", "file", "show",
        "--account-name", account, "--file-system", container, "--path", path,
        "--query", "[size, metadata.hdi_isfolder]", "-o", "tsv", "--only-show-errors", *auth,
    ])
    # az `-o tsv` prints list elements on separate lines; parse order-robustly so
    # a missing/non-int size (or shifted columns) can't raise on int().
    vals = out.split()
    is_dir = any(v.strip().lower() == "true" for v in vals)
    size = next((int(v) for v in vals if v.isdigit()), 0)
    return size, is_dir


def auth_label(*, minted: bool, sas, pass_auth, user_sas: bool) -> str:
    """Which credential the download ran with, for the --json `auth` field.
    `minted and sas` (not bare `minted`): the account-key fallback fired AND produced
    a SAS. Bare `minted` is the one-shot guard, set BEFORE the attempt, so it stays
    True even if minting failed and the run fell back to login under --yes - reporting
    `minted` alone would mislabel that as account_key_sas. After a successful mint
    `sas` holds the minted token; the fallback only fires when there was no user SAS,
    so a truthy `sas` under `minted` can only be the minted one."""
    if minted and sas:
        return "account_key_sas"
    if pass_auth:
        return "passthrough"
    if user_sas:
        return "sas"
    return "login"


def dir_size(account, container, path, cap, auth) -> tuple[int, int, bool]:
    """(file_count, total_bytes, truncated) for a prefix. Truncation is based on
    the RAW entry count (files + dirs) reaching `cap`, so a listing capped by the
    server is never mistaken for a complete (small) one."""
    cmd = [
        "az", "storage", "fs", "file", "list",
        "--account-name", account, "--file-system", container,
        "--recursive", "true", "--num-results", str(cap),
        "--query", "[].{d:isDirectory,n:contentLength}", "-o", "json", "--only-show-errors", *auth,
    ]
    if path:
        cmd += ["--path", path]
    entries = json.loads(_az_capture(cmd) or "[]")
    files = [e for e in entries if not e.get("d")]
    total = sum(int(e.get("n") or 0) for e in files)
    return len(files), total, len(entries) >= cap


def main() -> None:
    # Behave like a Unix filter under `azget ... | head` (e.g. piping --json
    # output): restore the default SIGPIPE action so a consumer that closes the
    # pipe early terminates us quietly instead of raising BrokenPipeError on a
    # stdout write. (Python ignores SIGPIPE by default, surfacing the traceback.)
    if hasattr(signal, "SIGPIPE"):
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    desc, _, epilog = (__doc__ or "").partition("\n\n")
    own_argv, passthrough = split_passthrough(sys.argv[1:])

    p = argparse.ArgumentParser(
        prog="azget", description=desc.strip(), epilog=epilog.strip(),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("src", help="abfss://... or https://<account>.dfs|blob.core.windows.net/...")
    p.add_argument("dest", nargs="?", help="local destination (default: ./<basename>, or '.' for -r)")
    p.add_argument("-r", "--recursive", action="store_true",
                   help="download a directory/prefix recursively (also implied by a trailing '/')")
    p.add_argument("-f", "--force", action="store_true",
                   help="overwrite existing local file(s) (default: skip/keep what's there)")
    p.add_argument("--max-size", default="1G", metavar="SIZE",
                   help="refuse downloads larger than SIZE (e.g. 500M, 2G; default 1G). Bypass with --yes.")
    p.add_argument("-y", "--yes", action="store_true",
                   help="skip the size guard (download regardless of size / when size is unknown)")
    p.add_argument("--dry-run", action="store_true",
                   help="print the parsed account/container/path and the command; touch nothing")
    p.add_argument("--sas-token", metavar="SAS", default=None,
                   help="SAS token for auth; works for BOTH file and -r (folded into the azcopy "
                        "URL). Mutually exclusive with a SAS embedded in the SRC URL.")
    p.add_argument("--no-key-fallback", action="store_true",
                   help="on a login data-plane 403, do NOT fall back to listing the account key "
                        "and minting a 1h read-only SAS (default: do, when you have control-plane "
                        "key access and didn't pass your own SAS / -- auth)")
    p.add_argument("--json", action="store_true",
                   help="emit one JSON object on stdout - the --dry-run preview, or the run outcome "
                        "(status done/skipped/error, incl. reachability/size refusals); "
                        "progress+diagnostics stay on stderr")
    args = p.parse_args(own_argv)
    display_src = _redact(args.src)  # safe to echo in messages (SAS sig masked)
    key_fallback = not args.no_key_fallback

    try:
        account, container, path, url_sas = parse_url(args.src)
        sas = resolve_sas(args.sas_token, url_sas)
    except ValueError as e:
        sys.exit(f"azget: {e}")
    try:
        max_bytes = parse_size(args.max_size)
    except ValueError:
        sys.exit(f"azget: bad --max-size {args.max_size!r} (try 500M, 2G, 1T)")
    if max_bytes <= 0:
        sys.exit(f"azget: --max-size must be positive, got {args.max_size!r}")

    recursive = args.recursive or urlsplit(args.src).path.rstrip().endswith("/")
    if not path and not args.recursive:
        sys.exit(f"azget: {display_src} is a container root - downloading a whole container needs "
                 f"an explicit -r (a trailing '/' alone won't trigger it, as a guard).")

    pass_auth = extract_auth(passthrough)
    if recursive and pass_auth:
        sys.exit("azget: for -r, authenticate with --sas-token or a SAS in the SRC URL (azcopy "
                 "reads it from the URL). --account-key/--auth-mode/--connection-string are "
                 "file-mode only - azcopy can't use them.")

    def build_cmds() -> tuple[list[str], str, list[str]]:
        # Re-derivable so the key fallback can re-point auth after minting a SAS
        # (reads the current `sas` from the enclosing scope). lookup_auth runs the
        # metadata calls; it must mirror whatever credential the download will use,
        # since those calls don't see the passthrough.
        if pass_auth:
            lookup = pass_auth
        elif sas:
            lookup = ["--sas-token", sas]
        else:
            lookup = ["--auth-mode", "login"]
        if recursive:
            d = args.dest or "."
            c = build_azcopy_cmd(account, container, path, d, sas, force=args.force) + passthrough
        else:
            d = resolve_file_dest(args.dest or default_file_dest(path), path)
            # File auth: passthrough carries its own; else lift the URL/minted SAS; else login.
            file_auth = [] if pass_auth else (["--sas-token", sas] if sas else ["--auth-mode", "login"])
            c = build_file_cmd(account, container, path, d, file_auth, force=args.force) + passthrough
        return lookup, d, c

    lookup_auth, dest, cmd = build_cmds()

    def meta(**extra) -> dict:
        # common shape for every --json object; `extra` adds dry_run / status / sizes
        return {"account": account, "container": container, "path": path,
                "mode": "directory" if recursive else "file", "dest": dest, **extra}

    def die(human: str, error: str) -> None:
        """Exit 1 on an operational refusal (unreachable / dir-without-r / too big).
        In --json mode emit a {status:error} object on stdout first so a machine
        consumer still gets one parseable object; the human text always goes to
        stderr (sys.exit prints it there)."""
        if args.json:
            print(json.dumps(meta(status="error", error=error)))
        sys.exit(human)

    if args.dry_run:
        if args.json:
            print(json.dumps(meta(
                dry_run=True,
                sas=("url" if url_sas else "arg" if args.sas_token else None),
                command=_redact_cmd(cmd),
            )))
            return
        print(f"account   : {account}")
        print(f"container : {container}")
        print(f"path      : {path or '(root)'}")
        sas_src = "(from URL)" if url_sas else ("(--sas-token)" if args.sas_token else "-")
        print(f"sas       : {sas_src}")
        print(f"mode      : {'directory (recursive, azcopy)' if recursive else 'file (az)'}")
        print(f"dest      : {dest}")
        if recursive and not sas:
            print("env       : AZCOPY_AUTO_LOGIN_TYPE=AZCLI")
        print("command   : " + " ".join(shlex.quote(a) for a in _redact_cmd(cmd)))
        return

    if not recursive and not args.force and os.path.exists(dest):
        if args.json:
            print(json.dumps(meta(status="skipped", reason="dest exists")))
            return
        print(f"azget: {dest} already exists - skipping, remote source not checked "
              f"(use -f to overwrite)", file=sys.stderr)
        return

    # Pre-flight size: guard + (for the silent file download) the only feedback.
    file_count = None      # set for -r; surfaced in the --json outcome
    size_known = True      # cleared if --yes lets us skip an unreadable size lookup
    minted = False         # one-shot guard so the key fallback can't loop
    while True:
        try:
            if recursive:
                count, total, truncated = dir_size(account, container, path, DIR_LIST_CAP, lookup_auth)
                file_count = count
                # On a >=cap listing count/total are a floor, not a total - the --json
                # path nulls bytes/files and flags `truncated` (below). Qualify the
                # human label the same way so the --yes stderr line below can't read as
                # a complete size while azcopy goes on to transfer the larger real set.
                label = (f">={count:,} file(s), >={human_size(total)} (listing capped at {DIR_LIST_CAP:,})"
                         if truncated else f"{count:,} file(s), {human_size(total)}")
            else:
                total, is_dir = file_stat(account, container, path, lookup_auth)
                if is_dir and pass_auth:
                    die(f"azget: {display_src} is a directory - use -r. Note -r uses azcopy: "
                        "authenticate with --sas-token or a SAS in the URL "
                        "(--account-key/--auth-mode are file-mode only).",
                        error="is a directory; use -r")
                if is_dir:
                    die(f"azget: {display_src} is a directory - add -r to download it recursively:\n"
                        f"  azget -r {display_src}", error="is a directory; use -r")
                truncated, label = False, human_size(total)
            break
        except FileNotFoundError as e:
            # `az` missing during the size/metadata lookup - fatal regardless of --yes
            # (the single-file download uses az too). Honour the --json contract first.
            die(f"azget: {e}", error=str(e))
        except RuntimeError as e:
            # Key fallback: a login data-plane 403, and we hold control-plane key
            # access -> mint a 1h read-only SAS from the account key and retry once.
            # Only when the credential WAS login (no user SAS / -- auth), so an
            # explicit credential the user chose is never overridden.
            if should_key_fallback(key_fallback, minted, sas, pass_auth, str(e)):
                minted = True  # attempt only once, even if minting fails
                try:
                    sas = mint_account_key_sas(account, container)
                except (RuntimeError, FileNotFoundError) as me:
                    sas = None
                    print(f"azget: account-key fallback failed ({_redact(str(me))}).",
                          file=sys.stderr)
                if sas:
                    print(f"azget: login has no data-plane RBAC on '{account}'; using a 1h "
                          f"read-only SAS minted from your account key.", file=sys.stderr)
                    lookup_auth, dest, cmd = build_cmds()  # re-point auth to the SAS
                    continue
            if not args.yes:
                if recursive and sas:
                    # the DFS-endpoint size check can 403 a blob-scoped SAS that the
                    # blob-endpoint download would accept - here --yes genuinely helps.
                    cred = ("the size check uses the DFS endpoint - a blob-scoped (ss=b) or narrow "
                            "SAS can 403 it even when the download works, so try --yes to skip it")
                elif recursive:
                    cred = f"put a SAS in the SRC URL (no data-plane RBAC on '{account}')"
                else:
                    cred = (f"add --sas-token '?sv=...' (or, for raw az auth flags, "
                            f"-- --account-key / --auth-mode key) if you lack RBAC on '{account}'")
                # No generic "or --yes" here: when the cause is auth/path, --yes only
                # defers the same failure to the download step (it never helps).
                emsg = "403 - no data-plane (Storage Blob Data) RBAC" if _is_auth_403(str(e)) else _redact(str(e))
                die(f"azget: couldn't read {display_src}\n  {emsg}\n  (wrong path? {cred}.)", error=emsg)
            total, truncated, label, size_known = 0, False, "unknown size", False
            break

    if truncated and not args.yes:
        die(f"azget: {display_src} has >={DIR_LIST_CAP:,} files - too large to size-check safely. "
            f"Pass --yes to download anyway.", error=f">={DIR_LIST_CAP} files; too large to size-check")
    if total > max_bytes and not args.yes:
        die(f"azget: {label} exceeds --max-size {args.max_size} ({human_size(max_bytes)}). "
            f"Raise --max-size or pass --yes.", error=f"{label} exceeds --max-size {args.max_size}")

    if not recursive:
        parent = os.path.dirname(dest)
        if parent:
            os.makedirs(parent, exist_ok=True)

    env = os.environ.copy()
    if recursive and not sas:
        env["AZCOPY_AUTO_LOGIN_TYPE"] = "AZCLI"  # azcopy reuses your az identity

    quiet = "" if recursive else " (no progress until done)"
    print(f"azget: downloading {label} -> {dest} ...{quiet}", file=sys.stderr)
    try:
        # Recursive: stream azcopy's live progress (don't capture). File: capture
        # stderr so we can collapse az's ~11-line "you need one of these roles"
        # block to a single 403 line (it otherwise buries azget's own hint).
        if recursive:
            # In --json mode send azcopy's stdout progress to stderr so stdout
            # stays a single clean JSON object; otherwise stream it live as usual.
            result = subprocess.run(cmd, env=env, stdout=(sys.stderr if args.json else None))
            err = ""
        else:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            err = (result.stderr or result.stdout or "").strip()
    except FileNotFoundError:
        tool = "azcopy" if recursive else "az"
        hint = "." if recursive else " and run `az login`."
        die(f"azget: '{tool}' not found in PATH - install it{hint}",
            error=f"'{tool}' not found in PATH")

    if result.returncode != 0:
        if recursive:
            print("azget: azcopy reported failures (see its summary/log above).\n"
                  "  - 'not a directory' / file-vs-folder clash: an earlier partial left a file "
                  "where a folder is now needed; delete the local target and retry, or use a "
                  "fresh empty dest dir.\n"
                  "  - partial transfer: `azcopy jobs resume <job-id>` (a plain re-run SKIPS "
                  "existing files, so it won't replace a half-written one), or -f to force a "
                  "clean re-download.\n"
                  f"  - 403: no data-plane RBAC on '{account}' (or too-narrow SAS) - put a SAS "
                  "in the URL.", file=sys.stderr)
            err_summary = f"azcopy exited {result.returncode}"
        elif _is_auth_403(err):
            print(f"azget: 403 - no data-plane (Storage Blob Data) RBAC on '{account}'. "
                  f"Add --sas-token '?sv=...' (or -- --account-key / --auth-mode key).",
                  file=sys.stderr)
            err_summary = "403 - no data-plane (Storage Blob Data) RBAC"
        else:
            if err:
                print(_redact(err), file=sys.stderr)
            print(f"azget: az exited {result.returncode}.", file=sys.stderr)
            err_summary = _redact(err) or f"az exited {result.returncode}"
        if args.json:
            # every status:"error" object carries `error` (uniform schema); the
            # download-failure one adds returncode for the underlying tool's code.
            print(json.dumps(meta(status="error", returncode=result.returncode,
                                  error=err_summary)))
        sys.exit(result.returncode)
    if args.json:
        # Only report sizes we actually know in full: a --yes'd unreadable size
        # (size_known False) or a --yes'd >=cap prefix (truncated) is a floor, not
        # a total, so null them and flag truncated for the consumer.
        complete = size_known and not truncated
        # auth: which credential the download actually ran with - so a machine
        # consumer/audit can see when the account-key fallback fired (it lists keys).
        auth = auth_label(minted=minted, sas=sas, pass_auth=pass_auth,
                          user_sas=bool(url_sas or args.sas_token))
        print(json.dumps(meta(status="done", auth=auth, truncated=truncated,
                              bytes=(total if complete else None),
                              files=(file_count if complete else None))))
    else:
        print(f"azget: done -> {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
