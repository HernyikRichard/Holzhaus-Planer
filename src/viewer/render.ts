import type { Plan } from '../model/types';
import type { Scene } from '../scene/types';
import type { Bounds } from './camera';
import { VIEW_LAYERS, VIEW_NAMES, type LayerId, type ViewId } from './layers';
import { boundsOf, Kit, svgDocument } from './svgKit';
import type { ViewCtx } from './views/common';
import { drawFloorPlan } from './views/floorPlan';
import { drawWall } from './views/wall';
import { drawSection } from './views/section';
import { drawRoof } from './views/roof';
import { drawGable } from './views/gable';
import { drawFoundation } from './views/foundation';

export interface RenderInput {
  plan: Plan; scene: Scene; view: ViewId; layers: Record<LayerId, boolean>;
  palette: Record<string, string>; invalidOpeningIds?: Set<string>;
}
export interface RenderResult { svg: string; bounds: Bounds } // svg: <g>…</g> tartalom (nem teljes dokumentum)

function draw(input: RenderInput, screen: boolean): { svg: string; bounds: Bounds; kit: Kit } {
  const kit = new Kit({ palette: input.palette, screen });
  const offered = VIEW_LAYERS[input.view];
  const ctx: ViewCtx = {
    plan: input.plan, scene: input.scene, kit,
    on: (l: LayerId) => !offered.includes(l) || input.layers[l],
    invalid: input.invalidOpeningIds ?? new Set(),
  };
  let body = '';
  switch (input.view) {
    case 'floor': body = drawFloorPlan(ctx); break;
    case 'wall.N': case 'wall.E': case 'wall.S': case 'wall.W': body = drawWall(ctx, input.view.slice(5) as 'N'); break;
    case 'section': body = drawSection(ctx); break;
    case 'roof': body = drawRoof(ctx); break;
    case 'gable': body = drawGable(ctx); break;
    case 'foundation': body = drawFoundation(ctx); break;
    default: break; // táblázat-nézetek: nincs rajz
  }
  const b = kit.snapshot();
  const bounds: Bounds = Number.isFinite(b.minX) ? b : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return {
    svg: `<g class="view view-${input.view.replace(".", "-")}"${screen ? ' font-family="system-ui, sans-serif"' : ''}>${body}</g>`,
    bounds, kit,
  };
}

export function renderView(input: RenderInput): RenderResult {
  const { svg, bounds } = draw(input, true);
  return { svg, bounds };
}

/** Teljes `<svg>` dokumentum (PDF-hez): viewBox = bounds + margó, a paletta hátterével. */
export function renderStandalone(input: RenderInput): string {
  const { svg, bounds } = draw(input, false);
  const margin = boundsOf(bounds).max * 0.03;
  return svgDocument(bounds, margin, svg, VIEW_NAMES[input.view], input.palette.bg ?? 'none');
}
