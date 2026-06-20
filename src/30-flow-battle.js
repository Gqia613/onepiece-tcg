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
      else sac = await chooseCard(side, P.chars, '場が5体です。トラッシュに送るキャラを選択', 'ownSmall', optional);
      if (!sac) return false; // 人間がキャンセル
      removeCharTo(sac, P.trash);
      flog(side, `「${sac.base.name}」をトラッシュに送った`);
      render();
      return true;
    }
    async function summon(side, card, noEnter, source) {
      const P = G.players[side];
      if (P.chars.length >= 5) { if (!(await trashCharForRoom(side, false))) return; } // 5体なら枠を空ける（効果による登場でも適用）
      card.owner = side; card.rested = false; card.summonedTurn = G.turnSeq; card.attachedDon = 0; card.buffs = []; card.kwGrant = [];
      P.chars.push(card);
      render(); animClass(card.uid, 'enter'); await sleep(260);
      flog(side, `「${card.base.name}」が登場`);
      // トラッシュから登場した時のリーダー誘発（onReviveFromTrash）— 登場時効果より先に付与
      if (source === 'trash') checkReviveTrigger(side, card);
      const hasEnter = !noEnter && card.base.fx && card.base.fx.onPlay && !isNegated(card);
      if (hasEnter) await fxNote(side, '登場時効果', card.base.name);
      else if (G.players[side].isCPU) await fxNote(side, '登場', card.base.name);
      if (hasEnter) await runFx(card.base.fx.onPlay, { self: card, side });
      // ナミ: キャラ登場時誘発
      if (P.leader.base.leader === 'nami' && side === G.active && !isNegated(P.leader)) await namiOnEnter(side);
      // ハンコック: 相手ターン中に自分のキャラが登場した時、1ドロー（ターン1回制限なし）
      if (P.leader.base.leader === 'hancock' && side !== G.active && !isNegated(P.leader)) { if (draw(side, 1)) { floatOn(P.leader.uid, 'DRAW', 'heal'); flog(side, '【ハンコック】相手ターン中のキャラ登場で1ドロー'); } }
      render();
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
    // リーダーの onAllyLeave: 自分の filter一致キャラが場を離れた時に誘発（once/cond対応）
    async function checkAllyLeave(side, card) {
      const L = G.players[side].leader;
      const cfg = !isNegated(L) && L.base.fx && L.base.fx.onAllyLeave;
      if (!cfg) return;
      if (cfg.filter && !matchFilter(card, cfg.filter)) return;
      if (cfg.cond && !checkCond(cfg.cond, side, L)) return;
      if (cfg.once === 'turn') { if (L._allyLeaveTurn === G.turnSeq) return; L._allyLeaveTurn = G.turnSeq; }
      await fxNote(side, 'キャラ離脱時', L.base.name);
      await runFx(cfg.fx, { self: L, side });
    }
    async function koCard(card, source) {
      const ow = G.players[card.owner];
      const idx = ow.chars.indexOf(card); if (idx < 0) return;
      animClass(card.uid, 'ko'); await sleep(420);
      ow.don.active += card.attachedDon; // 付与ドンはコストエリアへ
      removeChar(card); ow.trash.push(reset(card));
      card._koSource = source || 'effect'; // KO原因（'battle'|'oppEffect'|'effect'）。onKOの条件 koByOpp 用
      (G._koedThisTurn = G._koedThisTurn || {})[card.owner] = G.turnSeq; // このターンKOされた側を記録（oppCharKOedThisTurn条件用）
      flog(card.owner, `「${card.base.name}」がKO`);
      if (card.base.fx && card.base.fx.onKO && !isNegated(card)) { await fxNote(card.owner, 'KO時効果', card.base.name); await runFx(card.base.fx.onKO, { self: card, side: card.owner }); }
      await checkAllyLeave(card.owner, card); // 自分のキャラが場を離れた時のリーダー誘発
      render();
    }
    function bounceCard(card) { removeCharTo(card, G.players[card.owner].hand); }
    function removeChar(card) { const ow = G.players[card.owner]; const i = ow.chars.indexOf(card); if (i >= 0) ow.chars.splice(i, 1); if (ow.stage === card) ow.stage = null; }
    // キャラを場から取り除き、付与ドンを持ち主のアクティブに戻して destPile に裏向き(reset)で置く（除去/コスト/バウンス共通）
    function removeCharTo(card, destPile) { G.players[card.owner].don.active += card.attachedDon || 0; removeChar(card); destPile.push(reset(card)); }

    /* ---------- ドロー / 敗北 ---------- */
    // ブルック等「デッキ0でも即敗北せず、0枚になったターン終了時に敗北」
    function hasDeckOutDelay(side) { const L = G.players[side].leader; return !!(L && !isNegated(L) && L.base.fx && L.base.fx.static && L.base.fx.static.some(o => o.op === 'deckOutDelay')); }
    function draw(side, n) { const P = G.players[side]; for (let i = 0; i < n; i++) { if (P.deck.length === 0) { if (hasDeckOutDelay(side)) return false; lose(side, 'デッキ切れ'); return false; } P.hand.push(P.deck.shift()); } return true; }
    function lose(side, reason) {
      if (G.winner) return; G.winner = opp(side);
      const win = G.winner === 'me';
      log('sys', `${reason ? reason + ' — ' : ''}<b>${win ? 'あなたの勝ち！' : 'CPUの勝ち'}</b>`);
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
      P.don.active += P.don.rested; P.don.rested = 0;
      const ret = c => { P.don.active += c.attachedDon; c.attachedDon = 0; };
      ret(P.leader); P.chars.forEach(ret); if (P.stage) ret(P.stage);
      const ready = c => { if (c.frozen) { c.frozen = false; } else c.rested = false; };
      P.leader.rested = false; P.chars.forEach(ready); if (P.stage) P.stage.rested = false;
      expireBuffs(side, 'ownerNextStart');
      expireBuffs(side, 'oppNextEnd'); // 「次の相手のエンドフェイズ終了時まで」のパワー付与は所有者の次ターン開始で失効
      // 「相手の次のターン終了時まで」付与（エネルのブロッカー等）は所有者の次ターン開始で失効
      const clrKw = c => { if (c) c.kwGrant = c.kwGrant.filter(g => g.dur !== 'oppNextEnd'); };
      clrKw(P.leader); P.chars.forEach(clrKw); if (P.stage) clrKw(P.stage);
      render(); await sleep(300);
      // ドロー
      setPhase('ドロー');
      if (!(P.turnsTaken === 1 && side === G.firstPlayer)) { if (!draw(side, 1)) { G.busy = false; return; } }
      render(); await sleep(220);
      // ドン
      setPhase('ドン');
      let add = (P.turnsTaken === 1 && side === G.firstPlayer) ? 1 : 2;
      add = Math.min(add, P.donMax - donTotal(side));
      P.don.active += add;
      render(); await sleep(260);
      // メイン
      setPhase('メイン');
      log(side, `${sideName(side)}のターン <b>(ターン${G.turnDisp})</b>`);
      if (P.isCPU) { await cpuTurn(); await endTurn(side); }
      else { G.busy = false; G.myActable = true; render(); refreshHints(); }
    }
    async function endTurn(side) {
      G.myActable = false; setPhase('エンド');
      // 【自分のターン終了時】誘発（手番側のキャラ／リーダー）
      for (const c of [...G.players[side].chars, G.players[side].leader]) {
        if (c && c.base.fx && c.base.fx.onTurnEnd && !isNegated(c)) { await fxNote(side, 'ターン終了時', c.base.name); await runFx(c.base.fx.onTurnEnd, { self: c, side }); }
      }
      // スケジュールされた「このターン終了時」効果（scheduleTurnEnd）
      if (G._pendingTurnEnd && G._pendingTurnEnd.length) { const pend = G._pendingTurnEnd; G._pendingTurnEnd = []; for (const pe of pend) { try { await runFx(pe.fx, { self: pe.self, side: pe.side }); } catch (e) { console.warn('pendingTurnEnd失敗', e); } } }
      // ブルック: デッキが0枚のままターン終了で敗北
      if (hasDeckOutDelay(side) && G.players[side].deck.length === 0) lose(side, 'デッキ切れ（ターン終了）');
      expireBuffs('me', 'turnEnd'); expireBuffs('cpu', 'turnEnd'); clearBattleBuffs(); clearTurnGrants(side); clearNegation();
      render(); await sleep(180);
      if (G.winner) { G.busy = false; return; }
      beginTurn(opp(side));
    }
    function canAttackThisTurn(side) { return G.players[side].turnsTaken >= 2; } // 公式: 先攻・後攻とも最初の(自分の)1ターン目はアタック不可。2ターン目以降から可能
    function canCardAttack(card) {
      if (card.base.type !== 'LEADER' && card.base.type !== 'CHAR') return false; // アタックできるのはリーダー/キャラのみ（ステージ・イベントは不可）
      if (card.rested) return false;
      if (cantAttackNeg(card)) return false;
      if (isRestImmune(card)) return false; // 「レストにできない」＝アタック宣言できない（アタックはレストを伴う）
      if (card.base.fx && card.base.fx.static && card.base.fx.static.some(o => o.op === 'cantAttack')) return false; // 「このリーダー/キャラはアタックできない」常在
      if (card.owner !== G.active) return false;
      if (!canAttackThisTurn(card.owner)) return false;
      if (card.base.type === 'CHAR' && card.summonedTurn === G.turnSeq && !hasKw(card, 'rush') && !hasKw(card, 'rushChar')) return false;
      return true;
    }
    // 速攻：キャラ は登場ターンにリーダーへアタック不可（通常の速攻/2ターン目以降は可）
    function canTargetLeader(attacker) {
      if (attacker.base.type === 'CHAR' && attacker.summonedTurn === G.turnSeq && hasKw(attacker, 'rushChar') && !hasKw(attacker, 'rush')) return false;
      return true;
    }
    function legalTargets(side, attacker) { // side=attacker側。attacker指定時は対象制限を反映
      const D = G.players[opp(side)]; const arr = (attacker && !canTargetLeader(attacker)) ? [] : [D.leader];
      for (const c of D.chars) if (c.rested) arr.push(c);
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
      attacker.rested = true;
      const aSide = attacker.owner, dSide = opp(aSide);
      flog(aSide, `「${attacker.base.name}」が${target.base.type === 'LEADER' ? 'リーダー' : '「' + target.base.name + '」'}にアタック`);
      showAtkAnnounce(aSide, attacker, target);
      render(); animClass(attacker.uid, 'lunge' + (aSide === 'me' ? '' : ' up')); await sleep(aSide === 'me' ? 280 : 780);
      // アタック時効果
      if (attacker.base.fx && attacker.base.fx.onAttack && !isNegated(attacker)) { await fxNote(aSide, 'アタック時効果', attacker.base.name); await runFx(attacker.base.fx.onAttack, { self: attacker, side: aSide }); }
      if (!isNegated(G.players[aSide].leader)) await leaderOnAttack(attacker);
      // 【相手のアタック時】防御側キャラの誘発（onceゲート: fx内のopに once:'turn' があればそのカードはターン1回）
      for (const c of [...G.players[dSide].chars]) {
        if (c.base.fx && c.base.fx.onOppAttack && !isNegated(c)) {
          const onceGated = c.base.fx.onOppAttack.some(o => o.once === 'turn');
          if (onceGated && c._oppAtkTurn === G.turnSeq) continue;
          if (onceGated) c._oppAtkTurn = G.turnSeq;
          await fxNote(dSide, '相手のアタック時', c.base.name); await runFx(c.base.fx.onOppAttack, { self: c, side: dSide, attacker });
        }
      }
      { // 【相手のアタック時】防御側ステージ（ドレスローザ王国 等）の誘発
        const st = G.players[dSide].stage;
        if (st && st.base.fx && st.base.fx.onOppAttack && !isNegated(st)) {
          const onceGated = st.base.fx.onOppAttack.some(o => o.once === 'turn');
          if (!(onceGated && st._oppAtkTurn === G.turnSeq)) {
            if (onceGated) st._oppAtkTurn = G.turnSeq;
            await fxNote(dSide, '相手のアタック時', st.base.name); await runFx(st.base.fx.onOppAttack, { self: st, side: dSide, attacker });
          }
        }
      }
      // 防御側の効果でアタッカーが場を離れた/攻撃不能になった場合はアタックを中断
      if ((attacker.base.type === 'CHAR' && !G.players[aSide].chars.includes(attacker)) || cantAttackNeg(attacker)) {
        clearBattleBuffs(); G.players[dSide]._teachSacUid = null; clearAtkAnnounce(); checkWinByLife(); render();
        if (G.players[aSide].isCPU) { G.busy = true; } else { G.busy = false; G.myActable = true; } // ★中断時も操作権を返す（人間が固まってアタック不能になるのを防ぐ）
        return;
      }
      // 黒ひげ(ティーチ)リーダー: 手札のトリガーを捨ててアタック対象を変更
      if (!isNegated(G.players[dSide].leader)) { target = await teachRedirect(dSide, attacker, target); G._atkTo = target.uid; }
      // ブロック
      let blkTarget = target;
      if (!(target.base.type === 'LEADER' && G.players[aSide].denyBlock) && !isUnblockable(attacker)) {
        const blocker = await chooseBlocker(dSide, attacker, target);
        if (blocker) {
          blocker.rested = true; blkTarget = blocker; G._atkTo = blocker.uid; flog(dSide, `「${blocker.base.name}」でブロック`); render(); await sleep(200); await luffyReveal(dSide);
          // 【ブロック時】(onBlock): ブロッカー宣言時に誘発（カウンター前）。fx未定義カードは無変化＝純粋に追加
          if (blocker.base.fx && blocker.base.fx.onBlock && !isNegated(blocker)) {
            await fxNote(dSide, 'ブロック時効果', blocker.base.name); flog(dSide, `【ブロック時】「${blocker.base.name}」`);
            await runFx(blocker.base.fx.onBlock, { self: blocker, side: dSide, attacker });
          }
        }
      }
      // カウンター
      await counterStep(dSide, attacker, blkTarget);
      // ダメージ判定
      const atkP = power(attacker), defP = power(blkTarget);
      flog(aSide, `パワー ${atkP} vs ${defP}`);
      if (atkP >= defP) {
        if (blkTarget.base.type === 'LEADER') {
          const dbl = hasKw(attacker, 'doubleAttack') ? 2 : 1;
          const banish = hasKw(attacker, 'banish');
          await dealLeaderDamage(dSide, attacker, dbl, banish);
        } else {
          if (!(await protectFromEffect(blkTarget, 'battle'))) { animClass(blkTarget.uid, 'shake'); await sleep(180); await koCard(blkTarget, 'battle'); } // includeBattle の身代わりがあればバトルKOを肩代わり
        }
      } else {
        flog(aSide, `アタック失敗`); floatOn(blkTarget.uid, 'GUARD', 'buff');
      }
      clearBattleBuffs();
      G.players[dSide]._teachSacUid = null;
      clearAtkAnnounce();
      checkWinByLife();
      render();
      if (G.players[aSide].isCPU) { G.busy = true; } else { G.busy = false; G.myActable = true; }
    }

    async function dealLeaderDamage(dSide, attacker, times, banish) {
      const D = G.players[dSide];
      for (let t = 0; t < times; t++) {
        if (G.winner) return; // 勝敗確定後は追加ダメージ解決を打ち切る
        animClass(D.leader.uid, 'dmg'); floatOn(D.leader.uid, '-1', 'dmg'); await sleep(300);
        if (D.life.length === 0) { lose(dSide, 'ライフ0で被弾'); return; }
        const card = D.life.shift();
        if (banish) { D.trash.push(reset(card)); flog(dSide, 'ライフ1枚がバニッシュ（トラッシュ）'); }
        else if (card.base.fx && card.base.fx.trigger) {
          const use = await askTrigger(dSide, card);
          if (use) { await fxNote(dSide, 'トリガー発動', card.base.name); flog(dSide, `【トリガー】「${card.base.name}」発動`); await runFx(card.base.fx.trigger, { self: card, side: dSide }); if (!D.chars.includes(card)) D.trash.push(reset(card)); }
          else { D.hand.push(card); flog(dSide, 'ライフ1枚を手札に'); }
        } else { D.hand.push(card); flog(dSide, 'ライフ1枚を手札に'); }
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
        G.pendingChoice = { uids, optional: true, res: c => { G.pendingChoice = null; res(c); } };
        render();
        const opts = blockers.map(b => ({ t: '🛡 ' + b.base.name + '（P' + power(b) + '）でブロック', v: 'blk:' + b.uid, primary: true }));
        opts.push({ t: 'ブロックしない', v: '__skip', ghost: true });
        const tgt = target.base.type === 'LEADER' ? 'リーダー' : '「' + target.base.name + '」';
        showPrompt({
          title: 'ブロック', text: '「' + attacker.base.name + '」（P' + power(attacker) + '）が' + tgt + 'にアタック',
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
      for (const src of G.players[side].chars) { if (isNegated(src)) continue; const st = src.base.fx && src.base.fx.static; if (!st) continue; for (const o of st) { if (o.op === 'handCounterBuff' && matchFilter(c, o.filter || {})) v += o.amount || 0; } }
      return v;
    }
    async function counterStep(dSide, attacker, target) {
      const D = G.players[dSide];
      if (D.isCPU) { await cpuCounter(dSide, attacker, target); return; }
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
          title: 'カウンター',
          text: `「${attacker.base.name}」${power(attacker)} を ${power(target)} で防御中（あと${Math.max(0, need + 1)}必要）`,
          opts, onPick: res
        }));
        if (v === '__done') return;
        if (v && v.startsWith('c')) {
          const c = D.hand[parseInt(v.slice(1))];
          if (!c) continue;
          if (c.base.fx && c.base.fx.counter) {
            if ((c.base.cost || 0) > 0 && !payDon(dSide, c.base.cost)) { toast('ドンが足りません'); continue; }
            D.hand.splice(D.hand.indexOf(c), 1);
            await runFx(c.base.fx.counter.fx, { self: c, side: dSide, target });
            D.trash.push(reset(c)); flog(dSide, `カウンター「${c.base.name}」`);
            if (c.base.type === 'EVENT') await luffyReveal(dSide);
          } else {
            const cv = counterVal(c, dSide);
            D.hand.splice(D.hand.indexOf(c), 1);
            addBuff(target, cv, 'battle'); floatOn(target.uid, `+${cv}`, 'buff');
            D.trash.push(reset(c)); flog(dSide, `手札からカウンター +${cv}`);
          }
          render();
        } else if (v === '__lucy') { await lucyCounter(dSide, target); }
        else if (v === '__ace') { await aceCounter(dSide, attacker); }
      }
    }
    function defenderLeaderReactionOpts(dSide, attacker, target) {
      const D = G.players[dSide]; const out = [];
      if (isNegated(D.leader)) return out;
      if (D.leader.base.leader === 'lucy' && target.uid === D.leader.uid) {
        const ev = D.hand.filter(c => c.base.type === 'EVENT' || c.base.type === 'STAGE');
        if (ev.length) out.push({ t: `【ルーシー】イベント/ステージを捨て+1000`, v: '__lucy' });
      }
      if (D.leader.base.leader === 'ace') {
        if (D.hand.length > 0 && !D._aceUsed) out.push({ t: `【エース】手札1枚捨て:相手-2000`, v: '__ace' });
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
      if (c) { D.hand.splice(D.hand.indexOf(c), 1); D.trash.push(reset(c)); addBuff(attacker, -2000, 'battle'); floatOn(attacker.uid, '-2000', 'dmg'); D._aceUsed = true; flog(dSide, '【エース】相手-2000'); render(); }
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
      const applyNum = async (c) => { const cv = cval(c); D.hand.splice(D.hand.indexOf(c), 1); addBuff(target, cv, 'battle'); D.trash.push(reset(c)); floatOn(target.uid, `+${cv}`, 'buff'); flog(dSide, `CPUカウンター +${cv}`); await sleep(140); };
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
      const aceVal = (!isNegated(D.leader) && D.leader.base.leader === 'ace' && D.hand.length > 0 && !D._aceUsed) ? 2000 : 0;
      if (numSum + evSum + lucyVal + aceVal <= need0) return; // どう足掻いても止められない→手札を温存して素受け
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
        if (power(attacker) - power(target) >= 0 && D.leader.base.leader === 'ace' && D.hand.length > 0 && !D._aceUsed) await aceCounter(dSide, attacker);
      }
      render();
    }
    async function askTrigger(side, card) {
      if (G.players[side].isCPU) return true; // CPUは基本発動
      return await new Promise(res => showPrompt({
        title: 'トリガー',
        text: `ライフから「${card.base.name}」が公開。【トリガー】を発動しますか？（不発なら手札に加わります）`,
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
            title: '【ルーシー】', text: 'イベント/ステージを捨ててリーダー+1000しますか？',
            opts: [{ t: '捨てて+1000', v: true, primary: true }, { t: 'しない', v: false, ghost: true }], onPick: res
          }));
          if (v) await lucyCounter(side, P.leader);
        } else if (ev.length && P.isCPU && power(P.leader) < 7000) {
          await lucyCounter(side, P.leader);
        }
      }
    }
    async function namiOnEnter(side) {
      const P = G.players[side];
      if (P._namiUsedTurn === G.turnSeq) return;
      if (P.leader.attachedDon < 1) return; // 【ドン×1】
      P._namiUsedTurn = G.turnSeq;
      draw(side, 1);
      if (P.hand.length) { const c = await chooseFromHand(side, P.hand, 'デッキ下に置く手札を選択'); if (c) { P.hand.splice(P.hand.indexOf(c), 1); P.deck.push(reset(c)); } }
      flog(side, '【ナミ】1ドローし手札1枚をデッキ下');
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
      const opts = dests.map(c => ({ t: '→ ' + (c.base.type === 'LEADER' ? 'リーダー' : c.base.name + '(P' + power(c) + ')') + 'に変更', v: 'rd:' + c.uid }));
      opts.push({ t: '変更しない', v: '__no', ghost: true });
      const v = await showPrompt({ title: '【ティーチ】アタック対象を変更', text: '手札の【トリガー】1枚を捨て、このアタックの対象をリーダーか黒ひげ海賊団キャラに変更できます（ターン1回）', opts });
      if (!v || v === '__no') return target;
      const dest = dests.find(c => c.uid === +String(v).slice(3)); if (!dest) return target;
      const disc = await chooseFromHand(dSide, triggers, '捨てる【トリガー】カードを選択'); if (!disc) return target;
      consume(disc);
      flog(dSide, `【ティーチ】対象を「${dest.base.type === 'LEADER' ? 'リーダー' : dest.base.name}」へ変更`);
      render(); await sleep(180); return dest;
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
          const c = await chooseCard(side, P.chars, 'レストのドンを付与するキャラ（最大4枚）', 'ownBig', true);
          if (c) {
            const k = Math.min(4, P.don.rested); c.attachedDon += k; P.don.rested -= k;
            if (k) { floatOn(c.uid, 'ドン+' + k, 'buff'); flog(side, `【エネル】「${c.base.name}」にレストのドン${k}枚を付与`); }
            else flog(side, '【エネル】付与できるレストのドンがなかった');
          }
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

