import { calcFasteners } from '../../src/calc/fasteners';

test('fasteners from fastener points', () => {
  const lines = calcFasteners({ osbSheets: 2, studs: 0, headers: 0, collarPairs: 0, rafters: 0,
    anchorPoints: 22, counterBattenLength: 37412, battenCrossings: 288, claddingArea: 0, tileClips: 0,
    frameScrewCount: 436, osbScrewCount: 540, hurricaneTieCount: 36, seamClips: 0, seamClipScrews: 0, connectorScrewCount: 0 });
  const q = (id: string) => lines.find(l => l.id === id)?.quantity;
  const l = (id: string) => lines.find(x => x.id === id)!;
  expect(q('fix.anchors')).toBe(22);
  expect(q('fix.frameScrews')).toBe(3);        // 436 / 200 → 3 doboz
  expect(l('fix.frameScrews').secondary).toBe('436 db');
  expect(l('fix.frameScrews').explanation).toContain('218 rögzítési pont a vázon (elemvégenként 2 db)');
  expect(q('fix.osbScrews')).toBe(2);          // 540 + 2 × 30 = 600 / 500 → 2 doboz
  expect(l('fix.osbScrews').secondary).toBe('600 db');
  expect(q('fix.hurricaneTies')).toBe(36);
  expect(l('fix.hurricaneTies').name).toBe('Viharkapocs (szarufa-kengyel)');
  expect(q('fix.counterBattenNails')).toBe(1); // 94 / 250
  expect(q('fix.battenNails')).toBe(2);        // 288 / 250
  expect(q('fix.claddingNails')).toBeUndefined();
});
test('no hurricane ties line without points', () => {
  const lines = calcFasteners({ osbSheets: 0, studs: 0, headers: 0, collarPairs: 0, rafters: 0, anchorPoints: 0,
    counterBattenLength: 0, battenCrossings: 0, claddingArea: 0, tileClips: 0, frameScrewCount: 0, osbScrewCount: 0, hurricaneTieCount: 0,
    seamClips: 0, seamClipScrews: 0, connectorScrewCount: 0 });
  expect(lines).toEqual([]);
});

const ZERO = { osbSheets: 0, studs: 0, headers: 0, collarPairs: 0, rafters: 0, anchorPoints: 0, counterBattenLength: 0,
  battenCrossings: 0, claddingArea: 0, tileClips: 0, frameScrewCount: 0, osbScrewCount: 0, hurricaneTieCount: 0,
  seamClips: 0, seamClipScrews: 0, connectorScrewCount: 0 };
test('connector screw box line', () => {
  const lines = calcFasteners({ ...ZERO, connectorScrewCount: 192 });
  const l = lines.find(x => x.id === 'fix.connectorScrews')!;
  expect(l.name).toBe('Kötőelem-csavar 4×40 (gerendasaruhoz)');
  expect(l.quantity).toBe(1); expect(l.unit).toBe('doboz'); expect(l.secondary).toBe('192 db');
});
test('anchor line name follows the foundation type', () => {
  const s = { ...ZERO, anchorPoints: 10 };
  expect(calcFasteners(s)[0].name).toBe('Talpgerenda-rögzítő (dübel / ászokcsavar)');
  expect(calcFasteners(s, undefined, 'slab')[0].name).toBe('Talpgerenda-rögzítő (dübel / ászokcsavar)');
  expect(calcFasteners(s, undefined, 'groundScrew')[0].name).toBe('Talpgerenda-rögzítő csavar (a padlón át a peremgerendába)');
});
