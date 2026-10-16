import * as THREE from 'three';
import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { buildModel3d, solidBounds, type Model3d, type Solid, type Vec3 } from '../../src/three-d/model';
import { buildThreeModel, modelToThree, presetCamera, solidGeometry, type ViewPreset } from '../../src/three-d/threeScene';

const plan = createDefaultPlan();
const model: Model3d = buildModel3d(plan, buildScene(plan));

function box(over: Partial<Solid> = {}): Solid {
  return {
    layer: 'wallFrame', elementId: 'b1', label: 'Doboz', material: 'timber',
    origin: [1000, 2000, 300], uAxis: [1, 0, 0], vAxis: [0, 1, 0], nAxis: [0, 0, 1],
    outline: [[0, 0], [100, 0], [100, 50], [0, 50]], holes: [], depth: 1000, ...over,
  };
}
const triCount = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const close = (a: THREE.Vector3, b: Vec3): void => {
  expect(a.x).toBeCloseTo(b[0], 6); expect(a.y).toBeCloseTo(b[1], 6); expect(a.z).toBeCloseTo(b[2], 6);
};

describe('buildThreeModel', () => {
  it('one group per present layer', () => {
    const tm = buildThreeModel(model);
    expect(tm.root.children.map(c => c.name)).toEqual(model.layers);
    for (const g of tm.root.children) expect(g.children.some(c => (c as THREE.Mesh).isMesh)).toBe(true);
    tm.dispose();
  });

  it('setVisible hides group', () => {
    const tm = buildThreeModel(model);
    const grp = (id: string) => tm.root.children.find(c => c.name === id)!;
    tm.setVisible({ wallFrame: false });
    expect(grp('wallFrame').visible).toBe(false);
    expect(grp('foundation').visible).toBe(true);
    tm.setVisible({ wallFrame: true, foundation: false });
    expect(grp('wallFrame').visible).toBe(true);
    expect(grp('foundation').visible).toBe(false);
    tm.dispose();
  });

  it('merges per layer x material (not one mesh per solid)', () => {
    const tm = buildThreeModel(model);
    let meshes = 0;
    tm.root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; });
    const keys = new Set(model.solids.map(s => `${s.layer}|${s.material}`));
    expect(meshes).toBe(keys.size);
    tm.dispose();
  });

  it('unknown material key falls back without crashing', () => {
    const tm = buildThreeModel({ solids: [box({ material: 'unobtainium' })], layers: ['wallFrame'], bounds: solidBounds(box()) });
    let mat: THREE.Material | undefined;
    tm.root.traverse(o => { if ((o as THREE.Mesh).isMesh) mat = (o as THREE.Mesh).material as THREE.Material; });
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    tm.dispose();
  });

  it('root maps model Z-up into Three Y-up without mirroring (east stays east seen from the south)', () => {
    // model: X = kelet, Y = dél, Z = fel → Three: X = kelet, Y = fel, Z = dél (jobbsodrású, nem tükrözött kép)
    close(modelToThree([1, 2, 3]), [1, 3, 2]);
    const tm = buildThreeModel(model);
    tm.root.updateMatrixWorld(true);
    const p = new THREE.Vector3(1, 2, 3).applyMatrix4(tm.root.matrixWorld);
    close(p, [1, 3, 2]);
    tm.dispose();
  });
});

describe('solidGeometry', () => {
  it('box volume', () => {
    const g = solidGeometry(box());
    g.computeBoundingBox();
    const b = g.boundingBox!;
    close(b.min, [1000, 2000, 300]);
    close(b.max, [1100, 2050, 1300]);
    expect(triCount(g)).toBe(12);
  });

  it('maps local axes explicitly, also for a left-handed frame', () => {
    // fal-szerű keret: u = +X, v = +Z, n = +Y (u × v = −Y ≠ n)
    const s = box({ origin: [0, 0, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], nAxis: [0, 1, 0] });
    const g = solidGeometry(s);
    g.computeBoundingBox();
    close(g.boundingBox!.min, [0, 0, 0]);
    close(g.boundingBox!.max, [100, 1000, 50]);
  });

  it.each<[string, Partial<Solid>]>([
    ['right-handed', {}],
    ['left-handed', { uAxis: [1, 0, 0], vAxis: [0, 0, 1], nAxis: [0, 1, 0] }],
    ['clockwise outline', { outline: [[0, 0], [0, 50], [100, 50], [100, 0]] }],
  ])('outward winding and normals (%s)', (_n, over) => {
    const g = solidGeometry(box(over));
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), vn = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); d.fromBufferAttribute(pos, i + 2);
      n.subVectors(d, b).cross(new THREE.Vector3().subVectors(a, b)).normalize(); // (c−b) × (a−b): a Three szabálya
      const centroid = a.clone().add(b).add(d).divideScalar(3);
      expect(n.dot(centroid.sub(c))).toBeGreaterThan(0);
      vn.fromBufferAttribute(nor, i);
      expect(vn.dot(n)).toBeGreaterThan(0.99);
    }
  });

  it('hole reduces triangles', () => {
    const plain = box({ outline: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], depth: 20 });
    const holed = { ...plain, holes: [[[400, 400], [600, 400], [600, 600], [400, 600]] as [number, number][]] };
    const g0 = solidGeometry(plain);
    const g1 = solidGeometry(holed);
    expect(triCount(g1)).toBeGreaterThan(triCount(g0));
    const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const through = (u: number, v: number) => new THREE.Raycaster(new THREE.Vector3(1000 + u, 2000 + v, 0), new THREE.Vector3(0, 0, 1));
    expect(through(500, 500).intersectObject(mesh(g1)).length).toBe(0);
    expect(through(500, 500).intersectObject(mesh(g0)).length).toBeGreaterThan(0);
    expect(through(100, 100).intersectObject(mesh(g1)).length).toBeGreaterThan(0);
  });

  it('accepts clockwise holes and counter-clockwise holes alike', () => {
    const outline: [number, number][] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
    const ccwHole: [number, number][] = [[400, 400], [600, 400], [600, 600], [400, 600]];
    const a = solidGeometry(box({ outline, holes: [ccwHole], depth: 20 }));
    const b = solidGeometry(box({ outline: [...outline].reverse(), holes: [[...ccwHole].reverse()], depth: 20 }));
    expect(triCount(a)).toBe(triCount(b));
  });
});

describe('pick', () => {
  it('pick maps face to solid', () => {
    const tm = buildThreeModel(model);
    tm.root.updateMatrixWorld(true);
    // az északi fal egyik középső oszlopa: a fal normálisa mentén kívülről belőve csak ezt találja a falvázban
    const studs = model.solids.filter(s => s.layer === 'wallFrame' && s.elementId && s.nAxis[1] === 1 && s.vAxis[2] === 1
      && /\.stud\./.test(s.elementId));
    expect(studs.length).toBeGreaterThan(0);
    const mid = plan.building.width / 2;
    const target = [...studs].sort((p, q) => Math.abs(cx(p) - mid) - Math.abs(cx(q) - mid))[0];
    const b = solidBounds(target);
    const c: Vec3 = [(b.min[0] + b.max[0]) / 2, b.min[1] - 2000, (b.min[2] + b.max[2]) / 2];
    const frame = tm.root.children.find(g => g.name === 'wallFrame')!;
    const ray = new THREE.Raycaster(modelToThree(c), modelToThree([0, 1, 0]).normalize());
    const hit = ray.intersectObject(frame, true).find(h => (h.object as THREE.Mesh).isMesh);
    expect(hit).toBeDefined();
    const s = tm.solidAt(hit!.object, hit!.faceIndex!);
    expect(s?.elementId).toBe(target.elementId);
    expect(tm.solidAt(new THREE.Mesh(), 0)).toBeNull();
    tm.dispose();
  });

  it('highlight covers every solid of an id, hover replaces the previous one', () => {
    const tm = buildThreeModel(model);
    const counts = new Map<string, number>();
    for (const s of model.solids) if (s.elementId) counts.set(s.elementId, (counts.get(s.elementId) ?? 0) + 1);
    const multi = [...counts].find(([, n]) => n > 1)![0];
    const extraTris = (): number => {
      let n = 0;
      tm.root.traverse(o => { if (o.userData.overlay) n += triCount((o as THREE.Mesh).geometry); });
      return n;
    };
    const want = model.solids.filter(s => s.elementId === multi).reduce((n, s) => n + triCount(solidGeometry(s)), 0);
    tm.setHighlight([multi]);
    expect(extraTris()).toBe(want);
    tm.setHighlight([]);
    expect(extraTris()).toBe(0);
    tm.setHover(multi);
    expect(extraTris()).toBe(want);
    tm.setHover(null);
    expect(extraTris()).toBe(0);
    tm.dispose();
  });
});

function cx(s: Solid): number {
  const b = solidBounds(s);
  return (b.min[0] + b.max[0]) / 2;
}

describe('dispose', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dispose frees everything', () => {
    const created = vi.spyOn(THREE.BufferGeometry.prototype, 'setAttribute');
    const mats = vi.spyOn(THREE.Material.prototype, 'setValues');
    const gDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const mDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const tm = buildThreeModel(model);
    const id = model.solids.find(s => s.elementId)!.elementId!;
    tm.setHighlight([id]);
    tm.setHover(id);
    const geoms = new Set(created.mock.contexts as THREE.BufferGeometry[]);
    const materials = new Set(mats.mock.contexts as THREE.Material[]);
    tm.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) geoms.add(m.geometry);
      if (m.material) materials.add(m.material as THREE.Material);
    });
    expect(geoms.size).toBeGreaterThan(0);
    expect(materials.size).toBeGreaterThan(0);
    tm.dispose();
    const gDone = new Set(gDispose.mock.contexts);
    const mDone = new Set(mDispose.mock.contexts);
    expect([...geoms].filter(g => !gDone.has(g)).length).toBe(0);
    expect([...materials].filter(m => !mDone.has(m)).length).toBe(0);
  });
});

describe('presetCamera', () => {
  const bounds = model.bounds;
  const center: Vec3 = [0, 1, 2].map(i => (bounds.min[i] + bounds.max[i]) / 2) as Vec3;
  const corners: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);

  it("'N' is on the north side (smaller Y) and targets the bounds centre", () => {
    const c = presetCamera('N', bounds, 35, 4 / 3);
    expect(c.position[1]).toBeLessThan(bounds.min[1]);
    expect(c.target).toEqual(center);
    const s = presetCamera('S', bounds, 35, 4 / 3);
    expect(s.position[1]).toBeGreaterThan(bounds.max[1]);
    expect(presetCamera('E', bounds, 35, 4 / 3).position[0]).toBeGreaterThan(bounds.max[0]);
    expect(presetCamera('W', bounds, 35, 4 / 3).position[0]).toBeLessThan(bounds.min[0]);
  });

  it("'top' looks from above", () => {
    const c = presetCamera('top', bounds, 35, 4 / 3);
    expect(c.position[2]).toBeGreaterThan(bounds.max[2]);
    const dir = new THREE.Vector3(...c.target).sub(new THREE.Vector3(...c.position)).normalize();
    expect(dir.z).toBeLessThan(-0.999);
  });

  it("'persp' looks from the south-east, from above", () => {
    const c = presetCamera('persp', bounds, 35, 4 / 3);
    expect(c.position[0]).toBeGreaterThan(bounds.max[0]);
    expect(c.position[1]).toBeGreaterThan(bounds.max[1]);
    expect(c.position[2]).toBeGreaterThan(bounds.max[2]);
  });

  it.each<[ViewPreset, number]>([
    ['persp', 4 / 3], ['N', 4 / 3], ['E', 4 / 3], ['S', 0.5], ['W', 2], ['top', 4 / 3], ['top', 0.6],
  ])('%s (aspect %d) brings the whole bounds into view', (preset, aspect) => {
    const c = presetCamera(preset, bounds, 35, aspect);
    // a renderer ugyanígy: Three-koordinátában, Y-fel
    const cam = new THREE.PerspectiveCamera(35, aspect, 1, 1e7);
    cam.position.copy(modelToThree(c.position));
    cam.up.copy(modelToThree(c.up));
    cam.lookAt(modelToThree(c.target));
    cam.updateMatrixWorld(true);
    for (const k of corners) {
      const p = modelToThree(k).project(cam);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      expect(p.z).toBeLessThan(1);
      expect(p.z).toBeGreaterThan(-1);
    }
  });

  it("'top' keeps north at the top of the screen and east on the right", () => {
    const c = presetCamera('top', bounds, 35, 4 / 3);
    const cam = new THREE.PerspectiveCamera(35, 4 / 3, 1, 1e7);
    cam.position.copy(modelToThree(c.position));
    cam.up.copy(modelToThree(c.up));
    cam.lookAt(modelToThree(c.target));
    cam.updateMatrixWorld(true);
    const north = modelToThree([center[0], bounds.min[1], center[2]]).project(cam);
    const east = modelToThree([bounds.max[0], center[1], center[2]]).project(cam);
    expect(north.y).toBeGreaterThan(0);
    expect(east.x).toBeGreaterThan(0);
  });
});
