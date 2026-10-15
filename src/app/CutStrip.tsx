import type { Mm } from '../model/types';
import { cmText as cm, type StickPiece } from './selection';


/** Arányos csík a szálról: a saját darab sárga, a testvérek kék (kattinthatók, ha elemhez tartoznak), a maradék szürke. */
export function CutStrip({ pieces, stockLength, remainder, onPick }: {
  pieces: StickPiece[]; stockLength: Mm; remainder: Mm; onPick: (id: string) => void;
}) {
  const pct = (mm: Mm): string => `${(Math.max(mm, 0) / stockLength) * 100}%`;
  return (
    <div class="cutstrip" role="group" aria-label="Vágási csík">
      <div class="cutstrip-bar">
        {pieces.map(p => {
          const clickable = !p.self && !p.id.startsWith('wall.batten.');
          const style = { left: pct(p.offset), width: pct(p.length) };
          const title = `${p.label}: ${cm(p.length)}`;
          const cls = `cutstrip-piece ${p.self ? 'self' : 'sibling'}${p.id.startsWith('wall.batten.') ? ' noel' : ''}`;
          return clickable
            ? <button type="button" key={p.id} class={cls} style={style} data-piece={p.id} title={title} onClick={() => onPick(p.id)}>{cm(p.length)}</button>
            : <div key={p.id} class={cls} style={style} data-piece={p.id} title={title}>{cm(p.length)}</div>;
        })}
      </div>
      <ul class="cutstrip-legend">
        {pieces.map(p => <li key={p.id} class={p.self ? 'self' : ''}>{p.label}: {cm(p.length)}</li>)}
        <li>Maradék: {cm(remainder)}</li>
      </ul>
    </div>
  );
}
