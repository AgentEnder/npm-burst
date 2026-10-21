/**
 * A `.wasm` import in the Worker entry. `@cloudflare/vite-plugin` compiles it
 * at build time, so the import is a ready `WebAssembly.Module`.
 */
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
