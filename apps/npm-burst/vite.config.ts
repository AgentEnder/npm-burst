import { cloudflare } from '@cloudflare/vite-plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { telefunc } from 'telefunc/vite';
import vike from 'vike/plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  base: '/',
  server: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    // Per `vike.dev/cloudflare`, `cloudflare()` must come BEFORE
    // `vike()`. With this order + a recent `compatibility_date`
    // (≥2026-03-09 in wrangler.toml), Vike's dev RPC works inside
    // workerd and HMR is preserved. The plugin reads `wrangler.toml`
    // at the package root for `main`, compat date, and D1 binding.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    react(),
    nxViteTsPaths(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((globalThis as any).NX_GRAPH_CREATION ? [] : [vike()]),
    telefunc(),
  ],
  build: {
    outDir: './dist',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    emptyOutDir: true,
  },
}));
