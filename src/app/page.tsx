/**
 * page.tsx
 * What: the chat screen. AgentInterface is OpenUI's ready-made chat UI. It
 * sends the conversation to /api/chat and draws the agent's reply as live
 * components while it streams in.
 * Why: this is the only frontend code the tutorial needs.
 */
"use client";

import { AgentInterface, agUIAdapter, fetchLLM, useSystemThemeMode } from "@openuidev/react-ui";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";

// How the chat screen talks to our server: POST the conversation to
// /api/chat, then read the reply as AG-UI events.
const llm = fetchLLM({
  url: "/api/chat",
  streamAdapter: agUIAdapter(),
});

export default function Page() {
  // Follow the user's light or dark system theme.
  const mode = useSystemThemeMode();

  return (
    <div className="app-shell">
      <AgentInterface
        llm={llm}
        componentLibrary={openuiLibrary}
        agentName="Budget Buddy"
        theme={{ mode }}
        starterVariant="short"
        starters={[
          { displayText: "Where did my money go?", prompt: "Where did my money go this month?" },
          { displayText: "Dining spend", prompt: "How much did I spend on dining?" },
          { displayText: "Biggest expenses", prompt: "What were my three biggest expenses?" },
        ]}
      />
    </div>
  );
}