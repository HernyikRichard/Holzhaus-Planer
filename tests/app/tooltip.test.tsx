// @vitest-environment jsdom
import { render, fireEvent, cleanup, screen, act } from '@testing-library/preact';
import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';
import { createUiStore } from '../../src/app/uiStore';
import { Viewer } from '../../src/app/Viewer';
import { buildScene } from '../../src/scene/build';
import { tooltipLines, placeTooltip } from '../../src/app/tooltipText';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('tooltip lines for N stud #3', () => {
  const p = createDefaultPlan(); const sc = buildScene(p);
  expect(tooltipLines(sc, p, { el: 'wall.N.stud.3' })).toEqual([
    'Oszlop #3 · É fal', '5×10 cm · hossza 225 cm', 'Pozíció: 120 cm a fal elejétől, 5 cm magasan',
    'Szomszédok: ← 60 cm (55 szabad) · 60 cm (55 szabad) →', 'Rögzítés: 4 db 5×90 csavar (alul 2, felül 2)']);
});
test('tooltip lines for a fastener', () => {
  const p = createDefaultPlan(); const sc = buildScene(p);
  const f = sc.fasteners.find(x => x.kind === 'anchor')!;
  const lines = tooltipLines(sc, p, { fx: f.id });
  expect(lines[0]).toBe(f.label);
  const cm = (n: number) => String(n / 10).replace('.', ',');
  expect(lines[1]).toBe('1 db');
  expect(lines[2]).toBe(`Pozíció: ${cm(f.u)} cm a fal elejétől, ${cm(f.v)} cm magasan`);
  expect(lines[3]).toBe('Elem: Talpgerenda');
});
test('roof fastener position uses the roof wording', () => {
  const p = createDefaultPlan(); const sc = buildScene(p);
  const f = sc.fasteners.find(x => x.group === 'roof.L')!;
  const cm = (n: number) => String(Math.round(n) / 10).replace('.', ',');
  expect(tooltipLines(sc, p, { fx: f.id })[2]).toMatch(/^Pozíció: [0-9,]+ cm a tetősík szélétől, [0-9,]+ cm az eresztől$/);
  expect(cm(f.u)).toBeTruthy();
});
test('roof element position is measured from the eave', () => {
  const p = createDefaultPlan(); const sc = buildScene(p);
  const lines = tooltipLines(sc, p, { el: 'roof.L.rafter.2' });
  expect(lines[0]).toBe('Szarufa #2 · bal tetősík');
  expect(lines[2]).toMatch(/^Pozíció: .+ cm a tetősík szélétől, .+ cm az eresztől$/);
});
test('opening tooltip shows type, size, position, sill and the error', () => {
  const p = createDefaultPlan(); const sc = buildScene(p);
  const win = sc.elements.find(e => e.kind === 'opening' && p.openings.find(o => o.id === e.openingId)?.type === 'window')!;
  const lines = tooltipLines(sc, p, { el: win.id }, ['Az ablak kilóg a falból']);
  expect(lines[0]).toMatch(/Ablak/);
  expect(lines.some(l => l.startsWith('Mellvéd: '))).toBe(true);
  expect(lines[lines.length - 1]).toBe('Az ablak kilóg a falból');
});
test('tooltip position is clamped inside the canvas', () => {
  expect(placeTooltip(990, 790, 200, 100, 1000, 800)).toEqual({ left: 776, top: 676 });
  expect(placeTooltip(10, 10, 200, 100, 1000, 800)).toEqual({ left: 24, top: 24 });
});

test('hovering an element shows the tooltip and highlight, leaving clears them', () => {
  const ui = createUiStore();
  ui.set({ step: 'walls' });
  ui.set({ view: 'wall.N' });
  const r = render(<Viewer store={createStore(createDefaultPlan())} ui={ui} />);
  const root = r.container as HTMLElement;
  expect(screen.queryByRole('tooltip')).toBeNull();
  const stud = root.querySelector('[data-el="wall.N.stud.3"]')!;
  // a jsdom nem ismeri az on-pointermove tulajdonságot: a Preact ott a nagybetűs eseménynevet figyeli, ami nem buborékozik
  // a testing-library helperében, ezért mindkét nevet buborékozva küldjük
  for (const type of ['pointermove', 'PointerMove']) {
    act(() => { stud.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 50, clientY: 50 })); });
  }
  expect(ui.get().hovered).toBe('wall.N.stud.3');
  expect(screen.getByRole('tooltip').textContent).toContain('Oszlop #3');
  expect(root.querySelector('.hl')).not.toBeNull();
  fireEvent.pointerLeave(root.querySelector('.viewer-canvas svg')!);
  expect(ui.get().hovered).toBeNull();
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(root.querySelector('.hl')).toBeNull();
});

function mount(view: 'wall.N' | 'floor') {
  const ui = createUiStore();
  ui.set({ step: 'walls' });
  ui.set({ view });
  const r = render(<Viewer store={createStore(createDefaultPlan())} ui={ui} />);
  return { ui, root: r.container as HTMLElement };
}
const move = (el: Element) => {
  for (const type of ['pointermove', 'PointerMove']) {
    act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 50, clientY: 50 })); });
  }
};

test('a fastener circle wins the hover over the element it sits in', () => {
  const { ui, root } = mount('wall.N');
  const stud = root.querySelector('[data-el="wall.N.stud.3"]')!;
  const ns = 'http://www.w3.org/2000/svg';
  const fx = document.createElementNS(ns, 'circle');
  fx.setAttribute('data-fx', 'wall.N.stud.3.frameScrew.bottom');
  stud.appendChild(fx);
  move(fx);
  expect(ui.get().hovered).toBe('wall.N.stud.3.frameScrew.bottom');
  expect(screen.getByRole('tooltip').textContent).toContain('5×90 csavar');
  move(stud);
  expect(ui.get().hovered).toBe('wall.N.stud.3');
});
test('hover clears on view change and the canvas is marked while hovering', () => {
  const { ui, root } = mount('wall.N');
  move(root.querySelector('[data-el="wall.N.stud.3"]')!);
  expect(root.querySelector('.viewer-canvas svg')!.getAttribute('class')).toContain('hovering');
  act(() => ui.set({ view: 'floor' }));
  expect(ui.get().hovered).toBeNull();
  expect(root.querySelector('.viewer-canvas svg')!.getAttribute('class') ?? '').not.toContain('hovering');
});

test('a gerendakeret elemeinek buboréka (talajcsavar)', () => {
  const p = createDefaultPlan(); p.foundation.type = 'groundScrew'; const sc = buildScene(p);
  const s = tooltipLines(sc, p, { el: 'frame.support.1' });
  expect(s[0]).toBe('Talajcsavar #1 · gerendakeret');
  expect(s[1]).toBe('Ø7,6 cm · hossza 100 cm');
  expect(s.join('\n')).toContain('M12 menetes szár');
  const b = tooltipLines(sc, p, { el: 'frame.beam.1' });
  expect(b[0]).toBe('Főgerenda #1 · gerendakeret');
  expect(b[1]).toBe('10×15 cm · hossza 400 cm');
  expect(b.join('\n')).toContain('Gerendasaru');
  const f = sc.fasteners.find(x => x.kind === 'beamBolt')!;
  expect(tooltipLines(sc, p, { fx: f.id })[3]).toBe('Elem: Főgerenda #1, Talajcsavar #1');
});

test('a támasz buboréka pontalapnál és betonpillérnél', () => {
  const p = createDefaultPlan(); p.foundation.type = 'padFooting'; const sc = buildScene(p);
  const s = tooltipLines(sc, p, { el: 'frame.support.1' });
  expect(s[0]).toBe('Pontalap #1 · gerendakeret');
  expect(s[1]).toBe('Talp 40×40 cm · 80 cm mélyen');
  expect(s.join('\n')).toContain('M12 menetes szár');
  const q = createDefaultPlan(); q.foundation.type = 'concretePier'; const qs = buildScene(q);
  const t = tooltipLines(qs, q, { el: 'frame.support.1' });
  expect(t[0]).toBe('Betonpillér #1 · gerendakeret');
  expect(t[1]).toBe('Talp 40×40 cm · 80 cm mélyen · 25×25 cm-es zsalukő pillér');
  q.foundation.pier.kind = 'tube200';
  expect(tooltipLines(buildScene(q), q, { el: 'frame.support.1' })[1]).toBe('Talp 40×40 cm · 80 cm mélyen · Ø20 cm-es zsalucső pillér');
  const f = sc.fasteners.find(x => x.kind === 'beamBolt')!;
  expect(tooltipLines(sc, p, { fx: f.id })[3]).toBe('Elem: Főgerenda #1, Pontalap #1');
});

test('a sávalap elemeinek buboréka', () => {
  const p = createDefaultPlan(); p.foundation.type = 'stripFooting'; const sc = buildScene(p);
  const t = tooltipLines(sc, p, { el: 'frame.sill.1' });
  expect(t[0]).toBe('Talpgerenda #1 · gerendakeret');
  expect(t[1]).toBe('10×15 cm · hossza 400 cm');
  const pl = tooltipLines(sc, p, { el: 'frame.plinth.N' });
  expect(pl[0]).toBe('Lábazat: É · gerendakeret');
  expect(pl[1]).toBe('25 cm-es zsalukő · 30 cm magas · hossza 290 cm');
  const st = tooltipLines(sc, p, { el: 'frame.strip.N' });
  expect(st[0]).toBe('Sávalap: É · gerendakeret');
  expect(st[1]).toBe('40 cm széles · 80 cm mély · hossza 290 cm');
  const s = tooltipLines(sc, p, { el: 'frame.support.1' });
  expect(s[0]).toBe('Betonpillér #1 · gerendakeret');
  expect(s[1]).toBe('Talp 40×40 cm · 80 cm mélyen · 25×25 cm-es zsalukő pillér');
  for (const e of sc.elements.filter(x => x.group === 'frame')) expect(tooltipLines(sc, p, { el: e.id }).join('\n'), e.id).not.toMatch(/NaN|undefined/);
  for (const f of sc.fasteners.filter(x => x.group === 'frame')) expect(tooltipLines(sc, p, { fx: f.id }).length, f.id).toBe(4);
  p.foundation.plinth.block = 'block300';
  expect(tooltipLines(buildScene(p), p, { el: 'frame.support.1' })[1]).toBe('Talp 40×40 cm · 80 cm mélyen · 30×30 cm-es zsalukő pillér');
});
