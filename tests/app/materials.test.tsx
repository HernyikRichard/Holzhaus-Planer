// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { MaterialTable } from '../../src/app/MaterialTable';
import { CutPlanView } from '../../src/app/CutPlanView';
import { App } from '../../src/app/App';

function setup() {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'materials' });
  return { store, ui };
}
afterEach(cleanup);

test('search filters rows, accent-insensitive', () => {
  const { store, ui } = setup();
  const { container } = render(<MaterialTable store={store} ui={ui} />);
  expect(container.textContent).toContain('Beton');
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'cserep' } });
  const names = Array.from(container.querySelectorAll('.line .name')).map(n => n.textContent ?? '');
  expect(names.some(n => n.includes('Cserép'))).toBe(true);
  expect(names.some(n => n.includes('Beton'))).toBe(false);
});
test('row click highlights on drawing', () => {
  const { store, ui } = setup();
  const { container } = render(<MaterialTable store={store} ui={ui} />);
  const row = Array.from(container.querySelectorAll('.line')).find(l => l.textContent?.includes('Külső OSB lap'))!;
  fireEvent.click(row.querySelector('button.show')!);
  expect(ui.get().step).toBe('walls');
  expect(ui.get().view.startsWith('wall.')).toBe(true);
  expect(ui.get().highlight.length).toBeGreaterThan(0);
  expect(ui.get().layers.sheathing).toBe(true);
});
test('stale notice when the plan is invalid', () => {
  const { store, ui } = setup();
  store.update(d => { d.walls.studSpacing = -5; });
  const { container } = render(<MaterialTable store={store} ui={ui} />);
  expect(container.textContent).toContain('utolsó érvényes állapotot');
});
test('cut plan: click on a piece selects the element in its view', () => {
  const { store, ui } = setup();
  const { container } = render(<CutPlanView store={store} ui={ui} />);
  const piece = container.querySelector('button[data-piece]') as HTMLElement;
  fireEvent.click(piece);
  expect(ui.get().selected).toBe(piece.getAttribute('data-piece'));
  expect(ui.get().step).not.toBe('materials');
  expect(ui.get().detailOpen).toBe(true);
});
test('materials step shows tabs instead of the canvas', () => {
  const { store, ui } = setup();
  const { container } = render(<App store={store} ui={ui} />);
  expect(container.querySelector('svg[aria-label]')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Vágási terv' }));
  expect(ui.get().view).toBe('cutplan');
  expect(container.querySelector('.cutstrip')).not.toBeNull();
});

test('empty state when the search matches nothing', () => {
  const { store, ui } = setup();
  const { container } = render(<MaterialTable store={store} ui={ui} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
  expect(container.textContent).toContain('Nincs találat a(z) „zzzz” keresésre.');
  expect(container.querySelectorAll('.line').length).toBe(0);
});
test('cut plan headings carry the right unit and identical sticks are grouped', () => {
  const { store, ui } = setup();
  const { container } = render(<CutPlanView store={store} ui={ui} />);
  const heads = Array.from(container.querySelectorAll('h3')).map(h => h.textContent);
  expect(heads).toContain('Fal – 24×48 mm');
  expect(heads).toContain('Fal – 5×10 cm');
  expect(container.textContent).not.toContain('24×48 cm');
  expect(container.textContent).toMatch(/\d+ db 5 m-es szál/);
  expect(container.querySelectorAll('.cut-variant').length).toBeGreaterThan(0);
});

test('timber row: summary click only expands the explanation, the "Mutasd a rajzon" button navigates', () => {
  const { store, ui } = setup();
  const { container } = render(<MaterialTable store={store} ui={ui} />);
  const row = Array.from(container.querySelectorAll<HTMLElement>('.line')).find(l => l.dataset.id!.startsWith('timber.'))!;
  expect((row as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(row.querySelector('summary')!);
  expect((row as HTMLDetailsElement).open).toBe(true);
  expect(ui.get().step).toBe('materials');
  expect(ui.get().highlight).toEqual([]);
  const btn = row.querySelector<HTMLButtonElement>('button.show')!;
  expect(btn.getAttribute('aria-label')).toBe('Mutasd a rajzon');
  fireEvent.click(btn);
  expect(ui.get().step).not.toBe('materials');
  expect(ui.get().highlight.length).toBeGreaterThan(0);
  expect((row as HTMLDetailsElement).open).toBe(true); // a gomb nem csukja be
  fireEvent.click(row.querySelector('summary')!);
  expect((row as HTMLDetailsElement).open).toBe(false);
});
test('search query and open rows survive leaving and re-entering the table', () => {
  const { store, ui } = setup();
  const first = render(<MaterialTable store={store} ui={ui} />);
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'cserép' } });
  const row = first.container.querySelector<HTMLElement>('.line')!;
  const id = row.dataset.id!;
  fireEvent.click(row.querySelector('summary')!);
  first.unmount();
  const second = render(<MaterialTable store={store} ui={ui} />);
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('cserép');
  expect((second.container.querySelector(`.line[data-id="${id}"]`) as HTMLDetailsElement).open).toBe(true);
});
