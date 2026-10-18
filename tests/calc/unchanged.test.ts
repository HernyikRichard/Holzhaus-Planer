import expected from '../fixtures/frameOutputs.json';
import { FRAME_FIXTURE_PLANS, frameOutputHashes } from '../fixtures/frameOutputs';

// A betonlemez és a talajcsavar minden kimenete bájtra egyezik a pontalap előtti (de5cfce) állapottal;
// a pontalap és a betonpillér kimenete a sávalap előtti (b9c4ae0) állapottal.
describe.each(Object.keys(FRAME_FIXTURE_PLANS))('változatlan kimenet: %s', name => {
  const got = frameOutputHashes(FRAME_FIXTURE_PLANS[name]());
  const want = (expected as Record<string, Record<string, string>>)[name];
  test.each(Object.keys(want))('%s', key => {
    expect(got[key]).toBe(want[key]);
  });
  test('nincs új kimenet-kulcs', () => { expect(Object.keys(got)).toEqual(Object.keys(want)); });
});
