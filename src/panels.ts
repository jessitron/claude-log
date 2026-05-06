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
  | "spawn-agent"
  | "narrator"
  | "recap"
  | "notification";

export interface ToolDetail {
  name: string;
  summary: string; // short description of what the tool did
  output?: string; // tool result output, if available
  subpanels?: Panel[]; // for Agent tools: the subagent's conversation as panels
  agentType?: string;  // e.g. "Explore"
  toolUseId?: string;  // tool_use block id; used to link notifications back to their origin
}

// A group of tool calls emitted by one assistant message. Parallel calls from
// the same message.id form a single batch; sequential round-trips produce
// separate batches. Tokens on the batch are the API call that produced it.
export interface MontageBatch {
  tools: ToolDetail[];
  totalInputTokens?: number;
  outputTokens?: number;
}

export interface Panel {
  type: PanelType;
  lines: string[];       // the text content to display
  toolNames?: string[];  // for action-montage: which tools were used
  toolDetails?: ToolDetail[]; // per-tool detail for expandable view
  batches?: MontageBatch[]; // for action-montage: tools grouped by message.id
  lineNumbers: number[]; // source line numbers for traceability
  sourceFile?: string;   // basename of JSONL file these records came from
  totalInputTokens?: number; // for assistant-text/think panels: input + cache_creation + cache_read
  outputTokens?: number; // for assistant-text/think panels: output_tokens from usage
  queued?: boolean;      // rendered from an enqueue or mid-turn async injection;
                         // hidden by default, revealed via the 'q' toggle
  originToolUseId?: string; // for notifications: the tool_use id of the Bash call
                            // that spawned the background task reporting in
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

// One assistant message = one API call = one billed turn. Pass 1 collapses
// each message's records into a single MessagePlan that says what panels
// the message produces and where its tokens land. Pass 2 (the emission
// loop) consults the plan instead of reconstructing these decisions from
// loop state — so merge rules, token attribution, and phantom handling
// live in one place.
//
// tokenOwner values:
//   "think"       — the message's think panel carries the badge
//                   (any visible thinking; hidden thinking merges in)
//   "speech"      — the message's speech panel carries the badge
//                   (text without visible thinking; any hidden thinking
//                    becomes a separate "…" panel without a badge)
//   "tools"       — the message has only tool_use (and maybe hidden
//                   thinking); the montage batch carries the badge
//   "hidden-only" — turn has nothing but hidden thinking; pass 2 decides
//                   phantom-in-montage vs. standalone "…" panel based on
//                   sequence state. Either way, this message's badge
//                   rides on whatever it produces.
export interface MessagePlan {
  messageId: string;
  hasVisibleThinking: boolean;
  hasText: boolean;
  hasToolUse: boolean;
  hasHidden: boolean;
  tokenOwner: "think" | "speech" | "tools" | "hidden-only";
  usage: { totalInputTokens?: number; outputTokens?: number };
}

function buildMessagePlans(
  records: ConversationRecord[]
): Map<string, MessagePlan> {
  type Acc = {
    hasVisibleThinking: boolean;
    hasText: boolean;
    hasToolUse: boolean;
    hasHidden: boolean;
    usage: { totalInputTokens?: number; outputTokens?: number };
  };
  const acc = new Map<string, Acc>();
  for (const r of records) {
    if (r.type !== "assistant") continue;
    const msg = r.raw.message as { id?: string; content?: ContentBlock[] } | undefined;
    const id = msg?.id;
    if (!id) continue;
    const entry =
      acc.get(id) ??
      {
        hasVisibleThinking: false,
        hasText: false,
        hasToolUse: false,
        hasHidden: false,
        usage: {},
      };
    const blocks = Array.isArray(msg?.content) ? msg!.content : [];
    for (const b of blocks) {
      if (b.type === "thinking") {
        const t = ((b as any).thinking || "").trim();
        if (t) entry.hasVisibleThinking = true;
        else entry.hasHidden = true;
      }
      if (b.type === "text" && ((b as any).text || "").trim()) entry.hasText = true;
      if (b.type === "tool_use") entry.hasToolUse = true;
    }
    // Streaming records snapshot output_tokens as they grow — keep the max.
    const u = extractTokenUsage(r);
    entry.usage = {
      totalInputTokens:
        Math.max(entry.usage.totalInputTokens ?? 0, u.totalInputTokens ?? 0) || undefined,
      outputTokens:
        Math.max(entry.usage.outputTokens ?? 0, u.outputTokens ?? 0) || undefined,
    };
    acc.set(id, entry);
  }

  const plans = new Map<string, MessagePlan>();
  for (const [id, e] of acc) {
    let tokenOwner: MessagePlan["tokenOwner"];
    if (e.hasVisibleThinking) tokenOwner = "think";
    else if (e.hasText) tokenOwner = "speech";
    else if (e.hasToolUse) tokenOwner = "tools";
    else tokenOwner = "hidden-only";
    plans.set(id, {
      messageId: id,
      hasVisibleThinking: e.hasVisibleThinking,
      hasText: e.hasText,
      hasToolUse: e.hasToolUse,
      hasHidden: e.hasHidden,
      tokenOwner,
      usage: e.usage,
    });
  }
  return plans;
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
    if (record.raw.content.length > 0) return true;
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
  const plans = buildMessagePlans(records);

  // Filter to just the records we care about, so index-based look-ahead is clean.
  const visible = records.filter((r) => !isSkippable(r));

  // Per-message panel handles. Reset whenever the messageId changes. Lets
  // multiple records from one assistant message (one thinking record + one
  // text record, say) extend the same panel without a global "what panel
  // did I last emit" switch.
  let currentMessageId: string | undefined;
  let currentThinkPanel: Panel | null = null;
  let currentSpeechPanel: Panel | null = null;
  const enterMessage = (id: string | undefined) => {
    if (id !== currentMessageId) {
      currentMessageId = id;
      currentThinkPanel = null;
      currentSpeechPanel = null;
    }
  };
  const leaveMessage = () => {
    currentMessageId = undefined;
    currentThinkPanel = null;
    currentSpeechPanel = null;
  };

  // We accumulate tool_use blocks into an action montage.
  // When we hit something that isn't a tool_use, we flush the montage.
  // messageId lets us split the montage into batches: tools from the same
  // assistant message are parallel; different message.ids are sequential
  // round-trips.
  //
  // Phantom entries represent a hidden-thinking-only turn between tool
  // batches — a round-trip the user shouldn't see as a separate panel, but
  // whose tokens should ride on a ↻ marker inside the montage.
  let pendingTools: {
    name: string;
    summary: string;
    output?: string;
    subpanels?: Panel[];
    agentType?: string;
    lineNumber: number;
    messageId?: string;
    isPhantom?: boolean;
    toolUseId?: string;
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
    // Phantoms don't count as real tools for the montage summary, but they
    // do need their own batch so their tokens show as a ↻ marker.
    const realTools = pendingTools.filter((t) => !t.isPhantom);
    const counts = new Map<string, number>();
    for (const t of realTools) counts.set(t.name, (counts.get(t.name) || 0) + 1);
    const lines = Array.from(counts.entries()).map(([name, count]) =>
      count > 1 ? `${name} ×${count}` : name
    );
    const toolDetails = realTools.map((t) => ({
      name: t.name,
      summary: t.summary,
      output: t.output,
      subpanels: t.subpanels,
      agentType: t.agentType,
      toolUseId: t.toolUseId,
    }));

    // Group consecutive tools by messageId. Tools with the same id were
    // emitted in parallel (one assistant message, one usage block); each new
    // id is a sequential round-trip. Phantoms always form their own batch.
    //
    // Tokens on a batch belong there ONLY if the batch's message produced no
    // thought/speech panel elsewhere. Otherwise that panel already shows the
    // tokens and the batch should stay tokenless so we don't double-count.
    const batches: MontageBatch[] = [];
    let currentId: string | undefined;
    let realIdx = 0;
    for (let b = 0; b < pendingTools.length; b++) {
      const t = pendingTools[b];
      const plan = t.messageId ? plans.get(t.messageId) : undefined;
      if (t.isPhantom) {
        batches.push({
          tools: [],
          totalInputTokens: plan?.usage.totalInputTokens,
          outputTokens: plan?.usage.outputTokens,
        });
        currentId = t.messageId;
        continue;
      }
      if (batches.length === 0 || batches[batches.length - 1].tools.length === 0 || t.messageId !== currentId) {
        const ownsTokens = plan?.tokenOwner === "tools";
        batches.push({
          tools: [toolDetails[realIdx]],
          totalInputTokens: ownsTokens ? plan?.usage.totalInputTokens : undefined,
          outputTokens: ownsTokens ? plan?.usage.outputTokens : undefined,
        });
        currentId = t.messageId;
      } else {
        batches[batches.length - 1].tools.push(toolDetails[realIdx]);
      }
      realIdx++;
    }

    panels.push({
      type: "action-montage",
      lines,
      toolNames: Array.from(counts.keys()),
      toolDetails,
      batches,
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
          const originMatch = att.prompt.match(/<tool-use-id>(.*?)<\/tool-use-id>/s);
          const notif: Panel = {
            type: "notification",
            lines: [summaryMatch[1].trim()],
            lineNumbers: [record.lineNumber],
            originToolUseId: originMatch?.[1].trim(),
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
          const originMatch = text.match(/<tool-use-id>(.*?)<\/tool-use-id>/s);
          const notif: Panel = {
            type: "notification",
            lines: [summaryMatch[1].trim()],
            lineNumbers: [record.lineNumber],
            originToolUseId: originMatch?.[1].trim(),
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

      const msg = record.raw.message as { id?: string } | undefined;
      const msgId = msg?.id;
      const plan = msgId ? plans.get(msgId) : undefined;
      enterMessage(msgId);

      if (block.type === "text") {
        const text = (block as any).text || "";
        if (!text.trim()) continue;

        // If this message also has visible thinking, all its text rides on
        // the think panel (current behavior preserved). The think record
        // typically arrives first, but if text comes first we still create
        // the think panel here so subsequent thinking blocks merge in.
        if (plan?.hasVisibleThinking) {
          if (!currentThinkPanel) {
            flushMontage();
            currentThinkPanel = {
              type: "claude-think",
              lines: [],
              lineNumbers: [],
              ...(plan.tokenOwner === "think" ? plan.usage : {}),
            };
            panels.push(currentThinkPanel);
          }
          const lines = currentThinkPanel.lines;
          if (lines.length > 0 && lines[lines.length - 1] === "…") {
            lines[lines.length - 1] = "… " + text.trim();
          } else {
            lines.push(text.trim());
          }
          currentThinkPanel.lineNumbers.push(record.lineNumber);
          continue;
        }

        // Subsequent text record from the same message extends the same speech panel.
        if (currentSpeechPanel) {
          currentSpeechPanel.lines.push(text);
          currentSpeechPanel.lineNumbers.push(record.lineNumber);
          continue;
        }

        // Heuristic: short text followed by a tool_use record is inner monologue,
        // not real dialogue. "Let me read the file." → thought bubble.
        const nextRecord = visible[i + 1];
        const followedByTool =
          nextRecord?.type === "assistant" &&
          assistantBlockType(nextRecord) === "tool_use";
        const isShort = text.trim().length < 150;

        flushMontage();
        const type = isShort && followedByTool ? "claude-think" : "claude-speech";
        const tokens = plan?.tokenOwner === "speech" ? plan.usage : {};
        currentSpeechPanel = {
          type,
          lines: [type === "claude-think" ? text.trim() : text],
          lineNumbers: [record.lineNumber],
          ...tokens,
        };
        panels.push(currentSpeechPanel);
      } else if (block.type === "thinking") {
        // Omitted thinking (default on Opus 4.7): the `thinking` field is
        // empty but a `signature` is present. The model really thought;
        // the content is just encrypted for round-trip.
        const thinking = (block as any).thinking || "";
        const isHidden = !thinking.trim();
        const visibleLine = isHidden ? "…" : truncate(thinking, 300);

        // Case 1: message has visible thinking somewhere. All thinking
        // (visible + hidden) merges into one think panel.
        if (plan?.hasVisibleThinking) {
          if (!currentThinkPanel) {
            flushMontage();
            currentThinkPanel = {
              type: "claude-think",
              lines: [visibleLine],
              lineNumbers: [record.lineNumber],
              ...(plan.tokenOwner === "think" ? plan.usage : {}),
            };
            panels.push(currentThinkPanel);
          } else {
            currentThinkPanel.lines.push(visibleLine);
            currentThinkPanel.lineNumbers.push(record.lineNumber);
          }
          continue;
        }

        // Case 2: hidden thinking on a message with text but no visible
        // thinking. Standalone "…" bubble without tokens; the text panel
        // will own the badge. (Checked before the hasToolUse case: if the
        // message also has tool_use, we still want the standalone "…".)
        if (isHidden && plan?.hasText) {
          if (currentThinkPanel) {
            currentThinkPanel.lines.push("…");
            currentThinkPanel.lineNumbers.push(record.lineNumber);
            continue;
          }
          flushMontage();
          currentThinkPanel = {
            type: "claude-think",
            lines: ["…"],
            lineNumbers: [record.lineNumber],
          };
          panels.push(currentThinkPanel);
          continue;
        }

        // Case 3: hidden thinking on a message that also has tool_use
        // (and no text, since that was Case 2). The tools own the tokens;
        // suppress the bubble and don't flush — the upcoming tool_use
        // should extend the current montage.
        if (isHidden && plan?.hasToolUse) {
          continue;
        }

        // Case 4: hidden-only turn (no text, no visible thinking, no
        // tools). Becomes either a phantom ↻ inside the current montage
        // (when wedged between tool batches) or a standalone "…" panel.
        if (isHidden && plan?.tokenOwner === "hidden-only") {
          let nextIsToolUse = false;
          for (let j = i + 1; j < visible.length; j++) {
            const next = visible[j];
            if (next.type === "assistant") {
              const nextMsg = next.raw.message as { id?: string } | undefined;
              if (nextMsg?.id === msgId) continue;
              nextIsToolUse = assistantBlockType(next) === "tool_use";
              break;
            }
            break;
          }
          if (pendingTools.length > 0 && nextIsToolUse) {
            pendingTools.push({
              name: "__phantom_thinking__",
              summary: "",
              lineNumber: record.lineNumber,
              messageId: msgId,
              isPhantom: true,
            });
            continue;
          }
          flushMontage();
          currentThinkPanel = {
            type: "claude-think",
            lines: [visibleLine],
            lineNumbers: [record.lineNumber],
            ...(plan?.usage ?? {}),
          };
          panels.push(currentThinkPanel);
          continue;
        }

        // Fallback: visible thinking on a message that somehow doesn't
        // have hasVisibleThinking set (shouldn't happen in practice).
        flushMontage();
        currentThinkPanel = {
          type: "claude-think",
          lines: [visibleLine],
          lineNumbers: [record.lineNumber],
          ...(plan?.usage ?? {}),
        };
        panels.push(currentThinkPanel);
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

        // Agent spawns get their own panel (not folded into an action-montage),
        // so they can render wider and with their own "Spawn Agent" header.
        if (agentSubpanels) {
          flushMontage();
          panels.push({
            type: "spawn-agent",
            lines: [agentType || "Agent"],
            toolDetails: [{
              name: toolName,
              summary,
              output,
              subpanels: agentSubpanels,
              agentType,
            }],
            lineNumbers: [record.lineNumber],
          });
        } else {
          pendingTools.push({
            name: toolName,
            summary,
            output,
            subpanels: agentSubpanels,
            agentType,
            lineNumber: record.lineNumber,
            messageId: msgId,
            toolUseId: toolId,
          });
        }
      }
      continue;
    }

    if (record.type === "system") {
      if (isInterestingSystem(record)) {
        flushMontage();
        const content = String(record.raw.content || "");
        const subtype = record.raw.subtype as string | undefined;
        if (subtype === "away_summary") {
          panels.push({
            type: "recap",
            lines: [content],
            lineNumbers: [record.lineNumber],
          });
        } else {
          const prefix = subtype === "api_error" ? "⚠️ API Error" : "";
          panels.push({
            type: "narrator",
            lines: [prefix, content].filter(Boolean),
            lineNumbers: [record.lineNumber],
          });
        }
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
