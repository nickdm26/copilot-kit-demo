import { useCallback, useEffect, useRef } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

/**
 * Send text to the agent as if the trainer had typed it, then start a run.
 * A message sent while a run is in progress waits until that run ends, so two runs never overlap
 * (e.g. a chip tapped while the agent is still answering a rejected proposal).
 */
export function useSendUserMessage(agentId: string): (text: string) => void {
  const { agent } = useAgent({ agentId });
  const { copilotkit } = useCopilotKit();
  const pending = useRef<string | null>(null);

  const sendNow = useCallback(
    (text: string) => {
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      void copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const isRunning = agent.isRunning;
  useEffect(() => {
    if (isRunning || pending.current === null) return;
    const text = pending.current;
    pending.current = null;
    sendNow(text);
  }, [isRunning, sendNow]);

  return useCallback(
    (text: string) => {
      if (agent.isRunning) pending.current = text;
      else sendNow(text);
    },
    [agent, sendNow],
  );
}
