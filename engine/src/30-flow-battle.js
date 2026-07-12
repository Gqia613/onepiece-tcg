    "use strict";
    /* =========================================================================
       登場 / 除去
       ========================================================================= */
    // 場が5体の時、1体をトラッシュに送って枠を空ける（人間は選択／CPUは最弱を捨てる）。optional=trueなら人間はキャンセル可。
    async function trashCharForRoom(side, optional) {
      const P = G.players[side];
      if (P.chars.length < 5) return true;
      let sac;
      if (P.isCPU) sac = P.chars.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0];
      else sac = await chooseCard(side, P.chars, '⚠ トラッシュに送るキャラを選択（場が5体）', 'ownSmall', optional, 'danger');
      if (!sac) return false; // 人間がキャンセル
      removeCharTo(sac, P.trash);
      flog(side, `「${sac.base.name}」をトラッシュに送った`);
      render();
      return true;
    }
    async function summon(side, card, noEnter, source) {
      const P = G.players[side];
      if (summonBanned(side, card) && source !== 'trash') { flog(side, 'このターンはこのキャラを登場できない'); return; } // 登場ban（全面=OP14-024/020 / 元々コストN以上=OP13-023/118）。トラッシュからの蘇生など特殊経路は対象外
      if (P.chars.length >= 5) { if (!(await trashCharForRoom(side, false))) return; } // 5体なら枠を空ける（効果による登場でも適用）
      card.owner = side; card.rested = false; card.summonedTurn = G.turnSeq; card.attachedDon = 0; card.buffs = []; card.kwGrant = [];
      card.negSeq = null; card.noAtkSeq = null; card.frozen = false; // ★登場するキャラは常に「新しいキャラ」＝以前の効果無効/アタック不可/ロックを引き継がない（トラッシュ→蘇生でアタック不可が残るバグの防止。OP16-098→OP16-096ヤマト等）
      { const L = P.leader; if (L && !isNegated(L) && L.base.fx && L.base.fx.static && L.base.fx.static.some(o => o.op === 'summonRested')) card.rested = true; } // 「自分のキャラはレストで登場する」（OP09-022リムL）
      P.chars.push(card);
      render(); animClass(card.uid, 'enter'); spawnAt(card.uid, 'ring'); sfx('summon'); await sleep(260);
      flog(side, `「${card.base.name}」が登場`);
      // トラッシュから登場した時のリーダー誘発（onReviveFromTrash）— 登場時効果より先に付与
      if (source === 'trash') checkReviveTrigger(side, card);
      // 【登場時】効果の無効化（OP09-081ティーチL: 自分の登場時は無効／起動メインで相手の登場時を一定期間無効）
      const onPlayNeg = (() => { const L = P.leader; if (L && !isNegated(L) && L.base.fx && L.base.fx.static && L.base.fx.static.some(o => o.op === 'negateOwnOnPlay')) return true; if ((P._onPlayNegatedUntil || 0) >= G.turnSeq) return true; return false; })();
      const hasEnter = !noEnter && !onPlayNeg && card.base.fx && card.base.fx.onPlay && !isNegated(card);
      if (onPlayNeg && card.base.fx && card.base.fx.onPlay) flog(side, `「${card.base.name}」の登場時効果は無効になった`);
      if (hasEnter) await fxNote(side, '登場時効果', card.base.name);
      else if (G.players[side].isCPU) await fxNote(side, '登場', card.base.name);
      if (hasEnter) await runFx(card.base.fx.onPlay, { self: card, side });
      // リーダーの【キャラ登場時】誘発（ナミ/ハンコック等。データ駆動 onAllyEnter）
      await checkAllyEnter(side, card);
      // 相手のキャラの【相手がキャラを登場させた時】誘発（OP04-024シュガー）
      { const O = G.players[opp(side)]; for (const c of O.chars.slice()) { const cfg = c.base.fx && c.base.fx.onOppEnter; if (!cfg || isNegated(c) || !O.chars.includes(c)) continue; if (cfg.when === 'oppTurn' && opp(side) === G.active) continue; if (cfg.when === 'selfTurn' && opp(side) !== G.active) continue; if (cfg.cond && !checkCond(cfg.cond, opp(side), c)) continue; if (cfg.once === 'turn') { if (c._oppEnterTurn === G.turnSeq) continue; c._oppEnterTurn = G.turnSeq; } await runFx(cfg.fx, { self: c, side: opp(side), entered: card }); } }
      render();
    }
    // 「効果で自分の手札が捨てられた時」誘発（OP14-045クロオビ/049ジンベエ→速攻, 056ワダツミ→自身無効）。
    // 手札を捨てる各op（discardOwn/discardCost/oppDiscard）から、捨てられた側を指定して呼ぶ。
    async function fireHandDiscarded(side, n) {
      const P = G.players[side]; n = n || 1;
      P._handDiscardedTurn = G.turnSeq; // 効果で自分の手札が捨てられたターン（cond selfHandDiscardedThisTurn＝ST33-004ボルサリーノのコスト-3）
      for (const c of [...P.chars.slice(), P.leader]) {
        if (c && c.base.fx && c.base.fx.onSelfHandDiscarded && (c === P.leader || P.chars.includes(c)) && !isNegated(c)) {
          await runFx(c.base.fx.onSelfHandDiscarded, { self: c, side, discarded: n }); // ctx.discarded=捨てた枚数（OP12-040クザンが参照）
        }
      }
    }
    // 「【トリガー】が発動した時」誘発（OP13-106コニー＝相手ターン中ブロッカー）。side=トリガーを発動した側。
    async function fireOnTrigger(side) {
      const P = G.players[side];
      for (const c of P.chars.slice()) {
        const cfg = c.base.fx && c.base.fx.onTrigger;
        if (!cfg || isNegated(c) || !P.chars.includes(c)) continue;
        if (cfg.when === 'oppTurn' && side === G.active) continue;
        if (cfg.when === 'selfTurn' && side !== G.active) continue;
        await runFx(cfg.fx, { self: c, side });
      }
    }
    // 「相手がイベントを発動した時」誘発（OP11-012フランキー/102ケイミー）。eventSide=イベントを使った側→その相手のキャラを誘発。
    // 「リーダーか自分のキャラにドン‼が付与された時」誘発（OP02-002ガープL）。side=付与した側。
    async function fireDonAttached(side) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onDonAttached;
      if (!cfg) return;
      if (cfg.when === 'selfTurn' && side !== G.active) return;
      if (cfg.once === 'turn') { if (L._donAttachedTurn === G.turnSeq) return; L._donAttachedTurn = G.turnSeq; }
      await runFx(cfg.fx, { self: L, side });
    }
    // 「キャラが自分の効果でレストになった時」誘発（OP10-036ペローナ＝自分のターン中ターン1回ドン1アクティブ）。side=効果を使った側。
    async function fireOwnRest(side) {
      if ((G._fxDepth || 0) > 0) { (G._pendingReacts = G._pendingReacts || []).push(() => fireOwnRest(side)); return; } // 効果解決後に発動（公式の割り込み規則）
      const P = G.players[side];
      for (const c of [...P.chars, P.leader, P.stage]) {
        const cfg = c && c.base.fx && c.base.fx.onOwnRest;
        if (!cfg || isNegated(c)) continue;
        if (cfg.when === 'selfTurn' && side !== G.active) continue;
        if (cfg.when === 'oppTurn' && side === G.active) continue;
        if (cfg.cond && !checkCond(cfg.cond, side, c)) continue;
        if (cfg.once === 'turn') { if (c._ownRestTurn === G.turnSeq) continue; c._ownRestTurn = G.turnSeq; }
        await runFx(cfg.fx, { self: c, side });
      }
    }
    async function fireOppEvent(eventSide) {
      const oppSide = opp(eventSide), P = G.players[oppSide];
      for (const c of P.chars.slice()) {
        const cfg = c.base.fx && c.base.fx.onOppEvent;
        if (!cfg || isNegated(c) || !P.chars.includes(c)) continue;
        if (cfg.when === 'selfTurn' && oppSide !== G.active) continue;
        if (cfg.when === 'oppTurn' && oppSide === G.active) continue;
        if (cfg.cond && !checkCond(cfg.cond, oppSide, c)) continue;
        if (cfg.once === 'turn') { if (c._oppEventTurn === G.turnSeq) continue; c._oppEventTurn = G.turnSeq; }
        await runFx(cfg.fx, { self: c, side: oppSide });
      }
      // 「自分がイベントを発動した時」誘発（OP04-053ページワン）。eventSide自身のキャラが反応。
      const E = G.players[eventSide];
      for (const c of E.chars.slice()) {
        const cfg = c.base.fx && c.base.fx.onSelfEvent;
        if (!cfg || isNegated(c) || !E.chars.includes(c)) continue;
        if (cfg.cond && !checkCond(cfg.cond, eventSide, c)) continue;
        if (cfg.once === 'turn') { if (c._selfEventTurn === G.turnSeq) continue; c._selfEventTurn = G.turnSeq; }
        await runFx(cfg.fx, { self: c, side: eventSide });
      }
    }
    // 「ライフが離れた時」誘発（OP12-099カルガラ＝自分のターン中ライフ離脱で1ドロー）。side=ライフが離れた側。
    // ライフ離脱時の誘発。side=ライフを失った側。
    //   ・onLifeLeave（既定）: そのカードの持ち主「自身の」ライフが離れた時に反応。
    //   ・onLifeLeave.anyLife:true: 「(自分/相手問わず)ライフが離れた時」＝主語なし公式文（OP11-041ナミ/OP12-099カルガラ）。相手のライフ離脱でも持ち主のターン中なら発動。
    //   ・onOppLifeLeave: 「相手のライフが離れた時」明記（OP08-105ボニー）。
    //   【自分のターン中】(when:selfTurn)は「効果の持ち主のターン」で判定する（ライフを失った側ではない）。
    async function fireLifeLeft(side) {
      const P = G.players[side];
      P._lifeLeftTurn = G.turnSeq; // このターンに side のライフが離れた（P-120サンジ「相手のライフが離れているターン中」コスト判定用）※記録は即時
      if ((G._fxDepth || 0) > 0) { (G._pendingReacts = G._pendingReacts || []).push(() => fireLifeLeft(side)); return; } // 誘発効果の発動は現在の効果解決後（例: 日和の全処理後にナミLのドロー）
      const fireOne = async (c, owner) => {
        const cfg = c.base.fx && c.base.fx.onLifeLeave;
        if (!cfg || isNegated(c)) return;
        if (cfg.when === 'selfTurn' && owner !== G.active) return;
        if (cfg.when === 'oppTurn' && owner === G.active) return;
        if (cfg.cond && !checkCond(cfg.cond, owner, c)) return;
        if (cfg.once === 'turn' && c._lifeLeaveTurn === G.turnSeq) return;
        if (cfg.optional && !G.players[owner].isCPU) { // 「発動できる」= 任意。持ち主に発動確認（辞退なら【ターン1回】未消費）
          const yes = await confirmUse(owner, 'ライフ離脱時', `「${c.base.name}」の効果を発動しますか？`, '発動する', '発動しない');
          if (!yes) return;
        }
        const prevSeq = c._lifeLeaveTurn;
        if (cfg.once === 'turn') c._lifeLeaveTurn = G.turnSeq;
        await fxNote(owner, 'ライフ離脱時', c.base.name, c.base.no);
        const rctx = { self: c, side: owner };
        await runFx(cfg.fx, rctx);
        if (cfg.once === 'turn' && rctx._declined && !rctx._committed) c._lifeLeaveTurn = prevSeq; // 条件不成立=未発動なら【ターン1回】を消費しない
      };
      // (1) ライフを失った側のカード（自分のライフ離脱への反応。anyLifeもここで自ライフに反応）
      for (const c of [P.leader, ...P.chars.slice()]) {
        if (c !== P.leader && !P.chars.includes(c)) continue;
        await fireOne(c, side);
      }
      // (2) 相手側のカードで anyLife:true（主語なし「ライフが離れた時」＝相手のライフ離脱にも反応）
      const O = G.players[opp(side)];
      for (const c of [O.leader, ...O.chars.slice()]) {
        if (c !== O.leader && !O.chars.includes(c)) continue;
        const cfg = c.base.fx && c.base.fx.onLifeLeave;
        if (cfg && cfg.anyLife) await fireOne(c, opp(side));
      }
      // (3) 「相手のライフが離れた時」明記（OP08-105ボニー）
      for (const c of O.chars.slice()) {
        const cfg = c.base.fx && c.base.fx.onOppLifeLeave;
        if (!cfg || isNegated(c) || !O.chars.includes(c)) continue;
        if (cfg.when === 'selfTurn' && opp(side) !== G.active) continue;
        if (cfg.when === 'oppTurn' && opp(side) === G.active) continue;
        if (cfg.once === 'turn') { if (c._oppLifeLeftTurn === G.turnSeq) continue; c._oppLifeLeftTurn = G.turnSeq; }
        await runFx(cfg.fx, { self: c, side: opp(side) });
      }
    }
    // 「自分の場のドン‼がドン‼デッキに戻された時」誘発（OP14-068トレーボル）。ターン1回ガード付き。
    async function fireDonReturned(side, n) {
      if ((G._fxDepth || 0) > 0) { (G._pendingReacts = G._pendingReacts || []).push(() => fireDonReturned(side, n)); return; } // 効果解決後に発動
      const P = G.players[side];
      G._lastDonReturned = n || 1; // cond donReturnedAtLeast（EB02-035）が参照。発火処理後にクリア
      for (const c of [...P.chars.slice(), P.leader]) { // リーダーのonDonReturnedも誘発（OP09-061ルフィL）
        if (c && c.base.fx && c.base.fx.onDonReturned && (c === P.leader || P.chars.includes(c)) && !isNegated(c)) {
          if (c.base.fx.onDonReturned.some(o => o.once === 'turn') && c._donRetTurn === G.turnSeq) continue;
          c._donRetTurn = G.turnSeq;
          await runFx(c.base.fx.onDonReturned, { self: c, side });
        }
      }
      G._lastDonReturned = 0;
    }
    // リーダーの onReviveFromTrash: トラッシュから filter一致のキャラが登場した時、そのキャラにキーワード付与
    function checkReviveTrigger(side, card) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onReviveFromTrash;
      if (!cfg) return;
      if (cfg.filter && !matchFilter(card, cfg.filter)) return;
      const kw = cfg.kw || 'rush';
      card.kwGrant.push({ kw, dur: durTag(cfg.duration, 'turn') });
      flog(side, `【${L.base.name}】トラッシュから登場した「${card.base.name}」に【${kwJa(kw)}】`);
    }
    // リーダーの onAllyEnter: 自分のキャラが登場した時に誘発（when:'selfTurn'|'oppTurn', filter/cond/once対応）
    async function checkAllyEnter(side, card) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onAllyEnter;
      if (!cfg) return;
      if (cfg.when === 'selfTurn' && side !== G.active) return;
      if (cfg.when === 'oppTurn' && side === G.active) return;
      if (cfg.filter && !matchFilter(card, cfg.filter)) return;
      if (cfg.cond && !checkCond(cfg.cond, side, L)) return;
      if (cfg.once === 'turn') { if (L._allyEnterTurn === G.turnSeq) return; L._allyEnterTurn = G.turnSeq; }
      await fxNote(side, 'キャラ登場時', L.base.name);
      await runFx(cfg.fx, { self: L, side, entered: card });
    }
    // リーダーの onAllyLeave: 自分の filter一致キャラが場を離れた時に誘発（cause/when/filter/once/cond対応）
    async function checkAllyLeave(side, card, cause, isKo) {
      const P = G.players[side];
      // onAllyLeave はリーダー/キャラ/ステージのいずれも持てる（OP07-038ハンコック=リーダー, OP13-078オーロ・ジャクソン号=ステージ）
      for (const src of [P.leader, ...P.chars, P.stage]) {
        if (!src || src === card || isNegated(src)) continue;
        const cfg = src.base.fx && src.base.fx.onAllyLeave; if (!cfg) continue;
        if (cfg.ko && !isKo) continue;                       // 「KOされた時」限定（KO以外のbounce/デッキ送りでは誘発しない。OP14-041ハンコックL）
        if (cfg.cause && cfg.cause !== cause) continue;     // 原因限定（'ownEffect'|'oppEffect'|'battle'）。未指定なら全原因
        if (cfg.when === 'selfTurn' && side !== G.active) continue;
        if (cfg.when === 'oppTurn' && side === G.active) continue;
        if (cfg.filter && !matchFilter(card, cfg.filter)) continue;
        if (cfg.cond && !checkCond(cfg.cond, side, src)) continue;
        if (cfg.once === 'turn') { if (src._allyLeaveTurn === G.turnSeq) continue; src._allyLeaveTurn = G.turnSeq; }
        await fxNote(side, 'キャラ離脱時', src.base.name);
        await runFx(cfg.fx, { self: src, side, left: card });
      }
    }
    // リーダーの onTurnStart: 自分のターン開始時（メイン開始前）に誘発（cond/once対応）
    async function checkTurnStart(side) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onTurnStart;
      if (!cfg) return;
      if (cfg.cond && !checkCond(cfg.cond, side, L)) return;
      if (cfg.once === 'turn') { if (L._turnStartSeq === G.turnSeq) return; L._turnStartSeq = G.turnSeq; }
      await fxNote(side, 'ターン開始時', L.base.name);
      await runFx(cfg.fx, { self: L, side });
    }
    // リーダーの onLifeZero: 自分のライフが0になった時に誘発（エネル等の補充。when/once対応）
    async function checkLifeZero(side) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onLifeZero;
      if (!cfg || G.players[side].life.length !== 0) return;
      if (cfg.when === 'oppTurn' && side === G.active) return;
      if (cfg.when === 'selfTurn' && side !== G.active) return;
      if (cfg.once === 'turn') { if (L._lifeZeroSeq === G.turnSeq) return; L._lifeZeroSeq = G.turnSeq; }
      await fxNote(side, 'ライフ0', L.base.name);
      await runFx(cfg.fx, { self: L, side });
    }
    // リーダーの onLeaderHitLife: このリーダー自身のアタックで相手ライフにダメージを与えた時に誘発
    async function checkLeaderHitLife(attacker) {
      if (!attacker || attacker.base.type !== 'LEADER') return;
      const side = attacker.owner, L = G.players[side].leader;
      if (L !== attacker || isNegated(L)) return;
      const cfg = L.base.fx && L.base.fx.onLeaderHitLife;
      if (!cfg) return;
      if (cfg.cond && !checkCond(cfg.cond, side, L)) return;
      await runFx(cfg.fx, { self: L, side });
    }
    // デッキが0枚になった時、敗北の代わりに勝利するリーダー（ナミ等）
    function hasDeckOutWin(side) { const L = G.players[side].leader; return !!(L && !isNegated(L) && L.base.fx && L.base.fx.static && L.base.fx.static.some(o => o.op === 'deckOutWin')); }
    async function koCard(card, source) {
      const ow = G.players[card.owner];
      const idx = ow.chars.indexOf(card); if (idx < 0) return;
      animClass(card.uid, 'ko'); spawnAt(card.uid, 'burst'); sfx('ko'); await sleep(420);
      ow.don.rested += card.attachedDon; // 付与ドンはコストエリアへ「レスト」で戻る（公式ルール。次のリフレッシュでアクティブ化）
      removeChar(card); ow.trash.push(reset(card));
      card._koSource = source || 'effect'; // KO原因（'battle'|'oppEffect'|'effect'）。onKOの条件 koByOpp 用
      (G._koedThisTurn = G._koedThisTurn || {})[card.owner] = G.turnSeq; // このターンKOされた側を記録（oppCharKOedThisTurn条件用）
      flog(card.owner, `「${card.base.name}」がKO`);
      if (card.base.fx && card.base.fx.onKO && !isNegated(card)) { await fxNote(card.owner, 'KO時効果', card.base.name); await runFx(card.base.fx.onKO, { self: card, side: card.owner }); }
      // エース(OP13-002): 【ドン‼×1】自分の元々パワー6000以上のキャラがKOされた時ターン1回ドロー（被ダメドローと _aceDrawTurn を共有＝合計ターン1回）
      { const oL = ow.leader; if (card.base.type === 'CHAR' && (card.base.power || 0) >= 6000 && oL.base.leader === 'ace' && !isNegated(oL) && oL.attachedDon >= 1 && ow._aceDrawTurn !== G.turnSeq) { ow._aceDrawTurn = G.turnSeq; if (draw(card.owner, 1)) { floatOn(oL.uid, 'DRAW', 'heal'); flog(card.owner, '【エース】元々パワー6000以上のKOで1ドロー'); } } }
      await checkAllyLeave(card.owner, card, source === 'battle' ? 'battle' : 'oppEffect', true); // 自分のキャラが場を離れた時のリーダー誘発（KOはバトル/相手効果。第4引数isKo=true）
      // 「相手のキャラがKOされた時」誘発（OP01-061カイドウL）。KOされた側の相手＝koSide のキャラ/リーダーが反応。
      { for (const koSide of ['me', 'cpu']) { const K = G.players[koSide]; if (!K) continue; for (const c of [K.leader, ...K.chars]) { const cfg = c && c.base.fx && c.base.fx.onOppKO; if (!cfg || isNegated(c)) continue; if (koSide === card.owner && !cfg.anySide) continue; if (koSide !== card.owner && cfg.anySide === 'ownOnly') continue; if (cfg.when === 'selfTurn' && koSide !== G.active) continue; if (cfg.cond && !checkCond(cfg.cond, koSide, c)) continue; if (cfg.once === 'turn') { if (c._oppKOTurn === G.turnSeq) continue; c._oppKOTurn = G.turnSeq; } await runFx(cfg.fx, { self: c, side: koSide }); } } } // anySide=自陣営のKOにも反応（ST08-001ルフィL「キャラがKOされた時」）
      render();
    }
    function bounceCard(card) { removeCharTo(card, G.players[card.owner].hand); }
    function removeChar(card) { const ow = G.players[card.owner]; const i = ow.chars.indexOf(card); if (i >= 0) ow.chars.splice(i, 1); if (ow.stage === card) ow.stage = null; }
    // キャラを場から取り除き、付与ドンを持ち主のコストエリアに「レスト」で戻して destPile に裏向き(reset)で置く（除去/コスト/バウンス共通。公式: 離脱時の付与ドンはレスト）
    function removeCharTo(card, destPile) { G.players[card.owner].don.rested += card.attachedDon || 0; removeChar(card); destPile.push(reset(card)); }

    /* ---------- ドロー / 敗北 ---------- */
    // ブルック等「デッキ0でも即敗北せず、0枚になったターン終了時に敗北」
    function hasDeckOutDelay(side) { const L = G.players[side].leader; return !!(L && !isNegated(L) && L.base.fx && L.base.fx.static && L.base.fx.static.some(o => o.op === 'deckOutDelay')); }
    function draw(side, n) { const P = G.players[side]; for (let i = 0; i < n; i++) { if (P.deck.length === 0) { if (hasDeckOutWin(side)) { lose(opp(side), 'デッキ0で勝利'); return false; } if (hasDeckOutDelay(side)) return false; lose(side, 'デッキ切れ'); return false; } P.hand.push(P.deck.shift()); } if (n > 0 && G.phase && G.phase !== 'ドロー' && !G._inDrawHook) fireSimpleReact(side, 'onExtraDraw'); return true; } // ドローフェイズ以外で引いた時の誘発（OP05-053モザンビア）
    // 軽量な「〜した時」誘発（detached・ターン1回/when対応。powerMod等の即時buff用。OP05-053/107）
    function fireSimpleReact(side, key) {
      if ((G._fxDepth || 0) > 0) { (G._pendingReacts = G._pendingReacts || []).push(() => { fireSimpleReact(side, key); }); return; } // 効果解決後に発動
      if (G.active !== side) return; G._inDrawHook = true;
      for (const c of G.players[side].chars) { const cfg = c.base.fx && c.base.fx[key]; if (!cfg || isNegated(c)) continue; if (cfg.once === 'turn') { const fk = '_react_' + key; if (c[fk] === G.turnSeq) continue; c[fk] = G.turnSeq; } try { runFx(cfg.fx, { self: c, side }); } catch (e) {} }
      G._inDrawHook = false;
    }
    function lose(side, reason) {
      if (G.winner) return; G.winner = opp(side);
      if (G._sim) return;   // ★AI探索の内部シミュレーションでは勝敗UI(ログ/演出/勝利画面)を出さない。winnerだけ確定。
      const win = G.winner === 'me';
      log('sys', `${reason ? reason + ' — ' : ''}<b>${sideName(G.winner)}の勝ち${win ? '！' : ''}</b>`);
      setPhase('終了'); G.myActable = false; render();
      showEndScreen(win, reason);
    }

    /* =========================================================================
       ターン進行
       ========================================================================= */
    async function beginTurn(side) {
      if (G.winner) return;
      G.busy = true; G.active = side; const P = G.players[side]; P.turnsTaken++; G.turnSeq++; G.turnDisp++;
      P.denyBlock = false;
      // リフレッシュ
      setPhase('リフレッシュ');
      const _refLock = Math.min(P._donRefreshLock || 0, P.don.rested); P._donRefreshLock = 0; // ドンN枚は次のリフレッシュでアクティブにならない（OP10-033ナミ）
      P.don.active += P.don.rested - _refLock; P.don.rested = _refLock;
      const ret = c => { P.don.active += c.attachedDon; c.attachedDon = 0; };
      ret(P.leader); P.chars.forEach(ret); if (P.stage) ret(P.stage);
      const ready = c => { if (c._noRefreshSeq === G.turnSeq) { c._noRefreshSeq = null; return; } if (c.frozen) { c.frozen = false; } else c.rested = false; }; // _noRefreshSeq=このリフレッシュではアクティブにしない（OP08ミンク族/OP07-059フォクシー）
      ready(P.leader); P.chars.forEach(ready); if (P.stage) P.stage.rested = false;
      expireBuffs(side, 'ownerNextStart');
      expireBuffs(side, 'oppNextEnd'); // 「次の相手のエンドフェイズ終了時まで」のパワー付与は所有者の次ターン開始で失効
      // 「相手の次のターン終了時まで」付与（エネルのブロッカー等）は所有者の次ターン開始で失効
      const clrKw = c => { if (c) c.kwGrant = c.kwGrant.filter(g => g.dur !== 'oppNextEnd'); };
      clrKw(P.leader); P.chars.forEach(clrKw); if (P.stage) clrKw(P.stage);
      render(); await sleep(300);
      // ドロー
      setPhase('ドロー');
      if (!(P.turnsTaken === 1 && side === G.firstPlayer)) { if (!draw(side, 1)) { G.busy = false; return; } sfx('draw'); drawFly(side); }
      render(); await sleep(220);
      // ドン
      setPhase('ドン');
      let add = (P.turnsTaken === 1 && side === G.firstPlayer) ? 1 : 2;
      add = Math.min(add, P.donMax - donTotal(side));
      P.don.active += add;
      // ゴール・Ｄ・ロジャー(OP13-003): ドンフェイズに置かれるドン1枚をリーダーに付与（場にドンがある場合）
      if (!isNegated(P.leader) && P.leader.base.fx && P.leader.base.fx.static && P.leader.base.fx.static.some(o => o.op === 'donPhaseAttach') && P.don.active >= 1) { P.don.active--; P.leader.attachedDon++; flog(side, '【ロジャー】ドンフェイズのドン1枚をリーダーに付与'); }
      if (add > 0) sfx('don');
      render(); await sleep(260);
      // メイン
      setPhase('メイン');
      log(side, `${sideName(side)}のターン <b>(ターン${G.turnDisp})</b>`);
      banner((side === 'me' ? 'あなたのターン' : 'CPUのターン'), { cls: side === 'me' ? 'mine' : 'opp' });
      await checkTurnStart(side); // リーダーの【自分のターン開始時】（OP11-040ルフィ等）
      if (G.winner) return;
      if (P.isCPU) { await cpuTurn(side); await endTurn(side); }
      // 自分の手番開始時の自動 predictCPU(Claude) は廃止＝Claude呼び出しは「CPUの手番に1回」だけに集約（遅延/コスト削減）。
      // でんでん虫の予測はオンデマンド（ボタン）で predictCPU() を呼ぶ。
      else { G.busy = false; G.myActable = true; render(); }
    }
    async function endTurn(side) {
      G.myActable = false; setPhase('エンド');
      // 【自分のターン終了時】誘発（手番側のキャラ／リーダー）
      for (const c of [...G.players[side].chars, G.players[side].leader, G.players[side].stage]) {
        if (c && c.base.fx && c.base.fx.onTurnEnd && !isNegated(c)) { await fxNote(side, 'ターン終了時', c.base.name); await runFx(c.base.fx.onTurnEnd, { self: c, side }); }
      }
      // このターン終了時の donActivate（delayedDonActivate＝OP13-024/038）の消化
      { const P = G.players[side]; if (P._endDonActTurn === G.turnSeq && P._endDonActN) { const k = Math.min(P._endDonActN, P.don.rested); P.don.rested -= k; P.don.active += k; P._endDonActN = 0; if (k) { flog(side, `ターン終了時にドン${k}枚をアクティブにした`); render(); } } }
      // スケジュールされた「このターン終了時」効果（scheduleTurnEnd）
      if (G._pendingTurnEnd && G._pendingTurnEnd.length) { const pend = G._pendingTurnEnd; G._pendingTurnEnd = []; for (const pe of pend) { try { await runFx(pe.fx, { self: pe.self, side: pe.side }); } catch (e) { console.warn('pendingTurnEnd失敗', e); } } }
      // ブルック: デッキが0枚のままターン終了で敗北
      if (hasDeckOutDelay(side) && G.players[side].deck.length === 0) lose(side, 'デッキ切れ（ターン終了）');
      expireBuffs('me', 'turnEnd'); expireBuffs('cpu', 'turnEnd'); clearBattleBuffs(); clearTurnGrants(side); clearNegation();
      render(); await sleep(180);
      if (G.winner) { G.busy = false; return; }
      if (G._noChain) return;          // MCTSロールアウト中はターン連鎖を呼び出し側(playout)が制御（投げっぱなし連鎖の残留タスクを防ぐ）
      if (G._extraTurn === side) { G._extraTurn = null; flog(side, '追加のターンを開始'); beginTurn(side); return; } // 追加ターン（OP05-119ルフィ）
      beginTurn(opp(side));
    }
    function canAttackThisTurn(side) { return G.players[side].turnsTaken >= 2; } // 公式: 先攻・後攻とも最初の(自分の)1ターン目はアタック不可。2ターン目以降から可能
    function canCardAttack(card) {
      if (card.base.type !== 'LEADER' && card.base.type !== 'CHAR') return false; // アタックできるのはリーダー/キャラのみ（ステージ・イベントは不可）
      if (card.rested) return false;
      if (cantAttackNeg(card)) return false;
      if (card._atkTaxSeq != null && G.players[card.owner].hand.length < (card._atkTaxN || 2)) return false; // 攻撃税(OP08-043): 手札が足りず税を払えないキャラはアタック宣言できない
      if (isRestImmune(card)) return false; // 「レストにできない」＝アタック宣言できない（アタックはレストを伴う）
      if (!isNegated(card) && card.base.fx && card.base.fx.static && card.base.fx.static.some(o => o.op === 'cantAttack' && (!o.cond || checkCond(o.cond, card.owner, card)))) return false;
      for (const sd of ['me', 'cpu']) { const PP = G.players[sd]; if (!PP) continue; for (const src of [PP.leader, ...PP.chars]) { if (!src || isNegated(src)) continue; const ss = src.base.fx && src.base.fx.static; if (!ss) continue; for (const o of ss) { if (o.op === 'globalAttackBan' && (!o.cond || checkCond(o.cond, src.owner, src)) && matchFilter(card, o.filter || {})) return false; } } } // 盤面全体へのアタック禁止（P-084バギー） // 「このリーダー/キャラはアタックできない」常在（cond対応＝OP11-058ルフィ手札5以上。効果無効中は解除＝OP14-056ワダツミの自身無効コンボ）
      if (card.owner !== G.active) return false;
      if (!canAttackThisTurn(card.owner)) return false;
      if (card.base.type === 'CHAR' && card.summonedTurn === G.turnSeq && !hasKw(card, 'rush') && !hasKw(card, 'rushChar')) return false;
      return true;
    }
    // 速攻：キャラ は登場ターンにリーダーへアタック不可（通常の速攻/2ターン目以降は可）
    function canTargetLeader(attacker) {
      if (attacker.base.type === 'CHAR' && attacker.summonedTurn === G.turnSeq && hasKw(attacker, 'rushChar') && !hasKw(attacker, 'rush')) return false;
      if (G.players[attacker.owner] && G.players[attacker.owner]._cantAttackLeaderTurn === G.turnSeq) return false; // このターンはリーダーにアタックできない（OP06-026コウシロウ）
      return true;
    }
    function legalTargets(side, attacker) { // side=attacker側。attacker指定時は対象制限を反映
      const D = G.players[opp(side)]; const arr = (attacker && !canTargetLeader(attacker)) ? [] : [D.leader];
      const canActive = attacker && hasKw(attacker, 'attackActive'); // 「アクティブのキャラにもアタックできる」(OP11海軍/SWORD)
      for (const c of D.chars) if (c.rested || canActive) arr.push(c);
      // タウント: レストのタウント持ちキャラがいる場合、キャラ対象はそのキャラのみ（リーダーは通常通り。P-067キッド「このキャラがレストの場合、相手はキッド以外にアタックできない」）
      const taunts = D.chars.filter(c => c.rested && !isNegated(c) && c.base.fx && c.base.fx.static && c.base.fx.static.some(o => o.op === 'taunt'));
      if (taunts.length) return arr.filter(t => t === D.leader || taunts.includes(t));
      return arr;
    }

    /* =========================================================================
       バトル解決
       ========================================================================= */
    async function luffyReveal(eventSide) {
      // 「相手がイベントかブロッカーを発動した時」: eventSide が発動した側。反応するルフィはその相手側のOP15-119
      const lSide = opp(eventSide); const P = G.players[lSide];
      const luffys = P.chars.filter(c => c.base && c.base.no === 'OP15-119');
      if (!luffys.length || !P.life.length) return;
      const top = P.life[0]; const cost = top.base.cost || 0;
      flog(lSide, `【ルフィ】相手の効果に反応しライフ上を公開:「${top.base.name}」(コスト${cost}) → 各ルフィ+${cost * 1000}`);
      if (cost > 0) { for (const l of luffys) { addBuff(l, cost * 1000, 'turnEnd'); floatOn(l.uid, `+${cost * 1000}`, 'buff'); } render(); await sleep(220); }
    }
    async function declareAttack(attacker, target) {
      G.busy = true; G.pendingChoice = null; G.attackSel = null;
      // 攻撃税（OP08-043ニューゲート）: このアタッカーに税(手札N捨て)が付いていれば、払えない/払わなければアタック不可（レスト前に判定）
      if (attacker._atkTaxSeq != null) {
        const AP = G.players[attacker.owner], taxN = attacker._atkTaxN || 2;
        let paid = AP.hand.length >= taxN;
        if (paid && !AP.isCPU) paid = await confirmUse(attacker.owner, '攻撃税', `手札${taxN}枚を捨ててアタックしますか？（捨てないとアタックできません）`, '捨てて攻撃', undefined, { cls: 'danger' });
        if (!paid) { flog(attacker.owner, `攻撃税(手札${taxN}捨て)を払えず/払わずアタック中止`); if (AP.isCPU) { G.busy = true; } else { G.busy = false; G.myActable = true; } render(); return; }
        if (AP.isCPU) { const disc = AP.hand.slice().sort((a, b) => ((a.base.counter || 0) - (b.base.counter || 0)) || ((a.base.cost || 0) - (b.base.cost || 0))).slice(0, taxN); for (const c of disc) { AP.hand.splice(AP.hand.indexOf(c), 1); AP.trash.push(reset(c)); } }
        else { for (let i = 0; i < taxN; i++) { const c = await chooseFromHand(attacker.owner, AP.hand, `⚠ 攻撃税で捨てる（${i + 1}/${taxN}）`, null, false, 'danger'); if (!c) break; AP.hand.splice(AP.hand.indexOf(c), 1); AP.trash.push(reset(c)); } }
        flog(attacker.owner, `攻撃税: 手札${taxN}枚を捨てた`); await fireHandDiscarded(attacker.owner, taxN);
      }
      attacker.rested = true;
      const aSide = attacker.owner, dSide = opp(aSide);
      if (attacker.base.type === 'LEADER' && target && target.base.type === 'CHAR') G.players[aSide]._leaderBattledTurn = G.turnSeq; // リーダーが相手キャラとバトル（OP12-020ゾロLの起動メイン条件）
      // リーダーの onLeaderAttack: このリーダーがアタックした時（vsLeaderで相手リーダー限定。cond対応。OP12-081コアラL）
      if (attacker.base.type === 'LEADER' && attacker.base.fx && attacker.base.fx.onLeaderAttack && !isNegated(attacker)) { const cfg = attacker.base.fx.onLeaderAttack; if ((!cfg.vsLeader || (target && target.base.type === 'LEADER')) && (!cfg.cond || checkCond(cfg.cond, aSide, attacker))) await runFx(cfg.fx, { self: attacker, side: aSide }); }
      // 【自分のターン中】このキャラがレストになった時（アタックでレスト）の誘発
      if (attacker.base.fx && attacker.base.fx.onSelfRested && !isNegated(attacker) && aSide === G.active) { await fxNote(aSide, 'レスト時', attacker.base.name); await runFx(attacker.base.fx.onSelfRested, { self: attacker, side: aSide }); }
      flog(aSide, `「${attacker.base.name}」が${target.base.type === 'LEADER' ? 'リーダー' : '「' + target.base.name + '」'}にアタック`);
      showAtkAnnounce(aSide, attacker, target);
      render(); animClass(attacker.uid, 'lunge' + (aSide === 'me' ? '' : ' up')); sfx('attack'); await sleep(aSide === 'me' ? 280 : 780);
      // アタック時効果
      if (attacker.base.fx && attacker.base.fx.onAttack && !isNegated(attacker)) {
        const onceGated = attacker.base.fx.onAttack.some(o => o.once === 'turn'); // 【アタック時】/【ブロック時】【ターン1回】は両タイミング共有(_onceAtkBlkTurn)
        if (!(onceGated && attacker._onceAtkBlkTurn === G.turnSeq)) {
          if (onceGated) attacker._onceAtkBlkTurn = G.turnSeq;
          await fxNote(aSide, 'アタック時効果', attacker.base.name); await runFx(attacker.base.fx.onAttack, { self: attacker, side: aSide });
        }
      }
      if (!isNegated(G.players[aSide].leader)) await leaderOnAttack(attacker);
      // 【相手のアタック時】防御側キャラ＋リーダーの誘発（onceゲート: fx内のopに once:'turn' があればそのカードはターン1回）
      for (const c of [G.players[dSide].leader, ...G.players[dSide].chars]) {
        if (c.base.fx && c.base.fx.onOppAttack && !isNegated(c)) {
          const onceGated = c.base.fx.onOppAttack.some(o => o.once === 'turn');
          if (onceGated && c._oppAtkTurn === G.turnSeq) continue;
          const prevAtkTurn = c._oppAtkTurn;
          if (onceGated) c._oppAtkTurn = G.turnSeq;
          const octx = { self: c, side: dSide, attacker, target };
          await fxNote(dSide, '相手のアタック時', c.base.name); await runFx(c.base.fx.onOppAttack, octx);
          // 任意効果を見送った(コスト未払い/対象未選択/条件不成立)だけなら【ターン1回】を消費しない＝同ターンの後続アタックでも選べる
          if (onceGated && octx._declined && !octx._committed) c._oppAtkTurn = prevAtkTurn;
        }
      }
      { // 【相手のアタック時】防御側ステージ（ドレスローザ王国 等）の誘発
        const st = G.players[dSide].stage;
        if (st && st.base.fx && st.base.fx.onOppAttack && !isNegated(st)) {
          const onceGated = st.base.fx.onOppAttack.some(o => o.once === 'turn');
          if (!(onceGated && st._oppAtkTurn === G.turnSeq)) {
            const prevAtkTurn = st._oppAtkTurn;
            if (onceGated) st._oppAtkTurn = G.turnSeq;
            const octx = { self: st, side: dSide, attacker };
            await fxNote(dSide, '相手のアタック時', st.base.name); await runFx(st.base.fx.onOppAttack, octx);
            if (onceGated && octx._declined && !octx._committed) st._oppAtkTurn = prevAtkTurn;
          }
        }
      }
      // 防御側の効果でアタッカーが場を離れた/攻撃不能になった場合はアタックを中断
      if ((attacker.base.type === 'CHAR' && !G.players[aSide].chars.includes(attacker)) || cantAttackNeg(attacker)) {
        clearBattleBuffs(); G.players[dSide]._teachSacUid = null; G._counterRedirect = null; clearAtkAnnounce(); checkWinByLife(); // 対象変更予約も破棄（onOppAttackで立てた場合に次のアタックへ漏れる。ST36-005キッド）
        if (G.players[aSide].isCPU) { G.busy = true; } else { G.busy = false; G.myActable = true; } // ★状態確定後に描画（中断時も操作権を返す＝処理中固まり防止）
        render();
        return;
      }
      // 黒ひげ(ティーチ)リーダー: 手札のトリガーを捨ててアタック対象を変更
      if (!isNegated(G.players[dSide].leader)) { target = await teachRedirect(dSide, attacker, target); target = await leaderRedirect(dSide, attacker, target); G._atkTo = target.uid; }
      // ブロック
      let blkTarget = target;
      if (!(target.base.type === 'LEADER' && G.players[aSide].denyBlock) && !isUnblockable(attacker)) {
        const blocker = await chooseBlocker(dSide, attacker, target);
        if (blocker) {
          blocker.rested = true; blkTarget = blocker; G._atkTo = blocker.uid; flog(dSide, `「${blocker.base.name}」でブロック`); floatOn(blocker.uid, '🛡 BLOCK', 'buff'); sfx('block'); showAtkAnnounce(aSide, attacker, blocker); render(); await sleep(200); await luffyReveal(dSide);
          // ゴール・D・ロジャー(OP09-118): 相手が【ブロッカー】を発動した時、どちらかのライフが0なら自分の勝利
          if (!isNegated(attacker) && attacker.base.fx && attacker.base.fx.static && attacker.base.fx.static.some(o => o.op === 'winOnBlockLife0') && (G.players[aSide].life.length === 0 || G.players[dSide].life.length === 0)) { flog(aSide, '【ロジャー】相手のブロッカー発動時ライフ0で勝利'); lose(dSide, 'ロジャー: ブロッカー発動時ライフ0'); return; }
          // 【相手が【ブロッカー】を発動した時】アタック側キャラの誘発（OP15-119ルフィ=ライフ公開してコスト分+1000）
          for (const c of G.players[aSide].chars.slice()) { const cfg = c.base.fx && c.base.fx.onOppBlocker; if (!cfg || isNegated(c) || !G.players[aSide].chars.includes(c)) continue; if (cfg.once === 'turn') { if (c._oppBlockerTurn === G.turnSeq) continue; c._oppBlockerTurn = G.turnSeq; } await runFx(cfg.fx || cfg, { self: c, side: aSide }); }
          // 【ブロック時】(onBlock): ブロッカー宣言時に誘発（カウンター前）。fx未定義カードは無変化＝純粋に追加
          if (blocker.base.fx && blocker.base.fx.onBlock && !isNegated(blocker)) {
            const onceGated = blocker.base.fx.onBlock.some(o => o.once === 'turn'); // 【アタック時】/【ブロック時】【ターン1回】は両タイミング共有(_onceAtkBlkTurn)
            if (!(onceGated && blocker._onceAtkBlkTurn === G.turnSeq)) {
              if (onceGated) blocker._onceAtkBlkTurn = G.turnSeq;
              await fxNote(dSide, 'ブロック時効果', blocker.base.name); flog(dSide, `【ブロック時】「${blocker.base.name}」`);
              await runFx(blocker.base.fx.onBlock, { self: blocker, side: dSide, attacker });
            }
          }
        }
      }
      // カウンター
      await counterStep(dSide, attacker, blkTarget);
      if (G._counterRedirect) { blkTarget = G._counterRedirect; G._counterRedirect = null; G._atkTo = blkTarget.uid; flog(dSide, `アタック対象を「${blkTarget.base.name}」に変更`); render(); } // カウンターイベントの対象変更（EB01-038オカマ道）
      // ダメージ判定（カウンター後の最終パワーをアナウンスに反映）
      const atkP = power(attacker), defP = power(blkTarget);
      if (document.getElementById('atkAnnounce')) showAtkAnnounce(aSide, attacker, blkTarget);
      flog(aSide, `パワー ${atkP} vs ${defP}`);
      if (atkP >= defP) {
        if (blkTarget.base.type === 'LEADER') {
          const dbl = hasKw(attacker, 'doubleAttack') ? 2 : 1;
          const banish = hasKw(attacker, 'banish');
          await dealLeaderDamage(dSide, attacker, dbl, banish);
        } else {
          let bkoSubbed = false; // EB02-030: このターン中、バトルKOの代わりに手札1枚を捨てられる
          { const DP = G.players[blkTarget.owner];
            if (DP._battleKoSubSeq === G.turnSeq && DP.hand.length) {
              let pay;
              if (DP.isCPU) pay = (blkTarget.base.cost || 0) >= 3 && DP.hand.length >= 2;
              else pay = !!(await confirmUse(blkTarget.owner, '身代わり', `「${blkTarget.base.name}」のバトルKOの代わりに手札1枚を捨てますか？`, '捨てて守る'));
              if (pay) { let dc; if (DP.isCPU) dc = DP.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0]; else dc = await chooseFromHand(blkTarget.owner, DP.hand, '捨てるカードを選択'); if (dc) { DP.hand.splice(DP.hand.indexOf(dc), 1); DP.trash.push(reset(dc)); flog(blkTarget.owner, `手札1枚を捨てて「${blkTarget.base.name}」を守った`); bkoSubbed = true; } }
            } }
          if (!bkoSubbed && !(await protectFromEffect(blkTarget, 'battle', attacker))) { animClass(blkTarget.uid, 'shake'); await sleep(180); await koCard(blkTarget, 'battle'); } // includeBattle の身代わりがあればバトルKOを肩代わり（attacker=属性条件バトル耐性のsource）
        }
      } else {
        flog(aSide, `アタック失敗`); floatOn(blkTarget.uid, 'GUARD', 'buff');
      }
      clearBattleBuffs();
      G.players[dSide]._teachSacUid = null;
      clearAtkAnnounce();
      checkWinByLife();
      // バトル終了時フック（ST08-013ボン・クレー「相手のキャラとバトルしたバトル終了時」）: アタッカー生存かつ最終対象がキャラの時のみ
      if (!G.winner && blkTarget && blkTarget.base.type === 'CHAR' && (attacker === G.players[aSide].leader || G.players[aSide].chars.includes(attacker)) && attacker.base.fx && attacker.base.fx.onBattleEndVsChar && !isNegated(attacker)) {
        const beCfg = attacker.base.fx.onBattleEndVsChar;
        const beOnce = Array.isArray(beCfg) && beCfg.some(x => x.once === 'turn');
        if (!(beOnce && attacker._battleEndTurn === G.turnSeq)) {
          if (beOnce) attacker._battleEndTurn = G.turnSeq;
          await runFx(beCfg, { self: attacker, side: aSide, target: blkTarget });
        }
      }
      // ★状態を確定してから描画（render後にbusyを戻すと「処理中」表示のまま固まる＝アタック後ターン終了不能バグ）
      if (G.players[aSide].isCPU) { G.busy = true; } else { G.busy = false; G.myActable = true; }
      render();
    }

    async function dealLeaderDamage(dSide, attacker, times, banish) {
      const D = G.players[dSide];
      for (let t = 0; t < times; t++) {
        if (G.winner) return; // 勝敗確定後は追加ダメージ解決を打ち切る
        animClass(D.leader.uid, 'dmg'); spawnAt(D.leader.uid, 'slash'); shakeScreen(); floatOn(D.leader.uid, '-1', 'dmg'); sfx('hit');
        if (t > 0) { floatOn(D.leader.uid, '×' + (t + 1) + ' COMBO!', 'dmg'); shakeScreen(); } // ダブルアタック2発目以降のコンボ強調
        await sleep(300);
        if (D.life.length === 0) { await lethalFx(dSide); lose(dSide, 'ライフ0で被弾'); return; } // ★トドメ＝リーサル演出（webが実装・headlessはno-op）
        const card = D.life.shift();
        const fu2b = card._faceUp && !isNegated(D.leader) && D.leader.base.fx && D.leader.base.fx.static && D.leader.base.fx.static.some(x => x.op === 'faceUpLifeToDeckBottom'); // ST13-003ルフィL
        if (banish) { D.trash.push(reset(card)); flog(dSide, 'ライフ1枚がバニッシュ（トラッシュ）'); }
        else if (fu2b) { D.deck.push(reset(card)); flog(dSide, '表向きのライフはデッキの下に置かれた'); await fireLifeLeft(dSide); render(); continue; }
        else if (card.base.fx && card.base.fx.trigger) {
          clearAtkAnnounce();                            // ★トリガー＝このアタックは解決済み。アタック宣言表示は消す
          await triggerReveal(dSide, card);              // ★ライフ公開の派手な演出（カード大写し）
          const use = await askTrigger(dSide, card);      // 人間: 演出のカード大写しを背後に残したまま選択
          clearTriggerReveal();                           // 選択直後に閉じる（trigger効果の対象選択で盤面を隠さない）
          if (use) { sfx('trigger'); await fxNote(dSide, 'トリガー発動', card.base.name, card.base.no); flog(dSide, `【トリガー】「${card.base.name}」発動`); await runFx(card.base.fx.trigger, { self: card, side: dSide }); if (!D.chars.includes(card) && !D.hand.includes(card) && !D.life.includes(card)) D.trash.push(reset(card)); await fireOnTrigger(dSide); }
          else { D.hand.push(card); flog(dSide, 'ライフ1枚を手札に'); }
        } else { D.hand.push(card); flog(dSide, 'ライフ1枚を手札に'); }
        await fireLifeLeft(dSide); // ライフが手札等へ離れた時（OP12-099カルガラ）
        await checkLeaderHitLife(attacker); // このリーダーのアタックでライフダメージ（ナミ等：自分のデッキを削る）
        await checkLifeZero(dSide);          // ライフが0になった時（エネル等：デッキからライフ補充）
        await leaderOnDamage(dSide);
        render(); await sleep(120);
      }
    }
    function checkWinByLife() { /* 敗北はdealLeaderDamage内のlife0被弾で確定。ここでは予備 */ }

    /* ---------- ブロッカー選択 ---------- */
    async function chooseBlocker(dSide, attacker, target) {
      const D = G.players[dSide];
      const blockers = D.chars.filter(c => !c.rested && hasKw(c, 'blocker') && c.noBlockSeq !== G.turnSeq && !isRestImmune(c)); // 【ブロッカー】発動不可/レストにできない中は除外
      if (blockers.length === 0) return null;
      if (D.isCPU) return cpuChooseBlocker(dSide, attacker, target, blockers);
      // 人間: ブロッカーをボタンとして提示（カードクリックでも選択可）
      return await new Promise(res => {
        const uids = new Set(blockers.map(c => c.uid));
        G.pendingChoice = { uids, optional: true, side: dSide, cands: blockers, res: c => { G.pendingChoice = null; res(c); } };
        render();
        const opts = blockers.map(b => ({ t: b.base.name, v: 'blk:' + b.uid, card: { no: b.base.no, sub: '🛡 P' + power(b) } }));
        opts.push({ t: 'ブロックしない', v: '__skip', ghost: true });
        showPrompt({
          side: dSide, cls: 'defense', title: '🛡 ブロック — あなたの防御', text: 'ブロッカーで肩代わりできます',
          opts, onPick: v => {
            if (!G.pendingChoice) return;
            if (v === '__skip') { G.pendingChoice.res(null); }
            else if (typeof v === 'string' && v.indexOf('blk:') === 0) { const u = +v.slice(4); const bc = blockers.find(x => x.uid === u); G.pendingChoice.res(bc || null); }
          }
        });
      });
    }
    function cpuChooseBlocker(dSide, attacker, target, blockers) {
      const D = G.players[dSide];
      const atkP = power(attacker);
      const dbl = hasKw(attacker, 'doubleAttack');
      const survive = blockers.filter(b => power(b) > atkP).sort((a, b) => power(a) - power(b)); // 生き残れるブロッカー(小さい順=温存)
      const safeMin = survive[0];
      const onlyOne = blockers.length === 1;
      if (target.base.type === 'LEADER') {
        if (D.life.length <= (dbl ? 2 : 1)) return safeMin || blockers.sort((a, b) => power(b) - power(a))[0]; // 致死回避は最優先
        if (safeMin) {
          if (onlyOne && D.life.length <= 2) return null;   // 最後の1体は致死回避用に温存
          if (D.life.length <= 3) return safeMin;           // ライフを守りたい局面は無償の有利ブロック（相手のアタック1回を消す）
          return null;                                      // ライフに余裕→受けてドロー
        }
        if (D.life.length <= 2) return blockers.sort((a, b) => power(b) - power(a))[0]; // 生存不可でも相打ち覚悟で止める
        return null;
      }
      // キャラが攻撃された：自分が安全な時だけ、高価値キャラを生存ブロッカーで無償肩代わり（ブロッカーはリーダー防御に温存）
      const safe = D.life.length - incomingLeaderDmg(dSide, attacker) >= 2;
      if (safe && safeMin && scoreChar(target) >= 9) {
        if (onlyOne && D.life.length <= 2) return null;
        return safeMin;
      }
      return null;
    }

    /* ---------- カウンターステップ ---------- */
    // 手札のカードの実効カウンター値（盤面の handCounterBuff static を加味。例: 手札のP8000キャラのカウンター+2000）
    function counterVal(c, side) {
      let v = c.base.counter || 0;
      for (const src of [G.players[side].leader, ...G.players[side].chars]) { if (!src || isNegated(src)) continue; const st = src.base.fx && src.base.fx.static; if (!st) continue; for (const o of st) { if (o.op === 'handCounterBuff' && matchFilter(c, o.filter || {})) v += o.amount || 0; } }
      return v;
    }
    async function counterStep(dSide, attacker, target) {
      const D = G.players[dSide];
      if (D.isCPU) { await cpuCounter(dSide, attacker, target); return; }
      // AI助言（aiOn時のみ・このカウンター局面で1回だけ。フローはブロックするが失敗しても続行）
      const advice = await defenseAdvice(dSide, 'カウンター', '「' + attacker.base.name + '」P' + power(attacker) + ' ⚔ 防御側 P' + power(target));
      // 人間: カウンター可能カードを繰り返し選ばせる
      while (true) {
        const counters = D.hand.filter(c => (counterVal(c, dSide) > 0) || (c.base.fx && c.base.fx.counter));
        // ルーシー/エース等リーダー反応
        const leaderOpts = defenderLeaderReactionOpts(dSide, attacker, target);
        if (counters.length === 0 && leaderOpts.length === 0) return;
        const need = power(attacker) - power(target);
        const opts = [];
        counters.slice(0, 10).forEach((c) => {
          const isEvent = !!(c.base.fx && c.base.fx.counter);
          const cost = c.base.cost || 0;
          const unaff = isEvent && cost > 0 && D.don.active < cost; // 支払えないカウンターイベントは選択不可に
          opts.push({
            t: c.base.name, v: 'c' + D.hand.indexOf(c), disabled: unaff, ghost: unaff,
            card: { no: c.base.no, sub: counterVal(c, dSide) ? ('+' + counterVal(c, dSide)) : (isEvent ? (unaff ? ('要' + cost) : '効果') : '') }
          });
        });
        leaderOpts.forEach(lo => opts.push(lo));
        opts.push({ t: 'カウンター終了', v: '__done', primary: true });
        const v = await new Promise(res => showPrompt({
          side: dSide, cls: 'defense',
          title: '🛡 カウンター — あなたの防御',
          text: (need < 0 ? '<b style="color:var(--legal-glow)">現在は耐えています</b>' : `<b style="color:var(--danger-glow)">あと +${need + 1000} 必要</b>`) + advice,
          opts, onPick: res
        }));
        if (v === '__done') return;
        if (v && v.startsWith('c')) {
          const c = D.hand[parseInt(v.slice(1))];
          if (!c) continue;
          if (c.base.fx && c.base.fx.counter) {
            if ((c.base.cost || 0) > 0 && !payDon(dSide, c.base.cost)) { toast('ドンが足りません'); continue; }
            D.hand.splice(D.hand.indexOf(c), 1);
            sfx('counter');
            await runFx(c.base.fx.counter.fx, { self: c, side: dSide, target });
            D.trash.push(reset(c)); flog(dSide, `カウンター「${c.base.name}」`);
            if (c.base.type === 'EVENT') await luffyReveal(dSide);
          } else {
            const cv = counterVal(c, dSide);
            D.hand.splice(D.hand.indexOf(c), 1);
            addBuff(target, cv, 'battle'); floatOn(target.uid, `+${cv}`, 'buff');
            sfx('counter'); animClass(target.uid, 'counterflash'); // カウンターの見せ場（青防壁フラッシュ）
            D.trash.push(reset(c)); flog(dSide, `手札からカウンター +${cv}`);
          }
          render();
        } else if (v === '__lucy') { await lucyCounter(dSide, target); }
      }
    }
    // 【エース】相手のアタック時の手札1枚捨て→相手-2000 は fx.onOppAttack(OP13-002)が担当（人間=宣言時に選択）。
    // CPUだけは fx を cpuSkip し、下の aceCounter を賢く（生存に必要な時のみ）使う。二重発動を避けるため人間用の counter-step オプションは持たない。
    function defenderLeaderReactionOpts(dSide, attacker, target) {
      const D = G.players[dSide]; const out = [];
      if (isNegated(D.leader)) return out;
      if (D.leader.base.leader === 'lucy' && target.uid === D.leader.uid) {
        const ev = D.hand.filter(c => c.base.type === 'EVENT' || c.base.type === 'STAGE');
        if (ev.length) out.push({ t: `【ルーシー】イベント/ステージを捨て+1000`, v: '__lucy' });
      }
      return out;
    }
    async function lucyCounter(dSide, target) {
      // 公式: 手札のイベント/ステージを「任意の枚数」捨ててよい。捨てた1枚につきこのバトル中+1000
      const D = G.players[dSide]; let n = 0; const cpuCap = 2; // CPUは手札全捨て防止に上限
      while (true) {
        if (D.isCPU && n >= cpuCap) break;
        const ev = D.hand.filter(c => c.base.type === 'EVENT' || c.base.type === 'STAGE');
        if (!ev.length) break;
        const c = await chooseFromHand(dSide, ev, '捨てるイベント/ステージを選択（任意・複数可・1枚ごとに+1000）', null, true);
        if (!c) break;
        D.hand.splice(D.hand.indexOf(c), 1); D.trash.push(reset(c)); addBuff(target, 1000, 'battle'); floatOn(target.uid, '+1000', 'buff'); n++; flog(dSide, '【ルーシー】+1000'); render();
      }
    }
    async function aceCounter(dSide, attacker) {
      const D = G.players[dSide];
      if (D.hand.length === 0) return;
      const c = await chooseFromHand(dSide, D.hand, '捨てる手札を選択');
      if (c) { D.hand.splice(D.hand.indexOf(c), 1); D.trash.push(reset(c)); addBuff(attacker, -2000, 'battle'); floatOn(attacker.uid, '-2000', 'dmg'); D._aceCounterTurn = G.turnSeq; flog(dSide, '【エース】相手-2000'); render(); }
    }
    // カウンターイベント/【カウンター】効果が戦闘にもたらすパワー差の見積もり（自分+ / 相手- を加算）
    function counterEventValue(side, fxArr) {
      let v = 0;
      for (const o of (fxArr || [])) {
        if (o.op === 'counterBuff') v += (o.amount || 0);
        else if (o.op === 'powerMod' && o.side === 'opp' && (o.amount || 0) < 0) v += -(o.amount);
        else if (o.op === 'cond' && checkCond(o.check, side, G.players[side].leader)) v += counterEventValue(side, o.then);
      }
      return v;
    }
    // 相手の残り攻撃源が今ターンにリーダーへ与えうる最大ダメージ概算（召喚酔い=当ターン攻撃不可は除外／ダブルアタック=2／現アタッカー除外）
    function incomingLeaderDmg(dSide, attacker) {
      const A = G.players[opp(dSide)];
      return [A.leader, ...A.chars]
        .filter(c => !c.rested && c !== attacker && !(c.base.type === 'CHAR' && c.summonedTurn === G.turnSeq && !hasKw(c, 'rush')))
        .reduce((s, c) => s + (hasKw(c, 'doubleAttack') ? 2 : 1), 0);
    }
    async function cpuCounter(dSide, attacker, target) {
      const D = G.players[dSide], A = G.players[opp(dSide)];
      if (D._teachSacUid && target.uid === D._teachSacUid) return; // 誘発目的で引き込んだキャラは守らない
      if (power(attacker) - power(target) < 0) return; // 既に耐える
      const isLeader = target.base.type === 'LEADER';
      const dbl = hasKw(attacker, 'doubleAttack');
      // === このアタックを防ぐ価値を決める（過剰防御=ハンド枯渇を避ける／指摘1対策） ===
      let mode = 'skip', maxCards = 1, allowBig = false; // skip=素受け / efficient=最小カードで守る / survival=致死回避で総動員
      const incoming = incomingLeaderDmg(dSide, attacker); // 今ターンの残り被弾(概算)
      if (isLeader) {
        const lifeAfter = D.life.length - (dbl ? 2 : 1);
        if (lifeAfter < 0 || (lifeAfter <= 1 && incoming >= 1)) mode = 'survival';
        // 残りライフ1：致死でなくても、止められるなら確実に守る（最後のライフを安売りしない）
        else if (lifeAfter <= 1) { mode = 'efficient'; maxCards = 2; allowBig = true; }
        // 中盤ライフ2-3＋手札に余裕：1枚で効率的に止められるリーダーアタックは受け止める
        // （素受けしすぎ＝指摘3対策。止められない/小さすぎるアタックはefficientが自動でskip＝手札は浪費しない）
        else if (lifeAfter <= 3 && D.hand.length >= 3) { mode = 'efficient'; maxCards = 1; allowBig = true; }
        else mode = 'skip'; // 高ライフ(4+)→素受け（実質ドロー）でカウンター温存
      } else {
        // 自分が今ターン負けそうな時は、キャラを守るためにカウンターを切らない（手札は致死回避＝リーダー防御へ温存）
        const safe = D.life.length - incoming >= 2; // 残りの被弾を最大で食らってもライフが2枚以上残るか
        const sc = scoreChar(target); // キャラの価値。低価値は見捨てる
        if (!safe) mode = 'skip';                                    // 致死圏：キャラは見捨て、カウンターはリーダー防御へ温存
        else if (sc >= 11) { mode = 'efficient'; maxCards = 2; allowBig = true; }
        else if (sc >= 8) { mode = 'efficient'; maxCards = 1; allowBig = false; }
        else mode = 'skip';
      }
      if (mode === 'skip') return;
      const cval = (c) => counterVal(c, dSide); // 盤面のhandCounterBuffを加味した実効カウンター
      const applyNum = async (c) => { const cv = cval(c); D.hand.splice(D.hand.indexOf(c), 1); addBuff(target, cv, 'battle'); D.trash.push(reset(c)); floatOn(target.uid, `+${cv}`, 'buff'); sfx('counter'); animClass(target.uid, 'counterflash'); flog(dSide, `CPUカウンター +${cv}`); await sleep(140); };
      // === efficient: 最小枚数・余剰最小でちょうど耐える（+2000級は致死ターン用に温存） ===
      if (mode === 'efficient') {
        const need = power(attacker) - power(target);
        let numeric = D.hand.filter(c => cval(c) > 0);
        if (!allowBig) numeric = numeric.filter(c => cval(c) < 2000);
        const asc = numeric.slice().sort((a, b) => cval(a) - cval(b));
        const single = asc.find(c => cval(c) > need); // 1枚で耐えられる最小カード
        let plan;
        if (single) plan = [single];
        else { plan = []; let s = 0; for (const c of asc.slice().reverse()) { if (s > need) break; plan.push(c); s += cval(c); } }
        const total = plan.reduce((s, c) => s + cval(c), 0);
        if (total > need && plan.length <= maxCards) { for (const c of plan) await applyNum(c); render(); }
        return; // 賄えない/枚数超過なら見捨てる（受け）
      }
      // === survival: 致死回避。まず到達可能な最大防御で「耐えられるか」を判定し、無理なら手札を浪費せず素受け ===
      const need0 = power(attacker) - power(target);
      const evList = D.hand.filter(c => c.base.fx && c.base.fx.counter)
        .map(c => ({ c, cost: (c.base.fx.counter.cost != null ? c.base.fx.counter.cost : (c.base.cost || 0)), val: counterEventValue(dSide, c.base.fx.counter.fx) }))
        .filter(x => x.val > 0 && (x.cost === 0 || D.don.active >= x.cost));
      const numSum = D.hand.reduce((s, c) => s + (cval(c) > 0 ? cval(c) : 0), 0);
      const evSum = evList.reduce((s, x) => s + x.val, 0);
      const lucyVal = (!isNegated(D.leader) && D.leader.base.leader === 'lucy' && isLeader && D.hand.some(c => c.base.type === 'EVENT' || c.base.type === 'STAGE')) ? 1000 : 0;
      const aceVal = (!isNegated(D.leader) && D.leader.base.leader === 'ace' && D.hand.length > 0 && D._aceCounterTurn !== G.turnSeq) ? 2000 : 0;
      if (numSum + evSum + lucyVal + aceVal <= need0) return; // どう足掻いても止められない→手札を温存して素受け
      // ★E40(heur3): 地平線をこの相手ターン全体へ拡張＝「このアタックを止めても(A)/受けても(B)、残りの攻撃で確実に死ぬ」なら
      //   1枚も切らず温存（どのみち負ける列に壁を捨てない）。判定は防御楽観(最小付与前提・壁の最適割当)＝保守側。既定エージェント不変。
      if (typeof isThreatAware === 'function' && isThreatAware(dSide) && thrOn('counter') && typeof assessThreat === 'function') {
        const hitsThis = dbl ? 2 : 1, costThis = need0 + 1000;
        const wallAll = numSum + evSum + lucyVal + aceVal;
        const tA = assessThreat(dSide, 'now', { wallOverride: Math.max(0, wallAll - costThis) }); // 止めた後の残り攻撃
        const tB = assessThreat(dSide, 'now', { wallOverride: wallAll });                          // 受けた場合の残り攻撃
        const lethalLine = D.life.length + 1;
        if (tA.effHits >= lethalLine && tB.effHits + hitsThis >= lethalLine) return;
      }
      // 数値カウンターを最小枚数で（1枚で耐えられるなら最小の1枚／足りなければ大きい順に最小枚数）
      const ascN = D.hand.filter(c => cval(c) > 0).sort((a, b) => cval(a) - cval(b));
      const singleN = ascN.find(c => cval(c) > need0);
      if (singleN) { await applyNum(singleN); render(); return; }
      for (const c of ascN.slice().reverse()) { if (power(attacker) - power(target) < 0) break; await applyNum(c); }
      // 数値で足りなければカウンターイベント→リーダー反応も総動員
      if (power(attacker) - power(target) >= 0) {
        for (const x of evList.sort((a, b) => a.cost - b.cost || b.val - a.val)) {
          if (power(attacker) - power(target) < 0) break;
          if (x.cost > 0 && D.don.active < x.cost) continue;
          if (x.cost > 0) payDon(dSide, x.cost);
          D.hand.splice(D.hand.indexOf(x.c), 1);
          await runFx(x.c.base.fx.counter.fx, { self: x.c, side: dSide, target });
          D.trash.push(reset(x.c)); flog(dSide, `CPUカウンター「${x.c.base.name}」`);
          if (x.c.base.type === 'EVENT') await luffyReveal(dSide);
          await sleep(140);
        }
      }
      if (power(attacker) - power(target) >= 0 && !isNegated(D.leader)) {
        if (D.leader.base.leader === 'lucy' && isLeader && D.hand.some(c => c.base.type === 'EVENT' || c.base.type === 'STAGE')) await lucyCounter(dSide, target);
        if (power(attacker) - power(target) >= 0 && D.leader.base.leader === 'ace' && D.hand.length > 0 && D._aceCounterTurn !== G.turnSeq) await aceCounter(dSide, attacker);
      }
      render();
    }
    async function askTrigger(side, card) {
      if (G.players[side].isCPU) {
        // ★E42b(heur2): 対象不在の除去系トリガーは空砲＝発動せず手札へ。既定CPUは従来どおり常に発動。
        if (typeof isHeur2 === 'function' && isHeur2(side) && h2On('trigger') && typeof triggerWorthUsing === 'function' && !triggerWorthUsing(side, card)) { flog(side, `【トリガー】対象なし→「${card.base.name}」を手札に`); return false; }
        return true; // CPUは基本発動
      }
      const advice = await defenseAdvice(side, 'トリガー発動', '「' + card.base.name + '」を発動 or 手札に加える');
      return await new Promise(res => showPrompt({
        side, cls: 'defense',
        title: '⚡ トリガー',
        text: `ライフから「${card.base.name}」が公開。【トリガー】を発動しますか？（不発なら手札に加わります）` + advice,
        opts: [{ t: '発動する', v: true, primary: true }, { t: '手札に加える', v: false, ghost: true }], onPick: res
      }));
    }

    /* =========================================================================
       リーダー固有ロジック
       ========================================================================= */
    async function leaderOnAttack(attacker) {
      const side = attacker.owner, P = G.players[side];
      if (P.leader.base.leader === 'lucy' && attacker.uid === P.leader.uid) {
        // 自分のアタック時もイベント/ステージ捨てで+1000（任意）
        const ev = P.hand.filter(c => c.base.type === 'EVENT' || c.base.type === 'STAGE');
        if (ev.length && !P.isCPU) {
          const v = await new Promise(res => showPrompt({
            side, title: '【ルーシー】', text: 'イベント/ステージを捨ててリーダー+1000しますか？',
            opts: [{ t: '捨てて+1000', v: true, primary: true }, { t: 'しない', v: false, ghost: true }], onPick: res
          }));
          if (v) await lucyCounter(side, P.leader);
        } else if (ev.length && P.isCPU && power(P.leader) < 7000) {
          await lucyCounter(side, P.leader);
        }
      }
    }
    /* 【ティーチ】相手のアタック時：手札のトリガー1枚を捨て、対象をリーダーか黒ひげキャラに変更（ターン1回） */
    async function teachRedirect(dSide, attacker, target) {
      const D = G.players[dSide];
      if (D.leader.base.leader !== 'teach' || D._teachRedirTurn === G.turnSeq) return target;
      const triggers = D.hand.filter(c => c.base.fx && c.base.fx.trigger);
      if (!triggers.length) return target;
      const atkP = power(attacker);
      const koBait = D.chars.filter(c => c !== target && (c.base.traits || []).includes('黒ひげ海賊団') && c.base.fx && c.base.fx.onKO && power(c) <= atkP && !isImmune(c)).sort((a, b) => power(a) - power(b))[0];
      const bhChars = D.chars.filter(c => c !== target && (c.base.traits || []).includes('黒ひげ海賊団'));
      const valid = [D.leader, ...bhChars];
      const consume = disc => { D.hand.splice(D.hand.indexOf(disc), 1); D.trash.push(reset(disc)); D._teachRedirTurn = G.turnSeq; };
      if (D.isCPU) {
        let dest = null;
        if (target.base.type === 'LEADER') { if (koBait && D.life.length >= 2) dest = koBait; }       // リーダーへの攻撃をKO時キャラに引き込み効果誘発
        else if (power(target) >= 7000 && D.life.length >= 3) dest = koBait || D.leader;               // 重要キャラを守る
        if (!dest) return target;
        const disc = triggers.sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0];
        consume(disc); if (dest === koBait) D._teachSacUid = koBait.uid;
        flog(dSide, `【ティーチ】「${disc.base.name}」を捨て、対象を「${dest.base.type === 'LEADER' ? 'リーダー' : dest.base.name}」へ変更`);
        render(); await sleep(220); return dest;
      }
      // 人間: リダイレクトが合法なら常に選択肢を提示（公式効果に対象の限定はない）。現在の対象自身は除外。
      const dests = [D.leader, ...D.chars.filter(c => (c.base.traits || []).includes('黒ひげ海賊団'))].filter(c => c !== target);
      if (!dests.length) return target;
      const opts = dests.map(c => ({ t: (c.base.type === 'LEADER' ? 'リーダーに変更' : c.base.name), v: 'rd:' + c.uid, card: { no: c.base.no, sub: 'P' + power(c) } }));
      opts.push({ t: '変更しない', v: '__no', ghost: true });
      const v = await showPrompt({ side: dSide, cls: 'defense', title: '🛡 【ティーチ】アタック対象を変更', text: '手札の【トリガー】1枚を捨て、このアタックの対象をリーダーか黒ひげ海賊団キャラに変更できます（ターン1回）', opts });
      if (!v || v === '__no') return target;
      const dest = dests.find(c => c.uid === +String(v).slice(3)); if (!dest) return target;
      const disc = await chooseFromHand(dSide, triggers, '捨てる【トリガー】カードを選択'); if (!disc) return target;
      consume(disc);
      flog(dSide, `【ティーチ】対象を「${dest.base.type === 'LEADER' ? 'リーダー' : dest.base.name}」へ変更`);
      render(); await sleep(180); return dest;
    }
    // 汎用リダイレクトリーダー（データ駆動）: リーダーの fx.onOppAttack に {op:'redirect', cost:{donMinus:N}, dest:{leader,traitIncludes/trait}, once} を持つ場合に
    // アタック対象をリーダー or 指定特徴キャラへ変更する（OP14-060ドフラミンゴ）。ティーチ(手札捨て)とは別経路。
    async function leaderRedirect(dSide, attacker, target) {
      const D = G.players[dSide]; const L = D.leader;
      if (isNegated(L)) return target;
      const cfg = L.base.fx && L.base.fx.onOppAttack;
      const rop = cfg && cfg.find ? cfg.find(o => o.op === 'redirect') : null;
      if (!rop) return target;
      const tk = '_leadRedirTurn';
      if (rop.once !== false && D[tk] === G.turnSeq) return target;
      const costDon = (rop.cost && rop.cost.donMinus) || 0;
      if (costDon && donTotal(dSide) < costDon) return target;
      const dst = rop.dest || {};
      const dests = [];
      if (dst.leader) dests.push(L);
      for (const c of D.chars) { if (c === target) continue; if (dst.traitIncludes && (c.base.traits || []).some(t => t.includes(dst.traitIncludes))) dests.push(c); else if (dst.trait && (c.base.traits || []).includes(dst.trait)) dests.push(c); }
      const valid = dests.filter(c => c !== target);
      if (!valid.length) return target;
      const pay = () => { let n = costDon; while (n-- > 0) { if (D.don.active > 0) D.don.active--; else if (D.don.rested > 0) D.don.rested--; } D[tk] = G.turnSeq; }; // ドン‼-N＝ドンデッキへ戻す
      if (D.isCPU) {
        let dest = null;
        if (target.base.type === 'CHAR' && (power(target) >= 5000 || (target.base.fx && (target.base.fx.onKO || target.base.fx.act || hasKw(target, 'blocker')))) && D.life.length >= 2 && valid.includes(L)) dest = L; // 重要キャラを守りライフで受ける
        if (!dest) return target;
        pay(); flog(dSide, `【${L.base.name}】ドン‼-${costDon}：アタック対象をリーダーへ変更`); render(); await sleep(200); return dest;
      }
      const opts = valid.map(c => ({ t: (c.base.type === 'LEADER' ? 'リーダーに変更' : c.base.name), v: 'rd:' + c.uid, card: { no: c.base.no, sub: 'P' + power(c) } }));
      opts.push({ t: '変更しない', v: '__no', ghost: true });
      const v = await showPrompt({ side: dSide, cls: 'defense', title: `🛡 【${L.base.name}】アタック対象を変更`, text: `ドン‼-${costDon}：アタックの対象をリーダーか${dst.traitIncludes || dst.trait || ''}キャラに変更できます（ターン1回）`, opts });
      if (!v || v === '__no') return target;
      const dest = valid.find(c => c.uid === +String(v).slice(3)); if (!dest) return target;
      pay(); flog(dSide, `【${L.base.name}】対象を「${dest.base.type === 'LEADER' ? 'リーダー' : dest.base.name}」へ変更`); render(); await sleep(180); return dest;
    }
    /* リーダー起動効果（ボタン）: エネルのみ実装 */
    async function leaderActivate(side) {
      const P = G.players[side]; const key = P.leader.base.leader;
      if (isNegated(P.leader)) { if (typeof toast === 'function') toast('リーダーの効果は無効化されている'); return; }
      if (key === 'enel') {
        if (P.turnsTaken < 2) { toast('第2ターン以降に使用可能です'); return; }
        if (P._enelUsedTurn === G.turnSeq) { toast('このターンは使用済みです'); return; }
        P._enelUsedTurn = G.turnSeq;
        await fxNote(side, '起動メイン（リーダー）', P.leader.base.name);
        // ① ドン!!デッキから1枚までをアクティブで追加し、さらに4枚までをレストで追加
        let room = Math.max(0, P.donMax - donTotal(side));
        const addA = Math.min(1, room); P.don.active += addA; room -= addA;
        const addR = Math.min(4, room); P.don.rested += addR;
        if (addA || addR) { floatOn(P.leader.uid, 'ドン+' + (addA + addR), 'buff'); flog(side, `【エネル】ドンデッキからアクティブ${addA}枚・レスト${addR}枚を追加`); }
        render(); await sleep(180);
        // ② 自分のキャラ1枚にレストのドン!!4枚までを付与
        if (P.chars.length) {
          let c, k;
          if (P.isCPU) {
            // ★CPU改良（測定駆動で検証・全6対面で+~6pt有意 p<0.0001）: 旧実装は cpuPick('ownBig')＝最大パワーを
            //   アタック可否を無視して選び、付与が当ターン死にしていた（アタック不可キャラへの付与）。
            //   → 当ターンにリーダーへアタックできる攻撃役を最優先し、付与で連結できる役を優先する。付与量は4のまま（連結=カウンター超えの信頼性）。
            const Lp = power(G.players[opp(side)].leader);
            const attackers = P.chars.filter(ch => canCardAttack(ch) && canTargetLeader(ch)); // 当ターン、相手リーダーを攻撃できる
            const pool = attackers.length ? attackers : (P.chars.filter(ch => canCardAttack(ch)).length ? P.chars.filter(ch => canCardAttack(ch)) : P.chars);
            c = pool.slice().sort((a, b) => {
              const okA = (Math.max(0, Lp - power(a)) <= P.don.rested) ? 0 : 1;   // 付与で連結できる=0(優先)
              const okB = (Math.max(0, Lp - power(b)) <= P.don.rested) ? 0 : 1;
              return okA - okB || power(b) - power(a);                            // 連結可能→高パワー順
            })[0];
          } else {
            c = await chooseCard(side, P.chars, 'レストのドンを付与するキャラ（最大4枚）', 'ownBig', true);
          }
          if (c) k = Math.min(4, P.don.rested);
          if (c && k) { c.attachedDon += k; P.don.rested -= k; floatOn(c.uid, 'ドン+' + k, 'buff'); donFly(side, c.uid); flog(side, `【エネル】「${c.base.name}」にレストのドン${k}枚を付与`); }
          else if (c) flog(side, '【エネル】付与できるレストのドンがなかった');
        } else if (!addA && !addR) { toast('ドンデッキが空でキャラもいないため効果なし'); }
        render();
      } else if (key === 'lucy') {
        // 【ルーシー】起動メイン【ターン1回】当ターンに元々コスト3以上のイベントを発動済なら1ドロー
        if (P._lucyDrawTurn === G.turnSeq) { toast('このターンは使用済みです'); return; }
        if (P._lucyEventTurn !== G.turnSeq) { toast('このターン、元々コスト3以上のイベントを発動していません'); return; }
        P._lucyDrawTurn = G.turnSeq;
        await fxNote(side, '起動メイン（リーダー）', P.leader.base.name);
        if (draw(side, 1)) { floatOn(P.leader.uid, 'DRAW', 'heal'); flog(side, '【ルーシー】1ドロー'); }
        render();
      } else if (P.leader.base.fx && P.leader.base.fx.act) {
        // データ駆動の番号キーリーダー起動メイン（OP14-001ロー/080モリア/020ミホーク等）。コストは {don,restSelf} を支払い、残りは act.fx 内のコストopで表現。
        const act = P.leader.base.fx.act; const c = act.cost || {};
        if (P.leader._actTurn === G.turnSeq) { toast('このターンは使用済みです'); return; }
        if (c.don && P.don.active < c.don) { toast('ドンが足りません'); return; }
        if (c.don) payDon(side, c.don);
        if (c.restSelf) P.leader.rested = true;
        P.leader._actTurn = G.turnSeq;
        flog(side, `「${P.leader.base.name}」の起動効果`);
        await fxNote(side, '起動メイン（リーダー）', P.leader.base.name);
        await runFx(act.fx, { self: P.leader, side }); render();
      } else {
        toast('このリーダーに起動効果はありません');
      }
    }
    /* リーダーの被ダメージ時効果（エース/ハンコック） */
    async function leaderOnDamage(side) {
      const P = G.players[side]; const key = P.leader.base.leader;
      if (key === 'ace') {
        if (P.leader.attachedDon >= 1 && P._aceDrawTurn !== G.turnSeq) { P._aceDrawTurn = G.turnSeq; if (draw(side, 1)) { floatOn(P.leader.uid, 'DRAW', 'heal'); flog(side, '【エース】ダメージを受けて1ドロー'); } }
      }
    }

