import { useSyncExternalStore } from "react";

/** Phone layout: bottom tabs instead of columns. */
export const MOBILE_QUERY = "(max-width: 767px)";
/** Wide enough for the client profile sidebar. */
export const WIDE_QUERY = "(min-width: 1024px)";

/** True while the media query matches; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
