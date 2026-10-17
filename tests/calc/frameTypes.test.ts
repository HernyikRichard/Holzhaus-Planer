import { createDefaultPlan } from '../../src/model/defaults';
import type { FoundationType, Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { renderView } from '../../src/viewer/render';
import { SCREEN_PALETTE } from '../../src/viewer/theme';
import { buildModel3d } from '../../src/three-d/model';
import { buildAssembly } from '../../src/assembly/steps';
import { floorTopZ } from '../../src/scene/layerStack';
import { frameLayout } from '../../src/calc/frame';
import { ALL_LAYERS, DRAWING_VIEWS } from '../fixtures/frameOutputs';

// Pontalap és betonpillér a támasz-anyag (Task 2) előtt: a közös gerendakeret mindenhol megjelenik, semmi nem omlik össze.
function mk(type: FoundationType, width = 3000, length = 4000): Plan {
  const p = createDefaultPlan();
  p.building.width = width; p.building.length = length;
  p.foundation.type = type;
  return p;
}

describe.each(['padFooting', 'concretePier'] as const)('%s keret', type => {
  test.each([[3000, 4000], [6000, 8000], [12000, 12000]])('%i×%i: minden kimenet hiba és NaN nélkül', (w, l) => {
    const p = mk(type, w, l);
    const scene = buildScene(p);
    const calc = calculate(p);
    const views = DRAWING_VIEWS.map(v => renderView({ plan: p, scene, view: v, layers: ALL_LAYERS, palette: SCREEN_PALETTE }).svg);
    const model = buildModel3d(p, scene);
    const steps = buildAssembly(p, scene, calc);
    for (const s of [JSON.stringify(scene), JSON.stringify(calc), ...views, JSON.stringify(model), JSON.stringify(steps)]) {
      expect(s).not.toMatch(/NaN|Infinity/);
    }
    for (const sol of model.solids) expect([...sol.origin, sol.depth].every(Number.isFinite)).toBe(true);
  });

  test('a keret ugyanaz, mint talajcsavarnál; betonlemez nincs', () => {
    const p = mk(type);
    const scene = buildScene(p);
    const screw = buildScene(mk('groundScrew'));
    const ids = (s: typeof scene) => s.elements.filter(e => ['beam', 'joist'].includes(e.kind)).map(e => `${e.id}:${e.geom.u},${e.geom.v},${e.geom.w},${e.geom.h}`);
    expect(ids(scene)).toEqual(ids(screw));
    // a támasz ugyanazon a tengelyen áll, de a geomja a talp négyzete (Task 3)
    const centres = (s: typeof scene) => s.elements.filter(e => e.kind === 'support').map(e => `${e.id}:${e.geom.u + e.geom.w / 2},${e.geom.v + e.geom.h / 2}`);
    expect(centres(scene)).toEqual(centres(screw));
    for (const e of scene.elements.filter(x => x.kind === 'support')) expect([e.geom.w, e.geom.h]).toEqual([p.foundation.footing.size, p.foundation.footing.size]);
    expect(scene.elements.some(e => e.kind === 'meshSheet')).toBe(false);
    expect(floorTopZ(p)).toBe(frameLayout(p).z.floorTop);
  });

  test('anyaglista: nincs betonlemez, a padló kötelező, a főgerenda és a gerendasaru megvan', () => {
    const p = mk(type); p.floor.enabled = false;
    const ids = calculate(p).lines.map(l => l.id);
    expect(ids).not.toContain('foundation.bed'); // a beton a talpaké (Task 2), betonlemez-sor nincs
    expect(ids.some(i => i.startsWith('foundation.mesh'))).toBe(false);
    expect(ids).toContain('foundation.joistHangers');
    expect(ids).toContain('floor.osb');
    expect(ids).not.toContain('foundation.groundScrew');
  });

  test('3D: talaj és gerendakeret, betonlemez és talajcsavar nélkül', () => {
    const p = mk(type);
    const model = buildModel3d(p, buildScene(p));
    expect(model.layers).toContain('ground');
    expect(model.layers).toContain('beamFrame');
    expect(model.layers).not.toContain('foundation');
    expect(model.solids.some(s => s.label.includes('talaj alatt'))).toBe(false);
  });

  test('szerelés: keret- és padlólépés, betonlemez-lépés nélkül', () => {
    const p = mk(type);
    const scene = buildScene(p);
    const steps = buildAssembly(p, scene, calculate(p));
    const sIds = steps.map(s => s.id);
    expect(sIds).toContain('supports');
    expect(sIds).toContain('beamFrame');
    expect(sIds).not.toContain('foundation');
    expect(steps.flatMap(s => s.todo).join(' ')).not.toContain('csavar helyét');
  });

  test('rajz: keretes alapnézet, talajcsavar-felirat nélkül', () => {
    const p = mk(type);
    const scene = buildScene(p);
    const r = (v: 'foundation' | 'section') => renderView({ plan: p, scene, view: v, layers: ALL_LAYERS, palette: SCREEN_PALETTE }).svg;
    expect(r('foundation')).toContain('el-beam');
    expect(r('foundation')).not.toContain('Talajcsavar');
    expect(r('section')).toContain('data-layer="beam"');
    expect(r('section')).not.toContain('data-layer="groundScrew"');
  });
});
