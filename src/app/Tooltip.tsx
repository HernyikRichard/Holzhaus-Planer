import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { placeTooltip } from './tooltipText';

type P = { x: number; y: number };

/**
 * Az egér melletti buborék a vászon (vpW × vpH) szélén belül tartva. A mutató helyét a buborék maga tárolja:
 * a Viewer a `bind`-on át frissíti, így az egérmozgás nem rajzolja újra az egész nézetet.
 */
export function Tooltip({ lines, initial, bind, vpW, vpH }: {
  lines: string[]; initial: P; bind: { current: ((p: P) => void) | null }; vpW: number; vpH: number;
}) {
  const ref: Ref<HTMLDivElement> = useRef(null);
  const [pos, setPos] = useState<P>(initial);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  bind.current = setPos;
  useLayoutEffect(() => () => { if (bind.current === setPos) bind.current = null; }, []);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && (r.width !== dim.w || r.height !== dim.h)) setDim({ w: r.width, h: r.height });
  });
  const at = placeTooltip(pos.x, pos.y, dim.w, dim.h, vpW, vpH);
  return (
    <div ref={ref} class="tooltip" role="tooltip" style={{ left: `${at.left}px`, top: `${at.top}px` }}>
      {lines.map((l, i) => <div key={i} class={i === 0 ? 'tip-title' : undefined}>{l}</div>)}
    </div>
  );
}
