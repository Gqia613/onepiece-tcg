#!/usr/bin/env node
/* tests/custom-decks.js — カスタムデッキ（新効果カード中心）でCPU対戦が破綻なく通るか検証。
   使い方: node tests/custom-decks.js
   全6色のリーダー(OP-13〜16)で効果実装カード(cards-fx.js)を優先した合法50枚デッキを自動生成し、
   総当たり(30対戦)でCPU対戦（me=簡易オートパイロット / cpu=本AI）を実行。
   合格条件: 勝者が出る(noWinner=0) / 同一ターン二重アタック無し(doubleAttacks=0) / フリーズ無し。
   併せて「新効果カードが何種類 実際に発動したか」を計測（CPUが新カードを使えている証跡）。 */
const { runHarness } = require('./_load-app');  // stubs+CARD_DB+CARD_FX+本体JS(src/00..60) の連結・実行を集約

const harness = String.raw`
process.on("unhandledRejection", e => { console.error("UNHANDLED", e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) {
  const o = cfg.opts || []; const t = cfg.title || ""; let v;
  if (t.indexOf("マリガン") >= 0) v = false; else if (t.indexOf("カウンター") >= 0) v = "__done"; else if (t.indexOf("トリガー") >= 0) v = true;
  else if (t.indexOf("ブロック") >= 0) v = (o[0] && String(o[0].v).indexOf("blk:") === 0) ? o[0].v : "__skip";
  else if (t.indexOf("ドン!!-") >= 0) v = "r"; else if (t.indexOf("ティーチ") >= 0) v = (o[0] && o[0].v) || "__no"; else if (t.indexOf("ルーシー") >= 0) v = false;
  else { const x = o.find(z => z.primary) || o.find(z => z.v && String(z.v).indexOf("pick:") === 0) || o.find(z => !z.disabled) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v);
};
humanPick = function (c) { return Promise.resolve((c || [])[0] || null); };
const usedFx = new Set(); const fxSet = new Set(Object.keys(window.CARD_FX));
const _runFx = runFx; runFx = async function (ops, ctx) { if (ctx && ctx.self && fxSet.has(ctx.self.base.no)) usedFx.add(ctx.self.base.no); return await _runFx(ops, ctx); };
let dblAtk = 0; const seen = {};
const _da = declareAttack; declareAttack = async function (a, t) { if (G._sim) return await _da(a, t); /* 先読みシミュ中の攻撃は計測しない */ const key = G.active + "#" + G.turnSeq + "#" + a.uid; if (seen[key]) { dblAtk++; console.log("DOUBLE ATTACK", a.base.name, "turn", G.turnSeq); } seen[key] = 1; return await _da(a, t); };
function buildCustomDeck(id, leaderNo) {
  const lc = C[leaderNo].color || [];
  const legal = window.CARD_DB.filter(c => c.type !== 'LEADER' && C[c.no] && (c.color || []).some(col => lc.includes(col)) && !/_p\d|_r\d/.test(c.no)).map(c => c.no);
  legal.sort((a, b) => ((C[a].cost || 0) - (C[b].cost || 0)) || (fxSet.has(b) - fxSet.has(a)) || (a < b ? -1 : 1));
  const list = {}; let total = 0;
  for (const no of legal) { if (total >= 50) break; const n = Math.min(4, 50 - total); list[no] = n; total += n; }
  return { id, name: id, leader: leaderNo, list, color: lc, tier: 'カスタム' };
}
const LEADERS = [['c-赤', 'OP16-001'], ['c-緑', 'OP14-020'], ['c-青', 'OP14-040'], ['c-紫', 'OP14-060'], ['c-黒', 'OP14-079'], ['c-黄', 'OP13-100']];
G.customDecks = LEADERS.map(([id, ld]) => buildCustomDeck(id, ld));
for (const d of G.customDecks) {
  const sum = Object.values(d.list).reduce((a, b) => a + b, 0);
  const miss = Object.keys(d.list).filter(no => !C[no]);
  if (sum !== 50 || miss.length) { console.log("DECK不正", d.id, "sum=" + sum, "miss=" + miss.join(",")); process.exit(1); }
}
async function pilotMe() {
  const me = G.players.me; let g = 0;
  while (g++ < 25) { const c = me.hand.find(c => handPlayable(c)); if (!c) break; await tryPlayHand(c); if (G.winner) return; }
  for (const c of me.chars) { if (c.base.fx && c.base.fx.act && c._actTurn !== G.turnSeq && !isNegated(c)) { const cost = c.base.fx.act.cost || {}; if ((!cost.don || me.don.active >= cost.don) && (!cost.restSelf || !c.rested)) { if (cost.don) payDon('me', cost.don); if (cost.restSelf) c.rested = true; c._actTurn = G.turnSeq; await runFx(c.base.fx.act.fx, { self: c, side: 'me' }); if (G.winner) return; } } }
  while (me.don.active > 0) { me.leader.attachedDon++; me.don.active--; }
  g = 0; while (g++ < 14 && canAttackThisTurn("me")) { const a = [me.leader, ...me.chars].filter(canCardAttack)[0]; if (!a) break; const tg = legalTargets("me", a); if (!tg.length) break; await declareAttack(a, tg[0]); if (G.winner) return; }
  uiEndTurn();
}
async function playOne(a, b) {
  G.players = {}; G.winner = null; G.inGame = false; startGame(a, b);
  let it = 0, p = false;
  while (!G.winner && it < 400000) {
    await new Promise(r => setImmediate(r)); it++;
    if (G.active === "me" && G.myActable && !G.busy && !p) { p = true; await pilotMe(); p = false; }
    if (it > 399000) { console.log("FREEZE? game", a, "vs", b, "turnSeq", G.turnSeq, "busy", G.busy, "active", G.active); break; }
  }
  return G.winner || "(none)";
}
(async () => {
  let ok = 0, bad = 0;
  for (let i = 0; i < LEADERS.length; i++) for (let j = 0; j < LEADERS.length; j++) {
    if (i === j) continue;
    const w = await playOne(LEADERS[i][0], LEADERS[j][0]); ok++; if (w === "(none)") bad++;
  }
  console.log("games=" + ok + " noWinner=" + bad + " doubleAttacks=" + dblAtk);
  console.log("使用された効果カード種類数=" + usedFx.size);
  process.exit((bad || dblAtk) ? 1 : 0);
})();
`;
try { process.stdout.write(runHarness('cd', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
