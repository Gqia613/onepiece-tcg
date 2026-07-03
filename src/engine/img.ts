// カード画像URL生成（src/00-data.js:12 の IMG を再定義＋回転版）。
// weserv 経由で公式画像をホットリンク（referrerpolicy=no-referrer は <img> 側で付与）。
const HOST = 'ssl:www.onepiece-cardgame.com/images/cardlist/card';

export const IMG = (no: string) =>
  `https://images.weserv.nl/?url=${HOST}/${no}.png&w=320`;

// 直リンク（weserv 失敗時のフォールバック）
export const IMG_RAW = (no: string) =>
  `https://www.onepiece-cardgame.com/images/cardlist/card/${no}.png`;

// ライフ用 横向き（270°回転＝左側が画像の上）
export const IMG_ROT = (no: string) =>
  `https://images.weserv.nl/?url=${HOST}/${no}.png&ro=270&w=320`;
