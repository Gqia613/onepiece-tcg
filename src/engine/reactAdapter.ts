// エンジンのUIフックを React(store) へ配線する UIAdapter 実装。
// bootstrap の footer が各フック束縛をここの実装へ再代入する。store は参照渡し（循環import回避）。
import type { UIAdapter, PromptConfig } from './ui-adapter';
import type { Card, PromptState, PickState, FxEvent, AtkState, EndState, TriggerRevealState } from './types';
import { playSfx, setAudioMuted, buzz } from '../audio';
import { RARITY } from './rarity';
import { useNetStore } from '../state/netStore';

// 必要最小の store 面（zustand の useEngineStore が構造的に満たす）
export interface AdapterStoreApi {
  getState: () => {
    engine: any;
    muted: boolean;
    prompt: PromptState | null; // staleness ガード用（現行プロンプトの照合）
    pick: PickState | null;
    bump: () => void;
    setPrompt: (p: PromptState | null) => void;
    setPick: (p: PickState | null) => void;
    pushFx: (e: FxEvent) => void;
    setAtk: (a: AtkState | null) => void;
    setTrigger: (t: TriggerRevealState | null) => void;
    setLethal: (side: 'me' | 'cpu' | null) => void;
    setEnd: (e: EndState | null) => void;
    setThinking: (on: boolean) => void;
    pushLog: (l: { cls: string; html: string }) => void;
  };
}

export function makeReactAdapter(store: AdapterStoreApi, opts?: { mySeat?: () => 'me' | 'cpu' }): UIAdapter {
  let promptId = 0;
  let pickId = 0;
  let fxId = 0;
  const S = () => store.getState();
  // ローカルプレイヤーの席（オンライン対戦のゲスト='cpu'。演出の上下/時間配分・勝敗表示に使う）。
  // テスト（2エンジン並走）では opts.mySeat で席を注入できる。
  const my = opts?.mySeat || (() => useNetStore.getState().mySeat);
  const sim = () => {
    const g = S().engine?.G;
    return !!(g && g._sim);
  };
  const realSetTimeout = (cb: () => void, ms: number) =>
    typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(cb, ms) : cb();
  const raf: (cb: () => void) => void =
    typeof globalThis.requestAnimationFrame === 'function'
      ? (cb) => { (globalThis as any).requestAnimationFrame(cb); }
      : (cb) => realSetTimeout(cb, 16);
  let rafPending = false; // 同フレーム内の複数 render() を1回の再描画に集約（チラつき防止）

  // ---- 盤面演出（元 src/40-ui-render.js の spawnAt/drawFly/donFly/shakeScreen/drawAtkLine を実DOMへ移植） ----
  // エンジンはスタブDOMで動くため、これらは React モジュール側（実 document）で実行する。
  // .felt に一時要素を append→自動除去する fire-and-forget（index.html と同じ挙動・CSSクラスも共通）。
  const hasDoc = () => typeof document !== 'undefined';
  const felt = (): HTMLElement | null => (hasDoc() ? (document.querySelector('.felt') as HTMLElement | null) : null);
  const byUid = (uid: number): HTMLElement | null =>
    hasDoc() ? (document.querySelector('[data-uid="' + uid + '"]') as HTMLElement | null) : null;
  // 登場直後のカードは React コミット前で未在の場合がある→ rAF で数フレーム待って再試行。
  const whenReady = (pred: () => unknown, use: () => void, tries = 5) => {
    if (pred()) { use(); return; }
    if (tries <= 0) return;
    raf(() => whenReady(pred, use, tries - 1));
  };

  // uid からカード実体を引く（登場演出のレア度判定用。chars/stage のみ走査＝軽量）
  const cardByUid = (uid: number): any => {
    const g = S().engine?.G; if (!g) return null;
    for (const sd of ['me', 'cpu'] as const) {
      const P = g.players?.[sd]; if (!P) continue;
      for (const c of P.chars || []) if (c.uid === uid) return c;
      if (P.stage && P.stage.uid === uid) return P.stage;
    }
    return null;
  };

  // カード位置にエフェクト（burst=KO粒子 / slash=斬撃 / ring=登場波紋 / spark=ドン輝き）
  const spawnAt = (uid: number, kind: string) => {
    if (sim()) return;
    // 登場リングはレア度で昇格: SR=金リング+専用SE / SEC・SP=金リング+ミニカットイン+専用SE。
    // エンジンのフック呼び出し（spawnAt(uid,'ring')）は不変＝アダプタ側だけの演出勾配。
    if (kind === 'ring') {
      const c = cardByUid(uid);
      const r = c ? RARITY[c.no] || RARITY[String(c.no).replace(/_r\d+$/, '')] : undefined;
      if (r === 'SEC' || r === 'SP') {
        kind = 'ringsr';
        if (!S().muted) playSfx('summonSec');
        S().pushFx({ type: 'sumcut', id: ++fxId, no: c.no, name: c.base?.name || '' });
      } else if (r === 'SR') {
        kind = 'ringsr';
        if (!S().muted) playSfx('summonRare');
      }
    }
    whenReady(() => byUid(uid) && felt(), () => {
      const f = felt(), el = byUid(uid); if (!f || !el) return;
      const fr = f.getBoundingClientRect(), r = el.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'spawnfx ' + kind;
      d.style.left = (r.left - fr.left + r.width / 2) + 'px';
      d.style.top = (r.top - fr.top + r.height / 2) + 'px';
      if (kind === 'burst') {
        let s = '';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 360 + (Math.random() * 24 - 12), dist = (26 + Math.random() * 34) | 0, sz = (3 + Math.random() * 4).toFixed(1);
          s += '<i style="--a:' + a.toFixed(0) + 'deg;--d:' + dist + 'px;width:' + sz + 'px;height:' + sz + 'px"></i>';
        }
        d.innerHTML = s;
      }
      f.appendChild(d);
      realSetTimeout(() => d.remove(), 950);
    });
  };

  // ドローの飛翔（デッキ山→手札へカード背面が飛ぶ）。CSSクラス .side.me/.opp は「自席=下段/相手=上段」の意味。
  const drawFly = (side: 'me' | 'cpu') => {
    if (sim()) return;
    whenReady(felt, () => {
      const f = felt(); if (!f) return;
      const mine = side === my();
      const from = document.querySelector('.side.' + (mine ? 'me' : 'opp') + ' .ga-deck .pile');
      const to = mine ? document.querySelector('.handzone') : document.querySelector('.side.opp .ga-hand .pile');
      if (!from || !to) return;
      const fr = f.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'flycard';
      d.style.left = (a.left - fr.left) + 'px'; d.style.top = (a.top - fr.top) + 'px';
      d.style.width = a.width + 'px'; d.style.height = a.height + 'px';
      d.style.setProperty('--fx', (b.left - fr.left + b.width / 2 - (a.left - fr.left) - a.width / 2) + 'px');
      d.style.setProperty('--fy', (b.top - fr.top + b.height / 2 - (a.top - fr.top) - a.height / 2) + 'px');
      f.appendChild(d);
      realSetTimeout(() => d.remove(), 700);
    });
  };

  // ドン付与の飛翔（コストエリア→対象カードへ金の光が飛ぶ→着弾で spark）
  const donFly = (side: 'me' | 'cpu', uid: number) => {
    if (sim()) return;
    whenReady(() => byUid(uid) && felt(), () => {
      const f = felt(), to = byUid(uid); if (!f || !to) return;
      const from = document.querySelector('.side.' + (side === my() ? 'me' : 'opp') + ' .ga-cost');
      if (!from) return;
      const fr = f.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'donfly';
      d.style.left = (a.left - fr.left + a.width / 2) + 'px'; d.style.top = (a.top - fr.top + a.height / 2) + 'px';
      d.style.setProperty('--fx', (b.left - fr.left + b.width / 2 - (a.left - fr.left + a.width / 2)) + 'px');
      d.style.setProperty('--fy', (b.top - fr.top + b.height / 2 - (a.top - fr.top + a.height / 2)) + 'px');
      f.appendChild(d);
      realSetTimeout(() => { d.remove(); spawnAt(uid, 'spark'); }, 460);
    });
  };

  // 画面シェイク（リーダー被弾など重い一撃）
  const shakeScreen = () => {
    if (sim()) return;
    const f = felt(); if (!f) return;
    f.classList.remove('quake'); void f.offsetWidth; f.classList.add('quake');
    realSetTimeout(() => { const g = felt(); if (g) g.classList.remove('quake'); }, 480);
  };

  // 攻撃ライン（アタッカー→対象を結ぶ光の線）。宣言時に引き、解除時に消す。
  const clearAtkLine = () => { if (hasDoc()) document.querySelectorAll('.felt .atkline').forEach((e) => e.remove()); };
  const drawAtkLine = () => {
    if (sim()) return;
    const g = S().engine?.G; if (!g || !g._atkFrom || !g._atkTo) return;
    whenReady(() => byUid(g._atkFrom) && byUid(g._atkTo) && felt(), () => {
      clearAtkLine();
      const f = felt(); if (!f) return;
      const a = byUid(g._atkFrom), b = byUid(g._atkTo); if (!a || !b) return;
      const fr = f.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.left - fr.left + ra.width / 2, y1 = ra.top - fr.top + ra.height / 2;
      const x2 = rb.left - fr.left + rb.width / 2, y2 = rb.top - fr.top + rb.height / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      if (!len) return;
      const el = document.createElement('div'); el.className = 'atkline';
      el.style.left = x1 + 'px'; el.style.top = y1 + 'px'; el.style.width = len + 'px';
      el.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg)';
      f.appendChild(el);
    });
  };

  return {
    // ★AI探索中(_sim)は描画しない（元 render() の `if(G._sim) return` と同じ）。
    //   探索は実Gを一時的に書き換えて復元するため、この間に再描画すると盤面/手札が崩れる。
    // ★render() はエンジンが1アクション中に多数回呼ぶため、rAFで1フレーム1回にコアレスしてチラつきを抑える。
    render: () => {
      if (sim()) return;
      if (rafPending) return;
      rafPending = true;
      raf(() => { rafPending = false; if (!sim()) S().bump(); });
    },
    log: (cls, html) => S().pushLog({ cls, html }),
    flog: (side, text) => S().pushLog({ cls: side, html: text }),
    toast: (text) => { if (sim()) return; S().pushFx({ type: 'toast', id: ++fxId, text }); },
    floatOn: (uid, text, kind) => { if (sim()) return; S().pushFx({ type: 'float', id: ++fxId, uid, text, kind }); },
    animClass: (uid, cls) => { if (sim()) return; S().pushFx({ type: 'anim', id: ++fxId, uid, cls }); },
    showFxNote: (side, label, name, no) => { if (sim()) return; S().pushFx({ type: 'fxnote', id: ++fxId, side, label, name, no }); },
    fxNote: (side, label, name, no) => {
      if (sim()) return Promise.resolve();
      S().pushFx({ type: 'fxnote', id: ++fxId, side, label, name, no });
      // エンジンの await を満たすため一定時間後に解決（自分=340 / 相手=660ms）
      return new Promise<void>((res) => realSetTimeout(res, side === my() ? 340 : 660));
    },
    // ライフからトリガーが公開された瞬間の大写し演出。
    // sim()（AI探索）中は実タイマーで回るため即解決（演出awaitで探索を遅延/破壊しない）。
    triggerReveal: (side, card) => {
      if (sim()) return Promise.resolve();
      const b = (card && card.base) || {};
      S().setTrigger({ side, no: b.no, name: b.name });
      if (!S().muted) playSfx('reveal');
      // 演出を見せる時間だけ待って解決（自分=1400 / 相手=1900ms）。相手の行動は少し長く見せる。
      return new Promise<void>((res) => realSetTimeout(res, side === my() ? 1400 : 1900));
    },
    clearTriggerReveal: () => {
      if (sim()) return;
      S().setTrigger(null);
    },
    // リーサル（トドメの一撃）カットイン。エンジンは lose() 直前に await する。
    // sim中は即解決（探索を遅延させない）。表示は LethalCutIn.tsx が store.lethal を購読。
    lethalFx: (side: 'me' | 'cpu') => {
      if (sim()) return Promise.resolve();
      S().setLethal(side);
      if (!S().muted) playSfx('finish');
      buzz(100);
      shakeScreen();
      return new Promise<void>((res) => realSetTimeout(() => { S().setLethal(null); res(); }, 1350));
    },
    showAtkAnnounce: (aSide, attacker, target) => {
      if (sim()) return;
      // 元 showAtkAnnounce(40-ui-render.js) は G._atkFrom/_atkTo を設定する（盤面カードの枠グロー用）。
      const g = S().engine?.G;
      if (g) { g._atkFrom = attacker ? attacker.uid : null; g._atkTo = target ? target.uid : null; }
      S().setAtk({ aSide, attacker, target, phase: 'declare' });
      drawAtkLine(); // アタッカー→対象を結ぶ光の線（元は render() 毎に再描画・web は宣言/解除で管理）
    },
    clearAtkAnnounce: () => {
      const g = S().engine?.G;
      if (g) { g._atkFrom = null; g._atkTo = null; } // 元同様に必ず解除（残留グロー防止）
      clearAtkLine();
      S().setAtk(null);
    },
    showEndScreen: (win, reason) => {
      // エンジンの win は 'me' 視点。ゲスト席（mySeat='cpu'）では G.winner から自席視点に再計算する。
      const g = S().engine?.G;
      const w = g && g.winner ? g.winner === my() : win;
      S().setEnd({ win: w, reason });
      buzz(w ? [30, 50, 100] : 60);
      if (!S().muted) playSfx(w ? 'win' : 'lose');
    },
    showThinking: (on) => { S().setThinking(on); },
    sfx: (name) => {
      if (sim()) return;
      // クライマックスの触覚フィードバック（対応端末のみ・ミュートとは独立）
      if (name === 'hit') buzz(30);
      else if (name === 'ko') buzz(20);
      else if (name === 'trigger') buzz([20, 40, 60]);
      if (S().muted) return;
      playSfx(name);
    },

    // 盤面演出フック（bootstrap の HOOKS で raw の同名関数へ差し替わる）。
    spawnAt,
    drawFly,
    donFly,
    shakeScreen,

    // エンジンの callClaude / llmHealth（LLM_PROXY 宛て fetch）を同一オリジンの /api/ai へ橋渡し。
    // 鍵はサーバ secret のみ。cookie 認証は same-origin で自動付与。
    fetch: ((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const realFetch = (globalThis as any).fetch.bind(globalThis);
      if (url.indexOf('/healthz') >= 0) {
        return realFetch('/api/ai', { method: 'GET', credentials: 'same-origin', signal: init && init.signal });
      }
      if (url.indexOf('/v1/messages') >= 0) {
        return realFetch('/api/ai', { ...(init || {}), credentials: 'same-origin' });
      }
      return realFetch(input, init);
    }) as any,

    // モーダル選択。Promise を返し、Prompt の押下で解決。
    // G.promptState もミラー（uiEndTurn 等エンジン側ガードを効かせる）。
    showPrompt: (cfg: PromptConfig) =>
      new Promise((resolve) => {
        const id = ++promptId;
        const origOnPick = cfg.onPick;
        const g = S().engine?.G;
        const side = cfg.side || (g ? g.active : 'me'); // 決定者の席（未指定はアクティブ側＝エンジン改修前の呼び出し互換）
        const local = !!cfg.local;
        if (g) g.promptState = { title: cfg.title, text: cfg.text, opts: cfg.opts || [], cls: cfg.cls || '', side, local };
        S().setPrompt({
          ...cfg,
          side,
          local,
          id,
          onPick: (v: any) => {
            // staleness ガード: このプロンプトが別のプロンプトに上書きされた後
            // （AnimatePresence の exit 中は旧ボタンがまだタップできる）に押されても、
            // 現行プロンプト（後発）の表示や G.promptState ミラーを壊さない。
            // 自身の Promise は必ず resolve する（フリーズ厳禁）。
            const cur = S().prompt;
            if (!cur || cur.id === id) {
              if (g) g.promptState = null;
              S().setPrompt(null);
            }
            try { origOnPick && origOnPick(v); } catch { /* ignore */ }
            resolve(v);
          },
        });
      }),

    // 盤面ハイライト＋モーダル併用の対象選択。空候補/想定外でも必ず resolve。side=決定者の席。
    humanPick: (cands: any[], text?: string, optional?: boolean, cls?: string, side?: 'me' | 'cpu') => {
      const list = (cands || []).filter(Boolean);
      if (list.length === 0) return Promise.resolve(null);
      return new Promise<Card | null>((resolve) => {
        const id = ++pickId;
        const uids = new Set<number>(list.map((c: any) => c.uid));
        const g = S().engine?.G;
        const seat = side || (g ? g.active : 'me');
        const finish = (card: Card | null) => {
          // staleness ガード: 自分が現行の pick/prompt のときだけ表示とミラーを消す
          // （後発プロンプト出現後に旧UIから finish が呼ばれても後発を壊さない）。resolve は必ず行う。
          if (g && g.pendingChoice && g.pendingChoice.res === finish) g.pendingChoice = null;
          if (S().pick?.id === id) S().setPick(null);
          const cur = S().prompt;
          if (!cur || cur.id === 100000 + id) {
            if (g) g.promptState = null;
            S().setPrompt(null);
          }
          resolve(card);
        };
        // G.pendingChoice もミラー（エンジン側ガード・整合のため）。cands=ゾーン外一時カードのuid解決用
        if (g) g.pendingChoice = { uids, optional, danger: cls === 'danger', res: finish, side: seat, cands: list };
        S().setPick({ id, uids, optional, danger: cls === 'danger', text, resolve: finish, side: seat });
        S().setPrompt({
          id: 100000 + id,
          side: seat,
          cls: cls || '',
          title: '対象を選択',
          text: text || '対象を選んでください',
          opts: [
            ...list.map((c: any) => ({ t: c.base.name, v: 'pick:' + c.uid, card: { no: c.base.no } })),
            ...(optional ? [{ t: '選ばない', v: '__skip', ghost: true }] : []),
          ],
          onPick: (v: any) => {
            if (typeof v === 'string' && v.indexOf('pick:') === 0) {
              const u = +v.slice(5);
              finish(list.find((c: any) => c.uid === u) || (optional ? null : list[0]));
            } else {
              finish(optional ? null : list[0]);
            }
          },
        });
      });
    },
  };
}

export { setAudioMuted };
