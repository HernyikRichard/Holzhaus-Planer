import type { InsulationType, Mm, Plan } from '../model/types';
import { BUNDLED_PRICE_LIST } from '../prices';
import type { PriceList, Product } from '../prices/types';
import type { Supply } from './supplyTypes';
import { timberFor } from './timber';

export type { Supply } from './supplyTypes';

const isTg = (p: Product): boolean => p.id.includes('nutfeder') || p.sheet?.w === 675;
const lc = (p: Product): string => `${p.material ?? ''} ${p.name}`.toLowerCase();

/** Az árlistából a kapható méretek; ami nincs benne, azt null jelzi (a hívó a katalógusértékre esik vissza). */
export function supplyFromPriceList(pl: PriceList): Supply {
  const ps = pl.products;
  const sheet = (thickness: number, tg: boolean): { w: Mm; l: Mm } | null => {
    const p = ps.find(x => x.kind === 'osb' && x.thickness === thickness && x.sheet && isTg(x) === tg);
    return p?.sheet ? { w: p.sheet.w, l: p.sheet.l } : null;
  };
  return {
    // pontos szelvény, vagy a legközelebbi helyettesítő (a párosítás ugyanígy választ)
    stockLengths(_category, section) {
      const r = timberFor(ps, section);
      return r ? [...new Set(r.products.map(p => p.length as number))].sort((a, b) => a - b) : null;
    },
    osbSheet: t => sheet(t, false),
    osbTgSheet: t => sheet(t, true),
    insulationPack(type, thickness) {
      const wanted = (p: Product): boolean => {
        const m = lc(p);
        return type === 'xps' ? m.includes('xps') : /ásványgyapot|kőzetgyapot|üveggyapot/.test(m);
      };
      const cands = ps.filter(p => p.kind === 'insulation' && p.thickness === thickness && p.packM2 && wanted(p));
      if (!cands.length) return null;
      cands.sort((a, b) => a.price / a.packM2! - b.price / b.packM2!);
      return cands[0].packM2!;
    },
    foilRoll(kind) {
      const foils = ps.filter(p => p.kind === 'foil' && p.rollM2);
      const has = (re: RegExp): Product[] => foils.filter(p => re.test(p.name.toLowerCase()));
      let c: Product[];
      if (kind === 'vapor') c = has(/párazáró/);
      else if (kind === 'breather') c = has(/páraáteresztő/);
      else {
        c = has(/alátét/);
        if (!c.length) c = has(/páraáteresztő/);
      }
      return c.length ? Math.max(...c.map(p => p.rollM2!)) : null;
    },
    // az árlistában nincs dobozonkénti darabszám (boxQty), a katalógusérték marad
    fastenerBox: () => null,
  };
}

const cache = new WeakMap<PriceList, Supply>();

/** A tervhez tartozó kínálat; undefined, ha ki van kapcsolva vagy nincs árlista. */
export function supplyFor(plan: Plan, pl: PriceList | null = BUNDLED_PRICE_LIST): Supply | undefined {
  if (!pl || !plan.pricing.useSupply) return undefined;
  let s = cache.get(pl);
  if (!s) { s = supplyFromPriceList(pl); cache.set(pl, s); }
  return s;
}

