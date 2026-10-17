import { useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import { SECTIONS, getPath, type FieldDef } from '../ui/fields';
import { formatCm } from '../ui/format';
import { useStore } from './hooks';
import { applyFieldChange, toDisplay, toStored } from './fieldLogic';
import { hasFrame } from '../calc/frame';

const SUPPORT_SPACING = 'foundation.frame.supportSpacing';

interface Local { text: string; bad: boolean }

/** Egy mező: számmező, választó, kapcsoló vagy keresztmetszet-pár; a hibaüzenet a mező alatt. */
export function FieldControl({ def, store }: { def: FieldDef; store: Store }) {
  const plan = useStore(store, s => s.plan);
  const errors = useStore(store, s => s.errors);
  const epoch = useStore(store, s => s.epoch);
  const [localState, setLocalState] = useState<{ epoch: number; map: Record<string, Local> }>({ epoch, map: {} });
  // Új terv / Betöltés (epoch-váltás): a helyi érvénytelen jelölések törlése
  const local = localState.epoch === epoch ? localState.map : {};
  const setLocal = (path: string, v: Local | null) => setLocalState(prev => {
    const map = { ...(prev.epoch === epoch ? prev.map : {}) };
    if (v) map[path] = v; else delete map[path];
    return { epoch, map };
  });

  const commit = (path: string, value: unknown) => store.update(draft => applyFieldChange(draft, path, value));
  const unit = def.unit ?? 'mm';
  const label = def.labelFor?.(plan) ?? def.label;
  const paths = def.kind === 'section' ? [`${def.path}.t`, `${def.path}.w`] : [def.path];
  const storeError = errors.find(e => e.path === def.path || e.path.startsWith(`${def.path}.`));
  const anyBad = paths.some(p => local[p]?.bad);
  const message = anyBad ? 'Érvénytelen szám' : storeError?.message ?? '';
  const invalid = anyBad || storeError !== undefined;

  const numberInput = (path: string, label: string) => {
    const stored = getPath(plan, path);
    const shown = local[path]?.text ?? (typeof stored === 'number' ? toDisplay({ unit }, stored) : '');
    return (
      <input type="text" inputMode="decimal" data-path={path} aria-label={label} value={shown}
        class={invalid ? 'error' : undefined} aria-invalid={invalid ? 'true' : undefined}
        onInput={e => setLocal(path, { text: e.currentTarget.value, bad: false })}
        onChange={e => {
          const text = e.currentTarget.value;
          const n = toStored({ unit }, text);
          if (n === null) { setLocal(path, { text, bad: true }); return; }
          setLocal(path, null);
          commit(path, n);
        }}
        onBlur={() => { if (!local[path]?.bad) setLocal(path, null); }} />
    );
  };

  let control;
  if (def.kind === 'number') {
    control = <>{numberInput(def.path, label)}<span class="unit">{unit}</span></>;
  } else if (def.kind === 'section') {
    control = <>
      {numberInput(paths[0], `${label}: vastagság`)}
      <span class="unit">×</span>
      {numberInput(paths[1], `${label}: szélesség`)}
      <span class="unit">mm</span>
    </>;
  } else if (def.kind === 'select') {
    const value = getPath(plan, def.path);
    const isThickness = def.path === 'floor.insulation.thickness';
    const shown = def.path === 'floor.insulation.type' ? String(value ?? 'none')
      : isThickness ? String(value ?? plan.floor.insulation?.thickness ?? 100) : String(value);
    // kézzel szerkesztett, a listában nem szereplő támaszköz: külön opcióként jelenik meg, hogy kijelölt legyen
    const options = def.options ?? [];
    const extra = def.path === SUPPORT_SPACING && typeof value === 'number' && !options.some(o => o.value === shown)
      ? [{ value: shown, label: formatCm(value) }] : [];
    control = (
      <select data-path={def.path} value={shown} aria-label={label}
        class={invalid ? 'error' : undefined} aria-invalid={invalid ? 'true' : undefined}
        disabled={isThickness && plan.floor.insulation === null}
        onChange={e => {
          const v = e.currentTarget.value;
          // a támaszköz 'auto' vagy mm szám; a többi szám-értékű választó számként mentődik
          const numeric = def.path === SUPPORT_SPACING ? v !== 'auto' : typeof value === 'number' || isThickness;
          commit(def.path, numeric ? Number(v) : v);
        }}>
        {[...options, ...extra].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else {
    // gerendakeretes alapnál a padló kötelező: bekapcsoltnak látszik, a tárolt érték nem változik
    const locked = def.path === 'floor.enabled' && hasFrame(plan);
    control = (
      <input type="checkbox" data-path={def.path} checked={locked || getPath(plan, def.path) === true}
        disabled={locked} aria-label={label} class={invalid ? 'error' : undefined} aria-invalid={invalid ? 'true' : undefined}
        onChange={e => commit(def.path, e.currentTarget.checked)} />
    );
  }

  // hosszú választólista-feliratnál a vezérlő a felirat alatt, teljes sorszélességgel áll
  const wide = def.kind === 'select' && (def.options ?? []).some(o => o.label.length > 18);
  return (
    <div class={`field field-${def.kind}${wide ? ' field-wide' : ''}`}>
      <label>
        <span class="caption">{label}</span>
        <span class="control">{control}</span>
      </label>
      <div class="field-error" role="alert">{message}</div>
      {def.path === 'floor.enabled' && hasFrame(plan) &&
        <p class="hint">Talajcsavaros alapnál a padló a gerendakereten kötelező.</p>}
    </div>
  );
}

/** Egy szakasz (SectionDef) mezői fejléccel; `omit`: kihagyott mezők. */
export function SectionGroup({ id, store, omit = [] }: { id: string; store: Store; omit?: string[] }) {
  const section = SECTIONS.find(s => s.id === id);
  if (!section) return null;
  return (
    <section class="group" data-section={id}>
      <h3>{section.title}</h3>
      {section.fields.filter(f => !omit.includes(f.path)).map(f => <FieldControl key={f.path} def={f} store={store} />)}
    </section>
  );
}
