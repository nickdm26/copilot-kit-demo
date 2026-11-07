import { useCallback } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { useSession } from "../../lib/session";
import { SuggestionChips, type SuggestionChipItem } from "./SuggestionChips";

const DEFAULT_SUGGESTIONS: SuggestionChipItem[] = [
  { label: "Show me a pause squat", highlighted: true },
  { label: "Deload next week" },
  { label: "Swap for home gym" },
  { label: "Check shoulder load" },
];

/**
 * ConnectedSuggestionChips
 *
 * Renders suggestion chips above the chat input. When a chip is tapped,
 * it sends the label as a user message and triggers a run.
 */
export function ConnectedSuggestionChips() {
  const { modelKey } = useSession();
  if (!modelKey) return null;
  return <BoundChips agentId={modelKey} />;
}

function BoundChips({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId });
  const { copilotkit } = useCopilotKit();

  const handlePick = useCallback(
    (label: string) => {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: label,
      });
      void copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  return <SuggestionChips suggestions={DEFAULT_SUGGESTIONS} onPick={handlePick} />;
}