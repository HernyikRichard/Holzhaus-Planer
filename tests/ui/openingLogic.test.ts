import { createDefaultPlan } from '../../src/model/defaults';
import { addOpening, moveOpening } from '../../src/ui/openingLogic';

test('addOpening centers on click and snaps to 10 mm', () => {
  const p = createDefaultPlan();
  const o = addOpening(p, 'E', 'window', 2013);
  expect(o.offset).toBe(1710);         // 2013 − 300 = 1713 → 1710
  expect(p.openings).toContain(o);
});


test('addOpening clamps inside the wall and uses default sizes', () => {
  const p = createDefaultPlan();
  const d = addOpening(p, 'S', 'door', 0);
  expect(d).toMatchObject({ width: 900, height: 2000, sillHeight: 0, offset: 150 });
  const w = addOpening(p, 'S', 'window', 99999);
  expect(w).toMatchObject({ width: 600, height: 600, sillHeight: 1200, offset: 2800 - 150 - 600 });
  expect(d.id).not.toBe(w.id);
});


test('moveOpening clamps inside wall', () => {
  const p = createDefaultPlan(); const id = p.openings[0].id;   // S fal, 2800 hosszú, ajtó 900
  moveOpening(p, id, 99999);
  expect(p.openings[0].offset).toBe(2800 - 150 - 900);           // 1750
  moveOpening(p, id, -5);
  expect(p.openings[0].offset).toBe(150);
  moveOpening(p, id, 1013);
  expect(p.openings[0].offset).toBe(1010);
});


test('addOpening works without crypto.randomUUID', () => {
  const orig = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const p = createDefaultPlan();
    const a = addOpening(p, 'E', 'window', 1000);
    const b = addOpening(p, 'E', 'window', 2000);
    expect(a.id).toMatch(/^o-/);
    expect(a.id).not.toBe(b.id);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: orig, configurable: true });
  }
});

import { invalidOpeningIds, openingsOnlyInvalid } from '../../src/ui/openingLogic';

test('openingsOnlyInvalid / invalidOpeningIds look at the openings.* error paths', () => {
  const p = createDefaultPlan();
  const st = (errors: Array<{ path: string; message: string }>) => ({ plan: p, errors }) as any;
  expect(openingsOnlyInvalid(st([]))).toBe(true);
  expect(openingsOnlyInvalid(st([{ path: 'openings.0.offset', message: 'x' }]))).toBe(true);
  expect(openingsOnlyInvalid(st([{ path: 'openings.0.offset', message: 'x' }, { path: 'building.width', message: 'y' }]))).toBe(false);
  const ids = invalidOpeningIds(st([{ path: 'openings.1.width', message: 'x' }, { path: 'building.width', message: 'y' }, { path: 'openings.9.width', message: 'z' }]));
  expect([...ids]).toEqual([p.openings[1].id]);
});

test('moveOpening on a full wall clamps to 3t + w from each end; short wall keeps w + t', () => {
  const p = createDefaultPlan(); const id = 'window-1';   // K fal 4000, ablak 600
  moveOpening(p, id, 0);
  expect(p.openings[1].offset).toBe(250);
  moveOpening(p, id, 99999);
  expect(p.openings[1].offset).toBe(4000 - 250 - 600);
  moveOpening(p, 'door-1', 0);                              // D fal: rövid
  expect(p.openings[0].offset).toBe(150);
});
