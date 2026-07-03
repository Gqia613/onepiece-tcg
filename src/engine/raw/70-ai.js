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
        if (need > P.don.active) return;   // ★ドンを全て使っても対象パワーに届かない＝自滅手は実行しない（candidateActionsで除外済の保険）
        for (let i = 0; i < need; i++) { at.attachedDon++; P.don.active--; }
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

    // ★ドン差(資源項目)の重み(リーダー別)。probe測定(tests/_probe-dondiff相当・ドン差あり vs なし): teach +11.7pt(N60 p0.092)・hancock +15pt(N20改善3/退行0)で採用 / lucy-20・ace-5・nami-5(退行)・enel中立 → 不掲載=0。
    var DON_DIFF_W = { teach: 0.15, hancock: 0.15 };
    // 盤面の評価（side視点・手作りの生スコア）。学習重みが無い時の evalWinProb フォールバック用。
    // ※リーダー別の戦略プロファイル(評価重み)をWeb解説から付与する実験を行ったが、ミラー測定で改善せず（enelで±0〜-4pt）撤回。
    //   enelの弱さは「価値」でなく「探索の深さ」だったため（det3で-29pt→det6で+4pt）。立ち回りリファレンスは docs/deck-strategies.md に保存。
    function evalState(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const bp = arr => arr.reduce((x, c) => x + power(c), 0);
      let s = 0;
      s += (P.life.length - D.life.length) * 1.3;
      s += (bp(P.chars) - bp(D.chars)) / 3000;
      s += (P.hand.length - D.hand.length) * 0.4;
      s += (P.chars.length - D.chars.length) * 0.5;
      // ★資源項目(原則B): アクティブドン差＝次の攻防の余力。ドンを使い切らず温存する手を価値評価が拾う。
      //   ★リーダー依存のため上の DON_DIFF_W で重み分岐(teach/hancockのみ採用・lucy等は退行で0)。G._noDonDiffは測定専用フラグ。
      s += ((P.don.active || 0) - (D.don.active || 0)) * (G._noDonDiff ? 0 : (DON_DIFF_W[leaderKeyOf(side)] || 0));
      if (G._shape && G._shape.shape) s += shapeTerm(side, G._shape.shape); // ★ハイブリッド: Claude/プロファイルの戦略シェイピング（G._shape時のみ＝puct/mctsはnullで不変）
      return s;
    }
    // ★評価シェイピング: 手作りevalが持たない「ランプ/longevity/コントロール/脅威の質/テンポ」を、
    //   Claude(または凍結プロファイル)が与えた重みで加点する。これが value-NN が学べなかった層を埋める核心。
    //   G._shape が null の時は evalState から呼ばれない＝既定の探索(puct/mcts)はバイト不変＝決定的測定に無影響。
    function shapeTerm(side, sh) {
      const P = G.players[side], D = G.players[opp(side)], o = opp(side);
      const w = k => +sh[k] || 0;
      const blk = arr => arr.filter(c => !c.rested && hasKw(c, 'blocker')).length;
      const actc = arr => arr.filter(c => !c.rested).length;
      const tq = arr => arr.reduce((x, c) => x + (((c.base.fx && (c.base.fx.act || c.base.fx.onKO)) || hasKw(c, 'blocker') || power(c) >= 7000) ? power(c) / 1000 : 0), 0);
      let s = 0;
      s += w('ramp') * (((donTotal(side) || 0) - (donTotal(o) || 0)));                                  // ドン総数差（ランプ＝enelの核）
      s += w('longevity') * (((P.deck.length + P.hand.length) - (D.deck.length + D.hand.length)) / 10);  // 控え＋手札差（息の長さ＝コントロール）
      s += w('control') * ((blk(P.chars) - blk(D.chars)) + 0.5 * (actc(P.chars) - actc(D.chars)));        // ブロッカー＋アクティブ差（盤面支配/受け）
      s += w('threatQuality') * (tq(P.chars) - tq(D.chars));                                              // 効果持ち/大型/ブロッカーの質
      s += w('tempo') * (G.active === side ? 1 : 0);                                                      // 手番（主導権）
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

    /* ===== AlphaZero本格 ①状態表現: 生盤面テンソル（17次元要約でなくカード個別の属性で局面を表す） =====
       evalFeaturesは差分の要約でカード個別を捨てている＝17次元が天井(段階1で実証)。boardTensorは各カードを
       属性ベクトルにして並べる＝大規模NN(CNN/Transformer/深いMLP)がカード間の相互作用を学べる土台。 */
    var CARD_DIM = 14, SLOT_CHAR = 6, SLOT_HAND = 10;          // カード属性14次元 / 盤面6枠 / 手札10枠
    function cardVec(c) {
      if (!c || !c.base) return new Array(CARD_DIM).fill(0);   // 空スロット=ゼロ埋め
      const b = c.base, fx = b.fx || {};
      return [
        (power(c) || 0) / 1000, (b.cost || 0), (b.counter || 0) / 1000, (c.attachedDon || 0),
        c.rested ? 1 : 0, hasKw(c, 'blocker') ? 1 : 0, hasKw(c, 'rush') ? 1 : 0,
        fx.onPlay ? 1 : 0, fx.onAttack ? 1 : 0, fx.onKO ? 1 : 0, fx.trigger ? 1 : 0,
        fx.act ? 1 : 0, fx.static ? 1 : 0,
        (b.type === 'CHAR' ? 1 : b.type === 'EVENT' ? 2 : b.type === 'STAGE' ? 3 : 0) / 3
      ];
    }
    // side視点の生盤面テンソル（固定長）。盤面は自分→相手、各枠 cardVec。手札は自分のみ(相手手札は不可視=決定化で扱う)。
    function boardTensor(side) {
      const P = G.players[side], D = G.players[opp(side)], o = opp(side);
      const slots = (arr, n) => { const r = []; for (let i = 0; i < n; i++) r.push.apply(r, cardVec(arr[i])); return r; };
      const lk = k => LEADER_KEYS.map(x => x === k ? 1 : 0);
      return [
        P.life.length, D.life.length, P.hand.length, D.hand.length,           // スカラー: ライフ/手札
        P.don.active || 0, P.don.rested || 0, P.donMax || 0, donTotal(side) || 0, donTotal(o) || 0,  // ドン
        P.deck.length, D.deck.length, P.trash.length, D.trash.length, G.active === side ? 1 : 0,     // 山/トラッシュ/手番
        (power(P.leader) || 0) / 1000, (power(D.leader) || 0) / 1000,         // リーダーパワー
        ...lk(leaderKeyOf(side)), ...lk(leaderKeyOf(o)),                      // リーダー種別 one-hot(自分/相手)
        ...slots(P.chars, SLOT_CHAR), ...slots(D.chars, SLOT_CHAR), ...slots(P.hand, SLOT_HAND)       // 盤面/手札のカード列
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
      let x = v.map((val, i) => (val - m.mean[i]) / (m.std[i] || 1));
      if (m.layers) {                                                  // ★深いNN(任意層数): 各層 {W:[out][in], b:[out]}・中間ReLU・最後は生→sigmoid
        for (let li = 0; li < m.layers.length; li++) {
          const L = m.layers[li], last = li === m.layers.length - 1, xin = x;
          x = L.b.map((b, j) => { let z = b; const w = L.W[j]; for (let i = 0; i < xin.length; i++) z += w[i] * xin[i]; return last ? z : (z > 0 ? z : 0); });
        }
        return 1 / (1 + Math.exp(-x[0]));
      }
      const h = m.b1.map((b, j) => { let z = b; const w1 = m.W1[j]; for (let i = 0; i < x.length; i++) z += w1[i] * x[i]; return z > 0 ? z : 0; });
      let z2 = m.b2; for (let j = 0; j < h.length; j++) z2 += m.W2[j] * h[j];   // 旧形式(1隠れ層)互換
      return 1 / (1 + Math.exp(-z2));
    }
    // side視点の勝率推定 [0,1]。学習重み(window.AI_WEIGHTS, リーダー別)があれば NN/線形、無ければ手作りevalにフォールバック。
    function evalWinProb(side) {
      const W = (typeof window !== 'undefined' && window.AI_WEIGHTS) ? window.AI_WEIGHTS : null;
      const m = pickModel(W, side);
      if (m) {
        const v = (W.inputType === 'board') ? boardTensor(side) : evalFeatures(side);  // ★生盤面(336) or 17次元
        if (m.type === 'mlp' && (m.W1 || m.layers)) return mlpForward(m, v);       // NN(MLP・深いNN対応)
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
      const P = G.players[side];
      const cands = legalActions(side).filter(a => {                       // 届くアタックのみ（ドン全付与でも対象パワー未満＝自滅手は除外）
        if (a.k !== 'attack') return false;
        const at = findCard(a.auid), tg = findCard(a.tuid);
        return at && tg && power(at) + P.don.active * 1000 >= power(tg);
      });
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
          const at = findCard(a.auid), tg = findCard(a.tuid);
          if (!at || !tg) continue;
          // ★届かないアタックは候補から除外＝アクティブドンを全て付与してもアタッカーが対象パワーに満たない手は
          //   KOもライフも取れずレストになるだけの自滅（寝かせて次に相手から狙われる損）。探索が選ぶ実害を断つ（通常heuristicは既に除外済）。
          if (power(at) + P.don.active * 1000 < power(tg)) continue;
          if (tg === D.leader) {                                           // リーダー攻撃
            // ★太ドン同値除外(cpuPickAttックと同方針・ユーザー観察): 2ドン以上付与してリーダーへ同値は相手カウンター1枚で防がれ付与ドン使い切りの大損。相手手札0は別。
            const need = Math.max(0, Math.ceil((power(tg) - power(at)) / 1000));
            if (need >= 2 && (power(at) + need * 1000) === power(tg) && D.hand.length > 0) continue;
            acts.push(a); continue;
          }
          const threat = hasKw(tg, 'blocker') || power(tg) >= 5000 || (tg.base.fx && (tg.base.fx.onKO || tg.base.fx.act));
          if (threat) acts.push(a);                                        // 脅威キャラのKOのみ
        } else if (a.k === 'act') {                                        // ★起動メインは「今使う価値がある」時だけ候補化（heuristicのactWorthUsingをpuctにも適用）
          const c = findCard(a.uid);                                       //   条件未達/対象不在/-Nが無意味な起動(お玉の-2000等)を探索が無駄撃ちしない
          if (c && (typeof actWorthUsing !== 'function' || actWorthUsing(side, c))) acts.push(a);
        } else acts.push(a);                                               // 非アタック（プレイ/leader/stop）は全部
      }
      let cand = acts;
      // ★ハイブリッド: Claude/プロファイルが「悪手」と判断したcharの登場を候補から除外（新カードのzero-shot対応の着地点）。
      //   G._shape.constrain が無ければ何もしない＝puct/mctsはバイト不変。
      if (G._shape && G._shape.constrain && G._shape.constrain.forbidChars && G._shape.constrain.forbidChars.length) {
        const fb = G._shape.constrain.forbidChars.map(n => normName(n));
        cand = cand.filter(a => !(a.k === 'char' && (c => c && fb.indexOf(normName(c.base.name)) >= 0)(findCard(a.uid))));
      }
      // ★黒ヤマト: 8ヤマト/9モモの「素出し(char)」は候補から外す（他に出せるcharがあるなら）。捨ててトラッシュから踏み倒す方が強い＝
      //   heuristicのプレイ抑制(src/50)とAI探索(puct)を揃える。探索が短期の8000ボディに釣られて素出しするのを防ぐ。
      if (typeof isYamatoLeader === 'function' && isYamatoLeader(side)) {
        const isTargetChar = a => a.k === 'char' && (c => !!c && yamatoReviveTarget(c.base.no))(findCard(a.uid));
        if (cand.some(a => a.k === 'char' && !isTargetChar(a))) return cand.filter(a => !isTargetChar(a));
      }
      return cand;
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

    /* ===== 温存ドン(donReserve)の決定化シミュ算出（案B） =====
       「自分のターン終了後、相手の“次ターン最善攻め”に対して、アクティブドンを R 枚残せば耐えられるか」を
       相手の隠れ手札を相手デッキからサンプリング(determinize)して実戦闘でシミュレートし、
       生存率が閾値を満たす最小の R を返す。耐えられない/脅威が無い → 0（攻め切る/温存不要）。
       ・相手手札は隠匿情報 → determinize で相手デッキから再構成（＝“デッキ最大”が分布で出る）。
       ・自分は R ドンを温存した状態(=opp手番のカウンター原資)で cpuCounter/ブロックして防御。
       ・近似: 自分の今ターン攻めは未反映で盤面そのまま＝脅威をやや過大評価＝安全側。
       ・復元は mctsTurn と同じ「元オブジェクト参照」方式＋rng隔離。_sim中は入れ子回避で即0。 */
    async function requiredReserveSim(side, opt) {
      if (G._sim) return 0;                                  // ロールアウト内の入れ子探索を回避
      opt = opt || {};
      const me = side, foe = opp(side);
      const samples = opt.samples || 10, risk = opt.risk != null ? opt.risk : 0.12;
      const maxR = Math.min(opt.maxR != null ? opt.maxR : 4, G.players[me].don.active || 0);
      // 明確な脅威が無いなら温存不要（高コストなsimを省略）
      if (typeof oppCanThreatenLethal === 'function' && !oppCanThreatenLethal(me)) return 0;
      const snap = cloneGameState(G);                        // 決定化の元（純クローン）
      const saved = Object.assign({}, G);                   // 実状態の元オブジェクト参照を退避
      const rngSave = rngState();                            // 先読みのrng消費を実ゲームに漏らさない
      let chosen = 0;
      try {
        for (let R = 0; R <= maxR; R++) {
          let deaths = 0;
          for (let i = 0; i < samples; i++) {
            const s = determinize(snap, me);                // 相手(foe=opp(me))の手札を相手デッキから再構成
            loadGameState(s);
            G._sim = true; G._noChain = true; G._planOverride = null; G._shape = null;
            G.players[me].isCPU = true; G.players[foe].isCPU = true;  // 相手の“最善攻め”を自動プレイで再現
            G.players[me].don.active = R;                    // R ドンだけ温存した状態で相手手番を迎える
            try { if (!G.winner) await beginTurn(foe); } catch (e) { /* sim内例外は死亡扱いにしない */ }
            if (G.winner === foe || (G.players[me].life && G.players[me].life.length <= 0)) deaths++;
          }
          if (deaths / samples <= risk) { chosen = R; break; }  // 生存できる最小の温存
          chosen = 0;                                           // どのRでも危険なら攻め切る(0)
        }
      } finally {
        for (const k of Object.keys(G)) delete G[k];
        Object.assign(G, saved); rngState(rngSave);
        G._sim = false; G._noChain = false; G._planOverride = null;
      }
      return chosen;
    }
    if (typeof window !== 'undefined') window.requiredReserveSim = requiredReserveSim; // 参照用

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

    /* ===== Phase 2（Python/GPUルート）: policy-guided 決定化ロールアウト探索（per-action・本物の探索の第1版） =====
       ①方策ネット(prior)で候補手を上位Wに絞る → ②各候補を「適用→heuristicで残りを打つ→相手LOOKターン→価値」で
       決定化K回平均評価 → ③最良の第1手を実行、を1手ずつ繰り返す。
       ★vlook崩壊(mid-state価値をgreedy)を避ける核心＝評価は必ず【ターン境界の価値】（look=1で次の自分手番開始＝価値ネット学習分布）。
       ★Phase2自己対戦の方策ターゲット源（各手の訪問/Qを記録すれば AlphaZero の policy target になる）。pytorch/README.md。 */
    function priorScore(side, a) {
      const pb = k => (G._shape && G._shape.priorBias && +G._shape.priorBias[k]) || 1; // ★ハイブリッド: 着手優先度バイアス（G._shape時のみ＝nullなら全て×1で不変）
      // ★具体プラン: Claudeが指定した priorityCards(勝ち筋のキーカード)の手を上位に寄せる＝探索の候補W枠に入りやすくする
      //   （抽象重みshapeでなく「どのカードを優先するか」で特性を反映。G._shape無し/未指定なら全て×1＝既定puctはバイト不変）。
      const prio = (G._shape && Array.isArray(G._shape.priorityCards) && G._shape.priorityCards.length) ? G._shape.priorityCards : null;
      const prioMul = uid => { if (!prio) return 1; const c = findCard(uid); if (!c) return 1; const nm = normName(c.base.name); return prio.some(n => { const pn = normName(n); return nm === pn || nm.indexOf(pn) >= 0 || pn.indexOf(nm) >= 0; }) ? 2 : 1; };
      if (a.k === 'attack') { const m = pickPolicyModel(side); if (m) return mlpLogit(m, polFeatures(side, a)); const D = G.players[opp(side)]; const tg = findCard(a.tuid); return tg ? (tg === D.leader ? 1 : 0.5) : 0; }
      if (a.k === 'char') { const c = findCard(a.uid); return ((typeof scoreChar === 'function' && c) ? scoreChar(c) / 6 : 1) * pb('playChar') * prioMul(a.uid); }
      if (a.k === 'event') return 1.2 * pb('event') * prioMul(a.uid);
      if (a.k === 'act' || a.k === 'stage') return 1.2 * pb('act') * prioMul(a.uid);
      if (a.k === 'leader') return 1.2 * pb('leader');
      return 0; // stop
    }
    // side のターンを「今ここで終える」前提でロールアウト: endTurn → 相手/自分 look ターン heuristic → 価値[0,1]
    async function rolloutAfterTurn(side, look) {
      // ★採用(リーダー殴り残し修正・既定0.8): endTurn"直前"(=side のターン終了時)に「フリーで届くのに殴り残したアタッカー」を
      //   数えペナルティ化。evalWinProbはlookターン後(相手ターン中)で side が canCardAttack=falseになり測れないため、ここで測る。
      //   ★measure(ミラーN20): 全リーダー退行なし・nami-15→+0/hancock+30→+45/teach+10→+15/ace+0→+5・lucy/enel±0＝ユーザー観察
      //   「AIモードでリーダーを殴らない」を勝率改善で解消(puctの境界value評価に効く)。G._lifeAggr=0で無効化(測定用)。係数は小さく。
      let penalty = 0;
      const la = (G._lifeAggr != null) ? G._lifeAggr : 0.8;
      if (la && !G.winner) {
        const D = G.players[opp(side)], P = G.players[side], Lp = power(D.leader); let freeLeft = 0;
        for (const c of [P.leader, ...P.chars]) if (canCardAttack(c) && canTargetLeader(c) && power(c) >= Lp) freeLeft++;
        penalty = freeLeft * la * 0.05;
      }
      if (!G.winner) await endTurn(side);
      let cur = side, t = 0;
      while (!G.winner && t < look) { cur = opp(cur); await beginTurn(cur); t++; }
      const v = G.winner ? (G.winner === side ? 1 : 0) : evalWinProb(side);
      return Math.max(0, v - penalty);
    }
    // 1手分の探索: 候補を prior で上位Wに絞り、各を K 決定化ロールアウト平均(境界価値)で評価。Q降順 [{a,q}] を返す。
    async function puctSearch(side, opt) {
      const K = (opt && opt.det) || 3, LOOK = (opt && opt.look != null) ? opt.look : 1, W = (opt && opt.width) || 5;
      const all = candidateActions(side).filter(a => a.k !== 'stop');
      if (!all.length) return { scored: [], stop: true };
      const top = all.map(a => ({ a, p: priorScore(side, a) })).sort((x, y) => y.p - x.p).slice(0, W).map(x => x.a);
      const cand = [...top, { k: 'stop' }];
      const rootClone = cloneGameState(G), saved = Object.assign({}, G), rngSave = rngState();
      const scored = [];
      for (const a of cand) {
        let sum = 0;
        for (let d = 0; d < K; d++) {
          loadGameState(determinize(rootClone, side));
          G.players.me.isCPU = true; G.players.cpu.isCPU = true;
          G._sim = true; G._noChain = true;
          try {
            if (a.k !== 'stop') { await applyAction(side, a); if (!G.winner) await heuristicTurn(side); }
            sum += await rolloutAfterTurn(side, LOOK);
          } finally { G._sim = false; G._noChain = false; }
        }
        scored.push({ a, q: sum / K });
      }
      for (const k of Object.keys(G)) delete G[k]; Object.assign(G, saved); rngState(rngSave);
      scored.sort((x, y) => y.q - x.q);
      return { scored, stop: false };
    }
    // puctが苦手なリーダーを heuristic にフォールバックさせる枠（測定駆動）。現在は空＝全リーダーで探索する。
    //   ※enel はミラー実測で puct が -29pt(探索がランプ機構を壊す)だが、ユーザー指定で条件を撤去（常に探索）。
    //   再びフォールバックさせたいリーダーがあれば { enel:1 } のように追加。`G._puctNoSkip` で一時的に無効化も可。
    var PUCT_SKIP = {};
    var PUCT_MCTS = { enel: 1 };   // ★enel特化: enelはmctsがpuctを上回る(N60 mcts+8.3pt p0.063改善5/退行0 / puct±0)→puct指定時はmctsで読む。G._puctNoSkipで無効化可。
    // ★per-leader 探索の深さ。enelは浅い探索(det3)だとミラー-20ptと弱い（コントロール/ランプの計画が見えない）が、
    //   深い探索(det6/look2/w6)で±0pt＝中立(弱くない)になる。実測スイープで確認。docs/ai-design.md §9.11。
    //   ＝enelの弱さは「価値」でなく「探索の深さ」だった。深く読む必要があるリーダーだけここに足す。
    var PUCT_DEPTH = { enel: { det: 6, look: 2, width: 6 } };
    async function puctTurn(side) {
      if (G._sim) return heuristicTurn(side);                          // 入れ子探索＝指数爆発を防ぐ
      // ★enel特化: enelはmctsがpuct/heuristicを上回る(N60 mcts+8.3pt p0.063・改善5/退行0 / puct±0)。探索がランプを壊さないflat決定化MC(mcts)で読む。
      if (PUCT_MCTS[leaderKeyOf(side)] && !G._puctNoSkip && typeof mctsTurn === 'function') return mctsTurn(side);
      if (PUCT_SKIP[leaderKeyOf(side)] && !G._puctNoSkip) return heuristicTurn(side);  // 苦手リーダーは素のheuristic
      const dp = PUCT_DEPTH[leaderKeyOf(side)] || {};                  // リーダー別の既定深さ（無ければ標準）。G._puct* で上書き可
      const opt = { det: G._puctDet || dp.det || 3, look: G._puctLook != null ? G._puctLook : (dp.look != null ? dp.look : 1), width: G._puctWidth || dp.width || 5 };
      try {
        let guard = 0;
        while (guard++ < 14 && !G.winner) {
          // ★「思考中」は探索(puctSearch)の間だけ。着手(applyAction=攻撃アニメ)中はバッジを消す＝
          //   「思考中なのに攻撃」を防ぐ。次の手を読む前にまた立てる。
          if (typeof showThinking === 'function') showThinking(true);
          const r = await puctSearch(side, opt);
          if (typeof showThinking === 'function') showThinking(false);
          if (r.stop || !r.scored.length) break;
          const best = r.scored[0];
          // Phase2 self-play: アタック判断(attack/stop)を「探索が選んだ手」=方策ターゲットとして記録（G._puctRecSink設定時のみ）。
          // 候補=その時点の全attack＋stop、ci=puctの選択（playを選んだ手はアタック判断でないのでスキップ）。
          if (G._puctRecSink && (best.a.k === 'attack' || best.a.k === 'stop')) {
            const atts = candidateActions(side).filter(a => a.k === 'attack');
            if (atts.length) {
              const cands = [...atts, { k: 'stop' }];
              let ci = cands.length - 1;
              if (best.a.k === 'attack') { const j = atts.findIndex(x => x.auid === best.a.auid && x.tuid === best.a.tuid); if (j >= 0) ci = j; }
              G._puctRecSink.push({ cands: cands.map(c => polFeatures(side, c)), ci: ci, lk: leaderKeyOf(side) });
            }
          }
          if (best.a.k === 'stop') break;                             // どの手も「今終える」を上回らない
          await applyAction(side, best.a);                            // 最良の第1手を本番実行
          if (G.winner) return;
        }
      } finally { if (typeof showThinking === 'function') showThinking(false); render(); }   // 思考終了→バッジ消去＋実盤面を再描画
    }
    AGENTS.puct = { takeTurn: puctTurn };   // P.agent='puct'（policy-guided 決定化ロールアウト探索）

    /* ===== ハイブリッド: 戦略(プロファイル/Claude) × 戦術(puct探索) =====
       戦略オブジェクト(shape)を G._shape/G._planOverride に積んで puct を走らせる共有コア。
       ・shape の評価シェイピングが境界評価 evalWinProb(=手作りeval) に効き、priorBias が候補ランクに効く。
       ・shape があるリーダーは G._puctNoSkip=true で必ず探索（enelのPUCT_SKIPも上書き＝シェイピングで直るか測る）。
       ・shape が null のリーダーは puct と完全一致（PUCT_SKIP尊重＝enelはheuristicフォールバック）。
       ・lethal(詰め)は渡さない＝戦術はエンジン(cpuPickAttack/cpuCanLethal)に委ねる。finallyで必ず復元。 */
    function shapeForSide(side) {
      const S = (typeof window !== 'undefined' && window.AI_STRATEGY) ? window.AI_STRATEGY : null;
      return (S && S.byLeader && S.byLeader[leaderKeyOf(side)]) || null; // byLeaderに掲載(=測定で勝った)リーダーだけ。未掲載はnull=puctそのまま
    }
    async function runShapedPuct(side, shape) {
      const pShape = G._shape, pPO = G._planOverride, pNS = G._puctNoSkip;
      G._shape = shape || null;
      if (shape) {
        G._planOverride = { aggression: shape.aggression, removalPriority: shape.removalPriority, donReserve: shape.donReserve }; // lethalは渡さない
        G._puctNoSkip = true;
      }
      try { await puctTurn(side); }
      finally { G._shape = pShape || null; G._planOverride = pPO || null; G._puctNoSkip = pNS; }
    }
    // hybridoff = LLM呼び出し無しで凍結プロファイル(AI_STRATEGY)だけを使う＝評価シェイピング層を“決定的に”測る代理。
    async function hybridoffTurn(side) {
      if (G._sim) return heuristicTurn(side);
      await runShapedPuct(side, shapeForSide(side));
    }
    AGENTS.hybridoff = { takeTurn: hybridoffTurn };   // P.agent='hybridoff'（凍結プロファイル×puct・LLM不要・決定的）

    // hybrid = live。毎ターン1回Claude(proxy経由)に戦略を問い合わせ→キャッシュ→puctへ注入。
    //   キャッシュヒット時はLLMを呼ばない（決定的・コスト償却）。LLM不可時は凍結プロファイル→puctにフォールバック（ハングしない）。
    async function hybridTurn(side) {
      if (G._sim) return heuristicTurn(side);
      let shape = null;
      try {
        const key = strategyKey(side);
        if (Object.prototype.hasOwnProperty.call(LLM_CACHE, key)) shape = LLM_CACHE[key];   // キャッシュヒット＝LLM不要
        else { shape = await fetchStrategyFromClaude(side); LLM_CACHE[key] = shape; }        // miss＝live問い合わせ（null含めキャッシュ）
      } catch (e) { shape = null; }
      if (!shape) shape = shapeForSide(side);   // LLM不可/未設定→凍結プロファイル(現状空=null=puct)
      if (shape && shape.intent && typeof showAIIntent === 'function' && !G._sim) showAIIntent(shape.intent);  // 説明: 狙いをUIへ
      await runShapedPuct(side, shape);
    }
    AGENTS.hybrid = { takeTurn: hybridTurn };   // P.agent='hybrid'（live Claude戦略×puct戦術）
    if (typeof window !== 'undefined') { window.loadLLMCache = loadLLMCache; window.LLM_CACHE_REF = function () { return LLM_CACHE; }; }  // 測定/ウォーム用にキャッシュを公開

    /* ===== Phase5: 多手先PUCT木（puct2）＝ターン内の手順を“木”で探索【opt-in実験・既定で使わない】 =====
       ★測定結果(2026-06・teachミラー同一seedN=40): puct2 対h -25.0pt(p=0.041★退行) / 同条件 puct +27.5pt。
         SIMS増(32→120)でも -16.7pt と退行のまま。＝薄い木が第1手の訪問数を分散させ「最多訪問」が不安定で、
         puctの「各候補手をK回ロールアウトで集中評価」に構造的に劣る(vlook/StageC退行と同根)。
         ＝JSの探索天井は依然puct。木が勝つには「価値NNの葉＋桁違いのsims」(=PyTorch part6)が要る。
         本コードは将来value-netの葉を載せる足場として残置(opt-in)。既定CPU/出荷は不変。
       現行puctは「最良の第1手を1手ずつ貪欲に選び直す」＝手順の組み合わせを見ない(近似的に近視眼)。
       puct2は自分のターン内の手順(play/attack/...→stop)をUCT木で探索し、最多訪問の第1手を打つ。
       ・各シミュレーション: ①rootを決定化(PIMC) ②木をPUCTで降りて自分の手を適用 ③葉=残りターンをheuristicで
         打ち切り→endTurn→look相手ターン→境界価値 evalWinProb ④backup。決定化を毎回サンプルし統計を木に蓄積。
       ・自分の手はほぼ決定化非依存(自手札/相手盤面は可視)。手の効果でドローした世界差は applyAction前に合法性確認して吸収。
       ・状態復元/ rng隔離/ _noChain は puct と同じ作法。決定的測定可(LLM不要)。opt-in(agent='puct2')。 */
    function actKey2(a) { return a.k + '|' + (a.uid || '') + '|' + (a.auid || '') + '|' + (a.tuid || ''); }
    // 葉評価[0,1]: finish=trueなら残りターンをheuristicで打ち切ってから、endTurn→look相手ターン→境界価値。
    async function leafEval2(side, look, finish) {
      if (finish && !G.winner && G.active === side) await heuristicTurn(side);
      return await rolloutAfterTurn(side, look);
    }
    async function puct2Sim(node, side, opt, depth) {
      if (G.winner) return G.winner === side ? 1 : 0;
      if (G.active !== side) return await rolloutAfterTurn(side, opt.look);
      if (depth >= opt.maxDepth) return await leafEval2(side, opt.look, true);
      if (!node.edges) {                                   // 展開＋葉評価(ここまでの手＋heuristic補完)
        const cands = candidateActions(side);
        const scored = cands.filter(a => a.k !== 'stop').map(a => ({ a, P: priorScore(side, a) })).sort((x, y) => y.P - x.P).slice(0, opt.width);
        scored.push({ a: { k: 'stop' }, P: 0.3 });          // stopは常に候補（ここで打ち切る）
        node.edges = scored.map(e => ({ a: e.a, P: e.P, N: 0, Wsum: 0, child: null }));
        return await leafEval2(side, opt.look, true);
      }
      const totalN = node.edges.reduce((s, e) => s + e.N, 0);
      let best = null;                                      // PUCT選択: Q + c·P·√ΣN/(1+N)
      for (const e of node.edges) { const q = e.N ? e.Wsum / e.N : 0.5; const u = opt.c * e.P * Math.sqrt(totalN + 1) / (1 + e.N); const sc = q + u; if (!best || sc > best.sc) best = { e, sc }; }
      const edge = best.e; let val;
      if (edge.a.k === 'stop') { val = await leafEval2(side, opt.look, false); }   // ここでターンを終える(補完なし)
      else {
        const legal = (!edge.a.uid || findCard(edge.a.uid)) && (edge.a.k !== 'attack' || (findCard(edge.a.auid) && findCard(edge.a.tuid)));
        if (!legal) { val = await leafEval2(side, opt.look, true); }               // この世界では非合法→heuristic補完で評価
        else {
          await applyAction(side, edge.a);
          if (G.winner) val = G.winner === side ? 1 : 0;
          else if (G.active !== side) val = await rolloutAfterTurn(side, opt.look); // applyで自ターン終了(稀)
          else { if (!edge.child) edge.child = { edges: null }; val = await puct2Sim(edge.child, side, opt, depth + 1); }
        }
      }
      edge.N++; edge.Wsum += val; return val;
    }
    async function puct2Search(side, opt) {
      const root = { edges: null };
      const rootClone = cloneGameState(G), saved = Object.assign({}, G), rngSave = rngState();
      for (let s = 0; s < opt.sims; s++) {
        loadGameState(determinize(rootClone, side));
        G.players.me.isCPU = true; G.players.cpu.isCPU = true; G._sim = true; G._noChain = true;
        try { await puct2Sim(root, side, opt, 0); } finally { G._sim = false; G._noChain = false; }
      }
      for (const k of Object.keys(G)) delete G[k]; Object.assign(G, saved); rngState(rngSave);
      if (!root.edges || !root.edges.length) return { k: 'stop' };
      let best = null; for (const e of root.edges) { if (!best || e.N > best.N) best = e; } // 最多訪問の第1手
      return best ? best.a : { k: 'stop' };
    }
    async function puct2Turn(side) {
      if (G._sim) return heuristicTurn(side);
      if (PUCT_SKIP[leaderKeyOf(side)] && !G._puctNoSkip) return heuristicTurn(side);
      const dp = PUCT_DEPTH[leaderKeyOf(side)] || {};
      const opt = { sims: G._puct2Sims || 40, width: G._puctWidth || dp.width || 5, look: G._puctLook != null ? G._puctLook : (dp.look != null ? dp.look : 1), c: G._puct2C || 1.4, maxDepth: G._puct2Depth || 10 };
      if (typeof showThinking === 'function') showThinking(true);
      try {
        let guard = 0;
        while (guard++ < 16 && !G.winner) {
          const a = await puct2Search(side, opt);
          if (!a || a.k === 'stop') break;
          if (a.uid && !findCard(a.uid)) break;            // 念のため合法性確認
          await applyAction(side, a);
          if (G.winner) return;
        }
      } finally { if (typeof showThinking === 'function') showThinking(false); render(); }
    }
    AGENTS.puct2 = { takeTurn: puct2Turn };   // P.agent='puct2'（多手先UCT木・LLM不要・決定的測定可）

    if (typeof window !== 'undefined') { window.polFeatures = polFeatures; window.legalActions = legalActions; window.POL_FEAT = POL_FEAT; window.improvedAttack = improvedAttack; }

    // 外部（テスト/将来のMCTS）から使えるよう公開（ブラウザ・Node両対応）。
    if (typeof window !== 'undefined') { window.cloneGameState = cloneGameState; window.loadGameState = loadGameState; }
