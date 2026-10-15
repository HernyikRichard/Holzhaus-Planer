import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore } from './hooks';
import { sceneFor, viewForElement, type StickPiece } from './selection';
import { cutSticks, cutVariants, stepForView, type CutStick } from './lineElements';
import { CutStrip } from './CutStrip';
import { formatQty, sectionLabelWithUnit } from '../ui/format';

export function CutPlanView({ store, ui }: { store: Store; ui: UiStore }) {
  const plan = useStore(store, s => s.lastValidPlan);
  const scene = sceneFor(plan);
  const sticks = cutSticks(scene);
  const spliced = sticks.some(s => s.pieces.some(p => p.label.endsWith('(toldott)')));
  const pick = (id: string) => {
    const el = scene.elements.find(e => e.id === id);
    if (!el) return;
    const view = viewForElement(el, plan);
    ui.set({ step: stepForView(view), view, selected: id, detailOpen: true });
  };

  const groups: Array<{ title: string; sticks: CutStick[] }> = [];
  for (const s of sticks) {
    const title = `${s.category} – ${sectionLabelWithUnit(s.section.t, s.section.w)}`;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.sticks.push(s); else groups.push({ title, sticks: [s] });
  }

  return (
    <div class="cutplan">
      {groups.map(g => (
        <section key={g.title} class="cut-group">
          <h3>{g.title}</h3>
          {cutVariants(g.sticks).map(v => {
            const strip = (s: CutStick) => (
              <CutStrip pieces={s.pieces.map((p): StickPiece => ({ ...p, self: false }))} stockLength={s.stockLength} remainder={s.rest} onPick={pick} />
            );
            const first = v[0];
            return (
              <div key={first.key} class="cut-stick" data-stick={first.key}>
                <p class="cut-stick-count">{v.length} db {formatQty(first.stockLength / 1000, 2)} m-es szál</p>
                {strip(first)}
                {v.length > 1 && (
                  <details class="cut-variant">
                    <summary>Az egyes szálak</summary>
                    {v.map(s => (
                      <div key={s.key} class="cut-stick-one" data-stick={s.key}>
                        <h4>{s.index}. szál</h4>
                        {strip(s)}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {spliced && <p class="cut-footnote">A toldott darabok maradék részei nem szerepelnek a vágási tervben.</p>}
    </div>
  );
}
