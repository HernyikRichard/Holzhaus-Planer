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
test('supportSpacing bounds 800-2500, auto is fine', () => {
  const p = createDefaultPlan();
  for (const [v, bad] of [[799, true], [800, false], [2500, false], [2501, true], ['auto', false]] as const) {
    p.foundation.frame.supportSpacing = v;
    expect(paths(p).includes('foundation.frame.supportSpacing')).toBe(bad);
  }
});
