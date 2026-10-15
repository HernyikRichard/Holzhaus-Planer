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
