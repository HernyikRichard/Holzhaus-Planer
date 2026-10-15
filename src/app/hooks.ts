import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppState, Store } from '../ui/store';
import type { UiState, UiStore } from './uiStore';

function useSelected<T>(get: () => T, subscribe: (fn: () => void) => () => void, dep: unknown): T {
  const [, setValue] = useState<T>(get);
  const getRef = useRef(get);
  getRef.current = get;
  const subRef = useRef(subscribe);
  subRef.current = subscribe;
  useEffect(() => {
    const check = () => setValue(() => getRef.current());
    check();
    return subRef.current(check);
  }, [dep]);
  return getRef.current();
}

export function useStore<T>(store: Store, select: (s: AppState) => T): T {
  return useSelected(() => select(store.get()), fn => store.subscribe(fn), store);
}

export function useUi<T>(ui: UiStore, select: (s: UiState) => T): T {
  return useSelected(() => select(ui.get()), fn => ui.subscribe(fn), ui);
}
