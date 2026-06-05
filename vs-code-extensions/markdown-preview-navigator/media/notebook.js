/**
 * Notebook markdown-cell heading scale — ports preview.css's heading treatment
 * into .ipynb rendered markdown cells.
 *
 * Why this file exists: notebook markdown cells are NOT the markdown preview.
 * They render through the built-in `vscode.markdown-it-renderer` notebook
 * renderer, which ignores `markdown.previewStyles` contributions and ships its
 * own embedded CSS with an even louder scale (h1 2.3em / h2 2em / h3 1.7em).
 * So the preview reads calm while the same headings in a notebook shout.
 *
 * The hook: the built-in renderer renders each markdown cell into a shadow
 * root, and on first render clones every `<template class="markdown-style">`
 * found in the webview's document.head into that shadow root. This module is a
 * notebook renderer that *extends* the built-in one (see `notebookRenderer` in
 * package.json), so it runs in the same webview — its activate() plants one
 * such template, and every markdown cell picks the styles up.
 *
 * Selectors use `#preview` (the cell's content container inside the shadow
 * root) so they outrank the built-in's bare-element rules regardless of which
 * template gets cloned first.
 *
 * Stability: the template hook and the `#preview` id are renderer internals,
 * not documented API — but VS Code's first-party markdown-math extension rides
 * the same hook, so it's a de-facto contract. If an update ever drops it, the
 * failure is silent and cosmetic-only (headings revert to the loud default).
 * CSS injection is used instead of the renderer's `extendMarkdownIt` API
 * because that hook exposes the markdown-it pipeline (HTML), not styling.
 *
 * KEEP IN SYNC with preview.css's heading block — the values below are
 * deliberate copies (only the selector prefix differs); a tweak there must be
 * hand-carried here, and no test covers this file.
 *
 * Only the heading scale + hierarchy colors are ported — not the reading
 * measure or body/bold colors: notebook cells already size to the notebook
 * layout and `notebook.markup.fontSize`, so the prose treatment isn't needed
 * and would fight the notebook's own chrome.
 */
export function activate() {
  const template = document.createElement('template');
  template.classList.add('markdown-style');
  const style = document.createElement('style');
  style.textContent = `
    /* Same near-body scale as preview.css: let weight, whitespace, and color
     * carry the hierarchy instead of size. */
    #preview h1 { font-size: 1.35em; }
    #preview h2 { font-size: 1.15em; }
    #preview h3 { font-size: 1.05em; }
    #preview h4 { font-size: 1em; }
    #preview h5 { font-size: 0.9em; }
    #preview h6 { font-size: 0.85em; }

    /* The built-in renderer flattens h1-h3 to font-weight normal; at a
     * near-body size they need markdown.css's 600 back to read as headings. */
    #preview h1,
    #preview h2,
    #preview h3,
    #preview h4,
    #preview h5,
    #preview h6 {
      font-weight: 600;
      margin-bottom: 0.5em; /* headings are near body size; pull each close to the content it labels */
    }

    /* Subsection tier, as in preview.css: h3 softens only slightly (color-mix,
     * not the muted label grey) so it still reads as a heading; h4+ drop to the
     * muted color so depth reads without stealing size from the content. */
    #preview h3 {
      color: color-mix(in srgb, var(--vscode-foreground) 82%, var(--vscode-descriptionForeground));
    }
    #preview h4,
    #preview h5,
    #preview h6 {
      color: var(--vscode-descriptionForeground);
    }
  `;
  template.content.appendChild(style);
  document.head.appendChild(template);
}
