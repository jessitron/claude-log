# Comic Panel Types

## 👤 Human Speech (`human-speech`)
**What:** Messages the user typed as prompts.
**Visual:** Blue bubble on the left, with a left-pointing speech tail.
**Source:** `user` records (excluding meta, tool results, and task notifications). Also `queue-operation` enqueue records — these render at the typed position with `queued: true` (hidden by default, see "Queued Panels" below). The matching user record at the dequeued position renders a normal (always-visible) panel.

## 🤖 Claude Speech (`claude-speech`)
**What:** Claude's real dialogue — explanations, plans, answers.
**Visual:** Dark bubble with red border on the right, with a right-pointing speech tail.
**Source:** `assistant` records with `text` content blocks. Only qualifies as speech if the text is long (≥150 chars) OR isn't immediately followed by a tool_use.

## 💭 Claude Think (`claude-think`)
**What:** Claude's inner monologue — short narration before tool calls ("Let me read the file.") and actual `thinking` blocks.
**Visual:** Dashed purple bubble on the right, with a 💭 emoji. Italic text.
**Source:** Two sources:
- `thinking` content blocks (explicit reasoning)
- Short `text` blocks (<150 chars) that are immediately followed by a `tool_use` record (heuristic: narrating intent, not real dialogue)

## ⚡ Action Montage (`action-montage`)
**What:** A burst of tool calls grouped together.
**Visual:** Centered panel with red border, "⚡ ACTION ⚡" label. Clickable to expand.
**Expandable (level 1):** Shows each tool with a summary:
- **Read/Write/Edit:** file path (shortened)
- **Bash:** description + `$ command` in green
- **Grep:** `/pattern/` and glob
- **Agent:** description (may have nested subcomic)
**Expandable (level 2):** "output" button shows tool result text.
**Expandable (level 3):** Agent tools with matching subagent JSONL files expand into a full nested comic strip (orange left border).

## 📬 Notification (`notification`)
**What:** Background tasks reporting completion — a messenger arriving from offscreen.
**Visual:** Green monospace box on the right, with a 📬 mailbox emoji. Dashed border when revealed via `q`.
**Source:** Emitted at the moment Claude *sees* the notification, which shows up in two forms:
- `user` records containing `<task-notification>` XML (delivered at the next turn)
- `attachment` records with `type=queued_command` and `commandMode=task-notification` (injected mid-turn)

All notifications are marked `queued: true` (hidden by default; `q` toggle reveals them). The earlier `queue-operation` enqueue (system queues the notification) is ignored to avoid a duplicate panel before Claude has actually received it. Extracts the `<summary>` text.

## 📜 Narrator (`narrator`)
**What:** System events worth noting — API errors, etc.
**Visual:** Centered burgundy box, italic text.
**Source:** `system` records with `subtype=api_error` or short content strings. Skips boring subtypes like `turn_duration` and `stop_hook_summary`.

---

## Toggle Buttons (top of page)
- **Show all actions** — opens/closes every action montage
- **Show all outputs** — opens/closes every tool output block
- **Show refs** (`r`) — reveals source-line tags on each panel
- **Show tokens** (`t`) — reveals per-turn token badges
- **Show queued** (`q`) — reveals panels marked `queued: true`: typed-while-busy user messages at their *typed* position, and background-command notifications. Dashed border distinguishes them from normally-delivered dialogue.

## Queued Panels (`queued: true`)
Any content that arrived while Claude was working but wasn't part of the straightforward turn-by-turn flow gets `queued: true`. Hidden by default so the comic reads cleanly; revealed via the `q` hotkey for debugging conversation dynamics.

Two sources:
1. **Enqueued user text** — human typed while Claude was generating. Rendered at the enqueue position (queued) *and* at the dequeue position (normal), so the reader can see both "when I typed it" and "when Claude received it".
2. **Task-notifications** — background shell commands finishing mid-turn.

## Records We Skip
- `progress` — noisy tool progress updates (often 50%+ of all records)
- `file-history-snapshot` — internal bookkeeping
- `queue-operation` with `operation != "enqueue"` — removal records
- `attachment` — all flavors except `queued_command`/`task-notification`, which becomes a 📬 Notification panel. Skipped attachments include `hook_success` (hook stdout/stderr), `task_reminder` (system nags to Claude), `deferred_tools_delta`, `mcp_instructions_delta`, and `skill_listing` — all session plumbing, not narrative
- `user` with `isMeta` — system reminders injected into the conversation
- `user` with `toolUseResult` — tool results (data, not dialogue)
