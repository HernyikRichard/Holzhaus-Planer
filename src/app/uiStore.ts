import { STEPS, type LayerId, type StepId, type ViewId } from './steps';
import type { Camera } from '../viewer/camera';
import { LAYER3D_GROUPS, type Layer3dId } from '../three-d/model';

/** A lebegő 3D ablak: x/y −1 = jobb alsó sarok; hiányzó réteg-kulcs = látható. */
export interface View3dState {
  open: boolean; x: number; y: number; w: number; h: number; maximized: boolean;
  layers: Partial<Record<Layer3dId, boolean>>;
}

export interface UiState {
  step: StepId; view: ViewId; selected: string | null; selectedOpening: string | null; hovered: string | null; highlight: string[];
  layers: Record<LayerId, boolean>; cameras: Partial<Record<ViewId, Camera>>; detailOpen: boolean;
  /** Anyaglista: keresés, kinyitott sorok, összecsukott kategóriák (a lépésváltáson át megmaradnak). */
  matQuery: string; matOpen: string[]; matClosed: string[];
  /** Anyaglista: csak az ár nélküli tételek (a Költség fül „Mutasd” gombja). */
  matOnlyMissing: boolean;
  /** A lebegő 3D ablak állapota (`favazas.3d.v1`). */
  view3d: View3dState;
  /** Szerelés: az aktuális szerelési lépés indexe (0-tól). */
  assemblyStep: number;
}
export interface UiStore {
  get(): UiState;
  set(patch: Partial<UiState>): void;
  subscribe(fn: () => void): () => void;
}

/** Új vagy betöltött terv: nincs kijelölés, kiemelés, tárolt kamera, nyitott adatlap. */
export const CLEAR_UI: Partial<UiState> = {
  selected: null, selectedOpening: null, hovered: null, highlight: [], cameras: {}, detailOpen: false, matOnlyMissing: false, assemblyStep: 0,
};

const LAYERS_KEY = 'favazas.layers.v1';
const LAYER_IDS: LayerId[] = ['frame', 'sheathing', 'battens', 'fasteners', 'dims', 'grid', 'mesh'];

const VIEW3D_KEY = 'favazas.3d.v1';
const LAYER3D_IDS: Layer3dId[] = LAYER3D_GROUPS.flatMap(g => g.layers);

export function defaultView3d(): View3dState {
  return { open: false, x: -1, y: -1, w: 420, h: 320, maximized: false, layers: {} };
}

/** A mentett 3D ablak: hiányzó / hibás mező az alapértékből; sérült érték esetén alapértékek. */
function loadView3d(): View3dState {
  const v = defaultView3d();
  try {
    const raw = localStorage.getItem(VIEW3D_KEY);
    if (!raw) return v;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return v;
    const o = p as Record<string, unknown>;
    if (typeof o.open === 'boolean') v.open = o.open;
    if (typeof o.maximized === 'boolean') v.maximized = o.maximized;
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      const n = o[k];
      if (typeof n === 'number' && Number.isFinite(n)) v[k] = n;
    }
    if (o.layers && typeof o.layers === 'object') {
      const l = o.layers as Record<string, unknown>;
      for (const id of LAYER3D_IDS) { const b = l[id]; if (typeof b === 'boolean') v.layers[id] = b; }
    }
    return v;
  } catch { /* nincs tárhely / sérült érték: alapértékek */
    return defaultView3d();
  }
}

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
    view3d: loadView3d(), assemblyStep: 0,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      let next = { ...state, ...patch };
      if (patch.step !== undefined && patch.step !== state.step) {
        const def = STEPS.find(s => s.id === patch.step)!;
        next = { ...next, view: patch.view ?? def.defaultView, selected: patch.selected ?? null, selectedOpening: patch.selectedOpening ?? null, highlight: patch.highlight ?? [], detailOpen: patch.detailOpen ?? false, matOnlyMissing: patch.matOnlyMissing ?? false };
      }
      if (patch.layers) {
        try { localStorage.setItem(LAYERS_KEY, JSON.stringify(patch.layers)); } catch { /* nem kritikus */ }
      }
      if (patch.view3d) {
        try { localStorage.setItem(VIEW3D_KEY, JSON.stringify(patch.view3d)); } catch { /* nem kritikus */ }
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
