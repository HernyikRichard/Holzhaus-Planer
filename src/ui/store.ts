import type { Plan } from '../model/types';
import { validatePlan, type ValidationError } from '../model/validate';
import { calculate, type CalcOutput } from '../calc';
import { supplyFor } from '../pricing/supply';

export interface AppState { plan: Plan; errors: ValidationError[]; output: CalcOutput; lastValidPlan: Plan;
  /** Csak a replace() növeli (Új terv / Betöltés), az update() nem. */
  epoch: number }
export interface Store {
  get(): AppState;
  update(fn: (draft: Plan) => void): void;
  replace(plan: Plan): void;
  subscribe(fn: (s: AppState) => void): () => void;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach(deepFreeze);
  }
  return value;
}

export function createStore(initialPlan: Plan): Store {
  const initial = structuredClone(initialPlan);
  let state: AppState = deepFreeze({
    plan: initial,
    errors: validatePlan(initial),
    output: calculate(initial, supplyFor(initial)),
    lastValidPlan: structuredClone(initial),
    epoch: 0,
  });
  const listeners = new Set<(s: AppState) => void>();

  function set(plan: Plan, replaced = false): void {
    const errors = validatePlan(plan);
    state = deepFreeze(errors.length === 0
      ? { plan, errors, output: calculate(plan, supplyFor(plan)), lastValidPlan: structuredClone(plan), epoch: state.epoch }
      : { ...state, plan, errors });
    if (replaced) state = deepFreeze({ ...state, epoch: state.epoch + 1 });
    listeners.forEach(fn => fn(state));
  }

  return {
    get: () => state,
    update(fn) {
      const draft = structuredClone(state.plan);
      fn(draft);
      set(draft);
    },
    replace: plan => set(structuredClone(plan), true),
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
