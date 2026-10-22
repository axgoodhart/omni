# omni

A personal omni-agent that runs on your Mac: one brain, reachable from a web app and iMessage, with every step of its operation visible, prompts as files, swappable memory cartridges, and modes for different jobs. Model calls go through the Vercel AI SDK, so a mode can name any provider.

## Run

```bash
cp .env.example .env     # add OPENAI_API_KEY (and others you use)
npm install
npm run dev              # http://localhost:4747
```

The daemon prints every persisted event to the terminal as well. `npm start` runs without the file watcher.

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

`GET /api/state` · `GET /api/threads/:mode` · `POST /api/threads/:mode/messages {text}` · `POST /api/threads/:mode/reset` · `PUT /api/threads/:mode/cartridges {cartridges}` · `GET|PUT /api/modes/:name/raw` · `POST /api/cartridges {name, description}` · `GET /api/cartridges/:name/files/<path>` · `GET /api/approvals` · `POST /api/approvals/:id {approved}` · `GET /api/usage` · `GET /api/events?thread=&after=` · `GET /events` (SSE, `event: agent`).

## Trying it

1. Send "hello" in the web app. Operation shows `inbound`, `prompt.assembled`, `model.request`, `reasoning`, `usage`, `outbound`.
2. Change `model:` in `modes/assistant.md` to `anthropic/claude-opus-5-5` (with `ANTHROPIC_API_KEY` set) and send again: same event shapes, different provider.
3. Say "remember my coffee order is a flat white". A file appears under `cartridges/personal/memories/` with a `memory.write` event. Eject the cartridge, ask again; insert it, ask again.
4. Ask it to delete a file in `workspace/`. An approval appears; deny once, allow once.
5. Set `COMPACT_AT=2000` in `.env`, chat a few turns: a `compaction` event and `thread-summary.md`.
6. Text the agent from your phone; the reply lands in Messages and the exchange shows in the web Thread.
7. Edit the `brief` cron to two minutes from now and watch `schedule.tick` then the brief arrive.
