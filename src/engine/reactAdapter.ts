// エンジンのUIフックを React(store) へ配線する UIAdapter 実装。
// bootstrap の footer が各フック束縛をここの実装へ再代入する。store は参照渡し（循環import回避）。
import type { UIAdapter, PromptConfig } from './ui-adapter';
import type { Card, PromptState, PickState, FxEvent, AtkState, EndState, TriggerRevealState } from './types';
import { playSfx, setAudioMuted } from '../audio';

// 必要最小の store 面（zustand の useEngineStore が構造的に満たす）
export interface AdapterStoreApi {
  getState: () => {
    engine: any;
    muted: boolean;
    bump: () => void;
    setPrompt: (p: PromptState | null) => void;
    setPick: (p: PickState | null) => void;
    pushFx: (e: FxEvent) => void;
    setAtk: (a: AtkState | null) => void;
    setTrigger: (t: TriggerRevealState | null) => void;
    setEnd: (e: EndState | null) => void;
    setThinking: (on: boolean) => void;
    pushLog: (l: { cls: string; html: string }) => void;
  };
}

export function makeReactAdapter(store: AdapterStoreApi): UIAdapter {
  let promptId = 0;
  let pickId = 0;
  let fxId = 0;
  const S = () => store.getState();
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

  // カード位置にエフェクト（burst=KO粒子 / slash=斬撃 / ring=登場波紋 / spark=ドン輝き）
  const spawnAt = (uid: number, kind: string) => {
    if (sim()) return;
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

  // ドローの飛翔（デッキ山→手札へカード背面が飛ぶ）
  const drawFly = (side: 'me' | 'cpu') => {
    if (sim()) return;
    whenReady(felt, () => {
      const f = felt(); if (!f) return;
      const from = document.querySelector('.side.' + (side === 'me' ? 'me' : 'opp') + ' .ga-deck .pile');
      const to = side === 'me' ? document.querySelector('.handzone') : document.querySelector('.side.opp .ga-hand .pile');
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
      const from = document.querySelector('.side.' + (side === 'me' ? 'me' : 'opp') + ' .ga-cost');
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
      // エンジンの await を満たすため一定時間後に解決（me=340 / cpu=660ms）
      return new Promise<void>((res) => realSetTimeout(res, side === 'me' ? 340 : 660));
    },
    // ライフからトリガーが公開された瞬間の大写し演出。
    // sim()（AI探索）中は実タイマーで回るため即解決（演出awaitで探索を遅延/破壊しない）。
    triggerReveal: (side, card) => {
      if (sim()) return Promise.resolve();
      const b = (card && card.base) || {};
      S().setTrigger({ side, no: b.no, name: b.name });
      if (!S().muted) playSfx('reveal');
      // 演出を見せる時間だけ待って解決（me=1400 / cpu=1900ms）。相手の行動は少し長く見せる。
      return new Promise<void>((res) => realSetTimeout(res, side === 'me' ? 1400 : 1900));
    },
    clearTriggerReveal: () => {
      if (sim()) return;
      S().setTrigger(null);
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
    showEndScreen: (win, reason) => { S().setEnd({ win, reason }); if (!S().muted) playSfx(win ? 'win' : 'lose'); },
    showThinking: (on) => { S().setThinking(on); },
    sfx: (name) => { if (sim() || S().muted) return; playSfx(name); },

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
        const close = () => { if (g) g.promptState = null; };
        if (g) g.promptState = { title: cfg.title, text: cfg.text, opts: cfg.opts || [], cls: cfg.cls || '' };
        S().setPrompt({
          ...cfg,
          id,
          onPick: (v: any) => {
            close();
            S().setPrompt(null);
            try { origOnPick && origOnPick(v); } catch { /* ignore */ }
            resolve(v);
          },
        });
      }),

    // 盤面ハイライト＋モーダル併用の対象選択。空候補/想定外でも必ず resolve。
    humanPick: (cands: any[], text?: string, optional?: boolean, cls?: string) => {
      const list = (cands || []).filter(Boolean);
      if (list.length === 0) return Promise.resolve(null);
      return new Promise<Card | null>((resolve) => {
        const id = ++pickId;
        const uids = new Set<number>(list.map((c: any) => c.uid));
        const g = S().engine?.G;
        const finish = (card: Card | null) => {
          if (g) { g.pendingChoice = null; g.promptState = null; }
          S().setPick(null);
          S().setPrompt(null);
          resolve(card);
        };
        // G.pendingChoice もミラー（エンジン側ガード・整合のため）
        if (g) g.pendingChoice = { uids, optional, danger: cls === 'danger', res: finish };
        S().setPick({ id, uids, optional, danger: cls === 'danger', text, resolve: finish });
        S().setPrompt({
          id: 100000 + id,
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
