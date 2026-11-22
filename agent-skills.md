# Useful Agent Skills

Work in any agent that reads Agent Skills (Claude Code, Codex, Cursor, ...). Install options are
in each repo's README, e.g. a plugin ([plugins.md](claude-code/plugins.md)) or
`skills add <owner/repo>` ([skills.md](claude-code/skills.md)).

## Everyday engineering: mattpocock/skills

Grilling a plan, TDD, debugging, prototypes, PR bodies, code review.
[Source](https://github.com/mattpocock/skills)

- Once per repo: `/setup-matt-pocock-skills`
- Use: `/grill-me`, `/tdd`, `/diagnosing-bugs`, `/prototype`, `/pr`, `/mattpocock-skills:code-review` (bare `/code-review` is Claude Code's built-in)

## Frontend design: Impeccable

Design, critique, audit and polish a UI; write `DESIGN.md`.
[Site](https://impeccable.style/) · [Source](https://github.com/pbakaus/impeccable)

- Once per project: `/impeccable init`
- Use: `/impeccable critique`, `/impeccable audit`, `/impeccable polish`, `/impeccable document`

## Diagrams: diagram-design

Architecture, flowchart, sequence, ER and ~50 more diagram types as self-contained HTML/SVG.
[Source](https://github.com/cathrynlavery/diagram-design)

- Use: ask for a diagram; `/export-diagram` for SVG/PNG, `/import-mermaid` to redraw Mermaid
