# MCP Servers for Claude Code

## Scopes

`claude mcp add` writes to one of three scopes via `--scope` (default: `local`).

| Scope | Loads in | Shared via git | Stored in |
| --- | --- | --- | --- |
| `local` (default) | Current project only | No | `~/.claude.json` (keyed by project path) |
| `project` | Current project only | Yes | `.mcp.json` in project root |
| `user` | All your projects | No | `~/.claude.json` |

Note: `local` scope is **not** `.claude/settings.local.json`. Both `local` and
`user` servers live in `~/.claude.json`; `local` is nested under the project's
absolute path so it only loads in that one repo.

## Available Configs

- [Atlassian](atlassian.md) — Jira + Confluence via official remote MCP server
