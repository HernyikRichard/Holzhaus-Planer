import { createDefaultPlan } from '../../src/model/defaults';
import { dragOffset, dragSill, liveDims, openingElementId, openingIdOfElement } from '../../src/app/openingDrag';
import { createStore } from '../../src/ui/store';

test('dragOffset snaps and clamps', () => {
  const p = createDefaultPlan();
  expect(dragOffset(p, 'door-1', 1500, 73)).toBe(1550);
  expect(dragOffset(p, 'door-1', 1500, 99999)).toBe(1750);
  expect(dragOffset(p, 'door-1', 1500, -99999)).toBe(150);
});
test('dragSill clamps window sill', () => {
  const p = createDefaultPlan();
  expect(dragSill(p, 'window-1', 1200, -5000)).toBe(100);
  expect(dragSill(p, 'window-1', 1200, 99999)).toBe(1550); // 2400 − 50 − 100 (koszorú) − 600 magasság − 100 fal-szélesség
  expect(dragSill(p, 'window-1', 1200, 120)).toBe(1300);
});
test('dragSill leaves a door on the floor', () => {
  expect(dragSill(createDefaultPlan(), 'door-1', 0, 500)).toBe(0);
});
test('liveDims shows distance to wall start and end', () => {
  const d = liveDims(createDefaultPlan(), 'window-1', 1500, 1200).map(x => x.text);
  expect(d).toEqual(expect.arrayContaining(['150 cm', '190 cm'])); // E fal 4000: 1500 / 4000−1500−600
});
test('liveDims adds the gap to the nearest neighbouring opening on the wall', () => {
  const p = createDefaultPlan();
  p.openings.push({ id: 'w2', type: 'window', wall: 'E', offset: 2500, width: 600, height: 600, sillHeight: 1200, swing: 'left' });
  const d = liveDims(p, 'window-1', 1500, 1200).map(x => x.text);
  expect(d).toEqual(['150 cm', '190 cm', '40 cm']);
  const only = liveDims(createDefaultPlan(), 'door-1', 1500, 0).map(x => x.text);
  expect(only).toHaveLength(2);
});
test('liveDims follows the preview offset, at the opening height', () => {
  const dims = liveDims(createDefaultPlan(), 'window-1', 2000, 1300);
  expect(dims[0]).toMatchObject({ x1: 0, x2: 2000, y1: 50 + 1300, y2: 50 + 1300, text: '200 cm' });
  expect(dims[1]).toMatchObject({ x1: 2600, x2: 4000, text: '140 cm' });
});
test('opening id <-> scene element id', () => {
  const state = createStore(createDefaultPlan()).get();
  const el = openingElementId(state, 'window-1')!;
  expect(el).toMatch(/^wall\.E\.opening\.\d+$/);
  expect(openingIdOfElement(state, el)).toBe('window-1');
  expect(openingIdOfElement(state, 'wall.E.stud.1')).toBeNull();
  expect(openingElementId(state, 'nincs')).toBeNull();
});

test('dragSill uses the stud length at the dragged offset (sloped wall)', () => {
  const p = createDefaultPlan();
  p.roof.shape = 'mono'; p.roof.pitch = 20; p.roof.ridgeDirection = 'x'; // a N fal magassága végig változik
  p.openings[1].offset = 150;
  const edge = dragSill(p, 'window-1', 1200, 99999, 150);
  const mid = dragSill(p, 'window-1', 1200, 99999, 1200);
  expect(mid).not.toBe(edge); // a szálhossz a húzott helyen számít
});
