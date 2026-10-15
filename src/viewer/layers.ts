export type ViewId = 'floor' | 'wall.N' | 'wall.E' | 'wall.S' | 'wall.W' | 'section' | 'roof' | 'gable'
  | 'foundation' | 'table' | 'cutplan';
export type LayerId = 'frame' | 'sheathing' | 'battens' | 'fasteners' | 'dims' | 'grid' | 'mesh';

const WALL: LayerId[] = ['frame', 'sheathing', 'fasteners', 'dims', 'grid'];

export const VIEW_LAYERS: Record<ViewId, LayerId[]> = {
  floor: ['frame', 'fasteners', 'dims', 'grid'],
  'wall.N': WALL, 'wall.E': WALL, 'wall.S': WALL, 'wall.W': WALL,
  section: ['dims', 'grid'],
  roof: ['frame', 'battens', 'fasteners', 'dims', 'grid'],
  gable: ['frame', 'sheathing', 'fasteners', 'dims'],
  foundation: ['mesh', 'dims', 'grid'],
  table: [],
  cutplan: [],
};

export const VIEW_NAMES: Record<ViewId, string> = {
  floor: 'Alaprajz', 'wall.N': 'É fal', 'wall.E': 'K fal', 'wall.S': 'D fal', 'wall.W': 'Ny fal',
  section: 'Metszet', roof: 'Tetőnézet', gable: 'Oromfal', foundation: 'Alap',
  table: 'Anyaglista', cutplan: 'Vágásterv',
};

export const LAYER_NAMES: Record<LayerId, string> = {
  frame: 'Váz', sheathing: 'Burkolat/OSB', battens: 'Lécezés', fasteners: 'Rögzítések',
  dims: 'Méretek', grid: 'Rács', mesh: 'Háló',
};
