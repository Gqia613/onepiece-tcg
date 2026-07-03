// エンジン bootstrap。
// 既存アプリ(index.html の <script src> 群)を verbatim コピー(raw/)したものを、
// DOM/タイマーをスタブした単一スコープ(new Function)で評価し、ゲームAPIを取り出す。
// UIフック(render/flog/showPrompt 等)は footer で注入アダプタへ再代入する
// （呼び出し箇所は無改変。tests/_load-app.js + stubs.js の方式をブラウザ/vitestへ移植）。
import type { UIAdapter } from './ui-adapter';

// ---- raw 原本（sync-engine.mjs が web/src/engine/raw/ へコピー。index.html と同順） ----
import cards from './raw/cards.js?raw';
import cardsfx from './raw/cards-fx.js?raw';
import cardsattr from './raw/cards-attr.js?raw';
import d00 from './raw/00-data.js?raw';
import e10 from './raw/10-engine-core.js?raw';
import t20 from './raw/20-targeting-fx.js?raw';
import b30 from './raw/30-flow-battle.js?raw';
import u40 from './raw/40-ui-render.js?raw';
import i50 from './raw/50-input-cpu-ai.js?raw';
import s60 from './raw/60-screens-init.js?raw';
import aiw from './raw/ai-weights.js?raw';
import aip from './raw/ai-policy.js?raw';
import ais from './raw/ai-strategy.js?raw';
import ai70 from './raw/70-ai.js?raw';

const PARTS = [cards, cardsfx, cardsattr, d00, e10, t20, b30, u40, i50, s60, aiw, aip, ais, ai70];

// footer で注入アダプタへ差し替えるUIフック束縛（全て function 宣言＝再代入可能）。
const HOOKS = [
  'render', 'log', 'flog', 'toast', 'floatOn', 'animClass', 'showFxNote', 'fxNote',
  'showAtkAnnounce', 'clearAtkAnnounce', 'showEndScreen', 'showThinking', 'sfx',
  // 盤面演出（登場波紋/KO粒子/斬撃/ドロー飛翔/ドン付与飛翔/画面シェイク）。raw の同名関数を実DOM実装へ差し替え。
  'spawnAt', 'drawFly', 'donFly', 'shakeScreen',
  'showPrompt', 'humanPick', 'chooseCard',
];

// 取り出す公開API（typeofガードで未定義名は自動的に省略）。
const EXPORTS = [
  'G', 'C', 'DECKS',
  'startGame', 'beginTurn', 'endTurn', 'uiEndTurn',
  'declareAttack', 'summon', 'koCard', 'removeCharTo',
  'doOp', 'runFx', 'power', 'opp', 'effCost', 'checkCond',
  'legalTargets', 'canCardAttack', 'canAttackThisTurn',
  'leaderActivate', 'activateAbility',
  'tryPlayHand', 'handPlayable', 'attachDonFlow', 'attachDon',
  'beginAttack', 'openOwnMenu', 'cancelAttackSel', 'backToSelect',
  'chooseCard', 'humanPick', 'confirmUse',
  'cpuTurn', 'aiThink', 'predictCPU',
  'inst', 'buildPlayer', 'findDeck', 'escapeHTML', 'IMG',
  'builderToDeck', 'builderValidate', 'leaderColors', // デッキ検証/生成（クラウド保存の整合に再利用）
];

const PREAMBLE = `
// ---- 環境スタブ（tests/stubs.js 準拠。ブラウザでもエンジンは自前DOMで完結） ----
var __H = __ui || {};
function __el(){return {style:{},classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}},_html:'',set innerHTML(v){this._html=v;},get innerHTML(){return this._html;},textContent:'',value:'',scrollTop:0,offsetHeight:0,offsetWidth:0,children:[],appendChild:function(){},insertBefore:function(){},removeChild:function(){},append:function(){},addEventListener:function(){},removeEventListener:function(){},remove:function(){},setAttribute:function(){},getAttribute:function(){return null;},removeAttribute:function(){},querySelector:function(){return null;},querySelectorAll:function(){return [];},getBoundingClientRect:function(){return{left:0,top:0,width:10,height:14,right:10,bottom:14};},closest:function(){return null;},focus:function(){},click:function(){},dispatchEvent:function(){}};}
var document={getElementById:function(){return __el();},querySelector:function(){return null;},querySelectorAll:function(){return [];},createElement:function(){return __el();},createDocumentFragment:function(){return __el();},addEventListener:function(){},removeEventListener:function(){},body:{appendChild:function(){},classList:{add:function(){},remove:function(){}}},documentElement:{style:{}}};
var window={innerWidth:1200,innerHeight:800,devicePixelRatio:1,addEventListener:function(){},removeEventListener:function(){},matchMedia:function(){return{matches:false,addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){}};},getComputedStyle:function(){return{};}};
var navigator={userAgent:'',maxTouchPoints:0};
var confirm=function(){return false;};
var alert=function(){};
var localStorage=undefined, sessionStorage=undefined;
var AudioContext=undefined, webkitAudioContext=undefined;
var fetch=__H.fetch||function(){return Promise.reject(new Error('no-net'));};
var setTimeout=__schedule, clearTimeout=function(){};
var setInterval=function(){return 0;}, clearInterval=function(){};
var requestAnimationFrame=function(cb){return __schedule(function(){cb(0);},0);}, cancelAnimationFrame=function(){};
`;

function buildFooter(): string {
  const overrides = HOOKS.map((h) => `if(typeof ${h}!=='undefined'&&__H.${h})${h}=__H.${h};`).join('\n');
  const exp = EXPORTS.map((n) => `if(typeof ${n}!=='undefined')__API.${n}=${n};`).join('\n');
  return `
// ---- footer: UIフックを注入アダプタへ差し替え＋公開APIを返す ----
${overrides}
// 計測フック（テスト用）。declareAttack を内部呼び出しごとラップ＝CPU/人間両方のアタックを捕捉。
if(__H.onAttack && typeof declareAttack!=='undefined'){
  var __origDA=declareAttack;
  declareAttack=function(a,t){ try{__H.onAttack(a,t);}catch(e){} return __origDA.apply(this,arguments); };
}
var __API={};
${exp}
return __API;
`;
}

export interface EngineAPI {
  G: any;
  C: Record<string, any>;
  DECKS: any[];
  startGame: (meDeck: string, cpuDeck: string) => Promise<void>;
  beginTurn: (side: 'me' | 'cpu') => Promise<void>;
  endTurn: (side: 'me' | 'cpu') => Promise<void> | void;
  uiEndTurn: () => void;
  declareAttack: (attacker: any, target: any) => Promise<void>;
  summon: (side: 'me' | 'cpu', card: any, noEnter?: boolean, source?: any) => Promise<void>;
  doOp: (op: any, ctx: any) => Promise<void>;
  runFx: (ops: any[], ctx: any) => Promise<void>;
  power: (card: any) => number;
  legalTargets: (side: 'me' | 'cpu', attacker?: any) => any[];
  canCardAttack: (card: any) => boolean;
  canAttackThisTurn: (side: 'me' | 'cpu') => boolean;
  leaderActivate: (side: 'me' | 'cpu') => Promise<void>;
  tryPlayHand: (card: any) => Promise<void>;
  handPlayable: (card: any) => boolean;
  chooseCard: (...a: any[]) => Promise<any>;
  humanPick: (...a: any[]) => Promise<any>;
  confirmUse: (...a: any[]) => Promise<boolean>;
  cpuTurn: (side: 'me' | 'cpu') => Promise<void>;
  [k: string]: any;
}

export interface EngineOptions {
  ui?: UIAdapter;
  timers?: 'real' | 'immediate'; // immediate=テスト高速化(setImmediate)。既定 real。
  aiOn?: boolean; // LLM思考の有無。既定はエンジン依存（未指定なら触らない）。
}

export function createEngine(opts: EngineOptions = {}): EngineAPI {
  const ui = opts.ui || {};
  const g: any = globalThis as any;
  const realSetTimeout: (cb: () => void, ms?: number) => any =
    typeof g.setTimeout === 'function' ? g.setTimeout.bind(g) : (cb: () => void) => cb();
  const realSetImmediate: ((cb: () => void) => any) | null =
    typeof g.setImmediate === 'function' ? g.setImmediate.bind(g) : null;

  const schedule =
    opts.timers === 'immediate'
      ? (cb: () => void) => (realSetImmediate ? realSetImmediate(cb) : realSetTimeout(cb, 0))
      : (cb: () => void, ms?: number) => realSetTimeout(cb, ms || 0);

  const source = PREAMBLE + '\n' + PARTS.join('\n') + '\n' + buildFooter();
  // eslint-disable-next-line no-new-func
  const factory = new Function('__ui', '__schedule', source);
  const api: EngineAPI = factory(ui, schedule);
  if (typeof opts.aiOn === 'boolean' && api.G) api.G.aiOn = opts.aiOn;
  return api;
}
