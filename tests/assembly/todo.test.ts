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
/** A szám önálló szóként (nem egy hosszabb szám vége: „5 oszlop” ne illeszkedjen a „15 oszlop”-ra). */
const num = (n: number, rest: string) => new RegExp(`(?<!\\d)${n} ${rest.replace(/[()]/g, m => `\\${m}`)}(?!\\p{L})`, 'u');
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
      expect(text).toMatch(num(piecesOfKind(plan, s, 'stud'), 'oszlop'));
      expect(text).toMatch(num(fastenerSum(s, 'anchor'), plan.foundation.type === 'groundScrew' ? 'db csavarral' : 'db ászokcsavarral'));
      const pos = studPositions(plan, w).map(formatCmNum);
      const list = pos.length > 12 ? `${pos.slice(0, 12).join(', ')}, …` : pos.join(', ');
      expect(text).toContain(`oszlophelyeket a fal elejétől: ${list} cm`);
      expect(text).toContain(`Fektesd le a talpgerendát (${formatCmNum(w.length)} cm)`);
      const ops = plan.openings.filter(o => o.wall === w.side);
      if (ops.length) expect(text).toMatch(num(ops.length, 'nyílás'));
    }
    const rf = steps.find(x => x.id === 'roofFrame')!;
    const rafters = piecesOfKind(plan, rf, 'rafter');
    const ties = fastenerSum(rf, 'hurricaneTie');
    expect(rafters).toBeGreaterThan(0);
    const text = rf.todo.join('\n');
    expect(text).toMatch(num(rafters, `szarufát ${formatCmNum(plan.roof.rafterSpacing)} cm-es kiosztással`));
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

describe('guards and wording', () => {
  test('number matcher is word-bounded', () => {
    expect('Szereld össze: 15 oszlop, 2 sarokoszlop.').not.toMatch(num(5, 'oszlop'));
    expect('Szereld össze: 15 oszlop, 2 sarokoszlop.').toMatch(num(15, 'oszlop'));
    expect('Szereld össze: 15 oszlopot.').not.toMatch(num(15, 'oszlop'));
  });

  test('roofs without ridge never mention a ridge', () => {
    for (const [, plan] of PLANS.filter(([, p]) => p.roof.shape !== 'gable')) {
      const steps = buildAssembly(plan, buildScene(plan), calculate(plan));
      expect(steps.flatMap(s => s.todo).join('\n')).not.toMatch(/gerinc/);
    }
    const flat = PLANS.find(([n]) => n.startsWith('flat'))![1];
    const cov = buildAssembly(flat, buildScene(flat), calculate(flat)).find(s => s.id === 'covering')!;
    expect(cov.todo).toContain('Haladj az eresztől felfelé, a csapadékkal ellentétes irányban átfedve.');
  });

  test('no anchors → no "0 db ászokcsavarral"', () => {
    const plan = createDefaultPlan();
    const scene = buildScene(plan);
    const s = buildAssembly(plan, scene, calculate(plan)).find(x => x.id === 'wall.E')!;
    const todo = stepTodo(plan, scene, { ...s, fasteners: [] }).join('\n');
    expect(todo).not.toMatch(/ászokcsavar|(?<!\d)0 db/);
    expect(todo).toContain('Állítsd fel, függőzd ki, rögzítsd a talpgerendát az alaphoz.');
    expect(todo).toContain('Szereld össze a vázat a földön: 7 oszlop');
  });

  test('OSB screws in the interior to-do only with OSB cladding', () => {
    const plan = createDefaultPlan();
    const scene = buildScene(plan);
    const s = buildAssembly(plan, scene, calculate(plan)).find(x => x.id === 'interior')!;
    const withScrews = { ...s, lines: [...s.lines, { lineId: 'fix.osbScrews', name: 'OSB-csavar', quantity: 1, unit: 'doboz' }] };
    expect(stepTodo(plan, scene, withScrews).join('\n')).toContain('1 doboz OSB-csavarral');
    for (const l of plan.walls.layers) if (l.kind === 'interiorCladding') l.material = 'gypsum';
    expect(stepTodo(plan, scene, withScrews).join('\n')).not.toMatch(/OSB/);
  });

  test('missing OSB layer → no empty thickness', () => {
    const plan = createDefaultPlan();
    const scene = buildScene(plan);
    const s = buildAssembly(plan, scene, calculate(plan)).find(x => x.id === 'wallTop')!;
    plan.walls.layers = plan.walls.layers.filter(l => l.kind !== 'osb');
    const todo = stepTodo(plan, scene, s);
    expect(todo).toContain('Burkold kívülről a falakat OSB-lappal (12 tábla), a nyílásokat vágd ki.');
    expect(todo.join('\n')).not.toMatch(/ {2}|\( ?\)| mm-es OSB/);
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

describe('groundScrew to-dos', () => {
  const plan = createDefaultPlan();
  plan.foundation.type = 'groundScrew';
  plan.building = { ...plan.building, width: 3000, length: 4000 };
  const scene = buildScene(plan);
  const steps = buildAssembly(plan, scene, calculate(plan));
  const text = (id: string) => steps.find(s => s.id === id)!.todo.join('\n');

  test('supports', () => {
    const t = text('supports');
    expect(t).toMatch(/Tűzd ki a \d+ csavar helyét: \d+ sor/);
    expect(t).toContain('3 sor');
    expect(t).toContain('12 csavar');
    expect(t).toContain('soronként 4 csavar a sarokponttól 15, 138,3, 261,7, 385 cm-re');
    expect(t).toContain('100 cm mélyre');
    expect(t).toContain('30 cm-re');
    expect(t).toContain('Szintezd ki az U-fejeket');
  });

  test('walls: no concrete anchors on the frame', () => {
    const t = text('wall.E');
    expect(t).toMatch(/rögzítsd \d+ db csavarral a padlón át a gerendakeretbe/);
    expect(t).not.toContain('ászokcsavar');
  });

  test('beamFrame', () => {
    const t = text('beamFrame');
    expect(t).toContain('3 főgerendát');
    expect(t).toContain('fejenként 2 db M12 menetes szárral');
    expect(t).toContain('Ellenőrizd az átlókat');
    expect(t).not.toContain('pallóból');
    const two = createDefaultPlan();
    two.foundation.type = 'groundScrew'; two.foundation.frame.beamSection = 'b2x50x150';
    expect(buildAssembly(two, buildScene(two), calculate(two)).find(s => s.id === 'beamFrame')!.todo.join(' '))
      .toContain('két összeszegezett pallóból áll');
  });

  test('floor', () => {
    const t = text('floor');
    expect(t).toMatch(/gerendasaruval \(\d+ db\)/);
    expect(t).toContain('a két szélső párnafa a peremgerenda, a rövid falak alatt fut.');
    const hangers = steps.find(s => s.id === 'floor')!.fasteners.filter(f => f.kind === 'joistHanger').reduce((a, f) => a + f.count, 0);
    expect(t).toContain(`gerendasaruval (${hangers} db)`);
  });

  test('splice to-do only with spliced beams', () => {
    expect(text('beamFrame')).not.toContain('toldás');
    const big = createDefaultPlan();
    big.foundation.type = 'groundScrew';
    big.building = { ...big.building, width: 8000, length: 6000 };
    const bs = buildAssembly(big, buildScene(big), calculate(big));
    expect(bs.find(s => s.id === 'beamFrame')!.todo.join('\n')).toContain('A toldás mindig támasz fölé essen.');
  });
});

describe('pad footing and concrete pier to-dos', () => {
  function build(f: (p: Plan) => void) {
    const plan = createDefaultPlan();
    plan.building = { ...plan.building, width: 3000, length: 4000 };
    f(plan);
    const steps = buildAssembly(plan, buildScene(plan), calculate(plan));
    return steps.find(s => s.id === 'supports')!;
  }
  const pad = (p: Plan) => { p.foundation.type = 'padFooting'; p.foundation.frame.groundClearance = 300; };
  const pier = (kind: 'block200' | 'block250' | 'tube200') => (p: Plan) => {
    p.foundation.type = 'concretePier'; p.foundation.pier = { kind }; p.foundation.frame.groundClearance = 300;
  };

  test('pad footing', () => {
    const s = build(pad);
    const t = s.todo.join('\n');
    expect(s.title).toBe('Pontalapok');
    expect(s.todo.length).toBeGreaterThanOrEqual(3);
    expect(s.todo.length).toBeLessThanOrEqual(6);
    expect(t).toContain('Tűzd ki a 12 pontalap helyét: 3 sor');
    expect(t).toContain('40×40 cm-re, 80 cm mélyre');
    expect(t).toContain('4 db Ø10 hosszvas, 4 db Ø6 kengyel');
    expect(t).toContain('1,54 m³');
    expect(t).toContain('oszloptalpakat');
    expect(t).toContain('30 cm-re');
    expect(t).toContain('7 napig');
  });

  test('concrete pier, block', () => {
    const s = build(pier('block250'));
    const t = s.todo.join('\n');
    expect(s.title).toBe('Betonpillérek');
    expect(s.todo.length).toBeLessThanOrEqual(6);
    expect(t).toContain('12 betonpillér helyét');
    expect(t).toContain('támaszonként 4 db Ø10 hosszvas');
    expect(t).toContain('2 sor 25 cm-es zsalukőből 30 cm magasra (a felső követ méretre vágva)');
    expect(t).toContain('öntsd ki betonnal (1,54 m³)');
    expect(t).toContain('töltsd ki betonnal (0,18 m³)');
    const exact = build(p => { pier('block250')(p); p.foundation.frame.groundClearance = 250; }).todo.join(' ');
    expect(exact).not.toContain('méretre vágva');
    expect(t).toContain('gerendapapucs');
    expect(t).toContain('7 napig');
    expect(build(pier('block200')).todo.join('\n')).toContain('2 sor 20 cm-es zsalukőből');
  });

  test('concrete pier, tube', () => {
    const t = build(pier('tube200')).todo.join('\n');
    expect(t).toContain('Ø20 cm-es zsalucső');
    expect(t).toContain('30 cm magasra');
    expect(t).toContain('gerendapapucs');
  });

  test('ground screw title unchanged', () => {
    expect(build(p => { p.foundation.type = 'groundScrew'; }).title).toBe('Támaszok');
  });
});
