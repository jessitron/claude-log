# Claude Code Conversation Log Parser

## Quick start
```
npm run parse -- <path-to-jsonl>
```

## Project notes
See `notes/progress.md` for session-by-session progress, design decisions, and what's been learned.

## Key design principle
**Loud defensiveness**: never silently skip schema surprises. Report unknown fields, missing expected fields, and format differences with every parse. The JSONL schema evolves across Claude Code versions — we want to see what's changing.
