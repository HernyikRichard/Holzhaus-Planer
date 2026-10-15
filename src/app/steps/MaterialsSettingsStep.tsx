import type { Store } from '../../ui/store';
import { SectionGroup } from '../FieldControl';

export function MaterialsSettingsStep({ store }: { store: Store }) {
  return <SectionGroup id="settings" store={store} />;
}
