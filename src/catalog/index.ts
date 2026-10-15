import type { ConcreteGrade, MeshTypeId, Mm, RoofCovering, Section } from '../model/types';

// Alap
export const CEMENT_KG_PER_M3: Record<ConcreteGrade, number> = { C16: 300, C20: 340 };
export const CEMENT_BAG_KG = 25;
export const GRAVEL_T_PER_M3 = 1.9;
export const GRAVEL_LOOSE_T_PER_M3 = 1.6;
export const WATER_L_PER_M3 = 180;
export const MESH_SHEET = { w: 1500, l: 2150, overlap: 150 };
export const MESH_TYPES: Record<MeshTypeId, { label: string; kgPerSheet: number }> = {
  d4_150: { label: 'Ø4 15×15', kgPerSheet: 4.2 },
  d5_150: { label: 'Ø5 15×15', kgPerSheet: 6.6 },
  d6_150: { label: 'Ø6 15×15', kgPerSheet: 9.5 },
};
export const BED_COMPACTION = 1.25;
export const PE_ROLL_M2 = 100;
export const FORMWORK_EXTRA = 50;
export const STAKE_SPACING = 1000;

// Lemezek
export const OSB_SHEET = { w: 1250, l: 2500 };
export const OSB_TG_SHEET = { w: 675, l: 2500 };
export const GYPSUM_SHEET = { w: 1200, l: 2600 };

// Szigetelés, fóliák (csomagonkénti m²)
export const INSULATION_PACK_M2 = {
  mineralWool: { 50: 7.2, 100: 3.6, 150: 2.4 },
  xps: { 50: 7.5, 100: 3.75, 150: 2.25 },
};
export const FOIL_ROLL_M2 = 75;
export const UNDERLAY_ROLL_M2 = { foil: 75, bitumen: 10 };
export const UNDERLAY_WASTE = 0.15;

// Lécek, fedés
export const BATTEN_SPACING_WALL = 600;
export const WALL_BATTEN_PIECE_LENGTH = 2400;
export const BATTEN_SECTION: Section = { t: 24, w: 48 };
export const COUNTER_BATTEN_SECTION: Section = { t: 50, w: 50 };
export const ROOF_BATTEN_SECTION: Section = { t: 30, w: 50 };
export const BATTEN_GAUGE: Partial<Record<RoofCovering, Mm>> = { tile: 330, trapezoid: 600 };
export const TILE_PER_M2 = 10;
export const TILE_CLIP_EAVE_SPACING = 300;
export const TILE_CLIP_RAKE_SPACING = 330;
export const TRAPEZOID_EFFECTIVE_W = 1050;
export const SHINGLE_PACK_M2 = 3;
export const EPDM_UPTURN = 200;

// Szarufa
export const RAFTER_MAX_SPAN: Record<string, Mm> = {
  '50x100': 2500, '50x150': 3500, '50x200': 4500, '75x200': 5000,
};

// Kiegészítők
export const GUTTER_BRACKET_SPACING = 600;
export const GUTTER_PIECE_LENGTH = 3000;
export const DOWNPIPE_PER_EAVE_M = 10;
export const DOWNPIPE_EXTRA = 300;
export const DOWNPIPE_ELBOWS = 2;
export const DOWNPIPE_CLIP_SPACING = 1000;
export const FASCIA_SECTION: Section = { t: 24, w: 150 };
export const RIDGE_TILES_PER_M = 2.5;

// Kötőelemek
export const ANCHOR_SPACING = 800;
export const ANCHOR_EDGE = 150;
export const FRAME_SCREWS_PER_END = 2;
export const ANCHOR_LABEL = 'Betondübel / ászokcsavar M10×120';
export const FRAME_SCREW_LABEL = '5×90 csavar';
export const SCREWS_PER_OSB_SHEET = 30;
export const OSB_SCREW_EDGE_SPACING = 150;
export const OSB_SCREW_FIELD_SPACING = 300;
export const OSB_SCREW_LABEL = '4×40 csavar';
export const HURRICANE_TIE_LABEL = 'Viharkapocs (szarufa-kengyel)';
export const COUNTER_BATTEN_NAIL_SPACING = 400;
export const CLADDING_NAILS_PER_M2 = 30;
export const FASTENER_BOX = {
  frameScrew: 200, osbScrew: 500, counterBattenNail: 250,
  battenNail: 250, claddingNail: 500, tileClip: 100,
};

// Vágási veszteség (mm / vágás)
export const KERF = 10;
