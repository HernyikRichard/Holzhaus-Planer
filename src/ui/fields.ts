import type { Plan } from '../model/types';

export interface FieldDef {
  path: string; label: string;
  /** A tervtől függő felirat (pl. héjazat szerint); ha nincs, a `label`. */
  labelFor?: (plan: Plan) => string;
  kind: 'number' | 'select' | 'checkbox' | 'section';
  unit?: 'm' | 'cm' | 'mm' | '°' | '%';
  options?: { value: string; label: string }[];
}
export interface SectionDef { id: string; title: string; fields: FieldDef[] }

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== 'object') return;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur !== null && typeof cur === 'object') (cur as Record<string, unknown>)[last] = value;
}

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const num = (path: string, label: string, unit: FieldDef['unit']): FieldDef => ({ path, label, kind: 'number', unit });
const check = (path: string, label: string): FieldDef => ({ path, label, kind: 'checkbox' });
const select = (path: string, label: string, options: FieldDef['options']): FieldDef =>
  ({ path, label, kind: 'select', options });
const section = (path: string, label: string): FieldDef => ({ path, label, kind: 'section', unit: 'mm' });

const WALL_LAYERS: { label: string; materials?: FieldDef['options']; thickness: boolean }[] = [
  { label: 'Belső burkolat', thickness: true,
    materials: opts(['osb', 'OSB'], ['gypsum', 'Gipszkarton'], ['paneling', 'Lambéria']) },
  { label: 'Párazáró fólia', thickness: false },
  { label: 'Hőszigetelés', thickness: false, materials: opts(['mineralWool', 'Kőzetgyapot'], ['xps', 'XPS']) },
  { label: 'OSB szélmerevítés', thickness: false, materials: opts(['osb12', 'OSB 12 mm'], ['osb15', 'OSB 15 mm']) },
  { label: 'Páraáteresztő fólia', thickness: false },
  { label: 'Szellőztető lécezés', thickness: false },
  { label: 'Külső burkolat', thickness: true,
    materials: opts(['paneling', 'Lambéria'], ['boards', 'Deszka'], ['cementBoard', 'Cementlap']) },
];

const wallLayerFields: FieldDef[] = WALL_LAYERS.flatMap((l, i) => {
  const p = `walls.layers.${i}`;
  return [
    check(`${p}.enabled`, l.label),
    ...(l.materials ? [select(`${p}.material`, `${l.label} anyaga`, l.materials)] : []),
    ...(l.thickness ? [num(`${p}.thickness`, `${l.label} vastagsága`, 'mm')] : []),
  ];
});

const ROOF_LAYERS: { label: string; materials?: FieldDef['options'] }[] = [
  { label: 'Deszkázat', materials: opts(['osb', 'OSB'], ['boards', 'Deszka']) },
  { label: 'Alátétfólia', materials: opts(['foil', 'Fólia'], ['bitumen', 'Bitumenes lemez']) },
  { label: 'Ellenléc' },
  { label: 'Tetőléc' },
];

const roofLayerFields: FieldDef[] = ROOF_LAYERS.flatMap((l, i) => [
  check(`roof.layers.${i}.enabled`, l.label),
  ...(l.materials ? [select(`roof.layers.${i}.material`, `${l.label} anyaga`, l.materials)] : []),
]);

const CONCRETE_GRADE = select('foundation.concreteGrade', 'Beton szilárdsági osztálya', opts(['C16', 'C16'], ['C20', 'C20']));

// a gerendakeretes alaptípusok közös mezői: egy helyen definiálva, a szakaszok használják
const CLEARANCE_FIELD: FieldDef = { ...num('foundation.frame.groundClearance', 'Talaj feletti magasság', 'cm'),
  labelFor: p => (p.foundation.type === 'stripFooting' ? 'Lábazat magassága' : 'Talaj feletti magasság') };
const FRAME_FIELDS: FieldDef[] = [
  CLEARANCE_FIELD,
  select('foundation.frame.beamSection', 'Főgerenda keresztmetszete',
    opts(['b100x150', '100×150'], ['b120x120', '120×120'], ['b2x50x150', '2×50×150'])),
  select('foundation.frame.supportSpacing', 'Támaszköz',
    opts(['auto', 'Automatikus'], ...Array.from({ length: 18 }, (_, i): [string, string] =>
      [String(800 + i * 100), `${80 + i * 10} cm`]))),
];

const FOOTING_FIELDS: FieldDef[] = [
  select('foundation.footing.size', 'Talp mérete', opts(['300', '30×30 cm'], ['400', '40×40 cm'], ['500', '50×50 cm'])),
  num('foundation.footing.depth', 'Alapozási mélység', 'cm'),
  CONCRETE_GRADE,
];

export const SECTIONS: SectionDef[] = [
  { id: 'building', title: 'Épület', fields: [
    num('building.width', 'Szélesség', 'm'),
    num('building.length', 'Hosszúság', 'm'),
    num('building.wallHeight', 'Falmagasság', 'm'),
  ] },
  { id: 'foundation', title: 'Alap', fields: [
    num('foundation.slabThickness', 'Lemezvastagság', 'cm'),
    num('foundation.slabOverhang', 'Lemez túlnyúlása', 'cm'),
    CONCRETE_GRADE,
    select('foundation.meshType', 'Hálótípus',
      opts(['d4_150', 'Ø4 15×15'], ['d5_150', 'Ø5 15×15'], ['d6_150', 'Ø6 15×15'])),
    num('foundation.gravelBedThickness', 'Sóderágy vastagsága', 'cm'),
    check('foundation.peFoil', 'PE fólia'),
  ] },
  { id: 'groundScrew', title: 'Talajcsavar és gerendakeret', fields: [
    select('foundation.groundScrew.length', 'Talajcsavar hossza',
      opts(['800', '80 cm'], ['1000', '100 cm'], ['1200', '120 cm'])),
    ...FRAME_FIELDS,
  ] },
  { id: 'padFooting', title: 'Pontalap és gerendakeret', fields: [...FOOTING_FIELDS, ...FRAME_FIELDS] },
  { id: 'concretePier', title: 'Betonpillér és gerendakeret', fields: [
    ...FOOTING_FIELDS,
    select('foundation.pier.kind', 'Pillér',
      opts(['block200', '20×20 cm zsalukő'], ['block250', '25×25 cm zsalukő'], ['tube200', 'Ø20 cm zsalucső'])),
    ...FRAME_FIELDS,
  ] },
  { id: 'stripFooting', title: 'Sávalap és gerendakeret', fields: [
    select('foundation.strip.width', 'Sáv szélessége', opts(['300', '30 cm'], ['400', '40 cm'], ['500', '50 cm'])),
    num('foundation.strip.depth', 'Alapozási mélység', 'cm'),
    select('foundation.plinth.block', 'Lábazati zsalukő',
      opts(['block200', '20 cm-es zsalukő'], ['block250', '25 cm-es zsalukő'], ['block300', '30 cm-es zsalukő'])),
    CLEARANCE_FIELD,
    CONCRETE_GRADE,
    ...FRAME_FIELDS.filter(f => f !== CLEARANCE_FIELD),
  ] },
  { id: 'floor', title: 'Padló', fields: [
    check('floor.enabled', 'Padlószerkezet'),
    section('floor.joistSection', 'Gerendák keresztmetszete (vastagság × szélesség)'),
    num('floor.joistSpacing', 'Gerendatávolság', 'cm'),
    select('floor.insulation.type', 'Szigetelés',
      opts(['mineralWool', 'Kőzetgyapot'], ['xps', 'XPS'], ['none', 'Nincs szigetelés'])),
    select('floor.insulation.thickness', 'Szigetelés vastagsága',
      opts(['50', '50 mm'], ['100', '100 mm'], ['150', '150 mm'])),
    select('floor.osbThickness', 'OSB vastagsága', opts(['18', '18 mm'], ['22', '22 mm'])),
    check('floor.vaporBarrier', 'Párazáró fólia'),
  ] },
  { id: 'walls', title: 'Falak', fields: [
    section('walls.studSection', 'Oszlopok keresztmetszete (vastagság × szélesség)'),
    num('walls.studSpacing', 'Oszloptávolság', 'cm'),
    select('walls.topPlate', 'Felső koszorú', opts(['single', 'Egyszeres'], ['double', 'Kétszeres'])),
    ...wallLayerFields,
  ] },
  { id: 'roof', title: 'Tető', fields: [
    select('roof.shape', 'Tető alakja',
      opts(['flat', 'Lapostető'], ['mono', 'Félnyeregtető'], ['gable', 'Nyeregtető'])),
    num('roof.pitch', 'Hajlásszög', '°'),
    select('roof.ridgeDirection', 'Gerinc iránya',
      opts(['x', 'X irány (szélesség mentén)'], ['y', 'Y irány (hosszúság mentén)'])),
    section('roof.rafterSection', 'Szarufák keresztmetszete (vastagság × szélesség)'),
    num('roof.rafterSpacing', 'Szarufatávolság', 'cm'),
    num('roof.eaveOverhang', 'Ereszkinyúlás', 'cm'),
    num('roof.gableOverhang', 'Oromkinyúlás', 'cm'),
    ...roofLayerFields,
    select('roof.covering', 'Tetőfedés',
      opts(['tile', 'Cserép'], ['trapezoid', 'Trapézlemez'], ['shingle', 'Zsindely'], ['epdm', 'EPDM'],
        ['standingSeam', 'Állókorcos alumíniumlemez'])),
  ] },
  { id: 'accessories', title: 'Kiegészítők', fields: [
    check('accessories.gutter', 'Ereszcsatorna'),
    check('accessories.downpipe', 'Lefolyócső'),
    check('accessories.fascia', 'Homlokdeszka'),
    check('accessories.bargeBoard', 'Oromdeszka'),
    { ...check('accessories.ridgeTiles', 'Gerinccserép'),
      labelFor: p => (p.roof.covering === 'standingSeam' ? 'Gerincfedő' : 'Gerinccserép') },
    check('accessories.ridgeVent', 'Gerincszellőző'),
  ] },
  { id: 'settings', title: 'Beállítások', fields: [
    num('settings.waste.timber', 'Fa ráhagyás', '%'),
    num('settings.waste.sheet', 'Lemez ráhagyás', '%'),
    num('settings.waste.foil', 'Fólia ráhagyás', '%'),
    num('settings.waste.tile', 'Cserép ráhagyás', '%'),
  ] },
];
