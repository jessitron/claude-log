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

### mtg-sparrow logs
Jessitron mentioned checking mtg-sparrow conversations for Claude Teams discussion — those 57 sessions were all about the MTG Sparrow project itself (mtgcolors.quest), no meta-discussion about logs or Teams found there.
