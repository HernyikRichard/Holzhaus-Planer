// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { MaterialTable } from '../../src/app/MaterialTable';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { costOf } from '../../src/pricing/cost';
import { formatFt } from '../../src/ui/format';

function setup() {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'materials' });
  const view = render(<MaterialTable store={store} ui={ui} />);
  const cost = () => costOf(store.get().plan, store.get().output, BUNDLED_PRICE_LIST!);
  const timberLine = () => cost().lines.find(l => l.source === 'kaplar' && l.lineId.startsWith('timber.'))!;
  const row = (id: string) => view.container.querySelector(`.line[data-id="${id}"]`) as HTMLElement;
  return { store, ui, view, cost, timberLine, row };
}
afterEach(cleanup);

test('timber rows show the Káplár label, unit price, total and a product link', () => {
  const { timberLine, row } = setup();
  const l = timberLine();
  const r = row(l.lineId);
  expect(within(r).getByText('Káplár')).toBeTruthy();
  expect(r.textContent).toContain(formatFt(l.unitPrice!));
  expect(r.textContent).toContain(formatFt(l.total!));
  const a = r.querySelector('a') as HTMLAnchorElement;
  expect(a.getAttribute('href')).toBe(l.url);
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
});

test('category header shows the subtotal and the footer the material total', () => {
  const { view, cost, timberLine } = setup();
  const c = cost();
  const cat = view.container.querySelector(`details.category[data-category="${timberLine().category}"]`)!;
  expect(cat.querySelector('summary .subtotal')!.textContent).toContain(formatFt(c.byCategory[timberLine().category]));
  expect(view.container.querySelector('.material-total')!.textContent)
    .toContain(formatFt(c.kaplarSubtotal + c.otherSubtotal));
});

test('editing the price writes an override and updates the total', () => {
  const { store, timberLine, row, cost } = setup();
  const l = timberLine();
  fireEvent.click(row(l.lineId).querySelector('button.price-btn')!);
  const input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '1999,6' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(store.get().plan.pricing.overrides[l.lineId]).toBe(2000);
  const after = cost().lines.find(x => x.lineId === l.lineId)!;
  expect(after.total).toBe(Math.round(l.qty * 2000));
  expect(row(l.lineId).textContent).toContain(formatFt(after.total!));
  expect(within(row(l.lineId)).getByText('kézi')).toBeTruthy();
});

test('reset button removes the override', () => {
  const { store, timberLine, row } = setup();
  const l = timberLine();
  act(() => store.update(d => { d.pricing.overrides[l.lineId] = 5; }));
  fireEvent.click(within(row(l.lineId)).getByLabelText('Káplár-ár visszaállítása'));
  expect(store.get().plan.pricing.overrides[l.lineId]).toBeUndefined();
  expect(within(row(l.lineId)).getByText('Káplár')).toBeTruthy();
});

test.each(['abc', '-5'])('invalid price input is rejected: %s', bad => {
  const { store, timberLine, row } = setup();
  const l = timberLine();
  const before = store.get().plan;
  fireEvent.click(row(l.lineId).querySelector('button.price-btn')!);
  const input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: bad } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(row(l.lineId).textContent).toContain('Érvénytelen ár');
  expect(store.get().plan).toBe(before);
});

test('Escape cancels the edit, blur commits', () => {
  const { store, timberLine, row } = setup();
  const l = timberLine();
  fireEvent.click(row(l.lineId).querySelector('button.price-btn')!);
  let input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '77' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(store.get().plan.pricing.overrides[l.lineId]).toBeUndefined();
  expect(screen.queryByLabelText('Egységár')).toBeNull();
  fireEvent.click(row(l.lineId).querySelector('button.price-btn')!);
  input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '77' } });
  fireEvent.blur(input);
  expect(store.get().plan.pricing.overrides[l.lineId]).toBe(77);
});

test('other-source line (foundation) saves to pricing.custom', () => {
  const { store, cost, row } = setup();
  const l = cost().lines.find(x => x.otherSource)!;
  expect(within(row(l.lineId)).getByText('nincs ár')).toBeTruthy();
  expect(within(row(l.lineId)).getByText('máshonnan')).toBeTruthy();
  fireEvent.click(row(l.lineId).querySelector('button.price-btn')!);
  const input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '1500' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(store.get().plan.pricing.custom[l.lineId]).toBe(1500);
  expect(store.get().plan.pricing.overrides[l.lineId]).toBeUndefined();
  expect(within(row(l.lineId)).getByText('kézi')).toBeTruthy();
  fireEvent.click(within(row(l.lineId)).getByLabelText('Káplár-ár visszaállítása'));
  expect(store.get().plan.pricing.custom[l.lineId]).toBeUndefined();
});

test('product chooser writes productChoice; "automatikus" removes it', () => {
  const { store, timberLine, row, cost } = setup();
  const l = timberLine();
  const same = BUNDLED_PRICE_LIST!.products.filter(p => p.kind === 'timber' && p.id !== l.productId);
  const other = same[0];
  const chooser = row(l.lineId).querySelector('input.product-choice') as HTMLInputElement;
  fireEvent.change(chooser, { target: { value: other.name } });
  expect(store.get().plan.pricing.productChoice[l.lineId]).toBe(other.id);
  expect(cost().lines.find(x => x.lineId === l.lineId)!.productId).toBe(other.id);
  const chooser2 = row(l.lineId).querySelector('input.product-choice') as HTMLInputElement;
  fireEvent.change(chooser2, { target: { value: 'automatikus' } });
  expect(store.get().plan.pricing.productChoice[l.lineId]).toBeUndefined();
});

test('gone choice shows a warning', () => {
  const { store, timberLine, row } = setup();
  const l = timberLine();
  act(() => store.update(d => { d.pricing.productChoice[l.lineId] = 'no-such-product'; }));
  expect(row(l.lineId).textContent).toContain('A kiválasztott termék már nem elérhető');
});
