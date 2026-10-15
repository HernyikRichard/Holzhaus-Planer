import type { MaterialLine } from '../calc/types';

const HEADER = ['Kategória', 'Anyag', 'Mennyiség', 'Egység', 'Kiegészítő', 'Számítás'];

function num(n: number): string {
  return String(Math.round(n * 1e6) / 1e6).replace('.', ',');
}

function field(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(lines: MaterialLine[]): string {
  const rows = [HEADER.join(';')];
  for (const l of lines) {
    rows.push([l.category, l.name, num(l.quantity), l.unit, l.secondary ?? '', l.explanation].map(field).join(';'));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
