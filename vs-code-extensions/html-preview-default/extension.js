const vscode = require('vscode');

function escapeAttribute(value) {
  return value.replace(/[&"'<>]/g, ch => ({
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;'
  }[ch]));
}

function isTagBoundary(ch) {
  return ch === '>' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/';
}

function findTagEnd(html, start) {
  let i = start;
  let quote = null;
  while (i < html.length) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
    i++;
  }
  return -1;
}

function findHeadInsertionPoint(html) {
  let i = 0;
  const skipWhitespaceAndComments = () => {
    while (i < html.length) {
      const c = html[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') {
        i++;
      } else if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        if (end === -1) { i = html.length; return; }
        i = end + 3;
      } else {
        return;
      }
    }
  };
  skipWhitespaceAndComments();
  if (html.substr(i, 9).toLowerCase() === '<!doctype') {
    const close = findTagEnd(html, i);
    if (close === -1) return -1;
    i = close + 1;
    skipWhitespaceAndComments();
  }
  if (html.substr(i, 5).toLowerCase() === '<html' && isTagBoundary(html[i + 5])) {
    const close = findTagEnd(html, i);
    if (close === -1) return -1;
    i = close + 1;
    skipWhitespaceAndComments();
  }
  if (html.substr(i, 5).toLowerCase() === '<head' && isTagBoundary(html[i + 5])) {
    const close = findTagEnd(html, i);
    if (close !== -1) return close + 1;
  }
  return -1;
}

class HtmlPreviewProvider {
  resolveCustomTextEditor(document, panel) {
    const documentDirectory = vscode.Uri.joinPath(document.uri, '..');
    const baseUri = panel.webview.asWebviewUri(documentDirectory).toString();
    const cspSource = panel.webview.cspSource;

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [documentDirectory]
    };

    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; media-src ${cspSource} data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; connect-src 'none'; child-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; navigate-to 'none'; base-uri ${cspSource};">`;
    const base = `<base href="${escapeAttribute(baseUri.endsWith('/') ? baseUri : `${baseUri}/`)}">`;
    const reset = `<style id="vscode-webview-reset">
      code, pre, kbd, samp, tt {
        all: revert !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
      }
    </style>`;
    const render = () => {
      const html = document.getText();
      const headContent = `${csp}${base}${reset}`;
      const insertAt = findHeadInsertionPoint(html);
      if (insertAt >= 0) {
        panel.webview.html = html.slice(0, insertAt) + headContent + html.slice(insertAt);
      } else {
        panel.webview.html = `<!doctype html><html><head>${headContent}</head><body>${html}</body></html>`;
      }
    };
    render();
    const sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) render();
    });
    panel.onDidDispose(() => sub.dispose());
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'htmlPreviewDefault.preview',
      new HtmlPreviewProvider()
    )
  );
}

module.exports = { activate };
