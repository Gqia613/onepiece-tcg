#!/usr/bin/env node
/* tools/az-export.js — Python/GPU版(AlphaZero)の【自己対戦データ書き出し】。
   エンジン(JS・264枚fx)は真実源のまま、Nodeで自己対戦を回し PyTorch が読む JSONL を生成する。
   使い方: node tools/az-export.js                 （既定400局・6リーダー対フィールド）
           OPCG_GAMES=2000 OPCG_DECKS='teach,enel' node tools/az-export.js
   出力(pytorch/data/):
     value.jsonl   : 1行 = {"lk":リーダー,"y":0/1(勝敗),"f":[17特徴]}      ← evalFeatures（価値ヘッド用）
     policy.jsonl  : 1行 = {"lk":リーダー,"ci":選択index,"cands":[[16特徴]...]} ← polFeatures（アタック方策ヘッド用）
   ★ 特徴量は src/70-ai.js の evalFeatures / polFeatures と完全一致（学習と推論で同じ＝JSへ重みを戻して使う前提）。
   ★ 第1段階は「Stage A/B と同じ教師(heuristic)」でデータ生成しPyTorch学習の橋を検証する。
     第2段階で本物のper-action PUCT探索の訪問数を方策ターゲットにして強化する（pytorch/README.md）。 */
const fs = require('fs'), path = require('path');
const { runHarness, ROOT } = require('./../tests/_load-app');

const GAMES = +(process.env.OPCG_GAMES || 400);
const DECKS_POOL = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);
const OUT = path.join(ROOT, 'pytorch', 'data');
fs.mkdirSync(OUT, { recursive: true });

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const fs = require('fs');
const GAMES = ` + GAMES + `, LEADERS = ` + JSON.stringify(DECKS_POOL) + `;
const VALOUT = ` + JSON.stringify(path.join(OUT, 'value.json')) + `;
const POLOUT = ` + JSON.stringify(path.join(OUT, 'policy.json')) + `;
const VAL = [], POL = [], WIN = {}; let GI = -1, REC = false;

// 価値: 各ターン境界で両者の盤面特徴（evalFeatures）。勝敗ラベルは局後に付与。
const _bt = beginTurn;
beginTurn = async function (side) {
  if (REC && !G._sim && G.players.me && G.players.cpu && G.players.me.leader && G.players.cpu.leader) {
    VAL.push({ f: evalFeatures('me'), lk: leaderKeyOf('me'), side: 'me', gi: GI });
    VAL.push({ f: evalFeatures('cpu'), lk: leaderKeyOf('cpu'), side: 'cpu', gi: GI });
  }
  return _bt(side);
};
// 方策: 各アタック判断で全候補(attack+stop)のpolFeaturesとheuristicの選択index。
const _cpa = cpuPickAttack;
cpuPickAttack = function (side, plan) {
  if (REC && !G._sim && G.players[side] && G.players[side].leader) {
    const atts = legalActions(side).filter(a => a.k === 'attack');
    if (atts.length) {
      const cands = [...atts, { k: 'stop' }], feats = cands.map(a => polFeatures(side, a));
      const pick = _cpa(side, plan);
      let ci = cands.length - 1;
      if (pick) { const j = atts.findIndex(a => a.auid === pick.attacker.uid && a.tuid === pick.target.uid); if (j >= 0) ci = j; }
      POL.push({ cands: feats, ci: ci, lk: leaderKeyOf(side) });
      return pick;
    }
  }
  return _cpa(side, plan);
};

async function playGame(seed, dMe, dCpu) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed); REC = true;
  startGame(dMe, dCpu);
  G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  REC = false; WIN[GI] = G.winner;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));   // ドレイン
}
(async () => {
  const NL = LEADERS.length;
  for (let i = 0; i < GAMES; i++) await playGame(500000 + i, LEADERS[i % NL], LEADERS[(i / NL | 0) % NL]);
  // value: 勝敗が確定した局のみ y を付けて書き出し（JSON配列＝harnessの改行問題を回避）
  const vrows = [];
  for (const s of VAL) { const w = WIN[s.gi]; if (w !== 'me' && w !== 'cpu') continue; vrows.push({ lk: s.lk, y: w === s.side ? 1 : 0, f: s.f }); }
  const prows = POL.map(s => ({ lk: s.lk, ci: s.ci, cands: s.cands }));
  fs.writeFileSync(VALOUT, JSON.stringify(vrows));
  fs.writeFileSync(POLOUT, JSON.stringify(prows));
  // 特徴名・リーダーキー（学習側がJS重み形式へ戻すための契約。DRY＝ハードコードしない）
  fs.writeFileSync(` + JSON.stringify(path.join(OUT, 'meta.json')) + `, JSON.stringify({ evalFeatures: EVAL_FEATURES, polFeat: POL_FEAT, leaderKeys: LEADER_KEYS }));
  console.log('VALUE ' + vrows.length + ' / POLICY ' + prows.length + ' samples written');
  process.exit(0);
})();
`;

try { process.stdout.write(runHarness('az-export', harness, { timeout: 590000 })); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
console.log('→ pytorch/data/value.jsonl, pytorch/data/policy.jsonl');
