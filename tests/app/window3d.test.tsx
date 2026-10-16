// @vitest-environment jsdom
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { createUiStore } from '../../src/app/uiStore';
import { TopBar } from '../../src/app/TopBar';
import { Window3d, rendererLoader } from '../../src/app/Window3d';
import { sceneFor } from '../../src/app/selection';
import { FRAME_ONLY, LAYER3D_GROUPS, type Layer3dId } from '../../src/three-d/model';

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

// A jsdom nem ismeri a PointerEvent-et: egéreseményként, pointerId-vel (mint az openings tesztben).
class PointerEventStub extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
}

const ALL: Layer3dId[] = LAYER3D_GROUPS.flatMap(g => g.layers);
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(opts: { plan?: Plan; open?: boolean } = {}) {
  const store = createStore(opts.plan ?? createDefaultPlan());
  const ui = createUiStore();
  if (opts.open !== false) ui.set({ view3d: { ...ui.get().view3d, open: true } });
  const r = render(<div><TopBar store={store} ui={ui} /><Window3d store={store} ui={ui} bounds={{ w: 800, h: 600 }} /></div>);
  const root = r.container as HTMLElement;
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  return { store, ui, root, q };
}
async function ready(): Promise<FakeRenderer> {
  await vi.waitFor(() => expect(fake.instances.length).toBeGreaterThan(0));
  await vi.waitFor(() => expect(last().setModel).toHaveBeenCalled());
  return last();
}
const box = (el: HTMLElement) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) });

test('toggle from top bar opens and closes window', async () => {
  const { ui, q } = setup({ open: false });
  const btn = q<HTMLButtonElement>('[data-action="3d"]')!;
  expect(btn.getAttribute('aria-pressed')).toBe('false');
  expect(q('.window3d')).toBeNull();
  await act(() => { fireEvent.click(btn); });
  expect(ui.get().view3d.open).toBe(true);
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  expect(q('.window3d')).not.toBeNull();
  const r = await ready();
  await act(() => { fireEvent.click(btn); });
  expect(ui.get().view3d.open).toBe(false);
  expect(q('.window3d')).toBeNull();
  expect(r.dispose).toHaveBeenCalledTimes(1);
});

test('loading message, then resize before the first model with the full layer map', async () => {
  const { q } = setup();
  expect(q('.window3d')!.textContent).toContain('3D betöltése…');
  const r = await ready();
  expect(r.log.indexOf('resize')).toBeGreaterThanOrEqual(0);
  expect(r.log.indexOf('resize')).toBeLessThan(r.log.indexOf('setModel'));
  expect(r.log.indexOf('setVisible')).toBeLessThan(r.log.indexOf('setModel'));
  const [w, h] = r.resize.mock.calls[0] as [number, number];
  expect(w).toBeGreaterThan(0);
  expect(h).toBeGreaterThan(0);
  const model = r.setModel.mock.calls[0][0] as { layers: Layer3dId[] };
  const vis = r.setVisible.mock.calls[0][0] as Record<string, boolean>;
  expect(Object.keys(vis).sort()).toEqual([...model.layers].sort());
  expect(Object.values(vis).every(v => v === true)).toBe(true);
  expect(q('.window3d')!.textContent).not.toContain('3D betöltése…');
});

test('layer panel lists only present layers', async () => {
  const plan = createDefaultPlan();
  plan.roof.covering = 'shingle'; // zsindely: nincs ellenléc, nincs tetőléc
  const { ui, q, root } = setup({ plan });
  const r = await ready();
  await act(() => { fireEvent.click(q('[data-action="3d-layers"]')!); });
  const names = Array.from(root.querySelectorAll('.w3d-layers label')).map(l => l.textContent?.trim());
  expect(names).toContain('Falváz');
  expect(names).toContain('Tetőváz');
  expect(names).not.toContain('Ellenléc');
  expect(names).not.toContain('Tetőléc');
  const model = r.setModel.mock.calls[0][0] as { layers: Layer3dId[] };
  expect(root.querySelectorAll('.w3d-layers input[type="checkbox"]')).toHaveLength(model.layers.length);

  const ins = q<HTMLInputElement>('[data-layer3d="insulation"]')!;
  expect(ins.checked).toBe(true);
  await act(() => { fireEvent.click(ins); });
  expect(ui.get().view3d.layers.insulation).toBe(false);
  let vis = r.setVisible.mock.calls.at(-1)![0] as Record<string, boolean>;
  expect(vis.insulation).toBe(false);
  expect(Object.keys(vis).sort()).toEqual([...model.layers].sort());
  expect(q<HTMLInputElement>('[data-layer3d="insulation"]')!.checked).toBe(false);

  await act(() => { fireEvent.click(q('[data-action="3d-frame-only"]')!); });
  vis = r.setVisible.mock.calls.at(-1)![0] as Record<string, boolean>;
  for (const l of model.layers) expect(vis[l]).toBe(FRAME_ONLY.includes(l));
  for (const l of ALL) expect(ui.get().view3d.layers[l]).toBe(FRAME_ONLY.includes(l));

  await act(() => { fireEvent.click(q('[data-action="3d-all"]')!); });
  vis = r.setVisible.mock.calls.at(-1)![0] as Record<string, boolean>;
  for (const l of model.layers) expect(vis[l]).toBe(true);
});

test('preset buttons call setView', async () => {
  const { root } = setup();
  const r = await ready();
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preset]'));
  expect(buttons.map(b => b.textContent)).toEqual(['Persp.', 'É', 'K', 'D', 'Ny', 'Felül', '⟲']);
  for (const b of buttons) await act(() => { fireEvent.click(b); });
  expect(r.setView.mock.calls.map(c => c[0])).toEqual(['persp', 'N', 'E', 'S', 'W', 'top', 'persp']);
});

test('click on element selects and opens detail', async () => {
  const { ui, q } = setup();
  const r = await ready();
  const stud = sceneFor(createDefaultPlan()).elements.find(e => e.group === 'wall.E' && e.kind === 'stud')!;
  fake.pick = { elementId: stud.id, label: stud.label };
  const canvas = q<HTMLCanvasElement>('.window3d canvas')!;
  expect(r.canvas).toBe(canvas);
  // húzás (> 4 px): nincs kijelölés
  await act(() => {
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 110, clientY: 100, pointerId: 1 });
  });
  expect(ui.get().selected).toBeNull();
  await act(() => {
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 102, clientY: 101, pointerId: 1 });
  });
  expect(ui.get()).toMatchObject({ selected: stud.id, detailOpen: true, view: 'wall.E' });
  // szintetizált lap (nincs elementId): nincs kijelölés-változás
  act(() => ui.set({ selected: null, detailOpen: false }));
  fake.pick = { label: 'Szigetelés' };
  await act(() => {
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
  });
  expect(ui.get().selected).toBeNull();
});

test('hover shows the label bubble', async () => {
  const { q } = setup();
  const r = await ready();
  fake.pick = { elementId: 'x', label: 'Oszlop 45×95' };
  const canvas = q<HTMLCanvasElement>('.window3d canvas')!;
  await act(() => { fireEvent.pointerMove(canvas, { clientX: 50, clientY: 60, buttons: 0, pointerId: 1 }); });
  await vi.waitFor(() => expect(r.setHover).toHaveBeenCalledWith('x'));
  await vi.waitFor(() => expect(q('.w3d-tip')?.textContent).toBe('Oszlop 45×95'));
  await act(() => { fireEvent.pointerLeave(canvas, { pointerId: 1 }); });
  expect(r.setHover).toHaveBeenLastCalledWith(null);
  expect(q('.w3d-tip')).toBeNull();
});

test('selection from 2D highlights in 3D', async () => {
  const { ui } = setup();
  const r = await ready();
  act(() => ui.set({ selected: 'wall.N.stud.2' }));
  expect(r.setHighlight).toHaveBeenLastCalledWith(['wall.N.stud.2']);
  act(() => ui.set({ selected: null }));
  expect(r.setHighlight).toHaveBeenLastCalledWith([]);
});

test('plan change rebuilds the model after a debounce', async () => {
  const { store } = setup();
  const r = await ready();
  vi.useFakeTimers();
  act(() => store.update(p => { p.building.width = 3600; }));
  act(() => store.update(p => { p.building.width = 4000; }));
  act(() => { vi.advanceTimersByTime(50); });
  expect(r.setModel).toHaveBeenCalledTimes(1);
  act(() => { vi.advanceTimersByTime(60); });
  expect(r.setModel).toHaveBeenCalledTimes(2);
  const m = r.setModel.mock.calls[1][0] as { bounds: { max: number[] } };
  expect(m.bounds.max[0]).toBeGreaterThanOrEqual(4000);
});

test('webgl missing shows message', async () => {
  fake.fail = new Error('webgl');
  const { q } = setup();
  await vi.waitFor(() => expect(q('.window3d')!.textContent).toContain('A 3D nézethez WebGL-képes böngésző szükséges.'));
  expect(q('[data-action="3d-retry"]')).toBeNull();
});

test('import failure shows retry, and retry tries again with a fresh canvas', async () => {
  const real = rendererLoader.load;
  const spy = vi.spyOn(rendererLoader, 'load').mockImplementationOnce(() => Promise.reject(new Error('chunk')));
  const { q } = setup();
  await vi.waitFor(() => expect(q('.window3d')!.textContent).toContain('A 3D nézet nem tölthető be.'));
  expect(fake.instances).toHaveLength(0);
  const oldCanvas = q('.window3d canvas');
  spy.mockImplementation(real);
  await act(() => { fireEvent.click(q('[data-action="3d-retry"]')!); });
  const r = await ready();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(r.canvas).not.toBe(oldCanvas);
  expect(q('.window3d')!.textContent).not.toContain('A 3D nézet nem tölthető be.');
});

test('reopening creates a new renderer on a new canvas', async () => {
  const { ui } = setup();
  const first = await ready();
  act(() => ui.set({ view3d: { ...ui.get().view3d, open: false } }));
  expect(first.dispose).toHaveBeenCalledTimes(1);
  act(() => ui.set({ view3d: { ...ui.get().view3d, open: true } }));
  await vi.waitFor(() => expect(fake.instances).toHaveLength(2));
  expect(last().canvas).not.toBe(first.canvas);
});

test('default position is the bottom right corner', () => {
  const { q } = setup();
  expect(box(q('.window3d')!)).toEqual({ x: 800 - 420 - 16, y: 600 - 320 - 16, w: 420, h: 320 });
});

test('maximize and restore', async () => {
  const { ui, q } = setup();
  const r = await ready();
  await act(() => { fireEvent.click(q('[data-action="3d-max"]')!); });
  expect(ui.get().view3d.maximized).toBe(true);
  expect(box(q('.window3d')!)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  expect(r.resize.mock.calls.length).toBeGreaterThan(1);
  await act(() => { fireEvent.click(q('[data-action="3d-max"]')!); });
  expect(ui.get().view3d.maximized).toBe(false);
  expect(box(q('.window3d')!)).toEqual({ x: 364, y: 264, w: 420, h: 320 });
});

test('close button closes the window', async () => {
  const { ui, q } = setup();
  const r = await ready();
  await act(() => { fireEvent.click(q('[data-action="3d-close"]')!); });
  expect(ui.get().view3d.open).toBe(false);
  expect(r.dispose).toHaveBeenCalled();
});

test('drag keeps window inside canvas', async () => {
  const { ui, q } = setup();
  const head = q('.w3d-head')!;
  await act(() => {
    fireEvent.pointerDown(head, { button: 0, clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: -5000, clientY: -5000, pointerId: 1, buttons: 1 });
  });
  expect(box(q('.window3d')!)).toMatchObject({ x: 0, y: 0 });
  await act(() => {
    fireEvent.pointerMove(head, { clientX: 5000, clientY: 5000, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(head, { clientX: 5000, clientY: 5000, pointerId: 1 });
  });
  expect(ui.get().view3d).toMatchObject({ x: 800 - 420, y: 600 - 320, w: 420, h: 320 });

  // átméretezés: a vásznon belül, legalább 240×180
  const grip = q('.w3d-resize')!;
  await act(() => {
    fireEvent.pointerDown(grip, { button: 0, clientX: 800, clientY: 600, pointerId: 2 });
    fireEvent.pointerMove(grip, { clientX: 0, clientY: 0, pointerId: 2, buttons: 1 });
    fireEvent.pointerUp(grip, { clientX: 0, clientY: 0, pointerId: 2 });
  });
  expect(ui.get().view3d).toMatchObject({ x: 380, y: 280, w: 240, h: 180 });
  await act(() => {
    fireEvent.pointerDown(head, { button: 0, clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: 0, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(head, { clientX: 0, clientY: 0, pointerId: 1 });
  });
  await act(() => {
    fireEvent.pointerDown(grip, { button: 0, clientX: 240, clientY: 180, pointerId: 2 });
    fireEvent.pointerMove(grip, { clientX: 9000, clientY: 9000, pointerId: 2, buttons: 1 });
    fireEvent.pointerUp(grip, { clientX: 9000, clientY: 9000, pointerId: 2 });
  });
  expect(ui.get().view3d).toMatchObject({ x: 0, y: 0, w: 800, h: 600 });
});

test('keys inside the 3D window do not reach the 2D shortcuts', async () => {
  const { q } = setup();
  await ready();
  const outer = vi.fn();
  document.addEventListener('keydown', outer);
  fireEvent.keyDown(q('.window3d canvas')!, { key: 'Escape' });
  document.removeEventListener('keydown', outer);
  expect(outer).not.toHaveBeenCalled();
});
