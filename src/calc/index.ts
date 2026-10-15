import type { Plan } from '../model/types';
import type { CalcStats, Category, MaterialLine, ModuleResult, TimberPiece } from './types';
import { calcFoundation } from './foundation';
import { calcFloor } from './floor';
import { calcWallFraming, calcWallLayers } from './walls';
import { calcRoofLayers, calcRoofStructure } from './roof';
import { calcAccessories } from './accessories';
import { calcFasteners } from './fasteners';
import { cutTimber } from './cutting';

export interface CalcOutput { lines: MaterialLine[]; warnings: string[] }

export const CATEGORY_ORDER: Category[] = ['Alap', 'Padló', 'Fal', 'Tető', 'Kiegészítők', 'Kötőelemek'];

const STAT_KEYS: (keyof CalcStats)[] = [
  'osbSheets', 'studs', 'headers', 'collarPairs', 'rafters',
  'anchorPoints', 'counterBattenLength', 'battenCrossings', 'claddingArea', 'tileClips',
  'frameScrewCount', 'osbScrewCount', 'hurricaneTieCount',
];

export function calculate(plan: Plan): CalcOutput {
  const results: ModuleResult[] = [
    calcFoundation(plan), calcFloor(plan), calcWallFraming(plan), calcWallLayers(plan),
    calcRoofStructure(plan), calcRoofLayers(plan), calcAccessories(plan),
  ];

  const stats = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as unknown as CalcStats;
  for (const r of results) for (const k of STAT_KEYS) stats[k] += r.stats[k] ?? 0;

  const pieces: TimberPiece[] = results.flatMap(r => r.pieces);
  const moduleLines = results.flatMap(r => r.lines);
  const timberLines = cutTimber(pieces, plan.settings.stockLengths, plan.settings.waste.timber);
  const all = [...moduleLines, ...timberLines, ...calcFasteners(stats)];

  const rank = (l: MaterialLine) => CATEGORY_ORDER.indexOf(l.category);
  const lines = all
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i)
    .map(x => x.l)
    .filter(l => l.quantity > 0);

  const warnings = [...new Set([
    ...results.flatMap(r => r.warnings),
    ...all.flatMap(l => l.warnings ?? []),
  ])];
  return { lines, warnings };
}
