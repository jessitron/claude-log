# Claude Code Conversation Log Parser

## Quick start
```
npm run parse -- <path-to-jsonl>
```

## Regenerating all example comics
Use `./run` — it rebuilds TypeScript and regenerates HTML for every `example/*.jsonl`, then prints `file://` links. Prefer this over ad-hoc shell loops.

## Iterating on CSS
Use `./dev` to start a live-reload server at http://localhost:3000.
- The root (`/`) shows an index of all comics in `output/`.
- `static/` is overlaid on top of `output/`, so edits to `static/comic.css` are injected live (no reload, scroll position preserved) without re-running `./run`.
- HTML changes in `output/*.html` trigger a full reload.
- Implementation: `scripts/dev-server.js` (browser-sync + a small middleware that renders the index at `/`).

## Project notes
See `notes/progress.md` for session-by-session progress, design decisions, and what's been learned.

## Resolving panel refs
When Jessitron points at a panel by its ref (e.g. `episode-8-before:L42` or `agent-abc123:L1,2,3`), use `./show-ref <ref>` to see the underlying JSONL records with noise filtered out. Supports `-c N` for context, `Lstart-end` ranges, `--full`, and `--raw`. Wrapper calls `scripts/show-ref.js`.

## Key design principle
**Loud defensiveness**: never silently skip schema surprises. Report unknown fields, missing expected fields, and format differences with every parse. The JSONL schema evolves across Claude Code versions — we want to see what's changing.

## Shell conventions
Don't use `git -C <path> ...` — it triggers an unnecessary permission prompt every time. Bash already runs from the project root, so plain `git add`, `git commit`, etc. are enough.
