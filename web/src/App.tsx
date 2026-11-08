import { CopilotKitProvider, useAgentContext } from "@copilotkit/react-core/v2";
import { API, SUBAGENTS, TEST_IDS } from "./lib/contracts";
import { dropSubagentMessages } from "./components/subagents";
import { SessionProvider, useSession } from "./lib/session";
import { MOBILE_QUERY, WIDE_QUERY, useMediaQuery } from "./lib/useMediaQuery";
import Styleguide from "./components/ui/Styleguide";
import { Select } from "./components/ui";
import MobileDemo from "./components/program/MobileDemo";
import { ProgramGrid } from "./components/program-grid";
import { GenUi } from "./components/genui";
import { CoachChat } from "./components/agent/CoachChat";
import { ConnectedModelPicker } from "./components/agent/ConnectedModelPicker";
import { ConnectedClientProfile } from "./components/client/ConnectedClientProfile";
import { ConnectedMobileShell } from "./layouts/ConnectedMobileShell";

/** Panels on the desktop page: surface cards on the page background. */
const panel = "rounded-md border border-border bg-surface";

function LogoMark() {
  return (
    <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sm bg-ink">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="stroke-accent" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />
      </svg>
    </span>
  );
}

function ClientPicker({ className }: { className?: string }) {
  const { clientId, clients, setClientId } = useSession();
  return (
    <label className={className}>
      <span className="sr-only">Client</span>
      <Select
        data-testid={TEST_IDS.clientSelect}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="w-full"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Shell() {
  const { clientId, clients, subagents } = useSession();
  const client = clients.find((c) => c.id === clientId);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // The profile sidebar (with its own client picker) only fits from 1024px.
  const isWide = useMediaQuery(WIDE_QUERY);

  useAgentContext({
    description: "The client the trainer has selected (Client JSON)",
    value: client ? JSON.parse(JSON.stringify(client)) : { id: clientId },
  });
  // The "Sub-agents" toggle. The agent reads this entry to offer runSubagents on the run (CONTRACTS section 11).
  useAgentContext({ description: SUBAGENTS.contextDescription, value: { enabled: subagents } });

  // Phones: both pickers in the header so they're on every tab. Desktop: the model picker sits in the chat header,
  // and the client picker in the profile sidebar (or here when the sidebar doesn't fit).
  const header = (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3 md:px-6">
      <div className="mr-auto flex items-center gap-2.5">
        <LogoMark />
        <h1 className="font-heading text-2xl uppercase leading-none tracking-wide">PT Coach</h1>
      </div>
      {isMobile ? (
        <>
          <ClientPicker className="w-[170px] max-w-[50%]" />
          <label className="flex w-full min-w-0 items-center gap-2 text-sm text-ink-muted">
            Model
            <ConnectedModelPicker className="flex-1" />
          </label>
        </>
      ) : !isWide ? (
        <ClientPicker className="w-[200px]" />
      ) : null}
    </header>
  );

  return (
    <ConnectedMobileShell
      header={header}
      sidebar={
        <aside aria-label="Client profile" className="hidden min-h-0 overflow-y-auto lg:block">
          <ConnectedClientProfile withSelector={isWide} />
        </aside>
      }
      programContent={isMobile ? <ProgramGrid variant="day" /> : <ProgramGrid className={panel} />}
      coachContent={<CoachChat showModelPicker={!isMobile} className={isMobile ? undefined : panel} />}
      clientContent={
        <div className="p-4">
          <ConnectedClientProfile withSelector={false} />
        </div>
      }
      footer={
        <footer data-testid={TEST_IDS.disclaimer} className="px-4 pb-2 text-xs text-ink-muted md:px-6">
          Demo only. Not medical advice.
        </footer>
      }
    />
  );
}

/**
 * Reasoning is display-only: the model produced it, it is not part of the conversation to send back.
 *
 * `MapChatRole` in AGUI.Abstractions 1.0.0 has no case for the `reasoning` role, so replaying a thread that contains
 * one fails the next run with "Unknown chat role: reasoning". CopilotKit sends the whole thread each time, so drop
 * them from the request. This changes the request body only; the transcript keeps its "Thought for…" blocks.
 */
function dropReasoningFromRequest<T extends { role: string }>(messages: T[]): T[] {
  return messages.filter((m) => m.role !== "reasoning");
}

/** Reasoning (above) and the sub-agents' own transcripts never go back to the coach (see dropSubagentMessages). */
function requestMessages<T extends { role: string }>(messages: T[]): T[] {
  return dropSubagentMessages(dropReasoningFromRequest(messages));
}

/**
 * The CopilotKit Web Inspector is a development tool: it shows the AG-UI event stream, agent state and reasoning.
 * It is opt-in (`?inspector`) because its floating launcher sits above the page and swallows clicks on whatever is
 * under it, which would break the demo script and the e2e tests.
 */
const inspectorEnabled = new URLSearchParams(location.search).has("inspector");

export default function App() {
  if (location.pathname === "/styleguide") return <Styleguide />;
  if (location.pathname === "/mobile") return <MobileDemo />;
  return (
    <CopilotKitProvider
      runtimeUrl={API.copilotkit}
      messageFilter={requestMessages}
      enableInspector={inspectorEnabled}
    >
      <SessionProvider>
        <GenUi />
        <Shell />
      </SessionProvider>
    </CopilotKitProvider>
  );
}
