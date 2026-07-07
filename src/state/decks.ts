// デッキのクラウド保存の橋渡し。エンジンの builderValidate/builderToDeck を再利用して
// サーバ(D1)のデッキと engine.G.customDecks を整合させる。
import { api, type SavedDeck } from '../api/client';
import type { EngineAPI } from '../engine/bootstrap';

// SavedDeck(サーバ) → engine の customDeck 形（colors/tier 等つき・id はサーバ発行を維持）
export function toCustomDeck(engine: EngineAPI, d: SavedDeck): any {
  try {
    const deck = engine.builderToDeck({ leaderNo: d.leader, list: d.list, name: d.name }, d.id);
    deck.cloud = true;
    return deck;
  } catch {
    const colors = (engine.C[d.leader] && engine.C[d.leader].color) || [];
    return { id: d.id, name: d.name, leader: d.leader, list: d.list, colors, tier: 'CUSTOM', usage: '保存', style: 'カスタム', accuracy: 'high', desc: '保存したデッキ', custom: true, cloud: true };
  }
}

// ログイン時: クラウドのデッキを customDecks に反映（cloud 既存分は入れ替え）
export async function loadCloudDecks(engine: EngineAPI): Promise<void> {
  const { decks } = await api.listDecks();
  const G = engine.G;
  G.customDecks = (G.customDecks || []).filter((x: any) => !x.cloud);
  for (const d of decks) G.customDecks.push(toCustomDeck(engine, d));
}

// JSONインポート → エンジン検証 → クラウド保存 → customDecks へ追加
export async function importAndSaveDeck(engine: EngineAPI, data: any): Promise<{ ok: boolean; error?: string; deck?: any }> {
  if (!data || !data.leader || !data.list) return { ok: false, error: 'デッキ形式が不正です' };
  const C = engine.C;
  if (!C[data.leader] || !C[data.leader].leader) return { ok: false, error: 'リーダー不明: ' + data.leader };
  for (const no of Object.keys(data.list)) if (!C[no]) return { ok: false, error: '未対応カード: ' + no };
  const b: any = { leaderNo: data.leader, list: {} as Record<string, number>, name: (data.name || 'インポートデッキ') };
  for (const [no, n] of Object.entries(data.list)) b.list[no] = (n as number) | 0;
  try {
    const v = engine.builderValidate(b);
    if (v && v.ok === false) return { ok: false, error: (v.errors && v.errors[0]) || '不正なデッキ' };
  } catch { /* validate不在ならサーバ検証に委ねる */ }
  let saved: SavedDeck;
  try {
    const r = await api.createDeck({ name: b.name, leader: b.leaderNo, list: b.list });
    saved = r.deck;
  } catch (e: any) {
    return { ok: false, error: '保存に失敗しました（' + (e?.error || 'error') + '）' };
  }
  const deck = toCustomDeck(engine, saved);
  engine.G.customDecks = engine.G.customDecks || [];
  engine.G.customDecks.push(deck);
  return { ok: true, deck };
}

// デッキビルダーで組んだデッキをエンジン検証→クラウド保存→customDecks へ。
// overwriteId 指定時は既存デッキの上書き（PUT）。customDecks 内の同 id を差し替える。
export async function saveBuilderDeck(
  engine: EngineAPI,
  b: { leaderNo: string; list: Record<string, number>; name: string },
  overwriteId?: string,
): Promise<{ ok: boolean; error?: string; deck?: any }> {
  try {
    const v = engine.builderValidate(b);
    if (v && v.ok === false) return { ok: false, error: (v.errors && v.errors[0]) || '不正なデッキ' };
  } catch { /* validate不在ならサーバ検証に委ねる */ }
  let saved: SavedDeck;
  const payload = { name: b.name || 'マイデッキ', leader: b.leaderNo, list: b.list };
  try {
    const r = overwriteId ? await api.updateDeck(overwriteId, payload) : await api.createDeck(payload);
    saved = r.deck;
  } catch (e: any) {
    return { ok: false, error: '保存に失敗しました（' + (e?.error || 'error') + '）' };
  }
  const deck = toCustomDeck(engine, saved);
  engine.G.customDecks = engine.G.customDecks || [];
  if (overwriteId) {
    const i = engine.G.customDecks.findIndex((x: any) => x.id === overwriteId);
    if (i >= 0) engine.G.customDecks[i] = deck; else engine.G.customDecks.push(deck);
  } else {
    engine.G.customDecks.push(deck);
  }
  return { ok: true, deck };
}

export async function deleteCloudDeck(engine: EngineAPI, id: string): Promise<void> {
  try { await api.deleteDeck(id); } catch { /* ignore（ローカルからは消す） */ }
  const G = engine.G;
  G.customDecks = (G.customDecks || []).filter((x: any) => x.id !== id);
  if (G.sel && G.sel.me === id) G.sel.me = undefined;
  if (G.sel && G.sel.cpu === id) G.sel.cpu = undefined;
}
