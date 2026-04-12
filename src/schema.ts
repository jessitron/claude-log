// The fields we know about and actively use, organized by record type.
// Anything not listed here gets reported as a schema observation.

export const KNOWN_RECORD_TYPES = [
  "user",
  "assistant",
  "system",
  "progress",
  "file-history-snapshot",
  "queue-operation",
  "attachment",
] as const;

export type KnownRecordType = (typeof KNOWN_RECORD_TYPES)[number];

// Fields common to most record types (except file-history-snapshot and queue-operation)
const COMMON_FIELDS = [
  "type",
  "uuid",
  "parentUuid",
  "timestamp",
  "sessionId",
  "isSidechain",
  "cwd",
  "gitBranch",
  "slug",
  "version",
  "userType",
  "entrypoint",
] as const;

// Fields we know about per record type
export const KNOWN_FIELDS: Record<string, readonly string[]> = {
  user: [
    ...COMMON_FIELDS,
    "message",
    "isMeta",
    "permissionMode",
    "toolUseResult",
    "sourceToolAssistantUUID",
    "thinkingMetadata",
    "todos",
    "promptId",
    "origin",
  ],
  assistant: [...COMMON_FIELDS, "message", "requestId"],
  system: [
    ...COMMON_FIELDS,
    "content",
    "subtype",
    "level",
    "isMeta",
    "stopReason",
    "durationMs",
    "hookCount",
    "hookErrors",
    "hookInfos",
    "hasOutput",
    "preventedContinuation",
    "toolUseID",
    "cause",
    "error",
    "maxRetries",
    "retryAttempt",
    "retryInMs",
    "messageCount",
  ],
  progress: [
    ...COMMON_FIELDS,
    "data",
    "toolUseID",
    "parentToolUseID",
  ],
  "file-history-snapshot": ["type", "messageId", "snapshot", "isSnapshotUpdate"],
  "queue-operation": ["type", "sessionId", "timestamp", "content", "operation"],
  attachment: [
    ...COMMON_FIELDS,
    "attachment",
  ],
};

// Fields we know about inside message objects (for user and assistant types)
export const KNOWN_MESSAGE_FIELDS = {
  user: ["role", "content"],
  assistant: [
    "role",
    "content",
    "id",
    "model",
    "type",
    "usage",
    "stop_reason",
    "stop_sequence",
  ],
} as const;

// Content block types we know about inside message.content arrays
export const KNOWN_CONTENT_BLOCK_TYPES = [
  "text",
  "tool_use",
  "tool_result",
  "thinking",
] as const;

// Usage fields we know about
export const KNOWN_USAGE_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "cache_creation",
  "service_tier",
] as const;
