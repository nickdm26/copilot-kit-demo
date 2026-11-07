import type { ClientProfilePanelProps } from "./ClientProfilePanel";

/** Realistic fixture data for the ClientProfilePanel demo. */
export const arohaProfile: ClientProfilePanelProps = {
  clients: [
    { id: "aroha", name: "Aroha Tane" },
    { id: "sarah", name: "Sarah Chen" },
    { id: "jordan", name: "Jordan Miles" },
  ],
  selectedClientId: "aroha",
  onSelectClient: () => {},
  name: "Aroha Tane",
  trainingAgeYears: 2,
  daysPerWeek: 3,
  goals: [
    "Back squat 120 kg by March",
    "Build upper back strength",
    "Stay pain free overhead",
  ],
  equipment: [
    { name: "Barbell", available: true },
    { name: "Dumbbells", available: true },
    { name: "Cable", available: true },
    { name: "Pull-up bar", available: true },
    { name: "Machines", available: false },
  ],
  injuries: [
    {
      area: "shoulder",
      note: "History of impingement. Avoid behind-neck pressing and deep dips.",
    },
  ],
  onToggleEquipment: () => {},
};
