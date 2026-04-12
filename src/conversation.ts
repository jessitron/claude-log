// Standardized conversation format
// Designed to support multiple presentations: trace tree, webcomic, timeline, etc.

/**
 * A full parsed conversation, ready for rendering in different formats.
 */
export interface Conversation {
  metadata: ConversationMetadata;
  turns: Turn[];
}

/**
 * Top-level info about the conversation session.
 */
export interface ConversationMetadata {
  sessionId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationMs: number;
  model: string;
  version: string;    // Claude Code version
  cwd: string;        // working directory
  gitBranch: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheRead: number;
  totalCacheCreation: number;
}

/**
 * A Turn is one human→assistant exchange.
 * The human says something, and the assistant responds (possibly with many tool calls).
 * This is the primary unit of a "comic panel" or "trace span."
 */
export interface Turn {
  turnNumber: number;
  humanMessage: HumanMessage;
  assistantResponse: AssistantResponse;
  startTime: string;
  endTime: string;
  durationMs: number;
  lineRange: [number, number]; // first and last line numbers in the JSONL
}

/**
 * What the human said to start this turn.
 */
export interface HumanMessage {
  text: string;         // the human's text, or a summary for tool results
  isToolResult: boolean;
  isMeta: boolean;      // system-injected user messages
  lineNumber: number;
}

/**
 * Everything the assistant did in response to a human message.
 * May include thinking, text output, and tool calls (which can nest).
 */
export interface AssistantResponse {
  /** High-level actions the assistant took, in order */
  steps: Step[];
  /** Total tokens used in this response (sum across all assistant records) */
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreation: number;
  /** How the turn ended */
  stopReason: string; // "end_turn", "tool_use", "max_tokens"
  /** Any API errors that occurred during this turn */
  errors: ErrorEvent[];
}

/**
 * A Step is one visible thing the assistant did.
 * Steps form a flat list (not nested) — tool call/result pairs are one step.
 */
export type Step =
  | ThinkingStep
  | TextStep
  | ToolCallStep
  | AgentStep;

export interface ThinkingStep {
  kind: "thinking";
  text: string;
  lineNumber: number;
}

export interface TextStep {
  kind: "text";
  text: string;
  lineNumber: number;
}

export interface ToolCallStep {
  kind: "tool_call";
  toolName: string;
  /** Summarized input — not the full input blob, but the key info */
  inputSummary: string;
  /** The result, summarized */
  outputSummary: string;
  /** Was this tool call successful? */
  success: boolean;
  lineNumber: number;
  resultLineNumber: number;
}

export interface AgentStep {
  kind: "agent";
  description: string;
  /** Agent tasks can contain their own steps */
  steps: Step[];
  lineNumber: number;
  resultLineNumber: number;
}

/**
 * An error that occurred during a turn (API errors, retries, etc.)
 */
export interface ErrorEvent {
  message: string;
  lineNumber: number;
  isRetry: boolean;
}
