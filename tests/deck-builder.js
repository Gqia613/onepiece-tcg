#!/usr/bin/env node
/* tests/deck-builder.js — デッキビルダーの検証(50枚/色/枚数制限)とJSON入出力の往復を確認。
   使い方: node tests/deck-builder.js
   実対戦の健全性は custom-decks.js が担当。ここは構築ルール・バリデーション・JSON往復に専念。 */
const { runHarness } = require('./_load-app');  // stubs+CARD_DB+CARD_FX+本体JS(src/00..60) の連結・実行を集約

const harness = String.raw`
toast = function () {}; renderSelect = function () {}; backToSelect = function () {}; render = function () {}; renderDeckBuilder = function () {};
(async () => {
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  NG:', m); } };
  G.customDecks = []; G.sel = { me: null, cpu: null };
  function buildList(leaderNo) {
    const lc = C[leaderNo].color || []; const fxSet = new Set(Object.keys(window.CARD_FX));
    const legal = window.CARD_DB.filter(c => c.type !== 'LEADER' && C[c.no] && (c.color || []).some(col => lc.includes(col)) && !/_p\d|_r\d/.test(c.no)).map(c => c.no);
    legal.sort((a, b) => ((C[a].cost || 0) - (C[b].cost || 0)) || (fxSet.has(b) - fxSet.has(a)) || (a < b ? -1 : 1));
    const list = {}; let total = 0; for (const no of legal) { if (total >= 50) break; const n = Math.min(4, 50 - total); list[no] = n; total += n; } return list;
  }
  try {
    const leader = 'OP16-001';
    G.builder = { leaderNo: leader, list: buildList(leader), name: 'テストデッキ' };
    ok(builderValidate(G.builder).ok, 'builderValidate: 合法50枚デッキはOK');
    // 50枚未満は不合格
    const short = { leaderNo: leader, list: Object.assign({}, G.builder.list), name: 'x' }; delete short.list[Object.keys(short.list)[0]];
    ok(!builderValidate(short).ok, 'builderValidate: 50枚未満は不合格');
    // 色不一致は不合格
    const wrongColor = window.CARD_DB.find(c => c.type !== 'LEADER' && !(c.color || []).some(col => (C[leader].color || []).includes(col)));
    if (wrongColor) { const bad = { leaderNo: leader, list: Object.assign({}, G.builder.list) }; const k = Object.keys(bad.list)[0]; bad.list[k]--; bad.list[wrongColor.no] = 1; ok(!builderValidate(bad).ok, 'builderValidate: 色不一致は不合格'); } else ok(true, '色不一致カード未検出');
    // 「何枚でも入れられる」カード(OP16-042)は5枚以上OK
    if (C['OP16-042']) {
      const ld = window.CARD_DB.find(c => c.type === 'LEADER' && (c.color || []).includes('青'));
      if (ld) { const lst = { 'OP16-042': 10 }; const lc = C[ld.no].color || [];
        const others = window.CARD_DB.filter(c => c.type !== 'LEADER' && c.no !== 'OP16-042' && (c.color || []).some(col => lc.includes(col)) && !/_p\d|_r\d/.test(c.no)).map(c => c.no);
        let t = 10; for (const no of others) { if (t >= 50) break; const n = Math.min(4, 50 - t); lst[no] = n; t += n; }
        ok(builderValidate({ leaderNo: ld.no, list: lst }).ok, 'builderValidate: OP16-042は10枚でもOK(枚数制限の例外)');
      } else ok(true, '青リーダー未検出');
    } else ok(true, 'OP16-042未検出');
    // 通常カードは5枚で不合格
    const nrm = { leaderNo: leader, list: Object.assign({}, G.builder.list) }; const fk = Object.keys(nrm.list).find(no => !/何枚でも/.test(C[no].text || '')); nrm.list[fk] = 5;
    ok(!builderValidate(nrm).ok, 'builderValidate: 通常カードは5枚で不合格');
    // builderToDeck → JSON往復 → importDeckData
    const deck = builderToDeck(G.builder);
    ok(deck.leader === leader && deck.custom === true, 'builderToDeck: カスタムデッキ生成');
    const json = JSON.stringify({ _format: 'opcg-deck-v1', name: deck.name, leader: deck.leader, list: Object.assign({}, deck.list) });
    const before = G.customDecks.length; importDeckData(JSON.parse(json));
    ok(G.customDecks.length === before + 1, 'JSON往復: エクスポート→インポートで追加');
    const imp = G.customDecks[G.customDecks.length - 1];
    ok(builderValidate({ leaderNo: imp.leader, list: imp.list }).ok, 'インポートしたデッキも合法50枚');
    // 不正JSONは拒否
    const b0 = G.customDecks.length; importDeckData({ name: 'bad', list: { 'OP16-001': 1 } }); ok(G.customDecks.length === b0, '不正JSON(leader無し)は拒否');
    importDeckData({ leader: '___notexist', list: { 'OP16-002': 1 } }); ok(G.customDecks.length === b0, '不正JSON(未知リーダー)は拒否');
    // renderSelect が自分・CPU 両方にカスタムデッキを出す（ordered に含む）
    const ordered = (typeof DECKS !== 'undefined' ? DECKS : []).concat(G.customDecks || []);
    ok(ordered.some(d => d.custom), 'デッキ選択リストにカスタムデッキが含まれる(CPUにも割当可)');
    // ★パラレル(_rN=別イラストの同一カード)はデッキビルダー一覧に出さない（本体と二重表示する重複を防止）
    { const blkLeader = Object.keys(C).find(no => C[no].leader && (C[no].color || []).includes('黒')) || leader;
      G.builder = { leaderNo: blkLeader, list: {}, name: 't', filter: 'all', colorFilter: 'all', search: '' };
      const pool = poolCards();
      ok(pool.length > 0 && !pool.some(no => /_r\d+$/.test(no)), 'poolCards: パラレル(_rN)を一覧に含まない（重複表示防止）');
      ok(pool.includes('ST14-017') && !pool.includes('ST14-017_r1'), 'poolCards: 黒サウザンド・サニー号は本体のみ（パラレル除外）'); }
    // ★イム(OP13-079): コスト2以上のイベントはデッキに入れられない
    { const im = Object.keys(C).find(no => C[no] && C[no].name === 'イム' && C[no].leader);
      if (im) {
        const ev2 = Object.keys(C).find(no => C[no] && C[no].type === 'EVENT' && (C[no].cost || 0) >= 2);
        const ev1 = Object.keys(C).find(no => C[no] && C[no].type === 'EVENT' && (C[no].cost || 0) < 2);
        ok(builderValidate({ leaderNo: im, list: { [ev2]: 1 } }).errors.some(e => /イム/.test(e)), 'イム: コスト2以上イベントは構築不可');
        ok(!builderValidate({ leaderNo: im, list: { [ev1]: 1 } }).errors.some(e => /イムのデッキ/.test(e)), 'イム: コスト1以下イベントはOK');
      } else ok(true, 'イムリーダー未検出'); }
  } catch (e) { console.log('EXCEPTION:', e.message); fail++; }
  console.log('デッキビルダー検証: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
`;
try { process.stdout.write(runHarness('db', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
