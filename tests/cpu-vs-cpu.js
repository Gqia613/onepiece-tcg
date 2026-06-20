process.on("unhandledRejection",e=>{console.error("UNHANDLED",e&&e.stack||e);process.exit(1);});
G.aiOn=false;
showPrompt=function(cfg){const o=cfg.opts||[];const t=cfg.title||"";let v;
  if(t.indexOf("マリガン")>=0)v=false;else if(t.indexOf("カウンター")>=0)v="__done";else if(t.indexOf("トリガー")>=0)v=true;
  else if(t.indexOf("ブロック")>=0)v=(o[0]&&String(o[0].v).indexOf("blk:")===0)?o[0].v:"__skip";
  else if(t.indexOf("ドン!!-")>=0)v="r";else if(t.indexOf("ティーチ")>=0)v=(o[0]&&o[0].v)||"__no";else if(t.indexOf("ルーシー")>=0)v=false;
  else{const x=o.find(z=>z.primary)||o.find(z=>z.v&&String(z.v).indexOf("pick:")===0)||o[0];v=x?x.v:undefined;}
  if(cfg.onPick)cfg.onPick(v);return Promise.resolve(v);};
humanPick=function(c){return Promise.resolve(c[0]||null);};
// 同一ターンで同じカードが2回以上アタックしていないか検証
let dblAtk=0; const seen={};
const _da=declareAttack; declareAttack=async function(a,t){const key=G.active+"#"+G.turnSeq+"#"+a.uid; if(seen[key]){dblAtk++;console.log("DOUBLE ATTACK",a.base.name,"turn",G.turnSeq,"side",G.active);} seen[key]=1; return await _da(a,t);};
async function pilotMe(){const me=G.players.me;let g=0;
  while(g++<25){const c=me.hand.find(c=>handPlayable(c));if(!c)break;await tryPlayHand(c);if(G.winner)return;}
  if(me.leader.base.leader==="enel"&&me.turnsTaken>=2&&me._enelUsedTurn!==G.turnSeq)await leaderActivate("me");
  while(me.don.active>0){me.leader.attachedDon++;me.don.active--;}
  g=0;while(g++<14&&canAttackThisTurn("me")){const a=[me.leader,...me.chars].filter(canCardAttack)[0];if(!a)break;const tg=legalTargets("me");if(!tg.length)break;await declareAttack(a,tg[0]);if(G.winner)return;}uiEndTurn();}
async function playOne(a,b){G.players={};G.winner=null;G.inGame=false;startGame(a,b);let it=0,p=false;
  while(!G.winner&&it<500000){await new Promise(r=>setImmediate(r));it++;if(G.active==="me"&&G.myActable&&!G.busy&&!p){p=true;await pilotMe();p=false;}}return G.winner||"(none)";}
(async()=>{let ok=0,bad=0;const d=["enel","lucy","ace","nami","hancock","teach"];
for(let i=0;i<d.length;i++)for(let j=0;j<d.length;j++){if(i===j)continue;const w=await playOne(d[i],d[j]);ok++;if(w==="(none)")bad++;}
console.log("games="+ok+" noWinner="+bad+" doubleAttacks="+dblAtk);process.exit((bad||dblAtk)?1:0);})();
