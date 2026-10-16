import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan, WallSide } from '../../src/model/types';
import { wallGeometry } from '../../src/calc/geometry';
import { buildScene } from '../../src/scene/build';
import {
  buildModel3d, FRAME_ONLY, LAYER3D_GROUPS, LAYER3D_NAMES, solidBounds, wallBaseZ, wallFrameOf, type Solid,
} from '../../src/three-d/model';
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
