import type { SuggestionChipItem } from "./SuggestionChips";
import type { ChatEmptyStateProps } from "./ChatEmptyState";

/** Fixture client name used across all demo states. */
export const FIXTURE_CLIENT = "Aroha Tane";

/** Suggestion chips for the inline chip row. */
export const FIXTURE_CHIPS: SuggestionChipItem[] = [
  { label: "Show me a pause squat", highlighted: true },
  { label: "Deload next week" },
  { label: "Swap for home gym" },
  { label: "Check shoulder load" },
];

/** Suggestion strings for the empty-state starter buttons. */
export const FIXTURE_EMPTY_SUGGESTIONS: string[] = [
  "Show me a pause squat",
  "Deload next week",
  "Swap for home gym",
  "Check shoulder load",
];

/** Pre-built props for the empty state. */
export function emptyStateProps(): ChatEmptyStateProps {
  return {
    clientName: FIXTURE_CLIENT,
    suggestions: FIXTURE_EMPTY_SUGGESTIONS,
    onPick: (label) => console.log("[fixture] empty-state pick:", label),
  };
}
