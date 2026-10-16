import type { CalcStats, MaterialLine } from './types';
import {
  CLADDING_NAILS_PER_M2, COUNTER_BATTEN_NAIL_SPACING, FASTENER_BOX, FRAME_SCREWS_PER_END, HURRICANE_TIE_LABEL,
  SCREWS_PER_OSB_SHEET, STANDING_SEAM_CLIP_SPACING, STANDING_SEAM_SCREWS_PER_CLIP,
} from '../catalog';
import { hu } from './util';
import type { Supply } from '../pricing/supplyTypes';

export function calcFasteners(stats: CalcStats, supply?: Supply): MaterialLine[] {
  /** A kínálat dobozmérete, ha van; az árlista ezt most nem tartalmazza, így a katalógusérték marad. */
  const boxOf = (kind: keyof typeof FASTENER_BOX): number => supply?.fastenerBox(kind) ?? FASTENER_BOX[kind];
  const lines: MaterialLine[] = [];
  const box = (id: string, name: string, pieces: number, boxSize: number, explanation: string): void => {
    if (pieces <= 0) return;
    const qty = Math.ceil(pieces / boxSize - 1e-9);
    lines.push({
      id, category: 'Kötőelemek', name, quantity: qty, unit: 'doboz', secondary: `${pieces} db`,
      explanation: `${explanation} = ${pieces} db / ${boxSize} db/doboz = ${hu(pieces / boxSize, 3)} → ${qty} doboz`,
    });
  };

  if (stats.anchorPoints > 0) {
    lines.push({
      id: 'fix.anchors', category: 'Kötőelemek', name: 'Talpgerenda-rögzítő (dübel / ászokcsavar)',
      quantity: stats.anchorPoints, unit: 'db',
      explanation: `${stats.anchorPoints} rögzítési pont a talpgerenda mentén (800 mm-enként, sarkoknál és nyílászáróknál pótlással)`,
    });
  }
  box('fix.frameScrews', 'Vázszerkezeti csavar', stats.frameScrewCount, boxOf('frameScrew'),
    `${hu(stats.frameScrewCount / FRAME_SCREWS_PER_END, 0)} rögzítési pont a vázon (elemvégenként ${FRAME_SCREWS_PER_END} db)`);
  const osbPieces = stats.osbScrewCount + stats.osbSheets * SCREWS_PER_OSB_SHEET;
  box('fix.osbScrews', 'OSB-csavar', osbPieces, boxOf('osbScrew'),
    `${stats.osbScrewCount} db a falak kiosztásából + ${stats.osbSheets} tábla × ${SCREWS_PER_OSB_SHEET} db`);
  if (stats.hurricaneTieCount > 0) {
    lines.push({
      id: 'fix.hurricaneTies', category: 'Kötőelemek', name: HURRICANE_TIE_LABEL,
      quantity: stats.hurricaneTieCount, unit: 'db',
      explanation: `${stats.hurricaneTieCount} rögzítési pont (szarufavégenként 1 db: a koszorún és a gerincnél / magas oldalon)`,
    });
  }
  if (stats.seamClips > 0) {
    lines.push({
      id: 'fix.seamClips', category: 'Kötőelemek', name: 'Állókorc-rögzítő klipsz', quantity: stats.seamClips, unit: 'db',
      explanation: `${stats.seamClips} klipsz: tetősíkonként (sávok + 1) korc × (⌊sávhossz / ${hu(STANDING_SEAM_CLIP_SPACING / 1000)} m⌋ + 1)`,
    });
    lines.push({
      id: 'fix.seamClipScrews', category: 'Kötőelemek', name: 'Klipszrögzítő csavar', quantity: stats.seamClipScrews, unit: 'db',
      explanation: `${stats.seamClips} klipsz × ${STANDING_SEAM_SCREWS_PER_CLIP} db = ${stats.seamClipScrews} db`,
    });
  }
  box('fix.counterBattenNails', 'Ellenlécszeg',
    stats.counterBattenLength > 0 ? Math.ceil(stats.counterBattenLength / COUNTER_BATTEN_NAIL_SPACING - 1e-9) : 0,
    boxOf('counterBattenNail'),
    `⌈${hu(stats.counterBattenLength / 1000)} m ellenléc / ${hu(COUNTER_BATTEN_NAIL_SPACING / 1000)} m⌉`);
  box('fix.battenNails', 'Tetőlécszeg', stats.battenCrossings, boxOf('battenNail'),
    `${stats.battenCrossings} léc–ellenléc kereszteződés × 1 szeg`);
  box('fix.tileClips', 'Cserépkapocs', stats.tileClips, boxOf('tileClip'),
    `${stats.tileClips} kapocs az eresz menti és a szélső sorokba`);
  box('fix.claddingNails', 'Burkolatszeg', Math.ceil(stats.claddingArea * CLADDING_NAILS_PER_M2 - 1e-9), boxOf('claddingNail'),
    `${hu(stats.claddingArea, 2)} m² × ${CLADDING_NAILS_PER_M2} db/m²`);
  return lines;
}
