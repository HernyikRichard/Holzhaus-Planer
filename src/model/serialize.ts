import type { Plan } from './types';
import { createDefaultPlan, DEFAULT_PRICING } from './defaults';

export const CURRENT_VERSION = 5;

/** MIGRATIONS[v] a v verziójú nyers adatot v+1 verzióra alakítja. */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  1: raw => ({ ...raw, version: 2, pricing: structuredClone(DEFAULT_PRICING) }),
  // v2 -> v3: betonlemez marad, a gerendakeret és a talajcsavar alapértéket kap
  2: raw => {
    const def = createDefaultPlan().foundation;
    const old = isPlainObject(raw.foundation) ? raw.foundation : {};
    return { ...raw, version: 3, foundation: { ...old, type: 'slab', frame: structuredClone(def.frame), groundScrew: structuredClone(def.groundScrew) } };
  },
  // v3 -> v4: a típus változatlan, a pontalap és a betonpillér mezői alapértéket kapnak
  3: raw => {
    const def = createDefaultPlan().foundation;
    const old = isPlainObject(raw.foundation) ? raw.foundation : {};
    return { ...raw, version: 4, foundation: { ...old, footing: structuredClone(def.footing), pier: structuredClone(def.pier) } };
  },
  // v4 -> v5: a típus változatlan, a sávalap és a lábazat mezői alapértéket kapnak
  4: raw => {
    const def = createDefaultPlan().foundation;
    const old = isPlainObject(raw.foundation) ? raw.foundation : {};
    return { ...raw, version: 5, foundation: { ...old, strip: structuredClone(def.strip), plinth: structuredClone(def.plinth) } };
  },
};

export type ParseResult = { ok: true; plan: Plan } | { ok: false; error: string };

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class FieldError extends Error {}

// A nullable mezők (az alapértelmezett érték objektum, de a fájlban null is lehet).
const NULLABLE_PATHS = new Set(['floor.insulation']);

// 'auto' vagy véges szám lehet (az alapérték 'auto' szöveg).
const AUTO_OR_NUMBER_PATHS = new Set(['foundation.frame.supportSpacing']);

// Nyílt térképek: a kulcsokat a fájlból vesszük át, az értékeket a checkShape ellenőrzi.
const OPEN_MAP_PATHS = new Set(['pricing.overrides', 'pricing.custom', 'pricing.productChoice']);

function merge(def: unknown, src: unknown, path: string): unknown {
  if (OPEN_MAP_PATHS.has(path)) {
    if (!isPlainObject(src)) throw new FieldError(`A(z) „${path}” mező értéke nem objektum.`);
    return structuredClone(src);
  }
  if (NULLABLE_PATHS.has(path) && src === null) return null;
  if (AUTO_OR_NUMBER_PATHS.has(path)) {
    if (src === 'auto' || (typeof src === 'number' && Number.isFinite(src))) return src;
    throw new FieldError(`A(z) „${path}” mező értéke érvénytelen típusú.`);
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(src)) throw new FieldError(`A(z) „${path}” mező értéke nem lista.`);
    return structuredClone(src);
  }
  if (isPlainObject(def)) {
    if (!isPlainObject(src)) throw new FieldError(`A(z) „${path}” mező értéke nem objektum.`);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(def)) {
      const p = path ? `${path}.${key}` : key;
      out[key] = key in src ? merge(def[key], src[key], p) : structuredClone(def[key]);
    }
    if (path === 'pricing' && 'shippingFee' in src) out.shippingFee = src.shippingFee;
    return out;
  }
  if (typeof src !== typeof def || (typeof src === 'number' && !Number.isFinite(src))) {
    throw new FieldError(`A(z) „${path}” mező értéke érvénytelen típusú.`);
  }
  return src;
}

const oneOf = (v: unknown, set: readonly unknown[]): boolean => set.includes(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

const WALL_KINDS = ['interiorCladding', 'vaporBarrier', 'insulation', 'osb', 'breatherMembrane', 'battens', 'exteriorCladding'];
const ROOF_KINDS = ['decking', 'underlay', 'counterBatten', 'batten'];
const WALL_MATERIALS: Record<string, string[]> = {
  interiorCladding: ['osb', 'gypsum', 'paneling'], exteriorCladding: ['paneling', 'boards', 'cementBoard'],
  osb: ['osb12', 'osb15'], insulation: ['mineralWool', 'xps'],
  vaporBarrier: ['default'], breatherMembrane: ['default'], battens: ['default'],
};
const ROOF_MATERIALS: Record<string, string[]> = {
  decking: ['osb', 'boards'], underlay: ['foil', 'bitumen'], counterBatten: ['default'], batten: ['default'],
};

type LayerCheck = { ok: true; sorted: unknown[] } | { ok: false; path: string };

function checkLayers(path: string, list: unknown[], kinds: string[], mats: Record<string, string[]>,
  thickness: boolean): LayerCheck {
  const byKind = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    const p = `${path}[${i}]`;
    if (!isPlainObject(l)) return { ok: false, path: p };
    if (typeof l.kind !== 'string' || !kinds.includes(l.kind) || byKind.has(l.kind)) return { ok: false, path: `${p}.kind` };
    if (typeof l.enabled !== 'boolean') return { ok: false, path: `${p}.enabled` };
    if (typeof l.material !== 'string' || !mats[l.kind].includes(l.material)) return { ok: false, path: `${p}.material` };
    if (thickness && !isNum(l.thickness)) return { ok: false, path: `${p}.thickness` };
    byKind.set(l.kind, l);
  }
  if (byKind.size !== kinds.length) return { ok: false, path };
  return { ok: true, sorted: kinds.map(k => byKind.get(k)) };
}

/** Felsorolások, tömbelemek ellenőrzése; az első hibás mező útvonalát adja, vagy null-t. A rétegeket az alap sorrendbe rendezi. */
function checkShape(plan: Plan): string | null {
  const checks: [string, boolean][] = [
    ['foundation.concreteGrade', oneOf(plan.foundation.concreteGrade, ['C16', 'C20'])],
    ['foundation.meshType', oneOf(plan.foundation.meshType, ['d4_150', 'd5_150', 'd6_150'])],
    ['foundation.type', oneOf(plan.foundation.type, ['slab', 'groundScrew', 'padFooting', 'concretePier', 'stripFooting'])],
    ['foundation.frame.beamSection', oneOf(plan.foundation.frame.beamSection, ['b100x150', 'b120x120', 'b2x50x150'])],
    ['foundation.groundScrew.length', oneOf(plan.foundation.groundScrew.length, [800, 1000, 1200])],
    ['foundation.groundScrew.diameter', oneOf(plan.foundation.groundScrew.diameter, [76])],
    ['foundation.footing.size', oneOf(plan.foundation.footing.size, [300, 400, 500])],
    ['foundation.pier.kind', oneOf(plan.foundation.pier.kind, ['block200', 'block250', 'tube200'])],
    ['foundation.strip.width', oneOf(plan.foundation.strip.width, [300, 400, 500])],
    ['foundation.plinth.block', oneOf(plan.foundation.plinth.block, ['block200', 'block250', 'block300'])],
    ['floor.osbThickness', oneOf(plan.floor.osbThickness, [18, 22])],
    ['walls.topPlate', oneOf(plan.walls.topPlate, ['single', 'double'])],
    ['roof.shape', oneOf(plan.roof.shape, ['flat', 'mono', 'gable'])],
    ['roof.covering', oneOf(plan.roof.covering, ['tile', 'trapezoid', 'shingle', 'epdm', 'standingSeam'])],
    ['roof.ridgeDirection', oneOf(plan.roof.ridgeDirection, ['x', 'y'])],
  ];
  const ins = plan.floor.insulation;
  if (ins !== null) {
    checks.push(['floor.insulation.type', oneOf(ins.type, ['mineralWool', 'xps'])]);
    checks.push(['floor.insulation.thickness', oneOf(ins.thickness, [50, 100, 150])]);
  }
  for (const [path, ok] of checks) if (!ok) return path;

  const pr = plan.pricing;
  for (const k of ['overrides', 'custom'] as const) {
    for (const [id, v] of Object.entries(pr[k])) if (!isNum(v) || (v as number) < 0) return `pricing.${k}.${id}`;
  }
  for (const [id, v] of Object.entries(pr.productChoice)) if (typeof v !== 'string') return `pricing.productChoice.${id}`;
  if (pr.shippingFee !== undefined && (!isNum(pr.shippingFee) || pr.shippingFee < 0)) return 'pricing.shippingFee';

  const sl = plan.settings.stockLengths;
  if (sl.length === 0 || !sl.every(v => isNum(v) && v >= 500)) return 'settings.stockLengths';

  for (let i = 0; i < plan.openings.length; i++) {
    const o = plan.openings[i] as unknown;
    const p = `openings[${i}]`;
    if (!isPlainObject(o)) return p;
    if (typeof o.id !== 'string') return `${p}.id`;
    if (!oneOf(o.type, ['door', 'window'])) return `${p}.type`;
    if (!oneOf(o.wall, ['N', 'E', 'S', 'W'])) return `${p}.wall`;
    if (!oneOf(o.swing, ['left', 'right'])) return `${p}.swing`;
    for (const k of ['offset', 'width', 'height', 'sillHeight']) if (!isNum(o[k])) return `${p}.${k}`;
  }

  const wl = checkLayers('walls.layers', plan.walls.layers, WALL_KINDS, WALL_MATERIALS, true);
  if (!wl.ok) return wl.path;
  const rl = checkLayers('roof.layers', plan.roof.layers, ROOF_KINDS, ROOF_MATERIALS, false);
  if (!rl.ok) return rl.path;
  plan.walls.layers = wl.sorted as Plan['walls']['layers'];
  plan.roof.layers = rl.sorted as Plan['roof']['layers'];
  return null;
}

export function parsePlan(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'A fájl nem érvényes JSON.' }; }
  if (!isPlainObject(raw)) return { ok: false, error: 'A fájl nem érvényes tervfájl.' };
  let version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'A fájlból hiányzik a verziószám.' };
  }
  if (version > CURRENT_VERSION) {
    return { ok: false, error: `A fájl egy újabb programverzióval készült (v${version}), ezt a verziót nem tudom betölteni.` };
  }
  let data: Record<string, unknown> = raw;
  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, error: `A fájl verziója (v${version}) nem támogatott.` };
    data = step(data);
    version += 1;
    data.version = version;
  }
  try {
    const plan = merge(createDefaultPlan(), data, '') as Plan;
    const bad = checkShape(plan);
    if (bad) return { ok: false, error: `Hibás érték: ${bad}` };
    return { ok: true, plan };
  } catch (e) {
    if (e instanceof FieldError) return { ok: false, error: e.message };
    throw e;
  }
}
