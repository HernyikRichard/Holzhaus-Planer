import type { MaterialLine } from '../calc/types';
import { DOWNPIPE_EXTRA } from '../catalog';
import type { InsulationType, Plan } from '../model/types';
import type { PriceList, Product } from '../prices/types';

export type Match =
  | { productId: string; qtyInProductUnit: number; choiceGone?: boolean }
  | { missing: true; reason: string; otherSource?: boolean; choiceGone?: boolean };

const MANUAL = 'kézi ár szükséges';
const miss = (reason: string): Match => ({ missing: true, reason: `${reason} – ${MANUAL}` });
const EPS = 1e-9;

/** Tető-OSB vastagsága nem szerepel a tervben: ehhez van a legközelebb a választott termék. */
const ROOF_OSB_MM = 18;

const text = (p: Product): string => `${p.material ?? ''} ${p.name}`.toLowerCase();
const isTg = (p: Product): boolean => p.id.includes('nutfeder') || p.sheet?.w === 675;
/** A termék egy egységének fedése (m²): csomag-, tekercsméret. */
const coverM2 = (p: Product): number | undefined => p.packM2 ?? p.rollM2;
/** Termékhossz m-ben a névből („3fm/szál”, „2m-es”, „4 m-es”, „6 méter-es”). */
export function nameLengthM(p: Product): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(?:fm|méter|m)(?![a-zá-ű²])/i.exec(p.name);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

const cheapest = (cands: Product[], cost: (p: Product) => number): Product | undefined =>
  [...cands].sort((a, b) => cost(a) - cost(b) || (a.id < b.id ? -1 : 1))[0];
const perM2 = (p: Product): number => p.price / (coverM2(p) ?? 1);

function sectionOf(key: string): { t: number; w: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(key);
  return m ? { t: +m[1], w: +m[2] } : null;
}

function piecesOf(line: MaterialLine): number | null {
  const m = /^(\d+)\s*db$/.exec(line.secondary ?? '');
  return m ? +m[1] : null;
}

/** A sor mennyisége a termék egységében, vagy null, ha az átváltás nem egyértelmű. */
function convert(line: MaterialLine, p: Product): number | null {
  const m2 = coverM2(p);
  if (line.needM2 !== undefined && m2) {
    if (line.unitM2 !== undefined && Math.abs(line.unitM2 - m2) < EPS) return line.quantity;
    return Math.ceil(line.needM2 / m2 - EPS);
  }
  if (line.unit === 'm²') {
    if (p.unit === 'm²') return line.quantity;
    if (p.packM2) return Math.ceil(line.quantity / p.packM2 - EPS);
    return null;
  }
  if (line.unit === 'm') {
    if (p.unit === 'fm') return line.quantity;
    const len = nameLengthM(p);
    return len ? Math.ceil(line.quantity / len - EPS) : null;
  }
  if (line.unit === 'doboz') {
    const pieces = piecesOf(line);
    if (pieces === null) return null;
    if (p.boxQty) return Math.ceil(pieces / p.boxQty - EPS);
    return p.unit === 'db' ? pieces : null;
  }
  const same: Record<string, string[]> = {
    szál: ['db'], db: ['db'], tábla: ['tábla'], csomag: ['csomag'], tekercs: ['tekercs'],
  };
  return same[line.unit]?.includes(p.unit) ? line.quantity : null;
}

function insulationWanted(type: InsulationType): (p: Product) => boolean {
  return p => (type === 'xps' ? text(p).includes('xps') : /ásványgyapot|kőzetgyapot|üveggyapot/.test(text(p)));
}

function foilCandidates(pl: PriceList, line: MaterialLine, pats: RegExp[]): Product | undefined {
  const foils = pl.products.filter(p => p.kind === 'foil' && p.rollM2);
  for (const re of pats) {
    const c = foils.filter(p => re.test(p.name.toLowerCase()));
    if (!c.length) continue;
    const same = line.unitM2 === undefined ? [] : c.filter(p => Math.abs(p.rollM2! - line.unitM2!) < EPS);
    return cheapest(same.length ? same : c, perM2);
  }
  return undefined;
}

function osbPick(pl: PriceList, thickness: number, tg: boolean): Product | undefined {
  const c = pl.products.filter(p => p.kind === 'osb' && p.thickness === thickness && p.sheet && isTg(p) === tg);
  const std = c.filter(p => p.sheet!.w === 1250 && p.sheet!.l === 2500);
  return cheapest(std.length ? std : c, p => p.price);
}

function closestThickness(c: Product[], mm: number): Product | undefined {
  if (!c.length) return undefined;
  const d = Math.min(...c.map(p => Math.abs((p.thickness ?? 0) - mm)));
  return cheapest(c.filter(p => Math.abs((p.thickness ?? 0) - mm) === d), perM2);
}

const FOUNDATION = /^foundation\./;

/** A szabály szerint választott termék, vagy a hiány oka. */
function pickByRule(line: MaterialLine, pl: PriceList, plan: Plan): Product | { reason: string } {
  const ps = pl.products;
  const none = (reason: string): { reason: string } => ({ reason });
  const id = line.id;
  const layers = plan.walls.layers;

  if (id.startsWith('timber.')) {
    const [, , sec, stock] = id.split('.');
    const s = sectionOf(sec ?? '');
    const len = Number(stock);
    const p = s && cheapest(ps.filter(x => x.kind === 'timber' && x.section && x.length === len
      && ((x.section.t === s.t && x.section.w === s.w) || (x.section.t === s.w && x.section.w === s.t))), x => x.price);
    return p || none(`Nincs Káplár-termék ${sec} × ${stock} mm méretben`);
  }

  switch (id) {
    case 'wall.osb':
    case 'wall.interiorCladding': {
      const layer = layers.find(l => l.kind === (id === 'wall.osb' ? 'osb' : 'interiorCladding') && l.enabled);
      if (!layer) return none('Nincs ilyen réteg a tervben');
      if (id === 'wall.interiorCladding' && layer.material !== 'osb') {
        if (layer.material === 'gypsum') return none('Gipszkarton nincs a Káplár-árlistában');
        const c = closestThickness(ps.filter(p => p.kind === 'cladding' && p.packM2), layer.thickness);
        return c || none('Nincs lambéria az árlistában');
      }
      return osbPick(pl, layer.thickness, false) || none(`Nincs ${layer.thickness} mm-es OSB az árlistában`);
    }
    case 'roof.decking': {
      if (line.unit !== 'tábla') return none('Tetődeszkázat nincs az árlistában');
      const c = ps.filter(p => p.kind === 'osb' && p.thickness && p.sheet && !isTg(p));
      if (!c.length) return none('Nincs OSB az árlistában');
      const d = Math.min(...c.map(p => Math.abs(p.thickness! - ROOF_OSB_MM)));
      const near = c.filter(p => Math.abs(p.thickness! - ROOF_OSB_MM) === d);
      return osbPick({ ...pl, products: near }, near[0].thickness!, false) || none('Nincs OSB az árlistában');
    }
    case 'floor.osb': {
      const t = plan.floor.osbThickness;
      return osbPick(pl, t, true) || none(`Nincs ${t} mm-es nútféderes OSB az árlistában`);
    }
    case 'wall.insulation':
    case 'floor.insulation': {
      let type: InsulationType;
      let thickness: number;
      if (id === 'wall.insulation') {
        const layer = layers.find(l => l.kind === 'insulation' && l.enabled);
        type = layer?.material === 'xps' ? 'xps' : 'mineralWool';
        thickness = plan.walls.studSection.w;
      } else {
        if (!plan.floor.insulation) return none('Nincs szigetelés a tervben');
        ({ type, thickness } = plan.floor.insulation);
      }
      const c = ps.filter(p => p.kind === 'insulation' && p.thickness === thickness && p.packM2 && insulationWanted(type)(p));
      if (!c.length) return none(`Nincs ${thickness} mm-es ${type === 'xps' ? 'XPS' : 'ásványgyapot'} az árlistában`);
      const same = line.unitM2 === undefined ? [] : c.filter(p => Math.abs(p.packM2! - line.unitM2!) < EPS);
      return cheapest(same.length ? same : c, perM2)!;
    }
    case 'wall.vaporBarrier':
    case 'floor.vaporBarrier':
      return foilCandidates(pl, line, [/párazáró/]) || none('Nincs párazáró fólia az árlistában');
    case 'wall.breatherMembrane':
      return foilCandidates(pl, line, [/páraáteresztő/]) || none('Nincs páraáteresztő fólia az árlistában');
    case 'roof.underlay':
      if (line.name !== 'Alátétfólia') return none('Bitumenes lemez nincs az árlistában');
      return foilCandidates(pl, line, [/alátét/, /páraáteresztő/]) || none('Nincs alátétfólia az árlistában');
    case 'wall.exteriorCladding': {
      const layer = layers.find(l => l.kind === 'exteriorCladding' && l.enabled);
      if (!layer || (layer.material !== 'paneling' && layer.material !== 'boards')) {
        return none('Ilyen burkolat nincs az árlistában');
      }
      return closestThickness(ps.filter(p => p.kind === 'cladding' && p.packM2), layer.thickness)
        || none('Nincs lambéria az árlistában');
    }
    case 'roof.trapezoid':
      return cheapest(ps.filter(p => p.kind === 'roofing' && p.packM2 && /trapézlemez/i.test(p.name) && !/polikarbon/i.test(p.name)), perM2)
        || none('Nincs trapézlemez az árlistában');
    case 'roof.shingles': {
      const c = ps.filter(p => p.kind === 'roofing' && p.packM2 && /zsindely/i.test(p.name)
        && !/starter|kezdőelem|ragasztó|alátét/i.test(p.name));
      const same = line.unitM2 === undefined ? [] : c.filter(p => Math.abs(p.packM2! - line.unitM2!) < EPS);
      return cheapest(same.length ? same : c, perM2) || none('Nincs zsindely az árlistában');
    }
    case 'roof.tiles':
    case 'acc.ridgeTiles':
      return none('Cserép nincs az árlistában');
    case 'acc.gutter': {
      const c = ps.filter(p => p.kind === 'gutter' && /ereszcsatorna/i.test(p.name)
        && !/véges|véglemez|szeglet|csonkos/i.test(p.name) && nameLengthM(p));
      return cheapest(c, p => p.price / nameLengthM(p)!) || none('Nincs ereszcsatorna az árlistában');
    }
    case 'acc.gutterEnds':
      return cheapest(ps.filter(p => p.kind === 'gutter' && /véglemez/i.test(p.name)), p => p.price)
        || none('Nincs csatorna-végelem az árlistában');
    case 'acc.gutterJoiners':
      return cheapest(ps.filter(p => p.kind === 'gutter' && /toldó/i.test(p.name)), p => p.price)
        || none('Nincs csatornatoldó az árlistában');
    case 'acc.gutterBrackets':
      return cheapest(ps.filter(p => p.kind === 'gutter' && /csatornatartó/i.test(p.name)), p => p.price)
        || none('Nincs csatornatartó az árlistában');
    case 'acc.downpipe': {
      const need = (plan.building.wallHeight + DOWNPIPE_EXTRA) / 1000;
      const c = ps.filter(p => p.kind === 'gutter' && /lefolyócső/i.test(p.name) && (nameLengthM(p) ?? 0) >= need - EPS);
      return cheapest(c, p => p.price) || none('Nincs elég hosszú lefolyócső az árlistában');
    }
    case 'acc.downpipeElbows':
      return cheapest(ps.filter(p => p.kind === 'gutter' && /könyök/i.test(p.name)), p => p.price)
        || none('Nincs lefolyó-könyök az árlistában');
    case 'acc.downpipeClips':
      return cheapest(ps.filter(p => p.kind === 'gutter' && /bilincs/i.test(p.name)), p => p.price)
        || none('Nincs lefolyó-bilincs az árlistában');
    case 'fix.frameScrews': {
      // a katalógus „5×90 csavar” címkéje: pontos méretű, dobozos facsavar
      const c = ps.filter(p => p.kind === 'fastener' && p.boxQty && /csavar/i.test(p.name) && /\b5x90\b|5x90mm/i.test(p.name));
      return cheapest(c, p => p.price / p.boxQty!) || none('Nincs 5×90 csavar az árlistában');
    }
    default:
      return none('Nincs megfelelő Káplár-termék');
  }
}

export function matchLine(line: MaterialLine, pl: PriceList, plan: Plan): Match {
  if (FOUNDATION.test(line.id)) {
    return { missing: true, reason: 'Nincs Káplár-termék, máshonnan beszerzendő', otherSource: true };
  }
  const choice = plan.pricing?.productChoice?.[line.id];
  let choiceGone = false;
  if (choice !== undefined) {
    const p = pl.products.find(x => x.id === choice);
    if (p) {
      const q = convert(line, p);
      return q === null ? miss('A kiválasztott termék egysége nem váltható át') : { productId: p.id, qtyInProductUnit: q };
    }
    choiceGone = true;
  }
  const picked = pickByRule(line, pl, plan);
  let m: Match;
  if ('reason' in picked && !('id' in picked)) m = miss(picked.reason);
  else {
    const p = picked as Product;
    const q = convert(line, p);
    m = q === null ? miss('Az egység nem váltható át') : { productId: p.id, qtyInProductUnit: q };
  }
  return choiceGone ? { ...m, choiceGone: true } : m;
}
