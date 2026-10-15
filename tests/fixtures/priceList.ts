import type { PriceList, Product } from '../../src/prices/types';

const p = (x: Partial<Product> & Pick<Product, 'id' | 'kind' | 'unit'>): Product =>
  ({ name: x.id, url: `https://kaplarfatelep.hu/${x.id}`, price: 1000, ...x });

/** Rögzített mini-árlista a Supply- és számítási tesztekhez. Nincs benne 24×48 léc. */
export const FIXTURE: PriceList = {
  source: 'Káplár Fatelep',
  fetchedAt: '2026-10-01',
  shipping: { fee: 14990, freeAbove: 500000 },
  products: [
    p({ id: 'pallo-50x100-4000', kind: 'timber', unit: 'db', section: { t: 50, w: 100 }, length: 4000 }),
    p({ id: 'pallo-50x100-6000', kind: 'timber', unit: 'db', section: { t: 50, w: 100 }, length: 6000 }),
    p({ id: 'osb-12', kind: 'osb', unit: 'tábla', thickness: 12, sheet: { w: 1250, l: 2500 } }),
    p({ id: 'osb-18-nutfeder', kind: 'osb', unit: 'tábla', thickness: 18, sheet: { w: 675, l: 2500 } }),
    p({ id: 'kozetgyapot-100', kind: 'insulation', unit: 'csomag', material: 'kőzetgyapot', thickness: 100, packM2: 5.4 }),
    p({ id: 'foil-parazaro-60', kind: 'foil', unit: 'tekercs', name: 'Párazáró fólia 60 m²', rollM2: 60 }),
  ],
};

/** A párosítás tesztjeihez: a FIXTURE bővítve a kizárandó és a többféle terméktípussal. */
export const MATCH_FIXTURE: PriceList = {
  ...FIXTURE,
  products: [
    ...FIXTURE.products,
    p({ id: 'pallo-50x150-4000', kind: 'timber', unit: 'db', section: { t: 50, w: 150 }, length: 4000, price: 2000 }),
    p({ id: 'osb-12-b', kind: 'osb', unit: 'tábla', thickness: 12, sheet: { w: 1250, l: 2500 }, price: 9000 }),
    p({ id: 'kozetgyapot-100-b', kind: 'insulation', unit: 'db', material: 'kőzetgyapot', thickness: 100, packM2: 6, price: 12000 }),
    p({ id: 'foil-takarofolia', kind: 'foil', unit: 'db', name: 'Takarófólia párazáró 4x5m', price: 5 }),
    p({ id: 'trapez-polikarbonat', kind: 'roofing', unit: 'db', name: 'Trapéz Polikarbonát lemez 0,8mm', packM2: 2.5, price: 5000 }),
    p({ id: 'trapez-t18', kind: 'roofing', unit: 'db', name: 'Trapézlemez T18 Plusz', packM2: 2.36, price: 12490 }),
    p({ id: 'zsindely-3', kind: 'roofing', unit: 'csomag', name: 'Bitumenes zsindely (3 m²/csomag)', packM2: 3, price: 9000 }),
    p({ id: 'zsindely-starter', kind: 'roofing', unit: 'db', name: 'IKO StarterStrip kezdőelem zsindelyhez', packM2: 3, price: 100 }),
    p({ id: 'zsindely-ragaszto', kind: 'roofing', unit: 'db', name: 'Zsindelyragasztó', packM2: 3, price: 100 }),
  ],
};
