import { useEffect, useState } from "react";
import { Badge, Button, Card, Chip, Select, cx } from "./index";

type ThemeMode = "light" | "dark" | "system";

const COLOR_TOKENS = [
  { name: "bg", use: "page background" },
  { name: "surface", use: "cards, grid cells" },
  { name: "ink", use: "main text" },
  { name: "ink-muted", use: "labels, hints" },
  { name: "border", use: "lines, dividers" },
  { name: "accent", use: "buttons, agent activity" },
  { name: "flag", use: "injury flags, rejected swaps" },
  { name: "ok", use: "approved swaps, good volume" },
  { name: "accent-tint", use: "agent highlight (derived)" },
  { name: "flag-tint", use: "flagged cell (derived)" },
  { name: "ok-tint", use: "good volume (derived)" },
] as const;

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b border-border pb-2 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, use, tick }: { name: string; use: string; tick: number }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    // Wait a frame so the data-theme change has been applied.
    const id = requestAnimationFrame(() => {
      setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());
    });
    return () => cancelAnimationFrame(id);
  }, [name, tick]);
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="h-14 border-b border-border" style={{ background: `var(--${name})` }} />
      <div className="p-2">
        <div className="font-mono text-xs font-semibold text-ink">--{name}</div>
        <div className="tabular font-mono text-xs text-ink-muted">{value || "..."}</div>
        <div className="mt-1 text-xs text-ink-muted">{use}</div>
      </div>
    </div>
  );
}

export default function Styleguide() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [tick, setTick] = useState(0);
  const [replay, setReplay] = useState(0);
  const [chips, setChips] = useState<Record<string, boolean>>({ Strength: true, Hypertrophy: false });

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    setTick((t) => t + 1);
  }, [mode]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTick((t) => t + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl uppercase leading-none">Styleguide</h1>
          <p className="mt-2 text-sm text-ink-muted">Chalk and steel. Every token and base component.</p>
        </div>
        <div role="group" aria-label="Theme" className="flex gap-1" data-testid="theme-toggle">
          {(["light", "dark", "system"] as const).map((m) => (
            <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
              {m}
            </Chip>
          ))}
        </div>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((t) => (
            <Swatch key={t.name} name={t.name} use={t.use} tick={tick} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Card className="space-y-3">
          <div>
            <div className="text-xs text-ink-muted">--font-heading, Barlow Condensed 500/600/700</div>
            <div className="font-heading text-5xl font-bold uppercase">Back squat 4 x 5</div>
            <div className="font-heading text-3xl font-semibold">Week 1, Lower focus</div>
            <div className="font-heading text-xl font-medium">Hip thrust, tempo 3-1-1</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">--font-body, Inter 400/500/600</div>
            <p className="text-base">Keep the bar close, brace, and drive through the mid-foot.</p>
            <p className="text-sm font-medium">Medium weight body copy for labels.</p>
            <p className="text-sm font-semibold">Semibold body copy for emphasis.</p>
            <p className="text-xs text-ink-muted">Muted hint text at 12px.</p>
          </div>
          <div>
            <div className="text-xs text-ink-muted">.tabular numbers (sets, reps, RPE)</div>
            <div className="grid max-w-xs grid-cols-3 gap-x-4 text-lg">
              <span className="tabular">4 x 5</span>
              <span className="tabular">3 x 10</span>
              <span className="tabular">RPE 7.5</span>
              <span className="tabular">1 x 11</span>
              <span className="tabular">3 x 8-10</span>
              <span className="tabular">RPE 8.0</span>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Radius and spacing">
        <div className="flex flex-wrap items-end gap-6">
          {[
            ["rounded-sm", "rounded-sm"],
            ["rounded-md (--radius, 10px)", "rounded-md"],
            ["rounded-lg", "rounded-lg"],
          ].map(([label, cls]) => (
            <div key={label} className="text-xs text-ink-muted">
              <div className={cx("mb-1 h-16 w-24 border border-border bg-surface", cls)} />
              {label}
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-1">
          <div className="text-xs text-ink-muted">--space: 4px. Scale in multiples (Tailwind 1 = 4px).</div>
          {SPACING.map((n) => (
            <div key={n} className="flex items-center gap-3">
              <span className="tabular w-16 font-mono text-xs text-ink-muted">
                {n} = {n * 4}px
              </span>
              <div className="h-3 bg-accent" style={{ width: `calc(var(--space) * ${n})` }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        <Card className="space-y-4">
          {(["md", "sm"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              <span className="w-8 text-xs text-ink-muted">{size}</span>
              <Button size={size} variant="primary">Primary</Button>
              <Button size={size} variant="secondary">Secondary</Button>
              <Button size={size} variant="ghost">Ghost</Button>
              <Button size={size} variant="danger">Danger</Button>
              <span className="text-xs text-ink-muted">disabled:</span>
              <Button size={size} variant="primary" disabled>Primary</Button>
              <Button size={size} variant="secondary" disabled>Secondary</Button>
              <Button size={size} variant="ghost" disabled>Ghost</Button>
              <Button size={size} variant="danger" disabled>Danger</Button>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Card, Badge, Chip, Select">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-1 text-xl">Card</h3>
            <p className="text-sm text-ink-muted">Surface, 1px border, radius token, no shadow.</p>
          </Card>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>neutral</Badge>
              <Badge tone="accent">accent</Badge>
              <Badge tone="flag">flag</Badge>
              <Badge tone="ok">ok</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {Object.keys(chips).map((k) => (
                <Chip key={k} selected={chips[k]} onClick={() => setChips((c) => ({ ...c, [k]: !c[k] }))}>
                  {k}
                </Chip>
              ))}
              <Chip disabled>Disabled</Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Model" defaultValue="quick" data-testid="styleguide-select">
                <option value="quick">Quick (provider/model)</option>
                <option value="thorough">Thorough (provider/model)</option>
              </Select>
              <Select aria-label="Disabled" disabled defaultValue="a">
                <option value="a">Disabled</option>
              </Select>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Agent-touched highlight">
        <Card className="flex flex-wrap items-center gap-4">
          <div
            key={replay}
            className="agent-touched tabular rounded-md border border-border px-4 py-3 text-lg"
            data-testid="agent-touched-sample"
          >
            Back squat 4 x 5 @ RPE 7
          </div>
          <Button variant="secondary" size="sm" onClick={() => setReplay((r) => r + 1)}>
            Replay highlight
          </Button>
          <span className="text-xs text-ink-muted">Fades over about 2s. Static tint under reduced motion.</span>
        </Card>
      </Section>

      <Section title="Generative UI (Lane E)">
        {/* LANE E: add ExerciseCard, WeekSummary and SwapApproval examples below this line. */}
        <div data-testid="styleguide-genui" />
        {/* END LANE E */}
      </Section>
    </div>
  );
}
