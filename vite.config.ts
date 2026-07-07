import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React版フロント。ビルド出力は dist/（Cloudflare Pages が配信）。
// functions/ は Cloudflare Pages Functions（Vite のビルド対象外）。
//
// ローカル開発（HMR＋認証/DBを両立）:
//   Terminal1: npm run pages:dev  … wrangler pages dev（functions＋ローカルD1）を :8788 で起動
//   Terminal2: npm run dev        … Vite(:5173, HMR)。/api は下記proxyで :8788 の wrangler へ転送
//   ブラウザは http://localhost:5173 を開く（初回のみ npm run d1:local でローカルD1にスキーマ適用）
// ※ Vite単体では functions/ が動かず /api が404になり、新規登録/ログインが失敗する。
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', target: 'es2022' },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
});
