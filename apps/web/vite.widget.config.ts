import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-widget',
    lib: {
      entry: 'src/widget/entry.ts',
      name: 'GradWidget',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        // Ensure single file output
        inlineDynamicImports: true,
      },
      // Bundle React and ReactDOM (do not externalize them)
      external: [],
    },
    // Ensure all dependencies are bundled
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
