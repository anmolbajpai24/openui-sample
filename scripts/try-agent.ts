/**
 * try-agent.ts
 * What: sends one question to Budget Buddy and prints the reply as it streams.
 * Why: lets you test the agent in the terminal, without the browser.
 * Run it with: npm run agent -- "your question"
 */
import { run } from "@openai/agents";
import { budgetBuddy } from "../src/agent";

async function main() {
  const question = process.argv[2] ?? "Hi! What can you help me with?";

  const result = await run(budgetBuddy, question, { stream: true });

  for await (const delta of result.toTextStream()) {
    process.stdout.write(delta);
  }
  console.log("\n\n[done]");
}

main().catch((error) => {
  console.error("Agent failed:", error);
  process.exit(1);
});
