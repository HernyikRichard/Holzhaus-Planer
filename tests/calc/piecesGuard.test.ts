import { createDefaultPlan } from '../../src/model/defaults';
import { mono4x6Plan } from '../fixtures';
import { calcFloor } from '../../src/calc/floor';
import { calcWallFraming, calcWallLayers } from '../../src/calc/walls';
import { calcRoofStructure, calcRoofLayers } from '../../src/calc/roof';
import { calcAccessories } from '../../src/calc/accessories';
import { sectionKey } from '../../src/calc/util';
import type { TimberPiece } from '../../src/calc/types';

const key = (p: TimberPiece) => `${p.category}|${sectionKey(p.section)}|${Math.round(p.length)}|${p.label}`;
const multiset = (ps: TimberPiece[]) => ps.map(key).sort();
const plans = { default: createDefaultPlan(), mono4x6: mono4x6Plan() };
for (const [name, p] of Object.entries(plans)) {
  test(`pieces unchanged: ${name}`, () => {
    const all = [calcFloor(p), calcWallFraming(p), calcWallLayers(p), calcRoofStructure(p), calcRoofLayers(p), calcAccessories(p)]
      .flatMap(r => r.pieces);
    expect(multiset(all)).toMatchSnapshot();
  });
}
