import type { Mm, Section } from '../model/types';

export type Category = 'Alap' | 'Padló' | 'Fal' | 'Tető' | 'Kiegészítők' | 'Kötőelemek';
export type Unit = 'kg' | 'zsák' | 'db' | 'szál' | 'm' | 'm²' | 'm³' | 't' | 'l' | 'tekercs' | 'csomag' | 'tábla' | 'doboz';
export interface MaterialLine {
  id: string; category: Category; name: string; quantity: number;
  unit: Unit; secondary?: string; explanation: string; warnings?: string[];
  /** Csomag-/tekercsméret (m²), amivel a mennyiség készült; a termékpárosításhoz (nem a magyarázatból olvassuk). */
  unitM2?: number;
  /** A fedendő terület (m²) a mennyiség előtt, a termékpárosítás átváltásához. */
  needM2?: number;
}
export interface TimberPiece { id?: string; category: Category; section: Section; length: Mm; label: string }
export interface CalcStats { // kötőelem-számításhoz, minden modul a sajátját tölti, a hiányzó 0
  osbSheets: number; studs: number; headers: number; collarPairs: number; rafters: number;
  anchorPoints: number; counterBattenLength: Mm; battenCrossings: number;
  claddingArea: number; tileClips: number;
  frameScrewCount: number; osbScrewCount: number; hurricaneTieCount: number;
}
export interface ModuleResult {
  lines: MaterialLine[]; pieces: TimberPiece[];
  stats: Partial<CalcStats>; warnings: string[];
}
