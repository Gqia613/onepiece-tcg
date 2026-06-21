#!/usr/bin/env node
/* tests/fx-cards.js — Phase3で実装したカード効果(cards-fx.js)が実機で発動するか検証。
   使い方: node tests/fx-cards.js
   stubs + cards.js + cards-fx.js + index.html を結合して実行し、代表カードの効果を assert する。
   Phase3で新カードを実装したら、ここに1〜2ケース足すこと。 */
const { runHarness } = require('./_load-app');  // stubs+CARD_DB+CARD_FX+本体JS(src/00..60) の連結・実行を集約

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

    // OP16-027: 【ドン!!×1】このキャラのパワー+2000 (static)
    G.active='me';G.turnSeq=5;G.winner=null; G.players={me:mkP('OP13-002',false),cpu:mkP('OP11-041',true)};
    const s=I('OP16-027','me'); s.attachedDon=1; G.players.me.chars=[s];
    ok(power(s)===(C['OP16-027'].power+1000+2000), 'OP16-027: 付与ドン1で+2000(静的)');

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
  }catch(e){ console.log('EXCEPTION:', e.message); fail++; }
  console.log('Phase3 fxテスト: pass='+pass+' fail='+fail);
  process.exit(fail?1:0);
})();
`;
try { process.stdout.write(runHarness('fx', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
