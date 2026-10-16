// @vitest-environment jsdom
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore, type Store } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { createUiStore, type UiStore } from '../../src/app/uiStore';
import { App } from '../../src/app/App';
import { STEPS } from '../../src/app/steps';
import { VIEW_LAYERS, VIEW_NAMES } from '../../src/viewer/layers';
import { sceneFor } from '../../src/app/selection';
import { buildAssembly } from '../../src/assembly/steps';
import { stepOfSolid } from '../../src/assembly/solids';
import type { Model3d } from '../../src/three-d/model';

interface FakeRenderer {
  canvas: HTMLCanvasElement; log: string[];
  setModel: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn>; setHighlight: ReturnType<typeof vi.fn>;
  setHover: ReturnType<typeof vi.fn>; pick: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
}
const fake = vi.hoisted(() => ({
  instances: [] as unknown[],
  fail: null as Error | null,
  pick: null as { elementId?: string; label: string } | null,
}));
vi.mock('../../src/three-d/renderer', () => ({
  createRenderer(canvas: HTMLCanvasElement) {
    if (fake.fail) throw fake.fail;
    const log: string[] = [];
    const fn = <T,>(name: string, ret?: () => T) => vi.fn((..._a: unknown[]) => { log.push(name); return ret?.(); });
    const r = {
      canvas, log,
      setModel: fn('setModel'), setVisible: fn('setVisible'), setHighlight: fn('setHighlight'), setHover: fn('setHover'),
      pick: fn('pick', () => fake.pick), setView: fn('setView'), resize: fn('resize'), dispose: fn('dispose'),
    };
    fake.instances.push(r);
    return r;
  },
}));

// A jsdom nem ismeri a PointerEvent-et: egéreseményként, pointerId-vel.
class PointerEventStub extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
}

const last = () => fake.instances[fake.instances.length - 1] as FakeRenderer;

beforeEach(() => {
  for (const n of ['down', 'move', 'up', 'cancel', 'leave']) {
    Object.defineProperty(Element.prototype, 'onpointer' + n, { value: null, configurable: true, writable: true });
  }
  vi.stubGlobal('PointerEvent', PointerEventStub);
  localStorage.clear();
  fake.instances.length = 0;
  fake.fail = null;
  fake.pick = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function withFloor(): Plan {
  const p = createDefaultPlan();
  p.floor.enabled = true;
  return p;
}

function setup(opts: { plan?: Plan; step?: boolean; open3d?: boolean } = {}) {
  const store = createStore(opts.plan ?? createDefaultPlan());
  const ui = createUiStore();
  if (opts.open3d) ui.set({ view3d: { ...ui.get().view3d, open: true } });
  if (opts.step !== false) ui.set({ step: 'assembly' });
  const r = render(<App store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const qa = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
  return { store, ui, root, q, qa };
}
function stepsOf(store: Store) {
  const s = store.get();
  return buildAssembly(s.lastValidPlan, sceneFor(s.lastValidPlan), s.output);
}
async function ready(): Promise<FakeRenderer> {
  await vi.waitFor(() => expect(fake.instances.length).toBeGreaterThan(0));
  await vi.waitFor(() => expect(last().setModel).toHaveBeenCalled());
  return last();
}
const go = (ui: UiStore, i: number) => act(() => ui.set({ assemblyStep: i }));
const key = (target: Element, k: string) => act(() => { fireEvent.keyDown(target, { key: k }); });

test('assembly step appears after materials and shows step list', async () => {
  expect(STEPS.map(s => s.id).slice(-2)).toEqual(['materials', 'assembly']);
  expect(STEPS.find(s => s.id === 'assembly')).toMatchObject({ title: 'Szerelés', views: ['assembly'], defaultView: 'assembly' });
  expect(VIEW_NAMES.assembly).toBe('Szerelés');
  expect(VIEW_LAYERS.assembly).toEqual([]);

  const { store, ui, q, qa } = setup({ step: false });
  const btns = qa('nav.steps [data-step]');
  expect(btns.map(b => b.getAttribute('data-step')).slice(-2)).toEqual(['materials', 'assembly']);
  expect(btns.at(-1)!.textContent).toContain('7');
  expect(btns.at(-1)!.textContent).toContain('Szerelés');
  await act(() => { fireEvent.click(btns.at(-1)!); });
  expect(ui.get()).toMatchObject({ step: 'assembly', view: 'assembly', assemblyStep: 0 });

  const steps = stepsOf(store);
  const items = qa('.assembly-steps [data-assembly-step]');
  expect(items).toHaveLength(steps.length);
  expect(items.map(b => b.querySelector('.as-title')!.textContent)).toEqual(steps.map((s, i) => `${i + 1}. ${s.title}`));
  expect(items[0].getAttribute('aria-current')).toBe('step');
  // összesítő: a legnagyobb darabcsoport és a csavarok (K fal: 7 oszlop, 68 + 6 csavar)
  const wall = steps.findIndex(s => s.id === 'wall.E');
  expect(items[wall].querySelector('.as-sum')!.textContent).toBe('7 oszlop, 74 csavar');
  // kattintás a listában: lépésváltás
  await act(() => { fireEvent.click(items[wall]); });
  expect(ui.get().assemblyStep).toBe(wall);
  expect(q('.assembly-title')!.textContent).toContain('Fal: K');
  expect(qa('.assembly-todo li').map(l => l.textContent)).toEqual(steps[wall].todo);
});

test('next/prev buttons and arrow keys change step', async () => {
  const { store, ui, q } = setup();
  const n = stepsOf(store).length;
  const prev = q<HTMLButtonElement>('[data-action="assembly-prev"]')!;
  const next = q<HTMLButtonElement>('[data-action="assembly-next"]')!;
  expect(prev.disabled).toBe(true);
  expect(next.disabled).toBe(false);
  await act(() => { fireEvent.click(next); });
  expect(ui.get().assemblyStep).toBe(1);
  expect(prev.disabled).toBe(false);
  await key(document.body, 'ArrowRight');
  expect(ui.get().assemblyStep).toBe(2);
  await key(document.body, 'ArrowLeft');
  expect(ui.get().assemblyStep).toBe(1);
  await act(() => { fireEvent.click(prev); });
  expect(ui.get().assemblyStep).toBe(0);
  // az elején a nyíl nem megy a lista elé
  await key(document.body, 'ArrowLeft');
  expect(ui.get().assemblyStep).toBe(0);
  // beviteli mezőben a nyíl a mezőé
  const input = q<HTMLInputElement>('.plan-name input')!;
  input.focus();
  await key(input, 'ArrowRight');
  expect(ui.get().assemblyStep).toBe(0);
  // módosítóbillentyűvel sem lép
  await act(() => { fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true }); });
  expect(ui.get().assemblyStep).toBe(0);
  // a végén a Következő tiltva, a nyíl nem lép túl
  await go(ui, n - 1);
  expect(next.disabled).toBe(true);
  await key(document.body, 'ArrowRight');
  expect(ui.get().assemblyStep).toBe(n - 1);
});

test('arrow keys do nothing outside the assembly step', async () => {
  const { ui } = setup({ step: false });
  await key(document.body, 'ArrowRight');
  expect(ui.get().assemblyStep).toBe(0);
});

test('step change sends filtered model and highlight', async () => {
  const { store, ui } = setup();
  const r = await ready();
  const steps = stepsOf(store);
  const scene = sceneFor(store.get().lastValidPlan);
  const stepOf = (m: Model3d) => m.solids.map(s => stepOfSolid(s, scene, steps));
  expect(r.log.indexOf('resize')).toBeLessThan(r.log.indexOf('setModel'));
  let m = r.setModel.mock.calls.at(-1)![0] as Model3d;
  expect(stepOf(m).every(i => i <= 0)).toBe(true);
  expect(r.setHighlight).toHaveBeenLastCalledWith(steps[0].elementIds);
  const first = m.solids.length;

  const wall = steps.findIndex(s => s.id === 'wall.W');
  await go(ui, wall);
  m = r.setModel.mock.calls.at(-1)![0] as Model3d;
  const idx = stepOf(m);
  expect(idx.every(i => i <= wall)).toBe(true);
  expect(idx).toContain(wall);
  expect(idx).toContain(0);
  expect(m.solids.length).toBeGreaterThan(first);
  expect(r.setHighlight).toHaveBeenLastCalledWith(steps[wall].elementIds);

  await go(ui, steps.length - 1);
  m = r.setModel.mock.calls.at(-1)![0] as Model3d;
  expect(stepOf(m)).toContain(steps.length - 1);
  // ugyanaz a kirajzoló: a kamera nem áll alaphelyzetbe
  expect(fake.instances).toHaveLength(1);
  expect(r.setView).not.toHaveBeenCalled();
});

test('hovering a line highlights its elements, leaving restores', async () => {
  const { store, ui, q } = setup();
  const r = await ready();
  const steps = stepsOf(store);
  const wall = steps.findIndex(s => s.id === 'wall.E');
  await go(ui, wall);
  const step = steps[wall];
  const pi = step.pieces.findIndex(p => p.label === 'oszlop');
  const row = q(`[data-row="piece:${pi}"]`)!;
  expect(row.textContent).toContain(step.pieces[pi].cut);
  await act(() => { fireEvent.mouseEnter(row); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.pieces[pi].elementIds);
  await act(() => { fireEvent.mouseLeave(row); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.elementIds);

  // billentyűzettel: fókusz / elhagyás
  const fx = q('[data-row="fx:anchor"]')!;
  await act(() => { fireEvent.focus(fx); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.fasteners.find(f => f.kind === 'anchor')!.elementIds);
  await act(() => { fireEvent.blur(fx); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.elementIds);

  // kattintás rögzíti a kiemelést; újabb kattintás / lépésváltás oldja
  await act(() => { fireEvent.click(row); });
  await act(() => { fireEvent.mouseLeave(row); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.pieces[pi].elementIds);
  expect(row.getAttribute('aria-pressed')).toBe('true');
  await act(() => { fireEvent.click(row); });
  expect(r.setHighlight).toHaveBeenLastCalledWith(step.elementIds);
  await act(() => { fireEvent.click(row); });
  await go(ui, wall + 1);
  expect(r.setHighlight).toHaveBeenLastCalledWith(steps[wall + 1].elementIds);
});

test('fastener purchase line is the order note of the counted fastener row', async () => {
  const { store, ui, q, qa } = setup();
  const steps = stepsOf(store);
  const wall = steps.findIndex(s => s.id === 'wall.E');
  expect(steps[wall].lines.map(l => l.lineId)).toEqual(['fix.anchors', 'fix.frameScrews']);
  await go(ui, wall);
  // a rajzolt pontok darabszáma a sorban, a beszerzési sor nem külön tétel
  expect(qa('[data-line]')).toHaveLength(0);
  const screws = q('[data-row="fx:frameScrew"]')!;
  expect(screws.querySelector('.as-qty')!.textContent).toBe('68 db');
  expect(screws.querySelector('.as-order')!.textContent).toBe('rendelés, az egész házra: 2 doboz');
  const anchors = q('[data-row="fx:anchor"]')!;
  expect(anchors.querySelector('.as-qty')!.textContent).toBe('6 db');
  expect(anchors.querySelector('.as-order')!.textContent).toBe('rendelés, az egész házra: 22 db');
  // a következő falnál csak a darabszám
  await go(ui, wall + 1);
  expect(q('[data-row="fx:frameScrew"] .as-order')).toBeNull();
  // rajzolt pont nélküli rögzítő-sor (cserépkapocs) rendes anyagsor marad
  const cov = steps.findIndex(s => s.id === 'covering');
  await go(ui, cov);
  expect(q('[data-line="fix.tileClips"]')!.textContent).toContain('1 doboz');
  // a faanyag-figyelmeztetés a darabos lépéseknél
  await go(ui, wall);
  expect(q('.assembly-info')!.textContent).toContain('A faanyagot egyben rendeld meg (lásd Anyaglista).');
});

test('click on a 3D element selects and opens detail without leaving the step', async () => {
  const { ui, q } = setup();
  await ready();
  const stud = sceneFor(createDefaultPlan()).elements.find(e => e.group === 'wall.E' && e.kind === 'stud')!;
  fake.pick = { elementId: stud.id, label: stud.label };
  const canvas = q<HTMLCanvasElement>('.assembly-3d canvas')!;
  await act(() => {
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 101, clientY: 100, pointerId: 1 });
  });
  expect(ui.get()).toMatchObject({ selected: stud.id, detailOpen: true, step: 'assembly', view: 'assembly' });
});

test('floating 3D window not rendered in assembly step, state kept', async () => {
  const { ui, q } = setup({ open3d: true });
  const r = await ready();
  expect(q('.window3d')).toBeNull();
  expect(fake.instances).toHaveLength(1);
  expect(q('[data-action="3d"]')!.hasAttribute('disabled')).toBe(true);
  expect(ui.get().view3d.open).toBe(true);
  await act(() => { ui.set({ step: 'walls' }); });
  expect(r.dispose).toHaveBeenCalledTimes(1);
  expect(q('.window3d')).not.toBeNull();
  await vi.waitFor(() => expect(fake.instances).toHaveLength(2));
});

test('step index clamps when steps disappear', async () => {
  const { store, ui, q } = setup({ plan: withFloor() });
  const before = stepsOf(store);
  expect(before[1].id).toBe('floor');
  // a padló lépése megszűnik: a helyén álló (következő) lépés
  await go(ui, 1);
  await act(() => { store.update(p => { p.floor.enabled = false; }); });
  let after = stepsOf(store);
  expect(after).toHaveLength(before.length - 1);
  expect(ui.get().assemblyStep).toBe(1);
  expect(q('.assembly-title')!.textContent).toContain(after[1].title);
  // a meglévő lépés követi magát; a végén a legközelebbi létező index
  await act(() => { store.update(p => { p.floor.enabled = true; }); });
  await go(ui, before.length - 1);
  await act(() => { store.update(p => { p.floor.enabled = false; }); });
  after = stepsOf(store);
  expect(ui.get().assemblyStep).toBe(after.length - 1);
  expect(q('.assembly-title')!.textContent).toContain('Belső rétegek');
  // túl nagy tárolt index a megjelenítéskor is a legutolsó
  await go(ui, 99);
  expect(ui.get().assemblyStep).toBe(after.length - 1);
});

test('webgl missing shows message, list and todo still work', async () => {
  fake.fail = new Error('webgl');
  const { store, q, qa } = setup();
  const steps = stepsOf(store);
  await vi.waitFor(() => expect(q('.assembly-3d')!.textContent).toContain('A 3D nézethez WebGL-képes böngésző szükséges.'));
  expect(qa('.assembly-todo li').map(l => l.textContent)).toEqual(steps[0].todo);
  await act(() => { fireEvent.click(q('[data-action="assembly-next"]')!); });
  expect(qa('.assembly-todo li').map(l => l.textContent)).toEqual(steps[1].todo);
  await act(() => { fireEvent.click(qa('.assembly-steps [data-assembly-step]')[2]); });
  expect(qa('.assembly-todo li').map(l => l.textContent)).toEqual(steps[2].todo);
  const row = q('[data-row^="piece:"]')!;
  await act(() => { fireEvent.mouseEnter(row); });
  await act(() => { fireEvent.click(row); });
  expect(q('.assembly-3d')!.textContent).toContain('A 3D nézethez WebGL-képes böngésző szükséges.');
});
