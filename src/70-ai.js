    "use strict";

    /* =========================================================================
       ===============  AI基盤（前向きモデル / エージェントseam）  ================
       強いCPUを作るための土台。ここは「ゲームの状態を複製して先読みする」ための層。
       - cloneGameState : G を安全に複製（決定境界で呼ぶ前提）
       - loadGameState  : 複製した状態を live な G に流し込む（実エンジンで先読みするため）
       - 設計方針は docs/ai-design.md / CLAUDE.md を参照。
       ========================================================================= */

    /* clone時に落とすフィールド（UI/一時/コールバックを含む。決定境界では未使用が前提）。
       - pendingChoice/promptState/attackSel : 解決中の選択。card参照のエイリアスを作るので除去。
       - builder/_hints/_aiIntent : UIや思考メモ。シミュレーションに不要。
       - log : 肥大化するうえ先読みに不要。 */
    const _CLONE_SKIP = new Set(['pendingChoice', 'promptState', 'attackSel', 'builder', '_hints', '_aiIntent', 'log']);

    // 状態内の全カードを列挙（base再リンク用）。leader/stage と各ゾーン配列を網羅。
    function _eachCard(state, fn) {
      for (const side of ['me', 'cpu']) {
        const P = state.players && state.players[side];
        if (!P) continue;
        if (P.leader) fn(P.leader);
        if (P.stage) fn(P.stage);
        for (const zone of ['chars', 'hand', 'deck', 'life', 'trash']) {
          const arr = P[zone];
          if (Array.isArray(arr)) for (const c of arr) if (c) fn(c);
        }
      }
    }

    /* G を複製。base(=C[no]) は共有不変なので複製せず、複製後に C[no] へ再リンク。
       fx はプレーンopなのでJSON安全。関数値(pendingChoice.res 等)はreplacerで除去。 */
    function cloneGameState(src) {
      src = src || G;
      const json = JSON.stringify(src, (k, v) => {
        if (typeof v === 'function') return undefined;     // コールバック類を除去
        if (_CLONE_SKIP.has(k)) return undefined;          // UI/一時フィールドを除去
        if (k === 'base') return undefined;                // base は no から再リンク（複製しない）
        return v;
      });
      const out = JSON.parse(json);
      // base / meta を共有参照に再リンク
      _eachCard(out, c => { c.base = C[c.no] || { no: c.no, name: c.no, type: 'CHAR', color: [], cost: 1, power: 1000, traits: [] }; });
      for (const side of ['me', 'cpu']) {
        if (out.players && out.players[side] && src.players[side]) out.players[side].meta = src.players[side].meta;
      }
      // 除去した一時フィールドを既定値で復元（loadGameState で live に戻せる形に）
      out.pendingChoice = null; out.promptState = null; out.attackSel = null;
      out._hints = null; out._aiIntent = null; out.log = [];
      return out;
    }

    /* 複製状態を live な G に流し込む（実エンジン関数は global G を読むため）。
       G は const なので中身を入れ替える。複製で落としたキーは既定値に戻す。 */
    function loadGameState(state) {
      for (const k of Object.keys(G)) if (!(k in state)) delete G[k];
      Object.assign(G, state);                       // busy 等の制御フラグも state の値をそのまま尊重（強制上書きしない）
      G.pendingChoice = null; G.promptState = null; G.attackSel = null;
      G._hints = null;
      if (!Array.isArray(G.log)) G.log = [];
      return G;
    }

    /* =========================================================================
       ===============  L2: 決定化MCTS (PIMC / flat Monte Carlo)  ===============
       不完全情報ゲームのため「相手の隠れ手札/山順を多数サンプリング(決定化)し、
       各候補(戦術方針)を浅くロールアウト→密eval/勝敗で採点、最良方針で打つ」。詳細は docs/ai-design.md §3。
       ロールアウトは G._sim でsleep省略・_noChain で完全await駆動・深さは rolloutPlan 内で明示制御。
       ★重要: 先読みで汚れた G は「元オブジェクト参照の復元」で巻き戻す（loadGameStateで複製を載せ直すと
         識別子が変わり実プレイが劣化する＝発見済みの罠。mctsTurn の復元箇所コメント参照）。
       ========================================================================= */

    // 現局面の能動的な全合法手を列挙（手札プレイ/起動/リーダー/アタック/終了）。
    function legalActions(side) {
      const P = G.players[side]; const acts = [];
      for (const c of P.hand) {
        const b = c.base;
        if (b.type === 'CHAR' && effCost(side, c) <= P.don.active && P.chars.length < 5) acts.push({ k: 'char', uid: c.uid });
        else if (b.type === 'STAGE' && (b.cost || 0) <= P.don.active) acts.push({ k: 'stage', uid: c.uid });
        else if (b.type === 'EVENT' && b.fx && b.fx.main && effCost(side, c) <= P.don.active) acts.push({ k: 'event', uid: c.uid });
      }
      for (const c of [...P.chars, ...(P.stage ? [P.stage] : [])]) {
        if (c.base.fx && c.base.fx.act && c._actTurn !== G.turnSeq && !isNegated(c)) {
          const cost = c.base.fx.act.cost || {};
          if ((!cost.don || P.don.active >= cost.don) && (!cost.restSelf || !c.rested)) acts.push({ k: 'act', uid: c.uid });
        }
      }
      const L = P.leader;
      if (L.base.leader === 'enel' && P._enelUsedTurn !== G.turnSeq && P.turnsTaken >= 2) acts.push({ k: 'leader' });
      else if (L.base.leader === 'lucy' && P._lucyDrawTurn !== G.turnSeq && P._lucyEventTurn === G.turnSeq) acts.push({ k: 'leader' });
      if (canAttackThisTurn(side)) for (const at of [P.leader, ...P.chars].filter(canCardAttack))
        for (const tg of legalTargets(side, at)) acts.push({ k: 'attack', auid: at.uid, tuid: tg.uid });
      acts.push({ k: 'stop' });
      return acts;
    }

    // 単一の合法手を live な G に適用（既存エンジンのプレイ手順をなぞる）。
    async function applyAction(side, a) {
      const P = G.players[side];
      if (a.k === 'stop') return;
      if (a.k === 'char') { const c = findCard(a.uid); if (!c || !P.hand.includes(c)) return; payDon(side, effCost(side, c)); P.hand.splice(P.hand.indexOf(c), 1); await summon(side, c, false); }
      else if (a.k === 'stage') { const c = findCard(a.uid); if (!c || !P.hand.includes(c)) return; payDon(side, c.base.cost || 0); P.hand.splice(P.hand.indexOf(c), 1); if (P.stage) P.trash.push(reset(P.stage)); P.stage = c; c.owner = side; c.rested = false; if (c.base.fx && c.base.fx.onPlay) await runFx(c.base.fx.onPlay, { self: c, side }); }
      else if (a.k === 'event') { const c = findCard(a.uid); if (!c || !P.hand.includes(c)) return; payDon(side, effCost(side, c)); P.hand.splice(P.hand.indexOf(c), 1); if ((c.base.cost || 0) >= 3) P._lucyEventTurn = G.turnSeq; await runFx(c.base.fx.main.fx, { self: c, side }); P.trash.push(reset(c)); await luffyReveal(side); }
      else if (a.k === 'act') { const c = findCard(a.uid); if (!c) return; const cost = c.base.fx.act.cost || {}; if (cost.don) payDon(side, cost.don); if (cost.restSelf) c.rested = true; c._actTurn = G.turnSeq; await runFx(c.base.fx.act.fx, { self: c, side }); }
      else if (a.k === 'leader') { await leaderActivate(side); }
      else if (a.k === 'attack') {
        const at = findCard(a.auid), tg = findCard(a.tuid); if (!at || !tg) return;
        const need = Math.max(0, Math.ceil((power(tg) - power(at)) / 1000));   // 対象に届く最小ドンだけ付与
        for (let i = 0; i < need && P.don.active > 0; i++) { at.attachedDon++; P.don.active--; }
        await declareAttack(at, tg);
      }
    }

    // 決定化: 相手の手札/山と自分の山を、未知カードの集合からランダム再構成（PIMCの肝）。
    function determinize(state, side) {
      const s = cloneGameState(state);
      const O = s.players[opp(side)];
      const pool = [...O.hand, ...O.deck]; shuffle(pool);   // 相手の未知カード=手札+山。多重集合を保ったまま再配分
      O.hand = pool.slice(0, O.hand.length); O.deck = pool.slice(O.hand.length);
      shuffle(s.players[side].deck);                        // 自分の未来ドローも未知→山をシャッフル（自己カンニング防止）
      return s;
    }

    // 盤面の評価（side視点・手作りの生スコア）。学習重みが無い時の evalWinProb フォールバック用。
    function evalState(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const bp = arr => arr.reduce((x, c) => x + power(c), 0);
      let s = 0;
      s += (P.life.length - D.life.length) * 1.3;
      s += (bp(P.chars) - bp(D.chars)) / 3000;
      s += (P.hand.length - D.hand.length) * 0.4;
      s += (P.chars.length - D.chars.length) * 0.5;
      return s;
    }

    /* ★L3: 学習する評価関数の入力＝盤面の特徴量ベクトル（side視点）。
       学習(tools/selfplay-train.js)と推論(evalWinProb)で“必ず同じ関数”を使う（不一致は学習を壊す）。
       特徴量を増減したら学習し直すこと（src/ai-weights.js を再生成）。
       後半6つは「相手リーダーのone-hot」＝マッチアップ条件付け（リーダー別モデルが対面ごとに価値を変えられる）。 */
    const LEADER_KEYS = ['lucy', 'ace', 'nami', 'hancock', 'teach', 'enel']; // 主要リーダーキー（未知は全0＝平均）。増やしたら再学習
    // ★特徴量は「盤面17＋相手リーダーone-hot6＝23」から検証実験を経て「盤面11＋one-hot6＝17」に確定。
    //   速攻/ダブルアタック/大型/手札カウンター/低コスト/ステージ の6つを足したら検証精度は同等以上でも
    //   end-to-end(arena)が悪化した（lucy +10pt→0pt）。「検証精度≠強さ・アリーナが正」「相手手札ベース特徴は
    //   決定化ロールアウトでサンプルノイズを注入し過適合」。特徴を増やすときは必ず arena で効果を確認してから採用する。
    const EVAL_FEATURES = ['lifeDiff', 'myLife', 'oppLife', 'boardPwrDiff', 'charDiff', 'handDiff',
      'blockerDiff', 'donDiff', 'activeCharDiff', 'leaderPwrDiff', 'toMove',
      ...LEADER_KEYS.map(k => 'oppLead_' + k)];
    function leaderKeyOf(side) { const L = G.players[side] && G.players[side].leader; return (L && L.base && L.base.leader) || (L && L.no) || ''; }
    function evalFeatures(side) {
      const P = G.players[side], D = G.players[opp(side)], o = opp(side);
      const bp = arr => arr.reduce((x, c) => x + power(c), 0) / 1000;
      const blk = arr => arr.filter(c => !c.rested && hasKw(c, 'blocker')).length;
      const act = arr => arr.filter(c => !c.rested).length;
      const oppLead = leaderKeyOf(o);
      return [
        P.life.length - D.life.length,                       // lifeDiff
        P.life.length,                                       // myLife（残り少は危険＝非線形に効く）
        D.life.length,                                        // oppLife
        bp(P.chars) - bp(D.chars),                           // boardPwrDiff（千単位）
        P.chars.length - D.chars.length,                     // charDiff
        P.hand.length - D.hand.length,                       // handDiff
        blk(P.chars) - blk(D.chars),                         // blockerDiff（アクティブ）
        (donTotal(side) || 0) - (donTotal(o) || 0),          // donDiff
        act(P.chars) - act(D.chars),                         // activeCharDiff（テンポ/脅威）
        (power(P.leader) - power(D.leader)) / 1000,          // leaderPwrDiff
        G.active === side ? 1 : 0,                            // toMove（手番＝テンポ）
        ...LEADER_KEYS.map(k => oppLead === k ? 1 : 0)       // 相手リーダー one-hot（マッチアップ）
      ];
    }
    // 学習重みからこのsideのリーダー用モデルを選ぶ（byLeader→default→旧フラット形式の順）。
    function pickModel(W, side) {
      if (!W) return null;
      if (W.byLeader) return W.byLeader[leaderKeyOf(side)] || W.default || null;
      if (Array.isArray(W.w)) return W;                      // 旧フラット形式（後方互換）
      return W.default || null;
    }
    // 学習NN(MLP)の純JS順伝播：標準化→隠れ層(ReLU)→出力(sigmoid)。外部依存なし＝file://でそのまま動く。
    //   m = { type:'mlp', mean[d], std[d], W1[h][d], b1[h], W2[h], b2 }
    function mlpForward(m, v) {
      const x = v.map((val, i) => (val - m.mean[i]) / (m.std[i] || 1));
      const h = m.b1.map((b, j) => { let z = b; const w1 = m.W1[j]; for (let i = 0; i < x.length; i++) z += w1[i] * x[i]; return z > 0 ? z : 0; });
      let z2 = m.b2; for (let j = 0; j < h.length; j++) z2 += m.W2[j] * h[j];
      return 1 / (1 + Math.exp(-z2));
    }
    // side視点の勝率推定 [0,1]。学習重み(window.AI_WEIGHTS, リーダー別)があれば NN/線形、無ければ手作りevalにフォールバック。
    function evalWinProb(side) {
      const W = (typeof window !== 'undefined' && window.AI_WEIGHTS) ? window.AI_WEIGHTS : null;
      const m = pickModel(W, side);
      if (m) {
        const v = evalFeatures(side);
        if (m.type === 'mlp' && m.W1) return mlpForward(m, v);       // NN(MLP)
        if (Array.isArray(m.w)) {                                    // 線形(ロジスティック)
          let z = m.b || 0; for (let i = 0; i < m.w.length && i < v.length; i++) z += m.w[i] * v[i];
          return 1 / (1 + Math.exp(-z));
        }
      }
      return 0.5 + 0.5 * Math.tanh(evalState(side) / 4);     // 手作りフォールバック
    }

    /* =====================  Stage B: アタック方策ネット(per-action policy prior)  =====================
       最も戦略的な「アタック着手」を学習対象にした per-action 方策ネット。
       候補手(各attack＋stop)を共通次元の特徴量 polFeatures で表し、ネットのロジットを softmax してランク。
       学習: tools/train-policy.js が heuristic(=cpuPickAttack)の選択を behavioral cloning（Stage B＝教師蒸留）。
             Stage C では同じネットを「探索(MCTS)が改善した着手」に再学習するだけで強化できる（目標の差し替え）。
       推論: window.AI_POLICY（src/ai-policy.js, リーダー別）。null なら従来 cpuPickAttack にフォールバック。  */
    var POL_FEAT = ['atkLeader', 'atkChar', 'stop', 'atkPow', 'tgtPow', 'tgtBlocker', 'powDiff', 'donNeed', 'dbl', 'unblock', 'myDonL', 'myBoard', 'oppBoard', 'myLife', 'oppLife', 'lethalIf'];
    // 着手a(attack/stop)の特徴量。live状態sで計算（apply不要＝軽量）。全候補が同一次元。
    function polFeatures(side, a) {
      const P = G.players[side], D = G.players[opp(side)];
      const ctx = [(P.don.active || 0) / 10, P.chars.length / 5, D.chars.length / 5, P.life.length / 5, D.life.length / 5];
      if (a.k === 'stop') return [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, ...ctx, 0];
      const at = findCard(a.auid), tg = findCard(a.tuid);
      if (!at || !tg) return [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, ...ctx, 0];
      const atk = power(at), tp = power(tg), isLead = (tg === D.leader);
      const donNeed = Math.max(0, Math.ceil((tp - atk) / 1000));
      const dbl = hasKw(at, 'doubleAttack') ? 1 : 0;
      const unb = (typeof isUnblockable === 'function' && isUnblockable(at)) ? 1 : 0;
      const lethalIf = (isLead && D.life.length <= (dbl ? 2 : 1)) ? 1 : 0;   // この攻撃が通れば詰みに近い
      return [isLead ? 1 : 0, isLead ? 0 : 1, 0, atk / 10000, tp / 10000, hasKw(tg, 'blocker') ? 1 : 0, (atk - tp) / 10000, donNeed / 4, dbl, unb, ...ctx, lethalIf];
    }
    // 方策ネットの生ロジット（softmax用・sigmoid前）。m={type:'policy',mean,std,W1[h][d],b1[h],W2[h],b2}
    function mlpLogit(m, v) {
      const x = v.map((val, i) => (val - m.mean[i]) / (m.std[i] || 1));
      let z2 = m.b2; for (let k = 0; k < m.b1.length; k++) { let z = m.b1[k]; const w1 = m.W1[k]; for (let j = 0; j < x.length; j++) z += w1[j] * x[j]; if (z > 0) z2 += m.W2[k] * z; }
      return z2;
    }
    function pickPolicyModel(side) {
      const W = (typeof window !== 'undefined' && window.AI_POLICY) ? window.AI_POLICY : null;
      if (!W) return null;
      return (W.byLeader && W.byLeader[leaderKeyOf(side)]) || W.default || null;
    }
    // 学習方策でアタック着手を選ぶ（候補=legalActionsのattack＋stop）。cpuPickAttack同様、選んだら donNeed を付与して返す。
    // 戻り: {attacker,target} / null(=これ以上殴らない or 未学習)。呼び元は usepol で未学習を切り分ける。
    function policyPickAttack(side, plan) {
      const m = pickPolicyModel(side); if (!m) return null;
      const cands = legalActions(side).filter(a => a.k === 'attack');
      if (!cands.length) return null;
      let best = null;
      for (const a of [...cands, { k: 'stop' }]) { const z = mlpLogit(m, polFeatures(side, a)); if (!best || z > best.z) best = { a, z }; }
      if (!best || best.a.k === 'stop') return null;            // 方策が「ターンを終える」を最良と判断
      const at = findCard(best.a.auid), tg = findCard(best.a.tuid); if (!at || !tg) return null;
      const need = Math.max(0, Math.ceil((power(tg) - power(at)) / 1000));
      for (let i = 0; i < need && G.players[side].don.active > 0; i++) { at.attachedDon++; G.players[side].don.active--; }
      return { attacker: at, target: tg };
    }

    /* 候補手の剪定: 全合法手は多すぎる&雑魚への攻撃は無価値。意味のある手だけに絞る。
       - 手札プレイ/起動/リーダー: そのまま（多くない）
       - アタック: リーダーへの攻撃 と「相手の脅威(ブロッカー/大型/効果持ち)レストキャラのKO」だけ
       - stop（ここでターンを終える）を必ず含む（過剰展開を止められる＝ヒューリスティックの主な穴） */
    function candidateActions(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const acts = [];
      const all = legalActions(side);
      for (const a of all) {
        if (a.k === 'attack') {
          const tg = findCard(a.tuid);
          if (!tg) continue;
          if (tg === D.leader) { acts.push(a); continue; }                 // リーダー攻撃は常に候補
          const threat = hasKw(tg, 'blocker') || power(tg) >= 5000 || (tg.base.fx && (tg.base.fx.onKO || tg.base.fx.act));
          if (threat) acts.push(a);                                        // 脅威キャラのKOのみ
        } else acts.push(a);                                               // 非アタック（プレイ/起動/leader/stop）は全部
      }
      return acts;
    }

    /* 1プラン・ロールアウト: 状態sでこのターンを override方針(null=heuristic自然) で打ち、
       以降は両者heuristicで【深さDEPTHターン】進め、終局なら勝敗(1/0)、未終局なら勝率推定 evalWinProb[0,1] を返す。
       ★ターン全体を方針で打つので盤面はフル展開され、per-actionで起きた過小展開が無い。
       ★連鎖は _noChain で完全await駆動（残留async無し＝snap復元安全・外側観測に漏れない）。 */
    async function rolloutPlan(s, side, override) {
      const DEPTH = G._mctsDepth || 4;
      loadGameState(s);
      G.players.me.isCPU = true; G.players.cpu.isCPU = true;  // 先読み中は両者を自動プレイヤー扱い（実状態はsnap復元で無影響）
      G._sim = true; G._noChain = true; G._planOverride = override;
      try {
        await heuristicTurn(side);                            // このターンを指定方針でフルに打つ
        G._planOverride = null;                               // 以降は素のheuristic
        if (!G.winner) await endTurn(side);
        let cur = side, t = 0;
        while (!G.winner && t < DEPTH) { cur = opp(cur); await beginTurn(cur); t++; }
        if (G.winner) return G.winner === side ? 1 : 0;
        return evalWinProb(side);                             // 学習評価(あれば)／手作りフォールバック
      } finally { G._sim = false; G._noChain = false; G._planOverride = null; }
    }

    /* MCTSエージェントの能動ターン（決定化フラットMC・マクロ方針探索／非退行設計）:
       「heuristicの自然な手(override=null)を既定」とし、戦術方針(aggression)を決定化ロールアウトで評価、
       自然手を一定マージン超で上回る方針がある時だけ上書きする＝非退行かつ勝ち越し。
       ★実測(ミラー・公平ペア比較): heuristic を約+6〜7pt 上回る（ROLLOUTS/DEPTH/CANDS/MARGIN で調整可。
         増やすほど強いが遅い）。さらなる強化は L3(学習評価)/本格UCT が前提。docs/ai-design.md §3 参照。
       ★ハマった罠: per-action探索はヒューリスティック補完で差が消え(masking)/過小展開で弱化。
         また先読み後の復元を loadGameState(複製) で行うと識別子が変わり実プレイが劣化した（→元参照復元で解決）。 */
    async function mctsTurn(side) {
      if (G._sim) return heuristicTurn(side);                         // ★ロールアウト中の自分の手番は既定方策で（探索の入れ子＝指数爆発を防ぐ）
      const ROLLOUTS = G._mctsRollouts != null ? G._mctsRollouts : 8;  // 決定化サンプル数/候補方針
      const MARGIN = G._mctsMargin != null ? G._mctsMargin : 0.05;    // 自然手をこのマージン超で上回る方針だけ採用（ノイズで退行しない）
      const CANDS = G._mctsCands || [null, { aggression: 'high' }, { aggression: 'low' }]; // null=heuristic自然
      const snap = cloneGameState(G);                                // 決定化ロールアウトの元（純クローン）
      const saved = Object.assign({}, G);                            // ★実状態の「元オブジェクト参照」を退避
      const rngSave = rngState();                                    // ★先読みで消費するrngを実ゲームに漏らさない（隔離）
      let natV = 0, best = null;
      for (const ov of CANDS) {
        let sum = 0;
        for (let r = 0; r < ROLLOUTS; r++) sum += await rolloutPlan(determinize(snap, side), side, ov);
        const v = sum / ROLLOUTS;
        if (ov === null) natV = v;
        if (!best || v > best.v) best = { ov, v };
      }
      // ★復元: ロールアウトでGはクローンに差し替わっている。loadGameStateで“別物の複製”を載せると
      //   オブジェクト識別子が変わり実プレイが劣化する（実測）。元オブジェクト参照をそのまま戻す（無傷＝識別子保持）。
      for (const k of Object.keys(G)) delete G[k];
      Object.assign(G, saved); rngState(rngSave);
      const chosen = (best && best.v > natV + MARGIN) ? best.ov : null; // 自然手を明確に上回る時だけ上書き
      G._planOverride = chosen;
      try { await heuristicTurn(side); } finally { G._planOverride = null; }
      // endTurn は呼び出し元(beginTurn)が行う
    }

    AGENTS.mcts = { takeTurn: mctsTurn };   // P.agent='mcts' で有効化（AGENTSは50-input-cpu-ai.jsで定義）

    /* Stage A: 価値誘導の行動方策（policy via value）。policy iteration の土台。
       各候補手を「打った直後の盤面価値 evalWinProb」で評価し、最良手(stop含む)を実行、を1手ずつ繰り返す。
       ＝heuristicの手作りスコアリングを“学習可能な価値関数”に置換した行動方策。価値が正確なほど強い。
       戦闘(declareAttack)は相手の隠れ手札(カウンター)に依存するのでattack手のみ決定化D回平均（他はevalFeaturesが手札中身に依存せず1回でよい）。
       葉=価値（ロールアウト非依存＝低分散・heuristic非依存）。復元は mctsTurn 同様「元参照を戻す」。 */
    async function vlookTurn(side) {
      if (G._sim) return heuristicTurn(side);
      const D = G._vlookDet != null ? G._vlookDet : 4;   // 決定化数（attack手のみ使用）
      let guard = 0;
      while (guard++ < 30 && !G.winner) {
        const acts = legalActions(side);
        if (acts.length <= 1) break;                      // stop のみ
        const snap = cloneGameState(G);                   // 現在の実状態
        const saved = Object.assign({}, G);               // 元参照退避（復元用）
        const rngSave = rngState();
        let best = null;
        for (const a of acts) {
          const Da = (a.k === 'attack') ? D : 1;          // 戦闘のみ隠れ手札で結果が揺れる→決定化平均
          let vsum = 0;
          for (let d = 0; d < Da; d++) {
            loadGameState(determinize(snap, side));
            G.players.me.isCPU = true; G.players.cpu.isCPU = true;
            G._sim = true;
            try {
              if (a.k !== 'stop') await applyAction(side, a);
              vsum += G.winner ? (G.winner === side ? 1 : 0) : evalWinProb(side);
            } finally { G._sim = false; }
          }
          const v = vsum / Da;
          if (!best || v > best.v) best = { a, v };
        }
        for (const k of Object.keys(G)) delete G[k];      // 実状態へ復元（元参照）
        Object.assign(G, saved); rngState(rngSave);
        if (!best || best.a.k === 'stop') break;          // どの手も現状を上回らない＝ターン終了
        await applyAction(side, best.a);                  // 最良手を本番実行
        if (G.winner) return;
      }
      // endTurn は呼び出し元(beginTurn)が行う
    }
    AGENTS.vlook = { takeTurn: vlookTurn };  // P.agent='vlook'（価値誘導方策）

    /* Stage B: 方策ネット・エージェント。展開/イベント/起動は heuristic のまま、アタック着手だけ学習方策で選ぶ。
       実装は heuristicTurn 内の「G._polAttack && pickPolicyModel」分岐（50-input-cpu-ai.js）に集約。
       未学習(window.AI_POLICY=null)なら自動で cpuPickAttack にフォールバック＝退行しない。 */
    async function npolicyTurn(side) {
      G._polAttack = true;
      try { return await heuristicTurn(side); } finally { G._polAttack = false; }
    }
    AGENTS.npolicy = { takeTurn: npolicyTurn };  // P.agent='npolicy'（学習アタック方策）

    /* Stage C: 方策改善オペレータ（policy improvement）。アタック判断の【1-ply価値先読み】＝
       各候補(各attack＋stop)を決定化クローンに適用し evalWinProb で評価、最良を返す。
       ＝「現在の価値関数で1手分だけ深く読んだ、方策より強い"教師"」。selfplay-iterate.js が
       この教師の選択を新しい学習目標に方策ネットを再学習する（自己対戦反復＝AlphaZeroの心臓部）。
       戻り: { feats:[候補のpolFeatures], ci:選択index, lk, chosen:着手 }。空候補なら null。 */
    async function improvedAttack(side, plan) {
      const atts = legalActions(side).filter(a => a.k === 'attack');
      if (!atts.length) return null;
      const cands = [...atts, { k: 'stop' }];
      const feats = cands.map(a => polFeatures(side, a));
      const snap = cloneGameState(G), saved = Object.assign({}, G), rngSave = rngState();
      let best = null;
      for (let ci = 0; ci < cands.length; ci++) {
        const a = cands[ci];
        loadGameState(determinize(snap, side));
        G.players.me.isCPU = true; G.players.cpu.isCPU = true; G._sim = true;
        let v;
        try { if (a.k !== 'stop') await applyAction(side, a); v = G.winner ? (G.winner === side ? 1 : 0) : evalWinProb(side); }
        finally { G._sim = false; }
        if (!best || v > best.v) best = { ci, v };
      }
      for (const k of Object.keys(G)) delete G[k]; Object.assign(G, saved); rngState(rngSave);
      return { feats, ci: best.ci, lk: leaderKeyOf(side), chosen: cands[best.ci] };
    }
    // Stage C データ生成用エージェント: アタック相を improvedAttack（教師）で打つ。selfplay-iterate.js が improvedAttack をフックしてラベル収集。
    async function npimproveTurn(side) {
      G._polImprove = true;
      try { return await heuristicTurn(side); } finally { G._polImprove = false; }
    }
    AGENTS.npimprove = { takeTurn: npimproveTurn };  // P.agent='npimprove'（1-ply価値先読みの教師方策）
    if (typeof window !== 'undefined') { window.polFeatures = polFeatures; window.legalActions = legalActions; window.POL_FEAT = POL_FEAT; window.improvedAttack = improvedAttack; }

    // 外部（テスト/将来のMCTS）から使えるよう公開（ブラウザ・Node両対応）。
    if (typeof window !== 'undefined') { window.cloneGameState = cloneGameState; window.loadGameState = loadGameState; }
