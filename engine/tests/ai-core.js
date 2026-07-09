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
    const D = EVAL_FEATURES.length;
    const okModel = m => m.type === 'mlp'
      ? (m.mean.length === D && m.std.length === D && Array.isArray(m.W1) && m.W1.every(r => r.length === D) && m.W2.length === m.W1.length && m.b1.length === m.W1.length)
      : (Array.isArray(m.w) && m.w.length === D);
    chk('全モデルの入力次元 == 特徴量数', models.length > 0 && models.every(okModel));
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

  // 8) ★Stage B: アタック方策ネット(per-action policy prior)の健全性
  const LOADED_POL = (typeof window !== 'undefined') ? window.AI_POLICY : null;
  seedRng(11); G.players = {}; G.turnSeq = 6; G.active = 'cpu';
  G.players.cpu = buildPlayer('cpu', 'teach', true); G.players.me = buildPlayer('me', 'enel', false);
  const pcp = G.players.cpu; pcp.turnsTaken = 2; pcp.don = { active: 4, rested: 0 };
  const _w2 = console.warn; console.warn = () => {};
  const atk8 = inst('ZZA', 'cpu'); atk8.summonedTurn = 1; atk8.rested = false; pcp.chars = [atk8];
  console.warn = _w2;
  chk('polFeatures長 == POL_FEAT', typeof polFeatures === 'function' && typeof POL_FEAT !== 'undefined' && polFeatures('cpu', { k: 'stop' }).length === POL_FEAT.length);
  const la8 = (typeof legalActions === 'function') ? legalActions('cpu').filter(a => a.k === 'attack') : [];
  chk('polFeatures(attack)も同次元', la8.length > 0 && polFeatures('cpu', la8[0]).length === POL_FEAT.length);
  if (typeof window !== 'undefined') window.AI_POLICY = null;
  chk('方策未学習→policyPickAttackはnull(=cpuPickAttackへフォールバック)', typeof policyPickAttack === 'function' && policyPickAttack('cpu', { aggression: 'mid' }) === null);

  // npolicy エージェントが実機で1局完走（未学習でも cpuPickAttack フォールバックで通常進行）
  if (typeof window !== 'undefined') window.AI_POLICY = LOADED_POL;     // 学習済みがあれば本物の方策パスを通す
  async function playNpol(seed) {
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'enel'); G.players.me.isCPU = true; G.players.me.agent = 'npolicy'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    return G.winner;
  }
  const wn = await playNpol(55);
  chk('npolicy 1局完走（勝者確定・フリーズ無し）', wn === 'me' || wn === 'cpu');

  // 9) ★Phase2: policy-guided 決定化ロールアウト探索(puct)が実機で1局完走（小設定・clone/復元/境界価値ロールアウト統合）
  async function playPuct(seed) {
    G._puctDet = 1; G._puctLook = 1; G._puctWidth = 3;
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'enel'); G.players.me.isCPU = true; G.players.me.agent = 'puct'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    G._puctDet = null; G._puctLook = null; G._puctWidth = null;
    return G.winner;
  }
  const wp2 = await playPuct(31);
  chk('puct 1局完走（勝者確定・フリーズ無し）', wp2 === 'me' || wp2 === 'cpu');

  // 9b) ★puctが「ドン付与込みでも届かない自滅アタック」をしない（candidateActions/applyActionの届く判定の回帰）。
  //     アタッカー実効パワー < 対象パワー＝KOもライフも取れずレストになるだけ＝寝かせて次に狙われる損。通常heuristicは元々0。
  let _futileAtk = 0;
  const _declOrig = declareAttack;
  declareAttack = async function (a, t) { if (!G._sim && a && t && power(a) < power(t)) _futileAtk++; return _declOrig(a, t); };
  try { await playPuct(34); } finally { declareAttack = _declOrig; }
  chk('puct: 届かない自滅アタックが実プレイで0（パワー未満で寝ない）', _futileAtk === 0);

  // 10) ★ハイブリッド基盤(Phase0-2)＋puct2(Phase5)の回帰
  chk('エージェント登録: hybrid/hybridoff/puct2', !!(AGENTS.hybrid && AGENTS.hybridoff && AGENTS.puct2));
  // G._shape の評価シェイピングが evalWinProb(手作りフォールバック)を動かす／null時は不変
  G.players = {}; seedRng(9); startGame('enel', 'teach');
  if (typeof window !== 'undefined') window.AI_WEIGHTS = null;            // 手作りフォールバック経路を保証
  G.players.me.chars = [inst('OP15-067', 'me')];                          // 盤面/ドンに非対称を作る（差動特徴を非ゼロに）
  G.players.me.don.active = 4; G.players.cpu.don.active = 0;
  G._shape = null; const hfBase = evalWinProb('me');
  G._shape = { shape: { ramp: 0.5, longevity: 0.5, control: 0.5, threatQuality: 0.5, tempo: 0.5 } };
  const hfShaped = evalWinProb('me'); G._shape = null;
  chk('G._shape: 評価シェイピングがevalWinProbを変える', hfShaped !== hfBase);
  chk('G._shape=null: evalWinProb不変(決定的測定に無影響)', evalWinProb('me') === hfBase);
  // forbidChars 制約が候補からcharを除外（新カードzero-shotの土台）
  const hfCands = candidateActions('me').filter(a => a.k === 'char').map(a => { const c = findCard(a.uid); return c && c.base.name; }).filter(Boolean);
  if (hfCands.length) {
    G._shape = { constrain: { forbidChars: [hfCands[0]] } };
    const hfAfter = candidateActions('me').filter(a => a.k === 'char').map(a => { const c = findCard(a.uid); return c && c.base.name; });
    chk('forbidChars: 指定charを候補から除外', !hfAfter.includes(hfCands[0]));
    G._shape = null;
  } else chk('forbidChars: (charプレイ候補なし→スキップ)', true);
  // proxy未設定でも callClaude は即null・hybrid系は puct にフォールバック（ハングしない）
  G._proxyUp = undefined; const hfCc = await callClaude('s', 'u');
  chk('callClaude: proxy無しで即null＋セッションスキップ', hfCc === null && G._proxyUp === false);
  async function playHoff(seed) {
    G._puctDet = 1; G._puctLook = 1; G._puctWidth = 3;
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'enel'); G.players.me.isCPU = true; G.players.me.agent = 'hybridoff'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    G._puctDet = null; G._puctLook = null; G._puctWidth = null;
    return G.winner;
  }
  const wh = await playHoff(33);
  chk('hybridoff 1局完走（勝者確定・フリーズ無し）', wh === 'me' || wh === 'cpu');

  // 10b) ★web版「AI」モードの土台: hybrid(live Claude戦略×puct戦術)が、Claude不可環境(_proxyUp=false→callClaude即null)でも
  //      shape=null→puctへフォールバックして1局完走（＝LLMが落ちてもハングせず強いCPUとして成立する）。
  G._proxyUp = false;
  async function playHybrid(seed) {
    G._puctDet = 1; G._puctLook = 1; G._puctWidth = 3;
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'enel'); G.players.me.isCPU = true; G.players.me.agent = 'hybrid'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    G._puctDet = null; G._puctLook = null; G._puctWidth = null;
    return G.winner;
  }
  const wy = await playHybrid(35);
  chk('hybrid(Claude不可→puctフォールバック) 1局完走（web版AIモードの土台）', wy === 'me' || wy === 'cpu');
  G._proxyUp = undefined;

  // 10c) ★E37: enelはClaude戦略シェイプが有害(ミラー-5.0/対teach-10.0pt)→HYBRID_SKIPで素のpuct(=mcts)へ直行。
  //      enelのhybridターンでLLM問い合わせ(fetchStrategyFromClaude)が一度も呼ばれず、1局完走することを確認。
  let llmCalls = 0;
  const _fsc = fetchStrategyFromClaude;
  fetchStrategyFromClaude = async function (side) { llmCalls++; return _fsc(side); };
  G.players = {}; G.winner = null; G.inGame = false; seedRng(36);
  startGame('enel', 'teach'); G.players.me.isCPU = true; G.players.me.agent = 'hybrid'; G.players.cpu.agent = 'heuristic';
  { let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; } }
  fetchStrategyFromClaude = _fsc;
  chk('hybrid(enel)はHYBRID_SKIPで素のpuctへ直行（LLM問い合わせ0・1局完走）', (G.winner === 'me' || G.winner === 'cpu') && llmCalls === 0);

  // 11) ★E39: DECK_PLANS（サーチ先最適化・捨て札保護）の回帰
  chk('エージェント登録: planh', !!AGENTS.planh);
  G.players = {}; G.winner = null; seedRng(41); startGame('lucy', 'lucy');
  const P11 = G.players.me; P11.isCPU = true;
  const cBig = inst('OP15-046', 'me'), cSmall = inst('OP15-047', 'me');   // byPow=パワー大(cBig)が既定
  const cands11 = [cBig, cSmall];
  const fb11 = () => cpuPick(cands11, 'ownBig');
  const savedPlan11 = window.DECK_PLANS.byLeader.lucy;
  delete window.DECK_PLANS.byLeader.lucy;
  P11.usePlan = 1;
  chk('planPickSearch: プラン未掲載→fallback(byPow)', planPickSearch('me', cands11, fb11) === fb11());
  window.DECK_PLANS.byLeader.lucy = { wants: [{ no: cSmall.base.no, w: 5 }] };
  P11.usePlan = 0;
  chk('planPickSearch: usePlan未設定→fallback（既定バイト等価）', planPickSearch('me', cands11, fb11) === fb11());
  P11.usePlan = 1;
  chk('planPickSearch: wants指定の札を選ぶ', planPickSearch('me', cands11, fb11) === cSmall);
  // 飽和(max): 手札+盤面に既にkeep枚あればwant対象外→fallback
  window.DECK_PLANS.byLeader.lucy = { wants: [{ no: cSmall.base.no, w: 5, max: 1 }] };
  P11.hand.push(inst(cSmall.base.no, 'me'));
  chk('planPickSearch: max飽和→fallback', planPickSearch('me', cands11, fb11) === fb11());
  // minTurn: そのターン前は取らない
  window.DECK_PLANS.byLeader.lucy = { wants: [{ no: cSmall.base.no, w: 5, minTurn: 9 }] };
  P11.turnsTaken = 1;
  chk('planPickSearch: minTurn前→fallback', planPickSearch('me', cands11, fb11) === fb11());
  // 捨て札保護: 既定で先に捨てられる札をholdsで保護すると選択が変わる
  window.DECK_PLANS.byLeader.lucy = null; P11.usePlan = 1;
  window.DECK_PLANS.byLeader.lucy = undefined; delete window.DECK_PLANS.byLeader.lucy;
  const d1 = await chooseFromHand('me', cands11, 'test捨て札');           // プラン無し=既定の捨て札選択
  window.DECK_PLANS.byLeader.lucy = { holds: [{ no: d1.base.no, keep: 9 }] };
  const d2 = await chooseFromHand('me', cands11, 'test捨て札');
  chk('捨て札保護: holds該当が後回しになる', d2 !== d1);
  P11.usePlan = 0;
  const d3 = await chooseFromHand('me', cands11, 'test捨て札');
  chk('捨て札保護: usePlan未設定なら既定と同一', d3 === d1);
  // 後片付け（以後のテストに漏らさない）
  if (savedPlan11 !== undefined) window.DECK_PLANS.byLeader.lucy = savedPlan11; else delete window.DECK_PLANS.byLeader.lucy;

  // 12) ★E40: リーサル算術モジュール（assessThreat/threatOppLethal/heur3）の回帰
  chk('エージェント登録: heur3', !!AGENTS.heur3);
  G.players = {}; G.winner = null; seedRng(51); startGame('teach', 'teach');
  const P12 = G.players.me, O12 = G.players.cpu;
  P12.isCPU = true; O12.isCPU = true; G.active = 'me'; G.turnSeq = 10;
  // 盤面を構成: 相手=リーダー5000+大型2体(アクティブ)・ドン潤沢／自分=ライフ2・ブロッカー0・手札カウンター0
  O12.chars = [inst('OP16-119', 'cpu'), inst('OP09-093', 'cpu')];   // 10000/12000
  O12.chars.forEach(c => { c.rested = false; c.summonedTurn = 0; });
  O12.don = { active: 8, rested: 0 }; O12.donMax = 10;
  P12.life.length = 2; P12.chars = []; P12.hand = [];
  const t1 = assessThreat('me', 'next');
  chk('assessThreat: 大型2+リーダーで次ターン3ヒット', t1.maxHits >= 3);
  chk('assessThreat: 防御資源ゼロ→boardLethal(effHits>=life+1)', t1.boardLethal === true && t1.effHits >= 3);
  // 手札に2000カウンター4枚→壁8000で2本止まる→boardLethal解除
  for (let i = 0; i < 4; i++) { const c = inst('OP16-109', 'me'); P12.hand.push(c); }   // counter2000
  const t2 = assessThreat('me', 'next');
  chk('assessThreat: カウンター壁で実効被弾が減る', t2.effHits < t1.effHits && t2.boardLethal === false);
  // ドン到達の考慮: 相手ドン0なら「届かない弱小キャラ」は打点に数えない
  O12.chars = [inst('OP16-109', 'cpu')]; O12.chars[0].rested = false; O12.chars[0].summonedTurn = 0;  // P0キャラ
  O12.don = { active: 0, rested: 0 }; O12.donMax = 0;   // 次ターンも+2のみ
  const t3 = assessThreat('me', 'next');
  chk('assessThreat: ドンで届かない攻撃は数えない(リーダー分のみ)', t3.maxHits <= 2);
  // threatOppLethal は heur3 のときだけ holdBlk 経路で使われる（存在と真偽の健全性のみ確認）
  chk('threatOppLethal: bool を返す', typeof threatOppLethal('me') === 'boolean');
  chk('isThreatAware: agent=heur3のみ真', (P12.agent = 'heur3', isThreatAware('me')) && (P12.agent = 'heuristic', !isThreatAware('me')));
  // heur3 で1局完走（cpuCounter/holdBlk/reserveの新分岐が破綻しない）
  async function playHeur3(seed) {
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'teach'); G.players.me.isCPU = true; G.players.me.agent = 'heur3'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
    return G.winner;
  }
  const w12 = await playHeur3(52);
  chk('heur3 1局完走（勝者確定・フリーズ無し）', w12 === 'me' || w12 === 'cpu');

  // 13) ★E41: puct攻撃候補の+1ドン変種（G._atkDonVar・既定バイト不変）
  chk('エージェント登録: puctdon', !!AGENTS.puctdon);
  G.players = {}; G.winner = null; seedRng(61); startGame('teach', 'teach');
  // ★startGameの初期ターン連鎖を先に消化させる（meは人間のまま＝人間手番で停止する）。
  //   これをしないと後続の await(sleep=setImmediate) に保留中の beginTurn が割り込み、付与ドンを回収してしまう。
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P13 = G.players.me, O13 = G.players.cpu;
  G.active = 'me'; P13.turnsTaken = 3; P13.leader.rested = false;
  P13.don = { active: 5, rested: 0 }; O13.hand.length = 3;
  P13.isCPU = true; O13.isCPU = true;
  G._atkDonVar = 0;
  const base13 = candidateActions('me').filter(a => a.k === 'attack' && a.extraDon);
  chk('E41: フラグ無しでは extraDon 候補ゼロ（既定バイト不変）', base13.length === 0);
  G._atkDonVar = 1;
  const var13 = candidateActions('me').filter(a => a.k === 'attack' && a.extraDon && findCard(a.tuid) === O13.leader);
  chk('E41: フラグonでリーダー攻撃の+1ドン変種が生成される', var13.length >= 1);
  // applyAction が extraDon を1枚多く付与する
  if (var13.length) {
    const a13 = var13[0]; const at13 = findCard(a13.auid);
    const donBefore = P13.don.active, attBefore = at13.attachedDon || 0;
    const snap13 = cloneGameState(G), saved13 = Object.assign({}, G), rng13 = rngState();
    loadGameState(determinize(snap13, 'me')); G._sim = true; G._noChain = true;
    const at13s = findCard(a13.auid); const attB4 = at13s.attachedDon || 0; const donB4 = G.players.me.don.active;
    const tg13 = findCard(a13.tuid);
    const need13 = Math.max(0, Math.ceil((power(tg13) - power(at13s)) / 1000));
    let donAfterAttach = null;
    const _da13 = declareAttack; declareAttack = async function (a, t) { donAfterAttach = G.players.me.don.active; return _da13(a, t); };
    await applyAction('me', a13);
    declareAttack = _da13;
    chk('E41: applyActionが+1ドン多く付与する', donAfterAttach === donB4 - (need13 + 1));
    G._sim = false; G._noChain = false;
    for (const k of Object.keys(G)) delete G[k]; Object.assign(G, saved13); rngState(rng13);
    chk('E41: 復元後の実状態が不変', P13.don.active === donBefore && (findCard(a13.auid).attachedDon || 0) === attBefore);
  } else { chk('E41: (候補なしスキップ)', true); chk('E41: (候補なしスキップ2)', true); }
  G._atkDonVar = 0;

  // 14) ★E42: プール期待値リーサル判定と トリガー有用性ゲート（heur2）
  G.players = {}; G.winner = null; seedRng(71); startGame('teach', 'teach');
  const P14 = G.players.me, O14 = G.players.cpu;
  P14.isCPU = true; G.active = 'me'; G.turnSeq = 8; P14.turnsTaken = 3;
  chk('E42a: threatCanLethal は bool', typeof threatCanLethal('me') === 'boolean');
  // 相手ライフ0・盤面素通しならリーサル判定になる
  O14.life.length = 0; O14.chars = []; O14.hand.length = 0; O14.deck.length = 20;
  P14.leader.rested = false; P14.don.active = 3;
  chk('E42a: 相手ライフ0・防御なし→リーサル真', threatCanLethal('me') === true);
  // E42b: 相手キャラ対象のKOトリガーは、相手の場が空なら「発動しない」
  const trigCard14 = { base: { no: 'X', name: 'テスト', fx: { trigger: [{ op: 'ko', maxCost: 4 }] } } };
  O14.chars = [];
  chk('E42b: 対象不在の除去トリガー→発動しない', triggerWorthUsing('me', trigCard14) === false);
  O14.chars = [inst('OP16-110', 'cpu')];
  chk('E42b: 対象がいれば発動する', triggerWorthUsing('me', trigCard14) === true);
  const trigDraw14 = { base: { no: 'Y', name: 'テスト2', fx: { trigger: [{ op: 'draw', n: 2 }] } } };
  O14.chars = [];
  chk('E42b: draw系トリガーは常に発動', triggerWorthUsing('me', trigDraw14) === true);

  // 15) ★E43: 公開カード固定の決定化（_pubHand / G._beliefOn / bpuct）
  chk('エージェント登録: bpuct', !!AGENTS.bpuct);
  G.players = {}; G.winner = null; seedRng(81); startGame('teach', 'teach');
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P15 = G.players.me, O15 = G.players.cpu;
  // 相手(cpu)の手札の1枚に公開フラグを立て、me視点の決定化で常に手札スライスに入るか
  const pub15 = O15.hand[0]; pub15._pubHand = G.turnSeq;
  let inHand = 0, trials = 20;
  G._beliefOn = 1;
  for (let i = 0; i < trials; i++) { const s = determinize(cloneGameState(G), 'me'); if (s.players.cpu.hand.some(c => c.uid === pub15.uid)) inHand++; }
  chk('E43: beliefOn=公開カードは常に手札スライス', inHand === trials);
  G._beliefOn = 0;
  let inHandOff = 0;
  for (let i = 0; i < trials; i++) { const s = determinize(cloneGameState(G), 'me'); if (s.players.cpu.hand.some(c => c.uid === pub15.uid)) inHandOff++; }
  chk('E43: 既定(off)=一様再配分（常時手札にはならない）', inHandOff < trials);
  // 手札枚数/山枚数の保存（多重集合の整合）
  G._beliefOn = 1;
  const s15 = determinize(cloneGameState(G), 'me');
  chk('E43: 決定化後も手札/山の枚数が保存される', s15.players.cpu.hand.length === O15.hand.length && s15.players.cpu.deck.length === O15.deck.length);
  G._beliefOn = 0;
  // 公開カードが手札を離れたら(トラッシュへ)強制配置されない
  const left15 = O15.hand.shift(); O15.trash.push(left15);
  G._beliefOn = 1;
  const s15b = determinize(cloneGameState(G), 'me');
  chk('E43: 手札を離れた公開カードは配置対象外', !s15b.players.cpu.hand.some(c => c.uid === left15.uid));
  G._beliefOn = 0;

  // 16) ★E46: ステージ設置（STAGE_PLAY採用=teachは既定で置く／未掲載リーダーはheur2+h2On('stage')のみ）
  G.players = {}; G.winner = null; seedRng(91); startGame('lucy', 'lucy');
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P16 = G.players.me;
  P16.isCPU = true; G.active = 'me'; P16.turnsTaken = 1; G._h2Parts = null;   // turnsTaken=1=アタック不可（lucyリーダーの自アタック時STAGE捨てを排除）
  const st16 = inst('OP09-099', 'me');   // ハチノス(STAGE cost1)
  P16.hand.length = 0; P16.hand.push(st16);                   // 手札をSTAGEのみに固定（キャラ展開のドン消費を排除）
  P16.stage = null; P16.don = { active: 3, rested: 0 };
  P16.agent = 'heuristic'; G._sim = true; G._noChain = true;  // sim扱いでsleep短縮・連鎖抑止
  await heuristicTurn('me');
  chk('E46: 未掲載リーダー(lucy)の既定はSTAGEを出さない', P16.stage === null && P16.hand.includes(st16));
  P16.agent = 'heur2'; P16.don = { active: 3, rested: 0 };
  await heuristicTurn('me');
  chk('E46: heur2(opt-in)はSTAGEを設置する', !!P16.stage && P16.stage.uid === st16.uid && !P16.hand.includes(st16));
  G._sim = false; G._noChain = false;
  // teachは既定(heuristic)で設置（STAGE_PLAY採用）
  G.players = {}; G.winner = null; seedRng(92); startGame('teach', 'teach');
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P16b = G.players.me;
  P16b.isCPU = true; G.active = 'me'; P16b.turnsTaken = 2; G._h2Parts = null;
  const st16b = inst('OP09-099', 'me');
  P16b.hand.length = 0; P16b.hand.push(st16b);
  P16b.stage = null; P16b.don = { active: 3, rested: 0 };
  P16b.agent = 'heuristic'; G._sim = true; G._noChain = true;
  await heuristicTurn('me');
  chk('E46: teachの既定(heuristic)はSTAGEを設置する(STAGE_PLAY採用)', !!P16b.stage && P16b.stage.uid === st16b.uid);
  G._sim = false; G._noChain = false;

  // 17) ★E47: コンボライン（matchDeckLines / lineh / heuristicTurn冒頭のconsume-once実行）
  chk('エージェント登録: lineh', !!AGENTS.lineh);
  G.players = {}; G.winner = null; seedRng(101); startGame('teach', 'teach');
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P17 = G.players.me;
  P17.isCPU = true; G.active = 'me'; P17.turnsTaken = 1;
  const sh17a = inst('OP16-108', 'me'), sh17b = inst('OP16-108', 'me');
  P17.hand.length = 0; P17.hand.push(sh17a, inst('OP16-109', 'me'));   // 手札: シリュウ+捨てコスト用1枚
  P17.trash.push(sh17b);                                                // トラッシュ: シリュウ2枚目
  P17.don = { active: 6, rested: 0 };
  const m17 = matchDeckLines('me');
  chk('E47: shiryu-stackライン照合（手札+トラッシュ+ドン帯）', m17.some(l => l.id === 'shiryu-stack'));
  P17.trash.length = 0;
  chk('E47: トラッシュにシリュウ無し→照合しない', !matchDeckLines('me').some(l => l.id === 'shiryu-stack'));
  P17.trash.push(sh17b);
  // heuristicTurn冒頭のライン実行（consume-once）: シリュウが場に出る
  G._lineExec = { id: 'shiryu-stack', seq: [{ k: 'char', no: 'OP16-108' }] };
  G._sim = true; G._noChain = true;
  await heuristicTurn('me');
  G._sim = false; G._noChain = false;
  chk('E47: ライン実行でシリュウが登場する', P17.chars.some(c => c.uid === sh17a.uid));
  chk('E47: _lineExecはconsume-onceで消える', G._lineExec === null || G._lineExec === undefined);
  // hancock: 芳香脚ラインは相手ライフ<=1でのみ照合
  G.players = {}; G.winner = null; seedRng(102); startGame('hancock', 'hancock');
  for (let k = 0; k < 300 && !G.myActable && !G.winner; k++) await new Promise(r => setImmediate(r));
  const P17b = G.players.me, O17b = G.players.cpu;
  P17b.isCPU = true; G.active = 'me'; P17b.don = { active: 6, rested: 0 };
  P17b.hand.length = 0; P17b.hand.push(inst('OP07-057', 'me'));
  O17b.life.length = 3;
  chk('E47: 芳香脚ライン=相手ライフ3では照合しない', !matchDeckLines('me').some(l => l.id === 'houkou-lethal'));
  O17b.life.length = 1;
  chk('E47: 芳香脚ライン=相手ライフ1で照合する', matchDeckLines('me').some(l => l.id === 'houkou-lethal'));
  // lineh で1局完走（評価→実行→復元が破綻しない）
  async function playLineh(seed) {
    G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
    startGame('teach', 'teach'); G.players.me.isCPU = true; G.players.me.agent = 'lineh'; G.players.cpu.agent = 'heuristic';
    let it = 0; while (!(G.winner && !G._sim) && it < 3000000) { await new Promise(r => setImmediate(r)); it++; }
    for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
    return G.winner;
  }
  const w17 = await playLineh(103);
  chk('E47: lineh 1局完走（勝者確定・フリーズ無し）', w17 === 'me' || w17 === 'cpu');

  console.log('  AI基盤テスト: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
