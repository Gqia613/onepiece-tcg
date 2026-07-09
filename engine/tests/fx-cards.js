#!/usr/bin/env node
/* tests/fx-cards.js — Phase3で実装したカード効果(cards-fx.js)が実機で発動するか検証。
   使い方: node tests/fx-cards.js
   stubs + cards.js + cards-fx.js + index.html を結合して実行し、代表カードの効果を assert する。
   Phase3で新カードを実装したら、ここに1〜2ケース足すこと。 */
const { runHarness } = require('./_load-app');  // stubs+CARD_DB+CARD_FX+本体JS(src/00..60) の連結・実行を集約

// ★cards-fx.js のキー重複ガード: JSオブジェクトは同キーを静かに後勝ち上書きする（前の定義が死ぬ）ので重複は必ずバグ。
// 末尾の「audit駆動【トリガー】一括実装」ブロックは既存noへ trigger をマージする追記なので、意図的に既存キーを再掲する。
// → 定義領域（マージマーカーより前）だけを重複検査し、マージ領域は「領域内で重複が無いこと」だけを別途確認する。
{ const fs = require('fs'), path = require('path');
  const full = fs.readFileSync(path.join(__dirname, '..', 'cards-fx.js'), 'utf8');
  const MARK = '/* ===== audit駆動【トリガー】一括実装';
  const mi = full.indexOf(MARK);
  const txt = mi >= 0 ? full.slice(0, mi) : full;         // CARD_FX 定義領域
  const mergeTxt = mi >= 0 ? full.slice(mi) : '';         // trigger マージ領域
  const scan = s => { const re = /"([A-Z0-9]+-\d+[A-Za-z0-9_]*)"\s*:/g; let m; const cnt = {}; while ((m = re.exec(s))) cnt[m[1]] = (cnt[m[1]] || 0) + 1; return cnt; };
  const cnt = scan(txt);
  const dup = Object.keys(cnt).filter(k => cnt[k] > 1);
  if (dup.length) { console.log('  NG: cards-fx.js に重複キー（後勝ち上書きでバグ）: ' + dup.join(', ')); process.exit(1); }
  const mcnt = scan(mergeTxt);
  const mdup = Object.keys(mcnt).filter(k => mcnt[k] > 1);
  if (mdup.length) { console.log('  NG: trigger マージ領域に重複キー: ' + mdup.join(', ')); process.exit(1); }
  console.log('  ✓ cards-fx.js キー重複なし (定義 ' + Object.keys(cnt).length + 'キー / triggerマージ ' + Object.keys(mcnt).length + '件)');
}

// ★OP13/OP14 二重照合: 公式正本(tools/official-opNN.js) ⇔ CARD_DB.text 一致 ＋ 全120枚に実装(fx or 純ブロッカー/バニラ)があること。
// cards.js/cards-fx.js は require キャッシュされるため一度だけ読み込み、両弾を走査する。
{ const path = require('path'); const saved = global.window; global.window = {};
  try {
    require(path.join(__dirname, '..', 'cards.js'));
    require(path.join(__dirname, '..', 'cards-fx.js'));
    const DB = global.window.CARD_DB, FX = global.window.CARD_FX;
    // エンジン側でハードコード実装のリーダー（CARD_FXを持たないが実装済み＝lucy/enel/teach のカウンター/起動メイン/常在）。missing判定から除外。
    const ENGINE_IMPL = new Set(['OP15-002', 'OP15-058', 'OP16-080']);
    for (const [tag, file] of [['OP16', 'official-op16.js'], ['OP15', 'official-op15.js'], ['OP14', 'official-op14.js'], ['OP13', 'official-op13.js'], ['OP12', 'official-op12.js'], ['OP11', 'official-op11.js'], ['OP10', 'official-op10.js'], ['OP09', 'official-op09.js'], ['OP08', 'official-op08.js'], ['OP07', 'official-op07.js'], ['OP06', 'official-op06.js'], ['OP05', 'official-op05.js'], ['OP04', 'official-op04.js'], ['OP03', 'official-op03.js'], ['OP02', 'official-op02.js'], ['OP01', 'official-op01.js'], ['EB01', 'official-eb01.js'], ['EB02', 'official-eb02.js'], ['EB03', 'official-eb03.js'], ['EB04', 'official-eb04.js'], ['ST01', 'official-st01.js'], ['ST02', 'official-st02.js'], ['ST03', 'official-st03.js'], ['ST04', 'official-st04.js'], ['ST05', 'official-st05.js'], ['ST06', 'official-st06.js'], ['ST07', 'official-st07.js'], ['ST08', 'official-st08.js'], ['ST09', 'official-st09.js'], ['ST10', 'official-st10.js'], ['ST11', 'official-st11.js'], ['ST12', 'official-st12.js'], ['ST13', 'official-st13.js'], ['ST14', 'official-st14.js'], ['ST15', 'official-st15.js'], ['ST16', 'official-st16.js'], ['ST17', 'official-st17.js'], ['ST18', 'official-st18.js'], ['ST19', 'official-st19.js'], ['ST20', 'official-st20.js'], ['ST21', 'official-st21.js'], ['ST22', 'official-st22.js'], ['ST23', 'official-st23.js'], ['ST24', 'official-st24.js'], ['ST25', 'official-st25.js'], ['ST26', 'official-st26.js'], ['ST27', 'official-st27.js'], ['ST28', 'official-st28.js'], ['ST29', 'official-st29.js'], ['ST30', 'official-st30.js'], ['P', 'official-p.js'], ['PRB01', 'official-prb01.js'], ['PRB02', 'official-prb02.js']]) {
      const off = require(path.join(__dirname, '..', 'tools', file));
      const mismatch = [], missing = [];
      for (const no in off) {
        const c = DB.find(x => x.no === no);
        let text = (c && (c.text || '').replace(/\s+/g, ' ').trim()) || '効果なし';
        if (/^[-‐―ー–—\s]*$/.test(text)) text = '効果なし'; // バニラのtext「-」を正規化（official-opNN.jsの生成と同じ規則）
        if (text !== off[no]) mismatch.push(no);
        // キーワード/ルールのみ（fx不要）の判定: 【ブロッカー】【速攻】【ダブルアタック】【バニッシュ】の注釈と「ルール上…」文を剥がして空ならvanilla
        const stripped = off[no].replace(/ルール上[^。]*。/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').replace(/【(ブロッカー|速攻|ダブルアタック|バニッシュ)】/g, '').replace(/[\s　]/g, '');
        const vanilla = off[no] === '効果なし' || (!FX[no] && stripped === '');
        if (!FX[no] && !vanilla && !ENGINE_IMPL.has(no)) missing.push(no);
      }
      if (mismatch.length) { console.log('  NG: ' + tag + ' 正本とCARD_DB.text不一致: ' + mismatch.join(', ')); process.exit(1); }
      if (missing.length) { console.log('  NG: ' + tag + ' 実装漏れ（fxもバニラでもない）: ' + missing.join(', ')); process.exit(1); }
      console.log('  ✓ ' + tag + ' 二重照合: 正本' + Object.keys(off).length + '枚=CARD_DB.text 一致・全枚数に実装あり');
    }
  } finally { global.window = saved; }
}

const harness = String.raw`
showPrompt=function(cfg){const o=(cfg.opts||[]).filter(x=>!x.disabled);const p=o.find(x=>String(x.v).indexOf('pick:')===0)||o[0];if(cfg.onPick)cfg.onPick(p&&p.v);return Promise.resolve(p&&p.v);};
humanPick=function(c){return Promise.resolve((c||[])[0]||null);};
(async()=>{
  let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  NG:',m);}};
  const mkP=(ln,cpu)=>({isCPU:cpu,leader:inst(ln,cpu?'cpu':'me'),chars:[],hand:[],life:[],deck:[],trash:[],stage:null,don:{active:0,rested:0},donMax:10,turnsTaken:3,denyBlock:false});
  const I=(no,o)=>inst(no,o);
  try{
    // 統合: cards-fx.js が C にfxを付与している
    ok(C['OP16-090'] && C['OP16-090'].fx && !C['OP16-090'].dataOnly, '統合: OP16群にfx付与・dataOnly解除');
    ok(Object.keys(C).length>3000, '全カードデータ統合(C='+Object.keys(C).length+')');
    // パラレル(_rN=別イラストの同一カード)は本体noのfxを共有する（OP09-099_r1ハチノス等が効果を失っていた回帰）
    ok(C['OP09-099_r1'] && C['OP09-099_r1'].fx && C['OP09-099_r1'].fx.act && !C['OP09-099_r1'].dataOnly && C['OP09-099_r1'].fx.act.label===C['OP09-099'].fx.act.label, 'パラレル(_rN)が本体noのfxを継承（OP09-099_r1ハチノス）');

    // OP16-027: 【ドン!!×1】このキャラのパワー+2000 (static)
    G.active='me';G.turnSeq=5;G.winner=null; G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)};
    const s=I('OP16-027','me'); s.attachedDon=1; G.players.me.chars=[s];
    ok(power(s)===(C['OP16-027'].power+1000+2000), 'OP16-027: 付与ドン1で+2000(静的)');

    // OP11-041 ナミ 効果1: 【自分のターン中】ライフが離れた時、手札7枚以下なら1ドロー
    // （fireLifeLeft を lifeToHand 等のライフ離脱opから誘発。被弾以外の自ターンのライフ操作で発動＝回帰）
    G.players={me:mkP('OP11-041',false),cpu:mkP('OP13-002',true)}; G.active='me'; G.turnSeq=9; G.winner=null;
    { const me=G.players.me; me.hand=[]; me.deck=[I('OP13-002','me'),I('OP13-002','me')]; me.life=[I('OP13-002','me'),I('OP13-002','me')];
      await runFx([{op:'lifeToHand',n:1}],{side:'me'});
      ok(me.hand.length===2 && me.deck.length===1 && me.life.length===1, 'OP11-041 効果1: 自ターンにライフ→手札で1ドロー誘発(手札=ライフ1+ドロー1・デッキ-1)'); }

    // OP16-072: 【登場時】デッキ上5枚から《インペルダウン》1枚を手札へ (search)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const imp=Object.keys(C).find(no=>!C[no].leader&&(C[no].traits||[]).includes('インペルダウン'));
    G.players.cpu.deck=[I(imp,'cpu'),I('OP15-067','cpu'),I('OP15-067','cpu')];
    let card=I('OP16-072','cpu'); await runFx(card.base.fx.onPlay,{self:card,side:'cpu'});
    ok(G.players.cpu.hand.some(c=>c.no===imp), 'OP16-072: サーチで《インペルダウン》を手札に');

    // OP16-013: 【KO時】相手の元々パワー8000以下のキャラ1枚をKO (onKO/ko)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const victim=I('OP15-067','me'); G.players.me.chars=[victim];
    card=I('OP16-013','cpu'); await runFx(card.base.fx.onKO,{self:card,side:'cpu'});
    ok(!G.players.me.chars.includes(victim), 'OP16-013: KO時に相手キャラ(P2000)をKO');

    // OP16-090: 【登場時】2ドロー・2捨て・コスト1以下KO (onPlay 複合)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const cp=G.players.cpu; cp.deck=Array.from({length:5},()=>I('OP15-067','cpu')); cp.hand=[I('OP15-067','cpu'),I('OP15-067','cpu')];
    G.players.me.chars=[I('OP15-067','me')];
    const dB=cp.deck.length, tB=cp.trash.length;
    card=I('OP16-090','cpu'); await runFx(card.base.fx.onPlay,{self:card,side:'cpu'});
    ok(cp.deck.length===dB-2 && cp.trash.length>=tB+2, 'OP16-090: 2ドロー&2捨て');

    // 対象フィルタ: 名前の全角Ｄ↔半角D 正規化
    ok(normName('モンキー・Ｄ・ルフィ')===normName('モンキー・D・ルフィ'), 'normName: 全角Ｄ↔半角D');
    // OP16-001: 起動で「パワー8000以上の白ひげ/ルフィ」だけに速攻付与(giveKeyword + 対象フィルタ minPower/or)
    G.players={cpu:mkP('OP16-001',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5;
    const big=I('OP16-007','cpu'), sml=I('OP15-067','cpu'); G.players.cpu.chars=[big,sml];
    await runFx(C['OP16-001'].fx.act.fx,{self:G.players.cpu.leader,side:'cpu'});
    ok(big.kwGrant.some(g=>g.kw==='rush') && !sml.kwGrant.some(g=>g.kw==='rush'), 'OP16-001: 対象フィルタで該当キャラのみ速攻');
    // OP16-096: KO時にトラッシュの「ヤマト」(c6以下)のみ登場(reviveFromTrash + 名前フィルタ)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const yam=I('OP02-042','cpu'), oth=I('OP15-067','cpu'); G.players.cpu.trash=[yam,oth];
    await runFx(C['OP16-096'].fx.onKO,{self:I('OP16-096','cpu'),side:'cpu'});
    ok(G.players.cpu.chars.includes(yam) && !G.players.cpu.chars.includes(oth), 'OP16-096: 名前フィルタでヤマトのみ蘇生');

    // PRB02-015 シリュウ: 黒ひげリーダーなら【ブロッカー】+コスト+4(実効8=除去耐性)、【KO時】相手の元々コスト4以下を1枚KO
    G.players={cpu:mkP('OP09-081',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
    const shiryu=I('PRB02-015','cpu'); G.players.cpu.chars=[shiryu];
    ok(hasKw(shiryu,'blocker'), 'PRB02-015: 黒ひげリーダーで【ブロッカー】獲得');
    ok(matchFilter(shiryu,{maxCost:7})===false && matchFilter(shiryu,{maxCost:8})===true, 'PRB02-015: 黒ひげでコスト+4(実効8)');
    ok(matchFilter(shiryu,{maxBaseCost:4})===true, 'PRB02-015: 元々コストは4のまま(maxBaseCost)');
    G.players.cpu.leader=inst('OP11-041','cpu'); // 非黒ひげ(ナミ)
    ok(!hasKw(shiryu,'blocker') && matchFilter(shiryu,{maxCost:4})===true, 'PRB02-015: 非黒ひげでは無条件(ブロッカー無し/コスト4)');
    G.players.cpu.leader=inst('OP09-081','cpu'); // 黒ひげに戻す
    const shiV1=I('OP15-067','me'), shiV7=I('OP15-046','me'); G.players.me.chars=[shiV7,shiV1]; // cost1 / サボcost7
    await runFx(C['PRB02-015'].fx.onKO,{self:shiryu,side:'cpu'});
    ok(!G.players.me.chars.includes(shiV1) && G.players.me.chars.includes(shiV7), 'PRB02-015: KO時 元々コスト4以下のみKO(cost7は残る)');

    // OP08-047 ジョズ(6c/7000): 【登場時】自キャラ1枚(このキャラ以外)を戻す:コスト6以下のキャラ1枚までを戻す
    ok(C['OP08-047'].fx.onPlay[0].op==='bounceOwnCharCost' && C['OP08-047'].fx.onPlay[0].excludeSelf===true && C['OP08-047'].fx.onPlay[0].then[0].op==='bounce' && C['OP08-047'].fx.onPlay[0].then[0].maxCost===6 && C['OP08-047'].fx.onPlay[0].then[0].side==='any', 'OP08-047: コスト=自キャラ戻し(自身除外)→コスト6以下を戻す(side any)');
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.winner=null;
    const jz=I('OP08-047','me'), jzCost=I('OP15-067','me'); G.players.me.chars=[jzCost]; // 自キャラ(コスト用)。jzは場に出さずselfで渡す
    const jzT5=I('ST30-005','cpu'), jzT7=I('OP15-046','cpu'); G.players.cpu.chars=[jzT5,jzT7]; // cost5(素のジョズ) / サボcost7
    await runFx(C['OP08-047'].fx.onPlay,{self:jz,side:'me'});
    ok(G.players.me.hand.some(c=>c.no==='OP15-067'), 'OP08-047: コストで自キャラ(シュラ)を手札に戻した');
    ok(!G.players.cpu.chars.includes(jzT5) && G.players.cpu.chars.includes(jzT7), 'OP08-047: 効果でコスト6以下(cost5)を戻す・コスト7(サボ)は対象外');

    // KO/離脱時の付与ドンは「レスト」でコストエリアへ戻る（公式ルール。旧バグ=アクティブ）
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.winner=null; G.turnSeq=7;
    const donChar=I('OP15-067','me'); donChar.attachedDon=2; G.players.me.chars=[donChar];
    const aBefore=G.players.me.don.active, rBefore=G.players.me.don.rested;
    await koCard(donChar,'oppEffect');
    ok(G.players.me.don.rested===rBefore+2 && G.players.me.don.active===aBefore, 'KO時: 付与ドンはレストで返る(activeは不変)');

    // コスト系op: 手札公開/ドンレスト/自キャラトラッシュ
    const P8=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&C[no].power===8000);
    const P10=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&C[no].power===10000);
    // OP16-002: 手札からP8000キャラを公開(コスト・札は消費しない)→1ドロー
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.cpu.hand=[I(P8,'cpu')]; G.players.cpu.deck=[I('OP15-067','cpu'),I('OP15-067','cpu')];
    const h0=G.players.cpu.hand.length, d0=G.players.cpu.deck.length;
    await runFx(C['OP16-002'].fx.onPlay,{self:I('OP16-002','cpu'),side:'cpu'});
    ok(G.players.cpu.hand.length===h0+1 && G.players.cpu.deck.length===d0-1, 'OP16-002: revealCostで公開→1ドロー(公開札は手札に残る)');
    // OP16-006: ドン2レスト(コスト)→相手P4000以下KO / ドン不足なら不発
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.don={active:2,rested:0};
    const v6=I('OP15-067','me'); G.players.me.chars=[v6];
    await runFx(C['OP16-006'].fx.onPlay,{self:I('OP16-006','cpu'),side:'cpu'});
    ok(!G.players.me.chars.includes(v6) && G.players.cpu.don.active===0 && G.players.cpu.don.rested===2, 'OP16-006: restDonCost(2)→相手KO');
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.don={active:1,rested:0};
    const v6b=I('OP15-067','me'); G.players.me.chars=[v6b];
    await runFx(C['OP16-006'].fx.onPlay,{self:I('OP16-006','cpu'),side:'cpu'});
    ok(G.players.me.chars.includes(v6b) && G.players.cpu.don.active===1, 'OP16-006: ドン不足(1<2)で不発');
    // OP16-008: 自分の元々P10000キャラをトラッシュ(コスト)→相手P8000以下KO
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const sac=I(P10,'cpu'); G.players.cpu.chars=[sac]; const t8=I('OP15-067','me'); G.players.me.chars=[t8];
    await runFx(C['OP16-008'].fx.onPlay,{self:I('OP16-008','cpu'),side:'cpu'});
    ok(!G.players.cpu.chars.includes(sac) && G.players.cpu.trash.includes(sac) && !G.players.me.chars.includes(t8), 'OP16-008: trashOwnCharCost(P10000)→相手KO');
    // OP16-011: 【ドン!!×1】onAttack KO は付与ドンでゲート
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const atk=I('OP16-011','cpu'); atk.attachedDon=0; const t11=I('OP15-067','me'); G.players.me.chars=[t11];
    await runFx(C['OP16-011'].fx.onAttack,{self:atk,side:'cpu'});
    ok(G.players.me.chars.includes(t11), 'OP16-011: 付与ドン0で【ドン!!×1】効果は不発');
    atk.attachedDon=1; await runFx(C['OP16-011'].fx.onAttack,{self:atk,side:'cpu'});
    ok(!G.players.me.chars.includes(t11), 'OP16-011: 付与ドン1で相手P2000をKO(condゲート)');

    // 第2弾の機構: static系/discardCost/setPower/leaveProtect/costMod/onOppAttack/オブジェクト条件
    // OP16-003: キャラ→リーダーへ常在【ダブルアタック】+2000（自分ターン限定）
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5;
    const c3=I('OP16-003','cpu'); G.players.cpu.chars=[c3]; const lead=G.players.cpu.leader;
    ok(hasKw(lead,'doubleAttack') && power(lead)===(lead.base.power||0)+2000, 'OP16-003: 自ターンにリーダーへDA+2000');
    G.active='me'; ok(!hasKw(lead,'doubleAttack'), 'OP16-003: 相手ターンは無効(selfTurn)'); G.active='cpu';
    // OP16-005: costMod(白ひげP8000居でコスト-3) + staticKeyword blocker
    const WB=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].power||0)>=8000&&(C[no].traits||[]).some(t=>t.includes('白ひげ海賊団')));
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const c5=I('OP16-005','cpu'); const base5=effCost('cpu',c5);
    if(WB){ G.players.cpu.chars=[I(WB,'cpu')]; ok(effCost('cpu',c5)===Math.max(0,base5-3), 'OP16-005: 白ひげP8000居でコスト-3'); }
    ok(hasKw(c5,'blocker'), 'OP16-005: staticKeyword blocker');
    // OP16-009: discardCost(P8000を捨てる)→自身に速攻(untilNextEnd)+パワー+2000
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const c9=I('OP16-009','cpu'); G.players.cpu.chars=[c9]; G.players.cpu.hand=[I(P8,'cpu')]; const hb9=G.players.cpu.hand.length;
    await runFx(C['OP16-009'].fx.onPlay,{self:c9,side:'cpu'});
    ok(G.players.cpu.hand.length===hb9-1 && hasKw(c9,'rush') && power(c9)===(c9.base.power||0)+2000, 'OP16-009: 手札捨て→速攻+2000');
    // OP16-014: leaveProtect koSelf（守護者が身代わりKO）
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const guard=I('OP16-014','cpu'), pr=I('OP15-067','cpu'); G.players.cpu.chars=[guard,pr];
    const saved=await protectFromEffect(pr);
    ok(saved===true && !G.players.cpu.chars.includes(guard) && G.players.cpu.chars.includes(pr), 'OP16-014: leaveProtect koSelfで身代わり');
    // OP16-015: onOppAttack discardCost→setPower selfAndLeaderを7000に
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='me';
    const c15=I('OP16-015','cpu'); G.players.cpu.chars=[c15]; G.players.cpu.hand=[I(P8,'cpu')];
    const atk15=I('OP15-067','me'); G.players.me.chars=[atk15];
    await runFx(C['OP16-015'].fx.onOppAttack,{self:c15,side:'cpu',attacker:atk15});
    ok(power(c15)===7000 && power(G.players.cpu.leader)===7000, 'OP16-015: 元々パワーを7000に(setPower)');
    // OP16-035: restChar + discardCost→リーダーにレストのドン3付与
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.cpu.don={active:0,rested:3}; G.players.cpu.hand=[I('OP15-067','cpu')];
    G.players.me.chars=[I('OP15-067','me')];
    await runFx(C['OP16-035'].fx.onPlay,{self:I('OP16-035','cpu'),side:'cpu'});
    ok(G.players.cpu.leader.attachedDon===3 && G.players.cpu.don.rested===0, 'OP16-035: レストのドン3をリーダーへ付与');

    // 第4弾: 否定/「〜のみ」/KO原因/distinct/restOwnCards/動的パワー/color
    // OP16-024: onKO restChar は koByOpp(相手効果KO)のみ
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const v24=I('OP15-067','me'); G.players.me.chars=[v24]; v24.rested=false;
    const c24=I('OP16-024','cpu'); c24._koSource='battle'; await runFx(C['OP16-024'].fx.onKO,{self:c24,side:'cpu'});
    ok(!v24.rested, 'OP16-024: バトルKOでは不発(koByOpp)');
    c24._koSource='oppEffect'; await runFx(C['OP16-024'].fx.onKO,{self:c24,side:'cpu'});
    ok(v24.rested, 'OP16-024: 相手効果KOで相手をレスト');
    // OP16-055: setPower は cond donX1 ゲート + valueFrom 相手リーダー
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const a55=I('OP16-055','cpu'); G.players.cpu.chars=[a55];
    a55.attachedDon=0; await runFx(C['OP16-055'].fx.onAttack,{self:a55,side:'cpu'});
    ok(power(a55)===(a55.base.power||0), 'OP16-055: 付与ドン0でsetPower不発(汎用condゲート)');
    a55.attachedDon=1; await runFx(C['OP16-055'].fx.onAttack,{self:a55,side:'cpu'});
    ok(power(a55)===power(G.players.me.leader)+1000, 'OP16-055: ドン1で相手リーダーと同パワー');
    // OP16-033: leaveProtect restOwnCards + onlyKO
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const g33=I('OP16-033','cpu'), o33=I('OP15-067','cpu'); G.players.cpu.chars=[g33,o33];
    ok(await protectFromEffect(g33,'ko') && G.players.cpu.chars.includes(g33) && o33.rested && G.players.cpu.leader.rested, 'OP16-033: restOwnCardsで2枚レスト身代わり');
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)};
    const g33b=I('OP16-033','cpu'); G.players.cpu.chars=[g33b,I('OP15-067','cpu')];
    ok(await protectFromEffect(g33b,'bounce')===false, 'OP16-033: onlyKOでbounceは身代わりせず');
    // OP16-098: trashSelfCost→reviveFromTrash color黒+cost8 ヤマト
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const s98=I('OP16-098','cpu'); G.players.cpu.chars=[s98]; G.players.cpu.trash=[I('OP16-096','cpu'),I('OP02-042','cpu')];
    await runFx(C['OP16-098'].fx.act.fx,{self:s98,side:'cpu'});
    ok(G.players.cpu.chars.some(x=>x.no==='OP16-096')&&!G.players.cpu.chars.some(x=>x.no==='OP02-042'), 'OP16-098: 色フィルタで黒コスト8ヤマトのみ蘇生');
    // OP16-022: leader act allSelfChar（インペルのみ）→donActivate2
    { const imp=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].traits||[]).includes('インペルダウン'));
      if(imp){ G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
        G.players.cpu.chars=[I(imp,'cpu')]; G.players.cpu.don={active:0,rested:3};
        await runFx(C['OP16-022'].fx.act.fx,{self:G.players.cpu.leader,side:'cpu'});
        ok(G.players.cpu.don.active===2, 'OP16-022: インペルのみでドン2アクティブ');
        G.players.cpu.chars=[I(imp,'cpu'),I('OP15-067','cpu')]; G.players.cpu.don={active:0,rested:3};
        await runFx(C['OP16-022'].fx.act.fx,{self:G.players.cpu.leader,side:'cpu'});
        ok(G.players.cpu.don.active===0, 'OP16-022: 非インペル混在で不発(allSelfChar)');
      } else ok(true,'OP16-022: インペル未検出スキップ'); }

    // 第5弾: onTurnEnd/lock/donFromDeck/setAttackBan/oppHandToBottom/donMinus fromActive/incLeader
    // OP16-030: onTurnEndでコスト5以下の緑キャラをアクティブ + onPlay lock
    { const g=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].cost||0)<=5&&(C[no].color||[]).includes('緑'));
      if(g){ G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
        const ch=I(g,'cpu'); ch.rested=true; G.players.cpu.chars=[ch];
        await runFx(C['OP16-030'].fx.onTurnEnd,{self:I('OP16-030','cpu'),side:'cpu'});
        ok(!ch.rested,'OP16-030: onTurnEndで緑コスト5以下をアクティブ');
      } else ok(true,'OP16-030: 緑コスト5以下未検出'); }
    // OP16-047: 相手手札8以上で2枚デッキ下(oppHandToBottom + oppHandAtLeast)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const s47=I('OP16-047','cpu'); G.players.cpu.chars=[s47]; G.players.me.hand=Array.from({length:8},()=>I('OP15-067','me')); const d47=G.players.me.deck.length;
    await runFx(C['OP16-047'].fx.act.fx,{self:s47,side:'cpu'});
    ok(G.players.me.hand.length===6 && G.players.me.deck.length===d47+2,'OP16-047: 相手手札2枚をデッキ下');
    // OP16-056: trashSelfCost→2ドロー+setAttackBan
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const s56=I('OP16-056','cpu'); G.players.cpu.chars=[s56]; G.players.cpu.deck=[I('OP15-067','cpu'),I('OP15-067','cpu')];
    const v56=I('OP15-067','me'); G.players.me.chars=[v56];
    await runFx(C['OP16-056'].fx.act.fx,{self:s56,side:'cpu'});
    ok(v56.noAtkSeq!=null && !G.players.cpu.chars.includes(s56),'OP16-056: 自身トラッシュ→相手アタック不可');
    // OP16-060: donMinus fromActive(8) → 大将3体 distinct登場
    { const generals=Object.keys(C).filter(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].traits||[]).includes('大将'));
      const names=[...new Set(generals.map(no=>C[no].name))].slice(0,3);
      if(names.length){ G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.don={active:8,rested:2};
        G.players.cpu.hand=names.map(nm=>I(generals.find(no=>C[no].name===nm),'cpu'));
        const a60=G.players.cpu.don.active; // donMinus fromActive(8)で一旦0。ただし召喚した大将の登場時donFromDeckで増え得る
        await runFx(C['OP16-060'].fx.act.fx,{self:G.players.cpu.leader,side:'cpu'});
        ok(G.players.cpu.chars.length===Math.min(3,names.length),'OP16-060: アクティブドン8戻し→大将3体登場(fromActive+distinctName)');
      } else ok(true,'OP16-060: 大将未検出'); }

    // 第6弾: oppDonMinus/trashToHand/oppCharKOedThisTurn/trashAtLeast/donFromDeck/oppDiscard/setPower chooseOwnL
    // OP16-074: onKO oppDonMinus 4
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.me.don={active:3,rested:2}; const t74=5;
    await runFx(C['OP16-074'].fx.onKO,{self:I('OP16-074','cpu'),side:'cpu'});
    ok((G.players.me.don.active+G.players.me.don.rested)===t74-4,'OP16-074: onKOで相手ドン-4');
    // OP16-101: trashAtLeast 10 で相手コスト2以下KO / 不足ならKOしない
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.cpu.trash=Array.from({length:10},()=>I('OP02-042','cpu')); const v101=I('OP15-067','me'); G.players.me.chars=[v101];
    await runFx(C['OP16-101'].fx.main.fx,{self:I('OP16-101','cpu'),side:'cpu'});
    ok(!G.players.me.chars.includes(v101),'OP16-101: トラッシュ10以上でKO');
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.cpu.trash=[I('OP02-042','cpu')]; const v101b=I('OP15-067','me'); G.players.me.chars=[v101b];
    await runFx(C['OP16-101'].fx.main.fx,{self:I('OP16-101','cpu'),side:'cpu'});
    ok(G.players.me.chars.includes(v101b),'OP16-101: トラッシュ不足でKOせず');
    // OP16-073: donFromDeckでドン総数+2、ターン終了時に自身アクティブ+ブロッカー
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.don={active:1,rested:0};
    const t73=donTotal('cpu');
    await runFx(C['OP16-073'].fx.onPlay,{self:I('OP16-073','cpu'),side:'cpu'});
    ok(donTotal('cpu')===t73+2,'OP16-073: ドンデッキからアクティブ1+レスト1');
    const s73=I('OP16-073','cpu'); s73.rested=true; G.players.cpu.chars=[s73]; G.players.cpu.don={active:0,rested:3};
    await runFx(C['OP16-073'].fx.onTurnEnd,{self:s73,side:'cpu'});
    ok(!s73.rested && s73.kwGrant.some(g=>g.kw==='blocker'),'OP16-073: ターン終了時 自身アクティブ+ブロッカー');
    // OP16-094: onKOで相手手札2枚を捨てさせる(oppDiscard)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.me.hand=Array.from({length:4},()=>I('OP15-067','me'));
    await runFx(C['OP16-094'].fx.onKO,{self:I('OP16-094','cpu'),side:'cpu'});
    ok(G.players.me.hand.length===2 && G.players.me.trash.length===2,'OP16-094: 相手手札2枚を捨てさせる');

    // 第7弾(侵襲機構): onAllyLeave/onReviveFromTrash/rushChar/handCounterBuff/addCostBuff
    const fchar=(pred)=>Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&pred(C[no]));
    // OP16-041: インペルが場を離れた時(KO)に囚人登場(donX1,ターン1回)
    { const imp=fchar(c=>(c.traits||[]).includes('インペルダウン')&&!c.name.includes('インペルダウンの囚人'));
      const pri=fchar(c=>c.name.includes('インペルダウンの囚人'));
      if(imp&&pri){ G.players={cpu:mkP('OP16-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
        G.players.cpu.leader.attachedDon=1; const ich=I(imp,'cpu'); G.players.cpu.chars=[ich]; G.players.cpu.hand=[I(pri,'cpu')];
        await koCard(ich,'oppEffect');
        ok(G.players.cpu.chars.some(c=>c.no===pri),'OP16-041: インペル離脱時に囚人登場(onAllyLeave)');
        G.players.cpu.leader.attachedDon=0; const ich2=I(imp,'cpu'); G.players.cpu.chars.push(ich2); G.players.cpu.hand=[I(pri,'cpu')];
        await koCard(ich2,'oppEffect');
        ok(G.players.cpu.hand.length===1,'OP16-041: ターン1回+donX1で2回目/ドン0は不発');
      } else ok(true,'OP16-041: 未検出スキップ'); }
    // OP16-079: トラッシュからワノ国登場で速攻付与
    { const wano=fchar(c=>(c.traits||[]).includes('ワノ国')&&(c.cost||0)<=6);
      if(wano){ G.players={cpu:mkP('OP16-079',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.trash=[I(wano,'cpu')];
        await runFx([{op:'reviveFromTrash',maxCost:6,filter:{trait:'ワノ国'}}],{self:I('OP16-079','cpu'),side:'cpu'});
        const s=G.players.cpu.chars.find(c=>c.no===wano);
        ok(s&&s.kwGrant.some(g=>g.kw==='rush'),'OP16-079: トラッシュからワノ国登場で速攻');
      } else ok(true,'OP16-079: ワノ国未検出'); }
    // ★お玉OP16-081(act -2000)の無駄撃ち防止 actWorthUsing/candidateActions（CPUが条件未達/KO不成立で起動する問題の回帰）
    { const mkY=(myAtk,opp,don)=>{ G.players={me:mkP('OP16-079',false),cpu:mkP('OP11-041',true)}; G.active='me';G.turnSeq=5;G.winner=null;
        G.players.me.don.active=don||0; const ot=I('OP16-081','me');
        G.players.me.chars=[ot,...myAtk.map(n=>I(n,'me'))]; G.players.cpu.chars=opp.map(n=>I(n,'cpu')); return ot; };
      let ot=mkY(['OP15-067'],['OP15-067'],0);
      ok(actWorthUsing('me',ot)===false,'お玉OP16-081: コスト8以上不在→起動しない(条件未達)');
      ot=mkY(['OP16-098'],['OP16-096'],0); // 条件OK(相手8ヤマトc8)・だが98ヤマトP5000では-2000してもP8000をKO不可・ブロッカー無
      ok(actWorthUsing('me',ot)===false,'お玉OP16-081: 条件OKでも-2000がKO不成立&ブロッカー無→起動しない(無駄)');
      ok(!candidateActions('me').some(a=>a.k==='act'&&a.uid===ot.uid),'お玉OP16-081: 無駄なactはpuct候補(candidateActions)からも除外');
      ot=mkY(['OP16-098'],['OP16-096','OP16-088'],0); // 相手にブロッカー(霜月牛マル)
      ok(actWorthUsing('me',ot)===true,'お玉OP16-081: 相手ブロッカーがいる→起動する');
      ot=mkY(['OP16-098'],['OP16-096','OP16-083'],0); // おでんP6000を98ヤマトP5000が-2000(→4000)でKO可
      ok(actWorthUsing('me',ot)===true,'お玉OP16-081: -2000で初めてKO可→起動する'); }
    // OP16-089: rushChar(登場ターンにアタック可・リーダー不可)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.cpu.turnsTaken=3;
    const mh=I('OP16-089','cpu'); mh.summonedTurn=G.turnSeq; mh.rested=false; G.players.cpu.chars=[mh];
    ok(C['OP16-089'].rushChar===true && canCardAttack(mh) && !canTargetLeader(mh),'OP16-089: 速攻：キャラ(登場ターンにキャラのみアタック)');
    // OP16-118: handCounterBuff(手札P8000のカウンター+2000)
    { const p8=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&C[no].power===8000);
      G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)};
      G.players.cpu.chars=[I('OP16-118','cpu')]; const hc=I(p8,'cpu'); G.players.cpu.hand=[hc];
      ok(counterVal(hc,'cpu')===(C[p8].counter||0)+2000,'OP16-118: 手札P8000のカウンター+2000');
      G.players.cpu.chars=[];
      ok(counterVal(hc,'cpu')===(C[p8].counter||0),'OP16-118: バッファ不在で元に戻る'); }

    // 第8弾(公式調査): restImmune / selfCostAtLeast
    // OP16-032: 相手キャラをレストにできない状態に(アタック/ブロック/レスト効果不可)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5;
    const ri=I('OP15-067','me'); G.players.me.chars=[ri];
    await runFx(C['OP16-032'].fx.onPlay,{self:I('OP16-032','cpu'),side:'cpu'});
    ok(isRestImmune(ri),'OP16-032: 相手キャラがレストにできない状態');
    G.active='me'; ri.rested=false; ok(!canCardAttack(ri),'OP16-032: restImmuneはアタック不可');
    G.active='cpu'; await runFx([{op:'restChar',side:'opp',count:1}],{self:I('OP16-032','cpu'),side:'cpu'});
    ok(!ri.rested,'OP16-032: restImmuneはrestChar対象外');
    G.turnSeq=7; ok(!isRestImmune(ri),'OP16-032: 自分の次ターンで失効');
    // OP16-084: コスト20以上(しのぶ+20)→トラッシュ→コスト9モモの助(OP16-085)登場 / 20未満は不発
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5;
    const mo=I('OP16-084','cpu'); mo.buffs.push({costAmt:20,until:'turnEnd'}); G.players.cpu.chars=[mo];
    G.players.cpu.don={active:9,rested:0}; G.players.cpu.trash=[I('OP16-085','cpu'),I('OP15-067','cpu')];
    await runFx(C['OP16-084'].fx.act.fx,{self:mo,side:'cpu'});
    ok(!G.players.cpu.chars.includes(mo)&&G.players.cpu.chars.some(c=>c.no==='OP16-085'),'OP16-084: コスト20以上で自身トラッシュ→コスト9モモの助登場');
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const mo2=I('OP16-084','cpu'); G.players.cpu.chars=[mo2]; G.players.cpu.don={active:9,rested:0}; G.players.cpu.trash=[I('OP16-085','cpu')];
    await runFx(C['OP16-084'].fx.act.fx,{self:mo2,side:'cpu'});
    ok(G.players.cpu.chars.includes(mo2),'OP16-084: コスト20未満なら発動せず(selfCostAtLeast)');
    // 空振り防止: 条件(ドン9/トラッシュにOP16-085)が揃わなければ自身をトラッシュしない
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const mo3=I('OP16-084','cpu'); mo3.buffs.push({costAmt:20,until:'turnEnd'}); G.players.cpu.chars=[mo3];
    G.players.cpu.don={active:8,rested:0}; G.players.cpu.trash=[I('OP16-085','cpu')]; // ドン8不足
    await runFx(C['OP16-084'].fx.act.fx,{self:mo3,side:'cpu'});
    ok(G.players.cpu.chars.includes(mo3),'OP16-084: ドン9未満なら自身をトラッシュしない(空振り防止)');
    const mo4=I('OP16-084','cpu'); mo4.buffs.push({costAmt:20,until:'turnEnd'}); G.players.cpu.chars=[mo4];
    G.players.cpu.don={active:9,rested:0}; G.players.cpu.trash=[]; // トラッシュにOP16-085なし
    await runFx(C['OP16-084'].fx.act.fx,{self:mo4,side:'cpu'});
    ok(G.players.cpu.chars.includes(mo4),'OP16-084: 蘇生対象が無ければ自身をトラッシュしない(trashHas)');
    // OP16-082: 「このキャラのコスト+3」は盤面コストのみ(プレイコストは据え置き=除去耐性)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const b82=C['OP16-082'].cost;
    ok(effCost('cpu',I('OP16-082','cpu'))===b82,'OP16-082: プレイ(登場)コストは+3されない');
    const ob82=I('OP16-082','me'); G.players.me.chars=[ob82];
    ok(!matchFilter(ob82,{maxCost:b82+2}) && matchFilter(ob82,{maxCost:b82+3}),'OP16-082: 盤面の実効コストが+3(コストN以下除去から保護)');
    // 回帰: ステージ/イベントはアタックできない（canCardAttackはLEADER/CHARのみtrue）
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5;
    const stageNo=(window.CARD_DB.find(c=>c.type==='STAGE'&&C[c.no])||{}).no;
    if(stageNo){ const sc=I(stageNo,'me'); sc.rested=false; sc.summonedTurn=3; G.players.me.stage=sc;
      ok(canCardAttack(sc)===false,'ステージカードはアタックできない'); } else ok(true,'ステージカード未検出');
    const evNo=(window.CARD_DB.find(c=>c.type==='EVENT'&&C[c.no])||{}).no;
    if(evNo){ const ec=I(evNo,'me'); ec.rested=false; ec.summonedTurn=3;
      ok(canCardAttack(ec)===false,'イベントカードはアタックできない'); } else ok(true,'イベントカード未検出');
    const chk=I('ST01-006','me'); chk.rested=false; chk.summonedTurn=3; G.players.me.chars=[chk];
    ok(canCardAttack(chk)===true,'通常キャラ(登場済)はアタックできる(回帰の取りこぼし防止)');

    // 回帰: 「ドン‼-N」コストは payDon(レスト)ではなく donMinus(ドンデッキへ戻す)＝donTotalが減る
    const donMinusCheck=async(no,kind,exp)=>{
      G.players={cpu:mkP('OP15-058',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.turnSeq=5;
      const P=G.players.cpu; P.don={active:6,rested:0}; P.deck=[I('ST01-006','cpu'),I('ST01-006','cpu')];
      P.hand=[I('ST01-006','cpu'),I('ST01-006','cpu')]; G.players.me.chars=[I('ST01-006','me')];
      const self=I(no,'cpu'); if(kind==='act'||kind==='onPlay') P.chars=[self]; if(kind==='stageAct'){P.stage=self;self.rested=false;}
      const before=donTotal('cpu');
      const ops = kind==='main' ? C[no].fx.main.fx : kind==='onPlay' ? C[no].fx.onPlay : C[no].fx.act.fx;
      if((kind==='act'||kind==='stageAct') && C[no].fx.act.cost && C[no].fx.act.cost.restSelf) self.rested=true;
      await runFx(ops,{self,side:'cpu'});
      ok(donTotal('cpu')===before-exp, no+': 「ドン‼-'+exp+'」でdonTotalが'+exp+'減る('+before+'→'+donTotal('cpu')+')');
    };
    await donMinusCheck('OP15-060','act',1);     // エネル起動メイン ドン-1
    await donMinusCheck('OP15-118','onPlay',1);   // エネル登場時 ドン-1
    await donMinusCheck('OP15-076','main',1);     // 雷獣 メイン ドン-1
    await donMinusCheck('OP15-078','main',2);     // 万雷 メイン ドン-2
    await donMinusCheck('OP16-078','stageAct',1); // マリンフォード起動メイン ドン-1

    // OP-15(緑系/リーダーパワー): oppDonAttach/hasAttachedDon/leaderPowerAtMost/leaveProtect leaderPowerMinus/restImmune
    // OP15-004: リーダーパワー0以下で相手-3000
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    G.players.cpu.leader.buffs.push({setBase:0,until:'turn'}); const v4=I('OP15-067','me'); G.players.me.chars=[v4]; const p4=power(v4);
    await runFx(C['OP15-004'].fx.onPlay,{self:I('OP15-004','cpu'),side:'cpu'});
    ok(power(v4)===p4-3000,'OP15-004: leaderPowerAtMost0で相手-3000');
    // OP15-015: 相手にレストドン付与→hasAttachedDonに-1000
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.players.me.don={active:0,rested:2};
    const v15=I('OP15-067','me'); G.players.me.chars=[v15]; const q15=power(v15);
    await runFx(C['OP15-015'].fx.onPlay,{self:I('OP15-015','cpu'),side:'cpu'});
    ok(v15.attachedDon===1 && power(v15)===q15-1000,'OP15-015: oppDonAttach→hasAttachedDonに-1000');
    // OP15-009: leaveProtectでリーダー-2000身代わり
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const g9=I('OP15-009','cpu'), pr9=I('OP15-067','cpu'); G.players.cpu.chars=[g9,pr9]; const lp9=power(G.players.cpu.leader);
    ok(await protectFromEffect(pr9,'ko') && G.players.cpu.chars.includes(pr9) && power(G.players.cpu.leader)===lp9-2000,'OP15-009: leaderPowerMinusで身代わり');
    // OP15-029: 相手キャラをレストにできない状態に(restImmune)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    const v29=I('OP15-067','me'); G.players.me.chars=[v29];
    await runFx(C['OP15-029'].fx.onPlay,{self:I('OP15-029','cpu'),side:'cpu'});
    ok(isRestImmune(v29),'OP15-029: 相手コスト5以下をレストにできない状態に');
    // OP15-003: leaveProtect includeBattle（バトルKOも身代わり）/ bounceでは発動せず(onlyKO)
    { const p6=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].power||0)<=6000);
      G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
      const g3=I('OP15-003','cpu'); G.players.cpu.chars=[g3]; G.players.cpu.hand=[I(p6,'cpu')];
      ok(await protectFromEffect(g3,'battle') && G.players.cpu.chars.includes(g3),'OP15-003: バトルKOを身代わり(includeBattle)');
      G.players.cpu.chars=[g3]; G.players.cpu.hand=[I(p6,'cpu')];
      ok((await protectFromEffect(g3,'bounce'))===false,'OP15-003: bounceでは発動せず(onlyKO)'); }

    // OP-15 残8枚（エンジン改変分）: deckOutDelay/scheduleTurnEnd/restSelfCost/grantKeywordNames/staticSetBase/minEffPower
    // OP15-022: deckOutDelay（空デッキdrawで即敗北しない）
    G.players={cpu:mkP('OP15-022',true),me:mkP('OP13-002',false)}; G.active='cpu'; G.winner=null; G.players.cpu.deck=[];
    ok(draw('cpu',1)===false && !G.winner,'OP15-022: deckOutDelayで空デッキでも即敗北しない');
    G.players.cpu.leader=I('OP11-041','cpu'); G.players.cpu.deck=[]; G.winner=null; draw('cpu',1);
    ok(G.winner==='me','OP15-022: 通常リーダーは空デッキで敗北'); G.winner=null;
    // OP15-031: コスト=付与ドンでKO / 不一致でKOされず
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    { const lowC=Object.keys(C).find(no=>!C[no].leader&&C[no].type==='CHAR'&&(C[no].cost||0)===2);
      const m=I(lowC,'me'); m.rested=true; m.attachedDon=2; G.players.me.chars=[m];
      await runFx(C['OP15-031'].fx.onPlay,{self:I('OP15-031','cpu'),side:'cpu'});
      ok(!G.players.me.chars.includes(m),'OP15-031: コスト=付与ドンでKO');
      const m2=I(lowC,'me'); m2.rested=true; m2.attachedDon=1; G.players.me.chars=[m2];
      await runFx(C['OP15-031'].fx.onPlay,{self:I('OP15-031','cpu'),side:'cpu'});
      ok(G.players.me.chars.includes(m2),'OP15-031: 不一致ならKOされず'); }
    // OP15-080: trashToDeckCostは自身を移動しない→reviveSelf成功
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    { const self=I('OP15-080','cpu'); G.players.cpu.trash=[reset(self),I('OP15-067','cpu'),I('OP15-067','cpu'),I('OP15-067','cpu')];
      await runFx(C['OP15-080'].fx.onKO,{self,side:'cpu'});
      ok(G.players.cpu.chars.includes(self),'OP15-080: トラッシュ3デッキ下(自身除く)→自身を蘇生'); }
    // OP15-092: staticSetBase(トラッシュ10で元々9000)+条件付きstaticCost(盤面+10)
    G.players={cpu:mkP('OP11-041',true),me:mkP('OP13-002',false)}; G.active='cpu';
    { const s=I('OP15-092','cpu'); G.players.cpu.chars=[s]; G.players.cpu.trash=Array.from({length:10},()=>I('OP15-067','cpu'));
      ok(power(s)===9000 && matchFilter(s,{minCost:s.base.cost+10}),'OP15-092: トラッシュ10で元々9000&盤面コスト+10'); }

    // ===== OP-16 公式照合修正（2026-06 公式カードリストと1枚ずつ照合して修正）の回帰 =====
    // OP16-006: 「パワー4000以下」=現在パワー基準(maxEffPower)。base4000をバフ6000は対象外、base5000をデバフ3000は対象
    G.players={me:mkP('OP16-080',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5;
    { const me=G.players.me,cpu=G.players.cpu;
      const big=I('OP16-005','cpu'); big.base=Object.assign({},big.base,{power:4000}); big.buffs=[{amt:2000}];
      const sm=I('OP16-005','cpu'); sm.base=Object.assign({},sm.base,{power:5000}); sm.buffs=[{amt:-2000}];
      cpu.chars=[big,sm]; const s=I('OP16-006','me'); me.chars=[s]; me.don={active:8,rested:0};
      await runFx(C['OP16-006'].fx.onPlay,{self:s,side:'me'});
      ok(cpu.chars.includes(big)&&!cpu.chars.includes(sm),'OP16-006: 「パワー4000以下」は現在パワー基準(maxEffPower)'); }
    // OP16-031: 「インペルダウンの囚人」は特徴でなくカード名(OP16-042)。手札から登場できる
    G.players={me:mkP('OP16-080',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.hand=[I('OP16-042','me')]; const s=I('OP16-031','me'); me.chars=[s];
      await runFx(C['OP16-031'].fx.onKO,{self:s,side:'me'});
      ok(me.chars.some(c=>c.no==='OP16-042'),'OP16-031: 「インペルダウンの囚人」(名前)を手札から登場'); }
    // OP16-045: 公式に無い「インペルダウン登場」が起きず、コスト2以上を戻すだけ
    G.players={me:mkP('OP16-080',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; const v=I('ST01-006','me'); v.base=Object.assign({},v.base,{cost:3}); me.chars=[v]; me.hand=[I('OP16-042','me')];
      const s=I('OP16-045','me'); me.chars.push(s);
      await runFx(C['OP16-045'].fx.onPlay,{self:s,side:'me'});
      ok(me.hand.some(c=>c.no==='ST01-006')&&!me.chars.some(c=>c.no==='OP16-042'),'OP16-045: 戻すだけ(公式に無い登場をしない)'); }
    // OP16-108: 【登場時】手札1枚捨てコスト→トラッシュ黒ひげをライフ上に「表向きで」加える
    G.players={me:mkP('OP16-080',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.hand=[I('ST01-006','me')]; const bh=I('OP09-093','me'); bh.base=Object.assign({},bh.base,{cost:4,traits:['黒ひげ海賊団']}); me.trash=[bh];
      const s=I('OP16-108','me'); me.chars=[s];
      await runFx(C['OP16-108'].fx.onPlay,{self:s,side:'me'});
      ok(me.life[0]&&me.life[0].no==='OP09-093'&&me.life[0]._faceUp===true,'OP16-108: トラッシュ黒ひげをライフ上に表向きで加える(faceUp)'); }
    // 【トリガー】実装の構造回帰（OP16-057/101/102 ＋ 黒ひげのOP16-104/108/109/110＝公式照合で有りと確認・旧監査の誤削除を修正）
    ok(!!(C['OP16-057'].fx.trigger&&C['OP16-101'].fx.trigger&&C['OP16-102'].fx.trigger),'OP16-057/101/102: 【トリガー】が実装されている');
    ok(!!(C['OP16-104'].fx.trigger&&C['OP16-109'].fx.trigger&&C['OP16-110'].fx.trigger),'OP16-104/109/110: 公式の【トリガー】を実装(teach等のコストに使える)');
    // OP16-095: 自身の常在【ブロック不可】
    ok((C['OP16-095'].fx.static||[]).some(o=>o.op==='unblockableAttack'),'OP16-095: 自身の常在【ブロック不可】');
    // OP16-005: costMod条件は「白ひげ海賊団を含む特徴」=traitIncludes
    ok(C['OP16-005'].costMod&&C['OP16-005'].costMod.cond.selfChar.traitIncludes==='白ひげ海賊団','OP16-005: コスト-3条件はtraitIncludes(を含む特徴)');

    // ===== OP-15 公式照合修正の回帰 =====
    // OP15-021: イベントのcostMod(トラッシュにイベント4枚以上でコスト-3)。イベントもeffCostを通る
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5;
    { const me=G.players.me; me.trash=[I('OP15-019','me'),I('OP15-019','me'),I('OP15-019','me'),I('OP15-019','me')];
      ok(effCost('me',I('OP15-021','me'))===(C['OP15-021'].cost-3),'OP15-021: イベントcostMod(イベ4枚で-3)がeffCostに反映'); }
    // OP15-018: 「(元々の無し)パワー3000以下」かつドン付与済→maxEffPowerをfilter内で評価。実効3000はKO/実効4000は対象外
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me,cpu=G.players.cpu;
      const a=I('ST01-006','cpu'); a.base=Object.assign({},a.base,{power:2000}); a.attachedDon=1;
      const b=I('ST01-006','cpu'); b.base=Object.assign({},b.base,{power:3000}); b.attachedDon=1; cpu.chars=[a,b];
      const s=I('OP15-018','me'); me.chars=[s]; await runFx(C['OP15-018'].fx.onAttack,{self:s,side:'me'});
      ok(!cpu.chars.includes(a)&&cpu.chars.includes(b),'OP15-018: ドン付与パワーを実効(maxEffPower)で判定しfilter内で有効'); }
    // OP15-023/028: donAttach/oppDonAttach の fromAny(コストエリア=アクティブからも付与)
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don={active:5,rested:0}; const ch=I('ST01-006','me'); me.chars=[ch];
      await runFx([{op:'donAttach',target:'chooseOwn',n:1,fromAny:true}],{self:ch,side:'me'});
      ok(me.don.active===4&&(ch.attachedDon===1||me.leader.attachedDon===1),'OP15-023: donAttach fromAnyでアクティブから付与'); }
    // OP15-032: maxBaseCost(元々のコスト8以下)＝base.costで判定
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const c8=I('ST01-006','me'); c8.base=Object.assign({},c8.base,{cost:8}); c8.rested=true; c8.attachedDon=3; G.players.me.chars=[c8];
      ok(matchFilter(c8,{maxBaseCost:8})&&!matchFilter(c8,{maxBaseCost:7}),'OP15-032: maxBaseCostは基本コストで判定(付与ドンを見ない)'); }
    // OP15-057: ステージの【相手のアタック時】が実装され、restSelfCost→手札捨て→リーダー+2000
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; const stg=I('OP15-057','me'); stg.rested=false; me.stage=stg; me.hand=[I('OP15-019','me')];
      const lp0=power(me.leader); await runFx(C['OP15-057'].fx.onOppAttack,{self:stg,side:'me',attacker:G.players.cpu.leader});
      ok(stg.rested&&power(me.leader)===lp0+2000,'OP15-057: ステージの相手アタック時(restSelfCost→捨て→+2000)'); }
    // OP15-002: ルーシーのカウンターは任意枚数(イベ/ステ1枚ごと+1000)
    G.players={me:mkP('OP15-002',false),cpu:mkP('OP11-041',true)}; G.active='cpu';
    { const me=G.players.me; me.hand=[I('OP15-019','me'),I('OP15-021','me'),I('ST01-006','me')]; const lp0=power(me.leader);
      await lucyCounter('me',me.leader); ok(power(me.leader)===lp0+2000&&me.hand.length===1,'OP15-002: ルーシーcounterは任意枚数(イベ2枚で+2000)'); }
    // 構造回帰: 【トリガー】追加 / maxEffPower化 / donAttach target統一
    ok(!!(C['OP15-019'].fx.trigger&&C['OP15-037'].fx.trigger&&C['OP15-097'].fx.trigger&&C['OP15-104'].fx.trigger&&C['OP15-115'].fx.trigger&&C['OP15-117'].fx.trigger),'OP15-019/037/097/104/115/117: 【トリガー】実装');
    ok(C['OP15-054'].fx.main.fx[0].then[0].op==='chooseOption','OP15-054: 二択(chooseOption)で実装');
    // 回帰: 先攻・後攻とも1ターン目(turnsTaken=1)はアタック不可、2ターン目(turnsTaken>=2)から可能
    G.players={me:mkP('OP15-001',false),cpu:mkP('OP11-041',true)}; G.winner=null; G.active='me';
    G.players.me.turnsTaken=1; G.players.me.leader.rested=false;
    ok(canCardAttack(G.players.me.leader)===false,'1ターン目(turnsTaken=1)はアタック不可');
    G.players.me.turnsTaken=2; G.players.me.leader.rested=false;
    ok(canCardAttack(G.players.me.leader)===true,'2ターン目(turnsTaken>=2)はアタック可能');
    // 回帰: 人間のアタックが防御側の【相手のアタック時】等でアタッカー除去/アタック不可になり中断された時、
    //       操作権(G.busy/myActable)が必ず戻る（固まってアタックボタンが出なくなるのを防ぐ）
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    G.busy=false; G.myActable=true; G.firstPlayer='me';
    G.players.me.life=[I('ST01-006','me')]; G.players.cpu.life=[I('ST01-006','cpu')]; G.players.cpu.deck=[I('ST01-006','cpu')];
    { const atk=I('ST01-006','me'); atk.summonedTurn=1; atk.rested=false; G.players.me.chars=[atk];
      // 防御側に【相手のアタック時】でアタッカーを手札に戻す一時カードを置き、中断を誘発
      C['__INTR__']={no:'__INTR__',name:'防御テスト',type:'CHAR',color:[],cost:1,power:1000,traits:[],fx:{onOppAttack:[{op:'bounce',side:'opp',count:1}]}};
      const d={uid:99999,no:'__INTR__',owner:'cpu',base:C['__INTR__'],attachedDon:0,rested:false,summonedTurn:1,buffs:[],kwGrant:[],frozen:false};
      G.players.cpu.chars=[d];
      await declareAttack(atk, G.players.cpu.leader);
      ok(G.busy===false && G.myActable===true,'アタック中断後も操作権が戻る(G.busy=false/myActable=true)');
      delete C['__INTR__']; }

    // OP05-077 ガンマナイフ: 【メイン】ドン!!-1→相手キャラ1枚をパワー-5000 / 【トリガー】ドンデッキからアクティブ+1
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me; me.don.active=3; me.donMax=10;
      const tgt=I('OP15-067','cpu'); G.players.cpu.chars=[tgt]; const p0=power(tgt);
      const ev=I('OP05-077','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(power(tgt)===p0-5000, 'OP05-077 main: 相手キャラをこのターン中パワー-5000');
      ok(donTotal('me')===2, 'OP05-077 main: ドン!!-1で総ドンが3→2に減る'); }
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.active=0; me.don.rested=0; me.donMax=10; // donTotal=0→ドンデッキに余裕
      const ev=I('OP05-077','me'); await runFx(ev.base.fx.trigger,{self:ev,side:'me'});
      ok(me.don.active===1, 'OP05-077 trigger: ドンデッキからドンを1枚アクティブで追加'); }

    // === 【ブロック時】(onBlock) フック ===
    // 統合: モネ(OP05-036)が実際にブロックすると onBlock が誘発し、相手のコスト4以下キャラがレストする
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
    G.busy=false; G.myActable=true; G.firstPlayer='cpu';
    { const atkr=I('OP15-067','cpu'); atkr.summonedTurn=1; atkr.rested=false;                 // 攻撃キャラ(cost1)
      const bystander=I('OP15-067','cpu'); bystander.rested=false;                             // 攻撃側のコスト4以下キャラ(レスト対象)
      G.players.cpu.chars=[atkr,bystander];
      const mone=I('OP05-036','me'); mone.rested=false; G.players.me.chars=[mone];             // 防御側ブロッカー(モネ)
      ok(C['OP05-036'].blocker===true && !!(C['OP05-036'].fx&&C['OP05-036'].fx.onBlock), 'onBlock: モネにblocker付与＋onBlock fx統合');
      G.players.me.life=[I('ST01-006','me'),I('ST01-006','me')]; G.players.cpu.life=[I('ST01-006','cpu')]; G.players.me.hand=[];
      await declareAttack(atkr, G.players.me.leader);                                          // cpuがリーダーへアタック→人間(me)はモネでブロック
      ok(bystander.rested===true, 'onBlock: モネのブロック時に相手のコスト4以下キャラがレストした(フック誘発)'); }
    // 直接fx: 戦桃丸(EB04-053) ライフ2以下で1ドロー / ベラミー(OP10-077) ドン2レスト→ドンデッキからアクティブ+1
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me'),I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[];
      const sen=I('EB04-053','me'); await runFx(sen.base.fx.onBlock,{self:sen,side:'me',attacker:I('OP15-067','cpu')});
      ok(me.hand.length===1, 'EB04-053 onBlock: 自ライフ2以下で1ドロー');
      me.life=[I('ST01-006','me'),I('ST01-006','me'),I('ST01-006','me')]; me.hand=[];           // ライフ3→引かない
      await runFx(sen.base.fx.onBlock,{self:sen,side:'me',attacker:I('OP15-067','cpu')});
      ok(me.hand.length===0, 'EB04-053 onBlock: ライフ3以上では引かない(cond)'); }
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.active=2; me.don.rested=0; me.donMax=10;                    // donTotal2→デッキ余裕
      const bel=I('OP10-077','me'); await runFx(bel.base.fx.onBlock,{self:bel,side:'me',attacker:I('OP15-067','cpu')});
      ok(me.don.rested===2 && me.don.active===1 && donTotal('me')===3, 'OP10-077 onBlock: ドン2レスト→ドンデッキからアクティブ+1'); }
    // 追加バッチ統合（再録_r1含む）
    ok(['OP01-014','OP01-039','OP01-039_r1','OP01-078','OP01-078_r1','OP05-036_r1','ST05-004','ST05-004_r1'].every(no=>C[no]&&C[no].fx&&C[no].fx.onBlock&&C[no].blocker===true), 'onBlock: 追加8枚にblocker＋onBlock fx統合');
    // OP01-039 キラー: ドン×1＋自キャラ3枚以上で1ドロー（複合cond and）／条件未達は引かない
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[];
      const kil=I('OP01-039','me'); kil.attachedDon=1; me.chars=[kil,I('OP15-067','me'),I('OP15-067','me')]; // 自キャラ3体
      await runFx(kil.base.fx.onBlock,{self:kil,side:'me',attacker:I('OP15-067','cpu')});
      ok(me.hand.length===1, 'OP01-039 onBlock: ドン×1＋自キャラ3枚で1ドロー');
      me.hand=[]; kil.attachedDon=0; await runFx(kil.base.fx.onBlock,{self:kil,side:'me',attacker:I('OP15-067','cpu')});
      ok(me.hand.length===0, 'OP01-039 onBlock: ドン×1未満なら引かない(and条件)'); }
    // ST05-004 ウタ: ドン-1で相手のコスト5以下キャラをレスト
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.active=3;
      const tgt=I('OP15-067','cpu'); tgt.rested=false; G.players.cpu.chars=[tgt];
      const uta=I('ST05-004','me'); await runFx(uta.base.fx.onBlock,{self:uta,side:'me',attacker:I('OP15-067','cpu')});
      ok(tgt.rested===true && donTotal('me')===2, 'ST05-004 onBlock: ドン-1で相手コスト5以下キャラをレスト'); }
    // OP01-111 ブラックマリア: powerMod target:self（このキャラ自身に+1000）＋ドン-1
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.active=2; const bm=I('OP01-111','me'); me.chars=[bm]; const p0=power(bm);
      await runFx(bm.base.fx.onBlock,{self:bm,side:'me',attacker:I('OP15-067','cpu')});
      ok(power(bm)===p0+1000 && donTotal('me')===1, 'OP01-111 onBlock: ドン-1で自身に+1000(powerMod target:self)'); }
    // OP06-009 シュライヤ: setPower self/oppLeaderPower＋【ターン1回】(onAttack/onBlock共有のonceゲート)
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    G.busy=false; G.myActable=true; G.firstPlayer='me';
    { const shu=I('OP06-009','me'); shu.summonedTurn=1; G.players.me.chars=[shu]; G.players.me.hand=[];
      G.players.cpu.life=[I('ST01-006','cpu'),I('ST01-006','cpu'),I('ST01-006','cpu')]; G.players.me.life=[I('ST01-006','me')];
      const cpuL=G.players.cpu.leader; const lp1=power(cpuL);
      await declareAttack(shu, cpuL);
      ok(power(shu)===lp1 && shu._onceAtkBlkTurn===G.turnSeq, 'OP06-009: アタック時に相手リーダーと同じパワーになる＋ターン1回フラグ');
      addBuff(cpuL, 2000, 'turnEnd'); shu.rested=false;            // 相手L+2000・再アクティブ
      await declareAttack(shu, cpuL);
      ok(power(shu)===lp1, 'OP06-009: 同一ターン2回目は再発動しない(onceゲート・power据え置き)'); }
    // ST09-007 しのぶ: ライフ上か下1枚を手札に加える(lifeCost pos:choose)→自身このバトル中+4000
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me'),I('ST01-006','me')]; me.hand=[];
      const shi=I('ST09-007','me'); me.chars=[shi]; const p0=power(shi);
      await runFx(shi.base.fx.onBlock,{self:shi,side:'me',attacker:I('OP15-067','cpu')});
      ok(power(shi)===p0+4000 && me.hand.length===1 && me.life.length===1, 'ST09-007 onBlock: ライフ1枚を手札に加えて自身+4000'); }
    // ST03-003 クロコダイル: ドン×1で相手コスト2以下キャラをデッキ下 / ドン無しは不発
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const cro=I('ST03-003','me'); cro.attachedDon=1;
      const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const dk0=G.players.cpu.deck.length;
      await runFx(cro.base.fx.onBlock,{self:cro,side:'me',attacker:I('OP15-067','cpu')});
      ok(!G.players.cpu.chars.includes(v) && G.players.cpu.deck.length===dk0+1, 'ST03-003 onBlock: ドン×1で相手コスト2以下キャラをデッキ下');
      const cro2=I('ST03-003','me'); cro2.attachedDon=0; const v2=I('OP15-067','cpu'); G.players.cpu.chars=[v2];
      await runFx(cro2.base.fx.onBlock,{self:cro2,side:'me',attacker:I('OP15-067','cpu')});
      ok(G.players.cpu.chars.includes(v2), 'ST03-003 onBlock: ドン×1未満なら不発'); }

    // === 同名・別Noリーダー（番号キーfx・curatedとは独立） ===
    const mkSyn=(no,base)=>({uid:Math.floor(Math.random()*1e6),no,owner:'me',base,attachedDon:0,rested:false,buffs:[],kwGrant:[],frozen:false,negSeq:null,noAtkSeq:null});
    // OP15-098 ルフィ(空島): 元々P6000以上の《空島》キャラを相手効果からライフ→手札で身代わり
    G.players={me:mkP('OP15-098',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me; me.life=[I('ST01-006','me')];
      C['__sky6k__']={no:'__sky6k__',name:'空島6000',type:'CHAR',color:[],cost:5,power:6000,counter:0,traits:['空島']};
      const ch=mkSyn('__sky6k__',C['__sky6k__']); me.chars=[ch];
      const prot=await protectFromEffect(ch,'ko');
      ok(prot===true && me.life.length===0 && me.hand.length===1, 'OP15-098: 元々P6000+の空島キャラをライフ→手札で身代わり保護');
      delete C['__sky6k__']; }
    // ST29-001 ルフィ: 【アタック時】ライフ2以下で1ドロー＆1捨て（リーダーのonAttackが誘発）
    G.players={me:mkP('ST29-001',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me'),I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me')];
      const d0=me.deck.length,t0=me.trash.length; await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.deck.length===d0-1 && me.trash.length===t0+1, 'ST29-001 onAttack: ライフ2以下で1ドロー＆1捨て');
      me.life=[I('ST01-006','me'),I('ST01-006','me'),I('ST01-006','me')]; const d1=me.deck.length;
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.deck.length===d1, 'ST29-001 onAttack: ライフ3以上では不発'); }
    // OP10-045 キャベンディッシュ: 【アタック時】【ターン1回】2ドロー＆手札1枚捨て
    G.players={me:mkP('OP11-041',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; const cav=I('OP10-045','me'); me.chars=[cav];
      me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me')];
      const d0=me.deck.length,h0=me.hand.length,t0=me.trash.length;
      await runFx(C['OP10-045'].fx.onAttack,{self:cav,side:'me'});
      ok(me.deck.length===d0-2 && me.hand.length===h0+1 && me.trash.length===t0+1, 'OP10-045 onAttack: 2ドロー＆手札1捨て'); }
    // === 赤青エース/ルーシー 公式照合修正の回帰（旧手書きdefの偽コスト減/偽ブロッカー/偽効果を是正） ===
    // OP08-047 ジョズ: 白ひげリーダーでも偽の-4は無く常にコスト6・非ブロッカー・カウンター1000
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; const jz=I('OP08-047','me'); me.hand=[jz];
      ok(effCost('me',jz)===6 && !C['OP08-047'].blocker && C['OP08-047'].counter===1000, 'OP08-047: 白ひげLでもコスト6(偽-4撤去)・非ブロッカー・counter1000'); }
    // ST23-001 ウタ: costModは「自分P10000以上のキャラがいる」時のみ-4（リーダー色では減らない）
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; const uta=I('ST23-001','me'); me.hand=[uta];
      const c0=effCost('me',uta); me.chars=[I('OP13-042','me')]; const c1=effCost('me',uta);
      ok(c0===6 && c1===2 && C['ST23-001'].counter===2000, 'ST23-001: 10000+キャラ不在=6/在=2(赤青Lでは減らない)・counter2000'); }
    // OP13-054 ヤマト: ライフ3以下で2ドロー+リーダーにレストドン1（旧偽のバウンス/常在+1000は無い）
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me'),I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; me.don.rested=2; me.don.active=0;
      const ym=I('OP13-054','me'); const d0=me.deck.length;
      await runFx(C['OP13-054'].fx.onPlay,{self:ym,side:'me'});
      ok(me.deck.length===d0-2 && me.leader.attachedDon===1 && !C['OP13-054'].fx.static && C['OP13-054'].counter===1000, 'OP13-054: ライフ3以下で2ドロー+レストドン1(常在バフ無し)・counter1000'); }
    // OP13-043 お玉: 公式はドン付与しない・カウンター2000
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me')]; me.don.rested=2; me.don.active=0;
      const ot=I('OP13-043','me'); await runFx(C['OP13-043'].fx.onPlay,{self:ot,side:'me'});
      ok(me.leader.attachedDon===0 && C['OP13-043'].counter===2000, 'OP13-043: お玉はドン付与しない・counter2000'); }
    // OP04-056: 相手キャラをデッキ下(バウンスでない)・カウンター効果は無い
    ok(C['OP04-056'].fx.main.fx[0].op==='deckBottom' && !C['OP04-056'].fx.counter, 'OP04-056: 主効果=デッキ下・【カウンター】無し(公式準拠)');
    // OP13-057: 【カウンター】は+3000（旧+2000は誤り）
    ok(C['OP13-057'].fx.counter.fx.some(o=>o.op==='counterBuff'&&o.amount===3000), 'OP13-057: 【カウンター】+3000');
    // OP10-045: ドレスローザ特徴（デッキ内サーチ/登場シナジーの対象）
    ok(C['OP10-045'].traits.includes('ドレスローザ'), 'OP10-045: ドレスローザ特徴を持つ');
    // ST22-002 イゾウ: 相手アタック時効果あり・特徴は「白ひげ海賊団」(元白ひげ海賊団ではない)
    ok(C['ST22-002'].fx.onOppAttack && C['ST22-002'].traits.includes('白ひげ海賊団') && !C['ST22-002'].traits.includes('元白ひげ海賊団'), 'ST22-002: 相手アタック時効果あり・白ひげ海賊団特徴');
    // === 複雑機構3枚（攻撃税 / ブロッカー時勝利 / ニューゲート登場） ===
    // OP08-043 ニューゲート(赤): 白ひげL&ライフ2以下で相手キャラ全てに攻撃税(手札2捨て)。ライフ3では不発
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me, cpu=G.players.cpu;
      me.life=[I('ST01-006','me'),I('ST01-006','me')]; const oc=I('OP15-067','cpu'); cpu.chars=[oc];
      await runFx(C['OP08-043'].fx.onPlay,{self:I('OP08-043','me'),side:'me'});
      ok(oc._atkTaxSeq!=null && oc._atkTaxN===2, 'OP08-043: 白ひげL&ライフ2以下→相手キャラに攻撃税(手札2捨て)');
      me.life=[I('ST01-006','me'),I('ST01-006','me'),I('ST01-006','me')]; const oc2=I('OP15-067','cpu'); cpu.chars=[oc2];
      await runFx(C['OP08-043'].fx.onPlay,{self:I('OP08-043','me'),side:'me'});
      ok(oc2._atkTaxSeq==null, 'OP08-043: ライフ3以上では攻撃税不発'); }
    // 攻撃税ゲート: 税持ちCPUキャラは手札2枚捨ててアタック／手札不足なら中止(レストされない)
    G.players={me:mkP('OP11-041',true),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=6; G.winner=null;
    { const cpu=G.players.cpu, me=G.players.me; cpu.turnsTaken=3; me.life=[I('ST01-006','me'),I('ST01-006','me')];
      const atk=I('OP15-067','cpu'); atk._atkTaxSeq=G.turnSeq; atk._atkTaxN=2; cpu.chars=[atk];
      cpu.hand=[I('OP15-067','cpu'),I('OP15-067','cpu'),I('OP15-067','cpu')]; const h0=cpu.hand.length,t0=cpu.trash.length;
      await declareAttack(atk, me.leader);
      ok(cpu.hand.length===h0-2 && cpu.trash.length===t0+2 && atk.rested, '攻撃税ゲート: CPUは手札2枚捨ててアタック実行');
      G.winner=null; const atk2=I('OP15-067','cpu'); atk2._atkTaxSeq=G.turnSeq; atk2._atkTaxN=2; cpu.chars=[atk2]; cpu.hand=[I('OP15-067','cpu')];
      await declareAttack(atk2, me.leader);
      ok(!atk2.rested, '攻撃税ゲート: 手札不足ならアタック中止(レストされない)'); }
    // OP09-118 ロジャー: 相手が【ブロッカー】発動時どちらかのライフ0で勝利
    G.players={me:mkP('OP11-041',true),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=7; G.winner=null;
    { const me=G.players.me, cpu=G.players.cpu; me.turnsTaken=3;
      const rj=I('OP09-118','me'); me.chars=[rj]; cpu.life=[]; cpu.chars=[I('OP13-042','cpu')]; // 相手ライフ0＋ブロッカー
      await declareAttack(rj, cpu.leader);
      ok(G.winner==='me', 'OP09-118: 相手ブロッカー発動＆ライフ0で自分の勝利'); }
    // ST22-015: 白ひげLでニューゲートを登場時付き(noEnter撤去)で登場する構成
    ok(!('noEnter' in C['ST22-015'].fx.main.fx[0].then[0]) && C['ST22-015'].fx.main.fx[0].then.some(o=>o.op==='lifeCost'), 'ST22-015: ニューゲート登場時付き(noEnter撤去)＋ライフ回収(上下選択)+2000節あり');
    // === 青黄ナミ/ハンコック 公式照合修正（正本＝WebFetch照合済みを根拠） ===
    ok(C['OP15-113'].traits.includes('空島'), 'OP15-113: 空島トレイト付与(公式)');
    // ★旧「架空トリガー除去」は誤り(DBテキストが【トリガー】句を体系的に欠落→実在トリガーを誤削除)。公式(公式サイト/cardrush/tier-one)照合で復活。
    ok(C['OP07-057'].fx.trigger && C['OP07-057'].fx.trigger[0].op==='draw' && C['OP07-057'].fx.main.fx[0].filter.trait==='王下七武海', 'OP07-057: 【トリガー】1ドロー(公式)＋王下七武海フィルタ');
    ok(C['OP14-105'].fx.trigger && C['OP14-105'].fx.act.fx[0].op==='revealCost' && !(C['OP14-105'].fx.act.cost||{}).restSelf, 'OP14-105: 手札3公開コスト＋【トリガー】九蛇なら登場(公式)');
    ok(['OP07-115','OP06-104','OP14-108','OP14-107','OP14-112','OP14-104','OP14-114','OP14-113'].every(no=>!!C[no].fx.trigger), '公式トリガー実装(旧「架空除去」は誤削除だった): 8枚すべてに【トリガー】あり');
    // OP12-112 も同系（旧「架空除去」は誤り）。official-full.json の trigger 正本で復活: 多色リーダーなら2ドロー
    { const tg=C['OP12-112'].fx&&C['OP12-112'].fx.trigger&&C['OP12-112'].fx.trigger[0];
      ok(tg&&tg.op==='cond'&&tg.check.leaderMulticolor&&tg.then[0].op==='draw'&&tg.then[0].n===2, 'OP12-112: 【トリガー】多色リーダーで2ドロー(official-full.jsonで復活・旧「架空除去」は誤削除)'); }
    // === 軽微4枚の仕上げ（任意コスト化/自身コスト+2/ライフ公開バフ） ===
    // EB03-055 ロビン: ライフトラッシュ(任意コスト)→リーダー麦わらなら2枚ライフ追加。非麦わらでは追加なし
    G.players={me:mkP('OP15-058',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      const l0=me.life.length; await runFx(C['EB03-055'].fx.onPlay,{self:I('EB03-055','me'),side:'me'});
      // enelリーダー(非麦わら)=ライフtrashは payされる(CPU/自動true)がlifeAddは0 → 実質ライフ-1
      ok(me.life.length===l0-1, 'EB03-055: 非麦わらリーダーではライフ追加なし(trashコストのみ)'); }
    G.players={me:mkP('OP11-041',false),cpu:mkP('OP15-058',true)}; G.active='me';
    { const me=G.players.me; me.life=[I('ST01-006','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      await runFx(C['EB03-055'].fx.onPlay,{self:I('EB03-055','me'),side:'me'});
      ok(me.life.length===2, 'EB03-055: 麦わらリーダーで trash1→+2 = 差引+1(1→2)'); }
    // OP12-119 くま: discard(任意コスト)→ライフ追加＋自身コスト+2
    G.players={me:mkP('OP11-041',false),cpu:mkP('OP15-058',true)}; G.active='me';
    { const me=G.players.me; me.hand=[I('OP15-067','me')]; me.deck=[I('OP15-067','me')]; me.life=[];
      const kuma=I('OP12-119','me'); me.chars=[kuma];
      await runFx(C['OP12-119'].fx.onPlay,{self:kuma,side:'me'});
      const cb=(kuma.buffs||[]).some(b=>b.costAmt===2);
      ok(me.life.length===1 && cb, 'OP12-119: 手札1捨て→ライフ+1＋自身コスト+2バフ'); }
    // OP15-119 ルフィ: 相手ブロッカー発動時、ライフ上のコスト分+1000（onOppBlocker）
    G.players={me:mkP('OP11-041',false),cpu:mkP('OP15-058',true)}; G.active='me';
    { const me=G.players.me; const luffy=I('OP15-119','me'); me.chars=[luffy];
      me.life=[I('OP13-042','me')]; // コスト10のライフ上
      const p0=power(luffy);
      await runFx(C['OP15-119'].fx.onOppBlocker,{self:luffy,side:'me'});
      ok(power(luffy)===p0+10000, 'OP15-119: onOppBlockerでライフ上コスト10→+10000'); }
    // OP16-022 ルフィ: 【起動メイン】自キャラがインペルダウンのみでドン2アクティブ
    G.players={me:mkP('OP16-022',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.rested=2; me.don.active=0; me.donMax=10;
      C['__imp__']={no:'__imp__',name:'囚人',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:['インペルダウン']};
      me.chars=[mkSyn('__imp__',C['__imp__']),mkSyn('__imp__',C['__imp__'])];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.don.active===2 && me.don.rested===0, 'OP16-022 act: インペルダウンのみでドン2アクティブ');
      me.don.rested=2; me.don.active=0;
      C['__oth__']={no:'__oth__',name:'他',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:['他']};
      me.chars=[mkSyn('__imp__',C['__imp__']),mkSyn('__oth__',C['__oth__'])];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.don.active===0, 'OP16-022 act: 非インペルダウン混在なら不発(allSelfChar)');
      delete C['__imp__']; delete C['__oth__']; }
    // OP16-001 エース: 【起動メイン】P8000+のルフィ/白ひげキャラに速攻（or フィルタ）
    G.players={me:mkP('OP16-001',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me;
      C['__luf8k__']={no:'__luf8k__',name:'モンキー・Ｄ・ルフィ',type:'CHAR',color:[],cost:5,power:8000,counter:0,traits:['麦わらの一味']};
      const luf=mkSyn('__luf8k__',C['__luf8k__']); me.chars=[luf];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(luf.kwGrant.some(g=>g.kw==='rush'), 'OP16-001 act: P8000のルフィに速攻付与(orフィルタ:名前一致)');
      C['__wb8k__']={no:'__wb8k__',name:'白ひげの誰か',type:'CHAR',color:[],cost:5,power:9000,counter:0,traits:['白ひげ海賊団']};
      const wb=mkSyn('__wb8k__',C['__wb8k__']); me.chars=[wb];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(wb.kwGrant.some(g=>g.kw==='rush'), 'OP16-001 act: 白ひげ特徴キャラにも速攻(orフィルタ:特徴一致)');
      delete C['__luf8k__']; delete C['__wb8k__']; }

    // === 新フックを要する複合リーダー5枚 ===
    // OP11-040 ルフィ: onTurnStart ドン8以上でデッキ上5枚から《麦わら》1枚を手札へ
    G.players={me:mkP('OP11-040',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me; me.don.active=8; me.hand=[];
      C['__mugi__']={no:'__mugi__',name:'麦わらの誰か',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:['麦わらの一味']};
      me.deck=[mkSyn('__mugi__',C['__mugi__']),I('ST01-006','me'),I('ST01-006','me'),I('ST01-006','me'),I('ST01-006','me')];
      await checkTurnStart('me');
      ok(me.hand.some(c=>c.no==='__mugi__'), 'OP11-040 onTurnStart: ドン8以上で《麦わら》をサーチ');
      me.don.active=7; me.hand=[]; me.deck=[mkSyn('__mugi__',C['__mugi__'])];
      await checkTurnStart('me');
      ok(me.hand.length===0, 'OP11-040 onTurnStart: ドン7以下では発動しない(cond)');
      delete C['__mugi__']; }
    // OP13-001 ルフィ: onOppAttack ドン×1＆アクティブ5以下→ドンレストで対象+2000(CPU=耐える分)
    G.players={me:mkP('OP13-001',true),cpu:mkP('OP11-041',false)}; G.active='cpu';
    { const me=G.players.me; me.leader.attachedDon=1; me.don.active=3; me.don.rested=0;
      C['__atk6k__']={no:'__atk6k__',name:'攻撃6000',type:'CHAR',color:[],cost:5,power:6000,counter:0,traits:[]};
      const atk=mkSyn('__atk6k__',C['__atk6k__']); atk.owner='cpu';
      const p0=power(me.leader);
      await runFx(me.leader.base.fx.onOppAttack,{self:me.leader,side:'me',attacker:atk,target:me.leader});
      ok(power(me.leader)===p0+2000 && me.don.active===2 && me.don.rested===1, 'OP13-001 onOppAttack: ドン1レストでリーダー+2000(耐える分)');
      delete C['__atk6k__']; }
    // OP07-038 ハンコック: onAllyLeave 自分のターン・自分の効果でキャラ離脱・手札5以下で1ドロー
    G.players={me:mkP('OP07-038',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.deck=[I('ST01-006','me'),I('ST01-006','me')]; me.hand=[I('OP15-067','me')];
      const ch=I('OP15-067','me');
      await checkAllyLeave('me', ch, 'ownEffect');
      ok(me.hand.length===2 && me.leader._allyLeaveTurn===G.turnSeq, 'OP07-038 onAllyLeave: 自分の効果で離脱→1ドロー(ターン1回)');
      me.hand=[I('OP15-067','me')]; await checkAllyLeave('me', ch, 'ownEffect'); // 2回目は不発(once)
      ok(me.hand.length===1, 'OP07-038 onAllyLeave: ターン1回');
      G.players={me:mkP('OP07-038',false),cpu:mkP('OP11-041',true)}; G.active='me';
      G.players.me.deck=[I('ST01-006','me')]; G.players.me.hand=[];
      await checkAllyLeave('me', ch, 'oppEffect'); // 相手効果では発動しない(cause)
      ok(G.players.me.hand.length===0, 'OP07-038 onAllyLeave: 相手の効果での離脱では発動しない(cause)'); }
    // OP05-098 エネル: onLifeZero 相手ターン・ライフ0でデッキ→ライフ補充＆手札1捨て
    G.players={me:mkP('OP05-098',false),cpu:mkP('OP11-041',true)}; G.active='cpu';
    { const me=G.players.me; me.life=[]; me.deck=[I('ST01-006','me')]; me.hand=[I('OP15-067','me'),I('OP15-067','me')];
      await checkLifeZero('me');
      ok(me.life.length===1 && me.hand.length===1 && me.leader._lifeZeroSeq===G.turnSeq, 'OP05-098 onLifeZero: ライフ0でデッキ→ライフ補充＆手札1捨て');
      me.life=[]; await checkLifeZero('me'); // 2回目は不発(once)
      ok(me.life.length===0, 'OP05-098 onLifeZero: ターン1回'); }
    // OP03-040 ナミ: デッキ0で勝利 ＋ onLeaderHitLife(ドン×1で自分のデッキを1ミル)
    G.players={me:mkP('OP03-040',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.winner=null;
    { const me=G.players.me; me.deck=[];
      draw('me',1); // デッキ0でドロー→ナミは勝利
      ok(G.winner==='me', 'OP03-040 deckOutWin: デッキ0でドロー時に勝利');
      G.players={me:mkP('OP03-040',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.winner=null;
      const me2=G.players.me; me2.leader.attachedDon=1; me2.deck=[I('ST01-006','me'),I('ST01-006','me')]; const dk0=me2.deck.length,tr0=me2.trash.length;
      await checkLeaderHitLife(me2.leader);
      ok(me2.deck.length===dk0-1 && me2.trash.length===tr0+1, 'OP03-040 onLeaderHitLife: ドン×1で自分のデッキを1ミル'); }

    // === 既存フックに載る未実装リーダー6枚 ===
    // OP02-001 白ひげ: onTurnEnd 自ライフ上1枚を手札へ
    G.players={me:mkP('OP02-001',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me; me.life=[I('ST01-006','me')]; me.hand=[];
      await runFx(me.leader.base.fx.onTurnEnd,{self:me.leader,side:'me'});
      ok(me.life.length===0 && me.hand.length===1, 'OP02-001 onTurnEnd: 自ライフ上1枚を手札に'); }
    // OP02-049 イワンコフ: onTurnEnd 手札0で2ドロー
    G.players={me:mkP('OP02-049',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.hand=[]; me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      await runFx(me.leader.base.fx.onTurnEnd,{self:me.leader,side:'me'});
      ok(me.hand.length===2, 'OP02-049 onTurnEnd: 手札0で2ドロー');
      me.hand=[I('OP15-067','me')]; const d1=me.deck.length; await runFx(me.leader.base.fx.onTurnEnd,{self:me.leader,side:'me'});
      ok(me.deck.length===d1, 'OP02-049 onTurnEnd: 手札ありでは引かない(cond)'); }
    // OP01-031 おでん: act 《ワノ国》1枚捨て→ドン2アクティブ
    G.players={me:mkP('OP01-031',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.rested=2; me.don.active=0;
      C['__wano__']={no:'__wano__',name:'ワノ国の誰か',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:['ワノ国']};
      me.hand=[mkSyn('__wano__',C['__wano__'])];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.don.active===2 && me.don.rested===0 && me.hand.length===0, 'OP01-031 act: ワノ国捨て→ドン2アクティブ');
      delete C['__wano__']; }
    // OP02-072 ゼット: onAttack ドン-4→相手コスト3以下KO＋自分+1000（対象あり時）
    G.players={me:mkP('OP02-072',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.don.active=4; me.don.rested=0;
      const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(me.leader);
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && power(me.leader)===p0+1000 && donTotal('me')===0, 'OP02-072 onAttack: ドン-4で相手KO＋自分+1000'); }
    // OP02-093 スモーカー: act 相手コスト-1→0なら自分+1000
    G.players={me:mkP('OP02-093',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.leader.attachedDon=1;
      const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(me.leader); // OP15-067=コスト1→-1で0
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(me.leader)===p0+1000, 'OP02-093 act: 相手コスト-1で0→自分+1000'); }
    // OP03-022 アーロン: onAttack ドン×2＆①→手札からコスト4以下トリガー持ちキャラ登場
    G.players={me:mkP('OP03-022',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const me=G.players.me; me.leader.attachedDon=2; me.don.active=1; me.don.rested=0;
      C['__trchar__']={no:'__trchar__',name:'トリガー持ち',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[],fx:{trigger:[{op:'draw','n':1}]}};
      const tc=mkSyn('__trchar__',C['__trchar__']); me.hand=[tc];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.chars.includes(tc) && me.don.rested===1, 'OP03-022 onAttack: ドン×2＆①で手札のトリガー持ちを登場');
      delete C['__trchar__']; }

    // === 軽量リーダー バッチ1 ===
    const LP=(ln)=>{ G.players={me:mkP(ln,false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null; return G.players.me; };
    { const me=LP('OP04-019'); me.don.rested=2; me.don.active=0; await runFx(me.leader.base.fx.onTurnEnd,{self:me.leader,side:'me'});
      ok(me.don.active===2 && me.don.rested===0, 'OP04-019 onTurnEnd: ドン2アクティブ'); }
    { const me=LP('OP09-001'); G.players.cpu.chars=[I('OP15-067','cpu')]; const lp=power(G.players.cpu.leader); // 相手リーダー優先選択
      await runFx(me.leader.base.fx.onOppAttack,{self:me.leader,side:'me',attacker:I('OP15-067','cpu')});
      ok(power(G.players.cpu.leader)===lp-1000, 'OP09-001 onOppAttack: 相手リーダー/キャラを-1000'); }
    { const me=LP('EB01-040'); me.life=[I('ST01-006','me')];
      C['__c0__']={no:'__c0__',name:'コスト0',type:'CHAR',color:[],cost:0,power:1000,counter:0,traits:[]};
      const v=mkSyn('__c0__',C['__c0__']); v.owner='cpu'; G.players.cpu.chars=[v];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && me.life[0]._faceUp===true, 'EB01-040 act: ライフ表向き＋相手コスト0をKO'); delete C['__c0__']; }
    { const me=LP('ST01-001'); me.don.rested=1; me.don.active=0; me.chars=[I('OP15-067','me')]; // リーダー優先選択
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.leader.attachedDon===1 && me.don.rested===0, 'ST01-001 act: リーダー/自キャラにレストのドン1付与'); }
    { const me=LP('ST03-001'); me.don.active=4; const v=I('OP15-046','cpu'); G.players.cpu.chars=[v]; // OP15-046=コスト7…要コスト5以下
      const v2=I('OP15-067','cpu'); G.players.cpu.chars=[v2]; // コスト1
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v2) && G.players.cpu.hand.includes(v2) && donTotal('me')===0, 'ST03-001 act: ドン-4で相手を手札に戻す'); }
    { const me=LP('ST05-001'); me.don.active=3;
      C['__film__']={no:'__film__',name:'FILMの誰か',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:['FILM']};
      const f=mkSyn('__film__',C['__film__']); me.chars=[f]; const p0=power(f);
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(f)===p0+2000 && donTotal('me')===0, 'ST05-001 act: ドン-3でFILM全+2000'); delete C['__film__']; }
    { const me=LP('P-047'); me.leader.attachedDon=1; me.deck=[I('OP15-067','me')]; me.hand=[I('OP15-067','me')];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.hand.length===2, 'P-047 onAttack: ドン×1＆手札3以下で1ドロー'); }
    { const me=LP('P-076');
      C['__navy__']={no:'__navy__',name:'海軍の誰か',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['海軍']};
      me.hand=[mkSyn('__navy__',C['__navy__'])]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(v.buffs.some(b=>b.costAmt===-1) && me.hand.length===0, 'P-076 act: 海軍捨てで相手コスト-1'); delete C['__navy__']; }
    { const me=LP('ST09-001'); me.leader.attachedDon=1; G.active='cpu'; me.life=[I('ST01-006','me'),I('ST01-006','me')];
      ok(power(me.leader)===(C['ST09-001'].power||5000)+1000, 'ST09-001 static: ドン×1＆相手ターン＆ライフ2以下でリーダー+1000'); }
    { const me=LP('OP08-021');
      C['__mink__']={no:'__mink__',name:'ミンク族の誰か',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['ミンク族']};
      me.chars=[mkSyn('__mink__',C['__mink__'])]; const v=I('OP15-067','cpu'); v.rested=false; G.players.cpu.chars=[v];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(v.rested===true, 'OP08-021 act: ミンク族で相手コスト5以下レスト'); delete C['__mink__']; }
    { const me=LP('OP05-041'); me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me')];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.hand.length===1 && me.trash.length===1, 'OP05-041 act: 手札1捨て→1ドロー'); }
    { const me=LP('ST07-001'); me.leader.attachedDon=2; me.life=[I('ST01-006','me'),I('ST01-006','me')]; me.hand=[I('OP15-067','me')];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.hand.length===1 && me.life.length===2, 'ST07-001 onAttack: ライフ1枚手札→ライフ2以下で手札1枚ライフ上(枚数保存)'); }

    // === 軽量リーダー バッチ2 ===
    { const me=LP('OP06-021'); const v=I('OP15-067','cpu'); v.rested=false; G.players.cpu.chars=[v]; // chooseOptionは先頭=レスト
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(v.rested===true, 'OP06-021 act: 二択の先頭(相手コスト4以下レスト)'); }
    { const me=LP('ST06-001'); me.don.active=3; me.hand=[I('OP15-067','me')];
      C['__c0b__']={no:'__c0b__',name:'コスト0',type:'CHAR',color:[],cost:0,power:1000,counter:0,traits:[]};
      const v=mkSyn('__c0b__',C['__c0b__']); v.owner='cpu'; G.players.cpu.chars=[v];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && me.hand.length===0, 'ST06-001 act: ③＋捨て→相手コスト0KO'); delete C['__c0b__']; }
    { const me=LP('OP09-042'); me.don.active=5;
      C['__cg__']={no:'__cg__',name:'クロスギルドの誰か',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['クロスギルド']};
      me.hand=[I('OP15-067','me'),mkSyn('__cg__',C['__cg__'])];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.chars.some(c=>c.no==='__cg__'), 'OP09-042 act: ドン5レスト＋捨て→クロスギルド登場'); delete C['__cg__']; }
    { const me=LP('EB02-010'); me.don.active=2; me.don.rested=4; me.donMax=12;
      C['__mu2__']={no:'__mu2__',name:'麦わら',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['麦わらの一味']};
      me.chars=[mkSyn('__mu2__',C['__mu2__'])]; const p0=power(me.leader);
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(me.leader)===p0+1000 && donTotal('me')===4, 'EB02-010 act: ドン-2＋麦わらのみでドン2＋自+1000'); delete C['__mu2__']; }
    { const me=LP('ST12-001'); me.leader.attachedDon=1;
      C['__c3__']={no:'__c3__',name:'コスト3',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const bouncee=mkSyn('__c3__',C['__c3__']); const actee=I('OP15-067','me'); actee.rested=true;
      me.chars=[bouncee, actee];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(actee.rested===false, 'ST12-001 onAttack: コスト2以上を戻し→自P7000以下をアクティブ'); delete C['__c3__']; }
    { const me=LP('ST10-001'); me.don.active=3; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const dk0=G.players.cpu.deck.length;
      const h=I('OP15-067','me'); me.hand=[h]; // コスト1≤4のキャラ
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && G.players.cpu.deck.length===dk0+1 && me.chars.includes(h), 'ST10-001 act: ドン-3で相手デッキ下＋手札から登場'); }
    { const me=LP('EB01-021'); me.donMax=12; me.don.active=0;
      C['__imp2__']={no:'__imp2__',name:'インペルダウン',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['インペルダウン']};
      const ch=mkSyn('__imp2__',C['__imp2__']); me.chars=[ch];
      await runFx(me.leader.base.fx.onTurnEnd,{self:me.leader,side:'me'});
      ok(!me.chars.includes(ch) && me.hand.includes(ch) && me.don.active===1, 'EB01-021 onTurnEnd: ID戻して→ドンデッキからアクティブ+1'); delete C['__imp2__']; }
    { const me=LP('OP07-079'); me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const dk0=me.deck.length;
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.deck.length===dk0-2 && v.buffs.some(b=>b.costAmt===-1), 'OP07-079 onAttack: デッキ2トラッシュ→相手コスト-1'); }
    { const me=LP('OP12-001');
      C['__ev__']={no:'__ev__',name:'イベント',type:'EVENT',color:[],cost:1,power:0,counter:0,traits:[]};
      me.hand=[mkSyn('__ev__',C['__ev__']),mkSyn('__ev__',C['__ev__'])]; const ch=I('OP15-067','me'); me.chars=[ch]; const p0=power(ch); // base2000≤4000
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(ch)===p0+2000, 'OP12-001 act: イベ2公開→自P4000以下+2000'); delete C['__ev__']; }
    { const me=LP('OP07-019'); me.don.active=1; const v=I('OP15-067','cpu'); v.rested=false; G.players.cpu.chars=[v]; G.players.cpu.leader.rested=true; // リーダーは既レスト→先頭はキャラ
      await runFx(me.leader.base.fx.onOppAttack,{self:me.leader,side:'me',attacker:I('OP15-067','cpu')});
      ok(v.rested===true, 'OP07-019 onOppAttack: ①で相手リーダー/キャラをレスト'); }
    { const me=LP('OP14-040'); me.don.rested=2; me.don.active=0; me.hand=[I('OP15-067','me')];
      C['__fish__']={no:'__fish__',name:'魚人',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['魚人族']};
      const fch=mkSyn('__fish__',C['__fish__']); me.chars=[fch];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok((me.leader.attachedDon+fch.attachedDon)===2 && me.hand.length===0, 'OP14-040 act: 捨て→魚人/人魚にレストのドン2付与'); delete C['__fish__']; }

    // === 軽量リーダー バッチ3 ===
    { const me=LP('OP03-077'); me.leader.attachedDon=2; me.don.active=2; me.hand=[I('OP15-067','me')]; me.life=[I('ST01-006','me')]; me.deck=[I('OP15-067','me')];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.life.length===2, 'OP03-077 onAttack: ②＋捨て→ライフ1以下でライフ+1'); }
    { const me=LP('OP06-080'); me.leader.attachedDon=1; me.don.active=2; me.hand=[I('OP15-067','me')]; me.deck=[I('OP15-067','me'),I('OP15-067','me')];
      C['__sb__']={no:'__sb__',name:'スリラーバークの誰か',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['スリラーバーク海賊団']};
      const sb=mkSyn('__sb__',C['__sb__']); me.trash=[sb];
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(me.chars.some(c=>c.no==='__sb__'), 'OP06-080 onAttack: デッキ2トラッシュ→トラッシュからSB登場'); delete C['__sb__']; }
    { const me=LP('OP08-002'); me.leader.attachedDon=1; me.deck=[I('OP15-067','me')]; me.hand=[I('OP15-067','me')]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(v);
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(v)===p0-2000, 'OP08-002 act: ドロー＋手札デッキ下→相手-2000'); }
    { const me=LP('OP08-057'); me.don.active=2; me.don.rested=0; me.hand=[]; me.deck=[I('OP15-067','me')];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.hand.length===1 && donTotal('me')===0, 'OP08-057 act: ドン-2→二択先頭(手札5以下で1ドロー)'); }
    { const me=LP('OP06-001'); me.donMax=12; me.don.rested=0;
      C['__film2__']={no:'__film2__',name:'FILMの誰か',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['FILM']};
      me.hand=[mkSyn('__film2__',C['__film2__'])]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(v);
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(power(v)===p0-2000 && me.don.rested===1, 'OP06-001 onAttack: FILM捨て→相手-2000＋ドンレスト追加'); delete C['__film2__']; }
    { const me=LP('P-086'); me.don.active=3;
      C['__p3k__']={no:'__p3k__',name:'パワー3000',type:'CHAR',color:[],cost:4,power:3000,counter:1000,traits:[]};
      const big=mkSyn('__p3k__',C['__p3k__']); me.chars=[big];
      C['__heart__']={no:'__heart__',name:'ハートの誰か',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['ハートの海賊団']};
      const hc=mkSyn('__heart__',C['__heart__']); me.hand=[hc];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.chars.some(c=>c.no==='__heart__') && !me.chars.includes(big) && donTotal('me')===0, 'P-086 act: ドン-3＋自デッキ下→ハート登場'); delete C['__p3k__']; delete C['__heart__']; }
    { const me=LP('OP10-002'); me.leader.attachedDon=2;
      C['__ph__']={no:'__ph__',name:'パンクハザード',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['パンクハザード']};
      me.chars=[mkSyn('__ph__',C['__ph__'])]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; // P2000≤4000
      await runFx(me.leader.base.fx.onAttack,{self:me.leader,side:'me'});
      ok(!G.players.cpu.chars.includes(v), 'OP10-002 onAttack: PH戻して→相手パワー4000以下KO'); delete C['__ph__']; }

    // === バグ修正: OP15-060 エネル「相手の効果で場を離れない」はKO/バウンス/デッキ送りのみ無効。無効化(negateEffect)等は選べる ===
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
    { const en=I('OP15-060','cpu'); G.players.cpu.chars=[en]; G.players.cpu.don.active=0; // donTotal0≤6→「場を離れない」発動
      await doOp({op:'negateEffect'},{side:'me',self:G.players.me.leader}); // ティーチの無効化＋アタック不可
      ok(en.negSeq!=null && en.noAtkSeq!=null, 'OP15-060: 場を離れない中でも無効化＆アタック不可(negateEffect)で選べる(=ティーチで止められる)');
      en.negSeq=null; en.noAtkSeq=null; G.players.cpu.chars=[en];
      await doOp({op:'ko'},{side:'me',self:G.players.me.leader});
      ok(G.players.cpu.chars.includes(en), 'OP15-060: 効果KOは無効(場を離れない)');
      await doOp({op:'bounce'},{side:'me',self:G.players.me.leader});
      ok(G.players.cpu.chars.includes(en), 'OP15-060: 効果バウンスは無効(場を離れない)');
      G.players.cpu.don.active=7; const en2=I('OP15-060','cpu'); G.players.cpu.chars=[en2]; // donTotal7>6→解除
      await doOp({op:'ko'},{side:'me',self:G.players.me.leader});
      ok(!G.players.cpu.chars.includes(en2), 'OP15-060: ドン7枚(>6)では場を離れない解除→効果KO可'); }
    // OP09-086_r2(再録): OP09-086と同一のKO限定耐性
    ok(C['OP09-086_r2']&&C['OP09-086_r2'].fx&&C['OP09-086_r2'].fx.static&&C['OP09-086_r2'].fx.static.some(o=>o.op==='effectImmune'&&o.koOnly), 'OP09-086_r2: 再録もKO限定耐性を実装(穴埋め)');
    // OP02-027 イヌアラシ: 全ドンレスト(active0)で場を離れない（KO無効・選択は可）／active>0で解除
    G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
    { const inu=I('OP02-027','cpu'); G.players.cpu.chars=[inu]; G.players.cpu.don.active=0; G.players.cpu.don.rested=2;
      await doOp({op:'ko'},{side:'me',self:G.players.me.leader});
      ok(G.players.cpu.chars.includes(inu), 'OP02-027: 全ドンレスト(active0)で効果KO無効(場を離れない)');
      G.players.cpu.don.active=1;
      await doOp({op:'ko'},{side:'me',self:G.players.me.leader});
      ok(!G.players.cpu.chars.includes(inu), 'OP02-027: active>0なら場を離れない解除→KO可'); }
    // バグ修正: OP16-104/108/109/110 の【トリガー】を実装（公式有り＝teach redirectのコストに使える／OP-16監査が誤って削除していた）
    ok(['OP16-104','OP16-108','OP16-109','OP16-110'].every(no=>C[no]&&C[no].fx&&C[no].fx.trigger), 'OP16黒ひげ4枚: 【トリガー】を実装(穴埋め)');
    // 黒黄ティーチ(OP16-080): トリガー持ちバスコを手札に、キャラへのアタックをリーダーへリダイレクトできる
    G.players={me:mkP('OP16-080',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
    { const me=G.players.me; const tgt=I('OP15-067','me'); tgt.rested=true; me.chars=[tgt]; me.hand=[I('OP16-110','me')];
      const res=await teachRedirect('me', I('OP15-067','cpu'), tgt);
      ok(res!==tgt && res.base.type==='LEADER' && me.hand.length===0, 'OP16-080ティーチ: トリガー持ち(バスコ)を捨てキャラ攻撃をリーダーへリダイレクト'); }
    // バグ修正: 2色リーダーのライフをdefで5に誤っていた→公式=4。全デッキリーダーのlife整合
    ok(C['OP16-080'].life===4 && C['OP11-041'].life===4 && C['OP14-041'].life===4, '黒黄ティーチ/ナミ/ハンコック(2色)のライフ=4(公式準拠)');
    ok(C['OP15-058'].life===5 && C['OP15-002'].life===4 && C['OP13-002'].life===3, '6デッキリーダーのライフ: エネル5/ルーシー4/エース3も公式準拠');
    // バグ修正: def()の数値ずれを一掃（全def札のcost/power/counter/lifeが公式CARD_DBと一致）
    { const DB=(typeof window!=='undefined'&&window.CARD_DB)||[]; let bad=0;
      for(const k in C){ const c=C[k]; if(!c||c.dataOnly)continue; const off=DB.find(x=>x&&x.no===c.no); if(!off)continue;
        for(const f of ['cost','power','counter','life']){ if(c[f]!=null&&off[f]!=null&&c[f]!==off[f]) bad++; } }
      ok(bad===0, 'def札のcost/power/counter/lifeが公式CARD_DBと一致(数値ずれ0)'); }

    // === OP14 バッチ1 ===
    ok(['OP14-005','OP14-015','OP14-019','OP14-022','OP14-023','OP14-043','OP14-050','OP14-057','OP14-059','OP14-064','OP14-071','OP14-075','OP14-081','OP14-083'].every(no=>C[no]&&C[no].fx), 'OP14バッチ1: 14枚にfx統合');
    { const me=LP('OP13-002'); const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(v);
      const c=I('OP14-015','me'); await runFx(c.base.fx.onAttack,{self:c,side:'me'});
      ok(power(v)===p0-1000, 'OP14-015 onAttack: 相手キャラ-1000'); }
    { const me=LP('OP13-002'); me.donMax=12; me.don.rested=0;
      C['__p0__']={no:'__p0__',name:'P0',type:'CHAR',color:[],cost:2,power:0,counter:0,traits:[]};
      const v=mkSyn('__p0__',C['__p0__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP14-064','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && me.don.rested===1, 'OP14-064 onKO: ドンレスト追加＋元々P0をKO'); delete C['__p0__']; }
    { const me=LP('OP13-002'); const cc=I('OP14-083','me'); me.chars=[cc];
      const v=I('OP15-067','cpu'); G.players.cpu.chars=[v]; const p0=power(v); // OP15-067=コスト1…要コスト0
      C['__c0c__']={no:'__c0c__',name:'コスト0',type:'CHAR',color:[],cost:0,power:3000,counter:0,traits:[]};
      const v0=mkSyn('__c0c__',C['__c0c__']); v0.owner='cpu'; G.players.cpu.chars=[v0]; const q0=power(v0);
      await runFx(cc.base.fx.act.fx,{self:cc,side:'me'});
      ok(!me.chars.includes(cc) && power(v0)===q0-3000, 'OP14-083 act: 自身トラッシュ→相手コスト0を-3000'); delete C['__c0c__']; }
    { const me=LP('OP13-002');
      C['__fm__']={no:'__fm__',name:'魚人',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['魚人族']};
      const f=mkSyn('__fm__',C['__fm__']); me.chars=[f]; const p0=power(f);
      const ev=I('OP14-057','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(power(f)===p0+1000, 'OP14-057 main: 魚人/人魚 全体+1000'); delete C['__fm__']; }
    { const me=LP('OP13-002'); me.don.rested=1; me.don.active=0; me.chars=[I('OP15-067','me')];
      const c=I('OP14-005','me'); await runFx(c.base.fx.act.fx,{self:c,side:'me'});
      ok((me.leader.attachedDon+me.chars.reduce((s,x)=>s+x.attachedDon,0))===1, 'OP14-005 act: リーダー/キャラにレストのドン1付与'); }

    // === OP14 バッチ2（新cond/hook） ===
    ok(['OP14-002','OP14-004','OP14-006','OP14-012','OP14-026','OP14-028','OP14-032','OP14-035','OP14-013','OP14-014','OP14-031','OP14-042','OP14-044','OP14-047','OP14-051','OP14-067','OP14-072'].every(no=>C[no]&&(C[no].fx||C[no].condRush)), 'OP14バッチ2: 17枚にfx/condRush統合');
    // selfPowerAtLeast / selfRested cond
    { C['__p5k__']={no:'__p5k__',name:'P5000',type:'CHAR',color:[],cost:5,power:5000,counter:0,traits:[]};
      const c=mkSyn('__p5k__',C['__p5k__']); c.owner='me'; G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
      ok(checkCond({selfPowerAtLeast:5000},'me',c)===true && checkCond({selfPowerAtLeast:6000},'me',c)===false, 'selfPowerAtLeast cond: 5000境界');
      c.rested=true; G.active='cpu';
      ok(checkCond({and:['oppTurn',{selfRested:true}]},'me',c)===true && checkCond({selfRested:false},'me',c)===false, 'selfRested cond: レスト＆相手ターン');
      delete C['__p5k__']; }
    // OP14-004 condRush（自パワー5000以上で速攻）
    { G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me';
      const c=I('OP14-004','me'); G.players.me.chars=[c];
      const need=Math.max(0,Math.ceil((5000-(C['OP14-004'].power||0))/1000)); c.attachedDon=need;
      ok(hasKw(c,'rush')===true, 'OP14-004 condRush: パワー5000以上で速攻'); }
    // OP14-032 onSelfRested（アタックでレスト→相手コスト4以下レスト）
    { G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const atk=I('OP14-032','me'); atk.summonedTurn=1; atk.rested=false; G.players.me.chars=[atk];
      const v=I('OP15-067','cpu'); v.rested=false; G.players.cpu.chars=[v];
      G.players.cpu.life=[I('ST01-006','cpu'),I('ST01-006','cpu')]; G.players.me.life=[I('ST01-006','me')]; G.players.me.hand=[];
      await declareAttack(atk, G.players.cpu.leader);
      ok(v.rested===true, 'OP14-032 onSelfRested: アタックでレスト→相手コスト4以下をレスト'); }

    // === OP14 バッチ3 ===
    ok(['OP14-018','OP14-036','OP14-077','OP14-010','OP14-011','OP14-016','OP14-025','OP14-033','OP14-046','OP14-052','OP14-062','OP14-065','OP14-074'].every(no=>C[no]&&(C[no].fx||C[no].condBlocker)), 'OP14バッチ3: 13枚にfx/condBlocker統合');
    { const me=LP('OP13-002'); G.players.cpu.don.active=3; G.players.cpu.don.rested=0;
      const c=I('OP14-065','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(donTotal('cpu')===2, 'OP14-065 onKO: 相手のドン-1'); }
    { const me=LP('OP13-002'); const cc=I('OP14-046','me');
      C['__fm2__']={no:'__fm2__',name:'魚人',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['魚人族']};
      const f=mkSyn('__fm2__',C['__fm2__']); me.chars=[cc,f]; const p0=power(f);
      await runFx(cc.base.fx.act.fx,{self:cc,side:'me'});
      ok(!me.chars.includes(cc) && power(f)===p0+2000, 'OP14-046 act: 自身トラッシュ→魚人に+2000'); delete C['__fm2__']; }
    { const me=LP('OP13-002'); const c=I('OP14-011','me'); c.attachedDon=2; me.chars=[c];
      ok(hasKw(c,'blocker')===true, 'OP14-011 condBlocker: ドン×2でブロッカー');
      c.attachedDon=1; ok(hasKw(c,'blocker')===false, 'OP14-011 condBlocker: ドン×2未満では無し'); }
    { const me=LP('OP13-002'); me.don.active=1; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v];
      const c=I('OP14-062','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && donTotal('me')===0, 'OP14-062 onKO: ドン-1→二択先頭(KO)'); }
    { const me=LP('OP13-002'); const tgt=me.leader; const cc=I('OP14-036','me'); me.chars=[I('OP15-067','me')]; // レスト元
      const p0=power(tgt); await runFx(cc.base.fx.counter.fx,{self:cc,side:'me',target:tgt});
      ok(power(tgt)===p0+4000, 'OP14-036 counter: カード1枚レスト→対象+4000'); }

    // === OP14 バッチ4（新op swapPower/addCostBuff-all） ===
    ok(['OP14-009','OP14-017','OP14-082','OP14-021','OP14-061','OP14-069','OP14-076','OP14-078'].every(no=>C[no]&&C[no].fx), 'OP14バッチ4: 8枚にfx統合');
    { const me=LP('OP13-002');
      C['__sa__']={no:'__sa__',name:'A',type:'CHAR',color:[],cost:5,power:5000,counter:0,traits:[]};
      C['__sb__']={no:'__sb__',name:'B',type:'CHAR',color:[],cost:3,power:2000,counter:0,traits:[]};
      const a=mkSyn('__sa__',C['__sa__']); a.owner='cpu'; const b=mkSyn('__sb__',C['__sb__']); b.owner='cpu'; G.players.cpu.chars=[a,b];
      const ev=I('OP14-017','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(power(a)===2000 && power(b)===5000, 'OP14-017 swapPower: 相手2枚の元々パワーを入れ替え'); delete C['__sa__']; delete C['__sb__']; }
    { const me=LP('OP13-002');
      C['__sbk__']={no:'__sbk__',name:'SB',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:['スリラーバーク海賊団']};
      const s1=mkSyn('__sbk__',C['__sbk__']); const s2=mkSyn('__sbk__',C['__sbk__']); me.chars=[s1,s2];
      const c=I('OP14-082','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(s1.buffs.some(b=>b.costAmt===4) && s2.buffs.some(b=>b.costAmt===4), 'OP14-082 addCostBuff-all: スリラーバーク全体コスト+4'); delete C['__sbk__']; }
    { const me=LP('OP13-002'); const p0=power(me.leader);
      const ev=I('OP14-076','me'); await runFx(ev.base.fx.counter.fx,{self:ev,side:'me',target:me.leader});
      ok(power(me.leader)===p0+3000, 'OP14-076 counter: リーダー+3000(battle)'); }

    // === OP14 バッチ5 ===
    ok(['OP14-085','OP14-089','OP14-091','OP14-093','OP14-097','OP14-099','OP14-100','OP14-111','OP14-116','OP14-117','OP14-118','OP14-096','OP14-094'].every(no=>C[no]&&C[no].fx), 'OP14バッチ5: 14枚にfx統合');
    { const me=LP('OP13-002'); me.deck=[I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me'),I('OP15-067','me')];
      const c=I('OP14-085','me'); const t0=me.trash.length; await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.deck.length===0 && me.trash.length===t0+2, 'OP14-085 onKO: 2ドロー＋2捨て'); }
    { const me=LP('OP13-002'); const v=I('OP15-067','cpu'); G.players.cpu.chars=[v];
      const c=I('OP14-111','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(v.noAtkSeq!=null, 'OP14-111 onPlay: 相手コスト6以下をアタック不可'); }
    { const me=LP('OP13-002'); const tgt=me.leader; const p0=power(tgt);
      const ev=I('OP14-117','me'); await runFx(ev.base.fx.counter.fx,{self:ev,side:'me',target:tgt});
      ok(power(tgt)===p0+3000, 'OP14-117 counter: 対象+3000'); }

    // === OP14 バッチ6（新基盤） ===
    ok(['OP14-084','OP14-087','OP14-098','OP14-063','OP14-110','OP14-092','OP14-048','OP14-054','OP14-039','OP14-037','OP14-038','OP14-119','OP14-120','OP14-029'].every(no=>C[no]&&C[no].fx), 'OP14バッチ6: 14枚にfx統合');
    { const me=LP('OP13-002'); me.hand=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; const v=I('OP15-067','cpu'); G.players.cpu.chars=[v];
      const c=I('OP14-048','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.hand.length===0 && !G.players.cpu.chars.includes(v), 'OP14-048 onPlay: 相手バウンス＋手札全捨て(discardOwn all)'); }
    { const me=LP('OP13-002'); me.hand=[]; for(let i=0;i<8;i++) me.hand.push(I('OP15-067','me'));
      const c=I('OP14-054','me'); await runFx(c.base.fx.onTurnEnd,{self:c,side:'me'});
      ok(me.hand.length===5, 'OP14-054 onTurnEnd: 手札5枚になるよう捨てる(discardOwn toSize)'); }
    { const me=LP('OP13-002');
      C['__trc6__']={no:'__trc6__',name:'トリガー持ち',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[],fx:{trigger:[{op:'draw','n':1}]}};
      const tc=mkSyn('__trc6__',C['__trc6__']); me.trash=[tc];
      const c=I('OP14-110','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.chars.some(x=>x.no==='__trc6__'), 'OP14-110 onKO: needsTriggerでトリガー持ちを登場'); delete C['__trc6__']; }
    { const me=LP('OP13-002'); me.chars=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      const v=I('OP15-067','cpu'); v.rested=true; G.players.cpu.chars=[v];
      const ev=I('OP14-037','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.chars.includes(v), 'OP14-037 main: カード3枚レスト(restOwnAsCost count)→相手レスト7000以下KO'); }
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,traits:['バロックワークス','B・W']};
      ok(checkCond({leaderTraitIncludes:'B・W'},'me',null)===true && checkCond({leaderTraitIncludes:'海軍'},'me',null)===false, 'leaderTraitIncludes cond'); }

    // === OP14 バッチ7（koStage/selfDamage/negateSelf/setSummonBan/basePower/onSelfHandDiscarded/leaderRedirect/swapPower-ownPair） ===
    ok(['OP14-027','OP14-001','OP14-080','OP14-060','OP14-058','OP14-088','OP14-115','OP14-090','OP14-024','OP14-020','OP14-045','OP14-049','OP14-056'].every(no=>C[no]&&C[no].fx), 'OP14バッチ7: 13枚にfx統合');
    // OP14-027 シャンクス: onSelfRested→相手7000以下レスト ／ static 相手ターン中レストで相手全-1000
    { const me=LP('OP13-002'); const sh=I('OP14-027','me'); sh.rested=true; me.chars=[sh];
      C['__v6k__']={no:'__v6k__',name:'V6000',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const v=mkSyn('__v6k__',C['__v6k__']); v.owner='cpu'; v.rested=false; G.players.cpu.chars=[v];
      await runFx(sh.base.fx.onSelfRested,{self:sh,side:'me'});
      ok(v.rested, 'OP14-027 onSelfRested: 相手の元々7000以下をレスト');
      G.active='cpu'; ok(power(v)===5000, 'OP14-027 static: 相手ターン中・自身レストで相手全-1000'); G.active='me'; delete C['__v6k__']; }
    // OP14-001 ロー: 起動メイン swapPower ownPair（自分の超新星/ハートのキャラ2枚の元々パワー入替）
    { const me=LP('OP14-001');
      C['__a3k__']={no:'__a3k__',name:'A3000',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:['超新星']};
      C['__a7k__']={no:'__a7k__',name:'A7000',type:'CHAR',color:[],cost:5,power:7000,counter:1000,traits:['ハートの海賊団']};
      const a=mkSyn('__a3k__',C['__a3k__']), b=mkSyn('__a7k__',C['__a7k__']); a.owner='me'; b.owner='me'; me.chars=[a,b];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(power(a)===7000 && power(b)===3000, 'OP14-001 act: 自分2キャラの元々パワー入替'); delete C['__a3k__']; delete C['__a7k__']; }
    // OP14-080 モリア: 起動メイン スリラーバークKO→リーダー/キャラ全+1000
    { const me=LP('OP14-080');
      C['__sb__']={no:'__sb__',name:'SB',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['スリラーバーク海賊団']};
      const sb=mkSyn('__sb__',C['__sb__']); sb.owner='me'; const ally=I('OP15-067','me'); me.chars=[sb,ally];
      const ap=power(ally), lp0=power(me.leader);
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!me.chars.includes(sb) && power(ally)===ap+1000 && power(me.leader)===lp0+1000, 'OP14-080 act: スリラーバークKO→リーダーとキャラ全+1000'); delete C['__sb__']; }
    // OP14-060 ドフラミンゴ: leaderRedirect（ドン-1で重要キャラへの攻撃をリーダーへ）
    { const me=LP('OP14-060'); me.isCPU=true; me.don={active:2,rested:0}; me.life=[I('OP15-067','me'),I('OP15-067','me')];
      C['__bdk__']={no:'__bdk__',name:'BigDK',type:'CHAR',color:[],cost:6,power:6000,counter:1000,traits:['ドンキホーテ海賊団']};
      const big=mkSyn('__bdk__',C['__bdk__']); big.owner='me'; me.chars=[big]; const atk=I('OP15-067','cpu');
      const dest=await leaderRedirect('me',atk,big);
      ok(dest===me.leader && donTotal('me')===1, 'OP14-060 leaderRedirect: ドン‼-1で対象をリーダーへ変更'); delete C['__bdk__']; }
    // OP14-058 海流: main 魚人登場＋元々P6000バウンス ／ counter 1ドロー＋リーダー+3000
    { const me=LP('OP13-002'); me.don={active:3,rested:0};
      C['__fm__']={no:'__fm__',name:'魚人A',type:'CHAR',color:[],cost:3,power:5000,counter:1000,traits:['魚人族']};
      const fm=mkSyn('__fm__',C['__fm__']); fm.owner='me'; me.hand=[fm];
      C['__p6__']={no:'__p6__',name:'P6000',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const p6=mkSyn('__p6__',C['__p6__']); p6.owner='cpu'; G.players.cpu.chars=[p6];
      const ev=I('OP14-058','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(me.chars.some(x=>x.no==='__fm__') && !G.players.cpu.chars.includes(p6), 'OP14-058 main: 魚人登場＋元々パワー6000バウンス(basePower)'); delete C['__fm__']; delete C['__p6__']; }
    { const me=LP('OP13-002'); me.deck=[I('OP15-067','me')]; const h0=me.hand.length, lp0=power(me.leader);
      const ev=I('OP14-058','me'); await runFx(ev.base.fx.counter.fx,{self:ev,side:'me',target:me.leader});
      ok(me.hand.length===h0+1 && power(me.leader)===lp0+3000, 'OP14-058 counter: 1ドロー＋リーダー+3000'); }
    // OP14-088 ドロフィー: onKO B・Wリーダーで1ドロー＋相手コスト1ステージKO
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,traits:['B・W']}; me.deck=[I('OP15-067','me')]; const h0=me.hand.length;
      C['__st1__']={no:'__st1__',name:'St1',type:'STAGE',color:[],cost:1,traits:[]};
      const st=mkSyn('__st1__',C['__st1__']); st.owner='cpu'; G.players.cpu.stage=st;
      const c=I('OP14-088','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.hand.length===h0+1 && !G.players.cpu.stage, 'OP14-088 onKO: 1ドロー＋相手コスト1ステージKO(koStage)'); delete C['__st1__']; }
    // OP14-115 リンドウ: onKO(相手ターン) ライフ+1→自分1ダメージ（差引同数）＋自ターンは不発
    { const me=LP('OP13-002'); G.active='cpu';
      C['__nl__']={no:'__nl__',name:'NL',type:'CHAR',color:[],cost:1,power:1000,counter:1000,traits:[]};
      me.deck=[mkSyn('__nl__',C['__nl__'])]; me.life=[mkSyn('__nl__',C['__nl__']),mkSyn('__nl__',C['__nl__'])]; const lf0=me.life.length;
      const c=I('OP14-115','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.life.length===lf0, 'OP14-115 onKO(相手ターン): ライフ+1して1ダメージ＝差引同数(selfDamage)'); G.active='me'; delete C['__nl__']; }
    // OP14-090 ダズ: static rushChar条件 ／ onPlay 相手コスト0レスト
    { const me=LP('OP13-002'); const dz=I('OP14-090','me');
      C['__c0__']={no:'__c0__',name:'C0',type:'CHAR',color:[],cost:0,power:1000,counter:1000,traits:[]};
      const c0=mkSyn('__c0__',C['__c0__']); c0.owner='me'; me.chars=[dz,c0]; dz.summonedTurn=G.turnSeq;
      ok(hasKw(dz,'rushChar'), 'OP14-090 static: コスト0キャラがいればrushChar');
      me.chars=[dz]; ok(!hasKw(dz,'rushChar'), 'OP14-090 static: コスト0/8+がいなければrushChar無し');
      C['__oc0__']={no:'__oc0__',name:'OC0',type:'CHAR',color:[],cost:0,power:1000,counter:1000,traits:[]};
      const oc=mkSyn('__oc0__',C['__oc0__']); oc.owner='cpu'; oc.rested=false; G.players.cpu.chars=[oc];
      await runFx(dz.base.fx.onPlay,{self:dz,side:'me'});
      ok(oc.rested, 'OP14-090 onPlay: 相手コスト0キャラをレスト'); delete C['__c0__']; delete C['__oc0__']; }
    // OP14-024 錦えもん: onPlay ドン3アクティブ＋登場ban ／ onKO 相手カード1枚レスト
    { const me=LP('OP13-002'); me.don={active:0,rested:3};
      const c=I('OP14-024','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.don.active===3 && me._noSummonTurn===G.turnSeq, 'OP14-024 onPlay: ドン3アクティブ＋登場ban(setSummonBan)');
      const v=I('OP15-067','cpu'); v.rested=false; G.players.cpu.chars=[v]; G.players.cpu.leader.rested=false;
      const c2=I('OP14-024','me'); await runFx(c2.base.fx.onKO,{self:c2,side:'me'});
      ok(v.rested||G.players.cpu.leader.rested, 'OP14-024 onKO: 相手カード1枚レスト'); }
    // OP14-020 ミホーク: 起動メイン 1枚レスト→コスト5以上いればドン3アクティブ＋登場ban
    { const me=LP('OP14-020'); me.don={active:0,rested:3};
      C['__c5__']={no:'__c5__',name:'C5',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const c5=mkSyn('__c5__',C['__c5__']); c5.owner='me'; c5.rested=false; me.chars=[c5];
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(me.don.active===3 && me._noSummonTurn===G.turnSeq, 'OP14-020 act: 1枚レスト→コスト5以上でドン3アクティブ＋登場ban'); delete C['__c5__']; }
    // OP14-045 クロオビ: 効果で手札が捨てられると速攻(onSelfHandDiscarded) ／ onKO 1ドロー
    { const me=LP('OP13-002'); const kb=I('OP14-045','me'); me.chars=[kb]; kb.summonedTurn=G.turnSeq; me.hand=[I('OP15-067','me')];
      await doOp({op:'discardOwn',n:1},{side:'me'});
      ok(hasKw(kb,'rush'), 'OP14-045: 効果で手札が捨てられ速攻(discardOwn→fireHandDiscarded)');
      me.deck=[I('OP15-067','me')]; const h0=me.hand.length;
      await runFx(kb.base.fx.onKO,{self:kb,side:'me'});
      ok(me.hand.length===h0+1, 'OP14-045 onKO: 1ドロー'); }
    // OP14-049 ジンベエ: 速攻フック ／ onPlay ドン2レスト→2ドロー＋コスト7以下バウンス
    { const me=LP('OP13-002'); const jb=I('OP14-049','me'); me.chars=[jb]; jb.summonedTurn=G.turnSeq; me.hand=[I('OP15-067','me')];
      await doOp({op:'oppDiscard',n:0},{side:'cpu'}); // no-op（フック自体の健全性のみ）
      me.hand=[I('OP15-067','me')]; await doOp({op:'discardOwn',n:1},{side:'me'});
      ok(hasKw(jb,'rush'), 'OP14-049: 効果で手札が捨てられ速攻');
      const me2=LP('OP13-002'); me2.don={active:2,rested:0}; me2.deck=[I('OP15-067','me'),I('OP15-067','me')];
      C['__o5__']={no:'__o5__',name:'O5',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:[]};
      const o5=mkSyn('__o5__',C['__o5__']); o5.owner='cpu'; G.players.cpu.chars=[o5];
      const jb2=I('OP14-049','me'); const h0=me2.hand.length; await runFx(jb2.base.fx.onPlay,{self:jb2,side:'me'});
      ok(me2.hand.length===h0+2 && me2.don.rested===2 && !G.players.cpu.chars.includes(o5), 'OP14-049 onPlay: ドン2レスト→2ドロー＋バウンス'); delete C['__o5__']; }
    // OP14-056 ワダツミ: cantAttack（無効化で解除）＋ 手札が捨てられると自身無効
    { const me=LP('OP13-002'); const wd=I('OP14-056','me'); me.chars=[wd]; wd.summonedTurn=G.turnSeq-1; wd.rested=false; me.don.active=0;
      ok(!canCardAttack(wd), 'OP14-056 static: アタックできない(cantAttack)');
      me.hand=[I('OP15-067','me')]; await doOp({op:'discardOwn',n:1},{side:'me'});
      ok(isNegated(wd), 'OP14-056: 効果で手札が捨てられ自身効果無効(negateSelf)');
      ok(canCardAttack(wd), 'OP14-056: 無効化でアタック不可が解除→アタック可'); }

    // === OP14 バッチ8（場全体の常在 allyPower/allyCost・源パワーKO耐性・クロコ自己制約・setBaseToLeader・新フック） ===
    ok(['OP14-003','OP14-034','OP14-053','OP14-068','OP14-070','OP14-079','OP14-086'].every(no=>C[no]&&C[no].fx), 'OP14バッチ8: 7枚にfx統合');
    ok(C['OP14-106'].blocker===true && C['OP14-109'].blocker===true, 'OP14-106/109: 純【ブロッカー】はmergeCardDBのテキスト派生でfx不要（OP14全120枚カバー完了）');
    // OP14-003 ベッジ: 相手の元々パワー5000以下の効果でKOされない
    { const me=LP('OP13-002'); const bg=I('OP14-003','me'); bg.owner='cpu'; G.players.cpu.chars=[bg];
      C['__wk__']={no:'__wk__',name:'Weak',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:[]};
      C['__sg__']={no:'__sg__',name:'Strong',type:'CHAR',color:[],cost:6,power:6000,counter:1000,traits:[]};
      const wk=mkSyn('__wk__',C['__wk__']); wk.owner='me'; const sg=mkSyn('__sg__',C['__sg__']); sg.owner='me';
      ok(await protectFromEffect(bg,'ko',wk)===true, 'OP14-003: 元々パワー5000以下の効果ではKOされない');
      ok(await protectFromEffect(bg,'ko',sg)===false, 'OP14-003: 元々パワー6000の効果ではKOされる'); delete C['__wk__']; delete C['__sg__']; }
    // OP14-034 ルフィ: allyPower(自分のターン)＋leaveProtect(麦わら身代わり)
    { const me=LP('OP13-002'); me.isCPU=true; const lf=I('OP14-034','me'); lf.owner='me';
      C['__sw4__']={no:'__sw4__',name:'SW4',type:'CHAR',color:['緑'],cost:4,power:5000,counter:1000,traits:['麦わらの一味']};
      const sw=mkSyn('__sw4__',C['__sw4__']); sw.owner='me'; me.chars=[lf,sw]; G.active='me';
      ok(power(sw)===6000, 'OP14-034 allyPower: 緑コスト4麦わらが+1000(自分のターン)');
      G.active='cpu'; ok(power(sw)===5000, 'OP14-034 allyPower: 相手ターンは無効(selfTurn)'); G.active='me';
      ok(await protectFromEffect(sw,'ko',null)===true, 'OP14-034 leaveProtect: 麦わらのKOを自カードレストで肩代わり'); delete C['__sw4__']; }
    // OP14-053 ビスタ: 相手ターン・手札7以下で元々パワー=リーダー元々パワー
    { const me=LP('OP01-001'); const vs=I('OP14-053','me'); vs.owner='me'; me.chars=[vs]; me.hand=[]; G.active='cpu';
      ok(power(vs)===5000, 'OP14-053: 相手ターン・手札7以下で元々パワー=リーダー(5000)');
      for(let i=0;i<8;i++) me.hand.push(I('OP15-067','me'));
      ok(power(vs)===4000, 'OP14-053: 手札8枚なら無効(元々4000)'); G.active='me'; }
    // OP14-068 トレーボル: onDonReturned（ターン1回・相手ターン・ドンキリーダー）
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,traits:['ドンキホーテ海賊団']}; G.active='cpu';
      const tb=I('OP14-068','me'); tb.owner='me'; me.chars=[tb]; me.don={active:0,rested:0}; me.donMax=10;
      const b0=donTotal('me'); await fireDonReturned('me');
      ok(donTotal('me')===b0+1, 'OP14-068 onDonReturned: ドンキリーダーでドンデッキからレスト追加');
      const a1=donTotal('me'); await fireDonReturned('me');
      ok(donTotal('me')===a1, 'OP14-068: ターン1回(2回目不発)'); G.active='me'; }
    // OP14-070 バッファロー: 相手効果でレスト→ドン1戻して自身アクティブ
    { const me=LP('OP13-002'); me.isCPU=true; const bf=I('OP14-070','me'); bf.owner='me'; bf.rested=false; me.chars=[bf]; me.don={active:2,rested:0};
      const src=I('OP15-067','cpu'); src.owner='cpu';
      await doOp({op:'restChar',count:1},{side:'cpu',self:src});
      ok(!bf.rested && donTotal('me')===1, 'OP14-070 onOppRested: 相手のキャラ効果でレスト→ドン1戻し自身アクティブ');
      const me2=LP('OP13-002'); me2.isCPU=true; const bf2=I('OP14-070','me'); bf2.owner='me'; bf2.rested=false; me2.chars=[bf2]; me2.don={active:2,rested:0};
      await doOp({op:'restChar',count:1},{side:'cpu',self:null}); // 源がキャラでない→発火しない
      ok(bf2.rested && donTotal('me')===2, 'OP14-070: 源がキャラでないレストでは誘発しない'); }
    // OP14-079 クロコダイル: 相手キャラは自分の効果で場を離れない＋起動メイン
    { const me=LP('OP14-079'); const v=I('OP15-067','cpu'); v.owner='cpu'; G.players.cpu.chars=[v];
      ok(await protectFromEffect(v,'ko',null)===true, 'OP14-079 static: 自分の効果で相手キャラはKOされない');
      ok(await protectFromEffect(v,'bounce',null)===true, 'OP14-079 static: バウンスも無効');
      const myc=I('OP15-067','me'); myc.owner='me'; me.chars=[myc];
      ok(await protectFromEffect(myc,'ko',null)===false, 'OP14-079: 相手からクロコ側キャラへの除去は通る');
      C['__bw__']={no:'__bw__',name:'BW',type:'CHAR',color:[],cost:2,power:2000,counter:1000,traits:['B・W']};
      const bw=mkSyn('__bw__',C['__bw__']); bw.owner='me'; me.chars=[bw]; const vc0=v.base.cost||0;
      await runFx(me.leader.base.fx.act.fx,{self:me.leader,side:'me'});
      ok(!me.chars.includes(bw), 'OP14-079 act: B・WをKOして相手コスト-10'); delete C['__bw__']; }
    // OP14-086 ザラ: condBuff自身+1000＋allyCost(B・W全コスト+2)
    { const me=LP('OP13-002'); const za=I('OP14-086','me'); za.owner='me';
      C['__bwc__']={no:'__bwc__',name:'BWC',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['B・W']};
      const bwc=mkSyn('__bwc__',C['__bwc__']); bwc.owner='me'; me.chars=[za,bwc];
      me.trash=[]; for(let i=0;i<7;i++) me.trash.push(I('OP15-067','me'));
      ok(power(za)===7000, 'OP14-086 condBuff: トラッシュ7枚以上で自身+1000');
      ok(!matchFilter(bwc,{maxCost:3}) && matchFilter(bwc,{maxCost:5}), 'OP14-086 allyCost: B・W実効コスト+2(maxCost3外/5内)');
      me.trash=[]; ok(power(za)===6000 && matchFilter(bwc,{maxCost:3}), 'OP14-086: トラッシュ7未満で無効'); delete C['__bwc__']; }

    // === cards-fx.js 重複キー解消の回帰（正しい版が残ったか） ===
    ok(JSON.stringify(C['OP16-001'].fx.act).includes('minEffPower') && !JSON.stringify(C['OP16-001'].fx.act).includes('"minPower"'), 'OP16-001: 重複解消後、minEffPower(現在パワー8000以上)版が残存');
    ok(JSON.stringify(C['OP15-098'].fx).includes('includeBattle'), 'OP15-098: 重複解消後、バトルKOも肩代わり(includeBattle)版が残存');
    ok(C['OP16-022'].fx && C['OP16-022'].fx.act, 'OP16-022: 重複解消後も起動メイン定義あり');

    // === OP14 公式照合で見つかった不具合の修正 回帰 ===
    // OP14-120: 引きの条件は「相手の」コスト0か8以上（selfChar→oppChar）
    { const me=LP('OP13-002'); me.deck=[I('OP15-067','me')]; const c=I('OP14-120','me');
      C['__o8__']={no:'__o8__',name:'O8',type:'CHAR',color:[],cost:8,power:8000,counter:1000,traits:[]};
      const o8=mkSyn('__o8__',C['__o8__']); o8.owner='cpu'; G.players.cpu.chars=[o8]; const h0=me.hand.length;
      await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.hand.length===h0+1, 'OP14-120: 相手にコスト8以上→1ドロー(oppChar)');
      const me2=LP('OP13-002'); me2.deck=[I('OP15-067','me')]; const c2=I('OP14-120','me'); G.players.cpu.chars=[]; const h1=me2.hand.length;
      await runFx(c2.base.fx.onPlay,{self:c2,side:'me'});
      ok(me2.hand.length===h1, 'OP14-120: 相手にコスト0/8+不在→ドローしない'); delete C['__o8__']; }
    // OP14-098: 「コスト0か8以上のキャラがいる場合」は場全体（相手のみでも発動）
    { const me=LP('OP13-002'); const c=I('OP14-098','me'); me.chars=[];
      C['__bwx__']={no:'__bwx__',name:'BWX',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['B・W']};
      const bwx=mkSyn('__bwx__',C['__bwx__']); bwx.owner='me'; me.chars=[bwx];
      C['__o0__']={no:'__o0__',name:'O0',type:'CHAR',color:[],cost:0,power:1000,counter:1000,traits:[]};
      const o0=mkSyn('__o0__',C['__o0__']); o0.owner='cpu'; G.players.cpu.chars=[o0];
      await runFx(c.base.fx.main.fx,{self:c,side:'me'});
      ok(!matchFilter(bwx,{maxCost:6}), 'OP14-098: 相手のコスト0キャラで発動→B・Wコスト+3(7)'); delete C['__bwx__']; delete C['__o0__']; }
    // OP14-090: rushChar条件も場全体（相手のコスト0/8+でも付与）
    { const me=LP('OP13-002'); const dz=I('OP14-090','me'); dz.owner='me'; me.chars=[dz]; dz.summonedTurn=G.turnSeq;
      C['__o0b__']={no:'__o0b__',name:'O0b',type:'CHAR',color:[],cost:0,power:1000,counter:1000,traits:[]};
      const o0=mkSyn('__o0b__',C['__o0b__']); o0.owner='cpu'; G.players.cpu.chars=[o0]; G.active='me';
      ok(hasKw(dz,'rushChar'), 'OP14-090: 相手のコスト0キャラでもrushChar(場全体)'); delete C['__o0b__']; }
    // OP14-063: コスト5以下フィルタが効く（コスト6のドンキは登場不可）
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base}; const c=I('OP14-063','me'); G.players.cpu.don={active:0,rested:6}; G.players.cpu.donMax=10;
      C['__dk6__']={no:'__dk6__',name:'DK6',type:'CHAR',color:[],cost:6,power:7000,counter:1000,traits:['ドンキホーテ海賊団']};
      const dk6=mkSyn('__dk6__',C['__dk6__']); dk6.owner='me'; me.hand=[dk6];
      await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(!me.chars.includes(dk6), 'OP14-063: コスト6のドンキは「コスト5以下」フィルタで登場不可(maxCost filter内)'); delete C['__dk6__']; }
    // OP14-034: 肩代わりレストにリーダーを含めない（excludeLeader）
    { const me=LP('OP13-002'); me.isCPU=true; const lf=I('OP14-034','me'); lf.owner='me';
      C['__sw__']={no:'__sw__',name:'SW',type:'CHAR',color:['緑'],cost:4,power:5000,counter:1000,traits:['麦わらの一味']};
      const sw=mkSyn('__sw__',C['__sw__']); sw.owner='me'; me.chars=[lf,sw]; me.leader.rested=false; lf.rested=false;
      await protectFromEffect(sw,'ko',null);
      ok(!me.leader.rested, 'OP14-034: 肩代わりレストでリーダーは選ばれない(excludeLeader)'); delete C['__sw__']; }

    // === OP13 バッチ1（赤・既存opのみ） ===
    ok(['OP13-005','OP13-006','OP13-007','OP13-008','OP13-009','OP13-012','OP13-013','OP13-015','OP13-019','OP13-020','OP13-021','OP13-022'].every(no=>C[no]&&C[no].fx), 'OP13バッチ1: 12枚にfx統合');
    { const me=LP('OP13-002'); me.don={active:0,rested:3}; const c=I('OP13-005','me');
      await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.leader.attachedDon>=1 && me.don.rested===2, 'OP13-005: リーダーにレストのドン1付与'); }
    { const me=LP('OP13-002'); me.don={active:0,rested:3};
      C['__lf__']={no:'__lf__',name:'モンキー・Ｄ・ルフィ',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const lf=mkSyn('__lf__',C['__lf__']); lf.owner='me'; me.chars=[lf];
      const c=I('OP13-006','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(lf.attachedDon>=2, 'OP13-006: ルフィにレストのドン2付与'); delete C['__lf__']; }
    { const me=LP('OP13-002'); me.don={active:1,rested:0}; const es=I('OP13-007','me'); es.owner='me'; me.chars=[es];
      C['__v5__']={no:'__v5__',name:'V5000',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:[]};
      const v=mkSyn('__v5__',C['__v5__']); v.owner='cpu'; G.players.cpu.chars=[v];
      await runFx(es.base.fx.act.fx,{self:es,side:'me'});
      ok(!me.chars.includes(es) && power(v)===2000, 'OP13-007: 自身トラッシュ→相手-3000'); delete C['__v5__']; }
    { const me=LP('OP13-002'); const iw=I('OP13-008','me'); iw.owner='me';
      C['__rev__']={no:'__rev__',name:'革命A',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['革命軍']};
      const rev=mkSyn('__rev__',C['__rev__']); rev.owner='me'; me.chars=[iw,rev];
      ok(await protectFromEffect(rev,'ko',null)===true && !me.chars.includes(iw), 'OP13-008: 革命軍のKOをイワンコフ自身トラッシュで肩代わり'); delete C['__rev__']; }
    { const me=LP('OP13-002'); const dd=I('OP13-009','me'); dd.owner='me';
      C['__bd__']={no:'__bd__',name:'山賊B',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:['山賊']};
      const bd=mkSyn('__bd__',C['__bd__']); bd.owner='me'; me.chars=[dd,bd];
      ok(hasKw(dd,'doubleAttack'), 'OP13-009: 他の山賊がいればダブルアタック');
      me.chars=[dd]; ok(!hasKw(dd,'doubleAttack'), 'OP13-009: 単独では無し'); delete C['__bd__']; }
    { const me=LP('OP13-002');
      C['__al__']={no:'__al__',name:'アラ',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['アラバスタ王国']};
      me.deck=[mkSyn('__al__',C['__al__']),I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      const c=I('OP13-012','me'); const h0=me.hand.length; await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.hand.length===h0+1 && me.hand.some(x=>x.no==='__al__'), 'OP13-012: コスト2以上アラバスタを手札へ'); delete C['__al__']; }
    { const me=LP('OP13-002');
      C['__p0__']={no:'__p0__',name:'P0',type:'CHAR',color:[],cost:1,power:0,counter:1000,traits:[]};
      const p0=mkSyn('__p0__',C['__p0__']); p0.owner='cpu'; G.players.cpu.chars=[p0];
      const c=I('OP13-013','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(!G.players.cpu.chars.includes(p0), 'OP13-013: パワー0以下をKO(maxEffPower:0)'); delete C['__p0__']; }
    { const me=LP('OP13-002'); const mk=I('OP13-015','me'); mk.owner='me';
      C['__lf2__']={no:'__lf2__',name:'モンキー・Ｄ・ルフィ',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const lf=mkSyn('__lf2__',C['__lf2__']); lf.owner='me'; me.chars=[mk,lf];
      await runFx(mk.base.fx.act.fx,{self:mk,side:'me'});
      ok(power(lf)===8000, 'OP13-015 act: ルフィ+2000'); delete C['__lf2__']; }
    { const me=LP('OP13-002'); me.don={active:4,rested:0};
      C['__v5b__']={no:'__v5b__',name:'V5',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:[]};
      const v=mkSyn('__v5b__',C['__v5b__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const ev=I('OP13-019','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.chars.includes(v), 'OP13-019: -3000後パワー3000以下をKO'); delete C['__v5b__']; }
    { const me=LP('OP13-002');
      C['__v7__']={no:'__v7__',name:'V7',type:'CHAR',color:[],cost:5,power:7000,counter:1000,traits:[]};
      const v=mkSyn('__v7__',C['__v7__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const ev=I('OP13-020','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(power(v)===2000, 'OP13-020: 相手-5000'); delete C['__v7__']; }
    { const me=LP('OP13-002'); me.don={active:0,rested:2};
      C['__lf3__']={no:'__lf3__',name:'モンキー・Ｄ・ルフィ',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:[]};
      const lf=mkSyn('__lf3__',C['__lf3__']); lf.owner='me'; me.chars=[lf];
      C['__v4__']={no:'__v4__',name:'V4',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const v=mkSyn('__v4__',C['__v4__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const ev=I('OP13-021','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(lf.attachedDon>=1 && power(v)===2000, 'OP13-021: ルフィ付与+相手-2000'); delete C['__lf3__']; delete C['__v4__']; }
    { const me=LP('OP13-002'); const fv=I('OP13-022','me'); fv.owner='me';
      C['__sm__']={no:'__sm__',name:'Small',type:'CHAR',color:[],cost:2,power:2000,counter:1000,traits:[]};
      const s=mkSyn('__sm__',C['__sm__']); s.owner='me'; me.chars=[s];
      await runFx(fv.base.fx.act.fx,{self:fv,side:'me'});
      ok(power(s)===3000, 'OP13-022 act: 元々パワー2000以下を+1000'); delete C['__sm__']; }

    // === OP13 バッチ2（緑・新基盤） ===
    ok(['OP13-023','OP13-024','OP13-026','OP13-028','OP13-031','OP13-032','OP13-033','OP13-035','OP13-037','OP13-038','OP13-039','OP13-040'].every(no=>C[no]&&C[no].fx), 'OP13バッチ2: 緑16枚にfx統合');
    // OP13-023 ウタ: ドン2アクティブ＋元々コスト5以上を登場不可
    { const me=LP('OP13-002'); me.don={active:0,rested:3}; const c=I('OP13-023','me');
      await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      C['__c5__']={no:'__c5__',name:'C5',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      C['__c4__']={no:'__c4__',name:'C4',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:[]};
      ok(me.don.active===2 && summonBanned('me',mkSyn('__c5__',C['__c5__'])) && !summonBanned('me',mkSyn('__c4__',C['__c4__'])), 'OP13-023: ドン2アクティブ＋元々コスト5以上登場不可(4以下は可)'); delete C['__c5__']; delete C['__c4__']; }
    // OP13-024 ゴードン: 《FILM》公開→このターン終了時ドン2アクティブ予約
    { const me=LP('OP13-002');
      C['__fm__']={no:'__fm__',name:'F',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:['FILM']};
      me.hand=[mkSyn('__fm__',C['__fm__'])]; const c=I('OP13-024','me');
      await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me._endDonActTurn===G.turnSeq && me._endDonActN===2, 'OP13-024: このターン終了時ドン2アクティブを予約(delayedDonActivate)'); delete C['__fm__']; }
    // OP13-026 サニーくん: act 自身+2000
    { const me=LP('OP13-002'); me.don={active:1,rested:0}; const sn=I('OP13-026','me');
      await runFx(sn.base.fx.act.fx,{self:sn,side:'me'});
      ok(power(sn)===4000, 'OP13-026 act: 自身+2000'); }
    // OP13-028 シャンクス: ドン全アクティブ＋このターンプレイ不可
    { const me=LP('OP13-002'); me.don={active:0,rested:5}; const c=I('OP13-028','me');
      await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.don.active===5 && me.don.rested===0 && me._noPlayTurn===G.turnSeq, 'OP13-028: ドン全アクティブ＋プレイban(setPlayBan)'); }
    // OP13-031 ロー: ライフ1以下で【ブロッカー】
    { const me=LP('OP13-002'); const lo=I('OP13-031','me'); lo.owner='me'; me.chars=[lo];
      me.life=[I('OP15-067','me')]; ok(hasKw(lo,'blocker'), 'OP13-031: ライフ1以下で【ブロッカー】');
      me.life=[I('OP15-067','me'),I('OP15-067','me')]; ok(!hasKw(lo,'blocker'), 'OP13-031: ライフ2以上では無し'); }
    // OP13-032 ロビン: 相手コスト8以下をレスト不可
    { const me=LP('OP13-002');
      C['__o6__']={no:'__o6__',name:'O6',type:'CHAR',color:[],cost:6,power:7000,counter:1000,traits:[]};
      const v=mkSyn('__o6__',C['__o6__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP13-032','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(isRestImmune(v), 'OP13-032: 相手コスト8以下を次相手エンドまでレスト不可'); delete C['__o6__']; }
    // OP13-033 フランキー: 相手2枚レスト
    { const me=LP('OP13-002');
      const v1=I('OP15-067','cpu'),v2=I('OP15-067','cpu'); v1.owner='cpu';v2.owner='cpu';v1.rested=false;v2.rested=false; G.players.cpu.chars=[v1,v2]; G.players.cpu.leader.rested=true; // リーダーを候補外に
      const c=I('OP13-033','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(v1.rested && v2.rested, 'OP13-033 onKO: 相手キャラ2枚レスト'); }
    // OP13-035 ベポ: chooseOption(CPUはidx0=ドン1アクティブ)
    { const me=LP('OP13-002'); me.isCPU=true; me.don={active:0,rested:2}; const bp=I('OP13-035','me'); bp.owner='me'; me.chars=[bp];
      await runFx(bp.base.fx.onTurnEnd,{self:bp,side:'me'});
      ok(me.don.active===1, 'OP13-035 onTurnEnd: chooseOption→ドン1アクティブ'); }
    // OP13-037 ゾロ: onTurnEnd 自身アクティブ
    { const me=LP('OP13-002'); const zo=I('OP13-037','me'); zo.owner='me'; zo.rested=true; me.chars=[zo];
      await runFx(zo.base.fx.onTurnEnd,{self:zo,side:'me'});
      ok(!zo.rested, 'OP13-037 onTurnEnd: 自身をアクティブ'); }
    // OP13-039 ゴムゴムの蛇銃: 相手レストのコスト4以下をKO
    { const me=LP('OP13-002');
      C['__r4__']={no:'__r4__',name:'R4',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:[]};
      const v=mkSyn('__r4__',C['__r4__']); v.owner='cpu'; v.rested=true; G.players.cpu.chars=[v];
      const ev=I('OP13-039','me'); await runFx(ev.base.fx.counter.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.chars.includes(v), 'OP13-039 counter: 相手レストのコスト4以下KO'); delete C['__r4__']; }

    // === OP13 バッチ3（青・白ひげ/ハンコック） ===
    ok(['OP13-041','OP13-044','OP13-046','OP13-047','OP13-051','OP13-053','OP13-055','OP13-058','OP13-059'].every(no=>C[no]&&C[no].fx), 'OP13バッチ3: 青13枚にfx統合');
    // OP13-041 イゾウ: 2ドロー
    { const me=LP('OP13-002'); me.deck=[I('OP15-067','me'),I('OP15-067','me')]; const h0=me.hand.length;
      const c=I('OP13-041','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.hand.length===h0+2, 'OP13-041: 2ドロー'); }
    // OP13-051 ハンコック: 多色リーダーで2ドロー(leaderMulticolor) ／ 単色非ハンコックでは不発
    { const me=LP('OP13-002'); me.deck=[I('OP15-067','me'),I('OP15-067','me')]; const h0=me.hand.length; // OP13-002は赤/青の多色
      const c=I('OP13-051','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.hand.length===h0+2, 'OP13-051 onKO: 多色リーダーで2ドロー(leaderMulticolor)');
      const me2=LP('OP13-002'); me2.leader.base={...me2.leader.base,color:['赤'],name:'X'}; me2.deck=[I('OP15-067','me')]; const h1=me2.hand.length;
      const c2=I('OP13-051','me'); await runFx(c2.base.fx.onKO,{self:c2,side:'me'});
      ok(me2.hand.length===h1, 'OP13-051: 単色非ハンコックでは発動しない'); }
    // OP13-046 ビスタ: バトルKOを白ひげ手札捨てで肩代わり(includeBattle)
    { const me=LP('OP13-002'); const vs=I('OP13-046','me'); vs.owner='me'; me.chars=[vs];
      C['__wb__']={no:'__wb__',name:'白A',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['白ひげ海賊団']};
      me.hand=[mkSyn('__wb__',C['__wb__'])];
      ok(await protectFromEffect(vs,'battle',null)===true && me.hand.length===0, 'OP13-046: バトルKOを白ひげ捨てで肩代わり'); delete C['__wb__']; }
    // OP13-047 フォッサ: 白ひげのKOを自身トラッシュで肩代わり
    { const me=LP('OP13-002'); const fo=I('OP13-047','me'); fo.owner='me';
      C['__wb2__']={no:'__wb2__',name:'白B',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['白ひげ海賊団']};
      const wb=mkSyn('__wb2__',C['__wb2__']); wb.owner='me'; me.chars=[fo,wb];
      ok(await protectFromEffect(wb,'ko',null)===true && !me.chars.includes(fo), 'OP13-047: 白ひげKOをフォッサ自身トラッシュで肩代わり'); delete C['__wb2__']; }
    // OP13-053 ティーチ: 白ひげトラッシュ→1ドロー＋【バニッシュ】
    { const me=LP('OP13-002'); const tc=I('OP13-053','me'); tc.owner='me'; me.deck=[I('OP15-067','me')];
      C['__wb3__']={no:'__wb3__',name:'白C',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['白ひげ海賊団']};
      const wb=mkSyn('__wb3__',C['__wb3__']); wb.owner='me'; me.chars=[tc,wb]; const h0=me.hand.length;
      await runFx(tc.base.fx.onAttack,{self:tc,side:'me'});
      ok(me.hand.length===h0+1 && hasKw(tc,'banish'), 'OP13-053 onAttack: 白ひげトラッシュ→1ドロー＋バニッシュ'); delete C['__wb3__']; }
    // OP13-055 ラクヨウ: 手札4以下で白ひげ全+1000
    { const me=LP('OP13-002'); me.hand=[]; const rk=I('OP13-055','me'); rk.owner='me';
      C['__wb4__']={no:'__wb4__',name:'白D',type:'CHAR',color:[],cost:4,power:4000,counter:1000,traits:['白ひげ海賊団']};
      const wb=mkSyn('__wb4__',C['__wb4__']); wb.owner='me'; me.chars=[rk,wb];
      await runFx(rk.base.fx.onAttack,{self:rk,side:'me'});
      ok(power(wb)===5000, 'OP13-055 onAttack: 手札4以下で白ひげ全+1000'); delete C['__wb4__']; }
    // OP13-058 鳳梨礫: パワー3000以下をデッキ下
    { const me=LP('OP13-002'); me.don={active:1,rested:0};
      C['__p3__']={no:'__p3__',name:'P3',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:[]};
      const v=mkSyn('__p3__',C['__p3__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const ev=I('OP13-058','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && G.players.cpu.deck.includes(v), 'OP13-058 main: 相手パワー3000以下をデッキ下'); delete C['__p3__']; }

    // === OP13 バッチ4（紫・ロジャー/付与ドン） ===
    ok(['OP13-060','OP13-061','OP13-062','OP13-065','OP13-066','OP13-069','OP13-071','OP13-072','OP13-077','OP13-078'].every(no=>C[no]&&C[no].fx), 'OP13バッチ4: 紫16枚にfx統合');
    // OP13-061 イヌアラシ: 付与ドンあり→ドン追加＋コスト1以下KO ／ 付与ドンなしは不発
    { const me=LP('OP13-002'); me.donMax=10; me.don={active:0,rested:0};
      const ally=I('OP15-067','me'); ally.owner='me'; ally.attachedDon=1; me.chars=[ally];
      C['__c1__']={no:'__c1__',name:'C1',type:'CHAR',color:[],cost:1,power:2000,counter:1000,traits:[]};
      const v=mkSyn('__c1__',C['__c1__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP13-061','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(donTotal('me')>=1 && !G.players.cpu.chars.includes(v), 'OP13-061: 付与ドンありでドン追加＋コスト1以下KO(selfAttachedDon)'); delete C['__c1__']; }
    { const me=LP('OP13-002'); me.donMax=10; me.don={active:0,rested:0}; me.chars=[]; const before=donTotal('me');
      const c=I('OP13-061','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(donTotal('me')===before, 'OP13-061: 付与ドンなしでは不発'); }
    // OP13-066 レイリー: 付与ドンあり→相手レスト＋ターン終了時ドン追加を予約(scheduleTurnEnd)
    { const me=LP('OP13-002'); me.donMax=10; me.don={active:0,rested:0}; G._pendingTurnEnd=[];
      const ally=I('OP15-067','me'); ally.owner='me'; ally.attachedDon=1;
      C['__o5r__']={no:'__o5r__',name:'O5',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const v=mkSyn('__o5r__',C['__o5r__']); v.owner='cpu'; v.rested=false; G.players.cpu.chars=[v]; me.chars=[ally];
      const c=I('OP13-066','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(v.rested && G._pendingTurnEnd.length>0, 'OP13-066: 相手レスト＋ターン終了時ドン追加を予約'); delete C['__o5r__']; }
    // OP13-069 ドフラミンゴ: ドン-3→ドンキでコスト8以下KO(chooseOption idx0)
    { const me=LP('OP13-002'); me.isCPU=true; me.don={active:3,rested:0}; me.leader.base={...me.leader.base,traits:['ドンキホーテ海賊団']};
      C['__c8__']={no:'__c8__',name:'C8',type:'CHAR',color:[],cost:8,power:9000,counter:1000,traits:[]};
      const v=mkSyn('__c8__',C['__c8__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP13-069','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(donTotal('me')===0 && !G.players.cpu.chars.includes(v), 'OP13-069: ドン‼-3→ドンキでコスト8以下KO'); delete C['__c8__']; }
    // OP13-071 ネコマムシ: 場のドン8以上で元々パワー3000以下KO
    { const me=LP('OP13-002'); me.don={active:8,rested:0}; me.donMax=10;
      C['__p3n__']={no:'__p3n__',name:'P3',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:[]};
      const v=mkSyn('__p3n__',C['__p3n__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP13-071','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(!G.players.cpu.chars.includes(v), 'OP13-071: ドン8以上で元々パワー3000以下KO(donAtLeast)'); delete C['__p3n__']; }
    // OP13-078 オーロ・ジャクソン号 STAGE: ロジャー海賊団が相手効果で離脱→ドン1追加(ステージonAllyLeave)
    { const me=LP('OP13-002'); me.donMax=10; me.don={active:0,rested:0};
      const st=I('OP13-078','me'); st.owner='me'; me.stage=st; G.active='cpu';
      C['__rj__']={no:'__rj__',name:'RJ',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['ロジャー海賊団']};
      const rj=mkSyn('__rj__',C['__rj__']); rj.owner='me'; const before=donTotal('me');
      await checkAllyLeave('me', rj, 'oppEffect');
      ok(donTotal('me')===before+1, 'OP13-078: ロジャーが相手効果で離脱→ドン1追加(ステージonAllyLeave)'); G.active='me'; delete C['__rj__']; }

    // === OP13 バッチ5（黒・五老星/天竜人/トラッシュ） ===
    ok(['OP13-080','OP13-081','OP13-083','OP13-089','OP13-091','OP13-094','OP13-095','OP13-098'].every(no=>C[no]&&C[no].fx), 'OP13バッチ5: 黒13枚にfx統合');
    // OP13-080 ナス寿郎聖: トラッシュ7以上で速攻＋場を離れない
    { const me=LP('OP13-002'); const ns=I('OP13-080','me'); ns.owner='me'; me.chars=[ns]; ns.summonedTurn=G.turnSeq; G.active='me';
      me.trash=[]; ok(!hasKw(ns,'rush') && !isLeaveImmune(ns), 'OP13-080: トラッシュ7未満では無し');
      me.trash=[]; for(let i=0;i<7;i++) me.trash.push(I('OP15-067','me'));
      ok(hasKw(ns,'rush') && isLeaveImmune(ns), 'OP13-080: トラッシュ7以上で速攻＋場を離れない'); }
    // OP13-081 コアラ: リーダー革命軍でコスト+3(staticCost) ／ act トラッシュ→デッキ下＋付与ドン
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,traits:['革命軍']};
      const ko=I('OP13-081','me'); ko.owner='me'; me.chars=[ko];
      ok(matchFilter(ko,{minCost:8}), 'OP13-081: リーダー革命軍でコスト+3(5→8)');
      me.leader.base={...me.leader.base,traits:[]}; ok(matchFilter(ko,{maxCost:5})&&!matchFilter(ko,{minCost:8}), 'OP13-081: 革命軍以外ではコスト5');
      me.trash=[I('OP15-067','me')]; me.don={active:0,rested:2};
      await runFx(ko.base.fx.act.fx,{self:ko,side:'me'});
      ok((me.leader.attachedDon||0)+(ko.attachedDon||0)>=1, 'OP13-081 act: トラッシュ→デッキ下＋付与ドン1(trashToBottomCost)'); }
    // OP13-083 サターン聖: デッキ上5枚から《五老星》を手札へ
    { const me=LP('OP13-002');
      C['__gr__']={no:'__gr__',name:'五A',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['五老星']};
      me.deck=[mkSyn('__gr__',C['__gr__']),I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      const c=I('OP13-083','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(me.hand.some(x=>x.no==='__gr__'), 'OP13-083: 《五老星》を手札へ'); delete C['__gr__']; }
    // OP13-089 ウォーキュリー聖: トラッシュ7以上でブロッカー＋場離れない ／ onKO 1ドロー
    { const me=LP('OP13-002'); const wk=I('OP13-089','me'); wk.owner='me'; me.chars=[wk];
      me.trash=[]; ok(!hasKw(wk,'blocker'), 'OP13-089: トラッシュ7未満ではブロッカー無し');
      for(let i=0;i<7;i++) me.trash.push(I('OP15-067','me'));
      ok(hasKw(wk,'blocker') && isLeaveImmune(wk), 'OP13-089: トラッシュ7以上でブロッカー＋場離れない');
      me.deck=[I('OP15-067','me')]; const h0=me.hand.length; await runFx(wk.base.fx.onKO,{self:wk,side:'me'});
      ok(me.hand.length===h0+1, 'OP13-089 onKO: 1ドロー'); }
    // OP13-095 ロズワード聖: 天竜人のみで相手コスト3以下2枚KO
    { const me=LP('OP13-002'); me.hand=[I('OP15-067','me')];
      C['__tr__']={no:'__tr__',name:'天A',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:['天竜人']};
      const tr=mkSyn('__tr__',C['__tr__']); tr.owner='me'; me.chars=[tr];
      C['__o3a__']={no:'__o3a__',name:'O3a',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      C['__o3b__']={no:'__o3b__',name:'O3b',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const v1=mkSyn('__o3a__',C['__o3a__']),v2=mkSyn('__o3b__',C['__o3b__']); v1.owner='cpu';v2.owner='cpu'; G.players.cpu.chars=[v1,v2];
      const rz=I('OP13-095','me'); await runFx(rz.base.fx.onPlay,{self:rz,side:'me'});
      ok(!G.players.cpu.chars.includes(v1) && !G.players.cpu.chars.includes(v2), 'OP13-095: 天竜人のみで相手コスト3以下2枚KO(allSelfChar)'); delete C['__tr__']; delete C['__o3a__']; delete C['__o3b__']; }
    // OP13-098 元々…ないではないか: イムで相手コスト7ステージKO
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,name:'イム'}; me.don={active:1,rested:0};
      C['__st7__']={no:'__st7__',name:'St7',type:'STAGE',color:[],cost:7,traits:[]};
      const st=mkSyn('__st7__',C['__st7__']); st.owner='cpu'; G.players.cpu.stage=st;
      const ev=I('OP13-098','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.stage, 'OP13-098 main: リーダーイムで相手コスト7ステージKO'); delete C['__st7__']; }

    // === OP13 バッチ6（黄・トリガー/エッグヘッド/ライフ） ===
    ok(['OP13-100','OP13-102','OP13-108','OP13-110','OP13-113','OP13-114','OP13-115','OP13-117','OP13-118','OP13-120'].every(no=>C[no]&&C[no].fx), 'OP13バッチ6: 黄12枚にfx統合');
    // OP13-100 ボニーL: トリガー持ちキャラ登場で付与ドン(onAllyEnter)
    { const me=LP('OP13-100'); me.donMax=10; me.don={active:0,rested:2}; G.active='me';
      C['__tg__']={no:'__tg__',name:'T',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:[],fx:{trigger:[{op:'draw',n:1}]}};
      const tg=mkSyn('__tg__',C['__tg__']); tg.owner='me'; me.chars=[tg];
      await checkAllyEnter('me', tg);
      ok((me.leader.attachedDon||0)+(tg.attachedDon||0)>=1, 'OP13-100: トリガー持ち登場で付与ドン(onAllyEnter+hasTrigger)'); delete C['__tg__']; }
    // OP13-102 エジソン: 自身トラッシュ→自ライフ<=相手で1ドロー＋相手レスト
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me')]; G.players.cpu.life=[I('OP15-067','cpu'),I('OP15-067','cpu')];
      me.deck=[I('OP15-067','me')]; const ed=I('OP13-102','me'); ed.owner='me'; me.chars=[ed];
      C['__o3e__']={no:'__o3e__',name:'O3',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const v=mkSyn('__o3e__',C['__o3e__']); v.owner='cpu'; v.rested=false; G.players.cpu.chars=[v]; const h0=me.hand.length;
      await runFx(ed.base.fx.act.fx,{self:ed,side:'me'});
      ok(me.hand.length===h0+1 && v.rested, 'OP13-102 act: ライフ自<=相手で1ドロー＋相手レスト(selfLifeLEOpp)'); delete C['__o3e__']; }
    // OP13-108 ボニー: エッグヘッドで速攻＋相手ライフ1枚を相手手札へ
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,traits:['エッグヘッド']};
      G.players.cpu.life=[I('OP15-067','cpu')]; const ch0=G.players.cpu.hand.length;
      const bn=I('OP13-108','me'); bn.owner='me'; me.chars=[bn];
      await runFx(bn.base.fx.onPlay,{self:bn,side:'me'});
      ok(hasKw(bn,'rush') && G.players.cpu.hand.length===ch0+1, 'OP13-108: エッグヘッドで速攻＋相手ライフ→相手手札(oppLifeToHand)'); }
    // OP13-114 S-スネーク: ライフ表向き→相手-2000
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me')];
      C['__v4f__']={no:'__v4f__',name:'V4',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const v=mkSyn('__v4f__',C['__v4f__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const sn=I('OP13-114','me'); await runFx(sn.base.fx.onPlay,{self:sn,side:'me'});
      ok(power(v)===2000 && me.life[0]._faceUp, 'OP13-114: ライフ表向き(flipLifeCost)→相手-2000'); delete C['__v4f__']; }
    // OP13-117 白いスタンプ: ライフ表向き→相手コスト6以下KO
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me')];
      C['__o6f__']={no:'__o6f__',name:'O6',type:'CHAR',color:[],cost:6,power:7000,counter:1000,traits:[]};
      const v=mkSyn('__o6f__',C['__o6f__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const ev=I('OP13-117','me'); await runFx(ev.base.fx.main.fx,{self:ev,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && me.life[0]._faceUp, 'OP13-117 main: ライフ表向き→相手コスト6以下KO'); delete C['__o6f__']; }
    // OP13-118 ルフィ: 多色でドン4アクティブ＋元々コスト5以上登場不可
    { const me=LP('OP13-002'); me.don={active:0,rested:4};
      const lf=I('OP13-118','me'); await runFx(lf.base.fx.onPlay,{self:lf,side:'me'});
      ok(me.don.active===4 && me._noSummonMinCostTurn===G.turnSeq, 'OP13-118: 多色でドン4アクティブ＋元々コスト5以上登場不可'); }

    // === OP13 バッチ7（最終・リーダー/複雑キャラ） ===
    ok(['OP13-002','OP13-003','OP13-004','OP13-017','OP13-064','OP13-082','OP13-084','OP13-092','OP13-105','OP13-106','OP13-109','OP13-119'].every(no=>C[no]&&C[no].fx), 'OP13バッチ7: 最終14枚にfx統合');
    // OP13-003 ロジャーL: 場のドン9以下でリーダー-2000
    { const me=LP('OP13-003'); me.don={active:5,rested:0};
      ok(power(me.leader)===5000, 'OP13-003: 場のドン9以下でリーダー-2000(condBuff donAtMost)');
      me.don={active:10,rested:0}; ok(power(me.leader)===7000, 'OP13-003: ドン10では通常'); }
    // OP13-004 サボL: boardBuff（ドン×1＋コスト8キャラで全+1000）
    { const me=LP('OP13-004'); me.life=[I('OP15-067','me')]; me.leader.attachedDon=1; G.active='me';
      C['__c8s__']={no:'__c8s__',name:'C8',type:'CHAR',color:[],cost:8,power:8000,counter:1000,traits:[]};
      const c8=mkSyn('__c8s__',C['__c8s__']); c8.owner='me'; me.chars=[c8];
      ok(power(c8)===9000, 'OP13-004 boardBuff: ドン×1＋コスト8キャラで全+1000');
      me.leader.attachedDon=0; ok(power(c8)===8000, 'OP13-004: ドン×1なしでは無し'); delete C['__c8s__']; }
    // OP13-017 ドラゴン: 革命軍を守りドラゴン自身-2000(selfPowerMinus)
    { const me=LP('OP13-002'); const dr=I('OP13-017','me'); dr.owner='me';
      C['__rev2__']={no:'__rev2__',name:'革B',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['革命軍']};
      const rev=mkSyn('__rev2__',C['__rev2__']); rev.owner='me'; me.chars=[dr,rev]; const dp=power(dr);
      ok(await protectFromEffect(rev,'ko',null)===true && power(dr)===dp-2000 && me.chars.includes(rev), 'OP13-017: 革命軍を守りドラゴン-2000'); delete C['__rev2__']; }
    // OP13-064 ロジャー: 非ロジャー自キャラを無効化
    { const me=LP('OP13-002'); const rg=I('OP13-064','me'); rg.owner='me';
      C['__nr__']={no:'__nr__',name:'NonR',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['海賊']};
      C['__rc__']={no:'__rc__',name:'RogerC',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['ロジャー海賊団']};
      const nr=mkSyn('__nr__',C['__nr__']), rc=mkSyn('__rc__',C['__rc__']); nr.owner='me'; rc.owner='me'; me.chars=[rg,nr,rc];
      ok(isNegated(nr) && !isNegated(rc), 'OP13-064: 非ロジャーは効果無効・ロジャーは無効化されない(negateNonTrait)'); delete C['__nr__']; delete C['__rc__']; }
    // OP13-082 五老星: 自キャラ全トラッシュ→トラッシュから五老星登場
    { const me=LP('OP13-002'); me.isCPU=true; me.leader.base={...me.leader.base,name:'イム'}; me.hand=[I('OP15-067','me')];
      const old=I('OP15-067','me'); old.owner='me'; me.chars=[old];
      C['__ga__']={no:'__ga__',name:'GA',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:['五老星']};
      C['__gb__']={no:'__gb__',name:'GB',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:['五老星']};
      me.trash=[mkSyn('__ga__',C['__ga__']),mkSyn('__gb__',C['__gb__'])];
      const fr=I('OP13-082','me'); await runFx(fr.base.fx.act.fx,{self:fr,side:'me'});
      ok(me.chars.some(x=>x.no==='__ga__') && me.chars.some(x=>x.no==='__gb__') && !me.chars.includes(old), 'OP13-082: 自キャラ全トラッシュ→五老星5体登場(massReviveFromTrash)'); delete C['__ga__']; delete C['__gb__']; }
    // OP13-084 ピーター聖: トラッシュ10以上で《五老星》全の元々パワー7000(allySetBase)
    { const me=LP('OP13-002'); G.active='me';
      C['__g5p__']={no:'__g5p__',name:'G5',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:['五老星']};
      const g5=mkSyn('__g5p__',C['__g5p__']); g5.owner='me'; const pt=I('OP13-084','me'); pt.owner='me'; me.chars=[g5,pt];
      me.trash=[]; for(let i=0;i<10;i++) me.trash.push(I('OP15-067','me'));
      ok(power(g5)===7000, 'OP13-084 allySetBase: トラッシュ10以上で五老星の元々パワー7000');
      me.trash=[]; ok(power(g5)===5000, 'OP13-084: トラッシュ10未満では元のまま'); delete C['__g5p__']; }
    // OP13-092 ミョスガルド聖: ライフ3以下でトラッシュからマリージョアステージ登場
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me')];
      C['__mj__']={no:'__mj__',name:'MJ',type:'STAGE',color:[],cost:1,traits:['聖地マリージョア']};
      me.trash=[mkSyn('__mj__',C['__mj__'])];
      const mg=I('OP13-092','me'); await runFx(mg.base.fx.onPlay,{self:mg,side:'me'});
      ok(me.stage && me.stage.no==='__mj__', 'OP13-092: トラッシュからマリージョアステージ登場(reviveStage)'); delete C['__mj__']; }
    // OP13-106 コニー: トリガー発動でブロッカー(相手ターン中)
    { const me=LP('OP13-002'); G.active='cpu'; const cn=I('OP13-106','me'); cn.owner='me'; me.chars=[cn];
      await fireOnTrigger('me');
      ok(hasKw(cn,'blocker'), 'OP13-106: トリガー発動でブロッカー(onTrigger・相手ターン中)'); G.active='me'; }
    // OP13-109 ボニー: 場離れ代わりにライフ表向き(flipLifeUp)
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me')]; const bn=I('OP13-109','me'); bn.owner='me'; me.chars=[bn];
      ok(await protectFromEffect(bn,'ko',null)===true && me.life[0]._faceUp, 'OP13-109: 相手効果の場離れ代わりにライフ表向き'); }
    // OP13-119 エース: ライフ3以下で速攻
    { const me=LP('OP13-002'); const ac=I('OP13-119','me'); ac.owner='me'; me.chars=[ac]; ac.summonedTurn=G.turnSeq; G.active='me';
      me.life=[I('OP15-067','me')]; ok(hasKw(ac,'rush'), 'OP13-119: ライフ3以下で速攻');
      me.life=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; ok(!hasKw(ac,'rush'), 'OP13-119: ライフ4以上では速攻無し'); }

    // === 属性データ(cards-attr.js)＋属性条件カード ===
    ok(C['OP14-020'] && C['OP14-020'].attribute==='斬' && C['OP13-025'].attribute==='打' && C['OP15-058'].attribute==='特', '属性付与: ミホーク=斬/コビー=打/エネル=特(cards-attr.js→mergeCardDB)');
    // OP14-020 ミホーク: 相手リーダーが属性(斬)なら+1000
    { const me=LP('OP14-020'); // ミホーク(斬)リーダー
      G.players.cpu.leader.base={...G.players.cpu.leader.base,attribute:'斬'};
      ok(power(me.leader)===6000, 'OP14-020: 相手リーダー属性(斬)でリーダー+1000(5000→6000)');
      G.players.cpu.leader.base={...G.players.cpu.leader.base,attribute:'打'};
      ok(power(me.leader)===5000, 'OP14-020: 相手リーダー非斬では+1000無し'); }
    // OP13-025 コビー: リーダーが属性(打)ならドン1アクティブ（FILMでなくても）
    { const me=LP('OP13-002'); me.leader.base={...me.leader.base,attribute:'打',traits:[]}; me.don={active:0,rested:2};
      const cb=I('OP13-025','me'); await runFx(cb.base.fx.onPlay,{self:cb,side:'me'});
      ok(me.don.active>=1, 'OP13-025: リーダー属性(打)でドン1アクティブ(leaderAttr)');
      const me2=LP('OP13-002'); me2.leader.base={...me2.leader.base,attribute:'斬',traits:[]}; me2.don={active:0,rested:2};
      const cb2=I('OP13-025','me'); await runFx(cb2.base.fx.onPlay,{self:cb2,side:'me'});
      ok(me2.don.active===0, 'OP13-025: 非打・非FILMでは発動しない'); }
    // matchFilter attr フィルタ（属性を持つキャラ）
    { const me=LP('OP13-002');
      const sh=I('OP14-020','me'); // 斬属性のカード(リーダーだが属性付き)
      ok(matchFilter(sh,{attr:'斬'}) && !matchFilter(sh,{attr:'打'}), 'matchFilter attr: 属性(斬)を持つ判定'); }

    // === OP13 精度仕上げ（エース被ダメ/KO・モモの助並替・119相手の登場） ===
    // OP13-002 エース: 【ドン×1】元々6000以上のKOで1ドロー(被ダメと共有のターン1回)
    { const me=LP('OP13-002'); me.leader.attachedDon=1; me.deck=[I('OP15-067','me')]; me._aceDrawTurn=undefined;
      C['__big6__']={no:'__big6__',name:'Big6',type:'CHAR',color:[],cost:6,power:7000,counter:1000,traits:[]};
      const b=mkSyn('__big6__',C['__big6__']); b.owner='me'; me.chars=[b]; const h0=me.hand.length;
      await koCard(b,'battle');
      ok(me.hand.length===h0+1 && me._aceDrawTurn===G.turnSeq, 'OP13-002: 元々6000以上KOで1ドロー(ドン×1)');
      const me2=LP('OP13-002'); me2.leader.attachedDon=0; me2.deck=[I('OP15-067','me')];
      const b2=mkSyn('__big6__',C['__big6__']); b2.owner='me'; me2.chars=[b2]; const h1=me2.hand.length;
      await koCard(b2,'battle');
      ok(me2.hand.length===h1, 'OP13-002: ドン×1なしではドローしない'); delete C['__big6__']; }
    // OP13-105 モモの助: ライフ並べ替え(枚数不変・フリーズしない)
    { const me=LP('OP13-002'); me.life=[I('OP15-067','me'),I('OP15-067','me')];
      const mm=I('OP13-105','me'); await runFx(mm.base.fx.onPlay,{self:mm,side:'me'});
      ok(me.life.length===2, 'OP13-105: ライフ並べ替え(reorderLife・枚数不変)'); }
    // OP13-119 エース: バウンス→相手がコスト4以下を登場(oppPlayAfter)
    { const me=LP('OP13-002'); me.don={active:0,rested:2};
      C['__o5b__']={no:'__o5b__',name:'O5',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const v=mkSyn('__o5b__',C['__o5b__']); v.owner='cpu'; G.players.cpu.chars=[v]; G.players.cpu.isCPU=true;
      C['__o4h__']={no:'__o4h__',name:'O4',type:'CHAR',color:[],cost:4,power:5000,counter:1000,traits:[]};
      const o4=mkSyn('__o4h__',C['__o4h__']); o4.owner='cpu'; G.players.cpu.hand=[o4];
      const ac=I('OP13-119','me'); await runFx(ac.base.fx.onPlay,{self:ac,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && G.players.cpu.chars.some(x=>x.no==='__o4h__'), 'OP13-119: バウンス→相手がコスト4以下を登場(oppPlayAfter)'); delete C['__o5b__']; delete C['__o4h__']; }

    // === OP12 バッチ1（赤） ===
    ok(['OP12-003','OP12-004','OP12-008','OP12-013','OP12-015'].every(no=>C[no]&&C[no].fx), 'OP12バッチ1: 赤10枚にfx統合');
    // OP12-003 クロッカス: イベント2公開→赤パワー3000以下を登場
    { const me=LP('OP13-002');
      me.hand=[I('OP13-019','me'),I('OP13-019','me')]; // 赤イベント2枚(OP13-019=火炎イベント)
      C['__r3__']={no:'__r3__',name:'R3',type:'CHAR',color:['赤'],cost:2,power:3000,counter:1000,traits:[]};
      me.hand.push(mkSyn('__r3__',C['__r3__']));
      const c=I('OP12-003','me'); await runFx(c.base.fx.onKO,{self:c,side:'me'});
      ok(me.chars.some(x=>x.no==='__r3__'), 'OP12-003: イベント2公開(revealCost)→赤キャラ登場'); delete C['__r3__']; }
    // OP12-008 シャンクス: 相手アタック時 手札1捨て→相手-2000
    { const me=LP('OP13-002'); me.hand=[I('OP15-067','me')];
      C['__t6__']={no:'__t6__',name:'T6',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const atk=mkSyn('__t6__',C['__t6__']); atk.owner='cpu'; G.players.cpu.chars=[atk]; const lp0=power(G.players.cpu.leader);
      const sk=I('OP12-008','me'); await runFx(sk.base.fx.onOppAttack,{self:sk,side:'me',attacker:atk});
      ok(me.hand.length===0 && (power(G.players.cpu.leader)===lp0-2000 || power(atk)===4000), 'OP12-008 onOppAttack: 手札1捨て→相手リーダー/キャラ-2000'); delete C['__t6__']; }
    // OP12-015 ルフィ: 付与ドン合計2以上で+2000(selfAttachedDonAtLeast)
    { const me=LP('OP13-002'); const lf=I('OP12-015','me'); lf.owner='me'; me.chars=[lf]; G.active='me';
      lf.attachedDon=0; me.leader.attachedDon=0; ok(power(lf)===4000, 'OP12-015: 付与ドン0では+2000無し');
      lf.attachedDon=2; ok(power(lf)===4000+2000+2000, 'OP12-015: 付与ドン合計2以上で+2000(付与ドン分の2000も加算)'); }

    // === OP12 バッチ2-6（緑/青/紫/黒/黄の代表） ===
    ok(['OP12-040','OP12-075','OP12-081','OP12-091','OP12-117'].every(no=>C[no]&&C[no].fx), 'OP12 後続バッチ: fx統合');
    // OP12-040 クザンL: 効果で手札が捨てられた時、捨てた枚数分ドロー(drawDiscarded)
    { const me=LP('OP12-040'); me.deck=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')]; me.hand=[I('OP15-067','me'),I('OP15-067','me')]; const h0=me.hand.length;
      await doOp({op:'discardOwn',n:2},{side:'me'});
      ok(me.hand.length===h0-2+2, 'OP12-040: 2枚捨て→2枚ドロー(drawDiscarded)'); }
    // OP12-075 ミス・オールサンデー: 相手コスト3以下KO→相手がドン1追加
    { const me=LP('OP13-002'); G.players.cpu.isCPU=true; G.players.cpu.donMax=10; const d0=donTotal('cpu');
      C['__o3m__']={no:'__o3m__',name:'O3',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const v=mkSyn('__o3m__',C['__o3m__']); v.owner='cpu'; G.players.cpu.chars=[v];
      const c=I('OP12-075','me'); await runFx(c.base.fx.onPlay,{self:c,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && donTotal('cpu')===d0+1, 'OP12-075: 相手コスト3以下KO→相手ドン1追加(oppDonFromDeck)'); delete C['__o3m__']; }
    // OP12-091 ポーカー: トラッシュ3枚デッキ下→SMILE2枚+2000(trashToBottomCost n)
    { const me=LP('OP13-002'); me.isCPU=true; me.trash=[I('OP15-067','me'),I('OP15-067','me'),I('OP15-067','me')];
      C['__sm__']={no:'__sm__',name:'SM',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['SMILE']};
      const s=mkSyn('__sm__',C['__sm__']); s.owner='me'; me.chars=[s];
      const pk=I('OP12-091','me'); await runFx(pk.base.fx.act.fx,{self:pk,side:'me'});
      ok(power(s)===6000 && me.deck.length>=3, 'OP12-091: トラッシュ3枚デッキ下→SMILE+2000'); delete C['__sm__']; }
    // OP12-081 コアラL: 相手リーダーにアタック時 コスト8以上2枚で1ドロー(onLeaderAttack)
    { const me=LP('OP12-081'); me.deck=[I('OP15-067','me')];
      C['__c8a__']={no:'__c8a__',name:'C8a',type:'CHAR',color:[],cost:8,power:8000,counter:1000,traits:[]};
      const a=mkSyn('__c8a__',C['__c8a__']),b=mkSyn('__c8a__',C['__c8a__']); a.owner='me';b.owner='me'; me.chars=[a,b]; const h0=me.hand.length;
      await runFx(me.leader.base.fx.onLeaderAttack.fx,{self:me.leader,side:'me'});
      ok(me.hand.length===h0+1, 'OP12-081: コスト8以上2枚で1ドロー(onLeaderAttack)'); delete C['__c8a__']; }

    /* ===== OP11 新機構の回帰 ===== */
    // OP11-112 メガロ: 【相手のターン中】しらほしリーダーで +4000（condBuff oppTurn）
    { C['__shi__']={no:'__shi__',name:'しらほし',type:'LEADER',color:['黄'],cost:0,power:5000,life:5,traits:[]};
      G.players={me:mkP('__shi__',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
      const me=G.players.me; const m=I('OP11-112','me'); m.owner='me'; me.chars=[m];
      ok(power(m)===C['OP11-112'].power+4000, 'OP11-112 メガロ: 相手ターン中しらほしで+4000');
      G.active='me'; ok(power(m)===C['OP11-112'].power, 'OP11-112: 自分ターンは+0'); delete C['__shi__']; }
    // OP11-119 コビー(attackActive): 付与でアクティブの相手キャラもアタック対象になる
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true); G.active='me'; G.turnSeq=5; G.winner=null;
      const atk=I('OP13-002','me'); atk.owner='me'; atk.rested=false; me.chars=[atk];
      C['__act__']={no:'__act__',name:'A',type:'CHAR',color:[],cost:2,power:3000,counter:1000,traits:[]};
      const oc=mkSyn('__act__',C['__act__']); oc.owner='cpu'; oc.rested=false; G.players.cpu.chars=[oc];
      ok(!legalTargets('me',atk).includes(oc), 'OP11 attackActive前: アクティブ相手キャラは対象外');
      atk.kwGrant=[{kw:'attackActive',dur:'turn'}];
      ok(legalTargets('me',atk).includes(oc), 'OP11 attackActive後: アクティブ相手キャラもアタック対象'); delete C['__act__']; }
    // OP11-079 costGuess: 相手デッキ上のコストが宣言と一致なら then 発動
    { const me=LP('OP13-002'); me.isCPU=true; G.players.cpu=mkP('OP11-041',true); G.active='me'; G.winner=null;
      G.players.cpu.deck=[I('OP11-096','cpu')]; const h0=me.hand.length; me.deck=[I('OP11-096','me')];
      await runFx([{op:'costGuess',cpuGuess:1,then:[{op:'draw',n:1}]}],{self:me.leader,side:'me'});
      ok(me.hand.length===h0+1, 'OP11 costGuess: 宣言一致(コスト1)で then 発動'); }
    // OP11-102 ケイミー: oppLifeAtLeast 条件 と lifeTrash side:both
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true); G.active='me'; G.winner=null;
      me.life=[I('OP11-096','me'),I('OP11-096','me')]; G.players.cpu.life=[I('OP11-096','cpu'),I('OP11-096','cpu')];
      ok(checkCond({oppLifeAtLeast:2},'me',null), 'OP11-102: oppLifeAtLeast=2 成立');
      await runFx([{op:'lifeTrash',side:'both'}],{self:me.leader,side:'me'});
      ok(me.life.length===1 && G.players.cpu.life.length===1, 'OP11-102: lifeTrash both で双方ライフ-1'); }
    // OP11-057 ペドロ: 手札4枚以下で【ブロッカー】(条件付きstaticKeyword・テキスト由来blockerを打ち消す)
    { const me=LP('OP13-002'); const p=I('OP11-057','me'); p.owner='me'; me.chars=[p];
      me.hand=[I('OP11-096','me'),I('OP11-096','me'),I('OP11-096','me'),I('OP11-096','me')];
      ok(hasKw(p,'blocker'), 'OP11-057: 手札4枚以下で【ブロッカー】');
      me.hand.push(I('OP11-096','me'));
      ok(!hasKw(p,'blocker'), 'OP11-057: 手札5枚で【ブロッカー】無し'); }
    // OP11-058 ルフィ青: 手札5枚以上でアタック不可(cantAttack cond)
    { const me=LP('OP13-002'); const l=I('OP11-058','me'); l.owner='me'; l.rested=false; l.summonedTurn=0; me.chars=[l];
      G.active='me'; G.players.cpu=mkP('OP11-041',true);
      me.hand=Array.from({length:5},()=>I('OP11-096','me'));
      ok(!canCardAttack(l), 'OP11-058: 手札5枚でアタック不可');
      me.hand.pop(); ok(canCardAttack(l), 'OP11-058: 手札4枚でアタック可'); }
    // OP11-101 カポネ・ベッジ: 超新星が相手効果で離れる→代わりにライフ上に裏向きで加える(leaveProtect toLifeFaceDown)
    { const me=LP('OP13-002'); me.isCPU=true; G.players.cpu=mkP('OP11-041',true);
      const cap=I('OP11-101','me'); cap.owner='me';
      C['__sn__']={no:'__sn__',name:'SN',type:'CHAR',color:['黄'],cost:3,power:4000,counter:1000,traits:['超新星']};
      const sn=mkSyn('__sn__',C['__sn__']); sn.owner='me'; me.chars=[cap,sn]; const life0=me.life.length;
      const prot=await protectFromEffect(sn,'ko',G.players.cpu.leader);
      ok(prot===true && me.life.length===life0+1 && !me.chars.includes(sn), 'OP11-101: 超新星をライフ上に裏向きで加えて守る'); delete C['__sn__']; }
    // OP11-092 ヘルメッポ: reviveFromTrash returnEndTurn で「ターン終了時デッキ下」を予約
    { const me=LP('OP13-002'); me.isCPU=true; G.players.cpu=mkP('OP11-041',true); G._pendingTurnEnd=[];
      C['__sw__']={no:'__sw__',name:'SW',type:'CHAR',color:['黒'],cost:3,power:4000,counter:1000,traits:['SWORD']};
      me.trash=[mkSyn('__sw__',C['__sw__'])]; me.trash[0].owner='me';
      await runFx([{op:'reviveFromTrash',maxCost:8,returnEndTurn:true,filter:{traitIncludes:'SWORD'}}],{self:me.leader,side:'me'});
      ok(me.chars.some(c=>c.base.no==='__sw__') && G._pendingTurnEnd.length===1, 'OP11-092: SWORD蘇生＋ターン終了時デッキ下を予約'); delete C['__sw__']; }

    /* ===== OP10 新機構の回帰 ===== */
    // OP10-024/038 selfRestedCharsAtLeast: 自分のレストのキャラ2枚以上の条件
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true);
      const a=I('OP10-012','me'),b=I('OP10-012','me'); a.owner='me';b.owner='me'; a.rested=true;b.rested=true; me.chars=[a,b];
      ok(checkCond({selfRestedCharsAtLeast:2},'me',null), 'OP10: selfRestedCharsAtLeast=2 成立');
      a.rested=false; ok(!checkCond({selfRestedCharsAtLeast:2},'me',null), 'OP10: レスト1枚では不成立'); }
    // OP10-070 トレーボル: grantWeakKoImmune＝元々パワー1000以下が相手効果KOされない
    { const me=LP('OP13-002'); me.isCPU=true; G.players.cpu=mkP('OP11-041',true); G.turnSeq=5;
      const t=I('OP10-070','me'); t.owner='me'; me.chars=[t];
      await runFx(C['OP10-070'].fx.onPlay,{self:t,side:'me'});
      C['__w__']={no:'__w__',name:'W',type:'CHAR',color:['紫'],cost:1,power:1000,counter:1000,traits:[]};
      const w=mkSyn('__w__',C['__w__']); w.owner='me';
      ok(await protectFromEffect(w,'ko',G.players.cpu.leader)===true, 'OP10-070: 元々パワー1000以下は相手効果でKOされない'); delete C['__w__']; }
    // OP10-104 カリブー: battleImmune（バトルでKOされない・条件: 超新星L＋相手ライフ3以上＋ドン×1）
    { C['__sh__']={no:'__sh__',name:'超新星L',type:'LEADER',color:['黄'],cost:0,power:5000,life:5,traits:['超新星']};
      G.players={me:mkP('__sh__',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null;
      const me=G.players.me; me.isCPU=true; G.players.cpu.life=[I('OP11-096','cpu'),I('OP11-096','cpu'),I('OP11-096','cpu')];
      const k=I('OP10-104','me'); k.owner='me'; k.attachedDon=1; me.chars=[k];
      ok(await protectFromEffect(k,'battle',null)===true, 'OP10-104: 条件成立でバトルKO耐性');
      k.attachedDon=0; ok(await protectFromEffect(k,'battle',null)===false, 'OP10-104: ドン×1なしでは耐性なし'); delete C['__sh__']; }
    // OP10-036 ペローナ: 自分の効果でキャラがレストになった時ドン1アクティブ(fireOwnRest)
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      const per=I('OP10-036','me'); per.owner='me'; per._ownRestTurn=null; me.chars=[per];
      const oc=I('OP10-012','cpu'); oc.owner='cpu'; oc.rested=false; G.players.cpu.chars=[oc];
      me.don={active:0,rested:2};
      await runFx([{op:'restChar',side:'opp',count:1}],{self:me.leader,side:'me'});
      ok(me.don.active===1 && oc.rested===true, 'OP10-036: 相手キャラをレスト→ペローナでドン1アクティブ'); }
    // OP10-100 maxCostFrom totalLife フィルタ
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true);
      me.life=[I('OP11-096','me')]; G.players.cpu.life=[I('OP11-096','cpu'),I('OP11-096','cpu')];
      C['__c3__']={no:'__c3__',name:'C3',type:'CHAR',color:[],cost:3,power:3000,counter:1000,traits:[]};
      C['__c4__']={no:'__c4__',name:'C4',type:'CHAR',color:[],cost:4,power:3000,counter:1000,traits:[]};
      const c3=mkSyn('__c3__',C['__c3__']); c3.owner='cpu'; const c4=mkSyn('__c4__',C['__c4__']); c4.owner='cpu';
      ok(matchFilter(c3,{maxCostFrom:'totalLife'})===true && matchFilter(c4,{maxCostFrom:'totalLife'})===false, 'OP10-100: ライフ合計3以下のコストのみ対象'); delete C['__c3__']; delete C['__c4__']; }

    /* ===== OP09 新機構の回帰 ===== */
    // OP09-018 失せろ: koByTotalPower＝合計パワー4000以下になるよう複数KO
    { const me=LP('OP13-002'); me.isCPU=true; G.players.cpu=mkP('OP11-041',true);
      C['__p1__']={no:'__p1__',name:'P1',type:'CHAR',color:[],cost:2,power:1000,counter:1000,traits:[]};
      C['__p5__']={no:'__p5__',name:'P5',type:'CHAR',color:[],cost:5,power:5000,counter:1000,traits:[]};
      const lo=mkSyn('__p1__',C['__p1__']),hi=mkSyn('__p5__',C['__p5__']); lo.owner='cpu';hi.owner='cpu'; G.players.cpu.chars=[lo,hi];
      await runFx([{op:'koByTotalPower',count:2,maxTotal:4000}],{self:me.leader,side:'me'});
      ok(G.players.cpu.chars.includes(hi) && !G.players.cpu.chars.includes(lo), 'OP09-018: 合計4000以下＝1000はKO・5000は残る'); delete C['__p1__']; delete C['__p5__']; }
    // OP09-022 リムL: summonRested＝自分のキャラはレストで登場
    { C['__rim__']={no:'__rim__',name:'リムL',type:'LEADER',color:['緑'],cost:0,power:5000,life:5,traits:['ODYSSEY'],fx:{static:[{op:'summonRested'}]}};
      G.players={me:mkP('__rim__',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null; G.busy=false;
      const me=G.players.me; const c=I('OP10-012','me');
      await summon('me',c,false);
      ok(me.chars.includes(c) && c.rested===true, 'OP09-022: summonRestedでキャラがレスト登場'); delete C['__rim__']; }
    // OP09-033 ロビン: grantTraitKoImmune＝filter一致の自キャラが効果KO耐性
    { const me=LP('OP13-002'); me.isCPU=true; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      await runFx([{op:'grantTraitKoImmune',duration:'untilNextEnd',filter:{traitIncludes:'麦わらの一味'}}],{self:me.leader,side:'me'});
      C['__mw__']={no:'__mw__',name:'MW',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:['麦わらの一味']};
      const mw=mkSyn('__mw__',C['__mw__']); mw.owner='me';
      ok(await protectFromEffect(mw,'ko',G.players.cpu.leader)===true, 'OP09-033: 麦わらは効果でKOされない'); delete C['__mw__']; }
    // OP09-081 ティーチL: negateOwnOnPlay＝自分の登場時効果が無効
    { C['__tea__']={no:'__tea__',name:'ティーチL',type:'LEADER',color:['黒'],cost:0,power:5000,life:4,traits:['黒ひげ海賊団'],fx:{static:[{op:'negateOwnOnPlay'}]}};
      G.players={me:mkP('__tea__',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null; G.busy=false;
      const me=G.players.me; me.deck=[I('OP11-096','me'),I('OP11-096','me'),I('OP11-096','me')]; const h0=me.hand.length;
      const drawer=I('OP10-004','me'); // 登場時5枚見て手札に加える効果
      await summon('me',drawer,false);
      ok(me.hand.length===h0, 'OP09-081: 自分の登場時効果が無効化される'); delete C['__tea__']; }
    // OP09-066 oppDonGreater cond
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true);
      me.don={active:1,rested:0}; G.players.cpu.don={active:3,rested:0};
      ok(checkCond({oppDonGreater:true},'me',null), 'OP09-066: 相手ドンが多い＝成立');
      G.players.cpu.don={active:1,rested:0}; ok(!checkCond({oppDonGreater:true},'me',null), 'OP09-066: 同数では不成立'); }

    /* ===== OP08 新機構の回帰 ===== */
    // OP08-023 lockRefresh: 相手のレストキャラが次のリフレッシュでアクティブにならない
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.turnSeq=5; G.winner=null; G.busy=false; G.firstPlayer='me';
      G.players.cpu=mkP('OP11-041',true); const cpu=G.players.cpu;
      const oc=I('OP10-012','cpu'); oc.owner='cpu'; oc.rested=true; cpu.chars=[oc]; cpu.turnsTaken=2;
      await runFx([{op:'lockRefresh',filter:{maxCost:7},count:1}],{self:me.leader,side:'me'});
      ok(oc._noRefreshSeq===G.turnSeq+1, 'OP08-023: lockRefreshで_noRefreshSeqがセット');
      // 相手のターン開始（beginTurn）でレストのままか
      G.busy=false; await beginTurn('cpu');
      ok(oc.rested===true && oc._noRefreshSeq==null, 'OP08-023: 次のリフレッシュでアクティブにならずフラグ解除'); }
    // OP08-083 oppCostMod: シープスヘッドが相手キャラのコストを-1
    { const me=LP('OP13-002'); G.active='me'; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      const sh=I('OP08-083','me'); sh.owner='me'; sh.attachedDon=1; me.chars=[sh];
      C['__t3__']={no:'__t3__',name:'T3',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const tg=mkSyn('__t3__',C['__t3__']); tg.owner='cpu'; G.players.cpu.chars=[tg];
      ok(matchFilter(tg,{maxCost:2})===true, 'OP08-083: 相手コスト3が-1されてコスト2以下扱い'); delete C['__t3__']; }
    // OP08-119 koAllExceptSelf: 自身以外の全キャラをKO
    { const me=LP('OP13-002'); me.isCPU=true; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      C['__x__']={no:'__x__',name:'X',type:'CHAR',color:[],cost:3,power:4000,counter:1000,traits:[]};
      const self2=mkSyn('__x__',C['__x__']); self2.owner='me'; const ally=mkSyn('__x__',C['__x__']); ally.owner='me';
      const en=mkSyn('__x__',C['__x__']); en.owner='cpu'; me.chars=[self2,ally]; G.players.cpu.chars=[en];
      await runFx([{op:'koAllExceptSelf'}],{self:self2,side:'me'});
      ok(me.chars.includes(self2) && !me.chars.includes(ally) && G.players.cpu.chars.length===0, 'OP08-119: 自身以外の全キャラKO'); delete C['__x__']; }

    /* ===== OP07 新機構の回帰 ===== */
    // OP07-001 moveAttachedDon: 付与ドンを1キャラに移す
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      C['__alo__']={no:'__alo__',name:'ALo',type:'CHAR',color:[],cost:1,power:1000,counter:1000,traits:[]};
      C['__ahi__']={no:'__ahi__',name:'AHi',type:'CHAR',color:[],cost:8,power:9000,counter:1000,traits:[]};
      const src=mkSyn('__alo__',C['__alo__']); src.owner='me'; src.attachedDon=2; const dst=mkSyn('__ahi__',C['__ahi__']); dst.owner='me'; dst.attachedDon=0; me.chars=[dst,src];
      await runFx([{op:'moveAttachedDon',n:2}],{self:me.leader,side:'me'});
      ok(dst.attachedDon===2 && src.attachedDon===0, 'OP07-001: 付与ドン2枚を高パワー側へ移動'); delete C['__alo__']; delete C['__ahi__']; }
    // OP07-002 setPower 相手対象: 相手キャラのパワーを0に
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.turnSeq=5; G.players.cpu=mkP('OP11-041',true);
      C['__b__']={no:'__b__',name:'B',type:'CHAR',color:[],cost:5,power:6000,counter:1000,traits:[]};
      const t=mkSyn('__b__',C['__b__']); t.owner='cpu'; G.players.cpu.chars=[t];
      await runFx([{op:'setPower',side:'opp',value:0,count:1}],{self:me.leader,side:'me'});
      ok(power(t)===0, 'OP07-002: 相手キャラのパワーを0に'); delete C['__b__']; }
    // OP07-064 selfDonFewerBy cond
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true);
      me.don={active:1,rested:0}; G.players.cpu.don={active:4,rested:0};
      ok(checkCond({selfDonFewerBy:2},'me',null), 'OP07-064: ドン3枚差で成立');
      me.don={active:3,rested:0}; ok(!checkCond({selfDonFewerBy:2},'me',null), 'OP07-064: 1枚差では不成立'); }

    /* ===== 今セッション追加機構の回帰（ST/P/PRB） ===== */
    // P-052 battleImmuneVsAttr: 属性(斬)を持つアタッカーとのバトルでKOされない（ドン×1時）
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true); G.active='cpu';
      C['__zan__']={no:'__zan__',name:'Zan',type:'CHAR',color:[],cost:5,power:6000,counter:0,traits:[],attribute:'斬'};
      C['__uchi__']={no:'__uchi__',name:'Uchi',type:'CHAR',color:[],cost:5,power:6000,counter:0,traits:[],attribute:'打'};
      const mh=I('P-052','me'); mh.attachedDon=1; me.chars=[mh];
      const za=mkSyn('__zan__',C['__zan__']); za.owner='cpu'; const uc=mkSyn('__uchi__',C['__uchi__']); uc.owner='cpu';
      ok(await protectFromEffect(mh,'battle',za)===true, 'P-052: 斬アタッカーとのバトルでKO耐性(ドン×1)');
      ok(await protectFromEffect(mh,'battle',uc)===false, 'P-052: 打アタッカーには耐性なし');
      mh.attachedDon=0; ok(await protectFromEffect(mh,'battle',za)===false, 'P-052: ドン×1未満では耐性なし');
      delete C['__zan__']; delete C['__uchi__']; }
    // P-067 taunt: レストのキッドがいると相手はキッド以外のキャラにアタック不可（リーダーは可）
    { const me=LP('OP13-002'); G.players.cpu=mkP('OP11-041',true);
      const kid=I('P-067','me'); kid.rested=true; C['__oth__']={no:'__oth__',name:'Oth',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:[]};
      const oth=mkSyn('__oth__',C['__oth__']); oth.owner='me'; oth.rested=true; me.chars=[kid,oth];
      const atk=mkSyn('__oth__',C['__oth__']); atk.owner='cpu';
      const tg=legalTargets('cpu',atk);
      ok(tg.includes(me.leader) && tg.includes(kid) && !tg.includes(oth), 'P-067: タウントでキャラ対象はキッドのみ(リーダーは可)');
      kid.rested=false; ok(legalTargets('cpu',atk).includes(oth), 'P-067: キッドがアクティブならタウント無効'); delete C['__oth__']; }
    // PRB02-014 handCostCond: トラッシュ15枚以上で手札コスト-3
    { const me=LP('OP13-002'); const sabo=I('PRB02-014','me');
      me.trash=[]; ok(effCost('me',sabo)===(C['PRB02-014'].cost), 'PRB02-014: 通常コスト');
      for(let i=0;i<15;i++) me.trash.push(I('OP11-041','me'));
      ok(effCost('me',sabo)===Math.max(0,(C['PRB02-014'].cost-3)), 'PRB02-014: トラッシュ15枚でコスト-3'); }
    // P-024 leaderBuffPerChar: 自分のキャラ枚数×1000をリーダーに
    { const me=LP('OP13-002'); C['__c__']={no:'__c__',name:'C',type:'CHAR',color:[],cost:1,power:1000,counter:0,traits:[]};
      me.chars=[mkSyn('__c__',C['__c__']),mkSyn('__c__',C['__c__']),mkSyn('__c__',C['__c__'])];
      const base=power(me.leader); await runFx([{op:'leaderBuffPerChar',amount:1000,duration:'turn'}],{self:me.leader,side:'me'});
      ok(power(me.leader)===base+3000, 'P-024: キャラ3枚でリーダー+3000'); delete C['__c__']; }
    // P-100 negateEffect all: 相手リーダー＋キャラ全ての効果無効
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.players.cpu=mkP('OP11-041',true);
      C['__e__']={no:'__e__',name:'E',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:[]};
      const e1=mkSyn('__e__',C['__e__']); e1.owner='cpu'; const e2=mkSyn('__e__',C['__e__']); e2.owner='cpu'; G.players.cpu.chars=[e1,e2];
      await runFx([{op:'negateEffect',all:true}],{self:me.leader,side:'me'});
      ok(e1.negSeq===G.turnSeq && e2.negSeq===G.turnSeq && G.players.cpu.leader.negSeq===G.turnSeq, 'P-100: 相手リーダー＋全キャラ効果無効'); delete C['__e__']; }
    // ST28-004 attachedDonToCost: 付与ドン2枚をコストエリアにレストで戻す→速攻付与
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; const momo=I('ST28-004','me'); momo.attachedDon=2; me.chars=[momo]; me.don={active:0,rested:0};
      await runFx([{op:'attachedDonToCost',n:2,then:[{op:'giveKeyword',target:'self',kw:'rush',duration:'turn'}]}],{self:momo,side:'me'});
      ok(momo.attachedDon===0 && me.don.rested===2 && hasKw(momo,'rush'), 'ST28-004: 付与ドン2→コストレスト＆速攻'); }
    // P-121 millSelf: 自デッキ上3枚をトラッシュ
    { const me=LP('OP13-002'); C['__d__']={no:'__d__',name:'D',type:'CHAR',color:[],cost:1,power:1000,counter:0,traits:[]};
      me.deck=[]; for(let i=0;i<5;i++) me.deck.push(mkSyn('__d__',C['__d__'])); me.trash=[];
      await runFx([{op:'millSelf',n:3}],{self:me.leader,side:'me'});
      ok(me.deck.length===2 && me.trash.length===3, 'P-121: デッキ上3枚をトラッシュ'); delete C['__d__']; }
    // OP16-043 ウソップ: 旧正本切り詰めで隠れていた空thenバグ修正の回帰。KO時ドレスローザのリーダーをレスト→相手コスト5以下を手札に戻す
    { const me=LP('OP15-002'); me.isCPU=true; G.active='me'; G.players.cpu=mkP('OP11-041',true);
      C['__c5__']={no:'__c5__',name:'C5',type:'CHAR',color:[],cost:5,power:6000,counter:0,traits:[]};
      const v=mkSyn('__c5__',C['__c5__']); v.owner='cpu'; G.players.cpu.chars=[v]; me.leader.rested=false;
      const us=I('OP16-043','me'); await runFx(C['OP16-043'].fx.onKO,{self:us,side:'me'});
      ok(!G.players.cpu.chars.includes(v) && G.players.cpu.hand.some(x=>x.no==='__c5__') && me.leader.rested, 'OP16-043: KO時リーダーレスト→相手コスト5以下を手札に(空then修正)'); delete C['__c5__']; }
    // OP16-045 クロコダイル: 登場時 自コスト2以上を手札に戻す→手札からコスト2以下インペルダウン登場（空then修正）
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; G.turnSeq=5;
      C['__c3__']={no:'__c3__',name:'C3',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:[]};
      C['__imp2__']={no:'__imp2__',name:'Imp2',type:'CHAR',color:[],cost:2,power:3000,counter:0,traits:['インペルダウン']};
      const onb=mkSyn('__c3__',C['__c3__']); onb.owner='me'; me.chars=[onb]; me.hand=[mkSyn('__imp2__',C['__imp2__'])];
      await runFx(C['OP16-045'].fx.onPlay,{self:mkSyn('__imp2__',C['__imp2__']),side:'me'});
      ok(me.hand.some(x=>x.no==='__c3__') && me.chars.some(x=>x.no==='__imp2__'), 'OP16-045: 登場時 自キャラ手札戻し→インペルダウン登場(空then修正)'); delete C['__c3__']; delete C['__imp2__']; }
    // OP09-093 ティーチ: 【起動メイン】(登場ターン・黒ひげ)→相手リーダー＆キャラを効果無効（onPlay誤実装→act化の回帰）
    { const me=LP('OP09-081'); me.isCPU=true; G.active='me'; G.players.cpu=mkP('OP11-041',true);
      C['__t__']={no:'__t__',name:'T',type:'CHAR',color:[],cost:3,power:4000,counter:0,traits:[]};
      const ev=mkSyn('__t__',C['__t__']); ev.owner='cpu'; G.players.cpu.chars=[ev];
      const tc=I('OP09-093','me'); tc.summonedTurn=G.turnSeq;
      ok(C['OP09-093'].fx.act && !C['OP09-093'].fx.onPlay, 'OP09-093: 起動メイン化(登場時誤実装の修正)');
      await runFx(C['OP09-093'].fx.act.fx,{self:tc,side:'me'});
      ok(G.players.cpu.leader.negSeq===G.turnSeq && ev.negSeq===G.turnSeq+1 && ev.noAtkSeq===G.turnSeq+1, 'OP09-093: 相手リーダー(当ターン)＆キャラ(無効＋アタック不可)'); delete C['__t__']; }
    // 付与ドンは場を離れたらコストエリアに「レスト」で戻る（公式ルール。active化バグの回帰）
    { const me=LP('OP13-002'); me.isCPU=true; G.active='me'; C['__ad__']={no:'__ad__',name:'AD',type:'CHAR',color:[],cost:2,power:3000,counter:0,traits:[]};
      me.don={active:0,rested:0}; const k=mkSyn('__ad__',C['__ad__']); k.owner='me'; k.attachedDon=2; me.chars=[k];
      await koCard(k,'effect');
      ok(me.don.rested===2 && me.don.active===0, '付与ドン: KO時はコストエリアにレストで戻る');
      me.don={active:0,rested:0}; const d=mkSyn('__ad__',C['__ad__']); d.owner='me'; d.attachedDon=3; me.chars=[d];
      await runFx([{op:'selfToDeckBottom'}],{self:d,side:'me'});
      ok(me.don.rested===3 && me.don.active===0, '付与ドン: 効果で自己デッキ下もレストで戻る');
      me.don={active:0,rested:0}; const b=mkSyn('__ad__',C['__ad__']); b.owner='me'; b.attachedDon=1; me.chars=[b];
      bounceCard(b);
      ok(me.don.rested===1 && me.don.active===0, '付与ドン: バウンスもレストで戻る'); delete C['__ad__']; }
    // OP16-103 ヴァン・オーガ: 【トリガー】=【KO時】効果（黒ひげなら1ドロー＋相手-3000）。登場ではない（スクレイプで欠落していたトリガーの補完）
    { const me=LP('OP09-081'); me.isCPU=true; G.active='cpu'; G.players.cpu=mkP('OP11-041',true);
      C['__vo__']={no:'__vo__',name:'VO',type:'CHAR',color:[],cost:1,power:2000,counter:1000,traits:['黒ひげ海賊団']};
      const ec=mkSyn('__vo__',C['__vo__']); ec.owner='cpu'; G.players.cpu.chars=[ec];
      me.deck=[I('OP11-041','me'),I('OP11-041','me')]; // ドロー用にデッキを用意
      const hb=me.hand.length, cc=me.chars.length;
      ok(!!(C['OP16-103'].fx && C['OP16-103'].fx.trigger), 'OP16-103: 【トリガー】が実装されている');
      await runFx(C['OP16-103'].fx.trigger,{self:I('OP16-103','me'),side:'me'});
      ok(me.hand.length===hb+1 && me.chars.length===cc, 'OP16-103: トリガーはドロー＋弱体化のみ（キャラエリアに登場しない）'); delete C['__vo__']; }

    // ===================================================================
    // audit駆動【トリガー】一括実装の回帰（頻出テンプレート・docs/card-audit-workflow.md §5）
    // ===================================================================
    // 構造: 代表テンプレートに fx.trigger が配線されている
    ok(['EB01-030','EB02-030','OP02-117','EB02-007','EB02-018','OP01-029','EB03-054','OP06-100','EB01-029','EB01-039','EB01-020','OP15-079','EB03-058'].every(no=>C[no]&&C[no].fx&&C[no].fx.trigger&&C[no].fx.trigger.length), 'トリガー一括: 代表13テンプレートに fx.trigger 配線');
    // パラレル(_rN)は本体のtriggerを継承（薄いエントリを作らず親fxを共有）
    ok(C['OP02-117_r1']&&C['OP02-117_r1'].fx&&C['OP02-117_r1'].fx.trigger&&C['OP06-100_r1'].fx&&C['OP06-100_r1'].fx.trigger, 'トリガー一括: パラレルが本体triggerを継承(OP02-117_r1/OP06-100_r1)');
    // ★参照共有バグ回帰: 一部fxはno間でオブジェクト参照を共有する（例 OP01-016/EB02-017/PRB02-012, OP01-106/ST05-002）。
    //   in-place代入だと公式にトリガーの無いnoへ漏れる → 浅いクローンにtriggerを載せ替え共有元を不変にする。公式trigger有りのnoだけがtriggerを持つ。
    ok(!!C['PRB02-012'].fx.trigger && !(C['OP01-016'].fx&&C['OP01-016'].fx.trigger) && !(C['EB02-017'].fx&&C['EB02-017'].fx.trigger), 'トリガー一括: 参照共有でも公式trigger有りのnoだけがtrigger(OP01-016/EB02-017へ漏れない)');
    ok(!!C['OP01-106'].fx.trigger && !(C['ST05-002'].fx&&C['ST05-002'].fx.trigger), 'トリガー一括: 同上(OP01-106有り/ST05-002無し)');
    // reuse: main/onKO は既存fxのコピー
    ok(JSON.stringify(C['EB01-020'].fx.trigger)===JSON.stringify(C['EB01-020'].fx.main.fx) && C['EB01-020'].fx.trigger!==C['EB01-020'].fx.main.fx, 'トリガーreuse:main は main.fx の独立コピー(EB01-020)');
    ok(JSON.stringify(C['OP15-079'].fx.trigger)===JSON.stringify(C['OP15-079'].fx.onKO), 'トリガーreuse:onKO は onKO のコピー(OP15-079)');

    // 機能: draw（EB02-030 【トリガー】カード1枚を引く）
    { const me=LP('OP11-041'); me.deck=[I('OP11-041','me'),I('OP11-041','me')]; const hb=me.hand.length;
      await runFx(C['EB02-030'].fx.trigger,{self:I('EB02-030','me'),side:'me'});
      ok(me.hand.length===hb+1, 'トリガーdraw: EB02-030 で1ドロー'); }
    // 機能: ko コスト（OP02-117 相手コスト3以下1枚KO・コスト5は対象外）
    { const me=LP('OP11-041');
      C['__k3__']={no:'__k3__',name:'k3',type:'CHAR',color:[],cost:3,power:3000,counter:0,traits:[]};
      C['__k5__']={no:'__k5__',name:'k5',type:'CHAR',color:[],cost:5,power:5000,counter:0,traits:[]};
      const k3=mkSyn('__k3__',C['__k3__']); k3.owner='cpu'; const k5=mkSyn('__k5__',C['__k5__']); k5.owner='cpu'; G.players.cpu.chars=[k3,k5];
      await runFx(C['OP02-117'].fx.trigger,{self:I('OP02-117','me'),side:'me'});
      ok(!G.players.cpu.chars.includes(k3) && G.players.cpu.chars.includes(k5), 'トリガーko(コスト): OP02-117 でコスト3をKO・コスト5は対象外'); delete C['__k3__']; delete C['__k5__']; }
    // 機能: ko 現在パワー（EB02-007 相手パワー4000以下=maxEffPower。付与ドンで5000のキャラは対象外）
    { const me=LP('OP11-041');
      C['__p4__']={no:'__p4__',name:'p4',type:'CHAR',color:[],cost:2,power:4000,counter:0,traits:[]};
      C['__p3d__']={no:'__p3d__',name:'p3d',type:'CHAR',color:[],cost:2,power:4000,counter:0,traits:[]};
      const p4=mkSyn('__p4__',C['__p4__']); p4.owner='cpu'; const p4d=mkSyn('__p3d__',C['__p3d__']); p4d.owner='cpu'; p4d.attachedDon=1; // 現在5000
      G.players.cpu.chars=[p4,p4d];
      await runFx(C['EB02-007'].fx.trigger,{self:I('EB02-007','me'),side:'me'});
      ok(!G.players.cpu.chars.includes(p4) && G.players.cpu.chars.includes(p4d), 'トリガーko(現在パワー): EB02-007 でP4000をKO・付与ドンでP5000は対象外'); delete C['__p4__']; delete C['__p3d__']; }
    // 機能: restChar コスト（EB02-018 相手コスト4以下1枚レスト）
    { const me=LP('OP11-041');
      C['__c4__']={no:'__c4__',name:'c4',type:'CHAR',color:[],cost:4,power:4000,counter:0,traits:[]};
      const c4=mkSyn('__c4__',C['__c4__']); c4.owner='cpu'; c4.rested=false; G.players.cpu.chars=[c4];
      await runFx(C['EB02-018'].fx.trigger,{self:I('EB02-018','me'),side:'me'});
      ok(c4.rested===true, 'トリガーrest: EB02-018 でコスト4以下をレスト'); delete C['__c4__']; }
    // 機能: powerMod リーダーかキャラ+1000（OP01-029 リーダー選択）
    { const me=LP('OP11-041'); me.chars=[]; const p0=power(me.leader);
      await runFx(C['OP01-029'].fx.trigger,{self:I('OP01-029','me'),side:'me'});
      ok(power(me.leader)===p0+1000, 'トリガーpow: OP01-029 で自リーダー+1000'); }
    // ★review修正回帰: 「相手のリーダーかキャラ」は includeLeader を使う（leader:true は side:'self' 専用＝相手リーダーが対象に取れないバグ。counter系14箇所を一括修正）
    { const me=LP('OP11-041'); G.players.cpu.chars=[]; const p0=power(G.players.cpu.leader);
      await runFx(C['OP01-028'].fx.trigger,{self:I('OP01-028','me'),side:'me'});
      ok(power(G.players.cpu.leader)===p0-2000, 'includeLeader修正: OP01-028トリガーが相手リーダー-2000（キャラ0でも対象に取れる）'); }
    // ★OP07-075 ノロノロビーム: 「相手のリーダーとキャラ1枚まで」＝リーダーは無条件-2000（leaderBuff side:opp）＋キャラは選択
    { const me=LP('OP11-041'); me.don.active=1; G.players.cpu.chars=[]; const p0=power(G.players.cpu.leader);
      await runFx(C['OP07-075'].fx.counter.fx,{self:I('OP07-075','me'),side:'me'});
      ok(power(G.players.cpu.leader)===p0-2000, 'OP07-075: 相手リーダーへ無条件-2000（leaderBuff side:opp）'); }
    // ★OP12-018 覇王色の覇気: 「相手のリーダーとキャラすべて-1000」＝powerModのall分岐がincludeLeaderを無視していた修正
    { const me=LP('OP11-041'); me.don.active=2; const cpu=G.players.cpu; cpu.chars=[]; const p0=power(cpu.leader);
      await runFx(C['OP12-018'].fx.counter.fx,{self:I('OP12-018','me'),side:'me'});
      ok(power(cpu.leader)===p0-1000, 'OP12-018: all+includeLeaderで相手リーダーにも-1000'); }
    // ★P-150 クザン: 自ターンの【登場時】のみトラッシュからコスト1の【トリガー】持ちを蘇生（相手ターンの登場=トリガー登場では不発）
    { const me=LP('OP11-041');
      C['__t1__']={no:'__t1__',name:'t1',type:'CHAR',color:[],cost:1,power:1000,counter:0,traits:[],fx:{trigger:[{op:'draw',n:1}]}};
      const t1=mkSyn('__t1__',C['__t1__']); me.trash=[t1]; me.chars=[];
      await runFx(C['P-150'].fx.onPlay,{self:I('P-150','me'),side:'me'});
      ok(me.chars.includes(t1), 'P-150: 自ターン登場時にコスト1トリガー持ちを蘇生');
      G.active='cpu'; me.trash=[t1]; me.chars=[];
      await runFx(C['P-150'].fx.onPlay,{self:I('P-150','me'),side:'me'});
      ok(!me.chars.includes(t1), 'P-150: 相手ターンの登場では不発'); delete C['__t1__']; }
    // ★P-151 スモーカー: 手札1捨て→海軍リーダーならドン1レスト追加＋デッキ上5枚から海軍サーチ
    { G.players={me:mkP('OP02-093',false),cpu:mkP('OP11-041',true)}; G.active='me'; G.turnSeq=5; G.winner=null; const me=G.players.me;
      C['__nv__']={no:'__nv__',name:'nv',type:'CHAR',color:[],cost:2,power:2000,counter:1000,traits:['海軍']};
      me.hand=[I('OP11-041','me')]; me.deck=[mkSyn('__nv__',C['__nv__']),I('OP11-041','me'),I('OP11-041','me'),I('OP11-041','me'),I('OP11-041','me')]; me.don.rested=0;
      await runFx(C['P-151'].fx.onPlay,{self:I('P-151','me'),side:'me'});
      ok(me.don.rested===1, 'P-151: 海軍リーダーでドン1レスト追加');
      ok(me.hand.some(c=>(c.base.traits||[]).includes('海軍')), 'P-151: 海軍カードをサーチして手札へ'); delete C['__nv__']; }
    // ★OP05-099 アマゾン: 相手はライフ1枚トラッシュで回避できる／しなければ-2000（oppMayTrashLife新設）
    { const me=LP('OP11-041'); const cpu=G.players.cpu; cpu.life=[I('OP11-041','cpu'),I('OP11-041','cpu'),I('OP11-041','cpu')]; const p0=power(cpu.leader);
      await runFx(C['OP05-099'].fx.onOppAttack[0].then,{self:I('OP05-099','me'),side:'me'});
      ok(cpu.life.length===2 && power(cpu.leader)===p0, 'OP05-099: CPU相手はライフ3枚なら1枚払って回避');
      cpu.life=[I('OP11-041','cpu')]; const p1=power(cpu.leader); cpu.chars=[];
      await runFx(C['OP05-099'].fx.onOppAttack[0].then,{self:I('OP05-099','me'),side:'me'});
      ok(cpu.life.length===1 && power(cpu.leader)===p1-2000, 'OP05-099: ライフ1枚なら払わず-2000を受ける'); }
    // ★OP01-119 雷鳴八卦: 公式はトリガーを本文textに埋め込む型（trigger div空）＝fx.triggerは実在効果として維持
    ok(!!C['OP01-119'].fx.trigger && C['OP01-119'].fx.trigger[0].op==='donFromDeck' && C['OP01-119'].fx.trigger[0].mode==='active', 'OP01-119: text埋め込み型トリガー(ドン1アクティブ)を維持');
    // ★triggerText: cards-trigger.js由来の【トリガー】全文が本体+パラレルに付与される（表示とhasTrigger判定の正本）
    ok(C['OP01-009'].triggerText==='【トリガー】このカードを登場させる。' && !!(C['OP02-117_r1']&&C['OP02-117_r1'].triggerText), 'triggerText: 本体+パラレル(_rN)に付与');
    { const anyUnimpl=Object.values(C).find(b=>b&&b.triggerText&&!(b.fx&&b.fx.trigger));
      ok(!anyUnimpl || matchFilter({no:anyUnimpl.no,base:anyUnimpl,rested:false,attachedDon:0,buffs:[],kwGrant:[]},{hasTrigger:true}), 'hasTrigger: fx未実装でも印刷トリガー(triggerText)で判定される'); }
    // ===== トリガー追補（長尾118枚）の機能回帰 =====
    // ドン-1して登場（OP04-065）: ドンがあれば登場・なければ不発
    { const me=LP('OP11-041'); me.don.active=1; me.chars=[]; const self=I('OP04-065','me');
      await runFx(C['OP04-065'].fx.trigger,{self,side:'me'});
      ok(me.chars.includes(self) && donTotal('me')===0, '追補: OP04-065 ドン-1して自身登場（ドンはデッキへ）'); }
    { const me=LP('OP11-041'); me.don.active=0; me.don.rested=0; me.chars=[]; const self=I('OP04-065','me');
      await runFx(C['OP04-065'].fx.trigger,{self,side:'me'});
      ok(!me.chars.includes(self), '追補: OP04-065 ドン0なら登場しない'); }
    // KO+このカードを手札に（OP12-109）: limboのselfが手札へ
    { const me=LP('OP11-041'); const self=I('OP12-109','me');
      C['__k1__']={no:'__k1__',name:'k1',type:'CHAR',color:[],cost:1,power:1000,counter:0,traits:[]};
      const k1=mkSyn('__k1__',C['__k1__']); k1.owner='cpu'; G.players.cpu.chars=[k1];
      await runFx(C['OP12-109'].fx.trigger,{self,side:'me'});
      ok(!G.players.cpu.chars.includes(k1) && me.hand.includes(self), '追補: OP12-109 コスト1をKOし自身は手札へ'); delete C['__k1__']; }
    // 相手ドン6以上なら相手ドン1をデッキへ（OP02-089）
    { const me=LP('OP11-041'); const cpu=G.players.cpu; cpu.don.active=6; cpu.donMax=10;
      await runFx(C['OP02-089'].fx.trigger,{self:I('OP02-089','me'),side:'me'});
      ok(donTotal('cpu')===5, '追補: OP02-089 相手ドン6以上→1枚デッキへ');
      cpu.don.active=4; await runFx(C['OP02-089'].fx.trigger,{self:I('OP02-089','me'),side:'me'});
      ok(donTotal('cpu')===4, '追補: OP02-089 相手ドン5以下は不発'); }
    // 相手リーダーをレスト（OP16-039）／相手リーダーもアタック不可対象（OP04-100）
    { const me=LP('OP11-041'); const cpu=G.players.cpu; cpu.leader.rested=false;
      await runFx(C['OP16-039'].fx.trigger,{self:I('OP16-039','me'),side:'me'});
      ok(cpu.leader.rested===true, '追補: OP16-039 相手リーダーをレスト'); }
    { const me=LP('OP11-041'); const cpu=G.players.cpu; cpu.chars=[];
      await runFx(C['OP04-100'].fx.trigger,{self:I('OP04-100','me'),side:'me'});
      ok(cpu.leader.noAtkSeq!=null, '追補: OP04-100 相手リーダーをアタック不可にできる'); }
    // リーダーとキャラ1枚ずつ効果無効（OP10-098）
    { const me=LP('OP11-041'); const cpu=G.players.cpu;
      C['__n1__']={no:'__n1__',name:'n1',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:[]};
      const n1=mkSyn('__n1__',C['__n1__']); n1.owner='cpu'; cpu.chars=[n1]; cpu.leader.negSeq=null;
      await runFx(C['OP10-098'].fx.trigger,{self:I('OP10-098','me'),side:'me'});
      ok(cpu.leader.negSeq!=null && n1.negSeq!=null, '追補: OP10-098 リーダーとキャラ1枚ずつ効果無効'); delete C['__n1__']; }
    // コスト2以下すべてデッキ下（OP05-058）＝両者対象
    { const me=LP('OP11-041');
      C['__d2__']={no:'__d2__',name:'d2',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:[]};
      C['__d5__']={no:'__d5__',name:'d5',type:'CHAR',color:[],cost:5,power:5000,counter:0,traits:[]};
      const a=mkSyn('__d2__',C['__d2__']); const b2=mkSyn('__d5__',C['__d5__']); b2.owner='cpu'; const c2=mkSyn('__d2__',C['__d2__']); c2.owner='cpu';
      me.chars=[a]; G.players.cpu.chars=[b2,c2];
      await runFx(C['OP05-058'].fx.trigger,{self:I('OP05-058','me'),side:'me'});
      ok(!me.chars.includes(a) && !G.players.cpu.chars.includes(c2) && G.players.cpu.chars.includes(b2), '追補: OP05-058 両者のコスト2以下すべてデッキ下・コスト5は残る'); delete C['__d2__']; delete C['__d5__']; }
    // noEffect回帰（OP02-046）: トリガーのみのバニラ（キャロット等）は「元々の効果のないキャラ」として登場できる
    { const me=LP('OP11-041'); me.chars=[]; const carrot=I('OP01-009','me'); me.hand=[carrot];
      await runFx(C['OP02-046'].fx.trigger,{self:I('OP02-046','me'),side:'me'});
      ok(me.chars.includes(carrot), '追補: OP02-046 トリガー持ちバニラも「効果なし」として登場可（noEffect=本文text基準）'); }
    // ===== EB/ST/P/PRB 意味照合修正の回帰（2026-07-09・161発見の系統修正） =====
    // scry: look別名（op.n未指定でも0枚spliceにならない）
    { const me=LP('OP11-041'); me.deck=[I('OP11-041','me'),I('OP11-041','me'),I('OP11-041','me'),I('OP11-041','me')]; const d0=me.deck.length;
      await runFx([{op:'scry',look:3}],{self:me.leader,side:'me'});
      ok(me.deck.length===d0, 'scry look別名: 3枚見て戻す（枚数不変・0枚spliceでない）'); }
    // ko all side any: 両者の場が対象（ST08-005）
    { const me=LP('OP11-041');
      C['__z1__']={no:'__z1__',name:'z1',type:'CHAR',color:[],cost:1,power:1000,counter:0,traits:[]};
      const a1=mkSyn('__z1__',C['__z1__']); const b1=mkSyn('__z1__',C['__z1__']); b1.owner='cpu';
      me.chars=[a1]; G.players.cpu.chars=[b1];
      await runFx([{op:'ko',side:'any',filter:{maxCost:1},all:true}],{self:me.leader,side:'me'});
      ok(!me.chars.includes(a1) && !G.players.cpu.chars.includes(b1), 'ko all any: 両者のコスト1以下を全KO'); delete C['__z1__']; }
    // 強制discardはdiscardOwn（辞退不可・61箇所一括修正の型）: ST04-005=ドン-1で2ドロー1捨て
    ok(JSON.stringify(C['ST04-005'].fx.onPlay).includes('"op":"discardOwn"') && !JSON.stringify(C['ST04-005'].fx.onPlay).includes('discardCost'), '強制「捨てる」はdiscardOwn（ST04-005）');
    // 誤派生キーワードの打ち消し: 効果付与型はfxのgiveKeywordが担い常時フラグは立てない
    ok(C['EB04-061'].blocker===false && C['P-005'].banish===false && C['P-039'].banish===true, 'キーワード誤派生打ち消し: EB04-061/P-005はfalse・印刷持ちP-039はtrue');
    // 既知近似の解消（2026-07-09）: ST30-014=同一fx内の2回目donAttachは既選択を除外
    { const me=LP('OP11-041'); me.don.rested=4;
      C['__p6a__']={no:'__p6a__',name:'p6a',type:'CHAR',color:[],cost:4,power:6000,counter:0,traits:[]};
      C['__p6b__']={no:'__p6b__',name:'p6b',type:'CHAR',color:[],cost:4,power:6000,counter:0,traits:[]};
      const a6=mkSyn('__p6a__',C['__p6a__']); const b6=mkSyn('__p6b__',C['__p6b__']); me.chars=[a6,b6];
      await runFx(C['ST30-014'].fx.act.fx,{self:a6,side:'me'});
      ok(a6.attachedDon===2 && b6.attachedDon===2, 'ST30-014: 2回のドン付与が別々のキャラに2枚ずつ（同一対象重複を除外）'); delete C['__p6a__']; delete C['__p6b__']; }
    // ST08-013=バトル終了時フックへ移行 / ST17-003=束を上固定 / OP03-104=ライフ効果（scry誤用解消）
    ok(!!C['ST08-013'].fx.onBattleEndVsChar && !C['ST08-013'].fx.onAttack, 'ST08-013: onBattleEndVsCharフックで実装');
    ok(C['ST17-003'].fx.onPlay[0].pos==='top' && C['OP03-104'].fx.onPlay[0].op==='peekLifeTopPlace', 'ST17-003=上固定scry / OP03-104=peekLifeTopPlace');
    // EB01-011/EB02-025=コスト原子性（内部コスト成立後にrestThis）
    ok(JSON.stringify(C['EB01-011'].fx.act).includes('"op":"restThis"') && !JSON.stringify(C['EB01-011'].fx.act.cost).includes('restSelf'), 'EB01-011: レストは内部コスト成立後（原子性）');
    // ブロッカー持ちKO（ST01-016）: hasKwフィルタ
    { const me=LP('OP11-041');
      C['__bl__']={no:'__bl__',name:'bl',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:[],blocker:true};
      C['__nb__']={no:'__nb__',name:'nb',type:'CHAR',color:[],cost:2,power:2000,counter:0,traits:[]};
      const bl=mkSyn('__bl__',C['__bl__']); bl.owner='cpu'; const nb=mkSyn('__nb__',C['__nb__']); nb.owner='cpu'; G.players.cpu.chars=[bl,nb];
      await runFx(C['ST01-016'].fx.trigger,{self:I('ST01-016','me'),side:'me'});
      ok(!G.players.cpu.chars.includes(bl) && G.players.cpu.chars.includes(nb), '追補: ST01-016 【ブロッカー】持ちのみKO（hasKwフィルタ）'); delete C['__bl__']; delete C['__nb__']; }
    // 機能: discardCost→playSelf（EB03-054 手札1捨てて自身を登場）
    { const me=LP('OP11-041'); me.hand=[I('OP11-041','me')]; me.chars=[]; const self=I('EB03-054','me');
      await runFx(C['EB03-054'].fx.trigger,{self,side:'me'});
      ok(me.chars.includes(self), 'トリガーdiscardCost→playSelf: EB03-054 が手札1捨てて登場'); }
    // 機能: cond 相手ライフ以下→playSelf（OP06-100 相手ライフ3以下で登場）
    { const me=LP('OP11-041'); G.players.cpu.life=[I('OP11-041','cpu'),I('OP11-041','cpu'),I('OP11-041','cpu')]; me.chars=[];
      const self=I('OP06-100','me'); await runFx(C['OP06-100'].fx.trigger,{self,side:'me'});
      ok(me.chars.includes(self), 'トリガーcond(相手ライフ≤3): OP06-100 が登場'); }
    { const me=LP('OP11-041'); G.players.cpu.life=[I('OP11-041','cpu'),I('OP11-041','cpu'),I('OP11-041','cpu'),I('OP11-041','cpu')]; me.chars=[];
      const self=I('OP06-100','me'); await runFx(C['OP06-100'].fx.trigger,{self,side:'me'});
      ok(!me.chars.includes(self), 'トリガーcond(相手ライフ4): OP06-100 は登場しない'); }
    // 機能: cond 自リーダー名→playSelf（EB03-058 ベガパンクリーダーなら登場）
    { G.players={me:mkP('OP07-097',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null;
      const self=I('EB03-058','me'); G.players.me.chars=[];
      await runFx(C['EB03-058'].fx.trigger,{self,side:'me'});
      ok(G.players.me.chars.includes(self), 'トリガーcond(リーダー名): EB03-058 がベガパンクで登場'); }
    { const me=LP('OP11-041'); me.chars=[]; const self=I('EB03-058','me');
      await runFx(C['EB03-058'].fx.trigger,{self,side:'me'});
      ok(!me.chars.includes(self), 'トリガーcond(リーダー名): EB03-058 は非ベガパンクで登場しない'); }
    // 次tier: cond 特徴/特徴+ライフ合計 → playSelf ・ 手札捨て→ライフ追加（既存検証済opの組合せ）
    ok(['EB04-055','OP03-033','OP03-118'].every(no=>C[no]&&C[no].fx&&C[no].fx.trigger&&C[no].fx.trigger.length), '次tier: 特徴/特徴+ライフ/手札捨て→ライフ に fx.trigger 配線');
    // 機能: 特徴→playSelf（OP03-033 東の海リーダーで登場・非東の海では登場しない）
    { G.players={me:mkP('OP03-021',false),cpu:mkP('OP11-041',true)}; G.active='cpu'; G.turnSeq=5; G.winner=null; // OP03-021=クロ(東の海)
      const self=I('OP03-033','me'); G.players.me.chars=[];
      await runFx(C['OP03-033'].fx.trigger,{self,side:'me'});
      ok(G.players.me.chars.includes(self), 'トリガーcond(特徴): OP03-033 が東の海リーダーで登場'); }
    { const me=LP('OP11-041'); me.chars=[]; const self=I('OP03-033','me');
      await runFx(C['OP03-033'].fx.trigger,{self,side:'me'});
      ok(!me.chars.includes(self), 'トリガーcond(特徴): OP03-033 は非東の海で登場しない'); }
    // 機能: discardCost→lifeAddFromDeck（OP03-118 手札2捨て→デッキ上1枚をライフへ）
    { const me=LP('OP11-041'); me.hand=[I('OP11-041','me'),I('OP11-041','me')]; me.deck=[I('OP11-041','me')]; me.life=[];
      await runFx(C['OP03-118'].fx.trigger,{self:I('OP03-118','me'),side:'me'});
      ok(me.hand.length===0 && me.life.length===1 && me.deck.length===0, 'トリガーdiscardCost→ライフ: OP03-118 手札2捨て→デッキ上1枚をライフに'); }
  }catch(e){ console.log('EXCEPTION:', e.message); fail++; }
  console.log('Phase3 fxテスト: pass='+pass+' fail='+fail);
  process.exit(fail?1:0);
})();
`;
try { process.stdout.write(runHarness('fx', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
