import type { Section } from '../model/types';
import type { ModuleResult } from './types';

/** Felfelé kerekítés a lépésközre, lebegőpontos zaj ellen 1e-9 toleranciával. */
export function ceilTo(x: number, step: number): number {
  return Number((Math.ceil(x / step - 1e-9) * step).toFixed(10));
}

export function sectionKey(s: Section): string {
  return `${s.t}x${s.w}`;
}

export function sectionLabel(s: Section): string {
  return `${s.t}×${s.w}`;
}

export function emptyResult(): ModuleResult {
  return { lines: [], pieces: [], stats: {}, warnings: [] };
}

/** Magyar számformátum: tizedesvessző, legfeljebb `d` tizedes, felesleges nullák nélkül. */
export function hu(x: number, d = 2): string {
  return String(Number(x.toFixed(d))).replace('.', ',');
}
