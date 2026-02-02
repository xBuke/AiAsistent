import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      include: /\.[jt]sx?$/,
      // Exclude widget directory from Fast Refresh to avoid preamble detection issues
      exclude: /\/src\/widget\//,
    }),
  ],
});
