import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppState } from "../shared/types.ts";
import { api } from "./api.ts";

interface Ctx {
  state: AppState | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const StoreCtx = createContext<Ctx>({ state: null, error: null, refresh: async () => {} });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <StoreCtx.Provider value={{ state, error, refresh }}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
