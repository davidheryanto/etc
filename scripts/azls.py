#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""List files/directories in Azure ADLS Gen2 using your `az` identity.

  azls SRC               one level under SRC (like `ls`)
  azls -r SRC            recurse into sub-directories
  azls --json SRC        machine-readable rows (type/size/mtime/path)
  azls --dry-run SRC     show the parsed URL + command; touch nothing
  azls ... -- <args>     forward auth/filter/list flags to az (NOT -o/--query;
                         azls forces JSON output, which it parses)

SRC may be any of (all resolve to the same account/container/path):
  abfss://<container>@<account>.dfs.core.windows.net/<path>     # dbsql / Spark form
  https://<account>.dfs.core.windows.net/<container>/<path>     # DFS endpoint
  https://<account>.blob.core.windows.net/<container>/<path>    # blob endpoint
A `?sv=...&sig=...` SAS query (e.g. Storage Explorer's "Copy URL") is recognised
and used as the credential; it never leaks into the path or the displayed output.

READ-ONLY listing (`az storage fs file list`). It lists as *you*
(`--auth-mode login`), not the dbsql warehouse connector - so it answers the
question dbsql can't: "can *I*, with *this* credential, actually reach this?"
(dbsql can show a path that azls/azget then 403 on). Use azget to fetch bytes.

Auth: as *you* by default. A login identity can hold control-plane rights on a
storage account but NO data-plane (Storage Blob Data) role - it then 403s on a
listing, so expect to pass a SAS there:
  --sas-token '?sv=...'   or paste a SAS-bearing SRC URL (single-quote it - the
                          shell splits on '&')
  via `-- ...`: --account-key / --auth-mode key / --connection-string
A command-line credential is briefly visible via `ps`/argv (fine on a personal box).

Account-key fallback (automatic): if login 403s but you DO hold control-plane rights
to list the account key (a common setup), azls lists the key and mints a 1h
READ-ONLY, container-scoped SAS to retry the listing (one stderr notice). The master
key is handed to az via the AZURE_STORAGE_KEY env, never argv (`ps`-visible); a
`listKeys` call writes a control-plane audit entry. Disable with --no-key-fallback.
Skipped when you already passed a SAS / -- auth.

Columns: type / size / mtime (the lastModified the service returns) / path.
--limit caps results (default 1000); the service returns at most 5000 per call
regardless, and azls warns on stderr when a listing is cut off.

A trailing slash on SRC does NOT imply -r (unlike azget) - listing a directory is
one level by default; pass -r to recurse. NO path wildcards/globs - discovery
stays in dbsql (LIST / binaryFile / --partitions); azls is the as-me
reachability view, and the one that lists a whole subtree (-r). `dbsql` reads abfss in place, so you only need azls/azget when
login/SAS reachability (not the data) is the question.

Requires:
  - `az login` done (you authenticate as yourself: --auth-mode login).
  - Azure CLI with the `az storage fs` group (core for years; tested on 2.83.0).
  - An ADLS Gen2 (hierarchical namespace) account; on a flat blob account
    `az storage fs` errors opaquely.
  - Python >= 3.11 (provided by the uv shebang).

Examples:
  azls abfss://data@acct.dfs.core.windows.net/path/
  azls -r https://acct.dfs.core.windows.net/data/path/events/20260524/
  azls --json abfss://data@acct.dfs.core.windows.net/path/
  azls --limit 5000 -r abfss://data@acct.dfs.core.windows.net/path/events/
  azls --sas-token '?sv=...&sig=...' abfss://data@acct.dfs.core.windows.net/path/
  azls 'https://acct.blob.core.windows.net/data/path/?sv=...&sig=...'   # quote it!
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import signal
import sys

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

AZ_LIST_CAP = 5000  # az storage fs file list hard server cap per call


def build_list_cmd(account, container, path, *, recursive, limit, auth, passthrough=()) -> list[str]:
    # --recursive defaults to True in az, so we set it explicitly (false = one
    # level, like `ls`). Passthrough goes BEFORE the forced --query/-o json: az
    # honours the last value for a repeated flag, so a stray `-- -o table` or
    # `-- --query ...` can't break the JSON shape azls parses (its `--` is for
    # auth/filter/list flags, not output). The projected JMESPath shape keeps the
    # JSON small and stable: directory flag, byte length, last-modified, full path.
    cmd = [
        "az", "storage", "fs", "file", "list",
        "--account-name", account, "--file-system", container,
        "--recursive", "true" if recursive else "false",
        "--num-results", str(limit),
        *auth, *passthrough,
        "--query", "[].{d:isDirectory,n:contentLength,m:lastModified,p:name}",
        "-o", "json", "--only-show-errors",
    ]
    if path:
        cmd += ["--path", path]
    return cmd


def format_table(rows: list[tuple[str, int, str, str]]) -> str:
    """rows = (type, size_bytes, mtime, path). Size shown human (dirs: '-'),
    right-aligned; path last and unpadded."""
    header = ("type", "size", "mtime", "path")
    disp = [(t, human_size(n) if t == "file" else "-", m, p) for (t, n, m, p) in rows]
    body = [header, *disp]
    widths = [max(len(r[i]) for r in body) for i in range(3)]  # path (col 3) unpadded

    def fmt(r):
        return "  ".join([r[0].ljust(widths[0]), r[1].rjust(widths[1]),
                          r[2].ljust(widths[2]), r[3]])

    return "\n".join(fmt(r) for r in body)


def main() -> None:
    # Behave like a Unix filter under `azls ... | head`: restore the default SIGPIPE
    # action so a consumer that closes the pipe early terminates us quietly (exit
    # 141) instead of raising BrokenPipeError on the final stdout write. (Python
    # ignores SIGPIPE by default, which is what surfaces the traceback.)
    if hasattr(signal, "SIGPIPE"):
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    desc, _, epilog = (__doc__ or "").partition("\n\n")
    own_argv, passthrough = split_passthrough(sys.argv[1:])

    p = argparse.ArgumentParser(
        prog="azls", description=desc.strip(), epilog=epilog.strip(),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("src", help="abfss://... or https://<account>.dfs|blob.core.windows.net/...")
    p.add_argument("-r", "--recursive", action="store_true",
                   help="recurse into sub-directories (default: one level, like ls)")
    p.add_argument("--limit", type=int, default=1000, metavar="N",
                   help="max entries to return (default 1000; the service caps each call at 5000)")
    p.add_argument("--json", action="store_true",
                   help="emit JSON rows (type/size/mtime/path) instead of a table")
    p.add_argument("--sas-token", metavar="SAS", default=None,
                   help="SAS token for auth. Mutually exclusive with a SAS embedded in the SRC URL.")
    p.add_argument("--no-key-fallback", action="store_true",
                   help="on a login data-plane 403, do NOT fall back to listing the account key "
                        "and minting a 1h read-only SAS (default: do, when you have control-plane "
                        "key access and didn't pass your own SAS / -- auth)")
    p.add_argument("--dry-run", action="store_true",
                   help="print the parsed account/container/path and the command; touch nothing")
    args = p.parse_args(own_argv)
    display_src = _redact(args.src)  # safe to echo in messages (SAS sig masked)
    key_fallback = not args.no_key_fallback

    if args.limit <= 0:
        sys.exit(f"azls: --limit must be positive, got {args.limit}")

    try:
        account, container, path, url_sas = parse_url(args.src)
        sas = resolve_sas(args.sas_token, url_sas)
    except ValueError as e:
        sys.exit(f"azls: {e}")

    # Auth mirrors azget: passthrough carries its own; else lift the URL/--sas-token
    # SAS; else list as yourself. azls always uses `az` (never azcopy), so unlike
    # azget there's no engine that rejects --account-key/--auth-mode flags.
    pass_auth = extract_auth(passthrough)

    def build_list() -> list[str]:
        # Re-derivable (closure over the live `sas`) so the key fallback can re-point
        # auth after minting without duplicating the call / drifting out of sync.
        if pass_auth:
            auth: list[str] = []  # caller-supplied auth flows through `passthrough`
        elif sas:
            auth = ["--sas-token", sas]
        else:
            auth = ["--auth-mode", "login"]
        return build_list_cmd(account, container, path.rstrip("/"), recursive=args.recursive,
                              limit=args.limit, auth=auth, passthrough=passthrough)

    cmd = build_list()

    if args.dry_run:
        print(f"account   : {account}")
        print(f"container : {container}")
        print(f"path      : {path.rstrip('/') or '(root)'}")
        sas_src = "(from URL)" if url_sas else ("(--sas-token)" if args.sas_token else "-")
        print(f"sas       : {sas_src}")
        print(f"mode      : {'recursive' if args.recursive else 'one level'}")
        print(f"limit     : {args.limit}")
        print("command   : " + " ".join(shlex.quote(a) for a in _redact_cmd(cmd)))
        return

    minted = False  # one-shot guard so the key fallback can't loop
    while True:
        try:
            out = _az_capture(cmd)
            break
        except FileNotFoundError as e:
            sys.exit(f"azls: {e}")  # `az` binary missing
        except RuntimeError as e:
            # Key fallback: a login data-plane 403, and we hold control-plane key
            # access -> mint a 1h read-only SAS from the account key and retry once.
            # Only when the credential WAS login (no user SAS / -- auth).
            if should_key_fallback(key_fallback, minted, sas, pass_auth, str(e)):
                minted = True  # attempt only once, even if minting fails
                try:
                    sas = mint_account_key_sas(account, container)
                except (RuntimeError, FileNotFoundError) as me:
                    sas = None
                    print(f"azls: account-key fallback failed ({_redact(str(me))}).",
                          file=sys.stderr)
                if sas:
                    print(f"azls: login has no data-plane RBAC on '{account}'; using a 1h "
                          f"read-only SAS minted from your account key.", file=sys.stderr)
                    cmd = build_list()  # re-point auth to the minted SAS
                    continue
            # Collapse Azure's multi-line "assign one of these roles" block to one line;
            # redact any credential the service might echo back.
            emsg = "403 - no data-plane (Storage Blob Data) RBAC" if _is_auth_403(str(e)) else _redact(str(e))
            sys.exit(f"azls: couldn't list {display_src}\n  {emsg}\n"
                     f"  (wrong path? add --sas-token '?sv=...' if you lack RBAC on '{account}'.)")

    entries = json.loads(out or "[]")
    if not entries:
        if args.json:
            print("[]")  # machine consumers always get a parseable result on stdout
            return
        loc = display_src or f"{account}/{container}"
        print(f"azls: no entries under {loc}", file=sys.stderr)
        return

    rows = [(
        "dir" if e.get("d") else "file",
        int(e.get("n") or 0),
        (e.get("m") or "").replace("T", " "),
        e.get("p") or "",
    ) for e in entries]

    if args.json:
        print(json.dumps(
            [{"type": t, "size": n, "mtime": m, "path": pth} for (t, n, m, pth) in rows],
            indent=2,
        ))
    else:
        print(format_table(rows))

    if len(entries) >= AZ_LIST_CAP:
        # Hard service ceiling: az returns at most 5000 entries in one listing and
        # does NOT paginate past it (verified), so raising --limit cannot help.
        print(f"azls: hit the {AZ_LIST_CAP}-entry service cap - more may exist (a dir of "
              f"exactly {AZ_LIST_CAP:,} also trips this); raising --limit cannot get past "
              f"it, so narrow the path (or use dbsql for full discovery).", file=sys.stderr)
    elif len(entries) >= args.limit:
        print(f"azls: stopped at --limit {args.limit} - more may exist; raise --limit.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
