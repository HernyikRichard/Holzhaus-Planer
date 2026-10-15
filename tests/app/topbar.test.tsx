// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { TopBar } from '../../src/app/TopBar';

const exportPdf = vi.hoisted(() => vi.fn());
vi.mock('../../src/export/pdf', () => ({ exportPdf }));

function setup() {
  const store = createStore(createDefaultPlan());
  const ui = createUiStore();
  const r = render(<TopBar store={store} ui={ui} />);
  const root = r.container as HTMLElement;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  return { store, ui, root, q };
}

async function loadFile(root: HTMLElement, text: string): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'terv.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(() => { input.dispatchEvent(new Event('change')); });
}

beforeEach(() => {
  localStorage.clear();
  exportPdf.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('step buttons switch step', () => {
  const { ui } = setup();
  fireEvent.click(screen.getByRole('button', { name: /Tető/ }));
  expect(ui.get().step).toBe('roof');
  expect(ui.get().view).toBe('roof');
  expect(document.querySelector('[data-step="roof"]')!.getAttribute('aria-current')).toBe('step');
});

test('step badge shows ok, then error', () => {
  const { store } = setup();
  expect(screen.getByRole('button', { name: /Tető/ }).querySelector('.badge-ok')).not.toBeNull();
  act(() => store.update(p => { p.roof.pitch = 80; }));
  expect(screen.getByRole('button', { name: /Tető/ }).querySelector('.badge-error')).not.toBeNull();
});

test('invalid file shows alert and keeps store plan', async () => {
  const { store, root, q } = setup();
  const before = store.get().plan;
  await loadFile(root, 'nem json');
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('A fájl nem érvényes JSON.');
  expect(store.get().plan).toBe(before);
  await act(() => { q('[data-action="dismiss"]').click(); });
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

test('valid file replaces the plan', async () => {
  const { store, root } = setup();
  const p = createDefaultPlan(); p.name = 'Betöltött';
  await loadFile(root, JSON.stringify(p));
  await vi.waitFor(() => expect(store.get().plan.name).toBe('Betöltött'));
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

test('name input updates plan, new plan asks confirm', async () => {
  const { store, ui, q } = setup();
  const name = q<HTMLInputElement>('input[type="text"]');
  name.value = 'Kert'; await act(() => { name.dispatchEvent(new Event('change')); });
  expect(store.get().plan.name).toBe('Kert');
  ui.set({ selected: 'x' });
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await act(() => { q('[data-action="new"]').click(); });
  expect(confirmSpy).toHaveBeenCalledWith('Biztosan új tervet kezdesz? A nem mentett módosítások elvesznek.');
  expect(store.get().plan.name).toBe('Kert');
  expect(ui.get().selected).toBe('x');
  confirmSpy.mockReturnValue(true);
  await act(() => { q('[data-action="new"]').click(); });
  expect(store.get().plan.name).toBe('Új terv');
  expect(ui.get().selected).toBeNull();
  expect(q<HTMLInputElement>('input[type="text"]').value).toBe('Új terv');
});

test('save and csv call download with slugged filenames', () => {
  const { q } = setup();
  const names: string[] = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { names.push(this.download); };
  q('[data-action="save"]').click();
  q('[data-action="csv"]').click();
  HTMLAnchorElement.prototype.click = orig;
  expect(names).toEqual(['uj-terv.json', 'uj-terv-anyaglista.csv']);
});

test('exception during replace shows generic alert and store stays', async () => {
  const { store, root } = setup();
  const before = store.get().plan;
  store.replace = () => { throw new Error('boom'); };
  await loadFile(root, JSON.stringify(createDefaultPlan()));
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('A terv betöltése nem sikerült.');
  expect(store.get().plan).toBe(before);
});

test('structurally malformed file is rejected without touching the store', async () => {
  const { store, root } = setup();
  const before = store.get().plan;
  const p: any = createDefaultPlan(); p.openings = [null];
  await loadFile(root, JSON.stringify(p));
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('openings[0]');
  expect(store.get().plan).toBe(before);
});

describe('PDF export dialog', () => {
  test('PDF button is enabled and opens a dialog with four checked options', async () => {
    const { q } = setup();
    expect(q<HTMLButtonElement>('[data-action="pdf"]').disabled).toBe(false);
    await act(() => { q('[data-action="pdf"]').click(); });
    const dlg = q<HTMLDialogElement>('dialog');
    expect(dlg.hasAttribute('open')).toBe(true);
    expect(dlg.textContent).toContain('Rajzok');
    expect(dlg.textContent).toContain('Anyaglista');
    expect(dlg.textContent).toContain('Számítás oszlop');
    expect(dlg.textContent).toContain('Vágási terv');
    expect(Array.from(dlg.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).map(c => c.checked)).toEqual([true, true, true, true]);
  });

  test('the explanations checkbox is disabled while materials is off', async () => {
    const { q } = setup();
    await act(() => { q('[data-action="pdf"]').click(); });
    const mat = q<HTMLInputElement>('input[name="materials"]');
    const expl = q<HTMLInputElement>('input[name="explanations"]');
    await act(() => { fireEvent.click(mat); });
    expect(mat.checked).toBe(false);
    expect(expl.disabled).toBe(true);
    await act(() => { fireEvent.click(mat); });
    expect(expl.disabled).toBe(false);
  });

  test('Mégse closes the dialog without exporting', async () => {
    const { q } = setup();
    await act(() => { q('[data-action="pdf"]').click(); });
    await act(() => { q('[data-action="pdf-cancel"]').click(); });
    expect(q<HTMLDialogElement>('dialog').hasAttribute('open')).toBe(false);
    expect(exportPdf).not.toHaveBeenCalled();
  });

  test('Létrehozás exports the last valid plan, shows progress, downloads and closes', async () => {
    const { store, q } = setup();
    let resolve!: (b: Blob) => void;
    exportPdf.mockReturnValue(new Promise<Blob>(r => { resolve = r; }));
    const names: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { names.push(this.download); };
    await act(() => { q('[data-action="pdf"]').click(); });
    await act(() => { fireEvent.click(q<HTMLInputElement>('input[name="explanations"]')); });
    const go = q<HTMLButtonElement>('[data-action="pdf-create"]');
    await act(() => { go.click(); });
    await vi.waitFor(() => expect(go.textContent).toBe('PDF készül…'));
    expect(go.disabled).toBe(true);
    await act(() => { resolve(new Blob(['x'])); });
    await vi.waitFor(() => expect(q<HTMLDialogElement>('dialog').hasAttribute('open')).toBe(false));
    HTMLAnchorElement.prototype.click = orig;
    const [plan, output, opts] = exportPdf.mock.calls[0];
    expect(plan).toBe(store.get().lastValidPlan);
    expect(output).toBe(store.get().output);
    expect(opts).toEqual({ drawings: true, materials: true, explanations: false, cutPlan: true });
    expect(names).toEqual(['uj-terv.pdf']);
    await vi.waitFor(() => expect(go.disabled).toBe(false));
    expect(go.textContent).toBe('Létrehozás');
  });

  test('a failing export alerts in Hungarian, logs the error and re-enables the button', async () => {
    const { q } = setup();
    const err = new Error('boom');
    exportPdf.mockRejectedValue(err);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(() => { q('[data-action="pdf"]').click(); });
    const go = q<HTMLButtonElement>('[data-action="pdf-create"]');
    await act(() => { go.click(); });
    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(go.disabled).toBe(false));
    expect(alertSpy).toHaveBeenCalledWith('A PDF létrehozása nem sikerült.');
    expect(logSpy).toHaveBeenCalledWith(err);
  });
});

describe('unsaved-changes tracking', () => {
  test('beforeunload follows edits and resets on save, load and new', async () => {
    const { store, root, q } = setup();
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    const ev = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(ev()).toBe(false);
    act(() => store.update(p => { p.building.width = 3500; }));
    expect(ev()).toBe(true);
    q('[data-action="save"]').click();
    expect(ev()).toBe(false);
    act(() => store.update(p => { p.building.width = 3600; }));
    expect(ev()).toBe(true);
    const n = createDefaultPlan(); n.name = 'Betöltött';
    await loadFile(root, JSON.stringify(n));
    await vi.waitFor(() => expect(store.get().plan.name).toBe('Betöltött'));
    expect(ev()).toBe(false);
    act(() => store.update(p => { p.building.width = 3700; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(() => { q('[data-action="new"]').click(); });
    expect(ev()).toBe(false);
    HTMLAnchorElement.prototype.click = orig;
  });
});

test('"Új terv" resets the whole selection / camera / detail state', () => {
  const { ui, q } = setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  act(() => ui.set({ selected: 'a', selectedOpening: 'door-1', hovered: 'b', highlight: ['c'], cameras: { floor: { x: 0, y: 0, w: 1, h: 1 } }, detailOpen: true }));
  act(() => { q('[data-action="new"]').click(); });
  expect(ui.get()).toMatchObject({ selected: null, selectedOpening: null, hovered: null, highlight: [], cameras: {}, detailOpen: false });
});
test('loading a file resets the whole selection / camera / detail state', async () => {
  const { ui, root } = setup();
  act(() => ui.set({ selected: 'a', selectedOpening: 'door-1', hovered: 'b', highlight: ['c'], cameras: { floor: { x: 0, y: 0, w: 1, h: 1 } }, detailOpen: true }));
  await loadFile(root, JSON.stringify(createDefaultPlan()));
  await vi.waitFor(() => expect(ui.get()).toMatchObject({ selected: null, selectedOpening: null, hovered: null, highlight: [], cameras: {}, detailOpen: false }));
});
