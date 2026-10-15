import type { MaterialLine } from '../calc/types';
import { orderList, type CostLine, type CostSummary } from '../pricing/cost';

const HEADER = ['Kategória', 'Anyag', 'Mennyiség', 'Egység', 'Kiegészítő', 'Számítás'];
const COST_HEADER = ['Egységár', 'Összeg', 'Forrás', 'Káplár-termék'];
const ORDER_HEADER = ['Termék', 'Mennyiség', 'Egység', 'Egységár', 'Összeg', 'Link'];

function num(n: number): string {
  return String(Math.round(n * 1e6) / 1e6).replace('.', ',');
}

function field(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sourceLabel(c: CostLine): string {
  if (c.informational) return 'tájékoztató';
  switch (c.source) {
    case 'kaplar': return 'Káplár';
    case 'override': return 'kézi';
    case 'custom': return 'egyéni';
    default: return 'nincs ár';
  }
}

function costCells(c: CostLine | undefined): string[] {
  if (!c) return ['', '', '', ''];
  const priced = !c.informational && c.unitPrice !== undefined && c.total !== undefined;
  return [
    priced ? String(Math.round(c.unitPrice!)) : '', priced ? String(Math.round(c.total!)) : '',
    sourceLabel(c), c.productName ?? '',
  ];
}

export function toCsv(lines: MaterialLine[], cost?: CostSummary): string {
  const byId = cost ? new Map(cost.lines.map(c => [c.lineId, c])) : null;
  const rows = [(byId ? [...HEADER, ...COST_HEADER] : HEADER).join(';')];
  for (const l of lines) {
    const cells = [l.category, l.name, num(l.quantity), l.unit, l.secondary ?? '', l.explanation];
    if (byId) cells.push(...costCells(byId.get(l.id)));
    rows.push(cells.map(field).join(';'));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/** A Káplár-kosár (termékenként összevonva) és a Káplár-részösszeg. */
export function toOrderCsv(summary: CostSummary): string {
  const rows = [ORDER_HEADER.join(';')];
  for (const r of orderList(summary)) {
    rows.push([r.name, num(r.qty), r.unit, String(Math.round(r.unitPrice)), String(Math.round(r.total)), r.url].map(field).join(';'));
  }
  rows.push(`Összesen;;;;${Math.round(summary.kaplarSubtotal)};`);
  return '﻿' + rows.join('\r\n') + '\r\n';
}
