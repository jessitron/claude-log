// CLI: parse a JSONL conversation log and send traces to Honeycomb
import { parseConversationLog } from "./parser.js";
import { buildConversation } from "./build-conversation.js";
import { conversationToSpans, sendToHoneycomb } from "./emit-traces.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run trace -- <path-to-jsonl>");
    console.error("");
    console.error("Requires HONEYCOMB_API_KEY env var (source .be first)");
    process.exit(1);
  }

  const apiKey = process.env.HONEYCOMB_API_KEY;
  if (!apiKey) {
    console.error("HONEYCOMB_API_KEY not set. Run: source .be");
    process.exit(1);
  }

  const dataset = process.env.HONEYCOMB_DATASET || "claude-code-logs";

  console.log(`Parsing: ${filePath}`);
  const result = await parseConversationLog(filePath);
  const conversation = buildConversation(result);

  console.log(`Built conversation: ${conversation.turns.length} turns`);
  console.log(`Session: ${conversation.metadata.sessionId}`);
  console.log(`Model: ${conversation.metadata.model}`);

  const spans = conversationToSpans(conversation);
  console.log(`Generated ${spans.length} spans`);

  await sendToHoneycomb(spans, apiKey, dataset);

  // Print schema observations if any
  if (!result.observations.isEmpty()) {
    console.log(`\nSchema observations:\n${result.observations.summary()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
