#!/usr/bin/env node
/* tests/unit-example.js — カード効果のユニットテスト雛形。
   使い方: node tests/unit-example.js
   個別の効果（op / リーダー効果）を最小セットアップで検証する型。
   新しい効果を実装したら、ここに必ずテストを足すこと（公式テキストが根拠）。 */
const { runHarness }=require('./_load-app');  // stubs+CARD_DB+CARD_FX+本体JS(src/00..60) の連結・実行を集約

const harness = String.raw`
// プロンプトは自動応答（最初のクリック可能/pick:を選ぶ）
showPrompt=function(cfg){const o=(cfg.opts||[]).filter(x=>!x.disabled);const p=o.find(x=>String(x.v).indexOf('pick:')===0)||o[0];if(cfg.onPick)cfg.onPick(p&&p.v);return Promise.resolve(p&&p.v);};
function mkc(no){const b=C[no];return {no,base:b,owner:'me',attachedDon:0,rested:false,buffs:[],kwGrant:[],frozen:false,negSeq:null,noAtkSeq:null,uid:Math.floor(Math.random()*1e6),_faceUp:false};}
function setupG(leaderNo){G.active='me';G.turnSeq=5;G.winner=null;const mkP=(ln,cpu)=>({isCPU:cpu,leader:mkc(ln),chars:[],hand:[],life:[],deck:[],trash:[],stage:null,don:{active:0,rested:0},donMax:C[ln].donDeck||10,turnsTaken:3,denyBlock:false});G.players={me:mkP(leaderNo,false),cpu:mkP('OP11-041',true)};}
(async()=>{
  let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  NG:',m);}};
  try{
    // 例1: donAttach はレストのドンから取る（公式: 効果の「レストのドン付与」）
    setupG('OP13-002'); let P=G.players.me; P.don.active=3; P.don.rested=2;
    await doOp({op:'donAttach',target:'leader',n:1},{side:'me',self:P.leader});
    ok(P.leader.attachedDon===1 && P.don.rested===1 && P.don.active===3, 'donAttachはレスト消費・アクティブ不変');

    // 例2: レスト0なら付与0（アクティブから取らない）
    setupG('OP13-002'); P=G.players.me; P.don.active=5; P.don.rested=0;
    await doOp({op:'donAttach',target:'leader',n:1},{side:'me',self:P.leader});
    ok(P.leader.attachedDon===0 && P.don.active===5, 'レスト0なら付与0');

    // 例3: エネル起動メイン（場0・キャラ1体）→ 1アクティブ+4レスト追加→レスト4付与
    setupG('OP15-058'); let E=G.players.me; E.chars=[mkc('OP15-067')];
    await leaderActivate('me');
    ok(E.don.active===1, 'エネル: アクティブ+1');
    ok(E.chars[0].attachedDon===4, 'エネル: キャラにレスト4付与');
    ok(donTotal('me')===5, 'エネル: 合計ドン=5');

    // 例4: 付与ドンは自分のターン中のみ+1000計上（相手ターンでは表示・計算とも元に戻る）
    setupG('OP13-002'); G.active='cpu'; P=G.players.me; const d1=mkc('OP15-067'); d1.attachedDon=2; P.chars=[d1];
    ok(power(d1)===(C['OP15-067'].power||0), '付与ドン: 相手ターン中は計上しない（表示も元に戻る）');
    G.active='me';
    ok(power(d1)===(C['OP15-067'].power||0)+2000, '付与ドン: 自分のターン中は+2000計上');

    // 例5(H2): 身代わり保護(donToDeck)はアクティブ0でもレストから払い、払えた時のみ成立
    setupG('OP13-002'); P=G.players.me; P.chars=[mkc('OP15-069'),mkc('OP15-067')];
    P.don.active=0; P.don.rested=1;
    const prot1=await protectFromEffect(P.chars[1]);
    ok(prot1===true && P.don.rested===0 && P.don.active===0, 'H2: アクティブ0でもレストから1枚払い保護成立');
    // 戻せるドンが無ければ無償保護しない
    setupG('OP13-002'); P=G.players.me; P.chars=[mkc('OP15-069'),mkc('OP15-067')];
    P.don.active=0; P.don.rested=0;
    const prot2=await protectFromEffect(P.chars[1]);
    ok(prot2===false, 'H2: 戻せるドンが無ければ保護不成立(無償保護なし)');

    // 例6(H3): deckBottom はキャラの付与ドンを所有者のコストエリアへ戻す（ドン総数保存）
    setupG('OP15-058'); P=G.players.me; const victim=mkc('OP15-067'); victim.attachedDon=2; P.chars=[victim]; P.don.active=0;
    const beforeTotal=donTotal('me');
    await doOp({op:'deckBottom',maxCost:10},{side:'cpu',self:G.players.cpu.leader});
    ok(!P.chars.includes(victim) && P.don.active===2 && donTotal('me')===beforeTotal, 'H3: deckBottomで付与ドンが消えずコストエリアへ戻る');

    // 例7(H4/M2): 相手キャラへ付けた「このターン中」デバフは自分のターン終了で失効する
    setupG('OP13-002'); // G.active='me'
    const ec=mkc('OP15-067'); ec.owner='cpu'; G.players.cpu.chars=[ec];
    addBuff(ec, -3000, 'turnEnd');
    G.winner='me'; // endTurnの連鎖(beginTurn)を止める
    await endTurn('me');
    ok(ec.buffs.length===0, 'H4/M2: 相手キャラのturnEndデバフが自分のターン終了で失効');

    // 例8(M5): giveKeyword(untilNextEnd)は相手ターンを跨いで生存し、所有者の次ターン開始で失効
    setupG('OP15-058'); P=G.players.me;
    await doOp({op:'giveKeyword',target:'self',kw:'blocker',duration:'untilNextEnd'},{side:'me',self:P.leader});
    ok(P.leader.kwGrant.some(g=>g.kw==='blocker'&&g.dur==='oppNextEnd') && hasKw(P.leader,'blocker'), 'M5: untilNextEnd付与でブロッカー有効');
    clearTurnGrants('me');
    ok(hasKw(P.leader,'blocker'), 'M5: 自ターン終了(clearTurnGrants)では失効しない=相手ターンも有効');
    P.deck=[mkc('OP15-067')]; G.winner=null;
    await beginTurn('me');
    ok(!hasKw(P.leader,'blocker'), 'M5: 所有者の次ターン開始で失効');

    // 例9(CPU): リーサル判定 — 削り切れる盤面はtrue / 相手手札が厚いとfalse
    setupG('OP13-002'); G.active='cpu';
    const CC=G.players.cpu, MM=G.players.me;
    MM.life=[mkc('OP15-067')]; MM.hand=[]; MM.chars=[];          // 相手ライフ1・手札0・ブロッカー無し
    CC.don.active=0;
    const a1=mkc('OP15-067'); a1.owner='cpu'; a1.attachedDon=10; // power 12000（任意リーダーに到達）
    const a2=mkc('OP15-067'); a2.owner='cpu'; a2.attachedDon=10;
    CC.chars=[a1,a2];
    ok(cpuCanLethal('cpu')===true, 'CPU: 削り切れる盤面でリーサルtrue');
    MM.hand=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // 手札4枚＝防御厚い
    ok(cpuCanLethal('cpu')===false, 'CPU: 相手手札が厚いとリーサルfalse');

    // 例10(CPU): ローカル方針 — 相手ライフ僅少ならアグロ
    setupG('OP13-002');
    G.players.me.life=[mkc('OP15-067'),mkc('OP15-067')];                         // 相手(me)ライフ2
    G.players.cpu.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
    ok(localPlan('cpu').aggression==='high', 'CPU: 相手ライフ少→aggro方針');

    // 例11: 場が5体でもキャラを登場でき、1体がトラッシュへ移動する
    setupG('OP13-002'); const TT=G.players.cpu; // CPU側=自動で最弱を捨てる
    TT.chars=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
    TT.chars.forEach(c=>c.owner='cpu');
    const trBefore=TT.trash.length; const fresh=mkc('OP15-069'); fresh.owner='cpu';
    await summon('cpu', fresh, true);
    ok(TT.chars.length===5 && TT.chars.includes(fresh) && TT.trash.length===trBefore+1, '場5体でも登場でき1体がトラッシュへ');

    // 例12: 致死圏では高価値キャラを守るためにカウンターを切らない（リーダー防御に温存）／安全圏では守る
    // --- 危険：低ライフ＋相手に残り攻撃源あり ---
    setupG('OP13-002'); G.active='me';
    let Dc=G.players.cpu, Ac=G.players.me;
    let atk=mkc('OP15-067'); atk.owner='me'; atk.attachedDon=8;          // power 10000
    let threat=mkc('OP15-067'); threat.owner='me';                       // 残りの攻撃源
    Ac.chars=[atk,threat];                                               // me.leaderも未レスト＝脅威
    let tgt=mkc('OP15-046'); tgt.owner='cpu';                            // 高価値キャラ(scoreChar≈21)
    Dc.chars=[tgt]; Dc.hand=[mkc('OP15-067'),mkc('OP15-067')];           // +2000カウンター2枚
    Dc.life=[mkc('OP15-067'),mkc('OP15-067')];                          // ライフ2（危険）
    await cpuCounter('cpu', atk, tgt);
    ok(Dc.hand.length===2, '致死圏: キャラを守るためにカウンターを切らない');
    // --- 安全：高ライフ ---
    setupG('OP13-002'); G.active='me';
    Dc=G.players.cpu; Ac=G.players.me;
    atk=mkc('OP15-067'); atk.owner='me'; atk.attachedDon=8; threat=mkc('OP15-067'); threat.owner='me';
    Ac.chars=[atk,threat];
    tgt=mkc('OP15-046'); tgt.owner='cpu';
    Dc.chars=[tgt]; Dc.hand=[mkc('OP15-067'),mkc('OP15-067')];
    Dc.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // ライフ5（安全）
    await cpuCounter('cpu', atk, tgt);
    ok(Dc.hand.length<2, '安全圏: 高価値キャラは守る（カウンター使用）');

    // 例13: 致死回避でも「耐えられないアタック」には手札カウンターを浪費しない／耐えられるなら守る
    const mkHand=()=>[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // +2000×4=8000
    setupG('OP13-002'); G.active='me';
    let Dc2=G.players.cpu, Ac2=G.players.me;
    let big=mkc('OP15-067'); big.owner='me'; big.attachedDon=15;        // power 17000（どのリーダーでも止まらない）
    Ac2.chars=[big]; Dc2.life=[];                                       // ライフ0＝被弾で敗北（survival）
    Dc2.hand=mkHand();
    await cpuCounter('cpu', big, Dc2.leader);
    ok(Dc2.hand.length===4, '致死回避: 耐えられないアタックにはカウンターを浪費しない');
    setupG('OP13-002'); G.active='me';
    Dc2=G.players.cpu; Ac2=G.players.me;
    big=mkc('OP15-067'); big.owner='me'; big.attachedDon=5;             // power 7000（手札8000で確実に止まる）
    Ac2.chars=[big]; Dc2.life=[];
    Dc2.hand=mkHand();
    await cpuCounter('cpu', big, Dc2.leader);
    ok(Dc2.hand.length<4, '致死回避: 耐えられるアタックは守る');

    // 例(指摘3): リーダーへのアタック — 中盤ライフ(2-3)＋手札余裕なら止められるアタックは受け止める／高ライフは素受けで温存
    const mkLA=()=>{const a=mkc('OP15-067'); a.owner='me'; a.attachedDon=3; return a;}; // power 5000 = 防御側CPUリーダー(OP11-041 ナミ)P5000 → need0(+1000で止まる)
    setupG('OP13-002'); G.active='me'; let Dm=G.players.cpu; G.players.me.chars=[mkLA()];
    Dm.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];                  // ライフ3→被弾後2(中盤)
    Dm.hand=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];  // カウンター手札に余裕
    let hb=Dm.hand.length; await cpuCounter('cpu', G.players.me.chars[0], Dm.leader);
    ok(Dm.hand.length<hb, '指摘3: 中盤ライフ＋手札余裕なら止められるリーダーアタックを受け止める');
    setupG('OP13-002'); G.active='me'; Dm=G.players.cpu; G.players.me.chars=[mkLA()];
    Dm.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // ライフ5→被弾後4(高ライフ)
    Dm.hand=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
    hb=Dm.hand.length; await cpuCounter('cpu', G.players.me.chars[0], Dm.leader);
    ok(Dm.hand.length===hb, '指摘3: 高ライフは素受けでカウンター温存（過剰防御しない）');

    // 例(バグ修正): OP09-086「相手の効果ではKOされない」はKO限定の耐性。選択・パワー減少・レスト等は通す
    setupG('OP13-002'); const imm=mkc('OP09-086'); imm.owner='cpu'; G.players.cpu.chars=[imm];
    await doOp({op:'ko'},{side:'me',self:G.players.me.leader});                 // ko効果は候補から除外＝KOされない
    ok(G.players.cpu.chars.includes(imm), 'OP09-086: 相手の効果ではKOされない');
    ok((await protectFromEffect(imm,'ko'))===true, 'OP09-086: protectFromEffect(ko)が効果KOを防ぐ(バックストップ)');
    const immBefore=power(imm);                                                 // パワー-1000は対象に選べて適用される
    await doOp({op:'powerMod',side:'opp',amount:-1000,count:1},{side:'me',self:G.players.me.leader});
    ok(power(imm)===immBefore-1000, 'OP09-086: KO耐性でもパワー減少は対象に選べる');
    await doOp({op:'restChar',count:1},{side:'me',self:G.players.me.leader});   // レストも通る
    ok(imm.rested===true, 'OP09-086: KO耐性でもレストは対象に選べる');

    // 例(リファクタ): リーダー登場時誘発を data駆動 onAllyEnter フックに移行（挙動不変）
    // ハンコック(OP14-041): 相手ターン中に自分のキャラ登場で1ドロー
    setupG('OP14-041'); G.active='cpu'; let Hp=G.players.me; Hp.deck=[mkc('OP15-067'),mkc('OP15-067')]; Hp.hand=[];
    await summon('me', mkc('OP15-067'), true);
    ok(Hp.hand.length===1 && Hp.deck.length===1, 'ハンコック onAllyEnter: 相手ターン中の登場で1ドロー');
    // 自分ターン中は発動しない（when:oppTurn）
    setupG('OP14-041'); G.active='me'; Hp=G.players.me; Hp.deck=[mkc('OP15-067')]; Hp.hand=[];
    await summon('me', mkc('OP15-067'), true);
    ok(Hp.hand.length===0, 'ハンコック onAllyEnter: 自分ターン中は発動しない');
    // ナミ(OP11-041): 【ドン×1】自ターン中の登場で1ドロー＆1枚デッキ下（枚数保存・ターン1回）
    setupG('OP11-041'); let Np=G.players.me; Np.leader.attachedDon=1;
    Np.deck=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; Np.hand=[mkc('OP15-067')];
    await summon('me', mkc('OP15-067'), true);
    ok(Np.deck.length===3 && Np.hand.length===1 && Np.leader._allyEnterTurn===G.turnSeq, 'ナミ onAllyEnter: ドン×1で1ドロー＆1枚デッキ下(枚数保存)');
    await summon('me', mkc('OP15-067'), true); // 2体目→once:turnで不発
    ok(Np.hand.length===1, 'ナミ onAllyEnter: ターン1回(2体目では発動しない)');
    // ドン×1未満（attachedDon=0）では発動しない
    setupG('OP11-041'); Np=G.players.me; Np.leader.attachedDon=0; Np.deck=[mkc('OP15-067')]; Np.hand=[];
    await summon('me', mkc('OP15-067'), true);
    ok(Np.hand.length===0, 'ナミ onAllyEnter: ドン×1未満は発動しない(cond)');

    // 例14: デッキビルダー — 色合致50枚で構築でき、自分/CPU両方のデッキを生成できる
    G.customDecks = [];
    const bdr = { leaderNo: 'OP15-058', list: {}, name: 'UTカスタム' };
    let bdAdd = 0;
    for (const no of Object.keys(C).filter(n => cardLegalForLeader(n, 'OP15-058'))) { while ((bdr.list[no]||0) < 4 && bdAdd < 50) { bdr.list[no] = (bdr.list[no]||0)+1; bdAdd++; } if (bdAdd>=50) break; }
    ok(builderValidate(bdr).ok && deckTotal(bdr.list)===50, 'ビルダー: 色合致50枚で構築OK');
    const bdDeck = builderToDeck(bdr); G.customDecks.push(bdDeck);
    ok(buildPlayer('me', bdDeck.id, false).deck.length===50, 'ビルダー: 自分デッキ50枚生成');
    ok(buildPlayer('cpu', bdDeck.id, true).deck.length===50, 'ビルダー: CPUも同デッキで50枚生成');
    ok(builderValidate({leaderNo:'OP15-058',list:{'OP15-067':4}}).ok===false, 'ビルダー: 50枚未満はNG');
    ok(cardLegalForLeader('OP15-067','OP15-058')===true, 'ビルダー: 同色カードは合法');
  }catch(e){ console.log('EXCEPTION:', e.message); fail++; }
  console.log('ユニットテスト: pass='+pass+' fail='+fail);
  process.exit(fail?1:0);
})();
`;
try{ process.stdout.write(runHarness('unit', harness)); }
catch(e){ process.stdout.write((e.stdout||'')+(e.stderr||'')); process.exit(1); }
