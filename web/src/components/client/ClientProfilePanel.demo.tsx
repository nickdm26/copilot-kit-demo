import { useState } from "react";
import { ClientProfilePanel } from "./ClientProfilePanel";
import { arohaProfile } from "./ClientProfilePanel.fixtures";
import type { ClientProfilePanelProps } from "./ClientProfilePanel";

/** Build an extended fixture with a toggle handler for the demo. */
function useDemoProfile() {
  const [profile, setProfile] = useState<ClientProfilePanelProps>(() => ({
    ...arohaProfile,
    onToggleEquipment: (name: string) => {
      setProfile((prev) => ({
        ...prev,
        equipment: prev.equipment.map((e) =>
          e.name === name ? { ...e, available: !e.available } : e,
        ),
      }));
    },
    onSelectClient: (id: string) => {
      // In a real app this would load the client's profile data.
      // For the demo we keep the same profile regardless of selection.
      setProfile((prev) => ({ ...prev, selectedClientId: id }));
    },
  }));

  return profile;
}

export function ClientProfilePanelDemo() {
  const profile = useDemoProfile();

  return (
    <div className="min-h-dvh bg-bg p-8">
      <h1 className="font-heading text-3xl uppercase tracking-wide text-ink mb-6">
        Client Profile Panel
      </h1>

      <div className="flex flex-wrap gap-8 items-start">
        {/* Light background */}
        <div className="bg-bg p-4 rounded-lg border border-border">
          <h2 className="font-heading text-sm uppercase tracking-wide text-ink-muted mb-3">
            Light
          </h2>
          <ClientProfilePanel {...profile} />
        </div>

        {/* Dark background */}
        <div
          className="p-4 rounded-lg border border-border"
          style={{ backgroundColor: "#141414", borderColor: "#2e2e2e" }}
          data-theme="dark"
        >
          <h2
            className="font-heading text-sm uppercase tracking-wide mb-3"
            style={{ color: "#a8a6a0" }}
          >
            Dark
          </h2>
          {/* Re-fetch to ensure fresh component state */}
          <ClientProfilePanel {...profile} key="dark" />
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-muted font-body">
        The dark variant uses <code className="text-accent">data-theme="dark"</code> on its wrapper.
        Toggle equipment chips to test the <code className="text-accent">onToggleEquipment</code> callback.
      </p>
    </div>
  );
}
