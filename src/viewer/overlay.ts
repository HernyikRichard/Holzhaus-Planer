import type { Plan } from '../model/types';
import type { Scene } from '../scene/types';
import type { TempDim } from '../scene/neighbours';
import type { ViewId } from './layers';
import { boundsOf, Kit, n, screenPx, type Pt } from './svgKit';
import { SCREEN_PALETTE } from './theme';
import { elementPoly, toWorld } from './views/world';

const HL_RING_PX = 9;

function screenKit(): Kit {
  return new Kit({ palette: SCREEN_PALETTE, screen: true });
}

function hlPoly(kit: Kit, pts: Pt[]): string {
  return `<polygon class="hl" points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" `
    + `${kit.fill('highlight', 0.3)} ${kit.stroke('highlight', 2)} pointer-events="none"/>`;
}

/**
 * Sárga kiemelés az elemhez (keret és áttetsző kitöltés), vagy a rögzítéshez (gyűrű, a hozzá tartozó elemek kerete).
 * A nézet által nem rajzolt elemhez üres szöveg.
 */
export function highlightSvg(scene: Scene, id: string, view: ViewId, plan: Plan): string {
  const kit = screenKit();
  const el = scene.elements.find(e => e.id === id);
  if (el) {
    const pts = elementPoly(plan, view, el);
    return pts ? hlPoly(kit, pts) : '';
  }
  const f = scene.fasteners.find(x => x.id === id);
  if (!f) return '';
  const at = toWorld(plan, view, f.group, f.u, f.v);
  if (!at) return '';
  const owners = f.elementIds
    .map(eid => scene.elements.find(e => e.id === eid))
    .map(e => (e ? elementPoly(plan, view, e) : null))
    .filter((p): p is Pt[] => p !== null)
    .map(p => hlPoly(kit, p)).join('');
  const ring = `<circle class="hl hl-fx" cx="${n(at[0])}" cy="${n(at[1])}" r="${n(HL_RING_PX)}" fill="none" ${kit.stroke('highlight', 2)} `
    + `style="r:${screenPx(HL_RING_PX, HL_RING_PX)}" pointer-events="none"/>`;
  return owners + ring;
}

export const TEMP_DIM_STEP_PX = 18;

/**
 * Ideiglenes méretvonalak a `tempDimensions` szerint. A vonalak (u, v) végpontjait ugyanaz a leképezés viszi a nézetbe,
 * mint az elemeket (`toWorld`). A vonalak az elem közepén futnak (`mid`: az elem félmérete u, v irányban; u irányú vonalnál
 * a v, v irányú vonalnál az u eltolás), és képernyőállandó lépéssel (~18 px, --mmpx) egymás alá/mellé rakódnak, így nem
 * ütköznek az állandó méretlánccal. Alaprajzon a fal vonala mentén, az épület belseje felé rakódnak.
 * `fs`: a nézet betűmérete (világ-mm), alapból a méretvonalak kiterjedéséből. A feliratok panelszínű háttérrel (halo) olvashatók.
 */
export function tempDimsSvg(dims: TempDim[], view: ViewId, plan: Plan, group: string = view, fs?: number,
  mid: { u: number; v: number } = { u: 0, v: 0 }): string {
  const kit = new Kit({ palette: { ...SCREEN_PALETTE, bg: SCREEN_PALETTE.panel }, screen: true });
  const worlds = dims.map(d => {
    const vertical = Math.abs(d.y2 - d.y1) > Math.abs(d.x2 - d.x1);
    const du = vertical ? mid.u : 0;
    const dv = vertical ? 0 : mid.v;
    const a = toWorld(plan, view, group, d.x1 + du, d.y1 + dv);
    const b = toWorld(plan, view, group, d.x2 + du, d.y2 + dv);
    return a && b ? { d, a, b } : null;
  }).filter((w): w is NonNullable<typeof w> => w !== null);
  if (worlds.length === 0) return '';
  const xs = worlds.flatMap(w => [w.a[0], w.b[0]]);
  const ys = worlds.flatMap(w => [w.a[1], w.b[1]]);
  kit.fs = fs ?? Math.max(boundsOf({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }).max / 8, 1);
  const center: Pt = [plan.building.width / 2, plan.building.length / 2];
  let out = '';
  worlds.forEach(({ d, a, b }, i) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) return;
    // a rakódás iránya: a szakaszra merőleges, alaprajzon az épület belseje felé, egyébként lefelé / jobbra
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    const want: Pt = view === 'floor' ? [center[0] - a[0], center[1] - a[1]] : [0.001, 1];
    if (nx * want[0] + ny * want[1] < 0) { nx = -nx; ny = -ny; }
    const k = TEMP_DIM_STEP_PX * i;
    const shift = `translate(calc(var(--mmpx, 1) * ${n(nx * k)}px), calc(var(--mmpx, 1) * ${n(ny * k)}px))`;
    out += `<g style="transform:${shift}">${kit.dim(a[0], a[1], b[0], b[1], 0, d.text, 'end')}${kit.takeLabels()}</g>`;
  });
  return out ? `<g class="temp-dims" pointer-events="none">${out}</g>` : '';
}
