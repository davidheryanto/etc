# Claude Code Mods

**Goal: change Claude Code's own UI and behaviour with a small TypeScript or JavaScript file.**

A mod is a plugin whose `hooks/hooks.json` loads a JS/TS module. That module runs inside
Claude Code and can draw UI (status line, toasts, a band above the prompt, side panes), add slash
commands, and block or rewrite tool calls and prompts.

> **Verified on Claude Code 2.1.296 (2026-10-11).** Mods arrived in 2.1.287 and change almost
> every release. Before trusting a detail here, check what changed since:
>
> ```bash
> claude --version
> curl -s https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md | grep -n -iE '\bmods?\b'
> ```
>
> Docs: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview) ·
> [Create a mod](https://code.claude.com/docs/en/plugins/mods/create) ·
> [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference) ·
> [Troubleshoot a mod](https://code.claude.com/docs/en/plugins/mods/troubleshoot).
> The API types Claude Code writes into a mod folder always match the installed version.

## TL;DR: the loop you'll forget

```text
1. Ask Claude: "make a mod that <does X>"    → loads the plugin-authoring skill, writes the files
2. Answer "Enable for this session"          → hot reloading is on; the mod loads when the turn ends
3. Edit hooks/register.ts and save           → reloads within a second; register() runs again
4. claude plugin validate <folder>           → what it hooks and calls, and anything refused
   claude plugin test <folder>               → runs tests/*.test.ts against the engine
```

- **A reload resets the module's own variables.** Keep values in `$.state` (this session) or
  `$.store` (across sessions).
- **UI updates only when a hook runs.** A status line set inside `tool.call` keeps its old text
  after a reload until the next tool call.
- **Problems show as a dim line in the transcript** naming the mod and the reason, while hot
  reloading is on. Otherwise they go only to `claude --debug`.
- **`/plugin` shows what loaded:** a dim `N mod active · <names>` line under the tabs (built-in
  mods are left out). `claude --safe-mode` starts a session with every installed mod off.

## You write one file; the rest is boilerplate

```text
my-mod/
├── .claude-plugin/plugin.json   # { "name", "version", "description" }: set once
├── hooks/hooks.json             # { "modules": ["./register.ts"] }: one line
├── hooks/register.ts            # the mod: every on(...) hook goes here (.tsx to draw UI)
└── tests/*.test.ts              # optional; worth it once the mod blocks or rewrites things
```

Claude Code generates `.claude-plugin/types/` for editor autocomplete; never edit it.

Every hook is middleware: `on(event, matcher?, ($, e, next) => …)`.

```ts
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  const ran = await next(e)          // the tool runs here
  $.ui.status(`last: ${e.command}`)  // after it finishes
  return ran                         // hand the result back unchanged
})
```

- **`e`** is the event (here, the tool call and its arguments).
- **`$`** is the engine API: `$.ui.status`, `$.ui.toast`, `$.command.register`, `$.fs`, …
- **`next(e)`** runs normal behaviour. Skip it to answer yourself (`return { deny: 'why' }` blocks
  the tool). Pass `next({ ...e, changed })` to rewrite.

Find any event or method in the generated `.claude-plugin/types/claude-code/index.d.ts`. Search
for the name, e.g. `'tool.call'`.

## A dev mod lives for one session, so move it to keep it

Mods Claude writes go in `~/.claude/dev-mods/<session-id>/<mod>/`, and only that session watches
the folder. Other sessions never load it. To keep a mod, move it somewhere permanent first
(e.g. `~/.claude/mods/<mod>`), then pick a scope:

| Scope | How |
| --- | --- |
| One session | `claude --plugin-dir <folder>` |
| Every session, just you | `"CLAUDE_CODE_PLUGIN_DIRS": "<folder>"` in the `env` block of `~/.claude/settings.json` |
| Project or user, installed | Add the folder as a marketplace, then `/plugin install` and pick the scope |
| Share it | Repo with `.claude-plugin/marketplace.json`, then `/plugin install <mod> --marketplace <owner>/<repo>` |

## Mods worth trying

**A mod runs with your permissions and isn't sandboxed.** It can read and write your files, read
your API keys, start processes, see and rewrite every prompt and tool call, and approve tool calls
for you. Before installing one, list what it hooks and calls:

```bash
claude plugin validate ./some-mod     # read the hooks: and calls: lines
```

- **You should know (built in, from Anthropic).** A side agent watches longer tasks and shows a
  note above the prompt when it spots something you might miss. Off by default, and only offered
  where your org allows it. Other built-in mods (`/diff`, `AGENTS.md` loading) are already on; see
  them in `/plugin` → **Installed** → **Built-in**.

  ```bash
  /plugin enable cc-plugin-you-should-know@builtin
  ```

- **Anthropic's sample mods** are in
  [claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods),
  shared without support. `blast-radius` holds a risky shell command (`rm -rf`, a force push) and
  shows what it would change before you proceed. Try one with `claude --plugin-dir <clone>/claude-code/mods/<mod>`.
- **Community mods are unreviewed.** As of 2026-10, every mod in the plugin directory shows
  `review=none`: context bars, usage gauges, a session catch-up pane, games.
