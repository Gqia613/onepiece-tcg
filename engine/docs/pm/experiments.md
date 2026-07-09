# OPCG 実験台帳 — experiments.md

このファイルは OPCG 対戦シミュレーター＆AI実験プロジェクトの**実験ログの正本**。
1実験 = 1レコード。以後の実験は必ずクロージング時にここへ追記する（opcg-pm 運用）。

## 記録規約

- 形式: `## YYYY-MM-DD: タイトル` ＋ 仮説／設定／結果／結論 の4項目。
- **主指標は「固定ベースライン（heuristic＝よく調整された既定CPU）との対戦勝率差」**。
  自己対戦プール内の Elo・学習の loss・検証精度は**参考値**（学習バイアス／「検証精度≠強さ」の実証multiple回あり）。
- 測定の正: `tools/measure-matchup.js`（同一seedペア比較＋符号検定）。N=30単純比較はノイズ±9%で判定不能（E03参照）。
- 仮説のない試行・記録の残らない試行錯誤は台帳に載せない＝やらない。

## この初版について（正直な注記）

- 2026-07-03 に opcg-pm 初回セッションで **git ログ・CLAUDE.md §8・docs/ai-design.md から遡及再構成**した。
- **日付はコミット日（Author date）**。初期の実験は 2026-06-21〜22 に集中してコミットされており、実際の実施日はより分散していた可能性がある。
- 対戦数・p値・設定は上記3ソースに記録された値のみ転記した。記録が見つからない設定値は「不明（コミットhashから追跡可）」と明記。乱数シードは多くのレコードで不明（measure-matchup/arena の既定seed帯とみられる）。
- 詳細な考察の一次資料: `docs/ai-design.md` §3〜§10、`CLAUDE.md` §8。

---

## E01 / 2026-06-21: [基盤] L1 — 前向きモデル＋エージェントseam＋アリーナ
- 仮説: 探索/学習の実験には「clone・seed可能RNG・エージェント差し替え口・再現可能な測定器」が先に要る（これ自体は強さを出さない）。
- 設定: `seedRng`/`rng()`(mulberry32)・`cloneGameState`/`loadGameState`・`AGENTS` seam・`tests/arena.js`（ミラー・席交互・seed固定）。コミット 7df0e3b（squash。個別の試行過程は不明・hashから追跡可）。
- 結果: 健全性確認 heuristic vs random ≒ 82%（+269Elo）、heuristic ミラー ≒ 50%。
- 結論: 土台完成。以後の全実験がこの4点の上に載った。

## E02 / 2026-06-21: L2 決定化MCTS（PIMC・ターン方針探索）
- 仮説: 相手手札を決定化サンプリングして先読みすれば heuristic を超えられる。
- 設定: per-action探索→失敗後、探索単位を「ターンの戦術方針」(aggression∈{high,mid,low}) に変更。既定 rollouts=8/depth=4/margin=0.05。コミット 7df0e3b。対戦数は当時N=30級（詳細不明・hashから追跡可）。
- 結果: per-action は masking で✗（1手差が heuristic 補完で消える。過小展開だと実測 7〜33% に崩壊）。方針探索で当時 +6〜7pt と見えたが、**のちに非決定性バグ（E03）で幻と判明**。決定的再測定では enelミラー+7.5／teachミラー-2.5／teach対enel±0pt ＝ 小さく不安定。
- 結論: 仮説はほぼ棄却。heuristic が既に強く、方針アンカー型MCTSはめったに別手を選ばない。副産物（clone規律・rng隔離・「復元は元オブジェクト参照」の罠）は以後の全探索の基礎になった。

## E03 / 2026-06-21: ★MCTS非決定性バグの発見＋決定的測定基盤（プロジェクト最重要の成果）
- 仮説（発端）: 同一seedなのに測定値が再現しない＝どこかに状態持ち越しがある。
- 設定: 同一プロセス連続対局の調査。コミット 7df0e3b。
- 結果: **前局の投げっぱなし `beginTurn` 連鎖の保留タスクが次局に持ち越して盤面を汚染**。同一seedでも「何局目か」で勝敗が変わり、**それまでの測定値（+10/+6.7/+8pt）が全て信用できなかった**。自己対戦の学習データも水増し汚染（1局 ~28→~73サンプル）。
- 結論: 各局終了後にイベントループをドレイン（`for(k<40) await setImmediate`）で完全決定化。以後の正は `tools/measure-matchup.js`（同一seedペア＋符号検定）。**複数局を回す新ハーネスは必ずドレインを入れる**（再発防止規約）。

## E04 / 2026-06-21: L3 学習eval（ロジ回帰17特徴・リーダー別）
- 仮説: 盤面特徴→勝率のリーダー別ロジスティック回帰を MCTS 葉評価に差せば手作り eval を超える。
- 設定: `tools/selfplay-train.js`。heuristic自己対戦 1800局／12.7万サンプル。特徴17（盤面11＋相手リーダーone-hot6）。コミット 7df0e3b。
- 結果: 検証精度は学習できた（lucy0.73〜0.76／hancock0.84／enel0.78〜0.82／nami0.69〜0.71）。だが end-to-end（決定的測定）で手作り eval と ±0〜2.5pt＝測定限界以下。
- 結論: 棄却。`AI_WEIGHTS=null`（手作りeval）で出荷。**「検証精度≠強さ・アリーナが正」**の初出。

## E05 / 2026-06-21: 特徴量拡張 17→23（❌）
- 仮説: 速攻/ダブルアタック/大型/手札カウンター等を足せば eval が賢くなる。
- 設定: 同一seed直接A/B。コミット 7df0e3b（詳細hashから追跡可）。
- 結果: 検証精度は同等以上なのに end-to-end 悪化（lucy +10pt→0pt・enel→-4pt）。
- 結論: 棄却・17に差し戻し。①リッチな線形evalはheuristic分布に過適合し探索の訪れる別分布で外挿悪化 ②相手手札ベース特徴は決定化ロールアウトでノイズ注入。**特徴はarena確認後に1つずつ**。

## E06 / 2026-06-21: mcts自己対戦データ混合（DAgger 1反復）（❌）
- 仮説: 学習データに mcts の局面分布を混ぜれば eval が強い分布に揃う。
- 設定: heuristic 1200局＋mcts 400局（高速設定 rollouts=3）で再学習。`OPCG_MCTS_GAMES`。
- 結果: lucy +10pt→0pt。val-acc 0.76→0.72。
- 結論: 棄却。データ生成のmctsが弱設定＝「強い分布」になっておらず、評価時の強設定(rollouts=8)と不一致。DAggerをやるなら生成と評価の設定を揃え複数反復（＝計算資源が要る）。

## E07 / 2026-06-21: vlook（価値貪欲方策）（❌）
- 仮説: 各候補手を「打った後の価値」で貪欲に選べば方策になる（policy iteration の Stage A）。
- 設定: `AGENTS.vlook`。決定化で戦闘の隠れ手札を平均・葉=価値。
- 結果: 手作りvalueで -5〜-13pt。学習valueだと更に悪化（teach -27.5pt, p≈0.06）。
- 結論: 棄却。**貪欲 maximization は価値関数の誤差を突いて自滅する**。この型は以後 Stage C 退行・puct2 退行でも繰り返し出現（本プロジェクトの中心的な失敗パターン）。

## E08 / 2026-06-21: heur2ループ① — エネルのリーダー付与先修正（✅採用）
- 仮説: CPUエネルの「レストのドン付与」先が悪い（アタック不可キャラに付与して当ターン死に）＝**ユーザーの対戦観察**。
- 設定: `AGENTS.heur2` A/B（`isHeur2`分岐）→ measure-matchup 全6対面 N=120・同一seedペア。`src/30-flow-battle.js` leaderActivate enel。
- 結果: +2.5〜+9.2pt・合算 改善76/退行32・符号検定 **p<0.0001 ★有意**（対ace単体でも p=0.003）。付与"量"の削減は逆効果（量4のまま・ターゲットのみ修正）。
- 結論: 採用・既定化。**人の観察が最良の仮説源**という本プロジェクト最重要級の学びの初出。

## E09 / 2026-06-21: heur2ループ② — ブロッカー温存の拡張（✅採用・弱い正）
- 仮説: 「自ライフ≤2」以外でも、相手が次ターンリーサル級なら ブロッカーで殴らない方が勝つ（ユーザー観察）。
- 設定: `cpuPickAttack`・`oppCanThreatenLethal`。measure-matchup（N不明・hashから追跡可）。
- 結果: 合算 改善20/退行14・有意な悪化なし・teach対enel +4〜5pt。ミラーは中立。
- 結論: 採用（勝率効果は小だが観察された不合理＝ブロッカー自滅を直し体感改善・害なし）。

## E10 / 2026-06-21: heur2ループ③ — フリーKO優先（✅採用）
- 仮説: ドン不要でレストキャラをKOできるのに2ドン+付与で顔1点を取るのは損（ユーザー観察）。
- 設定: `cpuPickAttack`（該当リーダー攻撃-12・低相手ライフでは詰め優先のまま）。挙動プローブ＋自己対戦。コミット 2da31f5。
- 結果: プローブで意図通り（相手ライフ5/4→KO、3→顔殴り）。自己対戦 改善4/退行1・有意な害なし。
- 結論: 採用。場面が稀で勝率効果は小だが観察された損を修正。回帰 `tests/ai-core.js`。

## E11 / 2026-06-21: heur2ループ — 却下3件（❌・heuristicは多くの部分で近似最適）
- 仮説: ①盤面リード時に攻勢(aggression) ②mulligan厳格化 ③レスト非ブロッカーのKO価値調整 で改善する。
- 設定: heur2 A/B。KO価値は 7→3 と 7→11 を試行。
- 結果: ①0 flip（手が変わらない＝弱レバー） ②ハーネスで発火せず（startGameにagent引数が要る・未対応） ③7→3は-6pt(teach)悪化・7→11は中立。
- 結論: 全て却下。**単一パラメータの手調整では超えられない。効くのは「観察由来の具体的ミス修正」だけ**（E08-10と対）。

## E12 / 2026-06-21: Stage A — 価値NN（MLP）（着手不変）
- 仮説: 線形→MLPにすれば価値が賢くなり探索が強くなる。
- 設定: `mlpForward`/`trainMLP`（隠れ1層ReLU）。`OPCG_MODEL=mlp OPCG_HIDDEN=24`。コミット 5897f53。
- 結果: 検証精度は改善（enel 0.66→0.81・default 0.68→0.70）。だが MCTS葉評価での着手は**学習=手作り・正味flip 0・±0.0pt**（teach/enel両視点 N=40）。vlook は線形もMLPも完全同一の**-58pt 崩壊**（mid-turnで価値飽和→候補同点→最初の手）。
- 結論: 棄却（既定 AI_WEIGHTS=null 継続）。価値を差し替えても探索の着手はほぼ変わらない＝探索が支配。インフラはB/Cで再利用。

## E13 / 2026-06-21: Stage B — per-action方策ネット（アタックprior・蒸留）（中立）
- 仮説: 最も戦略的なアタック着手を per-action 方策ネットで学習できる（まず教師=heuristicの蒸留で足場を確認）。
- 設定: `polFeatures`(16次元)/`policyPickAttack`/`AGENTS.npolicy`・`tools/train-policy.js`。720局／18941サンプル。
- 結果: top1=0.79〜0.92（高精度蒸留）。強さは npolicy ≈ heuristic（teach +3.3pt／enel +1.7pt・p=0.69/1.00 非有意）・退行なし。
- 結論: 想定どおり（教師の蒸留は原理的に≈教師）。**超えるには教師がheuristicより強い必要がある**→Stage C・puctへ。

## E14 / 2026-06-21: Stage C — 自己対戦反復DAgger（1-ply価値教師）（❌有意に退行）
- 仮説: 「生徒の分布で教師（1-ply価値先読み `improvedAttack`）がラベル」のDAgger反復で蒸留の天井を超えられる。
- 設定: `tools/selfplay-iterate.js`・2世代×120局（世代2は590sハーネス上限で打ち切り→既定GAMES=80に）。
- 結果: 世代0（=heuristic）72.5% → 世代1 47.5%＝**teach 対h -25.0pt（改善3/退行13・p=0.021 ★有意な退行）**。教師のtop1が0.49〜0.68と低い＝教師自身が状態間で矛盾。
- 結論: 棄却・世代1方策は不採用（ai-policy.jsはStage Bに戻す）。**1-ply価値は greedy 改善の教師になるほど頑健でない**（E07と同根）。反復には「強い教師=探索」が必須→E18で実証。

## E15 / 2026-06-21: Python/GPU Phase1 — 橋の検証（✅）
- 仮説: engine=JS（真実源）のまま、自己対戦=Node→学習=PyTorch/MPS→推論=JSの橋が成立する。
- 設定: `tools/az-export.js`＋`pytorch/train.py`。400局／value 9578・policy 10451 サンプル。コミット 2870f8b。
- 結果: MPS(GPU)学習が走り、JSが重みをロードして動作（`tests/ai-core.js` pass）。精度はJS版同等。教師=heuristic段階なので強さ≈heuristic（橋の検証が目的）。
- 結論: 支持。以後の part2〜part7・クラウド計画は全部この橋の上。

## E16 / 2026-06-21: Phase2 part1 — 本物のper-action探索 puct（✅崩壊しない初の探索）
- 仮説: 「方策priorで候補を絞り→各候補を適用→heuristicで残り→相手LOOKターン→**ターン境界の価値**で決定化K回平均」なら、vlook崩壊/StageC退行を回避できる。
- 設定: `AGENTS.puct`（det=3/look=1/width=5）。同一seedペア N=120。コミット 75d4b61。
- 結果: teach +7.5pt／enel -3.3pt ＝ ≈heuristic（中立）だが**崩壊しない**。
- 結論: 支持（核心は「境界価値」＝価値ネットの学習分布で評価する規律）。強さは中立でも「深くすれば伸びるか」を測る土台になった（→E17）。

## E17 / 2026-06-21: 深さプローブ — 探索計算を増やすと強くなるか（✅スケール実証）
- 仮説: puct は探索計算（det/look/width）を増やすほど強くなる（AlphaZeroの前提が本ゲームで成立するか）。
- 設定: `tools/puct-depth-probe.js`。同一seedで h/base/strong(det6/look2/w6) 打ち比べ。N=60/視点。コミット 177f74c。
- 結果: teach: strong 対h **+13.3pt（改善11/退行3 p=0.057）**・base +6.7pt → strong>base +6.7pt。enel（不利マッチ）: strong -1.7（中立）・base -6.7 → strong>base +5.0pt。
- 結論: 支持。**両視点で一貫して「深いほど強い」＝計算でスケール**。JS実装で初めてheuristicを実測で明確に上回った（teach）。

## E18 / 2026-06-21: Phase2 part2 — puct自己対戦反復（✅初の統計的有意なheuristic超え）
- 仮説: Stage C退行の真因＝弱い教師。教師を「puct自身の探索が選んだ手」に置換すれば反復が機能する。
- 設定: `tools/selfplay-puct.js`（Node自己対戦→PyTorch/MPS policy再学習→JS反映→測定→反復）。replay buffer＋per-leader gating。最終確認 N=80。コミット 7db10fa。
- 結果: 1世代で teach の puct +6.7→+16.7pt（改善5/退行0・p=0.016〜0.063）。**単一マッチアップgatingは過適合で enel を-12.5pt(p=0.041)退行させた**→per-leader gating で回避。合成方策の最終確認: **teach +16.3pt（16/3・p=0.004★）／enel ±0.0pt（退行なし）**。方策top1は0.43と低くても prior として機能。
- 結論: 支持＝**プロジェクト初の出荷可能な有意のheuristic超え**。自己対戦反復は「強い教師（=探索）＋gating＋replay buffer」が揃って初めて効く。gatingはper-leader必須。

## E19 / 2026-06-21: Phase2 part3 — valueの自己対戦学習（❌1回目）
- 仮説: puct自己対戦の「ターン境界特徴＋最終勝敗」で学習したvalueは手作りevalを超える。
- 設定: `OPCG_TARGET=value`／`AZ_VALUE_ONLY=1`・per-leader gating。N=30。コミット fd1eb81。
- 結果: teach/enel とも学習valueは手作りに負け（net=teach -4/-5・enel -7/-6）→全棄却。
- 結論: 棄却。**puctを強くするのはpolicy（prior）でありvalueではない**。手作りevalStateが境界評価として既に優秀。（value挑戦はこの後 E27・E28・E30 で計4回✗になる）

## E20 / 2026-06-21: Phase2 part4 — policy gatingを全6リーダー（ミラー）へ拡張（★決定的成果）
- 仮説: ミラー（同型対戦）で測ればデッキ相性に圧縮されない「puctの真の実力」が出る。
- 設定: `OPCG_GATE_LEADERS`全6リーダー・ミラーgating。最終確認 N=40/リーダー。コミット 8b7d0dd。
- 結果: puct 対h（ミラー）**lucy +45.0(p0.000)／teach +27.5(p0.007)／ace +25.0(p0.013)／nami +25.0(p0.006)／hancock +20.0(p0.039)＝5/6リーダーで有意の大勝**。**enelのみ -29.2pt(p=0.039)＝探索がランプ機構を壊す**真の弱点を発見→`PUCT_SKIP={enel:1}`でフォールバック。
- 結論: 支持。到達点「puctは5/6リーダーで+20〜45pt」。測定方法の学び: **相性で圧縮される非対称マッチでなくミラーで測る**。

## E21 / 2026-06-21: Phase2 part5 — enel探索の修正試行（❌）＋UIトグル（✅）
- 仮説: enelの弱さは①ランプの過小評価 or ②look=1の近視眼。
- 設定: ①探索前にenelランプ確定実行 ②look=3。enelミラー measure。コミット 6f2fe56。
- 結果: ①-23pt ②-29pt＝どちらも変化なし。UIトグル「CPU強さ: 標準/強い(AI探索)」は追加（`setCpuStrength`）。
- 結論: 棄却。真因は「手作りvalueがenelのランプ/コントロール局面を評価できない」根本（valueを直す道もE19で塞がり済み）。フォールバック維持が安全解。試行は撤回。

## E22 / 2026-06-21: Phase2 part6 — enel徹底診断（❌・重要な一般知見）
- 仮説: 行動集計すれば puct-enel の弱さの機序が特定できる。
- 設定: enelミラー行動診断（atk/ramp/残ドン per turn）＋ドン温存reserve=2の対処試行。コミット 3a560c2。
- 結果: heuristic-enel 勝率50%・残ドン0.84（温存）に対し puct-enel **勝率6%**・残ドン0.27（使い切り）・ramp減＝**探索がenelをアグロに打つ**（境界価値が短期打点を好む）。reserve=2は-25pt（僅か改善のみ）。
- 結論: 棄却＝単一修正では直らない。**探索/AlphaZeroはテンポ/アグロ柔軟デッキには効くが、専用コントロール/ランプエンジンには効かない＝この規模では手調整の戦略知識が生成的探索に勝つ**。フォールバック確定。

## E23 / 2026-06-21: [運用] enelフォールバック撤去＋AI思考の非表示（ユーザー指定）
- 仮説: なし（ユーザーの仕様決定。enelをpuctで打つと弱くなるのは承知の上）。
- 設定: `PUCT_SKIP={}`・探索中は「AI思考中…」バッジのみ表示（`G._sim`中のUI抑止）。コミット 0e10c07。
- 結果: 仕様どおり。
- 結論: 記録のみ（のちE24でenelはper-leader深さ自動化・部分改善）。

## E24 / 2026-06-21: 立ち回りWeb調査の価値エンコード（❌）＋enelは深さで部分改善（✅）
- 仮説: Web上のデッキ解説（許可日本語ソース）を per-leader 戦略プロファイル（評価重み）に翻訳すれば強くなる（ユーザー要望）。
- 設定: 7デッキ調査→`docs/deck-strategies.md`→evalStateのper-leaderプロファイル。enelミラー同一seed比較・深さスイープ N=40。コミット 0a04e4c。
- 結果: プロファイル ±0〜-4pt（det3でもdet6でも改善なし）→撤回。深さスイープは det3/look1 -20pt → det3/look2 -15pt → det6/look2/w6 ±0〜-10pt＝**enelの真因は価値でなく探索の深さ**（-29pt級→約-10ptまで部分改善・完全には直らず）。
- 結論: 価値エンコードは棄却（「手作りeval≒最適」の再確認）。採用は `PUCT_DEPTH={enel:{det:6,look:2,width:6}}`＝リーダー別既定深さ。**「立ち回り知識を価値に書く」は効かず、効くのは探索の深さ**。調査自体は攻略リファレンスとして価値あり。

## E25 / 2026-06-22: ハイブリッド Phase0-2 — Claude戦略×puct戦術（基盤✅・静的プロファイル❌・live未測定）
- 仮説: LLMを「戦略コーチ」・puctを「戦術エンジン」にすれば探索が持たない戦略層を注入できる（ユーザー要望「最強AI」）。
- 設定: Phase0 ローカルproxy（CORS/鍵秘匿）→Phase1 評価シェイピング機構（`G._shape`・hybridoff≡puctを同一seed9/9一致で確認）→Phase2 live（`AGENTS.hybrid`・キャッシュ・決定的再生導線）。コミット c5dd9eb/1f1c5ac/c9bc092。
- 結果: enel静的プロファイルは✗（hybridoff 対h -8.3pt・非対称マッチはN=24ノイズ域で再現せず）。**liveの実強度は未測定（APIキー無し）**。配管は鍵不要範囲で全検証済み。
- 結論: 静的1ベクトルは不採用。**per-matchupのlive Claudeが本筋＝鍵を入れて測る価値が残っている**（未消化の実験・E34候補①）。

## E26 / 2026-06-22: Phase5 — 多手先PUCT木 puct2（❌有意に退行）
- 仮説: 1手再探索のpuctより多手先の木の方が強い。
- 設定: `agent='puct2'`。teachミラー同一seed N=40。SIMS 32→120 も試行。コミット 233445b。
- 結果: puct2 **-25.0pt(p=0.041★)**／同条件 puct +27.5pt(p=0.013★)。SIMS増でも-16.7pt。
- 結論: 棄却（opt-in実験として残置）。薄い木は第1手の訪問数が分散し「最多訪問」が不安定＝puctの「各候補をK回集中評価」に構造的に劣る（E07/E14と同根）。**木が勝つには価値NNの葉＋桁違いのsims（=AlphaZero規模）が要る＝JS探索の天井はpuctと確定**。

## E27 / 2026-06-26: part6 — ドン差項目・enel特化mcts・損アタック修正・hybrid web化（✅3件・❌1群）
- 仮説: ①「ドン効率」の原則を evalState の資源項目にすれば強くなる ②enelはpuctよりmctsが合う ③puctが「届かない攻撃」を候補化している ④原則集（`docs/opcg-playing-principles.md`・日本語59ソース敵対的検証）をheuristicに組み込めば強くなる。
- 設定: measure-matchup駆動（ドン差はN=60・`G._noDonDiff`で同一seed on/off）。コミット 6293a02。
- 結果: ①ドン差は**リーダー依存**: teach -3.3→+11.7pt(p0.092)/hancock +15pt で採用、lucy -20/ace -5/nami -5は退行で不適用（全リーダー一律は誤り）。②`PUCT_MCTS={enel:1}`: mcts対h +8.3pt（改善5/退行0）で採用。③損アタック修正（lucy計測40手中4回・届く判定追加）採用。④**原則A1/A2/B2のheuristic組込は全て退行/中立**（一括 teach -5pt・A1単独-3.3pt）・相手手札ペナルティ中立・ドン差重み0.2退行＝全て却下。
- 結論: **「原則を知る」と「既存エンジンに効かせる」は別問題**。効いたのは抽象重みでなく「具体的な資源評価をevalStateにリーダー別で入れた」時のみ。heuristicへの加点は既調整と干渉して退行。（web版=React+Cloudflare・AIモードhybrid化も同コミットで初出荷）

## E28 / 2026-06-27: part6追補 — 規模拡大の再挑戦で「単機天井」を確定（❌2件・✅並列化）
- 仮説: ①policy自己対戦反復の飽和は局数不足（80→560局/世代なら伸びる） ②valueはネット拡大（VH=128）＋本番データ6000なら手作りを超える。
- 設定: replay buffer 6000。`tools/selfplay-puct.js`並列化（コア数-1・別プロセス別seed帯）。コミット fcedc11。
- 結果: ①全世代 teach 棄却＝**飽和は「局数」でなく「手法の限界」**。②teach±0/enel-3.3pt＝**value 4回目の✗**（手作りeval≒最適の再々確認）。副産物: self-play並列化で本番3世代 2-3時間→**11分**。
- 結論: **現状（puct＋evalStateドン差）がJSエンジンの現実的天井**。規模拡大では伸びない。真の飛躍はC++移植+多手先MCTS+価値NN葉+多GPU百万局＝別プロジェクト規模。並列化は今後の測定/データ生成の資産。

## E29 / 2026-06-27: 太ドン同値アタック抑制（✅採用・勝率中立だが無駄手削減）
- 仮説: 低パワー役に2ドン以上付与してリーダー同値アタックは、相手カウンター1枚で防がれ付与ドン使い切りの大損（**ユーザー観察**）。
- 設定: `cpuPickAttack`（通常）/`candidateActions`（puct）で候補除外（詰め・相手手札0は除く）。probe＋measure。コミット 5a5d669。
- 結果: probe実測 太ドン同値 enel16→4・lucy9→5・hancock1→0。measureは中立（heuristic teach±0/enel-1.7pt[1局]・puct teach±0/enel+6.7pt）。
- 結論: 採用。勝率は中立でも観察された無駄手を消す（体感品質）。回帰 `tests/ai-core.js`。

## E30 / 2026-06-28: part7 — AlphaZero本格の状態表現を単機で全検証（❌×4＝「鶏と卵」で単機天井を理由ごと確定）
- 仮説: 17特徴が天井なら、生盤面状態表現（`boardTensor` 336次元=カード属性14×盤面6×2+手札10+スカラー）＋深いNNで表現力の天井を破れば、valueが強くなる。
- 設定: `inputType:'board'`・可変層`mlpForward(layers)`/train.py・advantage採点`tools/az-advantage.js`・反復`tools/selfplay-value.js`。全て単機・measure(puct)判定。コミット 32bf8cf。
- 結果: ①17次元value深いNN＝手作りと完全同等±0（17特徴が天井と確認） ②生盤面valueは検証精度0.74→**0.83（+0.086）＝表現力は本物** ③だが単発value(heuristicデータ)は探索で**退行 teach -16.7pt**（探索が誤差を突く） ④浅いpuct葉の自己対戦反復は**-23.3pt**（value_0の悪さを継承する悪循環） ⑤深い探索(strong)+生盤面valueは**-20pt（深いほど悪化）**（不正確valueを深く伝播）。
- 結論: **value↔探索の「鶏と卵」**＝正確なvalueには深い探索の反復が要り、深い探索には正確なvalueが要る。単機は両方不正確で悪循環＝AlphaZeroが多数sims+大量self-play+大規模NNで同時に解く理由を実機で実証。**「検証精度≠強さ」の最鮮明な実証**（+0.086でも-16.7〜-20pt）。獲得した足場（boardTensor/深NN/反復ループ/データ生成）はクラウドでそのまま使える。

## E31 / 2026-06-29: AlphaZero反復ループ 段階A統合（✅足場）＋クラウド計画（段階B/C）
- 仮説: self-play(puct strong)→value学習(生盤面深NN)→gating→反復 を1本化すれば、クラウドの多世代検証がコマンド1発で回る。
- 設定: `tools/az-loop.sh`・`tools/selfplay-value.js`（strong可変）・gating pt抽出バグ修正。単機1世代テスト。コミット 5049195・6ac9334（docs/cloud-setup.md）。
- 結果: ループは回る（self-play→学習→gating→measure動作OK）。1世代目は退行-33.3pt（鶏と卵は1世代では解けない・予想通り）。クラウド手順・コスト早見・**撤退基準**（段階B数万円で「学習vs手作りpt」が世代を追って−→0→+へ動く兆しを見てから段階C数十万円）を文書化。
- 結論: 足場完成・実行はユーザーの資源判断待ち。**多世代で改善する保証はない**（完全情報の囲碁将棋と違い、不完全情報+決定化+JS遅い環境での成立は未知）と正直に明記済み。

## E32 / 2026-07-02: [事故] az-loopが出荷物 ai-weights.js を汚染 → null復元（★再発防止要）
- 仮説: なし（事故対応）。ユーザー報告「AIモードで意味不明な動き」の原因調査。
- 設定: コミット 7e7318a。
- 結果: 段階Aの`az-loop.sh`が `src/ai-weights.js` を part7実験の生盤面value（**退行-16.7ptと確定済みのモデル**）で上書きし、`git add -A` でコミット5049195に混入。バニラ版の強い/AIモード（puct）が退行NNを葉評価に使い弱体化していた＝体感劣化の主因。`tests/test.js`ステップ9の恒常失敗も同根。
- 結論: null（手作りeval）へ復元し解消。**教訓: 実験スクリプトが出荷物（src/）を直接書き換える設計は事故る。実験出力はscratchへ・採用時のみ明示コピーに直すべき**（ガードレール未実装・要対応）。

## E33 / 2026-07-02: リーダー殴り残しペナルティ（✅採用・4リーダーで+5〜15pt）
- 仮説: AIモードが「フリーで届くのにリーダーを殴り残す」のは境界評価の盲点（**ユーザー観察**「AIモードでリーダーを殴らない」）。
- 設定: `rolloutAfterTurn`のendTurn直前で殴り残しアタッカーを境界valueペナルティ化（`G._lifeAggr`既定0.8・0で無効化）。measure ミラーN=20(puct)・`LIFE_AGGR`フラグ。コミット 6f3b1ac。
- 結果: 全リーダー退行なし。nami -15→+0／hancock +30→+45／teach +10→+15／ace +0→+5・lucy/enel±0。
- 結論: 採用（web版AIモードにも反映）。太ドン同値（中立）と違い明確な強化。ユーザー観察由来の採用は E08/E09/E10/E29 に続き5件目＝**観察→ピンポイント修正が最も費用対効果の高い改良ルート**であることを再確認。

## E34 / 2026-07-04: 探索深さのスケーリングを全リーダーへ採用（✅deep=det9/look2/w8・対hほぼ倍増）
- 仮説: E14（part1深さプローブ・teach/enelで strong>base +5〜6.7pt）の「深さでスケールする」は他リーダーでも成立し、単機AIモードに残された無償レバーである（ユーザー要望「あらゆる盤面を計算し相手の動きを読み先を読む最強AIモード」）。
- 設定: `tools/puct-depth-probe.js` ミラー×5リーダー（lucy/ace/nami/hancock/teach）・N=60・同一seedペア。4段測定: base(det3/look1/w5)→det6/look2/w6→det9/look2/w8→det12/look2/w10（seed帯800000）＋**新seed帯900000で採用値の確認測定**（同一帯で最良tierを選ぶ選択バイアスの排除）。
- 結果: **det9/look2/w8 が頂点**＝対h lucy+30.0(p=0.000★)/teach+25.0(p=0.001★)/hancock+18.3(p=0.035★)/nami+13.3/ace+11.7、対base合算 改善60/退行29(p≈0.002★)。**det12/w10 は4/5リーダーで飽和/微減＝逓減開始**。確認帯: ace+30.0★/teach+30.0★/hancock+16.7/lucy+21.7/nami+3.3＝退行なし・**2帯合算 deep対base 改善121/退行59 p<0.00001★**。対h平均 +9.7→**+19.7pt**。基準腕の勝敗が別実行で完全一致＝決定的測定の健全性も再確認。
- 結論: 採用。`src/70-ai.js` `PUCT_DEEP={det:9,look:2,width:8}`（5リーダーのPUCT_DEPTH・enelは従来det6/2/6→mcts・未知リーダーは標準・既定CPU=heuristic不変）。探索は軽く1手<0.5s＝UI許容。**単機で残っていた無償の伸びしろは「深さ det9」で回収完了＝この先は価値NN葉（クラウド）の領域**。

## E35 / 2026-07-06: enel単独ローカルAlphaZero反復（value+policy共同）→ ❌10世代全棄却＝route close
- 仮説: enelの弱点「手作りvalueがランプ/コントロール局面を評価できない」は、**enel単独にデータを全振り**（過去のvalue失敗は6デッキ分散＝120局中enel実質20局）した **value+policy共同の自己対戦反復**（replay+gating）なら学習で埋まる。前提のユーザー決定: クラウドAlphaZeroフル導入は見送り（成果物が6デッキ限定で任意デッキに汎化せず・汎化版は未解決研究）→ ローカルで傾きだけ測る。
- 設定: `selfplay-puct.js OPCG_TARGET=both`（E35用に新設: value=boardTensor336+policyを同一世代で共同学習・`OPCG_NOSKIP=1`=enelをmcts代替させず本物のpuctで・`OPCG_BOARD=1`）。enelミラー400局/世代×10世代・self-play det6/look2/w6・replay20000・gating=学習アーム対hフリップ（`measure-matchup.js`にimpL/regL新設・N=60固定seed）。付随修正: **mlpLogitのlayers形式対応**（part7以降のtrain.py出力をpolicy推論が読めず今後のpolicy学習が全滅する潜在バグ・コミット20bc367）・chunk失敗1回リトライ+タイムスタンプ進捗（57eed30）・**チャンク40局は590sタイムアウト超過が2晩連続の無言死の真因**→10局に縮小（スリープ/jetsam説は無実・子プロセスRSS約90MB）。
- 結果: ベースライン（手作りvalue+StageB policy・puct-enelミラー対h net=-7/N=60）に対し **10世代全棄却**: net = **-23,-20,-21,-17,-11,-13,-9,-21,-16,-16**。世代5-7の「上昇」（-17→-11→-9）は世代8で-21へ逆戻り＝**候補ネットの分散（-9〜-23・平均≒-17）でありトレンドではない**。gatingが全棄却のためself-play分布は10世代不変＝同一分布のデータ蓄積（buf20000飽和）だけでは基準に近づきもしない。所要2.5時間（単機6並列・約15分/世代）。
- 結論: **route close**。最も有利な条件（enel特化・データ集中10倍・value+policy共同・境界価値教師）でも学習は手作りevalに届かない＝**enel学習ルートの4度目の✗**（part3/part5/part7に続く・今回が最終確認）。enelの最適解は現行 mcts代替（対h+8.3pt）維持で確定。単機の残レバーは Hybrid live実測（E25・APIキー待ち）と lucy/ace/nami の evalState 資源項目（E-次番）のみ。

## E36 / 2026-07-06: mcts-enelの計算スケーリング（E34のmcts版）→ ❌全段±0＋E27採用値の正体判明
- 仮説: AIモードenel＝mcts は E27で**既定値(rollouts=8/depth=4)のまま採用され計算量スイープ未実施**。E34「puctは深さでスケール」のmcts版が enel の残レバーでは。
- 設定: `measure-matchup.js` に `OPCG_MCTS_ROLLOUTS`/`OPCG_MCTS_DEPTH` を新設。enelミラー・同一seed60局ペア×4段（8/4基準・16/4・32/4・8/6）。E35の教訓でCHUNKを段ごとに調整。
- 結果: **ミラーで全段フリップほぼゼロ**＝8/4: 0/0、16/4: 0/0、32/4: 0/0、8/6: 1/2(-1.7pt)。診断（rollout計装）で原因特定＝**rollout評価が0.94前後に飽和し3候補マクロ方針の差がMARGIN(0.05)未満→上書きが一度も発動せずmcts≡heuristic**（「aggressionは弱レバー(0flip)」の再確認）。ヘッドレスのmcts対局は~0.5s/局（「~8s」はブラウザ時代の値）。
- **★副次発見＝E27「mcts対h+8.3pt」の正体**: E27コミット(6293a02)のworktree再現で、**+8.3ptはenel対teach（不利マッチ）の値**（再現+10.0pt 改善6/退行0 p=0.031★）。**ミラーは当時から+1.7pt(1/0)＝元々ほぼ効果なし**。現在コードでは対teachも+5.0pt(4/1 p=0.375)に減衰（太ドン抑制等の正当なheuristic変更で読み筋が変化・バグではない＝決定的再現で確認）。
- 結論: **棄却＝mcts-enelは計算量を4倍にしても伸びない**（評価飽和で方針候補が区別できない構造）。`PUCT_MCTS={enel:1}`は維持（ミラー無害・対teachで小さな正）。**enelの実効的な残レバーは「ユーザー観察→heuristic修正」（E08型・enel最大の+6pt実績）と Hybrid live（E25）のみ**。

## E37 / 2026-07-06: Hybrid live実測（E25回収）→ ❌teach±0・enel有害＝enelをHYBRID_SKIPへ（✅採用）
- 仮説: live Claude（per-matchup戦略シェイプ）がpuctを強くする（§10.2の兆候）。特にenelは静的プロファイル✗でもliveなら効くかも＝enel最後の未測定レバー。
- 設定: ユーザーがAPIキー提供（`.dev.vars`・gitignore済）→`llm-proxy`→`llm-warm-cache.js`で enel:teach/enelミラー/teachミラー 各20局の戦略をfixtureに焼き→`measure-matchup.js OPCG_LLM_CACHE`で決定的再生（seed帯600000・N=60ペア＋符号検定）。**live経路の潜在バグ2件を修正**（①stubs下で実fetch(undici)がTypeError＋stub setTimeoutが遅延無視でcallClaudeの9s abort即発火→http直叩きミニfetch(signal無視)に差し替え ②巨大キャッシュJSONのstdout受け渡しがmaxBuffer切断→一時ファイル経由。コミット501d387）。warmは全局面で戦略取得成功（sonnet・マッチアップを認識した具体的な指示が返る＝配管は完動）。
- 結果（同一seed帯・対h）:
  | 対面 | hybrid | 基準 |
  |---|---|---|
  | **teachミラー** | **+16.7pt(15/5 p=0.041★)** | **素のpuct +16.7pt(16/6 p=0.052)＝完全同値** |
  | enelミラー | -5.0pt(5/8 p=0.581) | 素のpuct -11.7 / フォールバック先mcts ±0 |
  | enel対teach | **-10.0pt(1/7 p=0.070)** | mcts +5.0 ＝Claude層が最大15pt損 |
- 結論: **Claude戦略シェイプは「足さない(teach)か有害(enel)」**。§10.2の兆候（band1 +16.7pt）はノイズと確定。✅採用: `HYBRID_SKIP={enel:1}`（`src/70-ai.js` hybridTurn＝enelはシェイプせず素のpuct→PUCT_MCTS経由でmcts直行・API呼び出しも節約・回帰`tests/ai-core.js` 10c・`G._hybridNoSkip`で再測定可）。teach等は無害につきhybrid維持。未測定: lucy/ace/nami/hancockのhybrid（必要なら1対面約20分で追測可）。**E25はこれで回収完了**。

## E38 / 2026-07-09: 測定インフラ拡張（per-seed dump・直接flip比較・サーチ発火診断）→ ✅完了（挙動不変）
- 背景: 「強いCPUモード」ロードマップ（E39〜E45・設計4案+敵対的レビュー）の前提インフラ。puct系の「上乗せ」改良（bpuct/puct3/planpuct等）は各アームの対h ptの差より、**両アームの同一seed直接flipの符号検定の方が検出力が高い**。またDECK_PLANS（E39）は測定前に「発火頻度」診断ゲートが必須（mulligan「発火せず」の教訓）。
- 実装: ①`measure-matchup.js` に `OPCG_DUMP=<file>`（per-seed勝敗JSONを書き出し。chunkがDUMPROWS行で親に回収させる） ②`tools/compare-dumps.js`（2つのdumpを同一seedで直接flip比較・符号検定・複数dumpのカンマ区切り合算対応） ③`20-targeting-fx.js` のsearch/searchDeck opに診断フック `G._searchDiag`（**未設定なら挙動不変**。関数はJSONクローンに乗らないため探索ロールアウト内では自然に無効＝実対局のみ記録） ④`tools/plan-diagnose.js`（heuristicミラーでサーチ解決回数/局・候補数・plan差分率を集計。seed帯800000）。
- 検証: `tests/test.js` 全緑（挙動不変）。dump→自己比較でflip 0/0を確認。診断smoke: **lucy サーチ2.0回/局/側・teach 2.1回/局/側**（候補平均2.6/3.6枚）＝E39の発火ゲート(1.5回/局)を両者通過見込み。
- 測定規約（レビューで確定・E39以降に適用）: **主ゲート=対象ミラー合算flip符号検定p<0.05（別seed帯で符号再現）**・副ゲート=per-leader退行検出（p<0.05退行はgating除外）・heuristic系アームはN=120/ミラー・puct系はN=60/ミラー・採用部品は合成エージェントに per-leader テーブルで積む。

## E39 / 2026-07-09: DECK_PLANS（サーチ先最適化+捨て札保護・planh）→ ❌lucy退行で不採用・teach/ace中立（機構はopt-in残置）
- 仮説: サーチopの対象選択（byPow=パワー最大の盲取り、`20-targeting-fx.js` search/searchDeck）は探索もpriorも届かないop解決層＝デッキプラン(wants/combos/holds)を注入すれば「欲しい札を取る」で勝率が上がる（設計4案レビューの最有望#1）。
- 実装: `src/ai-strategy.js` に `window.DECK_PLANS`＋純関数群（planFor/planCardMatch/planWantScore/planBestPick/planPickSearch/planDiscardProtect。want非合致は-∞=必ずbyPowへフォールバック・全て自陣完全観測情報のみ）、`20-targeting-fx.js` の search/searchDeck/chooseFromHand にopt-inフック（`P.usePlan` 未設定なら**バイト等価**）、`AGENTS.planh`。回帰 `tests/ai-core.js` 11節。診断ゲート（`tools/plan-diagnose.js`）: lucy発火1.93回/局/側・差分率43%／ace 2.04回・28%／teach 2.13回・24%＝全員「死にレバー」ではない。
- 結果（ミラーN=120・同一seedペア）:
  | リーダー | プラン | 対h | flip | p |
  |---|---|---|---|---|
  | lucy v1 | サボ+イベントwant+イベント捨て札保護 | **-10.8pt** | 改善2/退行15 | **0.002★退行** |
  | lucy v2 | ボディ+サボコンボのみ | -4.2pt | 改善1/退行6 | 0.125（方向も負） |
  | ace | ST22-015/ヤマトwant+ニューゲートコンボ | +0.8pt | 5/4 | 1.000 |
  | teach | ゼハハ+ティーチコンボ | +0.8pt | 3/2 | 1.000 |
- 結論: **採用ゼロ**。lucyは2案とも負（事前登録の2イテレーション上限で打ち切り・byLeaderから削除）。**★学び: 「デッキの勝ち筋に沿って札を取る」はheuristicの実行能力(イベントを換金する腕)が無いと逆効果＝サーチ選択の質はプレイの質に従属する**。byPow(パワー貪欲)はheuristicTurnと既に整合していた（「よく調整されたheuristic」の再確認）。teach/ace（コンボ札確保）は中立＝勝率には出ないが「デッキの意図どおり動く」体感価値としてopt-in（planh/`usePlan`）で残置。既定CPU・puctはバイト不変。planpuct（puct上でのプラン）はE45時点で期待を下げて判断。
- 派生知見: 発火頻度・差分率が高くても（lucy 43%）勝率が付いてこない＝**「差分率」は必要条件で十分条件でない**。E42(トリガーゲート)等の残り実験は「取る札」でなく「無駄な行動の除去」型を優先する根拠が強まった。

## E40 / 2026-07-09: 脅威判定器assessThreat＋防御切替（heur3）→ ❌counterパートが有害・hold/reserveは不活性＝全部品不採用
- 仮説: 防御層（カウンター/ブロック）はエージェントseam外で一度もA/Bされていない高頻度決定点（毎局5-15回）。「リーサル算術」（相手の攻撃列挙→貪欲ドン割当→自防御資源の貪欲割当の閉形式）で ①holdBlk精密化 ②reserveゲート精密化 ③「このアタックを止めても/受けても残り攻撃で確実に死ぬなら1枚も切らず温存」を導入すれば勝率が上がる（設計4案レビューの本命#2）。
- 実装: `50-input-cpu-ai.js` に `assessThreat(side, 'now'|'next')`/`threatOppLethal`/`isThreatAware`（heur3/puct3/strong2のみ・既定バイト不変）、フック3箇所（holdBlk/reserveSimゲート/cpuCounter survival）、`OPCG_THR`で部品単離。回帰 `tests/ai-core.js` 12節。
- 結果（ミラーN=120×6リーダー・同一seedペア）:
  | アーム | 合算flip | 内訳 |
  |---|---|---|
  | 束(hold+reserve+counter) | **改善3/退行14（p≈0.013で有意退行）** | lucy±0(1/1)/ace-0.8/teach-2.5(0/3)/nami-1.7(0/2)/hancock-1.7(0/2)/enel-2.5(0/3) |
  | holdのみ | 改善2/退行2（6ミラー中5つでflip 0/0） | 不活性 |
  | reserveのみ | **0/0（全ミラー）** | 完全不活性 |
  | counterのみ | **改善1/退行11** | 束の退行をほぼ単独で再現（teach 0/3・enel 0/3・nami/hancock 0/2） |
- 結論: **全部品不採用**（コードはopt-in残置・既定CPU/puctはバイト不変のまま）。**★学び**: ①退行源は「どのみち死ぬ列に壁を捨てない」温存＝**防御楽観の閉形式でも「確実に死ぬ」判定は現実には外れる**（トリガー・ブロッカー相打ち・相手の非最適受けで受かる局面を投了扱い＝レビュー警告「critical誤判定の非対称コスト」の実証）。②hold/reserveの精密化が完全不活性＝**粗い述語(oppCanThreatenLethal)の誤差は実戦の意思決定を変える頻度が極めて低い**＝「正確にする」だけでは効かない。③E39と合わせ、「heuristicの判断を賢くする」系は2連敗＝残る有望領域は行動空間の拡張(E41)と探索への情報供給(E43)。

## E41 / 2026-07-09: puct攻撃候補の「+1ドン上乗せ」変種（puctdon）→ ❌非有意・lucyで退行傾向＝ドン段ルートclose
- 仮説: CPUの攻撃は常に「対象に届く最小付与（同値）」のみで、「+1000上乗せして相手のカウンター要求を1段引き上げる」手が**行動空間に存在しない**（レビューが特定した真の欠落）。candidateActionsに`extraDon:1`変種を足せばpuctが有効な局面で選ぶはず。
- 実装: `70-ai.js` candidateActions（リーダー攻撃のみ・相手手札>0・払える時だけ変種追加）/applyAction（extraDon分多く付与）/puctSearch（幅+2でprior枠圧迫を回避）/`AGENTS.puctdon`（`G._atkDonVar`・既定puctバイト不変）。測定は新設`OPCG_BASE=puct`で**同一プロセス内のpuct直接ペア比較**（並行するカードDB変更にも頑健）。回帰 `tests/ai-core.js` 13節。
- 結果（ミラーN=60・puct直接flip）: teach -1.7pt(5/6 p=1.0)／**lucy -11.7pt(2/9 p=0.065・退行傾向)**／hancock +5.0pt(10/7 p=0.63)＝**合算 改善17/退行22（非有意・方向は負）**。
- 結論: **close**（コードはopt-in残置）。変種は探索されている（flip数は多い）が勝率に転写されず、lucyでは有害。機序の推定: 「+1000ライン」の価値をロールアウト内の防御（cpuCounterの効率受け）が正しく罰しない局面で過大評価＝**「探索が価値誤差を突く」型**（vlook崩壊と同根の小型版）。設計案3（アタック計画のビームサーチ/DefenseProxy）のPhase2-3凍結も確定（前提のドン段レバーが死んだため）。

## E42 / 2026-07-09: プール期待値リーサル判定＋対象不在トリガーゲート（heur2部品）→ ❌両部品とも不活性で不採用
- 仮説: (a)`cpuCanLethal`の防御見積り「手札×0.5」をプール期待値（hand+deckのカウンター平均×手札枚数+ブロッカー割当）に置換すれば詰め逃し/偽リーサルが減る。(b)CPUはトリガーを無条件発動（`askTrigger`常にtrue）＝対象不在の除去トリガーは「手札1枚を捨てて空砲」→ゲートすれば得。
- 実装: `threatCanLethal`/`triggerWorthUsing`/`h2On`（`OPCG_H2`で部品単離・heur2ゲート・既定バイト不変）。回帰 `tests/ai-core.js` 14節。
- 結果（ミラーN=120×6リーダー）: **lethal=合算 改善2/退行1（4ミラーでflip 0/0）**・**trigger=合算 改善1/退行0（5ミラーでflip 0/0）**＝両方とも実質不活性。発火診断: トリガーゲートは**180局で1発火（0.006回/局）**＝CPU同士では「トリガー公開時に相手盤面が空」がほぼ発生しない（heuristicは常に盤面を作る）。
- 結論: **両部品とも不採用**（opt-in残置）。リーサル境界局面は稀で近似式の差が意思決定を変えない（E40②と同じ「正確にしても発火しない」）。トリガーゲートは対人間（盤面を空けるプレイヤー）でのみ意味を持つ可能性があるが、自動測定では価値を示せない＝太ドン前例（観測可能な無駄手の頻発）に該当しない。

## E43 / 2026-07-09: 公開カード固定の決定化（bpuct・信念ハード証拠）→ ❌中立＝E44観測ベイズは着手条件不成立でclose
- 仮説: determinizeは相手の手札+山を一様再配分＝サーチで公開されて手札に入ったカード（フェアな既知情報）を捨てている。`_pubHand`フラグで公開カードを手札スライスへ強制配置すれば決定化の質が上がる（設計案2のリスクゼロ部分）。
- 実装: search/searchDeckで`_pubHand=G.turnSeq`付与（実対局のみ）、determinizeにopt-in分岐（`G._beliefOn`）、`AGENTS.bpuct`。既定バイト不変。回帰 `tests/ai-core.js` 15節（強制配置/多重集合保存/手札退出の追跡）。
- 結果（ミラーN=60・puct直接flip）: teach ±0.0(1/1)／lucy ±0.0(2/2)＝**中立**。レビューの予測どおり「公開札は1-2ターンで盤面に出て公開情報になる＝ベネフィット窓が短い」＋det9の平均化が配分差を吸収。
- 結論: **close**（フックはガード付きゼロコストで残置）。**事前登録の条件（E41かE43が有意な時のみE44着手）が不成立→E44観測ベイズ(R1/R2)は不実施でclose**＝設計案2/3の信念モデル系は全て店じまい。

## E46 / 2026-07-09: heuristicのSTAGEプレイ欠落を塞ぐ → ✅teachのみper-leader採用（STAGE_PLAY={teach:1}）
- 背景: 設計レビューの「拾い物」指摘。`heuristicTurn`はキャラ/イベントしかプレイせず**手札のSTAGEは永久に死に札**（teachはハチノス=サーチ起動ステージが4枚！）。puctの`legalActions`はstageを含む＝探索と既定CPUの自己モデル不整合でもあった。
- 実装: `heuristicTurn`にステージ設置ステップ2b（イベント後・起動効果前＝置いたターンにactが使える。未設置時のみ・_noPlayTurn尊重）。ゲートは`STAGE_PLAY[leaderKey]`（既定採用）または heur2+`OPCG_H2=stage`（再測定用）。回帰 `tests/ai-core.js` 16節。
- 結果（ミラーN=120・2seed帯）:
  | リーダー | 帯1 (600000) | 帯2 (900000) | 判定 |
  |---|---|---|---|
  | teach | **+3.3pt (9/5)** | **+2.5pt (13/10)** | 正方向が2帯で再現（合算22/15 p≈0.32）→**採用** |
  | lucy | -1.7pt (1/3) | -1.7pt (2/4) | 負方向が2帯で再現（王国設置の1ドンが微損）→不採用 |
  | ace/nami/hancock/enel | 全て 0/0 | — | STAGE非搭載＝無影響 |
- 結論: **✅STAGE_PLAY={teach:1}で既定化**（非有意だが「2帯正方向＋ハチノス4枚の構造的死に札の除去」＝太ドン前例の採用基準）。既定teach（標準CPU・puctロールアウト・全モード）がハチノスを設置→起動サーチを回せるように。lucy/未知リーダーは従来どおり（heur2でいつでも再測定可）。採用後サニティ: puct-teachミラー N=60 で **puct対h +21.7pt(18/5 p=0.011★)**＝採用後もpuctは歴史値(+25〜30pt)と同オーダーで healthy・ロールアウト変更による退行なし。

## E47 / 2026-07-09: リーダー別コンボライン（lines-as-candidate・lineh）→ ❌中立＝「heuristicは既に定石を実行していた」を実測で確定
- 仮説（ユーザー発案）: リーダー毎の「強い動き」（カードA→カードBの効果と組み合わせるライン・ターン帯別プラン）を日本語ソースから収集してデータ化し、手札に揃った時にその動きを実行すればCPUが強くなる。
- 手順: ①**deep-research**（97エージェント・敵対的3票検証・日本語ソースのみ・実50枚リストと照合）でteach/hancockのライン収集→`docs/deck-lines.md`に恒久化。**副次発見: E39で仮定したteachのゼハハラインは日本語ソースで確立された型として確認できず**（実際の幹=6シリュウのライフ仕込み/10cティーチ連打）。②実装=`DECK_PLANS.byLeader[*].lines`+`matchDeckLines`（ドン帯/手札/トラッシュ/相手ライフの前提照合）+`AGENTS.lineh`（**強制実行せずmctsTurn型の非退行評価**: 自然手(null)と各ラインをK=6決定化ロールアウト(境界価値)で採点→MARGIN 0.05超で上回る時だけ`G._lineExec`→heuristicTurn冒頭がconsume-onceで実行）。回帰`tests/ai-core.js`17節。
- 結果（ミラーN=120）: **teach ±0.0pt(flip 0/0=全120局が同一試合)／hancock +0.8pt(1/0)**。発火診断(40局×2): teachは303ターン中96回照合(32%)・**選択は8回のみ**・選択しても試合不変／hancockは照合自体が13回(5%)・芳香脚リーサルは**照合0回**（相手ライフ≤1で札を握っている局面が発生しない）。
- 結論: **不採用（機構・データ・調査docはopt-in残置）**。**★学び: 検証済みの「定石ライン」は、よく調整されたheuristicのコスト順プレイとほぼ一致していた**＝プラン知識の注入で上書きする余地が無い（E37 priorityCards寄与ゼロ・part6原則注入と同じ結論を、今回は「ライン選択の発火統計」まで下ろして機序ごと確定）。人間とこのCPUの差は定石マクロではなくミクロ判断（E40/E42で精密化も不発）か、行動能力の欠落（E46型）にある。lines基盤は「定石がコスト順と乖離するデッキ」（ビルダー製の変則カーブ等）で再利用可。deep-research→50枚照合→lines化→lineh測定のパイプラインは`docs/deck-lines.md`の更新手順として整備済み。

---

## 台帳サマリ（2026-07-03 時点・opcg-pm）

- 再構成した実験: **33件**（基盤2・運用1・事故1を含む）。採用✅ 10件／棄却❌ 16件前後／中立・その他。
- 繰り返し実証された3法則: ①**検証精度≠強さ・測定（同一seedペア＋符号検定）だけが正** ②**貪欲/薄い探索は価値の誤差を突いて自滅する**（vlook・StageC・puct2） ③**ユーザーのプレイ観察が最良の仮説源**（採用5件の源泉）。
- 未消化の実験: Hybrid live 実測（E25・APIキー待ち）／クラウド段階B（E31・予算判断待ち）。
