// Paquete para Script Applications de HCL DX Compose: un único suite.js (sin trozos dinámicos, porque DX guarda cada
// fichero de la Script Application con su propia URL) y un suite.css. Lo usa scripts/scriptapps.mjs.
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    outDir: 'build/scriptapp-bundle',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {format: 'es', entryFileNames: 'suite.js', assetFileNames: 'suite.css', inlineDynamicImports: true},
    },
  },
});
