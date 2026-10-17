import type { Mm, Plan } from '../model/types';
import type { MaterialLine, TimberPiece } from '../calc/types';
import type { CalcOutput } from '../calc';
import { wallGeometry } from '../calc/geometry';
import { wallBattenPieces } from '../calc/walls';
import { elementsToPieces } from '../scene/toPieces';
import type { CutRef, Element, FastenerKind, Scene } from '../scene/types';
import { floorOn } from '../calc/frame';
import { DECKING_REQUIRED, FRAME_ANCHOR_LABEL, HURRICANE_TIE_LABEL } from '../catalog';
import { formatQty, sectionLabelWithUnit } from '../ui/format';
import { stepTodo } from './todo';

export type AssemblyStepId = 'foundation' | 'supports' | 'beamFrame' | 'floor' | 'wall.N' | 'wall.E' | 'wall.S' | 'wall.W' | 'wallTop'
  | 'roofFrame' | 'roofLayers' | 'covering' | 'accessories' | 'openings' | 'exterior' | 'interior';

export interface AssemblyPiece { label: string; section: string; length: Mm; count: number; elementIds: string[]; cut: string }
export interface AssemblyFastener { kind: FastenerKind; label: string; count: number; elementIds: string[] }
export interface AssemblyLine { lineId: string; name: string; quantity: number; unit: string }
export interface AssemblyStep {
  id: AssemblyStepId;
  index: number;                // a lépés helye a buildAssembly eredményében (0-tól)
  title: string;
  elementIds: string[];         // ennek a lépésnek a scene elemei
  lines: AssemblyLine[];        // nem-faanyag anyaglista-sorok
  /** Azonos darabok összevonva; a fali lécek (`wall.batten.<n>`) darab-id-je is az `elementIds`-ben van (nincs elemük). */
  pieces: AssemblyPiece[];
  fasteners: AssemblyFastener[]; // rajzolt rögzítési pontok fajtánként összegezve
  todo: string[];               // 3–6 rövid teendő (stepTodo)
}

export const ASSEMBLY_TITLES: Record<AssemblyStepId, string> = {
  foundation: 'Alap', supports: 'Támaszok', beamFrame: 'Gerendakeret', floor: 'Padló',
  'wall.N': 'Fal: É', 'wall.E': 'Fal: K', 'wall.S': 'Fal: D', 'wall.W': 'Fal: Ny',
  wallTop: 'Felső koszorú és fali OSB', roofFrame: 'Tetőváz', roofLayers: 'Tetőrétegek', covering: 'Héjazat',
  accessories: 'Kiegészítők', openings: 'Nyílászárók', exterior: 'Külső rétegek', interior: 'Belső rétegek',
};

/** Alapsorrend; a falak sorrendjét a buildAssembly a terv szerint állítja (futó falak előbb). */
const ORDER: AssemblyStepId[] = ['foundation', 'supports', 'beamFrame', 'floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W', 'wallTop',
  'roofFrame', 'roofLayers', 'covering', 'accessories', 'openings', 'exterior', 'interior'];
const LAST: AssemblyStepId = 'interior';

const FASTENER_LABELS: Record<FastenerKind, string> = {
  anchor: 'Talpgerenda-rögzítő (dübel / ászokcsavar)', frameScrew: 'Vázszerkezeti csavar',
  osbScrew: 'OSB-csavar', hurricaneTie: HURRICANE_TIE_LABEL,
  beamBolt: 'M12 menetes szár', joistHanger: 'Gerendasaru',
};

const wallStep = (group: string): AssemblyStepId => group as AssemblyStepId;

/**
 * Elem → lépés a `kind` és a `group` alapján. A dupla koszorú felső sorát (→ `wallTop`) csak a
 * buildAssembly ismeri fel (a tervtől függ); itt a koszorú a fal lépése.
 */
export function stepIdOfElement(el: Element): AssemblyStepId {
  switch (el.kind) {
    case 'meshSheet': return 'foundation';
    case 'support': return 'supports';
    case 'beam': return 'beamFrame';
    case 'joist': return 'floor';
    case 'stud': case 'cornerStud': case 'gableStud': case 'kingStud': case 'jackStud': case 'cripple':
    case 'sill': case 'header': case 'bottomPlate': case 'topPlate':
      return wallStep(el.group);
    case 'osbSheet': return el.group.startsWith('wall.') ? 'wallTop' : 'roofLayers';
    case 'rafter': case 'ridge': case 'collar': return 'roofFrame';
    case 'counterBatten': case 'roofBatten': return 'roofLayers';
    case 'fascia': case 'barge': return 'accessories';
    case 'opening': return 'openings';
  }
}

/** Faanyag szálhossz-sor (`timber.*`): csak az anyaglistában, a lépésnél a darabok jelennek meg. */
export function isTimberStockLine(line: Pick<MaterialLine, 'id'>): boolean {
  return line.id.startsWith('timber.');
}

/** Pontos id-k és előtagok (a kalkulátor tényleges sor-id-jei). */
const LINE_IDS: Record<string, AssemblyStepId> = {
  'wall.osb': 'wallTop',
  'wall.breatherMembrane': 'exterior', 'wall.battens': 'exterior', 'wall.exteriorCladding': 'exterior',
  'wall.insulation': 'interior', 'wall.vaporBarrier': 'interior', 'wall.interiorCladding': 'interior',
  'roof.decking': 'roofLayers', 'roof.underlay': 'roofLayers', 'roof.counterBatten': 'roofLayers', 'roof.battens': 'roofLayers',
  'roof.tiles': 'covering', 'roof.trapezoid': 'covering', 'roof.shingles': 'covering', 'roof.epdm': 'covering',
  'roof.standingSeam': 'covering',
  'acc.fascia': 'accessories', 'acc.barge': 'accessories',
  // rajzolt pontok: a sor (a beszerzendő mennyiség) az első fal lépésébe kerül, a pontok falanként a lépésekben
  'fix.anchors': 'wall.N', 'fix.frameScrews': 'wall.N',
  'fix.osbScrews': 'wallTop', 'fix.hurricaneTies': 'roofFrame',
  'fix.seamClips': 'covering', 'fix.seamClipScrews': 'covering', 'fix.tileClips': 'covering',
  'fix.counterBattenNails': 'roofLayers', 'fix.battenNails': 'roofLayers',
  'fix.claddingNails': 'exterior', 'fix.connectorScrews': 'floor',
  // talajcsavaros alap: pontos egyezés a `foundation.` előtag előtt
  'foundation.groundScrew': 'supports', 'foundation.screwHead': 'supports',
  'foundation.beamBolts': 'beamFrame', 'foundation.joistHangers': 'floor',
};
const LINE_PREFIXES: Array<[string, AssemblyStepId]> = [
  ['foundation.', 'foundation'], ['floor.', 'floor'],
  ['roof.seam', 'covering'], ['acc.ridge', 'covering'],
  ['acc.gutter', 'accessories'], ['acc.downpipe', 'accessories'],
];

/** null: faanyag-sor; undefined: ismeretlen id. */
function lookupLine(id: string): AssemblyStepId | null | undefined {
  if (id.startsWith('timber.')) return null;
  if (LINE_IDS[id]) return LINE_IDS[id];
  return LINE_PREFIXES.find(([p]) => id.startsWith(p))?.[1];
}

/**
 * Anyaglista-sor → lépés (null = faanyag szálhossz-sor). A terv megadásával a fal-rögzítők sora az első
 * futó falhoz, az OSB-csavar sora az első OSB-t tartalmazó lépéshez kerül (`osbScrewStep`); terv nélkül
 * `wall.N` / `wallTop`.
 * Ismeretlen id: az utolsó lépés, `console.warn`-nal.
 */
export function stepIdOfLine(line: Pick<MaterialLine, 'id'>, plan?: Plan): AssemblyStepId | null {
  const s = lookupLine(line.id);
  if (s === undefined) {
    console.warn(`Szerelési útmutató: ismeretlen anyaglista-sor (${line.id}), az utolsó lépéshez soroltuk.`);
    return LAST;
  }
  if (s === null || !plan) return s;
  if (s.startsWith('wall.')) return wallOrder(plan)[0];
  if (line.id === 'fix.osbScrews') return osbScrewStep(plan);
  return s;
}

/**
 * Az OSB-csavar sora (fali, belső, padló- és tető-OSB együtt) az első lépéshez, amelyben OSB-lap van:
 * fali OSB → belső OSB burkolat → padló → OSB tetődeszkázat.
 */
function osbScrewStep(plan: Plan): AssemblyStepId {
  const wall = (kind: string) => plan.walls.layers.find(l => l.kind === kind && l.enabled);
  if (wall('osb')) return 'wallTop';
  if (wall('interiorCladding')?.material === 'osb') return 'interior';
  if (floorOn(plan)) return 'floor';
  const decking = plan.roof.layers.find(l => l.kind === 'decking');
  if (decking?.material === 'osb' && (decking.enabled || DECKING_REQUIRED.has(plan.roof.covering))) return 'roofLayers';
  return 'wallTop';
}

/** A falak lépés-sorrendje: a két futó fal (É, K, D, Ny), aztán a két rövid. */
function wallOrder(plan: Plan): AssemblyStepId[] {
  const walls = wallGeometry(plan);
  return [...walls.filter(w => w.full), ...walls.filter(w => !w.full)].map(w => wallStep(`wall.${w.side}`));
}

/** „3–4. sz. 5 m-es szál”; egy szálnál „3. sz. 5 m-es szál”; több szálhossznál „; ”-vel. */
export function cutText(refs: CutRef[]): string {
  const byStock = new Map<Mm, Set<number>>();
  for (const r of refs) byStock.set(r.stockLength, (byStock.get(r.stockLength) ?? new Set()).add(r.stockIndex));
  return [...byStock.keys()].sort((a, b) => b - a).map(stock => {
    const idx = [...byStock.get(stock)!].sort((a, b) => a - b);
    const ranges: string[] = [];
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      ranges.push(i === j ? `${idx[i]}.` : `${idx[i]}–${idx[j]}.`);
      i = j + 1;
    }
    return `${ranges.join(', ')} sz. ${formatQty(stock / 1000, 1)} m-es szál`;
  }).join('; ');
}

function mergePieces(pieces: TimberPiece[], scene: Scene): AssemblyPiece[] {
  const groups = new Map<string, TimberPiece[]>();
  for (const p of pieces) {
    const k = `${p.label}|${p.section.t}x${p.section.w}|${p.length}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.values()].map(g => {
    const ids = g.map(p => p.id!);
    return {
      label: g[0].label, section: sectionLabelWithUnit(g[0].section.t, g[0].section.w), length: g[0].length,
      count: g.length, elementIds: ids,
      cut: cutText(ids.map(id => scene.cut[id]).filter((r): r is CutRef => r !== undefined)),
    };
  });
}

export function buildAssembly(plan: Plan, scene: Scene, calc: CalcOutput): AssemblyStep[] {
  const walls = wallOrder(plan);
  const order: AssemblyStepId[] = [
    'foundation', 'supports', 'beamFrame', 'floor', ...walls, ...ORDER.slice(ORDER.indexOf('wallTop')),
  ];
  const els = new Map<AssemblyStepId, Element[]>(order.map(id => [id, []]));
  const lines = new Map<AssemblyStepId, AssemblyLine[]>(order.map(id => [id, []]));
  const stepOf = new Map<string, AssemblyStepId>();

  // dupla koszorú: falanként a legmagasabb koszorú-sor a wallTop lépésbe
  const upper = new Set<string>();
  if (plan.walls.topPlate === 'double') {
    const top = new Map<string, Element>();
    for (const e of scene.elements) {
      if (e.kind !== 'topPlate') continue;
      const cur = top.get(e.group);
      if (!cur || e.geom.v > cur.geom.v) top.set(e.group, e);
    }
    for (const e of top.values()) upper.add(e.id);
  }
  for (const e of scene.elements) {
    const s = upper.has(e.id) ? 'wallTop' : stepIdOfElement(e);
    stepOf.set(e.id, s);
    els.get(s)!.push(e);
  }

  // rögzítési pontok: horgony a fal, viharkapocs a tetőváz, egyébként az első elem lépése
  const fx = new Map<AssemblyStepId, Map<FastenerKind, AssemblyFastener>>(order.map(id => [id, new Map()]));
  for (const f of scene.fasteners) {
    const s: AssemblyStepId = f.kind === 'anchor' ? wallStep(f.group)
      : f.kind === 'hurricaneTie' ? 'roofFrame'
        : stepOf.get(f.elementIds[0]) ?? wallStep(f.group);
    const m = fx.get(s) ?? fx.set(s, new Map()).get(s)!;
    const cur = m.get(f.kind) ?? { kind: f.kind, label: f.kind === 'anchor' && plan.foundation.type === 'groundScrew' ? FRAME_ANCHOR_LABEL : FASTENER_LABELS[f.kind], count: 0, elementIds: [] };
    cur.count += f.count;
    for (const id of f.elementIds) if (!cur.elementIds.includes(id)) cur.elementIds.push(id);
    m.set(f.kind, cur);
  }

  const unknown: AssemblyLine[] = [];
  for (const l of calc.lines) {
    const s = stepIdOfLine(l, plan);
    if (s === null) continue;
    const row = { lineId: l.id, name: l.name, quantity: l.quantity, unit: l.unit };
    if (lookupLine(l.id) === undefined) unknown.push(row); else lines.get(s)!.push(row);
  }

  const battens = wallBattenPieces(plan);
  const steps: AssemblyStep[] = [];
  for (const id of order) {
    const pieces = [...elementsToPieces(els.get(id)!), ...(id === 'exterior' ? battens : [])];
    const step: AssemblyStep = {
      id, index: 0, title: ASSEMBLY_TITLES[id],
      elementIds: els.get(id)!.map(e => e.id),
      lines: lines.get(id)!,
      pieces: mergePieces(pieces, scene),
      fasteners: [...fx.get(id)!.values()],
      todo: [],
    };
    if (step.elementIds.length + step.lines.length + step.pieces.length > 0) steps.push(step);
  }
  // ismeretlen sor: ne vesszen el, az utolsó meglévő lépésbe
  if (unknown.length) steps[steps.length - 1].lines.push(...unknown);
  steps.forEach((s, i) => { s.index = i; s.todo = stepTodo(plan, scene, s); });
  return steps;
}
