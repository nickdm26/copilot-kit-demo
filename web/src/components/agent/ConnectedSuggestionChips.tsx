import { useSession } from "../../lib/session";
import { useSendUserMessage } from "./useSendUserMessage";
import { SuggestionChips, type SuggestionChipItem } from "./SuggestionChips";

/** Starter prompts for the empty chat: things that work before there is a program. */
export function starterSuggestions(firstName: string): SuggestionChipItem[] {
  return [
    { label: `Build a 4 week plan for ${firstName}`, highlighted: true },
    { label: "Show me a pause squat" },
    { label: "How is the squat going?" },
  ];
}

/**
 * Chips above the input once the chat has started. One per chat component, so the demo can show each:
 * plan (grid), how-to card, week summary, exercise card, progress card, swap approval and change approval.
 */
export function followUpSuggestions(firstName: string): SuggestionChipItem[] {
  return [
    { label: "Check shoulder load", highlighted: true },
    { label: "Deload next week" },
    { label: "Swap for home gym" },
    { label: "Show week 1 volume" },
    { label: "Show day 1's main lift" },
    { label: "How is the squat going?" },
    { label: "Show me a pause squat" },
    { label: `Build a 4 week plan for ${firstName}` },
  ];
}

/**
 * ConnectedSuggestionChips
 *
 * Renders suggestion chips above the chat input. When a chip is tapped,
 * it sends the label as a user message and triggers a run.
 */
export function ConnectedSuggestionChips({ className }: { className?: string }) {
  const { modelKey, clients, clientId } = useSession();
  if (!modelKey) return null;
  const firstName = clients.find((c) => c.id === clientId)?.name.split(" ")[0] ?? "the client";
  return <BoundChips agentId={modelKey} firstName={firstName} className={className} />;
}

function BoundChips({ agentId, firstName, className }: { agentId: string; firstName: string; className?: string }) {
  const send = useSendUserMessage(agentId);
  return <SuggestionChips suggestions={followUpSuggestions(firstName)} onPick={send} className={className} />;
}
