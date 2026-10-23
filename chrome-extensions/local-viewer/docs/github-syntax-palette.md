# GitHub's light syntax palette, mapped to highlight.js

Researched 2026-10-23. Pinned sources: `@primer/primitives` 11.10.0 (npm,
2026-07-30; repo tag `@primer/primitives@11.10.0` =
[`3f51f80e`](https://github.com/primer/primitives/tree/3f51f80ee9510974032917c9b8ac9586656c88bc)),
highlight.js 11.12.0 (npm, 2026-08-12; `main` at
[`fc3f0639`](https://github.com/highlightjs/highlight.js/tree/fc3f06392f189354eed922973635ab9e9268b983)
checked as well; the viewer bundles 11.11.1), `primer/github-vscode-theme`
v6.3.5 (its `src/` is identical to `main` and to
[`f7a67d67`](https://github.com/primer/github-vscode-theme/tree/f7a67d67fc2302a0ec36ddfb7bdd57142f4575e8),
the commit Shiki pins), `tm-themes` 1.12.12 and `@shikijs/themes` 4.5.0,
Linguist at
[`73ee9a3b`](https://github.com/github-linguist/linguist/tree/73ee9a3b277f398c37ca4ab0dea0193849de6460),
and github.com's own CSS and rendered code, fetched 2026-10-23 02:47 UTC.
**[verified]** means I read it in the file or page cited, ran it, or computed
it. **[inferred]** means my own reasoning from verified facts.

## Short answer

- **Current palette.** github.com light mode uses the primitives 11.10.0
  values. The live CSS matches the npm package on all 30 tokens.
  Keyword `#cf222e`, entity (functions, decorators) `#6639ba`,
  constant `#0550ae`, entityTag `#0550ae`, string `#0a3069`, variable
  `#953800`, comment `#59636e`, regexp escape `#116329`, list marker
  `#3b2300`. Inserted is `#116329` on `#dafbe1` and deleted `#82071e` on
  `#ffebe9`. HTML tags, YAML keys and JSON keys are now blue, not green.
  **[verified]**
- **highlight.js `github.css` is the old palette.** It has not changed
  since 2021-05-17, and it is byte-identical in 11.9.0, 11.12.0 (the latest
  release) and `main`. Its values equal primitives 4.6.9 and earlier;
  primitives 4.7.0 replaced them on 2021-09-03. highlight.js also ships
  `github-dark.css` and `github-dark-dimmed.css` (dark only) and a base16
  `github.css` with unrelated colours. The `github-adaptive.css` on `main`
  (not yet released) reuses the same old light values. **[verified]**
- **No highlighter theme carries the current values.** GitHub's own VS
  Code theme, which Shiki ships as `github-light-default`, is built from
  primitives 7.10.0 (2022) and picks its own colours: comments `#6e7781`,
  tags and JSON keys green `#116329`, function names `#8250df`, class names
  orange. Prism has no first-party GitHub theme. The authoritative source
  for current values is primer/primitives itself
  (`dist/css/functional/themes/light.css`). **[verified]**
- **Contrast on `#f5f5f7`.** Every current code-text colour passes 4.5:1.
  The lowest are `#8250df` at 4.63 (diff range only) and keyword `#cf222e`
  at 4.91. The old hljs `github.css` fails four: `#e36209` 3.20, `#d73a49`
  4.20, `#22863a` 4.24 (4.47 on its own `#f0fff4`), and `#6a737d` 4.42. The
  VS Code/Shiki comment `#6e7781` fails at 4.17. The only current token
  under 4.5 is `sublimeLinterGutterMark` `#818b98` (3.17), which is an
  editor gutter colour, not code text. **[verified]**

## 1. Current prettylights tokens (light)

**[verified]** These are all 30 light-theme `prettylights` variables in
primitives 11.10.0
([light.css l.613–638 and l.845–849](https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/themes/light.css)).
The source is
[`syntax.json5`](https://github.com/primer/primitives/blob/3f51f80ee9510974032917c9b8ac9586656c88bc/src/tokens/functional/color/syntax.json5).
github.com's live
[`light-3a3d2c708970e4e8.css`](https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css)
resolves every one of them to the same hex. Since 11.9.0 the canonical
names are camelCase `--prettylights-syntax-*`, and the
`--color-prettylights-syntax-*` names are deprecated aliases
([#1352](https://github.com/primer/primitives/pull/1352)). github.com's
`.pl-*` rules still reference the legacy aliases
([`global-58d1122073b19732.css`](https://github.githubassets.com/assets/global-58d1122073b19732.css)),
so search for both.

| `--prettylights-syntax-…` | legacy `--color-prettylights-syntax-…` | light hex | github.com class |
|---|---|---|---|
| `comment` | `comment` | `#59636e` | `.pl-c` |
| `constant` | `constant` | `#0550ae` | `.pl-c1`, `.pl-s .pl-v` |
| `constantOtherReferenceLink` | `constant-other-reference-link` | `#0a3069` | `.pl-corl` (underlined) |
| `entity` | `entity` | `#6639ba` | `.pl-e`, `.pl-en` |
| `entityTag` | `entity-tag` | `#0550ae` | `.pl-ent` |
| `keyword` | `keyword` | `#cf222e` | `.pl-k` |
| `string` | `string` | `#0a3069` | `.pl-s`, `.pl-pds`, `.pl-sr` and its children |
| `stringRegexp` | `string-regexp` | `#116329` | `.pl-sr .pl-cce` (bold) |
| `variable` | `variable` | `#953800` | `.pl-v`, `.pl-smw` |
| `storageModifierImport` | `storage-modifier-import` | `#1f2328` | `.pl-smi`, `.pl-s .pl-s1` |
| `markup-heading` | `markup-heading` | `#0550ae` | `.pl-mh`, `.pl-ms` (bold) |
| `markup-list` | `markup-list` | `#3b2300` | `.pl-ml` |
| `markup-bold` | `markup-bold` | `#1f2328` | `.pl-mb` |
| `markup-italic` | `markup-italic` | `#1f2328` | `.pl-mi` |
| `markup-inserted-text` / `-bg` | same | `#116329` / `#dafbe1` | `.pl-mi1` |
| `markup-deleted-text` / `-bg` | same | `#82071e` / `#ffebe9` | `.pl-md` |
| `markup-changed-text` / `-bg` | same | `#953800` / `#ffd8b5` | `.pl-mc` |
| `markup-ignored-text` / `-bg` | same | `#d1d9e0` / `#0550ae` | `.pl-mi2` |
| `metaDiffRange` | `meta-diff-range` | `#8250df` | `.pl-mdr` (bold) |
| `bracketHighlighterAngle` | `brackethighlighter-angle` | `#59636e` | `.pl-ba` |
| `bracketHighlighterUnmatched` | `brackethighlighter-unmatched` | `#82071e` | `.pl-bu` |
| `invalidIllegal-text` / `-bg` | `invalid-illegal-text` / `-bg` | `#d1242f` / `#ffebe9` (`fgColor-danger` / `bgColor-danger-muted`) | `.pl-ii` |
| `carriageReturn-text` / `-bg` | `carriage-return-text` / `-bg` | `#f6f8fa` / `#cf222e` | `.pl-c2` |
| `sublimeLinterGutterMark` | `sublimelinter-gutter-mark` | `#818b98` | `.pl-sg` |

**[verified]** For context, github.com draws Markdown code blocks with
`--fgColor-default` `#1f2328` on `--bgColor-muted` `#f6f8fa`
(`.markdown-body .highlight pre` in
[`primer-38ae573fa780d76a.css`](https://github.githubassets.com/assets/primer-38ae573fa780d76a.css)).
`.pl-s1` and `.pl-kos` appear in its rendered code but have no colour rule
of their own, so they show as default text.

### When the light values changed

**[verified]** I diffed the built light CSS/SCSS of 24 npm releases and
traced each change to its commit. This lists the release that first
shipped each change. When github.com picked up each one cannot be seen
from these sources.

- **4.1.0 – 4.6.9 (2021-03-29 → 2021-09-02).** This is the old palette that
  hljs `github.css` still uses: keyword `#d73a49`, entity `#6f42c1`,
  constant `#005cc5`, string `#032f62`, variable `#e36209`, comment
  `#6a737d`, entityTag and stringRegexp `#22863a`, list `#735c0f`, inserted
  `#22863a`/`#f0fff4`, deleted `#b31d28`/`#ffeef0`
  ([4.6.9 `_light.scss`](https://unpkg.com/@primer/primitives@4.6.9/dist/scss/colors/_light.scss)).
  The same values are in the archived 2017 `primer/github-syntax-light` v0.5.0
  ([github-light.css](https://github.com/primer/github-syntax-light/blob/828ccb30b5a3a09b9b27bf52acaa90ac653d0fad/lib/github-light.css)).
- **4.7.0 (2021-09-03), the new colour system**
  ([#224](https://github.com/primer/primitives/pull/224)). The values
  became keyword `#cf222e`, entity `#8250df`, constant `#0550ae`, string
  `#0a3069`, variable `#953800`, comment `#6e7781`, entityTag and
  stringRegexp `#116329`, list `#3b2300`, inserted `#116329`/`#dafbe1`,
  deleted `#82071e`/`#ffebe9`, changed `#953800`/`#ffd8b5`
  ([4.7.0 `_light.scss`](https://unpkg.com/@primer/primitives@4.7.0/dist/scss/colors/_light.scss)).
- **7.11.2 (2023-03-29), entityTag goes from green to blue in the new
  token source.** "Add Primitives v8 colors (private dist for testing)"
  ([#529](https://github.com/primer/primitives/pull/529),
  [`05edec6`](https://github.com/primer/primitives/commit/05edec6425b470c1a4c2e10997cbe961463e3880))
  set `entity.tag` to `blue.6` (`#0550ae`), where it had been `green.6`. No
  changelog entry gives a reason. For a while both builds shipped side by
  side: 7.17.1 has the legacy
  [`scss/colors/_light.scss`](https://unpkg.com/@primer/primitives@7.17.1/dist/scss/colors/_light.scss)
  with `#116329` and the new
  [`css/functional/themes/light.css`](https://unpkg.com/@primer/primitives@7.17.1/dist/css/functional/themes/light.css)
  with `#0550ae`.
- **7.11.14 (2023-07-11), entity from `#8250df` to `#6639ba`**
  ([#666](https://github.com/primer/primitives/pull/666)): "so it meets the
  required color contrast on a diff deletion background".
- **7.15.4 (2023-11-22), comment from `#6e7781` to `#57606a`**
  ([#781](https://github.com/primer/primitives/pull/781)): "to achieve
  proper contrast over the `muted` background color".
- **8.0.0 (2024-04-23), legacy build removed**
  ([`c4e1275e`](https://github.com/primer/primitives/commit/c4e1275e794a92e7cef4f9faab1ce7d6f2898dc4)).
  From this release on, the only light entityTag shipped is `#0550ae`.
- **9.0.0 (2024-08-21), new neutral scales**
  ([#1016](https://github.com/primer/primitives/pull/1016)). Comment
  `#57606a` became `#59636e`. storageModifierImport and markup bold/italic
  went from `#24292f` to `#1f2328`. bracketHighlighterAngle went from
  `#57606a` to `#59636e`, markup-ignored text from `#eaeef2` to `#d1d9e0`,
  and the gutter mark from `#8c959f` to `#818b98`. This is the last change
  to the comment colour. Nothing changed it in 2025 or 2026.
- **11.3.2 (2025-12-11), invalid.illegal**
  ([#1281](https://github.com/primer/primitives/pull/1281)). It went from
  `#f6f8fa` on `#82071e` to `fgColor-danger` `#d1242f` on
  `bgColor-danger-muted` `#ffebe9`.
- **11.9.0 (2026-05-13), names only**
  ([#1352](https://github.com/primer/primitives/pull/1352),
  [`3dfc099`](https://github.com/primer/primitives/commit/3dfc0997d60cfec13a861b38cd1cfb06c0ebdf30)).
  No values changed. This is the last commit to touch `syntax.json5`, so
  11.10.0 is unchanged.

`primer/css` (22.3.2) only re-exports these variables; it does not define
syntax colours. **[verified]**

## 2. highlight.js `github.css`

**[verified]** `src/styles/github.css` at
[11.12.0](https://github.com/highlightjs/highlight.js/blob/11.12.0/src/styles/github.css)
has the same blob as `main` (`7024045d`). Its last change was
[`3e628edb`](https://github.com/highlightjs/highlight.js/commit/3e628edbe34d2ffb9166ff365f614f56621597be)
on 2021-05-17 ([#3191](https://github.com/highlightjs/highlight.js/pull/3191),
"GitHub v11"). The built `styles/github.css` is identical in the 11.9.0
and 11.12.0 npm packages. The header comment reads:

```css
/*!
  Theme: GitHub
  Description: Light theme as seen on github.com
  Author: github.com
  Maintainer: @Hirse
  Updated: 2021-05-15

  Outdated base version: https://github.com/primer/github-syntax-light
  Current colors taken from GitHub's CSS
*/
```

These are its rules, with whitespace collapsed:

```css
.hljs { color: #24292e; background: #ffffff }
.hljs-doctag, .hljs-keyword, .hljs-meta .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_ { /* prettylights-syntax-keyword */ color: #d73a49 }
.hljs-title, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-title.function_ { /* prettylights-syntax-entity */ color: #6f42c1 }
.hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-variable, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { /* prettylights-syntax-constant */ color: #005cc5 }
.hljs-regexp, .hljs-string, .hljs-meta .hljs-string { /* prettylights-syntax-string */ color: #032f62 }
.hljs-built_in, .hljs-symbol { /* prettylights-syntax-variable */ color: #e36209 }
.hljs-comment, .hljs-code, .hljs-formula { /* prettylights-syntax-comment */ color: #6a737d }
.hljs-name, .hljs-quote, .hljs-selector-tag, .hljs-selector-pseudo { /* prettylights-syntax-entity-tag */ color: #22863a }
.hljs-subst { /* prettylights-syntax-storage-modifier-import */ color: #24292e }
.hljs-section { /* prettylights-syntax-markup-heading */ color: #005cc5; font-weight: bold }
.hljs-bullet { /* prettylights-syntax-markup-list */ color: #735c0f }
.hljs-emphasis { /* prettylights-syntax-markup-italic */ color: #24292e; font-style: italic }
.hljs-strong { /* prettylights-syntax-markup-bold */ color: #24292e; font-weight: bold }
.hljs-addition { /* prettylights-syntax-markup-inserted */ color: #22863a; background-color: #f0fff4 }
.hljs-deletion { /* prettylights-syntax-markup-deleted */ color: #b31d28; background-color: #ffeef0 }
.hljs-char.escape_, .hljs-link, .hljs-params, .hljs-property, .hljs-punctuation, .hljs-tag { /* purposely ignored */ }
```

- **It is the pre-September-2021 palette.** **[verified]** Each value
  equals the primitives 4.6.9 light value for the token named in the
  comment. "Current colors taken from GitHub's CSS" was true on 2021-05-15.
  Primer replaced the palette in 4.7.0 less than four months later, and the
  file has not been touched since. It also predates three later changes:
  entityTag became blue, entity became `#6639ba`, and comment became
  `#59636e`.
- **Other GitHub files in highlight.js.** **[verified]** 11.12.0 ships
  `github-dark.css` and `github-dark-dimmed.css`, which are dark only and
  carry the same "Updated: 2021-05-15" line. It also ships `base16/github.css`,
  generated from a base16 scheme ("Author: Defman21"; keyword `#a71d5d`,
  string `#183691`), which is not a Primer palette. `main` adds
  [`github-adaptive.css`](https://github.com/highlightjs/highlight.js/blob/374acd29706df59af598eacdc8907fbc3befbb1c/src/styles/github-adaptive.css)
  (2026-08-14, [#4340](https://github.com/highlightjs/highlight.js/pull/4340)),
  which is not yet in a release. It is "a mashup of the `github.css` and
  `github-dark.css` themes" using `light-dark()`, and its light half has
  the same old values. There is no `github-light-default` or high-contrast
  file.
- **A gotcha for any hljs theme.** **[verified]** I ran this with the
  viewer's own bundled 11.11.1 and with 11.12.0. JSON `true`/`null` come
  out as `<span class="hljs-literal"><span class="hljs-keyword">true</span></span>`
  (the literal mode is from
  [`ed25668a`](https://github.com/highlightjs/highlight.js/commit/ed25668a3d728309f33b49d9c9c4c74dada5510c),
  2022). An HTML doctype comes out as `hljs-meta` with an inner
  `hljs-keyword` for `html`. A theme that colours `.hljs-keyword` red
  therefore turns JSON booleans red, and `github.css` does so.

## 3. Maintained themes with the current values

There are none. **[verified]**

- **Shiki.** `@shikijs/themes` 4.5.0 takes its themes from `tm-themes`
  ^1.12.12. That package's
  [metadata](https://unpkg.com/tm-themes@1.12.12/index.js) gives the
  source of both `github-light` and `github-light-default` as
  `primer/github-vscode-theme` `src/theme.js` at `f7a67d67` (2024-10-03).
  The hex values in Shiki's `dist/github-light-default.mjs` are identical
  to `tm-themes/themes/github-light-default.json`. `github-light` is the
  VS Code theme's "classic" build, which is the 2017 palette (`#d73a49`,
  `#6f42c1`, `#005cc5`, `#032f62`, `#e36209`, `#6a737d`, `#22863a`).
- **primer/github-vscode-theme** (GitHub's own) pins `@primer/primitives`
  **7.10.0** (2022-10-17)
  ([package.json l.86](https://github.com/primer/github-vscode-theme/blob/v6.3.5/package.json#L86)).
  It picks scale steps itself rather than using the `prettylights` tokens
  ([theme.js l.332 on](https://github.com/primer/github-vscode-theme/blob/v6.3.5/src/theme.js#L332)).
  The last change to `src/` was 2024-10-03. So it is neither the current
  token set nor the same scope-to-role mapping as github.com.
  `light-default` tokenColors, from the built JSON:

| Scope(s) in `light-default` | hex | primitives 7.10.0 step | github.com today (token, hex) |
|---|---|---|---|
| `comment`, `punctuation.definition.comment`, `string.comment` | `#6e7781` | `gray[5]` | comment `#59636e` |
| `keyword` | `#cf222e` | `red[5]` | keyword `#cf222e` |
| `storage`, `storage.type` | `#cf222e` | `red[5]` | keyword `#cf222e` (2017 map: `storage` → `.pl-k`) |
| `string` | `#0a3069` | `blue[8]` | string `#0a3069` |
| `constant`, `entity.name.constant`, `variable.other.constant`, `variable.other.enummember`, `variable.language`, `entity` | `#0550ae` | `blue[6]` | constant `#0550ae` |
| `entity.name`, `meta.export.default`, `meta.definition.variable` | `#953800` | `orange[6]` | entity `#6639ba` (`.pl-en`) |
| `entity.name.function` | `#8250df` | `purple[5]` | entity `#6639ba` |
| `entity.name.tag`, `support.class.component` | `#116329` | `green[6]` | entityTag `#0550ae` |
| `support.type.property-name.json` | `#116329` | `green[6]` | JSON keys are `.pl-ent`, `#0550ae` (§4) |
| `support`, `support.constant`, `support.variable`, `meta.property-name` | `#0550ae` | `blue[6]` | constant `#0550ae` |
| `variable` | `#953800` | `orange[6]` | variable `#953800` |
| `variable.other`, `variable.parameter.function` | `#1f2328` | `fg.default` | default text `#1f2328` |
| `string.regexp constant.character.escape` | `#116329` bold | `green[6]` | stringRegexp `#116329` bold |
| `markup.heading` | `#0550ae` bold | `blue[6]` | markup-heading `#0550ae` |
| `markup.inserted` | `#116329` on `#dafbe1` | `green[6]` / `green[0]` | same |
| `markup.deleted` | `#82071e` on `#ffebe9` | `red[7]` / `red[0]` | same |
| `brackethighlighter.*` | `#57606a` | `gray[6]` | `#59636e` |

- **Prism.** Core `prismjs` 1.30.0 ships no GitHub theme (`prism`, `coy`,
  `dark`, `funky`, `okaidia`, `solarizedlight`, `tomorrow`, `twilight`).
  The `prism-themes` 1.9.0 collection has
  [`prism-ghcolors.css`](https://unpkg.com/prism-themes@1.9.0/themes/prism-ghcolors.css),
  "GHColors theme by Avi Aryan … Inspired by Github syntax coloring". It is
  a third-party theme with non-Primer colours such as `#e3116c` and
  `#00009f`. **[verified]**
- **Most authoritative source.** **[inferred]** Take hex values from
  primer/primitives, in the npm `dist/css/functional/themes/light.css` or
  the source `syntax.json5`. Take the role of each token from github.com's
  `.pl-*` rules (§1) and its rendered output (§4). Every highlighter theme
  above lags one or two palette changes behind.

## 4. YAML keys, JSON keys and HTML attribute names

I found no public source for GitHub's highlighter or its current
scope-to-class mapping. GitHub Docs says only: "We use
Linguist to perform language detection and to select third-party grammars
for syntax highlighting"
([creating-and-highlighting-code-blocks.md](https://github.com/github/docs/blob/5e4bf35023f07b0183bfa3da08e0582324af9440/content/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks.md)).
The only public scope-to-class table is the comments in the archived 2017
[`github-light.css`](https://github.com/primer/github-syntax-light/blob/828ccb30b5a3a09b9b27bf52acaa90ac653d0fad/lib/github-light.css),
for example `.pl-ent /* entity.name.tag, markup.quote */`. I therefore
read the classes github.com emitted in the rendered-code payload of real
blob pages on 2026-10-23. **[verified]**

| Construct | Linguist grammar scope | 2017 map | Class github.com emitted | Token, hex today |
|---|---|---|---|---|
| YAML key | `entity.name.tag.yaml` ([atom/language-yaml](https://github.com/atom/language-yaml/blob/b0f7f6598a5be8e07f05e124dabd7869749eccc4/grammars/yaml.cson#L51)) | `entity.name.tag` → `.pl-ent` | `.pl-ent` ([ci.yml](https://github.com/primer/primitives/blob/main/.github/workflows/ci.yml)) | entityTag `#0550ae` |
| JSON key | `entity.name.tag.key.json` ([NovaGrammars](https://github.com/Nixinova/NovaGrammars/blob/c6dfb955f070c5aaf3ca7f6ee8d0b1802c6aed95/grammars/json.yaml-tmLanguage#L61)) | `entity.name.tag` → `.pl-ent` | `.pl-ent` ([package.json](https://github.com/primer/primitives/blob/main/package.json)) | entityTag `#0550ae` |
| HTML tag name | `entity.name.tag.*.html` ([atom/language-html](https://github.com/atom/language-html/blob/ee750a014a003c3d6f10b91e3cd5f9bfa0f051e6/grammars/html.cson#L361)) | `.pl-ent` | `.pl-ent` ([demo/index.html](https://github.com/highlightjs/highlight.js/blob/main/demo/index.html)) | entityTag `#0550ae` |
| HTML attribute name | `entity.other.attribute-name.html` ([l.553](https://github.com/atom/language-html/blob/ee750a014a003c3d6f10b91e3cd5f9bfa0f051e6/grammars/html.cson#L553)) | not listed (nearest is `entity` → `.pl-e`, purple) | `.pl-c1` | constant `#0550ae` |
| HTML attribute value | | `string` → `.pl-s` | `.pl-s` (quotes uncoloured) | string `#0a3069` |
| HTML `<`, `>`, `</` | | | `.pl-kos` (no colour rule) | default text |
| HTML `<!DOCTYPE html>` | | | `.pl-c1` | constant `#0550ae` |

Linguist maps JSON, YAML and HTML to these grammars in
[grammars.yml](https://github.com/github-linguist/linguist/blob/73ee9a3b277f398c37ca4ab0dea0193849de6460/grammars.yml)
(`NovaGrammars` → `source.json`, `language-yaml` → `source.yaml`,
`language-html` → `text.html.basic`).

- **YAML and JSON keys follow the 2017 map.** **[verified]** The grammar
  scope is `entity.name.tag.*`, the 2017 map sends that to `.pl-ent`, and
  github.com emits `.pl-ent`. The colon and the YAML `-` stay uncoloured.
- **HTML attribute names are known only from output.** **[verified]** The
  grammar scope is not in the 2017 table, and github.com emits `.pl-c1`
  (constant). The HTML page also uses classes that the 2017 map never had
  (`.pl-kos`), so I am not claiming which mapping produced it.
- **All three are the same blue today.** **[verified]** entityTag and
  constant are both `#0550ae`. In the 2017 palette they differed
  (`#22863a` vs `#005cc5`), and in the VS Code/Shiki theme they still
  differ (`entity.name.tag` and `support.type.property-name.json`
  `#116329`; `entity.other.attribute-name` falls under `entity`,
  `#0550ae`). highlight.js marks all three as `hljs-attr` (`json.js`,
  `yaml.js` and `xml.js` all use `className: 'attr'`), so one colour
  serves all three.

Other constructs seen in the same payloads, used in §5. **[verified]**

- **JavaScript**
  ([compile_keywords.js](https://github.com/highlightjs/highlight.js/blob/main/src/lib/compile_keywords.js)).
  `const`/`function`/`if`/`return` → `.pl-k`. Function names, at
  definition and call (`compileKeywords`, `.split(`, `.forEach(`) →
  `.pl-en`. Parameters and locals → `.pl-s1`. `=`, `===` and `=>` →
  `.pl-c1`. `null`, `0` and `UPPER_CASE` constants → `.pl-c1`. `Object`
  and `Array` → `.pl-v`. Punctuation → `.pl-kos`. JSDoc `@param` → `.pl-k`
  inside `.pl-c`, with its type → `.pl-smi`.
- **Python**
  ([flask-view.py](https://github.com/github-linguist/linguist/blob/main/samples/Python/flask-view.py)).
  `def`/`class`/`return` → `.pl-k`. `def` names → `.pl-en`. Built-ins
  called as functions (`frozenset`, `set`, `sorted`,
  `NotImplementedError`) → `.pl-en`. A decorator (`@classmethod`) →
  `.pl-en`. Class names, including a base class in `class
  MethodView(View)` → `.pl-v`. Parameters and `self` → `.pl-s1`.
  Attribute access (`.methods`, `.__name__`) → `.pl-c1`. Operators (`=`,
  `*`, `**`, `in`, `or`) → `.pl-c1`. `None` → `.pl-c1`. Docstrings →
  `.pl-s`.
- **CSS**
  ([github.css on github.com](https://github.com/highlightjs/highlight.js/blob/main/src/styles/github.css)).
  Class selectors (`.hljs-title`) → `.pl-c1`. Property names (`color`) →
  `.pl-c1`. Hex colours → `.pl-pds`, which is the string colour.
- **YAML numbers** (`0`, `22`) → `.pl-c1`. **Comments** in every language
  → `.pl-c`.

## 5. Proposed mapping onto highlight.js classes

"From source" means both halves are sourced: the hex comes from primitives
11.10.0, and the class-to-token link comes from github.com's `.pl-*` rule
or its rendered output for the same construct (§4), or from the 2017 map
where github.com's CSS confirms the class. "Inferred" means it leans on
judgement or on hljs `github.css`'s old role choices. "Default text" means
the viewer's `#1d1d1f`; github.com's equivalent is `#1f2328`.

- `hljs-keyword` → keyword `#cf222e`. **From source** (`.pl-k`).
- `hljs-doctag` → keyword `#cf222e`. **From source**: JSDoc `@param` →
  `.pl-k` on github.com, and hljs emits `doctag` for it.
- `hljs-type` → keyword `#cf222e`. **Inferred**: `storage.type` → `.pl-k`
  in the 2017 map, and hljs `github.css` does the same. Not checked on
  github.com. One exception: hljs also emits `type` for a JSDoc type such
  as `{string}`, which github.com renders as `.pl-smi` (default text). So
  `.hljs-comment .hljs-type` → default text is **from source**.
- `hljs-template-tag`, `hljs-template-variable` → keyword `#cf222e`.
  **Inferred** from hljs `github.css`.
- `hljs-string` → string `#0a3069`. **From source** (`.pl-s`).
- `hljs-regexp` → string `#0a3069`. **From source**: `.pl-sr` sits in
  github.com's string rule. `stringRegexp` `#116329` applies only to
  escapes inside a regex (`.pl-sr .pl-cce`, bold), and hljs does not emit
  those separately.
- `hljs-subst` → default text. **From source**: `.pl-s .pl-s1` ("string
  source") → storageModifierImport `#1f2328`, which is github.com's
  default text colour.
- `hljs-number` → constant `#0550ae`. **From source** (`.pl-c1`).
- `hljs-literal` → constant `#0550ae`. **From source** (`null`, `None` →
  `.pl-c1`). Also add `.hljs-literal .hljs-keyword` → `#0550ae` so JSON
  `true`/`null` do not turn red (§2). That rule is **inferred**: JSON
  booleans were not in the sampled file.
- `hljs-attr` → `#0550ae`. **From source**: YAML and JSON keys →
  `.pl-ent` (entityTag) and HTML attribute names → `.pl-c1` (constant), and
  both are `#0550ae`.
- `hljs-attribute` (CSS property) → constant `#0550ae`. **From source**
  (`.pl-c1`).
- `hljs-property` → constant `#0550ae`. **From source**: Python attribute
  access → `.pl-c1`.
- `hljs-operator` → constant `#0550ae`. **From source** (`=`, `===`, `=>`
  → `.pl-c1`).
- `hljs-symbol` → constant `#0550ae`. **Inferred**: Ruby
  `constant.other.symbol` → `constant` → `.pl-c1` in the 2017 map. hljs
  `github.css` used the variable colour.
- `hljs-meta` → constant `#0550ae`. **From source** for an HTML doctype
  (`.pl-c1`). Other `meta` uses differ on github.com: a Python decorator
  is `.pl-en` `#6639ba`, and a diff `@@` range is `.pl-mdr` `#8250df` bold.
  Leave `.hljs-meta .hljs-keyword` inheriting `meta`, so that the doctype
  is one colour as on github.com. That choice is **inferred** for C
  preprocessor lines. Use `.hljs-meta .hljs-string` → `#0a3069`
  (**inferred**).
- `hljs-title.function_` → entity `#6639ba`. **From source** (`.pl-en` on
  definitions and calls).
- `hljs-title` (plain) → entity `#6639ba`. **Inferred** (same as
  `function_`).
- `hljs-title.class_` and `.class_.inherited__` → variable `#953800`.
  **From source**: Python class and base-class names and JS
  `Object`/`Array` → `.pl-v`, and hljs marks those same tokens
  `title.class_`.
- `hljs-built_in` → entity `#6639ba`. **From source** for Python
  (`frozenset`, `set`, `sorted` → `.pl-en`; hljs marks `print`, `len` and
  `frozenset` `built_in`). **Inferred** elsewhere: shell built-ins are
  `support.function.builtin` → `support` → `.pl-c1` (`#0550ae`) in the 2017
  map, and I could not check github.com (it rate-limited further fetches).
- `hljs-variable` → variable `#953800`. **Inferred**: `variable` →
  `.pl-v` in the 2017 map. Shell `$VAR` may instead be default text on
  github.com (`variable.other` → `.pl-smi`). Not checked.
- `hljs-variable.language_` (`this`, `self`) → default text. **From
  source** for Python `self` (`.pl-s1`). The 2017 map would give
  `variable.language` → `.pl-c1` `#0550ae`.
- `hljs-params` → default text. **From source** (`.pl-s1`, no colour rule).
- `hljs-punctuation` → default text. **From source** (`.pl-kos`, no colour
  rule; JSON braces uncoloured).
- `hljs-tag` (the `<…>` wrapper) → default text. **From source**
  (`.pl-kos`).
- `hljs-name` (HTML/XML tag name) → entityTag `#0550ae`. **From source**
  (`.pl-ent`).
- `hljs-selector-class` → constant `#0550ae`. **From source** (`.pl-c1`).
- `hljs-selector-tag`, `hljs-selector-id`, `hljs-selector-attr`,
  `hljs-selector-pseudo` → `#0550ae`. **Inferred**: these were not in the
  sample, so they follow `selector-class`. The 2017 map would make
  `selector-tag` `.pl-ent` (the same blue today) and pseudo-classes `entity`
  `.pl-e` purple.
- `hljs-comment` → comment `#59636e`. **From source** (`.pl-c`).
- `hljs-section` → markup-heading `#0550ae`, bold. **From source**
  (`markup.heading` → `.pl-mh`, bold in github.com CSS).
- `hljs-bullet` → markup-list `#3b2300`. **From source** for Markdown list
  markers (`markup.list` → `.pl-ml`). hljs also emits `bullet` for YAML
  `-`, which github.com leaves uncoloured. At `#3b2300` the difference
  barely shows.
- `hljs-addition` → `#116329` on `#dafbe1`. **From source** (`.pl-mi1`).
- `hljs-deletion` → `#82071e` on `#ffebe9`. **From source** (`.pl-md`).
- Not on the list but emitted by hljs. **Inferred** from the 2017 map plus
  github.com CSS: `hljs-code` → `#0550ae` (`markup.raw` → `.pl-c1`).
  `hljs-quote` → `#0550ae` (`markup.quote` → `.pl-ent`). `hljs-emphasis`
  and `hljs-strong` → default text, italic or bold. `hljs-link` →
  `#0a3069`, underlined (`.pl-corl`). `hljs-char.escape_` → `#0550ae`
  (`constant.character.escape` → `constant`).

## 6. Contrast on `#f5f5f7`

**[verified]** I used WCAG 2.x relative luminance
([WCAG 2.2](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)).
Each sRGB channel is divided by 255, then `c/12.92` if it is ≤ 0.04045,
else `((c+0.055)/1.055)^2.4`. L = 0.2126 R + 0.7152 G + 0.0722 B, and the
ratio is (L1+0.05)/(L2+0.05). WCAG 2.0/2.1 used a 0.03928 threshold; no
8-bit value lies between the two, so the results are the same. I computed
it with python3 and floored to two decimals, so a 4.499 never shows as
4.50. Fail means under 4.5:1 (AA, normal text).

**Current palette (primitives 11.10.0 / github.com):**

| hex | role | ratio | |
|---|---|---|---|
| `#cf222e` | keyword, carriage-return bg | 4.91 | pass |
| `#6639ba` | entity | 6.74 | pass |
| `#0550ae` | constant, entityTag, markup-heading, ignored bg | 6.97 | pass |
| `#0a3069` | string, reference link | 11.76 | pass |
| `#953800` | variable, markup-changed text | 6.78 | pass |
| `#59636e` | comment, bracketHighlighterAngle | 5.61 | pass |
| `#116329` | stringRegexp, markup-inserted text | 6.78 | pass |
| `#1f2328` | storageModifierImport, markup bold/italic | 14.50 | pass |
| `#3b2300` | markup-list | 13.52 | pass |
| `#82071e` | markup-deleted text, bracketHighlighterUnmatched | 9.65 | pass |
| `#8250df` | metaDiffRange | 4.63 | pass (narrow) |
| `#d1242f` | invalidIllegal text | 4.81 | pass |
| `#818b98` | sublimeLinterGutterMark | 3.17 | **fail** (gutter, not code text) |

**Earlier Primer and VS Code/Shiki values:**

| hex | where | ratio | |
|---|---|---|---|
| `#6e7781` | comment, primitives 4.7.0–7.15.3; VS Code/Shiki `github-light-default` | 4.17 | **fail** |
| `#57606a` | comment, 7.15.4–8.x; VS Code bracket highlighter | 5.86 | pass |
| `#8250df` | entity, 4.7.0–7.11.13; VS Code `entity.name.function` | 4.63 | pass (narrow) |
| `#24292f` | storageModifierImport before 9.0.0 | 13.45 | pass |
| `#8c959f` | gutter mark before 9.0.0 | 2.78 | **fail** (gutter) |

**Old palette (hljs `github.css` = primitives ≤ 4.6.9):**

| hex | hljs role | ratio | |
|---|---|---|---|
| `#d73a49` | keyword | 4.20 | **fail** |
| `#6f42c1` | entity / title | 5.97 | pass |
| `#005cc5` | constant | 5.77 | pass |
| `#032f62` | string | 12.15 | pass |
| `#e36209` | built_in, symbol | 3.20 | **fail** |
| `#6a737d` | comment | 4.42 | **fail** |
| `#22863a` | name, selector-tag, addition | 4.24 | **fail** |
| `#735c0f` | bullet | 5.90 | pass |
| `#b31d28` | deletion | 6.17 | pass |
| `#24292e` | default, subst | 13.47 | pass |

**Viewer default:** `#1d1d1f` is 15.45, a pass.

**Not Primer, for reference:** the Prism `ghcolors` colours `#e3116c` and
`#00009f` are 4.22 (**fail**) and 12.85. The hljs `base16/github.css`
keyword `#a71d5d` is 6.47 and its string `#183691` is 9.76.

**Text on its own background.** For background colours, contrast against
the canvas is not meaningful, so they are paired with their own text.
Against `#f5f5f7` alone they all sit at 1.0–1.3: `#dafbe1` 1.02, `#ffebe9`
1.05, `#ffd8b5` 1.22, `#f0fff4` 1.05, `#ffeef0` 1.02, `#f6f8fa` 1.02,
`#ffffff` 1.08. The same holds for the light text colours used only on a
blue or red fill: `#d1d9e0` 1.31 and `#eaeef2` 1.07.

| pair | ratio | |
|---|---|---|
| `#116329` on `#dafbe1` (current inserted) | 6.64 | pass |
| `#82071e` on `#ffebe9` (current deleted) | 9.16 | pass |
| `#953800` on `#ffd8b5` (current changed) | 5.53 | pass |
| `#d1d9e0` on `#0550ae` (current ignored) | 5.32 | pass |
| `#eaeef2` on `#0550ae` (ignored before 9.0.0) | 6.51 | pass |
| `#f6f8fa` on `#82071e` (invalid.illegal before 11.3.2) | 9.87 | pass |
| `#d1242f` on `#ffebe9` (current invalid.illegal) | 4.57 | pass (narrow) |
| `#f6f8fa` on `#cf222e` (current carriage return) | 5.03 | pass |
| `#22863a` on `#f0fff4` (old hljs addition) | 4.47 | **fail** |
| `#b31d28` on `#ffeef0` (old hljs deletion) | 6.00 | pass |

## hljs class → current GitHub hex → contrast on `#f5f5f7` → source

| hljs class | current GitHub hex | contrast on `#f5f5f7` | source / inferred |
|---|---|---|---|
| `hljs-keyword` | `#cf222e` | 4.91 | from source |
| `hljs-doctag` | `#cf222e` | 4.91 | from source |
| `hljs-type` | `#cf222e` | 4.91 | inferred |
| `hljs-comment .hljs-type` (JSDoc type) | default text (`#1d1d1f`) | 15.45 | from source |
| `hljs-template-tag`, `hljs-template-variable` | `#cf222e` | 4.91 | inferred |
| `hljs-string` | `#0a3069` | 11.76 | from source |
| `hljs-regexp` | `#0a3069` | 11.76 | from source |
| `hljs-meta .hljs-string` | `#0a3069` | 11.76 | inferred |
| `hljs-subst` | default text (`#1d1d1f`) | 15.45 | from source |
| `hljs-number` | `#0550ae` | 6.97 | from source |
| `hljs-literal` | `#0550ae` | 6.97 | from source |
| `hljs-literal .hljs-keyword` (JSON) | `#0550ae` | 6.97 | inferred |
| `hljs-attr` | `#0550ae` | 6.97 | from source |
| `hljs-attribute` | `#0550ae` | 6.97 | from source |
| `hljs-property` | `#0550ae` | 6.97 | from source |
| `hljs-operator` | `#0550ae` | 6.97 | from source |
| `hljs-symbol` | `#0550ae` | 6.97 | inferred |
| `hljs-meta` | `#0550ae` | 6.97 | from source (doctype); inferred elsewhere |
| `hljs-name` | `#0550ae` | 6.97 | from source |
| `hljs-selector-class` | `#0550ae` | 6.97 | from source |
| `hljs-selector-tag`, `-id`, `-attr`, `-pseudo` | `#0550ae` | 6.97 | inferred |
| `hljs-section` | `#0550ae` bold | 6.97 | from source |
| `hljs-title.function_` | `#6639ba` | 6.74 | from source |
| `hljs-title` | `#6639ba` | 6.74 | inferred |
| `hljs-built_in` | `#6639ba` | 6.74 | from source (Python); inferred elsewhere |
| `hljs-title.class_`, `.class_.inherited__` | `#953800` | 6.78 | from source |
| `hljs-variable` | `#953800` | 6.78 | inferred |
| `hljs-variable.language_` | default text (`#1d1d1f`) | 15.45 | from source (Python `self`) |
| `hljs-params` | default text (`#1d1d1f`) | 15.45 | from source |
| `hljs-punctuation` | default text (`#1d1d1f`) | 15.45 | from source |
| `hljs-tag` | default text (`#1d1d1f`) | 15.45 | from source |
| `hljs-comment` | `#59636e` | 5.61 | from source |
| `hljs-bullet` | `#3b2300` | 13.52 | from source (Markdown) |
| `hljs-addition` | `#116329` on `#dafbe1` | 6.78 (6.64 on its bg) | from source |
| `hljs-deletion` | `#82071e` on `#ffebe9` | 9.65 (9.16 on its bg) | from source |

## Sources

- primer/primitives 11.10.0:
  [`syntax.json5`](https://github.com/primer/primitives/blob/3f51f80ee9510974032917c9b8ac9586656c88bc/src/tokens/functional/color/syntax.json5),
  [built `light.css`](https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/themes/light.css),
  [CHANGELOG](https://github.com/primer/primitives/blob/3f51f80ee9510974032917c9b8ac9586656c88bc/CHANGELOG.md).
  Older builds:
  [4.6.9](https://unpkg.com/@primer/primitives@4.6.9/dist/scss/colors/_light.scss),
  [4.7.0](https://unpkg.com/@primer/primitives@4.7.0/dist/scss/colors/_light.scss),
  [7.17.1 scss](https://unpkg.com/@primer/primitives@7.17.1/dist/scss/colors/_light.scss),
  [7.17.1 css](https://unpkg.com/@primer/primitives@7.17.1/dist/css/functional/themes/light.css),
  [8.2.4](https://unpkg.com/@primer/primitives@8.2.4/dist/css/functional/themes/light.css),
  [9.0.0](https://unpkg.com/@primer/primitives@9.0.0/dist/css/functional/themes/light.css).
  PRs [#224](https://github.com/primer/primitives/pull/224),
  [#529](https://github.com/primer/primitives/pull/529),
  [#666](https://github.com/primer/primitives/pull/666),
  [#781](https://github.com/primer/primitives/pull/781),
  [#1016](https://github.com/primer/primitives/pull/1016),
  [#1281](https://github.com/primer/primitives/pull/1281),
  [#1352](https://github.com/primer/primitives/pull/1352). Commits
  [`05edec6`](https://github.com/primer/primitives/commit/05edec6425b470c1a4c2e10997cbe961463e3880),
  [`5c18c74`](https://github.com/primer/primitives/commit/5c18c74788d18619bc4b94558d532ec4df3288aa),
  [`8ba7d6b`](https://github.com/primer/primitives/commit/8ba7d6b7e6ef8eb72b5ac2b1eacbbcbf8d9a9a0f),
  [`c4e1275e`](https://github.com/primer/primitives/commit/c4e1275e794a92e7cef4f9faab1ce7d6f2898dc4),
  [`39862e9`](https://github.com/primer/primitives/commit/39862e9839f39810bea1a2f8fd148a5673f1c850),
  [`49baecd`](https://github.com/primer/primitives/commit/49baecd3c4c9d5f46d4856d9deee8125b81c5f6a),
  [`3dfc099`](https://github.com/primer/primitives/commit/3dfc0997d60cfec13a861b38cd1cfb06c0ebdf30).
- github.com, fetched 2026-10-23 02:47 UTC:
  [`light-3a3d2c708970e4e8.css`](https://github.githubassets.com/assets/light-3a3d2c708970e4e8.css)
  (token values),
  [`global-58d1122073b19732.css`](https://github.githubassets.com/assets/global-58d1122073b19732.css)
  (`.pl-*` rules),
  [`primer-38ae573fa780d76a.css`](https://github.githubassets.com/assets/primer-38ae573fa780d76a.css)
  (code block colours). Hashed asset names change on deploy. Rendered
  code was read from the `colorizedLines` payload of
  [ci.yml](https://github.com/primer/primitives/blob/main/.github/workflows/ci.yml),
  [package.json](https://github.com/primer/primitives/blob/main/package.json),
  [demo/index.html](https://github.com/highlightjs/highlight.js/blob/main/demo/index.html),
  [compile_keywords.js](https://github.com/highlightjs/highlight.js/blob/main/src/lib/compile_keywords.js),
  [flask-view.py](https://github.com/github-linguist/linguist/blob/main/samples/Python/flask-view.py)
  and
  [github.css](https://github.com/highlightjs/highlight.js/blob/main/src/styles/github.css).
- highlight.js:
  [`src/styles/github.css` @ 11.12.0](https://github.com/highlightjs/highlight.js/blob/11.12.0/src/styles/github.css),
  [`3e628edb`](https://github.com/highlightjs/highlight.js/commit/3e628edbe34d2ffb9166ff365f614f56621597be)
  / [#3191](https://github.com/highlightjs/highlight.js/pull/3191),
  [`github-adaptive.css`](https://github.com/highlightjs/highlight.js/blob/374acd29706df59af598eacdc8907fbc3befbb1c/src/styles/github-adaptive.css)
  / [#4340](https://github.com/highlightjs/highlight.js/pull/4340), JSON
  literal mode
  [`ed25668a`](https://github.com/highlightjs/highlight.js/commit/ed25668a3d728309f33b49d9c9c4c74dada5510c).
  Also the npm packages 11.9.0 and 11.12.0 (`styles/`, `lib/languages/`)
  and the viewer's `highlight.min.js` (11.11.1), run locally.
- primer/github-vscode-theme v6.3.5:
  [`src/theme.js`](https://github.com/primer/github-vscode-theme/blob/v6.3.5/src/theme.js#L332),
  [`src/colors.js`](https://github.com/primer/github-vscode-theme/blob/v6.3.5/src/colors.js),
  [`package.json`](https://github.com/primer/github-vscode-theme/blob/v6.3.5/package.json#L86).
- Shiki: [`tm-themes` 1.12.12 metadata](https://unpkg.com/tm-themes@1.12.12/index.js),
  [`github-light-default.json`](https://unpkg.com/tm-themes@1.12.12/themes/github-light-default.json),
  [`github-light.json`](https://unpkg.com/tm-themes@1.12.12/themes/github-light.json),
  [`@shikijs/themes` 4.5.0](https://unpkg.com/@shikijs/themes@4.5.0/package.json).
- 2017 scope-to-class map:
  [primer/github-syntax-light `lib/github-light.css`](https://github.com/primer/github-syntax-light/blob/828ccb30b5a3a09b9b27bf52acaa90ac653d0fad/lib/github-light.css)
  (archived).
- Linguist and grammars:
  [`grammars.yml`](https://github.com/github-linguist/linguist/blob/73ee9a3b277f398c37ca4ab0dea0193849de6460/grammars.yml),
  [NovaGrammars `json.yaml-tmLanguage`](https://github.com/Nixinova/NovaGrammars/blob/c6dfb955f070c5aaf3ca7f6ee8d0b1802c6aed95/grammars/json.yaml-tmLanguage#L61),
  [atom/language-yaml `yaml.cson`](https://github.com/atom/language-yaml/blob/b0f7f6598a5be8e07f05e124dabd7869749eccc4/grammars/yaml.cson#L51),
  [atom/language-html `html.cson`](https://github.com/atom/language-html/blob/ee750a014a003c3d6f10b91e3cd5f9bfa0f051e6/grammars/html.cson#L553).
- GitHub Docs:
  [creating-and-highlighting-code-blocks.md](https://github.com/github/docs/blob/5e4bf35023f07b0183bfa3da08e0582324af9440/content/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks.md).
- Prism: [`prismjs` 1.30.0 themes](https://unpkg.com/prismjs@1.30.0/themes/),
  [`prism-themes` 1.9.0 `prism-ghcolors.css`](https://unpkg.com/prism-themes@1.9.0/themes/prism-ghcolors.css).
- [WCAG 2.2 relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance).
