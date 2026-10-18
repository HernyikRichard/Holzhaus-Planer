import type { Store } from '../../ui/store';
import type { FoundationType } from '../../model/types';
import { useStore } from '../hooks';
import { SectionGroup } from '../FieldControl';

const TYPES: { id: FoundationType; label: string }[] = [
  { id: 'slab', label: 'Betonlemez' },
  { id: 'groundScrew', label: 'Talajcsavar' },
  { id: 'padFooting', label: 'Pontalap' },
  { id: 'concretePier', label: 'Betonpillér' },
  { id: 'stripFooting', label: 'Sávalap' },
];

export function FoundationStep({ store }: { store: Store }) {
  const type = useStore(store, s => s.plan.foundation.type);
  // csak a típus változik: a másik típus mezői és a floor.enabled a tervben marad
  const pick = (id: FoundationType): void => store.update(d => { d.foundation.type = id; });
  return (
    <>
      <section class="group" data-section="foundation-type">
        <h3>Alaptípus</h3>
        <div class="shape-picker foundation-picker" role="group" aria-label="Alaptípus">
          {TYPES.map(t => (
            <button type="button" key={t.id} class="shape-btn" aria-pressed={type === t.id ? 'true' : 'false'}
              onClick={() => pick(t.id)}>{t.label}</button>
          ))}
        </div>
      </section>
      <SectionGroup id={type === 'slab' ? 'foundation' : type} store={store} />
      <SectionGroup id="floor" store={store} />
    </>
  );
}
