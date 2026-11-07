// CopilotKit v2 runtime. One HttpAgent per model key from the agent's GET /models.
// Env (injected by Aspire): AGENT_URL, PORT. No hard-coded URLs or ports.
import express from "express";
import { HttpAgent } from "@ag-ui/client";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express";

const AGENT_URL = requiredEnv("AGENT_URL").replace(/\/+$/, "");
const PORT = Number(requiredEnv("PORT"));

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

interface ModelEntry {
  key: string;
  label: string;
  modelId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The agent may still be starting, so retry with capped exponential backoff. */
async function fetchModels(): Promise<ModelEntry[]> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${AGENT_URL}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const models = (await res.json()) as ModelEntry[];
      if (!Array.isArray(models) || models.length === 0) throw new Error("empty model list");
      return models;
    } catch (err) {
      console.warn(`[runtime] GET ${AGENT_URL}/models failed (attempt ${attempt}): ${String(err)}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 5000);
    }
  }
}

async function buildAgents(): Promise<Record<string, HttpAgent>> {
  const models = await fetchModels();
  const agents: Record<string, HttpAgent> = {};
  for (const m of models) {
    agents[m.key] = new HttpAgent({ url: `${AGENT_URL}/agent/${m.key}` });
  }
  console.log(`[runtime] registered agents: ${Object.keys(agents).join(", ")}`);
  return agents;
}

// The v2 AgentsConfig type wants a non-empty record; fetchModels guarantees one.
const runtime = new CopilotRuntime({ agents: (await buildAgents()) as never });

const app = express();
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
// Multi-route endpoint style. The provider default (useSingleEndpoint=false) matches.
app.use(createCopilotExpressHandler({ runtime, basePath: "/api/copilotkit" }));

app.listen(PORT, () => {
  console.log(`[runtime] listening on ${PORT}`);
});
