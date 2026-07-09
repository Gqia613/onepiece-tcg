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

// 拡大表示用（高解像度）。カードリストモーダルのタップ拡大やカルーセルの大判表示に使う。
export const IMG_BIG = (no: string) =>
  `https://images.weserv.nl/?url=${HOST}/${no}.png&w=640`;

// 小サムネ用（46〜70px表示。w320はオーバースペックなので帯域節約）
export const IMG_SM = (no: string) =>
  `https://images.weserv.nl/?url=${HOST}/${no}.png&w=160`;

// 公式「ONE PIECE CARD GAME」ロゴ（白・個人利用）。
// 直リンクは公式CDNがクロスサイト画像取得を弾くため、カード画像と同じ weserv プロキシ経由。
export const LOGO_WHITE = 'https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/renewal/images/common/logo_op_white.png&w=560';
