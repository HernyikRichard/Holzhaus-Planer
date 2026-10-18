import type { Plan, PlanPricing } from './types';

export function createDefaultPlan(): Plan {
  const width = 3000;
  const length = 4000;
  return {
    version: 5,
    name: 'Új terv',
    building: { width, length, wallHeight: 2400 },
    foundation: {
      slabThickness: 120, slabOverhang: 100, concreteGrade: 'C16',
      meshType: 'd5_150', gravelBedThickness: 150, peFoil: true,
      type: 'slab',
      frame: { beamSection: 'b100x150', supportSpacing: 'auto', groundClearance: 300 },
      groundScrew: { length: 1000, diameter: 76 },
      footing: { size: 400, depth: 800 },
      pier: { kind: 'block250' },
      strip: { width: 400, depth: 800 },
      plinth: { block: 'block250' },
    },
    floor: {
      enabled: false, joistSection: { t: 50, w: 100 }, joistSpacing: 600,
      insulation: { type: 'mineralWool', thickness: 100 }, osbThickness: 18, vaporBarrier: true,
    },
    walls: {
      studSection: { t: 50, w: 100 }, studSpacing: 600, topPlate: 'double',
      layers: [
        { kind: 'interiorCladding', enabled: true, material: 'osb', thickness: 12 },
        { kind: 'vaporBarrier', enabled: true, material: 'default', thickness: 0 },
        { kind: 'insulation', enabled: true, material: 'mineralWool', thickness: 100 },
        { kind: 'osb', enabled: true, material: 'osb12', thickness: 12 },
        { kind: 'breatherMembrane', enabled: true, material: 'default', thickness: 0 },
        { kind: 'battens', enabled: true, material: 'default', thickness: 24 },
        { kind: 'exteriorCladding', enabled: true, material: 'paneling', thickness: 19 },
      ],
    },
    openings: [
      { id: 'door-1', type: 'door', wall: 'S', offset: 1500, width: 900, height: 2000, sillHeight: 0, swing: 'left' },
      { id: 'window-1', type: 'window', wall: 'E', offset: 1500, width: 600, height: 600, sillHeight: 1200, swing: 'left' },
    ],
    roof: {
      shape: 'gable', pitch: 30, rafterSection: { t: 50, w: 150 }, rafterSpacing: 600,
      eaveOverhang: 300, gableOverhang: 300,
      ridgeDirection: length >= width ? 'y' : 'x',
      layers: [
        { kind: 'decking', enabled: true, material: 'boards' },
        { kind: 'underlay', enabled: true, material: 'foil' },
        { kind: 'counterBatten', enabled: true, material: 'default' },
        { kind: 'batten', enabled: true, material: 'default' },
      ],
      covering: 'tile',
    },
    accessories: {
      gutter: true, downpipe: true, fascia: true, bargeBoard: true, ridgeTiles: true, ridgeVent: true,
    },
    settings: {
      waste: { timber: 0.10, sheet: 0.10, foil: 0.10, tile: 0.05 },
      stockLengths: [3000, 4000, 5000, 6000],
    },
    pricing: structuredClone(DEFAULT_PRICING),
  };
}

export const DEFAULT_PRICING: PlanPricing = {
  useSupply: true, overrides: {}, custom: {}, productChoice: {}, pickup: false,
};
