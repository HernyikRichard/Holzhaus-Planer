// @vitest-environment jsdom
import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { renderStandalone, renderView } from '../../src/viewer/render';
import { PRINT_PALETTE, SCREEN_PALETTE } from '../../src/viewer/theme';
import type { ViewId } from '../../src/viewer/layers';
import type { Plan } from '../../src/model/types';

const p = createDefaultPlan(); const sc = buildScene(p);
const all = { frame: true, sheathing: true, battens: true, fasteners: true, dims: true, grid: true, mesh: true };
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const r = (view: ViewId, layers = all) => renderView({ plan: p, scene: sc, view, layers, palette: SCREEN_PALETTE }).svg;
const VIEWS: ViewId[] = ['floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W', 'section', 'roof', 'gable', 'foundation'];

test('wall view has one data-el per wall element', () => {
  const n = sc.elements.filter(e => e.group === 'wall.E').length;
  expect(count(r('wall.E'), /data-el="wall\.E\./g)).toBe(n);
});
test('wall view fasteners', () => {
  const n = sc.fasteners.filter(f => f.group === 'wall.E').length;
  expect(count(r('wall.E'), /data-fx="/g)).toBe(n);
});
test('fasteners layer off hides them', () => {
  expect(r('wall.E', { ...all, fasteners: false })).not.toContain('data-fx=');
});
test('sheathing layer off hides OSB', () => {
  expect(r('wall.E', { ...all, sheathing: false })).not.toContain('el-osbSheet');
});
test('roof view rafters', () => { expect(count(r('roof'), /el-rafter/g)).toBe(18); });
test('every view is well-formed XML and finite', () => {
  for (const v of VIEWS) {
    const s = renderStandalone({ plan: p, scene: sc, view: v, layers: all, palette: PRINT_PALETTE });
    expect(new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    expect(s).not.toMatch(/NaN|Infinity/);
  }
});
test('floor plan dims show 300 cm and 400 cm', () => {
  const s = r('floor'); expect(s).toContain('300 cm'); expect(s).toContain('400 cm');
});

// kiegészítő tesztek
test('floor plan keeps one data-wall group per wall, wall elements inside', () => {
  const doc = new DOMParser().parseFromString(
    renderStandalone({ plan: p, scene: sc, view: 'floor', layers: all, palette: PRINT_PALETTE }), 'image/svg+xml');
  for (const side of ['N', 'E', 'S', 'W']) {
    const g = doc.querySelectorAll(`g[data-wall="${side}"]`);
    expect(g.length).toBe(1);
    expect(g[0].querySelectorAll(`[data-el^="wall.${side}."]`).length).toBeGreaterThan(0);
  }
  const anchors = sc.fasteners.filter(f => f.kind === 'anchor').length;
  expect(doc.querySelectorAll('circle.fx-anchor').length).toBe(anchors);
});
test('invalid opening is marked', () => {
  const s = renderView({ plan: p, scene: sc, view: 'wall.S', layers: all, palette: SCREEN_PALETTE,
    invalidOpeningIds: new Set(['door-1']) }).svg;
  const tag = s.match(/<g [^>]*data-opening-id="door-1"[^>]*>/)?.[0];
  expect(tag).toMatch(/class="[^"]*\binvalid\b/);
  expect(r('wall.S')).not.toContain('invalid');
});
test('dims layer off hides dimension text', () => {
  expect(r('floor', { ...all, dims: false })).not.toContain(' cm<');
});
test('battens layer toggles roof battens', () => {
  expect(r('roof')).toContain('el-roofBatten');
  expect(r('roof', { ...all, battens: false })).not.toContain('el-roofBatten');
});
test('foundation view draws every mesh sheet', () => {
  const n = sc.elements.filter(e => e.kind === 'meshSheet').length;
  expect(count(r('foundation'), /class="el el-meshSheet"/g)).toBe(n);
});
test('bounds are finite and contain the building', () => {
  for (const v of VIEWS) {
    const b = renderView({ plan: p, scene: sc, view: v, layers: all, palette: SCREEN_PALETTE }).bounds;
    expect(Number.isFinite(b.minX + b.minY + b.maxX + b.maxY)).toBe(true);
    expect(b.maxX - b.minX).toBeGreaterThan(2000);
  }
});
test('gable view shows the gable wall and the rafter pair', () => {
  const s = r('gable');
  expect(s).toMatch(/data-el="wall\.N\./);
  expect(s).toContain('data-el="roof.L.rafter.1"');
  expect(s).toContain('data-el="roof.R.rafter.1"');
  expect(s).toContain('el-collar');
});
test('mono plan: wall and roof views render', () => {
  const m: Plan = { ...p, building: { width: 4000, length: 6000, wallHeight: 2400 },
    roof: { ...p.roof, shape: 'mono', ridgeDirection: 'y' } };
  const ms = buildScene(m);
  for (const v of ['wall.N', 'wall.E', 'roof', 'gable'] as ViewId[]) {
    const s = renderStandalone({ plan: m, scene: ms, view: v, layers: all, palette: PRINT_PALETTE });
    expect(new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    expect(s).not.toMatch(/NaN|Infinity/);
  }
  expect(count(renderView({ plan: m, scene: ms, view: 'roof', layers: all, palette: SCREEN_PALETTE }).svg, /el-rafter/g))
    .toBe(ms.elements.filter(e => e.kind === 'rafter').length);
  expect(renderView({ plan: m, scene: ms, view: 'gable', layers: all, palette: SCREEN_PALETTE }).svg)
    .toContain('data-el="roof.M.rafter.1"');
});

// --- fix round 1 ---
const attrR = (s: string, kind: string): number[] =>
  [...s.matchAll(new RegExp(`<circle [^>]*class="fx fx-${kind}"[^>]*>`, 'g'))].map(m => Number(/ r="([\d.]+)"/.exec(m[0])![1]));
test('fastener kinds are distinguishable by size and colour', () => {
  const s = r('wall.E');
  const [anchor, frame, osb] = [attrR(s, 'anchor')[0], attrR(s, 'frameScrew')[0], attrR(s, 'osbScrew')[0]];
  expect(anchor).toBeGreaterThan(frame);
  expect(frame).toBeGreaterThan(osb);
  const osbTag = s.match(/<circle [^>]*class="fx fx-osbScrew"[^>]*>/)![0];
  expect(osbTag).toContain(`fill="${SCREEN_PALETTE.fastenerMuted}"`);
  const frameTag = s.match(/<circle [^>]*class="fx fx-frameScrew"[^>]*>/)![0];
  expect(frameTag).toContain(`fill="${SCREEN_PALETTE.fastener}"`);
  expect(PRINT_PALETTE.fastenerMuted).toBeDefined();
  const tie = attrR(r('roof'), 'hurricaneTie')[0];
  expect(tie).toBeGreaterThan(frame);
});
test('screen text and fastener sizes follow --mmpx with world fallback', () => {
  const s = r('wall.E');
  expect(s).toContain('var(--mmpx');
  // a fallback × px = a világméret (r attribútum)
  const tag = s.match(/<circle [^>]*class="fx fx-frameScrew"[^>]*>/)![0];
  const m = /r:calc\(var\(--mmpx, ([\d.]+)\) \* ([\d.]+)px\)/.exec(tag)!;
  expect(Number(m[1]) * Number(m[2])).toBeCloseTo(Number(/ r="([\d.]+)"/.exec(tag)![1]), 0);
  // méretfeliratok: --mmpx-szel skálázott, pixelegységű csoport; egyéb feliratok: font-size calc
  expect(s).toMatch(/transform:scale\(var\(--mmpx, [\d.]+\)\)/);
  expect(r('floor')).toMatch(/font-size:calc\(var\(--mmpx, [\d.]+\) \* [\d.]+px\)/);
});
test('standalone output renders sizes without --mmpx (fallback world sizes)', () => {
  const s = renderStandalone({ plan: p, scene: sc, view: 'wall.E', layers: all, palette: PRINT_PALETTE });
  expect(s).not.toContain('--mmpx');
  const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
  const t = doc.querySelector('text')!;
  expect(Number(t.getAttribute('font-size'))).toBeGreaterThan(10);
  expect(Number(doc.querySelector('circle.fx-anchor')!.getAttribute('r'))).toBeGreaterThan(1);
});
test('roof view: element and fastener counts, battens painted under the rafters', () => {
  const s = r('roof');
  const roofEls = sc.elements.filter(e => ['roof.L', 'roof.R', 'roof.M', 'roof.ridge', 'roof.collar'].includes(e.group)
    && ['rafter', 'ridge', 'fascia', 'barge', 'counterBatten', 'roofBatten', 'collar'].includes(e.kind));
  expect(count(s, /data-el="/g)).toBe(roofEls.length);
  expect(count(s, /data-fx="/g)).toBe(sc.fasteners.filter(f => ['roof.L', 'roof.R', 'roof.M', 'roof.collar'].includes(f.group)).length);
  expect(s.indexOf('el-roofBatten')).toBeLessThan(s.indexOf('el-rafter'));
});
test('gable view: element and fastener counts', () => {
  const s = r('gable');
  const wallN = sc.elements.filter(e => e.group === 'wall.N');
  const roofIds = ['roof.L.rafter.1', 'roof.R.rafter.1', 'roof.collar.collar.1', 'roof.collar.collar.2'];
  expect(count(s, /data-el="/g)).toBe(wallN.length + roofIds.length);
  for (const id of roofIds) expect(s).toContain(`data-el="${id}"`);
  const fx = sc.fasteners.filter(f => f.group === 'wall.N').length
    + roofIds.flatMap(id => sc.elements.find(e => e.id === id)!.fasteners).length;
  expect(count(s, /data-fx="/g)).toBe(fx);
});
test('mono wall view: element and fastener counts', () => {
  const m: Plan = { ...p, building: { width: 4000, length: 6000, wallHeight: 2400 },
    roof: { ...p.roof, shape: 'mono', ridgeDirection: 'y' } };
  const ms = buildScene(m);
  for (const side of ['N', 'E']) {
    const s = renderView({ plan: m, scene: ms, view: `wall.${side}` as ViewId, layers: all, palette: SCREEN_PALETTE }).svg;
    expect(count(s, /data-el="/g)).toBe(ms.elements.filter(e => e.group === `wall.${side}`).length);
    expect(count(s, /data-fx="/g)).toBe(ms.fasteners.filter(f => f.group === `wall.${side}`).length);
  }
});

test('section hides a disabled insulation layer', () => {
  expect(r('section')).toContain('data-layer="insulation"');
  const q = createDefaultPlan();
  q.walls.layers.find(l => l.kind === 'insulation')!.enabled = false;
  const s = renderView({ plan: q, scene: buildScene(q), view: 'section', layers: all, palette: SCREEN_PALETTE }).svg;
  expect(s).not.toContain('data-layer="insulation"');
});
test('roof view has 18 rafters (data-el) and foundation 6 mesh sheets', () => {
  expect(count(r('roof'), /data-el="roof\.[^"]*rafter/g)).toBe(18);
  expect(count(r('foundation'), /data-el="[^"]*meshSheet/g)).toBe(6);
});
test('elevation width dimension label sits below ground', () => {
  const m = /<text x="[-\d.]+" y="([-\d.]+)"[^>]*>280 cm<\/text>/.exec(r('wall.N'));
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeGreaterThan(0);
});

function drawnIds(plan: Plan): { els: Set<string>; fxs: Set<string>; scene: ReturnType<typeof buildScene> } {
  const scene = buildScene(plan);
  const els = new Set<string>(); const fxs = new Set<string>();
  for (const v of VIEWS) {
    const svg = renderView({ plan, scene, view: v, layers: all, palette: SCREEN_PALETTE }).svg;
    for (const m of svg.matchAll(/data-el="([^"]+)"/g)) els.add(m[1]);
    for (const m of svg.matchAll(/data-fx="([^"]+)"/g)) fxs.add(m[1]);
  }
  return { els, fxs, scene };
}
test('every scene element and fastener is drawn in some view (floor enabled; gable and mono)', () => {
  for (const shape of ['gable', 'mono'] as const) {
    const plan = createDefaultPlan();
    plan.floor.enabled = true;
    plan.roof.shape = shape;
    const { els, fxs, scene } = drawnIds(plan);
    expect(scene.elements.filter(e => e.kind === 'joist').length).toBeGreaterThan(0);
    expect(scene.elements.filter(e => !els.has(e.id)).map(e => e.id)).toEqual([]);
    expect(scene.fasteners.filter(f => !fxs.has(f.id)).map(f => f.id)).toEqual([]);
  }
});
test('floor view draws joists dashed on the frame layer only when the floor is enabled', () => {
  const plan = createDefaultPlan(); plan.floor.enabled = true;
  const scene = buildScene(plan);
  const on = renderView({ plan, scene, view: 'floor', layers: all, palette: SCREEN_PALETTE }).svg;
  expect(count(on, /data-el="floor\.joist\./g)).toBe(scene.elements.filter(e => e.kind === 'joist').length);
  expect(renderView({ plan, scene, view: 'floor', layers: { ...all, frame: false }, palette: SCREEN_PALETTE }).svg).not.toContain('floor.joist');
  expect(r('floor')).not.toContain('floor.joist');
});
test('roof view draws collars and their frame screws', () => {
  const collars = sc.elements.filter(e => e.kind === 'collar');
  expect(collars.length).toBeGreaterThan(0);
  const svg = r('roof');
  for (const c of collars) expect(svg).toContain(`data-el="${c.id}"`);
  const collarFx = sc.fasteners.filter(f => f.group === 'roof.collar');
  expect(collarFx.length).toBeGreaterThan(0);
  for (const f of collarFx) expect(svg).toContain(`data-fx="${f.id}"`);
  expect(r('roof')).not.toContain('NaN');
});
test('frame-screw counts drawn across all views add up to the scene total', () => {
  const sum = (svgFx: Set<string>) => sc.fasteners.filter(f => f.kind === 'frameScrew' && svgFx.has(f.id)).reduce((a, f) => a + f.count, 0);
  const { fxs } = drawnIds(p);
  expect(sum(fxs)).toBe(sc.fasteners.filter(f => f.kind === 'frameScrew').reduce((a, f) => a + f.count, 0));
});

test('OSB screw dots have no enlarged transparent hit stroke, other screw dots do', () => {
  const s = r('wall.E');
  const osb = s.match(/<circle[^>]*fx-osbScrew[^>]*>/)![0];
  expect(osb).not.toContain('stroke="transparent"');
  const frame = s.match(/<circle[^>]*fx-frameScrew[^>]*>/)![0];
  expect(frame).toContain('stroke="transparent"');
});

test('floor plan draws each rotated corner stud as a 100 x 50 rectangle flush with the inner face (L with the end stud)', () => {
  const doc = new DOMParser().parseFromString(
    renderStandalone({ plan: p, scene: sc, view: 'floor', layers: all, palette: PRINT_PALETTE }), 'image/svg+xml');
  const rect = (id: string) => {
    const el = doc.querySelector(`[data-el="${id}"] rect`)!;
    return ['x', 'y', 'width', 'height'].map(k => Number(el.getAttribute(k)));
  };
  const corners = sc.elements.filter(e => e.kind === 'cornerStud');
  expect(corners.length).toBe(4);
  // K fal (x = 3000-től befelé, u lefelé): sarokoszlop u 50…150, mélység 50…100 -> x 2900…2950, y 50…150
  expect(rect('wall.E.cornerStud.1')).toEqual([2900, 50, 50, 100]);
  // a vég oszlop (u 0…50) a teljes 100 mm mélységben: együtt L alakot adnak
  const endStud = sc.elements.find(e => e.group === 'wall.E' && e.kind === 'stud' && e.geom.u === 0)!;
  expect(rect(endStud.id)).toEqual([2900, 0, 100, 50]);
  for (const e of corners) {
    const [, , w, h] = rect(e.id);
    expect([w, h].sort((a, b) => a - b)).toEqual([50, 100]);
  }
});

test('wall elevation draws the rotated corner stud with its 100 mm width', () => {
  const doc = new DOMParser().parseFromString(
    renderStandalone({ plan: p, scene: sc, view: 'wall.E', layers: all, palette: PRINT_PALETTE }), 'image/svg+xml');
  const rects = Array.from(doc.querySelectorAll('[data-el="wall.E.cornerStud.1"] rect'));
  expect(rects.length).toBeGreaterThan(0);
  expect(Number(rects[0].getAttribute('width'))).toBe(100);
});

test('floor plan L at W and N corners (N full on a wide building)', () => {
  const rectOf = (plan: Plan, view: 'floor', id: string) => {
    const doc = new DOMParser().parseFromString(
      renderStandalone({ plan, scene: buildScene(plan), view, layers: all, palette: PRINT_PALETTE }), 'image/svg+xml');
    const el = doc.querySelector(`[data-el="${id}"] rect`)!;
    return ['x', 'y', 'width', 'height'].map(k => Number(el.getAttribute(k)));
  };
  // W fal (x = 0, belső sík x = 100): mélység 50…100 -> x 50…100
  expect(rectOf(p, 'floor', 'wall.W.cornerStud.1')).toEqual([50, 50, 50, 100]);
  expect(rectOf(p, 'floor', 'wall.W.cornerStud.2')).toEqual([50, 3850, 50, 100]);
  const wide = createDefaultPlan(); wide.building = { ...wide.building, width: 4000, length: 3000 };
  wide.openings = [];
  expect(rectOf(wide, 'floor', 'wall.N.cornerStud.1')).toEqual([50, 50, 100, 50]);
});

describe('állókorcos alumíniumlemez rajzai', () => {
  const seamPlan = (shape: Plan['roof']['shape'] = 'gable'): Plan => {
    const q = createDefaultPlan(); q.roof.covering = 'standingSeam'; q.roof.shape = shape;
    q.roof.pitch = shape === 'gable' ? 30 : shape === 'mono' ? 10 : 3;
    return q;
  };
  const view = (q: Plan, v: ViewId, layers = all) => renderView({ plan: q, scene: buildScene(q), view: v, layers, palette: SCREEN_PALETTE }).svg;
  test('metszet: 25 mm-es héjazat, címkével; léc nélkül', () => {
    const s = view(seamPlan(), 'section');
    expect(s).toContain('Állókorcos alumíniumlemez – 25 mm');
    expect(s).not.toContain('data-layer="batten"');
    expect(s).not.toContain('data-layer="counterBatten"');
    expect(s).toContain('data-layer="decking"');
  });
  test('tetőnézet: korcvonalak 500 mm-enként (sávok + 1 síkonként), a lécezés réteggel kapcsolható', () => {
    for (const [shape, n] of [['gable', 22], ['mono', 11], ['flat', 11]] as const) {
      const s = view(seamPlan(shape), 'roof');
      expect(count(s, /class="seam"/g), shape).toBe(n);
      expect(s).not.toContain('el-roofBatten');
      expect(s).not.toMatch(/NaN|Infinity/);
    }
    expect(view(seamPlan(), 'roof', { ...all, battens: false })).not.toContain('class="seam"');
  });
  test('más héjazatnál nincs korcvonal, a cserép metszete változatlan', () => {
    expect(r('roof')).not.toContain('class="seam"');
    expect(r('section')).toContain('Cserép – 40 mm');
  });
});

describe('talajcsavaros alap rajzai', () => {
  const gsPlan = (mut?: (q: Plan) => void): Plan => { const q = createDefaultPlan(); q.foundation.type = 'groundScrew'; mut?.(q); return q; };
  const gp = gsPlan(); const gsc = buildScene(gp);
  const g = (v: ViewId, layers = all, plan = gp, scene = gsc) => renderView({ plan, scene, view: v, layers, palette: SCREEN_PALETTE }).svg;

  test('alap nézet: támaszok, főgerendák, rögzítési pontok, méretek és felirat', () => {
    const s = g('foundation');
    const supports = gsc.elements.filter(e => e.kind === 'support').length;
    expect(supports).toBe(12);
    expect(count(s, /data-el="frame\.support\./g)).toBe(supports);
    expect(count(s, /class="el el-beam"/g)).toBe(gsc.elements.filter(e => e.kind === 'beam').length);
    expect(count(s, /data-fx="/g)).toBe(gsc.fasteners.filter(f => f.group === 'frame').length);
    expect(s).toContain('>15 cm<'); // sarokpont – első támasz (cm(150))
    expect(s).toContain('Talajcsavar: 12 db Ø76 × 100 cm, fej 30 cm-rel a talaj fölött');
    expect(count(s, /data-el="floor\.joist\./g)).toBe(gsc.elements.filter(e => e.kind === 'joist').length);
    expect(s).not.toContain('el-meshSheet');
    expect(g('foundation', { ...all, fasteners: false })).not.toContain('data-fx=');
  });
  test('alap nézet betonlemeznél: háló, keret és rögzítés nélkül', () => {
    const s = r('foundation');
    expect(s).toContain('el-meshSheet');
    expect(s).not.toContain('el-support');
    expect(s).not.toContain('el-beam');
    expect(s).not.toContain('data-fx=');
  });
  test('metszet: talaj, talajcsavar, főgerenda, 30 cm-es méret; betonlemeznél egyik sincs', () => {
    for (const ridge of ['x', 'y'] as const) {
      const q = gsPlan(x => { x.roof.ridgeDirection = ridge; });
      const s = g('section', all, q, buildScene(q));
      expect(s, ridge).toContain('data-layer="ground"');
      expect(s, ridge).toContain('data-layer="groundScrew"');
      expect(s, ridge).toContain('data-layer="beam"');
      expect(s, ridge).toContain('>30 cm<');
      expect(s, ridge).toContain('Talajcsavar Ø76 × 100 cm');
      expect(s, ridge).toContain('Főgerenda 100×150');
      expect(s, ridge).toContain('Padló – 118 mm');
      expect(s, ridge).not.toContain('data-layer="slab"');
    }
    const slab = r('section');
    for (const l of ['ground', 'groundScrew', 'beam']) expect(slab).not.toContain(`data-layer="${l}"`);
    expect(slab).not.toContain('>30 cm<');
  });
  test('falnézet: keretsáv a fal alatt csak talajcsavarnál', () => {
    for (const side of ['N', 'E', 'S', 'W']) {
      expect(g(`wall.${side}` as ViewId)).toContain('data-layer="frameBand"');
      expect(r(`wall.${side}` as ViewId)).not.toContain('data-layer="frameBand"');
    }
  });
  test('falnézet: a fal méretei nem változnak', () => {
    const dimTexts = (s: string) => [...s.matchAll(/>(\d[\d,]* cm)</g)].map(m => m[1]);
    expect(dimTexts(g('wall.E'))).toEqual(dimTexts(r('wall.E')));
  });
  test('minden nézet jól formált és véges (talajcsavar, mindkét gerincirány)', () => {
    for (const ridge of ['x', 'y'] as const) {
      const q = gsPlan(x => { x.roof.ridgeDirection = ridge; });
      const qs = buildScene(q);
      for (const v of VIEWS) {
        const s = renderStandalone({ plan: q, scene: qs, view: v, layers: all, palette: PRINT_PALETTE });
        expect(new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), v).toBeNull();
        expect(s, v).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  test('minden jelenetelem és rögzítés látszik valamelyik nézetben (talajcsavar)', () => {
    const { els, fxs, scene } = drawnIds(gsPlan());
    expect(scene.elements.filter(e => !els.has(e.id)).map(e => e.id)).toEqual([]);
    expect(scene.fasteners.filter(f => !fxs.has(f.id)).map(f => f.id)).toEqual([]);
  });
});

describe('pontalap és betonpillér rajzai', () => {
  const mk = (type: 'padFooting' | 'concretePier', mut?: (q: Plan) => void): Plan => {
    const q = createDefaultPlan(); q.foundation.type = type; mut?.(q); return q;
  };
  const g = (plan: Plan, v: ViewId, layers = all) => renderView({ plan, scene: buildScene(plan), view: v, layers, palette: SCREEN_PALETTE }).svg;
  const pierCount = (s: string) => count(s, /data-pier="/g);

  test('pontalap alapnézet: támaszonként talp, felirat, pillérjel nincs', () => {
    const p1 = mk('padFooting'); const s1 = buildScene(p1);
    const s = g(p1, 'foundation');
    const supports = s1.elements.filter(e => e.kind === 'support').length;
    expect(supports).toBe(12);
    expect(count(s, /data-el="frame\.support\./g)).toBe(supports);
    expect(s).toContain('Pontalap: 12 db 40×40 cm, 80 cm mélyen');
    expect(s).not.toContain('Talajcsavar');
    expect(pierCount(s)).toBe(0);
    expect(count(s, /data-fx="/g)).toBe(s1.fasteners.filter(f => f.group === 'frame').length);
  });
  test('betonpillér alapnézet: pillérjel támaszonként, zsalukőnél négyzet, csőnél kör', () => {
    const p1 = mk('concretePier');
    const s = g(p1, 'foundation');
    expect(count(s, /data-el="frame\.support\./g)).toBe(12);
    expect(pierCount(s)).toBe(12);
    expect(s).toContain('Betonpillér: 12 db 25×25 cm-es zsalukő pillér 40×40 cm-es talpon, 80 cm mélyen');
    expect(count(s, /<rect [^>]*data-pier="block250"/g)).toBe(12);
    const b2 = g(mk('concretePier', q => { q.foundation.pier.kind = 'block200'; }), 'foundation');
    expect(b2).toContain('Betonpillér: 12 db 20×20 cm-es zsalukő pillér 40×40 cm-es talpon, 80 cm mélyen');
    const t = g(mk('concretePier', q => { q.foundation.pier.kind = 'tube200'; q.foundation.footing = { size: 500, depth: 1000 }; }), 'foundation');
    expect(pierCount(t)).toBe(12);
    expect(count(t, /<circle [^>]*data-pier="tube200"/g)).toBe(12);
    expect(t).toContain('Betonpillér: 12 db Ø20 cm-es zsalucső pillér 50×50 cm-es talpon, 100 cm mélyen');
  });
  test('a támasz geomja a talp négyzete a tengely körül', () => {
    const p1 = mk('padFooting', q => { q.foundation.footing.size = 500; });
    const gs = mk('padFooting', q => { q.foundation.type = 'groundScrew'; });
    const a = buildScene(p1).elements.filter(e => e.kind === 'support');
    const b = buildScene(gs).elements.filter(e => e.kind === 'support');
    a.forEach((e, i) => {
      expect(e.geom.w).toBe(500); expect(e.geom.h).toBe(500);
      expect(e.geom.u + 250).toBeCloseTo(b[i].geom.u + b[i].geom.w / 2, 6);
      expect(e.geom.v + 250).toBeCloseTo(b[i].geom.v + b[i].geom.h / 2, 6);
      expect(e.label).toBe(`Pontalap #${i + 1}`);
    });
  });
  test('metszet: talp a talaj alatt, mélység-méret; pillérnél pillér-réteg', () => {
    for (const ridge of ['x', 'y'] as const) {
      const pf = g(mk('padFooting', q => { q.roof.ridgeDirection = ridge; }), 'section');
      expect(pf, ridge).toContain('data-layer="footing"');
      expect(pf, ridge).toContain('>80 cm<');
      expect(pf, ridge).toContain('>30 cm<');
      expect(pf, ridge).toContain('data-layer="beam"');
      expect(pf, ridge).not.toContain('data-layer="groundScrew"');
      expect(pf, ridge).not.toContain('data-layer="pier"');
      const cp = g(mk('concretePier', q => { q.roof.ridgeDirection = ridge; }), 'section');
      expect(cp, ridge).toContain('data-layer="footing"');
      expect(cp, ridge).toContain('data-layer="pier"');
      expect(cp, ridge).toContain('>80 cm<');
      expect(cp, ridge).not.toContain('data-layer="groundScrew"');
    }
  });
  test('metszet: a talajsáv a talp alja alá ér, nem a csavarhosszig', () => {
    const q = mk('padFooting', x => { x.foundation.footing.depth = 1200; x.foundation.groundScrew.length = 1000; });
    const s = g(q, 'section');
    expect(s).toContain('>120 cm<');
    const doc = new DOMParser().parseFromString(renderStandalone({ plan: q, scene: buildScene(q), view: 'section', layers: all, palette: PRINT_PALETTE }), 'image/svg+xml');
    const band = doc.querySelector('g[data-layer="ground"] rect')!;
    const bottom = Number(band.getAttribute('y')) + Number(band.getAttribute('height'));
    expect(bottom).toBeGreaterThan(1200);
  });
  test('minden nézet jól formált és véges (pontalap, betonpillér; mindkét gerincirány, minden pillérfajta)', () => {
    const plans: Plan[] = [];
    for (const ridge of ['x', 'y'] as const) {
      plans.push(mk('padFooting', q => { q.roof.ridgeDirection = ridge; }));
      for (const kind of ['block200', 'block250', 'tube200'] as const) {
        plans.push(mk('concretePier', q => { q.roof.ridgeDirection = ridge; q.foundation.pier.kind = kind; }));
      }
    }
    for (const q of plans) {
      const qs = buildScene(q);
      for (const v of VIEWS) {
        const s = renderStandalone({ plan: q, scene: qs, view: v, layers: all, palette: PRINT_PALETTE });
        expect(new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), v).toBeNull();
        expect(s, v).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  test('minden jelenetelem és rögzítés látszik valamelyik nézetben (pontalap, betonpillér)', () => {
    for (const type of ['padFooting', 'concretePier'] as const) {
      const { els, fxs, scene } = drawnIds(mk(type));
      expect(scene.elements.filter(e => !els.has(e.id)).map(e => e.id)).toEqual([]);
      expect(scene.fasteners.filter(f => !fxs.has(f.id)).map(f => f.id)).toEqual([]);
    }
  });
});
