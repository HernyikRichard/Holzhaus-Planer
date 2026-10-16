import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCREEN_PALETTE } from '../viewer/theme';
import type { Layer3dId, Model3d } from './model';
import { buildThreeModel, modelToThree, presetCamera, type ThreeModel, type ViewPreset } from './threeScene';

/**
 * WebGL-kirajzoló a 3D ablakhoz. CSAK dinamikusan importálandó (`import('../three-d/renderer')`),
 * hogy a Three.js külön chunkba kerüljön. Render on demand: nincs animációs ciklus.
 */
export interface Renderer3d {
  setModel(m: Model3d): void; setVisible(l: Partial<Record<Layer3dId, boolean>>): void;
  setHighlight(ids: string[]): void; setHover(id: string | null): void;
  pick(clientX: number, clientY: number): { elementId?: string; label: string } | null;
  setView(p: ViewPreset): void; resize(w: number, h: number): void; dispose(): void;
  /** Szinkron kirajzolás, majd a vászon PNG data URL-je (a PDF képeihez). */
  snapshot(): string;
}

const FOV = 35;

/** WebGL hiányában (vagy ha a kontextus nem jön létre) `Error('webgl')`. */
export function createRenderer(canvas: HTMLCanvasElement, opts?: { preserveDrawingBuffer?: boolean }): Renderer3d {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: opts?.preserveDrawingBuffer ?? false });
  } catch {
    throw new Error('webgl');
  }
  renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCREEN_PALETTE.bg);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 1e6);
  scene.add(camera);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  // irányfény a kamerához kötve (bal-felülről), hogy minden oldalról nézve legyen megvilágított oldal
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-0.5, 1, 0.6);
  sun.target.position.set(0, 0, -1);
  camera.add(sun, sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;

  let frame = 0;
  const render = (): void => {
    frame = 0;
    renderer.render(scene, camera);
  };
  const requestRender = (): void => {
    if (frame) return;
    frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(render) : (render(), 0);
  };
  controls.addEventListener('change', requestRender);

  let current: ThreeModel | null = null;
  let bounds: Model3d['bounds'] | null = null;
  let visible: Partial<Record<Layer3dId, boolean>> = {};
  let highlight: string[] = [];
  let hover: string | null = null;
  const raycaster = new THREE.Raycaster();

  const applyView = (p: ViewPreset): void => {
    if (!bounds) return;
    const c = presetCamera(p, bounds, FOV, camera.aspect);
    camera.position.copy(modelToThree(c.position));
    camera.up.set(0, 1, 0); // modelToThree(+Z); az OrbitControls a létrehozáskori up-ot feltételezi
    controls.target.copy(modelToThree(c.target));
    camera.lookAt(controls.target);
    controls.update();
  };
  /** Közel/távol sík a ház méretéhez: a mélységpontosság ne vesszen el. */
  const fitClipping = (b: Model3d['bounds']): void => {
    const r = Math.max(1000, 0.5 * Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]));
    camera.near = r / 200;
    camera.far = r * 60;
    controls.maxDistance = r * 25;
    camera.updateProjectionMatrix();
  };

  return {
    setModel(m) {
      const first = current === null;
      current?.dispose();
      if (current) scene.remove(current.root);
      current = buildThreeModel(m);
      current.setVisible(visible);
      current.setHighlight(highlight);
      current.setHover(hover);
      scene.add(current.root);
      bounds = m.bounds;
      fitClipping(m.bounds);
      if (first) applyView('persp');
      requestRender();
    },
    setVisible(l) {
      visible = { ...l };
      current?.setVisible(visible);
      requestRender();
    },
    setHighlight(ids) {
      highlight = [...ids];
      current?.setHighlight(highlight);
      requestRender();
    },
    setHover(id) {
      if (id === hover) return;
      hover = id;
      current?.setHover(id);
      requestRender();
    },
    pick(clientX, clientY) {
      if (!current) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const meshes = current.pickables().filter(isShown);
      for (const hit of raycaster.intersectObjects(meshes, false)) {
        const s = current.solidAt(hit.object, hit.faceIndex ?? -1);
        if (s) return { ...(s.elementId ? { elementId: s.elementId } : {}), label: s.label };
      }
      return null;
    },
    setView(p) {
      applyView(p);
      requestRender();
    },
    resize(w, h) {
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render(); // szinkron: a vászon átméretezése törli a tartalmát
    },
    snapshot() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      render();
      return canvas.toDataURL('image/png');
    },
    dispose() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      if (current) {
        scene.remove(current.root);
        current.dispose();
        current = null;
      }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** A mesh és minden szülője látható-e (a rejtett rétegek nem kiválaszthatók). */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
