/**
 * agent.ts
 * What: defines our one agent, "Budget Buddy", and its one tool.
 * Why: the terminal script and the /api/chat route both import this same
 * agent, so there is exactly one place to change it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { Agent, tool, setDefaultOpenAIClient, setTracingDisabled } from "@openai/agents";
import { generateSystemPrompt, type LibrarySpec, type PromptOptions } from "@openuidev/lang-core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. Connect to OpenUI Gateway. Every model request goes to Gateway instead
//    of straight to OpenAI. This is the snippet from the Thesys console.
// ---------------------------------------------------------------------------
// Stop early with a clear message if the key is missing.
if (!process.env.THESYS_API_KEY) {
  throw new Error("THESYS_API_KEY is missing. Copy .env.example to .env.local and add your key.");
}

setDefaultOpenAIClient(
  new OpenAI({
    baseURL: "https://api.thesys.dev/v1/embed",
    apiKey: process.env.THESYS_API_KEY,
  }),
);

// The SDK uploads run traces to OpenAI by default, which needs an OpenAI key.
// We don't use one, so turn tracing off.
setTracingDisabled(true);

// ---------------------------------------------------------------------------
// 2. Mock data: one month of spending. Swap this for a real database later.
// ---------------------------------------------------------------------------
// "as const" keeps these as exact strings, which z.enum needs.
const CATEGORIES = [
  "rent",
  "groceries",
  "dining",
  "transport",
  "utilities",
  "subscriptions",
  "shopping",
] as const;

const transactions = [
  { date: "2026-10-01", description: "Rent", category: "rent", amount: 1200.0 },
  { date: "2026-10-02", description: "Metro pass", category: "transport", amount: 45.0 },
  { date: "2026-10-03", description: "Supermarket", category: "groceries", amount: 86.4 },
  { date: "2026-10-05", description: "Streaming service", category: "subscriptions", amount: 15.99 },
  { date: "2026-10-06", description: "Pizza night", category: "dining", amount: 42.0 },
  { date: "2026-10-09", description: "Electricity bill", category: "utilities", amount: 74.3 },
  { date: "2026-10-11", description: "Coffee and bagel", category: "dining", amount: 18.5 },
  { date: "2026-10-12", description: "Supermarket", category: "groceries", amount: 64.1 },
  { date: "2026-10-14", description: "Running shoes", category: "shopping", amount: 129.0 },
  { date: "2026-10-15", description: "Internet bill", category: "utilities", amount: 49.99 },
  { date: "2026-10-18", description: "Birthday dinner", category: "dining", amount: 63.2 },
  { date: "2026-10-19", description: "Rideshare", category: "transport", amount: 23.6 },
  { date: "2026-10-21", description: "Music subscription", category: "subscriptions", amount: 9.99 },
  { date: "2026-10-24", description: "Supermarket", category: "groceries", amount: 92.75 },
  { date: "2026-10-27", description: "Lunch with team", category: "dining", amount: 27.8 },
];

// Add up amounts, rounded to cents. JavaScript decimals drift:
// 74.3 + 49.99 gives 124.28999999999999, not 124.29.
const sumAmounts = (items: { amount: number }[]) =>
  Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

// ---------------------------------------------------------------------------
// 3. The tool: the model calls this when it needs numbers.
//    We do the maths here in code, so the model never has to add things up.
// ---------------------------------------------------------------------------
const getTransactions = tool({
  name: "get_transactions",
  description:
    "Get this month's transactions plus totals per category. Pass a category to get only that category, or null for everything.",
  parameters: z.object({
    category: z.enum(CATEGORIES).nullable().describe("One category to filter by, or null for all"),
  }),
  execute: async ({ category }) => {
    console.log(`\n[tool] get_transactions(${category ?? "all"})\n`);

    const items = category ? transactions.filter((item) => item.category === category) : transactions;

    const totalsByCategory = CATEGORIES.map((name) => ({
      category: name,
      total: sumAmounts(items.filter((item) => item.category === name)),
    })).filter((row) => row.total > 0);

    return {
      month: "October 2026",
      currency: "USD",
      total: sumAmounts(items),
      totalsByCategory,
      transactions: items,
    };
  },
});

const getBudgets = tool({
  name: "get_budgets",
  description: "Get the monthly budget limit for each category that has one.",
  parameters: z.object({}),
  execute: async () => {
    console.log("\n[tool] get_budgets()\n");

    return {
      currency: "USD",
      budgets: [
        { category: "groceries", limit: 300 },
        { category: "dining", limit: 120 },
        { category: "shopping", limit: 150 },
      ],
    };
  },
});

// ---------------------------------------------------------------------------
// 4. The instructions. Two parts:
//    - a description of our component library (made by `npm run spec`,
//      which also runs by itself before dev, build and agent, and takes a
//      while). Gateway reads it, writes the OpenUI Lang manual for the
//      model, and checks the model's output against it.
//    - our own rules for Budget Buddy.
// ---------------------------------------------------------------------------
// spec.json holds the library description plus its prompt options.
// generateSystemPrompt takes the two separately, so split them here.
const { promptOptions, ...library } = JSON.parse(
  readFileSync(join(process.cwd(), "src/generated/spec.json"), "utf8"),
) as LibrarySpec & { promptOptions?: PromptOptions };

const budgetBuddyRules = `
## Your role
You are Budget Buddy. You help people understand their spending.
- Always call get_transactions before answering a question about spending.
- Only use numbers that come from get_transactions. Never make up transactions or amounts.
- Don't calculate new numbers yourself. Show only numbers the tool returned.
- Show breakdowns as a chart and lists of transactions as a table.
- End every answer with a few buttons for useful next steps, such as "Show me dining".
`;

const instructions = generateSystemPrompt({
  cloud: true, // Gateway writes the manual. Without this it is written here, locally.
  library,
  promptOptions,
  instructions: budgetBuddyRules,
});

// ---------------------------------------------------------------------------
// 5. The agent itself.
// ---------------------------------------------------------------------------
export const budgetBuddy = new Agent({
  name: "Budget Buddy",
  instructions,
  // Any model Gateway offers. This free one has a daily request limit.
  model: "google/gemini-3.6-flash-free",
  tools: [getTransactions, getBudgets],
});
