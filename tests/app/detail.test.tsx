// @vitest-environment jsdom
import { render, fireEvent, cleanup, screen, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { App } from '../../src/app/App';
import { buildScene } from '../../src/scene/build';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount() {
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'walls' });
  ui.set({ view: 'wall.N' });
  const r = render(<App store={store} ui={ui} />);
  return { store, ui, root: r.container as HTMLElement };
}
const canvas = (root: HTMLElement) => root.querySelector('.viewer-canvas svg') as SVGSVGElement;

test('click opens detail with cut plan', () => {
  const { ui, root } = mount();
  fireEvent.click(root.querySelector('[data-el="wall.N.stud.3"]')!);
  expect(ui.get().selected).toBe('wall.N.stud.3');
  expect(ui.get().detailOpen).toBe(true);
  expect(screen.getByText(/m-es szál #/)).toBeTruthy();
  expect(root.querySelector('.detail')!.textContent).toContain('Vágási terv');
  expect(root.querySelector('.detail')!.textContent).toContain('Rögzítések');
  expect(root.querySelector('.detail')!.textContent).toContain('Oszlop #3 · É fal');
  expect(root.querySelector('.hl')).not.toBeNull();
});
test('sibling click selects sibling', () => {
  const { ui, root } = mount();
  const sc = buildScene(createDefaultPlan());
  const sib = sc.cut['wall.N.stud.3'].siblings.find(id => sc.elements.some(e => e.id === id))!;
  act(() => ui.set({ selected: 'wall.N.stud.3', detailOpen: true }));
  fireEvent.click(root.querySelector(`.cutstrip [data-piece="${sib}"]`)!);
  expect(ui.get().selected).toBe(sib);
});
test('sibling in another view switches the view', () => {
  const { ui, root } = mount();
  const sc = buildScene(createDefaultPlan());
  const inEl = (id: string, f: (g: string) => boolean) => sc.elements.some(e => e.id === id && f(e.group));
  const id = Object.keys(sc.cut).find(k => inEl(k, g => g === 'wall.N')
    && sc.cut[k].siblings.some(s => inEl(s, g => g !== 'wall.N')))!;
  const sib = sc.cut[id].siblings.find(s => inEl(s, g => g !== 'wall.N'))!;
  act(() => ui.set({ selected: id, detailOpen: true }));
  fireEvent.click(root.querySelector(`.cutstrip [data-piece="${sib}"]`)!);
  expect(ui.get().selected).toBe(sib);
  expect(ui.get().view).not.toBe('wall.N');
});
test('selection clears when element disappears', () => {
  const { store, ui, root } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.6', detailOpen: true }));
  expect(root.querySelector('.detail')!.textContent).toContain('Oszlop #6');
  act(() => store.update(p => { p.walls.studSpacing = 1000; }));
  expect(ui.get().selected).toBeNull();
  expect(root.querySelector('.detail')!.textContent).not.toContain('Oszlop #6');
});
test('arrow keys move selection', () => {
  const { ui, root } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.3' }));
  fireEvent.keyDown(canvas(root), { key: 'ArrowRight' });
  expect(ui.get().selected).toBe('wall.N.stud.4');
  fireEvent.keyDown(canvas(root), { key: 'ArrowLeft' });
  expect(ui.get().selected).toBe('wall.N.stud.3');
});
test('Escape clears, Enter opens the detail, empty click clears', () => {
  const { ui, root } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.3', detailOpen: false }));
  fireEvent.keyDown(canvas(root), { key: 'Enter' });
  expect(ui.get().detailOpen).toBe(true);
  fireEvent.keyDown(canvas(root), { key: 'Escape' });
  expect(ui.get().selected).toBeNull();
  act(() => ui.set({ selected: 'wall.N.stud.3' }));
  fireEvent.click(canvas(root));
  expect(ui.get().selected).toBeNull();
});
test('Tab steps through elements and leaves the canvas at the ends', () => {
  const { ui, root } = mount();
  const c = canvas(root);
  expect(fireEvent.keyDown(c, { key: 'Tab' })).toBe(false); // az első elemre ugrik
  const first = ui.get().selected!;
  expect(first).toMatch(/^wall\.N\./);
  expect(fireEvent.keyDown(c, { key: 'Tab', shiftKey: true })).toBe(true); // az elsőről kilép
  expect(fireEvent.keyDown(c, { key: 'Tab' })).toBe(false);
  expect(ui.get().selected).not.toBe(first);
});
test('Bezárás collapses the panel and clears the selection', () => {
  const { ui } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.3', detailOpen: true }));
  fireEvent.click(screen.getByText('Bezárás'));
  expect(ui.get().detailOpen).toBe(false);
  expect(ui.get().selected).toBeNull();
});
test('clicking a fastener shows fastener info with linked element links', () => {
  const { ui } = mount();
  const sc = buildScene(createDefaultPlan());
  const f = sc.fasteners.find(x => x.group === 'wall.N' && x.elementIds.length > 0)!;
  act(() => ui.set({ selected: f.id, detailOpen: true }));
  const label = sc.elements.find(e => e.id === f.elementIds[0])!.label;
  const link = screen.getAllByText(label).find(n => n.tagName === 'BUTTON')!;
  fireEvent.click(link);
  expect(ui.get().selected).toBe(f.elementIds[0]);
});
test('opening detail has no cut plan', () => {
  const { ui, root } = mount();
  const sc = buildScene(createDefaultPlan());
  const o = sc.elements.find(e => e.kind === 'opening')!;
  act(() => ui.set({ selected: o.id, detailOpen: true, view: o.group as 'wall.N' }));
  expect(root.querySelector('.detail')!.textContent).not.toContain('Vágási terv');
  expect(root.querySelector('.detail')!.textContent).toMatch(/Ajtó|Ablak/);
});
test('OSB sheet detail shows the layout and order line', () => {
  const { ui, root } = mount();
  act(() => ui.set({ selected: 'wall.N.osbSheet.1', detailOpen: true }));
  expect(root.querySelector('.detail')!.textContent).toMatch(/kiosztás: \d+ darab \(ebből \d+ vágott\), rendelés: \d+ tábla/);
});
test('a middle-button pan does not swallow the next click', () => {
  const { ui, root } = mount();
  const c = canvas(root);
  const fire = (names: string[], init: MouseEventInit) => {
    for (const n of names) act(() => { c.dispatchEvent(new MouseEvent(n, { bubbles: true, ...init })); });
  };
  fire(['pointerdown', 'PointerDown'], { button: 1, clientX: 10, clientY: 10 });
  fire(['pointermove', 'PointerMove'], { clientX: 40, clientY: 40 });
  fire(['pointerup', 'PointerUp'], { button: 1 });
  fire(['pointerdown', 'PointerDown'], { button: 0 }); // a következő bal kattintás saját lenyomással indul
  fire(['pointerup', 'PointerUp'], { button: 0 });
  fireEvent.click(root.querySelector('[data-el="wall.N.stud.3"]')!);
  expect(ui.get().selected).toBe('wall.N.stud.3');
});
test('space+left pan released in any order does not select on the final click', () => {
  const { ui, root } = mount();
  const c = canvas(root);
  const stud = root.querySelector('[data-el="wall.N.stud.3"]')!;
  const fire = (names: string[], init: MouseEventInit) => {
    for (const n of names) act(() => { stud.dispatchEvent(new MouseEvent(n, { bubbles: true, ...init })); });
  };
  fireEvent.keyDown(c, { key: ' ' });
  fire(['pointerdown', 'PointerDown'], { button: 0, clientX: 10, clientY: 10 });
  fire(['pointermove', 'PointerMove'], { clientX: 40, clientY: 40 });
  act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' })); });
  fire(['pointerup', 'PointerUp'], { button: 0 });
  fireEvent.click(stud);
  expect(ui.get().selected).toBeNull();
});

test('Escape behaves like an empty click: clears selection and highlight, closes the detail', () => {
  const { ui, root } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.3', selectedOpening: 'door-1', highlight: ['wall.N.stud.4'], detailOpen: true }));
  fireEvent.keyDown(canvas(root), { key: 'Escape' });
  expect(ui.get()).toMatchObject({ selected: null, selectedOpening: null, highlight: [], detailOpen: false });
});
test('changing the step closes the detail', () => {
  const { ui } = mount();
  act(() => ui.set({ selected: 'wall.N.stud.3', detailOpen: true }));
  act(() => ui.set({ step: 'roof' }));
  expect(ui.get().detailOpen).toBe(false);
});

test('Tab skips elements of hidden layers (frame off: only OSB sheets are reachable)', () => {
  const { ui, root } = mount();
  act(() => ui.set({ layers: { ...ui.get().layers, frame: false } }));
  const c = canvas(root);
  fireEvent.keyDown(c, { key: 'Tab' });
  const first = ui.get().selected!;
  expect(first).toContain('.osbSheet.');
  for (let i = 0; i < 40; i++) fireEvent.keyDown(c, { key: 'Tab' });
  expect(ui.get().selected).toContain('.osbSheet.');
  act(() => ui.set({ selected: null, layers: { ...ui.get().layers, sheathing: false } }));
  expect(fireEvent.keyDown(c, { key: 'Tab' })).toBe(true); // nincs látható elem: marad az alapértelmezett fókuszlépés
  expect(ui.get().selected).toBeNull();
});
