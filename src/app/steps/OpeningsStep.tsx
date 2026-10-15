import { useState } from 'preact/hooks';
import type { Store } from '../../ui/store';
import { addFreeOpening } from '../../ui/openingLogic';
import type { UiStore } from '../uiStore';
import { OpeningList } from '../OpeningList';
import { selectOpening } from '../openingDrag';

export function OpeningsStep({ store, ui }: { store: Store; ui: UiStore }) {
  const [message, setMessage] = useState('');
  const add = (type: 'door' | 'window') => {
    // próbaként egy másolaton: ha nincs szabad hely, a tár nem változik
    if (!addFreeOpening(structuredClone(store.get().plan), type)) { setMessage('Nincs szabad hely ezen a falon.'); return; }
    setMessage('');
    let id = '';
    store.update(d => { id = addFreeOpening(d, type)!.id; });
    selectOpening(store, ui, id, true);
  };
  return (
    <>
      <section class="group" data-section="openings">
        <h3>Nyílászárók</h3>
        <OpeningList store={store} ui={ui} />
        <div class="opening-add">
          <button type="button" onClick={() => add('door')}>Új ajtó</button>
          <button type="button" onClick={() => add('window')}>Új ablak</button>
        </div>
        {message && <div class="field-error" role="alert">{message}</div>}
        <p class="hint">Az alaprajzon vagy a falnézeten a nyílás húzható; az alaprajzon a falra kattintva új nyílás vehető fel.</p>
      </section>
    </>
  );
}
