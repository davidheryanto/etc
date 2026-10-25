# Diagrams

## Sequence

Each sign-in is kept in the user's own browser.

```mermaid
sequenceDiagram
  participant B as User's browser
  participant S as Session (server memory)
  S->>B: Adobe sign-in, encrypted
  B->>S: the encrypted Adobe sign-in, as the next session opens
  Note over S: Adobe skips its sign-in#59; M3's form comes already filled in
```

## Twice

```mermaid
flowchart LR
  A[Same] --> B[Source]
```

```mermaid
flowchart LR
  A[Same] --> B[Source]
```

## Broken

The `;` ends the note, and what follows is not a statement.

```mermaid
sequenceDiagram
  participant S as Session
  Note over S: Adobe skips its sign-in; M3's form comes already filled in
```

## Hostile

```mermaid
%%{init: {"themeCSS": ".node rect { mask-image: url(/beacon-init.png) }"}}%%
flowchart LR
  A[Directive] --> B[End]
```

```mermaid
---
config:
  themeCSS: ".node rect { mask-image: url(/beacon-frontmatter.png) }"
---
flowchart LR
  C[Front matter] --> D[End]
```

- A diagram in a list item:

  ```mermaid
  flowchart LR
    E[In a list] --> F[Item]
  ```

```js
const notADiagram = true;
```

## Far images

Images on another computer, which Mermaid would load while drawing.

```mermaid
flowchart LR
  A@{ img: "file://evilhost/share/x.png", label: "Far", pos: "t", w: 60, h: 60 }
```

```mermaid
flowchart LR
  A@{ img: "file:\x2f\x2fevilhost/share/x.png", label: "Escaped", pos: "t", w: 60, h: 60 }
```

```mermaid
sequenceDiagram
  participant A
  properties A: {"icon": "file://evilhost/x.png"}
  A->>A: hi
```

```mermaid
flowchart LR
  A@{ img: "//evilhost/share/x.png", label: "Scheme-relative", pos: "t", w: 60, h: 60 }
```

A share named in a label is only text, and the diagram is drawn.

```mermaid
flowchart LR
  A["\\fileserver\data"] --> B[Mentioned]
```
