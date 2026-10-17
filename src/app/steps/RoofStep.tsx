import type { Store } from '../../ui/store';
import { useStore } from '../hooks';
import { SectionGroup } from '../FieldControl';
import { pitchWarning } from '../../calc/roof';

// A tetőformát az Épület lépés ikonos választója adja.
export function RoofStep({ store }: { store: Store }) {
  const warning = useStore(store, s => pitchWarning(s.plan));
  return <>
    <SectionGroup id="roof" store={store} omit={['roof.shape']} />
    {warning && <p class="line-warning" role="status" data-notice="pitch">{warning}</p>}
    <SectionGroup id="accessories" store={store} />
  </>;
}
