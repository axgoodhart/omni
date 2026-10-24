# Omnii design

Dark, quiet, typographic. A paper-coloured text on near-black, one mint accent, one amber warning. The page is a set of rows; the rows do the work, nothing decorates them.

## Tokens (`ui/app.css` `:root`)

| Role | Token | Value |
|---|---|---|
| Background | `--ink` | `#0a0b0f`, lifted in steps `--ink-2` … `--ink-5` |
| Text | `--paper` | `#f6f2ea`; dim `--paper-dim` `#9d978c`; dimmer `--slate` `#b6b9c4`, `--slate-dim` `#55586a` |
| Accent | `--brass` | `#7fc4a8` (soft `--brass-soft`, dim `--brass-dim`); the only "on" colour |
| Warning | `--clay` | `#e0a15c`; paused, problems, high priority bars |
| Lines | `--line` | `rgba(246,242,234,.08)`; strong `.2` |
| Display | `--display` | Warbler Variable: names of things, section titles |
| Body | `--body` | Warbler Variable |
| Labels and controls | `--mono` | Jost: labels, pills, numbers |

## Type scale

- Section title: display, 1.2rem, weight 500.
- Name of a thing (island, rhythm, priority): display, 1.05–1.25rem, weight 600.
- Row label and column head: mono, 0.78rem, uppercase, tracking 0.12em, `--paper-dim`.
- Control text: mono, 0.8rem, no transform.
- Facts and status: 0.9rem body or 0.78rem mono, dim.

## The row

Every setting is one row: label on the left in a fixed column, then its controls, then a dim status on the right. Rows are separated by a hairline (`--line`). A row is about 2.9rem tall. Several things of the same shape (priorities, rhythms, islands) share one set of column heads and read as a table.

Explanations never sit in the layout. Each section has one (i) at the right of its title; each row label carries a tooltip. Nothing else explains itself in prose.

## Controls

- **Pick one**: a pill group with every choice visible, the current one filled `--brass` with `--ink` text. Short, quiet, bordered once.
- **Pick one of three (priority)**: letters H M L in a row, the current one bright.
- **Pick a type**: a small two-column grid of words, the current one filled.
- **A number or length of time**: a thin slider; the value's word rides above the thumb ("15 min", "60%", "done").
- **Text**: a field styled as plain text where it is the name of the thing, so the name itself is editable; a bordered field elsewhere.
- **Actions on a row** (remove, strike): icon buttons that appear on hover or focus.

## Never

- Header bands, eyebrows, section numbers, nested rails or spines, cards inside cards.
- A separate "Name" field under a title that already shows the name.
- Grouping four lines under a thing when one row can hold them.
- Gradient text, decorative shadows, borders thicker than 1px.
- Vocabulary the user did not choose: priorities are High / Medium / Low; an island has a type, a priority and a progress number.

## Motion

One: the pencil, remove button and gutter icons fade in on hover (150ms). Sliders and pills change state instantly.
