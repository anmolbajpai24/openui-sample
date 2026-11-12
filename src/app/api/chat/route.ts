/**
 * route.ts (POST /api/chat)
 * What: the bridge between the chat screen and the agent. It receives the
 * conversation from the browser, runs Budget Buddy, and streams the reply
 * back as AG-UI events.
 * Why: the Agents SDK gives us plain pieces of text. OpenUI's chat screen
 * reads AG-UI events. Nothing converts one into the other, so we do it here.
 */
import { assistant, run, user } from "@openai/agents";
import { budgetBuddy } from "@/agent";

// One chat message, the way the chat screen sends it.
type ChatMessage = {
  role: string;
  content?: string | { type?: string; text?: string }[];
};

// A message's text arrives either as a plain string or as a list of parts.
function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).map((part) => part.text ?? "").join("");
}

export async function POST(request: Request) {
  const { messages = [], threadId }: { messages?: ChatMessage[]; threadId?: string } = await request.json();
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();

  // 1. Convert the browser's messages into the shape the Agents SDK expects.
  //    The browser sends the whole conversation every time, because the
  //    server remembers nothing between requests.
  const conversation = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => (message.role === "user" ? user(textOf(message)) : assistant(textOf(message))));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 2. Every AG-UI event travels as one line: "data: {json}" plus a blank line.
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: "RUN_STARTED", threadId, runId });

        // 3. Run the agent in streaming mode.
        const result = await run(budgetBuddy, conversation, { stream: true, signal: request.signal });

        // 4. Wrap each piece of text in an AG-UI event and send it on.
        send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        for await (const delta of result.toTextStream()) {
          send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta });
        }
        await result.completed;
        send({ type: "TEXT_MESSAGE_END", messageId });

        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (error) {
        // If the user closed the tab, there is nobody left to tell.
        if (!request.signal.aborted) {
          console.error("Agent run failed:", error);
          send({ type: "RUN_ERROR", message: error instanceof Error ? error.message : "The agent run failed." });
        }
      } finally {
        // 5. Always close the stream. The chat screen keeps its loading
        //    spinner going until the connection ends.
        if (!request.signal.aborted) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}