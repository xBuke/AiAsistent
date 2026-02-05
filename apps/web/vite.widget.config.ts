import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Replace process.env.NODE_ENV for browser compatibility
    // React and other dependencies check this to determine build mode
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
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
}));
