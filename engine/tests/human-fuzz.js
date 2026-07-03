/* 人間オートパイロット・ファズ v3：状態が一定回数変化しなければ真の停止と判定 */
const _yield=()=>new Promise(r=>setImmediate(r));
let noClick={}, stuck=[], finished=0;
showPrompt=function(cfg){const opts=cfg.opts||[];const clickable=opts.filter(o=>!o.disabled);const t=cfg.title||'';
  if(clickable.length===0){noClick[t]=(noClick[t]||0)+1;if(cfg.onPick)cfg.onPick(undefined);return Promise.resolve(undefined);}
  const pick=clickable.find(o=>o.primary)||clickable[0];if(cfg.onPick)cfg.onPick(pick.v);return Promise.resolve(pick.v);};
function sig(){const m=G.players.me,c=G.players.cpu;return [G.turnSeq,G.active,G.busy,G.myActable,G.winner,m.hand.length,m.life.length,m.chars.length,m.trash.length,c.hand.length,c.life.length,c.chars.length,c.trash.length,(G.promptState&&G.promptState.title)||''].join('|');}
async function settle(maxNoChange){ let last=sig(),same=0,it=0; while(same<maxNoChange&&it++<60000){ await _yield(); const s=sig(); if(s===last)same++; else {same=0;last=s;} if(G.winner)return 'winner'; if(G.active==='me'&&G.myActable&&!G.busy)return 'myturn'; } return 'stuck'; }
async function pilotHumanTurn(){let steps=0;while(G.active==='me'&&G.myActable&&!G.busy&&!G.winner&&steps++<60){const P=G.players.me;const playable=P.hand.find(c=>(c.base.type==='CHAR'&&P.chars.length<5&&effCost('me',c)<=P.don.active)||(c.base.type==='EVENT'&&c.base.fx&&c.base.fx.main&&(c.base.cost||0)<=P.don.active)||(c.base.type==='STAGE'&&(c.base.cost||0)<=P.don.active));if(playable&&Math.random()<0.7){await tryPlayHand(playable);await settle(40);continue;}if(canAttackThisTurn('me')){const atkrs=[P.leader,...P.chars].filter(c=>canCardAttack(c));const tgts=legalTargets('me');if(atkrs.length&&tgts.length){await declareAttack(atkrs[0],tgts[Math.random()*tgts.length|0]);await settle(40);continue;}}break;}if(G.active==='me'&&!G.winner&&G.myActable&&!G.busy)uiEndTurn();}
(async()=>{
  const ids=DECKS.map(d=>d.id);const N=30;
  for(let game=0;game<N;game++){
    const me=game%2===0?'teach':ids[Math.random()*ids.length|0];const cpu=ids[Math.random()*ids.length|0];
    await startGame(me,cpu); await settle(80);
    let turns=0,ok=true;
    while(!G.winner&&turns++<100){
      const r=await settle(400); // 400回連続で状態不変なら停止とみなす
      if(r==='winner')break;
      if(r==='stuck'){ stuck.push('game#'+game+' me='+me+' cpu='+cpu+' turn≈'+G.turnDisp+' active='+G.active+' busy='+G.busy+' prompt='+((G.promptState&&G.promptState.title)||'なし')); ok=false; break; }
      await pilotHumanTurn();
    }
    if(ok)finished++;
  }
  console.log('完了:',finished+'/'+N,' 真の停止:',stuck.length);
  stuck.slice(0,8).forEach(s=>console.log('  STUCK',s));
  console.log('クリック不能プロンプト:',Object.keys(noClick).length?JSON.stringify(noClick):'なし');
})();
