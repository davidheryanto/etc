# Details

## Before

Intro.

<details>
<summary>Large `query` (read-only)</summary>

```sql
SELECT 1
```

</details>

<details open><summary>Already open</summary>

- a
- b

</details>

<details>
<summary>Log</summary>

first log

</details>

<details>
<summary>Log</summary>

second log

</details>

<details><summary>Fence quoting the closer</summary>

```html
</details>
```

</details>

Not a toggle: <details>inline</details>

<details class="x">
<summary>Attribute</summary>

kept as text
</details>

<summary>Stray summary</summary>

## After

Tail.

<details><summary>Nested outer</summary>

<details><summary>Nested inner</summary>

inner text

</details>

- <details><summary>Listed inner</summary>

  listed text

  </details>

## Inside a toggle

hidden heading

</details>

Filler one.

Filler two.

Filler three.

Filler four.

Filler five.

Filler six.

Filler seven.

Filler eight.

Filler nine.

Filler ten.

Filler eleven.

Filler twelve.

Filler thirteen.

Filler fourteen.

Filler fifteen.

Filler sixteen.

<details>
<summary>Never closed</summary>

end
