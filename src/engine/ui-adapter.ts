// エンジンcore が呼ぶ UI フック群のインターフェイス。
// bootstrap が footer で各フックの「関数束縛」をこのアダプタの実装へ再代入する。
// 未指定のフックは原本(40/50)の既定実装（DOMスタブ上で無害）のまま残る。
export interface UIAdapter {
  render?: () => void;
  log?: (cls: string, html: string) => void;
  flog?: (side: 'me' | 'cpu', text: string) => void;
  toast?: (text: string) => void;
  floatOn?: (uid: number, text: string, kind?: string) => void;
  animClass?: (uid: number, cls: string) => void;
  showFxNote?: (side: 'me' | 'cpu', label: string, name: string, no?: string) => void;
  fxNote?: (side: 'me' | 'cpu', label: string, name: string, no?: string) => Promise<void> | void;
  // ライフからトリガーが公開された瞬間の大写し演出。card は engine のカードオブジェクト（base.no/base.name を参照）。
  triggerReveal?: (side: 'me' | 'cpu', card: any) => Promise<void> | void;
  clearTriggerReveal?: () => void;
  showAtkAnnounce?: (aSide: 'me' | 'cpu', attacker: any, target: any) => void;
  clearAtkAnnounce?: () => void;
  showEndScreen?: (win: boolean, reason?: string) => void;
  lethalFx?: (side: any) => Promise<void> | void; // リーサル（トドメ）カットイン。既定はno-op
  showThinking?: (on: boolean) => void;
  sfx?: (name: string) => void;
  // 公開カードの大写し（サーチで手札に加えた／イベント・カウンター発動）。演出専用＝G には触れない。
  cardReveal?: (side: 'me' | 'cpu', no: string, name: string, label: string, kind?: 'hand' | 'event') => void;
  // 盤面演出（元 40-ui-render.js）。実DOM(.felt)へ一時要素を append する fire-and-forget。
  spawnAt?: (uid: number, kind: string) => void;      // burst=KO / slash=斬撃 / ring=登場 / spark=ドン
  drawFly?: (side: 'me' | 'cpu') => void;             // ドロー飛翔
  donFly?: (side: 'me' | 'cpu', uid: number) => void; // ドン付与飛翔
  shakeScreen?: () => void;                            // 画面シェイク
  // モーダル選択。cfg.onPick(value) を呼ぶ or Promise<value> を返すことで解決する。
  showPrompt?: (cfg: PromptConfig) => Promise<any> | any;
  // 盤面ハイライト式の対象選択。Promise<選択カード|null> を返す。side=決定者の席（オンライン対戦）。
  humanPick?: (cands: any[], text: string, optional?: boolean, cls?: string, side?: 'me' | 'cpu') => Promise<any>;
  // ネットワーク（AI proxy 等）。未指定なら reject（AIなし）。
  fetch?: typeof fetch;
  // 計測フック（主にテスト用）。declareAttack 内部呼び出しごとに発火＝全アタックを捕捉。
  onAttack?: (attacker: any, target: any) => void;
}

export interface PromptOption {
  t: string;
  v: any;
  card?: { no: string; sub?: string };
  primary?: boolean;
  ghost?: boolean;
  disabled?: boolean;
}
export interface PromptConfig {
  title?: string;
  text?: string;
  opts?: PromptOption[];
  onPick?: (v: any) => void;
  cls?: string;
  side?: 'me' | 'cpu'; // この選択の決定者の席（エンジンの showPrompt 呼び出し元が付与）
  local?: boolean;     // ローカル専用の確認（オンライン対戦で中継しない）
  reveal?: { no: string; name?: string }; // カード大写しの提示（見る効果。完了/選択まで表示）
}

// ヘッドレス（vitest / CPU自動対戦）用の自動応答アダプタ。
// 既存の tests/cpu-vs-cpu.js / human-fuzz.js の showPrompt 自動応答を踏襲する。
export function headlessAdapter(): UIAdapter {
  const auto = (cfg: PromptConfig) => {
    const o = cfg.opts || [];
    const t = cfg.title || '';
    let v: any;
    if (t.indexOf('マリガン') >= 0) v = false;
    else if (t.indexOf('カウンター') >= 0) v = '__done';
    else if (t.indexOf('トリガー') >= 0) v = true;
    else if (t.indexOf('ブロック') >= 0) v = (o[0] && String(o[0].v).indexOf('blk:') === 0) ? o[0].v : '__skip';
    else if (t.indexOf('ドン!!-') >= 0) v = 'r';
    else if (t.indexOf('ティーチ') >= 0) v = (o[0] && o[0].v) || '__no';
    else if (t.indexOf('ルーシー') >= 0) v = false;
    else {
      const x = o.find((z) => z.primary) || o.find((z) => z.v && String(z.v).indexOf('pick:') === 0) || o[0];
      v = x ? x.v : undefined;
    }
    if (cfg.onPick) cfg.onPick(v);
    return Promise.resolve(v);
  };
  return {
    showPrompt: auto,
    humanPick: (cands: any[]) => Promise.resolve(cands[0] || null),
    // UI演出は全て無視（高速化）。render はバトル進行に不要。
    render: () => {},
    log: () => {},
    flog: () => {},
    toast: () => {},
    floatOn: () => {},
    animClass: () => {},
    showFxNote: () => {},
    fxNote: () => {},
    triggerReveal: () => {},
    clearTriggerReveal: () => {},
    showAtkAnnounce: () => {},
    clearAtkAnnounce: () => {},
    showEndScreen: () => {},
    showThinking: () => {},
    sfx: () => {},
    cardReveal: () => {},
    spawnAt: () => {},
    drawFly: () => {},
    donFly: () => {},
    shakeScreen: () => {},
    fetch: () => Promise.reject(new Error('no-net-in-headless')),
  };
}
