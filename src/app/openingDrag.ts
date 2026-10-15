import type { Mm, Opening, Plan } from '../model/types';
import { studLengthAt, wallGeometry } from '../calc/geometry';
import type { TempDim } from '../scene/neighbours';
import type { AppState, Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { snapClamp, SNAP } from '../ui/openingLogic';
import { cmText, drawSource } from './selection';

function find(plan: Plan, id: string): Opening {
  const o = plan.openings.find(x => x.id === id);
  if (!o) throw new Error(`Ismeretlen nyílás: ${id}`);
  return o;
}

/** Húzás közben az új távolság a fal elejétől: 50 mm-es rács, a `moveOpening` szorításával. */
export function dragOffset(plan: Plan, openingId: string, startOffset: Mm, deltaU: Mm): Mm {
  const o = find(plan, openingId);
  return snapClamp(plan, o.wall, o.width, startOffset + deltaU);
}

/** Ablak mellvédje húzás közben: 50 mm-es rács, [studSection.t + 50, szálhossz − magasság − studSection.w]; ajtónál változatlan. */
export function dragSill(plan: Plan, openingId: string, startSill: Mm, deltaV: Mm, atOffset?: Mm): Mm {
  const o = find(plan, openingId);
  if (o.type !== 'window') return startSill;
  const { t, w } = plan.walls.studSection;
  const wall = wallGeometry(plan).find(g => g.side === o.wall)!;
  const min = t + 50;
  const max = studLengthAt(plan, wall, (atOffset ?? o.offset) + o.width / 2) - o.height - w;
  return Math.max(min, Math.min(Math.round((startSill + deltaV) / SNAP) * SNAP, Math.max(min, max)));
}

/** Élő méretvonalak (a fal (u, v) síkjában): fal eleje, fal vége és a legközelebbi szomszéd nyílás. */
export function liveDims(plan: Plan, openingId: string, offset: Mm, sill: Mm): TempDim[] {
  const o = find(plan, openingId);
  const wallLen = wallGeometry(plan).find(g => g.side === o.wall)!.length;
  const y = plan.walls.studSection.t + sill;
  const end = offset + o.width;
  const dim = (x1: Mm, x2: Mm): TempDim => ({ x1, y1: y, x2, y2: y, offset: 0, text: cmText(x2 - x1) });
  const out = [dim(0, offset), dim(end, wallLen)];
  let best: { from: Mm; to: Mm } | undefined;
  for (const q of plan.openings) {
    if (q.id === openingId || q.wall !== o.wall) continue;
    const left = offset - (q.offset + q.width);
    const right = q.offset - end;
    const cand = right >= 0 && (left < 0 || right <= left) ? { from: end, to: q.offset }
      : left >= 0 ? { from: q.offset + q.width, to: offset } : undefined;
    if (cand && (!best || cand.to - cand.from < best.to - best.from)) best = cand;
  }
  if (best) out.push(dim(best.from, best.to));
  return out.map((d, i) => ({ ...d, offset: -150 * (i + 1) }));
}

/** A nyíláshoz tartozó jelenetelem id-ja (az elem-azonosító a faloszlop szerinti sorrendtől függ, ezért módosítás után újra kell kérni). */
export function openingElementId(state: AppState, openingId: string): string | null {
  const { scene } = drawSource(state, 'floor');
  return scene.elements.find(e => e.kind === 'opening' && e.openingId === openingId)?.id ?? null;
}

/** A jelenetelem nyílás-azonosítója, vagy null, ha az elem nem nyílás. */
export function openingIdOfElement(state: AppState, elementId: string | null): string | null {
  if (!elementId) return null;
  const { scene } = drawSource(state, 'floor');
  const el = scene.elements.find(e => e.id === elementId);
  return el?.kind === 'opening' ? el.openingId ?? null : null;
}

/** A nyílás kijelölése: a sor azonosítója mindig, a rajzi elem (ha a jelenetben már van) a tár aktuális állapotából. */
export function selectOpening(store: Store, ui: UiStore, openingId: string, detail = false): void {
  const id = openingElementId(store.get(), openingId);
  ui.set({ selectedOpening: openingId, selected: id, ...(detail && id ? { detailOpen: true } : {}) });
}
