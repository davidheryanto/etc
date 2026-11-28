# Claude Code on Microsoft Foundry (Azure)

> Checked Nov 2026 with Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2 deployed in Foundry.
> Docs: <https://code.claude.com/docs/en/microsoft-foundry>

Two ways to pay for Claude Code:

- **Subscription** (Pro/Max/Team/Enterprise via `/login`): flat fee, every feature.
- **Foundry**: pay per token on your Azure bill, sign-in with Entra ID, data stays in your
  Azure tenant.

Claude Code picks Foundry when `CLAUDE_CODE_USE_FOUNDRY` is set, overriding `/login`. So keep
the Foundry vars inside a shell function: plain `claude` stays on the subscription and
`claude-az` goes to Azure.

## Azure setup (once)

1. In <https://ai.azure.com>, create a Foundry resource and deploy the Claude models. Name each
   deployment after its model ID (`claude-opus-5-5`, ...) so Claude Code recognises it.
2. Give yourself **Foundry User** or **Cognitive Services User** on the resource. Owner or
   Contributor is not enough: they manage the resource but can't call the models.
3. `az login --tenant <tenant-id>`

Check access before involving Claude Code:

```bash
TOKEN=$(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)
curl -s https://<resource>.services.ai.azure.com/anthropic/v1/messages \
  -H "Authorization: Bearer $TOKEN" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-opus-5-5","max_tokens":50,"messages":[{"role":"user","content":"ping"}]}'
```

## `claude-az`

Add to `~/.zshrc` (or `~/.bashrc`), replacing `<resource>` with your resource name (not a URL):

```zsh
# Claude Code on Microsoft Foundry (Entra auth via az login); plain `claude` stays on subscription
claude-az() {
  env -u ANTHROPIC_FOUNDRY_API_KEY -u ANTHROPIC_API_KEY \
    CLAUDE_CODE_USE_FOUNDRY=1 \
    ENABLE_PROMPT_CACHING_1H=1 \
    ANTHROPIC_FOUNDRY_RESOURCE=<resource> \
    ANTHROPIC_MODEL=claude-opus-5-5 \
    ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5-5 \
    ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-5-5 \
    ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5 \
    ANTHROPIC_DEFAULT_FABLE_MODEL=claude-fable-5-2 \
    claude "$@"
}
```

- `env -u` clears any API key so Entra is always used. To use a key instead, set
  `ANTHROPIC_FOUNDRY_API_KEY` in the function.
- `ANTHROPIC_MODEL`: Foundry starts on Sonnet otherwise.
- `ANTHROPIC_DEFAULT_*_MODEL` map `opus`/`sonnet`/`haiku`/`fable` to your deployments. Without a
  Haiku pin, background tasks run on the main model and cost more.
- `ENABLE_PROMPT_CACHING_1H=1`: Foundry defaults to a 5-minute cache. 1 hour costs more per cache
  write (2x vs 1.25x input) but survives breaks, so it's usually cheaper for interactive work.
  Drop it for one-shot `-p` scripts.
- Flags still override: `claude-az --model sonnet --effort low`.

Verify: `claude-az`, then `/status` shows the provider as Microsoft Foundry. Requests also show
in each deployment's **Monitor** tab.

## Status line

[statusline.py](statusline.py) adds a blue `Azure` after the model when `CLAUDE_CODE_USE_FOUNDRY`
is set (the status line script inherits Claude Code's environment):

```text
🤖 Opus 5.5 medium Azure | 💰 $0.69 | 📂 my-project | 🧠 75k (8%)
```

On Foundry the `💰` figure is Claude Code's estimate from list prices. The real cost is in Azure
Cost Management.

## Not available on Foundry

Anything that needs a claude.ai login: Claude in Chrome, Artifacts, Remote Control, cloud
sessions, `/schedule`, claude.ai connectors. Also fast mode, the advisor and `/logout`.
Web search, GitHub Actions and auto mode work. Current list:
<https://code.claude.com/docs/en/feature-availability>
