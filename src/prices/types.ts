export type ProductKind =
  | 'timber' | 'osb' | 'insulation' | 'foil' | 'cladding' | 'roofing'
  | 'gutter' | 'fastener' | 'other';

export interface Product {
  id: string;            // stabil, a nevből/méretekből képzett, pl. 'timber-50x150-4000'
  name: string; url: string; kind: ProductKind;
  price: number;         // bruttó Ft / unit
  unit: 'db' | 'tábla' | 'csomag' | 'tekercs' | 'm²' | 'fm' | 'doboz';
  section?: { t: number; w: number }; length?: number;   // mm (faanyag)
  thickness?: number; sheet?: { w: number; l: number };  // mm (lapok)
  packM2?: number; rollM2?: number; boxQty?: number;
  usefulWidth?: number;  // mm, trapézlemez hasznos fedőszélessége (ha az oldal megadja)
  material?: string;     // pl. 'kőzetgyapot', 'üveggyapot', 'XPS', 'lambéria'
}

export interface PriceList {
  source: 'Káplár Fatelep'; fetchedAt: string;           // ISO dátum
  shipping: { fee: number; freeAbove: number };          // 14990, 500000
  products: Product[];
}
