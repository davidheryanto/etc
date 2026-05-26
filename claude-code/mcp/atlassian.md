# Atlassian (Confluence + Jira)

Uses Atlassian's official remote MCP server with OAuth 2.1 authentication.

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
      "url": "https://mcp.atlassian.com/v1/mcp"
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
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
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

## Example Usage

```
# Fetch a Confluence page
mcp__atlassian__getConfluencePage(cloudId="yoursite.atlassian.net", pageId="1576632330", contentFormat="markdown")

# Search Confluence
mcp__atlassian__searchAtlassian(...)

# Search Jira
mcp__atlassian__searchJiraIssuesUsingJql(...)
```

## References

- Getting started: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/
- MCP endpoint: `https://mcp.atlassian.com/v1/mcp`
- Legacy SSE endpoint (`/v1/sse`) deprecated after June 30, 2026
