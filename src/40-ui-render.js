    "use strict";
    /* =========================================================================
       ===============  UI / 描画  ============================================
       ========================================================================= */
    const META_DATE = '2026年6月';
    let HOVER_TO = null;
    const IMG_OK = new Set();   // 読み込み成功したカード番号（再描画時のちらつき防止）
    function imgOK(no, el) { IMG_OK.add(no); const fb = el.parentNode && el.parentNode.querySelector('.fallback'); if (fb) fb.style.display = 'none'; }
    function imgBad(el) { el.style.display = 'none'; const fb = el.parentNode && el.parentNode.querySelector('.fallback'); if (fb) fb.style.display = 'flex'; }
    function imgRetry(el, no) { if (el.getAttribute('data-try')) { imgBad(el); } else { el.setAttribute('data-try', '1'); el.src = IMG_RAW(no); } }

    function setPhase(name) {
      G.phase = name;
      const t = document.getElementById('phaseTag'); if (t) t.textContent = name;
      const tn = document.getElementById('turnNum'); if (tn) tn.textContent = G.turnDisp || 0;
      const wt = document.getElementById('whoTurn'); if (wt) wt.textContent = G.active ? '/ ' + sideName(G.active) : '';
    }

    function log(cls, html) {
      G.log.push({ cls, html });
      const box = document.getElementById('logbox');
      if (box) { const d = document.createElement('div'); d.className = 'logline ' + cls; d.innerHTML = '<span class="t"></span>' + html; box.appendChild(d); box.scrollTop = box.scrollHeight; }
    }
    function flog(side, text) { log(side, text); }

    function banner(text) { const b = document.getElementById('banner'); if (!b) return; b.textContent = text; b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
    function toast(t) {
      const felt = document.querySelector('.felt'); if (!felt) return;
      const d = document.createElement('div'); d.className = 'float buff'; d.style.left = '50%'; d.style.top = '44%'; d.style.transform = 'translateX(-50%)'; d.style.fontFamily = "'Noto Sans JP'"; d.style.fontSize = '13.5px'; d.style.whiteSpace = 'nowrap'; d.textContent = t; felt.appendChild(d); setTimeout(() => d.remove(), 1000);
    }
    function floatOn(uid, text, kind) {
      const felt = document.querySelector('.felt'); const el = document.querySelector('[data-uid="' + uid + '"]'); if (!felt || !el) return;
      const fr = felt.getBoundingClientRect(), r = el.getBoundingClientRect();
      const f = document.createElement('div'); f.className = 'float ' + (kind || ''); f.textContent = text;
      f.style.left = (r.left - fr.left + r.width / 2 - 14) + 'px'; f.style.top = (r.top - fr.top + 6) + 'px';
      felt.appendChild(f); setTimeout(() => f.remove(), 1000);
    }
    function animClass(uid, cls) {
      const el = document.querySelector('[data-uid="' + uid + '"]'); if (!el) return;
      const parts = cls.split(' '); parts.forEach(c => el.classList.add(c)); setTimeout(() => parts.forEach(c => el.classList.remove(c)), 680);
    }
    // 効果・トリガーの発生通知（画面上部のピル）。相手(CPU)の行動は読めるよう小休止を入れる。
    let _fxNoteEl = null;
    function showFxNote(side, label, name) {
      const felt = document.querySelector('.felt'); if (!felt) return;
      if (_fxNoteEl) { const old = _fxNoteEl; _fxNoteEl = null; old.remove(); }
      const d = document.createElement('div');
      d.className = 'fx-note ' + (side === 'me' ? 'mine' : 'opp');
      d.innerHTML = (side === 'me' ? '' : '<span class="fx-side">CPU</span>') + '<span class="fx-note-lbl">' + label + '</span>' + (name ? '<span class="fx-note-nm">' + name + '</span>' : '');
      felt.appendChild(d); _fxNoteEl = d;
      setTimeout(() => { if (_fxNoteEl === d) _fxNoteEl = null; d.remove(); }, 1400);
    }
    async function fxNote(side, label, name) {
      showFxNote(side, label, name);
      await sleep(G.active === 'me' ? 340 : 660);
    }
    /* ===== 攻撃アナウンス（誰が誰にアタックしているか） ===== */
    function removeAtkEl() { const e = document.getElementById('atkAnnounce'); if (e) e.remove(); }
    function clearAtkAnnounce() { G._atkFrom = null; G._atkTo = null; removeAtkEl(); }
    function showAtkAnnounce(aSide, attacker, target) {
      G._atkFrom = attacker.uid; G._atkTo = target.uid; removeAtkEl();
      const opp = (aSide !== 'me');
      const toN = target.base.type === 'LEADER' ? (opp ? 'あなたのリーダー' : '相手のリーダー') : target.base.name;
      const el = document.createElement('div'); el.id = 'atkAnnounce'; if (opp) el.className = 'opp';
      el.innerHTML = (opp ? '<span class="aa-side">相手</span>' : '') +
        '<span class="aa-from">' + escapeHTML(attacker.base.name) + '</span>' +
        '<span class="aa-arrow">▶</span>' +
        '<span class="aa-to">' + escapeHTML(toN) + '</span>';
      document.body.appendChild(el);
    }
    function _esMotes() { let s = ''; for (let i = 0; i < 9; i++) { const l = (4 + Math.random() * 90).toFixed(1), d = (Math.random() * 2).toFixed(2), dur = (4.6 + Math.random() * 4.2).toFixed(2), sz = (5 + Math.random() * 6).toFixed(1); s += '<i style="left:' + l + '%;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + dur + 's;animation-delay:' + d + 's"></i>'; } return s; }
    function _esRain() { let s = ''; for (let i = 0; i < 16; i++) { const l = (Math.random() * 100).toFixed(1), d = (Math.random() * 1.8).toFixed(2), dur = (1.1 + Math.random() * 1.2).toFixed(2), h = (50 + Math.random() * 70).toFixed(0); s += '<i style="left:' + l + '%;height:' + h + 'px;animation-duration:' + dur + 's;animation-delay:' + d + 's"></i>'; } return s; }
    function removeEndScreen() { const e = document.getElementById('endscreen'); if (e) e.remove(); }
    function showEndScreen(win, reason) {
      removeEndScreen();
      const o = document.createElement('div'); o.id = 'endscreen'; o.className = 'endscreen ' + (win ? 'win' : 'lose');
      const deco = win
        ? '<div class="es-rays"></div><div class="es-glow"></div><div class="es-ring"></div><div class="es-ring r2"></div><div class="es-motes">' + _esMotes() + '</div>'
        : '<div class="es-vignette"></div><div class="es-rain">' + _esRain() + '</div>';
      o.innerHTML = deco +
        '<div class="es-core">' +
        '<div class="es-title">' + (win ? 'VICTORY' : 'DEFEAT') + '</div>' +
        '<div class="es-sub">' + (win ? '勝利' : '敗北') + '</div>' +
        (reason ? '<div class="es-reason">' + escapeHTML(reason) + '</div>' : '') +
        '<button class="es-btn" onclick="backToSelect()">もう一度プレイ</button>' +
        '</div>';
      document.body.appendChild(o);
    }

    /* ---------- 小物 ---------- */
    function typeJa(t) { return { CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' }[t] || t; }
    function kwShort(k) { return { blocker: 'B', rush: '速', doubleAttack: 'W', banish: 'バ', unblockable: '貫' }[k] || k; }
    function attachedSum(P) { let s = P.leader.attachedDon; for (const c of P.chars) s += c.attachedDon; if (P.stage) s += P.stage.attachedDon; return s; }
    function escapeHTML(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

    /* ---------- カード描画 ---------- */
    function cardHTML(card, opt) {
      opt = opt || {}; const b = card.base; const cls = ['card'];
      if (b.type === 'LEADER') cls.push('leader');
      if (opt.small) cls.push('small'); if (opt.tiny) cls.push('tiny');
      if (card.rested) cls.push('rest'); if (card.owner === 'cpu' && card.rested) cls.push('flip');
      const inPending = G.pendingChoice && G.pendingChoice.uids.has(card.uid);
      if (inPending) cls.push('selectable');
      if (opt.attackTarget) cls.push('targetable');
      if (G.attackSel && G.attackSel.attacker && G.attackSel.attacker.uid === card.uid) cls.push('attacker');
      if (G._atkFrom && card.uid === G._atkFrom) cls.push('atk-active');
      if (G._atkTo && card.uid === G._atkTo) cls.push('atk-target');
      if (opt.clickable || inPending || opt.attackTarget) cls.push('clickable');
      if (opt.faceDown) {
        return '<div class="' + cls.join(' ') + '" data-uid="' + card.uid + '">' +
          '<div class="fallback" style="--cc:#0f2638;display:flex;align-items:center;justify-content:center">' +
          '<div style="font-family:\'Bebas Neue\';color:var(--gold-dim);font-size:15px;letter-spacing:.08em;transform:rotate(-90deg);white-space:nowrap">ONE PIECE</div></div></div>';
      }
      const colorHex = COLOR_HEX[(b.color && b.color[0])] || '#1a2c3c';
      const showPow = (b.type === 'CHAR' || b.type === 'LEADER');
      const kwChips = [];
      ['blocker', 'rush', 'doubleAttack', 'banish'].forEach(k => { if (b[k] || card.kwGrant.some(g => g.kw === k)) kwChips.push(kwShort(k)); });
      if (b.condBlocker) kwChips.push('B?'); if (b.condRush) kwChips.push('速?');
      return '<div class="' + cls.join(' ') + '" data-uid="' + card.uid + '" data-no="' + card.no + '">' +
        '<img src="' + IMG(card.no) + '" referrerpolicy="no-referrer" decoding="async" ' +
        'onload="imgOK(\'' + card.no + '\',this)" onerror="imgRetry(this,\'' + card.no + '\')">' +
        '<div class="fallback" style="--cc:' + colorHex + ';display:' + (IMG_OK.has(card.no) ? 'none' : 'flex') + '">' +
        '<div class="fb-top"><span class="cost">' + (b.cost != null ? b.cost : '-') + '</span>' + (b.counter ? '<span class="ctr">C' + b.counter + '</span>' : '') + '</div>' +
        '<div class="nm">' + escapeHTML(b.name) + '</div>' +
        '<div class="typ">' + typeJa(b.type) + ((b.traits && b.traits.length) ? ' / ' + escapeHTML(b.traits[0]) : '') + '</div>' +
        (showPow && b.power != null ? '<div class="pw">' + b.power + '</div>' : '') +
        '</div>' +
        (showPow ? '<div class="cnr-power">' + power(card) + '</div>' : '') +
        (card.attachedDon > 0 ? '<div class="donbadge">+' + card.attachedDon + '</div>' : '') +
        (kwChips.length ? '<div class="kw">' + kwChips.map(k => '<span>' + k + '</span>').join('') + '</div>' : '') +
        (b.simp ? '<div class="simp">簡易</div>' : '') +
        '</div>';
    }

    /* ---------- ゾーン ---------- */
    function pileHTML(n, kind) { return '<div class="pile ' + kind + '"><span class="pc">' + n + '</span></div>'; }
    /* ライフ縦積み（横向き）＋その下にドン山（公式配置） */
    /* ライフ（一番左・横向き積み） */
    function lifeBlock(P) {
      let cards = '';
      for (let i = 0; i < P.life.length; i++) {
        const c = P.life[i];
        if (c && c._faceUp) {
          cards += '<div class="lifecard up" data-no="' + c.base.no + '" title="' + escapeHTML(c.base.name) + '（表向き）">' +
            '<img src="' + IMG(c.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'">' +
            '<span class="lf-fb">' + escapeHTML(c.base.name) + '</span></div>';
        } else cards += '<div class="lifecard"></div>';
      }
      const lifeStack = '<div class="lifestack">' + (cards || '<span class="zero">0</span>') + '</div>';
      return '<div class="zone-side ga-life"><span class="zlabel">LIFE ' + P.life.length + '</span>' + lifeStack + '</div>';
    }
    /* ドンデッキ（ライフの下・残りドン山） */
    function donDeckBlock(P) {
      const donLeft = P.donMax - (P.don.active + P.don.rested + attachedSum(P));
      return '<div class="zone-side ga-dondeck"><span class="zlabel">ドンデッキ ' + donLeft + '</span>' + pileHTML(donLeft, 'donp') + '</div>';
    }
    /* デッキ（リーダーの右） */
    function deckBlock(P) { return '<div class="zone-side ga-deck"><span class="zlabel">DECK ' + P.deck.length + '</span>' + pileHTML(P.deck.length, 'cardback') + '</div>'; }
    /* トラッシュ（デッキの下） */
    function trashBlock(P) {
      const n = P.trash.length;
      if (n === 0) return '<div class="zone-side ga-trash"><span class="zlabel">TRASH 0</span><div class="pile trashp"><span class="pc">0</span></div></div>';
      const top = P.trash[n - 1];
      const fan = P.trash.slice().reverse().map(c =>
        '<div class="tf-card" title="' + escapeHTML(c.base.name) + '"><img src="' + IMG(c.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'"><span class="tf-fb">' + escapeHTML(c.base.name) + '</span></div>').join('');
      return '<div class="zone-side ga-trash"><span class="zlabel">TRASH ' + n + '</span>' +
        '<div class="trashtop" data-no="' + top.base.no + '" title="最新: ' + escapeHTML(top.base.name) + '（ホバーで全表示）">' +
        '<img class="tt-img" src="' + IMG(top.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'">' +
        '<span class="tt-fb">' + escapeHTML(top.base.name) + '</span>' +
        '<span class="tt-count">' + n + '</span>' +
        '<div class="trashfan"><div class="tf-head">トラッシュ ' + n + '枚（新しい順）</div><div class="tf-grid">' + fan + '</div></div>' +
        '</div></div>';
    }
    /* コストエリア（リーダーの下・固定幅で確保）: アクティブ=立て / レスト=横 */
    function donCostBlock(P) {
      const inplay = P.don.active + P.don.rested + attachedSum(P);
      let d = '';
      for (let i = 0; i < P.don.active; i++)d += '<div class="doncard">D</div>';
      for (let i = 0; i < P.don.rested; i++)d += '<div class="doncard rest">D</div>';
      if (!d) d = '<div class="doncard ghost"></div>';
      return '<div class="zone-side doncost ga-cost"><span class="zlabel">コストエリア ' + P.don.active + '<small>/' + inplay + '</small></span><div class="donrow">' + d + '</div></div>';
    }
    function handCountHTML(P) { return '<div class="zone-side ga-hand"><span class="zlabel">HAND ' + P.hand.length + '</span>' + pileHTML(P.hand.length, 'cardback') + '</div>'; }

    function charRowHTML(side) {
      const P = G.players[side]; const isMe = side === 'me';
      const myAct = isMe && G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      const cards = P.chars.map(c => {
        const target = (!isMe) && G.attackSel && c.rested;
        return cardHTML(c, { clickable: myAct, attackTarget: target });
      });
      const empt = []; for (let i = P.chars.length; i < 5; i++)empt.push('<div class="slot">+</div>');
      return '<div class="row charrow ga-chars">' + cards.join('') + empt.join('') + '</div>';
    }
    function leaderBlock(side, isMe) {
      const P = G.players[side]; const L = P.leader;
      const myAct = isMe && G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      const target = (!isMe) && G.attackSel;
      const leaderCard = cardHTML(L, { clickable: myAct, attackTarget: target });
      let stage = '';
      if (P.stage) stage = '<div class="zone-side" style="margin-left:8px"><span class="zlabel">STAGE</span>' + cardHTML(P.stage, { clickable: myAct }) + '</div>';
      return '<div class="ga-leader">' + leaderCard + stage + '</div>';
    }
    function sideHTML(side, isMe) {
      const P = G.players[side];
      return '<div class="side ' + (isMe ? 'me' : 'opp') + '">' +
        charRowHTML(side) +
        leaderBlock(side, isMe) +
        donCostBlock(P) +
        lifeBlock(P) +
        donDeckBlock(P) +
        deckBlock(P) +
        trashBlock(P) +
        (isMe ? '' : handCountHTML(P)) +
        '</div>';
    }

    function handHTML() {
      const P = G.players.me;
      const canPlay = G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      if (P.hand.length === 0) return '<span class="tip">手札なし</span>';
      return P.hand.map(c => {
        const sel = G.pendingChoice && G.pendingChoice.uids.has(c.uid);
        const playable = canPlay && handPlayable(c);
        return cardHTML(c, { clickable: playable, small: false });
      }).join('');
    }
    function handPlayable(c) {
      const P = G.players.me; const b = c.base;
      if (b.type === 'CHAR') return effCost('me', c) <= P.don.active; // 5体でも出せる（登場時に1体トラッシュ）
      if (b.type === 'STAGE') return (b.cost || 0) <= P.don.active;
      if (b.type === 'EVENT') return !!(b.fx && b.fx.main) && effCost('me', c) <= P.don.active; // イベントもcostMod(条件付きコスト減)を反映
      return false;
    }

    function controlsHTML() {
      if (G.winner) return '<button class="phasebtn go" onclick="backToSelect()">もう一度プレイ</button>';
      if (G.active === 'me' && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
        const hint = G.attackSel ? '攻撃対象をクリック（自分の攻撃キャラを再クリックで取消）'
          : '自分のカード=【アタック/ドン付与/起動】、手札=【登場/使用】';
        return '<span class="tip">' + hint + '</span><button class="phasebtn go" onclick="uiEndTurn()">ターン終了</button>';
      }
      return '<span class="thinking"><span>' + (G.active === 'cpu' ? 'CPU 思考中' : '処理中') + '</span><span class="dots"><span>●</span><span>●</span><span>●</span></span></span>';
    }

    function promptHTML() {
      const ps = G.promptState; if (!ps) return '';
      const idx = ps.opts.map((o, i) => ({ o, i }));
      const cardOpts = idx.filter(x => x.o.card);
      const plainOpts = idx.filter(x => !x.o.card);
      let h = '<div class="prompt show"><h3>' + (ps.title || '') + '</h3>' + (ps.text ? '<p>' + ps.text + '</p>' : '');
      if (cardOpts.length) {
        h += '<div class="opt-cards">' + cardOpts.map(({ o, i }) =>
          '<button class="opt-card' + (o.ghost ? ' ghost' : '') + (o.disabled ? ' off' : '') + '"' + (o.disabled ? '' : ' onclick="promptPick(' + i + ')"') + '>' +
          '<span class="oc-art"><img src="' + IMG(o.card.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'noimg\')"><span class="oc-fb">' + o.t + '</span></span>' +
          '<span class="oc-cap">' + o.t + (o.card.sub ? ' <b>' + o.card.sub + '</b>' : '') + '</span></button>'
        ).join('') + '</div>';
      }
      if (plainOpts.length) {
        h += '<div class="opts">' + plainOpts.map(({ o, i }) =>
          '<button class="opt ' + (o.primary ? 'primary' : '') + ' ' + (o.ghost ? 'ghost' : '') + '"' + (o.disabled ? ' disabled' : ' onclick="promptPick(' + i + ')"') + '>' + o.t + '</button>'
        ).join('') + '</div>';
      }
      h += '</div>'; return h;
    }

    function sidePanelHTML() {
      const hintsActive = G._tab !== 'log';
      return '<div id="side" class="' + (G._sideOpen ? 'open' : '') + '">' +
        '<div class="tabs">' +
        '<button class="tab ' + (hintsActive ? 'active' : '') + '" onclick="setTab(\'hints\')">CPU予測</button>' +
        '<button class="tab ' + (!hintsActive ? 'active' : '') + '" onclick="setTab(\'log\')">ログ</button>' +
        '</div>' +
        '<div class="panel ' + (hintsActive ? '' : 'hidden') + '" id="hintsPanel">' +
        '<div class="hint-head">🔮 でんでん虫でCPUの次の手番を予測します。</div>' +
        '<button class="dendenbtn" onclick="predictCPU()" ' + (G._predicting ? 'disabled' : '') + '>' + (G._predicting ? '解析中…' : '📞 CPUの手を読む') + '</button>' +
        (G._aiIntent ? '<div class="ai-intent"><div class="ai-t">🧠 CPUの狙い</div>' + G._aiIntent + '</div>' : '') +
        '<div id="hintsList">' + hintsListHTML() + '</div>' +
        '</div>' +
        '<div class="panel ' + (!hintsActive ? '' : 'hidden') + '" id="logPanel">' +
        '<div id="logbox">' + G.log.map(l => '<div class="logline ' + l.cls + '"><span class="t"></span>' + l.html + '</div>').join('') + '</div>' +
        '</div>' +
        '</div>';
    }
    function hintsListHTML() {
      if (!G._hints || !G._hints.length)
        return '<div class="hint-empty">まだ予測はありません。<br>「CPUの手を読む」を押すと、見えている盤面とCPUのデッキタイプから次のターンの行動を推測します。</div>';
      return G._hints.map(h => '<div class="hint ' + (h.warn ? 'warn' : '') + '"><span class="h-prob">' + (h.prob || '') + '</span><div class="h-t">' + escapeHTML(h.title || '') + '</div><div class="h-d">' + escapeHTML(h.desc || '') + '</div></div>').join('');
    }

    /* ---------- メイン描画 ---------- */
    function render() {
      if (!G.inGame) return;
      const scr = document.getElementById('screen');
      scr.innerHTML =
        '<div id="board"><div class="felt">' +
        sideHTML('cpu', false) +
        '<div class="midline"><span class="vs">VS</span></div>' +
        sideHTML('me', true) +
        '<div class="handzone" id="myhand">' + handHTML() + '</div>' +
        '<div class="controls">' + controlsHTML() + '</div>' +
        promptHTML() +
        '<div class="banner" id="banner"></div>' +
        '</div>' + sidePanelHTML() + '</div>';
      setPhase(G.phase);
    }

    function showBattleScreen() {
      G.inGame = true; G.phase = '開始';
      document.getElementById('turnpill').style.display = 'flex';
      document.getElementById('aiToggleWrap').style.display = 'inline-flex';
      document.getElementById('menuBtn').style.display = '';
      document.getElementById('sideToggle').style.display = '';
      document.getElementById('aiSwitch').classList.toggle('on', G.aiOn);
      render();
    }

