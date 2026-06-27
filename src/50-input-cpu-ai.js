    "use strict";
    /* =========================================================================
       ===============  プロンプト / 入力ハンドラ  =============================
       ========================================================================= */
    function showPrompt(cfg) {
      return new Promise(resolve => {
        G.promptState = {
          title: cfg.title, text: cfg.text, opts: cfg.opts || [], cls: cfg.cls || '',
          // プロンプトの表示/消去は盤面を再描画せず #promptHost だけ更新（クリックごとのちらつき防止）
          pick: v => { G.promptState = null; renderPrompt(); if (cfg.onPick) cfg.onPick(v); resolve(v); }
        };
        renderPrompt();
      });
    }
    function promptPick(i) { const ps = G.promptState; if (!ps) return; const o = ps.opts[i]; if (o) ps.pick(o.v); }

    function effCost(side, c) { let cost = c.base.cost || 0; const m = c.base.costMod; if (m && checkCond(m.cond, side, G.players[side].leader)) cost += m.amount; const P = G.players[side]; const stg = P.stage; if (stg && !isNegated(stg) && stg.base.fx && stg.base.fx.static) for (const o of stg.base.fx.static) { if (o.op === 'playCostReduce' && G.active === side && (c.base.cost || 0) >= (o.minCost || 0) && matchFilter(c, o.filter || {})) cost -= o.amount || 0; } const tr = P._turnPlayCostReduce; if (tr && tr.turn === G.turnSeq && (c.base.cost || 0) >= (tr.minCost || 0) && matchFilter(c, tr.filter || {})) cost -= tr.amount || 0; for (const src of [P.leader, ...P.chars]) { if (!src || isNegated(src) || !src.base.fx || !src.base.fx.static) continue; for (const o of src.base.fx.static) { if (o.op === 'eventCostReduce' && matchFilter(c, o.filter || {})) cost -= o.amount || 0; } } if (c.base.fx && c.base.fx.static) for (const o of c.base.fx.static) { if (o.op === 'handCostCond' && (!o.cond || checkCond(o.cond, side, c))) cost += o.amount || 0; } return Math.max(0, cost); } // ステージ/ターン中/盤面提供の手札プレイコスト軽減＋自身の条件付き手札コスト（P-120/PRB02-014/ST23-002）

    function findCard(uid) {
      for (const s of ['me', 'cpu']) {
        const P = G.players[s];
        const zones = [[P.leader], P.chars, P.hand, P.life, P.deck, P.trash, P.stage ? [P.stage] : []];
        for (const z of zones) for (const c of z) if (c && c.uid === uid) return c;
      }
      return null;
    }

    function onBoardClick(e) {
      const el = e.target.closest('.card[data-uid]'); if (!el) return;
      const uid = +el.getAttribute('data-uid'); const card = findCard(uid); if (!card) return;
      // 効果の対象選択
      if (G.pendingChoice && G.pendingChoice.uids.has(uid)) { const r = G.pendingChoice.res; G.pendingChoice = null; G.promptState = null; r(card); return; }
      if (G.pendingChoice) return; // 選択中は他カード無視
      if (G.promptState) return;  // ボタンプロンプト表示中は盤面クリックを無視（再入・状態破壊防止）
      // アタック対象選択
      if (G.attackSel) {
        if (card === G.attackSel.attacker) { G.attackSel = null; render(); return; }
        if (legalTargets('me', G.attackSel.attacker).includes(card)) { const atk = G.attackSel.attacker; G.attackSel = null; declareAttack(atk, card); }
        return;
      }
      // 自分メイン
      if (G.active === 'me' && G.myActable && !G.busy) {
        const me = G.players.me;
        if (me.hand.includes(card)) { tryPlayHand(card); return; }
        if (card === me.leader || me.chars.includes(card) || card === me.stage) { openOwnMenu(card); return; }
      }
    }

    async function openOwnMenu(card) {
      const P = G.players.me; const b = card.base; const opts = [];
      if (canCardAttack(card)) opts.push({ t: '⚔ アタック', v: 'atk', primary: true });
      if (P.don.active >= 1 && b.type !== 'STAGE') opts.push({ t: '＋ ドンを付与 (残' + P.don.active + ')', v: 'don' });
      if (b.fx && b.fx.act && card._actTurn !== G.turnSeq && !isNegated(card)) opts.push({ t: '起動: ' + b.fx.act.label, v: 'act' });
      if (b.leader === 'enel' && P._enelUsedTurn !== G.turnSeq && P.turnsTaken >= 2) opts.push({ t: '【エネル】ドン追加＆付与', v: 'enel' });
      if (b.leader === 'lucy' && P._lucyDrawTurn !== G.turnSeq && P._lucyEventTurn === G.turnSeq) opts.push({ t: '【ルーシー】1ドロー', v: 'enel' });
      if (opts.length === 0) { toast('今このカードでできる行動はありません'); return; }
      opts.push({ t: '閉じる', v: 'x', ghost: true });
      const v = await showPrompt({ title: b.name, text: 'パワー ' + power(card) + (card.attachedDon ? ' ／ 付与ドン' + card.attachedDon : ''), opts });
      if (v === 'atk') beginAttack(card);
      else if (v === 'don') { await attachDonFlow(card); }
      else if (v === 'act') await activateAbility(card);
      else if (v === 'enel') await leaderActivate('me');
    }
    async function attachDonFlow(card) {
      const P = G.players.me;
      if (P.don.active < 1) { toast('アクティブなドンがありません'); return; }
      if (P.don.active === 1) { card.attachedDon++; P.don.active--; floatOn(card.uid, 'ドン+1', 'buff'); render(); return; }
      const max = P.don.active;
      const base = power(card);
      const opts = [];
      for (let i = 1; i <= max; i++)opts.push({ t: i + '枚 → P' + (base + i * 1000) + (i === max ? '（全部）' : ''), v: String(i), primary: i === max });
      opts.push({ t: 'やめる', v: '0', ghost: true });
      const sel = await showPrompt({ title: card.base.name + ' にドン付与', text: '付与する枚数を選択（現在 P' + base + ' ／ アクティブなドン ' + max + '枚・1枚=+1000）', opts });
      const n = parseInt(sel, 10) || 0;
      if (n > 0) { card.attachedDon += n; P.don.active -= n; floatOn(card.uid, 'ドン+' + n, 'buff'); flog('me', '「' + card.base.name + '」にドン' + n + '枚付与（パワー' + power(card) + '）'); render(); await fireDonAttached('me'); }
    }
    function beginAttack(card) {
      if (legalTargets('me').length === 0) { toast('攻撃できる対象がいません'); return; }
      G.attackSel = { attacker: card }; render(); toast('攻撃対象をクリック');
    }
    function cancelAttackSel() { if (G.attackSel) { G.attackSel = null; render(); } }
    async function activateAbility(card) {
      if (isNegated(card)) { toast('このキャラの効果は無効化されている'); return; }
      const act = card.base.fx.act; const c = act.cost || {};
      // コストは全て検証してから支払う（払った後に中断して払い損になるのを防ぐ）
      if (c.restSelf && card.rested) { toast('既にレスト状態です'); return; }
      if (c.don && G.players.me.don.active < c.don) { toast('ドンが足りません'); return; }
      if (c.don) payDon('me', c.don);
      if (c.restSelf) card.rested = true;
      card._actTurn = G.turnSeq;
      flog('me', '「' + card.base.name + '」の起動効果');
      await fxNote('me', '起動メイン', card.base.name);
      await runFx(act.fx, { self: card, side: 'me' }); render();
    }
    async function tryPlayHand(card) {
      const P = G.players.me; const b = card.base;
      if (b.type === 'CHAR') {
        const cost = effCost('me', card); if (P.don.active < cost) { toast('ドンが足りません'); return; }
        if (P.chars.length >= 5 && !(await trashCharForRoom('me', true))) return; // 5体：枠を空ける（キャンセル可）
        payDon('me', cost); P.hand.splice(P.hand.indexOf(card), 1); await summon('me', card, false);
      } else if (b.type === 'STAGE') {
        const cost = b.cost || 0; if (P.don.active < cost) { toast('ドンが足りません'); return; }
        payDon('me', cost); P.hand.splice(P.hand.indexOf(card), 1);
        if (P.stage) P.trash.push(reset(P.stage)); P.stage = card; card.owner = 'me'; card.rested = false;
        flog('me', 'ステージ「' + b.name + '」を配置');
        if (b.fx && b.fx.onPlay) await runFx(b.fx.onPlay, { self: card, side: 'me' }); render();
      } else if (b.type === 'EVENT') {
        if (!(b.fx && b.fx.main)) { toast('このイベントはメインで使えません'); return; }
        const cost = effCost('me', card); if (P.don.active < cost) { toast('ドンが足りません'); return; }
        payDon('me', cost); P.hand.splice(P.hand.indexOf(card), 1);
        if (b.cost >= 3) P._lucyEventTurn = G.turnSeq; // 【ルーシー】起動メイン条件: 当ターンに元々コスト3以上のイベントを発動
        flog('me', '「' + b.name + '」を使用'); await runFx(b.fx.main.fx, { self: card, side: 'me' }); P.trash.push(reset(card)); render(); await luffyReveal('me'); await fireOppEvent("me");
      }
    }
    function uiEndTurn() { if (G.busy || G.active !== 'me' || !G.myActable || G.promptState || G.pendingChoice) return; G.attackSel = null; G.busy = true; G.myActable = false; render(); endTurn('me'); }
    function setTab(t) { // 部分更新：フル再描画せずパネルの表示切替のみ（ログのスクロール位置を保つ）
      G._tab = t; const hintsActive = t !== 'log';
      const hp = document.getElementById('hintsPanel'), lp = document.getElementById('logPanel');
      if (!hp || !lp) { render(); return; }
      hp.classList.toggle('hidden', !hintsActive); lp.classList.toggle('hidden', hintsActive);
      const tabs = document.querySelectorAll('#side .tab');
      if (tabs[0]) tabs[0].classList.toggle('active', hintsActive);
      if (tabs[1]) tabs[1].classList.toggle('active', !hintsActive);
      if (!hintsActive) { const box = document.getElementById('logbox'); if (box) box.scrollTop = box.scrollHeight; }
    }
    function backToSelect() {
      removeEndScreen(); if (typeof clearBanner === 'function') clearBanner(); if (typeof clearPromptHost === 'function') clearPromptHost();
      G.inGame = false; G.winner = null; G.log = []; G._hints = null; G._aiIntent = null; G._lastCpuSummary = null; G.attackSel = null; G.pendingChoice = null; G.promptState = null; G.busy = false; G.myActable = false;
      ['turnpill', 'aiToggleWrap', 'menuBtn', 'sideToggle'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
      closeHam();
      renderSelect();
    }
    function menuBtnAction() { if (confirm('デッキ選択に戻りますか？（対戦は破棄されます）')) backToSelect(); }
    function toggleSide() { G._sideOpen = !G._sideOpen; const s = document.getElementById('side'); if (s) s.classList.toggle('open', G._sideOpen); }
    function closeSidePanel() { G._sideOpen = false; const s = document.getElementById('side'); if (s) s.classList.remove('open'); }
    function buildHamMenu() {
      let html = '<button class="ham-item" onclick="closeHam();showRules()">ルール</button>';
      if (G.inGame) {
        html += '<button class="ham-item" onclick="closeHam();menuBtnAction()">デッキ選択</button>';
        html += '<button class="ham-item" onclick="closeHam();toggleSide()">情報（CPUの手・ログ）</button>';
        html += '<button class="ham-item" onclick="toggleAiHam()">AI思考 <b style="color:' + (G.aiOn ? 'var(--gold-soft)' : 'var(--muted-2)') + '">' + (G.aiOn ? 'ON' : 'OFF') + '</b></button>';
      }
      return html;
    }
    function toggleHam() { const m = document.getElementById('hamMenu'); if (!m) return; if (m.style.display === 'block') { m.style.display = 'none'; return; } m.innerHTML = buildHamMenu(); m.style.display = 'block'; }
    function closeHam() { const m = document.getElementById('hamMenu'); if (m) m.style.display = 'none'; }
    function toggleAiHam() { G.aiOn = !G.aiOn; const sw = document.getElementById('aiSwitch'); if (sw) sw.classList.toggle('on', G.aiOn); const m = document.getElementById('hamMenu'); if (m && m.style.display === 'block') m.innerHTML = buildHamMenu(); }

    /* =========================================================================
       ===============  CPU 思考（ヒューリスティック）  =========================
       ========================================================================= */
    function scoreChar(c) {
      const pw = c.base.power || 0;
      let s = pw / 1000;
      if (pw >= 6000) s += (pw - 5000) / 1000;   // 大型は盤面支配力を非線形加点（強カードが固定ボーナスに埋もれない／指摘2対策）
      const fx = c.base.fx;
      const isBlk = c.base.blocker || (fx && fx.static && fx.static.some(o => (o.op === 'staticKeyword' || o.op === 'grantKeywordToLeader') && o.kw === 'blocker')) || c.base.condBlocker;
      if (isBlk) s += 3;
      if (fx && fx.onPlay) s += 3;               // 登場時アドバンテージ
      if (fx && fx.onKO) s += 1.5;
      if (fx && fx.act) s += 2;                  // 起動メイン＝継続的アドバンテージ
      if (fx && (fx.onAttack || fx.onOppAttack)) s += 1.5; // アタック時/相手アタック時
      if (fx && fx.onTurnEnd) s += 1;
      if (fx && fx.static && fx.static.some(o => ['oppStaticPowerMod', 'leaveProtect', 'leaderBuffStatic', 'condBuff', 'countBuff', 'staticCost', 'handCounterBuff', 'unblockableAttack'].includes(o.op))) s += 1.5; // 常在の盤面効果
      if (c.base.rush || c.base.doubleAttack || c.base.banish) s += 1.5; // 速攻/ダブルアタック/バニッシュ
      s += (c.base.cost || 0) * 0.3;
      return s;
    }
    // ★黒ヤマト(OP16-079)専用ロジック: 8ヤマト(OP16-096/097)/9モモ(OP16-085)は「素出し」より
    //   「捨ててトラッシュから踏み倒し蘇生(6ヤマトの起動メイン/5モモ+しのぶ/その縁)」する方が強い。
    //   →展開では温存し、捨てる手段では最優先で捨てる（CPUが大型を素出しして弱い問題の対策）。
    function isYamatoLeader(side) { const L = G.players[side] && G.players[side].leader; return !!(L && L.base && L.base.no === 'OP16-079'); }
    function yamatoReviveTarget(no) { return no === 'OP16-096' || no === 'OP16-097' || no === 'OP16-085'; }
    // ★起動メインを「今使う価値があるか」判定（無駄撃ち防止）。CPU(heuristic/puct両方)が条件未達/対象不在/無意味でも起動する問題の対策。
    //   ① 先頭が cond の起動は、条件を満たさない時は使わない（お玉「コスト8以上がいる場合」・6ヤマト「8ヤマトがトラッシュにある場合」等）。
    //   ② 相手キャラを対象にする効果(パワー減/KO/レスト/バウンス)なのに相手キャラが0なら使わない。
    //   ③ ★相手キャラへのパワー減(お玉の-2000等)は「弱体化が役立つ」時だけ使う＝相手ブロッカーがいる or
    //      自分のアタック力(最大アタッカー+付与見込みドン)で「-N後にKO可能になる相手」がいる時のみ。無意味な-2000を撃たない。
    function actWorthUsing(side, c) {
      const fx = c.base.fx && c.base.fx.act && c.base.fx.act.fx;
      if (!fx || !fx.length) return false;
      const first = fx[0];
      if (first.op === 'cond' && first.check && !checkCond(first.check, side, c)) return false;
      const ops = (first.op === 'cond' && Array.isArray(first.then)) ? first.then : fx;
      const P = G.players[side], D = G.players[opp(side)];
      const needOpp = ops.some(o => (o.op === 'powerMod' && o.side === 'opp') || ['ko', 'koZero', 'restChar', 'bounce', 'deckBottom', 'handToBottom'].includes(o.op));
      if (needOpp && D.chars.length === 0) return false;
      const pm = ops.find(o => o.op === 'powerMod' && o.side === 'opp' && (o.amount || 0) < 0);
      if (pm) {
        const dec = -(pm.amount || 0);
        let myAtk = power(P.leader);
        for (const ch of P.chars) if (canCardAttack(ch)) myAtk = Math.max(myAtk, power(ch));
        myAtk += Math.min(4, P.don.active || 0) * 1000;   // アタック時に付与できるドンの概算
        const useful = D.chars.some(t => hasKw(t, 'blocker') || (power(t) > myAtk && power(t) - dec <= myAtk));
        if (!useful) return false;                          // -N してもKOに繋がらない/ブロッカーもいない＝無駄
      }
      return true;
    }
    // 除去/パワー操作を撃つ価値のある相手キャラがいるか（雑魚への浪費を避ける）
    function oppHasWorthyTarget(side) {
      return G.players[opp(side)].chars.some(x => hasKw(x, 'blocker') || power(x) >= 5000 || (x.base.fx && (x.base.fx.onKO || x.base.fx.act)));
    }
    function eventWorth(side, c) {
      const fx = (c.base.fx.main && c.base.fx.main.fx) || [];
      // cond で包まれた効果も中身を展開して見る
      const allOps = []; const collect = arr => { for (const o of arr || []) { allOps.push(o); if (o.then) collect(o.then); if (o.fx) collect(o.fx); if (o.options) for (const op of o.options) collect(op.fx); } };
      collect(fx);
      const has = (...ops) => allOps.some(o => ops.includes(o.op));
      // 相手キャラ除去・妨害系 → 価値ある標的がいる時のみ
      if (has('ko', 'bounce', 'deckBottom', 'restChar', 'koZero', 'lock', 'restImmune', 'setAttackBan', 'denyBlocker', 'negateChoose', 'selectKoIfCostEqualsDon')) return oppHasWorthyTarget(side);
      if (allOps.some(o => o.op === 'powerMod' && o.side === 'opp')) return oppHasWorthyTarget(side);
      // ドロー/サーチ/トラッシュ回収 → 手札が枯れ気味なら撃つ
      if (has('draw', 'search', 'trashToHand', 'lifeToHand', 'lifeSwap')) return G.players[side].hand.length <= 5;
      // 展開/ランプ/相手リソース破壊/自盤面強化 → 基本有用
      if (has('playCharFromHand', 'playCharFromDeck', 'playFromHandOrTrash', 'reviveFromTrash', 'lifeAddFromDeck', 'lifeAddChoose', 'oppLifeToHand', 'oppDamage', 'donFromDeck', 'donAttach', 'donAttachAll', 'setPower', 'giveKeyword', 'activateOwnChar', 'donActivate', 'chooseOption', 'revealTop', 'oppDonAttach', 'oppDiscard', 'oppHandToBottom', 'oppTrashToBottom', 'oppDonMinus')) return true;
      return G.players[side].hand.length <= 3; // 上記以外でも手札が乏しければ撃つ（イベントの塩漬けを避ける）
    }
    // 両用(main/counter)イベントは守りに残す。緊急の除去価値が高い時だけ main を使う（指摘1対策）
    function cpuShouldPlayEvent(side, c, plan) {
      if (!eventWorth(side, c)) return false;
      const mfx = (c.base.fx.main && c.base.fx.main.fx) || [];
      const isRemovalMain = mfx.some(o => ['ko', 'bounce', 'deckBottom', 'restChar', 'koZero', 'lock'].includes(o.op));
      // 相手にルフィ(OP15-119)がいると、価値の低いイベントは相手リーダー/キャラを只で強化するだけ
      if (!isRemovalMain && G.players[opp(side)].chars.some(x => x.base.no === 'OP15-119')) return false;
      if (!(c.base.fx && c.base.fx.counter)) return true; // 非両用はそのまま
      const P = G.players[side];
      if (P.life.length <= 3 || (plan && plan.aggression === 'low')) return false; // 攻められそう→カウンターとして温存
      const fx = (c.base.fx.main && c.base.fx.main.fx) || [];
      const allOps = []; const collect = arr => { for (const o of arr || []) { allOps.push(o); if (o.then) collect(o.then); if (o.fx) collect(o.fx); } };
      collect(fx);
      const isRemoval = allOps.some(o => ['ko', 'bounce', 'deckBottom', 'restChar', 'koZero', 'lock', 'restImmune'].includes(o.op));
      if (isRemoval) return oppHasWorthyTarget(side); // 除去で脅威がいる時のみ
      return plan && plan.aggression === 'high'; // 除去でない両用(ランプ/展開)の main は攻めの局面でのみ能動使用（守勢ならカウンター温存）
    }
    /* 戦術的アタック選択: KO価値・リーダー圧・ドン消費を採点し最良の1手を返す。無ければnull（弱いカードは温存） */
    // 通常対戦(AI off)でも一貫した方針を持たせるローカルプラン（自他ライフ差でアグロ/コントロールを決定）
    function localPlan(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const diff = P.life.length - D.life.length;
      let aggression;
      if (D.life.length <= 2 || diff >= 2) aggression = 'high';        // 相手ライフ僅少 or 自分有利→攻めきる
      else if (diff <= -2 || P.life.length <= 2) aggression = 'low';   // 劣勢→守ってリソース温存
      else aggression = 'mid';
      const removalPriority = D.chars
        .filter(c => hasKw(c, 'blocker') || power(c) >= 6000 || (c.base.fx && (c.base.fx.onKO || c.base.fx.act)))
        .sort((a, b) => power(b) - power(a)).slice(0, 3).map(c => c.base.name);
      return { aggression, removalPriority };
    }
    // 今ターンに相手リーダーを削り切れるか（概算）。届く攻撃数(ダブル=2)から相手の防御(ブロッカー+手札の半分)を引いて判定
    function cpuCanLethal(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const Lp = power(D.leader);
      let don = P.don.active, dmg = 0;
      const needs = [P.leader, ...P.chars].filter(c => canCardAttack(c))
        .map(a => ({ need: Math.max(0, Math.ceil((Lp - power(a)) / 1000)), dmg: hasKw(a, 'doubleAttack') ? 2 : 1 }))
        .sort((x, y) => x.need - y.need);
      for (const n of needs) { if (n.need <= don) { don -= n.need; dmg += n.dmg; } }
      const defense = D.chars.filter(c => !c.rested && hasKw(c, 'blocker')).length + Math.ceil(D.hand.length * 0.5);
      return dmg - defense >= D.life.length + 1;
    }
    // 相手が次の自分のターンに「リーサル級の打点」を出せそうか（概算）＝ブロッカーを守りに温存すべきリスク判定。
    // 真なら「ブロッカーで攻撃して寝かせると次に防げず負ける」リスク高→温存。偽ならリスク低→攻撃に回してよい。
    function oppCanThreatenLethal(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const oppAtk = D.chars.reduce((n, c) => n + (hasKw(c, 'doubleAttack') ? 2 : 1), 0) + 1; // 相手の次ターン攻撃数(盤面のみ・過剰温存を避け明確なリスクだけ拾う)
      const myActiveBlk = P.chars.filter(c => hasKw(c, 'blocker') && !c.rested).length;        // 守りに使えるブロッカー
      return oppAtk >= P.life.length + Math.max(0, myActiveBlk - 1);                            // 1枚攻撃に回した後でも守り切れない＝危険
    }
    function cpuPickAttack(side, plan) {
      const P = G.players[side], D = G.players[opp(side)];
      const Lp = power(D.leader);
      const spare = Math.max(0, P.don.active - ((plan && plan.donReserve) || 0)); // 守り用に残すドンは攻めで使わない
      const attackers = [P.leader, ...P.chars].filter(c => canCardAttack(c));
      if (!attackers.length) return null;
      const lowLife = P.life.length <= 2;                 // 自分が劣勢→ブロッカーは守りに残す
      // ★CPU改良（測定駆動・採用済）: ブロッカー温存を「ライフ≤2」だけでなく「相手が次ターンにリーサルを出せるか(盤面リスク)」でも判断。
      //   ＝ライフに余裕があっても相手盤面が脅威ならブロッカーで攻撃して寝かせない（自滅防止）。有意な悪化は無く、teach対enel等で+4〜5pt。
      const holdBlk = lowLife || oppCanThreatenLethal(side);
      const pri = ((plan && Array.isArray(plan.removalPriority)) ? plan.removalPriority : []).filter(n => typeof n === 'string' && n.trim().length > 0).map(n => n.trim());
      const aggr = plan && plan.aggression;
      const lethal = plan && plan.lethal;                 // リーサル成立時は全攻撃をリーダーに集中
      const oppActiveBlockers = D.chars.filter(c => !c.rested && hasKw(c, 'blocker')).length;
      let best = null;
      for (const a of attackers) {
        const pw = power(a);
        const isBlk = a !== P.leader && hasKw(a, 'blocker');
        const dbl = hasKw(a, 'doubleAttack');
        // (1) 相手レストキャラのKO：ブロッカー除去は高優先／既に仕事を終えたレスト雑魚は低価値、ドン付与KOは強く抑制
        if (!lethal) for (const c of D.chars) {
          if (!c.rested) continue;
          const donNeed = Math.max(0, Math.ceil((power(c) - pw) / 1000));
          if (donNeed > spare) continue;                  // ドンを足しても届かない→対象外
          const cBlk = hasKw(c, 'blocker');
          let score = cBlk ? (28 + power(c) / 700 + (c.base.cost || 0) * 1.2)   // ブロッカー＝ライフ圧の栓。除去は最優先級
                           : (7 + power(c) / 1500 + (c.base.cost || 0) * 0.5);  // レスト済み雑魚の除去は低価値（heur2でKO価値↑↓を測定→7が最適と確認）
          if (pri.some(n => c.base.name.includes(n) || n.includes(c.base.name))) score += 12;
          score -= donNeed * (cBlk ? 3 : 9);              // 雑魚をドン付与で倒すのはテンポ損→強く減点（指摘3対策）
          if (isBlk && holdBlk) score -= 30;
          if (!best || score > best.score) best = { attacker: a, target: c, score, donNeed };
        }
        // (2) リーダーへアタック＝勝ち筋。ライフが減るほど価値が跳ね上がる
        const donL = Math.max(0, Math.ceil((Lp - pw) / 1000));
        if (donL <= spare && canTargetLeader(a)) {
          const L = D.life.length;
          let score = 18 + (L <= 4 ? 4 : 0) + (L <= 3 ? 8 : 0) + (L <= 2 ? 20 : 0) + (L <= 1 ? 30 : 0);
          if (lethal) score += 100;                       // リーサル時はリーダー集中
          if (dbl) score += 12 + (L <= 2 ? 16 : 0);       // ダブルアタックはライフ2枚＝詰めに直結
          if (hasKw(a, 'banish')) score += 4;             // トリガー回避
          if (isUnblockable(a) && oppActiveBlockers > 0) score += 6;
          if (aggr === 'high') score += 8; else if (aggr === 'low') score -= 5;
          score -= donL * 2;                              // 付与は控えめ減点（リーダー圧は基本得）
          // ★採用(ユーザー観察・4ドン付与同値の抑制): 低パワー役に2ドン以上付与してリーダーへ同値アタックは、相手がカウンター1枚(手札>0)で
          //   防げて付与ドンを丸ごと使い切る大損(probe実測 enel16→4・lucy9→5に削減)。詰め(lethal)・相手手札0(防げない)は別。
          //   measure-matchupは teach±0/enel-1.7pt(1局ノイズ・p1.0)＝勝率中立だが明確な無駄手を消す目的で候補から除外。全リーダーのheuristic/puctロールアウトに効く。
          if (donL >= 2 && !lethal && D.hand.length > 0) continue;
          // ★CPU改良（測定駆動・採用済・ユーザー観察由来）: この攻撃役が「フリー(ドン不要)でレストキャラをKOできる」のに
          //   2ドン+を付与して顔1点を取るのは損→そのリーダー攻撃を抑制し、フリーのボード除去を優先させる。
          //   低相手ライフ(+20/+30の加点)では加点が勝ち顔殴りのまま＝詰めは優先（自己対戦で害なし・改善4/退行1）。
          if (donL >= 2 && D.chars.some(c => c.rested && power(c) <= pw)) score -= 12;
          if (isBlk && holdBlk) score -= 30;
          if (!best || score > best.score) best = { attacker: a, target: D.leader, score, donNeed: donL };
        }
      }
      if (!best || best.score <= 0) return null;            // 価値ある攻撃が無ければ終了
      for (let i = 0; i < best.donNeed && P.don.active > 0; i++) { best.attacker.attachedDon++; P.don.active--; }
      return { attacker: best.attacker, target: best.target };
    }
    async function heuristicTurn(side) {
      side = side || 'cpu'; const P = G.players[side];
      let plan = localPlan(side); // aiOff でも一貫方針を持つ
      // ★Claudeは「CPUの実手番に1回」だけ。puct探索のロールアウト中(_sim)は呼ばない（大量呼び出し/遅延/上限を防ぐ）。
      if (G.aiOn && !G._sim) {
        render(); showThinking(true);
        const aip = await aiThink(side).catch(() => null);
        showThinking(false);
        if (aip) {
          plan = Object.assign({}, plan, aip);
          const parts = [];
          if (aip.intent) parts.push(aip.intent);
          if (aip.aggression) parts.push('攻め:' + aip.aggression);
          if (aip.removalPriority && aip.removalPriority.length) parts.push('除去:' + aip.removalPriority.join('・'));
          if (parts.length) showAIIntent(parts.join(' ／ '));
        } else {
          // AI応答なし＝無音失敗を可視化（原因の典型: 未ログイン/セッション切れ=401, 通信不可, 1日上限=429, APIキー未設定）
          toast('🤖 AI応答なし（ログイン状態・通信・1日上限・APIキーを確認）');
        }
      }
      if (G._planOverride) plan = Object.assign(plan, G._planOverride); // MCTSが戦術方針(aggression/donReserve等)を上書きして探索する
      await sleep(350);
      // 1) キャラ展開
      let g = 0;
      while (g++ < 12) {
        const pl = (() => {
          if (P._noPlayTurn === G.turnSeq) return [];
          let cand = P.hand.filter(c => c.base.type === 'CHAR' && !summonBanned(side, c) && effCost(side, c) <= P.don.active);
          // ★黒ヤマト: 8ヤマト/9モモは素出しせず温存（捨ててトラッシュから踏み倒す方が強い）。他に出せる手があるなら大型は出さない。
          if (isYamatoLeader(side)) { const alt = cand.filter(c => !yamatoReviveTarget(c.base.no)); if (alt.length) cand = alt; }
          return cand.sort((a, b) => scoreChar(b) - scoreChar(a));
        })();
        if (!pl.length) break;
        const c = pl[0];
        if (P.chars.length >= 5) {
          // 盤面が埋まっている：最弱キャラより十分強い時だけ入れ替え（無駄な入れ替えはしない）
          const worst = P.chars.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0];
          if (!worst || scoreChar(c) <= scoreChar(worst) + 1) break;
          removeCharTo(worst, P.trash);
          flog(side, `「${worst.base.name}」をトラッシュに送った`);
        }
        payDon(side, effCost(side, c)); P.hand.splice(P.hand.indexOf(c), 1);
        await summon(side, c, false); await sleep(240);
        if (G.winner) return;
      }
      // 2) イベント
      g = 0;
      while (g++ < 8) {
        const evs = P._noPlayTurn === G.turnSeq ? [] : P.hand.filter(c => c.base.type === 'EVENT' && c.base.fx && c.base.fx.main && effCost(side, c) <= P.don.active && cpuShouldPlayEvent(side, c, plan));
        if (!evs.length) break;
        const c = evs.sort((a, b) => (b.base.cost || 0) - (a.base.cost || 0))[0];
        payDon(side, effCost(side, c)); P.hand.splice(P.hand.indexOf(c), 1);
        if (c.base.cost >= 3) P._lucyEventTurn = G.turnSeq;
        flog(side, '「' + c.base.name + '」を使用'); await fxNote(side, '効果使用', c.base.name); await runFx(c.base.fx.main.fx, { self: c, side }); P.trash.push(reset(c)); render(); await luffyReveal(side); await sleep(260); await fireOppEvent(side);
        if (G.winner) return;
      }
      // 3) 起動効果（エネル等）。エネルのリーダー効果は第2ターン以降ほぼ常に得（ドンランプ＋付与）なので毎ターン使う
      if (P.leader.base.leader === 'enel' && P.turnsTaken >= 2 && P._enelUsedTurn !== G.turnSeq) await leaderActivate(side);
      // 起動メインはキャラだけでなくステージ（ハチノス/マリンフォード等）も対象にする
      for (const c of [P.leader, ...P.chars, ...(P.stage ? [P.stage] : [])]) { if (c.base.fx && c.base.fx.act && c._actTurn !== G.turnSeq && !isNegated(c)) { const cost = c.base.fx.act.cost || {}; if ((!cost.don || P.don.active >= cost.don) && (!cost.restSelf || !c.rested) && actWorthUsing(side, c)) { if (cost.don) payDon(side, cost.don); if (cost.restSelf) c.rested = true; c._actTurn = G.turnSeq; await fxNote(side, '起動メイン', c.base.name); await runFx(c.base.fx.act.fx, { self: c, side }); await sleep(160); } } }
      // 4) アタック（リーサルが見えたらリーダー集中、そうでなければ盤面と圧を使い分け）
      if (canAttackThisTurn(side)) {
        if (cpuCanLethal(side)) { plan.lethal = true; plan.donReserve = 0; }
        else if (!G._sim && typeof requiredReserveSim === 'function') {
          // ★案B: 「相手の次ターン最善攻めに耐える最小ドン」を決定化シミュで算出して温存。
          //   耐えられない/脅威なし→0（攻め切る）。Claude/方針の温存値とは大きい方を採用（安全側）。
          const need = await requiredReserveSim(side, { samples: G._reserveSamples || 10, risk: 0.12, maxR: 4 });
          plan.donReserve = Math.max(plan.donReserve || 0, need);
        }
        render(); await sleep(200);
        // Stage B: npolicyエージェント時はアタック着手を学習方策で選ぶ（未学習なら下のcpuPickAttackへフォールバック）
        const usePol = G._polAttack && typeof pickPolicyModel === 'function' && pickPolicyModel(side);
        let a = 0;
        while (a++ < 12) {
          if (G._polImprove && typeof improvedAttack === 'function') {
            // Stage C(DAgger): 教師＝1-ply価値先読みが「正解ラベル」を出す（improvedAttackはフックで記録）。
            // 状態分布は【生徒】が作る＝着手は方策ネット(未学習ならheuristic)で実行。世代ごとに分布が動く＝真の反復。
            await improvedAttack(side, plan);                       // 教師ラベル記録（戻り値は使わない）
            const pick = (typeof pickPolicyModel === 'function' && pickPolicyModel(side)) ? policyPickAttack(side, plan) : cpuPickAttack(side, plan);
            if (!pick) break;
            await declareAttack(pick.attacker, pick.target);
            if (G.winner) return;
            await sleep(300); continue;
          }
          const pick = usePol ? policyPickAttack(side, plan) : cpuPickAttack(side, plan);
          if (!pick) break;
          await declareAttack(pick.attacker, pick.target);
          if (G.winner) return;
          await sleep(300);
        }
      }
      await sleep(200);
    }

    /* =========================================================================
       ===============  エージェントseam（意思決定の差し替え点）  ================
       各プレイヤーの「能動ターン」をエージェントで差し替え可能にする最小の仕組み。
       既定は heuristic（従来CPU）。arena/将来のMCTSは P.agent を変えるだけで差し込める。
       反応（ブロック/カウンター/効果対象）は isCPU 経路で自動解決されるため、
       L1ではまず能動ターンのみ差し替え対象にする（block/pick の差し替えは将来追加）。
       ========================================================================= */
    function agentName(side) { const P = G.players[side]; return (P && P.agent) || 'heuristic'; }
    // ランダム合法手プレイヤー（測定系の健全性確認・弱いベースライン）。
    async function randomTurn(side) {
      side = side || 'cpu'; const P = G.players[side];
      let steps = 0;
      while (steps++ < 40 && !G.winner) {
        const acts = [];
        for (const c of P.hand) {
          const b = c.base;
          if (P._noPlayTurn === G.turnSeq) break; // このターン手札からプレイ不可（OP13-028）
          if (b.type === 'CHAR' && !summonBanned(side, c) && effCost(side, c) <= P.don.active && P.chars.length < 5) acts.push({ k: 'char', c });
          else if (b.type === 'STAGE' && (b.cost || 0) <= P.don.active) acts.push({ k: 'stage', c });
          else if (b.type === 'EVENT' && b.fx && b.fx.main && effCost(side, c) <= P.don.active) acts.push({ k: 'event', c });
        }
        for (const c of [P.leader, ...P.chars, ...(P.stage ? [P.stage] : [])]) { // リーダーの fx.act（番号キーの起動メインリーダー）も対象
          if (c.base.fx && c.base.fx.act && c._actTurn !== G.turnSeq && !isNegated(c)) {
            const cost = c.base.fx.act.cost || {};
            if ((!cost.don || P.don.active >= cost.don) && (!cost.restSelf || !c.rested)) acts.push({ k: 'act', c });
          }
        }
        if (canAttackThisTurn(side)) for (const a of [P.leader, ...P.chars].filter(canCardAttack))
          for (const t of legalTargets(side, a)) acts.push({ k: 'atk', c: a, t });
        if (!acts.length) break;
        acts.push({ k: 'stop' });                       // いつでも終了できる（合法手＝何もしない）
        const p = acts[rng() * acts.length | 0];
        if (p.k === 'stop') break;
        if (p.k === 'char') { payDon(side, effCost(side, p.c)); P.hand.splice(P.hand.indexOf(p.c), 1); await summon(side, p.c, false); }
        else if (p.k === 'stage') { payDon(side, p.c.base.cost || 0); P.hand.splice(P.hand.indexOf(p.c), 1); if (P.stage) P.trash.push(reset(P.stage)); P.stage = p.c; p.c.owner = side; p.c.rested = false; if (p.c.base.fx && p.c.base.fx.onPlay) await runFx(p.c.base.fx.onPlay, { self: p.c, side }); }
        else if (p.k === 'event') { payDon(side, effCost(side, p.c)); P.hand.splice(P.hand.indexOf(p.c), 1); await runFx(p.c.base.fx.main.fx, { self: p.c, side }); P.trash.push(reset(p.c)); await fireOppEvent(side); }
        else if (p.k === 'act') { const cost = p.c.base.fx.act.cost || {}; if (cost.don) payDon(side, cost.don); if (cost.restSelf) p.c.rested = true; p.c._actTurn = G.turnSeq; await runFx(p.c.base.fx.act.fx, { self: p.c, side }); }
        else if (p.k === 'atk') { await declareAttack(p.c, p.t); }
      }
    }
    // heur2 = heuristic ＋ 実験的改良（各意思決定関数が isHeur2(side) で分岐）。measure-matchupで heuristic とA/B比較し、
    //   有意に勝った改良だけ本採用（フラグを外して既定化）する＝測定駆動の改良ループ。詳細 docs/ai-design.md §7。
    function isHeur2(side) { return !!(G.players[side] && G.players[side].agent === 'heur2'); }
    const AGENTS = {
      heuristic: { takeTurn: heuristicTurn },
      random: { takeTurn: randomTurn },
      heur2: { takeTurn: heuristicTurn }   // 能動ターンは同じ。差は isHeur2 で分岐する各種ヒューリスティック改良
    };
    // 能動ターンのエントリ。beginTurn から side を受けて、そのサイドのエージェントに委譲。
    async function cpuTurn(side) {
      side = side || 'cpu';
      G._cpuLogStart = G.log.length; // このCPUターンのログ開始位置（観戦サマリ用）
      const a = AGENTS[agentName(side)] || AGENTS.heuristic;
      const r = await a.takeTurn(side);
      buildCpuSummary();
      return r;
    }
    // 直前のCPUターンの行動を要約してサイドパネルにピン留め（消える fxNote を補い、後から追える）
    function buildCpuSummary() {
      const start = G._cpuLogStart || 0;
      const lines = G.log.slice(start).filter(l => l.cls === 'cpu').map(l => (l.html || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const seen = new Set(); const out = [];
      for (const t of lines) { if (seen.has(t)) continue; seen.add(t); out.push(t); }
      G._lastCpuSummary = out.slice(-8);
    }

    /* =========================================================================
       ===============  AI 連携 (Anthropic API)  ===============================
       ========================================================================= */
    // ローカル中継(tools/llm-proxy.js)経由でClaudeを呼ぶ。鍵はproxy側のenvに保持（ブラウザ/リポジトリに出さない）、
    // CORSもproxyが解放するので file:// から叩ける。proxy未起動なら即nullでheuristicへフォールバック（ハングしない）。
    var LLM_PROXY = 'http://127.0.0.1:8787';   // tools/llm-proxy.js の待受。未起動＝接続拒否で即失敗→heuristic
    var LLM_MODEL = 'claude-sonnet-4-6';        // 構造化戦略(set_strategy)。opus は遅く高コストなので sonnet を既定（opts.modelで上書き可）
    var LLM_MODEL_FAST = 'claude-haiku-4-5-20251001'; // 軽い助言(防御アドバイス/予測/intent)用。安価・低レイテンシ。戦略はSonnet据置
    var LLM_MIN_GAP = 1200; // 連続呼び出しの最小間隔(ms)。短時間バーストでAnthropicのレート制限(429)に当たるのを防ぐ
    // ★OPCGの判断原則（プロンプト共有）。これを渡さないとClaudeは「何を基準に方針を決めるか」が分からない。
    //   公式ルール準拠の一般原則のみ（個別カードの正誤は別途・盤面JSONの効果文で補う）。
    var OPCG_PRINCIPLES = [
      '【ワンピカードの判断原則】',
      '①勝利条件=相手リーダーのライフ0+さらに1点を通す。アタックは原則リーダー狙い(ライフを削る)。ただし放置が危険な相手キャラはKO/レストで処理する。',
      '②ドンはターン毎+1(最大10)。アクティブなドンは「アタック増強(+1000/1ドン)」と「相手ターンの防御」で共有する資源。基本は使い切るが、次に詰められそうなら防御用に温存する。',
      '③ライフも資源。アタックを受けて手札/カウンターを温存する選択も強い。ただし残りライフが少ない=リーサル圏で危険。',
      '④手札=防御力。カウンター(+1000/+2000)とカウンターイベントは手札から払う。手札が薄いと守れない。アグロは相手の手札を枯らして攻め切る/コントロールは手札を蓄えて受け切る。',
      '⑤ブロッカーは相手の1アタックを肩代わり(受けが強い)。アクティブなキャラ数=自分の次の攻撃回数。アタックしたキャラはレストして守りに使えなくなる。',
      '⑥テンポ(早い盤面・圧力)と手札枚数(息の長さ)はトレードオフ。先攻はテンポ有利/後攻は初動ドンが1枚多い。',
      '⑦同コスト帯ならバニラより、効果(登場時/起動/KO時/トリガー)・ブロッカー・速攻・Wアタック・大型といった「質」の高いカードを優先。',
      '⑧リーサル(相手ライフ0+ブロッカー突破)が見えたら全ドンで詰める。見えないなら無理せず盤面と手札を維持して次ターンに繋ぐ。'
    ].join('\n');
    async function callClaude(system, user, opts) {
      opts = opts || {};
      if (G._proxyUp === false) return null;   // このセッションでproxyダウン確認済→9s待たず即フォールバック
      // バースト抑制: 直近の呼び出しから最低 LLM_MIN_GAP 空ける（callClaudeはエンジン内で逐次awaitされる）
      const nowGap = Date.now(); const wait = Math.max(0, (G._lastClaudeAt || 0) + LLM_MIN_GAP - nowGap);
      if (wait > 0) await sleep(wait);
      G._lastClaudeAt = Date.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), opts.timeout || 9000); // 応答ハングでCPUターンが固まらないようタイムアウト
      try {
        const body = { model: opts.model || LLM_MODEL, max_tokens: opts.max_tokens || 1024, system, messages: [{ role: "user", content: user }] };
        if (opts.tools) { body.tools = opts.tools; body.tool_choice = opts.tool_choice; } // 構造化出力(tool-use)用。Phase2で使用
        const res = await fetch(LLM_PROXY + "/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: ctrl.signal
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const d = await res.json();
        G._proxyUp = true;
        if (opts.tools) { const tu = (d.content || []).find(b => b.type === 'tool_use'); return tu ? tu.input : null; } // tool-use=構造化オブジェクト
        return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join("\n");
      } catch (e) {
        // タイムアウト(abort)とHTTPエラー(API NNN)は一時的＝無効化しない。それ以外(接続不可/fetch不在/CORS)は
        // proxyダウン扱いでこのセッション中スキップ（次ターン以降9s待たず即heuristic）。
        const msg = (e && (e.message || e.name)) || '';
        if (!/abort/i.test(msg) && !/^API \d/.test(msg)) G._proxyUp = false;
        return null;
      } finally { clearTimeout(tid); }
    }
    // proxy生存確認（任意・先読み用）。G._proxyUp に結果をキャッシュ。
    async function llmHealth() {
      if (G._proxyUp != null) return G._proxyUp;
      try {
        const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(LLM_PROXY + '/healthz', { signal: ctrl.signal }); clearTimeout(tid);
        G._proxyUp = !!(res && res.ok);
      } catch (e) { G._proxyUp = false; }
      return G._proxyUp;
    }
    function parseJSON(txt) {
      if (!txt) return null; let s = txt.replace(/```json/g, '').replace(/```/g, '').trim();
      const a = s.search(/[\[{]/); if (a < 0) return null;
      const open = s[a]; const close = open === '[' ? ']' : '}'; const b = s.lastIndexOf(close);
      if (b < a) return null; s = s.slice(a, b + 1); try { return JSON.parse(s); } catch (e) { return null; }
    }
    // ★カードの「質」をClaudeに伝える共有記述子。キーワード/カウンター値/効果の有無は判断の核。
    function kwTags(c) {
      const t = [];
      if (hasKw(c, 'blocker')) t.push('ブロッカー');
      if (hasKw(c, 'rush')) t.push('速攻');
      if (hasKw(c, 'doubleAttack')) t.push('Wアタック');
      if (hasKw(c, 'banish')) t.push('バニッシュ');
      return t;
    }
    function effTags(b) { // b=card.base。効果の発動タイミングを短縮表記（質の指標）
      const t = [], fx = b.fx || {};
      if (fx.onPlay) t.push('登場時'); if (fx.act) t.push('起動'); if (fx.onKO) t.push('KO時');
      if (fx.trigger) t.push('トリガー'); if (fx.onAttack) t.push('アタック時'); if (fx.onBlock) t.push('ブロック時');
      return t;
    }
    // 盤面のキャラ1行（両者可視）: 名前(Pパワー/Cカウンター/レスト/付与ドン/キーワード・効果)
    function boardLine(c) {
      const tg = kwTags(c).concat(effTags(c.base));
      return c.base.name + '(P' + power(c) + (c.base.counter ? '/C' + c.base.counter : '') + (c.rested ? '/レスト' : '') + (c.attachedDon ? '/ドン' + c.attachedDon : '') + (tg.length ? '/' + tg.join('・') : '') + ')';
    }
    // 手札のカード1行（自分のみ）: 名前[種別/コスト/Pパワー/Cカウンター/キーワード/効果文抜粋] ＝何が打てるかをClaudeに渡す最重要情報
    function handLine(side, c) {
      const b = c.base, tg = kwTags(c).concat(effTags(b));
      const head = b.type === 'EVENT' ? 'イベ/c' + effCost(side, c) : b.type === 'STAGE' ? 'ステージ/c' + effCost(side, c) : 'c' + effCost(side, c) + '/P' + (b.power || 0);
      const tx = (b.text || '').replace(/\s+/g, '').slice(0, 70);
      return b.name + '[' + head + (b.counter ? '/C' + b.counter : '') + (tg.length ? '/' + tg.join('・') : '') + (tx ? '/' + tx : '') + ']';
    }
    function stateForAI(includeCpuHand) {
      const me = G.players.me, cpu = G.players.cpu;
      const st = {
        turn: G.turnDisp,
        cpu: {
          leader: cpu.leader.base.name, deckType: cpu.meta.name, life: cpu.life.length, handCount: cpu.hand.length,
          don: cpu.don.active + '/' + (cpu.don.active + cpu.don.rested + attachedSum(cpu)),
          chars: cpu.chars.map(boardLine), stage: cpu.stage ? cpu.stage.base.name : null
        },
        me: {
          leader: me.leader.base.name, deckType: me.meta.name, life: me.life.length, handCount: me.hand.length,
          don: me.don.active + '/' + (me.don.active + me.don.rested + attachedSum(me)),
          chars: me.chars.map(boardLine), hand: me.hand.map(c => handLine('me', c))   // 防御助言でカウンター値が見えるよう手札を詳細化
        }
      };
      if (includeCpuHand) st.cpu.hand = cpu.hand.map(c => handLine('cpu', c));
      return st;
    }
    function showAIIntent(t) { G._aiIntent = escapeHTML(t); render(); }
    async function aiThink(side) {
      if (!G.aiOn) return null;
      const st = stateForAI(true);
      const sys = 'あなたはワンピースカードゲーム(スタンダード)のCPUプレイヤーです。自分(cpu)の手番で、相手(me)の次ターンも読み最善の方針を立てます。\n' + OPCG_PRINCIPLES + '\n出力は日本語のJSONオブジェクトのみ。マークダウンや説明文は一切禁止。形式:{"intent":"40字以内の具体的な方針","removalPriority":["除去したい相手キャラ名(なければ空配列)"],"aggression":"high|mid|low"}';
      const usr = '現在の状況(JSON):\n' + JSON.stringify(st) + '\nあなたはcpu。上の原則と盤面に即したintentを1文で。';
      const txt = await callClaude(sys, usr, { model: LLM_MODEL_FAST });
      return parseJSON(txt);
    }
    // ★人間向けAI助言は廃止（ユーザー要望）。Claudeは「CPUの戦略(hybrid)」に専念し、人間の防御(カウンター/トリガー)へは助言しない。
    //   呼び出し側(counterStep/askTrigger)は戻り値''を text に連結するだけなので無害（Claudeを一切呼ばない）。
    async function defenseAdvice() { return ''; }
    async function predictCPU() {
      if (G._predicting || !G.inGame || G.winner) return;
      G._predicting = true; render();
      try {
        G._hints = heuristicHints().slice(0, 3);   // ★Claude予測は廃止＝CPUの手読みはローカルheuristicのみ（ClaudeはCPU戦略=hybridに専念）
      } catch (e) { G._hints = heuristicHints(); }
      G._predicting = false; render();
    }
    function heuristicHints() {
      const cpu = G.players.cpu, me = G.players.me; const out = [];
      if (me.chars.some(c => power(c) >= 5000)) out.push({ prob: '高', title: 'こちらの大型キャラを除去', desc: '盤面の脅威を処理する定石', warn: true });
      out.push({ prob: me.life.length <= 2 ? '高' : '中', title: 'リーダーへ複数回アタック', desc: 'あなたのライフ' + me.life.length + '。攻めの圧力に注意', warn: me.life.length <= 2 });
      if (cpu.hand.length >= 4) out.push({ prob: '中', title: '大型キャラを展開', desc: '手札' + cpu.hand.length + '枚。盤面を強化してくる可能性', warn: false });
      if (cpu.chars.filter(c => hasKw(c, 'blocker')).length === 0 && me.chars.length > 0) out.push({ prob: '中', title: 'ブロッカーを設置', desc: '守りを固めてくる可能性', warn: false });
      return out.slice(0, 3);
    }
    function refreshHints() { if (G.aiOn) predictCPU(); }

    /* =========================================================================
       ===========  Phase2: ハイブリッド戦略フェッチ（Claude→戦略オブジェクト）  ===========
       Claudeに「高レベル戦略(評価シェイピング/優先度/方針)」だけを構造化出力で出させ、探索(puct)へ注入する。
       戦術(リーサル/カウンター/アタック順)はエンジンが担うのでlethal等は要求しない。
       ・結果は (リーダー|相手|ターン帯|ライフ) でキャッシュ＝再現性(決定的測定)＋コスト償却。
       ・proxy未起動/失敗時は null（呼び出し側で凍結プロファイル or puct にフォールバック）。 ========= */
    var LLM_CACHE = {};   // 戦略キャッシュ（モジュール常駐＝局リセット/clone跨ぎで保持。Gには載せない）
    function loadLLMCache(obj) { if (obj) Object.assign(LLM_CACHE, obj); }  // fixture/事前ウォームを流し込む（測定の決定化）
    function strategyKey(side) {
      const P = G.players[side], D = G.players[opp(side)];
      // ★盤面シグネチャを含める＝同ターン帯でも盤面/脅威/ドンが大きく変われば戦略を再問い合わせ（古い方針の使い回しを防ぐ）。
      const band = p => p >= 9000 ? 'h' : p >= 7000 ? 'm' : p > 0 ? 'l' : '0';
      const maxOpp = D.chars.reduce((m, c) => Math.max(m, power(c)), 0);
      return leaderKeyOf(side) + '|' + leaderKeyOf(opp(side)) + '|t' + Math.min(G.turnDisp || 1, 8)
        + '|L' + P.life.length + '-' + D.life.length
        + '|c' + P.chars.length + '-' + D.chars.length + '|o' + band(maxOpp) + '|d' + Math.min(P.don.active || 0, 10);
    }
    // Claudeの返り値を安全な範囲にクランプ（極端値で探索が壊れるのを防ぐ）。lethalは無視＝戦術はエンジン。
    function sanitizeShape(o) {
      if (!o || typeof o !== 'object') return null;
      const clamp = (x, lo, hi, d) => { x = +x; return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
      const sh = o.shape || {}, pb = o.priorBias || {};
      const out = {
        aggression: (['high', 'mid', 'low'].indexOf(o.aggression) >= 0) ? o.aggression : 'mid',
        donReserve: Math.round(clamp(o.donReserve, 0, 6, 0)),
        intent: typeof o.intent === 'string' ? o.intent.slice(0, 60) : '',
        removalPriority: Array.isArray(o.removalPriority) ? o.removalPriority.filter(s => typeof s === 'string').slice(0, 6) : [],
        shape: { ramp: clamp(sh.ramp, -0.5, 0.5, 0), longevity: clamp(sh.longevity, -0.5, 0.5, 0), control: clamp(sh.control, -0.5, 0.5, 0), threatQuality: clamp(sh.threatQuality, -0.5, 0.5, 0), tempo: clamp(sh.tempo, -0.5, 0.5, 0) },
        priorBias: { playChar: clamp(pb.playChar, 0.5, 2.5, 1), event: clamp(pb.event, 0.5, 2.5, 1), act: clamp(pb.act, 0.5, 2.5, 1), leader: clamp(pb.leader, 0.5, 2.5, 1) }
      };
      if (o.constrain && Array.isArray(o.constrain.forbidChars)) out.constrain = { forbidChars: o.constrain.forbidChars.filter(s => typeof s === 'string').slice(0, 6) };
      out.priorityCards = Array.isArray(o.priorityCards) ? o.priorityCards.filter(s => typeof s === 'string').slice(0, 6) : [];
      return out;
    }
    // ★デッキ別の勝ち筋知識（docs/deck-strategies.md から要約）。Claudeに「このデッキが何を目指すか」を前提として渡す＝
    //   毎ターン盤面から推測させず、リーダー/デッキ特性に沿った戦略を立てさせる（ユーザー指摘「特性を理解していない」への対策）。
    var DECK_STRATEGY = {
      enel: 'ドン6固定システム。第2T以降の無料4ドン付与で除去耐性10000を毎ターン展開し、神官連撃＋ドン-イベント(放電/雷獣/神の裁き)で盤面と相手リソースを制圧。序盤アグロで手札を削る→中盤コントロール。コスト7以上不可。ドンを使い切らず循環を保つのが要。',
      lucy: 'イベント/ステージを実質カウンターに変換。赤の火力除去＋青のバウンスで盤面の取り合いをリードし、サボ(7c9000ブロッカー)で蓋。ライフで受けすぎずイベントをカウンター資源に温存。横展開されると処理が追いつかないので除去を優先。',
      ace: 'ライフ3・被弾するほどドローが進むミッドレンジ。12000ブロッカー(白ひげ)と速攻ロジャーで攻守両立。被弾を過度に恐れずドローに変換。バランス型。',
      nami: '手札1枚でリーダーを7000化し序中盤のアタックを受け止める。ライフ移動ドロー＋黄の回復で高耐久。対アグロに強い。受け切ってリソース勝ち＝ロングゲーム。手札とライフを資源として守る。',
      hancock: 'トリガーで攻防一体(アタック+ライフバーン/ドロー)。デッキトップ操作で8モリアをライフに仕込み複数回ヒール。先攻3→5→7→9の大型展開で処理不能盤面→回復で相手を削り切る。ロングゲーム志向。',
      teach: 'リーダー効果で相手アタックを実質手札1枚で受ける。KO時効果を持つ黒ひげ達をリーダー効果でアタックに引き込み除去+ドローで盤面と手札を整える。ドン10でゼハハ(展開＋相手ライフ奪取)のバースト。場持ちの良いキャラで攻撃先を誘導。'
    };
    // side視点の盤面要約（自分の手札は見せる＝自エージェントの情報、相手手札は不可視）。
    function stateForStrategy(side) {
      const P = G.players[side], D = G.players[opp(side)];
      // ★シミュ根拠: エンジンの計算結果をClaudeに渡す＝勘でなく「詰めれる/詰められる」を基準に方針を決められる。
      let lethal = false, threat = false;
      try { if (typeof cpuCanLethal === 'function') lethal = !!cpuCanLethal(side); } catch (e) {}
      try { if (typeof oppCanThreatenLethal === 'function') threat = !!oppCanThreatenLethal(side); } catch (e) {}
      return {
        turn: G.turnDisp, 先攻: G.firstPlayer === side,
        自デッキの勝ち筋: DECK_STRATEGY[leaderKeyOf(side)] || null,
        自分: { リーダー: P.leader.base.name, デッキ: P.meta && P.meta.name, ライフ: P.life.length, ドン: (P.don.active || 0) + '/' + (donTotal(side) || 0),
          手札: P.hand.map(c => handLine(side, c)), 盤面: P.chars.map(boardLine), ステージ: P.stage ? P.stage.base.name : null },
        相手: { リーダー: D.leader.base.name, デッキ: D.meta && D.meta.name, ライフ: D.life.length, ドン: (D.don.active || 0) + '/' + (donTotal(opp(side)) || 0), 手札枚数: D.hand.length, 盤面: D.chars.map(boardLine), ステージ: D.stage ? D.stage.base.name : null },
        エンジン判定: { 今ターン相手を倒せそう: lethal, 相手の次ターンが脅威_受け要警戒: threat }
      };
    }
    var STRATEGY_TOOL = {
      name: 'set_strategy',
      description: '今の盤面で「自分」のリーダーが取るべき高レベル戦略を設定する。個々の着手やリーサル計算は探索エンジンが行うので、ここでは方針/評価の重みだけを指定する。',
      input_schema: {
        type: 'object',
        properties: {
          aggression: { type: 'string', enum: ['high', 'mid', 'low'], description: '攻めの強度。詰めれるならhigh/受けて延命ならlow' },
          donReserve: { type: 'integer', description: '次の攻防に温存するアクティブドン枚数(0-6)。コントロール/受けなら多め' },
          intent: { type: 'string', description: '40字以内の今ターンの狙い(日本語)' },
          removalPriority: { type: 'array', items: { type: 'string' }, description: '優先して除去したい相手キャラ名' },
          shape: {
            type: 'object', description: '盤面評価への加点重み(各-0.5〜0.5・life≈1.3スケール)。手作り評価が見ない資源/戦略を補う',
            properties: { ramp: { type: 'number', description: 'ドン総数差(ランプ)の価値' }, longevity: { type: 'number', description: '控え+手札(息の長さ)の価値' }, control: { type: 'number', description: 'ブロッカー/盤面支配の価値' }, threatQuality: { type: 'number', description: '効果持ち/大型の質の価値' }, tempo: { type: 'number', description: '手番/主導権の価値' } }
          },
          priorBias: {
            type: 'object', description: '着手優先度の倍率(各0.5〜2.5)。探索が先に検討する手を寄せる',
            properties: { playChar: { type: 'number' }, event: { type: 'number' }, act: { type: 'number' }, leader: { type: 'number' } }
          },
          constrain: { type: 'object', description: '今出すべきでないキャラ(悪手)を禁止', properties: { forbidChars: { type: 'array', items: { type: 'string' } } } },
          priorityCards: { type: 'array', items: { type: 'string' }, description: '今ターン優先して出す/使う自分のカード名(勝ち筋に直結するキーカード・コンボの起点)。探索がこの手を先に検討する' }
        },
        required: ['aggression', 'intent', 'shape', 'priorBias']
      }
    };
    // live: Claude(proxy経由)に戦略を1回問い合わせ、sanitizeした戦略オブジェクトを返す。失敗(proxy未起動等)はnull。
    async function fetchStrategyFromClaude(side) {
      const P = G.players[side], D = G.players[opp(side)];
      const sys = 'あなたはワンピースカードゲーム(スタンダード)のトッププレイヤーで、リーダー「' + P.leader.base.name + '」(' + (P.meta && P.meta.name) + ')を操作します。\n'
        + OPCG_PRINCIPLES + '\n'
        + 'あなたの役目は“高レベル戦略”の決定だけです。個々の着手・リーサル計算・カウンター読みは別の探索エンジンが正確に行うので、あなたは上の原則に基づき「何を評価し何を優先するか(方針)」を set_strategy ツールで返してください。\n'
        + '盤面JSONには各カードのパワー/カウンター値(C)/キーワード/効果タイミング/手札の効果文と、エンジンの「リーサル判定」が含まれます。これらを判断材料にしてください。\n'
        + '盤面JSONの「自デッキの勝ち筋」に、このデッキの目指す形が書かれています。それを前提に、勝ち筋に直結するキーカード/起点を priorityCards で指定してください(探索がその手を先に検討します)。'
        + 'このデッキの勝ち筋と、相手「' + D.leader.base.name + '」(' + (D.meta && D.meta.name) + ')への定石を踏まえること。shapeは手作り評価が見落とす資源/戦略(ランプ/息の長さ/盤面支配/脅威の質/テンポ)を-0.5〜0.5で補正する重みです(原則②③でランプ/longevity、⑤でcontrol、⑦でthreatQuality、⑥でtempoを意識)。'
        + '「今ターン相手を倒せそう=true」ならaggression=high・donReserve=0で詰め、「相手の次ターンが脅威=true」ならdonReserveを多め(防御原則②③④)に。必ずツールで構造化して返答。';
      const usr = '現在の盤面(JSON):\n' + JSON.stringify(stateForStrategy(side)) + '\n\nこのターンの戦略を、上の原則と盤面・リーサル判定に基づき set_strategy で返してください。';
      const raw = await callClaude(sys, usr, { tools: [STRATEGY_TOOL], tool_choice: { type: 'tool', name: 'set_strategy' }, model: LLM_MODEL, max_tokens: 700 });
      return sanitizeShape(raw);
    }

