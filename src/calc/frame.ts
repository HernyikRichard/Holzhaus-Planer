import type { FoundationType, Mm, Plan, Section } from '../model/types';
import { BEAM_MAX_SPAN, BEAM_SECTIONS, JOIST_MAX_SPAN, JOIST_SPAN_FALLBACK, SUPPORT_END_OFFSET } from '../catalog';
import { hu, sectionKey, sectionLabel } from './util';

export interface FrameLayout {
  along: 'x' | 'y';            // a főgerendák iránya (a full falpár iránya)
  L: Mm; W: Mm;                // L: a gerendákkal párhuzamos, W: rájuk merőleges épületméret
  beam: { width: Mm; height: Mm; plies: 1 | 2; ply: Section };
  beamAxes: Mm[];              // főgerenda-tengelyek W mentén (0-tól), növekvő
  supportAxes: Mm[];           // támasz-tengelyek L mentén, minden gerendán azonos
  joistPositions: Mm[];        // párnafák kezdő éle L mentén (az első 0, az utolsó L − joist.t)
  joistSpan: Mm; supportSpan: Mm; // tényleges max. tengelytávok
  z: { ground: 0; beamBottom: Mm; beamTop: Mm; joistTop: Mm; floorTop: Mm };
  warnings: string[];
}

const cm = (mm: Mm): string => hu(mm / 10, 1);

/** Egyenletes osztás: n köz a [from, from + span] szakaszon, egész mm-re kerekítve. */
function divide(from: Mm, span: Mm, n: number): Mm[] {
  return Array.from({ length: n + 1 }, (_, i) => Math.round(from + (i * span) / n));
}

function maxGap(a: Mm[]): Mm {
  let g = 0;
  for (let i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]);
  return g;
}

export function frameLayout(plan: Plan): FrameLayout {
  const { width, length } = plan.building;
  const { frame } = plan.foundation;
  const { joistSection, joistSpacing, osbThickness } = plan.floor;
  const warnings: string[] = [];
  const along: 'x' | 'y' = width >= length ? 'x' : 'y'; // egyezik a wallGeometry nsFull döntésével
  const L = along === 'x' ? width : length;
  const W = along === 'x' ? length : width;
  const { width: bw, height: bh, plies, ply } = BEAM_SECTIONS[frame.beamSection];

  // főgerenda-tengelyek: a párnafák fesztávja szabja meg a gerendák közét
  let maxJoist = JOIST_MAX_SPAN[sectionKey(joistSection)];
  if (maxJoist === undefined) {
    maxJoist = JOIST_SPAN_FALLBACK;
    warnings.push(`A(z) ${sectionLabel(joistSection)} padlógerendához nincs fesztávadat, ${cm(maxJoist)} cm-rel számoltunk.`);
  }
  const span0 = W - bw;
  const nb = Math.max(1, Math.ceil(span0 / maxJoist - 1e-9));
  const beamAxes = divide(bw / 2, span0, nb);

  // támasz-tengelyek a gerendák mentén
  const table = BEAM_MAX_SPAN[frame.beamSection];
  const limit = frame.supportSpacing === 'auto' ? table : frame.supportSpacing;
  if (frame.supportSpacing !== 'auto' && frame.supportSpacing > table) {
    warnings.push(`A megadott támaszköz (${cm(frame.supportSpacing)} cm) nagyobb a ${BEAM_SECTIONS[frame.beamSection].label} mm-es főgerendához ajánlott ${cm(table)} cm-nél.`);
  }
  const span1 = L - 2 * SUPPORT_END_OFFSET;
  const ns = Math.max(1, Math.ceil(span1 / limit - 1e-9));
  const supportAxes = divide(SUPPORT_END_OFFSET, span1, ns);

  // párnafák
  const nj = Math.ceil(L / joistSpacing - 1e-9);
  const joistPositions: Mm[] = [];
  for (let i = 0; i <= nj; i++) {
    const p = Math.min(i * joistSpacing, L - joistSection.t);
    if (!joistPositions.includes(p)) joistPositions.push(p);
  }

  const beamBottom = frame.groundClearance;
  const beamTop = beamBottom + bh;
  const joistTop = beamTop + joistSection.w;
  return {
    along, L, W, beam: { width: bw, height: bh, plies, ply },
    beamAxes, supportAxes, joistPositions,
    joistSpan: maxGap(beamAxes), supportSpan: maxGap(supportAxes),
    z: { ground: 0, beamBottom, beamTop, joistTop, floorTop: joistTop + osbThickness },
    warnings,
  };
}

/** Gerendakeretes-e az alap (talajcsavar, pontalap, betonpillér): támaszrács, főgerendák, padló a kereten. */
export function hasFrame(plan: Plan): boolean {
  return isFrameType(plan.foundation.type);
}

/** `hasFrame` típus szerint (ahol csak az alaptípus ismert). */
export function isFrameType(type: FoundationType): boolean {
  return type !== 'slab';
}

/** A padló számít-e: a kapcsoló, vagy gerendakeretes alapnál mindig. */
export function floorOn(plan: Plan): boolean {
  return hasFrame(plan) || plan.floor.enabled;
}

/** Keret (l a gerendák mentén, w rájuk merőlegesen) → világ (x, y). */
export function framePt(f: FrameLayout, l: Mm, w: Mm): [Mm, Mm] {
  return f.along === 'x' ? [l, w] : [w, l];
}
