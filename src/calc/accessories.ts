import type { Plan } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import {
  DOWNPIPE_CLIP_SPACING, DOWNPIPE_ELBOWS, DOWNPIPE_EXTRA, DOWNPIPE_PER_EAVE_M,
  GUTTER_BRACKET_SPACING, GUTTER_PIECE_LENGTH, RIDGE_TILES_PER_M,
} from '../catalog';
import { ceilTo, emptyResult, hu } from './util';
import { roofGeometry } from './geometry';
import { accessoryElements } from '../scene/misc';
import { elementsToPieces } from '../scene/toPieces';

export function calcAccessories(plan: Plan): ModuleResult {
  const res = emptyResult();
  const g = roofGeometry(plan);
  const acc = plan.accessories;
  const eave = g.roofLengthAlongRidge;
  const eaveM = eave / 1000;
  const add = (l: Omit<MaterialLine, 'category'>): void => {
    res.lines.push({ category: 'Kiegészítők', ...l });
  };

  if (acc.gutter) {
    const need = g.eaveCount * eaveM;
    const qty = ceilTo(need, 0.1);
    add({
      id: 'acc.gutter', name: 'Ereszcsatorna', quantity: qty, unit: 'm', eaveLength: eave, eaveCount: g.eaveCount,
      explanation: `${g.eaveCount} eresz × ${hu(eaveM)} m = ${hu(need, 3)} m → ${hu(qty, 1)} m`,
    });
    add({
      id: 'acc.gutterEnds', name: 'Ereszcsatorna végelem', quantity: 2 * g.eaveCount, unit: 'db',
      explanation: `Ereszenként 2 végelem × ${g.eaveCount} eresz = ${2 * g.eaveCount} db`,
    });
    const joinersPer = Math.max(0, Math.ceil(eave / GUTTER_PIECE_LENGTH - 1e-9) - 1);
    add({
      id: 'acc.gutterJoiners', name: 'Ereszcsatorna toldó', quantity: g.eaveCount * joinersPer, unit: 'db', eaveLength: eave, eaveCount: g.eaveCount,
      explanation: `Ereszenként max(0; ⌈${hu(eaveM)} m / ${hu(GUTTER_PIECE_LENGTH / 1000)} m⌉ − 1) = ${joinersPer} toldó × ${g.eaveCount} eresz = ${g.eaveCount * joinersPer} db`,
    });
    const per = Math.ceil(eave / GUTTER_BRACKET_SPACING - 1e-9) + 1;
    add({
      id: 'acc.gutterBrackets', name: 'Csatornatartó', quantity: g.eaveCount * per, unit: 'db',
      explanation: `Ereszenként ⌈${hu(eaveM)} m / ${hu(GUTTER_BRACKET_SPACING / 1000)} m⌉ + 1 = ${per} db × ${g.eaveCount} eresz = ${g.eaveCount * per} db`,
    });
  }

  if (acc.downpipe) {
    const perEave = Math.max(1, Math.ceil(eave / (DOWNPIPE_PER_EAVE_M * 1000) - 1e-9));
    const pipes = g.eaveCount * perEave;
    const len = plan.building.wallHeight + DOWNPIPE_EXTRA;
    const clipsPer = Math.ceil(len / DOWNPIPE_CLIP_SPACING - 1e-9);
    add({
      id: 'acc.downpipe', name: 'Lefolyócső', quantity: pipes, unit: 'db',
      secondary: `${hu(len / 1000)} m / db`,
      explanation: `Ereszenként max(1; ⌈${hu(eaveM)} m / ${DOWNPIPE_PER_EAVE_M} m⌉) = ${perEave} cső × ${g.eaveCount} eresz = ${pipes} db; hossz: eresz oldali falmagasság ${hu(plan.building.wallHeight / 1000)} m + ${hu(DOWNPIPE_EXTRA / 1000)} m = ${hu(len / 1000)} m`,
    });
    add({
      id: 'acc.downpipeElbows', name: 'Lefolyó könyök', quantity: DOWNPIPE_ELBOWS * pipes, unit: 'db',
      explanation: `${DOWNPIPE_ELBOWS} könyök × ${pipes} lefolyócső = ${DOWNPIPE_ELBOWS * pipes} db`,
    });
    add({
      id: 'acc.downpipeClips', name: 'Lefolyó bilincs', quantity: pipes * clipsPer, unit: 'db',
      explanation: `${pipes} lefolyócső × ⌈${hu(len / 1000)} m / ${hu(DOWNPIPE_CLIP_SPACING / 1000)} m⌉ = ${pipes} × ${clipsPer} = ${pipes * clipsPer} db`,
    });
  }

  res.pieces = elementsToPieces(accessoryElements(plan));

  if (g.shape === 'gable' && acc.ridgeTiles && plan.roof.covering === 'tile') {
    const rm = g.ridgeLength / 1000;
    const need = rm * RIDGE_TILES_PER_M;
    const qty = Math.ceil(need - 1e-9);
    add({
      id: 'acc.ridgeTiles', name: 'Gerinccserép', quantity: qty, unit: 'db',
      explanation: `${hu(rm)} m gerinchossz × ${hu(RIDGE_TILES_PER_M)} db/m = ${hu(need)} → ${qty} db`,
    });
  }
  if (g.shape === 'gable' && acc.ridgeVent) {
    const rm = g.ridgeLength / 1000;
    const qty = ceilTo(rm, 0.1);
    add({
      id: 'acc.ridgeVent', name: 'Gerincszellőző-szalag', quantity: qty, unit: 'm',
      explanation: `Gerinchossz ${hu(rm, 3)} m → ${hu(qty, 1)} m`,
    });
  }
  return res;
}
