// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import type { StepId } from '../../src/app/steps';
import { StepPanel } from '../../src/app/StepPanel';
import { TopBar } from '../../src/app/TopBar';
import { SECTIONS } from '../../src/ui/fields';
import { MaterialsSettingsStep } from '../../src/app/steps/MaterialsSettingsStep';

vi.mock('../../src/export/pdf', () => ({ exportPdf: vi.fn() }));

function setup(step: StepId = 'building') {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step });
  const r = render(<StepPanel store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const field = <T extends HTMLElement>(p: string) => root.querySelector<T>(`[data-path="${p}"]`)!;
  const set = (p: string, v: string) => { const i = field<HTMLInputElement>(p); i.value = v; fireEvent.change(i); };
  return { store, ui, root, field, set };
}
afterEach(cleanup);

test('editing width in meters updates plan in mm', () => {
  const { store, set } = setup();
  set('building.width', '4,5');
  expect(store.get().plan.building.width).toBe(4500);
});
test('invalid field is marked', () => {
  const { store, field } = setup();
  act(() => store.update(p => { p.building.width = 500; }));
  expect(field('building.width').getAttribute('aria-invalid')).toBe('true');
});
test('invalid text is flagged and does not change the plan', () => {
  const { store, field, root, set } = setup();
  set('building.width', 'abc');
  expect(field('building.width').getAttribute('aria-invalid')).toBe('true');
  expect(root.textContent).toContain('Érvénytelen szám');
  expect(store.get().plan.building.width).toBe(3000);
});
test('store error shows message and error class', () => {
  const { store, field, root } = setup();
  act(() => store.update(p => { p.building.width = 500; }));
  expect(field('building.width').classList.contains('error')).toBe(true);
  expect(root.textContent).toContain('Szélesség: 1000–12000 mm');
});
test('locally invalid text survives a re-render', () => {
  const { store, field, root, set } = setup();
  set('building.width', 'abc');
  act(() => store.update(p => { p.building.length = 5000; }));
  expect(field<HTMLInputElement>('building.width').value).toBe('abc');
  expect(field('building.width').getAttribute('aria-invalid')).toBe('true');
  expect(root.textContent).toContain('Érvénytelen szám');
});
test('local invalid marks are cleared when the plan is replaced', () => {
  const { store, field, set } = setup();
  set('building.width', 'abc');
  act(() => store.update(p => { p.name = 'x'; }));
  expect(field<HTMLInputElement>('building.width').value).toBe('abc');
  act(() => store.replace(createDefaultPlan()));
  expect(field<HTMLInputElement>('building.width').value).toBe('3');
  expect(field('building.width').getAttribute('aria-invalid')).toBeNull();
});
test('section, percent and layer fields map to the plan', () => {
  const w = setup('walls');
  w.set('walls.studSection.w', '120');
  fireEvent.click(w.field<HTMLInputElement>('walls.layers.1.enabled'));
  expect(w.store.get().plan.walls.studSection.w).toBe(120);
  expect(w.store.get().plan.walls.layers[1].enabled).toBe(false);
  cleanup();
  const m = setup('materials');
  m.set('settings.waste.timber', '12');
  expect(m.store.get().plan.settings.waste.timber).toBeCloseTo(0.12);
});
test('section field shows range errors of its t/w parts', () => {
  const { store, field, root } = setup('walls');
  act(() => store.update(p => { p.walls.studSection.w = 5; }));
  expect(field('walls.studSection.w').getAttribute('aria-invalid')).toBe('true');
  expect(Array.from(root.querySelectorAll('.field-error')).some(e => e.textContent !== '')).toBe(true);
});
test('choosing "Nincs szigetelés" sets floor insulation to null', () => {
  const { store, field } = setup('foundation');
  expect(field<HTMLSelectElement>('floor.insulation.thickness').disabled).toBe(false);
  fireEvent.change(field('floor.insulation.type'), { target: { value: 'none' } });
  expect(store.get().plan.floor.insulation).toBeNull();
  expect(field<HTMLSelectElement>('floor.insulation.thickness').disabled).toBe(true);
  fireEvent.change(field('floor.insulation.type'), { target: { value: 'xps' } });
  expect(store.get().plan.floor.insulation).toEqual({ type: 'xps', thickness: 100 });
  fireEvent.change(field('floor.insulation.thickness'), { target: { value: '150' } });
  expect(store.get().plan.floor.insulation?.thickness).toBe(150);
});
test('wall layer material drives thickness', () => {
  const { store, field } = setup('walls');
  expect(field('walls.layers.3.thickness')).toBeNull();
  fireEvent.change(field('walls.layers.3.material'), { target: { value: 'osb15' } });
  expect(store.get().plan.walls.layers[3].thickness).toBe(15);
  fireEvent.change(field('walls.layers.0.material'), { target: { value: 'gypsum' } });
  expect(store.get().plan.walls.layers[0].thickness).toBe(12.5);
});
test('insulation and batten thickness inputs are gone; stud width drives them', () => {
  const { store, field, set } = setup('walls');
  expect(field('walls.layers.2.thickness')).toBeNull();
  expect(field('walls.layers.5.thickness')).toBeNull();
  set('walls.studSection.w', '150');
  const layers = store.get().plan.walls.layers;
  expect(layers[2].thickness).toBe(150);
  expect(layers[5].thickness).toBe(24);
});
test('roof shape icon buttons', () => {
  const { store } = setup('building');
  act(() => store.update(p => { p.roof.pitch = 3; })); // a nyereg-tartományon kívül
  const mono = screen.getByRole('button', { name: 'Félnyereg' });
  expect(mono.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(mono);
  expect(store.get().plan.roof.shape).toBe('mono');
  expect(store.get().plan.roof.pitch).toBe(10);
  expect(screen.getByRole('button', { name: 'Félnyereg' }).getAttribute('aria-pressed')).toBe('true');
  act(() => store.update(p => { p.roof.pitch = 40; }));
  fireEvent.click(screen.getByRole('button', { name: 'Lapos' }));
  expect(store.get().plan.roof.pitch).toBe(3);
  fireEvent.click(screen.getByRole('button', { name: 'Nyereg' }));
  expect(store.get().plan.roof.pitch).toBe(30);
  expect(store.get().errors).toEqual([]);
});
test('roof shape change keeps an in-range pitch', () => {
  const { store } = setup('building');
  act(() => store.update(p => { p.roof.pitch = 8; }));
  fireEvent.click(screen.getByRole('button', { name: 'Félnyereg' }));
  expect(store.get().plan.roof.pitch).toBe(8);
});
test('roof step has no shape select', () => {
  const { field } = setup('roof');
  expect(field('roof.shape')).toBeNull();
  expect(field('roof.pitch')).not.toBeNull();
});
test('step badge shows error for invalid field on another step', () => {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'walls' });
  const r = render(<><TopBar store={store} ui={ui} /><StepPanel store={store} ui={ui} /></>);
  act(() => store.update(p => { p.foundation.slabThickness = 10; }));
  expect(r.container.querySelector('[data-step="foundation"] .badge-error')).not.toBeNull();
  expect(r.container.querySelector('[data-step="walls"] .badge-error')).toBeNull();
  expect(store.get().lastValidPlan.foundation.slabThickness).not.toBe(10);
});

test('step panels together cover exactly the SECTIONS fields (roof.shape on Building only)', () => {
  const all = SECTIONS.flatMap(s => s.fields);
  const sectionPaths = new Set(all.filter(f => f.kind === 'section').map(f => f.path));
  const seen = new Set<string>();
  const stepsWithShape: StepId[] = [];
  for (const step of ['building', 'foundation', 'walls', 'roof', 'materials'] as StepId[]) {
    const { root } = setup(step);
    root.querySelectorAll<HTMLElement>('[data-path]').forEach(el => {
      const m = /^(.*)\.[tw]$/.exec(el.dataset.path!);
      seen.add(m && sectionPaths.has(m[1]) ? m[1] : el.dataset.path!);
    });
    if (root.querySelector('[data-section="roof-shape"]')) { seen.add('roof.shape'); stepsWithShape.push(step); }
    cleanup();
  }
  expect(stepsWithShape).toEqual(['building']);
  expect([...seen].sort()).toEqual(all.map(f => f.path).sort());
});

describe('Árak beállítások', () => {
  afterEach(() => vi.useRealTimers());
  const at = (d: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${d}T12:00:00`)); };

  test('the supply toggle sets pricing.useSupply and changes timber line ids', () => {
    const { store, root } = setup('materials');
    const ids = () => store.get().output.lines.filter(l => /^timber\.[^.]+\.50x1(00|50)\./.test(l.id)).map(l => l.id).sort();
    const box = root.querySelector<HTMLInputElement>('[data-pricing="useSupply"]')!;
    expect(box.checked).toBe(true);
    const on = ids();
    fireEvent.click(box);
    expect(store.get().plan.pricing.useSupply).toBe(false);
    expect(ids()).not.toEqual(on);
    expect(screen.getByLabelText('Káplár-kínálat szerint számol')).toBeTruthy();
  });
  test('shows the price list date', () => {
    at('2026-10-15');
    const { root } = setup('materials');
    expect(root.textContent).toContain('Árlista: Káplár Fatelep, 2026. 10. 15.');
    expect(root.textContent).not.toContain('npm run arak');
  });
  test('stale warning on day 61 but not on day 60', () => {
    at('2026-12-14'); // fetchedAt 2026-10-15 + 60 nap
    cleanup();
    expect(setup('materials').root.textContent).not.toContain('npm run arak');
    cleanup();
    at('2026-12-15');
    expect(setup('materials').root.textContent).toContain('Az árlista régi – frissítés: npm run arak');
  });
  test('no price list', () => {
    const store = createStore(createDefaultPlan());
    const r = render(<MaterialsSettingsStep store={store} priceList={null} />);
    expect(r.container.textContent).toContain('Nincs árlista');
  });
});
