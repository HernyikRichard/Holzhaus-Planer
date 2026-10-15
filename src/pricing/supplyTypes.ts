import type { Category } from '../calc/types';
import type { FASTENER_BOX } from '../catalog';
import type { InsulationType, Mm, Section } from '../model/types';

/** A kínálat felülete; JSON-mentes modul, hogy a számítómodulok ne húzzák be a beépített árlistát. */
export interface Supply {
  stockLengths(category: Category, section: Section): Mm[] | null;
  osbSheet(thickness: number): { w: Mm; l: Mm } | null;
  osbTgSheet(thickness: number): { w: Mm; l: Mm } | null;
  insulationPack(type: InsulationType, thickness: number): number | null;
  foilRoll(kind: 'vapor' | 'breather' | 'underlay'): number | null;
  fastenerBox(kind: keyof typeof FASTENER_BOX): number | null;
}

/** Figyelmeztetés, ha a kínálatból hiányzik a sor által igényelt méret. */
export const missingSupplyWarning = (size: string): string =>
  `Nincs Káplár-termék ilyen méretben (${size}), katalógusértékkel számoltunk.`;
