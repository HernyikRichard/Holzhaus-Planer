import type { Mm, Plan, WallSide } from '../model/types';
import { BEAM_BOLTS_PER_SUPPORT, PLINTH_BLOCK_WIDTH } from '../catalog';
import { floorOn, frameLayout, framePt, hasFrame, type FrameLayout } from '../calc/frame';
import { supportSpec } from '../calc/supports';
import { stripLayout } from '../calc/strip';
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
  if (plan.foundation.type === 'stripFooting') return stripFrameElements(plan);
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
  elements.push(...joistElements(plan, f));

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
  return linkFasteners(elements, fasteners);
}

/** Párnafák: az első és az utolsó a peremgerenda. */
function joistElements(plan: Plan, f: FrameLayout): Element[] {
  const jt = plan.floor.joistSection.t;
  const last = f.joistPositions.length - 1;
  return f.joistPositions.map((p, i): Element => {
    const edge = i === 0 || i === last;
    return {
      id: `floor.joist.${i + 1}`, kind: 'joist', group: 'floor', category: 'Padló',
      label: edge ? `Peremgerenda #${i === 0 ? 1 : 2}` : `Párnafa #${i}`,
      pieceLabel: edge ? 'peremgerenda' : 'párnafa', section: plan.floor.joistSection,
      length: f.W, geom: rect(f, p, p + jt, 0, f.W), fasteners: [],
    };
  });
}

/** Az elemek rögzítései (buborék, adatlap). */
function linkFasteners(elements: Element[], fasteners: FastenerRef[]): { elements: Element[]; fasteners: FastenerRef[] } {
  const byId = new Map(elements.map(e => [e.id, e]));
  for (const fx of fasteners) for (const id of fx.elementIds) byId.get(id)?.fasteners.push(fx.id);
  return { elements, fasteners };
}

const SIDE_NAME: Record<WallSide, string> = { N: 'É', E: 'K', S: 'D', W: 'Ny' };

/** Egy L-irányú gerenda (talpgerenda vagy belső főgerenda): w-tengelye, szegmensei [l0, l1] és rétegenkénti elem-id-i. */
interface LongBeam { w: Mm; segs: Array<[Mm, Mm]>; ids: string[][] }

/**
 * Sávalap: a sáv és a lábazat oldalanként (a hosszú oldalak viszik a sarkokat), a belső pillérek, a négy
 * talpgerenda (a hosszúak a legnagyobb szálhossznál toldva), a belső főgerendák (toldás a pillérek fölött),
 * a párnafák és a rögzítések.
 */
function stripFrameElements(plan: Plan): { elements: Element[]; fasteners: FastenerRef[] } {
  const f = frameLayout(plan);
  const s = stripLayout(plan);
  const { beam } = f;
  const bw = beam.width;
  const { strip, plinth } = plan.foundation;
  const stock = plan.settings.stockLengths;
  const elements: Element[] = [];
  const fasteners: FastenerRef[] = [];

  // sáv és lábazat: a tengelyszakasz a szélességgel; a gerendákkal párhuzamos (hosszú) oldal a sarkokig ér
  const band = (kind: 'stripFooting' | 'plinth', prefix: string, name: string, wd: Mm): void => {
    for (const side of s.sides) {
      const alongX = side.from[1] === side.to[1];
      const ext = alongX === (f.along === 'x') ? wd / 2 : -wd / 2;
      const a0 = Math.min(side.from[alongX ? 0 : 1], side.to[alongX ? 0 : 1]) - ext;
      const len = side.length + 2 * ext;
      const c = side.from[alongX ? 1 : 0] - wd / 2;
      elements.push({
        id: `frame.${prefix}.${side.side}`, kind, label: `${name}: ${SIDE_NAME[side.side]}`, group: 'frame', category: 'Alap',
        length: side.length,
        geom: alongX ? { u: a0, v: c, w: len, h: wd } : { u: c, v: a0, w: wd, h: len }, fasteners: [],
      });
    }
  };
  band('stripFooting', 'strip', 'Sávalap', strip.width);
  band('plinth', 'plinth', 'Lábazat', PLINTH_BLOCK_WIDTH[plinth.block]);

  // belső pillérek: belső gerendánként, a pillértengelyek sorrendjében; a talp négyzete a tengely körül
  const r = strip.width / 2;
  const pierIds: string[][] = s.innerBeamAxes.map(() => []);
  let pn = 0;
  s.innerBeamAxes.forEach((c, bi) => {
    for (const a of s.innerSupportAxes) {
      pn++;
      const id = `frame.support.${pn}`;
      pierIds[bi].push(id);
      elements.push({
        id, kind: 'support', label: `Betonpillér #${pn}`, group: 'frame', category: 'Alap',
        length: strip.depth, geom: rect(f, a - r, a + r, c - r, c + r), fasteners: [],
      });
    }
  });

  // talpgerendák: a két hosszú (a szélső főgerenda-helyen, folyamatos alátámasztás: toldás a legnagyobb
  // szálhossznál), majd a két rövid a hosszúak között; szegmensenként, rétegenként
  let tn = 0;
  const sill = (geom: Geom, length: Mm): string => {
    tn++;
    const id = `frame.sill.${tn}`;
    elements.push({
      id, kind: 'beam', label: `Talpgerenda #${tn}`, group: 'frame', category: 'Alap',
      pieceLabel: 'talpgerenda', section: beam.ply, length, geom, fasteners: [],
    });
    return id;
  };
  const longSills: LongBeam[] = s.longSills.map(({ w }) => {
    const segs = beamSegments(f.L, [], stock);
    const ids = segs.map(([s0, s1]) => Array.from({ length: beam.plies }, (_, k) => {
      const w0 = w - bw / 2 + k * beam.ply.t;
      return sill(rect(f, s0, s1, w0, w0 + beam.ply.t), s1 - s0);
    }));
    return { w, segs, ids };
  });
  for (const { l } of s.shortSills) {
    for (const [s0, s1] of beamSegments(f.W - 2 * bw, [], stock)) {
      for (let k = 0; k < beam.plies; k++) {
        const l0 = l - bw / 2 + k * beam.ply.t;
        sill(rect(f, l0, l0 + beam.ply.t, bw + s0, bw + s1), s1 - s0);
      }
    }
  }

  // belső főgerendák: a rövid talpgerendák között (bw … L − bw), toldás a belső pillérek fölött
  let bn = 0;
  const innerSegs = beamSegments(f.L - 2 * bw, s.innerSupportAxes.map(a => a - bw), stock)
    .map(([s0, s1]): [Mm, Mm] => [s0 + bw, s1 + bw]);
  const inner: LongBeam[] = s.innerBeamAxes.map(c => ({
    w: c, segs: innerSegs,
    ids: innerSegs.map(([s0, s1]) => Array.from({ length: beam.plies }, (_, k) => {
      bn++;
      const id = `frame.beam.${bn}`;
      const w0 = c - bw / 2 + k * beam.ply.t;
      elements.push({
        id, kind: 'beam', label: `Főgerenda #${bn}`, group: 'frame', category: 'Alap',
        pieceLabel: 'főgerenda', section: beam.ply, length: s1 - s0,
        geom: rect(f, s0, s1, w0, w0 + beam.ply.t), fasteners: [],
      });
      return id;
    })),
  }));

  // párnafák
  const jt = plan.floor.joistSection.t;
  elements.push(...joistElements(plan, f));

  // beamBolt: csak a belső pillérekre; a pillér feletti szegmens(ek) id-i, utána a pillér
  let n = 0;
  inner.forEach((b, bi) => {
    s.innerSupportAxes.forEach((a, ai) => {
      const over = b.segs.flatMap(([s0, s1], si) => (a >= s0 && a <= s1 ? b.ids[si] : []));
      const [u, v] = framePt(f, a, b.w);
      n++;
      fasteners.push({
        id: `frame.beamBolt.${n}`, kind: 'beamBolt', group: 'frame', u, v, count: BEAM_BOLTS_PER_SUPPORT,
        label: 'M12 menetes szár', elementIds: [...over, pierIds[bi][ai]],
      });
    });
  });

  // joistHanger: párnafa × (hosszú talpgerenda | belső főgerenda) kereszteződésenként, a w-tengely sorrendjében;
  // a rövid talpgerendán fekvő peremgerenda a belső főgerendát nem keresztezi
  const beams = [longSills[0], ...inner, longSills[1]];
  n = 0;
  f.joistPositions.forEach((p, ji) => {
    for (const b of beams) {
      const over = b.segs.flatMap(([s0, s1], si) => (p < s1 && p + jt > s0 ? b.ids[si] : []));
      if (!over.length) continue;
      const [u, v] = framePt(f, p + jt / 2, b.w);
      n++;
      fasteners.push({
        id: `frame.joistHanger.${n}`, kind: 'joistHanger', group: 'frame', u, v, count: 1,
        label: 'Gerendasaru', elementIds: [`floor.joist.${ji + 1}`, ...over],
      });
    }
  });
  return linkFasteners(elements, fasteners);
}
