# Handoff Spec: Notifications page and the Config component system

Source of truth: the Design canvas "Config Component System" (https://claude.ai/code/artifact/63ad763c-a082-4d59-b4f9-3e6bd78c98cd), five artboards: **Foundations**, **Selection controls**, **Values, actions, structure**, **Reminder row · two faces**, **Notifications · working page**. Every value below is copied from those artboards' CSS. Where the artboards disagree with `DESIGN.md` or `ui/app.css`, this document says so and the artboards win.

Audience: a coding agent working in this repo. The UI is plain HTML + CSS + JS: `ui/index.html`, `ui/app.css`, `ui/app.js`, `ui/panes/settings.js` (the Config page). No framework, no build step.

---

## 0. Decisions needed before building

The design introduces things the data model and stylesheet do not have yet. A coding agent will otherwise guess, so decide these first. Each has a recommended default.

| # | Gap | Recommended default |
|---|-----|---------------------|
| D1 | **New visual language.** The artboards use a black ground, Jost + Josefin Sans, green `go`/`signal` accents. `ui/app.css` today uses `--ink #0a0b0f`, Warbler + Jost, mint `--brass`. `DESIGN.md` describes the old one. | Add the new tokens to `:root` in `ui/app.css` under new names (section 1). Apply them to the Notifications page first; leave other panes on the old tokens until each is redesigned. Update `DESIGN.md` when the page ships. |
| D2 | **"Notifications" master switch** has no key in `desk/loop.md`. `loop.paused` pauses the whole loop, which is a different thing. | New key `loop.notify: true\|false`. Off = Omnii still scans and writes to the desk, but sends nothing to desk or phone. |
| D3 | **Available Hours** is the inverse of `loop.quiet` (`from`/`to` as `HH:MM`). The design also adds **available days** and a **READY** switch. | Keep `loop.quiet` as storage; the UI shows its complement. Add `loop.quiet.days: [bool×7]` (Sun…Sat). READY off ⇒ `loop.quiet: null` (today's "Off"). |
| D4 | **Priority set** (simple mode: which of H/M/L get reminders at all) has no key. | New key `loop.notify_levels: [high, medium, low]` subset, never empty. |
| D5 | **Days** on a reminder row has no key. | New key `loop.days: [bool×7]`. Applies to all reminders in simple mode; per level in advanced if ever needed (not in this design). |
| D6 | **Area select** ("all areas", then one per area) has no backing list. | Options = `all areas` + each island kind from `desk/islands/*.md`. New key `loop.area: "all" \| <kind>`. |
| D7 | **Stepper ranges vs. existing data.** Design: repeats 1–9 step 1; snooze 5–120 min step 5; secondary "after" 5–240 min step 5. Today `first_times`/`second_times` are 1–3 and `first_after`/`second_after` are duration strings (`15m`, `1h`, `1d`, `1w`) from `PICKS`. | Map: simple `times` → `loop.levels.*.first_times` (widen to 1–9); simple `snooze` → `first_after` (store as `<n>m`). Advanced primary = `first_*`; secondary `after` = `second_after`, secondary `times` = `second_times`, secondary `snooze` = **new** `second_snooze`. Existing `stop` / `stop_text` are not in this design; keep them in the file, drop them from this page. |
| D8 | **"1 of 1" pager and "+ add new"** imply several reminders. Today there is exactly one rule set per priority. | Ship with one reminder; render the pager as `1 of 1` and make "+ add new" a no-op that toasts "One reminder for now." Do not build multi-reminder storage in this pass. |
| D9 | **SF Symbols** render only on macOS (SF Pro). `ui/app.css` already uses `SF Pro Display` and a Nerd Font fallback. | Keep SF Symbols (this app runs on Alex's Mac). Add `"Symbols Nerd Font"` as the second family in `--symbols` so a non-Mac browser shows *a* glyph, not a box. |

---

## 1. Design tokens

Add to `:root` in `ui/app.css`. Names are the artboards' names. The right-hand column maps to the closest existing token so a later global migration is mechanical.

### Colour

| Token | Value | Usage (from Foundations) | Nearest existing |
|-------|-------|--------------------------|------------------|
| `--ground` | `#000000` | Page | `--ink-5` |
| `--surface` | `#0c0e0e` | Tracks, menus, switch at rest | `--ink` |
| `--raised` | `#202524` | Fields at rest, left-out priority tiles, menu option hover | `--ink-4` |
| `--hair` | `#262b2a` | Hairline between rows (opaque, not rgba) | `--line` |
| `--line` | `#3a403f` | Edges at rest, section-head rule | `--line-strong` |
| `--text` | `#f2f4f3` | Titles, the chosen word | `--paper` |
| `--text-2` | `#c9cecc` | Sentence words, labels | `--slate` |
| `--dim` | `#747c7a` | Unchosen, captions. 4.8:1 on ground | `--paper-dim` |
| `--go` | `#0b842c` | On / included fill. White on it 4.8:1 | `--grass` |
| `--go-deep` | `#082a15` | Inside a lit control | `--grass-dim` |
| `--leaf` | `#22b04d` | Glyphs at rest, lit icon tiles | — |
| `--signal` | `#3cf07c` | Lit edges, LEDs, glow | `--brass` |
| `--signal-dim` | `#1c5e33` | Resting edge of a field; switch-on border | `--brass-dim` |
| `--value` | `#7fd6cc` | Numbers and their units | — |
| `--tier2` | `#3d8bff` | The secondary chain | — |
| `--tier2-deep` | `#0b1c38` | Inside a lit secondary control | — |
| `--stop` | `#ff5d78` | Remove, and nothing else | `--sage` |
| `--stop-fill` | `#3d0d17` | Remove button fill | `--sage-dim` |

**Colour meaning (fixed):** green is on or included; teal is a number; blue is the secondary chain; red only removes. Never use `--stop` for warnings or emphasis.

Literal colours that appear in the artboards without a token (use as-is, or promote to tokens if you prefer):

| Where | Value |
|-------|-------|
| LED off | `#4a5150` |
| Switch thumb, off | `#5b6260` |
| Range track (unlit part) | `#c4c9c8` |
| Range fill when paused | `#4a5150` |
| Remove hover fill / text | `#5a1222` / `#ffc2cc` |
| Focus ring colour ("ice") | `#9fe9ff` (same hue family as existing `--focus #8fd6e8`) |
| White on `--go` | `#fff` |

### Effects

| Token | Value |
|-------|-------|
| `--glow` | `0 0 0 1px rgba(60,240,124,.28), 0 0 18px rgba(60,240,124,.35)` |
| `--glow-2` | `0 0 0 1px rgba(61,139,255,.3), 0 0 18px rgba(61,139,255,.4)` |
| glow, hover (stronger, green) | `0 0 0 1px rgba(60,240,124,.4), 0 0 26px rgba(60,240,124,.5)` |
| glow, hover (stronger, blue) | `0 0 0 1px rgba(61,139,255,.4), 0 0 26px rgba(61,139,255,.5)` |
| `--ring` (focus) | `0 0 0 2px #000, 0 0 0 4px #9fe9ff` — "2 ground + 2 ice" |
| Pressed | `filter: brightness(.75)` on `button:active:not(:disabled)` |
| Menu shadow | `0 12px 32px rgba(0,0,0,.6)` |

### Type

| Token | Value |
|-------|-------|
| `--display` | `"Jost", system-ui, sans-serif` — names, numbers, caps labels, tiles |
| `--voice` | `"Josefin Sans", system-ui, sans-serif` — sentences, control words |
| `--symbols` | `"SF Pro", "SF Pro Display", "SF Pro Text", -apple-system, system-ui` (see D9) |

Load: `https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&family=Josefin+Sans:wght@300;400;600&display=swap`. Note the existing `--mono` already points at Jost; `--display` in the new scheme is Jost too, so Jost is the only new weight set to load. Josefin Sans is new.

**Josefin Sans baseline nudge.** Josefin Sans sits high in its box. Every piece of `--voice` text that shares a line with other things gets `padding-top: .18em` (class `.vt`). Apply it to: sentence words, control words inside chips/steppers/selects/pills, the pager, `+ add new`, `&`, captions in `--voice`. Do not apply it to `--display` text.

### Motion tokens

| Token | Value | Meaning |
|-------|-------|---------|
| `--bloom` | `cubic-bezier(.3, 1.5, .55, 1)` | Overshooting ease for the open/close morph |
| `--bloom-t` | `.55s` | Scale + colour duration |
| `--fade-t` | `.2s` | Opacity duration, linear |
| `--hold` | `.6s` | How long a control stays open after pointer/focus leaves |
| `--step-d` | `.04s` | Stagger step between parts of one control |

### Radii and sizes

| Name | Value | Used by |
|------|-------|---------|
| Control radius | `12px` | Chips, steppers, priority tabs, add-pill, priority hit box |
| Tile radius | `10px` | Priority face (52), icon tile (64), swatches |
| Left-out tile radius | `7px` | Priority face when excluded (36) |
| Field radius | `4px` | Area select, its menu, Remove tag |
| Menu option radius | `3px` | Inside the area menu |
| Mode option radius | `6px` | Mode toggle words (only visible as focus-ring shape) |
| Full | `999px` | Switch, day track, range track |
| Control height | `44px` | Every inline control: chip, stepper, select, track, add-pill, link rows |
| Switch large / small | `168×52` / `116×30` | Page master / schedule READY |
| Priority tile | `52` face in `56` hit box; `36` when left out | Never shrink the 56 hit box |
| Icon tile | `64×64` | Archive, snooze glyph |
| Glyph at rest | `46×46` box, glyph `38px` | Readout glyphs |
| Border widths | `1.5px` controls · `1px` fields, hairlines, tier-bar edges, page rule | Nothing thicker |
| Gap between sentence words | `16px` (the `.sent` row uses `14px 12px` row/column gap) | Advanced sentences |

---

## 2. Type scale

| Role | Family / weight / size | Extra | Colour |
|------|------------------------|-------|--------|
| Page title | `--display` 700 · `clamp(36px, 5vw, 64px)` (64 at full width) | `line-height 1`, `letter-spacing .02em`, uppercase | `--text`; `--dim` when the page is off |
| Section title | `--display` 600 · 40 | `line-height 1.1` | `--text` |
| Row title ("Available Hours") | `--display` 600 · 32 | `line-height 1.1` | `--text` |
| Sentence / control words | `--voice` 400 · 22 (chips, steppers, sentences) · 21 (select, add-pill) · 24 (pager, `+ add new`) · 28 (mode toggle) | `.vt` nudge | `--text-2`; chosen word `--text` |
| Readout (rest face) | `--display` 700 number + 400 unit · 46 | `line-height 1`, nowrap; unit `margin-left 12px` | `--value` |
| Caps label / tag | `--display` 600 · 11–15, `letter-spacing .14em`, uppercase | Tier foot 14, Add-secondary 15, Remove 11, range fill 12, caption `.cap` 12 at weight 500 | `--text-2`; `.cap` is `--dim` |
| Switch word | `--display` 500 · 22, `letter-spacing .06em` (small: 600 · 11, `.16em`) | | `--dim` off, `--text` on |
| Priority letter | `--display` 700 · 26 (left out: 600 · 18); tabs 600 · 22 | | `#fff` on `--go`; `--value` on `--raised` when left out |
| Day letter | `--display` 500 · 14 at rest; 600 · 16 in the open track | | `--dim`/`#fff` at rest; `--text-2`/`#fff` in track |
| Hours caption | `--voice` 400 · 18 | `.vt` | `--dim` |
| Big ampersand (between chains) | `--voice` 400 · 96 | `line-height 1`, `padding-top 16px` | `--text-2` |
| Pair ampersand (between chips) | `--voice` 400 · 30 | `.vt` | `--text-2` |

---

## 3. Primitives

### 3.1 SF Symbols (`.sf`)

Inline glyph spans, `aria-hidden="true"` always; the owning button carries the `aria-label`. `font-family: var(--symbols); font-weight: 500; line-height: 1; text-align: center; display: inline-block; flex: none`.

Outline is the **off** face, filled is the **on** face. Codepoints as used in the artboards:

| Meaning | Outline | Filled | Where |
|---------|---------|--------|-------|
| Desk (lamp) | U+1013B6 | U+10131E | Channel chip, readout glyph |
| Phone (message bubble) | U+101498 | U+101499 | Channel chip, readout glyph |
| Snooze (clock) | U+1001BD | U+1001BE | Snooze tile |
| Archive (box) | U+10022D | U+10022E | Archive tile |
| Plus | U+10017C | — | Stepper "more", add-pill, Add secondary |
| Minus | U+10017D | — | Stepper "fewer" |
| Chevron down | U+100188 | — | Area select |
| X mark | U+100184 | — | Remove tag |

Sizes: chip glyph `21px` in a `26px`-wide box; stepper buttons `15px` weight 700; tile `32px`; readout glyph `38px`; add-pill plus `22px` at rest, `15px` inside the pill; select chevron `16px`; Remove X `10px` weight 800; Add-secondary plus `13px` weight 700.

### 3.2 LED (`.led`)

`7×7`, `border-radius 50%`, off `#4a5150`. On: `background: var(--signal); box-shadow: 0 0 6px var(--signal)`. Secondary chain: same with `--tier2`. Inside a chip or tab it sits top-right: `align-self: flex-start; margin-top: 8px` (chip) / `9px` (tab), `margin-left: 2px`.

### 3.3 Button reset

`button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit }`. Focus: `button:focus-visible { outline: none; box-shadow: var(--ring) }`. Press: `button:active:not(:disabled) { filter: brightness(.75) }`. **Focus ring always beats a lit glow**: where a lit control has its own `box-shadow`, add an explicit `:focus-visible` rule that sets `box-shadow: var(--ring)` on the same element (or, for the priority tile and add-pill, on the inner face).

---

## 4. The two-faces morph (`.mx`, `.m-in`, `.m-out`)

Every editable setting has two faces stacked in **one fixed-size box**: the **rest** face (the answer as a word or number) and the **open** face (its controls). The control never changes size, so nothing around it reflows.

**Markup pattern**

```html
<span class="reach-ctl mx">            <!-- the fixed box; hover/focus anywhere opens it -->
  <span class="reach-rest m-out" aria-hidden="true">…rest face…</span>
  <span class="chans">…open face parts, each tagged m-in (optionally s1…s8)…</span>
</span>
```

- `.m-out` parts exist only at rest. `.m-in` parts exist only when open.
- Rest parts are `aria-hidden="true"` and `pointer-events: none`; they are decoration. The real controls are always in the DOM, so Tab reaches them whether or not the row looks open.
- Each part keeps its **open-size** box so the control never changes size. Rest faces are positioned `absolute; inset: 0` over the open face, or vice versa, with `transform-origin: left center`.

**CSS (copy exactly)**

```css
.m-in,.m-out{
  transition-property:transform,filter,opacity;
  transition-duration:var(--bloom-t),var(--bloom-t),var(--fade-t);
  transition-timing-function:var(--bloom),var(--bloom),linear;
  transition-delay:calc(var(--hold) + var(--d,0s));
  user-select:none;-webkit-user-select:none}
.m-out{transform:scale(1);opacity:1;filter:brightness(1) hue-rotate(0deg);pointer-events:none}
.m-in{transform:scale(.1);opacity:0;filter:brightness(0) hue-rotate(720deg);pointer-events:none}
.mx:hover .m-in,.mx:focus-within .m-in,.always .m-in{transform:scale(1);opacity:1;filter:brightness(1) hue-rotate(0deg);pointer-events:auto}
.mx:hover .m-out,.mx:focus-within .m-out,.always .m-out{transform:scale(.1);opacity:0;filter:brightness(0) hue-rotate(720deg)}
.mx:hover .m-in,.mx:hover .m-out,.mx:focus-within .m-in,.mx:focus-within .m-out{transition-delay:var(--d,0s)}
.s1{--d:var(--step-d)} .s2{--d:calc(var(--step-d)*2)} … .s8{--d:calc(var(--step-d)*8)}
.track .day-slot:nth-child(3){--d:var(--step-d)} … :nth-child(8){--d:calc(var(--step-d)*6)}
@media (hover: none){
  .m-in{transform:scale(1);opacity:1;filter:brightness(1) hue-rotate(0deg);pointer-events:auto}
  .m-out{transform:scale(.1);opacity:0;filter:brightness(0) hue-rotate(720deg)}
}
@media (prefers-reduced-motion: reduce){ .m-in,.m-out{transition-property:opacity} }
```

**Behaviour rules**

1. **Opening**: pointer over, or keyboard focus inside, any part of the `.mx` box opens it at once (delay `var(--d)` only, i.e. the stagger).
2. **Closing**: after pointer and focus both leave, the control holds open for `--hold` (0.6 s), then closes. Implemented purely by the `transition-delay` difference above; no JS timers.
3. **Stagger**: parts tagged `.s1…s8` open `0.04 s × n` after the first. Day buttons in a track stagger by position (3rd child onward). Closing uses the same stagger.
4. **Touch / no hover** (`@media (hover: none)`): rows are **always open**. Nothing may be reachable only by pointing.
5. **Reduced motion**: only opacity animates; no scale, no hue rotation.
6. **`.always`** on the page root forces every control open; used for debugging and screenshots (the artboard exposes it as the `alwaysOpen` prop). Ship it as a class, not a UI toggle.
7. Parts that carry a lit edge (`.chan-skin`, `.step-skin`, `.track-skin`, `.tile-skin`) are **separate absolutely-positioned layers** at `z-index: -1` inside an `isolation: isolate` parent, so the glow can bloom in while the text stays put. In advanced mode the stepper's value is **not** morphed (it is always readable); only its skin and buttons bloom.

**Why**: Alex reads fast and will not hunt for controls. The rest face reads like a sentence; the controls appear where the words were, so nothing has to be learned twice.

---

## 5. Components

Each component: anatomy → dimensions → states → ARIA → rules. "Lit" means on/included/open.

### 5.1 Switch (`.switch`, `.switch.sm`)

Pill with a word and a thumb; the thumb sits **right when on**, the word sits opposite the thumb.

| | Large | Small |
|---|---|---|
| Box | `168×52`, `padding 0 6px 0 24px` (off: `0 24px 0 6px`, `flex-direction: row-reverse`) | `116×30`, `padding 0 4px 0 14px` (off mirrored) |
| Thumb | `38` circle | `22` circle |
| Word | Jost 500 · 22 · `.06em` | Jost 600 · 11 · `.16em` |
| Border / fill, off | `1.5px var(--line)` / `--surface`; word `--dim`; thumb `#5b6260` | same |
| On | border `--signal-dim`, fill `--go-deep`, word `--text`; thumb `--signal` with `inset 0 0 0 4px var(--go-deep), 0 0 0 1.5px var(--signal), 0 0 14px rgba(60,240,124,.55)` | thumb inset `3px`, outer glow `10px` at `.5` |
| Hover | border `--dim`; on + hover → border `--signal` | same |
| Focus | `--ring` | same |
| Disabled | `opacity .4; cursor: default` | same |

ARIA: `<button type="button" role="switch" aria-checked="true|false" aria-label="Notifications">`. The visible word (`ON`/`OFF`/`READY`) is not the accessible name. Space/Enter toggles (native button).

### 5.2 Mode toggle (`.mode`)

Two words and a 1 px hairline; the chosen word is bright, nothing else marks it.

- Words: `--voice` 28, `padding 12px 16px 7px`, `border-radius 6px`. Unchosen `--dim`, hover `--text-2`, chosen `--text`.
- Rule: `1×40`, `--line`.
- ARIA: wrapper `role="group" aria-label="Detail"`; each word `<button aria-pressed>`. Arrow keys are not required (two buttons, Tab is fine).

### 5.3 Priority set (`.prio`) — simple mode, pick some

- Hit box `56×56`, radius 12, `display: inline-grid; place-items: center`. Face `.prio-face` `52×52` radius 10, `--go` fill, `#fff` Jost 700 · 26.
- **Left out** (`.prio.off`): face shrinks to `36×36` radius 7, fill `--raised`, letter `--value` Jost 600 · 18. **The 56 hit box does not shrink.** Transition `box-shadow .15s` only; the size change is instant.
- Hover: face `box-shadow: 0 0 0 2px var(--signal), var(--glow)`. Focus: `--ring` **on the face**, none on the hit box. Pressed: `brightness(.75)`.
- Layout: three in a row, `gap 4px`; the add control sits **below**, right-aligned (`.addp.end`, `padding-right 15px` in the artboard; in the page the `.end` class right-aligns it).
- ARIA: group `role="group" aria-label="Priorities"`; each `<button aria-pressed aria-label="High|Medium|Low">`.
- Rule: **at least one stays included.** Clicking the last lit one does nothing (no toast in the artboard; a toast is acceptable, see `reach` in `settings.js` for the house style).

### 5.4 Add priority (`.addp`)

A dim plus at rest; a worded pill on hover/focus. It is a `.mx` itself.

- Box: `height 44`, `width 100%` of the priority column, `min-width 56`. Button `.addp-btn` `56×44` radius 12, colour `--dim`.
- Rest: plus glyph `22px` (`.m-out`).
- Open: `.addp-pill` absolutely at `left 0; top 0`, `z-index 4`, `height 44`, `padding 0 14px 0 18px`, `gap 10`, `1.5px` border `--signal` (artboard shows `--signal-dim` at rest → `--signal` when lit), `#000` fill, `--text` `--voice` 21, text "new priority level" + plus `15px`. In the tabs column the shorter "new priority lvl" is used so it fits 104 px.
- Focus: `--ring` on the pill, none on the button.
- ARIA: `aria-label="New priority level"`.
- Behaviour: **not wired in this design** (D4/D8 cover only H/M/L). Render it, make it a no-op with a toast "Three levels for now." Keep it in the DOM so the layout matches.

### 5.5 Priority tabs (`.ptab`) — advanced mode, pick one

Which priority's chain you are editing.

- `104×44`, `padding 0 20px 0 14px`, radius 12, `1.5px --line`, `--text-2` Jost 600 · 22, `justify-content: space-between`, LED top-left (`margin-top 9px`).
- Hover: border `--dim`, text `--text`. **On**: border `--signal`, fill `--go-deep`, text `#fff`, `--glow`, LED lit. Focus: `--ring`.
- Stacked vertically, `gap 12`, then the add control (`.addp`, centred) beneath.
- ARIA: group `role="group" aria-label="Priority"`; each `<button aria-pressed aria-label="High|Medium|Low">`.
- The artboard uses the experimental `corner-shape: scoop|bevel` on these; **do not depend on it**. Plain radius 12 is the spec.

### 5.6 Days — rest letters (`.days`) and open track (`.track`)

Week starts Sunday: `S M T W Th F S`. "Th" keeps Tuesday and Thursday apart.

**Rest** (`.days`, `.m-out`, `aria-hidden`): letters Jost 500 · 14, `gap 3`, each `min-width 22 × 26`, `padding 0 4px`, radius 6; on = `--go` fill + `#fff`, off = `--dim`.

**Open** (`.track`): pill `height 44`, `padding 3px` (page uses `4.5px` with a separate `.track-skin` layer), `1.5px --line` border, `--surface` fill, radius full. Each day `<button class="d">` `height 35`, `min-width 32`, `padding 0 7px`, Jost 600 · 16, `--text-2`, radius full.

- Day hover: `--raised` fill, `#fff`.
- Day on: `--go` fill, `#fff`, **radius 0**, so adjacent chosen days join into one run. First of a run gets `.l` (left radius full), last `.r` (right radius full), any that follows another gets `.j` (`inset 1px 0 0 rgba(0,0,0,.55)` seam). A lone day is `.l.r`. Compute the classes from neighbours (see `dayRow()` in the Notifications artboard script).
- Track hover: border `--signal-dim` + `--glow`. In the page the open track always shows the lit skin.
- Day focus: `position: relative; z-index: 1; border-radius: 999px; box-shadow: var(--ring)` (the ring is round even mid-run).
- ARIA: `role="group" aria-label="Days"` (or "Available days"); each `<button aria-pressed aria-label="Monday">`.
- Rule: a day set **may be empty** for Available Hours (caption then says Omnii stays quiet every day). For the reminder row, treat empty as "never", and let it be.

### 5.7 Area select (`.sel`) and menu (`.menu`)

Pick one from a list. A quiet field at rest; lit, it shows a marker bar and chevron.

- `250×44`, `padding 0 12px`, `gap 12`, radius **4**, `1px` border `--signal-dim`, fill `--raised`, text `--text-2` `--voice` 21 centred (`flex: 1; text-align: center`).
- Marker `.sel-mark` `7×26` `--signal`, opacity 0 at rest; chevron `16px` `--signal`, opacity 0 at rest.
- Hover / focus / open / in an open `.mx`: fill `#000`, border `--signal`, text `--signal`, marker and chevron opacity 1. In the page these are the `.m-in.s1` (marker) and `.m-in.s2` (chevron). Transition on the field: `background-color, border-color, color .3s`, delayed by `--hold` when closing, `0s` when opening.
- Focus: `--ring`.
- Menu: `position: absolute; top: 52px; left: 0; z-index: 5`, `width 250`, `padding 4`, `gap 2`, radius 4, `1px --signal-dim`, fill `--surface`, shadow `0 12px 32px rgba(0,0,0,.6)`. Option `height 40`, `padding .18em 12px 0`, radius 3, `--voice` 19, `--text-2`; hover `--raised` + `--text`; selected `--signal` text.
- ARIA: button `aria-haspopup="listbox" aria-expanded aria-label="Area"`; menu `role="listbox" aria-label="Areas"`; options `<button role="option" aria-selected>`.
- Behaviour: click toggles; choosing an option sets the value and closes; pointer leaving the whole row closes it (`onMouseLeave` on `.simple-row`); Escape closes and returns focus to the button (add this; the artboard omits it). Only one menu open at a time.

### 5.8 Channel chip (`.chan`, `.chan.t2`)

Pick some, at least one. A lit LED means the message goes there.

- `height 44`, `padding 0 12px 0 14px`, `gap 10`, radius 12, `1.5px --line`, `--text-2` `--voice` 22, nowrap. Glyph `21px` in a `26px` box; word with `.vt`; LED top-right.
- Hover: border `--dim`, text `--text`.
- **On**: border `--signal`, fill `--go-deep`, text `--text`, glyph **filled** and `--value`, LED lit, `--glow`. On + hover: the stronger 26 px glow.
- **Secondary** (`.t2.on`): border/LED `--tier2`, fill `--tier2-deep`, `--glow-2`; hover the stronger blue glow.
- Pressed: `brightness(.75)`. Focus: `--ring`.
- Pair: `desk & phone` with the `&` (`--voice` 30, `.vt`) between, `gap 14`.
- Morph detail (page): the **border/fill/glow live on `.chan-skin`** (`.m-in`), so at rest a lit chip reads as its word + filled glyph + LED with no box; an **unlit** chip and the `&` are `.m-in` entirely (they vanish at rest). So at rest "desk" alone shows if only desk is on; "desk & phone" shows if both are on.
- ARIA: `<button aria-pressed>`; the word is the accessible name ("desk", "phone"); glyph and LED `aria-hidden`.
- Rule: **the last lit channel stays lit** — clicking it does nothing. (`settings.js` `reach()` already enforces this with a toast; reuse the toast text: "Questions need somewhere to go: keep the lamp or the bubble lit.")
- Data: desk+phone → `both`, desk → `desk`, phone → `phone` (existing `via` vocabulary).

### 5.9 Stepper (`.step`, `.step.t2`)

A number and its unit, then fewer and more. Both buttons share one tint; the tint follows the chain.

- `height 44`, radius 12, `1.5px` border, `#000` fill, `overflow: hidden` (page: `padding 1.5px` with a `.step-skin` layer; last button gets `border-radius: 0 10.5px 10.5px 0`).
- Value `.step-val`: `<output>`, `min-width 108`, `padding .18em 16px 0`, `gap 8`, `--voice` 22; number `<b>` weight 400 `--value`, unit `--text-2`.
- Buttons `.step-btn`: `38` wide, full height, `border-left 1px --line`, fill `--go-deep`, glyph `--text` `15px` 700. Hover: `--go` + `#fff`. Pressed: `--go` + `brightness(.75)`. Focus: **inset** ring `inset 0 0 0 2px #9fe9ff` (the outer ring would be clipped). Disabled: fill `--surface`, glyph `--line`, `cursor: default`.
- Whole stepper hover / focus-within: border `--signal` + `--glow`.
- Secondary (`.t2`): buttons `--tier2-deep`, hover `--tier2`; border `--tier2`, `--glow-2`.
- Units pluralise: `1 time` / `2 times`; `min` is invariant. Secondary "after" also `min`.
- Ranges (D7): repeats 1–9 by 1; snooze 5–120 min by 5; wait-before-secondary 5–240 min by 5. At the floor/ceiling the relevant button is `disabled`.
- Morph (page): the value is **not** morphed in advanced mode (always readable, it is part of the sentence). Skin `.m-in`, fewer `.m-in.s1`, more `.m-in.s2`. In simple mode the whole stepper is `.m-in` (s3–s6) and a readout is the rest face.
- ARIA: `role="group" aria-label="Repeats|Snooze|Wait before secondary"`; buttons `aria-label="Fewer|More"` / `"Shorter|Longer"`; the `<output>` announces the value. Add `aria-live="polite"` on the output.
- Keyboard: Tab to a button, Space/Enter. Arrow keys on the group are optional.

### 5.10 Readout (`.glyph` + `.readout`)

The stepper's rest face. Glyph in `--leaf`, number bold in `--value`, unit regular.

- Glyph box `46×46`, glyph `38px`, `--leaf`, **filled** form. Two glyphs (desk and phone) sit `gap 6`.
- Readout Jost 46, `line-height 1`, nowrap; `<b>` 700. Forms: `2x` (repeats), `60 min.` (snooze, unit `margin-left 12px`).
- Gap glyph→number `18px`.
- `aria-hidden="true"` as a whole; the live controls carry the meaning.

### 5.11 Icon tile (`.tile`)

Outline glyph at rest; a lit tile with the filled glyph on hover, focus, or while its setting is open. **Archive is the only action here**; the snooze tile is a non-interactive indicator (`<span aria-hidden>`).

- `64×64`, radius 10, `1px` transparent border, glyph `32px` `--leaf`. `transition: background .15s, color .15s`.
- Lit (hover / `.lit` / focus / press): fill `--leaf`, border `--signal`, glyph `#000` **filled** form. Pressed adds `brightness(.75)`. Focus: `--ring`.
- The hover artboard also shows a variant with a `radial-gradient(circle at bottom center, var(--leaf), transparent)` fill and a white glyph — treat it as an exploration, **not** the spec; ship the flat `--leaf` fill.
- Page morph: `.tile-skin` (`.m-in`), `.tile-in` filled glyph (`.m-in.s1`, `#000`), `.tile-out` outline glyph (`.m-out`, `--leaf`, absolutely centred).
- ARIA: `<button aria-label="Archive this reminder">`.
- Behaviour: archive is **not** wired in this design (one reminder, D8). Render it; on click toast "Nothing to archive yet."

### 5.12 Hours range (`.range`)

Two thumbs on a day. The lit span is when Omnii may reach you; the grey ends are Do Not Disturb. A caption says it in words.

- Box `height 44`, `width 100%`. Rail `.range-rail` absolute `left 7; right 7; top 15; height 14`. Track full-radius `#c4c9c8`. Fill `.range-fill` absolute within the rail, `--go`, labels inside at both ends (`padding 0 12px`, Jost 600 · 12 `#fff`, `justify-content: space-between`, `overflow: hidden`, nowrap).
- Thumbs `14×34`, radius 3, `top 5`, fill `--go-deep`, `1.5px --signal`, `cursor: ew-resize`. Hover `--glow`; active `brightness(.75)`; focus `--ring`.
- Paused (`.range.off`): fill `#4a5150`; thumbs border `--dim`, fill `--raised`.
- Implementation (from the page): **two stacked native `<input type="range">`** `min 0 max 24 step 0.5`, `pointer-events: none` on the input and `auto` on the thumb pseudo-elements, transparent tracks, custom thumb via `::-webkit-slider-thumb` / `::-moz-range-thumb`. Fill `left = start/24·100%`, `width = (end−start)/24·100%`. `settings.js` already does this for `.qh` (quiet hours); this replaces that control.
- Clamp: `start ≤ end − 1`, `end ≥ start + 1` (hours). **Arrow keys move 30 min** (the native step).
- Labels: `clock(h)` → `9 am`, `9:30 pm`, `12 am`.
- Caption (`.hours-caption`, `--voice` 18 `--dim`, `.vt`), exact strings:
  - paused: `Paused. Omnii can reach you at any hour.`
  - no days: `No days chosen, so Omnii stays quiet every day.`
  - else: `Omnii reaches you {start} to {end} {when}, and stays quiet the rest of the time.` where `{when}` = `every day` (7) · `on weekdays` (Mon–Fri only) · `at weekends` (Sat+Sun only) · `on Mon, Wed, Fri` (first three letters, comma-joined).
- ARIA: inputs `aria-label="Available from" | "Available until"`, `aria-valuetext` = the clock label. Caption may carry `aria-live="polite"`.
- Data (D3): store as `loop.quiet { from: end, to: start }` in `HH:MM`, i.e. quiet is the complement of available.

### 5.13 Chain rule (`.tier`), Remove (`.tag-x`), Add secondary (`.link-add`)

Closes a block of the advanced sentence and names it. Remove sits on the secondary only.

- `.tier`: column, `gap 10`, `width 100%`, `margin-top 32` in the page. Bar `height 4`, radius 2, `--signal` with `0 0 14px rgba(60,240,124,.45)`; `.t2` → `--tier2` with the blue 14 px glow.
- Foot `.tier-foot`: `min-height 32`, `gap 14`, Jost 600 · 14 caps `.14em` `--text-2`. Primary foot is **right-aligned** ("Primary"); secondary foot is **left-aligned** ("Secondary" + Remove).
- Remove `.tag-x`: `height 32`, `padding 0 10px`, `gap 6`, radius 4, fill `--stop-fill`, text `--stop` Jost 600 · 11 caps `.14em`, X glyph `10px` 800. Hover: fill `#5a1222`, text `#ffc2cc`. **The only red on the page.**
- Add secondary `.link-add`: `height 44`, `gap 8`, Jost 600 · 15 caps `.14em` `--text-2`, plus `13px` 700. Hover: `--tier2` (hints at what it adds). Shown instead of the secondary block when there is none; it sits in `.block-add` (`flex: 1 1 420px`).
- Behaviour: Add creates the secondary with defaults `{ desk: true, phone: false, times: 2, snooze: 15, after: 15 }`; Remove sets it to null. No confirm dialog (undo via the existing `settings.changed` toast with Undo).

### 5.14 Section head (`.sec-head`)

Title, its mode toggle, then which one of how many and a way to add another. One hairline under it.

- `display: flex; flex-wrap: wrap; align-items: flex-end; gap 16px 40px; padding-bottom 14px; border-bottom 1px --line`.
- Children: `.sec-title` (40) · `.mode` · `.sec-tools` (`margin-left: auto; gap 36`) holding `.pager` (`--voice` 24 `--text-2`, "1 of 1") and `.link-voice` (`height 44`, `--voice` 24 `--text-2`, hover `--text`, "+ add new").

### 5.15 Page head

The master switch rides the title. The heavy rule under it is lit while the page is on.

- `.page-head`: flex, wrap, `align-items: center`, `gap 20px 40px`. Title (section 2) + large Switch.
- `.page-rule`: `height 6`, radius 1, `margin-top 24` (artboard 22), fill `--raised`; `.on` → `--go`.
- Off state: title colour `--dim`; `.page-body.muted { opacity: .35; pointer-events: none }`. Controls inside remain in the DOM; add `inert` to `.page-body` when muted so Tab skips them too (the artboard only uses `pointer-events`).

---

## 6. The Notifications page

### 6.1 Layout

- Root `.page`: `max-width 1440; margin 0 auto; padding 56px clamp(16px, 2.8vw, 64px) 120px; color --text; font-family --voice`. Ground `#000`.
- Order: page head → page rule → `.page-body` [ `section.hours` → `section.reminders` ].
- **Available Hours** (`.hours`): flex, wrap, `align-items: center`, `gap 24px 48px`, `padding 48px 0 44px`. Children: `.hours-title` (`flex: 0 0 260px`, row title 32) · `.hours-main` (`flex: 1 1 420px; min-width 0`, column `gap 10`: range + caption) · `.hours-side` (column, centred, `gap 12`: days `.mx` + small READY switch).
- **Reminders** (`.reminders`, `padding-top 24`): `.sec-head`, then either `.simple-row` or `.chain`.
- **Simple row** (`.simple-row`): flex, wrap, `align-items: center`, `gap 28px 40px`, `padding 32px 0`, `border-bottom 1px --hair`. Cells in order: `.prio-cell` (priority set + add) · `.when-cell` (days `.mx` over area select `.mx`, column, centred, `gap 12`) · `.reach-ctl.mx` (rest: glyph(s) + `Nx` readout; open: chips pair over Repeats stepper, column `gap 12`) · `.snooze-ctl.mx` (snooze tile + rest readout `N min.` / open Snooze stepper, row `gap 14`; rest readout is absolutely placed with `padding-left 82px` so it starts where the stepper value does) · archive `.tile.mx`.
- **Advanced chain** (`.chain`): flex, wrap, `align-items: flex-start`, `gap 40px 28px`, `padding 40px 0 24px`. Children: `.tabs` (`width 104`, column, centred, `gap 12`) · primary `.block` (`flex: 1 1 420px`, column `gap 18`) · if secondary: `.amp-big` + secondary `.block`; else `.block-add`.
- A `.block` holds `.sent` rows (flex, wrap, `align-items: center`, `gap 14px 12px`, `--voice` 22 `--text-2`) then a `.tier`.

### 6.2 The advanced sentences (exact words)

Primary block:
> `send to` [desk chip] `&` [phone chip]
> [Repeats stepper] `with a` [Snooze stepper] `snooze.`
> ───── Primary

Secondary block (blue):
> `if no response arrives after` [Wait stepper]
> `then, send to` [desk chip] `&` [phone chip]
> [Repeats stepper] `with a` [Snooze stepper] `snooze.`
> ───── Secondary · [Remove]

Between the two blocks: the 96 px `&`. Without a secondary: `+ ADD SECONDARY` in the second column.

### 6.3 State and bindings (D2–D7)

| UI | Reads / writes | Rule |
|----|----------------|------|
| Master switch | `loop.notify` | Off mutes the body |
| Range thumbs | `loop.quiet.from` (= available end), `loop.quiet.to` (= available start) | Complement; clamp 1 h apart |
| Available days | `loop.quiet.days` | May be empty |
| READY | `loop.quiet` null ⇔ off | Caption "Paused…" |
| Priority set | `loop.notify_levels` | ≥ 1 |
| Reminder days | `loop.days` | — |
| Area | `loop.area` | `all` + island kinds |
| Simple chips | `loop.via` (`desk\|phone\|both`) | ≥ 1 lit |
| Simple repeats / snooze | `loop.levels.{each notified level}.first_times` / `first_after` | Simple writes the same value to every included level |
| Tabs | local UI state (`tab`) | Default `high` |
| Primary chips / repeats / snooze | `loop.levels.<tab>.via` / `first_times` / `first_after` | — |
| Secondary after / chips / repeats / snooze | `loop.levels.<tab>.second_after` / **new** `second_via` / `second_times` / **new** `second_snooze` | `second_times: 0` ⇔ no secondary (today's "skipped") |

Every write goes through the existing `save(key, value)` in `settings.js` so it is logged as `settings.changed` with before/after and an Undo toast. Re-render after save as today.

### 6.4 Mode persistence

`simple | advanced` is a UI preference, not a loop rule. Store in `localStorage` key `omnii.notifications.mode`; default `simple` for a fresh install (the artboard's default of `advanced` is for showing the design). Switching modes never changes data; simple shows the High level's values and writes to all included levels.

---

## 7. Responsive behaviour

The page is fluid; every row is `flex-wrap: wrap`, so cells drop to the next line rather than squeeze. Breakpoints are consequences of the fixed cell widths, not media queries.

| Width | What happens |
|-------|--------------|
| ≥ 1440 | Design as drawn. Side gutter 64. |
| 1024–1439 | Title clamps down from 64. Simple row: the archive tile and snooze cell wrap to a second line first. Advanced: `&` + secondary block drop below primary (both blocks are `flex: 1 1 420px`). |
| 768–1023 | Available Hours: `.hours-side` (days + READY) wraps under the range. Simple row becomes two or three lines; keep `gap 28px 40px`. |
| < 768 (phone) | Gutter 16 via the `clamp`. Page head: switch wraps under the title. Every cell on its own line, left-aligned (`.when-cell` and `.hours-side` stay centred within their own width — acceptable). Steppers and chips keep 44 height; nothing shrinks. The area menu stays 250 wide; if it would overflow the viewport, flip it to `right: 0`. Touch: all rows open (`hover: none`). |

Minimum supported width: 360 px. The widest single control is the day track (~262 px) and the area select (250 px); both fit.

---

## 8. Edge cases and content

- **Empty priority set**: impossible (≥ 1 enforced). If the stored value is empty on load, treat as all three.
- **Empty available days**: allowed; caption explains. The range still renders.
- **No channels lit**: impossible; if stored `via` is invalid, fall back to `desk` and log a `settings.changed` with the correction.
- **Stepper at bounds**: disable the button; never wrap around.
- **Range thumbs crossing**: clamp on `input`, save on `change` (as `.qh` does today).
- **Long area names**: `.sel-text` is centred, single-line; `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` at 250 px. Menu options wrap to two lines if needed (`height: auto; min-height: 40px`).
- **Area list empty** (no islands yet): the select shows "all areas" and the menu has that one option.
- **iMessage not configured** (`state.data.imessage` falsy): the phone chip renders `disabled` with `opacity .4`, and the house fact "Texting is off, so everything goes to the desk." appears under the chips in `--dim` (reuse `fact()`).
- **Loading**: the Config page already fetches `/api/settings` then renders; keep that. Show nothing rather than a skeleton (the page is text; a skeleton would be decoration).
- **Save failure**: existing `toast(e.message)`; the control snaps back to the stored value on re-render.
- **Loop paused** (`loop.paused`): unaffected by this page; the existing "Paused" pill in the Loop section still owns it.
- **Reduced motion / touch**: section 4.

---

## 9. Motion

| Element | Trigger | Animation | Duration | Easing / delay |
|---------|---------|-----------|----------|----------------|
| Any `.m-in` part | `.mx` hover or focus-within | `scale(.1)→1`, `brightness(0)→1`, `hue-rotate(720deg)→0`, `opacity 0→1` | scale/filter `.55s`, opacity `.2s` | `--bloom`; opacity linear; delay `--d` (stagger) |
| Any `.m-out` part | same | reverse of above | same | same |
| Closing | pointer and focus leave | same, reversed | same | delay `--hold .6s + --d` |
| Priority face | hover | `box-shadow` on | `.15s` | ease |
| Icon tile | hover | `background`, `color` | `.15s` | ease |
| Area select field | open/close | `background-color, border-color, color` | `.3s` | delay `--hold` on close, `0` on open |
| Add-pill (component sheet) | hover/focus | `opacity` plus ↔ pill | `.15s` | ease (in the page it is a `.mx` morph instead) |
| Switch | toggle | **none** — state changes instantly (thumb jumps sides) | — | — |
| Pills, days, steppers | click | instant | — | — |
| Pressed anything | `:active` | `brightness(.75)` | instant | — |

`DESIGN.md`'s "one motion" rule becomes: the morph is the one motion; everything else is instant.

---

## 10. Accessibility

- **Focus order** (simple): master switch → range from → range until → 7 available days → READY → simple/advanced → `+ add new` → H M L → new priority → 7 days → area → desk → phone → fewer → more (repeats) → shorter → longer (snooze) → archive. Advanced: … → H M L tabs → new priority → desk → phone → repeats −/+ → snooze −/+ → [wait −/+ → desk → phone → repeats −/+ → snooze −/+ → Remove] or [Add secondary]. Rest faces are `aria-hidden` and never focusable.
- **Focus opens the control**: `:focus-within` on `.mx` is what reveals the controls, so a keyboard user sees what they are on. Never trap focus.
- **Names**: every icon-only button has `aria-label`; switches use `role="switch" aria-checked`; multi-select buttons use `aria-pressed`; single-select groups use `aria-pressed` within a `role="group"` (the artboards) — `role="radiogroup"/"radio"` as in today's `choice()` is also fine, pick one and be consistent.
- **Live regions**: stepper `<output aria-live="polite">`; hours caption `aria-live="polite"`.
- **Contrast** (computed, on `#000` unless noted): `--dim` 4.9:1 ✓; `--text-2` 13.2:1 ✓; `--value` 12.4:1 ✓; white on `--go` 4.8:1 ✓; `--value` on `--raised` 9.2:1 ✓; `--signal` text 13.9:1 ✓; `--stop` on `--stop-fill` 5.6:1 ✓; range labels `#fff` on `--go` 4.8:1 ✓; `--text-2` on `--go-deep` (chip words) 9.7:1 ✓ and on `--tier2-deep` 10.7:1 ✓; Remove hover `#ffc2cc` on `#5a1222` 9.0:1 ✓. One known fail: a **disabled stepper glyph** (`--line` on `--surface`) is 1.8:1 — acceptable for a disabled control (WCAG exempts them), but keep the button's `aria-disabled`/`disabled` so the state is announced.
- **Not colour alone**: on/off also differs by filled vs outline glyph, LED, and tile size (priorities); the secondary chain is also labelled "Secondary".
- **Touch targets**: every control ≥ 44 px tall; priority hit box 56; day buttons 32×35 inside a 44 track (acceptable: adjacent targets, WCAG 2.5.8 minimum 24 ✓).
- **Reduced motion**: honoured (section 4).
- **Muted body**: add `inert` so screen readers and Tab skip it while the page is off; announce via the switch's `aria-checked`.

---

## 11. Mapping to the existing code

What exists in `ui/panes/settings.js` and `ui/app.css`, and what to do with it.

| Today | In the design | Action |
|-------|---------------|--------|
| `sec('notifications', 'Reach', …)` with `reach()` glyph buttons and `pills('loop.max_open')` | Channel chips (5.8); master switch (5.1) | Replace the Reach section with the Notifications page head + simple row. Keep `max_open` on the Loop section or drop it from this page (not in the design). |
| `line('Quiet hours', quiet(L.quiet))` → `.qh` two-range control | Hours range (5.12) + available days + READY | Replace `quiet()` with the new range; keep the two-input technique and the clamp logic. |
| `sec('low_priority', 'Priorities', …)` table with `level()` rows: `reach`, `scale` + `dots` ×2, `pills(stop)`, `pills(stop_text)` | Advanced chain (6.2) with tabs, chips, steppers, tier rules | Replace the table with the chain. `dots` (1–3) → stepper (1–9). `scale` (duration picks) → stepper in minutes. `stop`/`stop_text` leave this page. |
| `pills()` / `choice()` radiogroups | Mode toggle (5.2), priority set (5.3), tabs (5.5), days (5.6) | New components; `choice()` can stay for other sections. |
| `toast(msg, undo)` and `save(k, v)` | all writes | Reuse unchanged. |
| `--brass`, `--ink`, Warbler | new token set | Add new tokens; scope the new classes to `#view-settings .page` so other panes are untouched until migrated (D1). |

Files to touch: `ui/app.css` (tokens + ~250 lines of component CSS, copy from the artboards), `ui/panes/settings.js` (new render functions, `wire()` additions), `ui/index.html` (Google Fonts `<link>` for Josefin Sans and Jost weights), `src/desk/` (new keys D2–D7 with defaults in `desk/loop.md`), `DESIGN.md` (rewrite when shipped).

---

## 12. Open questions for the designer

1. Should **simple** write to all included levels or only to High? (This spec says all; see 6.3.)
2. Is the **snooze tile** ever clickable, or is it purely the rest-face glyph? (Spec: indicator only.)
3. On a **phone over iMessage** there is no UI; does any of this need a text command (`/notify off`)? Out of scope here, but worth a line in `README.md`.
4. The artboard's canvas title is "Omnii config components" while the repo is `omni`. Which spelling is the product name? `PRODUCT.md` says Omnii.
