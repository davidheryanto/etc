# Claude Code MCP Servers

## Config Locations

- **Project-level**: `.mcp.json` in project root (checked into git)
- **User-level**: `~/.claude.json`

## Adding Atlassian (Confluence + Jira)

Uses Atlassian's official remote MCP server with OAuth 2.1 authentication.

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

Restart Claude Code after adding. On first connect, it opens a browser for OAuth login with your Atlassian account. Data access respects your existing Jira/Confluence permissions.

### Example Usage

```
# Fetch a Confluence page
mcp__atlassian__getConfluencePage(cloudId="yoursite.atlassian.net", pageId="1576632330", contentFormat="markdown")

# Search Confluence
mcp__atlassian__searchAtlassian(...)

# Search Jira
mcp__atlassian__searchJiraIssuesUsingJql(...)
```

### References

- Getting started: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/
- MCP endpoint: `https://mcp.atlassian.com/v1/mcp`
- Legacy SSE endpoint (`/v1/sse`) deprecated after June 30, 2026
