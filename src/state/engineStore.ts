import { create } from 'zustand';
import { createEngine, type EngineAPI } from '../engine/bootstrap';
import { makeReactAdapter } from '../engine/reactAdapter';
import type { PromptState, PickState, FxEvent, AtkState, EndState, Card, Side, Deck } from '../engine/types';

interface EngineStore {
  engine: EngineAPI | null;
  version: number; // render フックのたびに++（唯一の再描画トリガ）
  prompt: PromptState | null;
  pick: PickState | null;
  fxQueue: FxEvent[];
  atk: AtkState | null;
  end: EndState | null;
  thinking: boolean;
  muted: boolean;
  hover: Card | null; // ホバー中のカード（効果プレビュー用。専用スライス＝盤面は再描画しない）
  builderOpen: boolean; // デッキ作成画面の表示
  builderDeck: Deck | null; // ビルダーの初期値に使うデッキ（編集/コピー元。新規作成時は null）
  cardModal: Card | null; // カード長押し詳細モーダル（タッチ）
  trashModal: Side | null; // トラッシュ閲覧モーダル
  logs: Array<{ cls: string; html: string }>;
  bump: () => void;
  setHover: (c: Card | null) => void;
  setBuilderOpen: (b: boolean, deck?: Deck | null) => void;
  setCardModal: (c: Card | null) => void;
  setTrashModal: (s: Side | null) => void;
  setPrompt: (p: PromptState | null) => void;
  setPick: (p: PickState | null) => void;
  pushFx: (e: FxEvent) => void;
  removeFx: (id: number) => void;
  setAtk: (a: AtkState | null) => void;
  setEnd: (e: EndState | null) => void;
  setThinking: (on: boolean) => void;
  setMuted: (m: boolean) => void;
  pushLog: (l: { cls: string; html: string }) => void;
  initEngine: () => EngineAPI;
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  engine: null,
  version: 0,
  prompt: null,
  pick: null,
  fxQueue: [],
  atk: null,
  end: null,
  thinking: false,
  muted: false,
  hover: null,
  builderOpen: false,
  builderDeck: null,
  cardModal: null,
  trashModal: null,
  logs: [],
  bump: () => set((s) => ({ version: s.version + 1 })),
  setHover: (c) => set({ hover: c }),
  setBuilderOpen: (b, deck) => set({ builderOpen: b, builderDeck: b ? (deck ?? null) : null }),
  setCardModal: (c) => set({ cardModal: c }),
  setTrashModal: (s) => set({ trashModal: s }),
  setPrompt: (p) => set({ prompt: p }),
  setPick: (p) => set({ pick: p }),
  pushFx: (e) => set((s) => ({ fxQueue: [...s.fxQueue, e] })),
  removeFx: (id) => set((s) => ({ fxQueue: s.fxQueue.filter((f) => f.id !== id) })),
  setAtk: (a) => set({ atk: a }),
  setEnd: (e) => set({ end: e }),
  setThinking: (on) => set({ thinking: on }),
  setMuted: (m) => set({ muted: m }),
  pushLog: (l) => set((s) => ({ logs: [...s.logs.slice(-200), l] })),
  initEngine: () => {
    const existing = get().engine;
    if (existing) return existing;
    const eng = createEngine({ ui: makeReactAdapter(useEngineStore), timers: 'real', aiOn: false });
    set({ engine: eng });
    return eng;
  },
}));
