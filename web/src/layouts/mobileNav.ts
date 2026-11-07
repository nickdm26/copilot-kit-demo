import { createContext, useContext } from "react";
import type { MobileTab } from "./MobileShell";

/** Switches the phone layout's tab. Outside the phone layout it does nothing. */
export const MobileNavContext = createContext<(tab: MobileTab) => void>(() => {});

export function useMobileNav(): (tab: MobileTab) => void {
  return useContext(MobileNavContext);
}
