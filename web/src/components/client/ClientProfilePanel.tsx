import { Badge, Card, Chip, Select } from "../ui";

export interface ClientProfilePanelProps {
  /** Clients for the dropdown selector. */
  clients: { id: string; name: string }[];
  selectedClientId: string;
  onSelectClient: (id: string) => void;

  /** Display info for the selected client. */
  name: string;
  trainingAgeYears: number;
  daysPerWeek: number;

  /** Goals displayed as a bullet list. */
  goals: string[];

  /** Equipment shown as toggleable chips. */
  equipment: { name: string; available: boolean }[];

  /** Injuries shown as flagged cards. */
  injuries: { area: string; note: string }[];

  /** Called when an equipment chip is clicked. */
  onToggleEquipment?: (name: string) => void;
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * ClientProfilePanel
 *
 * Displays a compact client profile card with selector, goals, equipment chips,
 * injury notes, and a footer hint. Designed for 260–320px side-panel use.
 */
export function ClientProfilePanel({
  clients,
  selectedClientId,
  onSelectClient,
  name,
  trainingAgeYears,
  daysPerWeek,
  goals,
  equipment,
  injuries,
  onToggleEquipment,
}: ClientProfilePanelProps) {
  return (
    <div className="flex flex-col gap-3 w-full min-w-0" style={{ maxWidth: 320 }}>
      {/* -- Client selector -- */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-muted font-body">Client</span>
        <Select
          value={selectedClientId}
          onChange={(e) => onSelectClient(e.target.value)}
          aria-label="Select client"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>

      {/* -- Client info card -- */}
      <Card>
        <h2 className="font-heading text-2xl uppercase tracking-wide text-ink m-0">
          {name}
        </h2>
        <p className="mt-1 text-sm text-ink-muted font-body">
          Training age {trainingAgeYears} yrs · {daysPerWeek} days a week
        </p>
      </Card>

      {/* -- Goals -- */}
      <div>
        <h3 className="text-xs font-medium text-ink-muted font-heading uppercase tracking-wide mb-2">
          Goals
        </h3>
        <ul className="list-disc list-inside space-y-1">
          {goals.map((goal, i) => (
            <li key={i} className="text-sm text-ink font-body leading-snug">
              {goal}
            </li>
          ))}
        </ul>
      </div>

      {/* -- Equipment -- */}
      <div>
        <h3 className="text-xs font-medium text-ink-muted font-heading uppercase tracking-wide mb-2">
          Equipment
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {equipment.map((item) => (
            <Chip
              key={item.name}
              selected={item.available}
              onClick={() => onToggleEquipment?.(item.name)}
            >
              {item.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* -- Injury notes -- */}
      {injuries.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-ink-muted font-heading uppercase tracking-wide mb-2">
            Injury notes
          </h3>
          <div className="flex flex-col gap-2">
            {injuries.map((injury, i) => (
              <div
                key={i}
                className="border border-border rounded-md p-3 bg-surface"
              >
                <Badge tone="flag">{injury.area}</Badge>
                <p className="mt-2 text-sm text-ink font-body leading-snug">
                  {injury.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- Footer note -- */}
      <div className="border border-dashed border-accent rounded-md p-3 flex items-start gap-2">
        <span className="text-accent shrink-0 mt-0.5">
          <EyeIcon />
        </span>
        <p className="text-xs text-ink-muted font-body leading-snug m-0">
          The coach agent can read this panel.
        </p>
      </div>
    </div>
  );
}
