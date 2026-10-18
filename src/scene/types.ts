import type { Mm, Section } from '../model/types';
import type { Category } from '../calc/types';

export type ElementKind = 'stud' | 'cornerStud' | 'gableStud' | 'kingStud' | 'jackStud' | 'cripple'
  | 'sill' | 'header' | 'bottomPlate' | 'topPlate' | 'joist' | 'rafter' | 'ridge' | 'collar'
  | 'counterBatten' | 'roofBatten' | 'fascia' | 'barge' | 'osbSheet' | 'meshSheet' | 'opening'
  | 'support' | 'beam' | 'stripFooting' | 'plinth';
export interface Geom { u: Mm; v: Mm; w: Mm; h: Mm; angle?: number } // angle fokban, (u,v) körül, a pozitív irány a +u-ból a +v felé
export interface Element {
  id: string; kind: ElementKind; label: string; group: string;
  category: Category;          // anyaglista-kategória
  pieceLabel?: string;         // a régi TimberPiece.label (csak faanyagnál)
  section?: Section; length: Mm; geom: Geom;
  fasteners: string[];         // FastenerRef.id-k
  rotated?: boolean;           // 90°-kal elforgatott oszlop: a széles lapja a fal mentén (sarokoszlop)
  openingId?: string;          // kind==='opening' vagy a nyíláshoz tartozó keretelem
}
export type FastenerKind = 'anchor' | 'frameScrew' | 'osbScrew' | 'hurricaneTie' | 'beamBolt' | 'joistHanger';
export interface FastenerRef {
  id: string; kind: FastenerKind; group: string; u: Mm; v: Mm;
  count: number; label: string; elementIds: string[];
}
export interface CutRef { stockLength: Mm; stockIndex: number; offset: Mm; siblings: string[] }
export interface Scene { elements: Element[]; fasteners: FastenerRef[]; cut: Record<string, CutRef> }
