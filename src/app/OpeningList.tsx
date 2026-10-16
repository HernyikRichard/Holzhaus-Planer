import { useEffect, useRef, useState } from 'preact/hooks';
import type { Opening, WallSide } from '../model/types';
import type { Store } from '../ui/store';
import { DEFAULTS, WALL_NAME, WALLS } from '../ui/openingLogic';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { toDisplay, toStored } from './fieldLogic';
import { formatCm, formatCmNum } from '../ui/format';
import { openingIdOfElement, selectOpening } from './openingDrag';

type NumKey = 'offset' | 'width' | 'height' | 'sillHeight';
const NUMERIC: Array<[NumKey, string]> = [
  ['offset', 'Távolság a fal elejétől'], ['width', 'Szélesség'], ['height', 'Magasság'], ['sillHeight', 'Mellvédmagasság'],
];
const TYPE_NAME = { door: 'Ajtó', window: 'Ablak' } as const;

function NumField({ label, fieldKey, value, error, onCommit }: {
  label: string; fieldKey: NumKey; value: number; error: boolean; onCommit: (mm: number) => void;
}) {
  const [local, setLocal] = useState<{ text: string; bad: boolean } | null>(null);
  const bad = local?.bad === true;
  const invalid = bad || error;
  return (
    <div class="field field-number">
      <label>
        <span class="caption">{label}</span>
        <span class="control">
          <input type="text" inputMode="decimal" data-opening-field={fieldKey} aria-label={label}
            value={local?.text ?? toDisplay({ unit: 'cm' }, value)}
            class={invalid ? 'error' : undefined} aria-invalid={invalid ? 'true' : undefined}
            onInput={e => setLocal({ text: e.currentTarget.value, bad: false })}
            onChange={e => {
              const text = e.currentTarget.value;
              const n = toStored({ unit: 'cm' }, text);
              if (n === null) { setLocal({ text, bad: true }); return; }
              setLocal(null);
              onCommit(n);
            }}
            onBlur={() => { if (!bad) setLocal(null); }} />
          <span class="unit">cm</span>
        </span>
      </label>
      {bad && <div class="field-error" role="alert">Érvénytelen szám</div>}
    </div>
  );
}

function Choice({ label, fieldKey, value, options, disabled, error, onChange }: {
  label: string; fieldKey: string; value: string; options: Array<[string, string]>; disabled?: boolean; error?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div class="field field-select">
      <label>
        <span class="caption">{label}</span>
        <span class="control">
          <select data-opening-field={fieldKey} aria-label={label} value={value} disabled={disabled}
            class={error ? 'error' : undefined} aria-invalid={error ? 'true' : undefined}
            onChange={e => onChange(e.currentTarget.value)}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </span>
      </label>
    </div>
  );
}

/** A nyílások listája; a kijelölt nyílás mezői (a régi szerkesztő szabályaival) és a „Törlés” a sor alatt. */
export function OpeningList({ store, ui }: { store: Store; ui: UiStore }) {
  const state = useStore(store, s => s);
  const selectedEl = useUi(ui, s => s.selected);
  const selectedId = useUi(ui, s => s.selectedOpening);

  // a vásznon kijelölt elem igazítja a sort; üres kijelölés (a sor kijelölése elem nélkül) nem törli
  useEffect(() => {
    if (selectedEl === null) return;
    const oid = openingIdOfElement(store.get(), selectedEl);
    if (oid !== ui.get().selectedOpening) ui.set({ selectedOpening: oid });
  }, [selectedEl]);
  const root = useRef<HTMLDivElement>(null);
  const { plan, errors, epoch } = state;

  useEffect(() => {
    const row = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-opening-row]') ?? []).find(r => r.dataset.openingRow === selectedId);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  const edit = (id: string, fn: (o: Opening) => void) => {
    store.update(d => {
      const o = d.openings.find(x => x.id === id);
      if (o) fn(o);
    });
    selectOpening(store, ui, id); // a sorrend (és így az elem-azonosító) változhatott
  };
  const remove = (id: string) => {
    ui.set({ selected: null, selectedOpening: null });
    store.update(d => { d.openings = d.openings.filter(x => x.id !== id); });
  };

  const counts: Record<Opening['type'], number> = { door: 0, window: 0 };
  return (
    <div class="opening-list" ref={root}>
      {plan.openings.map((o, i) => {
        const n = ++counts[o.type];
        const rowErrors = errors.filter(e => e.path.startsWith(`openings.${i}.`));
        const sel = o.id === selectedId;
        const summary = `${TYPE_NAME[o.type]} #${n} · ${WALL_NAME[o.wall]} fal · ${formatCmNum(o.width)}×${formatCm(o.height)}`;
        const bad = (k: string) => rowErrors.some(e => e.path === `openings.${i}.${k}`);
        return (
          <div key={o.id} data-opening-row={o.id} class={`opening-row${sel ? ' selected' : ''}${rowErrors.length ? ' has-error' : ''}`}>
            <button type="button" class="opening-summary" aria-pressed={sel ? 'true' : 'false'}
              onClick={() => { if (!sel) selectOpening(store, ui, o.id, true); else ui.set({ detailOpen: true }); }}>{summary}</button>
            {sel && (
              <div class="opening-fields" key={epoch}>
                <Choice label="Típus" fieldKey="type" value={o.type} options={[['door', 'Ajtó'], ['window', 'Ablak']]}
                  onChange={v => edit(o.id, x => {
                    x.type = v as Opening['type'];
                    x.sillHeight = x.type === 'door' ? 0 : DEFAULTS.window.sillHeight;
                  })} />
                <Choice label="Fal" fieldKey="wall" value={o.wall} options={WALLS.map(s => [s, `${WALL_NAME[s]} fal`])}
                  onChange={v => edit(o.id, x => { x.wall = v as WallSide; })} />
                {NUMERIC.map(([key, label]) => (
                  <NumField key={key} label={label} fieldKey={key} value={o[key]} error={bad(key)}
                    onCommit={mm => edit(o.id, x => { x[key] = mm; })} />
                ))}
                <Choice label="Nyitásirány" fieldKey="swing" value={o.swing} options={[['left', 'Balra'], ['right', 'Jobbra']]}
                  disabled={o.type !== 'door'} onChange={v => edit(o.id, x => { x.swing = v as Opening['swing']; })} />
                {rowErrors.length > 0 && <div class="field-error" role="alert">{rowErrors.map(e => e.message).join(' ')}</div>}
                <button type="button" class="opening-delete" onClick={() => remove(o.id)}>Törlés</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
