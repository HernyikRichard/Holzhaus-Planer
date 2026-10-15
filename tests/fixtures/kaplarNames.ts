import type { Product } from '../../src/prices/types';

// Valódi Káplár Fatelep termékek (kaplarfatelep.hu, 2026-10-15).
// name: az oldal <h1> terméknevét tükrözi (a <title> 60 karakternél csonkol, ezért a név onnan nem megbízható).
// price/unitText: ahogy a letöltő átadná (a terméklap „Ft / db" ára). Ahol a lap strukturált ára
// más egységre vonatkozik (pl. tetőléc: Ft/méter), a „Bruttó: … Ft / db" érték szerepel.
export interface KaplarCase {
  name: string; url: string; price: number; unitText: string;
  expected: Partial<Product>;
}

const U = 'https://kaplarfatelep.hu';

export const KAPLAR_NAMES: KaplarCase[] = [
  // --- faanyag ---
  { name: 'Padló 5x15x400cm (0,03m3)', url: `${U}/fenyo-fureszaru/pallok/lucfenyo-pallo-5x15x400cm`, price: 5670, unitText: 'db',
    expected: { id: 'timber-50x150-4000', kind: 'timber', section: { t: 50, w: 150 }, length: 4000, price: 5670, unit: 'db' } },
  { name: 'Padló 5x10x600cm (0,03m3)', url: `${U}/fenyo-fureszaru/pallok/lucfenyo-pallo-5x10x600cm`, price: 5670, unitText: 'db',
    expected: { id: 'timber-50x100-6000', kind: 'timber', section: { t: 50, w: 100 }, length: 6000 } },
  { name: 'Gerenda 10x10x400cm (0,04m3)', url: `${U}/fenyo-fureszaru/gerendak/lucfenyo-gerenda-10x10x40`, price: 7560, unitText: 'db',
    expected: { id: 'timber-100x100-4000', kind: 'timber', section: { t: 100, w: 100 }, length: 4000, price: 7560 } },
  { name: 'Szarufa 10x15x500cm (0,075m3)', url: `${U}/fenyo-fureszaru/szarufak/lucfenyo-szarufa-10x15x50`, price: 14180, unitText: 'db',
    expected: { id: 'timber-100x150-5000', kind: 'timber', section: { t: 100, w: 150 }, length: 5000 } },
  { name: 'Szarufa 7,5x15x600cm (0,068m3)', url: `${U}/fenyo-fureszaru/szarufak/lucfenyo-szarufa-75x15x60`, price: 12760, unitText: 'db',
    expected: { id: 'timber-75x150-6000', kind: 'timber', section: { t: 75, w: 150 }, length: 6000 } },
  { name: 'Deszka 2,3-2,5x15x400cm', url: `${U}/fenyo-fureszaru/deszkak/lucfenyo-deszka-23x15x400c`, price: 2840, unitText: 'db',
    expected: { id: 'timber-25x150-4000', kind: 'timber', section: { t: 25, w: 150 }, length: 4000 } },
  { name: 'Bramac PLUS tetőléc 3x5x400cm', url: `${U}/fenyo-fureszaru/tetolec/bramac-plus-tetolec-3-5-4`, price: 1396, unitText: 'db',
    expected: { id: 'timber-30x50-4000', kind: 'timber', section: { t: 30, w: 50 }, length: 4000, price: 1396, unit: 'db' } },
  { name: 'Lucfenyő léc 2,3x4,8x400cm', url: `${U}/Fenyo-fureszaru/Lecek/Lucfenyo-tetolec-23-48-400`, price: 1316, unitText: 'db',
    expected: { id: 'timber-23x48-4000', kind: 'timber', section: { t: 23, w: 48 }, length: 4000 } },
  { name: 'Lucfenyő stafni 4,8x4,8x400cm', url: `${U}/kiegeszitok/tetolecek/szaritott-egalizalt-stafni-48-48-400`, price: 2156, unitText: 'db',
    expected: { id: 'timber-48x48-4000', kind: 'timber', section: { t: 48, w: 48 }, length: 4000 } },
  { name: 'Szárított lucfenyő palló 4,8x25x400 cm', url: `${U}/Fenyo-fureszaru/Szaritott-fureszaru/Szaritott-lucfenyo-pallo-48x250x4000`, price: 10990, unitText: 'db',
    expected: { id: 'timber-48x250-4000-szaritott', kind: 'timber', section: { t: 48, w: 250 }, length: 4000 } },
  // --- OSB ---
  { name: 'Osb-3 lap 12mm', url: `${U}/osb-lapok/osb-lap/osb-lap-12mm`, price: 7090, unitText: 'db',
    expected: { id: 'osb-12', kind: 'osb', thickness: 12, price: 7090, unit: 'tábla' } },
  { name: 'Osb-3 lap 18mm', url: `${U}/osb-lapok/osb-lap/osb-lap-18mm`, price: 10690, unitText: 'db',
    expected: { id: 'osb-18', kind: 'osb', thickness: 18, unit: 'tábla' } },
  { name: 'Osb-3 lap 22mm Nútféderes', url: `${U}/osb-lapok/nutfederes-osb-lap/osb-lap-22mm-nutfeder`, price: 7590, unitText: 'db',
    expected: { id: 'osb-22-nutfeder', kind: 'osb', thickness: 22, unit: 'tábla' } },
  // --- hőszigetelés ---
  { name: 'Knauf MPN PLUS ásványgyapot 50mm', url: `${U}/egyeb-anyagok/hoszigetelesek/knauf-mpn-plus-asvany`, price: 10190, unitText: 'db',
    expected: { id: 'insulation-asvanygyapot-50', kind: 'insulation', material: 'ásványgyapot', thickness: 50, unit: 'db' } },
  { name: 'Knauf Unifit 035 10cm', url: `${U}/Egyeb-anyagok/Hoszigetelesek/Knauf-Unifit-035-10cm`, price: 13290, unitText: 'db',
    expected: { id: 'insulation-uveggyapot-100', kind: 'insulation', material: 'üveggyapot', thickness: 100 } },
  { name: 'Knauf Unifit 035 5cm', url: `${U}/Egyeb-anyagok/Hoszigetelesek/Knauf-Unifit-035-5cm`, price: 13490, unitText: 'db',
    expected: { id: 'insulation-uveggyapot-50', kind: 'insulation', material: 'üveggyapot', thickness: 50 } },
  // --- fóliák ---
  { name: 'Isoflex Classic párazáró tetőfólia 75 m²', url: `${U}/tetofedo-anyagok/tetofoliak/isoflex-classic-paraza`, price: 25690, unitText: 'tekercs',
    expected: { id: 'foil-parazaro-75', kind: 'foil', rollM2: 75, unit: 'tekercs', price: 25690 } },
  { name: 'LINOPORE® RX 3000 páraáteresztő fólia 75 m²', url: `${U}/Tetofedo-anyagok/Tetofoliak/LINOPORE-RX-3000`, price: 25199, unitText: 'tekercs',
    expected: { id: 'foil-paraatereszto-75', kind: 'foil', rollM2: 75, unit: 'tekercs' } },
  { name: 'Isoflex ALU párazáró tetőfólia (60m²/tek) 1,2m x 50m/tek', url: `${U}/Tetofedo-anyagok/Tetofoliak/Isoflex-ALU-tetofolia`, price: 32490, unitText: 'tekercs',
    expected: { id: 'foil-parazaro-60', kind: 'foil', rollM2: 60, unit: 'tekercs' } },
  // --- burkolat ---
  { name: 'Lambéria lucfenyő 14x121x4000mm &quot;A/B&quot; 7 szál/csomag', url: `${U}/gyalult-termekek/lamberiak/lamberia-14x121x4000mm`, price: 17245, unitText: 'csomag',
    expected: { id: 'cladding-lamberia-14x121-4000', kind: 'cladding', material: 'lambéria', section: { t: 14, w: 121 }, length: 4000, thickness: 14, unit: 'csomag', price: 17245 } },
  { name: 'Lambéria lucfenyő 12,5x96x4000mm &quot;A/B&quot;', url: `${U}/gyalult-termekek/lamberiak/lamberia-125x96x4000mm`, price: 4490, unitText: 'm²',
    expected: { id: 'cladding-lamberia-12.5x96-4000', kind: 'cladding', section: { t: 12.5, w: 96 }, length: 4000, thickness: 12.5, unit: 'm²' } },
  { name: 'Hajópadló lucfenyő fózolt/KM 19x146x4000mm &quot;A/B&quot; (5 szál / csomag)', url: `${U}/Gyalult-termekek/Hajopadlok/Hajopadlo-fozolt-KM-195`, price: 17197, unitText: 'csomag',
    expected: { id: 'cladding-hajopadlo-19x146-4000', kind: 'cladding', material: 'hajópadló', section: { t: 19, w: 146 }, length: 4000, thickness: 19, unit: 'csomag' } },
  // --- tetőfedés ---
  { name: 'Zsindely alátétlemez (IKO ArmourBase Pro)', url: `${U}/tetofedo-anyagok/bitumenes-zsindelyek/zsindely-ala`, price: 1690, unitText: 'm²',
    expected: { kind: 'roofing', unit: 'm²', price: 1690 } },
  // Az oldalon nincs listázott ár; a név valódi, az ár (1) csak helykitöltő a tesztben.
  { name: 'IKO Superglass téglány zsindely (3m²/csomag Vörös)', url: `${U}/tetofedo-anyagok/bitumenes-zsindelyek/iko-supergla`, price: 1, unitText: 'csomag',
    expected: { kind: 'roofing', packM2: 3, unit: 'csomag' } },
  // --- ereszcsatorna ---
  { name: 'Galeco Stal (150) ereszcsatorna 4fm/szál', url: `${U}/spd/csgalstal150eresz4mteg/Galeco-Stal-150-ereszcsatorna-4fm-szal`, price: 18444, unitText: 'db',
    expected: { kind: 'gutter', unit: 'db', price: 18444 } },
  { name: 'Galeco Stal fémcsatornatartó 4/320mm', url: `${U}/spd/csgalstal150csvascsoki/Galeco-Stal-femcsatornatarto-4-320mm`, price: 2602, unitText: 'db',
    expected: { kind: 'gutter', unit: 'db' } },
  { name: 'Alsó kifolyó ráncolt ( 33 kiköpő )', url: `${U}/tetofedo-anyagok/csatornak-badogok/csatornak-33/al`, price: 2099, unitText: 'db',
    expected: { kind: 'gutter', unit: 'db' } },
  // --- kötőelemek ---
  { name: 'Zsindelyszeg 25 mm 5kg', url: `${U}/tetofedo-anyagok/bitumenes-zsindelyek/zsindelyszeg-25-5`, price: 14500, unitText: 'db',
    expected: { kind: 'fastener', unit: 'db', price: 14500 } },
  { name: 'Önmetsző platócsavar 5,5x38mm', url: `${U}/kiegeszitok/csavarok-platocsavarok/platocsavar-55x`, price: 40, unitText: 'db',
    expected: { kind: 'fastener', unit: 'db' } },
  { name: 'Huzalszeg 100mm 1kg', url: `${U}/kiegeszitok/szegekvasanyagok-/huzalszeg-42x100-1kg`, price: 1990, unitText: 'kg',
    expected: { kind: 'fastener', unit: 'db' } },
  { name: 'Reisser DNS PLUS duplamenetes facsavar, Rm., 5x80mm(200db/doboz)', url: `${U}/DNS-PLUS-facsavar/Reisser-DNS-PLUS-duplamenetes-facsavar-5x80mm`, price: 4200, unitText: 'doboz',
    expected: { kind: 'fastener', unit: 'doboz', boxQty: 200, price: 4200 } },
];
