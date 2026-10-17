import type { Mm, Plan } from '../model/types';
import type { Element, Scene } from '../scene/types';
import { neighbours } from '../scene/neighbours';
import { buildScene } from '../scene/build';
import { supplyFor } from '../pricing/supply';
import { elementPoly } from '../viewer/views/world';
import { KERF, WALL_BATTEN_PIECE_LENGTH } from '../catalog';
import type { LayerId, ViewId } from './steps';
import { VIEW_LAYERS } from '../viewer/layers';
import { tooltipLines } from './tooltipText';
import type { AppState } from '../ui/store';
import { invalidOpeningIds, openingsOnlyInvalid } from '../ui/openingLogic';

// A terv fagyasztott, így az objektum azonossága érvényes gyorsítótár-kulcs.
const scenes = new WeakMap<Plan, Scene>();
export function sceneFor(plan: Plan): Scene {
  let sc = scenes.get(plan);
  if (!sc) { sc = buildScene(plan, supplyFor(plan)); scenes.set(plan, sc); }
  return sc;
}

/**
 * A rajzolandó terv: az utolsó érvényes; az alaprajz és a falnézetek viszont az aktuális tervet mutatják,
 * ha csak nyílászáró-hiba van (a hibás nyílás pirossal).
 */
export function drawSource(state: AppState, view: string): { plan: Plan; scene: Scene; invalid?: Set<string> } {
  const editable = view === 'floor' || view.startsWith('wall.');
  if (editable && state.errors.length > 0 && openingsOnlyInvalid(state)) {
    try {
      return { plan: state.plan, scene: sceneFor(state.plan), invalid: invalidOpeningIds(state) };
    } catch { /* a hibás nyílás miatt nem számolható: az utolsó érvényes terv */ }
  }
  return { plan: state.lastValidPlan, scene: sceneFor(state.lastValidPlan) };
}

/** A csoporton belüli szomszéd elem (← →), vagy null. */
export function stepNeighbour(scene: Scene, id: string, dir: 'left' | 'right'): string | null {
  if (!scene.elements.some(e => e.id === id)) return null;
  const n = neighbours(scene, 0, id);
  return (dir === 'left' ? n.left : n.right) ?? null;
}

/** Tab-sorrend: a nézetben látható elemek csoport, majd u, majd v szerint. Terv nélkül csak a csoport szűr. */
export function orderedIds(scene: Scene, view: ViewId, plan?: Plan): string[] {
  const visible = (e: Element): boolean => {
    if (plan) return elementPoly(plan, view, e) !== null;
    if (view.startsWith('wall.')) return e.group === view;
    if (view === 'roof') return e.group.startsWith('roof.');
    return e.group === view;
  };
  return scene.elements.filter(visible)
    .sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || a.geom.u - b.geom.u || a.geom.v - b.geom.v)
    .map(e => e.id);
}

/** Az elemfajta rétege a nézetekben. */
export function layerOfKind(kind: Element['kind']): LayerId {
  if (kind === 'osbSheet') return 'sheathing';
  if (kind === 'roofBatten' || kind === 'counterBatten') return 'battens';
  if (kind === 'meshSheet') return 'mesh';
  return 'frame';
}

/** Látszik-e az elemfajta a nézetben a kapcsolt rétegek mellett (a nézetben nem kapcsolható réteg mindig látszik). */
export function kindShown(kind: Element['kind'], view: ViewId, layers: Record<LayerId, boolean>): boolean {
  const layer = layerOfKind(kind);
  return !VIEW_LAYERS[view].includes(layer) || layers[layer];
}

/** Az a nézet, amelyik az elemet rajzolja. */
export function viewForElement(el: Element, _plan: Plan): ViewId {
  if (el.group.startsWith('wall.')) return el.group as ViewId;
  if (el.group.startsWith('roof.')) return 'roof';
  if (el.group === 'foundation' || el.group === 'frame') return 'foundation';
  return 'floor';
}

export interface StickPiece { id: string; label: string; offset: Mm; length: Mm; self: boolean }

/**
 * A szál darabjai a vágási hely sorrendjében. A fali lécek (`wall.batten.<n>`) elem nélküli darabok: „Fali léc”,
 * hosszuk a következő darab kezdetéből (utolsónál a szabvány lécdarabból) adódik. Toldott darabnál csak az
 * első rész szerepel (az `assignCuts` csak azt rögzíti), ennek hossza a szál hossza.
 */
export function stickPieces(scene: Scene, id: string): StickPiece[] {
  const cut = scene.cut[id];
  if (!cut) return [];
  const ids = [id, ...cut.siblings];
  const raw = ids.map(pid => ({ pid, ref: scene.cut[pid] })).filter(x => x.ref && x.ref.stockIndex === cut.stockIndex && x.ref.stockLength === cut.stockLength)
    .sort((a, b) => a.ref.offset - b.ref.offset);
  return raw.map((x, i) => {
    const el = scene.elements.find(e => e.id === x.pid);
    const next = raw[i + 1]?.ref.offset;
    const room = cut.stockLength - x.ref.offset;
    let length: Mm;
    if (el) length = Math.min(el.length, room);
    else length = next !== undefined ? next - x.ref.offset - KERF : Math.min(WALL_BATTEN_PIECE_LENGTH, room);
    return { id: x.pid, label: el ? el.label : 'Fali léc', offset: x.ref.offset, length, self: x.pid === id };
  });
}

/** Hány részből áll a toldott darab; 1, ha nem toldott. */
export function spliceParts(el: Element, scene: Scene): number {
  const cut = scene.cut[el.id];
  return cut && el.length > cut.stockLength ? Math.ceil(el.length / cut.stockLength) : 1;
}

/** A buborék/adatlap sorai az azonosítóhoz (elem vagy rögzítés); hibás nyílásnál a hibaüzenetekkel. */
export function targetLines(scene: Scene, plan: Plan, errors: { path: string; message: string }[], id: string): string[] {
  if (scene.fasteners.some(f => f.id === id)) return tooltipLines(scene, plan, { fx: id });
  const el = scene.elements.find(e => e.id === id);
  if (!el) return [];
  const errs: string[] = [];
  if (el.openingId) {
    const idx = plan.openings.findIndex(o => o.id === el.openingId);
    for (const e of errors) if (e.path.startsWith(`openings.${idx}.`)) errs.push(e.message);
  }
  return tooltipLines(scene, plan, { el: id }, errs);
}
