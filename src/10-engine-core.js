    "use strict";

    /* =========================================================================
       ===============  ゲームエンジン  =========================================
       公式ルール準拠: フェイズ / ドン / ライフ=手札 / バトル / トリガー / キーワード
       ========================================================================= */
    // G._sim 中（MCTSの先読みロールアウト）は演出待ちを全て省略して高速化（通常プレイは従来通り）。
    const sleep = ms => (G._sim ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));
    let UID = 0;
    const opp = s => s === 'me' ? 'cpu' : 'me';
    const sideName = s => s === 'me' ? 'あなた' : 'CPU';

    /* ---------- シード可能RNG（再現可能なシミュレーション用） ----------
       通常プレイは未シード＝Math.random相当でランダム。
       seedRng(n) を呼ぶとmulberry32で決定論的になり、同seed→同一展開。
       ★ゲーム結果に効く乱数は必ず rng() を使う（shuffle/先攻決め等）。Math.randomは演出専用。 */
    let _rngState = (Math.random() * 4294967296) >>> 0;
    function seedRng(seed) { _rngState = (seed >>> 0) || 1; }
    // rng内部状態の取得/復元（MCTSが先読み中に消費したrngを実ゲームに漏らさないため退避・復元する）。
    function rngState(v) { if (typeof v === 'number') _rngState = v | 0; return _rngState; }
    function rng() {
      _rngState = (_rngState + 0x6D2B79F5) | 0;
      let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    const G = {
      players: {}, active: 'me', firstPlayer: 'me', phase: 'setup',
      turnSeq: 0, turnDisp: 0, busy: false, winner: null, aiOn: true,
      pendingChoice: null, attackSel: null, log: [], myActable: false,
      customDecks: [], builder: null
    };

    /* ---------- カードインスタンス ---------- */
    function inst(no, owner) {
      const base = C[no];
      if (!base) console.warn('未定義カード', no);
      return {
        uid: ++UID, no, owner, base: base || { no, name: no, type: 'CHAR', color: [], cost: 1, power: 1000, traits: [] },
        attachedDon: 0, rested: false, summonedTurn: 0, buffs: [], kwGrant: [], frozen: false
      };
    }
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }

    function findDeck(deckId) { return DECKS.find(x => x.id === deckId) || (G.customDecks || []).find(x => x.id === deckId); }
    function buildPlayer(id, deckId, isCPU) {
      const d = findDeck(deckId);
      const leader = inst(d.leader, id);
      const deck = [];
      for (const [no, cnt] of Object.entries(d.list)) for (let i = 0; i < cnt; i++) deck.push(inst(no, id));
      shuffle(deck);
      return {
        id, deckId, isCPU, meta: d, leader, chars: [], stage: null, deck, hand: [], life: [], trash: [],
        don: { active: 0, rested: 0 }, donMax: leader.base.donDeck || 10, turnsTaken: 0, denyBlock: false
      };
    }

    /* ---------- ゲーム開始 / マリガン ---------- */
    async function startGame(meDeck, cpuDeck) {
      removeEndScreen();
      G.players.me = buildPlayer('me', meDeck, false);
      G.players.cpu = buildPlayer('cpu', cpuDeck, true);
      G.firstPlayer = (G.firstPref === 'me' || G.firstPref === 'cpu') ? G.firstPref : (rng() < 0.5 ? 'me' : 'cpu'); // 選択画面の先攻設定を反映（既定=ランダム）
      G.active = G.firstPlayer; G.winner = null; G.turnSeq = 0; G.turnDisp = 0; G.busy = true; G.myActable = false;
      G.attackSel = null; G.pendingChoice = null; G.promptState = null; G.log = []; G._hints = null; G._aiIntent = null;
      for (const s of ['me', 'cpu']) for (let i = 0; i < 5; i++)G.players[s].hand.push(G.players[s].deck.shift());
      showBattleScreen();
      log('sys', '先攻は <b>' + sideName(G.firstPlayer) + '</b>');
      await mulliganPhase();
      for (const s of ['me', 'cpu']) { const P = G.players[s]; const n = P.leader.base.life || 5; for (let i = 0; i < n; i++)if (P.deck.length) P.life.push(P.deck.shift()); }
      // イム(OP13-079): ゲーム開始時、デッキから《聖地マリージョア》ステージ1枚までを登場
      for (const s of ['me', 'cpu']) { const P = G.players[s]; if (P.leader.base.name === 'イム') { const i = P.deck.findIndex(c => c.base.type === 'STAGE' && (c.base.traits || []).some(t => t.includes('聖地マリージョア'))); if (i >= 0) { const st = P.deck.splice(i, 1)[0]; st.owner = s; st.rested = false; P.stage = st; flog(s, '【イム】ゲーム開始時に「' + st.base.name + '」を登場'); } } }
      render(); await sleep(300);
      banner((G.firstPlayer === 'me' ? 'あなたが先攻' : 'CPUが先攻'), { cls: G.firstPlayer === 'me' ? 'mine' : 'opp', hold: 1300 });
      await sleep(200);
      beginTurn(G.firstPlayer);
    }
    async function mulliganPhase() {
      const cpu = G.players.cpu;
      if (cpuShouldMulligan(cpu)) { redraw(cpu); log('sys', 'CPUはマリガンした'); }
      const keep = await showPrompt({
        title: 'マリガン',
        text: '最初の手札を引き直しますか？（序盤に動けるカードが無ければ引き直し推奨）',
        opts: [{ t: '引き直す', v: true }, { t: 'この手札でいく', v: false, primary: true }]
      });
      if (keep) { redraw(G.players.me); log('sys', 'あなたはマリガンした'); render(); }
    }
    function redraw(P) { P.deck.push(...P.hand); P.hand = []; shuffle(P.deck); for (let i = 0; i < 5; i++)P.hand.push(P.deck.shift()); }
    function cpuShouldMulligan(P) {
      const nonL = P.hand.filter(c => c.base.type !== 'LEADER');
      const cheap = nonL.filter(c => (c.base.cost || 0) <= 2).length;                                  // 序盤に動ける札
      const mid = nonL.filter(c => (c.base.cost || 0) <= 4).length;                                    // 中盤までに使える札
      const playable = nonL.filter(c => c.base.type === 'CHAR' || (c.base.fx && c.base.fx.main)).length; // 実際にプレイできる札
      return cheap < 1 || mid < 2 || playable < 2;                                                     // 序盤の動き出しが無い手はマリガン
    }

    /* ---------- ドン ---------- */
    function donTotal(side) {
      const P = G.players[side]; let t = (P.don.active || 0) + (P.don.rested || 0);
      t += (P.leader.attachedDon || 0); for (const c of P.chars) t += (c.attachedDon || 0); if (P.stage) t += (P.stage.attachedDon || 0); return t;
    }
    function payDon(side, n) { const P = G.players[side]; if (P.don.active < n) return false; P.don.active -= n; P.don.rested += n; return true; }
    function returnDonToDeck(side, n) { const P = G.players[side]; const k = Math.min(n, P.don.active); P.don.active -= k; return k; }
    /* ドン!!-N: ドンデッキに戻すドンを選ぶ（人間は選択、CPUはレスト優先） */
    async function returnDonChoose(side, n, fromActive) {
      const P = G.players[side];
      if (fromActive) { if (P.don.active < n) return false; P.don.active -= n; flog(side, 'アクティブのドン!!-' + n + '（ドンデッキへ戻す）'); render(); return true; } // 「アクティブのドンを戻す」限定
      if (P.don.active + P.don.rested < n) return false;   // 戻せるドンが足りない→効果は不発
      for (let i = 0; i < n; i++) {
        const hasA = P.don.active > 0, hasR = P.don.rested > 0;
        if (!hasA && !hasR) return false;
        let useRested;
        if (hasA && hasR) {
          if (P.isCPU) useRested = true;                  // CPUは使用済み(レスト)を優先
          else {
            const v = await showPrompt({
              title: 'ドン!!-' + n, text: 'ドンデッキに戻すドンを選んでください（残りアクティブ ' + P.don.active + ' / レスト ' + P.don.rested + '）',
              opts: [{ t: 'レストのドンを戻す', v: 'r', primary: true }, { t: 'アクティブのドンを戻す', v: 'a' }]
            });
            useRested = v !== 'a';
          }
        } else useRested = hasR;
        if (useRested) P.don.rested--; else P.don.active--;
      }
      flog(side, 'ドン!!-' + n + '（ドンデッキへ戻す）'); render();
      return true;
    }

    /* ---------- 条件判定 ---------- */
    function checkCond(cond, side, card) {
      if (!cond) return true;
      const P = G.players[side];
      if (typeof cond === 'object') return evalCondObj(cond, side, card);
      switch (cond) {
        case 'selfTurn': return G.active === side;
        case 'koByOpp': return !!card && card._koSource === 'oppEffect'; // 相手の効果でKOされた時のみ
        case 'koByBattle': return !!card && card._koSource === 'battle';
        case 'don<=6': return donTotal(side) <= 6;
        case 'don>=6': return donTotal(side) >= 6;
        case 'donX1': case 'donX1Self': return !!card && card.attachedDon >= 1;
        case 'donX2': return !!card && card.attachedDon >= 2;
        case 'life<=3': return P.life.length <= 3;
        case 'life<=2': return P.life.length <= 2;
        case 'life<=1': return P.life.length <= 1;
        case 'oppLife>=3': return G.players[opp(side)].life.length >= 3;
        case 'oppLife<=3': return G.players[opp(side)].life.length <= 3;
        case 'leaderDressrosa': return P.leader.base.traits.includes('ドレスローザ');
        case 'leaderRB': return P.leader.base.color.includes('赤') || P.leader.base.color.includes('青');
        case 'leaderWB': return P.leader.base.traits.includes('白ひげ海賊団');
        case 'leaderBH': return P.leader.base.traits.includes('黒ひげ海賊団');
        case 'don10': return donTotal(side) >= 10;
        case 'oppTurn': return G.active !== side;
        case 'leaderShichibukai': return (P.leader.base.traits || []).includes('王下七武海');
        case 'leaderMulti': return (P.leader.base.color || []).length >= 2;
        case 'leaderKujya': return (P.leader.base.traits || []).includes('九蛇海賊団');
        default: return true;
      }
    }
    // オブジェクト条件: {leaderTrait, leaderNameIncludes, leaderColor, selfChar:{...filter,min}, noSelfChar:{...filter}, selfHand:{...filter,min}, donAtLeast, lifeAtMost, oppLifeAtMost, selfTurn, oppTurn, and:[], or:[], not:{}}
    function evalCondObj(c, side, card) {
      const P = G.players[side], O = G.players[opp(side)];
      if (c.and && !c.and.every(x => checkCond(x, side, card))) return false;
      if (c.or && !c.or.some(x => checkCond(x, side, card))) return false;
      if (c.not && checkCond(c.not, side, card)) return false;
      if (c.leaderTrait != null && !(P.leader.base.traits || []).includes(c.leaderTrait)) return false;
      if (c.leaderTraitIncludes != null && !(P.leader.base.traits || []).some(t => t.includes(c.leaderTraitIncludes))) return false; // 自リーダーが「〜を含む特徴」を持つ
      if (c.oppDonAtLeast != null && donTotal(opp(side)) < c.oppDonAtLeast) return false; // 相手の場のドンN枚以上
      if (c.leaderNameIncludes != null && !normName(P.leader.base.name).includes(normName(c.leaderNameIncludes))) return false;
      if (c.leaderColor != null && !(P.leader.base.color || []).includes(c.leaderColor)) return false;
      if (c.leaderMulticolor && (P.leader.base.color || []).length < 2) return false; // リーダーが多色（2色以上）。OP13-051ハンコック等
      if (c.leaderAttr != null && !((P.leader.base.attribute || '').includes(c.leaderAttr))) return false; // 自分のリーダーが属性Xを持つ（OP13-025コビーの属性(打)）
      if (c.oppLeaderAttr != null && !((O.leader.base.attribute || '').includes(c.oppLeaderAttr))) return false; // 相手のリーダーが属性Xを持つ（OP14-020ミホークの属性(斬)）
      if (c.selfChar != null) { const min = c.selfChar.min || 1; if (P.chars.filter(ch => matchFilter(ch, c.selfChar)).length < min) return false; }
      if (c.oppChar != null) { const min = c.oppChar.min || 1; if (O.chars.filter(ch => matchFilter(ch, c.oppChar)).length < min) return false; } // 相手の場のキャラ条件
      if (c.noSelfChar != null) { if (P.chars.some(ch => matchFilter(ch, c.noSelfChar))) return false; }
      if (c.selfCharCount != null) { const f = c.selfCharCount; let arr = f.filter ? P.chars.filter(ch => matchFilter(ch, f.filter)) : P.chars; const n = f.distinctBy === 'name' ? new Set(arr.map(ch => normName(ch.base.name))).size : arr.length; if (f.min != null && n < f.min) return false; if (f.max != null && n > f.max) return false; } // 自キャラの数(distinctBy:'name'で異名数)のしきい値
      if (c.allSelfChar != null) { if (!P.chars.length || !P.chars.every(ch => matchFilter(ch, c.allSelfChar))) return false; } // 自分のキャラが全て一致（「〜のみ」）
      if (c.allSelfCharOther != null) { const others = P.chars.filter(ch => ch !== card); if (!others.length || !others.every(ch => matchFilter(ch, c.allSelfCharOther))) return false; }
      if (c.selfCharOther != null) { const f = c.selfCharOther; const min = f.min || 1; if (P.chars.filter(ch => ch !== card && matchFilter(ch, f.filter || f)).length < min) return false; } // 自分のキャラ（このカード以外）でfilter一致がmin枚以上（OP11-096リッパー＝他の黒・海軍キャラがいれば【ブロッカー】）
      if (c.selfHand != null) { const min = c.selfHand.min || 1; if (P.hand.filter(h => matchFilter(h, c.selfHand)).length < min) return false; }
      if (c.donAtLeast != null && donTotal(side) < c.donAtLeast) return false;
      if (c.donX1 && !(card && (card.attachedDon || 0) >= 1)) return false; // 【ドン‼×1】= このカードに付与ドン1以上（オブジェクト条件形。OP13-004サボのboardBuff等）
      if (c.donX2 && !(card && (card.attachedDon || 0) >= 2)) return false;
      if (c.donX3 && !(card && (card.attachedDon || 0) >= 3)) return false; // 【ドン‼×3】（OP12-020ゾロL）
      if (c.selfActive && card && card.rested) return false; // このカードがアクティブ（OP12-024牛鬼丸）
      if (c.selfRested && card && !card.rested) return false; // このカードがレスト（ST02-014ドレーク）
      if (c.leaderActive && P.leader.rested) return false; // 自分のリーダーがアクティブ（OP06-088サイ）
      if (c.selfStage != null && !(P.stage && matchFilter(P.stage, c.selfStage))) return false; // 自分の場にfilter一致のステージがある（EB02-033クラバウターマン）
      if (c.leaderBattledChar && P._leaderBattledTurn !== G.turnSeq) return false; // このターン、リーダーが相手キャラとバトルした（OP12-020ゾロL）
      if (c.restedCardsAtLeast != null && ([P.leader, ...P.chars, P.stage].filter(x => x && x.rested).length + (P.don.rested || 0)) < c.restedCardsAtLeast) return false; // 自分のレストのカード(キャラ/リーダー/ステージ＋レストドン)がN枚以上（OP12-118ボニー）
      if (c.oppRestedCardsAtLeast != null && ([O.leader, ...O.chars, O.stage].filter(x => x && x.rested).length + (O.don.rested || 0)) < c.oppRestedCardsAtLeast) return false; // 相手のレストのカードがN枚以上（OP11-023アーロン）
      if (c.selfAttachedDon && !([P.leader, ...P.chars].some(x => x && (x.attachedDon || 0) > 0))) return false; // 自分の付与されているドンがある（OP13紫の付与シナジー）
      if (c.selfLifeLEOpp && P.life.length > O.life.length) return false; // 自分のライフ枚数が相手以下（OP13-102エジソン）
      if (c.selfLifeLessThanOpp && P.life.length >= O.life.length) return false; // 自分のライフ枚数が相手より少ない（OP10-113ゾロ）
      if (c.selfPowerAtLeast != null && card && power(card) < c.selfPowerAtLeast) return false; // このキャラの現在パワーN以上（OP06-002イナズマ＝7000以上で【バニッシュ】）
      if (c.leaderEffPowerAtMost != null && power(P.leader) > c.leaderEffPowerAtMost) return false; // 自分のリーダーの現在パワーN以下（OP09-007ヒート）
      if (c.leaderEffPowerAtLeast != null && power(P.leader) < c.leaderEffPowerAtLeast) return false; // 自分のリーダーの現在パワーN以上（OP09-017ワイヤー）
      if (c.selfAttachedDonAtLeast != null && [P.leader, ...P.chars].reduce((s, x) => s + (x ? (x.attachedDon || 0) : 0), 0) < c.selfAttachedDonAtLeast) return false; // 自分の付与ドン合計N以上（OP12-015/024等）
      if (c.donLEOpp && donTotal(side) > donTotal(opp(side))) return false; // 自分の場のドンが相手の場のドン枚数以下（OP12-041/073/078等）
      if (c.oppDonGreater && donTotal(opp(side)) <= donTotal(side)) return false; // 相手の場のドンが自分より多い（OP09-066ジャンバール）
      if (c.selfDonFewerBy != null && !(donTotal(side) <= donTotal(opp(side)) - c.selfDonFewerBy)) return false; // 自分の場のドンが相手よりN枚以上少ない（OP07-064サンジ）
      if (c.selfHandFewerBy != null && !(P.hand.length <= O.hand.length - c.selfHandFewerBy)) return false; // 自分の手札が相手よりN枚以上少ない（OP09-092ティーチ）
      if (c.activeDonAtMost != null && (P.don.active || 0) > c.activeDonAtMost) return false; // アクティブのドンN枚以下
      if (c.activeDonAtLeast != null && (P.don.active || 0) < c.activeDonAtLeast) return false;
      if (c.oppHandAtLeast != null && O.hand.length < c.oppHandAtLeast) return false;
      if (c.selfHandAtMost != null && P.hand.length > c.selfHandAtMost) return false;
      if (c.selfHandAtLeast != null && P.hand.length < c.selfHandAtLeast) return false; // 自分の手札N枚以上（OP12-043クザン/087ロビン等）
      if (c.trashAtLeast != null && P.trash.length < c.trashAtLeast) return false;
      if (c.deckAtMost != null && P.deck.length > c.deckAtMost) return false; // 自分のデッキN枚以下（OP03-045/049/053）
      if (c.trashEventAtLeast != null && P.trash.filter(x => x.base.type === 'EVENT').length < c.trashEventAtLeast) return false; // トラッシュにイベントN枚以上（OP12-059/065等）
      if (c.trashAtMost != null && P.trash.length > c.trashAtMost) return false;
      if (c.trashCount != null) { const f = c.trashCount; const n = P.trash.filter(x => matchFilter(x, f.filter || {})).length; if (f.min != null && n < f.min) return false; if (f.max != null && n > f.max) return false; } // タイプ等で絞ったトラッシュ枚数
      if (c.trashHas != null && !P.trash.some(x => matchFilter(x, c.trashHas))) return false; // 自分のトラッシュに条件一致のカードがある
      if (c.leaderPowerAtMost != null && power(P.leader) > c.leaderPowerAtMost) return false; // 自リーダーの実効パワーがN以下
      if (c.leaderPowerAtLeast != null && power(P.leader) < c.leaderPowerAtLeast) return false;
      if (c.selfPowerAtLeast != null && (!card || power(card) < c.selfPowerAtLeast)) return false; // このキャラ(ctx.self)の実効パワーがN以上
      if (c.selfPowerAtMost != null && (!card || power(card) > c.selfPowerAtMost)) return false;
      if (c.selfRested != null && (!card || (!!card.rested !== !!c.selfRested))) return false; // このキャラがレスト(true)/アクティブ(false)の状態
      if (c.oppHasAttachedDon && !O.chars.some(ch => (ch.attachedDon || 0) >= 1)) return false; // 相手にドン付与済みキャラがいる
      if (c.selfLifeLessThanOpp && !(P.life.length < O.life.length)) return false; // 自分のライフが相手より少ない
      if (c.selfLifeAtMost != null && P.life.length > c.selfLifeAtMost) return false;
      if (c.selfSummonedThisTurn && !(card && card.summonedTurn === G.turnSeq)) return false; // このキャラが登場したターン
      if (c.deckEmpty && P.deck.length !== 0) return false; // 自分のデッキが0枚
      if (c.deckAtMost != null && P.deck.length > c.deckAtMost) return false;
      if (c.selfCostAtLeast != null) { let ec = (card && card.base ? (card.base.cost || 0) : 0); if (card && card.buffs) ec += card.buffs.reduce((s, b) => s + (b.costAmt || 0), 0); if (card && !isNegated(card) && card.base && card.base.fx && card.base.fx.static) for (const o of card.base.fx.static) if (o.op === 'staticCost') ec += o.amount || 0; if (ec < c.selfCostAtLeast) return false; } // このキャラの盤面実効コスト（常在+一時コスト込み）がN以上
      if (c.oppCharKOedThisTurn && !(G._koedThisTurn && G._koedThisTurn[opp(side)] === G.turnSeq)) return false; // このターン相手キャラがKOされた
      if (c.lifeAtMost != null && P.life.length > c.lifeAtMost) return false;
      if (c.lifeAtLeast != null && P.life.length < c.lifeAtLeast) return false; // 自分のライフN枚以上（OP13-004サボ）
      if (c.donAtMost != null && donTotal(side) > c.donAtMost) return false; // 場のドンN枚以下（OP13-003ロジャー）
      if (c.oppLifeAtMost != null && O.life.length > c.oppLifeAtMost) return false;
      if (c.oppLifeAtLeast != null && O.life.length < c.oppLifeAtLeast) return false; // 相手のライフN枚以上（OP11-102ケイミー）
      if (c.totalLifeAtLeast != null && (P.life.length + O.life.length) < c.totalLifeAtLeast) return false; // お互いのライフ合計N枚以上（OP11-114ゴムゴムの火拳銃）
      if (c.totalLifeAtMost != null && (P.life.length + O.life.length) > c.totalLifeAtMost) return false; // お互いのライフ合計N枚以下（OP09-114リンドバーグ）
      if (c.totalHandLifeAtMost != null && (P.hand.length + P.life.length) > c.totalHandLifeAtMost) return false; // 自分のライフと手札の合計N枚以下（OP04-040クイーンL）
      if (c.restedDonAtLeast != null && (P.don.rested || 0) < c.restedDonAtLeast) return false; // 自分のレストのドンN枚以上（OP12-021いっぽんマツ）
      if (c.selfRestedCharsAtLeast != null && P.chars.filter(ch => ch.rested).length < c.selfRestedCharsAtLeast) return false; // 自分のレストのキャラN枚以上（OP10白ひげ/エネル/ミホーク/ゾロ）
      if (c.selfCharCostSumAtLeast != null && P.chars.reduce((s, ch) => s + (ch.base.cost || 0), 0) < c.selfCharCostSumAtLeast) return false; // 自分のキャラのコスト合計N以上（OP10-022ロー）
      if (c.selfSummonedThisTurn && !(card && card.summonedTurn === G.turnSeq)) return false; // このキャラが登場したターン（OP10-086シリュウ）
      if (c.selfCharsFewerBy != null && !(P.chars.length <= O.chars.length - c.selfCharsFewerBy)) return false; // 自分のキャラが相手よりN枚以上少ない（OP10-098解放）
      if (c.selfTurn && G.active !== side) return false;
      if (c.oppTurn && G.active === side) return false;
      return true;
    }
    // countBuff等の「数」を返す。of: selfChars/selfCharsOther/oppChars/trash/selfHand/selfLife/oppLife/don。ofTrait/ofFilterで絞り込み
    function countFor(o, side, card) {
      const P = G.players[side], O = G.players[opp(side)];
      let arr = null;
      switch (o.of) {
        case 'trash': arr = P.trash; break; // ofTrait/ofFilterで絞れる
        case 'selfHand': return P.hand.length;
        case 'selfLife': return P.life.length;
        case 'oppLife': return O.life.length;
        case 'don': return donTotal(side);
        case 'oppChars': arr = O.chars; break;
        case 'selfCharsOther': arr = P.chars.filter(c => c !== card); break;
        case 'selfChars': default: arr = P.chars; break;
      }
      if (o.ofTrait) arr = arr.filter(c => (c.base.traits || []).includes(o.ofTrait));
      if (o.ofFilter) arr = arr.filter(c => matchFilter(c, o.ofFilter));
      if (o.distinctBy === 'name') return new Set(arr.map(c => normName(c.base.name))).size; // カード名の異なる数
      if (o.distinctBy === 'no') return new Set(arr.map(c => c.base.no)).size;
      return arr.length;
    }

    /* ---------- パワー / 耐性 / キーワード ---------- */
    function isNegated(card) {
      if (!card) return false;
      if (card.negSeq != null) return true;
      // 場全体negate（OP13-064ロジャー: 自分のリーダー以外＆「ロジャー海賊団」を含む特徴を持たない自キャラを効果無効）
      if (card.base.type === 'CHAR') {
        const own = G.players[card.owner];
        if (own) for (const s of [own.leader, ...own.chars]) {
          if (!s || s === card || s.negSeq != null) continue;
          const st = s.base.fx && s.base.fx.static; if (!st) continue;
          for (const o of st) if (o.op === 'negateNonTrait' && !(card.base.traits || []).some(t => t.includes(o.trait))) return true;
        }
      }
      return false;
    }
    function cantAttackNeg(card) { return !!(card && card.noAtkSeq != null); }
    // 「レストにできない」状態（restImmune）: アタックもブロックもできず、レスト系効果の対象にもならない
    function isRestImmune(card) {
      if (!card) return false;
      if (card.restImmuneUntil != null && G.turnSeq <= card.restImmuneUntil) return true;
      const st = !isNegated(card) && card.base.fx && card.base.fx.static; // 常在版「このキャラはレストにされない」（条件付き可）
      if (st) for (const o of st) { if (o.op === 'staticRestImmune' && checkCond(o.cond, card.owner, card)) return true; }
      return false;
    }
    // 「相手の効果でレストにされない」（攻撃/ブロックは可。レスト系効果の対象からのみ除外。OP12-021いっぽんマツ）。isRestImmuneと違いアタック/ブロックは妨げない。
    function isOppRestImmune(card) {
      if (!card || isNegated(card)) return false;
      const st = card.base.fx && card.base.fx.static;
      if (st) for (const o of st) { if (o.op === 'staticOppRestImmune' && checkCond(o.cond, card.owner, card)) return true; }
      return false;
    }
    const _pwEval = new Set();
    function power(card) {
      if (!card || card.base.type === 'EVENT' || card.base.type === 'STAGE') return 0;
      if (_pwEval.has(card)) return card.base.power || 0; // 再帰ガード（minEffPower 等の循環を防ぐ）
      _pwEval.add(card);
      try {
      let base = card.base.power || 0;
      const _st0 = !isNegated(card) && card.base.fx && card.base.fx.static;
      if (_st0) for (const o of _st0) {
        if (o.op === 'staticSetBase' && (!o.cond || checkCond(o.cond, card.owner, card))) base = o.value; // 常在「元々のパワーをNにする」
        if (o.op === 'staticSetBaseToLeader' && (!o.cond || checkCond(o.cond, card.owner, card))) base = (G.players[card.owner].leader.base.power || 0); // 「元々のパワーが自分のリーダーの元々パワーと同じになる」(OP14-053ビスタ)
      }
      // 場全体「元々のパワーをNにする」（allySetBase: 自分のキャラ/リーダーのstaticが filter一致の自キャラのbaseを上書き。OP13-084ピーター=五老星7000）。lightMatchで再帰回避。
      if (card.base.type === 'CHAR') for (const src of [G.players[card.owner].leader, ...G.players[card.owner].chars]) {
        if (!src || isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
        for (const o of ss) { if (o.op === 'allySetBase' && (!o.cond || checkCond(o.cond, src.owner, src)) && lightMatch(card, o.filter)) base = o.value; }
      }
      for (const b of card.buffs) if (b.setBase != null) base = b.setBase; // 「元々のパワーをNにする」一時上書き(turn/oppNextEnd等)
      let p = base;
      if (card.owner === G.active) p += card.attachedDon * 1000; // 付与ドンは自分のターン中のみ+1000計上（相手ターンでは表示・計算とも元に戻る）
      for (const b of card.buffs) p += (b.amt || 0);
      const st = !isNegated(card) && card.base.fx && card.base.fx.static;
      if (st) for (const o of st) {
        if (o.op === 'condBuff' && checkCond(o.cond, card.owner, card)) p += o.power || 0;
        if (o.op === 'trashPower' && (!o.cond || checkCond(o.cond, card.owner, card))) { const tr = G.players[card.owner].trash.length; p += Math.floor(tr / (o.per || 4)) * (o.amount || 1000); }
        if (o.op === 'countBuff' && (!o.cond || checkCond(o.cond, card.owner, card))) { let n = countFor(o, card.owner, card); let bonus = Math.floor(n / (o.per || 1)) * (o.amount || 0); if (o.max != null) bonus = Math.min(bonus, o.max); p += bonus; } // 「〜の数だけ」パワー±
      }
      // 自分のキャラの static がリーダーへ常在パワー付与（leaderBuffStatic）する場合を加算
      if (card.base.type === 'LEADER') {
        for (const src of G.players[card.owner].chars) {
          if (isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'leaderBuffStatic' && checkCond(o.cond, src.owner, src)) p += o.power || 0; }
        }
      }
      // リーダー由来の「自分のリーダーとキャラすべて」全体パワー付与（boardBuff・cond対応。OP13-004サボ）。リーダー/キャラ両方に適用。
      if (card.base.type === 'CHAR' || card.base.type === 'LEADER') {
        const Lb = G.players[card.owner].leader;
        if (Lb && !isNegated(Lb) && Lb.base.fx && Lb.base.fx.static) for (const o of Lb.base.fx.static) { if (o.op === 'boardBuff' && (!o.cond || checkCond(o.cond, card.owner, Lb))) p += o.power || 0; }
      }
      // 相手の場（リーダー/キャラ）の static が「相手の全キャラにパワー±（oppStaticPowerMod）」を課す場合
      if (card.base.type === 'CHAR') {
        for (const src of [G.players[opp(card.owner)].leader, ...G.players[opp(card.owner)].chars]) {
          if (!src || isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'oppStaticPowerMod' && checkCond(o.cond, src.owner, src)) p += o.power || 0; }
        }
        // 自分の他のキャラ/リーダーの static が「自分のフィルタ一致キャラにパワー±（allyPower）」を課す場合（OP14-034ルフィ：緑コスト4以上の麦わら全+1000）。
        // lightMatch を使い再帰（minEffPower等→power()）を避ける。
        for (const src of [G.players[card.owner].leader, ...G.players[card.owner].chars, G.players[card.owner].stage]) {
          if (!src || src === card || isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'allyPower' && (!o.cond || checkCond(o.cond, src.owner, src)) && lightMatch(card, o.filter)) p += o.power || 0; }
        }
      }
      // 相手ターン中に「元々のパワーをNにする」静的付与（フザ→シュラ/自身 等）
      if (G.active !== card.owner) {
        let setP = null;
        for (const src of G.players[card.owner].chars) {
          if (isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'setPowerOppTurn' && (!o.cond || checkCond(o.cond, src.owner, src)) && ((src === card && o.self) || (o.names && o.names.includes(card.base.name)) || (o.leaderTarget && card.base.type === 'LEADER' && card.owner === src.owner))) setP = o.power; }
        }
        if (setP != null) p += (setP - (card.base.power || 0));
      }
      return p;
      } finally { _pwEval.delete(card); }
    }
    // 相手の効果で「選ばれない/対象にならない」= あらゆる効果の対象から除外（koOnly はKO限定なので除外しない）
    // blanket「相手の効果の対象にならない/選ばれない」のみ（候補から除外）。「場を離れない」は除去のみ無効＝選択は通すので含めない
    function isImmune(card) {
      if (isNegated(card)) return false; const st = card.base.fx && card.base.fx.static;
      if (st) for (const o of st) {
        if (o.op === 'effectImmune' && !o.koOnly) return true;
      }
      return false;
    }
    // 「相手の効果で場を離れない」(condBuff immune): 効果によるKO/バウンス/デッキ送りを無効化（選択・無効化・パワー減少・レスト等は通す）
    function isLeaveImmune(card) {
      if (!card || isNegated(card)) return false; const st = card.base.fx && card.base.fx.static;
      return !!(st && st.some(o => o.op === 'condBuff' && o.immune && (!o.cond || checkCond(o.cond, card.owner, card))));
    }
    // このターン、side が card を「登場」できないか（効果による登場も含む）。_noSummonTurn=全面 / _noSummonMinCost=元々コストN以上（OP13-023/118・OP14-024/020）。
    // ※「手札からプレイできない」_noPlayTurn は通常プレイのみの制約なのでここには含めない（プレイ層で別途判定）。
    function summonBanned(side, card) {
      const P = G.players[side]; if (!P) return false;
      if (P._noSummonTurn === G.turnSeq) return true;
      if (P._noSummonMinCostTurn === G.turnSeq && card && (card.base.cost || 0) >= (P._noSummonMinCost || 99)) return true;
      return false;
    }
    // 「相手の効果ではKOされない」= 効果KOを無効（effectImmune＝KO限定／「場を離れない」＝KO含む）。選択・パワー減少・レスト等は通す。バトルKOも通す
    function isKoImmune(card) {
      if (!card || isNegated(card)) return false; const st = card.base.fx && card.base.fx.static;
      if (st && st.some(o => o.op === 'effectImmune')) return true;
      if (st && st.some(o => o.op === 'condBuff' && o.koImmune && (!o.cond || checkCond(o.cond, card.owner, card)))) return true; // 条件付き「効果でKOされない」（OP06-109傳ジロー）
      return isLeaveImmune(card);
    }
    function hasKw(card, kw) {
      if (!card) return false; const b = card.base;
      if (isNegated(card)) return card.kwGrant.some(g => g.kw === kw); // 効果無効中は固有能力(ブロッカー等)を失う。外部付与のみ残る
      if (b[kw]) return true;
      if (kw === 'rush' && b.condRush && checkCond(b.condRush, card.owner, card)) return true;
      if (kw === 'blocker' && b.condBlocker && checkCond(b.condBlocker, card.owner, card)) return true;
      // 自身の常在キーワード付与（【自分のターン中】等の条件付き）
      const st = b.fx && b.fx.static;
      if (st) for (const o of st) { if (o.op === 'staticKeyword' && o.kw === kw && checkCond(o.cond, card.owner, card)) return true; }
      // 自分のキャラの static が「名前グループ＋自身にキーワード付与（grantKeywordNames）」する場合（例 自分の『オーム』全てと自身に【ダブルアタック】）
      for (const src of G.players[card.owner].chars) {
        if (isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
        for (const o of ss) { if (o.op === 'grantKeywordNames' && o.kw === kw && (!o.cond || checkCond(o.cond, src.owner, src)) && ((src === card && o.self) || (o.names && o.names.includes(b.name)))) return true; }
      }
      // 自分のリーダー/キャラの static が「filter一致の自分のキャラにキーワード付与（allyKeyword）」する場合（OP11-001コビーL：SWORDに速攻：キャラ）。lightMatchで再帰回避。
      for (const src of [G.players[card.owner].leader, ...G.players[card.owner].chars]) {
        if (!src || isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
        for (const o of ss) { if (o.op === 'allyKeyword' && o.kw === kw && (!o.cond || checkCond(o.cond, src.owner, src)) && lightMatch(card, o.filter)) return true; }
      }
      // 自分のキャラの static が「リーダーへキーワード付与（grantKeywordToLeader）」する場合
      if (b.type === 'LEADER') {
        for (const src of G.players[card.owner].chars) {
          if (isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'grantKeywordToLeader' && o.kw === kw && checkCond(o.cond, src.owner, src)) return true; }
        }
      }
      return card.kwGrant.some(g => g.kw === kw);
    }
    function isUnblockable(card) {
      if (isNegated(card)) return card.kwGrant.some(g => g.kw === 'unblockable');
      const st = card.base.fx && card.base.fx.static;
      if (st) for (const o of st) { if (o.op === 'unblockableAttack') return true; if (o.op === 'grantUnblockable' && o.self) return true; }
      // 他カードからの名前指定付与（フザ→「シュラ」全員 等）。供給元が無効化中なら付与しない。
      for (const src of G.players[card.owner].chars) {
        if (src === card || isNegated(src)) continue;
        const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
        for (const o of ss) { if (o.op === 'grantUnblockable' && o.names && o.names.includes(card.base.name)) return true; }
      }
      return card.kwGrant.some(g => g.kw === 'unblockable');
    }

    /* ---------- バフ寿命 ---------- */
    function addBuff(card, amt, until) { card.buffs.push({ amt, until }); }
    function expireBuffs(side, tag) {
      const P = G.players[side]; const f = c => { c.buffs = c.buffs.filter(b => b.until !== tag); };
      f(P.leader); P.chars.forEach(f); if (P.stage) f(P.stage);
    }
    function clearBattleBuffs() {
      for (const s of ['me', 'cpu']) {
        const P = G.players[s]; const f = c => { c.buffs = c.buffs.filter(b => b.until !== 'battle'); c.battleTmp = 0; };
        f(P.leader); P.chars.forEach(f); if (P.stage) f(P.stage);
      }
    }
    function clearNegation() {
      for (const s of ['me', 'cpu']) {
        const P = G.players[s]; const f = c => { if (!c) return; if (c.negSeq != null && G.turnSeq >= c.negSeq) c.negSeq = null; if (c.noAtkSeq != null && G.turnSeq >= c.noAtkSeq) c.noAtkSeq = null; if (c.restImmuneUntil != null && G.turnSeq > c.restImmuneUntil) c.restImmuneUntil = null; };
        f(P.leader); P.chars.forEach(f); if (P.stage) f(P.stage);
      }
    }
    function clearTurnGrants(side) {
      const P = G.players[side]; const f = c => { c.kwGrant = c.kwGrant.filter(g => g.dur !== 'turn'); };
      f(P.leader); P.chars.forEach(f); if (P.stage) f(P.stage);
    }

    /* ---------- 対象マッチ ---------- */
    // 名前比較の正規化（公式データに全角Ｄと半角Dが混在するため、英数字を半角化して比較）
    function normName(s) { return (s || '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); }
    // 軽量フィルタ（base のみ参照。effコスト/power を呼ばない＝再帰しない）。allyPower/allyCost の対象判定用。
    function lightMatch(card, f) {
      if (!f) return true; const b = card.base;
      if (f.or && !f.or.some(sub => lightMatch(card, sub))) return false; // いずれか一致（再帰だがlightMatchなのでpower()を呼ばない＝安全。OP10-001スモーカー海軍/パンクハザード）
      if (f.and && !f.and.every(sub => lightMatch(card, sub))) return false;
      if (f.type && b.type !== f.type) return false;
      if (f.trait && !(b.traits || []).includes(f.trait)) return false;
      if (f.traitIncludes && !(b.traits || []).some(t => t.includes(f.traitIncludes))) return false;
      if (f.traits && !(b.traits || []).some(t => f.traits.includes(t))) return false;
      if (f.color && !(b.color || []).includes(f.color)) return false;
      if (f.name && normName(b.name) !== normName(f.name)) return false;
      if (f.nameExcludes && normName(b.name).includes(normName(f.nameExcludes))) return false;
      if (f.minBaseCost != null && (b.cost || 0) < f.minBaseCost) return false;
      if (f.maxBaseCost != null && (b.cost || 0) > f.maxBaseCost) return false;
      if (f.basePower != null && (b.power || 0) !== f.basePower) return false;
      return true;
    }
    function matchFilter(card, f) {
      if (!f) return true; const b = card.base;
      if (f.type && b.type !== f.type) return false;
      if (f.trait && !(b.traits || []).includes(f.trait)) return false;
      if (f.color && !(b.color || []).includes(f.color)) return false; // 色一致（赤/緑/青/紫/黒/黄）
      if (f.colorNot && (b.color || []).includes(f.colorNot)) return false;
      if (f.attr && !((b.attribute || '').includes(f.attr))) return false; // 属性(斬/打/射/特/知)を持つ
      if (f.traitIncludes && !(b.traits || []).some(t => t.includes(f.traitIncludes))) return false; // 特徴の部分一致（例「白ひげ海賊団」を含む特徴）
      if (f.traits && !(b.traits || []).some(t => f.traits.includes(t))) return false;
      if (f.name && normName(b.name) !== normName(f.name)) return false;
      if (f.cost != null && b.cost !== f.cost) return false;
      // フィールドのキャラの実効コスト：ティーチ・リーダーは【相手のターン中】自分のキャラすべてコスト+1
      let _ec = b.cost || 0;
      { const o = card.owner; if (o && G.players[o]) { const L = G.players[o].leader; if (L && L.base.leader === 'teach' && !isNegated(L) && G.active !== o && G.players[o].chars.includes(card)) _ec += 1; } }
      if (!isNegated(card) && b.fx && b.fx.static) for (const o of b.fx.static) { if (o.op === 'staticCost' && (!o.cond || checkCond(o.cond, card.owner, card))) _ec += o.amount || 0; } // 常在「このキャラのコスト+N」（盤面の実効コストのみ。プレイコストには影響しない。cond対応）
      { const ow2 = card.owner; if (ow2 && G.players[ow2]) for (const src of [G.players[ow2].leader, ...G.players[ow2].chars]) { if (!src || src === card || isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue; for (const o of ss) { if (o.op === 'allyCost' && (!o.cond || checkCond(o.cond, ow2, src)) && lightMatch(card, o.filter)) _ec += o.amount || 0; } } } // 自分の他キャラ/リーダーのstaticが「自分のフィルタ一致キャラのコスト±（allyCost）」（OP14-086ザラ：B・W全+2／OP10-042ウソップL：ドレスローザ+1）。lightMatchで再帰回避
      { const ow2 = card.owner; const en = ow2 && G.players[opp(ow2)]; if (en) for (const src of [en.leader, ...en.chars]) { if (!src || isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue; for (const o of ss) { if (o.op === 'oppCostMod' && (!o.cond || checkCond(o.cond, opp(ow2), src)) && lightMatch(card, o.filter)) _ec += o.amount || 0; } } } // 相手の盤面のstaticが「相手のキャラすべてのコスト±（oppCostMod）」を課す（OP08-083シープスヘッド：相手全コスト-1）
      if (card.buffs) _ec += card.buffs.reduce((s, bf) => s + (bf.costAmt || 0), 0); // 盤面の一時コスト増減（addCostBuff）
      _ec = Math.max(0, _ec);
      if (f.minCost != null && _ec < f.minCost) return false;
      if (f.maxCostFrom === 'oppLife' && _ec > (G.players[card.owner] ? G.players[card.owner].life.length : 0)) return false; // 「相手のライフ枚数以下のコスト」＝対象の持ち主のライフ枚数で動的判定
      if (f.maxCostFrom === 'don' && _ec > (G.players[card.owner] ? donTotal(card.owner) : 0)) return false; // 「自分の場のドン枚数以下のコスト」（OP13-099虚の玉座）
      if (f.maxCostFrom === 'totalLife' && _ec > ((G.players.me ? G.players.me.life.length : 0) + (G.players.cpu ? G.players.cpu.life.length : 0))) return false; // 「お互いのライフ合計枚数以下のコスト」（OP10-100イナズマ）
      if (f.maxCostFrom === 'oppDon' && _ec > (card.owner ? donTotal(opp(card.owner)) : 0)) return false; // 「相手の場のドン枚数以下のコスト」（OP08-062カタクリ）
      if (f.maxCostFrom === 'casterLife' && _ec > (card.owner && G.players[opp(card.owner)] ? G.players[opp(card.owner)].life.length : 0)) return false; // 効果を使う側(対象の持ち主の相手)のライフ枚数以下のコスト（OP08-102オペラ＝自分のライフ以下）
      if (f.maxCost != null && _ec > f.maxCost) return false;
      if (f.maxBaseCost != null && (b.cost || 0) > f.maxBaseCost) return false; // 「元々のコスト(基本コスト)N以下」＝base.costで判定(常在/一時のコスト増減を見ない)
      if (f.minBaseCost != null && (b.cost || 0) < f.minBaseCost) return false;
      if (f.basePower != null && (b.power || 0) !== f.basePower) return false; // 「元々のパワーがちょうどN」（基本パワー完全一致。OP14-058「元々のパワー6000のキャラ」等）
      if (f.minEffPower != null && power(card) < f.minEffPower) return false; // 実効パワー（付与ドン/buff/常在込み）N以上
      if (f.maxEffPower != null && power(card) > f.maxEffPower) return false; // 実効パワーN以下（「パワーN以下」＝現在パワー。「元々のパワーN以下」は maxPower を使う）
      if (f.power != null && (b.power || 0) !== f.power) return false; // 厳密パワー一致
      if (f.maxPower != null && (b.power || 0) > f.maxPower) return false;
      if (f.minPower != null && (b.power || 0) < f.minPower) return false;
      if (f.hasTrigger && !(b.fx && b.fx.trigger)) return false; // 【トリガー】を持つカード（OP09-062ロビンLの捨てコスト）
      if (f.noEffect && b.fx && Object.keys(b.fx).length) return false; // 元々効果のないキャラ（fx無し。OP03-091ヘルメッポ）
      if (f.nameIncludes && !normName(b.name).includes(normName(f.nameIncludes)) && !(b.aliasName && normName(b.aliasName).includes(normName(f.nameIncludes)))) return false; // 別名対応（OP04-099おリン=シャーロット・リンリン）
      if (f.traitNot && (b.traits || []).some(t => t.includes(f.traitNot))) return false; // 指定特徴(部分一致)を持つものを除外
      if (f.nameExcludes && normName(b.name).includes(normName(f.nameExcludes))) return false; // 指定名を含むものを除外
      if (f.typeNot && b.type === f.typeNot) return false;
      if (f.restedOnly && !card.rested) return false; // レスト状態のキャラのみ
      if (f.activeOnly && card.rested) return false; // アクティブのキャラのみ
      if (f.hasAttachedDon && (card.attachedDon || 0) < 1) return false; // ドン!!が付与されているキャラ
      if (f.minAttachedDon != null && (card.attachedDon || 0) < f.minAttachedDon) return false; // 付与ドンN枚以上
      if (f.not && matchFilter(card, f.not)) return false; // 下位フィルタに一致するものを除外
      if (f.hasTrigger && !((b.fx && b.fx.trigger) || /【トリガー】/.test(b.text || ''))) return false; // 【トリガー】を持つ
      if (f.or && !f.or.some(sub => matchFilter(card, sub))) return false; // いずれかの下位フィルタに一致
      if (f.and && !f.and.every(sub => matchFilter(card, sub))) return false; // すべての下位フィルタに一致（OP12-098等）
      return true;
    }
    // opの対象フィルタを構築（op.filter優先。無ければopの各フィールドから。既存opとの後方互換のため未指定は無視される）
    function opFilter(op) { return op.filter || { type: op.targetType, trait: op.trait, traitIncludes: op.traitIncludes, traits: op.traits, name: op.name, nameIncludes: op.nameIncludes, minCost: op.minCost, maxCost: op.maxCost, maxBaseCost: op.maxBaseCost, minBaseCost: op.minBaseCost, minPower: op.minPower, maxPower: op.maxPower, minEffPower: op.minEffPower, maxEffPower: op.maxEffPower }; }
    function oppChars(side, f) { return G.players[opp(side)].chars.filter(c => matchFilter(c, f) && !isImmune(c)); }
    function ownChars(side, f) { return G.players[side].chars.filter(c => matchFilter(c, f)); }

