import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan, WallSide } from '../../src/model/types';
import { roofGeometry, wallGeometry } from '../../src/calc/geometry';
import { COUNTER_BATTEN_SECTION, ROOF_BATTEN_SECTION, SCREW_HEAD_H } from '../../src/catalog';
import { buildScene } from '../../src/scene/build';
import {
  buildModel3d, FRAME_ONLY, LAYER3D_GROUPS, LAYER3D_NAMES, solidBounds, wallBaseZ, wallFrameOf, type Solid,
} from '../../src/three-d/model';
import { COVERING_T, DECKING_T, FOIL_T, floorTopZ } from '../../src/scene/layerStack';
import { frameLayout } from '../../src/calc/frame';
import { mono4x6Plan } from '../fixtures';

const FRAME_KINDS = new Set(['stud', 'cornerStud', 'gableStud', 'kingStud', 'jackStud', 'cripple', 'sill', 'header', 'bottomPlate', 'topPlate']);
const EPS = 0.5;

function withFloor(): Plan {
  const p = createDefaultPlan();
  p.floor.enabled = true;
  return p;
}
const model = (p: Plan) => buildModel3d(p, buildScene(p));
const byId = (solids: Solid[], id: string): Solid[] => solids.filter(s => s.elementId === id);

/** A test tetejének világ-Z-je a helyi u egy függőleges élén. */
function topZAt(s: Solid, uLocal: number): number {
  const vs = s.outline.filter(([u]) => Math.abs(u - uLocal) < 1e-6).map(([, v]) => v);
  expect(vs.length).toBeGreaterThan(0);
  return s.origin[2] + Math.max(...vs) * s.vAxis[2];
}
/** A (ferde) koszorú alsó élének v-je az adott u-nál: az outline első két pontja ([0,0], [w,0] elforgatva). */
function plateBottomV(s: Solid, u: number): number {
  const [[u0, v0], [u1, v1]] = s.outline;
  return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
}

const PLANS: Array<[string, Plan]> = [['default', createDefaultPlan()], ['floor', withFloor()], ['mono', mono4x6Plan()]];
for (const [name, plan] of PLANS) {
  describe(name, () => {
    const scene = buildScene(plan);
    const m = buildModel3d(plan, scene);

    test('every frame element has exactly one solid', () => {
      const frame = scene.elements.filter(e => e.group.startsWith('wall.') && FRAME_KINDS.has(e.kind));
      expect(frame.length).toBeGreaterThan(0);
      for (const e of frame) {
        const s = byId(m.solids, e.id);
        expect(s, e.id).toHaveLength(1);
        expect(s[0].layer).toBe('wallFrame');
      }
      const joists = scene.elements.filter(e => e.group === 'floor' && e.kind === 'joist');
      expect(joists.length > 0).toBe(plan.floor.enabled);
      for (const e of joists) {
        const s = byId(m.solids, e.id);
        expect(s, e.id).toHaveLength(1);
        expect(s[0].layer).toBe('floor');
      }
      expect(m.solids.filter(s => s.layer === 'wallFrame')).toHaveLength(frame.length);
    });

    test('corner stud sits in the corner', () => {
      const { width: W, length: L } = plan.building;
      const full = wallGeometry(plan).filter(g => g.full);
      expect(full).toHaveLength(2);
      for (const g of full) {
        const studs = scene.elements.filter(e => e.group === `wall.${g.side}` && e.kind === 'cornerStud');
        expect(studs).toHaveLength(2);
        const horizontal = g.side === 'N' || g.side === 'S';
        for (const e of studs) {
          const b = solidBounds(byId(m.solids, e.id)[0]);
          const cx = b.min[0] < W / 2 ? 0 : W;
          const cy = b.min[1] < L / 2 ? 0 : L;
          // a megfelelő épületsarok 150×150-es négyzetén belül
          expect(b.min[0]).toBeGreaterThanOrEqual((cx === 0 ? 0 : W - 150) - EPS);
          expect(b.max[0]).toBeLessThanOrEqual((cx === 0 ? 150 : W) + EPS);
          expect(b.min[1]).toBeGreaterThanOrEqual((cy === 0 ? 0 : L - 150) - EPS);
          expect(b.max[1]).toBeLessThanOrEqual((cy === 0 ? 150 : L) + EPS);
          // a fal saját oldalán fekvő sarok
          if (horizontal) expect(cy).toBe(g.side === 'N' ? 0 : L);
          else expect(cx).toBe(g.side === 'W' ? 0 : W);
          const along = horizontal ? b.max[0] - b.min[0] : b.max[1] - b.min[1];
          const across = horizontal ? b.max[1] - b.min[1] : b.max[0] - b.min[0];
          expect(along).toBeCloseTo(100, 3);
          expect(across).toBeCloseTo(50, 3);
          // a belső síkhoz simul (mélység sw−t … sw), mint az alaprajz L-je
          const inner = horizontal ? (cy === 0 ? b.max[1] : L - b.min[1]) : (cx === 0 ? b.max[0] : W - b.min[0]);
          expect(inner).toBeCloseTo(100, 3);
        }
        // a fal két végén, a végoszlop (t = 50) mellett
        const bs = studs.map(e => solidBounds(byId(m.solids, e.id)[0]));
        const ax = horizontal ? 0 : 1;
        expect(Math.min(...bs.map(b => b.min[ax]))).toBeCloseTo(50, 3);
        expect(Math.max(...bs.map(b => b.max[ax]))).toBeCloseTo((horizontal ? W : L) - 50, 3);
      }
    });

    test('stud stands on bottom plate and reaches top plate', () => {
      let checked = 0;
      for (const side of ['N', 'E', 'S', 'W'] as WallSide[]) {
        const g = wallGeometry(plan).find(w => w.side === side)!;
        if (g.hStart !== g.hEnd) continue;
        const els = scene.elements.filter(e => e.group === `wall.${side}`);
        const stud = els.filter(e => e.kind === 'stud')[1];
        const bp = solidBounds(byId(m.solids, els.find(e => e.kind === 'bottomPlate')!.id)[0]);
        const tps = els.filter(e => e.kind === 'topPlate').map(e => solidBounds(byId(m.solids, e.id)[0]));
        const sb = solidBounds(byId(m.solids, stud.id)[0]);
        expect(Math.abs(sb.min[2] - bp.max[2])).toBeLessThanOrEqual(EPS);
        expect(Math.abs(sb.max[2] - Math.min(...tps.map(b => b.min[2])))).toBeLessThanOrEqual(EPS);
        expect(Math.max(...tps.map(b => b.max[2]))).toBeCloseTo(wallBaseZ(plan) + g.hStart, 3);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    test('walls inside building footprint', () => {
      const { width: W, length: L } = plan.building;
      for (const s of m.solids.filter(x => x.layer === 'wallFrame')) {
        const b = solidBounds(s);
        expect(b.min[0], s.elementId).toBeGreaterThanOrEqual(-EPS);
        expect(b.max[0], s.elementId).toBeLessThanOrEqual(W + EPS);
        expect(b.min[1], s.elementId).toBeGreaterThanOrEqual(-EPS);
        expect(b.max[1], s.elementId).toBeLessThanOrEqual(L + EPS);
      }
    });

    test('bottom plate sits at wallBaseZ (matches section view)', () => {
      const zFloor = plan.floor.enabled ? plan.floor.joistSection.w + plan.floor.osbThickness : 0;
      expect(wallBaseZ(plan)).toBe(zFloor);
      for (const e of scene.elements.filter(x => x.kind === 'bottomPlate')) {
        expect(solidBounds(byId(m.solids, e.id)[0]).min[2]).toBeCloseTo(zFloor, 6);
      }
    });

    test('openings', () => {
      const ops = scene.elements.filter(e => e.kind === 'opening');
      expect(ops.length).toBeGreaterThan(0);
      for (const e of ops) {
        const s = byId(m.solids, e.id);
        expect(s.length).toBeGreaterThanOrEqual(1);
        for (const x of s) expect(x.layer).toBe('openings');
        const o = plan.openings.find(op => op.id === e.openingId)!;
        const fill = s.find(x => x.material === (o.type === 'door' ? 'door' : 'glass'));
        expect(fill).toBeDefined();
        // a nyílás téglalapján belül (helyi u, v)
        for (const [u, v] of fill!.outline) {
          expect(u).toBeGreaterThanOrEqual(e.geom.u - EPS);
          expect(u).toBeLessThanOrEqual(e.geom.u + e.geom.w + EPS);
          expect(v).toBeGreaterThanOrEqual(e.geom.v - EPS);
          expect(v).toBeLessThanOrEqual(e.geom.v + e.geom.h + EPS);
        }
        expect(fill!.depth).toBe(o.type === 'door' ? 40 : 6);
        const f = wallFrameOf(plan, o.wall);
        expect(fill!.uAxis).toEqual(f.uAxis);
        expect(fill!.nAxis).toEqual(f.nAxis);
        // a fal mélységében középen
        const b = solidBounds(fill!);
        const n = f.nAxis[0] !== 0 ? 0 : 1;
        const mid = (b.min[n] + b.max[n]) / 2;
        const outer = f.origin[n];
        expect(Math.abs(mid - outer)).toBeCloseTo(plan.walls.studSection.w / 2, 6);
      }
    });

    test('deterministic', () => {
      expect(buildModel3d(plan, buildScene(plan))).toEqual(m);
    });

    test('bounds contain all solids', () => {
      for (const s of m.solids) {
        const b = solidBounds(s);
        for (let i = 0; i < 3; i++) {
          expect(b.min[i]).toBeGreaterThanOrEqual(m.bounds.min[i] - 1e-9);
          expect(b.max[i]).toBeLessThanOrEqual(m.bounds.max[i] + 1e-9);
        }
      }
      // a betonlemez túlnyúlása benne van
      expect(m.bounds.min[0]).toBeLessThanOrEqual(-plan.foundation.slabOverhang + 1e-9); // a tető túlnyúlása ezen túl is lehet
      expect(m.bounds.min[2]).toBeCloseTo(-plan.foundation.slabThickness, 6);
    });

    test('layers list only present layers, in canonical order', () => {
      const present = new Set(m.solids.map(s => s.layer));
      expect(new Set(m.layers)).toEqual(present);
      const order = LAYER3D_GROUPS.flatMap(g => g.layers);
      expect(m.layers).toEqual(order.filter(l => present.has(l)));
    });
  });
}

test('mono roof sloped wall studs stay under top plate', () => {
  const plan = mono4x6Plan();
  expect(plan.roof.pitch).toBe(10);
  const scene = buildScene(plan);
  const m = buildModel3d(plan, scene);
  const sloped = wallGeometry(plan).filter(g => g.hStart !== g.hEnd);
  expect(sloped.length).toBe(2);
  const VERT = new Set(['stud', 'cornerStud', 'kingStud', 'jackStud', 'cripple']);
  for (const g of sloped) {
    const els = scene.elements.filter(e => e.group === `wall.${g.side}`);
    const plates = els.filter(e => e.kind === 'topPlate').map(e => byId(m.solids, e.id)[0]);
    const lowest = plates.reduce((a, b) => (plateBottomV(a, 0) < plateBottomV(b, 0) ? a : b));
    let n = 0;
    for (const e of els.filter(x => VERT.has(x.kind))) {
      const s = byId(m.solids, e.id)[0];
      for (const u of [e.geom.u, e.geom.u + e.geom.w]) {
        const plateZ = lowest.origin[2] + plateBottomV(lowest, u);
        expect(topZAt(s, u), `${e.id} @${u}`).toBeLessThanOrEqual(plateZ + 1e-6);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10);
  }
});

test('no floor layer without floor', () => {
  const p = createDefaultPlan();
  p.floor.enabled = false;
  const m = model(p);
  expect(m.layers).not.toContain('floor');
  expect(m.solids.some(s => s.layer === 'floor')).toBe(false);
  expect(wallBaseZ(p)).toBe(0);
  const bp = m.solids.filter(s => s.elementId?.endsWith('.bottomPlate.1'));
  expect(bp).toHaveLength(4);
  for (const s of bp) expect(solidBounds(s).min[2]).toBeCloseTo(0, 6);
});

test('floor: joists on slab, OSB on joists', () => {
  const p = withFloor();
  const m = model(p);
  expect(m.layers).toContain('floor');
  const jw = p.floor.joistSection.w;
  for (const s of m.solids.filter(x => x.layer === 'floor' && x.elementId)) {
    const b = solidBounds(s);
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(jw, 6);
  }
  const osb = m.solids.filter(x => x.layer === 'floor' && !x.elementId);
  expect(osb).toHaveLength(1);
  const b = solidBounds(osb[0]);
  expect(b.min).toEqual([0, 0, jw]);
  expect(b.max).toEqual([p.building.width, p.building.length, jw + p.floor.osbThickness]);
});

test('wallFrameOf: u matches floor-plan direction, n inward, origin at outer corner', () => {
  const p = createDefaultPlan(); // 3000×4000: E/W a teljes fal
  const { width: W, length: L } = p.building;
  expect(wallFrameOf(p, 'N')).toEqual({ origin: [100, 0, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], nAxis: [0, 1, 0] });
  expect(wallFrameOf(p, 'S')).toEqual({ origin: [100, L, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], nAxis: [0, -1, 0] });
  expect(wallFrameOf(p, 'E')).toEqual({ origin: [W, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1], nAxis: [-1, 0, 0] });
  expect(wallFrameOf(p, 'W')).toEqual({ origin: [0, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1], nAxis: [1, 0, 0] });
  p.floor.enabled = true;
  expect(wallFrameOf(p, 'W').origin).toEqual([0, 0, 118]);
});

test('foundation slab', () => {
  const p = createDefaultPlan();
  const s = model(p).solids.filter(x => x.layer === 'foundation');
  expect(s).toHaveLength(1);
  const ov = p.foundation.slabOverhang;
  expect(solidBounds(s[0])).toEqual({
    min: [-ov, -ov, -p.foundation.slabThickness], max: [p.building.width + ov, p.building.length + ov, 0],
  });
});

test('layer metadata', () => {
  expect(LAYER3D_NAMES.wallFrame).toBe('Falváz');
  expect(LAYER3D_GROUPS.map(g => g.name)).toEqual(['Alap', 'Fal', 'Tető', 'Egyéb']);
  expect(LAYER3D_GROUPS.flatMap(g => g.layers)).toHaveLength(Object.keys(LAYER3D_NAMES).length);
  expect(FRAME_ONLY).toEqual(['foundation', 'supports', 'beamFrame', 'floor', 'wallFrame', 'roofFrame', 'openings']);
});

// ---- fali réteglapok ----
type Pt2 = [number, number];
const SIDES: WallSide[] = ['N', 'E', 'S', 'W'];
const PANEL_LAYERS = ['interiorCladding', 'vaporBarrier', 'insulation', 'breatherMembrane', 'exteriorCladding'] as const;
const KIND_TO_LAYER = {
  interiorCladding: 'interiorCladding', vaporBarrier: 'vaporBarrier', insulation: 'insulation', osb: 'wallOsb',
  breatherMembrane: 'breatherMembrane', battens: 'wallBattens', exteriorCladding: 'exteriorCladding',
} as const;
const sameVec = (a: number[], b: number[]): boolean => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const rect = (u0: number, v0: number, u1: number, v1: number): Pt2[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
/** Az adott fal (nAxis szerint azonosítva) adott rétegű testjei. */
function onWall(p: Plan, solids: Solid[], side: WallSide, layer: string): Solid[] {
  const n = wallFrameOf(p, side).nAxis;
  return solids.filter(s => s.layer === layer && sameVec(s.nAxis, n));
}
function inPoly(poly: Pt2[], [x, y]: Pt2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const covers = (s: Solid, p: Pt2): boolean => inPoly(s.outline, p) && !s.holes.some(h => inPoly(h, p));
const key = (pts: Pt2[]): string => pts.map(([u, v]) => `${u.toFixed(6)}|${v.toFixed(6)}`).sort().join(';');
const range = (ss: Solid[], axis: number): [number, number] => {
  const bs = ss.map(solidBounds);
  return [Math.min(...bs.map(b => b.min[axis])), Math.max(...bs.map(b => b.max[axis]))];
};
function gableX(): Plan {
  const p = createDefaultPlan();
  p.roof.ridgeDirection = 'x';
  return p;
}

const LAYER_PLANS: Array<[string, Plan]> = [...PLANS, ['gable ridge x', gableX()]];
for (const [name, plan] of LAYER_PLANS) {
  describe(`${name}: wall layers`, () => {
    const scene = buildScene(plan);
    const m = buildModel3d(plan, scene);

    test('all enabled wall layers present', () => {
      for (const l of Object.values(KIND_TO_LAYER)) expect(m.layers).toContain(l);
      for (const side of SIDES) for (const l of PANEL_LAYERS) expect(onWall(plan, m.solids, side, l), `${side} ${l}`).toHaveLength(1);
    });

    test('opening is a hole in every wall layer', () => {
      for (const side of SIDES) {
        const ops = scene.elements.filter(e => e.group === `wall.${side}` && e.kind === 'opening');
        for (const l of PANEL_LAYERS) {
          const [s] = onWall(plan, m.solids, side, l);
          expect(s.elementId).toBeUndefined();
          expect(s.holes, `${side} ${l}`).toHaveLength(ops.length);
          expect(s.holes.map(key).sort()).toEqual(ops.map(o => key(rect(o.geom.u, o.geom.v, o.geom.u + o.geom.w, o.geom.v + o.geom.h))).sort());
          for (const h of s.holes) for (const p of h) expect(inPoly(s.outline, p), `${side} ${l} hole in outline`).toBe(true);
        }
      }
    });

    test('OSB sheets and battens keep openings free', () => {
      for (const side of SIDES) {
        const ops = scene.elements.filter(e => e.group === `wall.${side}` && e.kind === 'opening');
        const pieces = [...onWall(plan, m.solids, side, 'wallOsb'), ...onWall(plan, m.solids, side, 'wallBattens')];
        expect(pieces.length).toBeGreaterThan(0);
        for (const o of ops) {
          const { u, v, w, h } = o.geom;
          for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
            const p: Pt2 = [u + (w * i) / 20, v + (h * j) / 20];
            for (const s of pieces) expect(covers(s, p), `${s.label} covers ${o.id}`).toBe(false);
          }
        }
      }
    });

    test('every osbSheet has a wallOsb solid', () => {
      const sheets = scene.elements.filter(e => e.group.startsWith('wall.') && e.kind === 'osbSheet');
      expect(sheets.length).toBeGreaterThan(0);
      for (const e of sheets) expect(byId(m.solids, e.id).length, e.id).toBeGreaterThanOrEqual(1);
      expect(m.solids.filter(s => s.layer === 'wallOsb').every(s => s.elementId?.includes('.osbSheet.'))).toBe(true);
    });

    test('layers stack outward / inward, no overlap', () => {
      const sw = plan.walls.studSection.w;
      // É fal: n = +Y, kifelé csökkenő Y
      const y = (l: string): [number, number] => range(onWall(plan, m.solids, 'N', l), 1);
      const osb = y('wallOsb');
      const br = y('breatherMembrane');
      const bat = y('wallBattens');
      const ext = y('exteriorCladding');
      expect(osb[1]).toBeCloseTo(0, 6);
      expect(osb[0]).toBeCloseTo(-12, 6);
      expect(br[1]).toBeCloseTo(osb[0], 6);
      expect(br[0]).toBeCloseTo(osb[0] - FOIL_T, 6);
      expect(bat[1]).toBeCloseTo(br[0], 6);
      expect(bat[0]).toBeCloseTo(br[0] - 24, 6);
      expect(ext[1]).toBeLessThanOrEqual(br[0] + EPS);
      expect(ext[1]).toBeCloseTo(bat[0], 6);
      expect(ext[0]).toBeCloseTo(bat[0] - 19, 6);
      expect(y('insulation')).toEqual([0, sw]);
      const vb = y('vaporBarrier');
      const ic = y('interiorCladding');
      expect(vb[0]).toBeGreaterThanOrEqual(sw - EPS);
      expect(vb[0]).toBeCloseTo(sw, 6);
      expect(ic[0]).toBeCloseTo(vb[1], 6);
      expect(ic[1]).toBeCloseTo(vb[1] + 12, 6);
    });

    test('layer outline spans from the bottom plate to the wall top', () => {
      for (const g of wallGeometry(plan)) {
        const [s] = onWall(plan, m.solids, g.side, 'exteriorCladding');
        const b = solidBounds(s);
        expect(b.min[2]).toBeCloseTo(wallBaseZ(plan), 6);
        expect(b.max[2]).toBeGreaterThanOrEqual(wallBaseZ(plan) + Math.max(g.hStart, g.hEnd) + g.gableRise - EPS);
      }
    });

    test('corners not doubled, outer corner closed', () => {
      const vol = (a: Solid[], b: Solid[]): number => {
        let v = 1;
        for (let k = 0; k < 3; k++) {
          const ra = range(a, k);
          const rb = range(b, k);
          v *= Math.max(0, Math.min(ra[1], rb[1]) - Math.max(ra[0], rb[0]));
        }
        return v;
      };
      const pairs: [WallSide, WallSide][] = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']];
      for (const l of [...PANEL_LAYERS, 'wallOsb']) {
        for (const [a, b] of pairs) {
          expect(vol(onWall(plan, m.solids, a, l), onWall(plan, m.solids, b, l)), `${l} ${a}/${b}`).toBeLessThan(1e-6);
        }
      }
      // a külső burkolat négy fala együtt az épület köré zárt téglalapot ad
      const { width: W, length: L } = plan.building;
      const ext = SIDES.flatMap(s => onWall(plan, m.solids, s, 'exteriorCladding'));
      const T = -range(onWall(plan, m.solids, 'N', 'exteriorCladding'), 1)[0];
      expect(range(ext, 0)[0]).toBeCloseTo(-T, 6);
      expect(range(ext, 0)[1]).toBeCloseTo(W + T, 6);
      expect(range(ext, 1)[0]).toBeCloseTo(-T, 6);
      expect(range(ext, 1)[1]).toBeCloseTo(L + T, 6);
      // a teljes fal külső rétegei a sarkon a rövid fal külső rétegeinek vastagságával túlnyúlnak
      for (const g of wallGeometry(plan).filter(x => x.full)) {
        for (const l of ['wallOsb', 'breatherMembrane', 'wallBattens', 'exteriorCladding']) {
          const r = range(onWall(plan, m.solids, g.side, l), g.side === 'N' || g.side === 'S' ? 0 : 1);
          expect(r[0], `${g.side} ${l}`).toBeCloseTo(-T, 6);
        }
      }
    });

    test('battens are vertical BATTEN_SECTION pieces', () => {
      const bats = m.solids.filter(s => s.layer === 'wallBattens');
      expect(bats.length).toBeGreaterThan(20);
      for (const s of bats) {
        const us = s.outline.map(p => p[0]);
        expect(Math.max(...us) - Math.min(...us)).toBeLessThanOrEqual(48 + 1e-6);
        expect(s.depth).toBe(24);
        expect(s.material).toBe('timber');
        expect(s.elementId).toBeUndefined();
      }
    });
  });
}

test('wall layers only when enabled', () => {
  for (const kind of Object.keys(KIND_TO_LAYER) as (keyof typeof KIND_TO_LAYER)[]) {
    const p = createDefaultPlan();
    p.walls.layers.find(l => l.kind === kind)!.enabled = false;
    const m = model(p);
    const id = KIND_TO_LAYER[kind];
    expect(m.layers, kind).not.toContain(id);
    expect(m.solids.some(s => s.layer === id), kind).toBe(false);
    for (const other of Object.values(KIND_TO_LAYER)) if (other !== id) expect(m.layers, `${kind} off`).toContain(other);
  }
});

test('transparent wall layers have foil / insulation material, foils at least FOIL_T', () => {
  const m = model(createDefaultPlan());
  let n = 0;
  for (const s of m.solids) {
    if (s.layer === 'vaporBarrier' || s.layer === 'breatherMembrane') {
      expect(s.material).toBe('foil');
      expect(s.depth).toBeGreaterThanOrEqual(FOIL_T);
      n++;
    }
    if (s.layer === 'insulation') expect(s.material).toBe('insulation');
  }
  expect(n).toBe(8);
});

test('opening near corner keeps valid outline', () => {
  const p = createDefaultPlan();
  const full = wallGeometry(p).find(g => g.full)!;
  const o = p.openings.find(x => x.type === 'window')!;
  o.wall = full.side;
  o.offset = 250;
  const scene = buildScene(p);
  const m = buildModel3d(p, scene);
  const op = scene.elements.find(e => e.kind === 'opening' && e.openingId === o.id)!;
  expect(op.geom.u).toBe(250);
  for (const l of PANEL_LAYERS) {
    const [s] = onWall(p, m.solids, full.side, l);
    expect(s.holes.length).toBeGreaterThan(0);
    for (const h of s.holes) for (const pt of h) expect(inPoly(s.outline, pt), `${l} ${pt}`).toBe(true);
  }
  // az OSB táblák és a lécek sem takarják a nyílást
  const pieces = [...onWall(p, m.solids, full.side, 'wallOsb'), ...onWall(p, m.solids, full.side, 'wallBattens')];
  for (const s of pieces) expect(covers(s, [260, op.geom.v + 10]), s.label).toBe(false);
  // a nyílás melletti sávot viszont fedi OSB
  expect(onWall(p, m.solids, full.side, 'wallOsb').some(s => covers(s, [240, op.geom.v + 10]))).toBe(true);
});

test('gable wall layer follows gable', () => {
  const p = createDefaultPlan();
  const m = model(p);
  const gables = wallGeometry(p).filter(g => g.gableRise > 0);
  expect(gables).toHaveLength(2);
  for (const g of gables) {
    for (const l of PANEL_LAYERS) {
      const [s] = onWall(p, m.solids, g.side, l);
      expect(s.outline, `${g.side} ${l}`).toHaveLength(5);
      expect(solidBounds(s).max[2]).toBeCloseTo(wallBaseZ(p) + g.hStart + g.gableRise, 6);
    }
  }
});

test('gable studs stay under the gable line', () => {
  const p = createDefaultPlan();
  const scene = buildScene(p);
  const m = buildModel3d(p, scene);
  let n = 0;
  for (const g of wallGeometry(p).filter(x => x.gableRise > 0)) {
    const half = g.length / 2;
    const line = (u: number): number => wallBaseZ(p) + g.hStart + g.gableRise * (1 - Math.abs(u - half) / half);
    for (const e of scene.elements.filter(x => x.group === `wall.${g.side}` && x.kind === 'gableStud')) {
      const s = byId(m.solids, e.id)[0];
      for (const u of [e.geom.u, e.geom.u + e.geom.w]) {
        expect(topZAt(s, u), `${e.id} @${u}`).toBeLessThanOrEqual(line(u) + 1e-6);
        n++;
      }
    }
  }
  expect(n).toBeGreaterThan(4);
});

test('OSB sheet crossed by an opening is split around it', () => {
  const p = createDefaultPlan();
  const full = wallGeometry(p).find(g => g.full)!;
  const o = p.openings.find(x => x.type === 'window')!;
  Object.assign(o, { wall: full.side, offset: 1000, width: 600 });
  const scene = buildScene(p);
  const m = buildModel3d(p, scene);
  const op = scene.elements.find(e => e.kind === 'opening' && e.openingId === o.id)!;
  const sheets = scene.elements.filter(e => e.group === `wall.${full.side}` && e.kind === 'osbSheet');
  const crossed = sheets.filter(e => e.geom.u < 1000 && e.geom.u + e.geom.w > 1000 + 1e-6 || (e.geom.u > 1000 && e.geom.u < 1600));
  expect(crossed.length).toBeGreaterThan(0);
  const osb = onWall(p, m.solids, full.side, 'wallOsb');
  const { u, v, w, h } = op.geom;
  // a lyukak mindig a körvonalon belül vannak (érvényes sokszög), a keresztezett táblák darabokra bomlanak
  for (const s of osb) for (const hole of s.holes) for (const pt of hole) expect(inPoly(s.outline, pt), `${s.elementId} hole`).toBe(true);
  expect(osb.length).toBeGreaterThan(sheets.length);
  for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
    const pt: Pt2 = [u + (w * i) / 30, v + (h * j) / 30];
    expect(osb.some(s => covers(s, pt)), `${pt}`).toBe(false);
  }
  // a nyílás alatt, fölött és mellette van OSB
  for (const pt of [[u + w / 2, v - 10], [u + w / 2, v + h + 10], [u - 10, v + h / 2], [u + w + 10, v + h / 2]] as Pt2[]) {
    expect(osb.filter(s => covers(s, pt)), `${pt}`).toHaveLength(1);
  }
});

// ---- tető és kiegészítők ----
const AXIS_OF = (p: Plan): { P: 0 | 1; R: 0 | 1 } => (p.roof.ridgeDirection === 'y' ? { P: 0, R: 1 } : { P: 1, R: 0 });
/**
 * A test (u, v) körvonalának világ-Z tartománya a gerincre merőleges világtengely (axis) `at` értékén.
 * A tetőprofil-testek nAxis-a vízszintes (a gerinc irányában), így a körvonal síkja függőleges.
 */
function zRangeAt(s: Solid, axis: 0 | 1, at: number): [number, number] | null {
  const pts = s.outline.map(([u, v]) => [0, 1, 2].map(i => s.origin[i] + u * s.uAxis[i] + v * s.vAxis[i]));
  const zs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (Math.abs(a[axis] - at) < 1e-9) zs.push(a[2]);
    if ((a[axis] - at) * (b[axis] - at) < 0) zs.push(a[2] + ((b[2] - a[2]) * (at - a[axis])) / (b[axis] - a[axis]));
  }
  return zs.length ? [Math.min(...zs), Math.max(...zs)] : null;
}
function monoX(): Plan {
  const p = mono4x6Plan();
  p.roof.ridgeDirection = 'x';
  return p;
}
function flatPlan(): Plan {
  const p = createDefaultPlan();
  p.roof.shape = 'flat';
  p.roof.pitch = 3;
  return p;
}
const ROOF_KIND_LAYER: Record<string, string> = {
  rafter: 'roofFrame', ridge: 'roofFrame', collar: 'roofFrame', counterBatten: 'counterBatten', roofBatten: 'roofBatten',
  fascia: 'accessories', barge: 'accessories',
};
const ROOF_PLANS: Array<[string, Plan]> = [
  ['gable ridge y', createDefaultPlan()], ['gable ridge x', gableX()], ['mono ridge y', mono4x6Plan()],
  ['mono ridge x', monoX()], ['flat', flatPlan()],
];
for (const [name, plan] of ROOF_PLANS) {
  describe(`${name}: roof`, () => {
    const scene = buildScene(plan);
    const m = buildModel3d(plan, scene);
    const g = roofGeometry(plan);
    const { P, R } = AXIS_OF(plan);
    const cos = Math.cos(g.pitchRad);
    const zBase = wallBaseZ(plan) + plan.building.wallHeight;
    const th = plan.roof.rafterSection.w / cos;
    const rafters = scene.elements.filter(e => e.kind === 'rafter');
    const planeGroups = g.shape === 'gable' ? ['roof.L', 'roof.R'] : ['roof.M'];
    /** A tetősík közepe (p) és a hozzá tartozó szintetizált lapok (a p-tartomány alapján). */
    const mid = (group: string): number => (group === 'roof.L' ? g.W / 4 : group === 'roof.R' ? (3 * g.W) / 4 : g.W / 2);
    const sheetsOf = (layer: string, group: string): Solid[] => m.solids.filter(s => {
      if (s.layer !== layer || s.elementId) return false;
      if (g.shape !== 'gable') return true;
      const b = solidBounds(s);
      return ((b.min[P] + b.max[P]) / 2 < g.W / 2) === (group === 'roof.L');
    });

    test('rafters rest on top plate', () => {
      expect(rafters.length).toBeGreaterThan(0);
      const sides: Array<[number, WallSide]> = P === 0 ? [[0, 'W'], [g.W, 'E']] : [[0, 'N'], [g.W, 'S']];
      for (const [at, side] of sides) {
        const plates = scene.elements.filter(e => e.group === `wall.${side}` && e.kind === 'topPlate');
        const plateTop = Math.max(...plates.map(e => solidBounds(byId(m.solids, e.id)[0]).max[2]));
        let n = 0;
        for (const e of rafters) {
          const [s] = byId(m.solids, e.id);
          const r = zRangeAt(s, P, at);
          if (!r) continue;
          expect(Math.abs(r[0] - plateTop), `${e.id} @${side}`).toBeLessThanOrEqual(1);
          expect(r[1] - r[0]).toBeCloseTo(th, 6);
          n++;
        }
        // nyeregtetőnél síkonként, egyhajlásúnál minden szarufa mindkét falon fekszik
        expect(n).toBe(g.shape === 'gable' ? rafters.length / 2 : rafters.length);
      }
    });

    test('rafters run perpendicular to the ridge', () => {
      for (const e of rafters) {
        const [s] = byId(m.solids, e.id);
        const b = solidBounds(s);
        expect(b.max[P] - b.min[P], e.id).toBeGreaterThan(5 * (b.max[R] - b.min[R]));
        expect(b.max[R] - b.min[R]).toBeCloseTo(plan.roof.rafterSection.t, 6);
        expect(s.nAxis[2]).toBe(0);
        expect(Math.abs(s.nAxis[R])).toBe(1);
      }
    });

    test('every roof element has one solid', () => {
      const els = scene.elements.filter(e => e.group.startsWith('roof.') || e.kind === 'fascia' || e.kind === 'barge');
      expect(els.length).toBeGreaterThan(0);
      for (const e of els) {
        const s = byId(m.solids, e.id);
        expect(s, e.id).toHaveLength(1);
        expect(s[0].layer, e.id).toBe(ROOF_KIND_LAYER[e.kind]);
        expect(s[0].label).toBe(e.label);
      }
    });

    test('roof layers stack along normal', () => {
      const hasCounter = m.layers.includes('counterBatten');
      const hasBatten = m.layers.includes('roofBatten');
      for (const group of planeGroups) {
        const p = mid(group);
        const rafter = byId(m.solids, rafters.find(e => e.group === group)!.id)[0];
        const rr = zRangeAt(rafter, P, p)!;
        const one = (layer: string): [number, number] => {
          const ss = sheetsOf(layer, group);
          expect(ss, `${group} ${layer}`).toHaveLength(1);
          return zRangeAt(ss[0], P, p)!;
        };
        const d = one('decking');
        const u = one('underlay');
        const c = one('covering');
        expect(d[0]).toBeCloseTo(rr[1], 6);
        expect((d[1] - d[0]) * cos).toBeCloseTo(DECKING_T, 6);
        expect(u[0]).toBeCloseTo(d[1], 6);
        expect((u[1] - u[0]) * cos).toBeCloseTo(FOIL_T, 6);
        expect((c[0] - u[1]) * cos).toBeCloseTo((hasCounter ? COUNTER_BATTEN_SECTION.t : 0) + (hasBatten ? ROOF_BATTEN_SECTION.t : 0), 6);
        expect((c[1] - c[0]) * cos).toBeCloseTo(COVERING_T[plan.roof.covering], 6);
        if (hasCounter) {
          const cb = m.solids.find(s => s.layer === 'counterBatten' && s.elementId?.startsWith(`${group}.`))!;
          expect(zRangeAt(cb, P, p)![0]).toBeCloseTo(u[1], 6);
        }
        if (hasBatten) {
          // a tetőléc a gerinc mentén fut, az ellenléc (vagy a fólia) és a héjazat között
          const below = u[1] + (hasCounter ? COUNTER_BATTEN_SECTION.t / cos : 0);
          for (const s of m.solids.filter(x => x.layer === 'roofBatten' && x.elementId?.startsWith(`${group}.`))) {
            const b = solidBounds(s);
            expect(b.max[R] - b.min[R]).toBeCloseTo(g.roofLengthAlongRidge, 6);
            const at = (b.min[P] + b.max[P]) / 2;
            const r = zRangeAt(s, P, at)!;
            const shift = (z: number): number => z + (p - at) * (group === 'roof.L' ? 1 : -1) * Math.tan(g.pitchRad);
            expect(shift(r[0])).toBeGreaterThanOrEqual(below - 1e-6);
            expect(shift(r[1])).toBeLessThanOrEqual(c[0] + 1e-6);
          }
        }
      }
    });

    test('bounds include overhangs', () => {
      const { eaveOverhang: oe, gableOverhang: og } = plan.roof;
      const cov = m.solids.filter(s => s.layer === 'covering');
      expect(cov).toHaveLength(g.planes);
      expect(range(cov, P)[0]).toBeCloseTo(-oe, 6);
      expect(range(cov, P)[1]).toBeCloseTo(g.W + oe, 6);
      expect(range(cov, R)[0]).toBeCloseTo(-og, 6);
      expect(range(cov, R)[1]).toBeCloseTo(g.L + og, 6);
      expect(m.bounds.min[P]).toBeLessThanOrEqual(-oe + 1e-9);
      expect(m.bounds.max[P]).toBeGreaterThanOrEqual(g.W + oe - 1e-9);
      expect(m.bounds.min[R]).toBeLessThanOrEqual(-og + 1e-9);
      expect(m.bounds.max[R]).toBeGreaterThanOrEqual(g.L + og - 1e-9);
    });

    test('gutter along each eave', () => {
      const gut = m.solids.filter(s => s.layer === 'accessories' && !s.elementId);
      expect(gut).toHaveLength(plan.accessories.gutter ? g.eaveCount : 0);
      for (const s of gut) {
        const b = solidBounds(s);
        expect(b.max[R] - b.min[R]).toBeCloseTo(g.roofLengthAlongRidge, 6);
        // az eresz alacsony oldalán, a túlnyúláson kívül
        if (g.shape === 'gable') expect(b.max[P] <= -plan.roof.eaveOverhang + 1e-6 || b.min[P] >= g.W + plan.roof.eaveOverhang - 1e-6).toBe(true);
        else expect(b.min[P]).toBeGreaterThanOrEqual(g.W + plan.roof.eaveOverhang - 1e-6);
      }
      const p = structuredClone(plan);
      p.accessories.gutter = false;
      expect(model(p).solids.filter(s => s.layer === 'accessories' && !s.elementId)).toHaveLength(0);
    });

    if (g.shape === 'gable') {
      test('gable ridge in the middle at roofGeometry height', () => {
        const ridge = scene.elements.filter(e => e.kind === 'ridge');
        expect(ridge).toHaveLength(1);
        const b = solidBounds(byId(m.solids, ridge[0].id)[0]);
        expect((b.min[P] + b.max[P]) / 2).toBeCloseTo(g.W / 2, 6);
        expect(Math.abs(b.max[2] - (zBase + g.rise + th))).toBeLessThanOrEqual(1);
        expect(b.max[R] - b.min[R]).toBeCloseTo(g.roofLengthAlongRidge, 6);
        // a két sík szarufái a gerincpallóig érnek
        for (const e of rafters) {
          const rb = solidBounds(byId(m.solids, e.id)[0]);
          if (e.group === 'roof.L') expect(rb.max[P]).toBeCloseTo(b.min[P], 6);
          else expect(rb.min[P]).toBeCloseTo(b.max[P], 6);
        }
      });

      test('collars horizontal between the planes at plate height', () => {
        const cs = scene.elements.filter(e => e.kind === 'collar');
        expect(cs.length).toBeGreaterThan(0);
        for (const e of cs) {
          const b = solidBounds(byId(m.solids, e.id)[0]);
          expect(b.min[2]).toBeCloseTo(zBase, 6);
          expect(b.max[2]).toBeLessThanOrEqual(zBase + plan.roof.rafterSection.w + 1e-6);
          expect(b.min[P]).toBeGreaterThanOrEqual(-1e-6);
          expect(b.max[P]).toBeLessThanOrEqual(g.W + 1e-6);
        }
      });
    } else {
      test('mono roof: one plane, eave on the p = W side', () => {
        expect(rafters.every(e => e.group === 'roof.M')).toBe(true);
        const [cov] = m.solids.filter(s => s.layer === 'covering');
        const low = zRangeAt(cov, P, g.W)!;
        const high = zRangeAt(cov, P, 0)!;
        expect(high[0] - low[0]).toBeCloseTo(g.rise, 6);
        const highSide: WallSide = P === 0 ? 'W' : 'N';
        expect(wallGeometry(plan).find(w => w.side === highSide)!.hStart).toBeCloseTo(plan.building.wallHeight + g.rise, 6);
      });
    }
  });
}

test('flat roof: every counterBatten element has exactly one solid', () => {
  const p = flatPlan();
  const scene = buildScene(p);
  const cbs = scene.elements.filter(e => e.kind === 'counterBatten');
  expect(cbs.length).toBeGreaterThan(0);
  const m = buildModel3d(p, scene);
  expect(m.layers).toContain('counterBatten');
  for (const e of cbs) {
    const s = byId(m.solids, e.id);
    expect(s, e.id).toHaveLength(1);
    expect(s[0].layer).toBe('counterBatten');
  }
  expect(m.solids.filter(s => s.layer === 'counterBatten')).toHaveLength(cbs.length);
  expect(m.solids.filter(s => s.layer === 'covering')).toHaveLength(1);
});

test('batten solids exist exactly for batten scene elements (shingle, epdm)', () => {
  for (const covering of ['shingle', 'epdm'] as const) {
    for (const shape of ['gable', 'mono', 'flat'] as const) {
      const p = createDefaultPlan();
      p.roof.shape = shape;
      p.roof.pitch = shape === 'flat' ? 3 : shape === 'mono' ? 10 : 30;
      p.roof.covering = covering;
      for (const l of p.roof.layers) l.enabled = true;
      const scene = buildScene(p);
      const m = buildModel3d(p, scene);
      for (const kind of ['counterBatten', 'roofBatten'] as const) {
        const ids = scene.elements.filter(e => e.kind === kind).map(e => e.id).sort();
        const solidIds = m.solids.filter(s => s.layer === kind).map(s => s.elementId).sort();
        expect(solidIds, `${covering} ${shape} ${kind}`).toEqual(ids);
        expect(m.layers.includes(kind)).toBe(ids.length > 0);
      }
    }
  }
});

test('roof layers present and absent per plan', () => {
  const m = model(createDefaultPlan());
  for (const l of ['roofFrame', 'decking', 'underlay', 'counterBatten', 'roofBatten', 'covering', 'accessories']) expect(m.layers).toContain(l);
  // zsindely: kötelező deszkázat, nincs léc
  const p = createDefaultPlan();
  p.roof.covering = 'shingle';
  p.roof.layers.find(l => l.kind === 'decking')!.enabled = false;
  const s = model(p);
  expect(s.layers).toContain('decking');
  expect(s.layers).not.toContain('counterBatten');
  expect(s.layers).not.toContain('roofBatten');
  // alátétfólia kikapcsolva, kiegészítők nélkül
  const q = createDefaultPlan();
  q.roof.layers.find(l => l.kind === 'underlay')!.enabled = false;
  q.accessories = { ...q.accessories, gutter: false, fascia: false, bargeBoard: false };
  const n = model(q);
  expect(n.layers).not.toContain('underlay');
  expect(n.layers).not.toContain('accessories');
});

describe('állókorcos alumíniumlemez 3D', () => {
  for (const shape of ['gable', 'mono', 'flat'] as const) {
    test(`${shape}: fémes héjazatlemez és korcbordák 500 mm-enként, darabra pontosan`, () => {
      const p = createDefaultPlan();
      p.roof.shape = shape;
      p.roof.pitch = shape === 'flat' ? 3 : shape === 'mono' ? 10 : 30;
      p.roof.covering = 'standingSeam';
      for (const l of p.roof.layers) l.enabled = true;
      const scene = buildScene(p);
      const m = buildModel3d(p, scene);
      const g = roofGeometry(p);
      const cov = m.solids.filter(s => s.layer === 'covering');
      expect(cov.every(s => s.material === 'standingSeam' && s.elementId === undefined)).toBe(true);
      const plates = cov.filter(s => s.label === LAYER3D_NAMES.covering);
      const ribs = cov.filter(s => s.label === 'Állókorc');
      expect(plates).toHaveLength(g.planes);
      const seams = Math.ceil(g.roofLengthAlongRidge / 500 - 1e-9) + 1;
      expect(ribs).toHaveLength(seams * g.planes);
      for (const s of ribs) expect(s.depth).toBe(20);
      // a bordák a tetősíkon belül, a lemez a metszet szerinti 25 mm-es sávban
      const { R } = AXIS_OF(p);
      for (const s of ribs) {
        const b = solidBounds(s);
        expect(b.min[R]).toBeGreaterThanOrEqual(-p.roof.gableOverhang - 1e-6);
        expect(b.max[R]).toBeLessThanOrEqual(g.L + p.roof.gableOverhang + 1e-6);
      }
      // nincs léc, és minden scene-elemnek pontosan egy teste van
      expect(m.layers).not.toContain('counterBatten');
      expect(m.layers).not.toContain('roofBatten');
      expect(m.layers).toContain('decking');
      for (const e of scene.elements.filter(x => x.group.startsWith('roof.') || x.kind === 'fascia' || x.kind === 'barge')) {
        expect(byId(m.solids, e.id), e.id).toHaveLength(1);
      }
      const ids = new Set(scene.elements.map(e => e.id));
      expect(m.solids.filter(s => s.elementId && !ids.has(s.elementId))).toEqual([]);
    });
  }
});

describe('talajcsavaros alap', () => {
  const screwPlan = (): Plan => { const p = createDefaultPlan(); p.foundation.type = 'groundScrew'; return p; };
  const plan = screwPlan();
  const scene = buildScene(plan);
  const m = buildModel3d(plan, scene);
  const f = frameLayout(plan);
  const zr = (s: Solid): [number, number] => { const b = solidBounds(s); return [b.min[2], b.max[2]]; };

  it('rétegek: talaj, támaszok, gerendakeret, padló; nincs betonlemez', () => {
    for (const l of ['ground', 'supports', 'beamFrame', 'floor'] as const) expect(m.layers).toContain(l);
    expect(m.layers).not.toContain('foundation');
    expect(LAYER3D_NAMES.ground).toBe('Talaj');
    expect(LAYER3D_NAMES.supports).toBe('Támaszok');
    expect(LAYER3D_NAMES.beamFrame).toBe('Gerendakeret');
    expect(FRAME_ONLY).toEqual(expect.arrayContaining(['supports', 'beamFrame']));
  });

  it('a talaj lap a ház körül 1000 mm-rel, Z −20…0, elem nélkül', () => {
    const g = m.solids.filter(s => s.layer === 'ground');
    expect(g).toHaveLength(1);
    expect(g[0].elementId).toBeUndefined();
    const b = solidBounds(g[0]);
    expect(b.min).toEqual([-1000, -1000, -20]);
    expect(b.max).toEqual([plan.building.width + 1000, plan.building.length + 1000, 0]);
  });

  it('support, beam, joist elemenként van test; minden elementId létező elem (darabra pontos)', () => {
    const ids = new Set(scene.elements.map(e => e.id));
    for (const e of scene.elements.filter(x => ['support', 'beam', 'joist'].includes(x.kind))) {
      const n = byId(m.solids, e.id).length;
      expect(n).toBe(e.kind === 'support' ? 3 : 1);
    }
    for (const s of m.solids) if (s.elementId) expect(ids.has(s.elementId)).toBe(true);
  });

  it('a támaszok három testből állnak: talaj alatti cső, orsó, U-fej', () => {
    const sup = scene.elements.find(e => e.kind === 'support')!;
    const parts = byId(m.solids, sup.id);
    expect(parts.every(s => s.layer === 'supports')).toBe(true);
    const buried = parts.find(s => s.material === 'metalBuried')!;
    expect(solidBounds(buried).min[2]).toBe(-plan.foundation.groundScrew.length);
    expect(solidBounds(buried).max[2]).toBe(0);
    expect(buried.outline).toHaveLength(16);
    const head = plan.foundation.frame.groundClearance;
    const shaft = parts.find(s => s.material === 'metal' && s.outline.length === 16)!;
    expect(zr(shaft)).toEqual([0, head - SCREW_HEAD_H]);
    const u = parts.find(s => s.material === 'metal' && s.outline.length === 4)!;
    expect(zr(u)).toEqual([head - SCREW_HEAD_H, head]);
    const ub = solidBounds(u);
    expect(ub.max[f.along === 'x' ? 1 : 0] - ub.min[f.along === 'x' ? 1 : 0]).toBe(f.beam.width + 10);
  });

  it('a főgerendák alja = groundClearance, a párnafák alja = beamTop, a talpgerenda alja = floorTopZ', () => {
    for (const e of scene.elements.filter(x => x.kind === 'beam')) {
      const [s] = byId(m.solids, e.id);
      expect(s.layer).toBe('beamFrame');
      expect(s.material).toBe('timber');
      expect(Math.abs(zr(s)[0] - plan.foundation.frame.groundClearance)).toBeLessThan(1e-6);
      expect(zr(s)[1]).toBeCloseTo(f.z.beamTop, 6);
    }
    for (const e of scene.elements.filter(x => x.kind === 'joist')) {
      const [s] = byId(m.solids, e.id);
      expect(zr(s)).toEqual([f.z.beamTop, f.z.joistTop]);
    }
    const osb = m.solids.find(s => s.label === 'Padló OSB')!;
    expect(zr(osb)).toEqual([f.z.joistTop, f.z.floorTop]);
    const b = solidBounds(osb);
    expect([b.min[0], b.min[1], b.max[0], b.max[1]]).toEqual([0, 0, plan.building.width, plan.building.length]);
    const plate = m.solids.find(s => s.elementId?.includes('bottomPlate'))!;
    expect(zr(plate)[0]).toBe(floorTopZ(plan));
    expect(wallBaseZ(plan)).toBe(f.z.floorTop);
  });

  it('a bounds a talaj alatti részt is tartalmazza', () => {
    expect(m.bounds.min[2]).toBe(-plan.foundation.groundScrew.length);
  });

  it('a vágási terv darabszáma = a gerenda-testek száma', () => {
    const beams = scene.elements.filter(e => e.kind === 'beam');
    const cutPieces = beams.filter(e => scene.cut[e.id]).length;
    expect(cutPieces).toBe(beams.length);
    expect(beams.reduce((n, e) => n + byId(m.solids, e.id).length, 0)).toBe(cutPieces);
  });

  it('betonlemeznél nincs talaj, támasz, gerendakeret', () => {
    const s = model(createDefaultPlan());
    for (const l of ['ground', 'supports', 'beamFrame'] as const) expect(s.layers).not.toContain(l);
    expect(s.layers).toContain('foundation');
  });
});

describe('pontalap és betonpillér 3D', () => {
  const zr = (s: Solid): [number, number] => { const b = solidBounds(s); return [b.min[2], b.max[2]]; };
  const mk = (type: 'padFooting' | 'concretePier', kind: 'block200' | 'block250' | 'tube200' = 'block250'): Plan => {
    const p = createDefaultPlan();
    p.foundation.type = type;
    p.foundation.pier = { kind };
    p.foundation.frame.groundClearance = 300;
    return p;
  };

  for (const type of ['padFooting', 'concretePier'] as const) {
    describe(type, () => {
      const plan = mk(type);
      const scene = buildScene(plan);
      const m = buildModel3d(plan, scene);
      const f = frameLayout(plan);
      const { size, depth } = plan.foundation.footing;
      const clr = plan.foundation.frame.groundClearance;
      const sups = scene.elements.filter(e => e.kind === 'support');

      it('rétegek: talaj, támaszok, gerendakeret, padló; nincs betonlemez', () => {
        for (const l of ['ground', 'supports', 'beamFrame', 'floor'] as const) expect(m.layers).toContain(l);
        expect(m.layers).not.toContain('foundation');
      });

      it('minden support elemnek van teste, supports rétegben, és a talp −depth…0', () => {
        expect(sups.length).toBeGreaterThan(0);
        for (const e of sups) {
          const parts = byId(m.solids, e.id);
          expect(parts.length).toBe(type === 'padFooting' ? 2 : 3);
          expect(parts.every(s => s.layer === 'supports')).toBe(true);
          const foot = parts.find(s => s.material === 'concreteBuried')!;
          expect(zr(foot)).toEqual([-depth, 0]);
          const b = solidBounds(foot);
          expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([size, size]);
        }
        expect(m.bounds.min[2]).toBe(-depth);
      });

      if (type === 'padFooting') {
        it('az oszloptalp fém 60×60, Z 0…clearance', () => {
          const e = sups[0];
          const post = byId(m.solids, e.id).find(s => s.material === 'metal')!;
          expect(zr(post)).toEqual([0, clr]);
          const b = solidBounds(post);
          expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([60, 60]);
          expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(e.geom.u + e.geom.w / 2, 6);
        });
      } else {
        it('pillér Z 0…clearance−10, papucs lap a gerenda alján', () => {
          const e = sups[0];
          const parts = byId(m.solids, e.id);
          const pier = parts.find(s => s.material === 'concrete')!;
          expect(zr(pier)).toEqual([0, clr - 10]);
          const b = solidBounds(pier);
          expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([250, 250]);
          const br = parts.find(s => s.material === 'metal')!;
          expect(zr(br)[0]).toBe(clr - 10);
          expect(zr(br)[1]).toBe(f.z.beamBottom);
          const bb = solidBounds(br);
          const wi = f.along === 'x' ? 1 : 0;
          expect(bb.max[wi] - bb.min[wi]).toBe(f.beam.width + 10);
          expect(bb.max[1 - wi] - bb.min[1 - wi]).toBe(100);
        });
      }
    });
  }

  it('zsalucső pillér: 16 pontú körvonal, Ø200', () => {
    const plan = mk('concretePier', 'tube200');
    const scene = buildScene(plan);
    const m = buildModel3d(plan, scene);
    const e = scene.elements.find(x => x.kind === 'support')!;
    const pier = byId(m.solids, e.id).find(s => s.material === 'concrete')!;
    expect(pier.outline).toHaveLength(16);
    const b = solidBounds(pier);
    expect(b.max[0] - b.min[0]).toBeCloseTo(200, 0);
  });

  it('block200 pillér 200×200', () => {
    const plan = mk('concretePier', 'block200');
    const scene = buildScene(plan);
    const e = scene.elements.find(x => x.kind === 'support')!;
    const pier = byId(buildModel3d(plan, scene).solids, e.id).find(s => s.material === 'concrete')!;
    const b = solidBounds(pier);
    expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([200, 200]);
  });
});
