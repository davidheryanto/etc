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
