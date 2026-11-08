// CopilotKit v2 runtime. One HttpAgent per model key from the agent's GET /models.
// Env (injected by Aspire): AGENT_URL, PORT. No hard-coded URLs or ports.
import express from "express";
import { HttpAgent } from "@ag-ui/client";
import { CopilotRuntime, TranscriptionService, type TranscribeFileOptions } from "@copilotkit/runtime/v2";
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

/**
 * The chat's mic button. CopilotKit posts the recording to /api/copilotkit/transcribe and calls this; the agent
 * (POST ${AGENT_URL}/transcribe) holds the OpenRouter key and does the speech-to-text.
 */
class AgentTranscriptionService extends TranscriptionService {
  async transcribeFile({ audioFile }: TranscribeFileOptions): Promise<string> {
    const form = new FormData();
    form.append("audio", audioFile, audioFile.name || "recording.webm");
    const res = await fetch(`${AGENT_URL}/transcribe`, { method: "POST", body: form });
    // The agent returns { text } or { error } (CONTRACTS.md section 5).
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    // CopilotKit picks its on-screen message by matching the error text ("429", "401", "too long"), so keep the status in it.
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error ?? res.statusText}`);
    return body.text ?? "";
  }
}

// The v2 AgentsConfig type wants a non-empty record; fetchModels guarantees one.
// A transcriptionService makes the runtime report audioFileTranscriptionEnabled, which shows the chat's mic button.
const runtime = new CopilotRuntime({
  agents: (await buildAgents()) as never,
  transcriptionService: new AgentTranscriptionService(),
});

const app = express();
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
// Multi-route endpoint style. The provider default (useSingleEndpoint=false) matches.
app.use(createCopilotExpressHandler({ runtime, basePath: "/api/copilotkit" }));

app.listen(PORT, () => {
  console.log(`[runtime] listening on ${PORT}`);
});
