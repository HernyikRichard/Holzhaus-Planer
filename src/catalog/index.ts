import type { BeamSectionId, ConcreteGrade, MeshTypeId, Mm, RoofCovering, Section } from '../model/types';

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

// Talajcsavaros gerendakeret (tájékoztató határok, nem statikai méretezés)
export const BEAM_SECTIONS: Record<BeamSectionId, { label: string; width: Mm; height: Mm; plies: 1 | 2; ply: Section }> = {
  b100x150: { label: '100×150', width: 100, height: 150, plies: 1, ply: { t: 100, w: 150 } },
  b120x120: { label: '120×120', width: 120, height: 120, plies: 1, ply: { t: 120, w: 120 } },
  b2x50x150: { label: '2×50×150', width: 100, height: 150, plies: 2, ply: { t: 50, w: 150 } },
};
export const BEAM_MAX_SPAN: Record<BeamSectionId, Mm> = { b100x150: 1800, b120x120: 1500, b2x50x150: 1600 };
export const JOIST_MAX_SPAN: Record<string, Mm> = { '50x100': 1600, '50x150': 2600, '50x200': 3400 };
export const JOIST_SPAN_FALLBACK: Mm = 1600; // ismeretlen párnafa-keresztmetszetnél
export const SUPPORT_END_OFFSET: Mm = 150; // a gerenda végétől a támasz tengelyéig
export const SCREW_HEAD_H: Mm = 80; // állítható U-fej magassága
export const BEAM_BOLTS_PER_SUPPORT = 2;
export const JOIST_HANGER_SCREWS = 8;
export const GROUND_SCREW_LABEL = (d: Mm, len: Mm): string => `Talajcsavar Ø${d} × ${len / 10} cm`;

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
/** Trapézlemez oldalirányú átfedése (mm): ha a termék hasznos fedőszélessége nem ismert, táblaszélesség − ennyi. */
export const TRAPEZOID_SIDE_OVERLAP = 53;
/** Trapézlemez-táblák végátfedése lejtésirányban (mm). */
export const TRAPEZOID_END_OVERLAP = 150;
export const SHINGLE_PACK_M2 = 3;
export const EPDM_UPTURN = 200;
/** Héjazatonként a legkisebb tetőhajlás (°); alatta csak figyelmeztetés. Az EPDM-nek nincs korlátja. */
export const MIN_PITCH: Record<RoofCovering, number> = { tile: 22, shingle: 15, trapezoid: 5, standingSeam: 3, epdm: 0 };
/** Ezek alá kötelező a deszkázat, és nincs tetőléc / ellenléc. */
export const DECKING_REQUIRED: ReadonlySet<RoofCovering> = new Set<RoofCovering>(['shingle', 'epdm', 'standingSeam']);
/** Állókorcos alumíniumlemez: sáv-fedőszélesség, klipsztávolság a korc mentén, csavar / klipsz. */
export const STANDING_SEAM_WIDTH = 500;
export const STANDING_SEAM_CLIP_SPACING = 400;
export const STANDING_SEAM_SCREWS_PER_CLIP = 2;

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
  battenNail: 250, claddingNail: 500, tileClip: 100, connectorScrew: 250,
};

// Vágási veszteség (mm / vágás)
export const KERF = 10;
