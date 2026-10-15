import type { Product } from '../src/prices/types';

export function parseHuNumber(s: string): number;
export function slug(s: string): string;
export function cleanName(raw: string): string;
export function roofingSheetFromText(s: string): { w: number; l: number } | null;
export function parseProduct(input: {
  name: string; url: string; price: number; unitText: string;
}): Product | null;
