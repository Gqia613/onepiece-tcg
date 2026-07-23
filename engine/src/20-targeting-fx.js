    "use strict";
    /* =========================================================================
       対象選択 (人間=UIハイライト / CPU=ヒューリスティック)
       ========================================================================= */
    async function chooseCard(side, cands, text, prefer, optional, cls) {
      cands = cands.filter(Boolean);
      if (cands.length === 0) return null;
      if (G.players[side].isCPU) return cpuPick(cands, prefer);
      if (cands.length === 1 && !optional) return cands[0];
      return await humanPick(cands, withFxSrc(text), optional, cls, side);
    }
    function cpuPick(cands, prefer) {
      // ★E49: コンボライン実行中の対象steering。G._linePick(ラインが宣言した優先noのリスト・先頭が最優先)は line実行中だけ
      //   設定され、自陣カードの選択(蘇生/回収/登場の対象)でのみ効く（相手対象の選択には影響しない）。未設定なら従来どおり。
      if (G._linePick && G._linePick.length && cands.length && cands.every(c => c.owner === G.active)) {
        for (const no of G._linePick) { const m = cands.find(c => c.base.no === no); if (m) return m; }
      }
      const byPow = (a, b) => power(b) - power(a) || (b.base.cost || 0) - (a.base.cost || 0);
      let arr = cands.slice();
      if (prefer === 'ownSmall') arr.sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0) || power(a) - power(b));
      else if (prefer === 'leader') { const L = arr.find(c => c.base.type === 'LEADER'); if (L) return L; arr.sort(byPow); }
      else arr.sort(byPow); // oppBig / ownBig 既定で強い順
      return arr[0];
    }
    function humanPick(cands, text, optional, cls, side) {
      cands = (cands || []).filter(Boolean);
      if (cands.length === 0) return Promise.resolve(null);
      return new Promise(res => {
        const uids = new Set(cands.map(c => c.uid));
        let done = false;
        const finish = (card) => { if (done) return; done = true; G.pendingChoice = null; render(); res(card); };
        G.pendingChoice = { uids, optional, res: finish, danger: cls === 'danger', side: side || G.active, cands }; // side=決定者の席／cands=ゾーン外一時カードのuid解決用（オンライン対戦）
        render();
        // 画像付き選択肢に統一（他のダイアログと見た目を揃える）。盤面クリックでも選べる。
        const opts = cands.map(c => ({ t: c.base.name, v: 'pick:' + c.uid, card: { no: c.base.no, sub: cardBtnSub(c) } }));
        if (optional) opts.push({ t: '選ばない（スキップ）', v: '__skip', ghost: true });
        showPrompt({
          side, cls: cls || '',
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
    // 画像付き選択肢のサブ表記（コスト/パワー）。名前は opt.t に出るのでここはステータスのみ
    function cardBtnSub(c) {
      const b = c.base; const isFighter = (b.type === 'CHAR' || b.type === 'LEADER');
      const parts = [];
      if (b.cost != null) parts.push('C' + b.cost);
      if (isFighter && b.power != null) parts.push('P' + power(c));
      return parts.join('/');
    }
    // 複数選択の進捗を文言に付す（「X/N枚目」）。total<=1なら素の文言
    function progText(base, i, total) { return total > 1 ? base + '（' + (i + 1) + '/' + total + '枚目）' : base; }
    /* 手札からの選択（捨てる/デッキ下など） */
    async function chooseFromHand(side, cands, text, prefer, optional, cls) {
      cands = cands.filter(Boolean); if (cands.length === 0) return null;
      if (G.players[side].isCPU) {
        // ★黒ヤマト: 蘇生先(8ヤマト/9モモ)を最優先で捨てる(トラッシュに送って踏み倒す)。他は従来どおり低カウンター/低コストから捨てる。
        // ★E39: DECK_PLANS の holds（コンボパーツ）は最後尾へ＝カウンター代わりに切らない（usePlan非活性なら常に0-0＝バイト等価）。
        const ya = (typeof isYamatoLeader === 'function') && isYamatoLeader(side);
        const pp = (typeof planDiscardProtect === 'function') ? (c => planDiscardProtect(side, c)) : (() => 0);
        const a = cands.slice().sort((x, y) =>
          (ya ? ((yamatoReviveTarget(y.base.no) ? 1 : 0) - (yamatoReviveTarget(x.base.no) ? 1 : 0)) : 0)
          || (pp(x) - pp(y))
          || (x.base.counter || 0) - (y.base.counter || 0) || (x.base.cost || 0) - (y.base.cost || 0));
        return a[0];
      }
      return await humanPick(cands, withFxSrc(text), !!optional, cls, side);
    }

    /* ---- 効果の「発生源」提示（UIの文脈付記。挙動は不変） ----
       runFx が解決中の効果の self（発生源カード）をスタックに積み、confirmUse／対象選択の
       文言に「リーダー効果『○○』／『○○』の効果」を中央化して自動付記する。
       AI探索(G._sim)中は積まない＝実ゲームの待機中プロンプトと干渉しない。 */
    let _fxSrcStack = [];
    function _fxSrc() { for (let i = _fxSrcStack.length - 1; i >= 0; i--) { if (_fxSrcStack[i]) return _fxSrcStack[i]; } return null; }
    function fxSrcLabel(src) {
      if (!src || !src.base || !src.base.name) return '';
      return src.base.type === 'LEADER' ? 'リーダー効果『' + src.base.name + '』' : '『' + src.base.name + '』の効果';
    }
    function fxSrcTag(explicit) {
      const lbl = fxSrcLabel(explicit || _fxSrc());
      return lbl ? '<span class="pp-src">' + lbl + '</span>' : '';
    }
    // 対象選択の文言に発生源を前置（発生源が取れない時は素の text のまま）
    function withFxSrc(text) { const tag = fxSrcTag(); return tag ? tag + (text || '対象を選んでください') : text; }

    /* 任意コスト/効果の発動確認: CPUは常に実行(true)、人間にはY/Nプロンプト。
       従来の「let go=true; if(!isCPU) go=(await showPrompt(...))==='y'」と等価。
       o(任意): { cls:'danger'=不可逆コストの強調, src:発生源カードの明示指定, noSrc:発生源表示の抑止 }
       ★表示の統一: 発生源が分かる確認は、タイトル=効果種別（リーダー効果/キャラ効果/イベント効果/ステージ効果）、
         説明=『誰』の効果か＋必要なアクション（元text）に統一する。呼び出し元の title
        （「手札を捨てる」等のコスト名）は発生源不明時のフォールバックとしてのみ使う。 */
    async function confirmUse(side, title, text, yes, no, o) {
      if (G.players[side].isCPU) return true;
      const src = (o && o.noSrc) ? null : ((o && o.src) || _fxSrc());
      let ttl = title, body = text || '';
      if (src && src.base && src.base.name) {
        ttl = src.base.type === 'LEADER' ? 'リーダー効果'
          : src.base.type === 'EVENT' ? 'イベント効果'
            : src.base.type === 'STAGE' ? 'ステージ効果' : 'キャラ効果';
        body = '<span class="pp-src">『' + src.base.name + '』の効果</span>' + body;
      }
      return (await showPrompt({
        side, local: !!(o && o.local), // local=UI専用の確認（オンライン対戦で相手へ中継しない）
        cls: (o && o.cls) || '',
        title: ttl, text: body,
        opts: [{ t: yes, v: 'y', primary: true }, { t: no || '使わない', v: 'n', ghost: true }]
      })) === 'y';
    }
    // duration文字列 → 内部buffタグ（パワー/コスト/キーワード付与の失効管理）。def=未指定時の既定タグ('turnEnd'|'turn'等)
    function durTag(d, def) {
      if (d === 'battle') return 'battle';
      if (d === 'untilNextStart') return 'ownerNextStart';
      if (d === 'untilNextEnd') return 'oppNextEnd';
      return def;
    }
    // duration文字列 → 失効シーケンス（negSeq/noAtkSeq/restImmuneUntil 用）。untilNextEnd=次の相手ターン終了(turnSeq+1)
    function durSeq(d) { return (d === 'untilNextEnd' || d === 'untilNextStart') ? G.turnSeq + 1 : G.turnSeq; }

    /* =========================================================================
       効果解決
       ========================================================================= */
    // ★誘発キュー（公式の割り込み規則）: 効果の解決中に誘発した自動効果は、その効果の解決が「完全に終わってから」発動する。
    //   例: 光月日和（ライフ→手札→手札をライフへ）の解決中に青黄ナミLの「ライフが離れた時」が誘発しても、日和の全処理後にドロー。
    //   fire系フックは G._fxDepth>0 なら G._pendingReacts に予約し、最外のrunFx完了時に drainReacts が順次解決（連鎖誘発も同様に後回し）。
    async function drainReacts() {
      if (G._drainingReacts) return;
      G._drainingReacts = true;
      try { while (G._pendingReacts && G._pendingReacts.length) { const j = G._pendingReacts.shift(); try { await j(); } catch (e) { console.warn('誘発解決失敗', e); } } }
      finally { G._drainingReacts = false; }
    }
    async function runFx(ops, ctx) {
      if (!ops) return;
      // 発生源スタック（実ゲームのみ）。sim中は積まない＝人間プロンプト待機中の実フレームを汚さない
      const track = !(G && G._sim);
      if (track) _fxSrcStack.push((ctx && ctx.self) || null);
      G._fxDepth = (G._fxDepth || 0) + 1;
      try {
        for (const op of ops) {
          try { const cont = await doOp(op, ctx); if (cont === false) break; }
          catch (e) { console.warn('op失敗', op, e); }
        }
      } finally { G._fxDepth = Math.max(0, (G._fxDepth || 0) - 1); if (track) _fxSrcStack.pop(); }
      if (!G._fxDepth) await drainReacts();
    }
    async function doOp(op, ctx) {
      const side = ctx.side, o = opp(side), P = G.players[side], self = ctx.self;
      if (op.cond && !checkCond(op.cond, side, self)) return; // 全opで op.cond を尊重（【ドン!!×N】等の条件付き効果）
      switch (op.op) {
        case 'draw': draw(side, op.n); flog(side, `${op.n}ドロー`); break;
        case 'oppDraw': { draw(o, op.n || 1); flog(side, `相手が${op.n || 1}ドロー`); break; } // 相手にN枚引かせる（OP07-090モルガンズ）
        case 'drawDiscardByCount': { const n = countFor(op, side, self); if (n > 0) { draw(side, n); flog(side, `${n}ドロー`); for (let i = 0; i < n && P.hand.length; i++) { const c = P.isCPU ? P.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0] : await chooseFromHand(side, P.hand.slice(), `捨てる手札（${i + 1}/${n}）`); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); } } render(); break; } // 数えた枚数だけ引いて同数捨てる（EB04-011ウロコ）
        case 'drawToSize': { const tgt = op.n || 3; let k = 0; while (P.hand.length < tgt) { if (!draw(side, 1)) break; k++; } if (k) flog(side, `手札が${tgt}枚になるよう${k}ドロー`); break; } // 手札N枚になるよう引く（OP02-051イワンコフ）
        case 'nextPlayCostReduce': { P._turnPlayCostReduce = { minCost: op.minCost || 0, amount: op.amount || 1, filter: op.filter || {}, turn: G.turnSeq }; flog(side, 'このターン、対象キャラのプレイコストが軽減される'); break; } // OP02-025錦えもんL（近似:ターン中の対象すべて）
        case 'oppHandToDeckDraw': { const O5 = G.players[o]; const hn = O5.hand.length; O5.deck.push(...O5.hand.splice(0)); shuffle(O5.deck); draw(o, op.n || hn); flog(side, `相手は手札を山に戻しシャッフル→${op.n || hn}ドロー`); render(); break; } // 相手の手札を山に戻しシャッフル→N枚引く（OP06-047プリン）
        case 'grantAllBattleImmune': { P._battleImmuneGrant = { until: durSeq(op.duration || 'turn'), filter: op.filter || {} }; flog(side, 'filter一致の自キャラはバトルでKOされない'); render(); break; } // 自分のfilter一致キャラ全てを一時バトルKO耐性（OP06-096）
        case 'setNoLifeToHand': { P._noLifeToHandTurn = G.turnSeq; flog(side, 'このターン、自分の効果でライフを手札に加えられない'); break; } // OP06-020ホーディL
        case 'setCantAttackLeader': { P._cantAttackLeaderTurn = G.turnSeq; flog(side, 'このターン、リーダーにアタックできない'); break; } // OP06-026コウシロウ
        case 'grantBattleImmune': { for (let i = 0; i < (op.count || 1); i++) { const cands = op.target === 'self' ? [self] : P.chars.filter(c => matchFilter(c, opFilter(op))); const t = op.target === 'self' ? self : (P.isCPU ? cands[0] : await chooseCard(side, cands, 'バトルKO耐性を与える対象', 'ownBig', op.optional)); if (!t) break; t._battleImmuneUntil = durSeq(op.duration || 'untilNextStart'); if (op.amount) addBuff(t, op.amount, durTag(op.duration === 'untilNextStart' ? 'untilNextStart' : 'turn', 'turn')); floatOn(t.uid, '無敵', 'buff'); if (op.target === 'self') break; } render(); break; } // 一時的にバトルでKOされない（OP06-030ドスン）
        case 'drawDiscarded': { const k = ctx.discarded || 1; if (draw(side, k)) flog(side, `【${(ctx.self && ctx.self.base.name) || '効果'}】捨てた${k}枚分ドロー`); break; } // 捨てた枚数分ドロー（OP12-040クザンL。ログに発生源名=見落とし対策）
        case 'counterRedirect': { // 対象変更の予約。カウンターイベント発は counterStep後・【相手のアタック時】発はブロック前に declareAttack が消費。incLeader=「キャラ」限定でない効果はリーダーも選べる（ST36-005=元々5000以上の「ユースタス・キッド」→黄キッドLも可）
          const pool = op.incLeader ? [P.leader, ...P.chars] : P.chars; const cands = pool.filter(c => matchFilter(c, opFilter(op)));
          let t;
          if (P.isCPU) {
            t = cands.slice().sort((a, b) => power(b) - power(a))[0]; // 既定: 最高パワー
            // ★E55 redirect: リダイレクト先の方針化（game3 ST36-005の使い分け: T11はリーダーへ流してトリガー2ドロー・T13は9000壁へ流して無償否定）
            if (typeof e55On === 'function' && e55On(side, 'redirect') && t) {
              const ap = ctx.attacker ? power(ctx.attacker) : null; // カウンターイベント発はctxにattackerが無い＝①はスキップし②③で判断
              const wall = ap != null ? cands.filter(c => c.base.type === 'CHAR' && !c.rested && power(c) > ap).sort((a, b) => power(b) - power(a))[0] : null;
              if (wall) t = wall; // ①攻撃側パワー超のアクティブキャラ＝完全否定（壁はレストせず無償で攻撃1回を消す）
              else if (P.life.length >= 3) { if (cands.includes(P.leader)) t = P.leader; } // ②高ライフはリーダーでライフ受け＋トリガー期待
              else if (P.life.length <= 1) {
                if (op.optional !== false) t = null; // ③低ライフの任意効果は発動辞退（どこへ流しても損）
                else { const ch = cands.filter(c => c.base.type === 'CHAR').sort((a, b) => power(a) - power(b)); if (ch.length) t = ch[0]; } // 強制(ST36-005=lifeCost支払い済み・optional:false)は辞退できない＝最小キャラで受けてリーダーの致死被弾だけは避ける
              }
            }
          } else t = await chooseCard(side, cands, 'アタックの対象にするカードを選択', 'ownBig', op.optional !== false);
          if (t) G._counterRedirect = t; break; }
        case 'oppLifeAddFromDeck': { const O = G.players[o]; for (let i = 0; i < (op.n || 1); i++) { if (O.deck.length) { const c = O.deck.shift(); c._faceUp = false; O.life.unshift(c); } } flog(o, 'デッキの上から1枚をライフに加えた'); render(); break; } // 相手が自分のデッキ上をライフへ（ST07-010/015の選択肢）
        case 'searchToLife': { // デッキ上N枚からfilter一致1枚をライフの上へ（faceUp可）、残りはデッキ下（ST13-002エース）
          const lookN = Math.min(op.look || 5, P.deck.length); if (!lookN) break;
          const seen = P.deck.splice(0, lookN);
          const cands = seen.filter(c => matchFilter(c, op.filter || {}));
          let pick = null;
          if (cands.length) pick = P.isCPU ? cands[0] : await chooseCard(side, cands, 'ライフの上に加えるカードを選択（任意）', 'ownBig', true);
          for (const c of seen) { if (c === pick) continue; P.deck.push(c); }
          if (pick) { pick._faceUp = !!op.faceUp; P.life.unshift(pick); flog(side, `「${pick.base.name}」をライフの上に${op.faceUp ? '表向きで' : ''}加えた`); }
          render(); break; }
        case 'koBattledTarget': { // バトルした相手キャラをKOしてもよい→そうした場合このキャラをKO（ST08-013ボン・クレー。onBattleEndVsCharフックから呼ぶ）
          const tg = ctx.target; if (!tg || tg.base.type !== 'CHAR' || isKoImmune(tg) || !G.players[tg.owner].chars.includes(tg)) break;
          let pay2 = P.isCPU ? (power(tg) >= power(self)) : await confirmUse(side, '相打ち', `バトルした「${tg.base.name}」をKOしますか？（そうした場合このキャラもKO）`, 'KOする');
          if (pay2 && !(await protectFromEffect(tg, 'ko', self))) { await koCard(tg, 'oppEffect'); await koCard(self, 'effect'); }
          break; }
        case 'activateStage': { const st9 = P.stage; if (st9 && st9.rested && matchFilter(st9, op.filter || {})) { st9.rested = false; flog(side, `ステージ「${st9.base.name}」をアクティブにした`); render(); } break; } // 自分のステージをアクティブに（P-077うるティ=紫ステージ）
        case 'handAllToBottomDraw': { // 手札すべてを好きな順番でデッキ下に置いてもよい→置いた枚数引く（P-046ヤマト。順番は現状の手札順で近似）
          if (!P.hand.length) break;
          if (!P.isCPU && !(await confirmUse(side, '手札を入れ替える', `手札${P.hand.length}枚すべてをデッキの下に置き、同じ枚数引きますか？`, '入れ替える'))) break;
          if (P.isCPU && P.hand.length > 3) break; // CPU: 手札が多いときは維持
          const hn = P.hand.length; P.deck.push(...P.hand.splice(0)); draw(side, hn); flog(side, `手札${hn}枚をデッキ下に置き${hn}枚引いた`); render(); break; }
        case 'discardLoopBuff': { // 手札(filter可)を任意の枚数捨て、1枚につき対象+amount（P-051シャンクス/ST16-002ゴードン）。CPUは最大cpuMax枚
          let dn = 0;
          const dlPool = () => P.hand.filter(c => matchFilter(c, op.filter || {}));
          while (dlPool().length) {
            let c;
            if (P.isCPU) { if (dn >= (op.cpuMax || 2)) break; c = dlPool().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0]; }
            else { c = await chooseFromHand(side, dlPool(), `捨てるカードを選択（1枚につき+${op.amount || 1000}・任意）`, null, true); if (!c) break; }
            P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); dn++;
            if (op.targetChoose === 'ownL') { const t = P.isCPU ? P.leader : await chooseCard(side, [P.leader, ...P.chars], `+${op.amount || 1000}する対象を選択`, 'ownBig', false); if (t) { addBuff(t, op.amount || 1000, durTag(op.duration, 'battle')); floatOn(t.uid, `+${op.amount || 1000}`, 'buff'); } }
          }
          if (dn) await fireHandDiscarded(side, dn, ctx.self); // ★「効果で手札が捨てられた時」誘発（発火漏れ修正 2026-07-18）
          if (dn && !op.targetChoose && self) { addBuff(self, (op.amount || 1000) * dn, durTag(op.duration, 'battle')); floatOn(self.uid, `+${(op.amount || 1000) * dn}`, 'buff'); flog(side, `手札${dn}枚を捨てて+${(op.amount || 1000) * dn}`); }
          render(); break; }
        case 'bounceOwnAnyBuff': { // 自分のキャラを任意の枚数手札に戻し、1枚につき対象+amount（P-059世界のつづき）。CPUは戻さない
          let bn = 0;
          if (!P.isCPU) { while (P.chars.length) { const c = await chooseCard(side, P.chars, `手札に戻すキャラ（1枚につき+${op.amount || 2000}・任意）`, 'ownBig', true); if (!c) break; bounceCard(c); await checkAllyLeave(c.owner, c, 'ownEffect'); bn++; } }
          if (bn) { const cands = [P.leader, ...P.chars]; const t = await chooseCard(side, cands, `+${(op.amount || 2000) * bn}する対象を選択`, 'ownBig', true); if (t) { addBuff(t, (op.amount || 2000) * bn, durTag(op.duration, 'battle')); floatOn(t.uid, `+${(op.amount || 2000) * bn}`, 'buff'); } }
          render(); break; }
        case 'setNoDonActivateChar': { P._noDonActivateTurn = G.turnSeq; flog(side, 'このターン中、キャラの効果でドンをアクティブにできない'); break; } // EB04-016トリ
        case 'grantBattleKoSubstitute': { P._battleKoSubSeq = G.turnSeq; flog(side, 'このターン中、自分のキャラはバトルKOの代わりに手札1枚を捨てられる'); break; } // EB02-030
        case 'condTargetChar': { const tg = ctx.target; if (tg && tg.base.type === 'CHAR' && (!op.attr || (tg.base.attribute || '').includes(op.attr))) await runFx(op.then, ctx); else ctx._declined = true; break; } // アタック対象がキャラ（ST02-010/ST05-010。ブロッカー介入後の変化は見ない近似）
        case 'condAttacker': { if (ctx.attacker && (ctx.attacker.base.attribute || '').includes(op.attr)) await runFx(op.then, ctx); else ctx._declined = true; break; } // アタッカーが属性Xを持つ場合（OP11-088シュウ）。不一致=未発動
        case 'peekOppDeck': { const D = G.players[o].deck; if (!D.length) { flog(side, '相手のデッキが0枚で見られない'); break; } const c = D[0]; flog(side, `相手のデッキの上を確認: 「${c.base.name}」`); if (!P.isCPU) await showPrompt({ side, title: '相手のデッキの上', text: '相手のデッキの一番上のカードです。確認したら「完了」を押してください。', reveal: { no: c.no, name: c.base.name }, opts: [{ t: '完了', v: 'ok', primary: true }] }); render(); break; } // 相手デッキトップを見る（OP11-062/070カタクリ等）。人間は完了ボタンを押すまでカードを大写しで表示
        // デッキの上1枚を公開し、filter一致なら登場させてもよい（OP12-058）。grantKwで登場時にキーワード付与。
        case 'revealTopPlay': {
          if (!P.deck.length) break; const top = P.deck[0]; flog(side, `デッキの上を公開: ${top.base.name}`);
          if (matchFilter(top, op.filter || {}) && (P.isCPU || await confirmUse(side, '登場', `「${top.base.name}」を登場させますか？`, '登場させる', 'しない'))) {
            P.deck.shift(); await summon(side, top, false); if (op.grantKw && P.chars.includes(top)) top.kwGrant.push({ kw: op.grantKw, dur: durTag(op.grantDuration, 'turn') });
          }
          break;
        }
        case 'search': {
          const look = P.deck.splice(0, op.look);          // 上N枚を抜き取る
          flog(side, `デッキ上${op.look}枚を確認: ${look.map(c => c.base.name).join('、')}`);
          const picked = []; const cnt = op.count || 1; // count枚まで手札に加える
          for (let n = 0; n < cnt; n++) {
            const cands = look.filter(c => !picked.includes(c) && matchFilter(c, op.filter) && (!op.exclude || normName(c.base.name) !== normName(op.exclude)));
            if (!cands.length) break;
            let pick = null;
            if (G.players[side].isCPU) {
              // ★E39: DECK_PLANS（usePlan時のみプランの欲しい札を優先。非活性なら従来のbyPow＝バイト等価）
              pick = (typeof planPickSearch === 'function') ? planPickSearch(side, cands, () => cpuPick(cands, 'ownBig')) : cpuPick(cands, 'ownBig');
              if (G._searchDiag) try { G._searchDiag(side, cands, pick, op); } catch (e) { }   // ★E38: 診断フック（未設定なら挙動不変。tools/plan-diagnose.js用）
            }
            else {
              pick = await new Promise(res => {
                const opts = look.filter(c => !picked.includes(c)).map(c => cands.includes(c)
                  ? { t: c.base.name, v: 'pick:' + c.uid, card: { no: c.base.no } }
                  : { t: c.base.name + '（対象外）', v: '__x' + c.uid, ghost: true, disabled: true, card: { no: c.base.no } });
                opts.push({ t: '加えない', v: '__skip', ghost: true });
                showPrompt({
                  side, title: 'デッキトップを確認', text: `上${op.look}枚を見て、手札に加えるカードを選択（${n + 1}/${cnt}）`, opts,
                  onPick: v => { if (typeof v === 'string' && v.indexOf('pick:') === 0) { const u = +v.slice(5); res(cands.find(x => x.uid === u) || null); } else res(null); }
                });
              });
            }
            if (!pick) break;
            if (!G._sim) pick._pubHand = G.turnSeq;   // ★E43: サーチは公開で手札に加わる＝相手AIの決定化が既知情報として使える（bpuct用・実対局のみ）
            picked.push(pick); P.hand.push(pick); flog(side, `「${pick.base.name}」を手札に`);
            cardReveal(side, pick.base.no, pick.base.name, '手札に加えた', 'hand'); // 公開して手札に加える＝何を取ったか見せる
          }
          // 取らなかったカードはデッキ下（rest:'trash'ならトラッシュ）へ
          for (const c of look) if (!picked.includes(c)) { if (op.rest === 'trash') P.trash.push(reset(c)); else P.deck.push(c); }
          if (op.rest === 'trash') flog(side, '残りをトラッシュに置いた');
          break;
        }
        case 'ko': {
          // KO効果は「相手の効果ではKOされない」(isKoImmune)を候補から除外（無駄打ち/同一カード再選択ループ防止。protectFromEffectでも二重に防ぐ）
          if (op.all && op.side === 'any') { for (const sd of [o, side]) { const PP = G.players[sd]; for (const t of PP.chars.slice()) { if (!matchFilter(t, opFilter(op))) continue; if (sd === o && (isKoImmune(t) || await protectFromEffect(t, 'ko', self))) continue; await koCard(t, sd === side ? 'effect' : 'oppEffect'); } } render(); break; } // 両者対象の全体KO
          if (op.all) { for (const t of oppChars(side, opFilter(op)).filter(c => !isKoImmune(c))) { if (!(await protectFromEffect(t, 'ko', self))) await koCard(t, 'oppEffect'); } break; } // 条件一致の相手キャラを全てKO
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op)).filter(c => !isKoImmune(c));
            const t = await chooseCard(side, cands, progText('KOする相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; if (await protectFromEffect(t, 'ko', self)) continue; await koCard(t, 'oppEffect');
          }
          break;
        }
        // 「相手のキャラを（1枚まで/count枚）トラッシュに置く」。KOではない＝「相手の効果でKOされない」を貫通し【KO時】は誘発しない（公式: トラッシュに置くはKOと別。KOされない耐性を無視）。
        // 「相手の効果で場を離れない」/身代わりは尊重し、場を離れた時の誘発は起こる（deckBottomと同じ非KO除去で行き先がトラッシュ）。OP09-009ベックマン/OP06-092ブルック/OP07-091ルフィ/OP08-079カイドウ/ST19-003たしぎ。
        case 'trashChar': {
          const doTrash = async (t) => {
            if (await protectFromEffect(t, 'trash', self)) return false;
            removeCharTo(t, G.players[t.owner].trash); flog(side, `「${t.base.name}」をトラッシュに置いた`);
            await checkAllyLeave(t.owner, t, t.owner === side ? 'ownEffect' : 'oppEffect'); return true;
          };
          if (op.all) { for (const t of oppChars(side, opFilter(op)).slice()) await doTrash(t); render(); break; } // 条件一致の相手キャラすべてをトラッシュ
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op)); // 「KOされない」キャラも対象に含める（貫通）
            const t = await chooseCard(side, cands, progText('トラッシュに置く相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; await doTrash(t);
          }
          render(); break;
        }
        // 相手キャラを最大count枚、現在パワーの合計がmaxTotal以下になるようKO（OP09-018失せろ）
        case 'koByTotalPower': {
          const limit = op.maxTotal || 0; const max = op.count || 2; let budget = limit;
          for (let i = 0; i < max; i++) {
            const cands = oppChars(side, opFilter(op)).filter(c => !isKoImmune(c) && power(c) <= budget);
            if (!cands.length) break;
            const t = P.isCPU ? cands.slice().sort((a, b) => power(a) - power(b))[0] : await chooseCard(side, cands, `合計パワー${limit}以下になるようにKO（残り${budget}）`, 'oppBig', true);
            if (!t) break; if (await protectFromEffect(t, 'ko', self)) continue;
            budget -= power(t); await koCard(t, 'oppEffect');
          }
          break;
        }
        case 'koZero': {
          const dead = G.players[o].chars.filter(c => power(c) <= 0 && !isImmune(c) && !isKoImmune(c));
          for (const c of dead.slice()) { if (!G.players[o].chars.includes(c)) continue; if (await protectFromEffect(c, 'ko', self)) continue; await koCard(c, 'oppEffect'); }
          break;
        }
        case 'bounce': {
          if (op.all && (op.side === 'own' || op.side === 'self')) { for (const t of P.chars.slice()) { if (!matchFilter(t, opFilter(op))) continue; bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'ownEffect'); } render(); break; } // 自分のfilter一致キャラすべて（ST26-001）
          if (op.all) { for (const t of oppChars(side, opFilter(op)).slice()) { if (!(await protectFromEffect(t, 'bounce'))) { bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'oppEffect'); } } break; }
          for (let i = 0; i < (op.count || 1); i++) {
            // side:'any' なら自分/相手両方のキャラが対象（「（持ち主の）手札に戻す」OP14-058/049）。それ以外は相手キャラのみ。
            const cands = op.side === 'any' ? [...P.chars.filter(c => matchFilter(c, opFilter(op))), ...oppChars(side, opFilter(op))] : op.side === 'own' ? P.chars.filter(c => matchFilter(c, opFilter(op))) : oppChars(side, opFilter(op)); // side:'own'=自分のキャラのみ（OP07-094）
            let t;
            if (op.oppChooses) { const OP2 = G.players[o]; t = OP2.isCPU ? cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0] : await chooseCard(o, cands, '手札に戻す自分のキャラを選択', 'ownBig', false); } // 「相手は自身のキャラを戻す」=選択権は相手（EB01-028）
            else t = await chooseCard(side, cands, progText('手札に戻すキャラを選択', i, op.count || 1), op.side === 'own' ? 'ownBig' : 'oppBig', op.optional);
            if (!t) break; if (await protectFromEffect(t, 'bounce')) continue; bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, t.owner === side ? 'ownEffect' : 'oppEffect'); if (t.owner !== side) fireSimpleReact(side, 'onOppBounce'); // 相手キャラを自分の効果で戻した時（EB02-023クロコダイル）
            // バウンスした場合、その持ち主(相手)が手札からコストN以下のキャラを登場できる（OP13-119エース「そうした場合、相手は…登場」）
            if (op.oppPlayAfter != null) { const O = G.players[t.owner]; const cc = O.hand.filter(c => c.base.type === 'CHAR' && (c.base.cost || 0) <= op.oppPlayAfter); if (cc.length && O.chars.length < 5) { const pc = O.isCPU ? cc.slice().sort((a, b) => (b.base.power || 0) - (a.base.power || 0))[0] : await chooseFromHand(t.owner, cc, '登場させるキャラを選択（任意）', null, true); if (pc) { O.hand.splice(O.hand.indexOf(pc), 1); await summon(t.owner, pc, false); } } }
          }
          break;
        }
        case 'deckBottom': {
          if (op.condLeader && !checkCond(op.condLeader, side, self)) break;
          if (op.all) { for (const sd of [o, side]) { const PP = G.players[sd]; for (const t of PP.chars.slice()) { if (!matchFilter(t, opFilter(op))) continue; if (sd === o && (isImmune(t) || await protectFromEffect(t, 'deckBottom'))) continue; removeCharTo(t, G.players[t.owner].deck); flog(side, `「${t.base.name}」をデッキ下へ`); await checkAllyLeave(t.owner, t, t.owner === side ? 'ownEffect' : 'oppEffect'); } } render(); break; } // 「コストN以下のキャラすべて」＝両者の場が対象（OP05-058）
          // side省略=相手 / 'own'=自分 / 'any'=両者（公式textの無指定「キャラ」は両者対象）。count枚まで順に選択。
          const dbPool = () => op.side === 'any' ? [...oppChars(side, opFilter(op)), ...P.chars.filter(c => matchFilter(c, opFilter(op)))]
            : (op.side === 'own' || op.side === 'self') ? P.chars.filter(c => matchFilter(c, opFilter(op)))
              : oppChars(side, opFilter(op));
          const dbSent = [];
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = dbPool().filter(c => !dbSent.includes(c));
            const t = await chooseCard(side, cands, progText('デッキ下に送るキャラを選択', i, op.count || 1), op.side === 'own' ? 'ownBig' : 'oppBig', op.optional);
            if (!t) break;
            dbSent.push(t);
            if (t.owner !== side && (await protectFromEffect(t, 'deckBottom'))) continue;
            removeCharTo(t, G.players[t.owner].deck); flog(side, `「${t.base.name}」をデッキ下へ`); await checkAllyLeave(t.owner, t, t.owner === side ? 'ownEffect' : 'oppEffect');
          }
          render(); break;
        }
        case 'restChar': {
          // PRB02-006ゾロ: 相手のターン中、相手の効果でレストになる場合、代わりに他の自キャラ1枚をレストにできる（置換）
          const maybeRestRedirect = async (t) => {
            const vSide = t.owner; const V = G.players[vSide];
            if (vSide === side || G.active !== side) return t; // 「相手(=効果使用側)のターン中」のみ
            if (!(t.base.fx && t.base.fx.static && t.base.fx.static.some(x => x.op === 'restRedirect')) || isNegated(t)) return t;
            const others = V.chars.filter(c => c !== t && !c.rested && !isRestImmune(c));
            if (!others.length) return t;
            let sub = null;
            if (V.isCPU) sub = others.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0))[0];
            else sub = await chooseCard(vSide, others, `「${t.base.name}」の代わりにレストにするキャラ（任意）`, 'ownBig', true);
            if (sub) flog(vSide, `「${t.base.name}」の代わりに「${sub.base.name}」をレスト`);
            return sub || t;
          };
          if (op.leaderOnly) { const L2 = G.players[o].leader; if (!L2.rested) { L2.rested = true; flog(side, '相手リーダーをレストにした'); } render(); break; } // 「相手のリーダーをレストにする」（OP16-039五老星）
          const restPool = () => { let arr = oppChars(side, opFilter(op)).filter(c => !c.rested && !isRestImmune(c) && !isOppRestImmune(c)); if (op.includeLeader && !G.players[o].leader.rested) arr = [G.players[o].leader, ...arr]; if (op.includeStage && G.players[o].stage && !G.players[o].stage.rested) arr = [...arr, G.players[o].stage]; return arr; };
          if (op.all) { const rs = restPool(); for (let t of rs) { t = await maybeRestRedirect(t); t.rested = true; await fireSelfRested(t, t.owner === side ? 'ownEffect' : 'oppEffect'); flog(side, `「${t.base.name === undefined ? '相手リーダー' : t.base.name}」をレスト`); } if (rs.length) await fireOwnRest(side); break; } // 条件一致を全てレスト
          for (let i = 0; i < (op.count || 1); i++) {
            // orDon: 「相手の、キャラかドン‼合計N枚までを、レストにする」（OP12-037）＝各1枚ごとにキャラ/ドンを選べる
            if (op.orDon) {
              const cands0 = restPool(); const donOk = G.players[o].don.active > 0;
              if (!cands0.length && !donOk) break;
              let kind;
              if (P.isCPU) kind = cands0.length ? 'char' : 'don'; // CPUはキャラ優先（盤面テンポ）→無ければドン
              else { const opts = []; if (cands0.length) opts.push({ t: '相手のキャラをレスト', v: 'char', primary: true }); if (donOk) opts.push({ t: '相手のアクティブのドン1枚をレスト', v: 'don' }); opts.push({ t: 'やめる', v: 'no', ghost: true });
                const v = await showPrompt({ side, title: 'レスト対象', text: progText('キャラかドン‼を選んでレストにします', i, op.count || 1), opts }); if (v === 'no' || v == null) break; kind = v; }
              if (kind === 'don') { G.players[o].don.active--; G.players[o].don.rested++; flog(side, '相手のドン1枚をレストにした'); render(); continue; }
            }
            const cands = restPool();
            let t = await chooseCard(side, cands, progText('レストにする相手キャラを選択', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break; t = await maybeRestRedirect(t); t.rested = true; await fireSelfRested(t, t.owner === side ? 'ownEffect' : 'oppEffect'); flog(side, `「${t.base.name}」をレスト`); await fireOwnRest(side);
            if (t.base.fx && t.base.fx.onOppRested && !isNegated(t) && t.owner !== side && self && self.base && self.base.type === 'CHAR') { await runFx(t.base.fx.onOppRested, { self: t, side: t.owner }); } // 「相手のキャラの効果でレストになった時」(OP14-070バッファロー。効果源=ctx.self がキャラの時のみ)
          }
          break;
        }
        // 自分の場のドン‼1枚をドンデッキに戻してもよい→そうしたらこのキャラをアクティブ（OP14-070バッファロー）
        case 'donMinusActivateSelf': {
          if (donTotal(side) < 1) break;
          if (!(await confirmUse(side, 'ドン‼-1', 'ドン‼1枚をドンデッキに戻してこのキャラをアクティブにしますか？', '戻す（アクティブ化）', 'しない'))) break;
          const okk = await returnDonChoose(side, 1, false);
          if (okk) { await fireDonReturned(side); if (self) { self.rested = false; floatOn(self.uid, 'アクティブ', 'buff'); flog(side, `「${self.base.name}」をアクティブにした`); render(); } } // ドン返却で onDonReturned(トレーボル等)も誘発
          break;
        }
        case 'lock': {
          const lockPool = () => { let arr = oppChars(side, opFilter(op)).filter(c => (op.restedOnly ? c.rested : true) && !isRestImmune(c) && !isOppRestImmune(c) && !c.frozen); if (op.includeLeader && G.players[o].leader.rested && !G.players[o].leader.frozen) arr = [G.players[o].leader, ...arr]; if (op.includeStage && G.players[o].stage && G.players[o].stage.rested && !G.players[o].stage.frozen) arr = [...arr, G.players[o].stage]; return arr; };
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = lockPool();
            const t = P.isCPU ? cands[0] : await chooseCard(side, cands, progText('次のリフレッシュでアクティブにしない相手のカード', i, op.count || 1), 'oppBig', op.optional);
            if (!t) break;
            t.rested = true; await fireSelfRested(t, t.owner === side ? 'ownEffect' : 'oppEffect'); t.frozen = true; flog(side, `「${t.base.type === 'LEADER' ? '相手リーダー' : t.base.name}」を次のリフレッシュでアクティブにしない`); floatOn(t.uid, '凍結', 'dmg'); animClass(t.uid, 'hit');
            if (op.restSource && self && i === 0 && !isRestImmune(self)) { self.rested = true; await fireSelfRested(self, 'ownEffect'); flog(side, `「${self.base.name}」をレストにした`); }
          }
          break;
        }
        case 'negateEffect': {
          const o2 = opp(side);
          const oppL = G.players[o2].leader;
          oppL.negSeq = G.turnSeq; flog(side, '相手リーダーの効果を無効化(このターン中)'); floatOn(oppL.uid, '無効', 'dmg');
          if (op.all) { for (const t of oppChars(side, {})) { t.negSeq = G.turnSeq; floatOn(t.uid, '無効', 'dmg'); } flog(side, '相手のキャラすべての効果を無効化(このターン中)'); render(); break; } // 相手のリーダーとキャラすべて（P-100ティーチ）
          const cands = oppChars(side, {});
          const t = await chooseCard(side, cands, '効果無効＆アタック不可にする相手キャラ1枚', 'oppBig', true);
          if (t) { t.negSeq = G.turnSeq + 1; t.noAtkSeq = G.turnSeq + 1; flog(side, `「${t.base.name}」を効果無効＆アタック不可(次の相手ターン終了まで)`); floatOn(t.uid, '無効', 'dmg'); }
          render();
          break;
        }
        case 'negateChoose': {
          const o2 = opp(side); const D = G.players[o2];
          const pool = op.leaderOnly ? [D.leader] : (op.charsOnly || op.filter || op.maxCost != null ? D.chars : [D.leader, ...D.chars]); // leaderOnly=リーダーのみ（OP10-098「リーダーとキャラ1枚ずつ」の前半）／フィルタ/maxCost/charsOnly指定時はキャラのみ
          const cands = pool.filter(c => matchFilter(c, opFilter(op)));
          const t = await chooseCard(side, cands, '効果を無効にする相手のキャラ1枚', 'oppBig', op.optional !== false);
          if (t) {
            t.negSeq = durSeq(op.duration); flog(side, `「${t.base.type === 'LEADER' ? '相手リーダー' : t.base.name}」を効果無効`); floatOn(t.uid, '無効', 'dmg');
            if (op.amount) { addBuff(t, op.amount, op.battle ? 'battle' : durTag(op.duration, 'turn')); floatOn(t.uid, `${op.amount}`, 'dmg'); } // 無効＋パワー減（OP09-097闇水）
            if (op.koIfMaxCost != null && t.base.type !== 'LEADER' && (t.base.cost || 0) <= op.koIfMaxCost) { if (!(await protectFromEffect(t, 'ko', self))) await koCard(t, 'oppEffect'); } // 無効＋コスト条件KO（OP09-098闇穴道）
            if (op.koIfMaxEffPower != null && t.base.type !== 'LEADER' && power(t) <= op.koIfMaxEffPower) { if (!(await protectFromEffect(t, 'ko', self))) await koCard(t, 'oppEffect'); } // 無効＋パワー条件KO（OP06-074ゼファー）
          }
          render();
          break;
        }
        case 'powerMod': {
          const dur = op.battle ? 'battle' : durTag(op.duration, 'turnEnd');
          if (op.samePrev) { // 「そのカードを、…パワー+N」＝直前のpowerModが選んだ同一対象へ再付与（OP06-038。再選択させると別カードを選べてしまう）
            for (const t of (ctx._pmPicked || [])) { if (op.amount) { addBuff(t, op.amount, dur); floatOn(t.uid, `${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount > 0 ? 'buff' : 'dmg'); } }
            render(); break;
          }
          if (op.target === 'self') { // 「このキャラは…パワー+N」= ctx.self自身に付与（選択なし）
            if (self) { const amt = op.perAttachedDon ? (op.amount * (self.attachedDon || 0)) : op.amount; if (amt) { addBuff(self, amt, dur); floatOn(self.uid, `${amt > 0 ? '+' : ''}${amt}`, amt > 0 ? 'buff' : 'dmg'); } }
            break;
          }
          const targetSide = op.side === 'self' ? side : o;
          if (op.all) { // 条件一致の対象（自分側 or 相手側）全てにパワー±
            let cands = op.side === 'self' ? (op.leader ? [P.leader, ...P.chars] : P.chars).filter(c => matchFilter(c, opFilter(op))) : (op.includeLeader ? [G.players[o].leader, ...oppChars(side, opFilter(op))] : oppChars(side, opFilter(op))); // includeLeader: 「相手のリーダーとキャラすべて」型(OP12-018覇王色)でリーダーも対象
            for (const t of cands.filter(Boolean)) { const amt = op.perAttachedDon ? (op.amount * (t.attachedDon || 0)) : op.amount; if (amt) { addBuff(t, amt, dur); floatOn(t.uid, `${amt > 0 ? '+' : ''}${amt}`, amt > 0 ? 'buff' : 'dmg'); } } // perAttachedDon: 付与ドン1枚につき amount
            render(); break;
          }
          const pmPicked = []; ctx._pmPicked = pmPicked; // samePrev用に同一ctx内へ記録（参照共有＝ループ中の追加も見える）
          for (let i = 0; i < (op.count || 1); i++) {
            let cands;
            if (op.leader && op.side === 'self') cands = [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op)));
            else if (op.side === 'self') { cands = P.chars.filter(c => matchFilter(c, opFilter(op))); if (!cands.length && !op.filter && !op.name && !op.nameIncludes) cands = [P.leader]; }
            else cands = op.includeLeader ? [G.players[o].leader, ...oppChars(side, opFilter(op))] : oppChars(side, opFilter(op)); // 相手のリーダーも対象に
            cands = cands.filter(Boolean).filter(c => !pmPicked.includes(c)); // 同一カードを2回選ばない（「N枚まで」＝別々のカード）
            if (op.excludeSelf && self) cands = cands.filter(c => c !== self); // 「このキャラ以外の」（ST01-005ジンベエ）
            const t = await chooseCard(targetSide === side ? side : side, cands,
              `${op.amount > 0 ? '+' : ''}${op.amount}する対象を選択`, op.side === 'self' ? 'ownBig' : 'oppBig', op.optional);
            if (!t) break; pmPicked.push(t); addBuff(t, op.amount, dur);
            if (op.koImmuneIfChar && t.base.type === "CHAR") { t._koImmuneSeq = G.turnSeq; flog(side, `「${t.base.name}」はこのターン中KOされない`); } // ST05-017鎧合体
            floatOn(t.uid, `${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount > 0 ? 'buff' : 'dmg');
          }
          if (pmPicked.length) ctx._committed = true; else if (op.optional) ctx._declined = true; // 対象を選べば使用/任意で0体なら未発動（onceゲート）
          break;
        }
        case 'powerCopy': {
          // ★fromAttacker: アタック中のカード（リーダー含む）のパワーをコピー（OP04-069。onOppAttackのoctxがctx.attackerを供給）
          const t = op.fromAttacker
            ? ctx.attacker
            : await (async () => { const cands = oppChars(side, {}); return cands.length ? chooseCard(side, cands, 'パワーをコピーする相手キャラ1枚', null, true) : null; })();
          if (t && self) {
            // 「元々のパワーを選んだキャラと同じにする」= base を setBase で“置換”（加算でない）。
            // ★複数回発動（再アタック/先読みの模擬発動）でも累積して膨らまないよう、自前(_pc)の setBase は入れ替える。
            const newP = power(t);
            const before = power(self);
            self.buffs = self.buffs.filter(b => !(b.setBase != null && b._pc));
            self.buffs.push({ setBase: newP, until: 'turnEnd', _pc: true });
            const d = power(self) - before;
            floatOn(self.uid, `${d >= 0 ? '+' : ''}${d}`, d >= 0 ? 'buff' : 'dmg'); flog(side, `元々のパワーを${newP}に変化`);
          }
          break;
        }
        case 'leaderBuff': { const L = (op.side === 'opp' ? G.players[o] : P).leader; addBuff(L, op.amount, durTag(op.duration, 'turnEnd')); floatOn(L.uid, `${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount > 0 ? 'buff' : 'dmg'); break; } // side:'opp'=相手リーダーへ無条件に±（「相手のリーダーと…」型=OP07-075ノロノロビーム）
        case 'leaderBuffPerChar': { const n = P.chars.filter(c => matchFilter(c, op.filter || {})).length; const amt = (op.amount || 1000) * n; if (amt) { addBuff(P.leader, amt, durTag(op.duration, 'turnEnd')); floatOn(P.leader.uid, `+${amt}`, 'buff'); flog(side, `リーダーをキャラ${n}枚分パワー+${amt}`); } break; } // 自分のキャラ1枚につきリーダー+amount（P-024海賊王に）
        case 'leaderDoubleAttack': P.leader.kwGrant.push({ kw: 'doubleAttack', dur: 'turn' }); if (op.amount) addBuff(P.leader, op.amount, 'turnEnd'); flog(side, 'リーダーに【ダブルアタック】'); break;
        case 'counterBuff': if (ctx.target) { if (op.filter && !matchFilter(ctx.target, op.filter)) break; addBuff(ctx.target, op.amount, op.duration || 'battle'); floatOn(ctx.target.uid, `+${op.amount}`, 'buff'); } break; // filter=対象の特徴限定（OP14-117=スリラーバーク限定。対象が不一致ならバフしない）
        case 'donMinus': { if (op.optional && !(await confirmUse(side, 'ドン‼-' + op.n, 'ドン‼' + op.n + '枚をドンデッキに戻して効果を発動しますか？', '発動する', '発動しない'))) { ctx._declined = true; return false; } const ok = await returnDonChoose(side, op.n, op.fromActive); if (!ok) { ctx._declined = true; return false; } ctx._committed = true; await fireDonReturned(side, op.n); if (op.then) await runFx(op.then, ctx); break; } // ★optional:true＝「ドン‼-N：効果」の任意発動を人間へ確認(発動しない選択肢=公式の任意コスト。辞退時は_declinedで【ターン1回】未消費)。★op.thenは支払い成功時に必ず実行（runFxに汎用then実行は無い。「ドン‼-N:効果」型19枚が支払いのみで不発だった）
        case 'donAttach': {
          let targets = [];
          if (op.target === 'leader') targets = [P.leader];
          else if (op.target === 'self') targets = [self];
          else if (op.target === 'leaderAndChar') { targets = [P.leader]; const c = await chooseCard(side, P.chars, 'レストのドンを付与するキャラ', 'ownBig', true); if (c) targets.push(c); }
          else if (op.target === 'chooseOwn') { let daPool = [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op))); if (op.excludePrev && ctx._donAttachPicked) daPool = daPool.filter(c => !ctx._donAttachPicked.includes(c)); const c = await chooseCard(side, daPool, 'レストのドンを付与する対象', 'ownBig', true); if (c) { (ctx._donAttachPicked = ctx._donAttachPicked || []).push(c); } if (c) targets = [c]; }
          else if (op.target === 'chooseAnyL') { // 無指定「リーダーかキャラ1枚に持ち主のドン付与」＝両者から選べる（Q&A1210/1213/1220。相手に付与＝相手のコストエリアを削る妨害プレイ）
            const O9 = G.players[o];
            const daPool = [P.leader, ...P.chars, O9.leader, ...O9.chars].filter(c => c && matchFilter(c, opFilter(op)));
            const c = await chooseCard(side, daPool, 'ドンを付与する対象（自分か相手のリーダー/キャラ）', 'ownBig', true);
            if (c) targets = [c];
          }
          // 公式: 効果による「レストのドン!!を付与」はレスト状態のドンを付ける。fromAny=「コストエリアのドン」＝アクティブ/レスト両方から付与
          // ★付与元は「持ち主の」ドン＝対象カードのオーナーのコストエリア（chooseAnyLで相手を選んだら相手のドンから。Q&A1211/1221: どのドンを使うかも効果の使用者が処理）
          for (const t of targets) {
            const OWNP = G.players[t.owner] || P;
            const avail = op.fromActive ? OWNP.don.active : op.fromAny ? (OWNP.don.rested + OWNP.don.active) : OWNP.don.rested;
            const k = Math.min(op.n, avail); t.attachedDon += k;
            for (let r = k; r > 0;) { if (op.fromActive) { if (OWNP.don.active > 0) { OWNP.don.active--; r--; } else break; } else if (OWNP.don.rested > 0) { OWNP.don.rested--; r--; } else if (op.fromAny && OWNP.don.active > 0) { OWNP.don.active--; r--; } else break; }
            if (k) { floatOn(t.uid, `ドン+${k}`, 'buff'); donFly(t.owner, t.uid); }
          }
          if (targets.some(t => t)) await fireDonAttached(side); // ドン付与誘発（OP02-002ガープL）
          break;
        }
        // 自分の付与ドンを合計Nまで、自分のキャラ1枚に移し替える（OP07-001ドラゴンL）
        case 'moveAttachedDon': {
          const max = op.n || 2; const sources = [P.leader, ...P.chars].filter(c => (c.attachedDon || 0) > 0);
          if (!sources.reduce((s, c) => s + (c.attachedDon || 0), 0)) break;
          const mdCands = op.filter ? P.chars.filter(c => matchFilter(c, op.filter)) : P.chars; // 移動先の限定（EB02-009=麦わらの一味）
          const target = P.isCPU ? mdCands.slice().sort((a, b) => power(b) - power(a))[0] : await chooseCard(side, mdCands, '付与ドンを移すキャラ', 'ownBig', true);
          if (!target) break; let moved = 0;
          for (const c of sources) { if (c === target) continue; while ((c.attachedDon || 0) > 0 && moved < max) { c.attachedDon--; target.attachedDon = (target.attachedDon || 0) + 1; moved++; } if (moved >= max) break; }
          if (moved) { floatOn(target.uid, `ドン+${moved}`, 'buff'); flog(side, `付与ドン${moved}枚を「${target.base.name}」へ移した`); } render(); break;
        }
        // 自分の付与ドン合計N枚をコストエリアにレストで戻すコスト（ST28-004モモの助）。任意。払えた時 then を実行
        case 'attachedDonToCost': {
          const need = op.n || 2; const srcs = [P.leader, ...P.chars].filter(c => (c.attachedDon || 0) > 0);
          if (srcs.reduce((s, c) => s + (c.attachedDon || 0), 0) < need) break;
          if (!(await confirmUse(side, ' 付与ドンを戻す', `付与ドン${need}枚をコストエリアにレストで戻して効果を使いますか？`, '使う', '使わない'))) break;
          let moved = 0; for (const c of srcs) { while ((c.attachedDon || 0) > 0 && moved < need) { c.attachedDon--; P.don.rested++; moved++; } if (moved >= need) break; }
          flog(side, `付与ドン${moved}枚をコストエリアにレストで戻した`); render();
          await runFx(op.then, ctx); break;
        }
        // 自分のアクティブのリーダーをこのターン中パワー-Nにするコスト（OP07-006ステリー）。任意。then実行。
        case 'leaderMinusCost': {
          if (P.leader.rested) break; // アクティブのリーダーが条件
          if (!(await confirmUse(side, 'リーダーをパワー-' + (op.amount || 5000), `自分のリーダーをパワー-${op.amount || 5000}にして効果を使いますか？`, '使う', '使わない'))) break;
          addBuff(P.leader, -(op.amount || 5000), 'turn'); floatOn(P.leader.uid, `-${op.amount || 5000}`, 'dmg');
          await runFx(op.then, ctx); break;
        }
        case 'donAttachAll': { let targets = op.incLeader ? [P.leader, ...P.chars] : P.chars; if (op.filter) targets = targets.filter(t => matchFilter(t, op.filter)); if (op.max != null) targets = targets.slice(0, op.max); for (const t of targets) { const k = Math.min(op.n, P.don.rested); t.attachedDon += k; P.don.rested -= k; } flog(side, op.incLeader ? 'リーダーとキャラにレストのドン付与' : '自キャラにレストのドン付与'); render(); break; } // filter=対象限定／max=最大対象数（OP08-001チョッパーL＝動物/ドラム王国3枚まで1枚ずつ）
        case 'selfToHand': { if (op.optional && !P.isCPU && !(await confirmUse(side, '手札に加える', `「${self.base.name}」を手札に加えますか？`, '加える'))) break; const z = P.trash; const i = z.indexOf(self); if (i >= 0) { z.splice(i, 1); P.hand.push(self); flog(side, `「${self.base.name}」をトラッシュから手札に加えた`); } else if (self && !P.hand.includes(self) && !P.chars.includes(self) && !P.life.includes(self)) { P.hand.push(self); flog(side, `「${self.base.name}」を手札に加えた`); } break; } // トラッシュ外＝トリガー解決中のlimboからも手札へ（「KOし、このカードを手札に加える」OP12-109等）
        case 'giveKeyword': {
          if (op.samePrev) { // 「選んだカードは…【KW】」＝直前のpowerModが選んだ同一対象へ付与（OP07-057芳香脚。再選択させると別カードを選べてしまう）
            for (const t of (ctx._pmPicked || [])) { t.kwGrant.push({ kw: op.kw, dur: durTag(op.duration, 'turn') }); floatOn(t.uid, op.kw, 'buff'); flog(side, `「${t.base.type === 'LEADER' ? 'リーダー' : t.base.name}」に【${op.kw}】を付与`); }
            render(); break;
          }
          if (op.target === 'allOwn' || op.target === 'allOwnL') { // 条件一致の自分のキャラ（Lはリーダー含む）全てに付与
            const dur = durTag(op.duration, 'turn');
            const pool = (op.target === 'allOwnL' ? [P.leader, ...P.chars] : P.chars).filter(c => matchFilter(c, opFilter(op)));
            for (const t of pool) t.kwGrant.push({ kw: op.kw, dur, self: t === self }); // self=自己付与（効果無効で失う。外部付与のみ残す）
            if (pool.length) flog(side, `自分のキャラ全てに【${kwJa(op.kw)}】`);
            break;
          }
          let t = null;
          if (op.target === 'self') t = self;
          else if (op.target === 'chooseOwn') t = await chooseCard(side, P.chars.filter(c => matchFilter(c, opFilter(op))), `【${kwJa(op.kw)}】を与える対象`, 'ownBig', true);
          else if (op.target === 'chooseOwnL') t = await chooseCard(side, [P.leader, ...P.chars].filter(c => matchFilter(c, opFilter(op))), `【${kwJa(op.kw)}】を与える対象（リーダーかキャラ）`, 'ownBig', true);
          if (!t && (op.target === 'chooseOwn' || op.target === 'chooseOwnL')) ctx._declined = true; // ★選択スキップ/候補0=未発動。【ターン1回】を消費しない（OP16-048=スキップ後も同ターンの次アタックで再度選べる）
          if (t) { t.kwGrant.push({ kw: op.kw, dur: durTag(op.duration, 'turn'), self: t === self }); flog(side, `「${t.base.name}」に【${kwJa(op.kw)}】`); } // self=自己付与（効果無効で失う。OP15-060エネルのブロッカー等）
          break;
        }
        case 'playSelf': { if (self) { await summon(side, self, false); flog(side, `「${self.base.name}」を登場させた`); } break; }
        case 'lifeToHand': { if (P._noLifeToHandTurn === G.turnSeq) { flog(side, 'このターンは効果でライフを手札に加えられない'); break; } if (op.optional && !(P.life.length && await confirmUse(side, 'ライフを手札に', 'ライフ1枚を手札に加えますか？', '加える'))) break; const ln = op.n || 1; let moved = 0; for (let i = 0; i < ln; i++) { const c = P.life.shift(); if (!c) break; P.hand.push(c); moved++; } if (moved) { flog(side, `自ライフ${moved}枚を手札に`); render(); fireSimpleReact(side, 'onLifeToHand'); await fireLifeLeft(side); if (op.then) await runFx(op.then, ctx); } break; }
        // 自分のライフをトラッシュに置く（OP05-100エネルの代わり）
        case 'lifeTrashSelf': { let moved = 0; for (let i = 0; i < (op.n || 1); i++) { const c = P.life.shift(); if (!c) break; P.trash.push(c); moved++; } flog(side, '自分のライフをトラッシュに置いた'); render(); if (moved) await fireLifeLeft(side); break; }
        // このターンの後に自分のターンを追加で得る（OP05-119ルフィ）
        case 'extraTurn': { G._extraTurn = side; flog(side, 'このターンの後、追加のターンを得る'); break; }
        case 'oppDiscardToSize': { const O6 = G.players[o]; const tgt = op.n || 5; while (O6.hand.length > tgt) { const c = O6.isCPU ? O6.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0] : await chooseFromHand(o, O6.hand.slice(), `手札を${tgt}枚にする`); if (!c) break; O6.hand.splice(O6.hand.indexOf(c), 1); O6.trash.push(reset(c)); } flog(side, `相手は手札を${tgt}枚に`); render(); break; } // 相手が手札N枚になるよう捨てる（OP05-058）
        case 'bottomOwnCharsExceptSelf': { for (const c of P.chars.slice()) { if (c === self) continue; P.don.rested += c.attachedDon || 0; removeChar(c); P.deck.push(reset(c)); } flog(side, 'このキャラ以外の自キャラをデッキ下へ'); render(); break; } // OP05-119ルフィ（付与ドンはレストで戻る）
        case 'deckTopToBottom': { if (P.deck.length) { P.deck.push(P.deck.shift()); flog(side, 'デッキの上1枚をデッキ下へ'); } break; } // OP04-011ナミ
        case 'millSelf': { const k = Math.min(op.n || 1, P.deck.length); for (let i = 0; i < k; i++) P.trash.push(P.deck.shift()); if (k) flog(side, `自分のデッキの上${k}枚をトラッシュ`); render(); break; } // 自分のデッキ上N枚をトラッシュ（P-121ブルック）
        case 'selfHandToDeckDraw': { const hn = P.hand.length; P.deck.push(...P.hand.splice(0)); shuffle(P.deck); draw(side, hn); flog(side, `手札${hn}枚を山に戻しシャッフル→${hn}ドロー`); render(); break; } // OP04-048ササキ
        case 'bounceAttackerToBottom': { const a = ctx.attacker; if (a && a.base.type === 'CHAR' && (a.base.cost || 0) <= (op.maxCost != null ? op.maxCost : 5)) { const ow = G.players[a.owner]; ow.don.rested += a.attachedDon || 0; removeChar(a); ow.deck.push(reset(a)); flog(side, `バトルした「${a.base.name}」を持ち主のデッキ下へ`); render(); } break; } // OP04-047氷鬼（ブロック時に近似。付与ドンはレストで戻る）
        // 場のキャラ1枚を持ち主のライフ上に裏向きで加える（OP12-117破壊弦。side:'any'=自分/相手両方が対象）
        case 'charToLife': { const cands = op.side === 'self' ? P.chars.filter(c => matchFilter(c, opFilter(op))) : op.side === 'any' ? [...oppChars(side, opFilter(op)), ...P.chars.filter(c => matchFilter(c, opFilter(op)))] : oppChars(side, opFilter(op)); const t = await chooseCard(side, cands, 'ライフに加えるキャラを選択', op.side === 'self' ? 'ownBig' : 'oppBig', op.optional); if (t) { const ow2 = G.players[t.owner]; removeChar(t); const card2 = reset(t); if (op.faceUp) card2._faceUp = true; let bottom = op.pos === 'bottom'; if (op.pos === 'choose' && !P.isCPU) bottom = (await showPrompt({ side, title: 'ライフに加える', text: 'ライフの上か下、どちらに加えますか？', opts: [{ t: 'ライフ上', v: 'top', primary: true }, { t: 'ライフ下', v: 'bottom' }] })) === 'bottom'; if (bottom) ow2.life.push(card2); else ow2.life.unshift(card2); flog(side, `「${t.base.name}」を${t.owner === side ? '自分' : '相手'}のライフ${bottom ? '下' : '上'}に${op.faceUp ? '表向きで' : ''}加えた`); render(); } break; } // faceUp=表向き / pos:'bottom'（OP11-116人魚柔術）
        case 'handToLife': { // 自分の手札1枚をライフの上に（人間=選択・optional=見送り可。旧実装は最小カウンター自動＝選択権が無かった）
          if (!P.hand.length) break;
          let c;
          if (P.isCPU) c = P.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0];
          else c = await chooseFromHand(side, P.hand, 'ライフの上に置くカードを選択' + (op.optional ? '（任意）' : ''), null, op.optional);
          if (!c) break;
          P.hand.splice(P.hand.indexOf(c), 1); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフの上に置いた'); render(); break; }
        // 自分のライフ上1枚を公開し、そのコスト1につき self を+per(既定1000)パワー（このターン中）。OP15-119ルフィ
        case 'revealLifeCostBuff': { if (!P.life.length) break; if (!P.isCPU && !(await confirmUse(side, 'ライフ公開', 'ライフの上から1枚を公開して、そのコスト×1000パワーを上げますか？（相手にもカードが公開されます）', '公開する', 'しない'))) break; const cost = P.life[0].base.cost || 0; const amt = cost * (op.per || 1000); if (self && amt) { addBuff(self, amt, durTag(op.duration, 'turnEnd')); floatOn(self.uid, `+${amt}`, 'buff'); } flog(side, `ライフ上を公開(コスト${cost})→パワー+${amt}`); render(); break; } // ★「1枚までを公開する」＝任意。人間は確認（公開＝情報開示の実コストがある）。CPUは常に公開。Q&A1293: 表向きのライフでも公開宣言可＝表裏ゲートは設けない
        // 手札からfilter一致のキャラ1枚を選び、自分のライフの上に加える（faceUp=表向き）。OP10-103/107/119
        case 'handCharToLife': {
          const hclPool = op.fromTrash ? [...P.hand, ...P.trash] : P.hand; // fromTrash=「手札かトラッシュの」（ST13-003）
          const cands = hclPool.filter(x => x.base.type === 'CHAR' && matchFilter(x, op.filter || {}));
          if (!cands.length) break;
          const c = P.isCPU ? cands.slice().sort((a, b) => (b.base.cost || 0) - (a.base.cost || 0))[0] : await chooseFromHand(side, cands, 'ライフの上に加えるキャラを選択（任意）', null, true);
          if (!c) break; if (P.hand.includes(c)) P.hand.splice(P.hand.indexOf(c), 1); else P.trash.splice(P.trash.indexOf(c), 1); c._faceUp = !!op.faceUp; P.life.unshift(c); flog(side, `手札の「${c.base.name}」をライフの上に${op.faceUp ? '表向きで' : '裏向きで'}加えた`); render(); break;
        }
        // このキャラをレストにするコスト（OP10-112キッド登場時）。既にレストなら不発。then実行。
        case 'restSelfCost': {
          if (!self || self.rested || isRestImmune(self)) break; // 「レストにできない」＝コストとしてもレストできない
          if (!(await confirmUse(side, '自身をレスト', `「${self.base.name}」をレストにして効果を使いますか？`, 'レストして使う', '使わない'))) break;
          self.rested = true; await fireSelfRested(self, 'ownEffect'); flog(side, `「${self.base.name}」をレストにした`); render(); await runFx(op.then, ctx); break;
        }
        // このキャラを持ち主のデッキの下に置く（強制・OP09-051バギー）
        case 'selfToDeckBottom': { if (self && P.chars.includes(self)) { P.don.rested += self.attachedDon || 0; removeChar(self); P.deck.push(reset(self)); flog(side, `「${self.base.name}」をデッキの下に置いた`); await checkAllyLeave(side, self, 'ownEffect'); render(); } break; }
        // このキャラ自身をトラッシュからレストで登場（OP09-052マルコ＝KO時の自己蘇生）
        case 'reviveSelfRested': { const i = P.trash.indexOf(self); if (i < 0) break; P.trash.splice(i, 1); await summon(side, self, false, 'trash'); if (P.chars.includes(self)) self.rested = true; render(); break; }
        // 手札N枚をデッキの下に置くコスト（OP09-060カライ・バリ島）。払えたら then。
        case 'handToBottomCost': {
          const n = op.n || 1; if (P.hand.length < n) break;
          if (!(await confirmUse(side, '手札をデッキ下', `手札${n}枚をデッキの下に置いて効果を使いますか？`, '置いて使う', undefined, { cls: 'danger' }))) break;
          for (let i = 0; i < n; i++) { const c = P.isCPU ? P.hand.slice().sort((a, b) => (a.base.counter || 0) - (b.base.counter || 0))[0] : await chooseFromHand(side, P.hand.slice(), op.pos === 'top' ? `デッキの上に置く手札（${i + 1}/${n}）` : `デッキの下に置く手札（${i + 1}/${n}）`); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); if (op.pos === 'top') P.deck.unshift(c); else P.deck.push(c); }
          flog(side, op.pos === 'top' ? `手札${n}枚をデッキの上へ` : `手札${n}枚をデッキの下へ`); await runFx(op.then, ctx); break;
        }
        case 'handToBottom': {
          let hbTop = op.pos === 'top';
          if (op.posChoose && P.hand.length) hbTop = P.isCPU ? false : (await showPrompt({ side, title: '手札をデッキへ', text: 'デッキの上と下、どちらに置きますか？', opts: [{ t: 'デッキの下', v: 'b', primary: true }, { t: 'デッキの上', v: 't' }] })) === 't';
          for (let i = 0; i < (op.n || 1); i++) {
            if (!P.hand.length) break;
            const c = await chooseFromHand(side, P.hand.slice(), hbTop ? `デッキの上に置く手札（残り${(op.n || 1) - i}枚）` : `デッキの下に置く手札（残り${(op.n || 1) - i}枚）`);
            if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); if (hbTop) P.deck.unshift(c); else P.deck.push(c);
          }
          flog(side, hbTop ? '手札をデッキの上に置いた' : '手札をデッキの下に置いた'); break;
        }
        case 'oppLifeToHand': { // 「相手のライフの上からN枚までを、持ち主の手札に加える」。optionalなら人間は見送り可（相手に手札を与えるため不利な場面がある）
          for (let i = 0; i < (op.n || 1); i++) {
            if (!G.players[o].life.length) break;
            if (op.optional && !P.isCPU) { const go = (await showPrompt({ side, title: '相手ライフを手札に', text: '相手のライフ上1枚を相手の手札に加えますか？（相手に1枚渡す）', opts: [{ t: '加える', v: 'y', primary: true }, { t: '加えない', v: 'n', ghost: true }] })) === 'y'; if (!go) break; }
            const c = G.players[o].life.shift(); G.players[o].hand.push(c); flog(side, `相手ライフ1枚を手札に送った`); await fireLifeLeft(o); await sleep(150);
          }
          break;
        }
        case 'lifeAddFromDeck': { let la = 0; for (let i = 0; i < op.n; i++) { if (!P.deck.length) break; if (op.optional && !(await confirmUse(side, 'ライフに追加', 'デッキの上から1枚をライフの上に加えますか？', '加える', '加えない'))) { if (!la) ctx._declined = true; break; } const c = P.deck.shift(); if (op.faceUp) c._faceUp = true; P.life.unshift(c); la++; } if (la) flog(side, `デッキ上${la}枚をライフに${op.faceUp ? '表向きで' : ''}加えた`); break; } // ★「1枚まで」= optional:true で辞退可（黄はライフ枚数条件を切らない辞退に実益。CPUは常に追加）
        case 'flipLifeUp': { if (P.life.length) { P.life[0]._faceUp = true; flog(side, '自分のライフの一番上を表向きにした'); floatOn(P.leader.uid, 'LIFE表', 'heal'); render(); await sleep(160); } break; }
        case 'lifeTrash': { // side:'both'=お互いのライフ上1枚トラッシュ（OP11-102ケイミー）／'opp'=相手のみ／既定=自分。「1枚まで」= optional:true で決定者（効果コントローラー）が辞退可（lifeTrashはfireLifeLeftで相手のライフ離脱時効果を誘発するため辞退が正解の局面がある）
          const sides = op.side === 'both' ? [side, o] : op.side === 'opp' ? [o] : [side];
          for (const sd of sides) { const PP = G.players[sd]; if (!PP.life.length) continue; if (op.optional && !(await confirmUse(side, 'ライフをトラッシュ', sd === side ? '自分のライフの上から1枚をトラッシュに置きますか？' : '相手のライフの上から1枚をトラッシュに置きますか？', '置く', '置かない'))) continue; const c = PP.life.shift(); if (c) { PP.trash.push(c); flog(side, sd === side ? '自ライフ1枚をトラッシュ' : '相手ライフ1枚をトラッシュ'); await fireLifeLeft(sd); } }
          render(); break;
        }
        case 'activateSelf': { if (self) { self.rested = false; flog(side, `「${self.base.name}」をアクティブにした`); render(); } break; } // このキャラをアクティブにする（OP11-107チョンマゲ＝ターン終了時）
        // ライフ上1枚を公開し、filter一致なら登場してもよい（一致しなければライフ上に残す。OP10-022ロー）
        case 'revealLifePlay': {
          if (!P.life.length) break;
          const top = P.life[0]; flog(side, `ライフの上を公開: 「${top.base.name}」`);
          let rlPlayed = false;
          if (matchFilter(top, op.filter || {})) {
            if (P.isCPU || await confirmUse(side, '登場', `公開した「${top.base.name}」を登場させますか？`, '登場させる', 'しない')) { P.life.shift(); top.owner = side; await summon(side, top, false); rlPlayed = true; await fireLifeLeft(side); }
          }
          render();
          if (rlPlayed && op.then) await runFx(op.then, ctx); // 「登場させた場合」の後続（ST13-007/010/014）
          break;
        }
        // 相手のレストのドンN枚を「次のリフレッシュでアクティブにしない」（OP10-033ナミ）。beginTurnのリフレッシュで消化。
        case 'donRefreshLock': { const O3 = G.players[o]; const n = Math.min(op.n || 1, O3.don.rested); O3._donRefreshLock = (O3._donRefreshLock || 0) + n; if (n) flog(side, `相手のレストのドン${n}枚は次のリフレッシュでアクティブにならない`); break; }
        // 相手のレストのキャラを「次の相手のリフレッシュでアクティブにしない」（OP08ミンク族）。_noRefreshSeqに相手の次ターンseqをセット。
        case 'lockRefresh': {
          const seq = G.turnSeq + 1;
          if (op.includeLeader && G.players[o].leader.rested) { G.players[o].leader._noRefreshSeq = seq; flog(side, '相手リーダーは次のリフレッシュでアクティブにならない'); } // OP07-059フォクシーL（リーダーもロック）
          if (op.all) { for (const t of oppChars(side, opFilter(op)).filter(c => c.rested)) t._noRefreshSeq = seq; flog(side, '相手のレストのキャラは次のリフレッシュでアクティブにならない'); render(); break; }
          for (let i = 0; i < (op.count || 1); i++) { const cands = oppChars(side, opFilter(op)).filter(c => c.rested && c._noRefreshSeq !== seq); const t = P.isCPU ? cands[0] : await chooseCard(side, cands, '次のリフレッシュでアクティブにしない相手キャラ', 'oppBig', op.optional); if (!t) break; t._noRefreshSeq = seq; flog(side, `「${t.base.name}」は次のリフレッシュでアクティブにならない`); }
          render(); break;
        }
        // 相手のアクティブのドンをN枚レストにする（OP08-030ペドロ）
        case 'restOppDon': { const O4 = G.players[o]; const n = Math.min(op.n || 1, O4.don.active); O4.don.active -= n; O4.don.rested += n; if (n) flog(side, `相手のドン${n}枚をレストにした`); render(); break; }
        case 'oppDonToDeck': { const O7 = G.players[o]; let n = op.n || 1; while (n > 0) { if (O7.don.active > 0) O7.don.active--; else if (O7.don.rested > 0) O7.don.rested--; else break; n--; } flog(side, `相手のドンをドンデッキに戻した`); render(); break; } // 相手のドンをドンデッキへ（OP02-085マゼラン）
        case 'peekOppHand': {
          const O8 = G.players[o];
          if (op.choose) { // 「相手の手札1枚を選び、公開する」（OP01-063アーロン）。Q&A155: 裏向きのまま選ぶ＝ブラインド選択。Q&A157: 手札0なら起動できるが何も起きない
            if (!O8.hand.length) { flog(side, '相手の手札がないため公開できない'); break; }
            let idx;
            if (P.isCPU) idx = Math.floor(rng() * O8.hand.length); // ★ゲーム結果に効く乱数はrng（ロックステップ不変条件）
            else { const v = await showPrompt({ side, title: '相手の手札を選ぶ', text: `裏向きのまま1枚を選んで公開します（相手の手札 ${O8.hand.length}枚）`, opts: O8.hand.map((_, i) => ({ t: (i + 1) + '枚目', v: 'pick:' + i })) }); idx = (typeof v === 'string' && v.indexOf('pick:') === 0) ? +v.slice(5) : 0; }
            const c = O8.hand[Math.min(idx, O8.hand.length - 1)];
            flog(side, `相手の手札を公開: 「${c.base.name}」`); cardReveal(o, c.no, c.base.name, '手札公開', 'hand');
            if (!P.isCPU) await showPrompt({ side, title: '公開されたカード', text: '相手の手札から公開されたカードです。確認したら「完了」を押してください。', reveal: { no: c.no, name: c.base.name }, opts: [{ t: '完了', v: 'ok', primary: true }] });
            if (op.then && (!op.thenIfType || c.base.type === op.thenIfType)) await runFx(op.then, ctx); // thenIfType: 公開カードの種別一致時のみ後続（イベントならライフ削り等）
            render(); break;
          }
          const n = Math.min(op.n || 1, O8.hand.length); if (n) flog(side, `相手の手札を確認: ${O8.hand.slice(0, n).map(c => c.base.name).join('、')}`); if (op.then && n) await runFx(op.then, ctx); break;
        } // 相手の手札を見る（OP01-063アーロン/105バオファン）
        // 相手のライフの上から1枚を持ち主のデッキの下に置く（OP01-063アーロン後半。「1枚まで」=optionalで人間は見送り可）
        case 'oppLifeToDeckBottom': {
          const OL = G.players[o]; if (!OL.life.length) break;
          if (op.optional && !P.isCPU && !(await confirmUse(side, '相手のライフをデッキ下へ', '相手のライフの上から1枚を持ち主のデッキの下に置きますか？', '置く', '置かない'))) break;
          const c = OL.life.shift(); OL.deck.push(reset(c)); flog(side, '相手のライフ上1枚を持ち主のデッキの下に置いた'); await fireLifeLeft(o); render(); break;
        }
        case 'searchDeck': { const cands = P.deck.filter(c => matchFilter(c, op.filter || {})); const t = P.isCPU ? (cands.length && typeof planPickSearch === 'function' ? planPickSearch(side, cands, () => cands[0]) : cands[0]) : await chooseCard(side, cands, 'デッキから手札に加えるカード', 'ownBig', op.optional !== false); if (P.isCPU && G._searchDiag) try { G._searchDiag(side, cands, t, op); } catch (e) { } if (t) { if (!G._sim) t._pubHand = G.turnSeq; P.deck.splice(P.deck.indexOf(t), 1); P.hand.push(t); flog(side, `デッキから「${t.base.name}」を手札に`); } shuffle(P.deck); render(); break; } // デッキ全体から1枚サーチ＋シャッフル（OP01-098オロチ）。E38: _searchDiag=診断フック／E39: usePlan時のみプラン優先（非活性はcands[0]＝バイト等価）／E43: _pubHand=公開フラグ
        // 自分の場のドンを「相手の場のドン枚数」と同じになるまでドンデッキへ戻す（OP08-074ブラックマリア・ターン終了時）
        case 'donReturnToMatchOpp': { const want = donTotal(o); let excess = Math.max(0, donTotal(side) - want); while (excess > 0) { if (P.don.rested > 0) P.don.rested--; else if (P.don.active > 0) P.don.active--; else break; excess--; } if (donTotal(side) <= want) flog(side, '自分のドンを相手と同じ枚数に戻した'); render(); break; }
        // 自分のライフをすべて裏向きにする（OP08-075キャンディメイデン）
        case 'flipAllLifeDown': { for (const l of P.life) l._faceUp = false; flog(side, '自分のライフをすべて裏向きにした'); render(); break; }
        case 'lifeTrashToSize': { const tgt = op.n || 1; let k = 0; while (P.life.length > tgt) { const c = P.life.shift(); if (!c) break; P.trash.push(c); k++; } if (k) flog(side, `自分のライフ${k}枚をトラッシュ（ライフ${tgt}枚に）`); render(); if (k) await fireLifeLeft(side); break; } // 自分のライフがN枚になるよう上からトラッシュ（EB01-059/060空島）
        case 'lifeTrashFaceUp': { const fu = P.life.filter(l => l._faceUp); for (const c of fu) { P.life.splice(P.life.indexOf(c), 1); P.trash.push(c); } if (fu.length) flog(side, `表向きのライフ${fu.length}枚をトラッシュ`); render(); if (fu.length) await fireLifeLeft(side); break; } // 表向きのライフをすべてトラッシュ（ST13-002エースL）
        // デッキ上1枚をトラッシュに置き、そのコストが minCost 以上なら then 実行（OP08-096人の夢は終わらねェ）
        case 'millBuff': { if (!P.deck.length) break; const top = P.deck.shift(); P.trash.push(reset(top)); flog(side, `デッキの上「${top.base.name}」をトラッシュに置いた`); if ((top.base.cost || 0) >= (op.minCost || 0)) await runFx(op.then, ctx); render(); break; }
        // このキャラを持ち主の手札に戻すコスト（OP08-041アフェランドラ）。払えたら then。
        case 'bounceSelfCost': { if (!self || !(P.chars.includes(self))) break; if (!(await confirmUse(side, '自身を手札へ', `「${self.base.name}」を手札に戻して効果を使いますか？`, '戻して使う'))) break; bounceCard(self); flog(side, `「${self.base.name}」を手札に戻した`); await checkAllyLeave(side, self, 'ownEffect'); await runFx(op.then, ctx); break; }
        // 自分の元々パワーN以下のキャラを、durationの間、相手の効果でKOされないようにする（OP10-070トレーボル）
        case 'grantWeakKoImmune': { P._weakKoImmune = { until: durSeq(op.duration || 'untilNextEnd'), maxBasePower: op.maxBasePower || 1000 }; flog(side, `元々パワー${op.maxBasePower || 1000}以下の自キャラは相手の効果でKOされない`); break; }
        // filter一致の自キャラを、durationの間、効果でKOされないようにする（OP09-033ロビン＝ODYSSEY/麦わら）
        case 'grantTraitKoImmune': { P._traitKoImmune = { until: durSeq(op.duration || 'untilNextEnd'), filter: op.filter || {} }; flog(side, 'フィルタ一致の自キャラは効果でKOされない'); break; }
        // 相手の【登場時】効果を duration の間 無効にする（OP09-081ティーチLの起動メイン）
        case 'negateOppOnPlay': { G.players[o]._onPlayNegatedUntil = durSeq(op.duration || 'untilNextEnd'); flog(side, '次の相手のターン終了時まで、相手の登場時効果を無効にした'); break; }
        // このキャラを持ち主のデッキの下に置くコスト（OP10-026/027錦えもん）。払えたら then 実行。
        case 'selfToBottomCost': {
          if (!P.chars.includes(self)) break;
          if (!(await confirmUse(side, '自身をデッキ下', `「${self.base.name}」をデッキの下に置いて効果を使いますか？`, '置いて使う', undefined, { cls: 'danger' }))) break;
          P.don.rested += self.attachedDon || 0; removeChar(self); P.deck.push(reset(self)); flog(side, `「${self.base.name}」をデッキの下に置いた`);
          await checkAllyLeave(side, self, 'ownEffect'); await runFx(op.then, ctx); break;
        }
        case 'lifeSwap': {
          if (!P.life.length) { flog(side, 'ライフが無く効果なし'); break; }
          if (P.isCPU) { P.hand.push(P.life.shift()); flog(side, '【ライフ操作】ライフ上1枚を手札に'); }
          else {
            const pk = await showPrompt({ side, title: 'ライフ操作', text: 'ライフ上か下の1枚を手札に加える', opts: [{ t: 'ライフ上を手札に', v: 'top', primary: true }, { t: 'ライフ下を手札に', v: 'bot' }, { t: 'やめる', v: 'no' }] });
            if (pk === 'top') { P.hand.push(P.life.shift()); flog(side, 'ライフ上を手札に'); }
            else if (pk === 'bot') { P.hand.push(P.life.pop()); flog(side, 'ライフ下を手札に'); }
            else break;
          }
          await fireLifeLeft(side);
          if (P.hand.length) {
            if (P.isCPU) { const c = P.hand[P.hand.length - 1]; P.hand.pop(); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフ上に'); }
            else { const c = await chooseCard(side, P.hand, 'ライフの上に置く手札（任意）', 'ownBig', true); if (c) { P.hand.splice(P.hand.indexOf(c), 1); P.life.unshift(faceDown(c)); flog(side, '手札1枚をライフ上に'); } }
          }
          render(); break;
        }
        case 'scry': { // 「デッキの上からN枚を見て、好きな順番に並び替え、デッキの上か下に置く」（全scryカード共通文言。pos:'top'=ST17-003の上固定）
          const scryN = op.n || op.look || 0; // look別名対応（op.nのみ読みでは0枚splice=完全無効だった）
          const look = P.deck.splice(0, scryN);
          flog(side, `デッキ上${look.length}枚を確認`);
          if (!P.isCPU && look.length) {
            // ①好きな順番に並び替え（上から順に選ぶ。reorderLife方式）
            const remaining = look.slice(); const ordered = [];
            while (remaining.length > 1) {
              const v = await showPrompt({ side, title: 'デッキ操作', text: `上${scryN}枚を確認。${ordered.length + 1}番目（束の一番上側）に置くカードを選択`, opts: remaining.map((c, i) => ({ t: c.base.name, v: 'pick:' + i })) });
              const idx = (typeof v === 'string' && v.indexOf('pick:') === 0) ? +v.slice(5) : 0;
              ordered.push(remaining[idx]); remaining.splice(idx, 1);
            }
            ordered.push(remaining[0]);
            // ②束ごとデッキの上か下へ
            let toBottom = false;
            if (op.pos === 'bottom') toBottom = true;
            else if (op.pos !== 'top') toBottom = (await showPrompt({ side, title: 'デッキ操作', text: '並び替えた束をデッキの上と下、どちらに置きますか？', opts: [{ t: 'デッキの上', v: 't', primary: true }, { t: 'デッキの下', v: 'b' }] })) === 'b';
            if (toBottom) P.deck.push(...ordered);
            else for (let i = ordered.length - 1; i >= 0; i--)P.deck.unshift(ordered[i]);
            flog(side, `${look.length}枚を並び替えてデッキの${toBottom ? '下' : '上'}に置いた`);
          } else { for (let i = look.length - 1; i >= 0; i--)P.deck.unshift(look[i]); }
          render(); break;
        }
        case 'bottomOwn': { for (let i = 0; i < op.n; i++) { const c = await chooseFromHand(side, P.hand, 'デッキ下に置く手札を選択'); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.deck.push(reset(c)); } flog(side, `手札${op.n}枚をデッキ下`); break; }
        // デッキ上 look 枚から filter一致のキャラ1枚を登場、残りをデッキ下（OP11-051サンジ）。grantKwで登場時付与。
        case 'playFromDeck': { const all = op.look === 'all'; const look = all ? P.deck.splice(0, P.deck.length) : P.deck.splice(0, op.look || 5); const cands = look.filter(c => (c.base.type === 'CHAR' || c.base.type === 'STAGE') && matchFilter(c, op.filter || {})); const pc = P.isCPU ? cands.slice().sort((a, b) => (b.base.power || 0) - (a.base.power || 0))[0] : await chooseCard(side, cands, '登場させるカードを選択（任意）', 'ownBig', true); if (pc) { look.splice(look.indexOf(pc), 1); if (pc.base.type === 'STAGE') { if (P.stage) P.trash.push(reset(P.stage)); P.stage = pc; pc.owner = side; pc.rested = false; if (pc.base.fx && pc.base.fx.onPlay && !isNegated(pc)) await runFx(pc.base.fx.onPlay, { self: pc, side }); } else { await summon(side, pc, false); if (op.rested && P.chars.includes(pc)) pc.rested = true; if (op.grantKw && P.chars.includes(pc)) pc.kwGrant.push({ kw: op.grantKw, dur: durTag(op.grantDuration, 'turn') }); } } let pfdTop = false; if (op.restPos === 'choose' && !all && look.length && !P.isCPU) pfdTop = (await showPrompt({ side, title: '残りのカード', text: `残り${look.length}枚をデッキの上と下、どちらに置きますか？`, opts: [{ t: 'デッキの下', v: 'b', primary: true }, { t: 'デッキの上', v: 't' }] })) === 't'; if (pfdTop) { for (let i = look.length - 1; i >= 0; i--)P.deck.unshift(look[i]); } else for (const r of look) P.deck.push(r); if (all || op.shuffle) shuffle(P.deck); flog(side, all ? 'デッキから登場（シャッフル）' : `デッキ上${op.look || 5}枚から登場・残りはデッキの${pfdTop ? '上' : '下'}`); render(); break; } // restPos:'choose'=「残りをデッキの上か下に置く」（ST12-010/013/017） // look:'all'=デッキ全体から登場しシャッフル（OP08-071/073）／STAGE対応（OP08-100）／rested=レストで登場（OP08-007）
        case 'discardOwn': { const n = op.all ? P.hand.length : (op.toSize != null ? Math.max(0, P.hand.length - op.toSize) : op.n); for (let i = 0; i < n; i++) { const c = await chooseFromHand(side, P.hand, '⚠ 捨てる手札を選択', null, false, 'danger'); if (!c) break; P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); } if (n) { flog(side, `手札${n}枚を捨てた`); await fireHandDiscarded(side, n, ctx.self); } break; }
        case 'cond': if (checkCond(op.check, side, self)) await runFx(op.then, ctx); else { ctx._declined = true; if (op.else) await runFx(op.else, ctx); } break; // 条件不成立=未発動（onceゲート復元用マーカー）
        // 手札公開コスト: 手札の filter 一致カードを count 枚公開できる場合のみ then を実行（公開=手札に残す。任意）
        case 'revealCost': {
          const cnt = op.count || 1;
          const matches = P.hand.filter(c => matchFilter(c, op.filter));
          if (matches.length < cnt) { ctx._declined = true; break; } // 公開できるカードが足りない→不発
          if (!(await confirmUse(side, '手札公開', `手札${cnt}枚を公開して効果を使いますか？`, '公開して使う'))) { ctx._declined = true; break; }
          // ★公開するカードはプレイヤーが選ぶ（旧: 先頭から自動選択＝ST22-001エース&ニューゲートで公開→デッキ上に戻すカードを選べなかった）
          let chosen;
          if (P.isCPU) chosen = matches.slice(0, cnt);
          else {
            chosen = [];
            for (let i = 0; i < cnt; i++) {
              const c = await chooseFromHand(side, matches.filter(x => !chosen.includes(x)), cnt > 1 ? `公開するカードを選択（${i + 1}/${cnt}）` : '公開するカードを選択', null, true);
              if (!c) break; chosen.push(c);
            }
            if (chosen.length < cnt) { ctx._declined = true; break; } // 途中キャンセル=公開せず不発
          }
          flog(side, `手札${cnt}枚を公開: ${chosen.map(c => c.base.name).join('、')}`);
          ctx._revealed = chosen; // 後続op（revealedToDeckTop等）が公開カードを参照
          await runFx(op.then, ctx);
          break;
        }
        case 'revealedToDeckTop': { const rv = ctx._revealed || []; for (const c of rv) { const i = P.hand.indexOf(c); if (i >= 0) { P.hand.splice(i, 1); P.deck.unshift(c); } } if (rv.length) flog(side, `公開したカード${rv.length}枚をデッキの上に置いた`); render(); break; } // ST22-001
        // ドンをレストにするコスト: アクティブのドンを n 枚レストにできる場合のみ then を実行（任意）
        case 'restDonCost': {
          const n = op.n || 1;
          if (P.don.active < n) { ctx._declined = true; break; }
          if (!(await confirmUse(side, 'ドンをレスト', `ドン${n}枚をレストにして効果を使いますか？`, 'レストして使う'))) { ctx._declined = true; break; }
          ctx._committed = true; // コスト支払い＝使用（onceゲート消費）
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
          else sac = await chooseCard(side, cands, '⚠ トラッシュに置くキャラを選択（効果のコスト）', 'ownSmall', true, 'danger');
          if (!sac) break;
          removeCharTo(sac, P.trash); flog(side, `「${sac.base.name}」をトラッシュに置いた`); await checkAllyLeave(side, sac, 'ownEffect');
          await runFx(op.then, ctx);
          break;
        }
        // 手札を捨てるコスト: filter一致のカードを count枚 捨てて then を実行（任意・札は消費する）
        case 'discardCost': {
          const cnt = op.count || 1;
          if (op.cpuSkip && P.isCPU) break; // CPUは使わない任意コスト（手札を大量に切る割に薄い効果＝モリア【アタック時】等）。confirmUseがCPU常true対策。
          const matches = P.hand.filter(c => matchFilter(c, op.filter));
          if (matches.length < cnt) { ctx._declined = true; break; }
          if (!(await confirmUse(side, '手札を捨てる', `手札${cnt}枚を捨てて効果を使いますか？`, '捨てて使う', undefined, { cls: 'danger' }))) { ctx._declined = true; break; }
          let toDiscard;
          if (P.isCPU) toDiscard = matches.slice().sort((a, b) => ((a.base.cost || 0) - (b.base.cost || 0)) || ((a.base.counter || 0) - (b.base.counter || 0))).slice(0, cnt);
          else {
            toDiscard = [];
            for (let i = 0; i < cnt; i++) { const pick = await chooseFromHand(side, P.hand.filter(c => matchFilter(c, op.filter) && !toDiscard.includes(c)), `⚠ 捨てるカードを選択（${i + 1}/${cnt}）`, null, false, 'danger'); if (!pick) break; toDiscard.push(pick); }
            if (toDiscard.length < cnt) { ctx._declined = true; break; }
          }
          ctx._committed = true; // 手札を捨てた＝効果を使用（onceゲート消費）
          for (const c of toDiscard) { P.hand.splice(P.hand.indexOf(c), 1); P.trash.push(reset(c)); }
          flog(side, `手札${cnt}枚を捨てた: ${toDiscard.map(c => c.base.name).join('、')}`);
          await fireHandDiscarded(side, cnt, ctx.self);
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
          if (op.side === 'opp' || op.target === 'chooseOpp') { for (let i = 0; i < (op.count || 1); i++) { const t = await chooseCard(side, oppChars(side, opFilter(op)).filter(c => !targets.includes(c)), `パワーを${setVal}にする相手キャラを選択`, 'oppBig', op.optional); if (!t) break; targets.push(t); } } // 相手キャラのパワーをNにする（OP07-002アイン＝パワー0）
          for (const t of targets) if (t) { t.buffs.push({ setBase: setVal, until: dur }); floatOn(t.uid, `P${setVal}`, t.owner === side ? 'buff' : 'dmg'); }
          if (targets.length) { flog(side, `パワーを${setVal}に`); render(); }
          break;
        }
        // KO時など: self 自身をトラッシュから登場させる（noEnter:true で登場時効果を発動しない）
        case 'reviveSelf': {
          const i = P.trash.indexOf(self); if (i < 0) break; P.trash.splice(i, 1);
          await summon(side, reset(self), op.noEnter, 'trash');
          break;
        }
        // レストのドン!!を n枚 アクティブに戻す（リソース加速）
        case 'donActivate': { if (P._noDonActivateTurn === G.turnSeq && ctx.self && ctx.self.base.type === 'CHAR') { flog(side, 'このターンはキャラの効果でドンをアクティブにできない'); break; } const k = op.all ? P.don.rested : Math.min(op.n || 1, P.don.rested); P.don.rested -= k; P.don.active += k; if (k) flog(side, `ドン${k}枚をアクティブにした`); render(); break; }
        // このターン終了時に donActivate（OP13-024/038）。endTurn で消化。
        case 'delayedDonActivate': { P._endDonActTurn = G.turnSeq; P._endDonActN = (P._endDonActN || 0) + (op.n || 1); flog(side, `このターン終了時にドン${op.n || 1}枚までをアクティブにする`); break; }
        // 相手がドンデッキからドンをアクティブで追加してもよい（OP12-075ミス・オールサンデーのデメリット）。CPUは常に追加。
        case 'oppDonFromDeck': { const O = G.players[o]; const room = Math.max(0, O.donMax - donTotal(o)); const k = Math.min(op.n || 1, room); if (k > 0 && (O.isCPU || await confirmUse(o, 'ドン追加', `ドンデッキからドン${k}枚をアクティブで追加しますか？`, '追加する', 'しない'))) { O.don.active += k; flog(side, `相手がドンデッキからドン${k}枚をアクティブで追加`); render(); } break; }
        // このターン、手札からカードをプレイできない（OP13-028シャンクス。キャラ/イベント/ステージ全て）
        case 'setPlayBan': { P._noPlayTurn = G.turnSeq; flog(side, 'このターン、手札からカードをプレイできない'); break; }
        // このステージを持ち主のデッキの下に置くコスト（OP12-080バラティエ）。
        case 'stageToBottomCost': { if (!P.stage) break; const st = P.stage; P.stage = null; P.deck.push(reset(st)); flog(side, `ステージ「${st.base.name}」をデッキ下へ`); render(); await runFx(op.then, ctx); break; }
        // 自分のライフの上から1枚を表向きにするコスト（OP13-114/117）。任意。
        case 'flipLifeCost': {
          const fn = op.n || 1; if (P.life.length < fn) break; // n枚（既定1）を表向きにできる場合のみ
          // ★「ライフの上からn枚を表向きにできる」は裏向きのライフにしか払えないコスト（既に表向き＝コスト不成立＝発動不可）。
          //   黄キッドL(OP10-099)が表向きのライフで毎ターン発動できていた実対戦指摘(2026-07-16)の修正。
          //   ※「上か下から」型の表裏コストは lifeCost(pos:'choose') が担当（そちらは裏向きが残る側を選べば払える）。
          if (!P.life.slice(0, fn).every(l => !l._faceUp)) break;
          if (!(await confirmUse(side, 'ライフを表向き', `ライフの上から${fn}枚を表向きにして効果を使いますか？`, '表向きにして使う', '使わない'))) break;
          for (let i = 0; i < fn; i++) if (P.life[i]) P.life[i]._faceUp = true; flog(side, `ライフの上から${fn}枚を表向きにした`); render();
          await runFx(op.then, ctx); break;
        }
        case 'restThis': { if (self && isRestImmune(self)) { flog(side, `「${self.base.name}」はレストにできない`); break; } if (self) { self.rested = true; await fireSelfRested(self, 'ownEffect'); flog(side, `「${self.base.name}」をレストにした`); render(); } break; } // このキャラをレストにする（強制・OP08-046シャクヤク）
        // 自分のトラッシュから n 枚(filter一致)をデッキの下に置くコスト（OP13-081コアラ / OP12-091/094）。任意。
        case 'trashToBottomCost': {
          const tn = op.n || 1;
          if (P.trash.filter(c => matchFilter(c, op.filter || {})).length < tn) break;
          if (!(await confirmUse(side, 'トラッシュをデッキ下', `トラッシュ${tn}枚をデッキの下に置いて効果を使いますか？`, '置いて使う', '使わない'))) break;
          for (let i = 0; i < tn; i++) { const cands = P.trash.filter(c => matchFilter(c, op.filter || {})); const tc = P.isCPU ? cands[0] : await chooseCard(side, cands, `デッキ下に置くトラッシュを選択（${i + 1}/${tn}）`, 'ownSmall', false); if (!tc) break; P.trash.splice(P.trash.indexOf(tc), 1); P.deck.push(reset(tc)); }
          flog(side, `トラッシュ${tn}枚をデッキ下へ`); render();
          await runFx(op.then, ctx); break;
        }
        // 相手のステージ1枚までをKO（OP14-088ドロフィー。filterでコスト制限、isImmuneは除く）
        case 'koStage': { const O = G.players[o]; if (O.stage && matchFilter(O.stage, opFilter(op)) && !isImmune(O.stage)) { const s = O.stage; O.stage = null; O.trash.push(reset(s)); flog(side, `相手のステージ「${s.base.name}」をKO`); render(); await sleep(120); } break; }
        // 自分がNダメージを受ける（OP14-115リンドウ。ライフ1枚を失う＝トリガーも誘発し得る）
        case 'selfDamage': { for (let i = 0; i < (op.n || 1); i++) await dealLeaderDamage(side, { base: {} }, 1, false); break; }
        // このキャラ(ctx.self)自身の効果を無効化（OP14-056ワダツミ。durationでこのターン中/次相手ターン終了まで）
        case 'negateSelf': { if (self) { self.negSeq = durSeq(op.duration); flog(side, `「${self.base.name}」は効果が無効になった`); floatOn(self.uid, '無効', 'dmg'); render(); } break; }
        // 自分のライフの上から1枚を裏向きにするコスト（OP11しらほし系の資源）。任意。lives既定は裏向きなので主に確認ゲート。
        case 'lifeFlipDownCost': {
          if (!P.life.length) break;
          if (!(await confirmUse(side, 'ライフを裏向き', 'ライフの上から1枚を裏向きにして効果を使いますか？', '裏向きにして使う', '使わない'))) break;
          P.life[0]._faceUp = false; flog(side, 'ライフの上から1枚を裏向きにした'); render();
          await runFx(op.then, ctx); break;
        }
        // 任意のコストを宣言→相手デッキトップを公開→一致なら then（OP11ビッグ・マム系のコスト宣言）。
        case 'costGuess': {
          if (!G.players[o].deck.length) break;
          let guess;
          if (P.isCPU) guess = op.cpuGuess != null ? op.cpuGuess : 1; // CPUは控えめに固定宣言
          else { const opts = []; for (let cc = 0; cc <= 10; cc++) opts.push({ t: 'コスト' + cc, v: 'pick:' + cc }); const v = await showPrompt({ side, title: 'コストを宣言', text: '相手のデッキの上のコストを宣言（一致で効果発動）', opts }); guess = (typeof v === 'string' && v.indexOf('pick:') === 0) ? +v.slice(5) : 0; }
          const top = G.players[o].deck[0]; const tcst = top.base.cost || 0; flog(side, `コスト${guess}を宣言→相手デッキの上を公開: 「${top.base.name}」(コスト${tcst})`); render();
          if (tcst === guess) { flog(side, '宣言一致！'); await runFx(op.then, ctx); } else flog(side, '宣言は外れた');
          break;
        }
        // このターン、自分はキャラを登場できない（OP14-024錦えもん/OP14-020ミホークのランプ後）
        case 'setSummonBan': { if (op.minBaseCost != null) { P._noSummonMinCostTurn = G.turnSeq; P._noSummonMinCost = op.minBaseCost; flog(side, `このターン、元々コスト${op.minBaseCost}以上のキャラを登場できない`); } else { P._noSummonTurn = G.turnSeq; flog(side, 'このターン、キャラを登場できない'); } break; }
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
          if (op.cpuSkip && P.isCPU) break; // CPUは反射的に自壊しない任意コスト（confirmUse常true対策。ST22-002イゾウの相手アタック時等）
          if (!(await confirmUse(side, '自身をトラッシュ', `「${self.base.name}」をトラッシュに置いて効果を使いますか？`, '置いて使う', undefined, { cls: 'danger' }))) break;
          P.don.rested += self.attachedDon || 0;
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
          const actCnt = op.count != null ? op.count : 1; // ★count:0=「リーダーのみ」(incLeaderと併用)。旧 op.count||1 は0が1に丸められ余分なキャラ選択が発生していた
          for (let i = 0; i < actCnt; i++) {
            // ★allowActive: 既にアクティブのキャラも選べる（公式Q&A 830=OP10-099キッドL「すでにアクティブのキャラも、
            //   この効果で【ブロッカー】を得ることができます」。アクティブ化は空振り・付与だけ適用される）
            const cc = ownChars(side, opFilter(op)).filter(c => op.allowActive || c.rested);
            const t = P.isCPU
              ? (op.allowActive ? cc.slice().sort((a, b) => ((b.rested ? 1 : 0) - (a.rested ? 1 : 0)) || (power(b) - power(a)))[0] : cc[0]) // CPU: レスト優先→高パワー（アクティブ化の価値を捨てない）。従来カードはcc[0]のまま
              : await chooseCard(side, cc, 'アクティブにする自分のキャラを選択', 'ownBig', op.optional);
            if (!t) break;
            if (t.rested) { t.rested = false; flog(side, `「${t.base.name}」をアクティブにした`); }
            if (op.grantKw) { t.kwGrant.push({ kw: op.grantKw, dur: durTag(op.grantDuration, 'turn') }); flog(side, `「${t.base.name}」に【${kwJa(op.grantKw)}】`); } // アクティブ化＋キーワード付与（OP10-099キッドL＝ブロッカー）
          }
          render(); break;
        }
        // 元々のパワーを入れ替える（withLeader:リーダーと自キャラ1枚 ／ 既定:相手キャラ2枚。duration/battle対応）
        case 'swapPower': {
          const dur = op.battle ? 'battle' : durTag(op.duration, 'turnEnd');
          const swap = (a, b) => { if (!a || !b || a === b) return; const pa = a.base.power || 0, pb = b.base.power || 0; a.buffs.push({ setBase: pb, until: dur }); b.buffs.push({ setBase: pa, until: dur }); floatOn(a.uid, 'P' + pb, 'buff'); floatOn(b.uid, 'P' + pa, 'buff'); flog(side, '元々のパワーを入れ替えた'); };
          if (op.withLeader) {
            const c = P.isCPU ? P.chars.slice().sort((x, y) => power(y) - power(x))[0] : await chooseCard(side, P.chars, '元々のパワーをリーダーと入れ替えるキャラ', 'ownBig', op.optional);
            swap(P.leader, c);
          } else if (op.ownPair) { // 自分のキャラ2枚の元々のパワーを入れ替える（OP14-001ロー）
            const pool = P.chars.filter(c => matchFilter(c, opFilter(op)));
            const a = await chooseCard(side, pool, '元々のパワーを入れ替えるキャラ（1枚目）', 'ownBig', op.optional);
            if (a) { const b = await chooseCard(side, pool.filter(c => c !== a), '元々のパワーを入れ替えるキャラ（2枚目）', 'ownSmall', op.optional); swap(a, b); }
          } else {
            const a = await chooseCard(side, oppChars(side, opFilter(op)), '入れ替える相手キャラ（1枚目）', 'oppBig', op.optional);
            if (a) { const b = await chooseCard(side, oppChars(side, opFilter(op)).filter(c => c !== a), '入れ替える相手キャラ（2枚目）', 'ownSmall', op.optional); swap(a, b); }
          }
          render(); break;
        }
        // 盤面のキャラに一時的なコスト増減を付与（side:'opp'|'self', amount:±N, duration, filter）
        case 'addCostBuff': {
          const dur = durTag(op.duration, 'turnEnd');
          if (op.target === 'self') { if (self) { self.buffs.push({ costAmt: op.amount, until: dur }); floatOn(self.uid, `コスト${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount < 0 ? 'dmg' : 'buff'); render(); } break; } // このキャラ自身のコスト±（OP12-119くま=自身コスト+2で除去耐性）
          const isOpp = op.side !== 'self';
          if (op.all) { // 条件一致の対象すべてにコスト±（自分/相手）
            const cands = isOpp ? oppChars(side, opFilter(op)) : ownChars(side, opFilter(op));
            for (const t of cands) { t.buffs.push({ costAmt: op.amount, until: dur }); floatOn(t.uid, `コスト${op.amount > 0 ? '+' : ''}${op.amount}`, op.amount < 0 ? 'dmg' : 'buff'); }
            if (cands.length) flog(side, `対象すべてをコスト${op.amount > 0 ? '+' : ''}${op.amount}`); render(); break;
          }
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
          if (act === 'toHand' && P._noLifeToHandTurn === G.turnSeq) { flog(side, 'このターンは効果でライフを手札に加えられない'); ctx._declined = true; break; }
          if (!P.life.length) { ctx._declined = true; break; } // ライフが無ければ払えない＝不発
          const pick2 = op.pos === 'choose' && (act === 'toHand' || act === 'trash'); // 「ライフの上か下から1枚」＝上下を選べる（toHand/trash対応）
          // 「ライフの上か下から1枚を表/裏向きにできる」（ST36-005キッド）: pos:'choose' の時だけ上下から選び、
          // かつ「既にその向きのライフ」しか無ければコストを払えない＝不発（pos未指定の既存カードは従来どおりライフ上を固定で裏返す）。
          const flip2 = op.pos === 'choose' && (act === 'faceUp' || act === 'faceDown');
          // ★表裏コストの候補: pos:'choose'なら上下2枚・未指定なら上1枚固定。いずれも「今と逆向きのライフ」しか
          //   コストにできない（既に表向きのライフを「表向きにする」ことはできない＝候補0で不発。黄キッドL指摘と同系）。
          const flipPool = () => { const cand = (flip2 && P.life.length >= 2) ? [P.life[0], P.life[P.life.length - 1]] : [P.life[0]]; return cand.filter(l => l && (act === 'faceUp' ? !l._faceUp : !!l._faceUp)); };
          if ((act === 'faceUp' || act === 'faceDown') && !flipPool().length) { ctx._declined = true; break; }
          { const lbl = act === 'toHand' ? '手札に加え' : act === 'trash' ? 'トラッシュに置き' : act === 'faceUp' ? '表向きにし' : '裏向きにし'; const where = (pick2 || flip2) ? '上か下から1枚' : '上から1枚'; if (!(await confirmUse(side, 'ライフをコストに', `ライフの${where}を${lbl}て効果を使いますか？`, '使う', undefined, { cls: 'danger' }))) { ctx._declined = true; break; } }
          ctx._committed = true; // コスト支払い＝使用（【ターン1回】の onceゲート消費。辞退だけなら未消費のまま＝ST36-005キッド）
          if (act === 'toHand') {
            let fromBottom = false;
            if (pick2 && P.life.length >= 2 && !P.isCPU) fromBottom = (await showPrompt({ side, title: 'ライフを手札に', text: 'ライフの上か下、どちらの1枚を手札に加えますか？', opts: [{ t: 'ライフ上', v: 'top', primary: true }, { t: 'ライフ下', v: 'bot' }] })) === 'bot';
            P.hand.push(fromBottom ? P.life.pop() : P.life.shift()); flog(side, `ライフ${fromBottom ? '下' : '上'}1枚を手札に加えた`); fireSimpleReact(side, 'onLifeToHand'); await fireLifeLeft(side); // OP05-107スペーシー
          }
          else if (act === 'trash') { let fb = false; if (pick2 && P.life.length >= 2 && !P.isCPU) fb = (await showPrompt({ side, title: 'ライフをトラッシュ', text: 'ライフの上か下、どちらの1枚をトラッシュに置きますか？', opts: [{ t: 'ライフ上', v: 'top', primary: true }, { t: 'ライフ下', v: 'bottom' }] })) === 'bottom'; P.trash.push(fb ? P.life.pop() : P.life.shift()); flog(side, `ライフ${fb ? '下' : '上'}1枚をトラッシュ`); await fireLifeLeft(side); }
          else if (act === 'faceUp' || act === 'faceDown') {
            const pool = flipPool(); // 早期checkで非空を保証済み（pos未指定なら[ライフ上]・向き違いは候補に入らない）
            let t = pool[0];
            if (flip2 && pool.length >= 2 && !P.isCPU) t = (await showPrompt({ side, title: act === 'faceUp' ? 'ライフを表向きに' : 'ライフを裏向きに', text: `ライフの上か下、どちらの1枚を${act === 'faceUp' ? '表' : '裏'}向きにしますか？`, opts: [{ t: 'ライフ上', v: 'top', primary: true }, { t: 'ライフ下', v: 'bot' }] })) === 'bot' ? pool[1] : pool[0];
            if (t) { t._faceUp = (act === 'faceUp'); flog(side, `ライフ${t === P.life[0] ? '上' : '下'}1枚を${act === 'faceUp' ? '表' : '裏'}向きにした`); }
          }
          render();
          await runFx(op.then, ctx);
          break;
        }
        // 自分のキャラ1枚（filter一致）を持ち主のデッキの下に置くコスト。任意。then実行
        case 'deckBottomOwnCharCost': {
          const cands = ownChars(side, opFilter(op));
          if (!cands.length) break;
          if (!(await confirmUse(side, '自キャラをデッキ下', '自分のキャラ1枚をデッキの下に置いて効果を使いますか？', '置いて使う', undefined, { cls: 'danger' }))) break;
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
          const movable = P.trash.filter(c => c !== self && (!op.filter || matchFilter(c, op.filter))); // self除く＋filter（OP11-095ガープ=海軍3枚）
          if (movable.length < n) break;
          if (!(await confirmUse(side, 'トラッシュをデッキ下', `トラッシュ${n}枚をデッキの下に置いて効果を使いますか？`, '置いて使う'))) break;
          for (let i = 0; i < n; i++) { const c = P.trash.find(x => x !== self && (!op.filter || matchFilter(x, op.filter))); if (!c) break; P.trash.splice(P.trash.indexOf(c), 1); P.deck.push(reset(c)); } flog(side, `トラッシュ${n}枚をデッキの下へ`);
          await runFx(op.then, ctx); break;
        }
        // 「以下から1つを選ぶ」モード選択（options:[{label,fx:[...]}]）
        case 'chooseOption': {
          const opts = op.options || []; if (!opts.length) break;
          let idx = 0;
          const chP = op.chooser === 'opp' ? G.players[o] : P; // chooser:'opp'=「相手は以下から1つを選ぶ」（ST20-005リンリン）。CPUは先頭選択（近似）
          if (!chP.isCPU) { const v = await showPrompt({ side: op.chooser === 'opp' ? o : side, title: '効果を選択', text: (op.chooser === 'opp' ? '相手の効果: ' : '') + '以下から1つを選ぶ', opts: opts.map((o, i) => ({ t: o.label || ('選択' + (i + 1)), v: 'opt:'+ i })) }); idx = (typeof v === 'string' && v.indexOf('opt:') === 0) ? +v.slice(4) : 0; }
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
            if (!O.isCPU) ret = (await showPrompt({ side: o, title: 'ドンを戻す？', text: `アクティブのドン!!${n}枚をドンデッキに戻しますか？（戻さないと効果を受けます）`, opts: [{ t: `戻す（ドン-${n}）`, v: 'y', primary: true }, { t: '戻さない', v: 'n', ghost: true }] })) === 'y';
            if (ret) { O.don.active -= n; flog(o, `ドン!!-${n}（ドンデッキへ戻した）`); returned = true; render(); }
          }
          if (!returned) await runFx(op.elseFx, ctx);
          break;
        }
        // 自分か相手のライフの上から1枚までを見て、ライフの上か下に置く（ST07-016/ST20-003）。CPUは自分のライフを見て上に戻す
        case 'peekLifeTopPlace': {
          let tgtSide = op.target === 'opp' ? o : op.target === 'self' ? side : null;
          if (tgtSide == null) { // 「自分か相手の」＝使用者が選ぶ
            if (P.isCPU) tgtSide = side;
            else { const v = await showPrompt({ side, title: 'ライフを見る', text: 'どちらのライフの上から1枚を見ますか？', opts: [{ t: '自分のライフ', v: 'self', primary: true }, { t: '相手のライフ', v: 'opp' }, { t: '見ない', v: 'no', ghost: true }] }); if (v === 'no') break; tgtSide = v === 'opp' ? o : side; }
          }
          const L = G.players[tgtSide].life; if (!L.length) break;
          const c = L[0];
          let toBottom = false;
          if (!P.isCPU) toBottom = (await showPrompt({ side, title: 'ライフ確認', text: `${tgtSide === side ? '自分' : '相手'}のライフの一番上のカードです。上に戻すか下に置くか選んでください。`, reveal: { no: c.no, name: c.base.name }, opts: [{ t: '上に戻す', v: 'top', primary: true }, { t: '下に置く', v: 'bottom' }] })) === 'bottom';
          if (toBottom) { L.shift(); L.push(c); }
          flog(side, `${tgtSide === side ? '自分' : '相手'}のライフ上1枚を見て${toBottom ? '下' : '上'}に置いた`);
          render(); break;
        }
        // 相手は自身のライフの上から1枚をトラッシュに置いてもよい。置かなかった場合 elseFx を解決（OP05-099アマゾン）
        case 'oppMayTrashLife': {
          const O = G.players[o]; let paid = false;
          if (O.life.length) {
            let pay;
            if (O.isCPU) pay = O.life.length >= 3; // CPU: ライフに余裕があれば払ってデバフ回避、切迫時は効果を受ける
            else pay = (await showPrompt({ side: o, title: 'ライフを払う？', text: 'ライフの上から1枚をトラッシュに置きますか？（置かないと相手の効果を受けます）', opts: [{ t: 'トラッシュに置く', v: 'y', primary: true }, { t: '置かない', v: 'n', ghost: true }] })) === 'y';
            if (pay) { const c = O.life.shift(); O.trash.push(c); flog(o, '自ライフ1枚をトラッシュ'); paid = true; await fireLifeLeft(o); render(); }
          }
          if (!paid) await runFx(op.elseFx, ctx);
          break;
        }
        // 相手キャラ1枚を選び、そのコスト＝付与ドン枚数 が一致する場合のみKO
        case 'selectKoIfCostEqualsDon': {
          const cands = oppChars(side, opFilter(op)).filter(c => !isKoImmune(c));
          const t = P.isCPU ? (cands.find(c => (c.base.cost || 0) === (c.attachedDon || 0)) || cands[0]) : await chooseCard(side, cands, '対象の相手キャラを選択', 'oppBig', op.optional !== false);
          if (!t) break;
          if ((t.base.cost || 0) === (t.attachedDon || 0)) { if (!(await protectFromEffect(t, 'ko', self))) await koCard(t, 'oppEffect'); }
          else flog(side, `「${t.base.name}」はコストと付与ドン数が一致せずKOされない`);
          break;
        }
        // 相手のトラッシュから filter一致のカードを n枚 デッキの下へ
        case 'oppTrashToBottom': { // 公式「相手は自身のトラッシュから〜枚をデッキ下に置く」＝相手が選ぶ（OP11-072モンドール/091ベリーグッド・filterで種別限定）
          // chooser:'self'＝「(自分が)相手のトラッシュのカードN枚までを、持ち主のデッキの下に置く」型（OP15-091マルガリータ）。選択者は効果の使用者・optionalで見送り可
          const O = G.players[o]; let moved = 0;
          const chSide = op.chooser === 'self' ? side : o, CH = G.players[chSide];
          for (let i = 0; i < (op.n || 1); i++) { const cands = O.trash.filter(c => matchFilter(c, op.filter || {})); if (!cands.length) break; const t = CH.isCPU ? cands[0] : await chooseCard(chSide, cands, op.chooser === 'self' ? 'デッキ下に置く相手のトラッシュを選択' : 'デッキ下に置くトラッシュを選択', op.chooser === 'self' ? 'oppSmall' : 'ownSmall', !!op.optional); if (!t) break; O.trash.splice(O.trash.indexOf(t), 1); O.deck.push(reset(t)); moved++; }
          if (moved) flog(side, op.chooser === 'self' ? `相手のトラッシュ${moved}枚を持ち主のデッキの下へ` : `相手はトラッシュ${moved}枚をデッキの下へ`); render(); break;
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
          if (op.all) { for (const t of oppChars(side, opFilter(op))) t.noBlockSeq = G.turnSeq; flog(side, '相手の対象キャラは【ブロッカー】発動不可'); render(); break; } // 条件一致の相手キャラ全て（OP11-013グルス）
          for (let i = 0; i < (op.count || 1); i++) { const cands = oppChars(side, opFilter(op)).filter(c => c.noBlockSeq !== G.turnSeq); const t = P.isCPU ? cands[0] : await chooseCard(side, cands, '【ブロッカー】発動不可にする相手キャラ', 'oppBig', op.optional); if (!t) break; t.noBlockSeq = G.turnSeq; flog(side, `「${t.base.name}」は【ブロッカー】発動不可`); }
          render(); break;
        }
        // 相手キャラ count枚を「レストにできない」状態にする（アタック/ブロック不可・レスト効果対象外）
        case 'restImmune': {
          const until = durSeq(op.duration);
          for (let i = 0; i < (op.count || 1); i++) {
            const cands = oppChars(side, opFilter(op)).filter(c => !isRestImmune(c));
            const t = P.isCPU ? cands[0] : await chooseCard(side, cands, 'レストにできない状態にする相手キャラ', 'oppBig', op.optional);
            if (!t) break; t.restImmuneUntil = until; flog(side, `「${t.base.name}」はレストにできない`); floatOn(t.uid, 'レスト不可', 'dmg'); animClass(t.uid, 'hit');
          }
          render(); break;
        }
        // 相手キャラ count枚をアタック不可にする（duration:'untilNextEnd'で次の相手ターン終了まで）
        case 'setAttackBan': {
          if (op.leaderOnly) { const L = G.players[o].leader; if (L && (!op.restedOnly || L.rested) && L.noAtkSeq == null) { L.noAtkSeq = durSeq(op.duration); flog(side, '相手リーダーはアタック不可'); } render(); break; } // 相手リーダーのアタック禁止（OP06-023アーロン＝レストのリーダー）
          for (let i = 0; i < (op.count || 1); i++) { let cands = oppChars(side, opFilter(op)).filter(c => c.noAtkSeq == null); if (op.includeLeader && G.players[o].leader.noAtkSeq == null && (!op.leaderRestedOnly || G.players[o].leader.rested)) cands = [G.players[o].leader, ...cands]; const t = P.isCPU ? cands[0] : await chooseCard(side, cands, 'アタック不可にする相手キャラ', 'oppBig', op.optional); if (!t) break; t.noAtkSeq = durSeq(op.duration); flog(side, `「${t.base.type === 'LEADER' ? '相手リーダー' : t.base.name}」はアタック不可`); floatOn(t.uid, 'アタック不可', 'dmg'); animClass(t.uid, 'hit');}
          render(); break;
        }
        // 攻撃税（OP08-043ニューゲート）: 相手のキャラすべてに「アタック時に手札N枚を捨てなければアタック不可」を付与。declareAttack冒頭で判定。
        case 'attackTax': { const n = op.n || 2; const until = durSeq(op.duration || 'untilNextEnd'); for (const c of oppChars(side, {})) { c._atkTaxSeq = until; c._atkTaxN = n; } flog(side, `相手のキャラは次の相手ターン、手札${n}枚を捨てなければアタックできない`); render(); break; }
        // 自分のキャラ1枚（filter一致）を手札に戻すコスト。任意。払えた時 then を実行
        case 'bounceOwnCharCost': {
          let cands = ownChars(side, opFilter(op));
          if (op.excludeSelf) cands = cands.filter(c => c !== self); // 「このキャラ以外」
          if (!cands.length) break;
          if (!(await confirmUse(side, '自キャラを手札へ', '自分のキャラ1枚を手札に戻して効果を使いますか？', '戻して使う'))) break;
          const t = P.isCPU ? cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0] : await chooseCard(side, cands, '手札に戻すキャラを選択（コスト）', 'ownSmall', true);
          if (!t) break; bounceCard(t); flog(side, `「${t.base.name}」を手札に戻した`); await checkAllyLeave(t.owner, t, 'ownEffect');
          ctx._costCard = t; // 後続opが「戻したキャラ」を参照（EB01-020シャンブルズ=異なる色）
          await runFx(op.then, ctx); break;
        }
        // 自分のリーダー/ステージ/キャラ（filter一致）1枚をレストにするコスト。任意。払えた時 then を実行
        case 'restOwnAsCost': {
          const cnt = op.count || 1; // count枚をレストにできる（足りなければ不発）
          if ([P.leader, P.stage, ...P.chars].filter(c => c && !c.rested && !isRestImmune(c) && matchFilter(c, opFilter(op))).length < cnt) break; // 「レストにできない」はコスト支払いにも使えない
          if (!(await confirmUse(side, 'レストにする', `カード${cnt}枚をレストにして効果を使いますか？`, 'レストして使う'))) break;
          const rested = [];
          for (let i = 0; i < cnt; i++) { const pool = [P.leader, P.stage, ...P.chars].filter(c => c && !c.rested && !isRestImmune(c) && !rested.includes(c) && matchFilter(c, opFilter(op))); const t = P.isCPU ? cpuRestCostPick(side, pool) : await chooseCard(side, pool, `レストにするカードを選択（コスト ${i + 1}/${cnt}）`, 'ownBig', false); if (!t) break; t.rested = true; await fireSelfRested(t, 'ownEffect'); rested.push(t); } // ★E53: CPUの選択は cpuRestCostPick（従来pool[0]=リーダー固定）
          if (rested.length < cnt) break; flog(side, `カード${cnt}枚をレストにした`);
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
        case 'oppDiscard': { const O = G.players[o]; const k = Math.min(op.n || 1, O.hand.length); for (let i = 0; i < k; i++) { let c; if (O.isCPU) c = O.hand.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0))[0]; else c = await chooseFromHand(o, O.hand.slice(), `捨てる手札（${i + 1}/${k}）`); if (!c) break; O.hand.splice(O.hand.indexOf(c), 1); O.trash.push(reset(c)); } if (k) { flog(side, `相手は手札${k}枚を捨てた`); await fireHandDiscarded(o, k, ctx.self); } render(); break; }
        // 自分のトラッシュから filter一致のカードを count枚 手札に加える
        case 'trashToHand': { for (let i = 0; i < (op.count || 1); i++) { const cands = P.trash.filter(c => matchFilter(c, op.filter || {})); if (!cands.length) break; const t = P.isCPU ? (((G._linePickR || G._linePick) || []).map(no => cands.find(c => c.base.no === no)).find(Boolean) || cands[0]) : await chooseCard(side, cands, 'トラッシュから手札に加えるカード', 'ownBig', op.optional); if (!t) break; P.trash.splice(P.trash.indexOf(t), 1); P.hand.push(t); flog(side, `「${t.base.name}」を手札に加えた`); } render(); break; } // E49: _linePick=ライン実行中の回収対象steering
        // 自分のデッキの上 n枚をトラッシュに置く（ミル）
        case 'deckToTrash': { if (op.optional && !(await confirmUse(side, 'デッキをトラッシュ', `デッキの上から${op.n || 1}枚をトラッシュに置きますか？`, '置く', '置かない'))) { ctx._declined = true; break; } const k = Math.min(op.n || 1, P.deck.length); for (let i = 0; i < k; i++) P.trash.push(reset(P.deck.shift())); if (k) flog(side, `デッキ上${k}枚をトラッシュ`); if (k >= (op.n || 1) && op.then) await runFx(op.then, ctx); render(); break; } // ★then=コスト完済時のみ実行（OP12-090。デッキ不足で全額払えなければ効果なし）
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
          if (c) { P.hand.splice(P.hand.indexOf(c), 1); cardReveal(side, c.base.no, c.base.name, 'イベント発動', 'event'); await runFx(c.base.fx.main.fx, { self: c, side }); P.trash.push(reset(c)); flog(side, `「${c.base.name}」を発動`); await luffyReveal(side); }
          break;
        }
        case 'playCharFromHand': {
          const cnt = op.count || 1; const usedNames = [];
          const costCard = ctx._costCard; // diffColorFrom:'costCard'=コストで戻したキャラと異なる色のみ（EB01-020）
          for (let k = 0; k < cnt; k++) {
            let cands = P.hand.filter(c => c.base.type === 'CHAR' && matchFilter(c, opFilter(op))); // ★opFilter=filterとトップレベル条件の併記を両方適用（旧: filter存在時にmaxCost等が無視される系統バグ）
            if (op.diffColorFrom === 'costCard' && costCard) cands = cands.filter(c => !(c.base.color || []).some(col => (costCard.base.color || []).includes(col))); // 戻したキャラと異なる色
            if (op.needsTrigger) cands = cands.filter(c => c.base.triggerText || (c.base.fx && c.base.fx.trigger));
            if (op.distinctName) cands = cands.filter(c => !usedNames.includes(normName(c.base.name))); // 「カード名の異なる」
            const c = await chooseFromHand(side, cands, cnt > 1 ? `登場させるキャラを選択（${k + 1}/${cnt}・任意）` : '登場させるキャラを選択（任意）', null, op.optional || cnt > 1);
            if (!c) break; usedNames.push(normName(c.base.name)); P.hand.splice(P.hand.indexOf(c), 1); await summon(side, c, false); if (op.rested && P.chars.includes(c)) c.rested = true; // レストで登場（OP13-023/031）
          }
          break;
        }
        case 'playSpecificFromHand': {
          let cands;
          if (op.nameIncludes) cands = P.hand.filter(x => x.base.name.includes(op.nameIncludes));
          else if (op.name) cands = P.hand.filter(x => x.base.name === op.name);
          else cands = P.hand.slice();
          if (op.filter) cands = cands.filter(x => matchFilter(x, op.filter)); // 追加の絞り込み（コスト等。OP10-026/027錦えもん=コスト6）
          const c = op.choose ? await chooseFromHand(side, cands, '登場させるキャラを選択' + (op.optional ? '（任意）' : ''), null, op.optional) : cands[0];
          if (c) { P.hand.splice(P.hand.indexOf(c), 1); if (c.base.type === 'STAGE') { if (P.stage) P.trash.push(reset(P.stage)); P.stage = c; c.owner = side; c.rested = false; flog(side, `ステージ「${c.base.name}」が登場`); if (c.base.fx && c.base.fx.onPlay && !isNegated(c)) await runFx(c.base.fx.onPlay, { self: c, side }); render(); } else { await summon(side, c, op.noEnter); if (op.rested && P.chars.includes(c)) c.rested = true; } } // STAGEはステージエリアへ（OP08-110/115）／rested=レストで登場（OP07-025コリブー）
          break;
        }
        // 両者の場のキャラすべてを、このキャラ以外KOする（OP08-119カイドウ＆リンリン）
        case 'koAllExceptSelf': { for (const sd of ['me', 'cpu']) { const PP = G.players[sd]; for (const t of PP.chars.slice()) { if (t === self) continue; if (sd === o && (isKoImmune(t) || await protectFromEffect(t, 'ko', self))) continue; await koCard(t, sd === side ? 'ownEffect' : 'oppEffect'); } } break; }
        case 'trashToLife': {
          const cands = P.trash.filter(c => (op.anyCard ? true : c.base.type === 'CHAR') && (c.base.cost || 0) <= (op.maxCost != null ? op.maxCost : 99) && (!op.trait || (c.base.traits || []).includes(op.trait))); // ★anyCard=「カード1枚まで」型はイベント/ステージも可（OP16-108。OP14-104は公式が「キャラカード」なのでCHAR限定のまま）
          const c = await chooseCard(side, cands, op.anyCard ? 'トラッシュからライフ上に置くカードを選択' : 'トラッシュからライフ上に置くキャラを選択', 'ownBig', op.optional);
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
          if (op.needsTrigger) cands = cands.filter(c => c.base.triggerText || (c.base.fx && c.base.fx.trigger)); // 【トリガー】を持つキャラ限定（正本=triggerText。fx未実装の印刷トリガーも対象）
          const c = await chooseCard(side, cands, 'トラッシュから登場させるキャラ', 'ownBig', true);
          if (c) { P.trash.splice(P.trash.indexOf(c), 1); await summon(side, c, false, 'trash'); if (op.rested && P.chars.includes(c)) c.rested = true; if (op.grantKw && P.chars.includes(c)) c.kwGrant.push({ kw: op.grantKw, dur: durTag(op.grantDuration, 'turn') }); if (op.returnEndTurn && P.chars.includes(c)) (G._pendingTurnEnd = G._pendingTurnEnd || []).push({ side, self: c, fx: [{ op: '_returnCardBottom', uid: c.uid }] }); } // rested=レストで登場（OP10-090フランキー）／returnEndTurn=このターン終了時に持ち主のデッキ下（OP11-092ヘルメッポ）
          break;
        }
        case '_returnCardBottom': { for (const sd of ['me', 'cpu']) { const PP = G.players[sd]; const c = PP.chars.find(x => x.uid === op.uid); if (c) { removeChar(c); G.players[c.owner].deck.push(reset(c)); flog(side, `「${c.base.name}」を持ち主のデッキの下に置いた`); render(); break; } } break; } // 指定uidのキャラをデッキ下（ヘルメッポのターン終了時返却）
        // 自分のライフをすべて見て好きな順に並べ替え（OP13-105モモの助）。人間は上から順にプロンプトで選択、CPUは現状維持。
        case 'reorderLife': {
          const RP = op.side === 'opp' ? G.players[o] : P; const who = op.side === 'opp' ? '相手' : '自分';
          if (op.oneToDeckTop && RP.life.length) { // 「1枚を自分のデッキの上に置き」（ST13-004/016）
            let pickT;
            if (P.isCPU) pickT = RP.life[0];
            else { const v = await showPrompt({ side, title: 'ライフ確認', text: 'デッキの上に置くカードを選択', opts: RP.life.map((c, i) => ({ t: c.base.name, v: 'pick:' + i })) }); const idx = (typeof v === 'string' && v.indexOf('pick:') === 0) ? +v.slice(5) : 0; pickT = RP.life[idx]; }
            RP.life.splice(RP.life.indexOf(pickT), 1); RP.deck.unshift(pickT); flog(side, 'ライフから1枚をデッキの上に置いた'); await fireLifeLeft(op.side === 'opp' ? o : side);
          } // side:'opp'=相手のライフを見て並べ替え（EB01-052ヴィオラ）。並べ替えの選択者は効果の使用者
          if (RP.life.length <= 1) { if (RP.life.length) flog(side, who + 'のライフを確認'); break; }
          if (P.isCPU) { flog(side, `${who}のライフ${RP.life.length}枚を確認した`); break; }
          const remaining = RP.life.slice(); const ordered = [];
          while (remaining.length > 1) {
            const opts = remaining.map((c, i) => ({ t: '上から' + (ordered.length + 1) + '番目: ' + c.base.name, v: 'pick:' + i }));
            const v = await showPrompt({ side, title: 'ライフの並べ替え', text: who + 'のライフを確認。上から' + (ordered.length + 1) + '番目に置くカードを選択', opts });
            const idx = (typeof v === 'string' && v.indexOf('pick:') === 0) ? +v.slice(5) : 0;
            ordered.push(remaining[idx]); remaining.splice(idx, 1);
          }
          ordered.push(remaining[0]); RP.life = ordered; flog(side, who + 'のライフを並べ替えた'); render();
          break;
        }
        // トラッシュから filter一致のステージ1枚を登場（OP13-092ミョスガルド）
        case 'reviveStage': {
          const cands = P.trash.filter(c => c.base.type === 'STAGE' && matchFilter(c, op.filter || {}));
          const c = P.isCPU ? cands[0] : await chooseCard(side, cands, 'トラッシュから登場させるステージ', 'ownBig', op.optional !== false);
          if (c) { P.trash.splice(P.trash.indexOf(c), 1); if (P.stage) P.trash.push(reset(P.stage)); P.stage = c; c.owner = side; c.rested = false; flog(side, `ステージ「${c.base.name}」をトラッシュから登場`); if (c.base.fx && c.base.fx.onPlay) await runFx(c.base.fx.onPlay, { self: c, side }); render(); }
          break;
        }
        // 自分のキャラすべてをトラッシュ→トラッシュから filter一致(カード名の異なる)キャラを最大count体登場（OP13-082五老星）
        // トラッシュから（盤面を消さず）異名のキャラを最大N体登場（OP06-062ジャッジ）。restedで全てレスト登場。
        case 'multiReviveFromTrash': {
          const n = op.count || 4, used = [];
          for (let i = 0; i < n; i++) { const cands = P.trash.filter(c => c.base.type === 'CHAR' && matchFilter(c, op.filter || {}) && !used.includes(normName(c.base.name))); const c = P.isCPU ? cands.slice().sort((a, b) => (b.base.power || 0) - (a.base.power || 0))[0] : await chooseCard(side, cands, `トラッシュから登場（${i + 1}/${n}・任意）`, 'ownBig', true); if (!c) break; used.push(normName(c.base.name)); P.trash.splice(P.trash.indexOf(c), 1); await summon(side, c, false, 'trash'); if (op.rested && P.chars.includes(c)) c.rested = true; }
          render(); break;
        }
        case 'massReviveFromTrash': {
          for (const c of P.chars.slice()) removeCharTo(c, P.trash);
          const n = op.count || 5, used = [];
          for (let i = 0; i < n; i++) { const cands = P.trash.filter(c => c.base.type === 'CHAR' && matchFilter(c, op.filter || {}) && !used.includes(normName(c.base.name))); const c = P.isCPU ? cands[0] : await chooseCard(side, cands, `トラッシュから登場（${i + 1}/${n}）`, 'ownBig', true); if (!c) break; used.push(normName(c.base.name)); P.trash.splice(P.trash.indexOf(c), 1); await summon(side, c, false, 'trash'); }
          break;
        }
        case 'denyBlockerVsLeader': P.denyBlock = true; flog(side, '相手はリーダーへのアタックをブロック不可'); break;
        case 'oppDamage': { for (let i = 0; i < op.n; i++) await dealLeaderDamage(o, { base: {} }, 1, false); break; }
        case 'condBuff': case 'grantUnblockable': case 'unblockableAttack': break; // staticで処理
        default: break;
      }
      return true;
    }
    function kwJa(k) { return { blocker: 'ブロッカー', rush: '速攻', doubleAttack: 'ダブルアタック', unblockable: 'ブロック不可', banish: 'バニッシュ', rushChar: '速攻：キャラ', attackActive: 'アクティブにもアタック可' }[k] || k; }
    function reset(c) { c.attachedDon = 0; c.rested = false; c.buffs = []; c.kwGrant = []; c.frozen = false; c.negSeq = null; c.noAtkSeq = null; c._faceUp = false; return c; }
    function faceDown(c) { if (c) c._faceUp = false; return c; } // 手札→ライフへ戻す時は裏向きに（表向きフラグ残留を防ぐ）

    /* ノラ/レオ系: 自分の元々パワー7000以下のキャラが相手効果で場を離れる時、代わりのコストで防ぐ（自動） */
    async function protectFromEffect(target, cause, source) {
      if (!target) return false;
      // 「相手の効果ではKOされない」自身の常在: 効果KOのみ無効化（選択・パワー減少等は通すのでバックストップ）
      if (cause === 'ko' && isKoImmune(target)) { flog(target.owner, `「${target.base.name}」は相手の効果ではKOされない`); return true; }
      // 一時的な「自分の元々パワーN以下のキャラは相手の効果でKOされない」（OP10-070トレーボル＝次相手ターン終了まで）
      if (cause === 'ko') { const wk = G.players[target.owner] && G.players[target.owner]._weakKoImmune; if (wk && G.turnSeq <= wk.until && (target.base.power || 0) <= wk.maxBasePower) { flog(target.owner, `「${target.base.name}」は元々パワー${wk.maxBasePower}以下なので相手の効果でKOされない`); return true; } }
      if (cause === 'ko') { const tk = G.players[target.owner] && G.players[target.owner]._traitKoImmune; if (tk && G.turnSeq <= tk.until && matchFilter(target, tk.filter)) { flog(target.owner, `「${target.base.name}」は効果でKOされない`); return true; } } // 一時的なfilter一致KO耐性（OP09-033ロビン）
      // 自分の他キャラが提供する「アクティブの時、filter一致の味方は効果でKOされない」常在（OP08-029ペコムズ）
      if (cause === 'ko') { const ow = G.players[target.owner]; for (const src of ow.chars) { if (src === target || isNegated(src)) continue; const st = src.base.fx && src.base.fx.static; if (!st) continue; for (const ob of st) { if (ob.op === 'allyKoImmune' && (!ob.whenActive || !src.rested) && (!ob.cond || checkCond(ob.cond, target.owner, src)) && lightMatch(target, ob.filter)) { flog(target.owner, `「${target.base.name}」は効果でKOされない`); return true; } } } }
      // 「このキャラはバトルでKOされない」常在（condBuff battleImmune・cond対応。OP10-104カリブー）
      if (cause === 'battle' && !isNegated(target)) { const st = target.base.fx && target.base.fx.static; if (st) for (const o of st) { if (o.op === 'condBuff' && o.battleImmune && (!o.vsLeaderOnly || (source && source.base && source.base.type === 'LEADER')) && (!o.cond || checkCond(o.cond, target.owner, target))) { flog(target.owner, `「${target.base.name}」はバトルではKOされない`); return true; } } }
      // 「属性Xを持つ/持たないカードとのバトルでKOされない」常在（source=アタッカー。P-052ミホーク=斬を持つ/P-025スモーカー=特を持たない 等。cond対応＝ドン×1）
      if (cause === 'battle' && source && source.base && !isNegated(target)) { const st = target.base.fx && target.base.fx.static; if (st) for (const o of st) { if (o.op === 'battleImmuneVsAttr' && (!o.vsCharOnly || source.base.type === 'CHAR') && (!o.cond || checkCond(o.cond, target.owner, target))) { const has = (source.base.attribute || '').includes(o.attr); if (o.has ? has : !has) { flog(target.owner, `「${target.base.name}」は属性${o.attr}を${o.has ? '持つ' : '持たない'}カードとのバトルではKOされない`); return true; } } } }
      if (cause === 'battle' && target._battleImmuneUntil != null && G.turnSeq <= target._battleImmuneUntil) { flog(target.owner, `「${target.base.name}」はバトルではKOされない`); return true; } // 一時的なバトルKO耐性（OP06-030ドスン）
      if (cause === 'battle') { const bg = G.players[target.owner] && G.players[target.owner]._battleImmuneGrant; if (bg && G.turnSeq <= bg.until && matchFilter(target, bg.filter)) { flog(target.owner, `「${target.base.name}」はバトルではKOされない`); return true; } } // プレイヤー付与の一時バトルKO耐性（OP06-096）
      // 「相手の元々パワーN以下のキャラの効果でKOされない」(OP14-003ベッジ。source=KO元のキャラ)
      if (cause === 'ko' && source && source.base && !isNegated(target)) {
        const st = target.base.fx && target.base.fx.static;
        if (st && st.some(o => o.op === 'koImmuneFromWeakSource' && (source.base.power || 0) <= (o.maxBasePower || 0))) { flog(target.owner, `「${target.base.name}」は元々パワーの低いキャラの効果ではKOされない`); return true; }
        // 「属性Xを持たないキャラの効果でKOされない」(OP11-005スモーカー。cond対応＝ドン×1等)
        if (st) for (const o of st) { if (o.op === 'koImmuneFromSourceAttr' && (!o.cond || checkCond(o.cond, target.owner, target)) && !((source.base.attribute || '').includes(o.lacksAttr))) { flog(target.owner, `「${target.base.name}」は属性${o.lacksAttr}を持たないキャラの効果ではKOされない`); return true; } }
      }
      // 「相手のキャラすべては、自分の効果で場を離れない」(OP14-079クロコダイル)。除去しようとする側(=opp(target.owner))の盤面に oppLeaveImmuneFromSelf があれば効果除去を無効化＝自分の効果で相手を場から離せない自己制約。
      if (cause === 'ko' || cause === 'bounce' || cause === 'deckBottom' || cause === 'trash') {
        const remover = G.players[opp(target.owner)];
        if (remover && [remover.leader, ...remover.chars].some(p => p && !isNegated(p) && p.base.fx && p.base.fx.static && p.base.fx.static.some(o => o.op === 'oppLeaveImmuneFromSelf'))) { flog(target.owner, `「${target.base.name}」は相手の効果で場を離れない`); return true; }
      }
      // 「相手の効果で場を離れない」自身の常在(condBuff immune): バウンス/デッキ送り/トラッシュ置きも無効化（選択・無効化・パワー減少は通す）
      if ((cause === 'bounce' || cause === 'deckBottom' || cause === 'trash') && isLeaveImmune(target)) { flog(target.owner, `「${target.base.name}」は相手の効果で場を離れない`); return true; }
      const ow = G.players[target.owner];
      for (const p of [ow.leader, ...ow.chars]) { // リーダー提供の身代わりも拾う
        if (!p || isNegated(p)) continue; // 効果無効中のキャラは身代わり保護を提供しない
        const st = p.base.fx && p.base.fx.static; if (!st) continue;
        const prot = st.find(o => o.op === 'leaveProtect'); if (!prot) continue;
        if (prot.cond && !checkCond(prot.cond, p.owner, p)) continue; // 発動条件（リーダー特徴等。OP07-042モリア＝王下七武海リーダー）
        if (prot.when === 'oppTurn' && G.active === p.owner) continue; // 相手のターン中のみ（OP05-030ロシナンテ）
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
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `ライフ上1枚を手札に加えて「${target.base.name}」を守りますか？`, '守る（ライフ→手札）', '守らない', { noSrc: true }))) continue;
          ow.hand.push(ow.life.shift()); flog(target.owner, `【${p.base.name}】ライフ上1枚を手札に加えて「${target.base.name}」を守った`); await fireLifeLeft(target.owner); return true;
        }
        if (prot.pay === 'leaderPowerMinus') { // 自分のリーダーをパワー-Nして肩代わり
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のリーダーをパワー-${prot.amount || 2000}にして「${target.base.name}」を守りますか？`, `守る（リーダー-${prot.amount || 2000}）`, '守らない', { noSrc: true }))) continue;
          addBuff(ow.leader, -(prot.amount || 2000), 'turnEnd'); floatOn(ow.leader.uid, `-${prot.amount || 2000}`, 'dmg');
          flog(target.owner, `【${p.base.name}】リーダーのパワーを下げて「${target.base.name}」を守った`); return true;
        }
        if (prot.pay === 'toLifeFaceDown') { // 代わりに target を持ち主のライフの上に裏向きで加える（OP11-101カポネ・ベッジ＝超新星を守る）。p自身は対象外
          if (p === target) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${target.base.name}」をライフの上に裏向きで加えますか？`, '加える（ライフ裏向き）', '加えない', { noSrc: true }))) continue;
          if (ow.chars.includes(target)) removeChar(target); else continue;
          ow.life.unshift(faceDown(reset(target))); flog(target.owner, `【${p.base.name}】「${target.base.name}」をライフの上に裏向きで加えた`); render(); return true;
        }
        if (prot.pay === 'restOwnCards') {
          const n = prot.n || 2; const pool = [ow.leader, ...ow.chars].filter(c => c && c !== target && !c.rested && !isRestImmune(c) && !(prot.excludeLeader && c === ow.leader) && (!prot.filter || matchFilter(c, prot.filter))); // excludeLeader=「自分のキャラ」限定（リーダー除外。OP14-034）。filter=レスト対象の限定（OP11-110フカボシ＝魚人島/しらほし）
          if (pool.length < n) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のカード${n}枚をレストにして「${target.base.name}」を守りますか？`, `守る（${n}枚レスト）`, '守らない', { noSrc: true }))) continue;
          let picks;
          if (ow.isCPU) picks = pool.slice().sort((a, b) => power(a) - power(b)).slice(0, n);
          else { picks = []; for (let i = 0; i < n; i++) { const pk = await chooseCard(target.owner, pool.filter(c => !picks.includes(c)), `レストにするカード（${i + 1}/${n}）`, 'ownSmall', false); if (!pk) break; picks.push(pk); } if (picks.length < n) continue; }
          for (const c of picks) { c.rested = true; await fireSelfRested(c, 'ownEffect'); }
          flog(target.owner, `【${p.base.name}】カード${n}枚をレストにして「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'restSelf') {
          // 代わりにこのキャラ(p=身代わり元)をレストにして target を場に残す（OP12-027コウシロウ）。p===target/既にレストなら不可
          if (p === target || p.rested) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${p.base.name}」をレストにして「${target.base.name}」を場に残しますか？`, '残す（このキャラをレスト）', '残さない', { noSrc: true }))) continue;
          p.rested = true; await fireSelfRested(p, 'ownEffect'); flog(target.owner, `【${p.base.name}】自身をレストにして「${target.base.name}」を場に残した`); render(); return true;
        } else if (prot.pay === 'free') {
          // コスト無しで場を離れない（OP10-118ルフィ＝ターン1回相手の効果でKOされない。once:'turn'は上のゲートで消化済）
          flog(target.owner, `「${target.base.name}」は相手の効果で離れない`); return true;
        } else if (prot.pay === 'deckBottomOther') {
          // 代わりに（このキャラ以外の）自分のキャラ1枚を持ち主のデッキ下に置いて target を場に残す（OP07-042モリア）
          const cands = ow.chars.filter(c => c !== target && (!prot.filter || matchFilter(c, prot.filter)));
          if (!cands.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のキャラ1枚をデッキ下に置いて「${target.base.name}」を場に残しますか？`, '残す（他キャラをデッキ下）', '残さない', { noSrc: true }))) continue;
          const dt = ow.isCPU ? cands.slice().sort((a, b) => scoreChar(a) - scoreChar(b))[0] : await chooseCard(target.owner, cands, 'デッキ下に置く自分のキャラを選択', 'ownSmall', false); if (!dt) continue;
          removeCharTo(dt, ow.deck); flog(target.owner, `【${p.base.name}】「${dt.base.name}」をデッキ下に置いて「${target.base.name}」を場に残した`); await checkAllyLeave(target.owner, dt, 'ownEffect'); render(); return true;
        } else if (prot.pay === 'selfLifeTrash') {
          // 場を離れる代わりに自分のライフ上1枚をトラッシュ（OP05-100エネル）。ライフが無ければ守れない。除外条件(prot.unless)が満たされると無効。
          if (prot.unless && G.players[target.owner].chars.some(ch => matchFilter(ch, prot.unless))) continue;
          if (!ow.life.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `自分のライフ上1枚をトラッシュして「${target.base.name}」を場に残しますか？`, '残す（ライフ→トラッシュ）', '残さない', { cls: 'danger', noSrc: true }))) continue;
          ow.trash.push(ow.life.shift()); flog(target.owner, `【${p.base.name}】ライフ1枚をトラッシュして「${target.base.name}」を場に残した`); await fireLifeLeft(target.owner); render(); return true;
        } else if (prot.pay === 'targetMinus') {
          // KOの代わりに対象のパワーを-Nにして場に残す（OP05-001サボL）。KO限定。
          if (cause !== 'ko') continue;
          addBuff(target, -(prot.amount || 1000), 'turn'); floatOn(target.uid, `-${prot.amount || 1000}`, 'dmg');
          flog(target.owner, `【${p.base.name}】KOの代わりに「${target.base.name}」をパワー-${prot.amount || 1000}にした`); return true;
        } else if (prot.pay === 'restOpp') {
          // 代わりに相手のキャラ1枚をレストにして target を場に残す（OP07-029ホーキンス）
          const cands = G.players[opp(target.owner)].chars.filter(c => !c.rested && !isRestImmune(c) && !isOppRestImmune(c));
          if (!cands.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `相手のキャラ1枚をレストにして「${target.base.name}」を場に残しますか？`, '残す（相手をレスト）', '残さない', { noSrc: true }))) continue;
          const rt = G.players[target.owner].isCPU ? cands[0] : await chooseCard(target.owner, cands, 'レストにする相手キャラを選択', 'oppBig', false); if (!rt) continue;
          rt.rested = true; await fireSelfRested(rt, 'oppEffect'); flog(target.owner, `【${p.base.name}】相手の「${rt.base.name}」をレストにして「${target.base.name}」を場に残した`); render(); return true;
        } else if (prot.pay === 'trashSelfDraw') {
          // バウンス/デッキ送りの代わりにトラッシュへ置き1ドロー（OP08-045サッチ。KOはonKO側で処理するため'ko'では発動しない）
          if (cause === 'ko') continue;
          if (!ow.chars.includes(target)) continue;
          removeChar(target); ow.trash.push(reset(target)); draw(target.owner, prot.draw || 1);
          flog(target.owner, `【${target.base.name}】効果による移動の代わりにトラッシュへ置き${prot.draw || 1}ドロー`); render(); return true;
        } else if (prot.pay === 'restActiveDon') {
          // 代わりにアクティブのドンN枚をレストにして target を場に残す（OP10-074ピーカ）
          const n = prot.n || 2; if (ow.don.active < n) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `アクティブのドン${n}枚をレストにして「${target.base.name}」を場に残しますか？`, `残す（ドン${n}レスト）`, '残さない', { noSrc: true }))) continue;
          ow.don.active -= n; ow.don.rested += n; flog(target.owner, `【${p.base.name}】ドン${n}枚をレストにして「${target.base.name}」を場に残した`); render(); return true;
        } else if (prot.pay === 'bounceSelf') {
          // 代わりにこのキャラ(p=身代わり元)を持ち主の手札に戻して target を場に残す（OP10-049サボ）。p===target不可
          if (p === target) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${p.base.name}」を手札に戻して「${target.base.name}」を場に残しますか？`, '残す（このキャラを手札へ）', '残さない', { noSrc: true }))) continue;
          bounceCard(p); flog(target.owner, `【${p.base.name}】自身を手札に戻して「${target.base.name}」を場に残した`); await checkAllyLeave(p.owner, p, 'ownEffect'); render(); return true;
        } else if (prot.pay === 'koSelf') {
          // このキャラ(p)自身をKO(代わりにトラッシュへ)して target を守る。p===target は不可
          if (p === target) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${p.base.name}」をKOして「${target.base.name}」を守りますか？`, '守る（このキャラをKO）', '守らない', { cls: 'danger', noSrc: true }))) continue;
          removeCharTo(p, ow.trash);
          flog(target.owner, `【${p.base.name}】自身をKOして「${target.base.name}」を守った`); if (prot.drawAfter) draw(target.owner, prot.drawAfter); return true;
        } else if (prot.pay === 'selfPowerMinus') {
          // 代わりにこのキャラ(p=身代わり元)を、このターン中パワー-N（OP13-017ドラゴン: 革命軍を守りドラゴン自身が-2000）
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `「${p.base.name}」をパワー-${prot.amount || 2000}にして「${target.base.name}」を場に残しますか？`, `残す（${p.base.name}-${prot.amount || 2000}）`, '残さない', { noSrc: true }))) continue;
          addBuff(p, -(prot.amount || 2000), 'turn'); floatOn(p.uid, `-${prot.amount || 2000}`, 'dmg');
          flog(target.owner, `【${p.base.name}】自身をパワー-${prot.amount || 2000}にして「${target.base.name}」を場に残した`); return true;
        } else if (prot.pay === 'flipLifeUp') {
          // 代わりに自分のライフの上から1枚を表向きにして target を場に残す（OP13-109ボニー）。
          if (!ow.life.length) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `ライフの上から1枚を表向きにして「${target.base.name}」を場に残しますか？`, '残す（ライフ表向き）', '残さない', { noSrc: true }))) continue;
          ow.life[0]._faceUp = true; flog(target.owner, `【${p.base.name}】ライフ1枚を表向きにして「${target.base.name}」を場に残した`); render(); return true;
        } else if (prot.pay === 'discardFromHand') {
          const f = prot.discardFilter || {}; const dn = prot.n || 1; // prot.n枚を捨てて守る（ST22-005おでん=2枚）
          const cands = ow.hand.filter(h => matchFilter(h, f));
          if (cands.length < dn) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `手札${dn}枚を捨てて「${target.base.name}」を守りますか？`, '守る（手札を捨てる）', '守らない', { cls: 'danger', noSrc: true }))) continue;
          const picks = [];
          if (ow.isCPU) picks.push(...cands.slice().sort((a, b) => (a.base.cost || 0) - (b.base.cost || 0)).slice(0, dn));
          else { for (let i = 0; i < dn; i++) { const d = await chooseFromHand(target.owner, cands.filter(c => !picks.includes(c)), `「${target.base.name}」を守るため捨てるカードを選択（${i + 1}/${dn}）`); if (!d) break; picks.push(d); } if (picks.length < dn) continue; }
          for (const d of picks) { ow.hand.splice(ow.hand.indexOf(d), 1); ow.trash.push(reset(d)); }
          flog(target.owner, `【${p.base.name}】手札${picks.length}枚を捨てて「${target.base.name}」を守った`);
          await fireHandDiscarded(target.owner, picks.length, p); // ★効果（身代わり持ちp）による捨て＝誘発対象（発火漏れ修正 2026-07-18）
          return true;
        } else if (prot.pay === 'donToDeck') {
          const P = G.players[target.owner];
          if (P.don.active <= 0 && P.don.rested <= 0) continue; // 戻せるドンが無ければこの供給元では守れない
          // 任意効果（「できる」）: 人間には発動可否を確認
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `ドン1枚をドンデッキに戻して「${target.base.name}」を守りますか？`, '守る（ドン-1）', '守らない', { noSrc: true }))) continue;
          if (P.don.active > 0) P.don.active--; else P.don.rested--; // active→restの順で1枚ドンデッキへ
          flog(target.owner, `【${p.base.name}】ドンを戻し「${target.base.name}」を守った`); return true;
        } else if (prot.pay === 'trashToDeck') {
          const n = prot.n || 3; // 自分のトラッシュから n枚を好きな順でデッキの下に置いて守る
          if (ow.trash.length < n) continue;
          if (!(await confirmUse(target.owner, `【${p.base.name}】身代わり`, `トラッシュ${n}枚をデッキの下に置いて「${target.base.name}」を守りますか？`, `守る（トラッシュ${n}枚→デッキ下）`, '守らない', { noSrc: true }))) continue;
          for (let i = 0; i < n; i++) { const c = ow.trash.shift(); if (c) ow.deck.push(reset(c)); }
          flog(target.owner, `【${p.base.name}】トラッシュ${n}枚をデッキ下に置き「${target.base.name}」を守った`); return true;
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

