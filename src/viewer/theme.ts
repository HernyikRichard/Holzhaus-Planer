export const SCREEN_PALETTE: Record<string, string> = {
  bg: '#12345a', panel: '#0b1524', line: '#cfe0ff', lineMuted: '#7fb3ff', highlight: '#ffd166',
  fastener: '#ff6b6b', accent: '#2b6cb0', gridMinor: 'rgba(255,255,255,0.06)', gridMajor: 'rgba(255,255,255,0.14)',
  sheet: '#7fb3ff', opening: '#7fb3ff', invalid: '#ff6b6b', dim: '#ffd166', text: '#d6e4ff',
  fastenerMuted: '#ff9e9e',
  wood: '#d9b779', concrete: '#9aa9bd', insulation: '#e8d27a',
};

export const PRINT_PALETTE: Record<string, string> = {
  bg: '#ffffff', panel: '#f4f4f4', line: '#1a1a1a', lineMuted: '#666666', highlight: '#c27a00',
  fastener: '#c62828', accent: '#1f4e8c', gridMinor: 'rgba(0,0,0,0.08)', gridMajor: 'rgba(0,0,0,0.25)',
  sheet: '#4a78b5', opening: '#4a78b5', invalid: '#c62828', dim: '#8a5a00', text: '#222222',
  fastenerMuted: '#e57373',
  wood: '#c8a165', concrete: '#b0b0b0', insulation: '#f3e19a',
};

/** A paletta CSS-változóként (--vw-<kulcs>) a megadott elemen. */
export function paletteStyle(p: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[`--vw-${k}`] = v;
  return out;
}
