import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const seedDir = fileURLToPath(new URL("../shared/seed", import.meta.url));
const sharedDir = fileURLToPath(new URL("../shared", import.meta.url));

// Aspire's AddViteApp sets PORT. RUNTIME_URL and AGENT_URL point at the other apps.
const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const runtimeUrl = process.env.RUNTIME_URL;
const agentUrl = process.env.AGENT_URL?.replace(/\/+$/, "");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@seed": seedDir } },
  server: {
    port,
    strictPort: port !== undefined,
    host: true,
    fs: { allow: [sharedDir, "."] },
    proxy: {
      ...(runtimeUrl ? { "/api/copilotkit": { target: runtimeUrl, changeOrigin: true } } : {}),
      ...(agentUrl
        ? { "/api/models": { target: agentUrl, changeOrigin: true, rewrite: () => "/models" } }
        : {}),
    },
  },
});
