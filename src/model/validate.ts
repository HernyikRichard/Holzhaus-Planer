import { formatCm } from '../ui/format';
import type { FoundationType, Plan, RoofShape } from './types';
import { openingEndMargin, studLengthAt, wallGeometry } from '../calc/geometry';

export interface ValidationError { path: string; message: string }

const PITCH_RANGE: Record<RoofShape, [number, number]> = {
  flat: [1, 10], mono: [5, 45], gable: [10, 60],
};

// a talaj feletti magasság típusfüggő: pontalapnál az állítható oszloptalp tartománya (betonlemeznél nem számít)
const GROUND_CLEARANCE_RANGE: Record<FoundationType, [number, number]> = {
  slab: [150, 800], groundScrew: [150, 800], padFooting: [150, 300], concretePier: [150, 800],
};

export function validatePlan(plan: Plan): ValidationError[] {
  const errors: ValidationError[] = [];
  const range = (path: string, label: string, v: number, min: number, max: number, unit = 'mm') => {
    if (!Number.isFinite(v) || v < min || v > max) {
      errors.push({ path, message: `${label}: ${min}–${max} ${unit} közötti érték szükséges.` });
    }
  };
  range('building.width', 'Szélesség', plan.building.width, 1000, 12000);
  range('building.length', 'Hosszúság', plan.building.length, 1000, 12000);
  range('building.wallHeight', 'Falmagasság', plan.building.wallHeight, 1800, 4000);
  range('foundation.slabThickness', 'Lemezvastagság', plan.foundation.slabThickness, 50, 300);
  range('foundation.gravelBedThickness', 'Sóderágy vastagsága', plan.foundation.gravelBedThickness, 0, 500);
  const [gcMin, gcMax] = GROUND_CLEARANCE_RANGE[plan.foundation.type] ?? GROUND_CLEARANCE_RANGE.groundScrew;
  range('foundation.frame.groundClearance', 'Talaj feletti magasság', plan.foundation.frame.groundClearance, gcMin, gcMax);
  if (plan.foundation.type === 'padFooting' || plan.foundation.type === 'concretePier') {
    range('foundation.footing.depth', 'Alapmélység', plan.foundation.footing.depth, 600, 1200);
  }
  if (plan.foundation.frame.supportSpacing !== 'auto') {
    range('foundation.frame.supportSpacing', 'Támaszköz', plan.foundation.frame.supportSpacing, 800, 2500);
  }
  range('walls.studSpacing', 'Oszloptávolság', plan.walls.studSpacing, 300, 1000);
  range('floor.joistSpacing', 'Gerendatávolság', plan.floor.joistSpacing, 300, 1000);
  range('foundation.slabOverhang', 'Lemez túlnyúlása', plan.foundation.slabOverhang, 0, 500);
  const sectionRange = (path: string, label: string, s: { t: number; w: number }) => {
    range(`${path}.t`, `${label} vastagsága`, s.t, 30, 100);
    range(`${path}.w`, `${label} szélessége`, s.w, 50, 300);
  };
  sectionRange('walls.studSection', 'Oszlop', plan.walls.studSection);
  sectionRange('floor.joistSection', 'Padlógerenda', plan.floor.joistSection);
  sectionRange('roof.rafterSection', 'Szarufa', plan.roof.rafterSection);
  plan.walls.layers.forEach((l, i) => {
    if (l.kind === 'interiorCladding' || l.kind === 'exteriorCladding') {
      range(`walls.layers.${i}.thickness`, 'Rétegvastagság', l.thickness, 1, 300);
    }
  });
  for (const k of ['timber', 'sheet', 'foil', 'tile'] as const) {
    range(`settings.waste.${k}`, 'Ráhagyás', plan.settings.waste[k], 0, 0.5, '');
  }
  range('roof.rafterSpacing', 'Szarufatávolság', plan.roof.rafterSpacing, 300, 1200);
  const [pMin, pMax] = PITCH_RANGE[plan.roof.shape];
  range('roof.pitch', 'Tetőhajlás', plan.roof.pitch, pMin, pMax, '°');
  range('roof.eaveOverhang', 'Ereszkinyúlás', plan.roof.eaveOverhang, 0, 1000);
  range('roof.gableOverhang', 'Oromkinyúlás', plan.roof.gableOverhang, 0, 1000);

  const walls = wallGeometry(plan);
  const sw = plan.walls.studSection;
  plan.openings.forEach((o, i) => {
    const p = `openings.${i}`;
    const wall = walls.find((w) => w.side === o.wall);
    if (!wall) return;
    const margin = openingEndMargin(plan, wall);
    if (o.offset < margin) {
      errors.push({ path: `${p}.offset`, message: `A nyílás távolsága a faltól legalább ${formatCm(margin)} legyen.` });
    }
    if (o.offset + o.width > wall.length - margin) {
      errors.push({
        path: `${p}.offset`,
        message: `A nyílás nem fér el a falon (a fal hossza ${formatCm(wall.length)}, mindkét végén ${formatCm(margin)} szabad hely kell).`,
      });
    }
    range(`${p}.width`, 'Nyílás szélessége', o.width, 300, 3000);
    range(`${p}.height`, 'Nyílás magassága', o.height, 300, 2500);
    if (o.type === 'window' && !(o.sillHeight >= sw.t + 50)) {
      errors.push({ path: `${p}.sillHeight`, message: `Az ablak mellvédmagassága legalább ${sw.t + 50} mm legyen.` });
    }
    if (o.type === 'door' && o.sillHeight !== 0) {
      errors.push({ path: `${p}.sillHeight`, message: 'Az ajtó küszöbmagassága 0 mm.' });
    }
    const mid = Math.min(Math.max(o.offset + o.width / 2, 0), wall.length);
    const avail = studLengthAt(plan, wall, mid);
    if (o.sillHeight + o.height + sw.w > avail) {
      errors.push({
        path: `${p}.height`,
        message: `A nyílás túl magas a falhoz (legfeljebb ${Math.floor(avail - sw.w - o.sillHeight)} mm).`,
      });
    }
    for (let j = 0; j < i; j++) {
      const q = plan.openings[j];
      if (q.wall === o.wall && o.offset < q.offset + q.width && q.offset < o.offset + o.width) {
        errors.push({ path: `${p}.offset`, message: `A nyílás átfedi a(z) ${j + 1}. nyílást ugyanazon a falon.` });
      }
    }
  });
  return errors;
}
