// Turn a flat list of conversation records into comic panels.
//
// Panel types:
//   human-speech  — what the user typed (real prompts, not tool results or meta)
//   claude-speech — what Claude said in text blocks
//   claude-think  — thinking blocks (shown as thought bubbles)
//   action-montage — a burst of tool uses grouped together
//   narrator      — system events worth showing (errors, cost, etc.)

import type { ConversationRecord, ContentBlock } from "./parser.js";

export type PanelType =
  | "human-speech"
  | "claude-speech"
  | "claude-think"
  | "action-montage"
  | "narrator"
  | "notification";

export interface ToolDetail {
  name: string;
  summary: string; // short description of what the tool did
  output?: string; // tool result output, if available
  subpanels?: Panel[]; // for Agent tools: the subagent's conversation as panels
  agentType?: string;  // e.g. "Explore"
  totalInputTokens?: number; // input_tokens + cache_creation + cache_read for this tool's assistant call
  outputTokens?: number; // output_tokens generated on this tool's assistant call
}

export interface Panel {
  type: PanelType;
  lines: string[];       // the text content to display
  toolNames?: string[];  // for action-montage: which tools were used
  toolDetails?: ToolDetail[]; // per-tool detail for expandable view
  lineNumbers: number[]; // source line numbers for traceability
  sourceFile?: string;   // basename of JSONL file these records came from
  totalInputTokens?: number; // for single-record panels: input + cache_creation + cache_read
  outputTokens?: number; // for single-record panels: output_tokens from usage
  queued?: boolean;      // rendered from an enqueue or mid-turn async injection;
                         // hidden by default, revealed via the 'q' toggle
}

export interface ConversationTotals {
  inputTokens: number;
  outputTokens: number;
  messageCount: number; // how many unique assistant messages contributed
}

// Sum token usage across an entire conversation, deduped by message.id.
// One assistant message often spans multiple JSONL records (one per content block),
// but all carry the same usage block — we want to count each API call once.
export function computeTokenTotals(records: ConversationRecord[]): ConversationTotals {
  const seen = new Map<string, { input: number; output: number }>();
  for (const record of records) {
    if (record.type !== "assistant") continue;
    const msg = record.raw.message as
      | { id?: string; usage?: Record<string, unknown> }
      | undefined;
    const id = msg?.id;
    const usage = msg?.usage;
    if (!id || !usage) continue;
    if (seen.has(id)) continue;
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    const input =
      num(usage.input_tokens) +
      num(usage.cache_creation_input_tokens) +
      num(usage.cache_read_input_tokens);
    const output = num(usage.output_tokens);
    seen.set(id, { input, output });
  }
  let inputTokens = 0;
  let outputTokens = 0;
  for (const { input, output } of seen.values()) {
    inputTokens += input;
    outputTokens += output;
  }
  return { inputTokens, outputTokens, messageCount: seen.size };
}

// Per-call token usage. Input total = fresh input + tokens written to cache + tokens read from cache.
function extractTokenUsage(record: ConversationRecord): {
  totalInputTokens?: number;
  outputTokens?: number;
} {
  if (record.type !== "assistant") return {};
  const msg = record.raw.message as { usage?: Record<string, unknown> } | undefined;
  const usage = msg?.usage;
  if (!usage) return {};
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const totalInput =
    num(usage.input_tokens) +
    num(usage.cache_creation_input_tokens) +
    num(usage.cache_read_input_tokens);
  const output = num(usage.output_tokens);
  return {
    totalInputTokens: totalInput > 0 ? totalInput : undefined,
    outputTokens: output > 0 ? output : undefined,
  };
}

// Records we skip entirely — they're noise for a comic
function isSkippable(record: ConversationRecord): boolean {
  if (record.type === "progress") return true;
  if (record.type === "file-history-snapshot") return true;
  // queue-operation "enqueue" = human typed while Claude was working. Show those!
  if (record.type === "queue-operation" && record.raw.operation !== "enqueue") return true;
  if (record.type === "attachment") {
    // Task-notification attachments are how Claude "sees" a background-task
    // completion that arrived mid-turn. Keep those; skip everything else.
    const att = record.raw.attachment as { type?: string; commandMode?: string } | undefined;
    if (att?.type === "queued_command" && att?.commandMode === "task-notification") {
      return false;
    }
    return true;
  }
  // user records that are tool results or meta (system reminders, etc.)
  if (record.type === "user" && record.raw.toolUseResult) return true;
  if (record.type === "user" && record.raw.isMeta) return true;
  return false;
}

function extractUserText(record: ConversationRecord): string {
  const msg = record.raw.message as { content?: unknown } | undefined;
  if (!msg?.content) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("\n");
  }
  return "";
}

function extractAssistantBlocks(record: ConversationRecord): ContentBlock[] {
  const msg = record.raw.message as { content?: ContentBlock[] } | undefined;
  if (!msg?.content || !Array.isArray(msg.content)) return [];
  return msg.content;
}

// Interesting system records get narrator panels
function isInterestingSystem(record: ConversationRecord): boolean {
  const subtype = record.raw.subtype as string | undefined;
  if (subtype === "api_error") return true;
  if (subtype === "turn_duration") return false; // boring
  if (subtype === "stop_hook_summary") return false;
  // If it has user-visible content, show it
  if (record.raw.content && typeof record.raw.content === "string") {
    const content = record.raw.content;
    if (content.length > 0 && content.length < 500) return true;
  }
  return false;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function shortenPath(filePath: string): string {
  const parts = filePath.split("/");
  // Show last 2-3 segments
  if (parts.length <= 3) return filePath;
  return "…/" + parts.slice(-3).join("/");
}

function summarizeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
    case "Write":
      return shortenPath(String(input.file_path || ""));
    case "Edit":
      return shortenPath(String(input.file_path || ""));
    case "Bash": {
      const cmd = truncate(String(input.command || ""), 100);
      if (input.description) return `${input.description}\n$ ${cmd}`;
      return `$ ${cmd}`;
    }
    case "Grep":
      return `/${input.pattern || ""}/${input.glob ? " in " + input.glob : ""}`;
    case "Glob":
      return String(input.pattern || "");
    case "Agent":
      return String(input.description || input.prompt || "").slice(0, 100);
    default:
      // For MCP tools or unknowns, show the first string-valued input
      for (const v of Object.values(input)) {
        if (typeof v === "string" && v.length > 0) return truncate(v, 100);
      }
      return "";
  }
}

// What type of content does this assistant record's single block carry?
function assistantBlockType(record: ConversationRecord): string | null {
  const blocks = extractAssistantBlocks(record);
  if (blocks.length === 0) return null;
  return blocks[0].type;
}

// Build a map from tool_use id → result text, so we can show output in montages.
function buildToolResultIndex(records: ConversationRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const record of records) {
    if (record.type !== "user" || !record.raw.toolUseResult) continue;
    const msg = record.raw.message as { content?: unknown };
    if (!msg?.content) continue;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ((block as any).type === "tool_result" && (block as any).tool_use_id) {
          const id = (block as any).tool_use_id;
          const content = (block as any).content;
          if (typeof content === "string") {
            index.set(id, content);
          } else if (Array.isArray(content)) {
            const text = content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text || "")
              .join("\n");
            if (text) index.set(id, text);
          }
        }
      }
    }
  }
  return index;
}

// Build a map from tool_use id → agentId, so we can link Agent calls to subagent files.
export interface AgentInfo {
  agentId: string;
  agentType: string;
}

function buildAgentIndex(records: ConversationRecord[]): Map<string, AgentInfo> {
  const index = new Map<string, AgentInfo>();
  for (const record of records) {
    if (record.type !== "user" || !record.raw.toolUseResult) continue;
    const result = record.raw.toolUseResult as Record<string, unknown>;
    if (!result.agentId) continue;
    // Find the matching tool_use_id from the message content
    const msg = record.raw.message as { content?: unknown };
    if (Array.isArray(msg?.content)) {
      for (const block of msg.content) {
        if ((block as any).type === "tool_result" && (block as any).tool_use_id) {
          index.set((block as any).tool_use_id, {
            agentId: String(result.agentId),
            agentType: String(result.agentType || "Agent"),
          });
        }
      }
    }
  }
  return index;
}

// subagentPanels: map from agentId → Panel[] (pre-parsed subagent conversations)
export function groupIntoPanels(
  records: ConversationRecord[],
  subagentPanels?: Map<string, Panel[]>,
  sourceFile?: string
): Panel[] {
  const panels: Panel[] = [];
  const toolResults = buildToolResultIndex(records);
  const agentIndex = buildAgentIndex(records);

  // Filter to just the records we care about, so index-based look-ahead is clean.
  const visible = records.filter((r) => !isSkippable(r));

  // We accumulate tool_use blocks into an action montage.
  // When we hit something that isn't a tool_use, we flush the montage.
  let pendingTools: {
    name: string;
    summary: string;
    output?: string;
    subpanels?: Panel[];
    agentType?: string;
    lineNumber: number;
    totalInputTokens?: number;
    outputTokens?: number;
  }[] = [];

  // Notifications that arrive mid-montage get deferred until after the montage flushes
  let deferredNotifications: Panel[] = [];

  function flushMontage() {
    if (pendingTools.length === 0) {
      // No montage to flush, but emit any deferred notifications anyway
      if (deferredNotifications.length > 0) {
        panels.push(...deferredNotifications);
        deferredNotifications = [];
      }
      return;
    }
    const toolNames = pendingTools.map((t) => t.name);
    // Deduplicate and count for display
    const counts = new Map<string, number>();
    for (const name of toolNames) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const lines = Array.from(counts.entries()).map(([name, count]) =>
      count > 1 ? `${name} ×${count}` : name
    );
    const toolDetails = pendingTools.map((t) => ({
      name: t.name,
      summary: t.summary,
      output: t.output,
      subpanels: t.subpanels,
      agentType: t.agentType,
      totalInputTokens: t.totalInputTokens,
      outputTokens: t.outputTokens,
    }));
    panels.push({
      type: "action-montage",
      lines,
      toolNames: Array.from(counts.keys()),
      toolDetails,
      lineNumbers: pendingTools.map((t) => t.lineNumber),
    });
    pendingTools = [];

    // Emit notifications that arrived during this montage
    if (deferredNotifications.length > 0) {
      panels.push(...deferredNotifications);
      deferredNotifications = [];
    }
  }

  for (let i = 0; i < visible.length; i++) {
    const record = visible[i];

    // Enqueued messages: human typing while Claude works. Marked queued so the
    // typed-at-time panel is hidden by default; the same text will re-appear
    // as a regular "user" record at the dequeued position (where Claude
    // actually receives it) and that panel renders normally.
    if (record.type === "queue-operation") {
      const content = record.raw.content;
      if (typeof content === "string" && content.trim()) {
        // Task notifications: skip here — they re-appear either as a user
        // record (delivered at next turn) or as a queued_command attachment
        // (injected mid-turn). Emitting from the enqueue would show the
        // notification before Claude has seen it.
        if (!content.includes("<task-notification>")) {
          // Don't flush montage — this happened *during* the action!
          panels.push({
            type: "human-speech",
            lines: [content],
            lineNumbers: [record.lineNumber],
            queued: true,
          });
        }
      }
      continue;
    }

    // Task-notification attachments: injected mid-turn when a background task
    // completes while Claude is already running. This is the "Claude sees it"
    // moment, equivalent to a user-record-wrapped task-notification.
    if (record.type === "attachment") {
      const att = record.raw.attachment as { type?: string; commandMode?: string; prompt?: string } | undefined;
      if (att?.type === "queued_command" && att?.commandMode === "task-notification" && typeof att.prompt === "string") {
        const summaryMatch = att.prompt.match(/<summary>(.*?)<\/summary>/s);
        if (summaryMatch) {
          const notif: Panel = {
            type: "notification",
            lines: [summaryMatch[1].trim()],
            lineNumbers: [record.lineNumber],
            queued: true,
          };
          if (pendingTools.length > 0) {
            deferredNotifications.push(notif);
          } else {
            panels.push(notif);
          }
        }
      }
      continue;
    }

    if (record.type === "user") {
      const text = extractUserText(record);

      // Task notifications: background tasks reporting back
      if (text.includes("<task-notification>")) {
        const summaryMatch = text.match(/<summary>(.*?)<\/summary>/s);
        if (summaryMatch) {
          const notif: Panel = {
            type: "notification",
            lines: [summaryMatch[1].trim()],
            lineNumbers: [record.lineNumber],
            queued: true,
          };
          // Defer until after montage flushes — notification arrived during work
          if (pendingTools.length > 0) {
            deferredNotifications.push(notif);
          } else {
            panels.push(notif);
          }
        }
        continue;
      }

      flushMontage();
      if (text.trim()) {
        // Strip XML-looking command wrappers from slash commands
        const cleaned = text.replace(/<\/?command-[^>]*>/g, "").trim();
        if (cleaned) {
          panels.push({
            type: "human-speech",
            lines: [cleaned],
            lineNumbers: [record.lineNumber],
          });
        }
      }
      continue;
    }

    if (record.type === "assistant") {
      const blocks = extractAssistantBlocks(record);
      const block = blocks[0]; // one block per record in practice
      if (!block) continue;

      if (block.type === "text") {
        const text = (block as any).text || "";
        if (!text.trim()) continue;

        // Heuristic: short text followed by a tool_use record is inner monologue,
        // not real dialogue. "Let me read the file." → thought bubble.
        const nextRecord = visible[i + 1];
        const followedByTool =
          nextRecord?.type === "assistant" &&
          assistantBlockType(nextRecord) === "tool_use";
        const isShort = text.trim().length < 150;

        if (isShort && followedByTool) {
          flushMontage();
          panels.push({
            type: "claude-think",
            lines: [text.trim()],
            lineNumbers: [record.lineNumber],
            ...extractTokenUsage(record),
          });
        } else {
          flushMontage();
          panels.push({
            type: "claude-speech",
            lines: [text],
            lineNumbers: [record.lineNumber],
            ...extractTokenUsage(record),
          });
        }
      } else if (block.type === "thinking") {
        flushMontage();
        const thinking = (block as any).thinking || "";
        if (thinking.trim()) {
          panels.push({
            type: "claude-think",
            lines: [truncate(thinking, 300)],
            lineNumbers: [record.lineNumber],
            ...extractTokenUsage(record),
          });
        }
      } else if (block.type === "tool_use") {
        const toolName = (block as any).name || "unknown_tool";
        const input = (block as any).input || {};
        const summary = summarizeTool(toolName, input);
        const toolId = (block as any).id as string | undefined;
        const output = toolId ? toolResults.get(toolId) : undefined;

        // For Agent calls, look up subagent panels
        let agentSubpanels: Panel[] | undefined;
        let agentType: string | undefined;
        if (toolName === "Agent" && toolId) {
          const agentInfo = agentIndex.get(toolId);
          if (agentInfo && subagentPanels) {
            agentSubpanels = subagentPanels.get(agentInfo.agentId);
            agentType = agentInfo.agentType;
          }
        }

        pendingTools.push({
          name: toolName,
          summary,
          output,
          subpanels: agentSubpanels,
          agentType,
          lineNumber: record.lineNumber,
          ...extractTokenUsage(record),
        });
      }
      continue;
    }

    if (record.type === "system") {
      if (isInterestingSystem(record)) {
        flushMontage();
        const content = String(record.raw.content || "");
        const subtype = record.raw.subtype as string | undefined;
        const prefix = subtype === "api_error" ? "⚠️ API Error" : "";
        panels.push({
          type: "narrator",
          lines: [prefix, truncate(content, 200)].filter(Boolean),
          lineNumbers: [record.lineNumber],
        });
      }
      continue;
    }
  }

  flushMontage(); // flush any trailing tool uses

  if (sourceFile) {
    for (const p of panels) p.sourceFile = sourceFile;
  }

  return panels;
}
