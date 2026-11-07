import { useMemo } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import { ProgramStateSchema, emptyProgram, type ProgramState } from "../../lib/contracts";
import { useSession } from "../../lib/session";

/** The current program (shared agent state), validated; an empty program when missing or invalid. */
export function useProgramState(): ProgramState {
  const { modelKey, clientId } = useSession();
  const { agent } = useAgent({ agentId: modelKey });
  const state = agent.state;
  return useMemo(() => {
    const parsed = ProgramStateSchema.safeParse(state);
    return parsed.success ? parsed.data : emptyProgram(clientId);
  }, [state, clientId]);
}
