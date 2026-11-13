# Omnii design

Dark, quiet, typographic. Serif headings name things; Jost labels and controls make their state easy to read. The existing panes retain the near-black, paper and mint language below. Notifications has the scoped black, green, teal and blue component language documented at the end of this file.

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

## Notifications

The Notifications surface is an Operate page within Config. Its implementation is `ui/panes/notifications.js`; its component styles and tunable design tokens are in `ui/notifications.css`, scoped under `.notifications`. Other Config sections and panes keep the preceding rules. The notification controls deliberately use lit edges, functional glows and 1.5px borders; these are scoped exceptions to the incumbent rules above.

### Colour and effects

| Role | Scoped token | Value |
|---|---|---|
| Page / tracks / resting fields | `--ground`, `--surface`, `--raised` | `#000`, `#0c0e0e`, `#202524` |
| Row hairline / control edge | `--hair`, `--line` | `#262b2a`, `#3a403f` |
| Main / supporting / quiet text | `--text`, `--text-2`, `--dim` | `#f2f4f3`, `#c9cecc`, `#747c7a` |
| Included or on / interior | `--go`, `--go-deep` | `#0b842c`, `#082a15` |
| Resting glyph / lit edge / resting green edge | `--leaf`, `--signal`, `--signal-dim` | `#22b04d`, `#3cf07c`, `#1c5e33` |
| Numeric value | `--value` | `#7fd6cc` |
| Secondary chain / interior | `--tier2`, `--tier2-deep` | `#3d8bff`, `#0b1c38` |
| Remove text / fill | `--stop`, `--stop-fill` | `#ff5d78`, `#3d0d17` |
| Keyboard focus | `--ring` | `0 0 0 2px #000, 0 0 0 4px #9fe9ff` |

Green means on or included, teal marks values, blue identifies the secondary chain, and red only removes. Filled glyphs, LEDs, words and priority tile size also communicate state. Green and blue controls use their respective `--glow` / `--glow-2`; focus rings take precedence over a lit glow. Pressed buttons dim to 75% brightness.

### Typography and geometry

`--heading: var(--display)` preserves `"Warbler Variable", Georgia, serif` for the page title, section title and Available Hours title. `--control: "Jost", system-ui, sans-serif` covers all other words, numbers and labels. There is no Josefin Sans or baseline nudge. SF Symbols use the scoped `--symbols` stack with SF Pro and Symbols Nerd Font fallbacks.

| Element | Type / size |
|---|---|
| Page title | Serif, weight 600, `clamp(36px, 5vw, 64px)`, line-height 1 |
| Section / Available Hours title | Serif, weight 600, 40px / 32px |
| Sentence / channel / stepper | Jost 22px |
| Area field / menu option | Jost 21px / 19px |
| Mode / pager and add reminder / caption | Jost 28px / 24px / 18px |
| Resting numeric readout | Jost 46px; bold number and regular unit |
| Chain labels | Jost 14px, weight 600, uppercase, `.14em` tracking |

Inline controls are 44px tall with 12px corners; fields and menus have 4px corners. Large and small switches are 168×52px and 116×30px. Priority buttons retain a 56×56px hit box; their face is 52px when included and 36px when excluded. The area field and menu are 250px wide; icon tiles are 64px square.

The page is at most 1440px wide with `56px clamp(16px, 2.8vw, 64px) 120px` padding. Available Hours and reminder rows wrap instead of squeezing their controls. Below 768px, page padding starts at 32px, titles and advanced blocks use full rows, and priority tabs sit across the page. Touch devices show editable controls continuously.

### Behaviour and motion

The Notifications master switch controls notification delivery while the scan loop continues. Its off state dims the body and makes it inert. Available Hours shows the complement of stored quiet hours, with Sunday-first available days and a READY switch. The two native range inputs move in 30-minute steps and retain at least an hour between endpoints; the caption states the complete schedule. READY off permits delivery at any hour. An empty available-day set keeps delivery quiet every day.

Simple mode shows the High rule's repeats and snooze. Changing either writes the same value to every included priority; at least one priority and one channel remain selected. Reminder days and area apply across the reminder rules. Advanced mode edits the selected priority's primary and secondary chains separately. A secondary has its own wait, channels, repeats and snooze; setting its repeat count to zero removes it. Mode choice persists in `omnii.notifications.mode` and never changes rule data. Existing durations outside the new stepper range stay visible until deliberately edited.

Repeats run from 1–9 by 1. Snooze runs from 5–120 minutes by 5; the wait before a secondary runs from 5–240 minutes by 5. These limits live in the `stepper()` calls in `ui/panes/notifications.js`. Settings writes retain the existing change log and Undo interaction. The single reminder's add-reminder, add-priority and archive affordances explain their current limits with a toast.

Each `.mx` holds a resting readout and editable controls in the same reserved box. Pointer hover or keyboard focus reveals `.m-in` controls while `.m-out` readouts recede; the surrounding row does not reflow. Readouts are decorative and hidden from assistive technology. Advanced numeric values remain visible while only their skins and buttons open. On devices without hover, controls stay open; reduced motion uses opacity alone. Adding `.always` to the Notifications root exposes all controls without a user-facing toggle.

The morph is the main motion. Its tunable variables are at the top of `ui/notifications.css`: `--bloom-t: .55s` for scale/filter, `--fade-t: .2s` for opacity, `--hold: .6s` before closing, `--step-d: .04s` between staggered parts, and `--bloom: cubic-bezier(.3, 1.5, .55, 1)` for the opening curve. Switches and values change immediately; small hover effects use 150ms.
