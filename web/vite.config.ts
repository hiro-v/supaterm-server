import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'fs/promises': fileURLToPath(
        new URL('./src/shims/fs-promises.ts', import.meta.url),
      ),
      libghosty: fileURLToPath(
        new URL('../third_party/libghostty/lib/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
