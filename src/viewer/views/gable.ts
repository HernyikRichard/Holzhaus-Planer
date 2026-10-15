import { drawWall, gableSide } from './wall';
import type { ViewCtx } from './common';

/** Oromfal-nézet: a nyeregtető oromfala (egyébként a lejtős oldalfal) a szarufák és a fogópárok metszetével. */
export function drawGable(ctx: ViewCtx): string {
  return drawWall(ctx, gableSide(ctx.plan), true);
}
