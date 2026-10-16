// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import type { StepId } from '../../src/app/steps';
import { StepSummary, summaryRows } from '../../src/app/StepSummary';
import type { MaterialLine } from '../../src/calc/types';

function setup(step: StepId) {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step });
  const r = render(<StepSummary store={store} ui={ui} />);
  return { store, ui, root: r.container as HTMLElement };
}
afterEach(cleanup);

test('summary shows wall timber', () => {
  const { root } = setup('walls');
  expect(root.textContent).toContain('5×10 cm: 30 szál');
});
test('summary has at most 5 rows, timber first', () => {
  const { root } = setup('roof');
  const rows = root.querySelectorAll('.summary-row');
  expect(rows.length).toBeLessThanOrEqual(5);
  expect(rows[0].textContent).toContain('szál');
});
test('summary button opens the material list', () => {
  const { ui } = setup('foundation');
  fireEvent.click(screen.getByRole('button', { name: /Teljes anyaglista/ }));
  expect(ui.get().step).toBe('materials');
});
test('materials step: no rows, total still shown', () => {
  const { root } = setup('materials');
  expect(root.querySelectorAll('.summary-row').length).toBe(0);
  expect(root.textContent).toContain('≈');
});
test('total shows on every step and opens the cost view', () => {
  const { ui, root } = setup('building');
  const btn = screen.getByRole('button', { name: 'Becsült végösszeg – költség megnyitása' });
  expect(btn.textContent).toMatch(/^≈\s\d[\d\s]*Ft/);
  expect(root.textContent).toContain('Ft');
  fireEvent.click(btn);
  expect(ui.get().step).toBe('materials');
  expect(ui.get().view).toBe('cost');
});

test('section labels: mm below 30 mm, cm otherwise', () => {
  const line = (id: string): MaterialLine => ({ id, category: 'Fal', name: 'x', quantity: 2, unit: 'szál', explanation: '' });
  const rows = summaryRows([line('timber.Fal.24x48.3'), line('timber.Fal.50x100.3'), line('timber.Fal.20x100.4')], ['Fal']);
  expect(rows.map(r => r.text).sort()).toEqual(['20×100 mm: 2 szál', '24×48 mm: 2 szál', '5×10 cm: 2 szál']);
});
