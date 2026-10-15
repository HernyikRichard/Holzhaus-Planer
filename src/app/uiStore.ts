import { STEPS, type LayerId, type StepId, type ViewId } from './steps';
import type { Camera } from '../viewer/camera';

export interface UiState {
  step: StepId; view: ViewId; selected: string | null; selectedOpening: string | null; hovered: string | null; highlight: string[];
  layers: Record<LayerId, boolean>; cameras: Partial<Record<ViewId, Camera>>; detailOpen: boolean;
  /** Anyaglista: keresés, kinyitott sorok, összecsukott kategóriák (a lépésváltáson át megmaradnak). */
  matQuery: string; matOpen: string[]; matClosed: string[];
  /** Anyaglista: csak az ár nélküli tételek (a Költség fül „Mutasd” gombja). */
  matOnlyMissing: boolean;
}
export interface UiStore {
  get(): UiState;
  set(patch: Partial<UiState>): void;
  subscribe(fn: () => void): () => void;
}

/** Új vagy betöltött terv: nincs kijelölés, kiemelés, tárolt kamera, nyitott adatlap. */
export const CLEAR_UI: Partial<UiState> = {
  selected: null, selectedOpening: null, hovered: null, highlight: [], cameras: {}, detailOpen: false,
};

const LAYERS_KEY = 'favazas.layers.v1';
const LAYER_IDS: LayerId[] = ['frame', 'sheathing', 'battens', 'fasteners', 'dims', 'grid', 'mesh'];

function defaultLayers(): Record<LayerId, boolean> {
  return { frame: true, sheathing: true, battens: true, fasteners: true, dims: true, grid: true, mesh: true };
}

function loadLayers(): Record<LayerId, boolean> {
  const layers = defaultLayers();
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const id of LAYER_IDS) if (typeof parsed[id] === 'boolean') layers[id] = parsed[id];
    }
  } catch { /* nincs tárhely / sérült érték: alapértékek */ }
  return layers;
}

export function createUiStore(): UiStore {
  let state: UiState = {
    step: 'building', view: 'floor', selected: null, selectedOpening: null, hovered: null, highlight: [],
    layers: loadLayers(), cameras: {}, detailOpen: false, matQuery: '', matOpen: [], matClosed: [], matOnlyMissing: false,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      let next = { ...state, ...patch };
      if (patch.step !== undefined && patch.step !== state.step) {
        const def = STEPS.find(s => s.id === patch.step)!;
        next = { ...next, view: patch.view ?? def.defaultView, selected: patch.selected ?? null, selectedOpening: patch.selectedOpening ?? null, highlight: patch.highlight ?? [], detailOpen: patch.detailOpen ?? false };
      }
      if (patch.layers) {
        try { localStorage.setItem(LAYERS_KEY, JSON.stringify(patch.layers)); } catch { /* nem kritikus */ }
      }
      state = next;
      listeners.forEach(fn => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
