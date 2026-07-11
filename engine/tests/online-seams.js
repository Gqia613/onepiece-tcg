#!/usr/bin/env node
/* tests/online-seams.js — オンライン対戦（ロックステップ）向けエンジンシームの回帰テスト。
   使い方: node tests/online-seams.js
   検証対象:
   - showPrompt/humanPick/confirmUse の side/local タグ（席所有権。web側が「相手の選択待ち」表示に使う）
   - UI入力層の side 一般化（tryPlayHand/attachDonFlow/openOwnMenu/uiEndTurn が cpu 席の人間でも動く）
   - 両人間マリガン（cpu→me の順・cpu席にもプロンプト）
   - hashGameState（決定性・表示フィールド非依存・clone往復一致・状態差の検知） */
const { runHarness } = require('./_load-app');

const harness = String.raw`
const tick = () => new Promise(r => setImmediate(r));
const ticks = async n => { for (let i = 0; i < n; i++) await tick(); };
// 効果を持たないバニラCHAR（登場/付与テストで誘発が絡まないカード）
const VANILLA = (() => { for (const n of Object.keys(C)) { const b = C[n]; if (b && b.type === 'CHAR' && (b.cost || 0) >= 1 && (b.cost || 0) <= 3 && !b.fx && !b.blocker && !b.rush && !b.rushChar) return n; } return null; })();
function mkc(no, owner) { const b = C[no]; return { no, base: b, owner: owner || 'me', attachedDon: 0, rested: false, summonedTurn: 0, buffs: [], kwGrant: [], frozen: false, negSeq: null, noAtkSeq: null, uid: ++UID, _faceUp: false }; }
function setupBoard(o) {
  o = o || {};
  G.active = o.active || 'me'; G.turnSeq = 5; G.turnDisp = 5; G.winner = null; G.busy = false; G.myActable = false;
  G.promptState = null; G.pendingChoice = null; G.attackSel = null; G.log = [];
  G._pendingReacts = []; G._fxDepth = 0; G._drainingReacts = false; G._pendingTurnEnd = [];
  G.names = null; G.sel = null;
  const mkP = (ln, side, cpu) => {
    const leader = mkc(ln, side);
    leader.base = Object.assign({}, C[ln]); delete leader.base.fx; // リーダー誘発を切って手番遷移を純粋化
    return { id: side, isCPU: !!cpu, leader, chars: [], hand: [], life: [], trash: [], stage: null, deck: [], don: { active: 0, rested: 0 }, donMax: 10, turnsTaken: 3, denyBlock: false };
  };
  G.players = { me: mkP('OP11-041', 'me', o.meCPU), cpu: mkP('OP11-041', 'cpu', o.cpuCPU) };
}
(async () => {
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  NG:', m); } };
  try {
    ok(!!VANILLA, '0: バニラCHARが見つかる（テスト前提）');

    // 1) showPrompt: side/local タグ
    setupBoard({ active: 'me' });
    { const p = showPrompt({ side: 'cpu', title: 't', opts: [{ t: 'a', v: 1 }] });
      ok(G.promptState && G.promptState.side === 'cpu' && G.promptState.local === false, '1a: promptState.side=cfg.side / local既定false');
      G.promptState.pick(1); await p; }
    { const p = showPrompt({ title: 't', opts: [{ t: 'a', v: 1 }] });
      ok(G.promptState && G.promptState.side === 'me', '1b: side未指定はG.activeへフォールバック');
      G.promptState.pick(1); await p; }
    { const p = confirmUse('cpu', '題', '本文', 'はい', 'いいえ', { local: true });
      ok(G.promptState && G.promptState.side === 'cpu' && G.promptState.local === true, '1c: confirmUseがside/localを伝搬');
      G.promptState.pick('y'); ok((await p) === true, '1d: confirmUse=yes'); }

    // 2) humanPick: pendingChoice に side/cands
    setupBoard({ active: 'me' });
    { const c1 = mkc(VANILLA, 'cpu'); const p = humanPick([c1], '選択', false, '', 'cpu');
      ok(G.pendingChoice && G.pendingChoice.side === 'cpu', '2a: pendingChoice.side=指定席');
      ok(Array.isArray(G.pendingChoice.cands) && G.pendingChoice.cands[0] === c1, '2b: pendingChoice.cands=候補実体');
      G.pendingChoice.res(c1); ok((await p) === c1, '2c: 解決値が返る'); }

    // 3) 両人間マリガン: cpu→me の順に side 付きプロンプト
    setupBoard({ active: 'me' });
    for (const s of ['me', 'cpu']) { const P = G.players[s]; for (let i = 0; i < 15; i++) P.deck.push(mkc(VANILLA, s)); for (let i = 0; i < 5; i++) P.hand.push(P.deck.shift()); }
    { const p = mulliganPhase(); await ticks(3);
      ok(G.promptState && G.promptState.side === 'cpu' && G.promptState.cls === 'mulligan', '3a: cpu席（人間）へ先にマリガン確認');
      G.promptState.pick(true); await ticks(3); // cpuは引き直す
      ok(G.promptState && G.promptState.side === 'me' && G.promptState.cls === 'mulligan', '3b: 続いてme席へ確認');
      G.promptState.pick(false); await p;       // meはキープ
      ok(G.players.cpu.hand.length === 5 && G.players.cpu.deck.length === 10, '3c: cpuの引き直し後も枚数整合');
      ok(!G.promptState, '3d: プロンプト消化済み'); }

    // 4) tryPlayHand: cpu席（人間）のカードで cpu 側に登場・cpu 側のドン消費
    setupBoard({ active: 'cpu' });
    { const P = G.players.cpu; P.don.active = 5; const card = mkc(VANILLA, 'cpu'); P.hand.push(card);
      await tryPlayHand(card); await ticks(5);
      ok(P.chars.includes(card), '4a: cpu席のcharsに登場');
      ok(P.don.active === 5 - (C[VANILLA].cost || 0), '4b: cpu側のドンで支払い');
      ok(G.players.me.chars.length === 0 && G.players.me.don.active === 0, '4c: me側は不変'); }

    // 5) attachDonFlow: cpu席カードへの付与（プロンプトもコミットもcpu側）
    setupBoard({ active: 'cpu' });
    { const P = G.players.cpu; P.don.active = 3; const card = mkc(VANILLA, 'cpu'); card.summonedTurn = 1; P.chars.push(card);
      const p = attachDonFlow(card); await ticks(3);
      ok(G.promptState && G.promptState.side === 'cpu', '5a: ドン付与プロンプトがcpu席');
      G.promptState.pick('2'); await p; await ticks(3);
      ok(card.attachedDon === 2 && P.don.active === 1, '5b: cpu側のドンから2枚付与'); }

    // 6) openOwnMenu: cpu席カードのメニューが cpu 席タグ
    setupBoard({ active: 'cpu' });
    { const P = G.players.cpu; P.don.active = 2; const card = mkc(VANILLA, 'cpu'); card.summonedTurn = 1; P.chars.push(card); G.myActable = true;
      const p = openOwnMenu(card); await ticks(3);
      ok(G.promptState && G.promptState.side === 'cpu', '6a: 所有カードメニューがcpu席');
      G.promptState.pick('x'); await p; }

    // 7) uiEndTurn(side): cpu席の手番終了 → me の手番へ。席違いは無視
    setupBoard({ active: 'cpu' });
    for (const s of ['me', 'cpu']) { const P = G.players[s]; for (let i = 0; i < 10; i++) P.deck.push(mkc(VANILLA, s)); }
    { G.myActable = true; G.busy = false;
      uiEndTurn('me'); // activeはcpu＝無視されるべき
      ok(G.active === 'cpu' && G.myActable === true, '7a: 席違いのuiEndTurnは無視');
      uiEndTurn('cpu');
      let done = false; for (let i = 0; i < 600 && !done; i++) { await tick(); if (G.active === 'me' && G.myActable) done = true; }
      ok(done, '7b: endTurn(cpu)→beginTurn(me)でmeが操作可能になる'); }

    // 8) hashGameState: 決定性・表示フィールド非依存・clone往復一致・状態差の検知
    setupBoard({ active: 'me' });
    for (const s of ['me', 'cpu']) { const P = G.players[s]; for (let i = 0; i < 8; i++) P.deck.push(mkc(VANILLA, s)); for (let i = 0; i < 4; i++) P.life.push(P.deck.shift()); }
    { const h1 = hashGameState();
      ok(h1 === hashGameState(), '8a: 同一状態で同一ハッシュ');
      G.names = { me: 'ホスト', cpu: 'ゲスト' }; G.customDecks = [{ id: 'x' }]; G.sel = { me: 'a' };
      ok(hashGameState() === h1, '8b: names/customDecks/selはハッシュに影響しない');
      const snap = cloneGameState(); loadGameState(snap);
      ok(hashGameState() === h1, '8c: clone→load往復でハッシュ不変');
      G.players.me.hand.push(G.players.me.deck.shift());
      ok(hashGameState() !== h1, '8d: 盤面変化でハッシュが変わる'); }
  } catch (e) { console.log('EXCEPTION:', e && (e.stack || e.message || e)); fail++; }
  console.log('オンライン対戦シーム: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
`;
try { process.stdout.write(runHarness('online-seams', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
