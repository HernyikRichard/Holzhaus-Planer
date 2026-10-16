import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // a Three.js (3D nézet) külön, lusta betöltésű chunk, kb. 585 kB: ez várt méret
  build: { chunkSizeWarningLimit: 650 },
  test: { globals: true, environment: 'node' },
});
