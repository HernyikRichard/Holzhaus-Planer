import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan, WallSide } from '../../src/model/types';
import { wallGeometry } from '../../src/calc/geometry';
import { buildScene } from '../../src/scene/build';
import {
  buildModel3d, FRAME_ONLY, LAYER3D_GROUPS, LAYER3D_NAMES, solidBounds, wallBaseZ, wallFrameOf, type Solid,
} from '../../src/three-d/model';
import { FOIL_T } from '../../src/scene/layerStack';
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
      expect(m.bounds.min[0]).toBeCloseTo(-plan.foundation.slabOverhang, 6);
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
  expect(FRAME_ONLY).toEqual(['foundation', 'floor', 'wallFrame', 'roofFrame', 'openings']);
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
