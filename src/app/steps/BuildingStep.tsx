import type { Store } from '../../ui/store';
import { useStore } from '../hooks';
import { SectionGroup } from '../FieldControl';
import { applyFieldChange, type RoofShape } from '../fieldLogic';

const SHAPES: { id: RoofShape; label: string; icon: string }[] = [
  { id: 'flat', label: 'Lapos', icon: 'M3 14h26M5 14v10h22V14' },
  { id: 'mono', label: 'Félnyereg', icon: 'M3 8l26 6M5 12v12h22V14' },
  { id: 'gable', label: 'Nyereg', icon: 'M3 14L16 5l13 9M6 12v12h20V12' },
];

export function BuildingStep({ store }: { store: Store }) {
  const shape = useStore(store, s => s.plan.roof.shape);
  return (
    <>
      <section class="group" data-section="roof-shape">
        <h3>Tető alakja</h3>
        <div class="shape-picker" role="group" aria-label="Tető alakja">
          {SHAPES.map(s => (
            <button type="button" key={s.id} class="shape-btn" aria-label={s.label} aria-pressed={shape === s.id ? 'true' : 'false'}
              onClick={() => store.update(d => applyFieldChange(d, 'roof.shape', s.id))}>
              <svg viewBox="0 0 32 28" width="40" height="35" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"><path d={s.icon} /></svg>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </section>
      <SectionGroup id="building" store={store} />
    </>
  );
}
