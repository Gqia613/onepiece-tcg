# CPU強化計画 2026-08-07 — 直近20日の対戦履歴分析より

- 対象データ: 本番D1 `cpu_matches` 全39行（収集開始2026-07-20〜08-06・CPU戦は常に「強いCPU」=puct）／`matches`（オンライン）17行（id9〜25・7/19〜8/5）。
- 結論（3行）:
  1. **cpu_matches の勝敗記録は39行中38行が破損**（CPU探索中の一時 `G.winner` を終局と誤検知）＝対人間勝率という一次KPIが現状測定不能。修理が全ての前提。
  2. 実戦でユーザーが選ぶCPUデッキの **59%（23/39戦）は深い探索（PUCT_DEEP）を貰っていないリーダー**＝E34の実証済みレバー（対h +11.7〜+30pt）の適用漏れが最大の伸びしろ。
  3. プレイ品質の既知最大ギャップは E55 S級3部品（詰め順序/防御割当/再KO）の要再設計のまま。観察素材（未解析オンライン12戦＋CPU戦リプレイ前半）は十分ある。

---

## 1. 発見（ヒントの洗い出し）

### F1【致命・データ基盤】cpu_matches の誤終局記録（38/39行が winner='draw'・reason=null・inputs途中切断）

- **機序（特定済み・再現経路）**:
  1. web の `src/engine/reactAdapter.ts` の UIフックは全て `if (sim()) return;` ガード付きだが、**`log`/`flog`（196-197行）だけガードが無い**。
  2. puct/mcts のロールアウトは実 `G` を書き換えて復元する方式。ロールアウト中もエンジンの `log()` 呼び出しが `engineStore.pushLog` に到達し、**zustand購読が同期発火**する。
  3. ロールアウト内で終局に達すると `lose()` が `G.winner` を設定（`engine/src/30-flow-battle.js:356`。UIは `_sim` で抑止されるが winner は立つ）。直後のバトル解決ログ等の `pushLog` で `cpuRecorder.check()` が走り、**一時的な `G.winner` を実終局と誤検知**。
  4. `rec.done=true` → 300ms後の upload 時には探索が状態復元済みで `G.winner=null`・`end=null` → **winner='draw'・reason=null・turns=誤検知時点の turnSeq** で保存。以降の人間入力は記録されない（inputs切断）。
- **証拠**: 38/39行が draw+reason null（オフラインに引き分けはほぼ存在しない）。id=38 は最終入力=プレイヤーの endTurn の3.3秒後（CPU思考中）にアップロード。唯一正常な id=20 は「人間側の即時リーサル」＝実終局が人間入力の同期処理内で確定したケース（winner='host'・reason='ライフ0で被弾'）。
- **副作用2つ**: ①切断点はターン7〜12＝**終盤（E55で特定済みのCPU最弱局面）の観察素材がちょうど欠落** ②探索1手あたり数千回の `pushLog`（毎回 logs 配列200件コピー）＝**モバイル発熱（E56の①）の隠れ税**。webにログ表示UIは無く純無駄。
- **破損行の復元**: 不能（切断点以降の人間入力が未記録）。前半のプレイ観察素材としては有効。

### F2【適用漏れ】実戦の59%はCPUが浅い探索（det3/look1/width5）で戦っている

- `PUCT_DEPTH`（engine/src/70-ai.js:712-714）の深いプロファイル det9/2/8 は **lucy/ace/nami/hancock/teach の5リーダーのみ**。enel は mcts 直行。それ以外は標準 det3/1/5。
- 直近20日のCPU側リーダー実測分布（39戦）:
  - 浅い既定 **23戦(59%)**: 赤緑ルフィOP13-001×5・緑ミホークOP14-020×4・青緑ルフィOP16-022×4・黄キッドOP10-099×4・青クザンOP12-040×3・黒ヤマトOP16-079×2・イムOP13-079×1
  - 深い **13戦(33%)**: teach×5・nami×3・ace×2・hancock×2・lucy×1
  - mcts（enel）**3戦(8%)**
- E34の深さスケーリングは5リーダーで対h +11.7〜+30.0pt の最大級レバー。**後から増えたプリセット（mihawk=E53・yamato=E48・luffygb・kuzan）に深さテーブルが追随していない**のが原因。per-leader 測定で拡張する（enel の教訓＝深さが中立/有害なリーダーもあり得るため一律適用はしない）。
- モバイル実効値: 37/39戦が `puctCap={det:6,width:6}`（タッチ端末）。採用判定には cap 後（6/2/6）の帯も1本入れる。

### F3【プレイ品質・既知最大ギャップ】E55 S級3部品が要再設計のまま

- 7/19リプレイ研究で特定した人間（tikumaru）の勝ち型＝「カウンター経済」（防御の手札消費最小化・攻めは相手のカウンター要求量で設計・詰めターンの攻撃順序と残ドン一括投入）のうち、核心の3部品が初期形で退行し不採用: **order**（詰め上乗せ順序 Σ-9.2pt）／**alloc**（ターン列防御割当 Σ-8.3pt）／**reko**（再KOチェック Σ-3.3pt）。
- 台帳の学び（再設計の初期条件）: order は「中間打点がブロッカーを倒せる素の強さ」ゲートが必要／alloc は相手次ターン打点予測と結合必須／reko は「防衛コスト2枚以上のみskip」に限定。

### F4【未使用の観察データ】オンライン12戦＋CPU戦リプレイ前半39件

- オンライン id14〜25 が未解析。特に **michiru が tikumaru に勝った4戦（id14,15,20,21）**＝「最強プレイヤーの倒し方」と、紫カタクリ（OP11-062）対面のシリーズ。既存 `scripts/replay-dump.ts`＋当日コミット worktree で今すぐ解析可能。
- CPU戦リプレイは切断されていても前半7〜12ターン分の「人間の対CPU実プレイ」39件。**CPU戦用リプレイ再生ツールは未実装**（メモリ済み: agent設定はマリガン後・`puctCap` 同値設定・ver worktree 必須）。17行が ver=2dfc4ab76e（直近ビルド）で低コスト。

### F5【測定対面のズレ】このグループの実利用メタと測定バンドが不一致

- 人間側リーダー: **黒ヤマトが26/39戦(67%)**（tikumaru主戦）。他: 黄キッド3・赤緑ルフィ3・紫カタクリ3。オンラインでは 青緑ルフィ（michiru主戦）・紫カタクリ・クザン。
- 現在の標準測定は teach↔enel＋mihawk↔luffygb 中心。**「対ヤマト」「対青緑ルフィ」帯を標準に追加**し、採用判定に実利用対面の非退行を含める。赤緑ルフィ/黄キッドはプリセットが無い＝リプレイ埋め込みのデッキリスト or tools/user-decks.json を使う。
- プレイヤー内訳: tikumaru 36戦・michiru 2・ZERO 1（CPU戦）。ヘビーユーザーの主戦対面から強化するのが体感に直結。

---

## 2. 改善計画

### Phase 0 — データ基盤の修理（最優先・小・即実施可）

1. `reactAdapter.ts` の `log`/`flog` に `if (sim()) return;`（各1行）。
2. `cpuRecorder.ts` の終局検知を作り直し: トリガを「store の `end` がセットされた瞬間」（`showEndScreen` 由来＝`lose()` が `_sim` 中は到達させない安全信号）に変更。**検知時点で** winner/reason を確定して upload（300ms遅延で再読みしない）。保険で `G._sim` 中は無視・`winner∈{me,cpu}` 以外は送信しない。中断破棄（`!G.inGame`）は現行維持。
3. 回帰テスト（vitest）: ①`_sim` 中の一時 winner＋pushLog で upload されない ②実終局で1回だけ正しい winner/reason/turns/inputs が送られる。
4. 検証チェーン: web変更のみ＝`npm test`/`npm run build` → push → 本番反映検証（opcg-deploy手順）。
- 受入基準: 以後の cpu_matches に draw が原則出ない・reason が入る・inputs が終局まで届く。
- 期待副次効果: 探索中 pushLog 消滅＝モバイル発熱の追加軽減（E56①の残り）。

### Phase 1 — 探索深さの適用漏れ解消（E60候補・費用小・期待大）

- 対象（実利用順）: 赤緑ルフィ(OP13-001)→ミホーク(`_OP14-020`)→青緑ルフィ(`_OP16-022`)→黄キッド(`_OP10-099`)→クザン(`_OP12-040`)→ヤマト(`_OP16-079`)。イム/その他は保留。
- プロトコル（E34踏襲）: `tools/puct-depth-probe.js`＋`measure-matchup` で per-leader に det3/1/5→6/2/6→9/2/8 をミラー＋対hで同一seedペアN=120×2帯・符号検定。**採用は per-leader に `PUCT_DEPTH` へキー追加**（番号キー形式）。cap後（6/2/6）帯も1本。非プリセットリーダーはリプレイ埋め込みリスト/user-decks.json でデッキ供給。
- 注意: 探索が有害なリーダー（enel型）の検出を兼ねる＝全段フリップ0や負符号なら不採用（mcts/heuristic維持）。

### Phase 2 — 観察→heuristic修正の再開（実証済み唯一の品質ルート）

- 2a. **リプレイ研究第2弾**（オンライン id14〜25）: michiru の対tikumaru 4勝の勝ち筋・紫カタクリ対面。産物は E55 同様の候補リスト（`replay-study-20260807.md`）。
- 2b. **CPU戦リプレイ再生ツール**を新規作成（scripts/cpu-replay-dump.ts 想定）: ver worktree・マリガン後 agent 設定・`puctCap` 再現。まず ver=2dfc4ab76e の17戦で「CPUの変な手」を列挙 → Phase 0 後は完全リプレイが対象に。
- 2c. **E55 S級の再設計**（order2/alloc2/reko2）: 台帳の学びをゲート初期形に織り込み、E55と同じ単離測定（heur2+OPCG_H2・2帯）。
- 2d. 観察メモ運用（current-status 候補1）: `engine/docs/pm/observations.md` を作り、プレイ中の「CPUの変な手」を1行メモ→毎セッション仮説化。

### Phase 3 — 測定対面の現代化（運用変更・恒常）

- measure の標準バンドに「対ヤマト」「対青緑ルフィ」を追加。以後の採用判定は従来帯＋実利用対面の非退行で行う。`tools/user-decks.json` を最新スナップショットに更新。

### Phase 4 — 継続運用（Phase 0 のデータが貯まったら）

- 正しい cpu_matches が30〜50戦貯まった時点で、リーダー別・対人間勝率の定点クエリを整備（SQL1本）。弱い対面から Phase 2 ループへ投入。
- 任意: 中断（現在は破棄）を「abort フラグ付き記録」に変更すると、勝ち確詰みでの離脱＝実質敗北も観測可能（優先度低）。

### KPI

- 一次: **対人間勝率（cpu_matches・リーダー別）**。現状は測定不能→ Phase 0 完了で測定可能化が第一マイルストーン。参考の現状値は「唯一の正常記録=人間勝ち1件」のみ。
- 二次: measure の対実利用対面ポイント（Phase 1/2 の採用判定値）。

### リスク・不変条件

- Phase 0 は web のみ（エンジン不変・sync 不要・ロックステップ非干渉。オンラインは両席人間＝探索が走らないため matches は元々無傷）。
- Phase 1 はエンジン変更＝ `cd engine && node tests/test.js` → `node scripts/sync-engine.mjs` → web `npm test`/`npm run build` の全チェーン必須。`PUCT_DEPTH` は CPU 専用（isCPU 経路）で `_HASH_SKIP` 影響なし。
- 実験は全て opt-in フラグ・部品単離・2seed帯・per-leader 採用（掟どおり）。

---

## 付録: 集計（2026-08-07 取得）

- cpu_matches 39戦（7/20〜8/6）: プレイヤー側リーダー = ヤマト26・キッド3・赤緑ルフィ3・紫カタクリ3・他4。プレイヤー = tikumaru 36・michiru 2・ZERO 1。puctCap（モバイル）37/39。
- オンライン17戦（7/19〜8/5）: 7/19 tikumaru 5-0 michiru（E55研究済み）／7/20 michiru 2-1／7/22 michiru_sub 1-1 michiru／7/24 michiru 2-2 tikumaru／8/1〜8/5 michiru 3-0 ZERO。
- 破損の識別: `winner='draw' AND reason IS NULL` の39行中38行が該当（修理後の行とは reason 有無で区別可能）。
