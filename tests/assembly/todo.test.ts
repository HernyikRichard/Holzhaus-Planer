import { describe, expect, test } from 'vitest';
import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { studPositions, wallGeometry } from '../../src/calc/geometry';
import type { ElementKind } from '../../src/scene/types';
import { buildAssembly, type AssemblyStep } from '../../src/assembly/steps';
import { az, stepTodo } from '../../src/assembly/todo';
import { formatCmNum } from '../../src/ui/format';
import { mono4x6Plan } from '../fixtures';

function variant(f: (p: Plan) => void, base: () => Plan = createDefaultPlan): Plan {
  const p = base();
  f(p);
  return p;
}

const PLANS: Array<[string, Plan]> = [
  ['default', createDefaultPlan()],
  ['mono 4×6', mono4x6Plan()],
  ['flat EPDM, single plate', variant(p => { p.roof = { ...p.roof, shape: 'flat', pitch: 2, covering: 'epdm' }; p.walls.topPlate = 'single'; })],
  ['gable standing seam, floor', variant(p => { p.roof = { ...p.roof, covering: 'standingSeam', pitch: 25 }; p.floor.enabled = true; })],
  ['gable shingle, ridge x', variant(p => { p.roof = { ...p.roof, covering: 'shingle', ridgeDirection: 'x' }; })],
  ['long walls, trapezoid', variant(p => { p.building = { width: 4000, length: 8400, wallHeight: 2400 }; p.roof.covering = 'trapezoid'; })],
  ['no openings, no layers', variant(p => {
    p.openings = [];
    for (const l of p.walls.layers) if (l.kind !== 'insulation') l.enabled = false;
    p.accessories = { gutter: false, downpipe: false, fascia: false, bargeBoard: false, ridgeTiles: false, ridgeVent: false };
  })],
];

/** A lépés darabjainak összege azokra az elemekre, amelyek fajtája `kind`. */
function piecesOfKind(plan: Plan, step: AssemblyStep, kind: ElementKind): number {
  const scene = buildScene(plan);
  const kinds = new Map(scene.elements.map(e => [e.id, e.kind]));
  return step.pieces.filter(p => kinds.get(p.elementIds[0]) === kind).reduce((a, p) => a + p.count, 0);
}
const fastenerSum = (s: AssemblyStep, kind: string) => s.fasteners.filter(f => f.kind === kind).reduce((a, f) => a + f.count, 0);

describe.each(PLANS)('%s', (_n, plan) => {
  const scene = buildScene(plan);
  const steps = buildAssembly(plan, scene, calculate(plan));

  test('every step has 3–6 to-dos, filled by buildAssembly', () => {
    for (const s of steps) {
      const todo = stepTodo(plan, scene, s);
      expect(todo.length, s.id).toBeGreaterThanOrEqual(3);
      expect(todo.length, s.id).toBeLessThanOrEqual(6);
      for (const t of todo) expect(t).toMatch(/^\S.*[.!]$/);
      expect(new Set(todo).size).toBe(todo.length);
      expect(s.todo).toEqual(todo);
      // nincs kerekítetlen tizedes, NaN vagy undefined
      for (const t of todo) expect(t).not.toMatch(/\d[.,]\d{3,}|NaN|undefined|Infinity/);
    }
  });

  test('todo numbers match step data', () => {
    for (const w of wallGeometry(plan)) {
      const s = steps.find(x => x.id === `wall.${w.side}`)!;
      const text = s.todo.join('\n');
      expect(text).toContain(`${piecesOfKind(plan, s, 'stud')} oszlop`);
      expect(text).toContain(`${fastenerSum(s, 'anchor')} db ászokcsavarral`);
      const pos = studPositions(plan, w).map(formatCmNum);
      const list = pos.length > 12 ? `${pos.slice(0, 12).join(', ')}, …` : pos.join(', ');
      expect(text).toContain(`oszlophelyeket a fal elejétől: ${list} cm`);
      expect(text).toContain(`Fektesd le a talpgerendát (${formatCmNum(w.length)} cm)`);
      const ops = plan.openings.filter(o => o.wall === w.side);
      if (ops.length) expect(text).toContain(`${ops.length} nyílás (`);
    }
    const rf = steps.find(x => x.id === 'roofFrame')!;
    const rafters = piecesOfKind(plan, rf, 'rafter');
    const ties = fastenerSum(rf, 'hurricaneTie');
    expect(rafters).toBeGreaterThan(0);
    const text = rf.todo.join('\n');
    expect(text).toContain(`${rafters} szarufát ${formatCmNum(plan.roof.rafterSpacing)} cm-es kiosztással`);
    expect(text).toContain(ties % rafters === 0 ? `mindegyiket ${ties / rafters} viharkapoccsal` : `összesen ${ties} viharkapoccsal`);
  });

  test('wall without openings has no opening sentence', () => {
    for (const w of wallGeometry(plan)) {
      const s = steps.find(x => x.id === `wall.${w.side}`)!;
      if (plan.openings.some(o => o.wall === w.side)) expect(s.todo.join('\n')).toMatch(/nyílás/);
      else expect(s.todo.join('\n')).not.toMatch(/nyílás/);
    }
  });
});

describe('sample texts on the default plan', () => {
  const plan = createDefaultPlan();
  const scene = buildScene(plan);
  const steps = buildAssembly(plan, scene, calculate(plan));
  const todo = (id: string) => steps.find(s => s.id === id)!.todo;

  test('wall K (window)', () => {
    expect(todo('wall.E')).toContain('Fektesd le a talpgerendát (400 cm), jelöld be az oszlophelyeket a fal elejétől: 0, 60, 120, 240, 300, 360, 395 cm.');
    expect(todo('wall.E').join('\n')).toContain('1 nyílás (ablak 60 × 60 cm, 150 cm-nél, 120 cm parapettel)');
    expect(todo('wall.E').join('\n')).toContain('6 db ászokcsavarral');
  });

  test('foundation, roof frame, covering, openings', () => {
    expect(todo('foundation')).toContain('Zsaluzd ki a 3,20 × 4,20 m-es lemezt, 12 cm vastagon.');
    expect(todo('foundation')).toContain('Fektesd le a PE fóliát és a 6 db hálótáblát 15 cm átfedéssel.');
    expect(todo('roofFrame').join('\n')).toContain('Rakd fel a 18 szarufát 60 cm-es kiosztással, mindegyiket 2 viharkapoccsal');
    expect(todo('covering').join('\n')).toContain('201 db cserepet');
    expect(todo('openings').join('\n')).toContain('ajtó 90 × 200 cm (D fal, 150 cm-nél)');
  });
});

describe('article before numbers', () => {
  test('az / a', () => {
    expect(az('1,62 m³')).toBe('az 1,62 m³');
    expect(az(5)).toBe('az 5');
    expect(az(50)).toBe('az 50');
    expect(az('1 128 db')).toBe('az 1 128 db');
    expect(az(18)).toBe('a 18');
    expect(az(100)).toBe('a 100');
    expect(az(2)).toBe('a 2');
  });
});
