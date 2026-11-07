import { useRenderTool } from "@copilotkit/react-core/v2";
import { TOOLS } from "../../lib/contracts";
import { HowToCard } from "./HowToCard";
import { ShowHowToArgsSchema } from "./schema";

/**
 * Renders the agent's showHowTo calls in the chat. showHowTo is a .NET backend tool
 * (agent/Tools/ShowHowToTool.cs), so this only renders: useRenderTool sends no tool definition.
 * The args are untrusted. HowToCard validates them and draws nothing that fails the schema.
 */
export function useHowToTool(): void {
  useRenderTool({
    name: TOOLS.showHowTo,
    parameters: ShowHowToArgsSchema,
    render: ({ parameters, status, result }) => {
      // The agent rejected the tree and told the model to fix it. The retry renders its own card.
      if (status === "complete" && typeof result === "string" && result.startsWith("Error")) return null;
      const ui: unknown = (parameters as { ui?: unknown } | undefined)?.ui;
      return <HowToCard ui={ui} state={status === "inProgress" ? "streaming" : "done"} />;
    },
  });
}

export { HowToCard } from "./HowToCard";
export { validateHowTo, ShowHowToArgsSchema, HOW_TO_LIMITS } from "./schema";
export type { HowToNode } from "./schema";
