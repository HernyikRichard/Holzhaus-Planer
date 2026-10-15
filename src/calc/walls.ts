import type { Mm, Plan } from '../model/types';
import type { MaterialLine, ModuleResult, TimberPiece } from './types';
import {
  BATTEN_SECTION, BATTEN_SPACING_WALL, WALL_BATTEN_PIECE_LENGTH, FOIL_ROLL_M2, GYPSUM_SHEET, INSULATION_PACK_M2, OSB_SHEET,
} from '../catalog';
import { emptyResult, hu } from './util';
import { studLengthAt, wallGeometry, studPositions } from './geometry';
export { studPositions };
import { openingArea } from './openings';
import { wallFrameElements } from '../scene/wallFrame';
import { wallOsbElements } from '../scene/wallSheathing';
import { elementsToPieces } from '../scene/toPieces';
import { missingSupplyWarning, type Supply } from '../pricing/supply';

const VERTICAL = new Set(['oszlop', 'sarokoszlop', 'oromoszlop', 'teljes oszlop', 'kiváltó oszlop',
  'felső rövid oszlop', 'alsó rövid oszlop']);

export function calcWallFraming(plan: Plan): ModuleResult {
  const res = emptyResult();
  const scene = wallFrameElements(plan);
  res.pieces = elementsToPieces(scene.elements);
  res.stats.frameScrewCount = scene.fasteners
    .filter(f => f.kind === 'frameScrew').reduce((s, f) => s + f.count, 0);
  const anchors = scene.fasteners.filter(f => f.kind === 'anchor').reduce((s, f) => s + f.count, 0);
  res.stats.studs = res.pieces.filter((x: TimberPiece) => VERTICAL.has(x.label)).length;
  res.stats.headers = plan.openings.length;
  res.stats.anchorPoints = anchors;
  return res;
}

export function wallAreas(plan: Plan): { gross: number; net: number } {
  let gross = 0;
  for (const w of wallGeometry(plan)) {
    gross += (w.length / 1000) * ((w.hStart + w.hEnd) / 2 / 1000) + (w.length / 1000) * (w.gableRise / 1000) / 2;
  }
  const net = gross - plan.openings.reduce((s, o) => s + openingArea(o), 0);
  return { gross, net };
}

const OSB_AREA = (OSB_SHEET.w / 1000) * (OSB_SHEET.l / 1000);
const GYPSUM_AREA = (GYPSUM_SHEET.w / 1000) * (GYPSUM_SHEET.l / 1000);
const CLADDING_HU: Record<string, string> = { paneling: 'lambéria', boards: 'deszka', cementBoard: 'cementkötésű lap' };

/**
 * Fali lécek (`léc`): pozíció nélküli darabok, nincs hozzájuk Element.
 * Az azonosító `wall.batten.<n>`, hogy a vágási kiosztás (scene.cut) őket is lefedje.
 */
export function wallBattenPieces(plan: Plan): TimberPiece[] {
  const layer = plan.walls.layers.find(l => l.kind === 'battens');
  if (!layer?.enabled) return [];
  const { net } = wallAreas(plan);
  const total = Math.ceil(net / (BATTEN_SPACING_WALL / 1000) - 1e-9) * 1000;
  const full = Math.floor(total / WALL_BATTEN_PIECE_LENGTH);
  const rest = total - full * WALL_BATTEN_PIECE_LENGTH;
  const out: TimberPiece[] = [];
  const piece = (length: number): void => {
    out.push({ id: `wall.batten.${out.length + 1}`, category: 'Fal', section: BATTEN_SECTION, length, label: 'léc' });
  };
  for (let i = 0; i < full; i++) piece(WALL_BATTEN_PIECE_LENGTH);
  if (rest > 0) piece(rest);
  return out;
}

export function calcWallLayers(plan: Plan, supply?: Supply): ModuleResult {
  const res = emptyResult();
  const { gross, net } = wallAreas(plan);
  const sw = plan.settings.waste.sheet;
  const fw = plan.settings.waste.foil;
  const area = `Nettó fal: ${hu(gross)} − ${hu(gross - net)} = ${hu(net)} m²`;
  const add = (l: Omit<MaterialLine, 'category'>): void => {
    res.lines.push({ category: 'Fal', ...l });
  };
  const sheets = (id: string, name: string, sheetArea: number, warnings: string[] = []): number => {
    const need = net * (1 + sw);
    const qty = Math.ceil(need / sheetArea - 1e-9);
    add({
      id, name, quantity: qty, unit: 'tábla',
      explanation: `${area}; ${hu(net)} m² × ${hu(1 + sw)} = ${hu(need)} m² / ${hu(sheetArea, 4)} m² = ${hu(need / sheetArea, 3)} → ${qty} tábla`,
      ...(warnings.length ? { warnings } : {}),
    });
    return qty;
  };
  // stats.osbSheets = a rajzon nem szereplő OSB táblák (belső OSB burkolat); a külső OSB csavarja a kiosztásból jön
  let osbSheets = 0;
  const sqm = (id: string, name: string): number => {
    const need = net * (1 + sw);
    const qty = Math.ceil(need * 10 - 1e-9) / 10;
    add({ id, name, quantity: qty, unit: 'm²', explanation: `${area}; ${hu(net)} m² × ${hu(1 + sw)} = ${hu(need, 3)} m² → ${hu(qty, 1)} m²` });
    return qty;
  };
  /** A kínálatból jövő OSB-táblaméret (m²), hiányában a katalógusé + figyelmeztetés. */
  const osbSheetArea = (thickness: number): { area: number; warnings: string[] } => {
    const s = supply?.osbSheet(thickness);
    if (s) return { area: (s.w / 1000) * (s.l / 1000), warnings: [] };
    return { area: OSB_AREA, warnings: supply ? [missingSupplyWarning(`OSB ${thickness} mm`)] : [] };
  };
  const foil = (id: string, name: string, kind: 'vapor' | 'breather'): void => {
    const sRoll = supply?.foilRoll(kind) ?? null;
    const roll = sRoll ?? FOIL_ROLL_M2;
    const warnings = supply && sRoll === null
      ? [missingSupplyWarning(kind === 'vapor' ? 'párazáró fólia' : 'páraáteresztő fólia')] : [];
    const need = net * (1 + fw);
    const rolls = Math.ceil(need / roll - 1e-9);
    add({
      id, name, quantity: rolls, unit: 'tekercs',
      explanation: `${area}; ${hu(net)} m² × ${hu(1 + fw)} = ${hu(need)} m² / ${roll} m² = ${hu(need / roll, 3)} → ${rolls} tekercs`,
      ...(warnings.length ? { warnings } : {}),
    });
  };

  let claddingArea = 0;
  for (const layer of plan.walls.layers) {
    if (!layer.enabled) continue;
    switch (layer.kind) {
      case 'osb':
      {
        const o = osbSheetArea(layer.thickness);
        sheets('wall.osb', `Külső OSB lap (${layer.thickness} mm)`, o.area, o.warnings);
        break;
      }
      case 'insulation': {
        const warnings: string[] = [];
        let type = layer.material as keyof typeof INSULATION_PACK_M2;
        if (!(type in INSULATION_PACK_M2)) {
          warnings.push(`Ismeretlen szigetelőanyag (${layer.material}), ásványgyapottal számoltunk.`);
          type = 'mineralWool';
        }
        const packs: Record<number, number> = INSULATION_PACK_M2[type];
        const thick = plan.walls.studSection.w;
        let used = thick;
        const supplied = supply?.insulationPack(type, thick) ?? null;
        if (supply && supplied === null) {
          warnings.push(missingSupplyWarning(`${thick} mm ${type === 'xps' ? 'XPS' : 'ásványgyapot'}`));
        }
        if (supplied === null && packs[thick] === undefined) {
          const avail = Object.keys(packs).map(Number).sort((a, b) => a - b);
          used = avail.find(x => x > thick) ?? avail[avail.length - 1];
          warnings.push(`Nincs ${thick} mm vastag szigetelés a katalógusban, ${used} mm-es csomaggal számoltunk.`);
        }
        const pack = supplied ?? packs[used];
        const t = plan.walls.studSection.t;
        const sp = plan.walls.studSpacing;
        const need = net * (1 - t / sp) * (1 + sw);
        const qty = Math.ceil(need / pack - 1e-9);
        add({
          id: 'wall.insulation',
          name: `Fal hőszigetelés (${type === 'xps' ? 'XPS' : 'ásványgyapot'}, ${used} mm)`,
          quantity: qty, unit: 'csomag',
          explanation: `${area}; ${hu(net)} m² × (1 − ${t}/${sp}) × ${hu(1 + sw)} = ${hu(need)} m² / ${hu(pack)} m² = ${hu(need / pack, 3)} → ${qty} csomag`,
          ...(warnings.length ? { warnings } : {}),
        });
        break;
      }
      case 'vaporBarrier': foil('wall.vaporBarrier', 'Fal párazáró fólia', 'vapor'); break;
      case 'breatherMembrane': foil('wall.breatherMembrane', 'Fal szélzáró fólia', 'breather'); break;
      case 'battens': {
        res.pieces.push(...wallBattenPieces(plan));
        break;
      }
      case 'exteriorCladding': {
        const label = CLADDING_HU[layer.material] ?? layer.material;
        const qty = sqm('wall.exteriorCladding', `Külső burkolat (${label}, ${layer.thickness} mm)`);
        if (layer.material === 'paneling' || layer.material === 'boards') claddingArea = qty;
        break;
      }
      case 'interiorCladding':
        if (layer.material === 'osb') {
          const o = osbSheetArea(layer.thickness);
          osbSheets += sheets('wall.interiorCladding', `Belső OSB burkolat (${layer.thickness} mm)`, o.area, o.warnings);
        }
        else if (layer.material === 'gypsum') sheets('wall.interiorCladding', `Gipszkarton (${layer.thickness} mm)`, GYPSUM_AREA);
        else sqm('wall.interiorCladding', `Belső lambéria (${layer.thickness} mm)`);
        break;
    }
  }
  res.stats.osbSheets = osbSheets;
  res.stats.osbScrewCount = wallOsbElements(plan, undefined, supply).fasteners.reduce((s, f) => s + f.count, 0);
  res.stats.claddingArea = claddingArea;
  return res;
}
