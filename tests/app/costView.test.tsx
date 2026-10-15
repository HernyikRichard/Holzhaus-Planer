// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { CostView } from '../../src/app/CostView';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { costOf, orderList } from '../../src/pricing/cost';
import { formatFt } from '../../src/ui/format';

function setup() {
  localStorage.clear();
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  ui.set({ step: 'materials', view: 'cost' });
  const view = render(<CostView store={store} ui={ui} />);
  const cost = () => costOf(store.get().plan, store.get().output, BUNDLED_PRICE_LIST!);
  return { store, ui, view, cost };
}
afterEach(cleanup);

test('cart shows merged order rows and the Káplár subtotal', () => {
  const { view, cost } = setup();
  const rows = orderList(cost());
  expect(rows.length).toBeGreaterThan(0);
  const trs = view.container.querySelectorAll('.cart-table tbody tr');
  expect(trs.length).toBe(rows.length);
  expect(new Set(rows.map(r => r.productId)).size).toBe(rows.length);
  const first = view.container.querySelector(`tr[data-product="${rows[0].productId}"]`)!;
  expect(first.textContent).toContain(formatFt(rows[0].total));
  expect((first.querySelector('a') as HTMLAnchorElement).getAttribute('target')).toBe('_blank');
  expect(view.container.querySelector('.cart-subtotal')!.textContent).toBe(formatFt(cost().kaplarSubtotal));
});

test('grand total = material subtotals + shipping', () => {
  const { view, cost } = setup();
  const c = cost();
  expect(c.total).toBe(c.kaplarSubtotal + c.otherSubtotal + c.shipping);
  expect(view.container.querySelector('.grand-total')!.textContent).toBe(formatFt(c.total));
});

test('pickup zeroes the shipping', () => {
  const { store, view, cost } = setup();
  store.update(d => { d.pricing.shippingFee = 20000; });
  expect(cost().shipping).toBe(20000);
  fireEvent.click(screen.getByLabelText('Személyes átvétel'));
  expect(store.get().plan.pricing.pickup).toBe(true);
  expect(cost().shipping).toBe(0);
  expect(view.container.querySelector('.shipping-value')!.textContent).toContain('0 Ft');
  expect(view.container.querySelector('.grand-total')!.textContent).toBe(formatFt(cost().total));
});

test('a typed shipping fee applies and an empty field restores the automatic one', () => {
  const { store, view, cost } = setup();
  const auto = cost().shipping;
  const input = () => view.container.querySelector('.shipping-fee') as HTMLInputElement;
  fireEvent.change(input(), { target: { value: '12345' } });
  expect(store.get().plan.pricing.shippingFee).toBe(12345);
  expect(cost().shipping).toBe(12345);
  expect(view.container.querySelector('.shipping-value')!.textContent).toBe(formatFt(12345));
  fireEvent.change(input(), { target: { value: '' } });
  expect('shippingFee' in store.get().plan.pricing).toBe(false);
  expect(cost().shipping).toBe(auto);
});

test('missing items warning and the Mutasd button', () => {
  const { store, ui, view, cost } = setup();
  const n = cost().missingCount;
  if (n === 0) {
    expect(view.container.querySelector('.warn-card')).toBeNull();
    return;
  }
  expect(screen.getByText(`${n} tétel ára hiányzik`)).toBeTruthy();
  fireEvent.click(screen.getByText('Mutasd'));
  expect(ui.get().view).toBe('table');
  expect(ui.get().matOnlyMissing).toBe(true);
  expect(store.get().plan).toBeTruthy();
});

test('other-source lines get a PriceCell; entering a price lowers the missing count', () => {
  const { view, cost } = setup();
  const miss = cost().lines.find(l => l.source === 'missing' && !l.informational);
  expect(miss).toBeTruthy();
  const li = view.container.querySelector(`.other-list li[data-id="${miss!.lineId}"]`)!;
  expect(li.textContent).toContain('—');
  const before = cost().missingCount;
  fireEvent.click(li.querySelector('button.price-btn')!);
  const input = screen.getByLabelText('Egységár') as HTMLInputElement;
  fireEvent.input(input, { target: { value: '1000' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(cost().missingCount).toBe(before - 1);
});

test('category bars only for categories with a total and the footer note has the Hungarian date', () => {
  const { view, cost } = setup();
  const c = cost();
  const withTotal = Object.entries(c.byCategory).filter(([, v]) => v > 0).length;
  expect(view.container.querySelectorAll('.bar-row').length).toBe(withTotal);
  expect(view.container.querySelector(".bar-label")!.textContent).toMatch(/\sFt \(\d+%\)$/);
  const [y, m, d] = BUNDLED_PRICE_LIST!.fetchedAt.slice(0, 10).split('-');
  expect(view.container.querySelector('.cost-note')!.textContent).toContain(`Káplár Fatelep, ${y}. ${m}. ${d}. – bruttó, tájékoztató jellegű.`);
});

test('informational foundation rows show a tag instead of a price cell and are not counted missing', () => {
  const { view, cost } = setup();
  const li = view.container.querySelector('.other-list li[data-id="foundation.concrete"]')!;
  expect(li.textContent).toContain('tájékoztató');
  expect(li.querySelector('button.price-btn')).toBeNull();
  const c = cost();
  expect(c.missingCount).toBe(c.lines.filter(l => l.total === undefined && !l.informational).length);
});

test('without a price list only the "Nincs árlista" message shows', async () => {
  vi.resetModules();
  vi.doMock('../../src/prices', () => ({ BUNDLED_PRICE_LIST: null }));
  const { CostView: CV } = await import('../../src/app/CostView');
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  const { container } = render(<CV store={store} ui={ui} />);
  expect(container.textContent).toBe('Nincs árlista');
  vi.doUnmock('../../src/prices');
});

test('matOnlyMissing resets on step change', () => {
  const ui = createUiStore();
  ui.set({ matOnlyMissing: true });
  ui.set({ step: 'roof' });
  expect(ui.get().matOnlyMissing).toBe(false);
});
