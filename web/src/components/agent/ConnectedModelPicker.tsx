import { useState, useCallback } from "react";
import { useSession } from "../../lib/session";
import { TEST_IDS } from "../../lib/contracts";
import { ModelPicker } from "./ModelPicker";
import { SystemMessage } from "./SystemMessage";

/**
 * ConnectedModelPicker
 *
 * Maps the session's ModelOption[] (key/label/modelId) to the ModelPicker's
 * ModelOption[] (id/name/shortName/provider). On change it updates the session
 * model key and shows a SystemMessage for 3 seconds.
 */
export function ConnectedModelPicker() {
  const { modelKey, models, setModelKey } = useSession();
  const [message, setMessage] = useState<string | null>(null);

  const pickerModels = models.map((m) => ({
    id: m.key,
    name: m.label,
    shortName: m.label,
    provider: m.modelId,
  }));

  const handleChange = useCallback(
    (id: string) => {
      const model = models.find((m) => m.key === id);
      setModelKey(id);
      if (model) {
        setMessage(`Switched to ${model.label}`);
        setTimeout(() => setMessage(null), 3000);
      }
    },
    [models, setModelKey],
  );

  return (
    <div className="flex items-center gap-2">
      <ModelPicker
        models={pickerModels}
        value={modelKey}
        onChange={handleChange}
        data-testid={TEST_IDS.modelSelect}
      />
      {message && <SystemMessage text={message} />}
    </div>
  );
}