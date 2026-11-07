import { useSession } from "../../lib/session";
import { useSendUserMessage } from "./useSendUserMessage";
import { SuggestionChips, type SuggestionChipItem } from "./SuggestionChips";

export const DEFAULT_SUGGESTIONS: SuggestionChipItem[] = [
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
export function ConnectedSuggestionChips({ className }: { className?: string }) {
  const { modelKey } = useSession();
  if (!modelKey) return null;
  return <BoundChips agentId={modelKey} className={className} />;
}

function BoundChips({ agentId, className }: { agentId: string; className?: string }) {
  const send = useSendUserMessage(agentId);
  return <SuggestionChips suggestions={DEFAULT_SUGGESTIONS} onPick={send} className={className} />;
}
