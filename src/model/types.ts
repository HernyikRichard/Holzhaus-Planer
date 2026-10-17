export type Mm = number;
export type WallSide = 'N' | 'E' | 'S' | 'W'; // É, K, D, Ny
export interface Section { t: Mm; w: Mm } // 50×100 → { t: 50, w: 100 }
export type ConcreteGrade = 'C16' | 'C20';
export type MeshTypeId = 'd4_150' | 'd5_150' | 'd6_150';
export type InsulationType = 'mineralWool' | 'xps';
export interface Insulation { type: InsulationType; thickness: 50 | 100 | 150 }
export type WallLayerKind = 'interiorCladding' | 'vaporBarrier' | 'insulation' | 'osb'
  | 'breatherMembrane' | 'battens' | 'exteriorCladding';
export interface WallLayer { kind: WallLayerKind; enabled: boolean; material: string; thickness: Mm }
// material értékek: interiorCladding: 'osb'|'gypsum'|'paneling'; exteriorCladding: 'paneling'|'boards'|'cementBoard';
// osb: 'osb12'|'osb15'; insulation: 'mineralWool'|'xps'; a többi: 'default'
export interface Opening {
  id: string; type: 'door' | 'window'; wall: WallSide;
  offset: Mm; width: Mm; height: Mm; sillHeight: Mm; swing: 'left' | 'right';
}
export type RoofShape = 'flat' | 'mono' | 'gable';
export type RoofCovering = 'tile' | 'trapezoid' | 'shingle' | 'epdm' | 'standingSeam';
export type RoofLayerKind = 'decking' | 'underlay' | 'counterBatten' | 'batten';
export interface RoofLayer { kind: RoofLayerKind; enabled: boolean; material: string }
// decking: 'osb'|'boards'; underlay: 'foil'|'bitumen'
// betonlemez | talajcsavar, pontalap, betonpillér (mindhárom gerendakerettel)
export type FoundationType = 'slab' | 'groundScrew' | 'padFooting' | 'concretePier';
export type PierKind = 'block200' | 'block250' | 'tube200'; // zsalukő 20, zsalukő 25, zsalucső Ø200
export type BeamSectionId = 'b100x150' | 'b120x120' | 'b2x50x150'; // főgerenda keresztmetszete
export interface Plan {
  version: number; name: string;
  building: { width: Mm; length: Mm; wallHeight: Mm }; // width: x (É/D fal), length: y (K/Ny fal)
  foundation: { slabThickness: Mm; slabOverhang: Mm; concreteGrade: ConcreteGrade;
    meshType: MeshTypeId; gravelBedThickness: Mm; peFoil: boolean;
    type: FoundationType;
    frame: { beamSection: BeamSectionId; supportSpacing: 'auto' | Mm; groundClearance: Mm }; // csak gerendakeretes alapnál számít
    groundScrew: { length: 800 | 1000 | 1200; diameter: 76 };
    footing: { size: 300 | 400 | 500; depth: Mm }; // pontalap és betonpillér betontalpa
    pier: { kind: PierKind } }; // csak betonpillérnél számít
  floor: { enabled: boolean; joistSection: Section; joistSpacing: Mm;
    insulation: Insulation | null; osbThickness: 18 | 22; vaporBarrier: boolean };
  walls: { studSection: Section; studSpacing: Mm; topPlate: 'single' | 'double'; layers: WallLayer[] };
  openings: Opening[];
  roof: { shape: RoofShape; pitch: number; rafterSection: Section; rafterSpacing: Mm;
    eaveOverhang: Mm; gableOverhang: Mm; ridgeDirection: 'x' | 'y';
    layers: RoofLayer[]; covering: RoofCovering };
  accessories: { gutter: boolean; downpipe: boolean; fascia: boolean; bargeBoard: boolean;
    ridgeTiles: boolean; ridgeVent: boolean };
  settings: { waste: { timber: number; sheet: number; foil: number; tile: number }; stockLengths: Mm[] };
  pricing: PlanPricing;
}

export interface PlanPricing {
  useSupply: boolean;
  overrides: Record<string, number>;
  custom: Record<string, number>;
  productChoice: Record<string, string>;
  pickup: boolean;
  shippingFee?: number;
}
