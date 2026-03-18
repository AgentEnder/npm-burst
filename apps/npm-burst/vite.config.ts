import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { telefunc } from 'telefunc/vite';
import vike from 'vike/plugin';
import { defineConfig, loadEnv } from 'vite';
import { githubApiDevContext } from './src/server/vite-dev-github-api';
import { telefuncDevContext } from './src/server/vite-dev-telefunc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');

  return {
    root: __dirname,
    server: {
      port: 4200,
      host: 'localhost',
    },
    plugins: [
      react(),
      nxViteTsPaths(),
      githubApiDevContext(env),
      ...((globalThis as any).NX_GRAPH_CREATION ? [] : [vike()]),
      telefuncDevContext(),
      telefunc(),
    ],
    build: {
      outDir: './dist',
      reportCompressedSize: true,
      commonjsOptions: { transformMixedEsModules: true },
      emptyOutDir: true,
    },
  };
});
