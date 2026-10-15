import { createDefaultPlan } from '../../src/model/defaults';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { sectionKey } from '../../src/calc/util';
import type { FastenerKind } from '../../src/scene/types';

const p = createDefaultPlan(); const sc = buildScene(p); const out = calculate(p);
const qty = (id: string) => out.lines.find(l => l.id === id)?.quantity;
const sum = (k: FastenerKind) => sc.fasteners.filter(f => f.kind === k).reduce((a, f) => a + f.count, 0);
test('fastener points equal material lines', () => {
  expect(qty('fix.anchors')).toBe(sum('anchor'));
  expect(qty('fix.hurricaneTies')).toBe(sum('hurricaneTie'));
  const frame = out.lines.find(l => l.id === 'fix.frameScrews')!;
  expect(frame.secondary).toBe(`${sum('frameScrew')} db`);
  const osb = out.lines.find(l => l.id === 'fix.osbScrews')!;
  // default: padló ki, tető deszka; a belső OSB burkolat (12 tábla) nincs a rajzon → × 30 db
  expect(osb.secondary).toBe(`${sum('osbScrew') + 12 * 30} db`);
});
test('every cut piece is assigned exactly once and no overlap on a stick', () => {
  const timberIds = sc.elements.filter(e => e.section && e.pieceLabel).map(e => e.id);
  for (const id of timberIds) expect(sc.cut[id]).toBeDefined();
  const sticks = new Map<string, Array<[number, number]>>();
  // a fali lécek (wall.batten.n) pozíció nélküli darabok: nincs hozzájuk Element, ezeket kihagyjuk
  for (const [id, c] of Object.entries(sc.cut)) {
    const e = sc.elements.find(x => x.id === id);
    if (!e) continue;
    const len = e.length;
    const k = `${c.stockLength}|${c.stockIndex}|${e.category}|${sectionKey(e.section!)}`;
    const segs = sticks.get(k) ?? []; segs.push([c.offset, c.offset + len]); sticks.set(k, segs);
  }
  for (const segs of sticks.values()) {
    segs.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < segs.length; i++) expect(segs[i][0]).toBeGreaterThanOrEqual(segs[i - 1][1]);
    expect(segs.at(-1)![1]).toBeLessThanOrEqual(6000 + 1e-6);
  }
});
test('wall battens are covered by cut', () => {
  expect(Object.keys(sc.cut).some(id => id.startsWith('wall.batten.'))).toBe(true);
});
test('ids are unique across the whole scene', () => {
  const ids = [...sc.elements.map(e => e.id), ...sc.fasteners.map(f => f.id)];
  expect(new Set(ids).size).toBe(ids.length);
});
