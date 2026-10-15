import type { MaterialLine } from '../calc/types';
import { DOWNPIPE_EXTRA, TRAPEZOID_END_OVERLAP, TRAPEZOID_SIDE_OVERLAP } from '../catalog';
import type { InsulationType, Plan } from '../model/types';
import type { PriceList, Product } from '../prices/types';
import { hu } from '../calc/util';
import { substituteWarning, timberFor } from './timber';

export type Match =
  | {
    productId: string; qtyInProductUnit: number; choiceGone?: boolean;
    /** Figyelmeztetés (pl. helyettesítő szelvény). */
    warning?: string;
    /** Az átváltás magyarázata (pl. tetődeszka m² → szál). */
    note?: string;
  }
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

/** Trapézlemez-tábla (mm): hossz és hasznos fedőszélesség – a termék adataiból vagy a nevéből („126x200cm”). */
export function trapezoidSheet(p: Product): { length: number; useful: number } | null {
  let s = p.sheet;
  if (!s) {
    const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm(?![a-z])/i.exec(p.name);
    if (m) {
      const a = Math.round(parseFloat(m[1].replace(',', '.')) * 10);
      const b = Math.round(parseFloat(m[2].replace(',', '.')) * 10);
      s = { w: Math.min(a, b), l: Math.max(a, b) };
    }
  }
  if (!s) return null;
  const useful = p.usefulWidth ?? s.w - TRAPEZOID_SIDE_OVERLAP;
  return useful > 0 && s.l > TRAPEZOID_END_OVERLAP ? { length: s.l, useful } : null;
}

/** Trapézlemez táblaszáma: síkok × ⌈ereszhossz / hasznos szélesség⌉ × ⌈szarufahossz / (táblahossz − végátfedés)⌉. */
function trapezoidQty(line: MaterialLine, p: Product): number | { reason: string } {
  const sh = trapezoidSheet(p);
  const { alongRidge, rafterLength, planes } = line;
  if (!sh || alongRidge === undefined || rafterLength === undefined || planes === undefined) {
    return { reason: 'A trapézlemez táblamérete ismeretlen' };
  }
  return planes * Math.ceil(alongRidge / sh.useful - EPS) * Math.ceil(rafterLength / (sh.length - TRAPEZOID_END_OVERLAP) - EPS);
}

/** A sor mennyisége a termék egységében, vagy null, ha az átváltás nem egyértelmű. */
function convert(line: MaterialLine, p: Product): number | null {
  const m2 = coverM2(p);
  if (p.unit === 'm²' && line.needM2 !== undefined) return Math.ceil(line.needM2 * 10 - EPS) / 10;
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


/** Csatornarendszer-kulcs a névből: hazai 25-ös / 33-as sorozat, Galeco család (PVC: méret is), Qstalyo. */
export function gutterSystemKey(p: Product): string | null {
  const n = p.name.toLowerCase();
  const g = /galeco\s+(pvc|stal²|stal,\s*metál|stal)/.exec(n);
  if (g) {
    const fam = g[1].replace(/[\s,]+/g, '-');
    if (fam !== 'pvc') return `galeco-${fam}`;
    const sz = /\((\d+)(?:\/\d+)?\)/.exec(n);
    return sz ? `galeco-pvc-${sz[1]}` : null;
  }
  if (/qstalyo/.test(n)) return 'qstalyo';
  const h = /\(\s*(25|33)(?:-[a-zö]+)?\s*\)/.exec(n);
  return h ? `horg-${h[1]}` : null;
}
const isGutterPipe = (p: Product): boolean =>
  /ereszcsatorna/i.test(p.name) && !/véges|véglemez|szeglet|csonkos/i.test(p.name) && nameLengthM(p) !== null;

/** Egy rendszer: a legolcsóbb m-árú csatornájú, amelyiknek van végeleme és tartója is (ha nincs ilyen, a legolcsóbb). */
function chooseGutterSystem(ps: Product[]): string | null {
  const best = new Map<string, number>();
  const complete = new Set<string>();
  const parts = new Map<string, { cap: boolean; bracket: boolean }>();
  for (const p of ps) {
    if (p.kind !== 'gutter') continue;
    const k = gutterSystemKey(p);
    if (!k) continue;
    const st = parts.get(k) ?? { cap: false, bracket: false };
    if (/véglemez/i.test(p.name)) st.cap = true;
    if (/csatornatartó/i.test(p.name)) st.bracket = true;
    parts.set(k, st);
    if (isGutterPipe(p)) best.set(k, Math.min(best.get(k) ?? Infinity, p.price / nameLengthM(p)!));
  }
  for (const [k, st] of parts) if (st.cap && st.bracket) complete.add(k);
  const pool = [...best.keys()].filter(k => complete.has(k));
  const keys = (pool.length ? pool : [...best.keys()]).sort((a, b) => best.get(a)! - best.get(b)! || (a < b ? -1 : 1));
  return keys[0] ?? null;
}

const FOUNDATION = /^foundation\./;

/** Az alap tájékoztató sorai: származtatott / duplikált mennyiségek (a zsák és a sóder a rendelendő), nem árazandók. */
const INFORMATIONAL = new Set(['foundation.concrete', 'foundation.cement', 'foundation.water']);
export const isInformational = (lineId: string): boolean => INFORMATIONAL.has(lineId);

/** A szabály szerint választott termék, vagy a hiány oka. */
/** Tetődeszkának való deszka: kisebbik oldala 20–30 mm, nagyobbik ≥ 100 mm, ismert hosszal. */
const isDeckBoard = (p: Product): boolean => p.kind === 'timber' && !!p.section && !!p.length
  && Math.min(p.section.t, p.section.w) >= 20 && Math.min(p.section.t, p.section.w) <= 30 && Math.max(p.section.t, p.section.w) >= 100;
/** Egy szál deszka fedése (m²): szélesség × hossz. */
const boardM2 = (p: Product): number => (Math.max(p.section!.t, p.section!.w) / 1000) * (p.length! / 1000);

/** A szabály szerint választott termék, vagy a hiány oka; a figyelmeztetést a meta kapja. */
function pickByRule(line: MaterialLine, pl: PriceList, plan: Plan, meta: { warning?: string }): Product | { reason: string } {
  const ps = pl.products;
  const none = (reason: string): { reason: string } => ({ reason });
  const id = line.id;
  const layers = plan.walls.layers;

  if (id.startsWith('timber.')) {
    const [, , sec, stock] = id.split('.');
    const s = sectionOf(sec ?? '');
    const len = Number(stock);
    const r = s ? timberFor(ps, s) : null;
    const p = r && cheapest(r.products.filter(x => x.length === len), x => x.price);
    if (!p) return none(`Nincs Káplár-termék ${sec} × ${stock} mm méretben`);
    if (!r.exact) meta.warning = substituteWarning(s!, r.section);
    return p;
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
      if (line.unit === 'm²') {
        // deszkázat: a leghosszabb kapható deszkából, a legolcsóbb m²-áron
        const c = ps.filter(isDeckBoard);
        if (!c.length) return none('Nincs deszka az árlistában');
        const longest = Math.max(...c.map(p => p.length!));
        return cheapest(c.filter(p => p.length === longest), p => p.price / boardM2(p))!;
      }
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
      if (line.name !== 'Alátétfólia') {
        return cheapest(ps.filter(p => p.kind === 'roofing' && /alátét/i.test(p.name) && coverM2(p)), perM2)
          || none('Bitumenes alátétlemez nincs az árlistában');
      }
      return foilCandidates(pl, line, [/alátét/, /páraáteresztő/]) || none('Nincs alátétfólia az árlistában');
    case 'wall.exteriorCladding': {
      const layer = layers.find(l => l.kind === 'exteriorCladding' && l.enabled);
      if (!layer || (layer.material !== 'paneling' && layer.material !== 'boards')) {
        return none('Ilyen burkolat nincs az árlistában');
      }
      return closestThickness(ps.filter(p => p.kind === 'cladding' && p.packM2), layer.thickness)
        || none('Nincs lambéria az árlistában');
    }
    case 'roof.trapezoid': {
      const c = ps.filter(p => p.kind === 'roofing' && p.unit !== 'm²' && /trapézlemez/i.test(p.name) && !/polikarbon/i.test(p.name));
      if (!c.length) return none('Nincs trapézlemez az árlistában');
      const sized = c.filter(p => typeof trapezoidQty(line, p) === 'number');
      // ismert táblaméretű: a teljes tetőre legolcsóbb; különben a legolcsóbb (a mennyisége hiányzó lesz)
      return sized.length ? cheapest(sized, p => (trapezoidQty(line, p) as number) * p.price)! : cheapest(c, p => p.price)!;
    }
    case 'roof.shingles': {
      const c = ps.filter(p => p.kind === 'roofing' && p.packM2 && /zsindely/i.test(p.name)
        && !/starter|kezdőelem|ragasztó|alátét/i.test(p.name));
      const same = line.unitM2 === undefined ? [] : c.filter(p => Math.abs(p.packM2! - line.unitM2!) < EPS);
      return cheapest(same.length ? same : c, perM2) || none('Nincs zsindely az árlistában');
    }
    case 'roof.tiles':
    case 'acc.ridgeTiles':
      return none('Cserép nincs az árlistában');
    case 'acc.gutter':
    case 'acc.gutterEnds':
    case 'acc.gutterJoiners':
    case 'acc.gutterBrackets':
    case 'acc.downpipe':
    case 'acc.downpipeElbows':
    case 'acc.downpipeClips': {
      const sys = chooseGutterSystem(ps);
      if (!sys) return none('Nincs ereszcsatorna az árlistában');
      const inSys = ps.filter(p => p.kind === 'gutter' && gutterSystemKey(p) === sys);
      const lack = 'A választott csatornarendszerben nincs ilyen elem';
      if (id === 'acc.gutter') return cheapest(inSys.filter(isGutterPipe), p => p.price / nameLengthM(p)!) || none(lack);
      if (id === 'acc.downpipe') {
        const need = (plan.building.wallHeight + DOWNPIPE_EXTRA) / 1000;
        return cheapest(inSys.filter(p => /lefolyócső/i.test(p.name) && (nameLengthM(p) ?? 0) >= need - EPS), p => p.price)
          || none('A választott csatornarendszerben nincs elég hosszú lefolyócső');
      }
      const re = { 'acc.gutterEnds': /véglemez/i, 'acc.gutterJoiners': /toldó/i, 'acc.gutterBrackets': /csatornatartó/i,
        'acc.downpipeElbows': /könyök/i, 'acc.downpipeClips': /bilincs/i }[id]!;
      return cheapest(inSys.filter(p => re.test(p.name)), p => p.price) || none(lack);
    }
    case 'fix.frameScrews': {
      // a katalógus „5×90 csavar” címkéje: pontos méretű, dobozos facsavar
      const c = ps.filter(p => p.kind === 'fastener' && p.boxQty && /csavar/i.test(p.name) && /\b5x90\b|5x90mm/i.test(p.name));
      return cheapest(c, p => p.price / p.boxQty!) || none('Nincs 5×90 csavar az árlistában');
    }
    default:
      return none('Nincs megfelelő Káplár-termék');
  }
}

/** A sor mennyisége a termék egységében; a trapézlemez táblakiosztásból, a többi az egységátváltásból. */
type Qty = { qty: number; note?: string } | { reason: string };
function quantity(line: MaterialLine, p: Product, unconvertible: string): Qty {
  if (line.id === 'roof.trapezoid' && p.kind === 'roofing' && p.unit !== 'm²') {
    const q = trapezoidQty(line, p);
    return typeof q === 'number' ? { qty: q } : q;
  }
  if (line.id === 'roof.decking' && line.unit === 'm²' && p.kind === 'timber' && p.section && p.length) {
    const per = boardM2(p);
    const qty = Math.ceil(line.quantity / per - EPS);
    const w = Math.max(p.section.t, p.section.w) / 1000;
    return { qty, note: `Deszka: ${hu(line.quantity)} m² / (${hu(w)} m × ${hu(p.length / 1000)} m) = ${hu(line.quantity / per)} → ${qty} szál` };
  }
  const q = convert(line, p);
  return q === null ? { reason: unconvertible } : { qty: q };
}
const toMatch = (p: Product, q: Qty, warning?: string): Match =>
  'reason' in q ? miss(q.reason)
    : { productId: p.id, qtyInProductUnit: q.qty, ...(q.note ? { note: q.note } : {}), ...(warning ? { warning } : {}) };

export function matchLine(line: MaterialLine, pl: PriceList, plan: Plan): Match {
  if (FOUNDATION.test(line.id)) {
    return { missing: true, reason: 'Nincs Káplár-termék, máshonnan beszerzendő', otherSource: true };
  }
  const choice = plan.pricing.productChoice[line.id];
  let choiceGone = false;
  if (choice !== undefined) {
    const p = pl.products.find(x => x.id === choice);
    if (p) return toMatch(p, quantity(line, p, 'A kiválasztott termék egysége nem váltható át'));
    choiceGone = true;
  }
  const meta: { warning?: string } = {};
  const picked = pickByRule(line, pl, plan, meta);
  let m: Match;
  if ('reason' in picked && !('id' in picked)) m = miss(picked.reason);
  else {
    const p = picked as Product;
    m = toMatch(p, quantity(line, p, 'Az egység nem váltható át'), meta.warning);
  }
  return choiceGone ? { ...m, choiceGone: true } : m;
}
