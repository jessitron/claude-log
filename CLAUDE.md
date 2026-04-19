# Claude Code Conversation Log Parser

## Quick start
```
npm run parse -- <path-to-jsonl>
```

## Regenerating all example comics
Use `./run` — it rebuilds TypeScript and regenerates HTML for every `example/*.jsonl`, then prints `file://` links. Prefer this over ad-hoc shell loops.

## Project notes
See `notes/progress.md` for session-by-session progress, design decisions, and what's been learned.

## Key design principle
**Loud defensiveness**: never silently skip schema surprises. Report unknown fields, missing expected fields, and format differences with every parse. The JSONL schema evolves across Claude Code versions — we want to see what's changing.
