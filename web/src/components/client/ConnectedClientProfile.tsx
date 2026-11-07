import { EQUIPMENT, TEST_IDS, type Client } from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { ClientProfilePanel } from "./ClientProfilePanel";

/** Display names for the seed enums. */
const EQUIPMENT_LABELS: Record<(typeof EQUIPMENT)[number], string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbells",
  kettlebell: "Kettlebell",
  cable: "Cable",
  machine: "Machines",
  bodyweight: "Bodyweight",
  band: "Bands",
  "trap-bar": "Trap bar",
};

const GOAL_LABELS: Record<Client["goal"], string> = {
  strength: "Get stronger on the main lifts",
  hypertrophy: "Build muscle",
  general: "General fitness and confidence with the basics",
  "endurance-support": "Strength and durability to support running",
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function injuryArea(i: Client["injuries"][number]): string {
  const area = i.area.replace("-", " ");
  if (i.side === "both") return capitalise(`${area}, both sides`);
  return capitalise(i.side ? `${i.side} ${area}` : area);
}

/** The selected client's profile from the session, in the profile panel. */
export function ConnectedClientProfile({ withSelector }: { withSelector: boolean }) {
  const { clients, clientId, setClientId } = useSession();
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;
  return (
    <ClientProfilePanel
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      selectedClientId={clientId}
      onSelectClient={setClientId}
      hideSelector={!withSelector}
      selectTestId={withSelector ? TEST_IDS.clientSelect : undefined}
      name={client.name}
      experience={capitalise(client.experience)}
      daysPerWeek={client.daysPerWeek}
      goals={[GOAL_LABELS[client.goal]]}
      notes={client.notes}
      equipment={EQUIPMENT.map((e) => ({ name: EQUIPMENT_LABELS[e], available: client.equipment.includes(e) }))}
      injuries={client.injuries.map((i) => ({ area: injuryArea(i), note: `${capitalise(i.severity)}. ${i.note}` }))}
    />
  );
}
