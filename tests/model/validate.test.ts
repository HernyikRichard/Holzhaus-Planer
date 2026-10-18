import { createDefaultPlan } from '../../src/model/defaults';
import { validatePlan } from '../../src/model/validate';

test('default plan is valid', () => expect(validatePlan(createDefaultPlan())).toEqual([]));
test('opening outside shrunk wall', () => {
  const p = createDefaultPlan(); p.building.width = 2000;
  expect(validatePlan(p).map(e => e.path)).toContain('openings.0.offset');
});
test('overlapping openings', () => {
  const p = createDefaultPlan();
  p.openings.push({ ...p.openings[1], id: 'x', offset: 1800 });
  expect(validatePlan(p).some(e => e.path.startsWith('openings.2'))).toBe(true);
});
test('pitch range per shape', () => {
  const p = createDefaultPlan(); p.roof.shape = 'flat'; p.roof.pitch = 30;
  expect(validatePlan(p).map(e => e.path)).toContain('roof.pitch');
});

import { SECTIONS } from '../../src/ui/fields';
import { getPath, setPath } from '../../src/ui/fields';

const paths = (p: ReturnType<typeof createDefaultPlan>) => validatePlan(p).map(e => e.path);

test('joist spacing is range-validated (0 would loop forever)', () => {
  const p = createDefaultPlan(); p.floor.joistSpacing = 0;
  expect(paths(p)).toContain('floor.joistSpacing');
  p.floor.joistSpacing = 400;
  expect(paths(p)).not.toContain('floor.joistSpacing');
});
test('opening width and height are range-checked', () => {
  const p = createDefaultPlan();
  p.openings[0].width = -100;
  p.openings[1].height = 100;
  expect(paths(p)).toEqual(expect.arrayContaining(['openings.0.width', 'openings.1.height']));
  const q = createDefaultPlan(); q.openings[0].width = 5000; q.openings[0].height = 3000;
  expect(paths(q)).toEqual(expect.arrayContaining(['openings.0.width', 'openings.0.height']));
});
test('window sill must clear the stud thickness plus 50 mm', () => {
  const p = createDefaultPlan();
  p.openings[1].sillHeight = 0;
  expect(paths(p)).toContain('openings.1.sillHeight');
  p.openings[1].sillHeight = p.walls.studSection.t + 50;
  expect(paths(p)).not.toContain('openings.1.sillHeight');
});
test('every numeric/section panel field has a range check', () => {
  const absurd = 1e9;
  for (const s of SECTIONS) for (const f of s.fields) {
    if (f.kind !== 'number' && f.kind !== 'section') continue;
    const targets = f.kind === 'section' ? [`${f.path}.t`, `${f.path}.w`] : [f.path];
    for (const t of targets) {
      const p = createDefaultPlan();
      // a típusfüggő szakaszok mezői csak a saját alaptípusukon érvényesek
      if (s.id === 'groundScrew' || s.id === 'padFooting' || s.id === 'concretePier' || s.id === 'stripFooting') p.foundation.type = s.id;
      expect(getPath(p, t), t).toEqual(expect.any(Number));
      setPath(p, t, absurd);
      expect(paths(p), t).toContain(t);
    }
  }
});

test('on a full wall an opening keeps the corner stud, king and jack clear (3t + w = 250 mm)', async () => {
  const { createDefaultPlan } = await import('../../src/model/defaults');
  const p = createDefaultPlan();
  const w = p.openings.find(o => o.id === 'window-1')!; // K fal, 4000 mm: teljes fal
  w.offset = 150;
  const e = validatePlan(p).find(x => x.path === 'openings.1.offset');
  expect(e?.message).toContain('25 cm');
  w.offset = 250;
  expect(validatePlan(p).filter(x => x.path.startsWith('openings.1.'))).toEqual([]);
  w.offset = 4000 - 250 - w.width + 50;
  expect(validatePlan(p).some(x => x.path === 'openings.1.offset')).toBe(true);
  expect(validatePlan(createDefaultPlan())).toEqual([]);
  const q = createDefaultPlan(); q.openings.find(o => o.id === 'door-1')!.offset = 150; // D fal: rövid, marad 150
  expect(validatePlan(q)).toEqual([]);
});

test('groundClearance bounds 150-800', () => {
  const p = createDefaultPlan();
  for (const [v, bad] of [[149, true], [150, false], [800, false], [801, true]] as const) {
    p.foundation.frame.groundClearance = v;
    expect(paths(p).includes('foundation.frame.groundClearance')).toBe(bad);
  }
});
test('footing depth bounds 600-1200', () => {
  const p = createDefaultPlan(); p.foundation.type = 'padFooting';
  for (const [v, bad] of [[599, true], [600, false], [1200, false], [1201, true]] as const) {
    p.foundation.footing.depth = v;
    expect(paths(p).includes('foundation.footing.depth')).toBe(bad);
  }
});
test('groundClearance range depends on foundation type', () => {
  const cases = [
    ['groundScrew', 301, false], ['groundScrew', 800, false], ['groundScrew', 801, true], ['groundScrew', 149, true],
    ['padFooting', 300, false], ['padFooting', 301, true], ['padFooting', 150, false], ['padFooting', 149, true],
    ['concretePier', 800, false], ['concretePier', 801, true], ['concretePier', 150, false], ['concretePier', 149, true],
  ] as const;
  for (const [type, v, bad] of cases) {
    const p = createDefaultPlan(); p.foundation.type = type; p.foundation.frame.groundClearance = v;
    expect([type, v, paths(p).includes('foundation.frame.groundClearance')]).toEqual([type, v, bad]);
  }
});
test('switching to padFooting with 500 mm clearance flags the field, switching back clears it', () => {
  const p = createDefaultPlan(); p.foundation.type = 'groundScrew'; p.foundation.frame.groundClearance = 500;
  expect(paths(p)).not.toContain('foundation.frame.groundClearance');
  p.foundation.type = 'padFooting';
  const e = validatePlan(p).find(x => x.path === 'foundation.frame.groundClearance');
  expect(e?.message).toBe('Talaj feletti magasság: 150–300 mm közötti érték szükséges.');
  p.foundation.type = 'groundScrew';
  expect(paths(p)).not.toContain('foundation.frame.groundClearance');
});
test('supportSpacing bounds 800-2500, auto is fine', () => {
  const p = createDefaultPlan();
  for (const [v, bad] of [[799, true], [800, false], [2500, false], [2501, true], ['auto', false]] as const) {
    p.foundation.frame.supportSpacing = v;
    expect(paths(p).includes('foundation.frame.supportSpacing')).toBe(bad);
  }
});

test('footing depth is only validated for pad footing and concrete pier', () => {
  const p = createDefaultPlan();
  p.foundation.footing.depth = 5000;
  expect(paths(p)).not.toContain('foundation.footing.depth');
  p.foundation.type = 'padFooting';
  expect(paths(p)).toContain('foundation.footing.depth');
  p.foundation.type = 'concretePier';
  expect(paths(p)).toContain('foundation.footing.depth');
});

test('strip depth bounds 600-1200 only on stripFooting', () => {
  const p = createDefaultPlan(); p.foundation.type = 'stripFooting';
  for (const [v, bad] of [[599, true], [600, false], [1200, false], [1201, true]] as const) {
    p.foundation.strip.depth = v;
    expect([v, paths(p).includes('foundation.strip.depth')]).toEqual([v, bad]);
  }
  p.foundation.strip.depth = 1201;
  for (const type of ['slab', 'groundScrew', 'padFooting', 'concretePier'] as const) {
    p.foundation.type = type;
    expect(paths(p)).not.toContain('foundation.strip.depth');
  }
});
test('stripFooting plinth height (groundClearance) bounds 150-600', () => {
  for (const [v, bad] of [[149, true], [150, false], [300, false], [600, false], [601, true]] as const) {
    const p = createDefaultPlan(); p.foundation.type = 'stripFooting'; p.foundation.frame.groundClearance = v;
    expect([v, paths(p).includes('foundation.frame.groundClearance')]).toEqual([v, bad]);
  }
  const p = createDefaultPlan(); p.foundation.type = 'stripFooting'; p.foundation.frame.groundClearance = 601;
  expect(validatePlan(p).find(x => x.path === 'foundation.frame.groundClearance')?.message)
    .toBe('Lábazat magassága: 150–600 mm közötti érték szükséges.');
});
test('default stripFooting plan is valid', () => {
  const p = createDefaultPlan(); p.foundation.type = 'stripFooting';
  expect(validatePlan(p)).toEqual([]);
});
