import { Badge, Chip, Select, cx } from "../ui";

export interface ClientProfilePanelProps {
  /** Clients for the dropdown selector. */
  clients: { id: string; name: string }[];
  selectedClientId: string;
  onSelectClient: (id: string) => void;
  /** Hide the client dropdown (when another one is on screen). */
  hideSelector?: boolean;
  /** data-testid for the dropdown. */
  selectTestId?: string;

  /** Display info for the selected client. */
  name: string;
  /** Experience level, e.g. "Intermediate". */
  experience: string;
  daysPerWeek: number;

  /** Goals displayed as a bullet list. */
  goals: string[];
  /** Trainer notes, shown under the goals. */
  notes?: string;

  /** Equipment chips. Available ones get the accent; the rest are muted. */
  equipment: { name: string; available: boolean }[];

  /** Injuries shown as flagged boxes. `area` is the badge text, e.g. "Left shoulder". */
  injuries: { area: string; note: string }[];

  /** When set, equipment chips are toggle buttons. Without it they are plain labels. */
  onToggleEquipment?: (name: string) => void;
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h3 className="m-0 font-heading text-[15px] uppercase tracking-wide text-ink-muted">{children}</h3>;
}

/**
 * ClientProfilePanel
 *
 * The client picker, then one card: name and schedule, goals, notes, equipment, injury notes, and a note that the
 * agent can read it. Designed for 260–320px side-panel use.
 */
export function ClientProfilePanel({
  clients,
  selectedClientId,
  onSelectClient,
  hideSelector = false,
  selectTestId,
  name,
  experience,
  daysPerWeek,
  goals,
  notes,
  equipment,
  injuries,
  onToggleEquipment,
}: ClientProfilePanelProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* -- Client selector -- */}
      {hideSelector ? null : (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Client</span>
          <Select
            value={selectedClientId}
            onChange={(e) => onSelectClient(e.target.value)}
            data-testid={selectTestId}
            className="w-full"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
      )}

      <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
        <div>
          <h2 className="m-0 font-heading text-[26px] uppercase leading-[1.1] tracking-wide text-ink">{name}</h2>
          <p className="tabular mt-1 text-ink-muted">
            {experience} · {daysPerWeek} days a week
          </p>
        </div>

        {goals.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionHeading>Goals</SectionHeading>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-sm">
              {goals.map((goal, i) => (
                <li key={i}>{goal}</li>
              ))}
            </ul>
          </div>
        )}

        {notes ? (
          <div className="flex flex-col gap-2">
            <SectionHeading>Notes</SectionHeading>
            <p className="m-0 text-sm leading-snug">{notes}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <SectionHeading>Equipment</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {equipment.map((item) =>
              onToggleEquipment ? (
                <Chip key={item.name} selected={item.available} onClick={() => onToggleEquipment(item.name)}>
                  {item.name}
                </Chip>
              ) : (
                <span
                  key={item.name}
                  className={cx(
                    "inline-flex h-8 items-center rounded-full border px-3 text-[13px]",
                    item.available ? "border-accent bg-accent-tint text-ink" : "border-border bg-surface text-ink-muted",
                  )}
                >
                  {item.name}
                  {item.available ? null : <span className="sr-only"> (not available)</span>}
                </span>
              ),
            )}
          </div>
        </div>

        {injuries.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionHeading>Injury notes</SectionHeading>
            {injuries.map((injury, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-sm border border-border p-2.5">
                <Badge tone="flag" className="self-start">
                  {injury.area}
                </Badge>
                <p className="m-0 text-sm leading-snug">{injury.note}</p>
              </div>
            ))}
          </div>
        )}

        <p className="m-0 flex items-start gap-2 rounded-sm border border-dashed border-accent p-2.5 text-[13px] text-ink-muted">
          <span className="mt-0.5 shrink-0 text-ink">
            <EyeIcon />
          </span>
          The coach agent can read this panel.
        </p>
      </section>
    </div>
  );
}
