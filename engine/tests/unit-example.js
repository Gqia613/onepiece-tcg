#!/usr/bin/env node
/* tests/unit-example.js — カード効果のユニットテスト雛形。
   使い方: node tests/unit-example.js
   個別の効果（op / リーダー効果）を最小セットアップで検証する型。
   新しい効果を実装したら、ここに必ずテストを足すこと（公式テキストが根拠）。

   ★必須のテスト型（engine/CLAUDE.md §11-19〜22。理想盤面のハッピーパスだけのテストは実バグを素通しした実績あり）:
   - 痩せた盤面: コスト支払いを含む効果は「素直な支払いソースが空」の状態で1本
     （ドン全付与でコストエリア0・手札0・ライフ0/1。雛形=例3c: 付与ドンからのドン!!-N支払い）
   - 辞退パス: 任意効果（「〜できる」「◯枚まで」=0枚選択も合法）は「発動しない」を選んで
     コスト未消費・【ターン1回】未消費(ctx._declined/_committed)を1本（雛形=例3d）
   - 人間可視性: 「見る」系はrevealがcfgに載ることをassert（雛形=例3e。flogのみ=不発と区別不能） */
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

    // 例3c: 「ドン!!-N」は付与済みドン(attachedDon)も戻せる（公式裁定: リーダー/ステージ/キャラ/コストエリアから自由に選択）。
    //       紫カタクリL OP11-062 のように盤面へドンを付与し切るとコストエリアが空になり、従来は毎アタックの「ドン!!-1」が支払い不能で不発だった回帰。
    setupG('OP11-062'); { const P3=G.players.me; P3.don.active=0; P3.don.rested=0; P3.leader.attachedDon=2;
      const before=donTotal('me'); const ctx={side:'me',self:P3.leader};
      await doOp({op:'donMinus',n:1},ctx);
      ok(ctx._committed && !ctx._declined && P3.leader.attachedDon===1 && donTotal('me')===before-1, '例3c: コストエリア空でも付与ドンを戻して「ドン!!-1」が成立'); }
    // コストエリアにドンがあれば優先し、付与ドンは温存
    setupG('OP11-062'); { const P4=G.players.me; P4.don.active=0; P4.don.rested=1; P4.leader.attachedDon=2;
      await doOp({op:'donMinus',n:1},{side:'me',self:P4.leader});
      ok(P4.don.rested===0 && P4.leader.attachedDon===2, '例3c: コストエリアのドンを優先し付与ドンは温存'); }
    // 戻せるドンが総数で不足なら支払い不能で不発（_declined・盤面不変）
    setupG('OP11-062'); { const P5=G.players.me; P5.don.active=0; P5.don.rested=0; P5.leader.attachedDon=0;
      const ctx5={side:'me',self:P5.leader}; await doOp({op:'donMinus',n:1},ctx5);
      ok(ctx5._declined && !ctx5._committed, '例3c: 戻せるドンが無ければ支払い不能で不発(_declined)'); }

    // 例3d: 「ドン‼-N：」の任意発動確認（optional:true→confirmUse）。人間は発動する/しないを選べる（公式の任意コスト）。
    //       紫カタクリL OP11-062 の【アタック時】/【相手のアタック時】で「発動しない」選択肢が無く強制発動していた回帰。
    // 承諾（既定stubはprimary='y'を返す）→ 付与ドンを戻して発動
    setupG('OP11-062'); { const P=G.players.me; P.don.active=0; P.don.rested=0; P.leader.attachedDon=2;
      const before=donTotal('me'); const ctx={side:'me',self:P.leader};
      await doOp({op:'donMinus',n:1,optional:true,then:[{op:'leaderBuff',amount:1000,duration:'battle'}]},ctx);
      ok(ctx._committed && donTotal('me')===before-1, '例3d: 確認で「発動する」→ドン‼-1を払い効果発動'); }
    // 辞退（showPromptを'n'に差し替え）→ ドン消費なし・不発・_declined（【ターン1回】未消費の根拠）
    setupG('OP11-062'); { const P=G.players.me; P.don.active=1; P.don.rested=0;
      const _sp=showPrompt; showPrompt=function(cfg){return Promise.resolve('n');};
      const before=donTotal('me'); const ctx={side:'me',self:P.leader};
      await doOp({op:'donMinus',n:1,optional:true,then:[{op:'leaderBuff',amount:1000,duration:'battle'}]},ctx);
      showPrompt=_sp;
      ok(ctx._declined && !ctx._committed && donTotal('me')===before, '例3d: 確認で「発動しない」→ドン消費なし・不発(_declined)'); }
    // CPUは確認なしで自動発動（confirmUseがCPUにtrueを返す）
    setupG('OP11-062'); { const P=G.players.me; P.isCPU=true; P.don.active=1; P.don.rested=0;
      const before=donTotal('me'); const ctx={side:'me',self:P.leader};
      await doOp({op:'donMinus',n:1,optional:true,then:[{op:'leaderBuff',amount:1000,duration:'battle'}]},ctx);
      ok(ctx._committed && donTotal('me')===before-1, '例3d: CPUは確認なしで自動発動'); }

    // 例3f: ★E57 evgate — CPUは「先頭コストを支払えない/直後のcondが不成立」のイベントを能動プレイしない（無駄撃ち抑止）。
    //       fx-fire-coverage実測: 30試合で9回、イベントカード+プレイコストを消費して効果不発だった（OP16-038等）。
    // restDonCost n:6 — イベントのプレイコスト支払い後の残アクティブドンで判定
    setupG('OP11-041'); { const P=G.players.me; const ev=mkc('OP16-038');
      P.don.active=6; P.don.rested=0; // OP16-038はコスト1想定→支払い後active5<6で不能
      const evc=effCost('me',ev);
      P.don.active=5+evc; ok(!eventMainUsable('me',ev), '例3f: restDonCost6が残ドン不足なら不使用');
      P.don.active=6+evc; // ドンは足りるがcond(インペルダウン5種)不成立→コスト→単一cond包みの判定で不使用
      ok(!eventMainUsable('me',ev), '例3f: ドンが足りてもcond不成立なら不使用（純損防止）'); }
    // donMinus n:1 — 付与ドン込みの総ドンで判定（returnDonChooseと同じ母集団）
    setupG('OP15-058'); { const P=G.players.me; const ev=mkc('OP15-074');
      P.don.active=0; P.don.rested=0; P.leader.attachedDon=0;
      ok(!eventMainUsable('me',ev), '例3f: donMinus1が総ドン0なら不使用');
      P.leader.attachedDon=1; ok(eventMainUsable('me',ev), '例3f: 付与ドン1あればdonMinus1は使用可'); }

    // 例3h: WARN36トリアージ由来の6修正（2026-07-23）
    // (1) ST13-014: 「登場させた場合」のリーダーバフはrevealLifePlayのthen＝登場した時だけ
    setupG('OP13-002'); { const me=G.players.me; const sabo=mkc('ST13-014'); me.chars=[sabo];
      const luffy5=mkc('ST13-015'); me.life=[luffy5]; const L0=power(me.leader);
      await runFx(C['ST13-014'].fx.act.fx,{self:sabo,side:'me'});
      ok(me.chars.some(c=>c.no==='ST13-015') && power(me.leader)===L0+2000, '例3h-1: 公開が一致→登場+リーダー+2000（全半角Ｄ/D正規化込み）'); }
    setupG('OP13-002'); { const me=G.players.me; const sabo=mkc('ST13-014'); me.chars=[sabo];
      me.life=[mkc('ST01-006')]; const L0=power(me.leader);
      await runFx(C['ST13-014'].fx.act.fx,{self:sabo,side:'me'});
      ok(power(me.leader)===L0, '例3h-1: 公開が不一致→登場せずリーダーバフも無し（実バグ回帰）'); }
    // (2) OP15-091: 相手トラッシュ→デッキ下は「自分が選ぶ」+任意（見送り可）
    setupG('OP13-002'); { const cpu=G.players.cpu; cpu.trash=[mkc('ST01-006')]; cpu.deck=[];
      await runFx(C['OP15-091'].fx.onPlay,{self:mkc('OP15-091'),side:'me'});
      ok(cpu.trash.length===0 && cpu.deck.length===1, '例3h-2: 自分が選んで相手トラッシュ→持ち主デッキ下'); }
    setupG('OP13-002'); { const cpu=G.players.cpu; cpu.trash=[mkc('ST01-006')]; cpu.deck=[];
      const _hp=humanPick; humanPick=function(){return Promise.resolve(null);}; // 見送り
      await runFx(C['OP15-091'].fx.onPlay,{self:mkc('OP15-091'),side:'me'});
      humanPick=_hp;
      ok(cpu.trash.length===1 && cpu.deck.length===0, '例3h-2: 「1枚まで」＝見送り可'); }
    // (3) OP15-119: ライフ公開は人間に確認（辞退→公開もバフも無し）
    setupG('OP13-002'); { const me=G.players.me; const lf=mkc('OP15-119'); me.chars=[lf]; me.life=[mkc('OP15-067')];
      const _sp=showPrompt; showPrompt=function(cfg){return Promise.resolve('n');};
      const p0=power(lf); await runFx([{op:'revealLifeCostBuff'}],{self:lf,side:'me'}); showPrompt=_sp;
      ok(power(lf)===p0, '例3h-3: 公開確認を辞退→バフ無し'); }
    // (4) OP10-003シュガーL第2能力: 相手ターン中のイベント発動→ドン1アクティブ追加（ターン1回）
    setupG('OP10-003'); { const me=G.players.me; G.active='cpu'; G.turnSeq=6; me.don={active:0,rested:0}; me.donMax=10;
      await fireOwnEventUsed('me');
      ok(me.don.active===1, '例3h-4: 相手ターン中のイベント発動でドン1アクティブ追加');
      await fireOwnEventUsed('me');
      ok(me.don.active===1, '例3h-4: 【ターン1回】＝同ターン2回目は不発');
      G.active='me'; G.turnSeq=7;
      await fireOwnEventUsed('me');
      ok(me.don.active===1, '例3h-4: 自分のターン中は発動しない'); }
    // (5) OP12-081コアラL第2能力: 相手が元々コスト8以上を登場→相手はライフ上1枚を手札に（コスト7は対象外）
    setupG('OP13-002'); { const cpu=G.players.cpu; cpu.leader=mkc('OP12-081'); cpu.leader.owner='cpu'; cpu.isCPU=true;
      const me=G.players.me; me.life=[mkc('ST01-006'),mkc('ST01-006')]; me.hand=[]; G.active='me'; G.turnSeq=8;
      const big=Object.values(C).find(c=>c.type==='CHAR'&&c.cost===8&&!c.fx); const bc=mkc(big.no); // コスト8バニラ
      await summon('me',bc,false);
      ok(me.life.length===1 && me.hand.length===1, '例3h-5: 元々コスト8以上の登場→登場側のライフ上1枚が手札へ');
      const small=Object.values(C).find(c=>c.type==='CHAR'&&c.cost===7&&!c.fx); const sc=mkc(small.no);
      G.turnSeq=9; me.life=[mkc('ST01-006')]; me.hand=[];
      await summon('me',sc,false);
      ok(me.life.length===1 && me.hand.length===0, '例3h-5: コスト7の通常登場は対象外'); }
    // (6) OP01-063アーロン: 相手手札1枚をブラインド公開→イベントならライフ上1枚をデッキ下（任意）
    setupG('OP13-002'); { const cpu=G.players.cpu; const ev=mkc('OP05-077'); ev.owner='cpu'; cpu.hand=[ev];
      cpu.life=[mkc('ST01-006'),mkc('ST01-006')]; cpu.deck=[]; const ar=mkc('OP01-063'); G.players.me.chars=[ar];
      await runFx(C['OP01-063'].fx.act.fx,{self:ar,side:'me'});
      ok(cpu.life.length===1 && cpu.deck.length===1, '例3h-6: 公開がイベント→相手ライフ上1枚をデッキ下'); }
    setupG('OP13-002'); { const cpu=G.players.cpu; const ch=mkc('ST01-006'); ch.owner='cpu'; cpu.hand=[ch];
      cpu.life=[mkc('ST01-006')]; cpu.deck=[]; const ar=mkc('OP01-063'); G.players.me.chars=[ar];
      await runFx(C['OP01-063'].fx.act.fx,{self:ar,side:'me'});
      ok(cpu.life.length===1 && cpu.deck.length===0, '例3h-6: 公開がイベント以外→何も起きない');
      cpu.hand=[];
      await runFx(C['OP01-063'].fx.act.fx,{self:ar,side:'me'});
      ok(cpu.life.length===1, '例3h-6: 手札0→何も起きない(Q&A157)'); }

    // 例3i: 意味照合バッチ1の修正（2026-07-23）
    // OP06-038: 「そのカードを+2000」＝2回目は同一対象（samePrev）
    setupG('OP13-002'); { const me=G.players.me; const c1=mkc('OP15-067'); me.chars=[c1];
      for(let i=0;i<8;i++){const r=mkc('ST01-006');r.rested=true;me.chars.push(r);} // レスト8枚
      const p0=power(c1);
      const _hp=humanPick; humanPick=function(cands){return Promise.resolve(cands.find(x=>x===c1)||cands[0]);};
      await runFx(C['OP06-038'].fx.counter.fx,{self:mkc('OP06-038'),side:'me'});
      humanPick=_hp;
      ok(power(c1)===p0+4000, '例3i: OP06-038は同一カードに+2000×2（samePrev）'); }
    // OP09-072: コスト原子性＝手札捨てを辞退したらドンは減らない
    setupG('OP13-002'); { const me=G.players.me; me.don={active:3,rested:0}; me.hand=[mkc('ST01-006')];
      const _hp=humanPick; humanPick=function(){return Promise.resolve(null);}; // 捨てを辞退
      await runFx(C['OP09-072'].fx.onPlay,{self:mkc('OP09-072'),side:'me'});
      humanPick=_hp;
      ok(donTotal('me')===3 && me.hand.length===1, '例3i: OP09-072は捨て辞退でドン未消費（原子性）'); }
    // OP10-119: ドン付与は超新星リーダー限定
    setupG('OP13-002'); { const me=G.players.me; me.don={active:0,rested:1}; me.hand=[];
      await runFx(C['OP10-119'].fx.onPlay,{self:mkc('OP10-119'),side:'me'});
      ok(me.leader.attachedDon===0, '例3i: OP10-119は非超新星リーダーへ付与しない'); }
    setupG('OP01-001'); { const me=G.players.me; me.don={active:0,rested:1}; me.hand=[];
      await runFx(C['OP10-119'].fx.onPlay,{self:mkc('OP10-119'),side:'me'});
      ok(me.leader.attachedDon===1, '例3i: 超新星リーダーには付与する'); }
    // deckBottom: count対応（OP06-058 mainで2枚送れる）
    setupG('OP13-002'); { const cpu=G.players.cpu; const a=mkc('OP15-067'),b=mkc('OP15-067'); a.owner='cpu';b.owner='cpu'; cpu.chars=[a,b]; cpu.deck=[];
      await runFx(C['OP06-058'].fx.main.fx,{self:mkc('OP06-058'),side:'me'});
      ok(cpu.chars.length===0 && cpu.deck.length===2, '例3i: OP06-058 mainは2枚までデッキ下（count対応）'); }
    // search exclude の全半角正規化（OP10-111が全角Ｄルフィを除外できる）
    setupG('OP13-002'); { const me=G.players.me;
      const zen=Object.values(C).find(c=>c.type==='CHAR'&&/モンキー・Ｄ・ルフィ/.test(c.name||'')&&(c.traits||[]).includes('超新星'));
      if(zen){ me.deck=[mkc(zen.no)];
        await runFx(C['OP10-111'].fx.onPlay,{self:mkc('OP10-111'),side:'me'});
        ok(me.hand.length===0, '例3i: search excludeが全角Ｄルフィも除外（正規化）'); }
      else ok(true,'(全角Ｄ超新星ルフィなし=スキップ)'); }

    // 例3g: トリガーの空撃ち抑止 — 「全てcond包み・全check不成立」のトリガー（P-088ロー「超新星＋ライフ合計5以下なら登場」）は
    //       発動しても何も起こらずカードがトラッシュへ行くだけの純損（実対戦報告）。人間には発動UIを出さず・CPUも発動せず手札へ。
    // フルフロー: cond不成立（防御側リーダー非超新星）→ P-088はトラッシュでなく手札へ
    setupG('OP13-002'); { const cpu=G.players.cpu, me=G.players.me;
      G.active='me'; G.winner=null; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const law=mkc('P-088'); law.owner='cpu'; const fill=mkc('ST01-006'); fill.owner='cpu';
      cpu.life=[law,fill]; cpu.hand=[]; cpu.trash=[]; me.life=[mkc('ST01-006')];
      const atk=mkc('OP15-067'); atk.summonedTurn=1; atk.rested=false; atk.attachedDon=10; me.chars=[atk];
      await declareAttack(atk, cpu.leader);
      ok(cpu.hand.some(c=>c.no==='P-088') && !cpu.trash.some(c=>c.no==='P-088') && !cpu.chars.some(c=>c.no==='P-088'),
        '例3g: cond不成立トリガーは発動せず手札へ（トラッシュに行かない）'); }
    // フルフロー: cond成立（超新星リーダー＋ライフ合計5以下）→ 従来どおり発動しplaySelfで登場
    setupG('OP13-002'); { const cpu=G.players.cpu, me=G.players.me;
      G.active='me'; G.winner=null; G.busy=false; G.myActable=true; G.firstPlayer='me';
      cpu.leader=mkc('OP01-001'); cpu.leader.owner='cpu'; // ゾロL（超新星）
      const law=mkc('P-088'); law.owner='cpu'; const fill=mkc('ST01-006'); fill.owner='cpu';
      cpu.life=[law,fill]; cpu.hand=[]; cpu.trash=[]; me.life=[mkc('ST01-006')]; // shift後 合計2≤5
      const atk=mkc('OP15-067'); atk.summonedTurn=1; atk.rested=false; atk.attachedDon=10; me.chars=[atk];
      await declareAttack(atk, cpu.leader);
      ok(cpu.chars.some(c=>c.no==='P-088'), '例3g: cond成立なら従来どおり発動→playSelfで登場'); }
    // Q&A841境界: 「ライフ合計5枚以下」は自身を含めない（フローでshift後に判定）＝残り合計5で発動・6で空撃ち抑止
    setupG('OP13-002'); { const cpu=G.players.cpu;
      cpu.leader=mkc('OP01-001'); cpu.leader.owner='cpu';
      const law=mkc('P-088'); law.owner='cpu';
      cpu.life=[1,2,3].map(()=>{const x=mkc('ST01-006');x.owner='cpu';return x;});
      G.players.me.life=[1,2].map(()=>mkc('ST01-006')); // 合計5
      ok((await askTrigger('cpu',law))===true, '例3g: ライフ合計5(自身除く)なら発動できる(Q&A841)');
      G.players.me.life.push(mkc('ST01-006'));          // 合計6
      ok((await askTrigger('cpu',law))===false, '例3g: 合計6なら空撃ち抑止で手札側');
      // 例外: onTriggerリスナー(OP05-109)が場に居れば発動宣言自体に意味がある＝従来どおり発動
      const lis=mkc('OP05-109'); lis.owner='cpu'; cpu.chars=[lis];
      ok((await askTrigger('cpu',law))===true, '例3g: onTriggerリスナーが場に居れば従来どおり発動（例外）'); }
    // 人間: 空撃ちでも選択UIは表示（トラッシュを意図的に増やす発動＝トラッシュ枚数参照デッキの正当なプレイ）。
    //       警告文＋既定(primary)を「手札に加える」に反転して誤操作の純損を防ぐ。
    setupG('OP13-002'); { const lawMe=mkc('P-088');
      const _sp=showPrompt; let seen=null;
      // ★askTriggerのshowPromptは onPick コールバック解決型＝スタブは必ず cfg.onPick(v) を呼ぶ（呼ばないと永久未解決でハング）
      showPrompt=function(cfg){seen=cfg; const o=(cfg.opts||[]).find(x=>x.primary); const v=o&&o.v; if(cfg.onPick)cfg.onPick(v); return Promise.resolve(v);}; // 既定ボタンを押す
      const r=await askTrigger('me',lawMe);
      ok(seen!==null && r===false, '例3g: 人間には選択UIを表示・既定(primary)は手札に加える');
      ok(seen && /条件を満た/.test(seen.text||''), '例3g: 空撃ちには警告文を表示');
      showPrompt=function(cfg){const o=(cfg.opts||[]).find(x=>x.v===true); const v=o&&o.v; if(cfg.onPick)cfg.onPick(v); return Promise.resolve(v);};   // あえて発動を選ぶ
      const r2=await askTrigger('me',lawMe);
      showPrompt=_sp;
      ok(r2===true, '例3g: 空撃ちでも「発動する」を選べる（トラッシュ肥やしの意図的プレイを許可）'); }

    // 例3e: 「相手のデッキの上を見る」(peekOppDeck)は完了ボタンを押すまでカードを大写し（reveal付きshowPrompt）。人間のみ。OP11-062/070。
    setupG('OP11-062'); { const P=G.players.me; G.players.cpu.deck=[mkc('OP15-067')];
      let seen=null; const _sp=showPrompt; showPrompt=function(cfg){ seen=cfg; return Promise.resolve((cfg.opts&&cfg.opts[0]||{}).v); };
      await doOp({op:'peekOppDeck'},{side:'me',self:P.leader});
      showPrompt=_sp;
      ok(seen && seen.reveal && seen.reveal.no==='OP15-067', '例3e: peekOppDeckは相手デッキ上をreveal付きで提示(完了まで表示)'); }
    // CPUはreveal確認を出さない（自動進行）
    setupG('OP11-062'); { const P=G.players.me; P.isCPU=true; G.players.cpu.deck=[mkc('OP15-067')];
      let shown=false; const _sp=showPrompt; showPrompt=function(cfg){ shown=true; return Promise.resolve('ok'); };
      await doOp({op:'peekOppDeck'},{side:'me',self:P.leader});
      showPrompt=_sp;
      ok(!shown, '例3e: CPUはpeekOppDeckのreveal確認を出さない'); }

    // 例3b: OP15-060エネルの自己付与【ブロッカー】は効果無効中は失う（外部付与は残る）。
    //       10コスト黒ティーチOP09-093でnegateしても次ターンもブロックできたバグの回帰（自己付与がkwGrantで外部付与と誤認されていた）。
    setupG('OP15-058'); { const P2=G.players.me; const enel=mkc('OP15-060'); P2.chars=[enel]; P2.don.active=0; P2.don.rested=0;
      await doOp({op:'giveKeyword',target:'self',kw:'blocker',duration:'untilNextEnd'},{side:'me',self:enel});
      ok(enel.kwGrant.some(g=>g.kw==='blocker'&&g.self===true), '例3b: giveKeyword self は self:true で記録');
      ok(hasKw(enel,'blocker')===true, '例3b: 無効化前は自己付与ブロッカーが有効');
      ok(isLeaveImmune(enel)===true, '例3b: 無効化前は除去耐性(場を離れない)あり');
      enel.negSeq=G.turnSeq; // OP09-093ティーチで効果無効
      ok(hasKw(enel,'blocker')===false, '例3b: 効果無効中は自己付与ブロッカーを失う(=ブロック不可)');
      ok(isLeaveImmune(enel)===false, '例3b: 効果無効中は除去耐性も失う(OP15-118も同静的)');
      // 外部付与(他カードが与えたブロッカー)は無効化中も残る
      const ally=mkc('OP15-067'); ally.kwGrant.push({kw:'blocker',dur:'turn',self:false}); ally.negSeq=G.turnSeq;
      ok(hasKw(ally,'blocker')===true, '例3b: 外部付与ブロッカーは無効化中も残る');
    }

    // 例3c: OP09-093ティーチの効果無効＆アタック不可の失効タイミング。
    //       ★clearNegation は endTurn(ターン終了時・turnSeqはそのターンのまま)で呼ばれ、negSeq/noAtkSeqは 大なりイコール で失効する。
    //       「次の相手のターン終了時まで」(untilNextEnd=turnSeq+1)は相手の次ターンの"終了時"に、「このターン中」(=turnSeq)は付与ターンの"終了時"に失効。
    //       旧の大なりはendTurn呼び出しでは失効が1ターン遅れ、リーダー無効が相手ターンまで／アタック不可が次の自分ターンまで残るバグだった。
    setupG('OP15-058'); { const P3=G.players.me; const c=mkc('OP15-067'); P3.chars=[c];
      G.turnSeq=10; c.negSeq=G.turnSeq+1; c.noAtkSeq=G.turnSeq+1; // ティーチが付与(untilNextEnd)・付与ターン=10
      clearNegation(); // endTurn(ターン10=付与ターン): まだ継続
      ok(isNegated(c)===true && cantAttackNeg(c)===true, '例3c: 付与ターン終了時は効果無効＆アタック不可が継続');
      G.turnSeq=11; clearNegation(); // endTurn(ターン11=相手の次ターン): ここで失効
      ok(isNegated(c)===false && cantAttackNeg(c)===false, '例3c: 相手の次ターン終了時に失効');
      // 「このターン中」(=turnSeq)の無効化は付与ターンの終了時(endTurn)に失効
      const c2=mkc('OP15-061'); P3.chars.push(c2); G.turnSeq=20; c2.negSeq=G.turnSeq;
      clearNegation(); // endTurn(ターン20=付与ターン): このターン中は即失効
      ok(isNegated(c2)===false, '例3c: このターン中の無効化は付与ターンの終了時に失効');
    }

    // 例3c2(bug修正): 10ティーチOP09-093のリーダー効果無効(このターン中)は「自分のターン終了時」に失効する(endTurn経由の実挙動)。
    //       以前は相手のターンを通して残り、次の自分のターンまで反映されていた。
    setupG('OP09-081','OP16-080'); { const A=G.players.me, B=G.players.cpu; G.active='me'; G.turnSeq=30; B.chars=[];
      await doOp({op:'negateEffect'},{side:'me',self:A.leader}); // 相手キャラ0=リーダー無効(このターン中)のみ
      ok(isNegated(B.leader)===true, '例3c2: 適用直後は相手リーダー効果無効');
      G.winner='me'; // endTurn内のbeginTurn連鎖を止める(clearNegationはその前に走る)
      await endTurn('me');
      ok(isNegated(B.leader)===false, '例3c2: 自分のターン終了時に相手リーダーの無効が失効(このターン中)');
      G.winner=null;
    }

    // 例3c3(bug修正): 蘇生キャラは「新しいキャラ」＝以前のアタック不可/効果無効を引き継がない(トラッシュ→登場でリセット)。
    //       黒8ヤマト(OP16-096)がアタック不可のままトラッシュにあっても、6ヤマト(OP16-098)の変身で登場した時はリセットされる。
    setupG('OP16-079'); { const P=G.players.me; P.isCPU=true;
      const y8=mkc('OP16-096'); y8.owner='me'; y8.noAtkSeq=G.turnSeq+1; y8.negSeq=G.turnSeq+1; P.trash=[y8]; P.chars=[];
      await doOp({op:'reviveFromTrash',filter:{cost:8,color:'黒',nameIncludes:'ヤマト'}},{self:mkc('OP16-098'),side:'me'});
      const rev=P.chars.find(c=>c.no==='OP16-096');
      ok(!!rev && cantAttackNeg(rev)===false && isNegated(rev)===false, '例3c3: 蘇生した8コスト黒ヤマトはアタック不可/効果無効を引き継がない');
    }

    // 例3c4(bug修正): 「トラッシュに置く」(trashChar)は「相手の効果でKOされない」(OP09-086バージェス)を貫通する。KOではないので【KO時】は誘発しない。
    setupG('OP16-080'); { const O=G.players.cpu; O.leader=mkc('OP09-081'); // 黒ひげL(バージェスの+1000条件)
      const burg=mkc('OP09-086'); burg.owner='cpu'; O.chars=[burg];
      O.trash=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // trash4→+1000=6000
      ok(power(burg)===6000 && isKoImmune(burg)===true, '例3c4前提: バージェス6000・相手効果でKOされない');
      await doOp({op:'ko',side:'opp',filter:{maxEffPower:6000},count:1},{side:'me',self:G.players.me.leader});
      ok(O.chars.includes(burg), '例3c4: koではバージェスをKOできない(従来通り)');
      await doOp({op:'trashChar',side:'opp',filter:{maxEffPower:6000},count:1,optional:true},{side:'me',self:G.players.me.leader});
      ok(!O.chars.includes(burg) && O.trash.some(c=>c.uid===burg.uid), '例3c4: trashCharはKOされないを貫通してトラッシュに置く');
      // ベックマンOP09-009のfxがtrashChar化されている(ko取り違えの回帰)
      ok(C['OP09-009'].fx.onPlay[0].op==='trashChar', '例3c4: OP09-009ベックマンのonPlayはtrashChar(トラッシュに置く)');
    }

    // 例3d: mergeCardDBのキーワード派生=テキストの「他キャラへ付与(◯◯は【KW】を得る)/参照(【KW】を持つ)」は自身のキーワードにしない。
    //       OP16-048バギーが効果文の「囚人が【ブロッカー】を得る」を拾って自身ブロッカー化していたバグの回帰。
    ok(C['OP16-048'].blocker!==true, '例3d: OP16-048バギーは非ブロッカー(囚人へ付与するだけ)');
    ok(C['OP16-045'].blocker===true, '例3d: OP16-045クロコダイルは自身の【ブロッカー】を保持');
    ok(C['OP02-074'].blocker!==true, '例3d: OP02-074サルデスは非ブロッカー(ブルゴリへ付与)');
    ok(C['OP12-007'].rush!==true, '例3d: OP12-007シャンクスは非速攻(他キャラへ付与)');
    ok(C['OP01-008'].rush===false, '例3d: OP01-008キャベンディッシュはfxのgiveKeyword(ライフ1枚コスト)が速攻を担うため常時フラグは打ち消し');
    ok(C['ST30-012'].blocker!==true, '例3d: ST30-012ルフィは非ブロッカー(相手の【ブロッカー】を持つキャラ参照)');

    // 例3e: OP14-104ゲッコー・モリア(8黄)=公式「トラッシュから…1枚までを、ライフの上に表向きで加えるか登場させる」の二択。
    //       以前は登場(reviveFromTrash)のみでライフに加える選択肢が欠落していたバグの回帰。
    { const fx = C['OP14-104'].fx.onPlay[0];
      ok(fx.op==='chooseOption' && (fx.options||[]).length===2, '例3e: モリアのonPlayは2択(chooseOption)');
      ok(fx.options[0].fx[0].op==='reviveFromTrash', '例3e: 選択肢1=登場(reviveFromTrash)');
      ok(fx.options[1].fx[0].op==='trashToLife' && fx.options[1].fx[0].faceUp===true, '例3e: 選択肢2=ライフに表向きで加える(trashToLife faceUp)');
      // 登場ブランチ: トラッシュのコスト4以下スリラーバーク(ペローナ)が場に登場
      setupG('OP15-058'); let M=G.players.me; M.isCPU=true; M.trash=[mkc('OP01-077')];
      await runFx(fx.options[0].fx, {self:M.leader, side:'me'});
      ok(M.chars.some(c=>c.no==='OP01-077') && M.trash.length===0, '例3e: 登場ブランチ=ペローナが場に登場');
      // ライフブランチ: トラッシュのペローナがライフ上に表向きで加わる
      setupG('OP15-058'); M=G.players.me; M.isCPU=true; M.trash=[mkc('OP01-077')]; const lifeBefore=M.life.length;
      await runFx(fx.options[1].fx, {self:M.leader, side:'me'});
      ok(M.life.length===lifeBefore+1 && M.life[0].no==='OP01-077' && M.life[0]._faceUp===true && M.trash.length===0, '例3e: ライフブランチ=ペローナがライフ上に表向きで追加');
    }

    // 例3f: 青黄ナミ(OP11-041)リーダー=【自分のターン中】ライフが離れた時、手札7枚以下ならドロー。
    //       fireLifeLeftがリーダーを走査していなかった不具合の回帰。
    setupG('OP11-041'); { let N=G.players.me; N.deck=[mkc('OP01-078'),mkc('OP01-078')]; N.hand=[];
      const before=N.hand.length; await fireLifeLeft('me');
      ok(N.hand.length===before+1, '例3f: ナミL 手札≤7でライフ離脱→1ドロー');
      setupG('OP11-041'); N=G.players.me; N.deck=[mkc('OP01-078')]; N.hand=Array.from({length:8},()=>mkc('OP01-078'));
      const b2=N.hand.length; await fireLifeLeft('me');
      ok(N.hand.length===b2, '例3f: ナミL 手札8(>7)ではドローしない');
    }

    // 例3g: 青黄ハンコック(OP14-041)リーダー=九蛇/アマゾンリリーの元々5000以上がKO時、ドン×1なら相手ライフを持ち主手札へ。
    //       KO時能力が未実装だった不具合の回帰（KO以外/ドン無しでは不発）。
    setupG('OP14-041'); { const H=G.players.me, O=G.players.cpu; H.leader.attachedDon=1;
      const kuja=mkc('OP01-078'); H.chars=[kuja]; O.life=[mkc('OP01-078'),mkc('OP01-078')]; O.hand=[];
      const ol=O.life.length, oh=O.hand.length;
      await checkAllyLeave('me', kuja, 'battle', true);
      ok(O.life.length===ol-1 && O.hand.length===oh+1, '例3g: ハンコックL 九蛇5000 KO→相手ライフ-1・相手手札+1');
      setupG('OP14-041'); const O2=G.players.cpu; G.players.me.leader.attachedDon=1;
      const k2=mkc('OP01-078'); G.players.me.chars=[k2]; O2.life=[mkc('OP01-078')]; O2.hand=[];
      await checkAllyLeave('me', k2, 'oppEffect'); // isKo未指定=KOでない
      ok(O2.life.length===1, '例3g: ハンコックL KO以外(bounce)では不発');
      setupG('OP14-041'); const O3=G.players.cpu; G.players.me.leader.attachedDon=0;
      const k3=mkc('OP01-078'); G.players.me.chars=[k3]; O3.life=[mkc('OP01-078')]; O3.hand=[];
      await checkAllyLeave('me', k3, 'battle', true);
      ok(O3.life.length===1, '例3g: ハンコックL ドン×1無しでは不発');
    }

    // 例3h: 青黄ナミ(OP11-041)リーダー=【相手のアタック時】手札1枚捨て→リーダー+2000は「このターン中」(turnEnd)＝
    //        相手ターンの全バトルで持続。以前 duration:'battle' で1バトルだけ(clearBattleBuffsで消滅)だった回帰。
    ok(C['OP11-041'].fx.onOppAttack[0].then[0].then[0].duration==='turnEnd', '例3h: ナミL の+2000は turnEnd(このターン中)');
    setupG('OP11-041'); { const P=G.players.me;
      await doOp({op:'leaderBuff',amount:2000,duration:'turnEnd'},{side:'me',self:P.leader});
      ok(power(P.leader)===7000, '例3h: リーダー+2000で7000');
      clearBattleBuffs();
      ok(power(P.leader)===7000, '例3h: バトル終了(clearBattleBuffs)後も7000で持続');
      expireBuffs('me','turnEnd');
      ok(power(P.leader)===5000, '例3h: ターン終了(turnEnd失効)で5000へ戻る');
    }

    // 例3i: 【相手のアタック時】【ターン1回】の任意効果を"見送った"時は onceゲートを消費しない(_declined&&!_committed)。
    //        赤シャンクス(OP09-001 powerMod任意)/青黄ナミ(OP11-041 cond→discardCost)が最初のアタックでしか選べなかった回帰。
    //        ctx._declined=見送り / ctx._committed=使用。ハンドラは _declined&&!_committed の時だけ _oppAtkTurn を戻す。
    setupG('OP13-002'); { const P=G.players.me;
      // powerMod 任意・対象なし(相手キャラ0/includeLeaderなし)=見送り
      let ctx={side:'me',self:P.leader}; G.players.cpu.chars=[];
      await doOp({op:'powerMod',side:'opp',amount:-1000,count:1,optional:true},ctx);
      ok(ctx._declined===true && !ctx._committed, '例3i: powerMod任意で対象0=_declined(見送り)');
      // powerMod 任意・対象あり=使用
      ctx={side:'me',self:P.leader}; const foe=mkc('OP15-067'); foe.owner='cpu'; G.players.cpu.chars=[foe];
      await doOp({op:'powerMod',side:'opp',amount:-1000,count:1,optional:true},ctx);
      ok(ctx._committed===true, '例3i: powerMod任意で対象選択=_committed(使用)');
      // discardCost 手札0=見送り / cond不成立=見送り
      ctx={side:'me',self:P.leader}; P.hand=[];
      await doOp({op:'discardCost',count:1,then:[{op:'draw',n:0}]},ctx);
      ok(ctx._declined===true && !ctx._committed, '例3i: discardCost手札0=_declined');
      ctx={side:'me',self:P.leader};
      await doOp({op:'cond',check:'donX1',then:[{op:'draw',n:1}]},ctx); // リーダー付与ドン0→不成立
      ok(ctx._declined===true, '例3i: cond不成立=_declined');
      // discardCost 支払い(CPU)=使用
      ctx={side:'me',self:P.leader}; P.isCPU=true; P.hand=[mkc('OP15-067')];
      await doOp({op:'discardCost',count:1,then:[{op:'leaderBuff',amount:2000,duration:'turnEnd'}]},ctx);
      ok(ctx._committed===true, '例3i: discardCost支払い=_committed(使用)');
    }

    // 例3j: レッドロック=ゴムゴムの業火拳銃(OP04-056)の【トリガー】=コスト4以下のキャラ1枚までを持ち主のデッキ下へ。
    //        公式(cardrush照合)にトリガーがあるのに未実装だった回帰。fx.trigger(deckBottom maxCost4)を実装。
    ok(!!(C['OP04-056'].fx && C['OP04-056'].fx.trigger), '例3j: OP04-056にfx.triggerが存在する(トリガー認識)');
    setupG('OP13-002'); { const P=G.players.me; const O=G.players.cpu; P.isCPU=true; // meが発動(自動選択)
      const low=mkc('OP06-090'); low.owner='cpu'; // コスト4
      const high=mkc('OP14-101'); high.owner='cpu'; // コスト8
      O.chars=[low,high]; O.deck=[];
      await runFx(C['OP04-056'].fx.trigger, {self:mkc('OP04-056'), side:'me'});
      ok(!O.chars.includes(low) && O.deck.some(c=>c.no==='OP06-090'), '例3j: トリガーでコスト4の相手キャラがデッキ下へ');
      ok(O.chars.includes(high), '例3j: コスト8(>4)は対象外で場に残る');
    }

    // 例3k: スリラーバーク OP14-110ホグバック/OP14-111ペローナの【トリガー】=トラッシュからコスト4以下の
    //        《スリラーバーク海賊団》1枚までをレストで登場(公式cardrush照合)。DBから欠落＋未実装だった回帰。
    //        これによりホグバックの【KO時】(トリガー持ち蘇生)の対象(=fx.trigger持ち)も増える。
    for (const no of ['OP14-110','OP14-111']) ok(!!(C[no].fx && C[no].fx.trigger), '例3k: '+no+' にfx.triggerが存在');
    setupG('OP13-002'); { const P=G.players.me; P.isCPU=true;
      const buddy=mkc('OP14-089'); buddy.owner='me'; // コスト3 スリラーバーク(リューマ)
      P.trash=[buddy]; P.chars=[];
      await runFx(C['OP14-111'].fx.trigger, {self:mkc('OP14-111'), side:'me'});
      ok(P.chars.some(c=>c.no==='OP14-089') && P.trash.length===0, '例3k: トリガーでスリラーバークがトラッシュから登場');
      ok(P.chars.find(c=>c.no==='OP14-089').rested===true, '例3k: レストで登場する');
      // ホグバックKO時の蘇生対象=fx.trigger持ち。ペローナ(trigger実装済)がトラッシュにあれば認識される
      setupG('OP13-002'); const P2=G.players.me; P2.isCPU=true;
      const perona=mkc('OP14-111'); perona.owner='me'; P2.trash=[perona]; P2.chars=[];
      await runFx(C['OP14-110'].fx.onKO, {self:mkc('OP14-110'), side:'me'});
      ok(P2.chars.some(c=>c.no==='OP14-111'), '例3k: ホグバックKO時がトリガー持ち(ペローナ)を蘇生対象に認識');
    }

    // 例3l: OP14全公式再照合で追加したトリガー各型の検証。
    // (a) playSelf型「このカードを登場させる」(OP14-106サロメ)＝ライフ公開カード自身が場に出る
    setupG('OP13-002'); { const P=G.players.me; P.chars=[]; const self=mkc('OP14-106');
      await runFx(C['OP14-106'].fx.trigger, {self, side:'me'});
      ok(P.chars.includes(self), '例3l(a): OP14-106 トリガーで自身が登場(playSelf)');
    }
    // (b) 九蛇条件つきplaySelf(OP14-105ゴルゴン三姉妹)＝リーダーが九蛇なら登場・違えば不発
    setupG('OP14-041'); { const P=G.players.me; P.chars=[]; const self=mkc('OP14-105'); // OP14-041ハンコック=九蛇海賊団
      await runFx(C['OP14-105'].fx.trigger, {self, side:'me'});
      ok(P.chars.includes(self), '例3l(b): OP14-105 九蛇リーダーならトリガーで登場');
    }
    setupG('OP13-002'); { const P=G.players.me; P.chars=[]; const self=mkc('OP14-105'); // 非九蛇
      await runFx(C['OP14-105'].fx.trigger, {self, side:'me'});
      ok(!P.chars.includes(self), '例3l(b): OP14-105 非九蛇リーダーでは登場しない');
    }
    // (c) reviveFromTrash型(OP14-102クマシー)＝トラッシュからコスト4以下スリラーバークをレスト登場
    setupG('OP13-002'); { const P=G.players.me; P.isCPU=true; const buddy=mkc('OP14-089'); buddy.owner='me'; P.trash=[buddy]; P.chars=[];
      await runFx(C['OP14-102'].fx.trigger, {self:mkc('OP14-102'), side:'me'});
      ok(P.chars.some(c=>c.no==='OP14-089'), '例3l(c): OP14-102 トリガーでスリラーバークをトラッシュから登場');
    }
    // (d) playCharFromHand needsTrigger(OP14-112ハンコック)＝手札からパワー6000以下の【トリガー】持ちを登場
    setupG('OP13-002'); { const P=G.players.me; P.isCPU=true; const trigHolder=mkc('OP14-089'); trigHolder.owner='me'; // OP14-089=fx.trigger持ち
      P.hand=[trigHolder]; P.chars=[];
      ok((C['OP14-089'].power||0)<=6000, '例3l(d前提): OP14-089はパワー6000以下');
      await runFx(C['OP14-112'].fx.trigger, {self:mkc('OP14-112'), side:'me'});
      ok(P.chars.some(c=>c.no==='OP14-089'), '例3l(d): OP14-112 トリガーで手札のトリガー持ちを登場');
    }

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

    // 例6(H3): deckBottom はキャラの付与ドンを所有者のコストエリアへ「レスト」で戻す（公式ルール。ドン総数保存）
    setupG('OP15-058'); P=G.players.me; const victim=mkc('OP15-067'); victim.attachedDon=2; P.chars=[victim]; P.don.active=0; P.don.rested=0;
    const beforeTotal=donTotal('me');
    await doOp({op:'deckBottom',maxCost:10},{side:'cpu',self:G.players.cpu.leader});
    ok(!P.chars.includes(victim) && P.don.rested===2 && P.don.active===0 && donTotal('me')===beforeTotal, 'H3: deckBottomで付与ドンがレストでコストエリアへ戻る');

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
    // ※旧「ナミ OP11-041 onAllyEnter(登場時ドロー＆デッキ下)」テストは削除。
    //   公式効果は「ライフ離脱時→手札7枚以下でドロー」「相手アタック時→手札1枚捨て+2000」で登場時能力は無い（誤実装だった）。検証は例3fに移設。

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

    // 例15: ★E53 緑ミホークL(OP14-020)まわり — 実対戦観察(2026-07-13)由来のCPU挙動
    // 15a: restOwnAsCost は「レストにできない」(restImmune)のカードをコストに使えない（82f2a41修正の回帰ガード）
    setupG('OP14-020'); { const P=G.players.me; P.isCPU=true;
      const m6=mkc('ST32-003'); m6.restImmuneUntil=G.turnSeq+1; P.chars=[m6]; P.leader.rested=true;
      await doOp({op:'restOwnAsCost',count:1,then:[]},{side:'me',self:P.leader});
      ok(m6.rested===false, '例15a: レスト不可のカードはrestOwnAsCostの対象外（コスト払えず不発）');
    }
    // 15b: cpuRestCostPick（heur2部品 restpick）はリーダーでなくレスト誘発持ち→動けないキャラを優先
    setupG('OP14-020'); { const P=G.players.me; P.isCPU=true; P.agent='heur2'; G._h2Parts={restpick:1};
      const m6=mkc('ST32-003'); const zoro=mkc('ST32-005'); P.chars=[zoro,m6];
      const pick=cpuRestCostPick('me',[P.leader,...P.chars]);
      ok(pick===m6, '例15b: レスト誘発持ち(ST32-003)を優先（リーダーは寝かせない）');
      const pick2=cpuRestCostPick('me',[P.leader,zoro]);
      ok(pick2!==P.leader, '例15b: 誘発持ち不在でもリーダーは選ばない');
    }
    // 15c: actWorthUsing（E53 'actgate'・既定採用）— コスト5以上のキャラ不在ならミホークL起動を使わない
    setupG('OP14-020'); { const P=G.players.me; P.isCPU=true;
      P.chars=[mkc('ST32-005')]; P.don.rested=3;
      ok(actWorthUsing('me',P.leader)===false, '例15c: コスト5以上なし→起動しない（払い損防止・既定CPUで有効）');
      P.chars.push(mkc('ST32-003')); // コスト6
      ok(actWorthUsing('me',P.leader)===true, '例15c: コスト5以上あり→起動する');
    }
    // 15d: donRampActReady（heur2部品 luffyact）— 青緑ルフィL(OP16-022)の無償ドン起動が追加プレイを可能にする時だけ真
    setupG('OP16-022'); { const P=G.players.me; P.isCPU=true; P.agent='heur2'; G._h2Parts={luffyact:1};
      P.chars=[mkc('OP16-042')]; P.don.active=0; P.don.rested=2;
      const pris=mkc('OP16-042'); pris.owner='me'; P.hand=[pris]; // 囚人c6: 0+2でも届かない→false
      ok(donRampActReady('me')===false, '例15d: 起動しても払えないなら使わない');
      P.don.active=4; // 4+2=6で囚人が出せる→true
      ok(donRampActReady('me')===true, '例15d: 起動で新たに払える→使う');
      P.chars=[mkc('ST32-005')]; // インペルダウン以外が場に→リーダーcond不成立→false
      ok(donRampActReady('me')===false, '例15d: リーダー条件(全キャラ《インペルダウン》)不成立なら使わない');
    }
    // 15e: ミホークL起動の実効果 — カード1枚レスト→コスト5以上がいればドン3アクティブ+このターン登場不可
    setupG('OP14-020'); { const P=G.players.me; P.isCPU=true; P.agent='heur2'; G._h2Parts={restpick:1};
      const m6=mkc('ST32-003'); P.chars=[m6]; P.don.active=1; P.don.rested=3; P.deck=[mkc('ST32-005'),mkc('ST32-005')]; P.hand=[mkc('OP12-034')];
      await runFx(C['OP14-020'].fx.act.fx,{side:'me',self:P.leader});
      ok(m6.rested===true, '例15e: コストでST32-003がレスト');
      ok(P.don.active===4 && P.don.rested===0, '例15e: ドン3枚アクティブ化');
      ok(P._noSummonTurn===G.turnSeq, '例15e: このターン登場不可(setSummonBan)');
    }
    // 例16: ★「ライフを表/裏向きにする」コストは逆向きのライフにしか払えない（実対戦指摘 2026-07-16）
    // 16a: 黄キッドL(OP10-099) flipLifeCost — ライフ上が裏向きなら発動でき、既に表向きなら発動できない
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true;
      const kid=mkc('OP12-118'); kid.rested=true; P.chars=[kid]; // コスト5《超新星》ボニー(3〜8の範囲)
      P.life=[mkc('OP15-067'),mkc('OP15-067')];
      await runFx(C['OP10-099'].fx.onTurnEnd,{side:'me',self:P.leader});
      ok(P.life[0]._faceUp===true && kid.rested===false && kid.kwGrant.some(g=>g.kw==='blocker'), '例16a: 裏向きなら発動（表向き化+アクティブ+ブロッカー付与）');
      kid.rested=true; kid.kwGrant=[];
      await runFx(C['OP10-099'].fx.onTurnEnd,{side:'me',self:P.leader}); // ライフ上は既に表向き
      ok(kid.rested===true && kid.kwGrant.length===0, '例16a: 既に表向きなら発動できない（コスト不成立）');
    }
    // 16b: lifeCost pos未指定 — ワイパー(OP15-114)「上から1枚を表向きにできる」は表向き済みだと不発
    setupG('OP15-058'); { const P=G.players.me; P.isCPU=true; const O=G.players.cpu;
      const w=mkc('OP15-114'); P.chars=[w];
      const tgt=mkc('OP01-077'); tgt.owner='cpu'; O.chars=[tgt]; // 2000
      P.life=[mkc('OP15-067')]; P.life[0]._faceUp=true;
      await runFx(C['OP15-114'].fx.onPlay,{side:'me',self:w});
      ok(O.chars.includes(tgt) && power(tgt)===2000, '例16b: 表向き済み→コスト払えず-2000もKOも起きない');
      P.life[0]._faceUp=false;
      await runFx(C['OP15-114'].fx.onPlay,{side:'me',self:w});
      ok(P.life[0]._faceUp===true && !O.chars.includes(tgt), '例16b: 裏向きなら発動（-2000→パワー0以下KO）');
    }
    // 16c: lifeCost faceDown pos未指定 — ウルージ(OP15-099)「上から1枚を裏向きにできる」は裏向き済みだと不発
    setupG('OP15-058'); { const P=G.players.me; P.isCPU=true;
      const u=mkc('OP15-099'); P.chars=[u]; P.don.rested=1;
      P.life=[mkc('OP15-067')]; // 裏向き
      await runFx(C['OP15-099'].fx.act.fx,{side:'me',self:u});
      ok(P.leader.attachedDon===0 && u.attachedDon===0, '例16c: 裏向き済み→コスト払えずドン付与なし');
      P.life[0]._faceUp=true;
      await runFx(C['OP15-099'].fx.act.fx,{side:'me',self:u});
      ok(P.life[0]._faceUp===false, '例16c: 表向きなら裏向きにして発動');
    }
    // 16d: ST36-005キッド「上か下から1枚を表向きにできる」(pos:'choose') — 上が表向きでも下が裏向きなら払える
    setupG('OP15-058'); { const P=G.players.me; P.isCPU=true;
      const k=mkc('ST36-005'); P.chars=[k];
      P.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
      P.life[0]._faceUp=true; // 上=表・下=裏 → 下を表向きにして発動できる
      await runFx(C['ST36-005'].fx.act.fx,{side:'me',self:k});
      ok(P.life[2]._faceUp===true, '例16d: 上か下型は裏向きが残る側（下）で払える');
      P.life.forEach(l=>l._faceUp=true); k._actTurn=null;
      const before=JSON.stringify(P.life.map(l=>!!l._faceUp));
      await runFx(C['ST36-005'].fx.act.fx,{side:'me',self:k});
      ok(JSON.stringify(P.life.map(l=>!!l._faceUp))===before, '例16d: 上下とも表向きなら払えない（不発）');
    }
    // 例17: ★実対戦指摘（2026-07-18）3件の回帰
    // 17a: OP14-033ペローナKO時 — 「コスト5以下の緑」限定（filter+トップレベルmaxCost併記でコスト無制限になり10cロー＆ベポが出せた系統バグ）
    setupG('OP14-020'); { const P=G.players.me; P.isCPU=true;
      const per=mkc('OP14-033'); P.chars=[mkc('ST32-002')]; // レストコスト用に1体
      const lawbepo=mkc('ST24-004'); const zoro=mkc('ST32-005'); P.hand=[lawbepo,zoro]; // 10c緑 / 1c緑
      await runFx(C['OP14-033'].fx.onKO,{side:'me',self:per});
      ok(!P.chars.some(c=>c.no==='ST24-004'), '例17a: 10cロー＆ベポは出せない（コスト5以下限定）');
      ok(P.chars.some(c=>c.no==='ST32-005'), '例17a: 1cゾロ（5c以下の緑）は出せる');
    }
    // 17b: OP01-086超過鞭糸 — 「アクティブのコスト3以下」限定（同型: filter{activeOnly}+maxCost:3併記）
    setupG('OP15-058'); { const P=G.players.me; P.isCPU=true; const O=G.players.cpu;
      const c5=mkc('ST32-002'); c5.owner='cpu'; O.chars=[c5]; // コスト5おでん・アクティブ
      await runFx(C['OP01-086'].fx.counter.fx.slice(1),{side:'me',self:mkc('OP01-086')}); // bounce部分のみ
      ok(O.chars.includes(c5), '例17b: コスト5はバウンスされない（3以下限定）');
      const c1=mkc('EB01-015'); c1.owner='cpu'; O.chars=[c1]; // コスト1アプー・アクティブ
      await runFx(C['OP01-086'].fx.counter.fx.slice(1),{side:'me',self:mkc('OP01-086')});
      ok(!O.chars.includes(c1), '例17b: コスト1アクティブはバウンスされる');
    }
    // 17c: OP10-099黄キッドL — 既にアクティブの超新星にもブロッカーを付与できる（公式Q&A 830）
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true;
      const boni=mkc('OP12-118'); boni.rested=false; P.chars=[boni]; // アクティブのコスト5超新星
      P.life=[mkc('OP15-067')];
      await runFx(C['OP10-099'].fx.onTurnEnd,{side:'me',self:P.leader});
      ok(boni.kwGrant.some(g=>g.kw==='blocker'), '例17c: アクティブのキャラにもブロッカー付与（Q&A830）');
      ok(boni.rested===false, '例17c: アクティブのまま（アクティブ化は空振り）');
    }
    // 17d: OP12-040クザンL — 「自分の特徴《海軍》を持つカードの効果で」捨てられた時のみ捨てた枚数分ドロー
    setupG('OP12-040'); { const P=G.players.me; P.isCPU=true; const O=G.players.cpu;
      const koby=mkc('ST33-001'); P.chars=[koby]; // 海軍
      P.hand=[mkc('ST33-004')]; P.deck=[mkc('ST33-002'),mkc('ST33-002'),mkc('ST33-002')];
      await doOp({op:'discardOwn',n:1},{side:'me',self:koby});
      ok(P.hand.length===1 && P.deck.length===2, '例17d: 海軍カードの効果の捨て→1ドロー');
      // 非海軍（ST32-005ゾロ=超新星/麦わら）の効果による捨て→ドローしない
      const zoro=mkc('ST32-005'); P.chars=[zoro]; P.hand=[mkc('ST33-004')];
      const d0=P.deck.length;
      await doOp({op:'discardOwn',n:1},{side:'me',self:zoro});
      ok(P.hand.length===0 && P.deck.length===d0, '例17d: 非海軍カードの効果の捨て→ドローしない');
      // 相手のカードの効果（oppDiscard）で捨てられた→ドローしない
      P.hand=[mkc('ST33-004')]; const d1=P.deck.length;
      const oppSaka=mkc('ST33-002'); oppSaka.owner='cpu'; O.chars=[oppSaka];
      G.active='cpu';
      await doOp({op:'oppDiscard',n:1},{side:'cpu',self:oppSaka});
      ok(P.hand.length===0 && P.deck.length===d1, '例17d: 相手の効果の捨て→ドローしない（自分の海軍カード限定）');
      G.active='me';
    }
    // 例18: ★実対戦指摘（2026-07-18）ST36-005/OP10-099 の対象選択まわり
    // 18a: ST36-005の対象変更は「キャラ」限定でない→リーダー黄キッド(元々5000の「ユースタス・キッド」)も変更先に選べる(incLeader)
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true; G._counterRedirect=null;
      await doOp({op:'counterRedirect',incLeader:true,filter:{name:'ユースタス・キッド',minPower:5000},optional:false},{side:'me',self:P.leader});
      ok(G._counterRedirect===P.leader, '例18a: キッドキャラ不在でもリーダー黄キッドを変更先に選べる');
      G._counterRedirect=null;
      const k=mkc('ST36-005'); P.chars=[k];
      await doOp({op:'counterRedirect',incLeader:true,filter:{name:'ユースタス・キッド',minPower:5000},optional:false},{side:'me',self:P.leader});
      ok(G._counterRedirect===k, '例18a: リーダー(5000)とキャラ(7000)が両方候補→CPUはパワー最大を選ぶ');
      G._counterRedirect=null;
    }
    // 18b: 名前不一致リーダーはincLeaderでも対象外＋condのselfChar incLeader対応
    setupG('OP15-058'); { const P=G.players.me; P.isCPU=true; G._counterRedirect=null;
      await doOp({op:'counterRedirect',incLeader:true,filter:{name:'ユースタス・キッド',minPower:5000},optional:false},{side:'me',self:P.leader});
      ok(G._counterRedirect==null, '例18b: 「ユースタス・キッド」でないリーダーは変更先にならない');
      ok(checkCond({selfChar:{name:'ユースタス・キッド',minPower:5000,incLeader:true}},'me')===false, '例18b: cond selfChar+incLeaderもキッド不在なら不成立');
    }
    setupG('OP10-099'); {
      ok(checkCond({selfChar:{name:'ユースタス・キッド',minPower:5000,incLeader:true}},'me')===true, '例18b: 黄キッドLならキャラ0でもcond成立');
      ok(checkCond({selfChar:{name:'ユースタス・キッド',minPower:5000}},'me')===false, '例18b: incLeaderなし(従来)はキャラのみを数える');
    }
    // 18c: フルフロー — 相手7000がリーダーへアタック→ST36-005の【相手のアタック時】でブロック前に対象がST36-005へ切り替わる
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true; const O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const k=mkc('ST36-005'); k.summonedTurn=1; P.chars=[k];
      P.life=[mkc('OP15-067')]; P.life[0]._faceUp=true; P.deck=[mkc('OP15-067')];
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const atk=mkc('ST32-003'); atk.owner='cpu'; atk.summonedTurn=1; O.chars=[atk]; // 7000
      await declareAttack(atk, P.leader);
      ok(P.life.length===1 && !G.winner, '例18c: 対象変更によりリーダーは殴られずライフ無傷');
      ok(P.life[0]._faceUp===false, '例18c: コスト（ライフ1枚を裏向き）を支払った');
      ok(!P.chars.includes(k) && P.trash.includes(k), '例18c: バトルは変更後の対象(7000キッド)と解決＝相打ちKO');
      G.active='me';
    }
    // 18c2: 効果が使えない（上下とも裏向き＝コスト不払）ならリーダーがそのまま殴られる（判別の逆側）
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true; const O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const k=mkc('ST36-005'); k.summonedTurn=1; P.chars=[k];
      P.life=[mkc('OP15-067')]; P.deck=[mkc('OP15-067')]; // 裏向き→faceDownコスト払えず発動不可
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const atk=mkc('ST32-003'); atk.owner='cpu'; atk.summonedTurn=1; O.chars=[atk];
      await declareAttack(atk, P.leader);
      ok(P.life.length===0 && P.chars.includes(k), '例18c2: 効果不発ならリーダーが被弾（ライフ1→0）・キッドは無傷');
      ok(k._oppAtkTurn!==G.turnSeq, '例18c2: 条件不成立なら【ターン1回】を消費しない');
      G.active='me'; G.winner=null;
    }
    // 18d: OP10-099黄キッドL — 付与先の選択は「1枚まで」＝任意（候補1枚でも自動確定せず選択モーダルが出る）
    ok(C['OP10-099'].fx.onTurnEnd[0].then[0].optional===true, '例18d: 黄キッドLのactivateOwnCharはoptional:true');
    // 例19: ★ST36-005「発動しない時がある」調査（2026-07-18）— 発動可否は公式Q&A1412準拠（上か下が表向きの時だけ）
    setupG('OP10-099'); { const P=G.players.me;
      P.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
      ok(checkCond({lifeEndsFaceUp:true},'me')===false, '例19: 上下とも裏向き→発動不可（Q&A1412）');
      P.life[1]._faceUp=true;
      ok(checkCond({lifeEndsFaceUp:true},'me')===false, '例19: 真ん中だけ表向き→発動不可（上か下のみ対象）');
      P.life[0]._faceUp=true;
      ok(checkCond({lifeEndsFaceUp:true},'me')===true, '例19: 上が表向き→発動可');
      P.life[0]._faceUp=false; P.life[2]._faceUp=true;
      ok(checkCond({lifeEndsFaceUp:true},'me')===true, '例19: 下が表向き→発動可');
      P.life=[];
      ok(checkCond({lifeEndsFaceUp:true},'me')===false, '例19: ライフ0→発動不可');
      ok(C['ST36-005'].fx.onOppAttack[0].check.lifeEndsFaceUp===true, '例19: ST36-005のcondは上か下の表向き判定（カットインも発動機会がある時だけ出る）');
    }
    // 例20: ★【ダブルアタック】vs ライフ1枚 — ライフを1枚削るだけで勝利にはならない（公式Q&A36/400。実対戦指摘 2026-07-18）
    const dblSetup=(lifeN)=>{ setupG('OP10-099'); const P=G.players.me,O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me'; P.isCPU=true;
      P.life=[]; for(let i=0;i<lifeN;i++) P.life.push(mkc('OP15-067'));
      P.deck=[mkc('OP15-067')]; O.life=[mkc('OP15-067'),mkc('OP15-067')]; O.deck=[mkc('OP15-067'),mkc('OP15-067')];
      const y=mkc('OP01-121'); y.owner='cpu'; y.summonedTurn=1; O.chars=[y]; return y; };
    { const y=dblSetup(1); await declareAttack(y, G.players.me.leader);
      ok(G.players.me.life.length===0 && !G.winner, '例20a: ライフ1にダブルアタック→1枚減るだけで敗北しない（Q&A36）');
      G.active='me'; }
    { const y=dblSetup(0); await declareAttack(y, G.players.me.leader);
      ok(G.winner==='cpu', '例20b: ライフ0への新たなアタックは従来どおり敗北');
      G.active='me'; G.winner=null; }
    { const y=dblSetup(2); await declareAttack(y, G.players.me.leader);
      ok(G.players.me.life.length===0 && !G.winner, '例20c: ライフ2ならダブルアタックで2枚削れる（勝敗なし）');
      G.active='me'; }
    // ── 例21〜30: カード効果修正群（2026-07-19）のフルフロー回帰 ──
    // 人間プロンプトの台本応答: vals を先頭から順に返す（'pick0'=最初のpick:候補）。尽きたら既定の自動応答。
    const _autoPrompt=showPrompt; let promptCalls=0;
    const scriptPrompt=(vals)=>{ promptCalls=0; showPrompt=function(cfg){ promptCalls++; const o=(cfg.opts||[]).filter(x=>!x.disabled); let v=vals.length?vals.shift():null; if(v==='pick0'){ const p=o.find(x=>String(x.v).indexOf('pick:')===0); v=p?p.v:(o[0]&&o[0].v); } else if(v==null){ const p=o.find(x=>String(x.v).indexOf('pick:')===0)||o[0]; v=p&&p.v; } if(cfg.onPick)cfg.onPick(v); return Promise.resolve(v); }; };
    const resetPrompt=()=>{ showPrompt=_autoPrompt; };
    // 例21: ★「ドン‼-N：効果」型の then 実行（OP11-063サディちゃん）— 支払い成功時のみ後続が走る（19枚系統バグの本丸）
    setupG('OP16-022'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; // OP16-022=《インペルダウン》リーダー
      const sadi=mkc('OP11-063'); P.chars=[sadi]; P.don.active=1; P.don.rested=0;
      const low=mkc('OP15-067'); low.owner='cpu'; const big=mkc('ST32-002'); big.owner='cpu'; O.chars=[low,big]; // コスト1／コスト5
      const c21={self:sadi,side:'me'};
      await runFx(C['OP11-063'].fx.onPlay, c21);
      ok(donTotal('me')===0 && c21._committed===true, '例21: ドン-1を支払い発動');
      ok(low.rested===true, '例21: 支払い後にthenが実行され相手コスト3以下がレスト');
      ok(big.rested===false, '例21: コスト5(>3)は対象外');
      // ドン0=支払えない→then不実行（不発）
      setupG('OP16-022'); const P21=G.players.me, O21=G.players.cpu; P21.isCPU=true;
      const sadi2=mkc('OP11-063'); P21.chars=[sadi2]; P21.don.active=0; P21.don.rested=0;
      const low2=mkc('OP15-067'); low2.owner='cpu'; O21.chars=[low2];
      const c21b={self:sadi2,side:'me'};
      await runFx(C['OP11-063'].fx.onPlay, c21b);
      ok(low2.rested===false && c21b._declined===true && !c21b._committed, '例21: ドン不足はthen不実行（不発・未使用マーカー）');
    }
    // 例22: OP12-069クロコダイル【相手のアタック時】【ターン1回】ドン-1→+2000 — 同一ターン2回目のアタックでは発動しない（フルフロー）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; // OP01-062=『B・W』リーダー（onDonReturned等の干渉なし）
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me'; P.isCPU=true;
      const croc=mkc('OP12-069'); croc.summonedTurn=1; P.chars=[croc];
      P.don.active=3; P.don.rested=0; P.life=[mkc('OP15-067'),mkc('OP15-067')]; P.deck=[mkc('OP15-067')];
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const a1=mkc('ST32-005'); a1.owner='cpu'; a1.summonedTurn=1;
      const a2=mkc('ST32-005'); a2.owner='cpu'; a2.summonedTurn=1; O.chars=[a1,a2];
      await declareAttack(a1, P.leader);
      ok(donTotal('me')===2 && croc._oppAtkTurn===G.turnSeq, '例22: 1回目のアタックでドン-1を支払い発動（ターン1回を消費）');
      G.busy=false; G.myActable=true;
      await declareAttack(a2, P.leader);
      ok(donTotal('me')===2, '例22: 同一ターン2回目のアタックでは発動しない（ドン不変）');
      G.active='me';
    }
    // 例23: ★W2 onceゲート3種
    // 23a: OP03-076ロブ・ルッチL【起動メイン】【ターン1回】— 同一ターンに2回使えない（_actTurn/actUsable）
    setupG('OP03-076'); { const P=G.players.me; P.isCPU=true;
      P.leader.rested=true; P.hand=[mkc('OP15-067'),mkc('OP15-067')];
      await leaderActivate('me');
      ok(P.leader.rested===false && P.hand.length===0, '例23a: 手札2捨てでリーダーがアクティブ');
      ok(P.leader._actTurn===G.turnSeq && actUsable(P.leader)===false, '例23a: 【ターン1回】を消費（actUsable=false）');
      P.leader.rested=true; P.hand=[mkc('OP15-067'),mkc('OP15-067')];
      await leaderActivate('me');
      ok(P.leader.rested===true && P.hand.length===2, '例23a: 同一ターン2回目は使えない（手札もレストも不変）');
    }
    // 23b: OP11-025イシリー【相手のアタック時】【ターン1回】ドン1レスト+自身レスト→+1000 — 同一ターン1回のみ（フルフロー）
    setupG('OP10-099'); { const P=G.players.me, O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me'; P.isCPU=true;
      const ish=mkc('OP11-025'); ish.summonedTurn=1; P.chars=[ish];
      P.don.active=2; P.don.rested=0; P.life=[mkc('OP15-067'),mkc('OP15-067')]; P.deck=[mkc('OP15-067')];
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const b1=mkc('ST32-005'); b1.owner='cpu'; b1.summonedTurn=1;
      const b2=mkc('ST32-005'); b2.owner='cpu'; b2.summonedTurn=1; O.chars=[b1,b2];
      await declareAttack(b1, P.leader);
      ok(P.don.active===1 && P.don.rested===1 && ish._oppAtkTurn===G.turnSeq, '例23b: 1回目=ドン1をレストして発動（ターン1回を消費）');
      G.busy=false; G.myActable=true;
      await declareAttack(b2, P.leader);
      ok(P.don.active===1 && P.don.rested===1, '例23b: 同一ターン2回目は発動しない（ドン不変）');
      G.active='me';
    }
    // 23c: OP13-100ボニーL onAllyEnter【ターン1回】— トリガー持ち2枚目の登場では再発動しない
    setupG('OP13-100'); { const P=G.players.me; P.isCPU=true;
      P.don.active=0; P.don.rested=4;
      const attSum=()=>(P.leader.attachedDon||0)+P.chars.reduce((s,c)=>s+(c.attachedDon||0),0);
      await summon('me', mkc('OP14-089'), true); // 【トリガー】持ちキャラ
      ok(attSum()===2 && P.don.rested===2 && P.leader._allyEnterTurn===G.turnSeq, '例23c: 1枚目の登場でレストのドン2付与');
      await summon('me', mkc('OP14-089'), true);
      ok(attSum()===2 && P.don.rested===2, '例23c: 同一ターン2枚目のトリガー持ち登場では再発動しない');
    }
    // 例24: ST20-002クラッカー leaveProtect — 相手の効果KO時にライフ上1枚トラッシュで身代わり（pay:'selfLifeTrash'修正の回帰）
    setupG('OP10-099'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true;
      const cr=mkc('ST20-002'); P.chars=[cr]; P.life=[mkc('OP15-067')];
      await doOp({op:'ko',side:'opp',count:1},{side:'cpu',self:O.leader});
      ok(P.chars.includes(cr), '例24: 効果KOをライフ1枚トラッシュで身代わり（キャラ生存）');
      ok(P.life.length===0 && P.trash.length===1 && !P.trash.includes(cr), '例24: コスト=ライフ-1（キャラはトラッシュに行かない）');
      // ライフ0なら保護不可
      setupG('OP10-099'); const P24=G.players.me, O24=G.players.cpu; P24.isCPU=true;
      const cr2=mkc('ST20-002'); P24.chars=[cr2]; P24.life=[];
      await doOp({op:'ko',side:'opp',count:1},{side:'cpu',self:O24.leader});
      ok(!P24.chars.includes(cr2) && P24.trash.includes(cr2), '例24: ライフ0なら保護できずKO');
    }
    // 例25: OP09-061ルフィL — ドン2枚以上の返却でのみアクティブ1+レスト1を補充（Q752）。不成立はonce未消費（Q753型）
    setupG('OP09-061'); { const P=G.players.me; P.isCPU=true; P.don.active=2; P.don.rested=0;
      await doOp({op:'donMinus',n:2},{side:'me',self:P.leader});
      ok(P.don.active===1 && P.don.rested===1 && donTotal('me')===2, '例25: 2枚返却→ドン2枚（アクティブ1+レスト1）補充');
      setupG('OP09-061'); const P25=G.players.me; P25.isCPU=true; P25.don.active=2; P25.don.rested=0;
      await doOp({op:'donMinus',n:1},{side:'me',self:P25.leader});
      ok(P25.don.active===1 && P25.don.rested===0, '例25: 1枚返却では補充されない');
      // 同ターン「1枚返却→2枚返却」: 1回目の不成立は【ターン1回】未消費なので2枚返却時に発動
      setupG('OP09-061'); const P25b=G.players.me; P25b.isCPU=true; P25b.don.active=3; P25b.don.rested=0;
      await doOp({op:'donMinus',n:1},{side:'me',self:P25b.leader});
      ok(P25b.don.active===2 && P25b.don.rested===0, '例25: 先の1枚返却は不発');
      await doOp({op:'donMinus',n:2},{side:'me',self:P25b.leader});
      ok(P25b.don.active===1 && P25b.don.rested===1, '例25: 同ターンでも2枚返却時に発動（once復元・Q753型）');
    }
    // 例26: ST36-002キラー lifeAddFromDeck の optionalゲート — 人間は確認で辞退でき、CPUはプロンプトなしで追加
    setupG('OP10-099'); { const P=G.players.me; // me=人間・《キッド海賊団》リーダー
      const kil=mkc('ST36-002'); P.chars=[kil]; P.deck=[mkc('OP15-067'),mkc('OP15-067')]; P.life=[];
      scriptPrompt(['n']);
      const c26={self:kil,side:'me'};
      await runFx(C['ST36-002'].fx.onPlay, c26);
      ok(P.life.length===0 && P.deck.length===2 && c26._declined===true, '例26: 「加えない」→ライフ不変（辞退）');
      scriptPrompt(['y']);
      await runFx(C['ST36-002'].fx.onPlay, {self:kil,side:'me'});
      ok(P.life.length===1 && P.deck.length===1, '例26: 「加える」→デッキ上1枚がライフへ（+1）');
      resetPrompt();
      setupG('OP10-099'); const P26=G.players.me; P26.isCPU=true;
      const kil2=mkc('ST36-002'); P26.chars=[kil2]; P26.deck=[mkc('OP15-067')]; P26.life=[];
      scriptPrompt([]); // promptCalls計測用（応答は既定の自動）
      await runFx(C['ST36-002'].fx.onPlay, {self:kil2,side:'me'});
      ok(P26.life.length===1 && promptCalls===0, '例26: CPUはプロンプトなしでライフ+1');
      resetPrompt();
    }
    // 例27: OP10-109ホーキンス【KO時】lifeTrash(opp,optional) — 人間は辞退でき、承諾で相手ライフ-1
    setupG('OP10-099'); { const O=G.players.cpu; // me=人間（効果コントローラー）
      O.life=[mkc('OP15-067'),mkc('OP15-067')]; O.trash=[];
      scriptPrompt(['n']);
      await runFx(C['OP10-109'].fx.onKO, {self:mkc('OP10-109'),side:'me'});
      ok(O.life.length===2 && O.trash.length===0, '例27: 辞退→相手ライフ不変');
      scriptPrompt(['y']);
      await runFx(C['OP10-109'].fx.onKO, {self:mkc('OP10-109'),side:'me'});
      ok(O.life.length===1 && O.trash.length===1, '例27: 承諾→相手ライフ-1');
      resetPrompt();
    }
    // 例28: OP04-069ベンサム — ドン-1→powerCopy fromAttacker: 元々のパワーがアタッカー（相手リーダー）と同値に（フルフロー）
    setupG('OP10-099'); { const P=G.players.me, O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me'; P.isCPU=true;
      const bon=mkc('OP04-069'); bon.summonedTurn=1; P.chars=[bon]; // 元々4000
      P.don.active=1; P.don.rested=0; P.life=[mkc('OP15-067'),mkc('OP15-067')]; P.deck=[mkc('OP15-067')];
      O.leader.owner='cpu'; // setupGのmkcはowner:'me'のまま＝リーダーをアタッカーにする時は明示必須
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      await declareAttack(O.leader, P.leader); // 相手リーダー(5000)のアタック
      ok(donTotal('me')===0, '例28: ドン-1を支払った');
      ok(power(bon)===5000 && power(bon)===power(O.leader), '例28: 元々のパワーがアタッカーと同値の5000に（加算でなく置換）');
      G.active='me';
      ok(power(bon)===5000, '例28: バトル終了後もこのターン中は持続（turnEnd）');
    }
    // 例29: OP01-059べべんっ‼ activateOwnChar(optional) — 候補1枚でも自動選択されず、辞退でレストのまま
    setupG('OP10-099'); { const P=G.players.me; // me=人間
      const wano=mkc('OP14-089'); wano.rested=true; P.chars=[wano]; // コスト3《ワノ国》・レスト
      P.hand=[mkc('OP01-006')]; // 《ワノ国》の捨てコスト
      scriptPrompt(['y','pick0','__skip']); // 捨て確認→捨て札選択→対象選択で「選ばない」
      await runFx(C['OP01-059'].fx.main.fx, {self:mkc('OP01-059'),side:'me'});
      resetPrompt();
      ok(P.hand.length===0, '例29: コスト（ワノ国1枚捨て）は支払われた');
      ok(promptCalls===3, '例29: 候補1枚でも対象選択プロンプトが出る（自動確定しない）');
      ok(wano.rested===true, '例29: 辞退（null選択）でレストのまま');
    }
    // 例30: OP16-108シリュウ trashToLife anyCard — コスト6以下《黒ひげ海賊団》はイベント(OP09-097闇水)も候補に入る
    setupG('OP10-099'); { const P=G.players.me; P.isCPU=true;
      const shi=mkc('OP16-108'); P.chars=[shi];
      P.hand=[mkc('OP15-067')]; P.trash=[mkc('OP09-097')]; P.life=[]; // 闇水=コスト2イベント《黒ひげ海賊団》
      await runFx(C['OP16-108'].fx.onPlay, {self:shi,side:'me'});
      ok(P.life.length===1 && P.life[0].no==='OP09-097' && P.life[0]._faceUp===true, '例30: トラッシュのイベントがanyCardで候補に入りライフ上へ表向きで追加');
      ok(P.hand.length===0 && !P.trash.some(c=>c.no==='OP09-097'), '例30: 手札1枚捨てコストを支払い、闇水はトラッシュから移動');
    }
    // 例31: OP16-048バギー【ターン1回】相手がアタックした時、囚人にブロッカー付与 —
    //   スキップ=未発動ならターン1回を消費せず同ターンの次アタックで再度選べる（実対戦指摘）。
    //   付与したブロッカーは現在のアタックをそのままブロックできる（Q&A1361）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; // 防御側=me(人間)・干渉のないリーダー
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const buggy=mkc('OP16-048'); buggy.summonedTurn=1;
      const pris=mkc('OP16-042'); pris.summonedTurn=1; P.chars=[buggy,pris]; // 囚人P6000
      P.hand=[]; P.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; P.deck=[mkc('OP15-067')];
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const a1=mkc('ST32-005'); a1.owner='cpu'; a1.summonedTurn=1;              // P2000=リーダーに届かない（手札汚染なし）
      const a2=mkc('OP01-065'); a2.owner='cpu'; a2.summonedTurn=1;              // P7000バニラ
      const a3=mkc('OP01-065'); a3.owner='cpu'; a3.summonedTurn=1; O.chars=[a1,a2,a3];
      scriptPrompt(['__skip']); // アタック1: 付与対象の選択をスキップ
      await declareAttack(a1, P.leader);
      ok(promptCalls===1 && !hasKw(pris,'blocker'), '例31a: スキップ→ブロッカー未付与（プロンプトは付与選択のみ）');
      ok(buggy._oppAtkTurn!==G.turnSeq, '例31a: 未発動なら【ターン1回】を消費しない');
      G.busy=false; G.myActable=true;
      scriptPrompt(['pick0']); // アタック2: 再表示された選択で囚人に付与 → 続くブロック確認は既定応答(先頭=blk:)でそのままブロック
      await declareAttack(a2, P.leader);
      ok(promptCalls===2 && P.life.length===3, '例31b: 同ターンの次アタックで再度選択でき、付与→現在のアタックをブロックしライフ無傷（Q&A1361）');
      ok(!P.chars.includes(pris) && P.trash.includes(pris) && buggy._oppAtkTurn===G.turnSeq, '例31b: 囚人は7000にKOされ、今度は【ターン1回】を消費');
      G.busy=false; G.myActable=true;
      scriptPrompt([]);
      await declareAttack(a3, P.leader);
      ok(promptCalls===0 && P.life.length===2, '例31c: 発動済みの3回目は選択なし（ターン1回）・リーダー被弾');
      resetPrompt(); G.active='me';
    }
    // 例31d: 囚人が場にいない場合は発動機会なし＝選択もカットインも出さず、ターン1回も消費しない（cond事前スキップ）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu;
      G.active='cpu'; G.busy=false; G.myActable=true; G.firstPlayer='me';
      const buggy=mkc('OP16-048'); buggy.summonedTurn=1; P.chars=[buggy];
      P.hand=[]; P.life=[mkc('OP15-067')]; P.deck=[mkc('OP15-067')];
      O.life=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const a1=mkc('OP01-065'); a1.owner='cpu'; a1.summonedTurn=1; O.chars=[a1];
      scriptPrompt([]);
      await declareAttack(a1, P.leader);
      ok(promptCalls===0 && buggy._oppAtkTurn!==G.turnSeq, '例31d: 囚人不在なら選択なし・ターン1回未消費');
      resetPrompt(); G.active='me';
    }
    // 例32: ★E54 アタック判断のカウンター意識（cpuPickAttack直接呼び）
    // 32a margin2: 相手残ライフ2以下+手札ありなら、リーダー攻撃は同値でなく+2000上乗せ（カウンター2枚要求）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; G.active='me';
      const atk=mkc('OP01-065'); atk.summonedTurn=1; P.chars=[atk]; P.don.active=5; // P7000バニラ vs リーダー5000
      O.life=[mkc('OP15-067'),mkc('OP15-067')]; O.hand=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const pick=cpuPickAttack('me',{});
      ok(pick && pick.target===O.leader && pick.attacker.attachedDon===2 && P.don.active===3, '例32a: margin2=残ライフ2で同値でなく+2000上乗せ（付与2・要求2枚）');
    }
    // 32b kohand: ドン付与のブロッカーKO狙いは相手手札が厚いと見送る（手札2枚以下なら実行）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; G.active='me';
      const atk=mkc('ST32-005'); atk.summonedTurn=1; P.chars=[atk]; P.don.active=3; // P2000
      const blk=mkc('OP01-065'); blk.owner='cpu'; blk.rested=true; blk.base=Object.assign({},blk.base,{blocker:true}); O.chars=[blk]; // レストの5000ブロッカー(3ドン同値KO圏)
      O.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      O.hand=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; // 手札8枚
      const pickFat=cpuPickAttack('me',{});
      ok(!pickFat || pickFat.target!==blk, '例32b: kohand=手札8枚相手へのドン付与ブロッカーKOは見送る');
      atk.attachedDon=0; P.don.active=3; O.hand=[mkc('OP15-067')]; // 手札1枚なら従来どおり狙う
      const pickThin=cpuPickAttack('me',{});
      ok(pickThin && pickThin.target===blk, '例32b: 手札1枚なら従来どおりブロッカーKOを狙う');
    }
    // 32c margin2c: パワー5000以上のキャラKOは+2000上乗せ（守られると残って毎ターン殴られる）。5000未満は従来どおり同値
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; G.active='me';
      const atk=mkc('ST32-003'); atk.summonedTurn=1; P.chars=[atk]; P.don.active=5; // P7000
      const big=mkc('OP01-065'); big.owner='cpu'; big.rested=true; big.base=Object.assign({},big.base,{blocker:true}); O.chars=[big]; // レストの7000ブロッカー…ではなくP7000。同値KO圏
      O.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; O.hand=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const pick=cpuPickAttack('me',{});
      ok(pick && pick.target===big && pick.attacker.attachedDon===2, '例32c: 5000以上のキャラKOは+2000上乗せ（付与2）');
      // 5000未満（P2000ブロッカー）は上乗せしない
      const small=mkc('ST32-005'); small.owner='cpu'; small.rested=true; small.base=Object.assign({},small.base,{blocker:true}); O.chars=[small];
      atk.attachedDon=0; P.don.active=5;
      const pick2=cpuPickAttack('me',{});
      ok(pick2 && pick2.target===small && pick2.attacker.attachedDon===0, '例32c: 5000未満のキャラKOは従来どおり同値（上乗せなし）');
    }
    // 32d kocap: 「2000に7ドン付与して9000ブロッカーへ同値」（実対戦報告の実ケース）を候補から除外。相手手札0なら確実に通るので許可
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; G.active='me';
      P.leader.rested=true; // リーダーは攻撃済み想定＝アタッカーは2000のみ
      const atk=mkc('ST32-005'); atk.summonedTurn=1; P.chars=[atk]; P.don.active=7; // P2000
      const big=mkc('OP01-065'); big.owner='cpu'; big.rested=true; big.base=Object.assign({},big.base,{power:9000,blocker:true}); O.chars=[big];
      O.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; O.hand=[mkc('OP15-067')]; O.deck=[mkc('OP15-067')];
      const pick=cpuPickAttack('me',{});
      ok(!pick || pick.target!==big, '例32d: kocap=相手手札ありの「2000+7ドン同値9000ブロッカーKO」は候補除外');
      atk.attachedDon=0; P.don.active=7; O.hand=[]; // 手札0＝カウンター不能なら確実に通るので許可
      const pick2=cpuPickAttack('me',{});
      ok(pick2 && pick2.target===big && pick2.attacker.attachedDon===7, '例32d: 相手手札0なら7ドン同値KOは許可（確実に通る）');
    }
    // 32e marginmax: 上乗せは「相手の理論最大カウンター(手札×2000)を超える要求」まで積む（同値2回=要求2000より1回の大要求が得）
    setupG('OP01-062'); { const P=G.players.me, O=G.players.cpu; P.isCPU=true; G.active='me';
      P.leader.rested=true;
      const atk=mkc('OP01-065'); atk.summonedTurn=1; atk.base=Object.assign({},atk.base,{power:5000}); P.chars=[atk]; P.don.active=7; // P5000
      const big=mkc('ST32-003'); big.owner='cpu'; big.rested=true; big.base=Object.assign({},big.base,{power:7000,blocker:true}); O.chars=[big];
      O.life=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')];
      O.hand=[mkc('OP15-067'),mkc('OP15-067'),mkc('OP15-067')]; O.deck=[mkc('OP15-067')]; // 手札3枚=理論最大カウンター6000
      const pick=cpuPickAttack('me',{});
      ok(pick && pick.target===big && pick.attacker.attachedDon===7, '例32e: marginmax=5000+7ドン(同値2+上乗せ5)=12000で要求5000（手札3枚の上限近くまで積む）');
    }
  }catch(e){ console.log('EXCEPTION:', e.message); fail++; }
  console.log('ユニットテスト: pass='+pass+' fail='+fail);
  process.exit(fail?1:0);
})();
`;
// ★書き込み完了(コールバック)を待ってから終了＝パイプ経由で親(test.js)が読む時の欠落を防ぐ（process.exit/自然終了によるstdout切り捨て対策）。
try{ process.stdout.write(runHarness('unit', harness)); }
catch(e){ process.stdout.write((e.stdout||'')+(e.stderr||'')); process.exit(1); }
