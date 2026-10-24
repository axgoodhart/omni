# omni

A personal omni-agent that runs on your Mac: one brain, reachable from a web app and iMessage, with every step of its operation visible, prompts as files, swappable memory cartridges, and modes for different jobs. Model calls go through the Vercel AI SDK, so a mode can name any provider.

## Run

```bash
cp .env.example .env     # add OPENAI_API_KEY (and others you use)
npm install
npm run dev              # http://localhost:4747
```

The daemon prints every persisted event to the terminal as well. `npm start` runs without the file watcher.

## Desk, loop, check-ins, interview, out/

omni is an extension, not an assistant: a heartbeat **loop** (`src/loop/index.ts`, every `LOOP_INTERVAL_MIN` minutes) asks three questions each tick — who is the user, what's on the plate, what's happening now — and may do a few bounded things: ask you a one-sentence question with fixed options, nudge, hand a fixed task to a mode, write to `out/`, note an observation, archive. It never changes a priority. Every tick writes one `loop.tick` event with what it **saw**, **did** and **left** alone. Silence is written down.

- **`desk/`** is the station, as files you can edit: `profile.md`, `islands/<slug>.md` (one per thing on your plate, with a kind, a priority and a progress number), `priorities.md` (yours alone; governs how persistent a question is), `watches.md` (the export folder and how far mail has been read), `observations.md` (one line each, strike any), `trust.md` (every domain starts at `sandbox`).
- **Check-ins** are one sentence with options a–d. Answer on the desk, or text the letter. Unanswered, each priority gets a few quick nudges, then a few slower ones, then is filed (with or without a text saying so) or keeps the slower pace; where it goes (desk, phone, both) is per priority too. All of it lives in `desk/loop.md`. Medicine is the first rhythm; the apartment is a nudge.
- **Real in, sandboxed out.** The loop reads your actual inbox (IMAP, envelopes only) and your actual export folder. Everything it would send or publish as you is written to `out/mail`, `out/site`, `out/submissions` by the `deliver` tool. Nothing leaves. The `triage`, `carrier` and `drafter` modes are the fixed-task agents; they only have `desk_view` and `deliver`.
- **The interview** (`src/interview/index.ts`) is derived: each surface declares what it needs to know, and the interview asks those, one per screen. Answers go straight into `desk/` (secrets into `.env`). It runs on first open and from Setup any time; `desk/interview.md` keeps the answers.
- **Logbook**: `data/logbook/medicine.log`, `chores.log`, one line per entry.
- **Config** (sidebar) is the loop's rulebook, one setting per line with every choice visible: how often it looks, quiet hours, pause, how many questions may be out at once, what happens per priority when you don't answer, rhythms, what it watches, what it may do in your name, the plate, observations, who you are. Backed by `desk/loop.md` and the other desk files; every change is logged as `settings.changed` with before and after, with undo.

## The web app

Three panes. **Thread** is the conversation for the selected mode. **Operation** is the live event log: every prompt assembled, model request, reasoning summary, tool call and result, policy decision, approval, memory write, token count. Click a row for the raw JSON; the checkboxes hide groups. **Side** holds approvals (Allow / Deny), cartridge slots (Insert / Eject, click a file to read it), the mode file editor (saves to `modes/<name>.md` and hot-reloads), schedules and loaded skills.

## Modes

One file per mode in `modes/`. Frontmatter is the configuration, the body is the system prompt.

```yaml
model: openai/gpt-6.1-sol          # provider/model; anthropic/..., google/..., ollama/...
effort: medium                      # reasoning effort (OpenAI); omit for the model default
providerOptions: {}                 # passed straight to the provider, e.g. { openai: { textVerbosity: low } }
tools: [memory_view, shell]         # omit for the default set; add web_search for OpenAI's built-in search
permissions:
  mode: ask-destructive             # ask-always | ask-destructive | no-asking (same levels as briizOS)
  blacklist: { paths: [], filetypes: [] }
  overrides: { shell: ask }         # per-tool allow | ask | deny
cartridges: [personal]              # inserted by default; change at runtime in the UI or /cartridge
skills: none                        # none | all | [names] from SKILLS_PATH
schedules:
  - { cron: "30 7 * * *", timezone: America/Los_Angeles, light: true, prompt: "..." , deliver: imessage }
maxSteps: 12
voice: ...
```

Edit the file in any editor or the Side pane; the daemon reloads it and logs `mode.reloaded`. Each mode has one persistent thread shared by every channel.

## Memory cartridges

A cartridge is a folder: `cartridges/<name>/cartridge.md` (description and the summary the agent sees) plus `memories/*.md` which the agent reads and writes with the `memory_*` tools. `index.sqlite` is a derived full-text index, rebuilt at boot. Insert or eject cartridges per mode at runtime; ejecting never deletes anything. Copy the folder to move memory between machines, or `git` it.

Default tools: `memory_view`, `memory_search`, `memory_write`, `memory_edit`, `memory_delete`, `read_file`, `write_file`, `shell` (inside `workspace/`), `fetch_url`, `skill_read`, `notify`, and `imessage_send` when iMessage is configured.

## Approvals

Every tool call passes the policy engine before it runs. Read-only tools never ask. `ask-destructive` asks for shell commands that look destructive (same classifier as briizOS), file writes, memory deletes and iMessages to anyone but you. `ask-always` asks for every write. Blacklisted paths and file types are denied outright. Answer in the Side pane or by texting `yes` / `no`. Unanswered approvals are denied after `APPROVAL_TIMEOUT_MS`.

## iMessage

```bash
brew install steipete/tap/imsg
```

1. Sign Messages.app on this Mac into a **separate Apple ID** for the agent, so you can text it from your phone. (Messages you send from the same Apple ID arrive as `is_from_me` and are ignored.)
2. Give Full Disk Access and Automation (Messages) permission to the process that runs the daemon (Terminal, or `node` under launchd).
3. Put your own handle(s) in `ALLOWED_HANDLES` in `.env`. Anyone else is ignored.
4. Text it. Commands: `/mode <name>`, `/cartridge insert|eject <name>`, `/reset`, `/help`, `yes`, `no`.

## Free OpenAI tokens

The agent defaults to `openai/gpt-6.1-sol` and `openai/gpt-6-luna` for background work. If your org is enrolled in OpenAI's data-sharing program, set `DAILY_TOKEN_BUDGET` to your allowance: the daemon keeps a per-day ledger, switches to the light model past `BUDGET_DOWNGRADE_AT` (85%) and refuses requests that would cross the limit, because a crossing request is billed in full. OpenAI's built-in `web_search` is billed per call regardless, so it is only enabled in modes that list it. Everything sent is shared with OpenAI under that program: keep secrets out of cartridges.

## Skills

Set `SKILLS_PATH` to a folder with `public/<skill>/SKILL.md` and `custom/<skill>/SKILL.md` (briizOS's `agent/skills` works as is). List them per mode; the agent reads one with `skill_read` when a task matches.

## Always on

```bash
cp deploy/com.omni.gateway.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.omni.gateway.plist
launchctl kickstart -k gui/$(id -u)/com.omni.gateway     # restart after edits
tail -f data/omni.log
```

For a VPS without iMessage: `docker compose -f deploy/compose.yaml up -d`.

## API (what briizOS or any client can call)

`GET /api/settings` · `PUT /api/settings {key, value}` · `POST /api/islands/:slug/remove` · `GET /api/desk` · `POST /api/checkins/:id/answer {option}` · `GET|PUT /api/desk/files/<path>` · `POST /api/islands {name}` · `POST /api/islands/:slug {patch}` · `POST /api/logbook/:kind` · `POST /api/loop/tick` · `GET /api/out` · `GET /api/out/:domain/:name` · `POST /api/mail/:uid/draft|handled` · `GET /api/interview` · `POST /api/interview/answer {id, value}` · `POST /api/interview/restart` · `GET /api/state` · `GET /api/threads/:mode` · `POST /api/threads/:mode/messages {text}` · `POST /api/threads/:mode/reset` · `PUT /api/threads/:mode/cartridges {cartridges}` · `GET|PUT /api/modes/:name/raw` · `POST /api/cartridges {name, description}` · `GET /api/cartridges/:name/files/<path>` · `GET /api/approvals` · `POST /api/approvals/:id {approved}` · `GET /api/usage` · `GET /api/events?thread=&after=` · `GET /events` (SSE, `event: agent`).

## Trying the desk

1. `npm run dev`, open the app. With no `desk/profile.md` the interview opens: one question per screen. Answer through; each answer becomes a file under `desk/` (mail password into `.env`). "later" dismisses it for the session; Setup → interview again resumes.
2. The Desk shows your islands, the medicine and apartment rhythms, mail and export status, trust all `sandbox`, and the loop strip at the top.
3. Set `medicine.time` in `desk/priorities.md` two minutes ahead and `LOOP_INTERVAL_MIN=1` in `.env` (restart). At that time a check-in appears under Needs you and, with iMessage on, as a text with a–d. Reply `b` → snoozed; `a` → a line in `data/logbook/medicine.log`; `d` → the assistant thread picks it up.
4. Drop a file into the export folder → next tick, "New finished piece" with a–d. `b` → the drafter writes `out/submissions/<name>-submission.md`; it shows under Out, click to read.
5. With IMAP set, the mail block fills; senders with 3+ messages this week and a List-Unsubscribe header become a check-in. `a` → `out/mail/unsubscribe-<sender>.md`. Nothing is sent.
6. Loop (sidebar) shows every tick as a sentence: what it saw, did, and left alone.
7. Edit `desk/priorities.md` by hand → `desk.reloaded`; the next tick obeys it.

## Trying it

1. Send "hello" in the web app. Operation shows `inbound`, `prompt.assembled`, `model.request`, `reasoning`, `usage`, `outbound`.
2. Change `model:` in `modes/assistant.md` to `anthropic/claude-opus-5-5` (with `ANTHROPIC_API_KEY` set) and send again: same event shapes, different provider.
3. Say "remember my coffee order is a flat white". A file appears under `cartridges/personal/memories/` with a `memory.write` event. Eject the cartridge, ask again; insert it, ask again.
4. Ask it to delete a file in `workspace/`. An approval appears; deny once, allow once.
5. Set `COMPACT_AT=2000` in `.env`, chat a few turns: a `compaction` event and `thread-summary.md`.
6. Text the agent from your phone; the reply lands in Messages and the exchange shows in the web Thread.
7. Edit the `brief` cron to two minutes from now and watch `schedule.tick` then the brief arrive.
