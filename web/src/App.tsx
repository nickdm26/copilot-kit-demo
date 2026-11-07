import { CopilotKitProvider, CopilotChat, useAgentContext } from "@copilotkit/react-core/v2";
import { API, TEST_IDS, modelDisplayName } from "./lib/contracts";
import { SessionProvider, useSession } from "./lib/session";
import Styleguide from "./components/ui/Styleguide";

const selectClass = "bg-surface text-ink border border-border rounded-[var(--radius)] px-3 py-1 font-body text-sm";

function Shell() {
  const { modelKey, clientId, threadId, models, clients, setModelKey, setClientId } = useSession();
  const activeModel = models.find((m) => m.key === modelKey);
  const client = clients.find((c) => c.id === clientId);

  useAgentContext({
    description: "The client the trainer has selected (Client JSON)",
    value: client ? JSON.parse(JSON.stringify(client)) : { id: clientId },
  });

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink font-body">
      <header className="flex items-center gap-4 px-4 py-3 border-b border-border">
        <h1 className="font-heading text-2xl uppercase tracking-wide mr-auto">PT Coach</h1>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Model
          <select
            data-testid={TEST_IDS.modelSelect}
            className={selectClass}
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {modelDisplayName(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Client
          <select
            data-testid={TEST_IDS.clientSelect}
            className={selectClass}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] min-h-0">
        <section className="p-4 text-ink-muted">Program grid (Lane F)</section>
        <section data-testid={TEST_IDS.chat} className="flex flex-col border-l border-border bg-surface min-h-0">
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Active model</span>
            <span data-testid={TEST_IDS.activeModel} className="text-accent font-medium">
              {activeModel ? modelDisplayName(activeModel) : "Loading..."}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {/* key={threadId} remounts the chat, so a model or client change clears the thread */}
            {modelKey ? <CopilotChat key={threadId} agentId={modelKey} threadId={threadId} /> : null}
          </div>
        </section>
      </main>

      <footer data-testid={TEST_IDS.disclaimer} className="px-4 py-2 border-t border-border text-xs text-ink-muted">
        Demo only. Not medical advice.
      </footer>
    </div>
  );
}

export default function App() {
  if (location.pathname === "/styleguide") return <Styleguide />;
  return (
    <CopilotKitProvider runtimeUrl={API.copilotkit}>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </CopilotKitProvider>
  );
}
