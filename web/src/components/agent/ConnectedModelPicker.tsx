import { useSession } from "../../lib/session";
import { TEST_IDS, modelDisplayName } from "../../lib/contracts";
import { cx } from "../ui";
import { ModelPicker } from "./ModelPicker";

/**
 * ConnectedModelPicker
 *
 * The session's models in a ModelPicker. Option text follows CONTRACTS.md section 6: "{label} ({modelId})".
 * Picking a model starts a new thread; the chat pane shows "Switched to …".
 */
export function ConnectedModelPicker({ className }: { className?: string }) {
  const { modelKey, models, setModelKey } = useSession();

  const pickerModels = models.map((m) => ({
    id: m.key,
    name: modelDisplayName(m),
    shortName: m.label,
    provider: m.modelId,
  }));

  return (
    <ModelPicker
      className={cx("min-w-0", className)}
      models={pickerModels}
      value={modelKey}
      onChange={setModelKey}
      optionLabel={(m) => m.name}
      data-testid={TEST_IDS.modelSelect}
    />
  );
}
