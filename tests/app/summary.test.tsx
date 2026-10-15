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
  expect(root.textContent).toContain('5×10 cm: 32 szál');
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
test('summary is hidden on the materials step', () => {
  const { root } = setup('materials');
  expect(root.textContent).toBe('');
});

test('section labels: mm below 30 mm, cm otherwise', () => {
  const line = (id: string): MaterialLine => ({ id, category: 'Fal', name: 'x', quantity: 2, unit: 'szál', explanation: '' });
  const rows = summaryRows([line('timber.Fal.24x48.3'), line('timber.Fal.50x100.3'), line('timber.Fal.20x100.4')], ['Fal']);
  expect(rows.map(r => r.text).sort()).toEqual(['20×100 mm: 2 szál', '24×48 mm: 2 szál', '5×10 cm: 2 szál']);
});
