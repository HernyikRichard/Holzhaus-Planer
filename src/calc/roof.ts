import type { Plan, RoofCovering } from '../model/types';
import type { MaterialLine, ModuleResult } from './types';
import {
  BATTEN_GAUGE, EPDM_UPTURN, MIN_PITCH, OSB_SHEET, RAFTER_MAX_SPAN, SHINGLE_PACK_M2,
  TILE_CLIP_EAVE_SPACING, TILE_CLIP_RAKE_SPACING, TILE_PER_M2, TRAPEZOID_EFFECTIVE_W, UNDERLAY_ROLL_M2, UNDERLAY_WASTE,
} from '../catalog';
import { ceilTo, emptyResult, hu, sectionKey, sectionLabel } from './util';
import { roofGeometry } from './geometry';
import { roofElements } from '../scene/roofFrame';
import { elementsToPieces } from '../scene/toPieces';
import { missingSupplyWarning, type Supply } from '../pricing/supplyTypes';

const OSB_AREA = (OSB_SHEET.w / 1000) * (OSB_SHEET.l / 1000);
const COVERING_HU: Record<RoofCovering, string> = {
  tile: 'Cserép', trapezoid: 'Trapézlemez', shingle: 'Bitumenes zsindely', epdm: 'EPDM gumilemez',
};

/** Tárgyesetű név a javaslathoz („Válassz …”). */
const COVERING_ACC: Record<RoofCovering, string> = {
  tile: 'cserepet', trapezoid: 'trapézlemezt', shingle: 'zsindelyt', epdm: 'EPDM-et',
};
/** Névelő: magánhangzó előtt „Az”. */
const article = (word: string): string => (/^[aáeéiíoóöőuúüű]/i.test(word) ? 'Az' : 'A');

/** Héjazat–hajlás ellenőrzés: ha a hajlás a héjazat minimuma alatt van, a figyelmeztetés a megfelelő héjazatokkal; különben null. */
export function pitchWarning(plan: Plan): string | null {
  const { covering, pitch } = plan.roof;
  const min = MIN_PITCH[covering];
  if (!(pitch < min)) return null;
  const name = COVERING_HU[covering].toLowerCase();
  const ok = (Object.keys(MIN_PITCH) as RoofCovering[])
    .filter(c => MIN_PITCH[c] <= pitch)
    .sort((a, b) => MIN_PITCH[a] - MIN_PITCH[b])
    .map(c => COVERING_ACC[c]);
  const list = ok.length > 1 ? `${ok.slice(0, -1).join(', ')} vagy ${ok[ok.length - 1]}` : ok[0];
  return `${article(name)} ${name} legalább ${hu(min)}°-os tetőhajlást igényel (most ${hu(pitch)}°). Válassz ${list}, vagy növeld a hajlást.`;
}

export function calcRoofStructure(plan: Plan): ModuleResult {
  const res = emptyResult();
  const g = roofGeometry(plan);
  const section = plan.roof.rafterSection;
  const scene = roofElements(plan);
  res.pieces = elementsToPieces(scene.elements.filter(e => e.kind === 'rafter' || e.kind === 'ridge' || e.kind === 'collar'));
  const rafters = g.raftersPerPlane * g.planes;
  const pairs = g.shape === 'gable' ? Math.ceil(g.raftersPerPlane / 2) : 0;
  const key = sectionKey(section);
  const max = RAFTER_MAX_SPAN[key];
  if (max === undefined) {
    res.warnings.push(`A ${sectionLabel(section)} szarufa-keresztmetszethez nincs megengedett fesztáv a katalógusban, a fesztáv nem ellenőrizhető (nem statikai méretezés).`);
  } else if (g.horizontalSpan > max) {
    res.warnings.push(`A szarufa alátámasztás nélküli vízszintes fesztávja (${hu(g.horizontalSpan / 1000)} m) meghaladja a ${sectionLabel(section)} keresztmetszet katalógusban szereplő határát (${hu(max / 1000)} m). Ez csak jelzés, nem statikai méretezés.`);
  }
  res.stats.rafters = rafters;
  res.stats.collarPairs = pairs;
  res.stats.frameScrewCount = scene.fasteners.filter(f => f.kind === 'frameScrew').reduce((s, f) => s + f.count, 0);
  res.stats.hurricaneTieCount = scene.fasteners.filter(f => f.kind === 'hurricaneTie').reduce((s, f) => s + f.count, 0);
  return res;
}

export function calcRoofLayers(plan: Plan, supply?: Supply): ModuleResult {
  const res = emptyResult();
  const g = roofGeometry(plan);
  const { covering, layers } = plan.roof;
  const { sheet: sw, tile: tw } = plan.settings.waste;
  const A = g.planeArea * g.planes;
  const areaTxt = `${hu(g.planeArea, 3)} m² × ${g.planes} tetősík = ${hu(A, 3)} m²`;
  const add = (l: Omit<MaterialLine, 'category'>): void => {
    res.lines.push({ category: 'Tető', ...l });
  };
  const layer = (kind: string) => layers.find(l => l.kind === kind);
  const forced = covering === 'shingle' || covering === 'epdm';
  const noBattens = forced;
  const pw = pitchWarning(plan);
  if (pw) res.warnings.push(pw);

  // Deszkázat / OSB
  const decking = layer('decking');
  if (decking && (decking.enabled || forced)) {
    const warnings: string[] = [];
    if (!decking.enabled) {
      warnings.push(`A ${COVERING_HU[covering].toLowerCase()} alá kötelező a deszkázat, ezért automatikusan bekapcsoltuk.`);
    }
    const need = A * (1 + sw);
    if (decking.material === 'osb') {
      const qty = Math.ceil(need / OSB_AREA - 1e-9);
      add({
        id: 'roof.decking', name: 'OSB lap (tető)', quantity: qty, unit: 'tábla',
        explanation: `${areaTxt}; × ${hu(1 + sw)} = ${hu(need, 3)} m² / ${hu(OSB_AREA, 4)} m² = ${hu(need / OSB_AREA, 3)} → ${qty} tábla`,
        ...(warnings.length ? { warnings } : {}),
      });
      res.stats.osbSheets = qty;
    } else {
      const qty = ceilTo(need, 0.1);
      add({
        id: 'roof.decking', name: 'Tetődeszkázat', quantity: qty, unit: 'm²',
        explanation: `${areaTxt}; × ${hu(1 + sw)} = ${hu(need, 3)} m² → ${hu(qty, 1)} m²`,
        ...(warnings.length ? { warnings } : {}),
      });
    }
  }

  // Alátét
  const underlay = layer('underlay');
  if (underlay?.enabled) {
    const mat = underlay.material === 'bitumen' ? 'bitumen' : 'foil';
    const sRoll = mat === 'foil' ? supply?.foilRoll('underlay') ?? null : null;
    const roll = sRoll ?? UNDERLAY_ROLL_M2[mat];
    const need = A * (1 + UNDERLAY_WASTE);
    const qty = Math.ceil(need / roll - 1e-9);
    add({
      id: 'roof.underlay', name: mat === 'bitumen' ? 'Bitumenes lemez' : 'Alátétfólia', quantity: qty, unit: 'tekercs', unitM2: roll, needM2: need,
      explanation: `${areaTxt}; × ${hu(1 + UNDERLAY_WASTE)} = ${hu(need, 3)} m² / ${roll} m² = ${hu(need / roll, 3)} → ${qty} tekercs`,
      ...(supply && mat === 'foil' && sRoll === null ? { warnings: [missingSupplyWarning('alátétfólia')] } : {}),
    });
  }

  // Ellenléc
  const rafters = g.raftersPerPlane * g.planes;
  const scene = roofElements(plan);
  if (!noBattens && layer('counterBatten')?.enabled) {
    res.pieces.push(...elementsToPieces(scene.elements.filter(e => e.kind === 'counterBatten')));
    res.stats.counterBattenLength = Math.round(rafters * g.rafterLength);
  }

  // Tetőléc
  if (!noBattens && layer('batten')?.enabled) {
    const gauge = BATTEN_GAUGE[covering];
    if (gauge !== undefined) {
      const rows = Math.ceil(g.rafterLength / gauge - 1e-9) + 1;
      res.pieces.push(...elementsToPieces(scene.elements.filter(e => e.kind === 'roofBatten')));
      res.stats.battenCrossings = rows * g.raftersPerPlane * g.planes;
    }
  }

  // Héjazat
  switch (covering) {
    case 'tile': {
      const need = A * TILE_PER_M2 * (1 + tw);
      const qty = Math.ceil(need - 1e-9);
      add({
        id: 'roof.tiles', name: 'Cserép', quantity: qty, unit: 'db',
        explanation: `${areaTxt}; × ${TILE_PER_M2} db/m² × ${hu(1 + tw)} = ${hu(need)} → ${qty} db`,
      });
      res.stats.tileClips = Math.ceil(
        (g.eaveCount * g.roofLengthAlongRidge) / TILE_CLIP_EAVE_SPACING + (g.rakeEdges * g.rafterLength) / TILE_CLIP_RAKE_SPACING - 1e-9);
      break;
    }
    case 'trapezoid': {
      const perPlane = Math.ceil(g.roofLengthAlongRidge / TRAPEZOID_EFFECTIVE_W - 1e-9);
      const qty = perPlane * g.planes;
      add({
        id: 'roof.trapezoid', name: 'Trapézlemez', quantity: qty, unit: 'db', needM2: A,
        alongRidge: g.roofLengthAlongRidge, rafterLength: g.rafterLength, planes: g.planes,
        secondary: `táblahossz ${hu(g.rafterLength / 1000)} m, ${hu(A, 1)} m²`,
        explanation: `Tetősíkonként ⌈${hu(g.roofLengthAlongRidge / 1000)} m / ${hu(TRAPEZOID_EFFECTIVE_W / 1000)} m⌉ = ${perPlane} tábla × ${g.planes} tetősík = ${qty} tábla`,
      });
      break;
    }
    case 'shingle': {
      const need = A * (1 + sw);
      const qty = Math.ceil(need / SHINGLE_PACK_M2 - 1e-9);
      add({
        id: 'roof.shingles', name: 'Bitumenes zsindely', quantity: qty, unit: 'csomag', unitM2: SHINGLE_PACK_M2, needM2: need,
        explanation: `${areaTxt}; × ${hu(1 + sw)} = ${hu(need, 3)} m² / ${SHINGLE_PACK_M2} m² = ${hu(need / SHINGLE_PACK_M2, 3)} → ${qty} csomag`,
      });
      break;
    }
    case 'epdm': {
      const perimeter = 2 * (plan.building.width + plan.building.length) / 1000;
      const upturn = perimeter * EPDM_UPTURN / 1000;
      const need = (A + upturn) * (1 + sw);
      const qty = ceilTo(need, 0.1);
      add({
        id: 'roof.epdm', name: 'EPDM gumilemez', quantity: qty, unit: 'm²',
        explanation: `(${hu(A, 3)} m² + ${hu(perimeter)} m kerület × ${hu(EPDM_UPTURN / 1000)} m felhajtás) × ${hu(1 + sw)} = ${hu(need, 3)} m² → ${hu(qty, 1)} m²`,
      });
      break;
    }
  }
  return res;
}
