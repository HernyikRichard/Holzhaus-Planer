/**
 * Szám a beviteli mezőből: tizedesvessző vagy -pont; magyar ezres tagolás szóközzel, nem törhető
 * vagy keskeny nem törhető szóközzel („2 390”), csak szabályos hármas csoportokkal.
 */
export function parseNumberInput(text: string): number | null {
  let t = text.trim();
  if (/[   ]/.test(t)) {
    if (!/^-?\d{1,3}([   ]\d{3})+([.,]\d*)?$/.test(t)) return null;
    t = t.replace(/[   ]/g, '');
  }
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatQty(n: number, maxDecimals?: number): string {
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: maxDecimals ?? 2, useGrouping: true })
    .format(n)
    .replace(/[   ]/g, ' ');
}

/** Keresztmetszet-felirat: mm, ha a kisebbik oldal 30 mm alatti (pl. 24×48), egyébként cm (pl. 5×10). */
export function sectionLabel(t: number, w: number): string {
  return Math.min(t, w) < 30 ? `${formatQty(t, 1)}×${formatQty(w, 1)}` : `${formatQty(t / 10, 1)}×${formatQty(w / 10, 1)}`;
}

/** Keresztmetszet mértékegységgel: "24×48 mm" / "5×10 cm". */
export function sectionLabelWithUnit(t: number, w: number): string {
  return `${sectionLabel(t, w)} ${Math.min(t, w) < 30 ? 'mm' : 'cm'}`;
}

/** Pénzösszeg: "12 490 Ft" (ezres tagolás nem törhető szóközzel, tizedes nélkül). */
export function formatFt(n: number): string {
  return `${formatQty(Math.round(n), 0)} Ft`;
}

/** ISO dátum → „2026. 10. 15.” */
export function formatDateHu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : iso;
}
