    "use strict";
    /* =========================================================================
       ===============  デッキ選択画面  ========================================
       ========================================================================= */
    function renderSelect() {
      const scr = document.getElementById('screen');
      // 再描画でスクロール位置が先頭に戻らないよう、現在のスクロール量を退避（デッキ選択のたびに上へ飛ぶ問題の対策）
      const prevWrap = scr.querySelector('.select-wrap');
      const prevY = prevWrap ? prevWrap.scrollTop : 0;
      ensureSel();
      if (!G.firstPref) G.firstPref = 'random'; // 先攻の希望（random/me/cpu）。既定はランダム
      const tierRank = { 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };
      const ordered = DECKS.concat(G.customDecks || []).slice().sort((a, b) => (tierRank[a.tier] || 9) - (tierRank[b.tier] || 9));
      const deckCard = (d, which) => {
        const isSel = (which === 'cpu' ? G.sel.cpu : G.sel.me) === d.id;
        const fn = which === 'cpu' ? 'selCpu' : 'selMy';
        return '<div class="deck-card ' + (isSel ? 'sel' : '') + '" onclick="' + fn + '(\'' + d.id + '\')">' +
          '<div class="tierbadge">' + d.tier + '</div>' +
          '<div class="share" onclick="event.stopPropagation();showDeckList(\'' + d.id + '\')">デッキ</div>' +
          '<div class="art" style="background-image:url(\'' + IMG(d.leader) + '\')"><div class="scrim"></div>' +
          '<div class="art-nm">' + escapeHTML(d.name) + '</div></div>' +
          '<div class="deck-pop">' +
          '<div class="pop-nm">' + escapeHTML(d.name) + '</div>' +
          '<div class="colors">' + d.colors.map(c => '<span class="dot" style="background:' + COLOR_HEX[c] + '"></span>').join('') + '<span style="font-size:11px;color:var(--muted);margin-left:5px">使用率 ' + d.usage + '</span></div>' +
          '<div class="pop-desc">' + d.desc + '</div>' +
          '<span class="style-tag">' + d.style + ' ・ 再現度:' + (d.accuracy === 'high' ? '高' : '中') + '</span>' +
          '</div></div>';
      };
      const grid = ordered.map(d => deckCard(d, 'me')).join('');
      const cpuGrid = ordered.map(d => deckCard(d, 'cpu')).join('');
      scr.innerHTML = '<div class="select-wrap">' +
        '<h1>ONE PIECE CARD BATTLE</h1>' +
        '<div class="builder-row">' +
        '<button class="bd-make" onclick="openBuilder()">＋ デッキを作る</button>' +
        '<button class="bd-import" onclick="document.getElementById(\'deckImport\').click()">📥 インポート</button>' +
        '<input type="file" id="deckImport" accept=".json,application/json" style="display:none" onchange="importDeckFile(this)">' +
        ((G.customDecks && G.customDecks.length) ? '<span class="bd-count">自作デッキ ' + G.customDecks.length + ' 件（下のグリッドに表示）</span>' : '') +
        '</div>' +
        '<div class="sect-label">① あなたのデッキ</div>' +
        '<div class="deck-grid">' + grid + '</div>' +
        '<div class="sect-label">② 対戦相手 (CPU) のデッキ</div>' +
        '<div class="deck-grid">' + cpuGrid + '</div>' +
        '<div class="start-row">' +
        '<div class="first-pick"><span class="fp-label">先攻</span><div class="seg">' +
        [['random', 'ランダム'], ['me', 'あなた'], ['cpu', 'CPU']].map(([v, t]) =>
          '<button class="seg-btn' + (G.firstPref === v ? ' on' : '') + '" onclick="setFirstPref(\'' + v + '\')">' + t + '</button>').join('') +
        '</div></div>' +
        '<div class="first-pick"><span class="fp-label">CPU強さ</span><div class="seg">' +
        [['normal', '標準'], ['strong', '強い(AI探索)']].map(([v, t]) =>
          '<button class="seg-btn' + ((G.cpuStrength || 'normal') === v ? ' on' : '') + '" onclick="setCpuStrength(\'' + v + '\')">' + t + '</button>').join('') +
        '</div></div>' +
        '<div class="pick-info">' + pickInfo() + '</div>' +
        '<button class="btn-primary" ' + ((G.sel.me && G.sel.cpu) ? '' : 'disabled') + ' onclick="doStart()">BATTLE START</button>' +
        (!(G.sel.me && G.sel.cpu) ? '<div class="tip warn">' + (!G.sel.me ? '① あなたのデッキを選んでください' : '② 対戦相手のデッキを選んでください') + '</div>' : '') +
        '<div class="tip">カード画像は公式サイトから読み込み（読めない場合は自動でテキスト表示に切替）。</div>' +
        '</div></div>';
      const newWrap = scr.querySelector('.select-wrap');
      if (newWrap && prevY) newWrap.scrollTop = prevY; // 退避したスクロール位置を復元
    }
    function pickInfo() { const dm = G.sel.me && findDeck(G.sel.me); const dc = G.sel.cpu && findDeck(G.sel.cpu); return 'あなた: <b>' + (dm ? escapeHTML(dm.name) : '未選択') + '</b>　／　CPU: <b>' + (dc ? escapeHTML(dc.name) : '未選択') + '</b>'; }
    function selMy(id) { G.sel.me = id; if (!G.sel.cpu) { const o = DECKS.filter(d => d.id !== id); G.sel.cpu = o[Math.random() * o.length | 0].id; } renderSelect(); }
    function selCpu(id) { G.sel.cpu = id; renderSelect(); }
    function setFirstPref(v) { G.firstPref = v; renderSelect(); } // 先攻の希望を設定（常時設置のセグメント）
    function setCpuStrength(v) { G.cpuStrength = v; renderSelect(); } // CPU強さ: normal=heuristic / strong=puct(AI探索)
    function doStart() {
      if (!G.sel.me || !G.sel.cpu) return;
      startGame(G.sel.me, G.sel.cpu);
      // 「強い」CPU＝AI探索エージェント(puct)。startGame直後（CPUの初手前）に設定。enelは内部で素heuristicにフォールバック。
      if (G.cpuStrength === 'strong' && G.players && G.players.cpu) G.players.cpu.agent = 'puct';
    }

    /* =========================================================================
       ===============  モーダル / ルール  =====================================
       ========================================================================= */
    function openModal(title, html) {
      closeModal();
      const back = document.createElement('div'); back.className = 'modal-back show'; back.id = 'modalBack';
      back.innerHTML = '<div class="modal"><button class="close" onclick="closeModal()">×</button><h2>' + title + '</h2>' + html + '</div>';
      back.addEventListener('click', e => { if (e.target === back) closeModal(); });
      document.body.appendChild(back);
    }
    function closeModal() { const m = document.getElementById('modalBack'); if (m) m.remove(); }
    const RULES_HTML =
      '<p><b>勝利条件：</b>相手のライフが0の状態でリーダーにダメージを与える／相手のデッキが0枚になる。</p>' +
      '<p><b>ライフ＝手札：</b>リーダーが被弾するとライフ上の1枚が手札に入る（=ダメージを受けると手札が増える）。【トリガー】持ちなら発動も可能。</p>' +
      '<p><b>ターンの流れ：</b>①リフレッシュ（ドン/レスト解除）②ドロー（先攻初手は無し）③ドン+2（先攻初手は+1）④メイン（登場/効果/ドン付与/アタック）⑤エンド。先攻初手はアタック不可。</p>' +
      '<p><b>ドン!!：</b>毎ターン2枚追加（最大10／エネルは6）。コスト支払いでレスト、キャラ/リーダーに付与すると自分のターン中+1000/枚。</p>' +
      '<p><b>バトル：</b>①アタック宣言（アクティブを→レスト、対象は相手リーダーか相手のレストキャラ）②ブロック③カウンター（手札のカウンター値やイベント）④パワー比較（攻撃側≧防御側で成功）。</p>' +
      '<p><b>キーワード：</b>【速攻】登場ターンに攻撃可／【ブロッカー】肩代わり／【ダブルアタック】リーダーへ2ダメージ／【バニッシュ】ライフをトラッシュへ。</p>' +
      '<p style="color:var(--muted);font-size:12px">※本シミュレータはルールエンジンを公式準拠で実装。カード効果は主要なものを実装し、複雑な効果は「簡易」表示で近似しています。</p>';
    function showRules() { openModal('ルール（スタンダード）', RULES_HTML); }
    function showDeckList(id) {
      const d = findDeck(id);
      const lines = Object.entries(d.list).map(([no, n]) => { const c = C[no]; return '<div>' + n + '× ' + escapeHTML(c ? c.name : no) + ' <span style="color:var(--muted-2)">' + no + '</span>' + (c && c.simp ? ' <span style="color:#ffd27a">[簡易]</span>' : '') + '</div>'; });
      const total = Object.values(d.list).reduce((a, b) => a + b, 0);
      openModal(escapeHTML(d.name) + ' デッキリスト',
        '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:7px">' +
        d.colors.map(c => '<span class="dot" style="background:' + COLOR_HEX[c] + '"></span>').join('') +
        '<span style="font-size:11px;color:var(--gold-soft);border:1px solid var(--line);border-radius:6px;padding:2px 7px">' + d.tier + '</span>' +
        '<span style="font-size:11px;color:var(--gold-soft);border:1px solid var(--line);border-radius:6px;padding:2px 7px">' + d.style + ' ・ 再現度:' + (d.accuracy === 'high' ? '高' : '中') + '</span>' +
        '<span style="font-size:11px;color:var(--muted)">使用率 ' + d.usage + '</span>' +
        '</div>' +
        '<div style="margin-bottom:10px;font-size:12.5px;color:var(--ink);line-height:1.6">' + d.desc + '</div>' +
        '<div style="margin-bottom:8px;color:var(--muted)">リーダー: ' + escapeHTML(C[d.leader].name) + ' (' + d.leader + ') ／ メイン' + total + '枚</div>' +
        '<div class="deck-list-cols">' + lines.join('') + '</div>');
    }

    /* =========================================================================
       ===============  デッキビルダー（自作デッキ）  ==========================
       ========================================================================= */
    function leaderColors(no) { return (C[no] && C[no].color) || []; }
    function cardLegalForLeader(no, leaderNo) {
      const c = C[no]; if (!c || c.type === 'LEADER') return false;
      const lc = leaderColors(leaderNo);
      return (c.color || []).some(col => lc.includes(col));
    }
    function deckTotal(list) { return Object.values(list || G.builder.list).reduce((a, b) => a + b, 0); }
    // 「ルール上、このカードはデッキに何枚でも入れることができる」カード（例 OP16-042 インペルダウンの囚人）は4枚制限の対象外
    function isUnlimitedCard(no) { return !!(C[no] && /何枚でも入れることができる/.test(C[no].text || '')); }
    function ensureSel() { return (G.sel = G.sel || { me: null, cpu: null }); } // デッキ選択状態を初期化して返す
    function openBuilder() { G.builder = { leaderNo: null, list: {}, name: '', filter: 'all' }; renderDeckBuilder(); }
    function builderPickLeader(no) {
      const b = G.builder; b.leaderNo = no; b.packFilter = 'all'; // リーダー変更で使える弾が変わるため弾フィルタはリセット
      for (const cn of Object.keys(b.list)) if (!cardLegalForLeader(cn, no)) delete b.list[cn]; // 色が合わなくなった札を除去
      renderDeckBuilder();
    }
    function builderSetType(t) { G.builder.filter = t; renderDeckBuilder(); }
    function builderSetColor(c) { G.builder.colorFilter = c; renderDeckBuilder(); }
    function builderSetPack(p) { G.builder.packFilter = p; renderPool(); } // 弾フィルタ：プールだけ更新（selectの選択状態を保つ）
    function builderSearch(v) { G.builder.search = v; renderPool(); } // プールだけ更新＝検索ボックスのフォーカス維持
    function builderAdd(no) {
      const b = G.builder; if (!b.leaderNo) { toast('先にリーダーを選択'); return; }
      if (!cardLegalForLeader(no, b.leaderNo)) { toast('リーダーの色と合いません'); return; }
      if (!isUnlimitedCard(no) && (b.list[no] || 0) >= 4) { toast('同じカードは4枚まで'); return; }
      if (deckTotal() >= 50) { toast('デッキは50枚まで'); return; }
      b.list[no] = (b.list[no] || 0) + 1; renderPool(); renderPanel();
    }
    function builderRemove(no) {
      const b = G.builder; if (!b.list[no]) return;
      b.list[no]--; if (b.list[no] <= 0) delete b.list[no]; renderPool(); renderPanel();
    }
    function builderValidate(b) {
      b = b || G.builder; const errors = []; const total = deckTotal(b.list);
      if (!b.leaderNo) errors.push('リーダー未選択');
      if (total !== 50) errors.push('合計' + total + '枚（50枚必要）');
      for (const [no, n] of Object.entries(b.list || {})) {
        if (n > 4 && !isUnlimitedCard(no)) errors.push((C[no] ? C[no].name : no) + 'が5枚以上');
        if (!C[no]) errors.push('未定義カード: ' + no);
        if (b.leaderNo && !cardLegalForLeader(no, b.leaderNo)) errors.push((C[no] ? C[no].name : no) + 'が色不一致');
      }
      // イム(OP13-079): ルール上、コスト2以上のイベントをデッキに入れられない
      if (b.leaderNo && C[b.leaderNo] && C[b.leaderNo].name === 'イム') { for (const no of Object.keys(b.list || {})) { if (C[no] && C[no].type === 'EVENT' && (C[no].cost || 0) >= 2) errors.push((C[no].name || no) + 'はイムのデッキに入れられません(コスト2以上イベント禁止)'); } }
      return { ok: errors.length === 0, errors, total };
    }
    function builderToDeck(b, id) {
      G._customSeq = (G._customSeq || 0) + 1;
      const allImpl = Object.keys(b.list).every(no => C[no] && C[no].fx);
      return {
        id: id || ('custom-' + G._customSeq),
        name: (b.name && b.name.trim()) || 'マイデッキ',
        leader: b.leaderNo, colors: leaderColors(b.leaderNo).slice(), list: Object.assign({}, b.list),
        tier: 'CUSTOM', usage: '自作', style: 'カスタム', accuracy: allImpl ? 'high' : 'mid',
        desc: '自分で構築したカスタムデッキ。', custom: true
      };
    }
    function builderSave() {
      const ni = document.getElementById('bd-name'); if (ni) G.builder.name = ni.value;
      const v = builderValidate(); if (!v.ok) { toast(v.errors[0]); return; }
      const deck = builderToDeck(G.builder);
      G.customDecks.push(deck);
      ensureSel().me = deck.id;
      toast('「' + deck.name + '」を保存しました');
      backToSelect();
    }
    function builderExport() {
      const ni = document.getElementById('bd-name'); if (ni) G.builder.name = ni.value;
      const b = G.builder; if (!b.leaderNo) { toast('先にリーダーを選択'); return; }
      const data = { _format: 'opcg-deck-v1', name: (b.name || 'マイデッキ').trim(), leader: b.leaderNo, list: Object.assign({}, b.list) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (data.name.replace(/[^\wぁ-んァ-ヶ一-龠ー]/g, '_') || 'deck') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('エクスポートしました（' + a.download + '）');
    }
    function importDeckFile(input) {
      const file = input.files && input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { try { importDeckData(JSON.parse(e.target.result)); } catch (err) { toast('JSONの読み込みに失敗'); } input.value = ''; };
      reader.readAsText(file);
    }
    function importDeckData(data) {
      if (!data || !data.leader || !data.list) { toast('デッキ形式が不正です'); return; }
      if (!C[data.leader] || !C[data.leader].leader) { toast('リーダー不明: ' + data.leader); return; }
      const b = { leaderNo: data.leader, list: {}, name: data.name || 'インポートデッキ' };
      for (const [no, n] of Object.entries(data.list)) {
        if (!C[no]) { toast('未対応カード: ' + no); return; } // Phase1は実装済みカードのみ
        b.list[no] = n | 0;
      }
      const v = builderValidate(b); if (!v.ok) { toast('不正なデッキ: ' + v.errors[0]); return; }
      const deck = builderToDeck(b);
      G.customDecks.push(deck);
      ensureSel().me = deck.id;
      toast('「' + deck.name + '」をインポートしました');
      renderSelect();
    }
    function bdImg(no) { // アプリ標準の <img referrerpolicy=no-referrer> ＋ 失敗時は名前テキスト
      return '<img class="bd-img" src="' + IMG(no) + '" referrerpolicy="no-referrer" loading="lazy" decoding="async" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="bd-fb">' + escapeHTML((C[no] && C[no].name) || no) + '</span>';
    }
    // 「効果未実装」と表示すべきか：実装(fx)が無く、かつバニラ/キーワードのみでない（本当に効果があるのに未実装）
    function isEffectMissing(c) {
      if (c.fx) return false;
      let t = (c.text || '').trim();
      if (t === '' || t === '-') return false; // 効果なし（バニラ）
      t = t.replace(/【ブロッカー】\([^)]*\)/g, '').replace(/【速攻】\([^)]*\)/g, '').replace(/【ダブルアタック】\([^)]*\)/g, '').replace(/【バニッシュ】\([^)]*\)/g, '')
        .replace(/【ブロッカー】|【速攻】|【ダブルアタック】|【バニッシュ】/g, '').replace(/[【】\s、。]/g, '').trim();
      return t.length > 0; // キーワード以外の効果文が残る＝未実装
    }
    function poolCards() {
      const b = G.builder;
      let cards = Object.keys(C).filter(no => cardLegalForLeader(no, b.leaderNo));
      cards = cards.filter(no => !/_r\d+$/.test(no) || !C[no.replace(/_r\d+$/, '')]); // パラレル(_rN=別イラストの同一カード)は本体があれば一覧から除外＝重複表示防止（本体が無い孤立パラレルのみ残す）
      if (b.filter && b.filter !== 'all') cards = cards.filter(no => C[no].type === b.filter);
      if (b.colorFilter && b.colorFilter !== 'all') cards = cards.filter(no => (C[no].color || []).includes(b.colorFilter));
      if (b.packFilter && b.packFilter !== 'all') cards = cards.filter(no => no.split('-')[0] === b.packFilter); // 弾(セット)で絞り込み
      if (b.search && b.search.trim()) { const q = b.search.trim().toLowerCase(); cards = cards.filter(no => (C[no].name || '').toLowerCase().includes(q) || no.toLowerCase().includes(q)); }
      cards.sort((x, y) => y.localeCompare(x, undefined, { numeric: true })); // カード番号の降順（OP00-000、数値対応の自然順）
      return cards;
    }
    function renderPool() {
      const el = document.getElementById('bd-pool'); if (!el) return;
      const b = G.builder; const all = poolCards(); const CAP = 300;
      el.innerHTML = all.slice(0, CAP).map(no => {
        const c = C[no]; const cnt = b.list[no] || 0;
        const mark = isEffectMissing(c) ? '<span class="bd-novfx">効果未実装</span>' : '';
        return '<div class="bd-tile' + (cnt > 0 ? ' has' : '') + '">' +
          '<div class="bd-art">' + bdImg(no) +
          '<span class="bd-cost">' + (c.cost != null ? c.cost : '-') + '</span>' + mark + '</div>' +
          '<div class="bd-nm" title="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + '</div>' +
          '<div class="bd-sub">' + typeJa(c.type) + (c.power ? (' P' + c.power) : '') + (c.counter ? (' +' + c.counter) : '') + '</div>' +
          '<div class="bd-ctl"><button class="bd-mn" onclick="builderRemove(\'' + no + '\')">−</button>' +
          '<span class="bd-num">' + cnt + '</span>' +
          '<button class="bd-pl" onclick="builderAdd(\'' + no + '\')">＋</button></div></div>';
      }).join('') || '<div class="bd-empty">該当するカードがありません</div>';
      const note = document.getElementById('bd-poolnote');
      if (note) note.textContent = all.length > CAP ? (all.length + '枚中 ' + CAP + '枚を表示（検索・色・種別で絞り込めます）') : (all.length + '枚');
    }
    function renderPanel() {
      const el = document.getElementById('bd-panel'); if (!el) return;
      const b = G.builder; const total = deckTotal(); const v = builderValidate();
      const rows = Object.entries(b.list).filter(e => e[1] > 0).sort((x, y) => (C[x[0]].cost || 0) - (C[y[0]].cost || 0)).map(([no, n]) =>
        '<div class="bd-row"><span class="bd-rc">' + n + '×</span><span class="bd-rn">' + escapeHTML(C[no].name) + '</span>' +
        '<span class="bd-rb"><button onclick="builderRemove(\'' + no + '\')">−</button><button onclick="builderAdd(\'' + no + '\')">＋</button></span></div>').join('') || '<div class="bd-empty">＋でカードを追加</div>';
      el.innerHTML =
        '<input id="bd-name" class="bd-name" placeholder="デッキ名" value="' + escapeHTML(b.name || '') + '" oninput="G.builder.name=this.value">' +
        '<div class="bd-total' + (total === 50 ? ' ok' : '') + '">' + total + ' / 50 枚</div>' +
        '<div class="bd-valid' + (v.ok ? ' ok' : '') + '">' + (v.ok ? '✓ 構築OK' : escapeHTML(v.errors.join(' / '))) + '</div>' +
        '<div class="bd-rows">' + rows + '</div>' +
        '<div class="bd-actions"><button class="bd-save" ' + (v.ok ? '' : 'disabled') + ' onclick="builderSave()">保存して選択へ</button>' +
        '<button class="bd-exp" onclick="builderExport()">JSON書き出し</button></div>';
    }
    function renderLeaders() {
      const el = document.getElementById('bd-lead-row'); if (!el) return;
      const b = G.builder;
      let leaders = Object.keys(C).filter(no => C[no].leader);
      if (b.leaderSearch && b.leaderSearch.trim()) { const q = b.leaderSearch.trim().toLowerCase(); leaders = leaders.filter(no => (C[no].name || '').toLowerCase().includes(q) || no.toLowerCase().includes(q) || (C[no].color || []).some(cl => cl === q)); }
      leaders.sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
      el.innerHTML = leaders.map(no => '<div class="bd-leader' + (b.leaderNo === no ? ' sel' : '') + '" onclick="builderPickLeader(\'' + no + '\')" title="' + escapeHTML(C[no].name) + '">' +
        '<div class="bd-lart">' + bdImg(no) + '</div><span>' + escapeHTML(C[no].name) + '</span></div>').join('') || '<div class="bd-empty">該当リーダーなし</div>';
    }
    function builderLeaderSearch(v) { G.builder.leaderSearch = v; renderLeaders(); }
    function renderDeckBuilder() {
      const b = G.builder; const scr = document.getElementById('screen');
      const nLeaders = Object.keys(C).filter(no => C[no].leader).length;
      const nCards = Object.keys(C).filter(n => !C[n].leader).length;
      let controls = '';
      if (b.leaderNo) {
        const typeBtns = ['all', 'CHAR', 'EVENT', 'STAGE'].map(t => '<button class="bd-fbtn' + ((b.filter || 'all') === t ? ' on' : '') + '" onclick="builderSetType(\'' + t + '\')">' + (t === 'all' ? '全種別' : typeJa(t)) + '</button>').join('');
        const cols = leaderColors(b.leaderNo);
        const colorBtns = cols.length > 1 ? (['all'].concat(cols)).map(cc => '<button class="bd-fbtn' + ((b.colorFilter || 'all') === cc ? ' on' : '') + '" onclick="builderSetColor(\'' + cc + '\')">' + (cc === 'all' ? '全色' : ('<span class="bd-cdot" style="background:' + COLOR_HEX[cc] + '"></span>' + cc)) + '</button>').join('') : '';
        // 弾(セット)で絞り込み：このリーダーで使えるカードに含まれる弾だけを選択肢に
        const packs = [...new Set(Object.keys(C).filter(no => cardLegalForLeader(no, b.leaderNo) && !/_r\d+$/.test(no)).map(no => no.split('-')[0]))].sort();
        const packSel = '<select class="bd-fsel" onchange="builderSetPack(this.value)"><option value="all"' + ((b.packFilter || 'all') === 'all' ? ' selected' : '') + '>全弾</option>' + packs.map(p => '<option value="' + p + '"' + (b.packFilter === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>';
        controls = '<div class="bd-filters"><input class="bd-search" placeholder="🔍 カード名・番号で検索" value="' + escapeHTML(b.search || '') + '" oninput="builderSearch(this.value)">' + typeBtns + colorBtns + packSel + '</div>' +
          '<div class="bd-poolnote" id="bd-poolnote"></div>';
      }
      scr.innerHTML = '<div class="bd-wrap"><div class="bd-head"><button class="bd-back" onclick="backToSelect()">← 戻る</button><h1>デッキ作成</h1>' +
        '<span class="bd-note">' + nLeaders + 'リーダー／' + nCards + '枚から構築（色はリーダー準拠。未実装効果はテキスト表示のみ）</span></div>' +
        '<div class="bd-leadhead">リーダーを選択：</div>' +
        '<input class="bd-search bd-lsearch" placeholder="🔍 リーダーを検索（名前・色）" value="' + escapeHTML(b.leaderSearch || '') + '" oninput="builderLeaderSearch(this.value)">' +
        '<div class="bd-lead-row" id="bd-lead-row"></div>' + controls +
        '<div class="bd-main"><div class="bd-pool" id="bd-pool"></div><div class="bd-panel" id="bd-panel"></div></div></div>';
      renderLeaders();
      if (b.leaderNo) { renderPool(); renderPanel(); }
      else { const p = document.getElementById('bd-panel'); if (p) p.innerHTML = '<div class="bd-empty">まずリーダーを選んでください</div>'; }
    }

    /* =========================================================================
       ===============  プレビュー / 初期化  ===================================
       ========================================================================= */
    // カード詳細のHTML（ホバープレビュー＝デスクトップ／長押しモーダル＝タッチ で共用）
    function cardDetailHTML(b) {
      const colorHex = COLOR_HEX[(b.color && b.color[0])] || '#1a2c3c';
      return '<div style="border-top:4px solid ' + colorHex + ';padding:13px 15px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">' +
        '<div style="font-weight:900;font-size:15px;line-height:1.25;color:var(--ink)">' + escapeHTML(b.name) + '</div>' +
        (b.cost != null ? '<div style="flex:0 0 auto;font-family:\'Bebas Neue\';font-size:17px;color:#1a1205;background:linear-gradient(180deg,var(--gold-soft),var(--gold-dim));border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center">' + b.cost + '</div>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">' + typeJa(b.type) + (b.traits && b.traits.length ? ' ・ ' + b.traits.join(' / ') : '') + (b.color && b.color.length ? ' ・ ' + b.color.join('') + '色' : '') + '</div>' +
        ((b.power != null || b.counter) ? '<div style="display:flex;gap:16px;margin-bottom:8px;font-family:\'Bebas Neue\'">' +
          (b.power != null ? '<div style="font-size:19px;color:#fff">パワー <span style="color:var(--gold-soft)">' + b.power + '</span></div>' : '') +
          (b.counter ? '<div style="font-size:19px;color:#fff">カウンター <span style="color:#ffd27a">' + b.counter + '</span></div>' : '') +
          '</div>' : '') +
        '<div style="font-size:12px;line-height:1.65;color:var(--ink);border-top:1px solid var(--line);padding-top:8px">' + escapeHTML(b.text || '（効果なし）') + '</div>' +
        (b.simp ? '<div style="margin-top:7px;font-size:10.5px;color:#ffd27a">※このカードの効果は簡易実装です</div>' : '') +
        '</div>';
    }
    function onHover(e) {
      const pv = document.getElementById('preview'); if (!pv) return;
      if (window.innerWidth < 1000) { pv.style.display = 'none'; return; }
      const el = e.target.closest && e.target.closest('.card[data-no]');
      if (!el) { pv.style.display = 'none'; return; }
      const no = el.getAttribute('data-no'); const b = C[no]; if (!b) { pv.style.display = 'none'; return; }
      if (pv._no !== no) { pv._no = no; pv.innerHTML = cardDetailHTML(b); }
      let x = e.clientX + 18, y = e.clientY - 30;
      if (x + 280 > window.innerWidth) x = e.clientX - 288;
      if (y < 10) y = 10; if (y + 260 > window.innerHeight) y = Math.max(10, window.innerHeight - 260);
      pv.style.left = x + 'px'; pv.style.top = y + 'px'; pv.style.display = 'block';
    }
    // タッチ: カード詳細を中央モーダルで表示（背景タップで閉じる）。長押しで発火。
    function showCardModal(no) {
      const b = C[no]; if (!b) return;
      closeModal();
      const back = document.createElement('div'); back.className = 'modal-back show cardmodal'; back.id = 'modalBack';
      back.innerHTML = '<div class="cardmodal-box">' + cardDetailHTML(b) + '<button class="cardmodal-close" onclick="closeModal()">閉じる</button></div>';
      back.addEventListener('click', e => { if (e.target === back) closeModal(); });
      document.body.appendChild(back);
    }
    /* 長押し検出（タッチ）: カードを ~450ms 押し続けると詳細モーダルを表示。
       短タップは通常のクリック（選択/プレイ）に委ねる。長押し発火時は直後のクリックを1回だけ無視。 */
    let _lpTimer = null, _lpFired = false, _lpStart = null;
    function touchStart(e) {
      const t = e.touches && e.touches[0]; if (!t) return;
      const el = e.target.closest && e.target.closest('.card[data-no]'); if (!el) return;
      const no = el.getAttribute('data-no'); _lpFired = false; _lpStart = { x: t.clientX, y: t.clientY };
      if (_lpTimer) clearTimeout(_lpTimer);
      _lpTimer = setTimeout(() => { _lpFired = true; showCardModal(no); if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) { } }, 450);
    }
    function touchMove(e) {
      if (!_lpTimer || !_lpStart) return;
      const t = e.touches && e.touches[0]; if (!t) return;
      if (Math.abs(t.clientX - _lpStart.x) > 10 || Math.abs(t.clientY - _lpStart.y) > 10) { clearTimeout(_lpTimer); _lpTimer = null; } // スクロール/ドラッグは長押し扱いしない
    }
    function touchEnd() { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } }
    function swallowClickIfLongPress(e) { if (_lpFired) { _lpFired = false; e.stopPropagation(); e.preventDefault(); return true; } return false; }
    // トラッシュ全表示モーダル（タッチ・クリック両対応。ホバーfanのモバイル代替）
    function showTrashModal(side) {
      const P = G.players[side]; if (!P) return;
      const n = P.trash.length;
      const title = (side === 'me' ? 'あなた' : 'CPU') + 'のトラッシュ（' + n + '枚・新しい順）';
      if (n === 0) { openModal(title, '<div style="color:var(--muted);padding:8px 2px">トラッシュは空です</div>'); return; }
      const grid = P.trash.slice().reverse().map(c =>
        '<div class="tm-card" title="' + escapeHTML(c.base.name) + '"><img src="' + IMG(c.base.no) + '" referrerpolicy="no-referrer" decoding="async" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'noimg\')"><span class="tm-fb">' + escapeHTML(c.base.name) + '</span></div>').join('');
      openModal(title, '<div class="trash-modal-grid">' + grid + '</div>');
    }
    function init() {
      document.getElementById('rulesBtn').onclick = showRules;
      document.getElementById('menuBtn').onclick = menuBtnAction;
      document.getElementById('sideToggle').onclick = toggleSide;
      const sw = document.getElementById('aiSwitch'); sw.onclick = () => { G.aiOn = !G.aiOn; sw.classList.toggle('on', G.aiOn); };
      const sb = document.getElementById('soundBtn');
      if (sb) sb.onclick = () => { if (typeof SFX === 'undefined') return; SFX.unlock(); const m = SFX.toggle(); sb.textContent = m ? '🔇' : '🔊'; sb.classList.toggle('muted', m); if (!m) sfx('click'); };
      // 初回ユーザー操作でオーディオをアンロック（自動再生制約対策）
      const unlockSfx = () => { if (typeof SFX !== 'undefined') SFX.unlock(); document.removeEventListener('pointerdown', unlockSfx); document.removeEventListener('keydown', unlockSfx); };
      document.addEventListener('pointerdown', unlockSfx); document.addEventListener('keydown', unlockSfx);
      // ハンバーガー開閉は単一のクリックハンドラに集約（stopPropagationの噛み合わせ不良でモバイルで閉じない問題を解消）
      document.addEventListener('click', (e) => {
        const inBtn = e.target.closest && e.target.closest('#hamBtn');
        const inMenu = e.target.closest && e.target.closest('#hamMenu');
        if (inBtn) { toggleHam(); return; }              // ハンバーガーボタン＝開閉トグル
        const m = document.getElementById('hamMenu');
        if (m && m.style.display === 'block' && !inMenu) closeHam(); // メニュー外タップ＝閉じる
      });
      const screen = document.getElementById('screen');
      // 長押し発火直後のクリックを1回だけ握りつぶす（capture段でonBoardClickより先に判定）
      screen.addEventListener('click', e => { if (_lpFired) { _lpFired = false; e.stopPropagation(); e.preventDefault(); } }, true);
      screen.addEventListener('click', onBoardClick);
      screen.addEventListener('touchstart', touchStart, { passive: true });
      screen.addEventListener('touchmove', touchMove, { passive: true });
      screen.addEventListener('touchend', touchEnd);
      screen.addEventListener('touchcancel', touchEnd);
      document.addEventListener('mousemove', onHover);
      G._tab = 'hints';
      renderSelect();
    }
    window.addEventListener('DOMContentLoaded', init);
