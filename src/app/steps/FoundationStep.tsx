import type { Store } from '../../ui/store';
import { SectionGroup } from '../FieldControl';

export function FoundationStep({ store }: { store: Store }) {
  return <><SectionGroup id="foundation" store={store} /><SectionGroup id="floor" store={store} /></>;
}
