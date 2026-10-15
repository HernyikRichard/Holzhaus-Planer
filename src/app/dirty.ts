import type { Store } from '../ui/store';
import { serializePlan } from '../model/serialize';

/** Az utolsó mentett / betöltött / új tervhez képest módosult-e a terv. */
export function createDirtyTracker(store: Store): { isDirty: () => boolean; markClean: () => void } {
  let clean = serializePlan(store.get().plan);
  return {
    isDirty: () => serializePlan(store.get().plan) !== clean,
    markClean: () => { clean = serializePlan(store.get().plan); },
  };
}
