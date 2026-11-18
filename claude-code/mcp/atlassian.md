# Atlassian (Confluence + Jira)

Uses Atlassian's official remote MCP server (Rovo MCP v2) with OAuth 2.1 authentication.

## Endpoint: v2, and `?tools=all`

- `https://mcp.atlassian.com/v2/mcp` (default): about 26 tools in Claude Code. A
  few are named tools; the rest are the general `discover`, `executeRead`,
  `executeWrite`, `executeDestructive` and `search`.
- `https://mcp.atlassian.com/v2/mcp?tools=all`: a flat list of named tools (about
  226 in Claude Code). Used below. Claude Code loads tool definitions only when
  needed, so this costs only the names. Clients that load every definition up
  front are better off with the default.
- v1 (`/v1/mcp`) is deprecated. On 1 March 2027, v1 connections automatically
  start using v2 tools.
- Claude Code skips `listJiraAlignItems`: its input schema has a `$filter` key that
  the Claude API rejects. This only matters if you use Jira Align.

## Config

### Option A: Shared with the team (committed to git)

Use project scope when the server config should travel with the repo, so anyone
who clones it picks up the MCP connection automatically:

```json
// .mcp.json (project root)
{
  "mcpServers": {
    "atlassian": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v2/mcp?tools=all"
    }
  }
}
```

### Option B: Local only, single repo (not committed)

Use local scope (the default) when the server config should stay private to you
and load only in this one repo. It's tied to your current directory, so `cd`
into the repo first:

```bash
cd /path/to/your/repo
claude mcp add --transport http atlassian "https://mcp.atlassian.com/v2/mcp?tools=all"
```

This saves to `~/.claude.json` under the repo's path — private to you, not
committed, and absent from your other projects. Use `--scope user` to make it
available everywhere instead. See [scopes](README.md#scopes).

To remove it, `cd` back into the same repo and run:

```bash
cd /path/to/your/repo
claude mcp remove atlassian
```

Check the result with `claude mcp list`.

## First connect

After adding via either option, restart Claude Code. On first connect it opens a
browser for OAuth login with your Atlassian account; data access respects your
existing Jira/Confluence permissions.

- **v1 login doesn't carry over.** v2 is a separate OAuth resource, so moving from
  v1 means logging in again.
- **Claude Code saves the token per exact URL.** Adding or removing `?tools=all`
  also means logging in again.
- **The consent screen is much broader than v1's.** It asks for Confluence, Jira
  (including delete), JSM, Bitbucket, Loom, Goals, Projects, Teams, Assets and Rovo
  search.
- **To log in again**, run `/mcp` in an interactive session, pick `atlassian`, then
  **Authenticate**. `claude mcp login atlassian` refuses to run in a
  non-interactive shell, including via the `!` prefix.

## Example Usage

```
# List sites you can access (gives the cloudId)
mcp__atlassian__getAccessibleAtlassianResources()

# Fetch a Confluence page (v1: getConfluencePage)
mcp__atlassian__getConfluenceContent(...)

# Search Confluence with CQL (v1: searchConfluenceUsingCql)
mcp__atlassian__searchConfluence(...)

# Rovo search across Atlassian apps
mcp__atlassian__search(...)

# Search Jira / fetch an issue (same names as v1)
mcp__atlassian__searchJiraIssuesUsingJql(...)
mcp__atlassian__getJiraIssue(...)
```

## References

- Getting started: https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/
- Upgrade from v1 to v2: https://support.atlassian.com/atlassian-ai-gateway/docs/how-to-upgrade-from-atlassian-rovo-mcp-v1-to-atlassian-rovo-mcp-v2/
- Supported tools: https://support.atlassian.com/atlassian-ai-gateway/docs/supported-tools/
- MCP endpoint: `https://mcp.atlassian.com/v2/mcp`
- Legacy SSE endpoint (`/v1/sse`) deprecated since June 30, 2026
