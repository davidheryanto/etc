// Browser-side harness for the Playwright fixture. Loaded as a classic script
// BEFORE media/preview.js. It applies a theme from the ?theme= query param,
// injects the --vscode-* variables the preview normally inherits from VS Code,
// and builds a representative Markdown-preview DOM for preview.js to scan.
(function () {
  // Approximations of real VS Code themes. Values only need to be plausible —
  // the point is to exercise light / dark / high-contrast code paths in
  // preview.css (e.g. the per-theme --mpn-hairline and the focus rail).
  const THEMES = {
    light: {
      cls: "vscode-light",
      vars: {
        "editor-background": "#f4efe6",
        "editor-foreground": "#33312c",
        foreground: "#33312c",
        descriptionForeground: "#8a857c",
        "panel-border": "rgba(0, 0, 0, 0.12)",
        "widget-shadow": "rgba(0, 0, 0, 0.12)",
        "toolbar-hoverBackground": "rgba(0, 0, 0, 0.06)",
        // Warm accent, matching the user's editor theme — this is the colour the
        // active rail and the keyboard focus ring resolve to.
        focusBorder: "#b0823a",
        "textLink-foreground": "#9a3d3a",
        "list-hoverBackground": "rgba(0, 0, 0, 0.045)",
      },
    },
    dark: {
      cls: "vscode-dark",
      vars: {
        "editor-background": "#1e1e1e",
        "editor-foreground": "#d4d4d4",
        foreground: "#e6e6e6",
        descriptionForeground: "#9d9d9d",
        "panel-border": "rgba(255, 255, 255, 0.14)",
        "widget-shadow": "rgba(0, 0, 0, 0.5)",
        "toolbar-hoverBackground": "rgba(255, 255, 255, 0.08)",
        focusBorder: "#0e639c",
        "textLink-foreground": "#4daafc",
        "list-hoverBackground": "rgba(255, 255, 255, 0.06)",
      },
    },
    "high-contrast": {
      cls: "vscode-high-contrast",
      vars: {
        "editor-background": "#000000",
        "editor-foreground": "#ffffff",
        foreground: "#ffffff",
        descriptionForeground: "#ffffff",
        "panel-border": "#6fc3df",
        "widget-shadow": "transparent",
        "toolbar-hoverBackground": "rgba(255, 255, 255, 0.16)",
        focusBorder: "#f38518",
        "textLink-foreground": "#3794ff",
        "list-hoverBackground": "rgba(255, 255, 255, 0.12)",
      },
    },
  };

  // Heading structure mirrors the azure sample doc: nested h2/h3/h4, a couple of
  // very long headings (to exercise the 2-line clamp + truncation tooltip), and
  // enough sections that the list overflows and must scroll inside the panel.
  const DOC = [
    ["h2", "Azure storage download util for chores — options & recommendation"],
    ["h2", "Verdict: yes — a small, az-based tool"],
    ["h2", "Facts that decide the engine"],
    ["h3", "azcopy v10 status — current, not deprecated"],
    ["h3", "az storage copy is azcopy"],
    ["h3", "SDK-only path — az storage fs file download"],
    ["h2", "Auth & coverage — different principals, overlapping reach"],
    ["h3", "dbsql ← warehouse access connector"],
    ["h3", "az / azcopy ← your az identity"],
    ["h2", "Option A — az storage fs file download wrapper — RECOMMENDED"],
    ["h3", "Reference script — dbget"],
    ["h2", "Option B — azcopy (direct or az storage copy)"],
    ["h2", "Option C — uv-script + SDK — only if strict no-binary"],
    ["h2", "Recommendation"],
    ["h2", "BUILT — scripts/azget.py (2026-05-27), symlinked as scripts/dbget"],
    ["h4", "Usage examples"],
    ["h4", "Implementation notes & gotchas"],
  ];

  function applyTheme() {
    const params = new URLSearchParams(location.search);
    const theme = THEMES[params.get("theme")] || THEMES.light;
    document.documentElement.className = theme.cls;
    document.body.className = theme.cls;

    const style = document.createElement("style");
    style.id = "mpn-theme-vars";
    style.textContent =
      ":root {\n" +
      Object.entries(theme.vars)
        .map(([k, v]) => `  --vscode-${k}: ${v};`)
        .join("\n") +
      "\n}";
    document.head.appendChild(style);
  }

  function buildDoc() {
    const para =
      "<p>az logged in as David.Heryanto@example.com (user identity, not SP). " +
      "azcopy 10.29.1 installed. Repo's whole abfss workflow is dbsql-centric; " +
      "paths are pasted as <code>abfss://container@account.dfs.core.windows.net/path</code>.</p>";
    const code =
      "<pre><code>az storage fs file download --account-name acct \\\n" +
      "  --file-system fs --path a/b/c.parquet --destination ./out</code></pre>";

    const html = DOC.map(([tag, text], i) => {
      let block = `<${tag} id="h${i}">${text}</${tag}>` + para;
      if (i % 4 === 2) block += code;
      return block + para;
    }).join("\n");

    document.body.insertAdjacentHTML("afterbegin", html);
  }

  applyTheme();
  buildDoc();
})();
