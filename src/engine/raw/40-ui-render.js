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

    const PHASE_STEPS = ['リフレッシュ', 'ドロー', 'ドン', 'メイン', 'エンド'];
    function setPhase(name) {
      G.phase = name;
      const t = document.getElementById('phaseTag'); if (t) t.textContent = name;
      const tn = document.getElementById('turnNum'); if (tn) tn.textContent = G.turnDisp || 0;
      const wt = document.getElementById('whoTurn');
      if (wt) {
        wt.textContent = G.active ? sideName(G.active) + 'の番' : '';
        wt.style.color = G.active === 'me' ? 'var(--self-accent)' : G.active === 'cpu' ? 'var(--opp-accent)' : 'var(--muted)';
        wt.style.fontWeight = '700';
      }
      // フェイズステッパー（リフレッシュ→ドロー→ドン→メイン→エンド の現在地を点灯）
      const st = document.getElementById('phaseSteps');
      if (st) {
        const cur = PHASE_STEPS.indexOf(name);
        st.innerHTML = PHASE_STEPS.map((p, i) =>
          '<i class="' + (i === cur ? 'on' : (cur >= 0 && i < cur ? 'done' : '')) + '" title="' + p + '"></i>').join('');
      }
      const pill = document.getElementById('turnpill');
      if (pill) { pill.classList.toggle('mine', G.active === 'me'); pill.classList.toggle('opp', G.active === 'cpu'); }
      updateHud();
    }

    /* ===== 常時HUD（トップバー）：両者の LIFE/手札/デッキ/ドン を常に表示 ===== */
    function hudPlateHTML(side) {
      const P = G.players && G.players[side]; if (!P) return '';
      const donNow = P.don.active, donAll = donTotal(side);
      return '<span class="hp-name">' + (side === 'me' ? 'YOU' : 'CPU') + '</span>' +
        '<span class="hp-stat life" title="ライフ"><i>❤</i><b>' + P.life.length + '</b></span>' +
        '<span class="hp-stat hand" title="手札"><i>🂠</i><b>' + P.hand.length + '</b></span>' +
        '<span class="hp-stat deck" title="デッキ残"><i>▤</i><b>' + P.deck.length + '</b></span>' +
        '<span class="hp-stat don" title="アクティブなドン / 場のドン合計"><i>◈</i><b>' + donNow + '</b><small>/' + donAll + '</small></span>';
    }
    function updateHud() {
      if (G._sim) return;
      const me = document.getElementById('hudMe'), cpu = document.getElementById('hudCpu');
      if (!me || !cpu) return;
      if (!G.inGame || !G.players) { me.style.display = 'none'; cpu.style.display = 'none'; return; }
      me.style.display = 'flex'; cpu.style.display = 'flex';
      me.innerHTML = hudPlateHTML('me'); cpu.innerHTML = hudPlateHTML('cpu');
      me.classList.toggle('turn', G.active === 'me');
      cpu.classList.toggle('turn', G.active === 'cpu');
    }

    function log(cls, html) {
      if (G._sim) return;   // 探索中のログ抑止
      G.log.push({ cls, html });
      const box = document.getElementById('logbox');
      if (box) { const d = document.createElement('div'); d.className = 'logline ' + cls; d.innerHTML = '<span class="t"></span>' + html; box.appendChild(d); box.scrollTop = box.scrollHeight; }
    }
    function flog(side, text) { log(side, text); }

    // ターン/節目アナウンス。body直付けにして render() のフル再描画でも消えないようにする（自動フェード）。
    let _bannerTO = null;
    function banner(text, opt) {
      if (G._sim) return;
      opt = opt || {};
      let b = document.getElementById('turnbanner');
      if (!b) { b = document.createElement('div'); b.id = 'turnbanner'; document.body.appendChild(b); }
      b.className = 'turnbanner ' + (opt.cls || '');
      b.innerHTML = '<span class="tb-band"></span><span class="tb-txt">' + escapeHTML(text) + '</span>';
      b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      if (_bannerTO) clearTimeout(_bannerTO);
      _bannerTO = setTimeout(() => { const e = document.getElementById('turnbanner'); if (e) e.remove(); _bannerTO = null; }, opt.hold || 1600);
    }
    function clearBanner() { if (_bannerTO) { clearTimeout(_bannerTO); _bannerTO = null; } const e = document.getElementById('turnbanner'); if (e) e.remove(); }
    // ★AI探索(puct)中の表示。内部シミュレーションは描画抑止し、代わりにこのバッジだけ出す（body直付け＝render()で消えない）。
    function showThinking(on) {
      let b = document.getElementById('aiThinking');
      if (on) {
        if (!b) {
          b = document.createElement('div'); b.id = 'aiThinking';
          b.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9000;background:rgba(12,18,30,.86);color:#cfe3ff;font:600 14px/1.3 "Noto Sans JP",sans-serif;padding:9px 18px;border-radius:999px;border:1px solid rgba(120,170,255,.4);box-shadow:0 4px 18px rgba(0,0,0,.4);letter-spacing:.04em;pointer-events:none;';
          b.textContent = '🤖 AI思考中…';
          document.body.appendChild(b);
        }
      } else if (b) { b.remove(); }
    }

    /* ===== サウンド（WebAudioで合成＝外部音源ゼロ・file://で確実に鳴る） =====
       自動再生制約のため初回ユーザー操作で unlock。設定はセッション内のみ（localStorage不可）。 */
    const SFX = (function () {
      let ctx = null, muted = false, unlocked = false;
      function ac() { if (!ctx) { try { const AC = window.AudioContext || window.webkitAudioContext; ctx = AC ? new AC() : null; } catch (e) { ctx = null; } } return ctx; }
      function tone(freq, dur, type, gain, when) {
        const c = ac(); if (!c) return; const t = c.currentTime + (when || 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.13, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
      }
      const lib = {
        click: () => tone(420, 0.05, 'triangle', 0.06),
        summon: () => { tone(330, 0.12, 'triangle', 0.11); tone(495, 0.13, 'sine', 0.09, 0.06); },
        attack: () => { tone(190, 0.12, 'sawtooth', 0.11); tone(120, 0.15, 'square', 0.06, 0.04); },
        hit: () => tone(90, 0.18, 'square', 0.15),
        ko: () => { tone(160, 0.2, 'sawtooth', 0.13); tone(80, 0.28, 'square', 0.11, 0.07); },
        block: () => { tone(620, 0.09, 'sine', 0.1); tone(780, 0.11, 'sine', 0.07, 0.05); },
        counter: () => tone(540, 0.1, 'triangle', 0.09),
        draw: () => { tone(520, 0.07, 'sine', 0.07); tone(680, 0.08, 'sine', 0.06, 0.05); },
        don: () => tone(300, 0.08, 'triangle', 0.09),
        trigger: () => { tone(700, 0.1, 'sine', 0.1); tone(950, 0.12, 'sine', 0.08, 0.06); },
        win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.13, i * 0.12)),
        lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.34, 'sine', 0.11, i * 0.14)),
      };
      return {
        unlock() { unlocked = true; const c = ac(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { } } },
        play(name) { if (!unlocked || muted) return; try { (lib[name] || function () { })(); } catch (e) { } },
        toggle() { muted = !muted; return muted; }, isMuted() { return muted; }
      };
    })();
    function sfx(name) { if (G._sim) return; try { SFX.play(name); } catch (e) { } }

    function toast(t) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      const d = document.createElement('div'); d.className = 'float buff'; d.style.left = '50%'; d.style.top = '44%'; d.style.transform = 'translateX(-50%)'; d.style.fontFamily = "'Noto Sans JP'"; d.style.fontSize = '13.5px'; d.style.whiteSpace = 'nowrap'; d.textContent = t; felt.appendChild(d); setTimeout(() => d.remove(), 1000);
    }
    function floatOn(uid, text, kind) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); const el = document.querySelector('[data-uid="' + uid + '"]'); if (!felt || !el) return;
      const fr = felt.getBoundingClientRect(), r = el.getBoundingClientRect();
      const f = document.createElement('div'); f.className = 'float ' + (kind || ''); f.textContent = text;
      f.style.left = (r.left - fr.left + r.width / 2 - 14) + 'px'; f.style.top = (r.top - fr.top + 6) + 'px';
      felt.appendChild(f); setTimeout(() => f.remove(), 1000);
    }
    function animClass(uid, cls) {
      if (G._sim) return;
      const el = document.querySelector('[data-uid="' + uid + '"]'); if (!el) return;
      const parts = cls.split(' '); parts.forEach(c => el.classList.add(c)); setTimeout(() => parts.forEach(c => el.classList.remove(c)), 680);
    }

    /* ===== 追加アニメーション（fire-and-forget・ヘッドレスでは querySelector→null で即return） ===== */
    // 画面シェイク（リーダー被弾など重い一撃）
    function shakeScreen() {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      felt.classList.remove('quake'); void felt.offsetWidth; felt.classList.add('quake');
      setTimeout(() => { const f = document.querySelector('.felt'); if (f) f.classList.remove('quake'); }, 480);
    }
    // カード位置にエフェクトを発生（burst=KO粒子 / slash=斬撃 / ring=登場波紋 / spark=ドン輝き）
    function spawnAt(uid, kind) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); const el = document.querySelector('[data-uid="' + uid + '"]');
      if (!felt || !el) return;
      const fr = felt.getBoundingClientRect(), r = el.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'spawnfx ' + kind;
      d.style.left = (r.left - fr.left + r.width / 2) + 'px';
      d.style.top = (r.top - fr.top + r.height / 2) + 'px';
      if (kind === 'burst') {
        let s = '';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 360 + (Math.random() * 24 - 12), dist = (26 + Math.random() * 34) | 0, sz = (3 + Math.random() * 4).toFixed(1);
          s += '<i style="--a:' + a.toFixed(0) + 'deg;--d:' + dist + 'px;width:' + sz + 'px;height:' + sz + 'px"></i>';
        }
        d.innerHTML = s;
      }
      felt.appendChild(d);
      setTimeout(() => d.remove(), 950);
    }
    // ドローの飛翔（デッキ山→手札へカード背面が飛ぶ）
    function drawFly(side) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      const from = document.querySelector('.side.' + (side === 'me' ? 'me' : 'opp') + ' .ga-deck .pile');
      const to = side === 'me' ? document.querySelector('.handzone') : document.querySelector('.side.opp .ga-hand .pile');
      if (!from || !to) return;
      const fr = felt.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'flycard';
      d.style.left = (a.left - fr.left) + 'px'; d.style.top = (a.top - fr.top) + 'px';
      d.style.width = a.width + 'px'; d.style.height = a.height + 'px';
      d.style.setProperty('--fx', (b.left - fr.left + b.width / 2 - (a.left - fr.left) - a.width / 2) + 'px');
      d.style.setProperty('--fy', (b.top - fr.top + b.height / 2 - (a.top - fr.top) - a.height / 2) + 'px');
      felt.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }
    // ドン付与の飛翔（コストエリア→対象カードへ金の光が飛ぶ）
    function donFly(side, uid) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      const from = document.querySelector('.side.' + (side === 'me' ? 'me' : 'opp') + ' .ga-cost');
      const to = document.querySelector('[data-uid="' + uid + '"]');
      if (!from || !to) return;
      const fr = felt.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'donfly';
      d.style.left = (a.left - fr.left + a.width / 2) + 'px'; d.style.top = (a.top - fr.top + a.height / 2) + 'px';
      d.style.setProperty('--fx', (b.left - fr.left + b.width / 2 - (a.left - fr.left + a.width / 2)) + 'px');
      d.style.setProperty('--fy', (b.top - fr.top + b.height / 2 - (a.top - fr.top + a.height / 2)) + 'px');
      felt.appendChild(d);
      setTimeout(() => { d.remove(); spawnAt(uid, 'spark'); }, 460);
    }
    // 攻撃ライン（アタッカー→対象を結ぶ光の線）。render()末尾で毎回描き直す。
    function drawAtkLine() {
      if (G._sim || !G._atkFrom || !G._atkTo) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      const a = document.querySelector('[data-uid="' + G._atkFrom + '"]'), b = document.querySelector('[data-uid="' + G._atkTo + '"]');
      if (!a || !b) return;
      const fr = felt.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.left - fr.left + ra.width / 2, y1 = ra.top - fr.top + ra.height / 2;
      const x2 = rb.left - fr.left + rb.width / 2, y2 = rb.top - fr.top + rb.height / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      if (!len) return;
      const el = document.createElement('div'); el.className = 'atkline';
      el.style.left = x1 + 'px'; el.style.top = y1 + 'px'; el.style.width = len + 'px';
      el.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg)';
      felt.appendChild(el);
    }
    // ヒントバーのチップクリック：該当カードをスポットライト（どれが押せるかを能動的に示す）
    function spotCards(cls) {
      const els = document.querySelectorAll('.card.' + cls);
      if (!els || !els.length) return;
      els.forEach(e => { e.classList.remove('spot'); void e.offsetWidth; e.classList.add('spot'); });
      setTimeout(() => { document.querySelectorAll('.card.spot').forEach(e => e.classList.remove('spot')); }, 1500);
    }
    // 効果・トリガーの発生通知（画面上部のピル）。相手(CPU)の行動は読めるよう小休止を入れる。
    // リーサル（トドメの一撃）演出フック。web(reactAdapter)がカットイン実装で差し替える。
    // headless/既定は何もしない（_sim中も含め即解決＝テスト/探索を遅延させない）。
    async function lethalFx(side) { if (G._sim) return; }
    /* 公開カードの大写し（UI専用フック・G には一切触れない＝ロックステップ無関係）。
       「デッキから公開して手札に加えた」「イベントを使用した」など、盤面に残らないカードは
       何が起きたのか分からないため、カードを一枚だけ短く見せる。web は reactAdapter が差し替える。 */
    function cardReveal(side, no, name, label) { if (G._sim) return; }
    let _fxNoteEl = null;
    function showFxNote(side, label, name, no) {
      if (G._sim) return;
      const felt = document.querySelector('.felt'); if (!felt) return;
      if (_fxNoteEl) { const old = _fxNoteEl; _fxNoteEl = null; old.remove(); }
      const d = document.createElement('div');
      d.className = 'fx-note ' + (side === 'me' ? 'mine' : 'opp');
      d.innerHTML = (side === 'me' ? '' : '<span class="fx-side">CPU</span>') + '<span class="fx-note-lbl">' + label + '</span>' + (name ? '<span class="fx-note-nm">' + name + '</span>' : '');
      felt.appendChild(d); _fxNoteEl = d;
      setTimeout(() => { if (_fxNoteEl === d) _fxNoteEl = null; d.remove(); }, 1400);
    }
    async function fxNote(side, label, name, no) {
      showFxNote(side, label, name, no);
      await sleep(G.active === 'me' ? 340 : 660);
    }
    // ライフからトリガーが公開された瞬間の演出（web は reactAdapter が派手なオーバーレイへ差し替え）。
    // headless/既定実装は無害: 通知ピルを出して小休止するだけ。G._sim（AI探索）中は何もしない。
    async function triggerReveal(side, card) { if (G._sim) return; showFxNote(side, 'トリガー', card.base.name); await sleep(300); }
    function clearTriggerReveal() { }
    /* ===== 攻撃アナウンス（誰が誰にアタックしているか） ===== */
    function removeAtkEl() { const e = document.getElementById('atkAnnounce'); if (e) e.remove(); }
    function clearAtkAnnounce() { G._atkFrom = null; G._atkTo = null; removeAtkEl(); }
    function showAtkAnnounce(aSide, attacker, target) {
      if (G._sim) return;   // 探索中の攻撃アナウンス抑止
      G._atkFrom = attacker.uid; G._atkTo = target.uid; removeAtkEl();
      const opp = (aSide !== 'me');
      const toN = target.base.type === 'LEADER' ? (opp ? 'あなたのリーダー' : '相手のリーダー') : target.base.name;
      const ap = power(attacker), dp = power(target);
      const el = document.createElement('div'); el.id = 'atkAnnounce'; if (opp) el.className = 'opp';
      const aaImg = no => '<img class="aa-card" src="' + IMG(no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'">';
      el.innerHTML = (opp ? '<span class="aa-side">相手</span>' : '') +
        '<span class="aa-from">' + aaImg(attacker.base.no) + '<span class="aa-nm">' + escapeHTML(attacker.base.name) + '</span><b class="aa-pw">P' + ap + '</b></span>' +
        '<span class="aa-arrow">▶</span>' +
        '<span class="aa-to">' + aaImg(target.base.no) + '<span class="aa-nm">' + escapeHTML(toN) + '</span><b class="aa-pw def">P' + dp + '</b></span>';
      document.body.appendChild(el);
    }
    function _esMotes() { let s = ''; for (let i = 0; i < 9; i++) { const l = (4 + Math.random() * 90).toFixed(1), d = (Math.random() * 2).toFixed(2), dur = (4.6 + Math.random() * 4.2).toFixed(2), sz = (5 + Math.random() * 6).toFixed(1); s += '<i style="left:' + l + '%;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + dur + 's;animation-delay:' + d + 's"></i>'; } return s; }
    function _esRain() { let s = ''; for (let i = 0; i < 16; i++) { const l = (Math.random() * 100).toFixed(1), d = (Math.random() * 1.8).toFixed(2), dur = (1.1 + Math.random() * 1.2).toFixed(2), h = (50 + Math.random() * 70).toFixed(0); s += '<i style="left:' + l + '%;height:' + h + 'px;animation-duration:' + dur + 's;animation-delay:' + d + 's"></i>'; } return s; }
    function removeEndScreen() { const e = document.getElementById('endscreen'); if (e) e.remove(); }
    function showEndScreen(win, reason) {
      removeEndScreen(); clearBanner(); sfx(win ? 'win' : 'lose');
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
      if (inPending) { cls.push('selectable'); if (G.pendingChoice.danger) cls.push('danger-sel'); } // 損失系（トラッシュ送り等）は赤ハイライト
      if (opt.attackTarget) cls.push('targetable');
      if (G.attackSel && G.attackSel.attacker && G.attackSel.attacker.uid === card.uid) cls.push('attacker');
      if (G._atkFrom && card.uid === G._atkFrom) cls.push('atk-active');
      if (G._atkTo && card.uid === G._atkTo) cls.push('atk-target');
      if (opt.playable) cls.push('playable');       // 出せる手札（事前アフォーダンス）
      if (opt.unplayable) cls.push('unplayable');   // 出せない手札（理由＝グレーアウト）
      if (opt.actable) cls.push('actable');         // 行動できる自分の盤面カード
      if (opt.win) cls.push('win-target');          // アタック対象プレビュー: 勝てる
      if (opt.lose) cls.push('lose-target');        // アタック対象プレビュー: 届かない
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
      // 手札カードのコストバッジ（出せる=緑発光／コスト軽減中=◆表示）
      let costChip = '';
      if (opt.hand && b.cost != null) {
        let ec = b.cost;
        try { if (typeof effCost === 'function') ec = effCost('me', card); } catch (e) { }
        costChip = '<div class="costchip' + (opt.playable ? ' ok' : '') + (ec < b.cost ? ' disc' : '') + '">' + ec + '</div>';
      }
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
        costChip +
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
        // 自分=下から上(上の札=次に取られる=index0が前面)。CPU=点対称で上から下に重ねる(z反転)
        const z = (P === G.players.cpu) ? (i + 1) : (P.life.length - i);
        if (c && c._faceUp) {
          cards += '<div class="lifecard up" style="z-index:' + z + '" data-no="' + c.base.no + '" title="' + escapeHTML(c.base.name) + '（表向き）">' +
            '<img src="' + IMG_ROT(c.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'">' +
            '<span class="lf-fb">' + escapeHTML(c.base.name) + '</span></div>';
        } else cards += '<div class="lifecard" style="z-index:' + z + '"></div>';
      }
      const lifeStack = '<div class="lifestack">' + (cards || '<span class="zero">0</span>') + '</div>';
      return '<div class="zone-side ga-life">' + lifeStack + '</div>';
    }
    /* ドンデッキ（ライフの下・残りドン山） */
    function donDeckBlock(P) {
      const donLeft = P.donMax - (P.don.active + P.don.rested + attachedSum(P));
      return '<div class="zone-side ga-dondeck">' + pileHTML(donLeft, 'donp') + '</div>';
    }
    /* デッキ（リーダーの右） */
    function deckBlock(P) { return '<div class="zone-side ga-deck">' + pileHTML(P.deck.length, 'cardback') + '</div>'; }
    /* トラッシュ（デッキの下） */
    function trashBlock(P) {
      const n = P.trash.length;
      if (n === 0) return '<div class="zone-side ga-trash"><div class="pile trashp"><span class="pc">0</span></div></div>';
      const top = P.trash[n - 1];
      const side = (P === G.players.me) ? 'me' : 'cpu';
      const fan = P.trash.slice().reverse().map(c =>
        '<div class="tf-card" title="' + escapeHTML(c.base.name) + '"><img src="' + IMG(c.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'"><span class="tf-fb">' + escapeHTML(c.base.name) + '</span></div>').join('');
      return '<div class="zone-side ga-trash">' +
        '<div class="trashtop" data-no="' + top.base.no + '" onclick="showTrashModal(\'' + side + '\')" title="最新: ' + escapeHTML(top.base.name) + '（クリック/ホバーで全表示）">' +
        '<img class="tt-img" src="' + IMG(top.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\'">' +
        '<span class="tt-fb">' + escapeHTML(top.base.name) + '</span>' +
        '<span class="tt-count">' + n + '</span>' +
        '<div class="trashfan"><div class="tf-head">トラッシュ ' + n + '枚（新しい順）</div><div class="tf-grid">' + fan + '</div></div>' +
        '</div></div>';
    }
    /* コストエリア（リーダーの下・固定幅で確保）: アクティブ=立て / レスト=横 */
    function donCostBlock(P) {
      const mine = P === G.players.me;
      const usable = mine && G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      let d = '';
      for (let i = 0; i < P.don.active; i++)d += '<div class="doncard' + (usable ? ' usable' : '') + '">D</div>';
      for (let i = 0; i < P.don.rested; i++)d += '<div class="doncard rest">D</div>';
      if (!d) d = '<div class="doncard ghost"></div>';
      return '<div class="zone-side doncost ga-cost"><div class="donrow">' + d + '</div></div>';
    }
    function handCountHTML(P) { return '<div class="zone-side ga-hand">' + pileHTML(P.hand.length, 'cardback') + '</div>'; }

    // 自分の盤面カードで「今このカードにできる行動があるか」（openOwnMenu の選択肢有無と一致させる）
    function ownActable(card) {
      if (G.active !== 'me' || !G.myActable || G.busy || G.attackSel) return false;
      const P = G.players.me; const b = card.base;
      if (canCardAttack(card)) return true;
      if (actUsable(card)) return true;
      if (b.leader === 'enel' && P._enelUsedTurn !== G.turnSeq && P.turnsTaken >= 2) return true;
      if (b.leader === 'lucy' && P._lucyDrawTurn !== G.turnSeq && P._lucyEventTurn === G.turnSeq) return true;
      if (P.don.active >= 1 && b.type !== 'STAGE') return true; // ドン付与
      return false;
    }
    // アタック対象プレビュー: 今のパワー比較で攻撃側が勝てるか（ブロック/カウンター前の概算）
    function atkPreview(targetCard) {
      if (!G.attackSel || !G.attackSel.attacker) return {};
      const ap = power(G.attackSel.attacker), dp = power(targetCard);
      return ap >= dp ? { win: true } : { lose: true };
    }
    function charRowHTML(side) {
      const P = G.players[side]; const isMe = side === 'me';
      const myAct = isMe && G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      const cards = P.chars.map(c => {
        const target = (!isMe) && G.attackSel && c.rested;
        const opt = { clickable: myAct, attackTarget: target, actable: isMe && ownActable(c) };
        if (target) Object.assign(opt, atkPreview(c));
        return cardHTML(c, opt);
      });
      const empt = []; for (let i = P.chars.length; i < 5; i++)empt.push('<div class="slot">+</div>');
      return '<div class="row charrow ga-chars">' + cards.join('') + empt.join('') + '</div>';
    }
    function leaderBlock(side, isMe) {
      const P = G.players[side]; const L = P.leader;
      const myAct = isMe && G.active === 'me' && G.myActable && !G.busy && !G.attackSel;
      const target = (!isMe) && G.attackSel && (!G.attackSel.attacker || canTargetLeader(G.attackSel.attacker));
      const lopt = { clickable: myAct, attackTarget: target, actable: isMe && ownActable(L) };
      if (target) Object.assign(lopt, atkPreview(L));
      const leaderCard = cardHTML(L, lopt);
      let stage = '';
      if (P.stage) stage = '<div class="zone-side" style="margin-left:8px">' + cardHTML(P.stage, { clickable: myAct, actable: isMe && ownActable(P.stage) }) + '</div>';
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
        const playable = canPlay && handPlayable(c);
        return cardHTML(c, { clickable: playable, playable: playable, unplayable: canPlay && !playable, small: false, hand: true });
      }).join('');
    }
    function handPlayable(c) {
      const side = c.owner; const P = G.players[side]; const b = c.base; // side=カード所有者（オンライン対戦のcpu席人間にも正しく効く）
      if (P._noPlayTurn === G.turnSeq) return false; // このターン手札からプレイ不可（OP13-028）
      if (b.type === 'CHAR') return !summonBanned(side, c) && effCost(side, c) <= P.don.active; // 5体でも出せる（登場時に1体トラッシュ）。登場ban中は不可
      if (b.type === 'STAGE') return (b.cost || 0) <= P.don.active;
      if (b.type === 'EVENT') return !!(b.fx && b.fx.main) && effCost(side, c) <= P.don.active; // イベントもcostMod(条件付きコスト減)を反映
      return false;
    }

    function controlsHTML() {
      if (G.winner) return '<button class="phasebtn go" onclick="backToSelect()">もう一度プレイ</button>';
      if (G.active === 'me' && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
        const P = G.players.me;
        if (G.attackSel) {
          const tgts = (typeof legalTargets === 'function') ? legalTargets('me', G.attackSel.attacker).length : 0;
          return '<div class="hintbar atk">' +
            '<span class="hb-lead">⚔ 攻撃対象を選択</span>' +
            '<span class="hb-chip warn">対象 <b>' + tgts + '</b></span>' +
            '<span class="hb-tip">光る相手カードをクリック／攻撃キャラ再クリックで取消</span></div>' +
            '<button class="phasebtn ghost" onclick="cancelAttackSel()">取消</button>';
        }
        const playN = P.hand.filter(handPlayable).length;
        const atkN = (typeof canCardAttack === 'function') ? [P.leader, ...P.chars].filter(canCardAttack).length : 0;
        const actN = [...P.chars, ...(P.stage ? [P.stage] : [])].filter(c => actUsable(c) && !isNegated(c)).length;
        const idle = playN + atkN + actN === 0;
        // チップは押すと該当カードがスポットライトされる（どれが動かせるかを能動提示）
        const chip = (cls, label, n, spot) => '<button class="hb-chip' + (n ? '' : ' zero') + (cls ? ' ' + cls : '') + '"' +
          (n && spot ? ' onclick="spotCards(\'' + spot + '\')"' : ' disabled') + '>' + label + ' <b>' + n + '</b></button>';
        return '<div class="hintbar">' +
          '<span class="hb-lead">あなたのメイン</span>' +
          '<span class="hb-chip don">◈ ドン <b>' + P.don.active + '</b></span>' +
          chip('', '🃏 出せる手札', playN, 'playable') +
          chip('', '⚔ アタック可', atkN, 'actable') +
          (actN ? chip('act', '✦ 起動', actN, 'actable') : '') +
          '<span class="hb-tip">' + (idle ? 'できる行動はありません — ターンを終了しましょう' : 'チップを押すと該当カードが光ります／カードをクリックで行動') + '</span></div>' +
          '<button class="phasebtn go' + (idle ? ' pulse' : '') + '" onclick="uiEndTurn()">ターン終了 ▶</button>';
      }
      return '<span class="thinking"><span>' + (G.active === 'cpu' ? 'CPU 思考中' : '処理中') + '</span><span class="dots"><span>●</span><span>●</span><span>●</span></span></span>';
    }

    function promptHTML() {
      const ps = G.promptState; if (!ps) return '';
      const idx = ps.opts.map((o, i) => ({ o, i }));
      const cardOpts = idx.filter(x => x.o.card);
      const plainOpts = idx.filter(x => !x.o.card);
      let h = '<div class="prompt show ' + (ps.cls || '') + '"><h3>' + (ps.title || '') + '</h3>' + (ps.text ? '<p>' + ps.text + '</p>' : '');
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
        '<button class="side-close" onclick="closeSidePanel()" aria-label="情報パネルを閉じる">×</button>' +
        '</div>' +
        '<div class="panel ' + (hintsActive ? '' : 'hidden') + '" id="hintsPanel">' +
        '<div class="hint-head">🔮 でんでん虫でCPUの次の手番を予測します。</div>' +
        '<button class="dendenbtn" onclick="predictCPU()" ' + (G._predicting ? 'disabled' : '') + '>' + (G._predicting ? '解析中…' : '📞 CPUの手を読む') + '</button>' +
        (G._aiIntent ? '<div class="ai-intent"><div class="ai-t">🧠 CPUの狙い</div>' + G._aiIntent + '</div>' : '') +
        ((G._lastCpuSummary && G._lastCpuSummary.length) ? '<div class="cpu-summary"><div class="cs-h">🗒 前のCPUターンの行動</div>' + G._lastCpuSummary.map(t => '<div class="cs-line">' + escapeHTML(t) + '</div>').join('') + '</div>' : '') +
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
      if (G._sim) return;   // ★AI探索(puct)の内部シミュレーション中は描画しない（盤面のチラつき防止＝代わりに「AI思考中」バッジ）
      if (!G.inGame) return;
      const scr = document.getElementById('screen');
      const pc = G.pendingChoice;
      const feltCls = 'felt' + (pc ? ' picking' : '') + (G.attackSel ? ' selecting' : '') + (pc && pc.uids && pc.uids.size >= 4 ? ' many-sel' : '');
      scr.innerHTML =
        '<div id="board"><div class="' + feltCls + '">' +
        sideHTML('cpu', false) +
        '<div class="midline"><span class="vs">VS</span></div>' +
        sideHTML('me', true) +
        '<div class="handzone" id="myhand">' + handHTML() + '</div>' +
        '<div class="controls">' + controlsHTML() + '</div>' +
        '</div>' + sidePanelHTML() + '</div>';
      setPhase(G.phase);
      drawAtkLine();  // アタック中は攻撃元→対象の光の線を引き直す（フル再描画で消えるため毎回）
      renderPrompt(); // プロンプトは盤面と独立したオーバーレイで同期（盤面の再描画＝画像ちらつきを避ける）
    }
    // プロンプト（メニュー/確認/選択）を body 直付けの #promptHost に描画。盤面 render() とは独立。
    function renderPrompt() {
      let host = document.getElementById('promptHost');
      if (!G.promptState) { if (host) host.remove(); return; }
      if (!host) { host = document.createElement('div'); host.id = 'promptHost'; document.body.appendChild(host); }
      host.innerHTML = promptHTML();
    }
    function clearPromptHost() { const h = document.getElementById('promptHost'); if (h) h.remove(); }

    /* ---------- 部分更新ヘルパー（render()のフル再描画は温存。副作用の無い局所のみ差し替える） ----------
       render() は #screen を毎回作り直すため、入力中フォーカスやアニメが飛ぶ。
       ここは「追加」であり既存の render() 呼び出しは置き換えない。安全な局面でのみ使う。 */
    function patchEl(sel, html) { const el = document.querySelector(sel); if (!el) return false; el.innerHTML = html; return true; }
    function updateControls() { patchEl('.controls', controlsHTML()); }
    function updateHand() { const el = document.getElementById('myhand'); if (el) el.innerHTML = handHTML(); }
    // 攻撃選択・対象選択など「盤面のクラスとコントロールだけ」変わる局面用：フル再描画と等価だが既存呼び出しは温存
    function refreshActable() { updateControls(); }

    function showBattleScreen() {
      G.inGame = true; G.phase = '開始';
      document.getElementById('turnpill').style.display = 'flex';
      document.getElementById('aiToggleWrap').style.display = 'inline-flex';
      document.getElementById('menuBtn').style.display = '';
      document.getElementById('sideToggle').style.display = '';
      document.getElementById('aiSwitch').classList.toggle('on', G.aiOn);
      updateHud();
      render();
    }

