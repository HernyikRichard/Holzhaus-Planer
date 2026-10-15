import type { Store } from '../../ui/store';
import { SectionGroup } from '../FieldControl';

export function WallsStep({ store }: { store: Store }) {
  return <SectionGroup id="walls" store={store} />;
}
