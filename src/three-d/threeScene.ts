import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Layer3dId, Model3d, Solid, Vec3 } from './model';
import { SCREEN_PALETTE } from '../viewer/theme';

/**
 * A `Model3d` → Three.js jelenetfa, WebGL nélkül (Node/jsdom alatt is tesztelhető).
 *
 * Koordináták: a modell X = kelet, Y = dél, Z = fel (az alaprajz X/Y-ja), ez balsodrású.
 * A Three.js jobbsodrású, Y-fel: a `root` a (x, y, z) → (x, z, y) leképezést kapja
 * (−90° X körüli forgatás egy Y-tükrözés után). Puszta forgatással a ház tükörképe látszana
 * (felülnézetben kelet balra kerülne); a negatív determinánst a WebGLRenderer kezeli
 * (a mesh-ek front face-e megfordul), a Raycaster pedig helyi térben dolgozik.
 */
export function modelToThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[2], v[1]);
}

export interface ThreeModel {
  root: THREE.Group;                                     // rétegenként egy-egy gyerek Group (name = Layer3dId)
  solidAt(mesh: THREE.Object3D, faceIndex: number): Solid | null;
  setVisible(layers: Partial<Record<Layer3dId, boolean>>): void;
  setHighlight(elementIds: string[]): void;              // a kijelölt elemek kiemelő anyaggal
  setHover(elementId: string | null): void;
  /** A kiválasztható rétegmesh-ek (a renderer ezekre lő a Raycasterrel; a láthatóságot ő szűri). */
  pickables(): THREE.Mesh[];
  dispose(): void;                                        // minden geometria + anyag dispose()
}

export type ViewPreset = 'persp' | 'N' | 'E' | 'S' | 'W' | 'top';

// ---- anyagok ----

interface MatSpec { color: string; opacity?: number; metalness?: number; roughness?: number }
/** Anyagkulcs → megjelenés. A `transparent` kulcsok áttetszők, `depthWrite: false`-szal. */
const MATERIALS: Record<string, MatSpec> = {
  concrete: { color: '#9ea4ab', roughness: 0.95 },
  timber: { color: '#e6c690' },          // világos fenyő
  osb: { color: '#b98a52' },             // barnásabb
  boards: { color: '#d4ab70' },
  paneling: { color: '#d8b27c' },
  gypsum: { color: '#ece9e1' },
  cementBoard: { color: '#b4b8bb' },
  openingFrame: { color: '#eef1f4' },
  door: { color: '#8a5a3c' },
  glass: { color: '#a8d8ff', opacity: 0.3, roughness: 0.1 },
  foil: { color: '#cfe4ff', opacity: 0.4 },
  insulation: { color: '#ecd679', opacity: 0.45 },
  metal: { color: '#a3abb4', metalness: 0.6, roughness: 0.4 },
  tile: { color: '#b4553c' },
  trapezoid: { color: '#5e6a76', metalness: 0.4, roughness: 0.5 },
  shingle: { color: '#4b5058' },
  epdm: { color: '#33373c' },
  standingSeam: { color: '#8f979f', metalness: 0.6, roughness: 0.35 }, // alumínium, fémes szürke
};
const FALLBACK: MatSpec = { color: '#c6cad0' };
/** Élvonalak ezeken a fa/OSB anyagokon (küszöbszög 30°). */
const EDGED = new Set(['timber', 'osb', 'boards']);
const EDGE_ANGLE = 30;
const HOVER_COLOR = '#8fd0ff';

function makeMaterial(key: string, edged: boolean): THREE.MeshStandardMaterial {
  const s = MATERIALS[key] ?? FALLBACK;
  const transparent = s.opacity !== undefined;
  return new THREE.MeshStandardMaterial({
    color: s.color, roughness: s.roughness ?? 0.85, metalness: s.metalness ?? 0,
    transparent, opacity: s.opacity ?? 1, depthWrite: !transparent,
    // az élvonalak a lapok előtt látszódjanak (z-fighting nélkül)
    polygonOffset: edged, polygonOffsetFactor: edged ? 1 : 0, polygonOffsetUnits: edged ? 1 : 0,
  });
}

function overlayMaterial(color: string, offset: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, roughness: 0.7,
    polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 2,
  });
}

// ---- geometria ----

const toV2 = (pts: [number, number][]): THREE.Vector2[] => pts.map(([u, v]) => new THREE.Vector2(u, v));

/**
 * Shape + lyukak → ExtrudeGeometry a helyi (u, v, w) térben (w = 0…depth), majd a helyi tengelyekkel
 * világba: p = origin + u·uAxis + v·vAxis + w·nAxis. A körüljárás normalizálva (külső CCW, lyuk CW);
 * balsodrású helyi bázisnál (det < 0) a háromszögek sorrendje megfordul, hogy a front face kifelé nézzen.
 * Nem indexelt, `position` + `normal` attribútummal (uv nélkül).
 */
export function solidGeometry(s: Solid): THREE.BufferGeometry {
  let outline = toV2(s.outline);
  if (THREE.ShapeUtils.isClockWise(outline)) outline = outline.reverse();
  const shape = new THREE.Shape(outline);
  for (const h of s.holes) {
    let hole = toV2(h);
    if (!THREE.ShapeUtils.isClockWise(hole)) hole = hole.reverse();
    shape.holes.push(new THREE.Path(hole));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: s.depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.deleteAttribute('uv');
  g.clearGroups();
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...s.uAxis), new THREE.Vector3(...s.vAxis), new THREE.Vector3(...s.nAxis),
  ).setPosition(...s.origin);
  g.applyMatrix4(m); // a normálisokat az inverz-transzponálttal viszi: kifelé maradnak
  if (m.determinant() < 0) flipWinding(g);
  return g;
}

/** Nem indexelt geometria: minden háromszög 2. és 3. csúcsa felcserélve, minden attribútumban. */
function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const arr = a.array;
    const k = a.itemSize;
    for (let t = 0; t + 2 < a.count; t += 3) {
      const i1 = (t + 1) * k;
      const i2 = (t + 2) * k;
      for (let j = 0; j < k; j++) {
        const tmp = arr[i1 + j];
        arr[i1 + j] = arr[i2 + j];
        arr[i2 + j] = tmp;
      }
    }
    a.needsUpdate = true;
  }
}

const triangles = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

/** Testek egy geometriába egyesítve + háromszög-kezdőindexek a `solidAt`-hoz. */
function mergeSolids(solids: Solid[]): { geometry: THREE.BufferGeometry; starts: number[] } {
  const parts = solids.map(solidGeometry);
  const starts: number[] = [];
  let n = 0;
  for (const p of parts) {
    starts.push(n);
    n += triangles(p);
  }
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!geometry) throw new Error('mergeGeometries');
  if (parts.length > 1) for (const p of parts) p.dispose();
  return { geometry, starts };
}

// ---- jelenetfa ----

interface Entry { solids: Solid[]; starts: number[] }

export function buildThreeModel(model: Model3d): ThreeModel {
  const root = new THREE.Group();
  root.name = 'model3d';
  root.scale.set(1, -1, 1);
  root.rotation.x = -Math.PI / 2;

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (key: string): THREE.MeshStandardMaterial => {
    let m = materials.get(key);
    if (!m) {
      m = makeMaterial(key, EDGED.has(key));
      materials.set(key, m);
    }
    return m;
  };
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#4a3a26', transparent: true, opacity: 0.45, depthWrite: false });
  const highlightMaterial = overlayMaterial(SCREEN_PALETTE.highlight, 1);
  const hoverMaterial = overlayMaterial(HOVER_COLOR, 2);

  const entries = new Map<THREE.Object3D, Entry>();
  const groups = new Map<Layer3dId, THREE.Group>();
  const layerMeshes: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const byId = new Map<string, Solid[]>();

  for (const layer of model.layers) {
    const grp = new THREE.Group();
    grp.name = layer;
    groups.set(layer, grp);
    root.add(grp);
  }
  // rétegenként × anyagonként egy mesh, a testek eredeti sorrendjében
  const buckets = new Map<string, { layer: Layer3dId; material: string; solids: Solid[] }>();
  for (const s of model.solids) {
    const key = `${s.layer}|${s.material}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { layer: s.layer, material: s.material, solids: [] }));
    b.solids.push(s);
    if (s.elementId) {
      const list = byId.get(s.elementId);
      if (list) list.push(s); else byId.set(s.elementId, [s]);
    }
  }
  for (const b of buckets.values()) {
    let grp = groups.get(b.layer);
    if (!grp) {
      // a `layers` lista mindig tartalmazza a testek rétegeit; védőháló
      grp = new THREE.Group();
      grp.name = b.layer;
      groups.set(b.layer, grp);
      root.add(grp);
    }
    const { geometry, starts } = mergeSolids(b.solids);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materialFor(b.material));
    mesh.name = `${b.layer}:${b.material}`;
    mesh.userData.layerMesh = true;
    entries.set(mesh, { solids: b.solids, starts });
    layerMeshes.push(mesh);
    grp.add(mesh);
    if (EDGED.has(b.material)) {
      const eg = new THREE.EdgesGeometry(geometry, EDGE_ANGLE);
      geometries.push(eg);
      const lines = new THREE.LineSegments(eg, edgeMaterial);
      lines.name = `${mesh.name}:edges`;
      lines.raycast = () => {}; // élvonalak nem kiválaszthatók
      grp.add(lines);
    }
  }

  /** Kiemelő réteg: a megadott testek rétegenként egy kis mesh-ben, a rétegmesh fölött. */
  const overlay = (solids: Solid[], material: THREE.Material, name: string): THREE.Mesh[] => {
    const perLayer = new Map<Layer3dId, Solid[]>();
    for (const s of solids) {
      const list = perLayer.get(s.layer);
      if (list) list.push(s); else perLayer.set(s.layer, [s]);
    }
    const out: THREE.Mesh[] = [];
    for (const [layer, list] of perLayer) {
      const { geometry, starts } = mergeSolids(list);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${layer}:${name}`;
      mesh.userData.overlay = name;
      mesh.renderOrder = 1;
      entries.set(mesh, { solids: list, starts });
      groups.get(layer)!.add(mesh);
      out.push(mesh);
    }
    return out;
  };
  const clear = (meshes: THREE.Mesh[]): void => {
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      entries.delete(m);
    }
  };
  const solidsOf = (ids: Iterable<string>): Solid[] => {
    const out: Solid[] = [];
    for (const id of new Set(ids)) out.push(...(byId.get(id) ?? []));
    return out;
  };
  let highlightMeshes: THREE.Mesh[] = [];
  let hoverMeshes: THREE.Mesh[] = [];
  let highlightKey = '';
  let hoverKey: string | null = null;

  return {
    root,
    solidAt(mesh, faceIndex) {
      const e = entries.get(mesh);
      if (!e || !(faceIndex >= 0)) return null;
      // utolsó kezdőindex ≤ faceIndex (bináris keresés)
      let lo = 0;
      let hi = e.starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (e.starts[mid] <= faceIndex) lo = mid;
        else hi = mid - 1;
      }
      const s = e.solids[lo];
      const end = lo + 1 < e.starts.length ? e.starts[lo + 1] : triangles((mesh as THREE.Mesh).geometry);
      return s && faceIndex < end ? s : null;
    },
    setVisible(layers) {
      for (const [id, grp] of groups) grp.visible = layers[id] !== false;
    },
    setHighlight(elementIds) {
      const key = [...new Set(elementIds)].sort().join('\n');
      if (key === highlightKey) return;
      highlightKey = key;
      clear(highlightMeshes);
      highlightMeshes = overlay(solidsOf(elementIds), highlightMaterial, 'highlight');
    },
    setHover(elementId) {
      if (elementId === hoverKey) return;
      hoverKey = elementId;
      clear(hoverMeshes);
      hoverMeshes = elementId ? overlay(solidsOf([elementId]), hoverMaterial, 'hover') : [];
    },
    pickables() {
      return layerMeshes;
    },
    dispose() {
      clear(highlightMeshes);
      clear(hoverMeshes);
      highlightMeshes = [];
      hoverMeshes = [];
      for (const g of geometries) g.dispose();
      for (const m of materials.values()) m.dispose();
      edgeMaterial.dispose();
      highlightMaterial.dispose();
      hoverMaterial.dispose();
      entries.clear();
      root.clear();
    },
  };
}

// ---- gyorsnézetek ----

/** Nézési irány (a célponttól a kamera felé), modellkoordinátában: X = kelet, Y = dél, Z = fel. */
const PRESET_DIR: Record<ViewPreset, Vec3> = {
  persp: [1, 1, 0.85],          // délkeletről, felülről
  N: [0, -1, 0], S: [0, 1, 0], E: [1, 0, 0], W: [-1, 0, 0],
  top: [0, 1e-3, 1],            // felülről; a kis déli eltolás miatt Y-fel kamerával észak van fent
};
const FIT_MARGIN = 1.08;

/**
 * Kamera a befoglaló köré: a befoglaló gömbje a szűkebb (függőleges vagy vízszintes) látószögbe fér.
 * Modellkoordinátában ad vissza; `up` mindig +Z (a renderer `modelToThree`-vel alakítja át).
 */
export function presetCamera(preset: ViewPreset, bounds: Model3d['bounds'], fovDeg: number, aspect: number): { position: Vec3; target: Vec3; up: Vec3 } {
  const target: Vec3 = [0, 1, 2].map(i => (bounds.min[i] + bounds.max[i]) / 2) as Vec3;
  const r = Math.max(1, 0.5 * Math.hypot(...[0, 1, 2].map(i => bounds.max[i] - bounds.min[i])));
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const dist = (FIT_MARGIN * r) / Math.sin(Math.min(vHalf, hHalf));
  const d = PRESET_DIR[preset];
  const len = Math.hypot(...d);
  const position = target.map((c, i) => c + (d[i] / len) * dist) as Vec3;
  return { position, target, up: [0, 0, 1] };
}
