/* src/ai-strategy.js — ハイブリッドAIの「戦略プロファイル」(per-leader)。
   Claude(戦略)が探索(PUCT)に注入する“評価シェイピング/着手優先度/方針”を、リーダー別に凍結したもの。
   ・proxy無しでも恩恵が出る（完全決定的＝measure-matchupのミラーで採否を判定できる）。
   ・毎ターンのLLM呼び出しコストを償却（凍結プロファイルがある時はLLM不要）。
   ・70-ai.js より前に index.html で読み込み、window.AI_STRATEGY を定義（ai-weights/ai-policy と同パターン）。

   形（各フィールドは任意・無ければ既定値で無効化）:
     { byLeader:{ <leaderKey>:{ aggression, donReserve, shape:{ramp,longevity,control,threatQuality,tempo},
                                priorBias:{playChar,event,act,leader}, constrain:{forbidChars,requireKeepDon} } },
       default:{ ...同上... } }
   ・shape の各重みは evalState と同単位（life≈1.3）。0＝そのリーダーは puct と完全一致（無シェイプ）。
   ・byLeader に「測定で有意に勝ったプロファイルだけ」を入れる（measure-matchup ミラー＋符号検定でゲート）。
     未掲載のリーダーは default(=無シェイプ) ＝ puct そのまま。enel はフォールバック(heuristic)が基準なので、
     enel プロファイルは「heuristic を有意に超えた時だけ」掲載する。

   ★現状: 全リーダー未掲載（byLeader空）＝ hybridoff は puct と完全一致。
     候補プロファイルは tools の測定で採否を決め、勝った分だけここに追記していく（docs/ai-design.md に記録）。 */
window.AI_STRATEGY = {
  byLeader: {
    // ★現状は空＝hybridoffはpuctと完全一致（決定的にバイト不変を確認済）。掲載は「ミラーで有意に勝った」プロファイルのみ。
    // 【enel測定メモ・2026-06】静的プロファイル(donReserve/shape)を2案試行:
    //   ・enelミラー: 2案とも対h -8.3pt(3/5,p=0.73)＝差動特徴が対称で相殺しシェイプがほぼ無効(=depth6 puct相当)。
    //   ・enel vs teach(非対称): band1 +16.7pt(5/1) / band2 -4.2pt(4/5)＝N=24のノイズ域で再現せず(合算≈+6pt非有意)。
    //   結論: 静的シェイピングでenelは有意に直らない(docsの既定結論を追認)。enelはheuristicフォールバック維持(安全)。
    //   ※「マッチアップ依存で効く」兆候はある→静的1ベクトルでなくPhase2(liveのper-matchup Claude)が本筋。
    // 例:  enel: { aggression:'low', donReserve:3, shape:{ramp:0.2,longevity:0.1,control:0.2,threatQuality:0.1,tempo:0}, priorBias:{leader:1.6,act:1.2,event:1.2,playChar:1} }
  },
  default: { aggression: null, donReserve: 0,
    shape: { ramp: 0, longevity: 0, control: 0, threatQuality: 0, tempo: 0 },
    priorBias: { playChar: 1, event: 1, act: 1, leader: 1 } }
};

/* ===== E39: DECK_PLANS — デッキプラン駆動の「サーチ先最適化」＋「捨て札保護」 =====
   探索(puct)も priorityCards も構造的に届かない op解決層（search/searchDeck の対象選択・
   chooseFromHand の捨て札順）に、デッキの勝ち筋データを注入する。evalState/cpuPickAttack には一切触れない。
   ・opt-in: G.players[side].usePlan が truthy の時だけ有効（AGENTS.planh/planpuct が設定）。未設定なら既定挙動とバイト等価。
   ・完全フェア: 入力は自陣の完全観測情報（hand/chars/trash/don/turnsTaken）のみ。決定化サンプル値は読まない。
   ・スキーマ（byLeader[leaderKey]）:
       wants:  [{ no|name|{type,trait,minCost,maxCost}, w:基本重み, max:手札+盤面の飽和枚数, minTurn:このターン以降のみ }]
       combos: [{ id, payoff, pieces:[{no|..., zone:'hand'(既定)|'board'|'trash'}] }]  … 不足ピースほど強く欲しい
       holds:  [{ no|..., keep:保護する枚数(既定1) }]  … 捨て札候補の最後尾へ（コンボパーツをカウンター代わりに切らない）
   ・採否は measure-matchup（planh vs heuristic・ミラーN=120・合算flip符号検定）。有意リーダーのみ掲載する。
   ・注意: heuristicTurn は手札の STAGE をプレイしない（既知の構造穴）ため、planh 用 wants に STAGE を入れないこと
     （byPow はパワー0のSTAGEを取らない＝入れると「使えない札を取る」確実な劣化。puct系プランで解禁を検討）。 */
window.DECK_PLANS = {
  byLeader: {
    /* ★lucy: 不掲載（E39で2案とも退行）。v1(イベントwant+捨て札保護)=ミラーN=120で-10.8pt(p=0.002★)、
       v2(ボディ+サボコンボのみ)=-4.2pt(改善1/退行6)。教訓: heuristicはイベントを人間のように換金できない
       (lucyCounter上限2/イベントプレイはゲート付き)ため「イベントを取る」はボディテンポの喪失。byPow(パワー貪欲)は
       heuristicTurnの実行能力と既に噛み合っており、サーチ差し替えの余地がlucyには無かった。 */
    /* 黒黄ティーチ: サーチプール45/50と広くbyPowでも大型ティーチは取れる。差分は「ゼハハ(ドン10バースト・byPowは
       絶対取らないEVENT)をティーチと揃える」コンボ確保と、その2枚を捨て札から守ること。
       ※E39測定は中立(+0.8pt)＝wants/combos/holdsはopt-in(usePlan)のまま。
       ※E47追記: deep-research(docs/deck-lines.md)ではゼハハは「確立された型」として日本語ソースで確認できず、
         実際の幹は「6シリュウのライフ仕込み」と「10ドン帯の10cティーチ連打」だった。linesはそちらを採用。 */
    teach: {
      wants: [
        { no: 'OP16-116', w: 2, max: 2, minTurn: 4 },              // ゼハハ(ドン10: 手札ティーチ登場+相手ライフ奪取)
        { type: 'CHAR', trait: '黒ひげ海賊団', minCost: 8, w: 1, max: 2 },  // ティーチ本体(OP16-119/OP09-093=ゼハハの弾)
      ],
      combos: [
        { id: 'zehaha-burst', payoff: 8,
          pieces: [{ no: 'OP16-116' }, { type: 'CHAR', trait: '黒ひげ海賊団', minCost: 8 }] },
      ],
      holds: [
        { no: 'OP16-116', keep: 1 },
        { type: 'CHAR', trait: '黒ひげ海賊団', minCost: 8, keep: 1 },
      ],
      // ★E47 lines（AGENTS.lineh 専用・強制実行しない=ロールアウト評価がMARGIN超の時だけ実行。出典 docs/deck-lines.md）
      lines: [
        { id: 'shiryu-stack', don: [6, 99],                        // 6シリュウ登場→(登場時効果)トラッシュのシリュウをライフ上へ=「一番強い動き」
          need: { hand: [{ no: 'OP16-108' }], trash: [{ no: 'OP16-108' }], handMin: 2 },
          seq: [{ k: 'char', no: 'OP16-108' }] },
        { id: 'teach10-chain', don: [10, 99],                      // 10ドン帯=10cティーチ連打(起動の無効+12000ブロッカーで2アタック止め)
          need: { hand: [{ no: 'OP09-093' }] },
          seq: [{ k: 'char', no: 'OP09-093' }] },
      ],
    },
    /* 黒ヤマト(E48・linesのみ・ユーザー観察由来): リーダー効果=トラッシュからのワノ国登場に【速攻】。
       定石はコスト順プレイと乖離（P0の5cモモの助をscoreCharは最低評価→ミラー30局で9cモモ登場0.03回/側＝コンボ完全不発を実測）。
       幹: ①5cモモ+しのぶ(+20)→起動→トラッシュの9cモモ登場(速攻・登場時さらに6c以下ワノ国蘇生)
           ②6cヤマト→即起動(自壊)→トラッシュの8cヤマト登場(速攻)。8c/9cを先に捨てるのは既存ハードコードが担当。 */
    '_OP16-079': {   // 黒ヤマト（非curatedリーダーは番号キー: leaderKeyOf(side)が '_OP16-079' を返す）
      lines: [
        /* ★E49b実験(exp:1): deep-research裏付けの「5段チェーン」＝9cモモの登場時効果で6cヤマトを蘇生(steering)→即自壊→
           8cヤマトまで連鎖(7ドンでアタック3回増・8000+6000残存・yuyu-tei/PROS進行表で確認)。前提が揃う時だけ照合し、
           揃わない時は下の基本形が照合する（両方照合した時はロールアウト評価が良い方を選ぶ）。 */
        { id: 'momo-chain', exp: 1, don: [7, 99],
          need: { hand: [{ no: 'OP16-084' }, { no: 'OP16-087' }], trash: [{ no: 'OP16-085' }, { no: 'OP16-098' }, { name: 'ヤマト', minCost: 8 }], donTotalMin: 9 },
          pick: ['OP16-098', 'OP16-097'],
          seq: [{ k: 'char', no: 'OP16-084' }, { k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }, { k: 'act', no: 'OP16-098' }] },
        { id: 'momo-chain-standing', exp: 1, don: [2, 99],
          need: { hand: [{ no: 'OP16-087' }], board: [{ no: 'OP16-084' }], trash: [{ no: 'OP16-085' }, { no: 'OP16-098' }, { name: 'ヤマト', minCost: 8 }], donTotalMin: 9 },
          pick: ['OP16-098', 'OP16-097'],
          seq: [{ k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }, { k: 'act', no: 'OP16-098' }] },
        { id: 'enkiri-momo-chain', exp: 1, don: [9, 99],
          need: { hand: [{ no: 'OP16-099' }, { no: 'OP16-087' }], trash: [{ no: 'OP16-084' }, { no: 'OP16-085' }, { no: 'OP16-098' }, { name: 'ヤマト', minCost: 8 }], donTotalMin: 9 },
          pick: ['OP16-084', 'OP16-098', 'OP16-097'],
          seq: [{ k: 'event', no: 'OP16-099' }, { k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }, { k: 'act', no: 'OP16-098' }] },
        { id: 'momo-combo', don: [7, 99],                          // 5cモモ+しのぶ同一ターン: しのぶ自壊で+20→起動条件(コスト20/ドン9)成立→9cモモ(速攻)
          need: { hand: [{ no: 'OP16-084' }, { no: 'OP16-087' }], trash: [{ no: 'OP16-085' }], donTotalMin: 9 },
          seq: [{ k: 'char', no: 'OP16-084' }, { k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }] },
        { id: 'momo-combo-standing', don: [2, 99],                 // 5cモモが既に盤面: しのぶだけ追加で起動
          need: { hand: [{ no: 'OP16-087' }], board: [{ no: 'OP16-084' }], trash: [{ no: 'OP16-085' }], donTotalMin: 9 },
          seq: [{ k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }] },
        /* ★E51(rec:1・測定中): 097の回収先をソース推奨どおり「しのぶ→5モモ」に修正した変種（ユーザー指摘）。
           E49bの098回収優先は単一ソース(2-1票)のラインC解釈で、高確度(3-0×2)の推奨「回収先=2しのぶor5もものすけの
           多く見えている方」を上書きしていた誤り。st.pick=ステップ別steering（縁切り=098蘇生と回収=しのぶを両立）。 */
        /* v2: pickR=回収(trashToHand)専用steering。v1(回収した しのぶを同ターンに空撃ち登場)は2帯-4.2ptの交絡実装だった。
           v2は「しのぶを回収して温存」(コスト2以下登場のステップには087を含めない=牛マル/お玉が出る)。回収の最終フォールバックは098(ループ弾)。 */
        { id: 'yamato-revive-rec', rec: 1, don: [6, 99],
          need: { hand: [{ no: 'OP16-098' }], trash: [{ name: 'ヤマト', minCost: 8 }] },
          pick: ['OP16-097'], pickR: ['OP16-087', 'OP16-084', 'OP16-098'],
          seq: [{ k: 'char', no: 'OP16-098' }, { k: 'act', no: 'OP16-098' }] },
        { id: 'enkiri-yamato-rec', rec: 1, don: [7, 99],
          need: { hand: [{ no: 'OP16-099' }], trash: [{ no: 'OP16-098' }, { name: 'ヤマト', minCost: 8 }] },
          pick: ['OP16-098'], pickR: ['OP16-087', 'OP16-084', 'OP16-098'],
          seq: [{ k: 'event', no: 'OP16-099' }, { k: 'act', no: 'OP16-098', pick: ['OP16-097'] }] },
        { id: 'yamato-revive', don: [6, 99],                       // 6cヤマト登場→即起動(自壊)→トラッシュの8cヤマトを速攻登場
          need: { hand: [{ no: 'OP16-098' }], trash: [{ name: 'ヤマト', minCost: 8 }] },
          // ★E49b: 蘇生先は回収型097を基本優先(2ソース一致)→097の登場時に自壊直後の098を回収=次ターンの反復(ラインC)へ
          pick: ['OP16-097', 'OP16-098'],
          seq: [{ k: 'char', no: 'OP16-098' }, { k: 'act', no: 'OP16-098' }] },
        /* ★E49採用(2026-07-10・ミラーN=120×2帯 +7.5pt(10/1 p=0.012★)/+9.2pt(11/0 p=0.001★)＝E48比の純上乗せで有意):
           縁切り(OP16-099)＝ドン6レスト→ミル5→トラッシュのコスト6以下ワノ国を蘇生(リーダー効果で速攻)を起点に、
           トラッシュからコンボを組み立てる型(ユーザー指摘「トラッシュの5cモモをイベントで蘇生できる」由来)。
           pick=ライン実行中の蘇生/回収対象steering(G._linePick・既定のパワー最大選択を上書き)。再測定はOPCG_AGENT=lineh2。 */
        { id: 'enkiri-momo', don: [9, 99],                 // 縁切りでトラッシュの5cモモ蘇生→しのぶ(+20)→起動→9cモモ(速攻)
          need: { hand: [{ no: 'OP16-099' }, { no: 'OP16-087' }], trash: [{ no: 'OP16-084' }, { no: 'OP16-085' }], donTotalMin: 9 },
          pick: ['OP16-084'],
          seq: [{ k: 'event', no: 'OP16-099' }, { k: 'char', no: 'OP16-087' }, { k: 'act', no: 'OP16-084' }] },
        { id: 'enkiri-yamato', don: [7, 99],               // 縁切りでトラッシュの6cヤマト蘇生(速攻)→即起動(自壊)→8cヤマトも速攻
          need: { hand: [{ no: 'OP16-099' }], trash: [{ no: 'OP16-098' }, { name: 'ヤマト', minCost: 8 }] },
          pick: ['OP16-098', 'OP16-097'],                  // ★E49b: 蘇生は098→(act)097優先→097登場時に098を回収=反復ループ
          seq: [{ k: 'event', no: 'OP16-099' }, { k: 'act', no: 'OP16-098' }] },
        { id: 'yamato97-shinobu', don: [8, 99],            // 8cヤマト(回収型)でトラッシュのしのぶ回収→コスト2以下登場→+20→盤面の5cモモ起動→9cモモ
          need: { hand: [{ no: 'OP16-097' }], trash: [{ no: 'OP16-087' }, { no: 'OP16-085' }], board: [{ no: 'OP16-084' }], donTotalMin: 9 },
          pick: ['OP16-087'],
          seq: [{ k: 'char', no: 'OP16-097' }, { k: 'act', no: 'OP16-084' }] },
      ],
      // ★E50(ユーザー観察): しのぶはコンボ専用パーツ＝汎用展開で素出ししない（モモの助不在では自壊効果が空撃ち・
      //   即除去される・カウンター2000として手札温存が正しい）。正当なプレイは全てライン経由。
      avoid: [{ no: 'OP16-087' }],
    },
    /* 青黄ハンコック(E47・linesのみ): トリガー登場をリーダードローに変換する受けデッキ。
       カーブ「3→5→7→9」とゾンビ型ライフ仕込み・芳香脚リーサルが検証済みの幹（docs/deck-lines.md）。 */
    hancock: {
      lines: [
        { id: 'hancock4-curve', don: [5, 6],                       // 5ドン帯は5ボルサリーノより4cハンコック優先(3→5→7→9の背骨)
          need: { hand: [{ no: 'ST17-004' }] },
          seq: [{ k: 'char', no: 'ST17-004' }] },
        { id: 'namur-zoro', don: [7, 99],                          // ナミュール(draw2→2枚をデッキ上下へ)→4ゾロ(デッキ上1枚をライフへ)のゾンビ仕込み
          need: { hand: [{ no: 'OP08-050' }, { no: 'OP15-113' }], handMin: 3 },
          seq: [{ k: 'char', no: 'OP08-050' }, { k: 'char', no: 'OP15-113' }] },
        { id: 'houkou-lethal', don: [4, 99],                       // 詰め: 相手ライフ<=1で芳香脚(+2000&ブロック不可)→リーダーへ
          need: { hand: [{ no: 'OP07-057' }], oppLifeMax: 1 },
          seq: [{ k: 'event', no: 'OP07-057' }] },
      ],
    },
    /* 赤青エース: ST22-015(白ひげイベント)が手札のニューゲートを踏み倒す黄金ルート。byPowはST22-015を絶対取らない。
       5cヤマトはリーダーへのドン付与=リーダードロー(付与ドン>=1が条件)の前提を作る。 */
    ace: {
      wants: [
        { no: 'ST22-015', w: 2, max: 1, minTurn: 4 },              // おれァ"白ひげ"だァ(手札ニューゲート踏み倒し)
        { no: 'OP13-054', w: 2, max: 1 },                          // 5cヤマト(リーダーにレストのドン付与+draw2)
      ],
      combos: [
        { id: 'whitebeard-burst', payoff: 7,
          pieces: [{ no: 'ST22-015' }, { name: 'エドワード・ニューゲート' }] },
      ],
      holds: [
        { name: 'エドワード・ニューゲート', keep: 1 },
        { no: 'ST22-015', keep: 1 },
      ],
    },
  }
};

// プラン取得（opt-inゲート）。usePlan が無い/プラン未掲載なら null＝全フックが既定挙動へフォールバック。
function planFor(side) {
  const P = G.players[side];
  if (!P || !P.usePlan) return null;
  const DP = (typeof window !== 'undefined' && window.DECK_PLANS) || null;
  if (!DP || !DP.byLeader) return null;
  return DP.byLeader[leaderKeyOf(side)] || null;
}
// カード照合の小さなDSL: {no} / {name,type,trait,minCost,maxCost} の複合AND（E48でnameを他条件と複合可能に。name単独指定の既存データは挙動不変）
function planCardMatch(card, ref) {
  if (!card || !card.base || !ref) return false;
  const b = card.base;
  if (ref.no) return b.no === ref.no;
  return (!ref.name || (b.name || '') === ref.name)
    && (!ref.type || b.type === ref.type)
    && (!ref.trait || (b.traits || []).includes(ref.trait))
    && (!ref.minCost || (b.cost || 0) >= ref.minCost)
    && (!ref.maxCost || (b.cost || 0) <= ref.maxCost);
}
// コンボピースの所在チェック（zone: hand既定/board/trash）
function planZoneHas(side, ref) {
  const P = G.players[side];
  const arr = ref.zone === 'board' ? P.chars : ref.zone === 'trash' ? P.trash : P.hand;
  return (arr || []).some(c => planCardMatch(c, ref));
}
// コンボの不足ピースなら加点（「あと1枚」ほど強く欲しい）
function planComboBoost(side, card, plan) {
  let s = 0;
  for (const L of plan.combos || []) {
    const missing = (L.pieces || []).filter(p => !planZoneHas(side, p));
    if (!missing.length) continue;                        // 揃済み→押し上げ不要
    if (missing.some(p => planCardMatch(card, p))) s += (L.payoff || 4) / missing.length;
  }
  return s;
}
/* wantスコア: wants/combosに合致しない札は -Infinity（=プラン示唆なし→byPowへ）。
   合致した札同士は 重複ペナルティ と 次ターンプレイ可能性 で順位付け。 */
function planWantScore(side, card, plan) {
  const P = G.players[side];
  let base = 0;
  for (const k of plan.wants || []) {
    if (!planCardMatch(card, k)) continue;
    if (k.max) {
      const owned = P.hand.filter(c => c.base.no === card.base.no).length
        + P.chars.filter(c => c.base.no === card.base.no).length;
      if (owned >= k.max) continue;                       // 飽和: もう要らない
    }
    if (k.minTurn && P.turnsTaken + 1 < k.minTurn) continue;
    base += (k.w || 1);
  }
  base += planComboBoost(side, card, plan);
  if (base <= 0) return -Infinity;                        // want非合致はプランの示唆対象外
  let s = base - 2 * P.hand.filter(c => c.base.no === card.base.no).length;  // 重複ペナルティ
  const nextDon = Math.min(P.donMax || 10, donTotal(side) + 2);
  if (card.base.type === 'CHAR' && effCost(side, card) <= nextDon) s += 1;   // 次ターン出せる札を優先
  return s;
}
// 純関数（usePlan非依存・planを明示渡し）: 正スコア最大の1枚 or null。tools/plan-diagnose.js の仮想比較にも使う。
function planBestPick(side, cands, plan) {
  let best = null, bs = 0;
  for (const c of cands) {
    const s = planWantScore(side, c, plan);
    if (s > bs + 1e-9) { bs = s; best = c; }
  }
  return best;
}
// サーチ/回収の対象選択エントリ（20-targeting-fx.js の search/searchDeck から呼ばれる）。
// プラン非活性/示唆なし → fallback()（=既定挙動。search=byPow / searchDeck=cands[0]）＝既定パスはバイト等価。
function planPickSearch(side, cands, fallback) {
  const plan = planFor(side);
  if (plan) { const bp = planBestPick(side, cands, plan); if (bp) return bp; }
  return fallback();
}
/* ★E47: コンボライン照合（AGENTS.lineh 専用）。現在の状態で「実行可能なライン」を返す。
   入力は全て自陣公開情報+相手ライフ枚数のみ。usePlanとは独立（linehエージェント自体がopt-in）。 */
function matchDeckLines(side) {
  const P = G.players[side];
  const DP = (typeof window !== 'undefined' && window.DECK_PLANS) || null;
  const plan = DP && DP.byLeader && DP.byLeader[leaderKeyOf(side)];
  if (!plan || !plan.lines) return [];
  const out = [];
  for (const ln of plan.lines) {
    if (ln.exp && !G._lineExp) continue;   // E49: 実験ライン（exp:1）は G._lineExp(AGENTS.lineh2)時のみ。採用時にexpを外して昇格
    if (ln.rec && !G._lineRec) continue;   // E51: 回収優先度v2ライン（rec:1）は G._lineRec(AGENTS.linerec)時のみ。採用時にrecを外して置換
    if (ln.don && (P.don.active < ln.don[0] || P.don.active > ln.don[1])) continue;
    const nd = ln.need || {};
    if (nd.handMin && P.hand.length < nd.handMin) continue;
    if (nd.oppLifeMax != null && G.players[opp(side)].life.length > nd.oppLifeMax) continue;
    if (nd.donTotalMin && donTotal(side) < nd.donTotalMin) continue;   // E48: 「場のドンN枚以上」条件（起動条件と対）
    if (nd.hand && !nd.hand.every(r => P.hand.some(c => planCardMatch(c, r)))) continue;
    if (nd.board && !nd.board.every(r => P.chars.some(c => planCardMatch(c, r)))) continue;   // E48: 盤面前提（既に出ているコンボ土台）
    if (nd.trash && !nd.trash.every(r => P.trash.some(c => planCardMatch(c, r)))) continue;
    if (!(ln.seq || []).every(st => st.k === 'act' || P.hand.some(c => c.base.no === st.no))) continue;
    out.push(ln);
  }
  return out.slice(0, 4);   // 評価コスト上限（1ターンに比較するライン候補は最大4。チェーン変種を先頭に並べ基本形と共存させる）
}
/* ★E50: ライン専用パーツの素出し抑制。plan.avoid に合致するカードは汎用キャラ展開の候補から外す
   （正当なプレイは全てライン(seq)経由=applyAction直呼びでこのフィルタを通らない）。
   ユーザー観察由来: しのぶをモモの助不在で素出し→自壊効果が空撃ち(+20の対象なし)→残っても即除去。
   しのぶはカウンター2000＝手札温存の価値が高い。G._lineAvoid(AGENTS.lineav)ゲート→測定合格で既定化。 */
function planAvoidPlay(side, card) {
  const DP = (typeof window !== 'undefined' && window.DECK_PLANS) || null;
  const plan = DP && DP.byLeader && DP.byLeader[leaderKeyOf(side)];
  if (!plan || !plan.avoid) return false;
  return plan.avoid.some(r => planCardMatch(card, r));
}
// 捨て札保護: plan.holds に合致し、手札の同名枚数が keep 以下なら保護（=捨て札ソートの最後尾へ）。余剰コピーは保護しない。
function planDiscardProtect(side, card) {
  const plan = planFor(side);
  if (!plan || !plan.holds) return 0;
  const P = G.players[side];
  for (const h of plan.holds) {
    if (!planCardMatch(card, h)) continue;
    const copies = P.hand.filter(c => c.base.no === card.base.no).length;
    if (copies <= (h.keep || 1)) return 1;
  }
  return 0;
}
