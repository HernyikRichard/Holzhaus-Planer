import type { Store } from '../../ui/store';
import { SectionGroup } from '../FieldControl';

// A tetőformát az Épület lépés ikonos választója adja.
export function RoofStep({ store }: { store: Store }) {
  return <><SectionGroup id="roof" store={store} omit={['roof.shape']} /><SectionGroup id="accessories" store={store} /></>;
}
