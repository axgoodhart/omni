# Omnii design

Black ground, serif headings, Jost words and controls. The same component language applies throughout the live app: Desk, Config, conversations, History, drawers and Interview. Green means on or included, teal marks values, blue identifies a secondary chain, and red only removes. The interface is a set of useful rows and readable sentences; its controls reveal themselves where their answers already sit.

## Tokens (`ui/app.css` `:root`)

| Role | Token | Value |
|---|---|---|
| Page / tracks / resting fields | `--ground`, `--surface`, `--raised` | `#000`, `#0c0e0e`, `#202524` |
| Row hairline / control edge | `--hair`, `--line` | `#262b2a`, `#3a403f` |
| Main / supporting / quiet text | `--text`, `--text-2`, `--dim` | `#f2f4f3`, `#c9cecc`, `#747c7a` |
| Included or on / interior | `--go`, `--go-deep` | `#0b842c`, `#082a15` |
| Resting glyph / lit edge / resting green edge | `--leaf`, `--signal`, `--signal-dim` | `#22b04d`, `#3cf07c`, `#1c5e33` |
| Numeric value | `--value` | `#7fd6cc` |
| Secondary chain / interior | `--tier2`, `--tier2-deep` | `#3d8bff`, `#0b1c38` |
| Remove text / fill | `--stop`, `--stop-fill` | `#ff5d78`, `#3d0d17` |
| Remove hover fill / text | `--stop-hover`, `--stop-hover-text` | `#5a1222`, `#ffc2cc` |
| Text on selected fill / focus colour | `--on-text`, `--focus-color` | `#fff`, `#9fe9ff` |
| Resting LED / switch thumb / range rail | `--led-off`, `--thumb-off`, `--range-track` | `#4a5150`, `#5b6260`, `#c4c9c8` |
| Keyboard focus | `--ring` | `0 0 0 2px #000, 0 0 0 4px #9fe9ff` |
| Heading | `--display`, `--heading` | `"Warbler Variable", Georgia, serif` |
| Body / controls | `--body`, `--mono`, `--control`, `--voice` | Jost, system-ui, sans-serif |

The historical `--ink`, `--paper`, `--brass` and related names remain aliases for existing markup; they resolve to this shared palette rather than a second visual system. Jost is the body font as well as the control font. Code and raw file editors may use a real monospace font where character alignment matters. There is no Josefin Sans or baseline nudge.

## Type scale

| Role | Family / scale |
|---|---|
| App page title | Serif, `clamp(36px, 5vw, 64px)` |
| Section title | Serif, 32px |
| Sidebar group | Serif, 20px |
| Body, nav item, standard button or field | Jost, 18px |
| Sentence control / numeric stepper | Jost, 22px |
| Caps label | Jost, 14px with restrained tracking |
| Config section, including Notifications and Available Hours | Serif, 32px |

Names and headings establish hierarchy through type and spacing. Supporting text uses `--text-2` or `--dim`; numeric readouts use `--value`. Uppercase is reserved for short status words and labels rather than ordinary buttons or sentences.

## The row

Related settings form rows separated by `--hair`. Labels sit beside their controls and a quiet status; repeatable things such as rhythms and islands share column headings. Fields and buttons retain useful hit areas as rows wrap. Forms, messages and logs keep their own content structure while using the same type, colours, controls and focus states.

Tooltips hold supporting explanations. Visible captions stay when they explain a consequential setting, such as the complete Available Hours schedule or unavailable texting. The app retains its real labels, content and actions; design changes do not introduce development commentary into the interface.

## Controls

- **Switch**: a word and thumb, green when on. The accessible name stays descriptive while the visible status changes.
- **Pick one or some**: 44px pill controls with 12px corners. Included choices use green fill and a filled glyph or LED; priorities use a stable 56px hit box.
- **Days**: quiet letters at rest, joined green runs in a full day track when open. Each day remains a labelled button.
- **Numbers and durations**: a teal answer at rest and an in-place slider or stepper when editing. Stepper bounds disable their corresponding button; values never wrap.
- **Text and menus**: fields at least 44px high with 4px corners, quiet raised fill at rest and a green edge on focus. Editable names remain on the thing they name.
- **Actions**: 44px icon targets or worded actions. Removal uses `--stop` and `--stop-fill`; neutral warnings use words and hierarchy, not the removal colour.

The same field, button, choice, icon and focus treatments apply in the Config rows, Desk actions, conversation composer, event filters, approval cards, drawer editors and Interview. SF Symbols use SF Pro with Symbols Nerd Font fallbacks where used; the existing Material symbol vocabulary continues for the app's general-purpose icons.

## Never

- Decorative header bands, nested rails or spines, cards inside cards.
- A separate "Name" field under a title that already shows the name.
- Grouping four lines under a thing when one row can hold them.
- Gradient text, ambient gradient panels, decorative shadows, colour-coded page themes.
- Red warning text, orange high-priority bars, or blue used as a generic primary action.
- Vocabulary the user did not choose: priorities are High / Medium / Low; an island has a type, a priority and a progress number.

## Motion

The in-place morph is the main motion: a fixed-size resting answer yields to its editing controls on hover or keyboard focus. The open control holds for 600ms after focus and pointer leave, then closes; stagger steps are 40ms. Buttons, switches and selected values change immediately. Quiet hover changes use 150ms. Touch devices show editable faces continuously, and reduced-motion users receive opacity changes without scaling or hue rotation. Lit edges use green or blue functional glows; keyboard focus uses the ice ring and always takes precedence.

## Implementation surfaces

`ui/app.css` owns the canonical tokens, native controls and app shell. `ui/controls.js` renders the shared switches, day tracks, channel chips, steppers, glyphs and tiles; `ui/controls.css` styles them and defines the fixed-box morph. The page body has `.control-system`, so these primitives work throughout the app rather than depending on a Notifications wrapper. `ui/panes/settings.js` reuses the same switch, day and stepper renderers as Notifications for Loop and rhythm settings, scan intervals, open-request limits and mail thresholds.

`ui/notifications.css` composes availability and reminder sentences; `ui/config.css` arranges the remaining Config sections and integrates Notifications at the section scale. `ui/surfaces.css` applies the shared language to Desk, conversation, History, approval cards, drawers and Interview. `ui/lib.js` supplies common icon buttons, section headings and progress sliders. Each pane supplies its content and bindings. `ui/index.html` loads Jost and these styles in order: app, controls, notifications, config, surfaces.

Sidebar navigation, app headers, connection status, budget, tooltips and toast feedback belong to the same system. So do empty states, disabled controls, permission requests, code/file readers and responsive variants. The design is assessed within the live app, including its navigation and real content.

## Notifications

The Notifications surface is an Operate section within Config. Its implementation is `ui/panes/notifications.js`; `ui/notifications.css` supplies its composition while shared primitives come from `ui/controls.js` and `ui/controls.css`. It demonstrates the app system with a master switch, availability, reminder controls and primary/secondary sentences. `ui/config.css` aligns its headings and gutters with the other Config sections.

### Typography and geometry

Page, section and row headings use the shared serif face; other words, numbers and labels use Jost. Filled glyphs, LEDs, words and priority tile size communicate state alongside colour. Pressed buttons dim to 75% brightness.

| Element | Type / size |
|---|---|
| Notifications / Reminders / Available Hours heading in Config | Serif, weight 600, 32px |
| Standalone composition title / section | Shared page title scale / serif 40px |
| Sentence / channel / stepper | Jost 22px |
| Area field / menu option | Jost 21px / 19px |
| Mode / pager and add reminder / caption | Jost 28px / 24px / 18px |
| Resting numeric readout | Jost 46px; bold number and regular unit |
| Chain labels | Jost 14px, weight 600, uppercase, `.14em` tracking |

Inline controls are 44px tall with 12px corners; fields and menus have 4px corners. Large and small switches are 168×52px and 116×30px. Priority buttons retain a 56×56px hit box; their face is 52px when included and 36px when excluded. The area field and menu are 250px wide; icon tiles are 64px square.

Config is at most 1440px wide, centred within the app content area. Its Notifications section uses the same gutters and 32px headings as the surrounding sections; the reusable standalone composition retains its full page spacing. Available Hours and reminder rows wrap instead of squeezing their controls. Below 768px, titles and advanced blocks use full rows, and priority tabs sit across the page. Config's other rows respond to their container width at 700px and 360px. Touch devices show editable controls continuously.

### Behaviour and motion

The Notifications master switch controls notification delivery while the scan loop continues. Its off state dims the body and makes it inert. Available Hours shows the complement of stored quiet hours, with Sunday-first available days and a READY switch. The two native range inputs move in 30-minute steps and retain at least an hour between endpoints; the caption states the complete schedule. READY off permits delivery at any hour. An empty available-day set keeps delivery quiet every day.

Simple mode shows the High rule's repeats and snooze. Changing either writes the same value to every included priority; at least one priority and one channel remain selected. Reminder days and area apply across the reminder rules. Advanced mode edits the selected priority's primary and secondary chains separately. A secondary has its own wait, channels, repeats and snooze; setting its repeat count to zero removes it. Mode choice persists in `omnii.notifications.mode` and never changes rule data. Existing durations outside the new stepper range stay visible until deliberately edited.

Repeats run from 1–9 by 1. Snooze runs from 5–120 minutes by 5; the wait before a secondary runs from 5–240 minutes by 5. These limits live in the `stepper()` calls in `ui/panes/notifications.js`. Settings writes retain the existing change log and Undo interaction. The single reminder's add-reminder, add-priority and archive affordances explain their current limits with a toast.

Each `.mx` holds a resting readout and editable controls in the same reserved box. Pointer hover or keyboard focus reveals `.m-in` controls while `.m-out` readouts recede; the surrounding row does not reflow. Readouts are decorative and hidden from assistive technology. Advanced numeric values remain visible while only their skins and buttons open. On devices without hover, controls stay open; reduced motion uses opacity alone. Adding `.always` to the Notifications root exposes all controls without a user-facing toggle.

The shared morph variables are `--bloom-t: .55s` for scale/filter, `--fade-t: .2s` for opacity, `--hold: .6s` before closing, `--step-d: .04s` between staggered parts, and `--bloom: cubic-bezier(.3, 1.5, .55, 1)` for the opening curve. Their canonical definitions are in `ui/app.css`; `ui/controls.css` consumes them for every shared morph control.

Other global tuning also lives in `ui/app.css`: `--font-body: 18px`, `--font-control: 22px`, `--font-label: 14px`, `--font-section: 32px`, `--font-page: clamp(36px, 5vw, 64px)`, and `--control-h: 44px`. Supporting type tokens are `--font-row: 24px`, `--font-subsection: 28px`, `--font-small: 16px`, `--font-caption: 12px`, `--font-readout: 46px`, and `--font-code` for the true monospace stack. The spacing scale `--space-1` through `--space-8` is 4, 8, 12, 16, 24, 32, 40 and 56px. Control, field, tile and full radii are 12px, 4px, 10px and 999px; `--border-control` and `--border-field` are 1.5px and 1px. Sidebar widths are 256px expanded and 64px collapsed; at narrow widths its native toggle opens the expanded navigation as an overlay. The drawer width is 420px and also becomes an overlay as space narrows.
