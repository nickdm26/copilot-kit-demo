import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";
import { useSession } from "../../lib/session";
import { AgentStatusStrip, type AgentStatusStripProps } from "./AgentStatusStrip";

/**
 * Binds AgentStatusStrip to the running agent (Task 1 wiring).
 *
 * - `useAgent` with `OnRunStatusChanged` re-renders when a run starts or stops.
 * - While a run is in flight the strip shows "working".
 * - When a run finishes with an unresolved human-in-the-loop interrupt
 *   (e.g. proposeSwap / proposeChanges waiting for the trainer), it shows
 *   "awaiting-approval".
 * - Otherwise "idle".
 */
export function ConnectedAgentStatusStrip() {
  const { modelKey } = useSession();
  // The provider only mounts agents once a model is chosen; render nothing until then.
  if (!modelKey) return null;
  return <BoundStatusStrip agentId={modelKey} />;
}

function BoundStatusStrip({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });

  let status: AgentStatusStripProps["status"] = "idle";
  if (agent.isRunning) status = "working";
  else if (agent.pendingInterrupts.length > 0) status = "awaiting-approval";

  return <AgentStatusStrip status={status} />;
}