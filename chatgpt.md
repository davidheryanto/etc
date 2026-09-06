# ChatGPT desktop app on Linux

## Disable spell-check underlines

Verified on Fedora with the official ChatGPT RPM `26.901.51231` on
2026-09-06. The original, unpatched app works with these preferences after a
full process restart. No app archive patch is needed.

Preferences file: `~/.config/Codex/Default/Preferences` (JSON).
Despite the app being named ChatGPT, this build uses the `Codex` profile folder.
Merge these settings into the existing file; do not replace the whole profile:

```json
{
  "browser": {
    "enable_spellchecking": false
  },
  "spellcheck": {
    "dictionaries": []
  }
}
```

Both changes were tested together; their individual necessity was not tested.

### Apply

1. Save drafts and finish any running tasks, then fully quit ChatGPT.
   Closing its window can leave the app running in the background.
2. Run the following from a separate terminal. It refuses to edit while ChatGPT
   is running, creates a timestamped backup, and preserves unrelated preferences.
3. Reopen ChatGPT and type `chatgpt recognise asdfgh` to check for red underlines.

```bash
python3 - <<'PYTHON'
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

result = subprocess.run(["pgrep", "-x", "ChatGPT"], capture_output=True)
if result.returncode == 0:
    raise SystemExit("Fully quit ChatGPT first; closing its window may not stop it.")
if result.returncode != 1:
    raise SystemExit("Could not check whether ChatGPT is running; no changes made.")

p = Path.home() / ".config/Codex/Default/Preferences"
data = json.loads(p.read_text())
backup = p.with_name("Preferences.before-spellcheck-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
shutil.copy2(p, backup)
data.setdefault("browser", {})["enable_spellchecking"] = False
data.setdefault("spellcheck", {})["dictionaries"] = []
p.write_text(json.dumps(data))
print(f"Backup: {backup}")
print("Spell-check disabled in preferences. Reopen ChatGPT to apply it.")
PYTHON
```

If quitting appears ineffective, use `pgrep -a -x ChatGPT` to inspect remaining
processes. Stop the main app process before reopening; starting another window
while the old process remains alive does not reload these settings.

To undo, fully quit ChatGPT and restore the timestamped preferences backup.
Restore it promptly if needed: it also contains the other preferences as they
were when the backup was created.

This is a locally verified workaround, not a documented ChatGPT setting. Future
versions may change the profile path or preference behavior. Keep only this
recipe in Git, not the complete live profile or its backups.
