import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { telefunc } from 'telefunc/vite';
import vike from 'vike/plugin';
import { defineConfig } from 'vite';
import { telefuncDevContext } from './src/server/vite-dev-telefunc';

export default defineConfig({
  root: __dirname,
  server: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    vike({
      prerender: true,
    }),
    telefuncDevContext(),
    telefunc(),
  ],
  build: {
    outDir: './dist',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    emptyOutDir: true,
  },
  base: '/npm-burst',
});
