import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React版フロント。ビルド出力は dist/（Cloudflare Pages が配信）。
// functions/ は Cloudflare Pages Functions（Vite のビルド対象外）。
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', target: 'es2022' },
});
