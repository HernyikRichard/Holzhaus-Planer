// @vitest-environment jsdom
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { Viewer } from '../../src/app/Viewer';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(step: 'walls' | 'roof' = 'walls') {
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step });
  const r = render(<Viewer store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const texts = (sel: string) => Array.from(root.querySelectorAll(sel)).map(e => e.textContent?.trim());
  return { store, ui, root, texts };
}

test('view switch only offers views of the step', () => {
  const { texts, root } = setup('walls');
  expect(texts('[data-view]')).toEqual(['Alaprajz', 'É fal', 'K fal', 'D fal', 'Ny fal', 'Metszet']);
  expect(root.querySelector('[data-view="roof"]')).toBeNull();
});
test('view button changes ui view', () => {
  const { ui, root } = setup('walls');
  fireEvent.click(root.querySelector('[data-view="wall.N"]')!);
  expect(ui.get().view).toBe('wall.N');
});
test('layer toggle updates ui store', () => {
  const { ui, root } = setup('walls');
  ui.set({ view: 'floor' });
  const box = root.querySelector<HTMLInputElement>('[data-layer="fasteners"]')!;
  expect(box.checked).toBe(true);
  fireEvent.click(box);
  expect(ui.get().layers.fasteners).toBe(false);
  expect(root.querySelector('[data-layer="battens"]')).toBeNull();
});
test('zoom buttons exist and store a camera', () => {
  const { ui, root } = setup('walls');
  expect(root.querySelector('[data-action="zoom-in"]')).not.toBeNull();
  fireEvent.click(root.querySelector('[data-action="zoom-in"]')!);
  expect(ui.get().cameras[ui.get().view]).toBeDefined();
});
test('grid layer toggles the grid rect', () => {
  const { ui, root } = setup('walls');
  expect(root.querySelector('[data-grid]')).not.toBeNull();
  fireEvent.click(root.querySelector('[data-layer="grid"]')!);
  expect(ui.get().layers.grid).toBe(false);
  expect(root.querySelector('[data-grid]')).toBeNull();
});
test('canvas draws the selected view from the scene', () => {
  const { ui, root } = setup('walls');
  act(() => ui.set({ view: 'wall.N' }));
  expect(root.querySelector('[data-el^="wall.E."]')).toBeNull();
  act(() => ui.set({ view: 'wall.E' }));
  expect(root.querySelector('[data-placeholder]')).toBeNull();
  expect(root.querySelector('[data-el^="wall.E.stud."]')).not.toBeNull();
  expect(root.querySelector('[data-fx]')).not.toBeNull();
});
test('opening-only error: wall view shows the current plan with the invalid opening marked', () => {
  const { store, ui, root } = setup('walls');
  act(() => ui.set({ view: 'wall.E' }));
  act(() => store.update(d => { d.openings[1].offset = 3800; }));
  expect(store.get().errors.length).toBeGreaterThan(0);
  const g = root.querySelector('[data-opening-id="window-1"]')!;
  expect(g.getAttribute('class')).toContain('invalid');
  act(() => ui.set({ view: 'floor' }));
  expect(root.querySelector('[data-opening-id="window-1"]')!.getAttribute('class')).toContain('invalid');
  act(() => store.update(d => { d.openings[1].offset = 1500; }));
  expect(root.querySelector('.invalid')).toBeNull();
});
test('svg carries --mmpx (world mm per screen px) for screen-constant labels', () => {
  const { root } = setup('walls');
  const svg = root.querySelector<SVGSVGElement>('.viewer-canvas svg')!;
  const v = Number(svg.style.getPropertyValue('--mmpx'));
  const [, , w] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  expect(v).toBeCloseTo(w / 800, 6);
});
