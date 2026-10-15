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
