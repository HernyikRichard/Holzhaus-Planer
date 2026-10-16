// @vitest-environment jsdom
import { createUiStore } from '../../src/app/uiStore';
import { STEPS, stepHasError } from '../../src/app/steps';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test('uiStore persists layers', () => {
  const ui = createUiStore(); ui.set({ layers: { ...ui.get().layers, fasteners: false } });
  expect(createUiStore().get().layers.fasteners).toBe(false);
});
test('uiStore survives broken localStorage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
  expect(() => createUiStore()).not.toThrow();
  const ui = createUiStore();
  expect(() => ui.set({ layers: { ...ui.get().layers, grid: false } })).not.toThrow();
});
test('defaults and subscribe', () => {
  const ui = createUiStore();
  expect(ui.get()).toMatchObject({ step: 'building', view: 'floor', selected: null, hovered: null, highlight: [], detailOpen: false });
  const fn = vi.fn();
  const off = ui.subscribe(fn);
  ui.set({ hovered: 'x' });
  expect(fn).toHaveBeenCalledTimes(1);
  off(); ui.set({ hovered: 'y' });
  expect(fn).toHaveBeenCalledTimes(1);
});
test('changing step sets the default view and clears selection', () => {
  const ui = createUiStore();
  ui.set({ selected: 'a' });
  ui.set({ step: 'walls' });
  expect(ui.get().view).toBe('wall.E');
  expect(ui.get().selected).toBeNull();
});
test('step table', () => {
  expect(STEPS.map(s => s.title)).toEqual(['Épület', 'Alap', 'Falak', 'Nyílászárók', 'Tető', 'Anyaglista', 'Szerelés']);
  expect(STEPS.find(s => s.id === 'foundation')!.sections).toEqual(['foundation', 'floor']);
  expect(STEPS.find(s => s.id === 'materials')!.defaultView).toBe('table');
});
test('stepHasError by path prefix', () => {
  const e = (path: string) => [{ path, message: 'm' }];
  expect(stepHasError('building', e('building.width'))).toBe(true);
  expect(stepHasError('foundation', e('floor.x'))).toBe(true);
  expect(stepHasError('roof', e('accessories.y'))).toBe(true);
  expect(stepHasError('materials', e('settings.z'))).toBe(true);
  expect(stepHasError('openings', e('openings[0].width'))).toBe(true);
  expect(stepHasError('walls', e('roof.pitch'))).toBe(false);
});
test('changing step clears highlight', () => {
  const ui = createUiStore();
  ui.set({ highlight: ['a', 'b'] });
  ui.set({ step: 'roof' });
  expect(ui.get().highlight).toEqual([]);
});

const VIEW3D_DEFAULT = { open: false, x: -1, y: -1, w: 420, h: 320, maximized: false, layers: {} };
test('view3d default', () => {
  expect(createUiStore().get().view3d).toEqual(VIEW3D_DEFAULT);
});
test('set view3d persists to favazas.3d.v1', () => {
  const ui = createUiStore();
  const v = { open: true, x: 10, y: 20, w: 500, h: 300, maximized: true, layers: { insulation: false } };
  ui.set({ view3d: v });
  expect(JSON.parse(localStorage.getItem('favazas.3d.v1')!)).toEqual(v);
  expect(createUiStore().get().view3d).toEqual(v);
});
test('broken view3d JSON falls back to defaults', () => {
  localStorage.setItem('favazas.3d.v1', '{nem json');
  expect(createUiStore().get().view3d).toEqual(VIEW3D_DEFAULT);
  localStorage.setItem('favazas.3d.v1', '[1,2]');
  expect(createUiStore().get().view3d).toEqual(VIEW3D_DEFAULT);
});
test('missing or invalid view3d fields are filled from defaults', () => {
  localStorage.setItem('favazas.3d.v1', JSON.stringify({ open: true, w: 'széles', h: 250, layers: { roofFrame: false, insulation: 'nem', bogus: false } }));
  expect(createUiStore().get().view3d).toEqual({ ...VIEW3D_DEFAULT, open: true, h: 250, layers: { roofFrame: false } });
});
test('view3d survives broken localStorage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
  const ui = createUiStore();
  expect(ui.get().view3d).toEqual(VIEW3D_DEFAULT);
  expect(() => ui.set({ view3d: { ...VIEW3D_DEFAULT, open: true } })).not.toThrow();
  expect(ui.get().view3d.open).toBe(true);
});
