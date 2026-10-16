import { useEffect } from 'preact/hooks';
import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { KERF, OSB_SHEET } from '../catalog';
import { supplyFor } from '../pricing/supply';
import { elementPoly } from '../viewer/views/world';
import { CutStrip } from './CutStrip';
import { formatQty } from '../ui/format';
import { drawSource, spliceParts, stickPieces, targetLines, viewForElement } from './selection';

/** Azonos címkéjű rögzítések összevonva (sok csavarnál). */
function totals(fxs: { label: string; count: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of fxs) { const k = f.label.replace(/^[0-9]+ db /, ''); m.set(k, (m.get(k) ?? 0) + f.count); }
  return m;
}

export function DetailPanel({ store, ui }: { store: Store; ui: UiStore }) {
  const open = useUi(ui, s => s.detailOpen);
  const selected = useUi(ui, s => s.selected);
  const view = useUi(ui, s => s.view);
  const state = useStore(store, s => s);
  const { plan, scene } = drawSource(state, view);

  const osbOrder = state.output.lines.find(l => l.id === 'wall.osb')?.quantity;
  const el = selected ? scene.elements.find(e => e.id === selected) : undefined;
  const fx = selected ? scene.fasteners.find(f => f.id === selected) : undefined;

  // ha a kijelölt azonosító már nincs a jelenetben (a terv változott), a kijelölés törlődik
  useEffect(() => {
    if (selected && !el && !fx) ui.set({ selected: null });
  }, [selected, el, fx, scene]);

  const pick = (id: string) => {
    const target = scene.elements.find(e => e.id === id);
    const switchView = target !== undefined && elementPoly(plan, view, target) === null;
    ui.set({ selected: id, detailOpen: true, ...(switchView ? { view: viewForElement(target, plan) } : {}) });
  };
  const close = () => ui.set({ detailOpen: false, selected: null, selectedOpening: null });

  const extras = () => {
    if (!el) return null;
    const fxs = el.fasteners.map(id => scene.fasteners.find(f => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f);
    const cut = scene.cut[el.id];
    const pieces = cut ? stickPieces(scene, el.id) : [];
    const used = pieces.reduce((a, p) => a + p.length, 0) + KERF * Math.max(0, pieces.length - 1);
    const parts = cut ? spliceParts(el, scene) : 1;
    let osb: string | null = null;
    if (el.kind === 'osbSheet') {
      const sheets = scene.elements.filter(e => e.kind === 'osbSheet');
      const wallOsb = plan.walls.layers.find(l => l.kind === 'osb' && l.enabled);
      const full = (wallOsb && supplyFor(plan)?.osbSheet(wallOsb.thickness)) || OSB_SHEET;
      const cutSheets = sheets.filter(e => e.geom.w < full.w - 1e-6 || e.geom.h < full.l - 1e-6).length;
      const order = osbOrder ?? 0;
      osb = `kiosztás: ${sheets.length} darab (ebből ${cutSheets} vágott), rendelés: ${order} tábla`;
    }
    return (
      <>
        {fxs.length > 0 && (
          <section>
            <h4>Rögzítések</h4>
            <ul>
              {fxs.length <= 6
                ? fxs.map(f => (
                  <li key={f.id}><button type="button" class="link" onClick={() => ui.set({ selected: f.id })}>{f.count} db {f.label.replace(/^[0-9]+ db /, '')}</button></li>
                ))
                : [...totals(fxs)].map(([label, n]) => <li key={label}>{n} db {label}</li>)}
            </ul>
          </section>
        )}
        {osb && <p class="detail-line">{osb}</p>}
        {cut && el.kind !== 'opening' && (
          <section>
            <h4>Vágási terv</h4>
            <p>{formatQty(cut.stockLength / 1000, 3)} m-es szál #{cut.stockIndex}</p>
            {parts > 1 && <p class="detail-line">Toldott darab: {parts} részből (itt az első rész)</p>}
            <CutStrip pieces={pieces} stockLength={cut.stockLength} remainder={cut.stockLength - used} onPick={pick} />
          </section>
        )}
      </>
    );
  };


  let body = <p class="detail-empty">Kattints egy elemre a részletekért.</p>;
  if (selected && (el || fx)) {
    let lines: string[] = [];
    try { lines = targetLines(scene, plan, state.errors, selected); } catch { /* nincs adat */ }
    const [title, ...rest] = lines;
    body = (
      <div class="detail-body">
        <h3>{title}</h3>
        {rest.map((l, i) => <p key={i} class="detail-line">{l}</p>)}
        {fx && (
          <section>
            <h4>Elemek</h4>
            <ul>
              {fx.elementIds.map(id => {
                const e = scene.elements.find(x => x.id === id);
                return e ? <li key={id}><button type="button" class="link" onClick={() => pick(id)}>{e.label}</button></li> : null;
              })}
            </ul>
          </section>
        )}
        {extras()}
      </div>
    );
  }

  return (
    <aside class={`detail${open ? ' open' : ''}`} aria-label="Adatlap">
      <div class="detail-head">
        <strong>Adatlap</strong>
        <button type="button" onClick={close}>Bezárás</button>
      </div>
      {body}
    </aside>
  );
}
