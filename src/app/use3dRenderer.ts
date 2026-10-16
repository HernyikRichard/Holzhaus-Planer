import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
// csak típus: a kirajzoló (és vele a Three.js) dinamikusan töltődik, külön chunkba
import type { Renderer3d } from '../three-d/renderer';

/** A kirajzoló betöltése; objektumban, hogy a tesztek a betöltési hibát is ki tudják próbálni. */
export const rendererLoader = { load: () => import('../three-d/renderer') };

/** import: a chunk nem töltődött be; webgl: nincs WebGL; start: egyéb indítási hiba. */
export type Renderer3dStatus = 'loading' | 'ready' | 'import' | 'webgl' | 'start';

export interface Size3d { w: number; h: number }

export interface Use3dRendererOptions {
  /** A rajzfelület mérete (px); az első modell előtt és minden méretváltáskor. */
  measure: () => Size3d;
  /** Az elkészült kirajzoló kezdőállapota (kiemelés, láthatóság, modell) a méretezés után. */
  init: (r: Renderer3d) => void;
  /** Ennek az elemnek a méretváltása átméretezi a kirajzolót (ResizeObserver). */
  observe?: RefObject<HTMLElement>;
  /** Takarítás a kirajzoló elengedése előtt (pl. függő animációs keret). */
  onDispose?: () => void;
}

export interface Use3dRenderer {
  status: Renderer3dStatus;
  /** Az élő kirajzoló (betöltés / hiba alatt null). */
  renderer: { readonly current: Renderer3d | null };
  /** A vászon kulcsa: minden próbálkozás friss vásznon, mert a dispose() elengedi a WebGL-kontextust. */
  attempt: number;
  retry: () => void;
}

/**
 * A 3D kirajzoló betöltése és életciklusa: dinamikus import, hibaállapotok, Újra friss vásznon,
 * méretezés az első modell előtt, ResizeObserver, elengedés a komponens megszűnésekor.
 */
export function use3dRenderer(canvas: RefObject<HTMLCanvasElement>, opts: Use3dRendererOptions): Use3dRenderer {
  const [status, setStatus] = useState<Renderer3dStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const renderer = useRef<Renderer3d | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    rendererLoader.load().then(mod => {
      if (cancelled || !canvas.current) return;
      let r: Renderer3d;
      try {
        r = mod.createRenderer(canvas.current);
      } catch (err) {
        if (err instanceof Error && err.message === 'webgl') { setStatus('webgl'); return; }
        console.error(err);
        setStatus('start');
        return;
      }
      renderer.current = r; // a takarítás (bezárás / Újra) hiba esetén is elengedi
      try {
        const size = optsRef.current.measure();
        r.resize(size.w, size.h); // a valódi méret az első (perspektív) igazítás előtt
        optsRef.current.init(r);
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setStatus('start');
      }
    }, () => { if (!cancelled) setStatus('import'); });
    return () => {
      cancelled = true;
      optsRef.current.onDispose?.();
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const el = opts.observe?.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const s = optsRef.current.measure();
      renderer.current?.resize(s.w, s.h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { status, renderer, attempt, retry: () => setAttempt(a => a + 1) };
}

/** Az állapotüzenet a 3D helyén (null: nincs üzenet). */
export function rendererMessage(status: Renderer3dStatus, hasModel: boolean): string | null {
  return status === 'import' ? 'A 3D nézet nem tölthető be.'
    : status === 'webgl' ? 'A 3D nézethez WebGL-képes böngésző szükséges.'
    : status === 'start' ? 'A 3D nézet nem indítható el.'
    : !hasModel ? 'A 3D modell nem építhető fel ebből a tervből.'
    : status === 'loading' ? '3D betöltése…' : null;
}

/** Újrapróbálható-e a hiba (a WebGL hiánya nem). */
export const canRetry = (status: Renderer3dStatus): boolean => status === 'import' || status === 'start';
