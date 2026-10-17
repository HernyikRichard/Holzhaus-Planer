import type { FoundationType, Mm, PierKind, Plan } from '../model/types';
import type { MaterialLine } from './types';
import {
  CEMENT_BAG_KG, CEMENT_KG_PER_M3, GRAVEL_LOOSE_T_PER_M3, GRAVEL_T_PER_M3, GROUND_SCREW_LABEL, LONG_BARS_PER_SUPPORT,
  PIER_FILL_M3_PER_ROW, PIER_ROW_H, PIER_TUBE_D, PIER_TUBE_EMBED, REBAR_BAR_LENGTH, REBAR_COVER, REBAR_KG_PER_M,
  STIRRUP_SPACING, WATER_L_PER_M3,
} from '../catalog';
import { ceilTo, hu } from './util';
import type { FrameLayout } from './frame';
import { frameLayout } from './frame';

export interface SupportQuantities {
  count: number;
  concreteM3: number;            // talpak + pillérkitöltés (kerekítés előtt)
  footingM3: number;             // csak a talpak (földkiemeléshez)
  rebar10Mm: Mm; rebar6Mm: Mm;   // összes hossz
  longBarMm: Mm; stirrupsPerSupport: number; // támaszonként
  pierRows: number;              // zsalukő-sorok támaszonként (0, ha nincs)
  tubeMm: Mm;                    // összes zsalucső-hossz (0, ha nincs)
  footStirrups: number; pierStirrups: number;        // kengyelek támaszonként a talpban / a pillérben
  footStirrupMm: Mm; pierStirrupMm: Mm;              // egy kengyel hossza (a pillérnél 0, ha nincs)
}

export interface SupportSpec {
  type: Exclude<FoundationType, 'slab'>;
  label: string;                 // „Talajcsavar” | „Pontalap” | „Betonpillér”
  stepTitle: string;             // „Támaszok” | „Pontalapok” | „Betonpillérek”
  lines(plan: Plan, layout: FrameLayout): MaterialLine[];
}

/**
 * A beton-sorok (beton, cement, zsák, sóder, víz) a térfogatból; a betonlemez és a pontalap/pillér közös képlete.
 * `concreteSrc` / `cementSrc`: a térfogat levezetése a magyarázatban („… = x m³”).
 */
export function concreteLines(plan: Plan, vol: number, concreteSrc: string, cementSrc: string): MaterialLine[] {
  const f = plan.foundation;
  const out: MaterialLine[] = [];
  const add = (l: Omit<MaterialLine, 'category'>): void => { out.push({ category: 'Alap', ...l }); };
  add({
    id: 'foundation.concrete', name: 'Beton', quantity: ceilTo(vol, 0.01), unit: 'm³',
    explanation: `${concreteSrc} → ${hu(ceilTo(vol, 0.01))} m³`,
  });
  const kgPerM3 = CEMENT_KG_PER_M3[f.concreteGrade];
  const cementRaw = vol * kgPerM3;
  const cementKg = Math.ceil(cementRaw - 1e-9);
  const bags = Math.ceil(cementKg / CEMENT_BAG_KG - 1e-9);
  add({
    id: 'foundation.cement', name: `Cement (${f.concreteGrade})`, quantity: cementKg, unit: 'kg',
    secondary: `${bags} zsák (${CEMENT_BAG_KG} kg)`,
    explanation: `${cementSrc} beton × ${kgPerM3} kg/m³ = ${hu(cementRaw)} kg → ${cementKg} kg`,
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
  return out;
}

/** A pillér vasalandó keresztmetszetének oldala (mm); zsalucsőnél a Ø-be írt négyzet. */
function pierSide(kind: PierKind): Mm {
  if (kind === 'block200') return 200;
  if (kind === 'block250') return 250;
  return Math.round(PIER_TUBE_D / Math.SQRT2);
}

/** A pillér megnevezése a rajzokon és a buborékban: „25×25 cm-es zsalukő pillér” / „Ø20 cm-es zsalucső pillér”. */
export function pierDesc(kind: PierKind): string {
  if (kind === 'tube200') return `Ø${PIER_TUBE_D / 10} cm-es zsalucső pillér`;
  const s = kind === 'block200' ? 20 : 25;
  return `${s}×${s} cm-es zsalukő pillér`;
}

/** A pillér befoglaló oldala a rajzon (zsalucsőnél az átmérő). */
export function pierWidth(kind: PierKind): Mm {
  return kind === 'tube200' ? PIER_TUBE_D : kind === 'block200' ? 200 : 250;
}

/** Egy Ø6-os kengyel hossza: a belső oldal (legalább 100 mm) négyszerese + 100 mm átfedés. */
const stirrupLen = (side: Mm): Mm => 4 * Math.max(side - 2 * REBAR_COVER, 100) + 100;

/** Pontalap / betonpillér: a támaszok mennyiségei (a rajz, a 3D és az anyaglista közös forrása). */
export function supportQuantities(plan: Plan): SupportQuantities {
  const f = plan.foundation;
  const layout = frameLayout(plan);
  const count = layout.beamAxes.length * layout.supportAxes.length;
  const gc = f.frame.groundClearance;
  const pier = f.type === 'concretePier';
  const { size, depth } = f.footing;
  const longBarMm = pier ? depth - REBAR_COVER + gc - REBAR_COVER : depth - 2 * REBAR_COVER;
  const stirrupsPerSupport = Math.floor(longBarMm / STIRRUP_SPACING) + 1;
  const pierStirrups = pier ? Math.min(stirrupsPerSupport, Math.floor((gc - REBAR_COVER) / STIRRUP_SPACING)) : 0;
  const footStirrups = stirrupsPerSupport - pierStirrups;
  const footStirrupMm = stirrupLen(size);
  const pierStirrupMm = pier ? stirrupLen(pierSide(f.pier.kind)) : 0;
  const stirrupMm = footStirrups * footStirrupMm + pierStirrups * pierStirrupMm;
  const footingM3 = count * (size / 1000) ** 2 * (depth / 1000);
  const tube = pier && f.pier.kind === 'tube200';
  const pierRows = pier && !tube ? Math.ceil(gc / PIER_ROW_H - 1e-9) : 0;
  let fillM3 = 0;
  if (pier) {
    fillM3 = tube
      ? count * Math.PI * (PIER_TUBE_D / 2000) ** 2 * (gc / 1000)
      : count * pierRows * PIER_FILL_M3_PER_ROW[f.pier.kind as 'block200' | 'block250'];
  }
  return {
    count, concreteM3: footingM3 + fillM3, footingM3,
    rebar10Mm: count * LONG_BARS_PER_SUPPORT * longBarMm, rebar6Mm: count * stirrupMm,
    longBarMm, stirrupsPerSupport, pierRows, tubeMm: tube ? count * (gc + PIER_TUBE_EMBED) : 0,
    footStirrups, pierStirrups, footStirrupMm, pierStirrupMm,
  };
}

const COUNT_EXPL = (l: FrameLayout, n: number): string => `${l.beamAxes.length} főgerenda × ${l.supportAxes.length} támasz = ${n} db`;

function groundScrewLines(plan: Plan, f: FrameLayout): MaterialLine[] {
  const gs = plan.foundation.groundScrew;
  const supports = f.beamAxes.length * f.supportAxes.length;
  return [
    {
      category: 'Alap', unit: 'db',
      id: 'foundation.groundScrew', name: GROUND_SCREW_LABEL(gs.diameter, gs.length), quantity: supports,
      explanation: COUNT_EXPL(f, supports),
    },
    {
      category: 'Alap', unit: 'db',
      id: 'foundation.screwHead', name: `Állítható U-fej ${f.beam.width} mm-es gerendához`, quantity: supports,
      explanation: `támaszonként 1 db = ${supports} db`,
    },
  ];
}

function concretePartLines(plan: Plan, layout: FrameLayout): MaterialLine[] {
  const f = plan.foundation;
  const q = supportQuantities(plan);
  const { size, depth } = f.footing;
  const m = (mm: number): string => hu(mm / 1000);
  const footSrc = `${q.count} talp × ${m(size)} × ${m(size)} × ${m(depth)} m = ${hu(q.footingM3, 4)} m³`;
  const concreteSrc = f.type === 'concretePier'
    ? `${footSrc} + pillérek kitöltése ${hu(q.concreteM3 - q.footingM3, 4)} m³ = ${hu(q.concreteM3, 4)} m³`
    : footSrc;
  const out = concreteLines(plan, q.concreteM3, concreteSrc, concreteSrc);
  const add = (l: Omit<MaterialLine, 'category'>): void => { out.push({ category: 'Alap', ...l }); };

  const bars = (id: string, name: string, totalMm: number, kgPerM: number, expl: string): void => {
    const sticks = Math.ceil(totalMm / REBAR_BAR_LENGTH - 1e-9);
    const fm = totalMm / 1000;
    add({
      id, name, quantity: sticks, unit: 'szál', secondary: `${hu(fm, 1)} fm, ${hu(fm * kgPerM)} kg`,
      explanation: `${expl} = ${hu(fm, 2)} m / ${hu(REBAR_BAR_LENGTH / 1000)} m = ${hu(fm / (REBAR_BAR_LENGTH / 1000), 2)} → ${sticks} szál; ${hu(kgPerM, 3)} kg/m`,
    });
  };
  bars('foundation.rebar10', `Betonacél Ø10 (${REBAR_BAR_LENGTH / 1000} m-es szál)`, q.rebar10Mm, REBAR_KG_PER_M.d10,
    `${q.count} támasz × ${LONG_BARS_PER_SUPPORT} hosszvas × ${hu(q.longBarMm / 1000)} m`);
  bars('foundation.rebar6', `Betonacél Ø6 (${REBAR_BAR_LENGTH / 1000} m-es szál), kengyel`, q.rebar6Mm, REBAR_KG_PER_M.d6,
    q.pierStirrups > 0
      ? `${q.count} támasz × (${q.footStirrups} talp-kengyel × ${hu(q.footStirrupMm / 1000)} m + ${q.pierStirrups} pillér-kengyel × ${hu(q.pierStirrupMm / 1000)} m) (${hu(STIRRUP_SPACING / 1000)} m-enként)`
      : `${q.count} támasz × ${q.stirrupsPerSupport} kengyel (${hu(STIRRUP_SPACING / 1000)} m-enként) × ${hu(q.footStirrupMm / 1000)} m`);

  if (f.type === 'padFooting') {
    add({
      id: 'foundation.postBase', name: 'Állítható oszloptalp U-fejjel, betonba ágyazható', quantity: q.count, unit: 'db',
      explanation: COUNT_EXPL(layout, q.count),
    });
  } else {
    const kind = f.pier.kind;
    if (kind === 'tube200') {
      const len = ceilTo(q.tubeMm / 1000, 0.1);
      add({
        id: 'foundation.pierTube', name: `Zsalucső Ø${PIER_TUBE_D / 10} cm`, quantity: len, unit: 'm',
        explanation: `${q.count} támasz × (${hu(f.frame.groundClearance / 1000)} m + ${hu(PIER_TUBE_EMBED / 1000)} m beágyazás) = ${hu(q.tubeMm / 1000, 2)} m → ${hu(len, 1)} m`,
      });
    } else {
      const side = kind === 'block200' ? 20 : 25;
      add({
        id: 'foundation.pierBlock', name: `Zsalukő ${side} cm-es pillérhez`, quantity: q.count * q.pierRows, unit: 'db',
        explanation: `${q.count} támasz × ${q.pierRows} sor (${hu(f.frame.groundClearance / 1000)} m / ${hu(PIER_ROW_H / 1000)} m, felfelé) = ${q.count * q.pierRows} db`,
      });
    }
    add({
      id: 'foundation.pierBracket', name: 'Gerendapapucs 2 db betoncsavarral', quantity: q.count, unit: 'db',
      explanation: `támaszonként 1 db = ${q.count} db`,
    });
  }
  add({
    id: 'foundation.excavation', name: 'Földkiemelés (tájékoztató)', quantity: ceilTo(q.footingM3, 0.01), unit: 'm³',
    explanation: `${footSrc} → ${hu(ceilTo(q.footingM3, 0.01))} m³`,
  });
  return out;
}

const SPECS: Record<Exclude<FoundationType, 'slab'>, SupportSpec> = {
  groundScrew: { type: 'groundScrew', label: 'Talajcsavar', stepTitle: 'Támaszok', lines: groundScrewLines },
  padFooting: { type: 'padFooting', label: 'Pontalap', stepTitle: 'Pontalapok', lines: concretePartLines },
  concretePier: { type: 'concretePier', label: 'Betonpillér', stepTitle: 'Betonpillérek', lines: concretePartLines },
};

/** A gerendakeretes alap támaszának leírója (a `hasFrame` terveken). */
export function supportSpec(plan: Plan): SupportSpec {
  const t = plan.foundation.type;
  if (t === 'slab') throw new Error('A betonlemeznek nincs támasza.');
  return SPECS[t];
}
