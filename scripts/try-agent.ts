/**
 * try-agent.ts
 * What: sends one question to Budget Buddy and prints the reply as it streams.
 * Why: lets you test the agent in the terminal before any web code exists.
 * Run it with: npm run agent -- "your question"
 */
import { run } from "@openai/agents";
import { budgetBuddy } from "../src/agent";

async function main() {
  const question = process.argv[2] ?? "Hi! What can you help me with?";

  const stream = await run(budgetBuddy, question, { stream: true });

  stream.toTextStream({ compatibleWithNodeStreams: true }).pipe(process.stdout);

  await stream.completed;
  console.log("\n\n[done]");
}

main().catch((error) => {
  console.error("Agent failed:", error);
  process.exit(1);
});