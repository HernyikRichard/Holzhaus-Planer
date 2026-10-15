import { useRef, useState } from 'preact/hooks';
import type { CostLine } from '../pricing/cost';
import { formatFt, parseNumberInput } from '../ui/format';

/** Egész Ft ≥ 0, vagy null, ha a szöveg érvénytelen. */
export function parsePrice(text: string): number | null {
  const n = parseNumberInput(text);
  if (n === null) return null;
  const r = Math.round(n);
  return r >= 0 ? r : null;
}

/** Kattintásra szerkeszthető egységár; Enter/blur ment, Escape elvet. */
export function PriceCell({ line, onCommit, onReset }: {
  line: CostLine; onCommit: (price: number) => void; onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const done = useRef(false);
  const edited = line.source === 'override' || line.source === 'custom';

  const start = () => {
    done.current = false;
    setText(line.unitPrice === undefined ? '' : String(line.unitPrice));
    setInvalid(false);
    setEditing(true);
  };
  const commit = () => {
    if (done.current) return;
    const v = parsePrice(text);
    if (v === null) { setInvalid(true); return; }
    done.current = true;
    setEditing(false);
    onCommit(v);
  };
  const cancel = () => { done.current = true; setEditing(false); setInvalid(false); };
  const stop = (e: Event) => e.stopPropagation();

  return (
    <span class="price-cell" onClick={stop} onKeyDown={stop}>
      {editing ? (
        <>
          <input class="price-input" type="text" inputMode="decimal" autoFocus aria-label="Egységár" value={text}
            aria-invalid={invalid ? 'true' : undefined}
            onInput={e => { setText((e.currentTarget as HTMLInputElement).value); setInvalid(false); }}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            onBlur={commit} />
          {invalid && <span class="price-error" role="alert">Érvénytelen ár</span>}
        </>
      ) : (
        <button type="button" class="price-btn" title="Egységár szerkesztése" aria-label="Egységár szerkesztése" onClick={start}>
          {line.unitPrice === undefined ? '—' : formatFt(line.unitPrice)}
        </button>
      )}
      {edited && !editing && (
        <button type="button" class="price-reset" aria-label="Káplár-ár visszaállítása" title="Káplár-ár visszaállítása" onClick={onReset}>↺</button>
      )}
    </span>
  );
}
