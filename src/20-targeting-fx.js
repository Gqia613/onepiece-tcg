    "use strict";
    /* =========================================================================
       対象選択 (人間=UIハイライト / CPU=ヒューリスティック)
       ========================================================================= */
    async function chooseCard(side, cands, text, prefer, optional) {
      cands = cands.filter(Boolean);
      if (cands.length === 0) return null;
      if (G.players[side].isCPU) return cpuPick(cands, prefer);
      if (cands.length === 1 && !optional) return cands[0];
      return await humanPick(cands, text, optional);
    }
    function cpuPick(cands, prefer) {
      const byPow = (a, b) => power(b) - power(a) || (b.base.cost || 0) - (a.base.cost || 0);
      let arr = cands.slice();
      if (prefer === 'ownSmall') arr.sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0) || power(a) - power(b));
      else if (prefer === 'leader') { const L = arr.find(c => c.base.type === 'LEADER'); if (L) return L; arr.sort(byPow); }
      else arr.sort(byPow); // oppBig / ownBig 既定で強い順
      return arr[0];
    }
    function humanPick(cands, text, optional) {
      cands = (cands || []).filter(Boolean);
      if (cands.length === 0) return Promise.resolve(null);
      return new Promise(res => {
        const uids = new Set(cands.map(c => c.uid));
        let done = false;
        const finish = (card) => { if (done) return; done = true; G.pendingChoice = null; render(); res(card); };
        G.pendingChoice = { uids, optional, res: finish };
        render();
        const opts = cands.map(c => ({ t: cardBtnLabel(c), v: 'pick:' + c.uid }));
        if (optional) opts.push({ t: '選ばない（スキップ）', v: '__skip', ghost: true });
        showPrompt({
          title: '対象を選択', text: (text || '対象を選んでください') + '<span class="pp-hint">候補 ' + cands.length + ' ／ 光るカードをクリック、または下のボタンで選択' + (optional ? '（任意）' : '') + '</span>', opts,
          onPick: v => {
            if (typeof v === 'string' && v.indexOf('pick:') === 0) { const u = +v.slice(5); const c = cands.find(x => x.uid === u); finish(c || (optional ? null : cands[0])); }
            else finish(optional ? null : cands[0]); // __skip / 想定外 / undefined でも必ず解決（フリーズ防止）
          }
        });
      });
    }
    function cardBtnLabel(c) {
      const b = c.base; const isFighter = (b.type === 'CHAR' || b.type === 'LEADER');
      return b.name + (b.cost != null ? '（C' + b.cost + (isFighter ? '/P' + power(c) : '') + '）' : (isFighter ? '（P' + power(c) + '）' : ''));
    }
    // 複数選択の進捗を文言に付す（「X/N枚目」）。total<=1なら素の文言
    function progText(base, i, total) { return total > 1 ? base + '（' + (i + 1) + '/' + total + '枚目）' : base; }
    /* 手札からの選択（捨てる/デッキ下など） */
    async function chooseFromHand(side, cands, text, prefer, optional) {
      cands = cands.filter(Boolean); if (cands.length === 0) return null;
      if (G.players[side].isCPU) { const a = cands.slice().sort((x, y) => (x.base.counter || 0) - (y.base.counter || 0) || (x.base.cost || 0) - (y.base.cost || 0)); return a[0]; }
      return await humanPick(cands, text, !!optional);
    }

    /* 任意コスト/効果の発動確認: CPUは常に実行(true)、人間にはY/Nプロンプト。
       従来の「let go=true; if(!isCPU) go=(await showPrompt(...))==='y'」と等価。 */
    async function confirmUse(side, title, text, yes, no) {
      if (G.players[side].isCPU) return true;
      return (await showPrompt({ title, text, opts: [{ t: yes, v: 'y', primary: true }, { t: no || '使わない', v: 'n', ghost: true }] })) === 'y';
    }
    // duration文字列 → 内部buffタグ（パワー/コスト/キーワード付与の失効管理）。def=未指定時の既定タグ('turnEnd'|'turn'等)
    function durTag(d, def) {
      if (d === 'battle') return 'battle';
      if (d === 'untilNextStart') return 'ownerNextStart';
      if (d === 'untilNextEnd') return 'oppNextEnd';
      return def;
    }
    // duration文字列 → 失効シーケンス（negSeq/noAtkSeq/restImmuneUntil 用）。untilNextEnd=次の相手ターン終了(turnSeq+1)
    function durSeq(d) { return d === 'untilNextEnd' ? G.turnSeq + 1 : G.turnSeq; }

    /* =========================================================================
       効果解決
       ========================================================================= */
    async function runFx(ops, ctx) {
      if (!ops) return;
      for (const op of ops) {
        try { const cont = await doOp(op, ctx); if (cont === false) break; }
        catch (e) { console.warn('op失敗', op, e); }
      }
    }
    async function doOp(op, ctx) {
      const side = ctx.side, o = opp(side), P = G.players[side], self = ctx.self;
      if (op.cond && !checkCond(op.cond, side, self)) return; // 全opで op.cond を尊重（【ドン!!×N】等の条件付き効果）
      switch (op.op) {
        case 'draw': draw(side, op.n); flog(side, `${op.n}ドロー`); break;
        case 'search': {
          const look = P.deck.splice(0, op.look);          // 上N枚を抜き取る
          flog(side, `デッキ上${op.look}枚を確認: ${look.map(c => c.base.name).join('、')}`);
          const picked = []; const cnt = op.count || 1; // count枚まで手札に加える
          for (let n = 0; n < cnt; n++) {
            const cands = look.filter(c => !picked.includes(c) && matchFilter(c, op.filter) && (!op.exclude || c.base.name !== op.exclude));
            if (!cands.length) break;
            let pick = null;
            if (G.players[side].isCPU) pick = cpuPick(cands, 'ownBig');
            else {
              pick = await new Promise(res => {
                const opts = look.filter(c => !picked.includes(c)).map(c => cands.includes(c)
                  ? { t: c.base.name, v: 'pick:' + c.uid, card: { no: c.base.no } }
                  : { t: c.base.name + '（対象外）', v: '__x' + c.uid, ghost: true, disabled: true, card: { no: c.base.no } });
                opts.push({ t: '加えない', v: '__skip', ghost: true });
                showPrompt({
                  title: 'デッキトップを確認', text: `上${op.look}枚を見て、手札に加えるカードを選択（${n + 1}/${cnt}）`, opts,
                  onPick: v => { if (typeof v === 'string' && v.indexOf('pick:') === 0) { const u = +v.slice(5); res(cands.find(x => x.uid === u) || null); } else res(null); }
                });
              });
            }
            if (!pick) break;
            picked.push(pick); P.hand.push(pick); flog(side, `「${pick.base.name}」を手札に`);
          }
          // 取らなかったカードはデッキ下（rest:'trash'ならトラッシュ）へ
          for (const c of look) if (!picked.includes(c)) { if (op.rest === 'trash') P.trash.push(reset(c)); else P.deck.push(c); }
          if (op.rest === 'trash') flog(side, '残りをトラッシュに置いた');
          break;
        }
        case 'ko': {
          // KO効果は「相手の効果ではKOされない」(isKoImmune)を候補から除外（無駄打ち/同一カード再選択ループ防止。protectFromEffectでも二重に防ぐ）
          if (op.all) { for (const t of oppChars(side, opFilter(op)).filter(c => !isKoImmune(c))) { if (!(await protectFromEffect(t, 'ko'))) await koCard(t, 'oppEffect'); } break; } // 条件一致の相手キャラを全てKO
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op)).filter(c => !isKoImmune(c));
            const t = await chooseCard(side, cands, progText('KOする相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; if (await protectFromEffect(t, 'ko')) continue; await koCard(t, 'oppEffect');
          }
          break;
        }
        case 'koZero': {
          const dead = G.players[o].chars.filter(c => power(c) <= 0 && !isImmune(c) && !isKoImmune(c));
          for (const c of dead.slice()) { if (!G.players[o].chars.includes(c)) continue; if (await protectFromEffect(c, 'ko')) continue; await koCard(c, 'oppEffect'); }
          break;
        }
        case 'bounce': {
          if (op.all) { for (const t of oppChars(side, opFilter(op)).slice()) { if (!(await protectFromEffect(t, 'bounce'))) { bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'oppEffect'); } } break; }
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op));
            const t = await chooseCard(side, cands, progText('手札に戻す相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; if (await protectFromEffect(t, 'bounce')) continue; bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'oppEffect');
          }
          break;
        }
        case 'deckBottom': {
          if (op.condLeader && !checkCond(op.condLeader, side, self)) break;
          const cands = oppChars(side, opFilter(op));
          const t = await chooseCard(side, cands, `デッキ下に送る相手キャラを選択`, 'oppBig', op.optional);
          if (t && !(await protectFromEffect(t, 'deckBottom'))) { removeCharTo(t, G.players[t.owner].deck); flog(side, `「${t.base.name}」をデッキ下へ`); await checkAllyLeave(t.owner, t, 'oppEffect'); }
          break;
        }
        case 'restChar': {
          const restPool = () => { let arr = oppChars(side, opFilter(op)).filter(c => !c.rested && !isRestImmune(c)); if (op.includeLeader && !G.players[o].leader.rested) arr = [G.players[o].leader, ...arr]; if (op.includeStage && G.players[o].stage && !G.players[o].stage.rested) arr = [...arr, G.players[o].stage]; return arr; };
          if (op.all) { for (const t of restPool()) { t.rested = true; flog(side, `「${t.base.name === undefined ? '相手リーダー' : t.base.name}」をレスト`); } break; } // 条件一致を全てレスト
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = restPool();
            const t = await chooseCard(side, cands, progText('レストにする相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; t.rested = true; flog(side, `「${t.base.name}」をレスト`);
          }
          break;
        }
        case 'lock': {
          const lockPool = () => { let arr = oppChars(side, opFilter(op)).filter(c => (op.restedOnly ? c.rested : true) && !isRestImmune(c) && !c.frozen); if (op.includeLeader && G.players[o].leader.rested && !G.players[o].leader.frozen) arr = [G.players[o].leader, ...arr]; if (op.includeStage && G.players[o].stage && G.players[o].stage.rested && !G.players[o].stage.frozen) arr = [...arr, G.players[o].stage]; return arr; };
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = lockPool();
            const t = P.isCPU ? cands[0] : await chooseCard(side, cands, progText('次のリフレッシュでアクティブにしない相手のカード', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break;
            t.rested = true; t.frozen = true; flog(side, `「${t.base.type === 'LEADER' ? '相手リーダー' : t.base.name}」を次のリフレッシュでアクティブにしない`);
            if (op.restSource && self && i === 0) { self.rested = true; flog(side, `「${self.base.name}」をレストにした`); }
          }
          break;
        }
        case 'negateEffect': {
          const o2 = opp(side);
          const oppL = G.players[o2].leader;
          oppL.negSeq = G.turnSeq; flog(side, '相手リーダーの効果を無効化(このターン中)'); floatOn(oppL.uid, '無効', 'dmg');
          const cands = oppChars(side, {});
          const t = await chooseCard(side, cands, '効果無効＆アタック不可にする相手キャラ1枚', 'oppBig', true);
          if (t) { t.negSeq = G.turnSeq + 1; t.noAtkSeq = G.turnSeq + 1; flog(side, `「${t.base.name}」を効果無効＆アタック不可(次の相手ターン終了まで)`); floatOn(t.uid, '無効', 'dmg'); }
          render();
          break;
        }
        case 'negateChoose': {
          const o2 = opp(side); const D = G.players[o2];
          const pool = op.charsOnly || op.filter || op.maxCost != null ? D.chars : [D.leader, ...D.chars]; // フィルタ/maxCost/charsOnly指定時はキャラのみ
          const cands = pool.filter(c => matchFilter(c, opFilter(op)));
          const t = await chooseCard(side, cands, '効果を無効にする相手のキャラ1枚', 'oppBig', op.optional !== false);
          if (t) { t.negSeq = durSeq(op.duration); flog(side, `「${t.base.type === 'LEADER' ? '相手リーダー' : t.base.name}」を効果無効`); floatOn(t.uid, '無効', 'dmg'); }
          render();
          break;
        }
        case 'powerMod': {
          const dur = op.battle ? 'battle' : durTag(op.duration, 'turnEnd');
          if (op.target === 'self') { // 「このキャラは…パワー+N」= ctx.self自身に付与（選択なし）
            if (self) { const amt = op.perAttachedDon ? (op.amount * (self.attachedDon || 0)) : op.amount; if (amt) { addBuff(self, amt, dur); floatOn(self.uid, `${amt > 0 ? '+' : ''}${amt}`, amt > 0 ? 'buff' : 'dmg'); } }
            break;
          }
          const targetSide = op.side === 'self' ? side : o;
          if (op.all) { // 条件一致の対象（自分側 or 相手側）全てにパワー±
            let cands = op.side === 'self' ? (op.leader ? [P.leader, ...P.chars] : P.chars).filter(c => matchFilter(c, opFilter(op))) : oppChars(side, opFilter(op));
            for (const t of cands.filter(Boolean)) { const amt = op.perAttachedDon ? (op.amount * (t.attachedDon || 0)) : op.amount; if (amt) { addBuff(t, amt, dur); floatOn(t.uid, `${amt > 0 ? '+' : ''}${amt}`, amt > 0 ? 'buff' : 'dmg'); } } // perAttachedDon: 付与ドン1枚につき amount
            render(); break;
          }
          for (let i = 0; i < (op.count || 1); i++) {
            let cands;
            if (op.leader && op.side === 'self') cands = [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op)));
            else if (op.side === 'self') { cands = P.chars.filter(c => matchFilter(c, opFilter(op))); if (!cands.length && !op.filter && !op.name && !op.nameIncludes) cands = [P.leader]; }
            else cands = op.includeLeader ? [G.players[o].leader, ...oppChars(side, opFilter(op))] : oppChars(side, opFilter(op)); // 相手のリーダーも対象に
            cands = cands.filter(Boolean);
            const t = await chooseCard(targetSide === side ? side : side, cands,
              `${op.amount > 0 ? '+' : ''}${op.amount}する対象を選択`, op.side === 'self' ? 'ownBig' : 'oppBig', op.optional);
            if (!t) break; addBuff(t, op.amount, dur);
            floatOn(t.uid, `${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount > 0 ? 'buff' : 'dmg');
          }
          break;
        }
        case 'powerCopy': {
          const cands = oppChars(side, {});
          if (!cands.length) break;
          const t = await chooseCard(side, cands, 'パワーをコピーする相手キャラ1枚', null, true);
          if (t && self) {
            const diff = power(t) - (self.base.power || 0); addBuff(self, diff, 'turnEnd');
            floatOn(self.uid, `${diff >= 0 ? '+' : ''}${diff}`, diff >= 0 ? 'buff' : 'dmg'); flog(side, `元々のパワーを${power(t)}に変化`);
          }
          break;
        }
        case 'leaderBuff': addBuff(P.leader, op.amount, durTag(op.duration, 'turnEnd')); floatOn(P.leader.uid, `+${op.amount}`, 'buff'); break;
        case 'leaderDoubleAttack': P.leader.kwGrant.push({ kw: 'doubleAttack', dur: 'turn' }); if (op.amount) addBuff(P.leader, op.amount, 'turnEnd'); flog(side, 'リーダーに【ダブルアタック】'); break;
        case 'counterBuff': if (ctx.target) { addBuff(ctx.target, op.amount, 'battle'); floatOn(ctx.target.uid, `+${op.amount}`, 'buff'); } break;
        case 'donMinus': { const ok = await returnDonChoose(side, op.n, op.fromActive); if (!ok) return false; break; }
        case 'donAttach': {
          let targets = [];
          if (op.target === 'leader') targets = [P.leader];
          else if (op.target === 'self') targets = [self];
          else if (op.target === 'leaderAndChar') { targets = [P.leader]; const c = await chooseCard(side, P.chars, 'レストのドンを付与するキャラ', 'ownBig', true); if (c) targets.push(c); }
          else if (op.target === 'chooseOwn') { const c = await chooseCard(side, [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op))), 'レストのドンを付与する対象', 'ownBig', true); if (c) targets = [c]; }
          // 公式: 効果による「レストのドン!!を付与」はレスト状態のドンを付ける。fromAny=「コストエリアのドン」＝アクティブ/レスト両方から付与
          for (const t of targets) {
            const avail = op.fromAny ? (P.don.rested + P.don.active) : P.don.rested;
            const k = Math.min(op.n, avail); t.attachedDon += k;
            for (let r = k; r > 0;) { if (P.don.rested > 0) { P.don.rested--; r--; } else if (op.fromAny && P.don.active > 0) { P.don.active--; r--; } else break; }
            if (k) floatOn(t.uid, `ドン+${k}`, 'buff');
          }
          break;
        }
        case 'donAttachAll': { const targets = op.incLeader ? [P.leader, ...P.chars] : P.chars; for (const t of targets) { const k = Math.min(op.n, P.don.rested); t.attachedDon += k; P.don.rested -= k; } flog(side, op.incLeader ? 'リーダーとキャラ全てにレストのドン付与' : '自キャラにレストのドン付与'); break; }
        case 'selfToHand': { const z = P.trash; const i = z.indexOf(self); if (i >= 0) { z.splice(i, 1); P.hand.push(self); flog(side, `「${self.base.name}」をトラッシュから手札に加えた`); } break; }
        case 'giveKeyword': {
          if (op.target === 'allOwn' || op.target === 'allOwnL') { // 条件一致の自分のキャラ（Lはリーダー含む）全てに付与
            const dur = durTag(op.duration, 'turn');
            const pool = (op.target === 'allOwnL' ? [P.leader, ...P.chars] : P.chars).filter(c => matchFilter(c, opFilter(op)));
            for (const t of pool) t.kwGrant.push({ kw: op.kw, dur });
            if (pool.length) flog(side, `自分のキャラ全てに【${kwJa(op.kw)}】`);
            break;
          }
          let t = null;
          if (op.target === 'self') t = self;
          else if (op.target === 'chooseOwn') t = await chooseCard(side, P.chars.filter(c => matchFilter(c, opFilter(op))), `【${kwJa(op.kw)}】を与える対象`, 'ownBig', true);
          else if (op.target === 'chooseOwnL') t = await chooseCard(side, [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op))), `【${kwJa(op.kw)}】を与える対象（リーダーかキャラ）`, 'ownBig', true);
          if (t) { t.kwGrant.push({ kw: op.kw, dur: durTag(op.duration, 'turn') }); flog(side, `「${t.base.name}」に【${kwJa(op.kw)}】`); }
          break;
        }
        case 'playSelf': { if (self) { await summon(side, self, false); flog(side, `「${self.base.name}」を登場させた`); } break; }
        case 'lifeToHand': { const c = P.life.shift(); if (c) { P.hand.push(c); flog(side, '自ライフ1枚を手札に'); } break; }
        case 'handToLife': { if (P.hand.length) { const c = P.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0]; P.hand.splice(P.hand.indexOf(c), 1); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフの上に置いた'); } break; }
        case 'handToBottom': {
          for (let i = 0; i < (op.n || 1); i++) {
            if (!P.hand.length) break;
            const c = await chooseFromHand(side, P.hand.slice(), `デッキの下に置く手札（残り${(op.n || 1) - i}枚）`);
            if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.deck.push(c);
          }
          flog(side, '手札をデッキの下に置いた'); break;
        }
        case 'oppLifeToHand': { // 「相手のライフの上からN枚までを、持ち主の手札に加える」。optionalなら人間は見送り可（相手に手札を与えるため不利な場面がある）
          for (let i = 0; i < (op.n || 1); i++) {
            if (!G.players[o].life.length) break;
            if (op.optional && !P.isCPU) { const go = (await showPrompt({ title: '相手ライフを手札に', text: '相手のライフ上1枚を相手の手札に加えますか？（相手に1枚渡す）', opts: [{ t: '加える', v: 'y', primary: true }, { t: '加えない', v: 'n', ghost: true }] })) === 'y'; if (!go) break; }
            const c = G.players[o].life.shift(); G.players[o].hand.push(c); flog(side, `相手ライフ1枚を手札に送った`); await sleep(150);
          }
          break;
        }
        case 'lifeAddFromDeck': { for (let i = 0; i < op.n; i++) { if (P.deck.length) { const c = P.deck.shift(); if (op.faceUp) c._faceUp = true; P.life.unshift(c); } } flog(side, `デッキ上${op.n}枚をライフに${op.faceUp ? '表向きで' : ''}加えた`); break; }
        case 'flipLifeUp': { if (P.life.length) { P.life[0]._faceUp = true; flog(side, '自分のライフの一番上を表向きにした'); floatOn(P.leader.uid, 'LIFE表', 'heal'); render(); await sleep(160); } break; }
        case 'lifeTrash': { const c = P.life.shift(); if (c) { P.trash.push(c); flog(side, '自ライフ1枚をトラッシュ'); } break; }
        case 'lifeSwap': {
          if (!P.life.length) { flog(side, 'ライフが無く効果なし'); break; }
          if (P.isCPU) { P.hand.push(P.life.shift()); flog(side, '【ライフ操作】ライフ上1枚を手札に'); }
          else {
            const pk = await showPrompt({ title: 'ライフ操作', text: 'ライフ上か下の1枚を手札に加える', opts: [{ t: 'ライフ上を手札に', v: 'top', primary: true }, { t: 'ライフ下を手札に', v: 'bot' }, { t: 'やめる', v: 'no' }] });
            if (pk === 'top') { P.hand.push(P.life.shift()); flog(side, 'ライフ上を手札に'); }
            else if (pk === 'bot') { P.hand.push(P.life.pop()); flog(side, 'ライフ下を手札に'); }
            else break;
          }
          if (P.hand.length) {
            if (P.isCPU) { const c = P.hand[P.hand.length - 1]; P.hand.pop(); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフ上に'); }
            else { const c = await chooseCard(side, P.hand, 'ライフの上に置く手札（任意）', 'ownBig', true); if (c) { P.hand.splice(P.hand.indexOf(c), 1); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフ上に'); } }
          }
          render(); break;
        }
        case 'scry': {
          const look = P.deck.splice(0, op.n);
          flog(side, `デッキ上${op.n}枚を確認`);
          if (!P.isCPU) {
            let keep = look.slice(), pick;
            while (keep.length) {
              pick = await showPrompt({ title: 'デッキ操作', text: `上${op.n}枚を確認。デッキ下に送るカードを選択（残りは上に戻す）`, opts: [...keep.map(c => ({ t: c.base.name + ' を下へ', v: 'b:' + c.uid })), { t: '残りを上に戻す', v: 'done', primary: true }] });
              if (pick === 'done' || !pick) break;
              const c = keep.find(x => 'b:' + x.uid === pick); if (c) { keep.splice(keep.indexOf(c), 1); P.deck.push(c); }
            }
            for (let i = keep.length - 1; i >= 0; i--)P.deck.unshift(keep[i]);
          } else { for (let i = look.length - 1; i >= 0; i--)P.deck.unshift(look[i]); }
          render(); break;
        }
        case 'bottomOwn': { for (let i = 0; i < op.n; i++) { const c = await chooseFromHand(side, P.hand, 'デッキ下に置く手札を選択'); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.deck.push(reset(c)); } flog(side, `手札${op.n}枚をデッキ下`); break; }
        case 'discardOwn': { for (let i = 0; i < op.n; i++) { const c = await chooseFromHand(side, P.hand, '捨てる手札を選択'); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); } flog(side, `手札${op.n}枚を捨てた`); break; }
        case 'cond': if (checkCond(op.check, side, self)) await runFx(op.then, ctx); break;
        // 手札公開コスト: 手札の filter 一致カードを count 枚公開できる場合のみ then を実行（公開=手札に残す。任意）
        case 'revealCost': {
          const cnt = op.count || 1;
          const matches = P.hand.filter(c => matchFilter(c, op.filter));
          if (matches.length < cnt) break; // 公開できるカードが足りない→不発
          if (!(await confirmUse(side, '手札公開', `手札${cnt}枚を公開して効果を使いますか？`, '公開して使う'))) break;
          flog(side, `手札${cnt}枚を公開: ${matches.slice(0, cnt).map(c => c.base.name).join('、')}`);
          await runFx(op.then, ctx);
          break;
        }
        // ドンをレストにするコスト: アクティブのドンを n 枚レストにできる場合のみ then を実行（任意）
        case 'restDonCost': {
          const n = op.n || 1;
          if (P.don.active < n) break;
          if (!(await confirmUse(side, 'ドンをレスト', `ドン${n}枚をレストにして効果を使いますか？`, 'レストして使う'))) break;
          P.don.active -= n; P.don.rested += n; flog(side, `ドン${n}枚をレスト`); render();
          await runFx(op.then, ctx);
          break;
        }
        // 自分のキャラをトラッシュに置くコスト: filter一致の自キャラ1枚を犠牲にできる場合のみ then を実行（任意）
        case 'trashOwnCharCost': {
          const cands = P.chars.filter(c => matchFilter(c, op.filter || {}));
          if (!cands.length) break;
          let sac;
          if (P.isCPU) sac = cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0];
          else sac = await chooseCard(side, cands, 'トラッシュに置くキャラを選択（効果のコスト）', 'ownSmall', true);
          if (!sac) break;
          removeCharTo(sac, P.trash); flog(side, `「${sac.base.name}」をトラッシュに置いた`); await checkAllyLeave(side, sac, 'ownEffect');
          await runFx(op.then, ctx);
          break;
        }
        // 手札を捨てるコスト: filter一致のカードを count枚 捨てて then を実行（任意・札は消費する）
        case 'discardCost': {
          const cnt = op.count || 1;
          const matches = P.hand.filter(c => matchFilter(c, op.filter));
          if (matches.length < cnt) break;
          if (!(await confirmUse(side, '手札を捨てる', `手札${cnt}枚を捨てて効果を使いますか？`, '捨てて使う'))) break;
          let toDiscard;
          if (P.isCPU) toDiscard = matches.slice().sort((a, b) => ((a.base.cost || 0) - (b.base.cost || 0)) || ((a.base.counter || 0) - (b.base.counter || 0))).slice(0, cnt);
          else {
            toDiscard = [];
            for (let i = 0; i < cnt; i++) { const pick = await chooseFromHand(side, P.hand.filter(c => matchFilter(c, op.filter) && !toDiscard.includes(c)), `捨てるカードを選択（${i + 1}/${cnt}）`); if (!pick) break; toDiscard.push(pick); }
            if (toDiscard.length < cnt) break;
          }
          for (const c of toDiscard) { P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); }
          flog(side, `手札${cnt}枚を捨てた: ${toDiscard.map(c => c.base.name).join('、')}`);
          await runFx(op.then, ctx);
          break;
        }
        // 「元々のパワーをNにする」一時上書き（target: self/leader/selfAndLeader/chooseOwn, duration: turn/battle/untilNextEnd）
        case 'setPower': {
          const dur = durTag(op.duration, 'turnEnd');
          const setVal = op.valueFrom === 'oppLeaderPower' ? power(G.players[o].leader) // 「相手リーダーと同じパワーに」等は都度スナップショット
            : op.valueFrom === 'selfLeaderPower' ? power(P.leader) : op.value;
          const targets = [];
          if ((op.target === 'self' || op.target === 'selfAndLeader') && self) targets.push(self);
          if (op.target === 'leader' || op.target === 'selfAndLeader') targets.push(P.leader);
          if (op.target === 'allOwn') for (const c of ownChars(side, opFilter(op))) targets.push(c); // 条件一致の自キャラ全て
          if (op.target === 'chooseOwn' || op.target === 'chooseOwnL') { const cands = (op.target === 'chooseOwnL' ? [P.leader, ...P.chars] : P.chars).filter(c => matchFilter(c, opFilter(op))); for (let i = 0; i < (op.count || 1); i++) { const t = P.isCPU ? cands[i] : await chooseCard(side, cands.filter(c => !targets.includes(c)), '元々のパワーを変える対象を選択', 'ownBig', op.optional); if (!t) break; if (!targets.includes(t)) targets.push(t); } }
          for (const t of targets) if (t) { t.buffs.push({ setBase: setVal, until: dur }); floatOn(t.uid, `P${setVal}`, 'buff'); }
          if (targets.length) { flog(side, `元々のパワーを${setVal}に`); render(); }
          break;
        }
        // KO時など: self 自身をトラッシュから登場させる（noEnter:true で登場時効果を発動しない）
        case 'reviveSelf': {
          const i = P.trash.indexOf(self); if (i < 0) break; P.trash.splice(i, 1);
          await summon(side, reset(self), op.noEnter, 'trash');
          break;
        }
        // レストのドン!!を n枚 アクティブに戻す（リソース加速）
        case 'donActivate': { const k = Math.min(op.n || 1, P.don.rested); P.don.rested -= k; P.don.active += k; if (k) flog(side, `ドン${k}枚をアクティブにした`); render(); break; }
        // 自分のアクティブのドンを任意の枚数レスト→1枚ごとに「リーダー or filter一致キャラ」1枚までを このバトル中 +amount（OP13-001ルフィ等の【相手のアタック時】）
        case 'restDonForBuff': {
          const amount = op.amount || 2000; const maxN = op.maxN || 99;
          const pool = () => [P.leader, ...P.chars].filter(c => c === P.leader || matchFilter(c, op.filter || {}));
          if (P.isCPU) {
            // 攻撃対象(リーダー/filter一致)がいれば耐えるのに必要なだけレストしてpump。無ければリーダーを優先。
            const tgt = (ctx.target && pool().includes(ctx.target)) ? ctx.target : P.leader;
            const atkP = ctx.attacker ? power(ctx.attacker) : 0;
            const need = Math.max(0, atkP - power(tgt) + 1);
            const restN = Math.min(P.don.active, Math.ceil(need / amount) || 0, maxN);
            if (restN > 0) { P.don.active -= restN; P.don.rested += restN; addBuff(tgt, restN * amount, 'battle'); floatOn(tgt.uid, `+${restN * amount}`, 'buff'); flog(side, `ドン${restN}枚をレスト→「${tgt.base.type === 'LEADER' ? 'リーダー' : tgt.base.name}」に+${restN * amount}`); }
          } else {
            let n = 0;
            while (n < maxN && P.don.active > 0) {
              if (!(await confirmUse(side, 'ドンをレストしてパワー+', `ドン1枚をレストして対象を+${amount}しますか？（アクティブ${P.don.active}枚）`, `レストして+${amount}`, 'やめる'))) break;
              const t = await chooseCard(side, pool(), `+${amount}する対象（リーダー/キャラ）`, 'ownBig', false);
              if (!t) break;
              P.don.active--; P.don.rested++; addBuff(t, amount, 'battle'); floatOn(t.uid, `+${amount}`, 'buff'); n++;
            }
          }
          render(); break;
        }
        // self自身（ステージ/キャラ）をトラッシュに置くコスト。任意。払えた時 then を実行
        case 'trashSelfCost': {
          const inChars = P.chars.includes(self), isStage = P.stage === self;
          if (!inChars && !isStage) break;
          if (!(await confirmUse(side, '自身をトラッシュ', `「${self.base.name}」をトラッシュに置いて効果を使いますか？`, '置いて使う'))) break;
          P.don.active += self.attachedDon || 0;
          if (inChars) removeChar(self); if (isStage) P.stage = null;
          P.trash.push(reset(self)); flog(side, `「${self.base.name}」をトラッシュに置いた`);
          if (inChars) await checkAllyLeave(side, self, 'ownEffect'); // 自身（キャラ）が自分の効果で場を離れた
          await runFx(op.then, ctx);
          break;
        }
        // 自分のレストのキャラを count枚（all:trueで全て、incLeader:trueでリーダーも、target:'self'で自身）アクティブにする
        case 'activateOwnChar': {
          if (op.target === 'self') { if (self) { self.rested = false; flog(side, `「${self.base.name}」をアクティブにした`); } render(); break; }
          if (op.incLeader) P.leader.rested = false;
          if (op.all) { const cands = ownChars(side, opFilter(op)).filter(c => c.rested); for (const t of cands) t.rested = false; if (cands.length || op.incLeader) flog(side, '自分のキャラをアクティブにした'); render(); break; }
          for (let i = 0; i < (op.count || 1); i++) {
            const cc = ownChars(side, opFilter(op)).filter(c => c.rested);
            const t = P.isCPU ? cc[0] : await chooseCard(side, cc, 'アクティブにする自分のキャラを選択', 'ownBig', op.optional);
            if (!t) break; t.rested = false; flog(side, `「${t.base.name}」をアクティブにした`);
          }
          render(); break;
        }
        // 盤面のキャラに一時的なコスト増減を付与（side:'opp'|'self', amount:±N, duration, filter）
        case 'addCostBuff': {
          const dur = durTag(op.duration, 'turnEnd');
          const isOpp = op.side !== 'self';
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = isOpp ? oppChars(side, opFilter(op)) : ownChars(side, opFilter(op));
            const t = P.isCPU ? cands[i] : await chooseCard(side, cands, `コスト${op.amount > 0 ? '+' : ''}${op.amount}する対象を選択`, isOpp ? 'oppBig' : 'ownBig', op.optional);
            if (!t) break; t.buffs.push({ costAmt: op.amount, until: dur }); floatOn(t.uid, `コスト${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount < 0 ? 'dmg' : 'buff');
          }
          render(); break;
        }
        // 相手のレストのドン!!を 相手のキャラ1枚に n枚まで付与する（緑系。then付きでコストとしても使える）
        case 'oppDonAttach': {
          const O = G.players[o];
          const cands = oppChars(side, opFilter(op));
          let t = null;
          const _availDon = op.fromAny ? (O.don.rested + O.don.active) : O.don.rested;
          if (cands.length && _availDon > 0) t = P.isCPU ? cands[0] : await chooseCard(side, cands, '相手のレストのドンを付与する相手キャラを選択', 'oppBig', op.optional !== false);
          if (t) { const avail = op.fromAny ? (O.don.rested + O.don.active) : O.don.rested; let k = Math.min(op.n || 1, avail); t.attachedDon += k; for (let r = k; r > 0;) { if (O.don.rested > 0) { O.don.rested--; r--; } else if (op.fromAny && O.don.active > 0) { O.don.active--; r--; } else break; } flog(side, `相手の「${t.base.name}」に相手の${op.fromAny ? 'コストエリアの' : 'レストの'}ドン!!${k}枚を付与`); floatOn(t.uid, `ドン+${k}`, 'dmg'); render(); }
          if (op.then) { if (!t) break; await runFx(op.then, ctx); } // コスト用途: 付与できた時のみ then を実行
          break;
        }
        // ライフ操作コスト: 自分のライフ上1枚を action して then を実行（action: 'toHand'|'trash'|'faceUp'|'faceDown'。任意）
        case 'lifeCost': {
          const act = op.action || 'toHand';
          if (!P.life.length) break; // ライフが無ければ払えない＝不発
          const pick2 = op.pos === 'choose' && act === 'toHand'; // 「ライフの上か下から1枚」＝上下を選べる
          { const lbl = act === 'toHand' ? '手札に加え' : act === 'trash' ? 'トラッシュに置き' : act === 'faceUp' ? '表向きにし' : '裏向きにし'; const where = pick2 ? '上か下から1枚' : '上から1枚'; if (!(await confirmUse(side, 'ライフをコストに', `ライフの${where}を${lbl}て効果を使いますか？`, '使う'))) break; }
          if (act === 'toHand') {
            let fromBottom = false;
            if (pick2 && P.life.length >= 2 && !P.isCPU) fromBottom = (await showPrompt({ title: 'ライフを手札に', text: 'ライフの上か下、どちらの1枚を手札に加えますか？', opts: [{ t: 'ライフ上', v: 'top', primary: true }, { t: 'ライフ下', v: 'bot' }] })) === 'bot';
            P.hand.push(fromBottom ? P.life.pop() : P.life.shift()); flog(side, `ライフ${fromBottom ? '下' : '上'}1枚を手札に加えた`);
          }
          else if (act === 'trash') { P.trash.push(P.life.shift()); flog(side, 'ライフ上1枚をトラッシュ'); }
          else if (act === 'faceUp') { P.life[0]._faceUp = true; flog(side, 'ライフ上を表向きにした'); }
          else if (act === 'faceDown') { P.life[0]._faceUp = false; flog(side, 'ライフ上を裏向きにした'); }
          render();
          await runFx(op.then, ctx);
          break;
        }
        // 自分のキャラ1枚（filter一致）を持ち主のデッキの下に置くコスト。任意。then実行
        case 'deckBottomOwnCharCost': {
          const cands = ownChars(side, opFilter(op));
          if (!cands.length) break;
          if (!(await confirmUse(side, '自キャラをデッキ下', '自分のキャラ1枚をデッキの下に置いて効果を使いますか？', '置いて使う'))) break;
          const t = P.isCPU ? cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0] : await chooseCard(side, cands, 'デッキ下に置くキャラを選択（コスト）', 'ownSmall', true);
          if (!t) break; removeCharTo(t, P.deck); flog(side, `「${t.base.name}」をデッキの下に置いた`); await checkAllyLeave(side, t, 'ownEffect');
          await runFx(op.then, ctx); break;
        }
        // 自分のデッキの上 n枚をトラッシュに置くコスト（任意ミル）。払えた時 then 実行
        case 'deckTrashCost': {
          const n = op.n || 1;
          if (P.deck.length < n) break;
          if (!(await confirmUse(side, 'デッキをトラッシュ', `デッキの上${n}枚をトラッシュに置いて効果を使いますか？`, '置いて使う'))) break;
          for (let i = 0; i < n; i++) P.trash.push(reset(P.deck.shift())); flog(side, `デッキ上${n}枚をトラッシュ`);
          await runFx(op.then, ctx); break;
        }
        // 自分のトラッシュから n枚を 持ち主のデッキの下に置くコスト。払えた時 then 実行
        case 'trashToDeckCost': {
          const n = op.n || 1;
          const movable = P.trash.filter(c => c !== self); // self（このキャラ自身＝KO時の蘇生対象等）は除く
          if (movable.length < n) break;
          if (!(await confirmUse(side, 'トラッシュをデッキ下', `トラッシュ${n}枚をデッキの下に置いて効果を使いますか？`, '置いて使う'))) break;
          for (let i = 0; i < n; i++) { const c = P.trash.find(x => x !== self); if (!c) break; P.trash.splice(P.trash.indexOf(c), 1); P.deck.push(reset(c)); } flog(side, `トラッシュ${n}枚をデッキの下へ`);
          await runFx(op.then, ctx); break;
        }
        // 「以下から1つを選ぶ」モード選択（options:[{label,fx:[...]}]）
        case 'chooseOption': {
          const opts = op.options || []; if (!opts.length) break;
          let idx = 0;
          if (!P.isCPU) { const v = await showPrompt({ title: '効果を選択', text: '以下から1つを選ぶ', opts: opts.map((o, i) => ({ t: o.label || ('選択' + (i + 1)), v: 'opt:' + i })) }); idx = (typeof v === 'string' && v.indexOf('opt:') === 0) ? +v.slice(4) : 0; }
          await runFx(opts[idx].fx, ctx); break;
        }
        // デッキ上1枚を公開し、filter一致なら then を実行（公開はデッキに残す）
        case 'revealTop': {
          if (!P.deck.length) break;
          const top = P.deck[0]; flog(side, `デッキの上を公開: ${top.base.name}`);
          if (matchFilter(top, op.filter || {})) await runFx(op.then, ctx);
          break;
        }
        // 「このターン終了時」に fx を予約発動（登場時等から遅延）
        case 'scheduleTurnEnd': { (G._pendingTurnEnd = G._pendingTurnEnd || []).push({ side, fx: op.fx, self }); break; }
        // self自身をレストにするコスト（onOppAttack等。任意）。払えた時 then を実行
        case 'restSelfCost': {
          if (!self || self.rested) break;
          if (!(await confirmUse(side, '自身をレスト', `「${self.base.name}」をレストにして効果を使いますか？`, 'レストして使う'))) break;
          self.rested = true; flog(side, `「${self.base.name}」をレストにした`); render();
          await runFx(op.then, ctx); break;
        }
        case 'bounceStage': { // ステージ1枚（自分/相手）を持ち主の手札に戻す（任意）
          const stages = []; if (G.players.me.stage) stages.push(G.players.me.stage); if (G.players.cpu.stage) stages.push(G.players.cpu.stage);
          if (!stages.length) break;
          const t = await chooseCard(side, stages, 'ステージ1枚を持ち主の手札に戻す', null, op.optional !== false);
          if (t) { const ow = G.players[t.owner]; ow.stage = null; ow.hand.push(reset(t)); flog(side, `ステージ「${t.base.name}」を持ち主の手札に戻した`); render(); }
          break;
        }
        // 相手はアクティブのドンをn枚ドンデッキに戻してもよい。戻さなかった（戻せない）場合 elseFx を実行
        case 'oppMayReturnDon': {
          const O = G.players[o]; const n = op.n || 1; let returned = false;
          if (O.don.active >= n) {
            let ret = false; // CPUは基本ドンを温存し効果を受ける（ドンの方が価値が高い）
            if (!O.isCPU) ret = (await showPrompt({ title: 'ドンを戻す？', text: `アクティブのドン!!${n}枚をドンデッキに戻しますか？（戻さないと効果を受けます）`, opts: [{ t: `戻す（ドン-${n}）`, v: 'y', primary: true }, { t: '戻さない', v: 'n', ghost: true }] })) === 'y';
            if (ret) { O.don.active -= n; flog(o, `ドン!!-${n}（ドンデッキへ戻した）`); returned = true; render(); }
          }
          if (!returned) await runFx(op.elseFx, ctx);
          break;
        }
        // 相手キャラ1枚を選び、そのコスト＝付与ドン枚数 が一致する場合のみKO
        case 'selectKoIfCostEqualsDon': {
          const cands = oppChars(side, opFilter(op)).filter(c => !isKoImmune(c));
          const t = P.isCPU ? (cands.find(c => (c.base.cost || 0) === (c.attachedDon || 0)) || cands[0]) : await chooseCard(side, cands, '対象の相手キャラを選択', 'oppBig', op.optional !== false);
          if (!t) break;
          if ((t.base.cost || 0) === (t.attachedDon || 0)) { if (!(await protectFromEffect(t, 'ko'))) await koCard(t, 'oppEffect'); }
          else flog(side, `「${t.base.name}」はコストと付与ドン数が一致せずKOされない`);
          break;
        }
        // 相手のトラッシュから filter一致のカードを n枚 デッキの下へ
        case 'oppTrashToBottom': {
          const O = G.players[o];
          for (let i = 0; i < (op.n || 1); i++) { const cands = O.trash.filter(c => matchFilter(c, op.filter || {})); if (!cands.length) break; const t = P.isCPU ? cands[0] : await chooseCard(side, cands, '相手のトラッシュからデッキ下に置くカード', 'oppBig', op.optional); if (!t) break; O.trash.splice(O.trash.indexOf(t), 1); O.deck.push(reset(t)); }
          flog(side, '相手のトラッシュをデッキの下へ'); render(); break;
        }
        // ドン!!デッキから n枚まで コストエリアに追加（mode:'rest'|'active'、donMax上限まで）
        case 'donFromDeck': {
          const room = Math.max(0, P.donMax - donTotal(side));
          const k = Math.min(op.n || 1, room);
          if (op.mode === 'active') P.don.active += k; else P.don.rested += k;
          if (k) flog(side, `ドンデッキからドン${k}枚を${op.mode === 'active' ? 'アクティブ' : 'レスト'}で追加`);
          render(); break;
        }
        // 相手キャラ count枚の【ブロッカー】をこのターン発動不可にする
        case 'denyBlocker': {
          for (let i = 0; i < (op.count || 1); i++) { const cands = oppChars(side, opFilter(op)).filter(c => c.noBlockSeq !== G.turnSeq); const t = P.isCPU ? cands[0] : await chooseCard(side, cands, '【ブロッカー】発動不可にする相手キャラ', 'oppBig', op.optional); if (!t) break; t.noBlockSeq = G.turnSeq; flog(side, `「${t.base.name}」は【ブロッカー】発動不可`); }
          render(); break;
        }
        // 相手キャラ count枚を「レストにできない」状態にする（アタック/ブロック不可・レスト効果対象外）
        case 'restImmune': {
          const until = durSeq(op.duration);
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op)).filter(c => !isRestImmune(c));
            const t = P.isCPU ? cands[0] : await chooseCard(side, cands, 'レストにできない状態にする相手キャラ', 'oppBig', op.optional);
            if (!t) break; t.restImmuneUntil = until; flog(side, `「${t.base.name}」はレストにできない`);
          }
          render(); break;
        }
        // 相手キャラ count枚をアタック不可にする（duration:'untilNextEnd'で次の相手ターン終了まで）
        case 'setAttackBan': {
          for (let i = 0; i < (op.count || 1); i++) { const cands = oppChars(side, opFilter(op)).filter(c => c.noAtkSeq == null); const t = P.isCPU ? cands[0] : await chooseCard(side, cands, 'アタック不可にする相手キャラ', 'oppBig', op.optional); if (!t) break; t.noAtkSeq = durSeq(op.duration); flog(side, `「${t.base.name}」はアタック不可`); }
          render(); break;
        }
        // 自分のキャラ1枚（filter一致）を手札に戻すコスト。任意。払えた時 then を実行
        case 'bounceOwnCharCost': {
          const cands = ownChars(side, opFilter(op));
          if (!cands.length) break;
          if (!(await confirmUse(side, '自キャラを手札へ', '自分のキャラ1枚を手札に戻して効果を使いますか？', '戻して使う'))) break;
          const t = P.isCPU ? cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0] : await chooseCard(side, cands, '手札に戻すキャラを選択（コスト）', 'ownSmall', true);
          if (!t) break; bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'ownEffect');
          await runFx(op.then, ctx); break;
        }
        // 自分のリーダー/ステージ/キャラ（filter一致）1枚をレストにするコスト。任意。払えた時 then を実行
        case 'restOwnAsCost': {
          const pool = [P.leader, P.stage, ...P.chars].filter(c => c && !c.rested && matchFilter(c, opFilter(op)));
          if (!pool.length) break;
          if (!(await confirmUse(side, 'レストにする', 'カード1枚をレストにして効果を使いますか？', 'レストして使う'))) break;
          const t = P.isCPU ? pool[0] : await chooseCard(side, pool, 'レストにするカードを選択（コスト）', 'ownBig', true);
          if (!t) break; t.rested = true; flog(side, `「${t.base.name}」をレストにした`);
          await runFx(op.then, ctx); break;
        }
        // 相手が自身の手札 n枚をデッキの下に置く
        case 'oppHandToBottom': {
          const O = G.players[o]; const n = Math.min(op.n || 1, O.hand.length);
          for (let i = 0; i < n; i++) { let c; if (O.isCPU) c = O.hand.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0))[0]; else c = await chooseFromHand(o, O.hand.slice(), `デッキ下に置く手札（${i + 1}/${n}）`); if (!c) break; O.hand.splice(O.hand.indexOf(c), 1); O.deck.push(reset(c)); }
          if (n) flog(side, `相手は手札${n}枚をデッキの下に置いた`); render(); break;
        }
        // デッキ上 look枚を見て、filter一致のキャラを count枚まで登場、残りをデッキ下(rest:'trash'でトラッシュ)へ
        case 'playCharFromDeck': {
          const look = P.deck.splice(0, op.look || 5);
          const chosen = [];
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = look.filter(c => !chosen.includes(c) && c.base.type === 'CHAR' && matchFilter(c, op.filter) && (!op.distinctName || !chosen.some(x => normName(x.base.name) === normName(c.base.name))));
            if (!cands.length) break;
            const t = P.isCPU ? cands[0] : await chooseCard(side, cands, `デッキ上${op.look || 5}枚から登場させるキャラ（${i + 1}/${op.count || 1}）`, 'ownBig', true);
            if (!t) break; chosen.push(t);
          }
          for (const c of chosen) { const ix = look.indexOf(c); if (ix >= 0) look.splice(ix, 1); await summon(side, c, false); }
          for (const c of look) { if (op.rest === 'trash') P.trash.push(reset(c)); else P.deck.push(c); }
          flog(side, `デッキ上から${chosen.length}体を登場`); render(); break;
        }
        // 相手のドン!!を n枚 ドンデッキに戻す（相手のドン総数を減らす）
        case 'oppDonMinus': { const O = G.players[o]; const k = Math.min(op.n || 1, O.don.active + O.don.rested); for (let i = 0; i < k; i++) { if (O.don.rested > 0) O.don.rested--; else if (O.don.active > 0) O.don.active--; } if (k) flog(side, `相手のドン!!-${k}（ドンデッキへ）`); render(); break; }
        // 相手が自身の手札 n枚を捨てる
        case 'oppDiscard': { const O = G.players[o]; const k = Math.min(op.n || 1, O.hand.length); for (let i = 0; i < k; i++) { let c; if (O.isCPU) c = O.hand.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0))[0]; else c = await chooseFromHand(o, O.hand.slice(), `捨てる手札（${i + 1}/${k}）`); if (!c) break; O.hand.splice(O.hand.indexOf(c), 1); O.trash.push(reset(c)); } if (k) flog(side, `相手は手札${k}枚を捨てた`); render(); break; }
        // 自分のトラッシュから filter一致のカードを count枚 手札に加える
        case 'trashToHand': { for (let i = 0; i < (op.count || 1); i++) { const cands = P.trash.filter(c => matchFilter(c, op.filter || {})); if (!cands.length) break; const t = P.isCPU ? cands[0] : await chooseCard(side, cands, 'トラッシュから手札に加えるカード', 'ownBig', op.optional); if (!t) break; P.trash.splice(P.trash.indexOf(t), 1); P.hand.push(t); flog(side, `「${t.base.name}」を手札に加えた`); } render(); break; }
        // 自分のデッキの上 n枚をトラッシュに置く（ミル）
        case 'deckToTrash': { const k = Math.min(op.n || 1, P.deck.length); for (let i = 0; i < k; i++) P.trash.push(reset(P.deck.shift())); if (k) flog(side, `デッキ上${k}枚をトラッシュ`); render(); break; }
        // 自分の手札またはトラッシュから filter一致のキャラ1枚を登場
        case 'playFromHandOrTrash': {
          const cands = [...P.hand, ...P.trash].filter(c => c.base.type === 'CHAR' && matchFilter(c, op.filter));
          if (!cands.length) break;
          const t = P.isCPU ? cands[0] : await chooseCard(side, cands, '登場させるキャラ（手札/トラッシュ）', 'ownBig', op.optional !== false);
          if (!t) break;
          const fromTrash = !P.hand.includes(t);
          if (P.hand.includes(t)) P.hand.splice(P.hand.indexOf(t), 1); else P.trash.splice(P.trash.indexOf(t), 1);
          await summon(side, t, false, fromTrash ? 'trash' : null); break;
        }
        case 'playEventFromHand': {
          const cands = P.hand.filter(c => matchFilter(c, op.filter) && c.base.fx && c.base.fx.main);
          const c = await chooseFromHand(side, cands, '発動するイベントを選択', null, op.optional !== false); // 「1枚まで」は任意（既定で見送り可）
          if (c) { P.hand.splice(P.hand.indexOf(c), 1); await runFx(c.base.fx.main.fx, { self: c, side }); P.trash.push(reset(c)); flog(side, `「${c.base.name}」を発動`); await luffyReveal(side); }
          break;
        }
        case 'playCharFromHand': {
          const cnt = op.count || 1; const usedNames = [];
          for (let k = 0; k < cnt; k++) {
            let cands = P.hand.filter(c => c.base.type === 'CHAR' && matchFilter(c, op.filter || { maxCost: op.maxCost, maxPower: op.maxPower, trait: op.trait }));
            if (op.needsTrigger) cands = cands.filter(c => c.base.fx && c.base.fx.trigger);
            if (op.distinctName) cands = cands.filter(c => !usedNames.includes(normName(c.base.name))); // 「カード名の異なる」
            const c = await chooseFromHand(side, cands, cnt > 1 ? `登場させるキャラを選択（${k + 1}/${cnt}・任意）` : '登場させるキャラを選択（任意）', null, op.optional || cnt > 1);
            if (!c) break; usedNames.push(normName(c.base.name)); P.hand.splice(P.hand.indexOf(c), 1); await summon(side, c, false);
          }
          break;
        }
        case 'playSpecificFromHand': {
          let cands;
          if (op.nameIncludes) cands = P.hand.filter(x => x.base.name.includes(op.nameIncludes));
          else cands = P.hand.filter(x => x.base.name === op.name);
          const c = op.choose ? await chooseFromHand(side, cands, '登場させるキャラを選択' + (op.optional ? '（任意）' : ''), null, op.optional) : cands[0];
          if (c) { P.hand.splice(P.hand.indexOf(c), 1); await summon(side, c, op.noEnter); }
          break;
        }
        case 'trashToLife': {
          const cands = P.trash.filter(c => c.base.type === 'CHAR' && (c.base.cost || 0) <= (op.maxCost != null ? op.maxCost : 99) && (!op.trait || (c.base.traits || []).includes(op.trait)));
          const c = await chooseCard(side, cands, 'トラッシュからライフ上に置くキャラを選択', 'ownBig', op.optional);
          if (c) { P.trash.splice(P.trash.indexOf(c), 1); const rc = reset(c); if (op.faceUp) rc._faceUp = true; P.life.unshift(rc); floatOn(P.leader.uid, 'LIFE+1', 'heal'); flog(side, `トラッシュの「${c.base.name}」をライフ上に${op.faceUp ? '表向きで' : ''}追加`); await sleep(150); }
          break;
        }
        case 'lifeAddChoose': {
          const look = Math.min(op.look || 3, P.deck.length);
          if (!look) { flog(side, 'デッキが無くライフ追加できない'); break; }
          const top = P.deck.splice(0, look);
          const c = await chooseCard(side, top, `ライフの上に加えるカード（デッキ上${look}枚・任意）`, 'ownBig', true);
          if (c) { const idx = top.indexOf(c); if (idx >= 0) top.splice(idx, 1); if (op.faceUp) c._faceUp = true; P.life.unshift(c); floatOn(P.leader.uid, 'LIFE+1', 'heal'); flog(side, `デッキ上${look}枚から1枚をライフ上に${op.faceUp ? '表向きで' : ''}追加`); }
          for (const r of top) P.deck.push(r); // 残りはデッキの下へ
          await sleep(120);
          break;
        }
        case 'reviveFromTrash': {
          let cands = P.trash.filter(c => c.base.type === 'CHAR' && (c.base.cost || 0) <= (op.maxCost != null ? op.maxCost : 99)); // maxCost未指定はコスト上限なし（filterで絞る）
          if (op.filter) cands = cands.filter(c => matchFilter(c, op.filter));
          const c = await chooseCard(side, cands, 'トラッシュから登場させるキャラ', 'ownBig', true);
          if (c) { P.trash.splice(P.trash.indexOf(c), 1); await summon(side, c, false, 'trash'); if (op.grantKw && P.chars.includes(c)) c.kwGrant.push({ kw: op.grantKw, dur: durTag(op.grantDuration, 'turn') }); }
          break;
        }
        case 'denyBlockerVsLeader': P.denyBlock = true; flog(side, '相手はリーダーへのアタックをブロック不可'); break;
        case 'oppDamage': { for (let i = 0; i < op.n; i++) await dealLeaderDamage(o, { base: {} }, 1, false); break; }
        case 'condBuff': case 'grantUnblockable': case 'unblockableAttack': break; // staticで処理
        default: break;
      }
      return true;
    }
    function kwJa(k) { return { blocker: 'ブロッカー', rush: '速攻', doubleAttack: 'ダブルアタック', unblockable: 'ブロック不可' }[k] || k; }
    function reset(c) { c.attachedDon = 0; c.rested = false; c.buffs = []; c.kwGrant = []; c.frozen = false; c.negSeq = null; c.noAtkSeq = null; c._faceUp = false; return c; }
    function faceDown(c) { if (c) c._faceUp = false; return c; } // 手札→ライフへ戻す時は裏向きに（表向きフラグ残留を防ぐ）

    /* ノラ/レオ系: 自分の元々パワー7000以下のキャラが相手効果で場を離れる時、代わりのコストで防ぐ（自動） */
    async function protectFromEffect(target, cause) {
      if (!target) return false;
      // 「相手の効果ではKOされない」自身の常在: 効果KOのみ無効化（選択・パワー減少等は通すのでバックストップ）
      if (cause === 'ko' && isKoImmune(target)) { flog(target.owner, `「${target.base.name}」は相手の効果ではKOされない`); return true; }
      const ow = G.players[target.owner];
      for (const p of [ow.leader, ...ow.chars]) { // リーダー提供の身代わりも拾う
        if (!p || isNegated(p)) continue; // 効果無効中のキャラは身代わり保護を提供しない
        const st = p.base.fx && p.base.fx.static; if (!st) continue;
        const prot = st.find(o => o.op === 'leaveProtect'); if (!prot) continue;
        if (cause === 'battle') { if (!prot.includeBattle) continue; } // バトルKOは includeBattle 指定時のみ肩代わり（既定の身代わりは効果除去のみ）
        else if (prot.onlyKO && cause && cause !== 'ko') continue; // KO限定の置換は bounce/deckBottom では発動しない
        // 守る対象の制限: targetSelf=このキャラ自身のみ / targetFilter / 無ければ従来の「元々パワー7000以下」
        if (prot.targetSelf) { if (p !== target) continue; }
        else if (prot.targetFilter) { if (!matchFilter(target, prot.targetFilter)) continue; }
        else if ((target.base.power || 0) > 7000) continue;
        if (prot.once === 'turn' && p._protTurn === G.turnSeq) continue; // 【ターン1回】制限
        if (prot.once === 'turn') p._protTurn = G.turnSeq;
        if (prot.pay === 'lifeToHand') { // 自分のライフ上1枚を手札に加えて肩代わり
          if (!ow.life.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `ライフ上1枚を手札に加えて「${target.base.name}」を守りますか？`, '守る（ライフ→手札）', '守らない'))) continue;
          ow.hand.push(ow.life.shift()); flog(target.owner, `【${p.base.name}】ライフ上1枚を手札に加えて「${target.base.name}」を守った`); return true;
        }
        if (prot.pay === 'leaderPowerMinus') { // 自分のリーダーをパワー-Nして肩代わり
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のリーダーをパワー-${prot.amount || 2000}にして「${target.base.name}」を守りますか？`, `守る（リーダー-${prot.amount || 2000}）`, '守らない'))) continue;
          addBuff(ow.leader, -(prot.amount || 2000), 'turnEnd'); floatOn(ow.leader.uid, `-${prot.amount || 2000}`, 'dmg');
          flog(target.owner, `【${p.base.name}】リーダーのパワーを下げて「${target.base.name}」を守った`); return true;
        }
        if (prot.pay === 'restOwnCards') {
          const n = prot.n || 2; const pool = [ow.leader, ...ow.chars].filter(c => c && c !== target && !c.rested);
          if (pool.length < n) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のカード${n}枚をレストにして「${target.base.name}」を守りますか？`, `守る（${n}枚レスト）`, '守らない'))) continue;
          let picks;
          if (ow.isCPU) picks = pool.slice().sort((a, b) => power(a) - power(b)).slice(0, n);
          else { picks = []; for (let i = 0; i < n; i++) { const pk = await chooseCard(target.owner, pool.filter(c => !picks.includes(c)), `レストにするカード（${i + 1}/${n}）`, 'ownSmall', false); if (!pk) break; picks.push(pk); } if (picks.length < n) continue; }
          for (const c of picks) c.rested = true;
          flog(target.owner, `【${p.base.name}】カード${n}枚をレストにして「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'koSelf') {
          // このキャラ(p)自身をKO(代わりにトラッシュへ)して target を守る。p===target は不可
          if (p === target) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${p.base.name}」をKOして「${target.base.name}」を守りますか？`, '守る（このキャラをKO）', '守らない'))) continue;
          removeCharTo(p, ow.trash);
          flog(target.owner, `【${p.base.name}】自身をKOして「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'discardFromHand') {
          const f = prot.discardFilter || {};
          const cands = ow.hand.filter(h => matchFilter(h, f));
          if (!cands.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `手札1枚を捨てて「${target.base.name}」を守りますか？`, '守る（手札を捨てる）', '守らない'))) continue;
          let d;
          if (ow.isCPU) d = cands.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0))[0];
          else { d = await chooseFromHand(target.owner, cands, `「${target.base.name}」を守るため捨てるカードを選択`); if (!d) continue; }
          ow.hand.splice(ow.hand.indexOf(d), 1); ow.trash.push(reset(d));
          flog(target.owner, `【${p.base.name}】「${d.base.name}」を捨てて「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'donToDeck') {
          const P = G.players[target.owner];
          if (P.don.active <= 0 && P.don.rested <= 0) continue; // 戻せるドンが無ければこの供給元では守れない
          // 任意効果（「できる」）: 人間には発動可否を確認
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `ドン1枚をドンデッキに戻して「${target.base.name}」を守りますか？`, '守る（ドン-1）', '守らない'))) continue;
          if (P.don.active > 0) P.don.active--; else P.don.rested--; // active→restの順で1枚ドンデッキへ
          flog(target.owner, `【${p.base.name}】ドンを戻し「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'charToBottom') {
          const others = ow.chars.filter(c => c !== target);
          if (!others.length) continue;
          let sac;
          if (ow.isCPU) sac = others.slice().sort((a, b) => (power(a) - power(b)) || ((a.base.cost || 0) - (b.base.cost || 0)))[0]; // CPUは低価値キャラを犠牲
          else { sac = await chooseCard(target.owner, others, `「${target.base.name}」を守るためデッキ下に置くキャラを選択（守らないならスキップ）`, 'ownSmall', true); if (!sac) continue; }
          removeCharTo(sac, ow.deck);
          flog(target.owner, `【${p.base.name}】「${sac.base.name}」をデッキ下に置き「${target.base.name}」を守った`); return true;
        }
      }
      return false;
    }

