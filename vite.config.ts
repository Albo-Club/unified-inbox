import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      target: 'node-server',
      tsr: {
        autoCodeSplitting: true,
      },
    }),
    viteReact({
      babel: {
        plugins: [
          // React Compiler enabled by default in TanStack Start setups
          // ['babel-plugin-react-compiler', {}],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
      '@convex': path.resolve(__dirname, 'convex'),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
});
