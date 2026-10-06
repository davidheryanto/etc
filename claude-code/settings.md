# Claude Code Settings

Examples for `~/.claude/settings.json`. Merge them into your existing JSON object.

## Permissions

Example personal allowlist to reduce permission prompts:

```json
{
  "permissions": {
    "allow": [
      "WebSearch",
      "WebFetch",
      "Bash(ls:*)",
      "Bash(find:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)"
    ],
    "deny": []
  }
}
```

## Hide commit/PR attribution

Set `"attribution": false` to omit Claude's `Co-Authored-By` commit trailer, the
"🤖 Generated with Claude Code" PR footer, and the claude.ai session link that web and
Remote Control sessions add.

```json
{
  "attribution": false
}
```

Needs v2.1.281+; older versions reject it and skip the whole settings file. In files older
versions also read (e.g. a shared project `.claude/settings.json`), use the object form
instead (`sessionUrl` needs v2.1.183+):

```json
{
  "attribution": { "commit": "", "pr": "", "sessionUrl": false }
}
```

`includeCoAuthoredBy` is deprecated.

Control attribution with this setting, not with a CLAUDE.md or memory rule. The setting is
the supported control: Claude Code turns it into the attribution guidance it gives Claude.
A rule is free-form prose, and an explicit attribution instruction in CLAUDE.md or memory
takes precedence over the configured commit and PR text (unless that text is set in managed
settings). Remove any such rule rather than leaving it to conflict.

See the [settings reference](https://code.claude.com/docs/en/settings-reference#attribution).
