import { create } from 'zustand';
import { createEngine, type EngineAPI } from '../engine/bootstrap';
import { makeReactAdapter } from '../engine/reactAdapter';
import type { PromptState, PickState, FxEvent, AtkState, EndState, TriggerRevealState, Card, Side, Deck } from '../engine/types';

interface EngineStore {
  engine: EngineAPI | null;
  version: number; // render フックのたびに++（唯一の再描画トリガ）
  prompt: PromptState | null;
  promptPeek: boolean; // 防御選択を保留してプロンプトを退避し盤面を見ている状態
  pick: PickState | null;
  fxQueue: FxEvent[];
  atk: AtkState | null;
  trigger: TriggerRevealState | null; // ライフ公開トリガーの大写し演出
  lethal: Side | null; // リーサル（トドメ）カットイン表示中（値=とどめを刺された側）
  end: EndState | null;
  thinking: boolean;
  muted: boolean; // 効果音(SE)ミュート
  bgmOn: boolean; // BGM再生ON/OFF（SEとは独立）
  bgmVolume: number; // BGM音量 0..1
  bgmTrack: 'random' | 'adventure' | 'battle' | 'casual' | 'wafu'; // 曲選択（randomは対戦ごとに抽選）
  hover: Card | null; // ホバー中のカード（効果プレビュー用。専用スライス＝盤面は再描画しない）
  builderOpen: boolean; // デッキ作成画面の表示
  builderDeck: Deck | null; // ビルダーの初期値に使うデッキ（編集/コピー元。新規作成時は null）
  zoomCard: { no: string; name: string } | null; // カード大写し（長押し=盤面/選択肢、タップ=マリガン）
  trashModal: Side | null; // トラッシュ閲覧モーダル
  logs: Array<{ cls: string; html: string }>;
  bump: () => void;
  setHover: (c: Card | null) => void;
  setBuilderOpen: (b: boolean, deck?: Deck | null) => void;
  setZoomCard: (z: { no: string; name: string } | null) => void;
  setTrashModal: (s: Side | null) => void;
  setPrompt: (p: PromptState | null) => void;
  setPromptPeek: (b: boolean) => void;
  setPick: (p: PickState | null) => void;
  pushFx: (e: FxEvent) => void;
  removeFx: (id: number) => void;
  setAtk: (a: AtkState | null) => void;
  setTrigger: (t: TriggerRevealState | null) => void;
  setLethal: (s: Side | null) => void;
  setEnd: (e: EndState | null) => void;
  setThinking: (on: boolean) => void;
  setMuted: (m: boolean) => void;
  setBgmOn: (on: boolean) => void;
  setBgmVolume: (v: number) => void;
  setBgmTrack: (t: EngineStore['bgmTrack']) => void;
  pushLog: (l: { cls: string; html: string }) => void;
  initEngine: () => EngineAPI;
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  engine: null,
  version: 0,
  prompt: null,
  promptPeek: false,
  pick: null,
  fxQueue: [],
  atk: null,
  trigger: null,
  lethal: null,
  end: null,
  thinking: false,
  muted: false,
  bgmOn: true,
  bgmVolume: 0.4,
  bgmTrack: 'adventure',
  hover: null,
  builderOpen: false,
  builderDeck: null,
  zoomCard: null,
  trashModal: null,
  logs: [],
  bump: () => set((s) => ({ version: s.version + 1 })),
  setHover: (c) => set({ hover: c }),
  setBuilderOpen: (b, deck) => set({ builderOpen: b, builderDeck: b ? (deck ?? null) : null }),
  setZoomCard: (z) => set({ zoomCard: z }),
  setTrashModal: (s) => set({ trashModal: s }),
  setPrompt: (p) => set({ prompt: p, promptPeek: false }), // 新プロンプト/クローズごとに退避状態はリセット
  setPromptPeek: (b) => set({ promptPeek: b }),
  setPick: (p) => set({ pick: p }),
  pushFx: (e) => set((s) => ({ fxQueue: [...s.fxQueue, e] })),
  removeFx: (id) => set((s) => ({ fxQueue: s.fxQueue.filter((f) => f.id !== id) })),
  setAtk: (a) => set({ atk: a }),
  setTrigger: (t) => set({ trigger: t }),
  setLethal: (s) => set({ lethal: s }),
  setEnd: (e) => set({ end: e }),
  setThinking: (on) => set({ thinking: on }),
  setMuted: (m) => set({ muted: m }),
  setBgmOn: (on) => set({ bgmOn: on }),
  setBgmVolume: (v) => set({ bgmVolume: Math.max(0, Math.min(1, v)) }),
  setBgmTrack: (t) => set({ bgmTrack: t }),
  pushLog: (l) => set((s) => ({ logs: [...s.logs.slice(-200), l] })),
  initEngine: () => {
    const existing = get().engine;
    if (existing) return existing;
    const eng = createEngine({ ui: makeReactAdapter(useEngineStore), timers: 'real', aiOn: false });
    set({ engine: eng });
    return eng;
  },
}));
