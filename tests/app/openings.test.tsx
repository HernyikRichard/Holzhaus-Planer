// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import type { StepId } from '../../src/app/steps';
import { StepPanel } from '../../src/app/StepPanel';
import { Viewer } from '../../src/app/Viewer';
import { openingElementId } from '../../src/app/openingDrag';

// A jsdom nem ismeri a pointer-eseményeket: a Preact ezért nagybetűs eseménynevet kötne.
class PointerEventStub extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
}

beforeEach(() => {
  for (const n of ['down', 'move', 'up', 'cancel', 'leave']) {
    Object.defineProperty(Element.prototype, 'onpointer' + n, { value: null, configurable: true, writable: true });
  }
  vi.stubGlobal('PointerEvent', PointerEventStub);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  for (const n of ['down', 'move', 'up', 'cancel', 'leave']) delete (Element.prototype as unknown as Record<string, unknown>)['onpointer' + n];
});

function panel() {
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'openings' });
  const r = render(<StepPanel store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const row = (id: string) => root.querySelector<HTMLElement>(`[data-opening-row="${id}"]`)!;
  const field = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-opening-field="${k}"]`)!;
  return { store, ui, root, row, field };
}

test('list shows doors and windows, clicking a row selects the opening element and opens the detail', () => {
  const { store, ui, root, row } = panel();
  const rows = Array.from(root.querySelectorAll('[data-opening-row]')).map(r => r.textContent);
  expect(rows[0]).toContain('Ajtó #1');
  expect(rows[0]).toContain('D fal');
  expect(rows[0]).toContain('90×200 cm');
  expect(rows[1]).toContain('Ablak #1');
  fireEvent.click(row('window-1').querySelector('button')!);
  const id = openingElementId(store.get(), 'window-1')!;
  expect(ui.get().selected).toBe(id);
  expect(ui.get().detailOpen).toBe(true);
  expect(row('window-1').classList.contains('selected')).toBe(true);
  expect(row('door-1').classList.contains('selected')).toBe(false);
});

test('selection from the canvas highlights the row and shows its fields', () => {
  const { store, ui, root, field } = panel();
  expect(root.querySelector('[data-opening-field]')).toBeNull();
  act(() => ui.set({ selected: openingElementId(store.get(), 'door-1') }));
  expect(root.querySelector('[data-opening-row="door-1"].selected')).not.toBeNull();
  expect(field<HTMLInputElement>('offset').value).toBe('150');
});

test('type switch to window sets sill 1200, back to door sets 0', () => {
  const { store, ui, row, field } = panel();
  fireEvent.click(row('door-1').querySelector('button')!);
  fireEvent.change(field('type'), { target: { value: 'window' } });
  let o = store.get().plan.openings.find(x => x.id === 'door-1')!;
  expect(o.type).toBe('window');
  expect(o.sillHeight).toBe(1200);
  fireEvent.change(field('type'), { target: { value: 'door' } });
  o = store.get().plan.openings.find(x => x.id === 'door-1')!;
  expect(o.sillHeight).toBe(0);
  expect(ui.get().selected).toBe(openingElementId(store.get(), 'door-1'));
});

test('numeric field converts cm to mm, bad text is flagged and not stored', () => {
  const { store, row, field, root } = panel();
  fireEvent.click(row('door-1').querySelector('button')!);
  const w = field<HTMLInputElement>('width');
  w.value = '80,5'; fireEvent.change(w);
  expect(store.get().plan.openings[0].width).toBe(805);
  w.value = 'abc'; fireEvent.change(w);
  expect(w.getAttribute('aria-invalid')).toBe('true');
  expect(store.get().plan.openings[0].width).toBe(805);
  expect(root.textContent).toContain('Érvénytelen szám');
});

test('swing is only editable for doors; wall switch moves the opening', () => {
  const { store, row, field } = panel();
  fireEvent.click(row('window-1').querySelector('button')!);
  expect(field<HTMLSelectElement>('swing').disabled).toBe(true);
  fireEvent.change(field('wall'), { target: { value: 'W' } });
  expect(store.get().plan.openings[1].wall).toBe('W');
});

test('overlap error shows on the selected row', () => {
  const { store, row, root } = panel();
  act(() => store.update(d => { d.openings[1].wall = 'S'; d.openings[1].offset = 1600; }));
  fireEvent.click(row('window-1').querySelector('button')!);
  expect(row('window-1').classList.contains('has-error')).toBe(true);
  expect(root.textContent).toContain('átfedi');
});

test('"Új ajtó" adds a 900x2000 door at the first free spot of the S wall and selects it', () => {
  const { store, ui, root } = panel();
  fireEvent.click(screen.getByRole('button', { name: 'Új ajtó' }));
  const plan = store.get().plan;
  expect(plan.openings).toHaveLength(3);
  expect(plan.openings[2]).toMatchObject({ type: 'door', wall: 'S', width: 900, height: 2000, sillHeight: 0, offset: 150 });
  expect(store.get().errors).toEqual([]);
  expect(ui.get().selected).toBe(openingElementId(store.get(), plan.openings[2].id));
  expect(root.querySelectorAll('[data-opening-row]')).toHaveLength(3);
});

test('"Új ablak" adds a window at the first free spot', () => {
  const { store } = panel();
  fireEvent.click(screen.getByRole('button', { name: 'Új ablak' }));
  expect(store.get().plan.openings[2]).toMatchObject({ type: 'window', wall: 'S', width: 600, height: 600, sillHeight: 1200, offset: 150 });
  expect(store.get().errors).toEqual([]);
});

test('no free spot: message and nothing added', () => {
  const { store, root } = panel();
  act(() => store.update(d => { d.openings[0].offset = 700; d.openings[0].width = 1500; })); // 700–2200 az 150–2650 sávban
  fireEvent.click(screen.getByRole('button', { name: 'Új ajtó' }));
  expect(store.get().plan.openings).toHaveLength(2);
  expect(root.textContent).toContain('Nincs szabad hely ezen a falon.');
});

test('delete removes the opening and clears the selection', () => {
  const { store, ui, row } = panel();
  fireEvent.click(row('window-1').querySelector('button')!);
  fireEvent.click(screen.getByRole('button', { name: 'Törlés' }));
  expect(store.get().plan.openings.map(o => o.id)).toEqual(['door-1']);
  expect(ui.get().selected).toBeNull();
});

// --- húzás a vásznon ---
function viewer(step: StepId, view: 'floor' | 'wall.E') {
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step });
  ui.set({ view });
  const r = render(<Viewer store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const svg = root.querySelector<SVGSVGElement>('.viewer-canvas svg')!;
  const mmpx = () => Number(svg.style.getPropertyValue('--mmpx'));
  const win = () => root.querySelector<SVGGElement>('[data-opening-id="window-1"]')!;
  const down = (x = 100, y = 100) => fireEvent.pointerDown(win(), { button: 0, clientX: x, clientY: y, pointerId: 1 });
  const move = (x: number, y: number) => fireEvent.pointerMove(win(), { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
  const up = (x: number, y: number) => fireEvent.pointerUp(win(), { clientX: x, clientY: y, pointerId: 1 });
  return { store, ui, root, svg, mmpx, win, down, move, up };
}

test('dragging on wall view commits only on pointerup', () => {
  const v = viewer('walls', 'wall.E');
  const k = v.mmpx();
  v.down();
  v.move(100 - 500 / k, 100 - 100 / k); // E fal tükrözött: balra = +u; fel = +v
  expect(v.store.get().plan.openings[1]).toMatchObject({ offset: 1500, sillHeight: 1200 }); // a tár még változatlan
  expect(v.win().getAttribute('transform')).toMatch(/translate/);
  expect(v.root.querySelector('.temp-dims')).not.toBeNull();
  v.up(100 - 500 / k, 100 - 100 / k);
  expect(v.store.get().plan.openings[1]).toMatchObject({ offset: 2000, sillHeight: 1300 });
  expect(v.ui.get().selected).toBe(openingElementId(v.store.get(), 'window-1'));
  expect(v.root.querySelector('.temp-dims')).toBeNull();
  expect(v.win().getAttribute('transform')).toBeNull();
});

test('movement under 20 px is a click, not a drag', () => {
  const v = viewer('walls', 'wall.E');
  v.down();
  v.move(110, 110);
  expect(v.win().getAttribute('transform')).toBeNull();
  v.up(110, 110);
  expect(v.store.get().plan.openings[1]).toMatchObject({ offset: 1500, sillHeight: 1200 });
});

test('floor view: dragging moves the opening along its wall', () => {
  const v = viewer('openings', 'floor');
  const k = v.mmpx();
  v.down();
  v.move(100 + 300 / k, 100); // a D fal +u iránya jobbra, a K falé lefelé; az ablak a K falon van
  v.up(100 + 300 / k, 100);
  expect(v.store.get().plan.openings[1].offset).toBe(1500); // vízszintes mozgás a függőleges K falon nem változtat
  const v2 = viewer('openings', 'floor');
  const k2 = v2.mmpx();
  v2.down();
  v2.move(100, 100 + 300 / k2);
  v2.up(100, 100 + 300 / k2);
  expect(v2.store.get().plan.openings[1]).toMatchObject({ offset: 1800, sillHeight: 1200 });
});

test('no drag in steps other than Openings / Walls', () => {
  const v = viewer('building', 'floor');
  const k = v.mmpx();
  v.down();
  v.move(100, 100 + 300 / k);
  v.up(100, 100 + 300 / k);
  expect(v.store.get().plan.openings[1].offset).toBe(1500);
});

test('floor plan click on a wall opens the chooser; choosing adds an opening there', () => {
  const v = viewer('openings', 'floor');
  const wall = v.root.querySelector('[data-wall="S"] [data-el]')!;
  fireEvent.click(wall, { clientX: 150, clientY: 80 });
  const dialog = screen.getByRole('dialog', { name: 'Nyílászáró hozzáadása' });
  expect(dialog).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ablak' }));
  const added = v.store.get().plan.openings[2];
  expect(added).toMatchObject({ type: 'window', wall: 'S' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(v.ui.get().selected).toBe(openingElementId(v.store.get(), added.id));
});

test('chooser closes on Escape', () => {
  const v = viewer('openings', 'floor');
  fireEvent.click(v.root.querySelector('[data-wall="S"] [data-el]')!, { clientX: 150, clientY: 80 });
  expect(screen.queryByRole('dialog')).not.toBeNull();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('pointerup outside the canvas without a threshold move leaves no stale drag', () => {
  const v = viewer('walls', 'wall.E');
  const k = v.mmpx();
  v.down();
  // a felengedés a vásznon kívül történt: a vászon nem kap pointerup-ot; a következő mozgás gombnyomás nélkül érkezik
  fireEvent.pointerMove(v.svg, { clientX: 100 - 500 / k, clientY: 100, pointerId: 1, buttons: 0 });
  expect(v.win().getAttribute('transform')).toBeNull();
  expect(v.root.querySelector('.temp-dims')).toBeNull();
  expect(v.store.get().plan.openings[1]).toMatchObject({ offset: 1500, sillHeight: 1200 });
});

test('a new pointerdown discards a stale drag', () => {
  const v = viewer('walls', 'wall.E');
  v.down(100, 100);
  v.down(300, 300);
  const k = v.mmpx();
  v.move(300 - 500 / k, 300);
  v.up(300 - 500 / k, 300);
  expect(v.store.get().plan.openings[1].offset).toBe(2000); // a kezdőpont az új lenyomás
});

test('pointercancel reverts the preview without a store change', () => {
  const v = viewer('walls', 'wall.E');
  const k = v.mmpx();
  v.down();
  v.move(100 - 500 / k, 100);
  expect(v.win().getAttribute('transform')).toMatch(/translate/);
  fireEvent.pointerCancel(v.win(), { pointerId: 1 });
  expect(v.win().getAttribute('transform')).toBeNull();
  expect(v.root.querySelector('.temp-dims')).toBeNull();
  expect(v.store.get().plan.openings[1]).toMatchObject({ offset: 1500, sillHeight: 1200 });
});

test('opening added while another field is invalid stays selectable, editable and deletable', () => {
  const { store, ui, root, row, field } = panel();
  act(() => store.update(d => { d.building.wallHeight = 9000; }));
  expect(store.get().errors.length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Új ablak' }));
  const added = store.get().plan.openings[2];
  expect(added).toBeDefined();
  expect(ui.get().selectedOpening).toBe(added.id);
  expect(row(added.id).classList.contains('selected')).toBe(true);
  expect(field<HTMLInputElement>('width').value).toBe('60');
  const w = field<HTMLInputElement>('width');
  w.value = '70'; fireEvent.change(w);
  expect(store.get().plan.openings[2].width).toBe(700);
  expect(row(added.id).classList.contains('selected')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Törlés' }));
  expect(store.get().plan.openings).toHaveLength(2);
  expect(ui.get().selectedOpening).toBeNull();
  expect(root.querySelector('.opening-fields')).toBeNull();
});
