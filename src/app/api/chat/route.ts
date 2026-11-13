/**
 * route.ts (POST /api/chat)
 * What: the bridge between the chat screen and the agent. It receives the
 * conversation from the browser, runs Budget Buddy, and streams the reply
 * back as AG-UI events. AG-UI is an open protocol for sending an agent's
 * activity to a UI as small JSON events.
 * Why: the Agents SDK gives us plain pieces of text. OpenUI's chat screen
 * reads AG-UI events. Nothing converts one into the other, so we do it here.
 * Test it with curl, using scripts/sample-request.json as the request body:
 *   curl -N http://localhost:3000/api/chat -H "Content-Type: application/json" -d "@scripts/sample-request.json"
 */
import { assistant, run, user } from "@openai/agents";
import { parseMessage } from "@openuidev/lang-core";
import { budgetBuddy } from "@/agent";

// One chat message, the way the chat screen sends it.
type ChatMessage = { role: string; content: string };

export async function POST(request: Request) {
  // Check the request before doing anything else. A body that is not JSON,
  // or that has no "messages" list, gets a clear 400 instead of a crash.
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.messages)) {
    return Response.json(
      { error: 'The request body must be JSON with a "messages" array, like scripts/sample-request.json.' },
      { status: 400 },
    );
  }

  const { messages, threadId }: { messages: ChatMessage[]; threadId: string } = body;
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();

  // 1. Convert the browser's messages into the shape the Agents SDK expects.
  //    The browser sends the whole conversation every time, because the
  //    server remembers nothing between requests.
  //    OpenUI stores each message with marker lines that start with
  //    "]]>openui:". The model must never see those, so parseMessage pulls
  //    out the parts: a reply's content, and for a user message also its
  //    context, such as the values of a submitted form.
  const conversation = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const { content, context } = parseMessage(message.content);
      if (message.role === "assistant") return assistant(content);
      return user(context ? `${content}\n\nContext: ${JSON.stringify(context)}` : content);
    });

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
        const result = await run(budgetBuddy, conversation, {
          stream: true,
          signal: request.signal,
        });

        // 4. Wrap each piece of text in an AG-UI event and send it on.
        send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        for await (const delta of result.toTextStream()) {
          send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta });
        }
        send({ type: "TEXT_MESSAGE_END", messageId });

        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (error) {
        // If the user closed the tab, there is nobody left to tell.
        if (!request.signal.aborted) {
          console.error("Agent run failed:", error);
          send({
            type: "RUN_ERROR",
            message: error instanceof Error ? error.message : "The agent run failed.",
          });
        }
      } finally {
        // 5. Close the stream, unless the browser has already gone away. The
        //    chat screen keeps its loading spinner going until the stream ends.
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
