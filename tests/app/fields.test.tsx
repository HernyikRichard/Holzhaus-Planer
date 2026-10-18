// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import type { StepId } from '../../src/app/steps';
import { StepPanel } from '../../src/app/StepPanel';
import { TopBar } from '../../src/app/TopBar';
import { parsePlan } from '../../src/model/serialize';
import { SECTIONS } from '../../src/ui/fields';
import { FIXTURE } from '../fixtures/priceList';
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

describe('Alaptípus', () => {
  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
  test('starts as slab: slab fields shown, screw fields hidden', () => {
    const { root, field } = setup('foundation');
    expect(pressed('Betonlemez')).toBe('true');
    expect(pressed('Talajcsavar')).toBe('false');
    expect(field('foundation.slabThickness')).not.toBeNull();
    expect(root.querySelector('[data-path="foundation.frame.groundClearance"]')).toBeNull();
  });
  test('switching to ground screw swaps the fields and locks the floor toggle', () => {
    const { store, root, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    expect(store.get().plan.foundation.type).toBe('groundScrew');
    expect(root.querySelector('[data-path="foundation.slabThickness"]')).toBeNull();
    for (const p of ['foundation.groundScrew.length', 'foundation.frame.groundClearance',
      'foundation.frame.beamSection', 'foundation.frame.supportSpacing']) expect(field(p)).not.toBeNull();
    const floor = field<HTMLInputElement>('floor.enabled');
    expect(floor.checked).toBe(true);
    expect(floor.disabled).toBe(true);
    expect(root.textContent).toContain('Gerendakeretes alapnál a padló kötelező.');
    expect(field<HTMLInputElement>('floor.joistSpacing').disabled).toBe(false);
  });
  test('five picker buttons, exactly one pressed', () => {
    const { root } = setup('foundation');
    const btns = Array.from(root.querySelectorAll('[data-section="foundation-type"] button'));
    expect(btns.map(b => b.textContent)).toEqual(['Betonlemez', 'Talajcsavar', 'Pontalap', 'Betonpillér', 'Sávalap']);
    for (const name of ['Betonlemez', 'Talajcsavar', 'Pontalap', 'Betonpillér', 'Sávalap']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(root.querySelectorAll('[data-section="foundation-type"] [aria-pressed="true"]')).toHaveLength(1);
      expect(pressed(name)).toBe('true');
    }
  });
  test('pad footing shows footing, depth and concrete fields but no screw length or pier', () => {
    const { store, root, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Pontalap' }));
    expect(store.get().plan.foundation.type).toBe('padFooting');
    for (const p of ['foundation.footing.size', 'foundation.footing.depth', 'foundation.concreteGrade',
      'foundation.frame.groundClearance', 'foundation.frame.beamSection', 'foundation.frame.supportSpacing']) expect(field(p)).not.toBeNull();
    expect(root.querySelector('[data-path="foundation.groundScrew.length"]')).toBeNull();
    expect(root.querySelector('[data-path="foundation.pier.kind"]')).toBeNull();
    expect(root.querySelector('[data-path="foundation.slabThickness"]')).toBeNull();
    const sizes = Array.from(field<HTMLSelectElement>('foundation.footing.size').options).map(o => [o.value, o.textContent]);
    expect(sizes).toEqual([['300', '30×30 cm'], ['400', '40×40 cm'], ['500', '50×50 cm']]);
    fireEvent.change(field('foundation.footing.size'), { target: { value: '500' } });
    expect(store.get().plan.foundation.footing.size).toBe(500);
  });
  test('concrete pier also shows the pier selector', () => {
    const { store, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Betonpillér' }));
    expect(field('foundation.footing.size')).not.toBeNull();
    const kinds = Array.from(field<HTMLSelectElement>('foundation.pier.kind').options).map(o => [o.value, o.textContent]);
    expect(kinds).toEqual([['block200', '20×20 cm zsalukő'], ['block250', '25×25 cm zsalukő'], ['tube200', 'Ø20 cm zsalucső']]);
    fireEvent.change(field('foundation.pier.kind'), { target: { value: 'tube200' } });
    expect(store.get().plan.foundation.pier.kind).toBe('tube200');
  });
  test('floor toggle is locked for all four frame types', () => {
    const { root, field } = setup('foundation');
    for (const name of ['Talajcsavar', 'Pontalap', 'Betonpillér', 'Sávalap']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(field<HTMLInputElement>('floor.enabled').disabled).toBe(true);
      expect(field<HTMLInputElement>('floor.enabled').checked).toBe(true);
      expect(root.textContent).toContain('Gerendakeretes alapnál a padló kötelező.');
    }
  });
  test('50 cm clearance: error on pad footing, gone on ground screw', () => {
    const { store, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    const err = () => field('foundation.frame.groundClearance').closest('.field')!.querySelector('.field-error')!.textContent;
    act(() => store.update(p => { p.foundation.frame.groundClearance = 500; }));
    expect(err()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Pontalap' }));
    expect(err()).toMatch(/150–300/);
    expect(store.get().errors.some(e => e.path === 'foundation.frame.groundClearance')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    expect(err()).toBe('');
    expect(store.get().errors).toHaveLength(0);
  });
  test('strip footing section: fields, labels, options', () => {
    const { store, root, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Sávalap' }));
    expect(store.get().plan.foundation.type).toBe('stripFooting');
    const paths = ['foundation.strip.width', 'foundation.strip.depth', 'foundation.plinth.block',
      'foundation.frame.groundClearance', 'foundation.concreteGrade', 'foundation.frame.beamSection',
      'foundation.frame.supportSpacing'];
    const order = Array.from(root.querySelectorAll('[data-section="stripFooting"] [data-path]')).map(e => e.getAttribute('data-path'));
    expect(order).toEqual(paths);
    const opts = (p: string) => Array.from(field<HTMLSelectElement>(p).options).map(o => [o.value, o.textContent]);
    expect(opts('foundation.strip.width')).toEqual([['300', '30 cm'], ['400', '40 cm'], ['500', '50 cm']]);
    expect(opts('foundation.plinth.block')).toEqual([['block200', '20 cm-es zsalukő'],
      ['block250', '25 cm-es zsalukő'], ['block300', '30 cm-es zsalukő']]);
    fireEvent.change(field('foundation.strip.width'), { target: { value: '500' } });
    expect(store.get().plan.foundation.strip.width).toBe(500);
    fireEvent.change(field('foundation.plinth.block'), { target: { value: 'block300' } });
    expect(store.get().plan.foundation.plinth.block).toBe('block300');
    const label = (p: string) => field(p).closest('.field')!.textContent;
    expect(label('foundation.strip.depth')).toContain('Alapozási mélység');
    expect(label('foundation.frame.groundClearance')).toContain('Lábazat magassága');
    expect(label('foundation.frame.groundClearance')).not.toContain('Talaj feletti');
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    expect(label('foundation.frame.groundClearance')).toContain('Talaj feletti magasság');
  });
  test('strip footing to pad footing at 50 cm: field error, and back clears it', () => {
    const { store, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Sávalap' }));
    const err = () => field('foundation.frame.groundClearance').closest('.field')!.querySelector('.field-error')!.textContent;
    act(() => store.update(p => { p.foundation.frame.groundClearance = 500; }));
    expect(err()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Pontalap' }));
    expect(err()).toMatch(/150–300/);
    fireEvent.click(screen.getByRole('button', { name: 'Sávalap' }));
    expect(err()).toBe('');
    expect(store.get().errors).toHaveLength(0);
  });
  test('a v4 plan loaded shows the saved type selected', () => {
    const { store } = setup('foundation');
    const v4: any = createDefaultPlan(); v4.version = 4; v4.foundation.type = 'concretePier';
    delete v4.foundation.strip; delete v4.foundation.plinth;
    const r = parsePlan(JSON.stringify(v4));
    if (!r.ok) throw new Error(r.error);
    act(() => store.replace(r.plan));
    expect(pressed('Betonpillér')).toBe('true');
    expect(pressed('Sávalap')).toBe('false');
  });
  test('a v3 ground screw plan loaded shows Talajcsavar selected', () => {
    const { store } = setup('foundation');
    const v3: any = createDefaultPlan(); v3.version = 3; v3.foundation.type = 'groundScrew';
    delete v3.foundation.footing; delete v3.foundation.pier;
    const r = parsePlan(JSON.stringify(v3));
    if (!r.ok) throw new Error(r.error);
    act(() => store.replace(r.plan));
    expect(pressed('Talajcsavar')).toBe('true');
    expect(pressed('Pontalap')).toBe('false');
  });
  test('round trip restores slab fields and keeps the user floor.enabled', () => {
    const { store, root, field } = setup('foundation');
    fireEvent.click(field('floor.enabled'));
    const user = store.get().plan.floor.enabled;
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    expect(store.get().plan.floor.enabled).toBe(user);
    fireEvent.click(screen.getByRole('button', { name: 'Betonlemez' }));
    expect(store.get().plan.foundation.type).toBe('slab');
    expect(store.get().plan.floor.enabled).toBe(user);
    expect(field<HTMLInputElement>('floor.enabled').disabled).toBe(false);
    expect(field<HTMLInputElement>('floor.enabled').checked).toBe(user);
    expect(field('foundation.slabThickness')).not.toBeNull();
    expect(root.textContent).not.toContain('kötelező');
  });
  test('support spacing options cover 80..250 cm and show a hand-edited value', () => {
    const { store, field } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    const vals = () => Array.from(field<HTMLSelectElement>('foundation.frame.supportSpacing').options).map(o => o.value);
    expect(vals()).toEqual(['auto', ...Array.from({ length: 18 }, (_, i) => String(800 + i * 100))]);
    act(() => store.update(p => { p.foundation.frame.supportSpacing = 1250; }));
    const sel = field<HTMLSelectElement>('foundation.frame.supportSpacing');
    expect(vals()).toContain('1250');
    expect(sel.value).toBe('1250');
    expect(sel.selectedOptions[0].textContent).toBe('125 cm');
  });
  test('support spacing, length and clearance commit numbers; auto stays text', () => {
    const { store, field, set } = setup('foundation');
    fireEvent.click(screen.getByRole('button', { name: 'Talajcsavar' }));
    fireEvent.change(field('foundation.frame.supportSpacing'), { target: { value: '1200' } });
    expect(store.get().plan.foundation.frame.supportSpacing).toBe(1200);
    fireEvent.change(field('foundation.frame.supportSpacing'), { target: { value: 'auto' } });
    expect(store.get().plan.foundation.frame.supportSpacing).toBe('auto');
    fireEvent.change(field('foundation.groundScrew.length'), { target: { value: '1200' } });
    expect(store.get().plan.foundation.groundScrew.length).toBe(1200);
    fireEvent.change(field('foundation.frame.beamSection'), { target: { value: 'b120x120' } });
    expect(store.get().plan.foundation.frame.beamSection).toBe('b120x120');
    set('foundation.frame.groundClearance', '10');
    expect(store.get().plan.foundation.frame.groundClearance).toBe(100);
    expect(field('foundation.frame.groundClearance').closest('.field')!.querySelector('.field-error')!.textContent)
      .toMatch(/150/);
  });
  test('an old (v2) plan loaded through the store shows slab selected', () => {
    const { store } = setup('foundation');
    const v2: any = createDefaultPlan(); v2.version = 2;
    delete v2.foundation.type; delete v2.foundation.frame; delete v2.foundation.groundScrew;
    const r = parsePlan(JSON.stringify(v2));
    if (!r.ok) throw new Error(r.error);
    act(() => store.replace(r.plan));
    expect(pressed('Betonlemez')).toBe('true');
  });
});

test('step panels together cover exactly the SECTIONS fields (roof.shape on Building only)', () => {
  const all = SECTIONS.flatMap(s => s.fields);
  const sectionPaths = new Set(all.filter(f => f.kind === 'section').map(f => f.path));
  const seen = new Set<string>();
  const collect = (root: HTMLElement) => root.querySelectorAll<HTMLElement>('[data-path]').forEach(el => {
    const m = /^(.*).[tw]$/.exec(el.dataset.path!);
    seen.add(m && sectionPaths.has(m[1]) ? m[1] : el.dataset.path!);
  });
  const stepsWithShape: StepId[] = [];
  for (const step of ['building', 'foundation', 'walls', 'roof', 'materials'] as StepId[]) {
    const { root } = setup(step);
    if (step === 'foundation') {
      // a talajcsavar-szakasz csak talajcsavaros típusnál látszik
      for (const name of ['Talajcsavar', 'Pontalap', 'Betonpillér', 'Sávalap']) {
        fireEvent.click(screen.getByRole('button', { name }));
        collect(root);
      }
      fireEvent.click(screen.getByRole('button', { name: 'Betonlemez' }));
    }
    collect(root);
    if (root.querySelector('[data-section="roof-shape"]')) { seen.add('roof.shape'); stepsWithShape.push(step); }
    cleanup();
  }
  expect(stepsWithShape).toEqual(['building']);
  expect([...seen].sort()).toEqual([...new Set(all.map(f => f.path))].sort());
});

describe('Árak beállítások', () => {
  afterEach(() => vi.useRealTimers());
  const at = (d: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${d}T12:00:00`)); };

  test('the supply toggle sets pricing.useSupply and changes timber line ids', () => {
    const { store, root } = setup('materials');
    // a 24×48-as léc a kínálatban csak 4 m-es (23×48 helyettesítő), a katalógus szerint 3–6 m-es
    const ids = () => store.get().output.lines.filter(l => /^timber\.[^.]+\.24x48\./.test(l.id)).map(l => l.id).sort();
    const box = root.querySelector<HTMLInputElement>('[data-pricing="useSupply"]')!;
    expect(box.checked).toBe(true);
    const on = ids();
    fireEvent.click(box);
    expect(store.get().plan.pricing.useSupply).toBe(false);
    expect(ids()).not.toEqual(on);
    expect(screen.getByLabelText('Káplár-kínálat szerint számol')).toBeTruthy();
  });
  const PL = { ...FIXTURE, fetchedAt: '2026-10-15' };
  const settings = () => render(<MaterialsSettingsStep store={createStore(createDefaultPlan())} priceList={PL} />).container as HTMLElement;
  test('shows the price list date', () => {
    at('2026-10-15');
    const root = settings();
    expect(root.textContent).toContain('Árlista: Káplár Fatelep, 2026. 10. 15.');
    expect(root.textContent).not.toContain('npm run arak');
  });
  test('stale warning on day 61 but not on day 60', () => {
    at('2026-12-14'); // fetchedAt 2026-10-15 + 60 nap
    expect(settings().textContent).not.toContain('npm run arak');
    cleanup();
    at('2026-12-15');
    expect(settings().textContent).toContain('Az árlista régi – frissítés: npm run arak');
  });
  test('no price list', () => {
    const store = createStore(createDefaultPlan());
    const r = render(<MaterialsSettingsStep store={store} priceList={null} />);
    expect(r.container.textContent).toContain('Nincs árlista');
  });
});

test('toStored rounds length fields to whole mm', async () => {
  const { toStored } = await import('../../src/app/fieldLogic');
  expect(toStored({ unit: 'cm' }, '152,5')).toBe(1525);
  expect(toStored({ unit: 'm' }, '3,255')).toBe(3255);
  expect(toStored({ unit: 'cm' }, '152,55')).toBe(1526);
  expect(toStored({ unit: 'mm' }, '12,4')).toBe(12);
  expect(toStored({ unit: '°' }, '12,5')).toBe(12.5);
  expect(toStored({ unit: '%' }, '12,5')).toBe(0.125);
});

describe('lapostetőre váltás és a héjazat', () => {
  test.each(['tile', 'shingle'] as const)('%s → EPDM, rövid tájékoztatással', covering => {
    const { store, root } = setup('building');
    act(() => store.update(p => { p.roof.covering = covering; }));
    expect(root.querySelector('[data-notice="flat-covering"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lapos' }));
    expect(store.get().plan.roof.covering).toBe('epdm');
    expect(root.querySelector('[data-notice="flat-covering"]')?.textContent).toMatch(/EPDM/);
  });
  test.each(['trapezoid', 'epdm'] as const)('%s változatlan, tájékoztatás nélkül', covering => {
    const { store, root } = setup('building');
    act(() => store.update(p => { p.roof.covering = covering; }));
    fireEvent.click(screen.getByRole('button', { name: 'Lapos' }));
    expect(store.get().plan.roof.covering).toBe(covering);
    expect(root.querySelector('[data-notice="flat-covering"]')).toBeNull();
  });
  test('betöltött lapos + cserép terv nem alakul át, csak figyelmeztet', () => {
    const { store } = setup('roof');
    const p = createDefaultPlan(); p.roof.shape = 'flat'; p.roof.pitch = 3;
    act(() => store.replace(p));
    expect(store.get().plan.roof.covering).toBe('tile');
    expect(store.get().output.warnings.some(w => w.includes('tetőhajlást igényel'))).toBe(true);
  });
  test('a Tető lépés mutatja a hajlás-figyelmeztetést', () => {
    const { store, root } = setup('roof');
    expect(root.querySelector('[data-notice="pitch"]')).toBeNull();
    act(() => store.update(p => { p.roof.pitch = 12; }));
    expect(root.querySelector('[data-notice="pitch"]')?.textContent).toContain('legalább 22°-os');
  });
});

test('héjazat-választó: állókorcos lemez, és a gerinccserép kapcsoló gerincfedőként jelenik meg', () => {
  const { store, root, field } = setup('roof');
  const sel = field<HTMLSelectElement>('roof.covering');
  expect(Array.from(sel.options).map(o => o.value)).toContain('standingSeam');
  expect(Array.from(sel.options).find(o => o.value === 'standingSeam')!.textContent).toBe('Állókorcos alumíniumlemez');
  const caption = () => field('accessories.ridgeTiles').closest('label')!.querySelector('.caption')!.textContent;
  expect(caption()).toBe('Gerinccserép');
  sel.value = 'standingSeam'; fireEvent.change(sel);
  expect(store.get().plan.roof.covering).toBe('standingSeam');
  expect(caption()).toBe('Gerincfedő');
  expect(root.querySelector('[data-notice="pitch"]')).toBeNull();
});
