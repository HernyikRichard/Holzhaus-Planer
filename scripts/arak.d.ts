import type { Product } from '../src/prices/types';

export interface Extracted {
  name?: string; price?: number; unitText?: string; areaPerPiece?: number; text?: string;
  error?: string; noPrice?: boolean;
}
export function extract(html: string): Extracted;
export function enrich(p: Product, text: string, areaPerPiece?: number): string[];
export function floorProblem(newCount: number, oldCount: number | null): string | null;
