// Renders a validated how-to tree with the catalog, wrapped for the chat.
// Only HowToCard should be used from outside: it validates before anything is drawn.

import { Badge, cx } from "../ui";
import { CatalogCard, CatalogHeading, Callout, PoseFigure, StepProvider, Stepper, TempoStrip } from "./catalog";
import { validateHowTo, type HowToNode } from "./schema";

function renderNode(node: HowToNode, key: number) {
  switch (node.type) {
    case "Card":
      return <CatalogCard key={key}>{node.children.map(renderNode)}</CatalogCard>;
    case "Heading":
      return <CatalogHeading key={key} text={node.text} meta={node.meta} />;
    case "Stepper":
      return <Stepper key={key} steps={node.steps} />;
    case "PoseFigure":
      return <PoseFigure key={key} pose={node.pose} marker={node.marker} />;
    case "TempoStrip":
      return <TempoStrip key={key} segments={node.segments} follows={node.follows} />;
    case "Callout":
      return <Callout key={key} tone={node.tone} text={node.text} />;
  }
}

function GridIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-ink" strokeWidth="2.2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function Bar({ w }: { w: string }) {
  return <div className={cx("h-3 rounded-sm bg-border animate-pulse", w)} />;
}

export type HowToCardState = "streaming" | "done";

export interface HowToCardProps {
  /** The `ui` argument from the agent. Untrusted: validated here before anything renders. */
  ui: unknown;
  state: HowToCardState;
}

/** A how-to in the chat: the catalog badge, then the rendered tree, a skeleton, or a fallback note. */
export function HowToCard({ ui, state }: HowToCardProps) {
  const result = state === "done" ? validateHowTo(ui) : null;
  const label = result?.ok && result.tree.type === "Card" ? headingText(result.tree) : undefined;

  return (
    <section
      className="my-2 flex w-full min-w-0 flex-col items-start gap-2 text-sm"
      aria-label={label ? `${label} how-to` : "How-to"}
      data-state={result ? (result.ok ? "done" : "invalid") : "streaming"}
    >
      <Badge tone="ok" dot={false}>
        <GridIcon />
        Declarative · built from your catalog
      </Badge>
      <div className="w-full">
        {result === null ? (
          <CatalogCard>
            <Bar w="w-2/3" />
            <div className="h-[170px] w-full rounded-sm bg-bg animate-pulse" />
            <Bar w="w-1/2" />
          </CatalogCard>
        ) : result.ok ? (
          <StepProvider>{renderNode(result.tree, 0)}</StepProvider>
        ) : (
          <p className="rounded-sm border border-dashed border-border p-2.5 text-xs text-ink-muted" role="note">
            This how-to couldn't be shown because it didn't match the catalog. Nothing from it was rendered.
          </p>
        )}
      </div>
    </section>
  );
}

function headingText(card: Extract<HowToNode, { type: "Card" }>): string | undefined {
  const heading = card.children.find((c) => c.type === "Heading");
  return heading?.type === "Heading" ? heading.text : undefined;
}
