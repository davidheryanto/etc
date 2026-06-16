# Layered architecture / ports & adapters — a runnable Python reference

A small, **complete, runnable** FastAPI + SQLAlchemy app whose only purpose is to make
*layered architecture* and *ports & adapters* concrete — and to show how to lay out a
modern Python project so the **folder structure and the architectural law reinforce
each other** instead of fighting.

Everything here is verified working: `pytest` is green and the `import-linter`
fitness functions pass (and I show you what a violation looks like too).

> **The one idea, in a sentence:** *Source-code dependencies all point inward toward
> a framework-free core; the database and the web framework are pluggable details on
> the outside. The folders are arranged so that the wrong import feels wrong.*

---

## 1. Quick start

```bash
# from this directory
uv sync --extra dev                              # create venv + install

uv run pytest -q                                 # -> 6 passed
uv run lint-imports                              # -> Contracts: 4 kept, 0 broken
uv run uvicorn myapp.main:app --reload           # -> http://127.0.0.1:8000/docs

# try it
curl -s -XPOST localhost:8000/bugs   -H 'content-type: application/json' -d '{"title":"crash","reporter":"alice"}'
curl -s -XPOST localhost:8000/users  -H 'content-type: application/json' -d '{"email":"a@b.com","display_name":"Alice"}'
```

No database to install: it defaults to a local SQLite file. Point `DATABASE_URL` at
Postgres or a Lakebase branch and **nothing in the code changes** (see §10).

---

## 2. The one law: dependencies point inward

Four layers. Source-code dependencies (imports) only ever point **toward the core**:

```
        ┌─────────────────────────────────────────────┐
 HTTP   │                  SERVICE                      │  DB
request │   the CORE: domain entities + the PORTS it    │ rows
───────▶│   owns + the use cases. No framework, no SQL. │◀──────
  api   │                                               │ repository
(adapter)└─────────────────────────────────────────────┘ (adapter)
        ▲                    ▲   ▲                       ▲
        └── imports ────────┘   └──────── imports ──────┘
              (inward)                      (inward)
```

| Layer | Role | May import | Knows nothing about |
|---|---|---|---|
| **boundary** (`api.py`, `schemas.py`) | wire I/O: parse, validate, shape, translate errors | service, repository (for wiring), shared | business rules |
| **service** (`service.py`) | domain entities, **ports**, use cases | only `shared.*` + stdlib | HTTP, SQL, frameworks |
| **infrastructure** (`repository.py`) | adapters: real DB via ORM | the service (the port), shared | HTTP |
| **shared** (`shared/`) | cross-cutting kernel: config, db engine, base errors | nothing in a feature | individual features |

**Hard rule:** `service.py` imports *nothing outward*. That single constraint is what
keeps your business logic reusable, testable, and reasoned-about one layer at a time.

> **⚠️ Two senses of "core" — don't conflate them.** Throughout this doc, *"the core"*
> (architectural) means the **domain + use cases at the centre** — which, in
> package-by-feature, lives inside each feature's **`service.py`**, *not* in any single
> folder. The top-level **`shared/`** folder is the *cross-cutting kernel* (config, db
> engine, base errors): plumbing every feature leans on. It is the **opposite** of the
> architectural core — which is exactly why it is named `shared/` and **not** `core/`.
> (`core/` is a common FastAPI convention, but in a doc that teaches "dependencies point
> inward toward the core," reusing the word for the outer kernel is the one place it
> actively misleads.)

---

## 3. The map (filed by feature)

```
layered-architecture-python/
├── .importlinter            # the law, executable (the fitness functions)
├── pyproject.toml           # src-layout package + deps
├── src/
│   └── myapp/
│       ├── main.py          # COMPOSITION ROOT — wires concretes, mounts routers
│       ├── shared/          # cross-cutting kernel (depended upon; imports no feature)
│       │   ├── config.py    #   config from the ENVIRONMENT (twelve-factor)
│       │   ├── db.py        #   engine + session + declarative Base
│       │   └── errors.py    #   DomainError base
│       ├── bugs/            # ── FEATURE: one folder, all four layers ──
│       │   ├── api.py       #   boundary  (FastAPI router + wiring)
│       │   ├── schemas.py   #   boundary  (Pydantic DTOs)
│       │   ├── service.py   #   service   (Bug + BugRepository port + BugService)  ← THE core (domain)
│       │   └── repository.py#   infra     (SqlBugRepository + BugRow table)
│       └── users/           # ── FEATURE: identical shape, different rule ──
│           ├── api.py
│           ├── schemas.py
│           ├── service.py
│           └── repository.py
└── tests/
    ├── test_bugs_service_unit.py          # service + fake repo (no DB)
    ├── test_bugs_repository_integration.py# real SqlBugRepository + real SQLite
    └── test_bugs_api.py                   # HTTP boundary, adapter swapped out
```

Notice the architectural core (domain) is **not a folder** — it's the union of the
feature `service.py` files (marked `← THE core` above). `shared/` is the cross-cutting
kernel, the outermost shared plumbing.

This is **package-by-feature**: a top-level folder per feature (`bugs/`, `users/`),
each containing its own slice of every layer. The alternative — **package-by-layer**
(`http/`, `service/`, `infrastructure/` at the top) — obeys the *same* law; it just
files by layer instead of by feature. Folders are *filing*; layers are *law*. For
anything beyond a toy, by-feature scales better (a feature is one cohesive, deletable
unit) and is the modern default.

---

## 4. Why this layout is *natural*

The goal is that you don't have to *remember* the rules — the structure reminds you.
Four properties make that happen:

1. **Reading order = dependency order.** Inside a feature the files sort
   `api → repository → service`, the same direction dependencies flow. Imports point
   *down within my feature* or *sideways into `shared/`* — never up, never into another
   feature. An import that points the wrong way *looks* wrong before the linter says so.

2. **The filename announces the layer.** You never wonder "what layer is this?"
   `service.py` is the domain core; `repository.py` is infra; `api.py`/`schemas.py` are
   the boundary. There is no `utils.py` grab-bag where the law quietly breaks.

3. **Technology sinks to the bottom; the middle is plain Python.** The further *in*
   you go, the more framework-free the code:

   | File | Allowed to mention |
   |---|---|
   | `api.py`, `schemas.py` | FastAPI, Pydantic — never SQL |
   | `service.py` | plain Python only — no FastAPI, no SQLAlchemy |
   | `repository.py` | SQLAlchemy — the **only** place |

   "Where's the SQL?" has one answer per feature. "Is my logic tangled with a
   framework?" is answered by glancing at `service.py`'s imports (just `shared` + stdlib).

4. **The folder shape *is* the contract shape.** `.importlinter` applies the same
   `api → repository → service` order *inside every feature* via `containers`. Add a
   new feature with those four files and it's already governed — no new rule. The
   filesystem and the fitness function are isomorphic, so they can't drift.

---

## 5. Trace one request (the lifecycle)

`POST /bugs {"title": "...", "reporter": "alice"}`:

1. **`bugs/api.py`** (boundary) — FastAPI validates the body into a
   `ReportBugRequest` (Pydantic). `get_bug_service` builds `BugService(SqlBugRepository(session))`.
2. **`bugs/service.py`** (the core) — `BugService.report_bug` calls `count_open_for` on
   the **port**, applies the rule (`MAX_OPEN_BUGS_PER_REPORTER`), and either raises
   `TooManyOpenBugs` or builds a `Bug` and calls `add`.
3. **`bugs/repository.py`** (infra) — `SqlBugRepository` turns the domain `Bug` into a
   `BugRow`, runs SQL via SQLAlchemy, maps the saved row back to a `Bug`.
4. **back in `api.py`** — the `Bug` becomes a `BugResponse` (201). If the service raised
   `TooManyOpenBugs`, the boundary translates it to **HTTP 429**.

Notice the two arrows in step 2→3: at **runtime** the service *calls outward* into the
repository, but in **source code** the repository *imports inward* to the service's
port. That opposition is the whole trick — see §7.

---

## 6. Ports & adapters: who defines what, and why

- A **port** is an interface the **core owns**, named by its *role* (`BugRepository`),
  expressed in domain language. An **adapter** is a concrete implementation that lives
  on the outside (`SqlBugRepository`, or a test fake).
- **Driven (outbound) port** — `BugRepository`: the core *needs* persistence, so the
  core defines the interface and infra implements it. (This file: `service.py` defines
  it; `repository.py` implements it.)
- **Driving (inbound) port** — `BugService` itself is the use-case API the boundary
  calls; the FastAPI router is its driving adapter.

**Why the core defines the port** (not the provider): the interface must be shaped by
*what the core needs*, in the core's vocabulary — `add(bug)`, `count_open_for(reporter)`
— not by what SQLAlchemy offers. Defining it in the core also *inverts the dependency*
so infra points inward (§7), and lets you supply many adapters for one port
(SQL in prod, a fake in unit tests) without the core changing.

We use `typing.Protocol` (structural typing), so an adapter satisfies the port by
**shape** — `SqlBugRepository` doesn't inherit or even import `BugRepository`. That's
the loosest possible coupling and makes fakes trivial.

**Leak test:** if a technology noun (`Session`, `select`, `commit`) appears anywhere
above `repository.py`, the abstraction leaked. Here, it never does.

---

## 7. The subtlety that confuses everyone: control flow vs. dependency direction

There are **two arrows**, and at the database seam they point in **opposite directions**:

| Seam | Control flow (who *calls*) | Source dependency (who *imports*) |
|---|---|---|
| HTTP → service | inward (HTTP calls the service) | inward (api imports service) — *same way* |
| service → infra | **outward** (service calls the repo) | **inward** (repo imports the port) — *inverted* |

That inversion is **Dependency Inversion**, and it has a concrete consequence in
`.importlinter`: the layer order is

```ini
layers =
    api
    repository
    service        # <- service is the INNERMOST (bottom), NOT repository
```

`service` sits at the bottom because *everyone imports it and it imports no one*. The
adapter (`repository`) is "lower" in the call stack but its **import points up** into
the port — so by dependency direction the service is innermost. Get this backwards
(put `repository` at the bottom) and the contract would forbid the adapter from
importing the port, which is exactly what it must do.

---

## 8. The three-types rule (a Python-specific trap)

The most common way this design quietly breaks: making **one class** be the Pydantic
schema, the domain entity, *and* the ORM model. That single class drags FastAPI and
SQLAlchemy into the core. Keep **three** types, one per layer; the adapter maps between
them. In this example they deliberately **diverge**, so the mapping is real translation
rather than field-copying:

| Concern | Type | Layer | File | What's distinct here |
|---|---|---|---|---|
| wire shape | `ReportBugRequest` / `BugResponse` (Pydantic) | boundary | `schemas.py` | request has no `status`/`id`; response **hides** `created_at` |
| the domain | `Bug` (plain `@dataclass`) | service | `service.py` | carries a `Status` enum; has no `created_at` |
| the table | `BugRow` (SQLAlchemy) | infra | `repository.py` | adds `created_at` (audit); stores `status` as text |

More code, yes — but it's *why* each layer imports only its own framework, and it's
what keeps the natural layout natural as the app grows. **When the three shapes would
be identical, the split is ceremony — collapse it.** For the full "is it worth it?"
guidance (and the Ousterhout depth lens), see §14.

---

## 9. Enforcement: the law is executable

`.importlinter` turns each rule into a **fitness function**. A rule no test defends is
a wish; these fail the build. Run `uv run lint-imports`:

```
Inside each feature: api -> repository -> service (service never imports outward) KEPT
Pydantic schemas stay at the boundary (never imported by service or repository)  KEPT
Features do not import each other                                                 KEPT
shared (the cross-cutting kernel) depends on no feature                           KEPT

Contracts: 4 kept, 0 broken.
```

The four contracts and what each protects:

1. **feature-layers** (`layers` + `containers`) — the central law, applied inside every
   feature: `service` never imports outward; the adapter may import the port.
2. **schemas-are-dtos** (`forbidden`) — Pydantic stays at the boundary; the core never
   depends on it.
3. **features-independent** (`independence`) — `bugs` and `users` don't import each
   other; cross-feature needs go through an explicit seam.
4. **shared-depends-on-no-feature** (`forbidden`) — the `shared/` kernel depends on no
   feature.

**It really catches violations.** Add `from myapp.bugs import api` to `service.py` and:

```
Inside each feature: api -> repository -> service (service never imports outward) BROKEN
...
myapp.bugs.service is not allowed to import myapp.bugs.api:
- myapp.bugs.service -> myapp.bugs.api (l.21)

Contracts: 3 kept, 1 broken.        # exit code 1 -> CI fails
```

Wire `lint-imports` into CI (and your pre-commit / TDD cycle) and the architecture
stays honest no matter who edits it.

---

## 10. The payoffs you actually feel

### Testing — three levels, each enabled by a seam (all green here)

| Test | What it proves | Why it's possible |
|---|---|---|
| `test_bugs_service_unit.py` | business **rules** | service depends on the *port*; a fake repo needs no DB |
| `test_bugs_repository_integration.py` | the **SQL** works | run the *real* adapter against a *real* DB — **never mock the DB** |
| `test_bugs_api.py` | routing, validation, error→status | `dependency_overrides` swaps the adapter at the boundary |

### Swap the database with zero code change (twelve-factor)

```bash
# local: nothing to do — defaults to sqlite:///./myapp.db

# postgres / lakebase: install a driver (not in the default deps), then point DATABASE_URL at it
uv sync --extra postgres
DATABASE_URL="postgresql+psycopg://user:pw@host/db" uv run uvicorn myapp.main:app
```

Only `shared/config.py` reads the environment. The repository adapter and the service
are untouched. In the Lakebase kit, `DATABASE_URL` would point at the **paired Lakebase
branch**, so the *same code path* the integration test exercises runs in dev and prod —
dev/prod parity by default.

---

## 11. How to add a new feature (the mould)

The structure is a repeatable template. To add `comments/`:

1. `mkdir src/myapp/comments` and create the four files:
   `service.py` (entity + `CommentRepository` port + `CommentService`),
   `repository.py` (`SqlCommentRepository` + `CommentRow`),
   `schemas.py`, `api.py`.
2. Mount it in `main.py`: `app.include_router(comments_router)`.
3. Add `myapp.comments` to the `containers`, `independence`, and `forbidden` lists in
   `.importlinter`.

That's it — the layering law now governs the new feature automatically, because the
contract is keyed on the same folder shape.

---

## 12. Cheat sheet

- **Folders are filing; layers are law.** Pick a filing style; the dependency rule
  doesn't move.
- **The only safe import directions:** *down within my feature*, or *into `shared/`*.
  Up, or sideways into another feature → wrong.
- **The core defines the port** (named by role, in domain language); **infra defines
  the adapter** (named by technology).
- **`service` is the innermost layer** — control flows out to the DB, dependencies
  point in to the service.
- **"the core" = each feature's `service.py`** (domain); **`shared/` = cross-cutting
  plumbing.** Different things; don't let the words blur.
- **Three types, not one:** schema (wire) / entity (domain) / row (table).
- **Never mock the database;** fake at the port for units, use a real DB for integration.
- **If a tech noun leaks above `repository.py`, the abstraction failed.**

---

## 13. Relationship to the Lakebase kit

This mirrors the canon in `architectural-design-principles` (layered architecture,
ports & adapters, twelve-factor, fitness functions) from the `lakebase-app-dev-kit`.
The kit defines four *layers* and the inward dependency rule but mandates no folder
layout — package-by-feature here obeys the same canon, filed differently. The
`lint-imports` contracts are the kit's "layering fitness function"; the
"never mock the DB / use the paired branch" rule is the kit's test strategy. Swap the
SQLite default for the paired Lakebase branch via `DATABASE_URL` and this example *is*
a kit-shaped service in miniature.

---

## 14. Through the depth lens (Ousterhout) — when the split earns its keep

This design also holds up under *A Philosophy of Software Design*, and that lens adds a
useful brake against over-applying the patterns above.

**What's deep (good).** `BugRepository` is a textbook **deep module** — a two-method
interface (`add`, `count_open_for`) hiding SQL, the ORM, the `status` enum↔text
translation, the `created_at` audit column, and the transaction. Notice the port did
*not* grow when the types around it gained fields: a deep interface stays small while
the implementation absorbs the detail.

**The cost to respect (change amplification).** Three types mean adding one field can
touch three places plus the mapping. Ousterhout's warning is real — three *near-identical*
types are a **smell, not a virtue**. The split is only worth it when the shapes genuinely
diverge or the domain has behaviour. That is exactly why this example makes them diverge
(`status` is a domain concept; `created_at` is infra-only; the response hides it): so the
mapping is real abstraction translation, not copy-paste.

**Rank the boundaries — they are not equally worth it:**

1. **Wire ≠ storage** (Pydantic schema separate from the ORM model) — *almost always
   worth it.* It protects the public contract and prevents over-exposing internal columns
   (here, `created_at`). If you do only ONE split, do this one.
2. **Domain entity ≠ ORM row** — *the optional one.* It earns its keep when the domain has
   real behaviour/invariants (so the entity is deep, not a data bag). For thin CRUD, using
   the ORM model as the domain object is a defensible modern choice.

**Rule of thumb.** Three types when both boundaries pay; two (keep the wire split) when
only #1 pays; one model — e.g. **SQLModel**, which fuses Pydantic + SQLAlchemy on purpose
— for genuine throwaway/identical CRUD. The duplication is an option you buy cheap early
and pay dearly to retrofit, so for anything long-lived it usually wins *even while the
shapes still overlap*.

The two philosophies agree where it counts: **add a layer or a type only when it earns its
depth.** Layered architecture says *which way dependencies must point*; the depth lens says
*whether a given module is pulling its weight*. Use both.
