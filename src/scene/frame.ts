import type { Mm, Plan } from '../model/types';
import { BEAM_BOLTS_PER_SUPPORT } from '../catalog';
import { floorOn, frameLayout, framePt, hasFrame, type FrameLayout } from '../calc/frame';
import { supportSpec } from '../calc/supports';
import type { Element, FastenerRef, Geom } from './types';

/** Keretkoordináta-téglalap (l a gerendák mentén, w rájuk merőlegesen) → világ-geom. */
function rect(f: FrameLayout, l0: Mm, l1: Mm, w0: Mm, w1: Mm): Geom {
  const [xa, ya] = framePt(f, l0, w0);
  const [xb, yb] = framePt(f, l1, w1);
  const u = Math.min(xa, xb), v = Math.min(ya, yb);
  return { u, v, w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
}

/** Főgerenda-szegmensek [kezdet, vég]: a vágás mindig támasztengelyen van, szegmens ≤ a leghosszabb szál. */
export function beamSegments(L: Mm, supportAxes: Mm[], stockLengths: Mm[]): Array<[Mm, Mm]> {
  const max = Math.max(...stockLengths);
  const out: Array<[Mm, Mm]> = [];
  let start = 0;
  while (L - start > max) {
    const cands = supportAxes.filter(a => a > start && a - start <= max);
    const end = cands.length ? cands[cands.length - 1] : start + max;
    out.push([start, end]);
    start = end;
  }
  out.push([start, L]);
  return out;
}

/** Gerendakeret: támaszok, főgerendák, párnafák és rögzítési pontok (alaprajzi koordináták). */
export function frameElements(plan: Plan): { elements: Element[]; fasteners: FastenerRef[] } {
  if (!hasFrame(plan) || !floorOn(plan)) return { elements: [], fasteners: [] };
  const supportLabel = supportSpec(plan).label;
  const screw = plan.foundation.type === 'groundScrew';
  const f = frameLayout(plan);
  const { length: screwLen, diameter: d } = plan.foundation.groundScrew;
  const { beam } = f;
  const elements: Element[] = [];
  const fasteners: FastenerRef[] = [];

  // támaszok: gerendánként, a támaszok sorrendjében
  const supportIds: string[][] = f.beamAxes.map(() => []);
  let sn = 0;
  f.beamAxes.forEach((c, bi) => {
    for (const a of f.supportAxes) {
      sn++;
      const id = `frame.support.${sn}`;
      supportIds[bi].push(id);
      // talajcsavarnál a csavar átmérője, pontalapnál/betonpillérnél a talp négyzete a tengely körül
      const r = screw ? d / 2 : plan.foundation.footing.size / 2;
      elements.push({
        id, kind: 'support', label: `${supportLabel} #${sn}`, group: 'frame', category: 'Alap',
        length: screw ? screwLen : plan.foundation.footing.depth, geom: rect(f, a - r, a + r, c - r, c + r), fasteners: [],
      });
    }
  });

  // főgerendák: szegmensenként, rétegenként (2×50 mm egymás mellett)
  const segs = beamSegments(f.L, f.supportAxes, plan.settings.stockLengths);
  const beamIds: string[][][] = f.beamAxes.map(() => segs.map(() => []));
  let bn = 0;
  f.beamAxes.forEach((c, bi) => {
    segs.forEach(([s0, s1], si) => {
      for (let k = 0; k < beam.plies; k++) {
        bn++;
        const id = `frame.beam.${bn}`;
        beamIds[bi][si].push(id);
        const w0 = c - beam.width / 2 + k * beam.ply.t;
        elements.push({
          id, kind: 'beam', label: `Főgerenda #${bn}`, group: 'frame', category: 'Alap',
          pieceLabel: 'főgerenda', section: beam.ply, length: s1 - s0,
          geom: rect(f, s0, s1, w0, w0 + beam.ply.t), fasteners: [],
        });
      }
    });
  });

  // párnafák
  const jt = plan.floor.joistSection.t;
  const last = f.joistPositions.length - 1;
  f.joistPositions.forEach((p, i) => {
    const edge = i === 0 || i === last;
    elements.push({
      id: `floor.joist.${i + 1}`, kind: 'joist', group: 'floor', category: 'Padló',
      label: edge ? `Peremgerenda #${i === 0 ? 1 : 2}` : `Párnafa #${i}`,
      pieceLabel: edge ? 'peremgerenda' : 'párnafa', section: plan.floor.joistSection,
      length: f.W, geom: rect(f, p, p + jt, 0, f.W), fasteners: [],
    });
  });

  // beamBolt: támaszonként; a támasz feletti szegmens(ek) id-i, utána a támasz
  let n = 0;
  f.beamAxes.forEach((c, bi) => {
    f.supportAxes.forEach((a, ai) => {
      const over = segs.flatMap(([s0, s1], si) => (a >= s0 && a <= s1 ? beamIds[bi][si] : []));
      const [u, v] = framePt(f, a, c);
      n++;
      fasteners.push({
        id: `frame.beamBolt.${n}`, kind: 'beamBolt', group: 'frame', u, v, count: BEAM_BOLTS_PER_SUPPORT,
        label: 'M12 menetes szár', elementIds: [...over, supportIds[bi][ai]],
      });
    });
  });

  // joistHanger: párnafa × főgerenda kereszteződésenként
  n = 0;
  f.joistPositions.forEach((p, ji) => {
    f.beamAxes.forEach((c, bi) => {
      const over = segs.flatMap(([s0, s1], si) => (p < s1 && p + jt > s0 ? beamIds[bi][si] : []));
      const [u, v] = framePt(f, p + jt / 2, c);
      n++;
      fasteners.push({
        id: `frame.joistHanger.${n}`, kind: 'joistHanger', group: 'frame', u, v, count: 1,
        label: 'Gerendasaru', elementIds: [`floor.joist.${ji + 1}`, ...over],
      });
    });
  });
  // az elemek rögzítései (buborék, adatlap)
  const byId = new Map(elements.map(e => [e.id, e]));
  for (const fx of fasteners) for (const id of fx.elementIds) byId.get(id)?.fasteners.push(fx.id);
  return { elements, fasteners };
}
