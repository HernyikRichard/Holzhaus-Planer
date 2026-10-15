import type { Plan } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import { FOIL_ROLL_M2, INSULATION_PACK_M2, OSB_TG_SHEET } from '../catalog';
import { emptyResult, hu } from './util';
import { missingSupplyWarning, type Supply } from '../pricing/supply';
import { floorElements } from '../scene/misc';
import { elementsToPieces } from '../scene/toPieces';

export function calcFloor(plan: Plan, supply?: Supply): ModuleResult {
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
    const supplied = supply?.insulationPack(type, thickness) ?? null;
    const pack = supplied ?? INSULATION_PACK_M2[type][thickness];
    const warnings = supply && supplied === null
      ? [missingSupplyWarning(`${thickness} mm ${type === 'xps' ? 'XPS' : 'ásványgyapot'}`)] : [];
    const factor = 1 - fl.joistSection.t / fl.joistSpacing;
    const need = area * factor * (1 + sheetWaste);
    const packs = Math.ceil(need / pack - 1e-9);
    add({
      id: 'floor.insulation',
      name: `Padló hőszigetelés (${type === 'xps' ? 'XPS' : 'ásványgyapot'}, ${thickness} mm)`,
      quantity: packs, unit: 'csomag',
      explanation: `${hu(area)} m² × (1 − ${fl.joistSection.t}/${fl.joistSpacing}) × ${hu(1 + sheetWaste)} = ${hu(need)} m² / ${hu(pack)} m² = ${hu(need / pack, 3)} → ${packs} csomag`,
      ...(warnings.length ? { warnings } : {}),
    });
  }

  const tg = supply?.osbTgSheet(fl.osbThickness) ?? null;
  const tgSheet = tg ?? OSB_TG_SHEET;
  const osbWarnings = supply && !tg ? [missingSupplyWarning(`nútféderes OSB ${fl.osbThickness} mm`)] : [];
  const sheetArea = (tgSheet.w / 1000) * (tgSheet.l / 1000);
  const osbNeed = area * (1 + sheetWaste);
  const osb = Math.ceil(osbNeed / sheetArea - 1e-9);
  add({
    id: 'floor.osb', name: `OSB nútféderes padlólap (${fl.osbThickness} mm)`, quantity: osb, unit: 'tábla',
    explanation: `${hu(area)} m² × ${hu(1 + sheetWaste)} = ${hu(osbNeed)} m² / ${hu(sheetArea, 4)} m² = ${hu(osbNeed / sheetArea, 3)} → ${osb} tábla`,
    ...(osbWarnings.length ? { warnings: osbWarnings } : {}),
  });
  res.stats.osbSheets = osb;

  if (fl.vaporBarrier) {
    const fw = plan.settings.waste.foil;
    const need = area * (1 + fw);
    const sRoll = supply?.foilRoll('vapor') ?? null;
    const roll = sRoll ?? FOIL_ROLL_M2;
    const rolls = Math.ceil(need / roll - 1e-9);
    add({
      id: 'floor.vaporBarrier', name: 'Párazáró fólia', quantity: rolls, unit: 'tekercs',
      explanation: `${hu(area)} m² × ${hu(1 + fw)} = ${hu(need)} m² / ${roll} m² = ${hu(need / roll, 3)} → ${rolls} tekercs`,
      ...(supply && sRoll === null ? { warnings: [missingSupplyWarning('párazáró fólia')] } : {}),
    });
  }
  return res;
}
