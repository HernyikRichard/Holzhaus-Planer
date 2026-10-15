import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import type { Category, MaterialLine } from '../calc/types';
import { useStore, useUi } from './hooks';
import type { StepId } from './steps';
import { formatQty, sectionLabelWithUnit } from '../ui/format';

const CATEGORIES: Record<StepId, Category[]> = {
  building: ['Fal', 'Tető'],
  foundation: ['Alap', 'Padló'],
  walls: ['Fal'],
  openings: ['Fal'],
  roof: ['Tető', 'Kiegészítők'],
  materials: [],
};
const MAX_ROWS = 5;

interface Row { key: string; text: string; rank: number; qty: number }

export function summaryRows(lines: MaterialLine[], categories: Category[]): Row[] {
  const timber = new Map<string, number>();
  const rows: Row[] = [];
  for (const l of lines) {
    if (!categories.includes(l.category)) continue;
    const m = /^timber\.[^.]+\.(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\.\d+$/.exec(l.id);
    if (m) {
      const key = sectionLabelWithUnit(Number(m[1]), Number(m[2]));
      timber.set(key, (timber.get(key) ?? 0) + l.quantity);
    } else {
      rows.push({ key: l.id, text: `${l.name}: ${formatQty(l.quantity)} ${l.unit}`, rank: l.unit === 'tábla' ? 1 : 2, qty: l.quantity });
    }
  }
  for (const [key, qty] of timber) rows.push({ key: `timber.${key}`, text: `${key}: ${formatQty(qty)} szál`, rank: 0, qty });
  return rows.sort((a, b) => a.rank - b.rank || (a.rank === 2 ? 0 : b.qty - a.qty)).slice(0, MAX_ROWS);
}

export function StepSummary({ store, ui }: { store: Store; ui: UiStore }) {
  const step = useUi(ui, s => s.step);
  const lines = useStore(store, s => s.output.lines);
  if (step === 'materials') return null;
  const rows = summaryRows(lines, CATEGORIES[step]);
  return (
    <footer class="summary" aria-label="Összesítő">
      <ul class="summary-rows">
        {rows.map(r => <li key={r.key} class="summary-row">{r.text}</li>)}
      </ul>
      <button type="button" class="summary-more" onClick={() => ui.set({ step: 'materials' })}>Teljes anyaglista →</button>
    </footer>
  );
}
