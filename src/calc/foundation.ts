import type { Plan } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import {
  BED_COMPACTION, CEMENT_BAG_KG, CEMENT_KG_PER_M3, FORMWORK_EXTRA, GRAVEL_LOOSE_T_PER_M3,
  GRAVEL_T_PER_M3, MESH_SHEET, MESH_TYPES, PE_ROLL_M2, STAKE_SPACING, WATER_L_PER_M3,
} from '../catalog';
import { ceilTo, emptyResult, hu } from './util';

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

export function calcFoundation(plan: Plan): ModuleResult {
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

  add({
    id: 'foundation.concrete', name: 'Beton', quantity: ceilTo(vol, 0.01), unit: 'm³',
    explanation: `${dims}; ${hu(area)} m² × ${hu(t, 3)} m = ${hu(vol, 4)} m³ → ${hu(ceilTo(vol, 0.01))} m³`,
  });

  const kgPerM3 = CEMENT_KG_PER_M3[f.concreteGrade];
  const cementRaw = vol * kgPerM3;
  const cementKg = Math.ceil(cementRaw - 1e-9);
  const bags = Math.ceil(cementKg / CEMENT_BAG_KG - 1e-9);
  add({
    id: 'foundation.cement', name: `Cement (${f.concreteGrade})`, quantity: cementKg, unit: 'kg',
    secondary: `${bags} zsák (${CEMENT_BAG_KG} kg)`,
    explanation: `${hu(area)} m² × ${hu(t, 3)} m = ${hu(vol, 4)} m³ beton × ${kgPerM3} kg/m³ = ${hu(cementRaw)} kg → ${cementKg} kg`,
  });
  add({
    id: 'foundation.cementBags', name: `Cement zsák (${CEMENT_BAG_KG} kg)`, quantity: bags, unit: 'zsák',
    explanation: `${cementKg} kg / ${CEMENT_BAG_KG} kg = ${hu(cementKg / CEMENT_BAG_KG)} → ${bags} zsák`,
  });

  const gravelT = vol * GRAVEL_T_PER_M3;
  const gravelLoose = gravelT / GRAVEL_LOOSE_T_PER_M3;
  add({
    id: 'foundation.gravel', name: 'Betonsóder 0/16', quantity: ceilTo(gravelT, 0.01), unit: 't',
    secondary: `${hu(ceilTo(gravelLoose, 0.01))} m³ laza`,
    explanation: `${hu(vol, 4)} m³ beton × ${hu(GRAVEL_T_PER_M3)} t/m³ = ${hu(gravelT, 3)} t → ${hu(ceilTo(gravelT, 0.01))} t; laza térfogat: ${hu(gravelT, 3)} t / ${hu(GRAVEL_LOOSE_T_PER_M3)} t/m³ = ${hu(gravelLoose, 3)} m³`,
  });

  const waterRaw = vol * WATER_L_PER_M3;
  const water = Math.ceil(waterRaw - 1e-9);
  add({
    id: 'foundation.water', name: 'Víz (tájékoztató)', quantity: water, unit: 'l',
    explanation: `${hu(vol, 4)} m³ × ${WATER_L_PER_M3} l/m³ = ${hu(waterRaw)} l → ${water} l`,
  });

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
