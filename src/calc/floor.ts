import type { Plan } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import { FOIL_ROLL_M2, INSULATION_PACK_M2, OSB_TG_SHEET } from '../catalog';
import { emptyResult, hu } from './util';
import { floorElements } from '../scene/misc';
import { elementsToPieces } from '../scene/toPieces';

export function calcFloor(plan: Plan): ModuleResult {
  const res = emptyResult();
  const fl = plan.floor;
  if (!fl.enabled) return res;
  const wall = plan.walls.studSection.w;
  const innerX = plan.building.width - 2 * wall;
  const innerY = plan.building.length - 2 * wall;
  const area = (innerX / 1000) * (innerY / 1000);
  const dims = `${hu(innerX / 1000)} × ${hu(innerY / 1000)} m = ${hu(area)} m²`;
  const add = (l: Omit<MaterialLine, 'category'>): void => {
    res.lines.push({ category: 'Padló', ...l });
  };

  res.pieces = elementsToPieces(floorElements(plan));

  const sheetWaste = plan.settings.waste.sheet;
  if (fl.insulation) {
    const { type, thickness } = fl.insulation;
    const pack = INSULATION_PACK_M2[type][thickness];
    const factor = 1 - fl.joistSection.t / fl.joistSpacing;
    const need = area * factor * (1 + sheetWaste);
    const packs = Math.ceil(need / pack - 1e-9);
    add({
      id: 'floor.insulation',
      name: `Padló hőszigetelés (${type === 'xps' ? 'XPS' : 'ásványgyapot'}, ${thickness} mm)`,
      quantity: packs, unit: 'csomag',
      explanation: `${hu(area)} m² × (1 − ${fl.joistSection.t}/${fl.joistSpacing}) × ${hu(1 + sheetWaste)} = ${hu(need)} m² / ${hu(pack)} m² = ${hu(need / pack, 3)} → ${packs} csomag`,
    });
  }

  const sheetArea = (OSB_TG_SHEET.w / 1000) * (OSB_TG_SHEET.l / 1000);
  const osbNeed = area * (1 + sheetWaste);
  const osb = Math.ceil(osbNeed / sheetArea - 1e-9);
  add({
    id: 'floor.osb', name: `OSB nútféderes padlólap (${fl.osbThickness} mm)`, quantity: osb, unit: 'tábla',
    explanation: `${hu(area)} m² × ${hu(1 + sheetWaste)} = ${hu(osbNeed)} m² / ${hu(sheetArea, 4)} m² = ${hu(osbNeed / sheetArea, 3)} → ${osb} tábla`,
  });
  res.stats.osbSheets = osb;

  if (fl.vaporBarrier) {
    const fw = plan.settings.waste.foil;
    const need = area * (1 + fw);
    const rolls = Math.ceil(need / FOIL_ROLL_M2 - 1e-9);
    add({
      id: 'floor.vaporBarrier', name: 'Párazáró fólia', quantity: rolls, unit: 'tekercs',
      explanation: `${hu(area)} m² × ${hu(1 + fw)} = ${hu(need)} m² / ${FOIL_ROLL_M2} m² = ${hu(need / FOIL_ROLL_M2, 3)} → ${rolls} tekercs`,
    });
  }
  return res;
}
