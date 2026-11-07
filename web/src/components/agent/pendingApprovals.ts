// Approval cards (proposeSwap, proposeChanges) that are waiting for the trainer.
// The human-in-the-loop tools don't show up as agent interrupts, so each card registers itself here while it waits.
// Read by the status strip ("Waiting for your approval"), the mobile Coach tab dot and the mobile pending banner.
import { useEffect, useSyncExternalStore } from "react";

export interface PendingApproval {
  id: string;
  /** How many program changes the card proposes (a swap counts as one). */
  count: number;
}

let pending: PendingApproval[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Register the calling card as waiting while `active` is true. */
export function usePendingApproval(id: string, active: boolean, count: number): void {
  useEffect(() => {
    if (!active) return;
    pending = [...pending.filter((p) => p.id !== id), { id, count }];
    emit();
    return () => {
      pending = pending.filter((p) => p.id !== id);
      emit();
    };
  }, [id, active, count]);
}

/** Every card waiting for the trainer, in the order they started waiting. */
export function usePendingApprovals(): PendingApproval[] {
  return useSyncExternalStore(subscribe, () => pending);
}
