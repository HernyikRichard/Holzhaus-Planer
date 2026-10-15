import type { AppState } from './store';
import type { Mm, Opening, Plan, WallSide } from '../model/types';
import { wallGeometry } from '../calc/geometry';
import { validatePlan } from '../model/validate';

export const SNAP: Mm = 50;
export const WALL_NAME: Record<WallSide, string> = { N: 'É', E: 'K', S: 'D', W: 'Ny' };
export const WALLS: WallSide[] = ['N', 'E', 'S', 'W'];
export const DEFAULTS = {
  door: { width: 900, height: 2000, sillHeight: 0 },
  window: { width: 600, height: 600, sillHeight: 1200 },
};

function wallLength(plan: Plan, wall: WallSide): Mm {
  return wallGeometry(plan).find(g => g.side === wall)!.length;
}

export function snapClamp(plan: Plan, wall: WallSide, width: Mm, offset: Mm): Mm {
  const { w, t } = plan.walls.studSection;
  const margin = w + t;
  const max = wallLength(plan, wall) - margin - width;
  return Math.max(margin, Math.min(Math.round(offset / SNAP) * SNAP, max));
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'o-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function addOpening(plan: Plan, wall: WallSide, type: 'door' | 'window', clickPos: Mm): Opening {
  const size = DEFAULTS[type];
  const opening: Opening = {
    id: newId(), type, wall,
    offset: snapClamp(plan, wall, size.width, clickPos - size.width / 2),
    ...size, swing: 'left',
  };
  plan.openings.push(opening);
  return opening;
}

export function moveOpening(plan: Plan, id: string, newOffset: Mm): void {
  const o = plan.openings.find(x => x.id === id);
  if (o) o.offset = snapClamp(plan, o.wall, o.width, newOffset);
}

// A rajz és a szerkesztő csak akkor használja az aktuális tervet, ha a hibák kizárólag nyílásokat érintenek.
export function openingsOnlyInvalid(state: AppState): boolean {
  return state.errors.every(e => e.path.startsWith('openings.'));
}

export function invalidOpeningIds(state: AppState): Set<string> {
  const ids = new Set<string>();
  for (const e of state.errors) {
    const m = /^openings\.(\d+)\./.exec(e.path);
    const o = m ? state.plan.openings[Number(m[1])] : undefined;
    if (o) ids.add(o.id);
  }
  return ids;
}

// Az első szabad, érvényes hely a D falon az új nyílásnak (típus szerinti alapméret); ha nincs, null és nem kerül hozzá semmi.
export function addFreeOpening(plan: Plan, type: 'door' | 'window'): Opening | null {
  const margin = plan.walls.studSection.w + plan.walls.studSection.t;
  const o = addOpening(plan, 'S', type, 0);
  const last = plan.openings.length - 1;
  const max = wallLength(plan, 'S') - margin - o.width;
  for (let off = margin; off <= max; off += SNAP) {
    o.offset = off;
    if (!validatePlan(plan).some(e => e.path.startsWith(`openings.${last}.`))) return o;
  }
  plan.openings.pop();
  return null;
}
