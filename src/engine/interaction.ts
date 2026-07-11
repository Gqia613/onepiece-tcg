// カードのクリック挙動・ハイライト判定の中央集約。
// src/50-input-cpu-ai.js onBoardClick(28-47) のクリック優先度を React 用に忠実再現。
// 重要: React は engine.G の生オブジェクトを描画するため、card の同一性比較が成立する。
// オンライン対戦: 自席(mySeat)以外の操作は無効化し、確定した操作は uiDispatch でDO経由の
// エコースルー適用にする（オフラインは従来どおり即時のエンジン直呼び＝挙動不変）。
import type { EngineAPI } from './bootstrap';
import type { Card, PickState, PromptState, Side } from './types';
import { IMG } from './img';
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { uiDispatch } from '../net/dispatch';

export type CardCtx = 'board' | 'hand' | 'life' | 'don';
export type Highlight =
  | 'selectable' | 'danger' | 'targetable' | 'attacker' | 'atk-active' | 'atk-target' | 'playable' | 'unplayable' | 'actable';

export interface CardBehavior {
  highlight?: Highlight;
  onClick?: () => void;
  clickable: boolean;
}

export function resolveCardClick(
  engine: EngineAPI,
  pick: PickState | null,
  prompt: PromptState | null,
  card: Card,
  ctx: CardCtx,
): CardBehavior {
  const G = engine.G;
  const net = useNetStore.getState();
  const mySeat: Side = net.mySeat;
  const online = net.mode === 'online';
  const none: CardBehavior = { clickable: false };

  // 1. humanPick 選択中（pick.uids に含まれるカードのみ選択可）。相手席の選択（オンライン）は触れない。
  if (pick) {
    if (online && pick.side && pick.side !== mySeat) return none;
    if (pick.uids.has(card.uid)) {
      const choose = () => {
        if (online) { void uiDispatch({ t: 'prompt', v: 'pick:' + card.uid }); }
        else pick.resolve(card);
      };
      return { highlight: pick.danger ? 'danger' : 'selectable', onClick: choose, clickable: true };
    }
    return none; // 選択中は他カード無視
  }
  // 2. モーダル表示中は盤面クリック無視
  if (prompt) return none;

  // 3. アタック対象選択中（自席の手番のみ操作可。オンラインでは attackSel が両クライアントに立つ）
  if (G.attackSel) {
    if (G.active !== mySeat) return none;
    const atk = G.attackSel.attacker;
    // 選択中の攻撃役は 'attacker'（.felt.selecting の減光除外＋金ハイライト）。atk-active は攻撃アニメ用で別物。
    if (card === atk) {
      const cancel = () => { if (online) { void uiDispatch({ t: 'cancelAtk' }); } else engine.cancelAttackSel(); };
      return { highlight: 'attacker', onClick: cancel, clickable: true };
    }
    try {
      if (engine.legalTargets(mySeat, atk).includes(card)) {
        const attack = () => {
          if (online) { void uiDispatch({ t: 'attack', auid: atk.uid, tuid: card.uid }); }
          else void engine.declareAttack(atk, card);
        };
        return { highlight: 'targetable', onClick: attack, clickable: true };
      }
    } catch { /* ignore */ }
    return none;
  }

  // 4. 自分メイン（操作可能時）。オンラインは echo 待ち（sending）中の追加操作をロック。
  if (G.active === mySeat && G.myActable && !G.busy && !(online && net.sending)) {
    const me = G.players[mySeat];
    if (ctx === 'hand' && me.hand.includes(card)) {
      const ok = safe(() => engine.handPlayable(card));
      // 出せる手札=playable(緑グロー)/出せない=unplayable(グレーアウト)。元 handHTML と同じ事前アフォーダンス。
      // 誤タップ救済: 1タップ即確定にせず、カード画像付きの確認を挟んでから tryPlayHand。
      return ok
        ? { highlight: 'playable', onClick: () => { void runExclusive(engine, mySeat, online, () => confirmPlayHand(engine, card, mySeat, online)); }, clickable: true }
        : { highlight: 'unplayable', clickable: false };
    }
    if (card === me.leader || me.chars.includes(card) || card === me.stage) {
      const canAtk = safe(() => engine.canCardAttack(card));
      const canDon = (me.don?.active || 0) >= 1 && card.base.type !== 'STAGE';
      const hasAct = !!(card.base.fx && card.base.fx.act);
      const usable = canAtk || canDon || hasAct;
      const openMenu = () => {
        if (online) { void uiDispatch({ t: 'menu', uid: card.uid }); }
        else void runExclusive(engine, mySeat, online, () => engine.openOwnMenu(card));
      };
      // 'actable'（.card.actable に legal-glow あり）。'usable' は doncard 専用でカードには効かない。
      return { highlight: usable ? 'actable' : undefined, onClick: openMenu, clickable: true };
    }
  }
  return none;
}

function safe(fn: () => any): boolean {
  try { return !!fn(); } catch { return false; }
}

// ユーザー発フロー（手札プレイ/所有カードメニュー）の直列化。
// エンジンは演出 sleep 中も G.busy=false のままなので、その窓で「ターン終了」確認や別フローが
// 開くとプロンプト同士が競合し得る（レビュー所見）。フロー全体を busy=true で覆い、
// ターン終了ボタン（!G.busy 条件）や他カードの操作を効果チェーン完了まで封じる。
// 効果内の対象選択（pick/prompt）は busy と無関係に操作できるため進行は妨げない。
// オンライン時は G.busy を使わず（echo適用のポンプ条件を塞がないため）、sending ロックに任せる。
async function runExclusive(engine: EngineAPI, seat: Side, online: boolean, fn: () => Promise<void>): Promise<void> {
  const G = engine.G;
  if (G.busy || G.active !== seat || !G.myActable || G.promptState || G.pendingChoice) return;
  if (online) {
    try { await fn(); } catch { /* エンジン側で処理済み */ }
    return;
  }
  G.busy = true;
  try { await fn(); }
  catch { /* エンジン側で処理済み */ }
  finally {
    G.busy = false;
    useEngineStore.getState().bump(); // busy解除を即描画（ターン終了ボタン復帰）
  }
}

// 手札プレイの確認ゲート（誤タップ救済）。engine.confirmUse＝adapter showPrompt 経由なので
// モーダル表示中は盤面クリックが既存ガードで無効化され、二重実行は起きない。
// この確認はローカル専用（local:true）＝オンラインでも相手へは中継しない。
async function confirmPlayHand(engine: EngineAPI, card: Card, seat: Side, online: boolean): Promise<void> {
  const G = engine.G;
  if (G.active !== seat || !G.myActable || G.promptState || G.pendingChoice || G.attackSel) return;
  const b = card.base;
  let cost = b.cost || 0;
  try { const v = engine.effCost(seat, card); if (typeof v === 'number') cost = v; } catch { /* ignore */ }
  const verb = b.type === 'EVENT' ? '使用する' : b.type === 'STAGE' ? '配置する' : '登場させる';
  const img = '<img class="pp-card" src="' + IMG(b.no) + '" referrerpolicy="no-referrer" alt="">';
  const stat = 'コスト' + cost + (b.type === 'CHAR' && b.power != null ? '／パワー' + b.power : '');
  const yes = (cost > 0 ? `ドン!!${cost}枚で` : '') + verb;
  const ok = await engine.confirmUse(seat, `『${b.name}』を${verb.replace(/する$|させる$/, '')}`, `${img}<span class="pp-hint">${stat}</span>`, yes, 'やめる', { local: true });
  // 確認中に状態が変わった場合の保険（tryPlayHand は hand 所属を再検査しないため必須）。
  // G.busy は runExclusive が立てているためここでは見ない。
  if (!ok || !G.players[seat].hand.includes(card) || G.active !== seat || !G.myActable) return;
  if (online) { await uiDispatch({ t: 'play', uid: card.uid }); return; }
  try { await engine.tryPlayHand(card); } catch { /* エンジン側で toast 済み */ }
}

// アタック演出のグロー（G._atkFrom / _atkTo）。クリックとは独立に重ねる。
export function atkGlow(engine: EngineAPI, card: Card): 'atk-active' | 'atk-target' | undefined {
  const G = engine.G;
  if (G._atkFrom === card.uid) return 'atk-active';
  if (G._atkTo === card.uid) return 'atk-target';
  return undefined;
}
