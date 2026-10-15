import type { Plan } from '../model/types';
import type { TimberPiece } from '../calc/types';
import { assignCuts } from '../calc/cutting';
import { wallBattenPieces } from '../calc/walls';
import { wallFrameElements } from './wallFrame';
import { wallOsbElements } from './wallSheathing';
import { roofElements } from './roofFrame';
import { accessoryElements, floorElements, foundationElements } from './misc';
import { elementsToPieces } from './toPieces';
import type { Element, FastenerRef, Scene } from './types';

export function buildScene(plan: Plan): Scene {
  const wall = wallFrameElements(plan);
  const osb = wallOsbElements(plan, wall.elements);
  const roof = roofElements(plan);
  const elements: Element[] = [
    ...foundationElements(plan), ...floorElements(plan), ...wall.elements, ...osb.elements,
    ...roof.elements, ...accessoryElements(plan),
  ];
  const fasteners: FastenerRef[] = [...wall.fasteners, ...osb.fasteners, ...roof.fasteners];
  // a fali lécek pozíció nélküli darabok (nincs Elementjük), de a vágási kiosztásban szerepelniük kell
  const pieces: TimberPiece[] = [...elementsToPieces(elements), ...wallBattenPieces(plan)];
  return { elements, fasteners, cut: assignCuts(pieces, plan.settings.stockLengths) };
}
