// @vitest-environment jsdom
import type { jsPDF } from 'jspdf';
import { createDefaultPlan } from '../../src/model/defaults';
import { calculate } from '../../src/calc';
import { supplyFor } from '../../src/pricing/supply';
import { buildScene } from '../../src/scene/build';
import { buildAssembly } from '../../src/assembly/steps';
import { stepOfSolid } from '../../src/assembly/solids';
import { buildModel3d } from '../../src/three-d/model';
import { exportPdf } from '../../src/export/pdf';
import { PRINT_PALETTE } from '../../src/viewer/theme';
import { assemblyRendererLoader, renderAssemblyImages } from '../../src/export/assemblyImages';

// 1×1-es PNG: a jsPDF valódi képként be tudja olvasni
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const rec = vi.hoisted(() => ({
  texts: [] as { text: string; page: number }[],
  images: 0,
  pages: 0,
  fail: null as Error | null,
  snapshots: 0,
  longStep: false,
  opts: undefined as unknown,
  views: [] as unknown[][],
  models: [] as { bounds: unknown }[],
}));

vi.mock('jspdf', async importOriginal => {
  const m = await importOriginal<typeof import('jspdf')>();
  class Recording extends m.jsPDF {
    constructor(...args: ConstructorParameters<typeof m.jsPDF>) {
      super(...args);
      const text = this.text.bind(this);
      this.text = ((t: string | string[], ...rest: unknown[]) => {
        const page = this.getCurrentPageInfo().pageNumber;
        for (const s of Array.isArray(t) ? t : [t]) rec.texts.push({ text: s, page });
        return (text as (...a: unknown[]) => jsPDF)(t, ...rest);
      }) as typeof this.text;
      const addImage = this.addImage.bind(this);
      this.addImage = ((...a: unknown[]) => { rec.images++; return (addImage as (...x: unknown[]) => jsPDF)(...a); }) as typeof this.addImage;
      const output = this.output.bind(this);
      this.output = ((...a: unknown[]) => { rec.pages = this.getNumberOfPages(); return (output as (...x: unknown[]) => unknown)(...a); }) as typeof this.output;
    }
  }
  return { ...m, jsPDF: Recording, default: Recording };
});

vi.mock('../../src/three-d/renderer', () => ({
  createRenderer(_c: unknown, opts: unknown) {
    rec.opts = opts;
    if (rec.fail) throw rec.fail;
    return {
      setModel: vi.fn((m: { bounds: unknown }) => { rec.models.push(m); }), setVisible: vi.fn(), setHighlight: vi.fn(), setHover: vi.fn(), pick: vi.fn(),
      setView: vi.fn((...a: unknown[]) => { rec.views.push(a); }), resize: vi.fn(), dispose: vi.fn(),
      snapshot: vi.fn(() => { rec.snapshots++; return PNG; }),
    };
  },
}));

vi.mock('../../src/assembly/steps', async importOriginal => {
  const m = await importOriginal<typeof import('../../src/assembly/steps')>();
  return {
    ...m,
    buildAssembly: (...a: Parameters<typeof m.buildAssembly>) => {
      const steps = m.buildAssembly(...a);
      if (rec.longStep) {
        for (let i = 0; i < 80; i++) steps[0].lines.push({ lineId: `test.${i}`, name: `Próbatétel ${i}`, quantity: i + 1, unit: 'db' });
      }
      return steps;
    },
  };
});

const FONT_DIR = 'node_modules/dejavu-fonts-ttf/ttf';
const OPTS = { drawings: false, materials: false, explanations: false, cutPlan: false, cost: false };

beforeEach(async () => {
  rec.texts.length = 0;
  rec.images = 0;
  rec.pages = 0;
  rec.fail = null;
  rec.snapshots = 0;
  rec.longStep = false;
  rec.views.length = 0;
  rec.models.length = 0;
  const { readFileSync } = await vi.importActual<{ readFileSync(p: string): Uint8Array }>('node:fs');
  vi.stubGlobal('fetch', async (url: string) => {
    const name = String(url).split('?')[0].split('/').pop()!;
    return new Response(readFileSync(`${FONT_DIR}/${name}`));
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(groundScrew = false) {
  const plan = createDefaultPlan();
  if (groundScrew) plan.foundation.type = 'groundScrew';
  const output = calculate(plan, supplyFor(plan));
  const scene = buildScene(plan, supplyFor(plan));
  const steps = buildAssembly(plan, scene, output);
  return { plan, output, scene, steps };
}
const texts = () => rec.texts.map(t => t.text);

test('assembly chapter has one section per step', async () => {
  const { plan, output, steps } = setup();
  const blob = await exportPdf(plan, output, OPTS);
  expect(blob.size).toBeGreaterThan(0);
  expect(texts()).toContain('Szerelési útmutató');
  const stepPages = new Set<number>();
  steps.forEach((s, i) => {
    const hits = rec.texts.filter(t => t.text === `${i + 1}. ${s.title}`);
    expect(hits.length).toBeGreaterThan(0);
    hits.forEach(h => stepPages.add(h.page));
    for (const todo of s.todo) expect(texts().join(' ')).toContain(todo);
  });
  expect(stepPages.size).toBeGreaterThanOrEqual(steps.length);
  expect(rec.pages).toBeGreaterThanOrEqual(steps.length + 1);
});

test('groundScrew plan: supports and beam frame sections in the chapter', async () => {
  const { plan, output, steps } = setup(true);
  await exportPdf(plan, output, OPTS);
  expect(steps.map(s => s.id).slice(0, 3)).toEqual(['supports', 'beamFrame', 'floor']);
  steps.forEach((s, i) => {
    expect(texts()).toContain(`${i + 1}. ${s.title}`);
    for (const todo of s.todo) expect(texts().join(' ')).toContain(todo);
  });
  expect(texts()).toContain('1. Támaszok');
  expect(texts()).toContain('2. Gerendakeret');
});

test('images added when snapshots available', async () => {
  const { plan, output, steps } = setup();
  await exportPdf(plan, output, OPTS);
  expect(rec.snapshots).toBe(steps.length);
  expect(rec.images).toBe(steps.length);
  // nyomtatási paletta: fehér háttér, sötét vonalak (mint a PDF rajzai)
  expect(rec.opts).toEqual({ preserveDrawingBuffer: true, palette: PRINT_PALETTE });
});

test('no webgl: chapter without images, export succeeds', async () => {
  rec.fail = new Error('webgl');
  const { plan, output, steps } = setup();
  const blob = await exportPdf(plan, output, OPTS);
  expect(blob.size).toBeGreaterThan(0);
  expect(rec.images).toBe(0);
  steps.forEach((s, i) => expect(texts()).toContain(`${i + 1}. ${s.title}`));
});

test('renderAssemblyImages never throws', async () => {
  const { plan, scene, steps } = setup();
  const model = buildModel3d(plan, scene);
  const stepOf = (s: Parameters<typeof stepOfSolid>[0]) => stepOfSolid(s, scene, steps);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(assemblyRendererLoader, 'load').mockRejectedValueOnce(new Error('chunk'));
  const out = await renderAssemblyImages(model, steps, stepOf, { w: 1200, h: 800 });
  expect(out).toEqual(steps.map(() => null));
  expect(warn).toHaveBeenCalled();

  rec.fail = new Error('webgl');
  expect(await renderAssemblyImages(model, steps, stepOf, { w: 1200, h: 800 })).toEqual(steps.map(() => null));

  rec.fail = null;
  expect(await renderAssemblyImages(model, steps, stepOf, { w: 1200, h: 800 })).toEqual(steps.map(() => PNG));
});

test('every step image is framed on the whole house', async () => {
  const { plan, scene, steps } = setup();
  const model = buildModel3d(plan, scene);
  const stepOf = (s: Parameters<typeof stepOfSolid>[0]) => stepOfSolid(s, scene, steps);
  await renderAssemblyImages(model, steps, stepOf, { w: 1200, h: 800 });
  // a szűrt modellek befoglalója lépésenként más, a kamera mégis mindig a teljes házra áll
  expect(rec.models).toHaveLength(steps.length);
  expect(rec.models[0].bounds).not.toEqual(model.bounds);
  expect(rec.views).toEqual(steps.map(() => ['persp', model.bounds]));
});

test('long step table breaks onto next page', async () => {
  rec.longStep = true;
  const { plan, output, steps } = setup();
  await exportPdf(plan, output, OPTS);
  const title = `1. ${steps[0].title}`;
  const cont = rec.texts.filter(t => t.text === `${title} (folytatás)`);
  expect(cont.length).toBeGreaterThan(0);
  const first = rec.texts.find(t => t.text === title)!;
  const p0 = rec.texts.find(t => t.text === 'Próbatétel 0')!;
  const p79 = rec.texts.find(t => t.text === 'Próbatétel 79')!;
  expect(p0.page).toBe(first.page);
  expect(p79.page).toBeGreaterThan(first.page);
  // a következő lépés a folytatás után, új oldalon
  const second = rec.texts.find(t => t.text === `2. ${steps[1].title}`)!;
  expect(second.page).toBeGreaterThan(p79.page);
});
