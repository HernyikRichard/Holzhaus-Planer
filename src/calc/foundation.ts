import type { Plan } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import {
  BED_COMPACTION, CEMENT_BAG_KG, CEMENT_KG_PER_M3, FORMWORK_EXTRA, GRAVEL_LOOSE_T_PER_M3,
  GRAVEL_T_PER_M3, JOIST_HANGER_SCREWS, MESH_SHEET, MESH_TYPES, PE_ROLL_M2, STAKE_SPACING, WATER_L_PER_M3,
} from '../catalog';
import { ceilTo, emptyResult, hu } from './util';
import { concreteLines, supportSpec } from './supports';
import { frameLayout, hasFrame } from './frame';
import { frameElements } from '../scene/frame';
import { elementsToPieces } from '../scene/toPieces';

export interface MeshLayout { cols: number; rows: number; sheetW: number; sheetL: number }

/** A hálótáblák kiosztása: cols az x, rows az y irányban; a kevesebb táblát igénylő tájolás nyer. */
export function meshLayout(plan: Plan): MeshLayout {
  const { w, l, overlap } = MESH_SHEET;
  const slabX = plan.building.width + 2 * plan.foundation.slabOverhang;
  const slabY = plan.building.length + 2 * plan.foundation.slabOverhang;
  const count = (a: number, b: number): number =>
    Math.max(1, Math.ceil((a - overlap) / (b - overlap) - 1e-9));
  const upright = { cols: count(slabX, w), rows: count(slabY, l), sheetW: w, sheetL: l };
  const rotated = { cols: count(slabX, l), rows: count(slabY, w), sheetW: l, sheetL: w };
  return upright.cols * upright.rows <= rotated.cols * rotated.rows ? upright : rotated;
}

/**
 * Gerendakeretes alap: menetes szárak, gerendasaruk és a főgerendák darabjai; talajcsavarnál előttük a
 * talajcsavarok és az U-fejek. (A pontalap és a betonpillér támasz-anyaga külön jön.)
 */
function calcFrameFoundation(plan: Plan): ModuleResult {
  const res = emptyResult();
  const f = frameLayout(plan);
  const { elements, fasteners } = frameElements(plan);
  const supports = elements.filter(e => e.kind === 'support').length;
  const sum = (kind: string): number => fasteners.filter(x => x.kind === kind).reduce((s, x) => s + x.count, 0);
  const bolts = sum('beamBolt');
  const hangers = sum('joistHanger');
  const add = (l: Omit<MaterialLine, 'category' | 'unit'>): void => {
    res.lines.push({ category: 'Alap', unit: 'db', ...l });
  };
  res.lines.push(...supportSpec(plan).lines(plan, f));
  const strip = plan.foundation.type === 'stripFooting';
  if (!strip || bolts > 0) {
    add({
      id: 'foundation.beamBolts', name: 'M12 menetes szár anyával, alátéttel', quantity: bolts,
      explanation: `${supports} támasz × ${bolts / Math.max(1, supports)} db = ${bolts} db`,
    });
  }
  let hangerExpl = `${f.joistPositions.length} párnafa × ${f.beamAxes.length} főgerenda = ${hangers} db; csavar: ${hangers} × ${JOIST_HANGER_SCREWS} db`;
  if (strip) {
    // a rövid talpgerendán fekvő peremi párnafák csak a hosszú talpgerendákra akasztanak: a darabszám a jelenetből
    const perJoist = new Map<string, number>();
    for (const x of fasteners) {
      if (x.kind === 'joistHanger') perJoist.set(x.elementIds[0], (perJoist.get(x.elementIds[0]) ?? 0) + x.count);
    }
    const groups = new Map<number, number>();
    for (const c of perJoist.values()) groups.set(c, (groups.get(c) ?? 0) + 1);
    const terms = [...groups].sort((a, b) => b[0] - a[0]).map(([per, n]) => `${n} párnafa × ${per} gerenda`);
    hangerExpl = `${terms.join(' + ')} = ${hangers} db; csavar: ${hangers} × ${JOIST_HANGER_SCREWS} db`;
  }
  add({
    id: 'foundation.joistHangers', name: 'Gerendasaru (párnafa–főgerenda)', quantity: hangers,
    explanation: hangerExpl,
  });
  res.stats.connectorScrewCount = hangers * JOIST_HANGER_SCREWS;
  res.pieces = elementsToPieces(elements.filter(e => e.kind === 'beam'));
  res.warnings = [...f.warnings];
  return res;
}

export function calcFoundation(plan: Plan): ModuleResult {
  if (hasFrame(plan)) return calcFrameFoundation(plan);
  const res = emptyResult();
  const f = plan.foundation;
  const slabX = plan.building.width + 2 * f.slabOverhang;
  const slabY = plan.building.length + 2 * f.slabOverhang;
  const area = (slabX / 1000) * (slabY / 1000);
  const t = f.slabThickness / 1000;
  const vol = area * t;
  const dims = `${hu(slabX / 1000)} × ${hu(slabY / 1000)} m = ${hu(area)} m²`;
  const add = (l: Omit<MaterialLine, 'category'>): void => {
    res.lines.push({ category: 'Alap', ...l });
  };

  const volSrc = `${hu(area)} m² × ${hu(t, 3)} m = ${hu(vol, 4)} m³`;
  res.lines.push(...concreteLines(plan, vol, `${dims}; ${volSrc}`, volSrc));

  const mesh = MESH_TYPES[f.meshType];
  const layout = meshLayout(plan);
  const sheets = layout.cols * layout.rows;
  const meshKg = sheets * mesh.kgPerSheet;
  add({
    id: 'foundation.mesh', name: `Betonháló ${mesh.label}`, quantity: sheets, unit: 'tábla',
    secondary: `${hu(meshKg, 1)} kg`,
    explanation: `${MESH_SHEET.w / 10}×${MESH_SHEET.l / 10} cm-es táblák, ${MESH_SHEET.overlap / 10} cm átfedéssel, mindkét tájolás közül a kisebb: ${sheets} tábla × ${hu(mesh.kgPerSheet, 1)} kg = ${hu(meshKg, 1)} kg`,
  });

  const bedRaw = area * (f.gravelBedThickness / 1000) * BED_COMPACTION;
  add({
    id: 'foundation.bed', name: 'Sóderágy (zúzottkő 0/32)', quantity: ceilTo(bedRaw, 0.01), unit: 'm³',
    explanation: `${hu(area)} m² × ${hu(f.gravelBedThickness / 1000, 3)} m × ${hu(BED_COMPACTION)} tömörítés = ${hu(bedRaw, 3)} m³ → ${hu(ceilTo(bedRaw, 0.01))} m³`,
  });

  if (f.peFoil) {
    const waste = plan.settings.waste.foil;
    const foilArea = area * (1 + waste);
    const rolls = Math.ceil(foilArea / PE_ROLL_M2 - 1e-9);
    add({
      id: 'foundation.peFoil', name: 'PE fólia', quantity: rolls, unit: 'tekercs',
      explanation: `${hu(area)} m² × ${hu(1 + waste)} = ${hu(foilArea)} m² / ${PE_ROLL_M2} m² = ${hu(foilArea / PE_ROLL_M2, 3)} → ${rolls} tekercs`,
    });
  }

  const perimeter = 2 * (slabX + slabY) / 1000;
  const height = (f.slabThickness + FORMWORK_EXTRA) / 1000;
  const formRaw = perimeter * height;
  add({
    id: 'foundation.formwork', name: 'Zsaluzódeszka', quantity: ceilTo(formRaw, 0.1), unit: 'm²',
    explanation: `${hu(perimeter)} m kerület × ${hu(height, 3)} m = ${hu(formRaw, 3)} m² → ${hu(ceilTo(formRaw, 0.1), 1)} m²`,
  });

  const stakes = Math.ceil(perimeter * 1000 / STAKE_SPACING - 1e-9);
  add({
    id: 'foundation.stakes', name: 'Zsaluzókaró', quantity: stakes, unit: 'db',
    explanation: `${hu(perimeter)} m kerület / ${hu(STAKE_SPACING / 1000)} m = ${hu(perimeter * 1000 / STAKE_SPACING)} → ${stakes} db`,
  });

  return res;
}
