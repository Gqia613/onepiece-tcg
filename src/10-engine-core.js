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
      if (c.leaderNameIncludes != null && !normName(P.leader.base.name).includes(normName(c.leaderNameIncludes))) return false;
      if (c.leaderColor != null && !(P.leader.base.color || []).includes(c.leaderColor)) return false;
      if (c.selfChar != null) { const min = c.selfChar.min || 1; if (P.chars.filter(ch => matchFilter(ch, c.selfChar)).length < min) return false; }
      if (c.oppChar != null) { const min = c.oppChar.min || 1; if (O.chars.filter(ch => matchFilter(ch, c.oppChar)).length < min) return false; } // 相手の場のキャラ条件
      if (c.noSelfChar != null) { if (P.chars.some(ch => matchFilter(ch, c.noSelfChar))) return false; }
      if (c.selfCharCount != null) { const f = c.selfCharCount; let arr = f.filter ? P.chars.filter(ch => matchFilter(ch, f.filter)) : P.chars; const n = f.distinctBy === 'name' ? new Set(arr.map(ch => normName(ch.base.name))).size : arr.length; if (f.min != null && n < f.min) return false; if (f.max != null && n > f.max) return false; } // 自キャラの数(distinctBy:'name'で異名数)のしきい値
      if (c.allSelfChar != null) { if (!P.chars.length || !P.chars.every(ch => matchFilter(ch, c.allSelfChar))) return false; } // 自分のキャラが全て一致（「〜のみ」）
      if (c.allSelfCharOther != null) { const others = P.chars.filter(ch => ch !== card); if (!others.length || !others.every(ch => matchFilter(ch, c.allSelfCharOther))) return false; }
      if (c.selfHand != null) { const min = c.selfHand.min || 1; if (P.hand.filter(h => matchFilter(h, c.selfHand)).length < min) return false; }
      if (c.donAtLeast != null && donTotal(side) < c.donAtLeast) return false;
      if (c.activeDonAtMost != null && (P.don.active || 0) > c.activeDonAtMost) return false; // アクティブのドンN枚以下
      if (c.activeDonAtLeast != null && (P.don.active || 0) < c.activeDonAtLeast) return false;
      if (c.oppHandAtLeast != null && O.hand.length < c.oppHandAtLeast) return false;
      if (c.selfHandAtMost != null && P.hand.length > c.selfHandAtMost) return false;
      if (c.trashAtLeast != null && P.trash.length < c.trashAtLeast) return false;
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
      if (c.oppLifeAtMost != null && O.life.length > c.oppLifeAtMost) return false;
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
    function isNegated(card) { return !!(card && card.negSeq != null); }
    function cantAttackNeg(card) { return !!(card && card.noAtkSeq != null); }
    // 「レストにできない」状態（restImmune）: アタックもブロックもできず、レスト系効果の対象にもならない
    function isRestImmune(card) {
      if (!card) return false;
      if (card.restImmuneUntil != null && G.turnSeq <= card.restImmuneUntil) return true;
      const st = !isNegated(card) && card.base.fx && card.base.fx.static; // 常在版「このキャラはレストにされない」（条件付き可）
      if (st) for (const o of st) { if (o.op === 'staticRestImmune' && checkCond(o.cond, card.owner, card)) return true; }
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
      if (_st0) for (const o of _st0) { if (o.op === 'staticSetBase' && (!o.cond || checkCond(o.cond, card.owner, card))) base = o.value; } // 常在「元々のパワーをNにする」
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
      // 相手の場（リーダー/キャラ）の static が「相手の全キャラにパワー±（oppStaticPowerMod）」を課す場合
      if (card.base.type === 'CHAR') {
        for (const src of [G.players[opp(card.owner)].leader, ...G.players[opp(card.owner)].chars]) {
          if (!src || isNegated(src)) continue;
          const ss = src.base.fx && src.base.fx.static; if (!ss) continue;
          for (const o of ss) { if (o.op === 'oppStaticPowerMod' && checkCond(o.cond, src.owner, src)) p += o.power || 0; }
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
    // 「相手の効果ではKOされない」= 効果KOを無効（effectImmune＝KO限定／「場を離れない」＝KO含む）。選択・パワー減少・レスト等は通す。バトルKOも通す
    function isKoImmune(card) {
      if (!card || isNegated(card)) return false; const st = card.base.fx && card.base.fx.static;
      return (!!(st && st.some(o => o.op === 'effectImmune'))) || isLeaveImmune(card);
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
    function matchFilter(card, f) {
      if (!f) return true; const b = card.base;
      if (f.type && b.type !== f.type) return false;
      if (f.trait && !(b.traits || []).includes(f.trait)) return false;
      if (f.color && !(b.color || []).includes(f.color)) return false; // 色一致（赤/緑/青/紫/黒/黄）
      if (f.colorNot && (b.color || []).includes(f.colorNot)) return false;
      if (f.traitIncludes && !(b.traits || []).some(t => t.includes(f.traitIncludes))) return false; // 特徴の部分一致（例「白ひげ海賊団」を含む特徴）
      if (f.traits && !(b.traits || []).some(t => f.traits.includes(t))) return false;
      if (f.name && normName(b.name) !== normName(f.name)) return false;
      if (f.cost != null && b.cost !== f.cost) return false;
      // フィールドのキャラの実効コスト：ティーチ・リーダーは【相手のターン中】自分のキャラすべてコスト+1
      let _ec = b.cost || 0;
      { const o = card.owner; if (o && G.players[o]) { const L = G.players[o].leader; if (L && L.base.leader === 'teach' && !isNegated(L) && G.active !== o && G.players[o].chars.includes(card)) _ec += 1; } }
      if (!isNegated(card) && b.fx && b.fx.static) for (const o of b.fx.static) { if (o.op === 'staticCost' && (!o.cond || checkCond(o.cond, card.owner, card))) _ec += o.amount || 0; } // 常在「このキャラのコスト+N」（盤面の実効コストのみ。プレイコストには影響しない。cond対応）
      if (card.buffs) _ec += card.buffs.reduce((s, bf) => s + (bf.costAmt || 0), 0); // 盤面の一時コスト増減（addCostBuff）
      _ec = Math.max(0, _ec);
      if (f.minCost != null && _ec < f.minCost) return false;
      if (f.maxCostFrom === 'oppLife' && _ec > (G.players[card.owner] ? G.players[card.owner].life.length : 0)) return false; // 「相手のライフ枚数以下のコスト」＝対象の持ち主のライフ枚数で動的判定
      if (f.maxCost != null && _ec > f.maxCost) return false;
      if (f.maxBaseCost != null && (b.cost || 0) > f.maxBaseCost) return false; // 「元々のコスト(基本コスト)N以下」＝base.costで判定(常在/一時のコスト増減を見ない)
      if (f.minBaseCost != null && (b.cost || 0) < f.minBaseCost) return false;
      if (f.minEffPower != null && power(card) < f.minEffPower) return false; // 実効パワー（付与ドン/buff/常在込み）N以上
      if (f.maxEffPower != null && power(card) > f.maxEffPower) return false; // 実効パワーN以下（「パワーN以下」＝現在パワー。「元々のパワーN以下」は maxPower を使う）
      if (f.power != null && (b.power || 0) !== f.power) return false; // 厳密パワー一致
      if (f.maxPower != null && (b.power || 0) > f.maxPower) return false;
      if (f.minPower != null && (b.power || 0) < f.minPower) return false;
      if (f.nameIncludes && !normName(b.name).includes(normName(f.nameIncludes))) return false;
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
      return true;
    }
    // opの対象フィルタを構築（op.filter優先。無ければopの各フィールドから。既存opとの後方互換のため未指定は無視される）
    function opFilter(op) { return op.filter || { type: op.targetType, trait: op.trait, traitIncludes: op.traitIncludes, traits: op.traits, name: op.name, nameIncludes: op.nameIncludes, minCost: op.minCost, maxCost: op.maxCost, maxBaseCost: op.maxBaseCost, minBaseCost: op.minBaseCost, minPower: op.minPower, maxPower: op.maxPower, minEffPower: op.minEffPower, maxEffPower: op.maxEffPower }; }
    function oppChars(side, f) { return G.players[opp(side)].chars.filter(c => matchFilter(c, f) && !isImmune(c)); }
    function ownChars(side, f) { return G.players[side].chars.filter(c => matchFilter(c, f)); }

