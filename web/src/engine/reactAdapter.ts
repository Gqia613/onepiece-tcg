// エンジンのUIフックを React(store) へ配線する UIAdapter 実装。
// bootstrap の footer が各フック束縛をここの実装へ再代入する。store は参照渡し（循環import回避）。
import type { UIAdapter, PromptConfig } from './ui-adapter';
import type { Card, PromptState, PickState, FxEvent, AtkState, EndState } from './types';
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
    showFxNote: (side, label, name) => { if (sim()) return; S().pushFx({ type: 'fxnote', id: ++fxId, side, label, name }); },
    fxNote: (side, label, name) => {
      if (sim()) return Promise.resolve();
      S().pushFx({ type: 'fxnote', id: ++fxId, side, label, name });
      // エンジンの await を満たすため一定時間後に解決（me=340 / cpu=660ms）
      return new Promise<void>((res) => realSetTimeout(res, side === 'me' ? 340 : 660));
    },
    showAtkAnnounce: (aSide, attacker, target) => {
      if (sim()) return;
      // 元 showAtkAnnounce(40-ui-render.js) は G._atkFrom/_atkTo を設定する（盤面カードの枠グロー用）。
      const g = S().engine?.G;
      if (g) { g._atkFrom = attacker ? attacker.uid : null; g._atkTo = target ? target.uid : null; }
      S().setAtk({ aSide, attacker, target, phase: 'declare' });
    },
    clearAtkAnnounce: () => {
      const g = S().engine?.G;
      if (g) { g._atkFrom = null; g._atkTo = null; } // 元同様に必ず解除（残留グロー防止）
      S().setAtk(null);
    },
    showEndScreen: (win, reason) => { S().setEnd({ win, reason }); if (!S().muted) playSfx(win ? 'win' : 'lose'); },
    showThinking: (on) => { S().setThinking(on); },
    sfx: (name) => { if (sim() || S().muted) return; playSfx(name); },

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
