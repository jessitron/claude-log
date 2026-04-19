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

## Key design principle
**Loud defensiveness**: never silently skip schema surprises. Report unknown fields, missing expected fields, and format differences with every parse. The JSONL schema evolves across Claude Code versions — we want to see what's changing.
