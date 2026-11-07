import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import clientsJson from "@seed/clients.json";
import { API, ClientSchema, ModelOptionSchema, type Client, type ModelOption } from "./contracts";

/**
 * AppSession: what the current chat is about. Read it with `useSession()`.
 *
 * - `modelKey`    active model key. It is also the CopilotKit `agentId`. "" until models load.
 * - `clientId`    active seed client id (e.g. "sarah").
 * - `threadId`    CopilotKit thread id. A fresh `crypto.randomUUID()` whenever model or client changes.
 * - `models`      options from GET /api/models (empty until loaded).
 * - `clients`     seed clients from @seed/clients.json.
 * - `setModelKey` / `setClientId`  change the selection and start a new thread.
 *
 * Lane F: when `threadId` changes, reset the grid to `emptyProgram(clientId)`.
 */
export interface AppSession {
  modelKey: string;
  clientId: string;
  threadId: string;
  models: ModelOption[];
  clients: Client[];
  setModelKey: (key: string) => void;
  setClientId: (id: string) => void;
}

const clients: Client[] = z.array(ClientSchema).parse(clientsJson);

const Ctx = createContext<AppSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelKey, setModelKeyState] = useState("");
  const [clientId, setClientIdState] = useState(clients[0]?.id ?? "");
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    fetch(API.models)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        const list = z.array(ModelOptionSchema).parse(json);
        setModels(list);
        setModelKeyState((cur) => cur || list[0]?.key || "");
      })
      .catch((err) => console.error("Failed to load models", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const setModelKey = useCallback((key: string) => {
    setModelKeyState(key);
    setThreadId(crypto.randomUUID());
  }, []);
  const setClientId = useCallback((id: string) => {
    setClientIdState(id);
    setThreadId(crypto.randomUUID());
  }, []);

  const value = useMemo<AppSession>(
    () => ({ modelKey, clientId, threadId, models, clients, setModelKey, setClientId }),
    [modelKey, clientId, threadId, models, setModelKey, setClientId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): AppSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
