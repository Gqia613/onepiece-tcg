/* tests/ai-core.js — 強いCPU(AI)基盤の回帰テスト（L1/L2/L3）。runConcat 経由で本体バンドル内で実行。
   検証: シード可能RNG / cloneGameState往復 / 特徴量と学習重みの整合 / evalWinProb / MCTSが実機で破綻なく1局完走。
   合格条件: fail=0。 */
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

let pass = 0, fail = 0;
function chk(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

(async () => {
  // 1) シード可能RNG: 同seed→同列、別seed→別列、範囲[0,1)
  function seq(s, n) { seedRng(s); const a = []; for (let i = 0; i < n; i++) a.push(rng()); return a; }
  const A = seq(42, 6), B = seq(42, 6), C2 = seq(7, 6);
  chk('rng 同seed再現', JSON.stringify(A) === JSON.stringify(B));
  chk('rng 別seed相違', JSON.stringify(A) !== JSON.stringify(C2));
  chk('rng 範囲[0,1)', A.every(x => x >= 0 && x < 1));

  // 2) cloneGameState 往復: 主要フィールド保存・深い独立性
  seedRng(5); G.players = {};
  G.players.me = buildPlayer('me', DECKS[0].id, false);
  G.players.cpu = buildPlayer('cpu', DECKS[1].id, true);
  for (let i = 0; i < 5; i++) { G.players.me.hand.push(G.players.me.deck.shift()); G.players.cpu.hand.push(G.players.cpu.deck.shift()); }
  G.players.me.chars.push(G.players.me.deck.shift());
  G.players.me.don = { active: 3, rested: 1 }; G.turnSeq = 4; G.active = 'me';
  const before = { hand: G.players.me.hand.length, deck: G.players.me.deck.length, don: G.players.me.don.active, ts: G.turnSeq, ch: G.players.me.chars.length };
  const snap = cloneGameState(G);
  chk('clone base再リンク', snap.players.me.chars[0].base === C[snap.players.me.chars[0].no]);
  chk('clone 関数除去', snap.pendingChoice === null);
  // cloneを壊しても元Gは不変
  snap.players.me.hand.length = 0; snap.players.me.don.active = 99;
  chk('clone 深い独立性', G.players.me.hand.length === before.hand && G.players.me.don.active === before.don);
  // loadで往復復元（識別子は元参照のまま戻す運用だが、load自体の内容保存も確認）
  const snap2 = cloneGameState(G); snap2.turnSeq = 77; loadGameState(snap2);
  chk('load 往復', G.turnSeq === 77 && G.players.me.hand.length === before.hand && typeof G.players.me.chars[0].base.power === 'number');

  // 3) 特徴量と学習重み（リーダー別）の整合
  chk('evalFeatures長 == EVAL_FEATURES', evalFeatures('me').length === EVAL_FEATURES.length);
  const W = (typeof window !== 'undefined') ? window.AI_WEIGHTS : null;
  if (W) {
    chk('AI_WEIGHTS features一致', JSON.stringify(W.features) === JSON.stringify(EVAL_FEATURES));
    const models = W.byLeader ? Object.values(W.byLeader).concat(W.default ? [W.default] : []) : (Array.isArray(W.w) ? [W] : []);
    chk('全モデルのw長 == 特徴量数', models.length > 0 && models.every(m => Array.isArray(m.w) && m.w.length === EVAL_FEATURES.length));
  }
  const wp = evalWinProb('me');
  chk('evalWinProb in [0,1]', wp >= 0 && wp <= 1);

  // 4) MCTSが実機で破綻なく1局完走（clone/復元/ロールアウト/eval の統合・低rollout高速）
  G._mctsRollouts = 2; G._mctsDepth = 2;
  async function playMcts(seed) {
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('lucy', 'lucy');
    G.players.me.isCPU = true; G.players.me.agent = 'mcts'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    return G.winner;
  }
  const w = await playMcts(123);
  chk('MCTS 1局完走（勝者確定・フリーズ無し）', w === 'me' || w === 'cpu');

  // 5) ★heuristic改良の回帰: CPUエネルの「レストのドン付与」は、アタック不可キャラでなく当ターン攻撃できる役に付与する
  seedRng(7); G.players = {}; G.turnSeq = 5; G.active = 'cpu';
  G.players.cpu = buildPlayer('cpu', 'enel', true); G.players.me = buildPlayer('me', 'lucy', false);
  const cpu = G.players.cpu; cpu.turnsTaken = 2; cpu._enelUsedTurn = -1;
  cpu.don = { active: 0, rested: 4 };
  // 攻撃できる役（前ターン以前に登場・レストでない・小パワー）と、攻撃不可の大型（当ターン登場・大パワー）
  const atkr = inst('OP15-061', 'cpu'); atkr.summonedTurn = 1; atkr.rested = false;   // 攻撃可能
  const bigNon = inst('OP15-061', 'cpu'); bigNon.summonedTurn = G.turnSeq; bigNon.rested = false; bigNon.attachedDon = 0; // 当ターン登場=攻撃不可
  bigNon.buffs = [{ amt: 5000, until: 'turnEnd' }];   // 大パワーに（旧実装ならこちらが選ばれる）
  cpu.chars = [bigNon, atkr];
  const canA = (typeof canCardAttack === 'function') && canCardAttack(atkr) && !canCardAttack(bigNon);
  await leaderActivate('cpu');
  chk('エネル付与は攻撃役へ（攻撃不可キャラに付与しない）', canA && atkr.attachedDon > 0 && bigNon.attachedDon === 0);

  // 6) ★heuristic改良の回帰: 相手の次ターン・リーサルリスク判定（ブロッカー温存の根拠）
  seedRng(9); G.players = {}; G.active = 'cpu';
  G.players.cpu = buildPlayer('cpu', 'enel', true); G.players.me = buildPlayer('me', 'teach', false);
  const cp = G.players.cpu, op = G.players.me;
  cp.life = cp.deck.splice(0, 2);                          // 自ライフ2
  op.chars = op.deck.splice(0, 3);                         // 相手盤面3体（実カード）→次ターン攻撃数 3+1=4
  chk('リスク有り(相手盤面が脅威)→温存判定true', typeof oppCanThreatenLethal === 'function' && oppCanThreatenLethal('cpu') === true);
  cp.life = cp.deck.splice(0, 3); cp.life.push({}, {}); op.chars = []; // 自ライフ5・相手盤面0
  chk('リスク無し(相手盤面が空)→温存判定false', oppCanThreatenLethal('cpu') === false);

  // 7) ★heuristic改良の回帰: フリー(ドン不要)でレストキャラをKOできるなら、ドンを払って顔を殴らずKOを選ぶ（相手ライフに余裕がある時）
  const _warn = console.warn; console.warn = () => {};
  seedRng(3); G.players = {}; G.turnSeq = 6; G.active = 'cpu';
  G.players.cpu = buildPlayer('cpu', 'enel', true); G.players.me = buildPlayer('me', 'teach', false);
  const c2 = G.players.cpu, m2 = G.players.me; c2.turnsTaken = 2; c2.don = { active: 4, rested: 0 };
  c2.leader.rested = true;                                  // CPUリーダーは攻撃不可（2000キャラの選択だけ見る）
  const a2 = inst('ZZA', 'cpu'); a2.summonedTurn = 1; a2.rested = false; a2.buffs = [{ amt: 1000, until: 'turnEnd' }]; c2.chars = [a2]; // P2000
  const r2 = inst('ZZR', 'me'); r2.summonedTurn = 1; r2.rested = true; m2.chars = [r2];   // P1000・レスト（フリーKO可）
  m2.life = []; for (let i = 0; i < 5; i++) m2.life.push(inst('ZZL', 'me'));               // 相手ライフ5（顔殴りが急務でない）
  console.warn = _warn;
  const needsDon = power(m2.leader) - power(a2) >= 2000;     // 2000キャラはリーダー連結に2ドン以上必要
  const pk = cpuPickAttack('cpu', { aggression: 'mid', removalPriority: [] });
  chk('フリーKO可能なら3ドン顔殴りでなくレストKOを選ぶ', needsDon && pk && pk.target === r2);

  console.log('  AI基盤テスト: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
