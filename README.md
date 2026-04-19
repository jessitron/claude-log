# Claude Code Conversation Log Parser

This project analyzes Claude Code conversation logs to understand Claude's activity during conversations.

**Live comics:** <https://jessitron.github.io/claude-log/>

## About Claude Code Conversation Logs

Claude Code stores detailed conversation logs in JSONL (JSON Lines) format, where each line is a complete JSON object representing one event in the conversation.

### Log Locations

1. **User prompts only**: `~/.claude/history.jsonl`
   - Contains just user inputs with timestamps and session IDs
   - Example entry: `{"display":"great, commit that","pastedContents":{},"timestamp":1764302345226,"project":"/Users/jessitron/code/jessitron/mtg-deck-shuffler","sessionId":"34e3ae7a-4c43-457f-9246-ac1fa390fbff"}`

2. **Full conversation logs**: `~/.claude/projects/<project-directory>/<session-id>.jsonl`
   - Each session gets its own JSONL file
   - Contains complete conversation including:
     - User messages
     - Assistant responses (text, thinking blocks, tool uses)
     - Tool results
     - Hook events
     - System messages
     - File history snapshots
     - Progress events
   - Each event includes timestamps and UUIDs for tracking message relationships

### Log Structure

Each line in a conversation log is a JSON object with fields like:
- `type`: The event type (user, assistant, progress, system, file-history-snapshot)
- `uuid`: Unique identifier for this event
- `parentUuid`: Links to the previous related event
- `timestamp`: ISO 8601 timestamp
- `sessionId`: Session identifier
- `cwd`: Current working directory
- `message`: Message content (for user/assistant messages)
  - `role`: "user" or "assistant"
  - `content`: Array of content blocks (text, tool_use, tool_result, thinking)
- `type` specific fields for progress, system events, etc.

### Subagent Activity in Logs

When Claude spawns a subagent (using the Task tool), the logs capture detailed information about the subagent's execution:

**1. Task Tool Call** (type: "assistant")
```json
{
  "type": "assistant",
  "message": {
    "content": [{
      "type": "tool_use",
      "name": "Task",
      "input": {
        "subagent_type": "Explore",
        "prompt": "Search the README.md file...",
        "description": "Test subagent exploration"
      }
    }]
  }
}
```

**2. Task Result** (type: "user", with toolUseResult)
```json
{
  "type": "user",
  "toolUseResult": {
    "status": "completed",
    "agentId": "a9e0cc6",
    "totalDurationMs": 13650,
    "totalTokens": 12084,
    "totalToolUseCount": 1,
    "usage": {
      "input_tokens": 5,
      "cache_creation_input_tokens": 1239,
      "cache_read_input_tokens": 10837,
      "output_tokens": 3
    }
  }
}
```

**Key Subagent Metadata:**
- `agentId`: Unique identifier for resuming the agent
- `totalDurationMs`: How long the subagent ran
- `totalTokens`: Total tokens used by the subagent
- `totalToolUseCount`: How many tools the subagent used
- `usage`: Detailed token breakdown including cache hits

**Background Tasks vs. Subagents:**
- Background bash commands use `backgroundTaskId` (e.g., "b4f8b50")
- Subagents use `agentId` (e.g., "a9e0cc6") and include performance metrics

### Example Log File

**File**: `~/.claude/projects/-Users-jessitron-code-jessitron-race/c1fe70c7-776f-453b-bda9-d59c477f41d9.jsonl`
- **Size**: 1.3M
- **Date**: January 27, 2026
- **Total entries**: 401 lines
- **Breakdown**:
  - 96 assistant messages
  - 53 user messages
  - 229 progress events (tool usage, hooks)
  - 12 system messages
  - 11 file history snapshots
- **Topic**: Integrating Honeycomb tracing into a FastCart e-commerce simulator

## Project Goals

Parse Claude Code conversation logs to analyze:
- What tools Claude used during a conversation
- How much time was spent on different activities
- The conversation flow and branching
- Tool usage patterns
- Thinking time vs. execution time
- Success/failure rates of different operations
- Hook execution and timing

## Example Data

An example conversation log is included in `example/race-honeycomb-integration.jsonl`:
- Original session: January 27, 2026
- 1.3M file, 401 log entries
- Topic: Integrating Honeycomb tracing into FastCart simulator
- Includes full conversation with tool uses, thinking blocks, and results

## Visualization Ideas

The conversation logs can be visualized in multiple ways to understand Claude's activity:

### 1. Tree/Hierarchy View → Honeycomb Traces ⭐

The `parentUuid` relationships in the logs naturally form a tree structure that maps perfectly to distributed traces! Each message and tool use becomes a span, with parent-child relationships preserved.

```
📝 User: "Can you see the logs?"
 └─ 🤖 Assistant: thinking... [150ms, 50 tokens]
 └─ 🤖 Assistant: "Let me check"
    └─ 🔧 Bash: ls ~/.claude [3s]
       └─ ✅ Result: [directory listing]
    └─ 🔧 Bash: ls telemetry [1s]
       └─ ✅ Result: [files]
 └─ 🤖 Assistant: "Yes, I found them!" [200ms, 100 tokens]

📝 User: "Look at race project"
 └─ 🤖 Assistant: thinking...
    └─ 🔧 Task: Explore agent
       └─ [subagent activity: 13.6s, 12k tokens, 1 tool]
 └─ 🤖 Assistant response
```

**Trace attributes:**
- Span name: message type or tool name
- Duration: from timestamps
- Attributes: tokens used, cache hits, tool parameters, error status
- Parent/child: from parentUuid relationships

### 2. Comic Strip Style → Teaching Tool ⭐

Visual representation with panels showing each conversation turn, perfect for understanding Claude's behavior and teaching by example:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  👤 User            │  │  🤖 Claude          │  │  🤖 Claude          │
│                     │  │                     │  │                     │
│ "Can you see the    │→ │ 💭 [thinking...]    │→ │ 🔧 Running:         │
│  logs in ~/.claude?"│  │                     │  │  $ ls ~/.claude     │
│                     │  │ ⏱️  150ms           │  │  ⏱️  3s             │
│                     │  │ 🪙 50 tokens        │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐
│  🤖 Claude          │  │  🤖 Claude          │
│                     │  │                     │
│ ✅ "Yes! I found    │  │ 🤖→🤖 Spawning      │
│  them in these      │  │  Explore agent      │
│  directories..."    │  │  ⏱️  13.6s          │
│                     │  │  🪙 12k tokens      │
│ ⏱️  200ms           │  │  🔧 1 tool used     │
│ 🪙 100 tokens       │  │                     │
└─────────────────────┘  └─────────────────────┘
```

### Other Visualization Options

- **Swim Lane Diagram**: Different horizontal lanes for User, Assistant, Tools, and Subagents
- **Timeline with Metrics**: Chronological view with duration and token usage
- **Mermaid Sequence Diagram**: Standard sequence diagram format
- **Token/Time Flow**: Sankey diagram showing where time and tokens are spent

## Getting Started

### Generate all example comics

```
./run
```

Builds the TypeScript sources, generates a comic HTML for every `example/*.jsonl`, writes outputs to `output/`, and prints a `file://` link to each comic.

### Generate one comic

```
npm run comic -- <path-to-jsonl> [output-dir]
```

The pipeline has two steps you can also invoke separately:

```
npm run comic -- panels <path-to-jsonl>       # step 1: JSONL → editable panels JSON
npm run comic -- html <path-to-panels.json>   # step 2: panels JSON → HTML
```

If a sibling directory `<basename>/subagents/agent-*.jsonl` exists next to the input file, subagent logs are discovered and embedded automatically.

### Other scripts

- `npm run parse -- <path-to-jsonl>` — parse and print stats (see `src/main.ts`)
- `npm run preview -- <path-to-jsonl>` — preview output (see `src/preview.ts`)
