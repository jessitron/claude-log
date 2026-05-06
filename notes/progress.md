# Progress Notes

## 2026-04-11: Initial parser built

### What exists
- TypeScript project (`npm run parse -- <file>`) that reads a JSONL conversation log and reports:
  - Record counts by type
  - Schema observations: unknown fields, unknown record types, unknown message/usage fields
- Source files: `src/schema.ts` (expected schema), `src/observations.ts` (observation collector), `src/parser.ts` (JSONL reader + checker), `src/main.ts` (CLI entry point)
- Example data: `example/race-honeycomb-integration.jsonl` (v2.1.20, 401 lines, Jan 2026)

### Key design decision
**Loud defensiveness**: the parser never silently skips schema surprises. Every unknown field, missing expected field, or unexpected value gets reported. This is because the Claude Code JSONL schema evolves across versions, and we want to *see* what's changing rather than just survive it.

### What we learned about log compatibility
- Claude Teams uses the same `~/.claude/projects/<path>/<session>.jsonl` format as individual plans
- Agent Teams (experimental) just creates more session files — same format
- The real compatibility risk is **version drift**, not plan type. v2.1.20 → v2.1.96 showed fields appearing (`stop_details`, `inference_geo`, `server_tool_use`, `iterations`, `speed`) and record types appearing (`queue-operation`, `attachment`)

### What's not built yet (from README ideas)
- Trace/span tree from `parentUuid` relationships
- Tool usage pattern extraction
- Token/time analysis
- Any visualization (Honeycomb traces, comic strip, swim lane, etc.)
- No test suite yet

## 2026-04-19: Debug refs for panels

### What changed
Added a debug-only reference system so when Jessitron notices a discrepancy in a rendered bubble/panel and wants to point at a specific one, she can copy a precise reference to give to me. The bubble text isn't always unique, so we needed IDs.

### How it works
- Every panel gets `data-panel="N"` and `data-source-lines="..."` attributes, plus `data-source-file` for the JSONL basename (main file vs. subagents)
- Each panel has a `<span class="source-tag">` showing e.g. `episode-8-before:L42` or `agent-ae20659fd0f63295e:L1`
- Tags are **completely hidden** by default (`display: none`) — important: Jessitron displays this comic to other people, she does NOT want refs popping up on hover
- A "Show refs" button in the toggle bar toggles `body.show-refs` class to reveal them
- Clicking a revealed tag copies its text to clipboard via `navigator.clipboard.writeText` and briefly flashes green + "copied!"
- Source file is stamped on panels in `groupIntoPanels` (via new `sourceFile` param in `panels.ts`), called from `comic.ts` for both main records and recursive subagent parsing

### Files touched
- `src/panels.ts` — added `sourceFile?: string` to `Panel` interface, added param to `groupIntoPanels`, stamps panels at the end
- `src/comic.ts` — passes basenames when calling `groupIntoPanels` (main + subagents)
- `src/html-generator.ts` — emits `source-tag` spans, data attributes, the toggle button wiring, and the click-to-copy handler
- `static/comic.css` — `.source-tag` styles, gated by `body.show-refs`

### Gotchas found
- `npm run parse` runs `main.js` (the schema reporter), not `comic.js` — had to remember to use `npm run comic` to regenerate HTML
- Earlier attempt made tags visible on hover — Jessitron called that out: do NOT show on hover, the comic gets displayed and refs must stay invisible until explicitly toggled
- `output/` is gitignored — don't try to commit regenerated HTML

## 2026-04-19: Live-reload dev server for CSS iteration

### What changed
Added `./dev` (→ `scripts/dev-server.js`) using browser-sync so CSS edits apply instantly in the browser without re-running `./run`.

### How it works
- browser-sync serves two baseDirs: `static/` first, then `output/`. First match wins, so `/comic.css` resolves to `static/comic.css` — edits to the source CSS are injected live (no reload, scroll preserved)
- Comic HTML in `output/*.html` is watched too, but those trigger a full page reload (they're generated, not hand-edited)
- A tiny middleware intercepts `/` to render an index page listing every `output/*.html`. Without it, browser-sync shows a directory listing of `static/` (which only has `comic.css`) and the user can't find the comics

### Gotchas found
- browser-sync CLI `--server` doesn't cleanly accept multiple baseDirs from shell args — had to use the Node API (`browserSync.create().init({...})`) instead
- `middleware` must be nested inside `server`, not at the top level of the config — top-level placement silently doesn't run
- Stale browser-sync processes linger on the port across restarts; `pkill -f browser-sync` clears them

## 2026-04-19: Tool output open by default; typography choice

### What changed
- Tool output inside action-montage expansions now renders `<details open>` by default — once you open the montage, you almost always want to see the output. Added a small `[−]` button anchored upper-right of the `<pre>` to minimize; when closed it collapses to a `[+] output` pill.
- "Show all outputs" header button flipped to default-on ("Hide all outputs"). `makeToggle` grew an optional `initialExpanded` param.

### Typography preference (important, don't re-litigate)
- **Speech bubbles** (human + claude) use `var(--font-dialogue)` = Comic Sans. This reads as spoken dialogue and gives the right comic-book impression.
- **Thought bubbles** use `var(--font-body)` = Sen (still italic). Cleaner than Comic Sans italic, feels like internal deliberation.
- Jessitron explicitly chose this split after trying Sen everywhere. If asked to try a different font across the comic, ask before changing speech bubbles — thought bubbles are more flexible.

### Files touched
- `src/html-generator.ts` — added `open` to `<details class="tool-output-details">`, emptied the summary text (CSS renders `[−]` / `[+] output` via pseudo-elements), flipped the outputs-toggle default, `makeToggle` takes `initialExpanded`
- `static/comic.css` — `.tool-output-details` positioned relative; summary styled differently for `[open]` vs `:not([open])` via `::before` content

## 2026-05-05: Recap panel + system content de-truncation

### What changed
- New `recap` panel type for `system` records with `subtype=away_summary` — Claude Code's "you've been away, here's what happened" recap that ends with "(disable recaps in /config)". Rendered as a centered amber dashed box with a tiny "recap" label.
- Removed the 200-char truncation on system narrator content. Also dropped the `< 500` length filter in `isInterestingSystem` — any non-empty string content qualifies now. The truncation was making narrators end in `…` mysteriously even though the source record was complete.

### Why
Jessitron noticed `netflix-traces:L30` rendered with a trailing ellipsis but the underlying record didn't end that way — it was our `truncate(content, 200)` cutting it off. No good reason for the limit; system content is short by nature.

### Files touched
- `src/panels.ts` — added `recap` to `PanelType`, branched on `subtype === "away_summary"` in the system handler, dropped truncate, dropped length filter
- `src/html-generator.ts` — added `case "recap"` rendering with `.recap-box` and a `.recap-label`
- `static/comic.css` — `.recap` styles (amber/dashed)
- `notes/panel-types.md` — documented the new panel type, updated narrator description

## 2026-05-05: Fenced code blocks in bubbles + hidden-thinking no longer eats speech

### What changed
- Bubble text containing markdown fences (```) now renders the fenced section as `<pre class="bubble-pre">` (monospace, preserved whitespace, light tint, horizontal scroll). Prose between fences becomes `<p>` paragraphs split on blank lines. Without fences, behavior is unchanged (one `<p>` per panel line). Applied to both `claude-speech` and `claude-think`.
- Fixed: when a message had hidden thinking ("…") followed by visible text (same `msg.id`), the thinking placeholder created a `claude-think` panel and the text *merged* into it — so a real reply got rendered as a thought bubble. Now: if hidden thinking and the same message has visible text, emit the "…" thought bubble standalone (no token badge, not pending) and let the text create its own `claude-speech` panel. Token badge stays on the speech panel since the API call is one billed turn.

### Why this came up
Jessitron pointed at `netflix-traces:L133,134` — a long markdown reply with tree-drawing characters (├──, │) and ASCII tables that collapsed in the prose font. Then `netflix-traces:L64,65` — Claude was *talking to her*, not thinking, but it rendered as a thought bubble. The two had the same root: hidden thinking + text in one message → forced into thought bubble + literal triple-backticks in body font.

### Important behavior to preserve
- Hidden thinking still gets a "…" thought bubble. She wants to see that thinking happened, just not have the speech absorbed into it.
- Code-fence rendering uses `white-space: pre` on `.bubble-pre` (not `pre-wrap`) — wide ASCII art scrolls horizontally rather than wrapping and losing alignment. The bubble `<p>` already had `pre-wrap`, so single newlines in prose are preserved naturally.

### Files touched
- `src/html-generator.ts` — added `renderBubbleLine(text, withBold)` that splits on ``` fences; used in `claude-speech` (with bold) and `claude-think` (without)
- `src/panels.ts` — in the hidden-thinking branch, when the message also has text, emit the "…" think panel without usage and without setting `pendingThoughtPanel`, so the upcoming text panel stands alone
- `static/comic.css` — `.bubble-pre` rule (mono font, tint, padding, `white-space: pre`, `overflow-x: auto`)
