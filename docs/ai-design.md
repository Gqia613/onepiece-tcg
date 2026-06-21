# 強いCPU(AI)設計メモ — ワンピカード

このリポジトリのシミュレーターに「強いCPU」を載せるための設計と進め方。
ゴールは **L2〜L3（大会プレイヤー級の強い対戦相手）**。L4(超人/AlphaZero級)は将来課題。

---

## 0. 大前提：ワンピカードは「将棋型」ではなく「ポーカー/ハースストーン型」

| | 将棋 | ワンピカード |
|---|---|---|
| 情報 | 完全情報 | **不完全情報**（相手手札・両者の山札順・裏ライフが隠れている） |
| 偶然 | 決定的 | **確率的**（ドロー・トリガー・マリガン） |
| 状態 | 固定 | **3000枚超＋新弾で毎回変動** |

将棋AI(AlphaZero)が人間を超えたのは「完全情報＋決定的」だから自己対戦＋MCTSが直に効いた。
ワンピカードに同手法を素で当てると **隠れ手札を“カンニング”するAI** になり実戦で使えない。
正しい系譜は **ポーカー/ハースストーンのAI** ＝ 「**不完全情報の扱い(決定化)＋探索＋評価関数の学習**」。
LLM(`callClaude`)単体では組合せ探索の強さは出ない（解説・弱い事前分布には有用）。

---

## 1. 強さのラダー（下から積む）

| 段 | 手法 | 期待される強さ | 状態 |
|---|---|---|---|
| L0 | ヒューリスティック改善（`scoreChar`/`cpuPickAttack`/`localPlan`） | 初〜中級者 | 既存 |
| **L1** | **エンジンを前向きモデル化**（clone・seed・seam・アリーナ） | 基盤（強さは出ない） | **✅実装済** |
| **L2** | **決定化MCTS(PIMC)** = 相手手札をサンプリングして先読み | 中〜上級者 | ✅実装済だが**対heuristicは小さく不安定**（決定的測定で ±0〜+7.5pt・deck依存）。heuristicが既に強い |
| L3 | **評価関数を自己対戦で学習**（特徴量→ロジ回帰・リーダー別） | 上級〜大会級 | 🧪実装済だが experimental（決定的測定で学習eval≒手作り・既定off）。下記 §4 |
| ★ | **MCTS非決定性バグの修正＋決定的測定基盤**（`tools/measure-matchup.js`） | （測定の前提） | ✅ これが無いと改良の良否を判定できない |
| L4 | AlphaZero式(policy+value net＋自己対戦ループ) | 超人狙い | 将来(要計算資源・Python移植) |

---

## 2. L1で導入した基盤（実装済み）

すべて `file://`・Node両対応のバニラJSのまま。`node tests/test.js` 緑を維持。

- **シード可能RNG** … `src/10-engine-core.js` の `seedRng(seed)` / `rng()`（mulberry32）。
  ゲーム結果に効く乱数(`shuffle`/先攻決め)を `rng()` に統一。未シードは Math.random 相当。
  **ゲームロジックの乱数は必ず `rng()` を使う**（`Math.random` は演出専用）。
- **前向きモデル** … `src/70-ai.js` の `cloneGameState(src=G)` / `loadGameState(state)`。
  - `G` を複製し `base`(`C[no]`)/`meta`(`DECKS`) を共有参照に再リンク。
  - 関数フィールド(`pendingChoice.res`等)・UI/一時フィールド・`log` は除去（**決定境界での複製が前提**）。
  - カードは各ゾーンに一意に存在＝JSON複製でも参照矛盾なし。
- **エージェントseam** … `src/50-input-cpu-ai.js`。
  - 旧 `cpuTurn()` の本体 → `heuristicTurn(side)` に改名。
  - `cpuTurn(side)` は `AGENTS[agentName(side)].takeTurn(side)` に委譲（`agentName`=`P.agent||'heuristic'`）。
  - `AGENTS = { heuristic, random }`。`random`=合法手ランダムプレイ（弱いベースライン）。
  - `beginTurn` は `cpuTurn(side)` を呼ぶ → **両サイドをエージェント駆動にできる**。
  - 反応(ブロック/カウンター/効果対象)は既存の `isCPU` 経路で自動解決（`chooseBlocker`/`cpuCounter`/`chooseCard`→`cpuPick`）。block/pickの差し替えはL2で必要になったら追加。
- **アリーナ** … `tests/arena.js`（`node tests/arena.js`）。
  - 2エージェントを同一デッキ(ミラー)でN戦、席を交互入替で先攻バイアス相殺、seed固定で再現可能。
  - 勝率＋相対Eloを出力。健全性確認: **heuristic vs random ≒ 82%(+269Elo)**、**heuristic ミラー ≒ 50%**。

> ★この4点が「探索/学習」をすべて可能にする土台。clone+seed+seamが無いとMCTSもRLも載らない。

---

## 3. L2 決定化MCTS(PIMC)【✅実装済・heuristic を +6〜7pt 上回る】

実装は `src/70-ai.js`。`AGENTS.mcts = { takeTurn: mctsTurn }`。`tests/arena.js` に公平比較を統合済
（`node tests/arena.js` の「L2 MCTS」節。同一seed帯で h-vs-h 基準を引いた差＝実効果）。

### 3.1 不完全情報の扱い＝決定化(determinization)
素のMCTSは真の隠れ状態を見てしまう→ NG。標準解法：
- `determinize(state, side)`：`cloneGameState` で複製 → 相手の `hand`+`deck` を「未知カードの山」とみなし `shuffle` で再配分、
  自分の `deck` もシャッフル（未来ドローの自己カンニング防止）。各サンプルで先読みし結果を集約（= PIMC）。
- 弱点：ブラフ/情報収集の価値を読めない（strategy fusion）。将来 ISMCTS に発展。

### 3.2 採用した探索（マクロ方針のフラットMC）
- 探索単位は **個々の手ではなく「ターンの戦術方針」**（`aggression`∈{high,mid,low}）。
  `heuristicTurn` を方針で打たせ（`G._planOverride`）、決定化して**深さ打ち切り＋密eval `evalState`** までロールアウト→平均で採点。
- **既定は heuristic の自然な方針(`override=null`)。明確に(MARGIN超)上回る方針がある時だけ上書き**＝非退行かつ勝ち越し。
- 調整: `G._mctsRollouts`(既定8)/`G._mctsDepth`(4)/`G._mctsCands`/`G._mctsMargin`(0.05)。増やすほど強いが遅い(~8s/戦)。

### 3.3 ★ハマった罠（再発させない・最重要）
- **per-action探索は効かない**：1手だけ打って残りをheuristicが補完すると候補間の差が消える(masking)。
  逆に「1手打って即パス」を終局報酬で測ると単一手の寄与が分散に埋もれ、過小展開で**heuristicより弱くなる**（実測7〜33%）。
  → 探索単位を「ターン方針」にし密evalで分散を下げ、heuristic自然手をアンカーにして解決。
- **★先読み後の状態復元を `loadGameState(複製)` でやってはいけない**：内容が同一でも**オブジェクト識別子が変わり実プレイが劣化**した
  （clone単体64% → clone+load 28%。原因未特定だが識別子依存）。解決＝**復元は「元オブジェクト参照」をそのまま戻す**
  （`mctsTurn`：`const saved=Object.assign({},G)` 退避 → ロールアウト後 `Object.assign(G,saved)`）。
- **rng隔離**：先読みの `shuffle` が実ゲームの乱数列を撹乱しないよう `rngState()` で退避・復元。
- **連鎖の残留async**：ロールアウトは `endTurn` の投げっぱなし `beginTurn` に頼らず `_noChain`＋明示awaitループで回す
  （残留タスクが実ゲームを汚さない・全microtask完結で外側ポーリングに漏れない）。
- **★★MCTSが非決定的だった根本バグ（最重要）**：同一プロセスで複数局を連続実行すると、**前局の投げっぱなし `beginTurn` 連鎖の
  保留タスクが次局に持ち越して実行**され（次局で `G.winner=null` を見て早期returnせず1ターン余計に走る）、盤面を汚染。
  同一seedでも「その処理で何局目か」で勝敗が変わる＝**今までの測定値(+10/+6.7/+8pt)が全て信用できなかった真因**。
  しかも**自己対戦の学習データも汚染**（1局のサンプルが~28→~73に水増し＝余計なターン）。
  → 解決＝**各局の終了後にイベントループをドレイン**（`for(k<40) await setImmediate` を while後に置く）。
  これで完全に決定的化（同一seed→同一勝敗）。`tools/measure-matchup.js`/`tools/selfplay-train.js`/`tests/arena.js` に導入済。
  ※対戦相手としてのMCTSには無害（むしろ毎回違う手＝良相手）。問題は**測定/学習の再現性**だけ。複数局を回す新ハーネスは必ずドレインを入れる。
- 測定の交絡：seed帯ごとに席バイアスがある。**必ず同一seedで h-vs-h 基準を引いた差**で評価する。N=30はノイズ±9%＝改善判定不能。
  `tools/measure-matchup.js`の**同一seedペア比較＋符号検定**を使う（運の分散が相殺され少Nでも差が見える）。

---

## 4. L3 評価関数の自己対戦学習【🧪experimental・既定off（手作りevalで出荷）】

> **結論（正直に）**: 仕組みは一通り実装でき、リーダー別の勝率予測器（検証精度0.69〜0.84）も学習できた。
> だが **end-to-end(arena) で手作りeval MCTS（+6.7pt・安定）を“確実には”上回らなかった**。学習evalが +10pt 出た
> 計測もあったが N=30 のノイズ(±9%)＋当時のエンジン/データ状態依存で**頑健に再現せず**、エンジンのUI改変で
> 自己対戦データが微変すると学習モデルの当たり外れが出た。→ **既定は手作りeval（`src/ai-weights.js`=null）**で出荷。
> 学習パイプラインは実験基盤として保持。**教訓: N=30では学習eval≒手作りで差は測定限界以下。確実に超えるには §4.2 の重い投資が要る。**

**仕組み（蓄積されるのは“対局”でなく“評価関数の重み”）**：
1. **データ生成**：`tools/selfplay-train.js` が 6リーダー**総当たり（対フィールド）**で heuristic 自己対戦を多数回し、各ターン境界で `evalFeatures(side)` を記録。
2. **ラベル付け（credit assignment）**：各サンプルに「その局でそのsideが勝ったか(1/0)」を付与。1局の勝敗をその局の全盤面に配り、大量平均で「勝ちに繋がる特徴」を抽出。
3. **学習**：純JSのロジスティック回帰（標準化＋全バッチGD）で `P(勝ち|特徴量)` をフィット。標準化を生特徴量の係数へ畳み込み `src/ai-weights.js` へ書き出す。
4. **差し込み**：`evalWinProb(side)` が**そのsideのリーダー用モデル**を引き、内積→sigmoidで勝率を返し `rolloutPlan` の採点に使う（重み無し/未知リーダーは default→手作り`evalState` にフォールバック＝学習前でも動く）。
5. **反復**：強くなった版で自己対戦→再学習で更に強く（螺旋）。

### 4.1 ★リーダー別モデル（戦い方がリーダーで違う問題への対処）
OPCGは**リーダーごとに盤面の価値が違う**（カウンターの切り方/ライフの受け方/攻撃先/タイミング）。そこで:
- **重みをリーダー別に持つ**：`window.AI_WEIGHTS = { byLeader:{ lucy:{w,b}, ace:{...}, … }, default:{w,b}, features, leaderKeys }`。
  `evalWinProb` は `leaderKeyOf(side)`（=`leader.base.leader`）でモデルを選択。
- **特徴量(17)**＝盤面11（ライフ差/自他ライフ/盤面パワー差/キャラ数/手札数/ブロッカー/ドン/アクティブ数/リーダーパワー/手番）＋**相手リーダー one-hot(6)**で**対面(マッチアップ)にも条件付け**。
- **メカニクスの理解は eval でなく実エンジンが担う**：MCTSロールアウトは実エンジンでプレイアウトするので、エネルのランプ/ルーシーのカウンター/ブロッカー/速攻等は**正しくシミュレートされる**。evalが足すのは「リーダー別の盤面価値」。
- 実測(1800局/12.7万サンプル): リーダー別の検証精度は **lucy0.73〜0.76 / hancock0.84 / enel0.78〜0.82 / nami0.69〜0.71** 等（default0.70〜0.71）＝リーダーで価値構造が違うことは学習できている。
  ただし **MCTSへ差し込んでの end-to-end は手作りeval(+6.7pt) を確実には超えず**（上記§4の結論）。学習モデルの当たり外れが大きく、現状は未採用。

### 4.2 差を広げる次手（実験記録つき）
**MCTS(手作りeval)の +6.7pt が安定した到達点**で、L3で“確実に”超えるのは難しかった。安直な改良はいずれも逆効果（記録↓）。

- ❌ **特徴量拡張(17→23)**: 速攻/ダブルアタック/大型/手札カウンター/低コスト/ステージを追加 → **検証精度は同等以上でも end-to-end 悪化**（lucy +10pt→0pt・enel→-4pt／同一seed直接A/B）。理由＝①リッチな線形evalが heuristic分布に過適合しMCTSの訪れる別分布で外挿悪化、②**相手手札ベース特徴**は決定化ロールアウトで相手手札がサンプル→ev​alにノイズ注入。→17に差し戻し。
- ❌ **mcts自己対戦データ混合(DAgger 1反復)**: heuristic1200局＋mcts400局(高速設定rollouts=3)で再学習 → **lucy +10pt→0pt**。理由＝データ生成のmctsが弱設定で「強い分布」になっておらず、評価時の強設定(rollouts=8)と不一致＋val-acc低下(0.76→0.72)＝evalの精度が落ちた。`tools/selfplay-train.js OPCG_MCTS_GAMES` で再現可だが既定0。
- 教訓: **「検証精度≠強さ・アリーナが正」**。改良は必ず**同一seedのA/Bでarena検証**してから採用。安直な特徴追加/データ混合はしない。

**本当に差を広げるには（=実装が重い・compute要）**：
1. **DAgger を正しく**：データ生成のmctsを**評価と同じ強設定**にし、**複数反復**で回す（強い局面分布に揃える）。強設定mctsは~8s/局でheadlessでは数が稼げない＝**要計算資源/並列**。
2. **方策(policy)の学習**：攻撃先/カウンター/ライフ受けのリーダー差を学習しMCTSの候補生成を導く（線形valueの天井を超える本命）。
3. **非線形モデル**（GBM/小NN）。Python学習→重み書き戻し。
4. **マッチアップ完全条件付け**（自分×相手リーダーで分割 or 交互作用）。
※いずれも「quickな1実験」ではなく腰を据えた投資。現状の+10ptは安定した到達点として維持する。

- 制約: `localStorage`不可・`file://`動作 → **学習はNodeオフライン、ブラウザは焼き込んだ重みを読むだけ**。カードプール/環境変動ごとに再学習。
- 再学習: `node tools/selfplay-train.js`（`OPCG_GAMES`で局数調整）。**特徴量(`evalFeatures`)や`LEADER_KEYS`を変えたら必ず再学習**（学習と推論で一致が前提）。

---

## 5. 測定の鉄則
- **アリーナを正とする**：勝率/Eloでしか「強くなった」は言えない。版間でラダー比較。
- 確率＋不完全情報＝高分散。**数百〜数千戦**で評価。席/先攻/デッキを入替えてバイアス相殺。
- 単一の弱い相手(heuristic)だけで測ると過適合する。**多様な相手プール**で測る。

---

## 6. LLM(`callClaude`)の位置づけ
- 用途：解説/意図表示(`aiThink`/`predictCPU`)、探索予算ゼロ時の弱い事前分布、評価特徴の着想。
- 非用途：超人級の強さ本体。Shogi級の道は **探索＋自己対戦学習**であってプロンプトではない。

---

## 7. policy学習への投資（実験記録と現実）— ★heuristicが天井という結論
非決定性バグ修正後の**信頼できる決定的測定**（`tools/measure-matchup.js`）で、探索/学習を一通り試した結論:

| 手法 | 対heuristic（決定的・ペア比較） | なぜ |
|---|---|---|
| MCTS(方針探索 `mcts`) | ±0〜+7.5pt（不安定・deck依存） | heuristicが基本方策＝めったに別手を選ばない |
| 学習eval(L3, value) | MCTS葉評価で ≒手作り | 値はheuristic分布で学習＝heuristic相当 |
| **vlook(価値貪欲方策, Stage A)** | **-5〜-13pt** | 貪欲maximizationが価値関数の誤差を突く |
| **vlook + 学習value** | **さらに悪化(teach -27.5pt, p≈0.06)** | 線形valueは分布外でexploitable |

- `vlook`(`src/70-ai.js`/`AGENTS.vlook`)＝各候補手を「打った後の価値」で評価し最良手を選ぶ価値誘導方策（policy iterationのStage A）。
  決定化で戦闘の隠れ手札を平均、葉=価値。**手作りでも学習でも heuristic に届かず**（貪欲は誤差を突くため）。
- **本質**: MCTS/vlook とも heuristic を基本方策/価値の土台にするので heuristic の判断を大きく覆せない。
  本当に超えるには heuristic の実質評価**より正確で頑健な**価値/方策が要り、それは
  **多反復 policy iteration ＋ 非線形近似（NN/GBM）＋ 大量 self-play ＝ AlphaZero規模**。
  per-game ~数秒のMCTSを vanilla JS/Node headless で回す範囲では数が稼げず、**現実的には Python/GPU/並列が前提**。
- **到達点**: 確実な強さは **「よく調整された heuristic」**（既定で出荷）。MCTSは任意の小さな上積み＋手の多様性。
- **本投資の本当の成果**: ①**MCTS非決定性バグの修正**（§3.3）と②**決定的・精密な測定基盤**（同一seedペア＋符号検定）。
  これが無いと改良の良否を判定できない＝今後どの道を選ぶにも必須の土台。改良は必ずこの測定で有意に勝つ時だけ採用。
- **現実的な次の選択肢**: (A)この水準で固める／(B)**heuristic自体を測定駆動で改良**（最も費用対効果が高い・`measure-matchup`で検証）／
  (C)本格AlphaZero（Python/GPU・腰を据えた別プロジェクト）。

### 7.1 ★heuristic改良の測定駆動ループ（B）— 枠組みと使い方
- **枠組み**: `heur2` エージェント（`src/50-input-cpu-ai.js`・`AGENTS.heur2`＝takeTurnはheuristicと同じ）。各意思決定関数で `isHeur2(side)` で分岐させ、**実験的改良だけ heur2 に入れる**。
  tweak無しなら heur2 ≡ heuristic（measure-matchupで0 flip＝A/Bが無バイアスと確認済）。
- **手順**: ①仮説を `isHeur2` 分岐で実装 → ②`OPCG_AGENT=heur2 OPCG_HERO=<deck> OPCG_VILLAIN=<deck> node tools/measure-matchup.js`（ミラー＝headroom最大）
  → ③**改善/退行のflip＋符号検定**を見て、有意に勝つ時だけ採用（フラグを外し既定化）。負け/中立は却下。
- **★成功した改良（採用済み・既定化）**:
  - **エネルのリーダー効果「レストのドン付与」の付与先**（`src/30-flow-battle.js` leaderActivate enel ②）。
    旧実装は `cpuPick('ownBig')`＝最大パワーを**アタック可否を無視**して選び、付与が当ターン死に（アタック不可キャラへ付与）。
    → **当ターンにリーダーへアタックできる攻撃役を最優先**（付与で連結できる役を優先）に修正。
    **測定（全6対面 N=120・同一seedペア）: +2.5〜+9.2pt・合算 改善76/退行32 → 符号検定 p<0.0001 ★有意**（対ace単体でもp=0.003）。
    ※付与“量”の削減(過剰回避)は逆効果だった（量が減ると連結がカウンターに止められる）→ 量は4のまま、ターゲットだけ修正。
    ★この仮説は**ユーザーの対戦観察**（CPUエネルが付与先を誤る）が源。自動分析では出ない＝**人の知見が最良の仮説源**。
  - **ブロッカー温存の判断**（`src/50-input-cpu-ai.js` `cpuPickAttack`・`oppCanThreatenLethal`）。
    旧実装は「自ライフ≤2」の時だけブロッカーで攻撃を抑制。→ **「相手が次ターンにリーサルを出せるか(盤面リスク)」でも抑制**に拡張
    （ライフに余裕があっても相手盤面が脅威ならブロッカーを寝かせない＝自滅防止）。**弱い正（合算 改善20/退行14・有意な悪化なし・teach対enel +4〜5pt）**。
    ※エネル付与ほど強くない（mirrorは中立、勝率効果は小）が、**観察された不合理（ブロッカー自滅）を直し体感が改善**＋害が無いので採用。ユーザー観察由来。
  - **フリーKO優先**（`src/50-input-cpu-ai.js` `cpuPickAttack`）。**小型キャラが「ドン不要でレストキャラをKOできる」のに2ドン+を付与して顔1点を取る損**を抑制
    （該当リーダー攻撃を-12）。低相手ライフ(+20/+30加点)では顔殴りのまま＝詰めは優先。**プローブで挙動確認**（相手ライフ5/4→KO、3→顔殴り）。
    自己対戦は**改善4/退行1・有意な害なし**（場面が稀なので勝率効果は小だが観察された損を直す）。★ユーザー観察由来。回帰テストは`tests/ai-core.js`。
- **却下した実験（heuristicは多くの部分で近似最適）**:
  - #1 aggression（盤面リード時に攻勢）: **0 flip＝手を変えない**（aggressionは弱レバー）。
  - #2 mulligan厳格化: ハーネスで**発火せず**（mulliganは`startGame`内で`agent`未設定時に走る。要 startGame へagent引数追加）。
  - #3 レスト非ブロッカーKO価値: 7→3で**悪化(-6pt teach)**、7→11で**中立**＝**元の7が最適**。
- **学び**: 単一パラメータの手調整では超えられないが、**具体的なミス（観察由来）をピンポイントで直すと有意に効く**。勝てる改良の源は①ユーザーのプレイ観察 ②負け局のリプレイ分析(`tools/analyze-heuristic.js`)。ループは完成・即iterable。
- 既知の改善点: mulligan系tweakを測れるよう `startGame(meDeck,cpuDeck,meAgent,cpuAgent)` へ agent 引数を足す。

## 8. AlphaZero型の足場（Stage A/B/C）— JS規模で全段を実装・測定した記録
「価値NN(A)→方策NN(B)→自己対戦反復(C)」をvanilla JS（外部依存なし・`file://`互換の純JS順伝播/バックプロップ）で**全段実装し、決定的測定（`tools/measure-matchup.js`・同一seedペア＋符号検定）で正直に評価**した。結論を先に書くと **全段とも heuristic を超えない**（A=着手不変／B=中立／C=有意に退行）。これは§0/§7の「ポーカー型＋JS規模では heuristic が天井」を実機で裏取りしたもの。**足場（前向きモデル・エージェントseam・方策ネット・反復ループ・測定器・回帰テスト）は完成**し、本気で超えるなら Python/GPU へそのまま移植できる。

### 8.1 Stage A：NN(MLP)価値関数 〔実装済・着手を変えない〕
- 実装: `src/70-ai.js` `mlpForward`／学習 `tools/selfplay-train.js` `trainMLP`（標準化→隠れ1層ReLU→sigmoid・BCE・ミニバッチSGD+モメンタム・決定論的init）。`OPCG_MODEL=mlp OPCG_HIDDEN=24` で線形と切替。`src/ai-weights.js` は MLP形式 `{type:'mlp',mean,std,W1,b1,W2,b2}` も持てる（`pickModel`/`evalWinProb`がNN/線形/手作りを自動判別）。
- **勝率予測器としては改善**: 検証精度 enel 0.66→**0.81**・default 0.68→0.70（lucy/aceは線形が僅か上）。
- **だが実戦は不変（測定が正）**: MCTS葉評価＝**学習=手作り・正味flip 0・±0.0pt**（teach/enel両視点 N=40）。`vlook`（価値貪欲）は線形もMLPも**完全同一の壊滅 -58pt**（mid-turn状態で価値が飽和→候補が同点→最初の手）。→**価値を学習で差し替えてもMCTSの着手はほぼ変わらない**（探索が支配・§7の「めったに別手を選ばない」）。
- 既定は `AI_WEIGHTS=null`（手作りeval出荷）。インフラはB/Cで再利用。

### 8.2 Stage B：per-action 方策ネット（アタックprior）〔実装済・中立〕
- 着眼: 最も戦略的な**アタック着手**だけを学習対象に、候補手(各attack＋stop)を共通次元 `polFeatures`(16次元) で表し softmax でランクする per-action 方策ネット。
- 実装: `src/70-ai.js` `polFeatures`/`mlpLogit`/`policyPickAttack`/`AGENTS.npolicy`（heuristicTurnのアタック相だけ `G._polAttack` 分岐で方策ネットに差し替え・未学習なら `cpuPickAttack` フォールバック＝退行しない）。学習 `tools/train-policy.js`（heuristicの選択を全候補つきBC収集→softmax-CEで学習→`src/ai-policy.js`。`window.AI_POLICY`を`70-ai`より前にロード）。回帰は `tests/ai-core.js`（polFeatures次元・フォールバックnull・npolicy完走）。
- 学習結果: 720局/18941サンプル、**top1=0.79〜0.92**（heuristicのアタックを高精度に蒸留）。
- 強さ: **npolicy ≈ heuristic**（teach +3.3pt/enel +1.7pt・**いずれも非有意** p=0.69/1.00・flipわずか）。退行なし＝足場として機能。「学習 vs 手作り +0.0pt/0flip」は **npolicyが価値重みを使わずAI_POLICYのみ依存**の健全性確認。
- **本質**: 教師=heuristicの蒸留なので原理的に≈heuristic（想定どおり）。超えるには**教師がheuristicより強い**必要があり、それがStage C。

### 8.3 Stage C：自己対戦【反復】ループ（DAgger）〔実装済・★有意に退行＝価値が教師に足りない実機証明〕
- 実装: `tools/selfplay-iterate.js`。1世代=①**生徒**(現方策ネット)で自己対戦し状態分布を作る→②各アタック判断で**教師**=`improvedAttack`(`src/70-ai.js`・1-ply価値先読み＝各候補を決定化クローンに適用し`evalWinProb`で評価し最良)が正解ラベルを出す(DAgger)→③(状態,教師ラベル)で方策ネット再学習→`src/ai-policy.js`更新→④`measure-matchup`で強さ測定、を繰り返す。`AGENTS.npimprove`＋`G._polImprove`分岐（src/50）。決定境界・ドレイン・元参照復元はL2/A/Bと同じ規律。
- 結果（2世代×120局）: 世代0(方策なし=heuristic)72.5% → **世代1で47.5%（teach 対h -25.0pt・改善3/退行13・p=0.021 ★有意な退行）**。教師の **top1がわずか0.49〜0.68**（Stage Bの0.79〜0.92より大幅低＝**教師自身が状態間で矛盾＝不安定**）。世代2はDAgger自己対戦が重く 590s harness上限で打ち切り（既定GAMESを80に下げた）。
- **根本原因**: 教師=1-ply価値先読みは、mid-attack状態で価値が不正確/exploitable（**vlook崩壊と同根**）→ラベルがノイズ→方策がノイズを蒸留→退行。**価値関数がgreedy改善の"教師"になるほど頑健でない**。これがStage Cが退行する理由＝**自己対戦反復で教師を超えるには「強い探索(>1-ply)＋頑健な深層価値/方策＋大量self-play」が必須**。
- 出荷状態: 退行する世代1方策は採用せず、`src/ai-policy.js`は**Stage Bの中立方策(720局)に戻す**。npolicy/npimproveは opt-in 実験エージェント（既定CPUは heuristic のまま）。

### 8.4 総括（A/B/Cを終えての結論）
- **全段を実機で実装・測定した**：A=着手不変／B=中立／C=有意に退行。**確実な強さは依然「よく調整された heuristic」**（§7と一致・既定で出荷）。
- **足場は完成**：前向きモデル(`clone/loadGameState`)・エージェントseam(`AGENTS`)・価値NN(`mlpForward/trainMLP`)・方策NN(`polFeatures/policyPickAttack/train-policy`)・反復ループ(`improvedAttack/selfplay-iterate`)・決定的測定器・回帰(`tests/ai-core.js`)。**Pythonへの移植は「同じ特徴量・同じ着手API・同じ測定」で1:1にできる**。
- **JSで超えられない理由の確定**：①探索が1-ply/マクロ方針止まり（深いPUCT木が無い）②価値/方策が小さな線形/MLPで mid-state にexploitable ③self-playの局数が桁違いに足りない。**①②③を同時に満たすのがAlphaZero規模＝Python/GPU**。次の一歩はそこ（§7-(C)）。

## 9. Python/GPU 版（AlphaZero ルート）— 着手・進捗
JS版で天井(§8)を確定したのを受け、**heuristicを実際に超える本命ルート**に着手。詳細・実行手順は `pytorch/README.md`。

### 9.1 構成（エンジン=JSのまま橋でつなぐ）
264枚fxを持つ検証済みエンジンをPython再実装は非現実的。よって **engine=JS(真実源)** を保ち:
`自己対戦=Node(tools/az-export.js) → 学習=PyTorch/MPS(pytorch/train.py) → 推論=JS(mlpForward/mlpLogit)`。
特徴量(evalFeatures17/polFeatures16)も重み形式({type,mean,std,W1,b1,W2,b2})もJSと完全一致（meta.json でDRY）。

### 9.2 ✅ Phase 1（橋の検証・完了）
- `tools/az-export.js`(Node→JSON) ＋ `pytorch/train.py`(PyTorch/MPS→JS重み) 実装。
- 400局/value9578・policy10451 で **MPS(GPU)学習が走り、JSが重みをロードして動作**（`tests/ai-core.js` pass)。精度はJS版同等。
- 教師=heuristic段階なので強さ≈heuristic（橋の検証が目的）。出荷src/は無改変。

### 9.3 ✅ Phase 2 part1（本物のper-action探索・完了／★崩壊しない初の探索）
- `AGENTS.puct`（`src/70-ai.js` `puctTurn`/`puctSearch`/`rolloutAfterTurn`/`priorScore`）。
  **①方策ネット(prior)で候補を上位Wに絞る → ②各候補を「適用→heuristicで残りを打つ→相手LOOKターン→価値」で決定化K回平均評価 → ③最良の第1手を実行**、を1手ずつ再探索。既定 det=3/look=1/width=5。
- **核心＝評価は必ず【ターン境界の価値】**（look=1で次の自分手番開始＝価値ネットの学習分布）。これが **vlook崩壊(-58pt)/Stage C退行(-25pt)を回避**。
- 既定設定(det3/look1/w5)の測定（同一seedペア・N=120）: teach +7.5pt / enel -3.3pt → ≈heuristic（中立）だが崩壊しない。
- **★深さプローブ（`tools/puct-depth-probe.js`・同一seedで h / base / strong を打ち比べ）= 探索計算を増やすと強くなるか**:
  strong=det6/look2/w6 で測定（N=60/視点）:
  - **teach: puct-strong 対h +13.3pt（改善11/退行3 p=0.057＝ほぼ有意）**／base +6.7pt → **strong vs base +6.7pt**
  - enel(20%の不利マッチ): puct-strong 対h -1.7pt（中立）／base -6.7pt → **strong vs base +5.0pt**
  - **結論＝探索を深くすると両視点で一貫して強くなる（strong>base: +6.7/+5.0pt）＝計算でスケール＝AlphaZeroの前提が実機で成立**。
    teachは明確な正（+13pt）、enelは不利デッキ差を覆せず中立（探索はマッチ差は変えない・その中で最善）。
  - ★これは**JS実装で初めてheuristicを実測で明確に上回ったエージェント**（teach）。崩壊せず・深さで伸びる＝正しい土台。
- 位置づけ: opt-in（既定CPUはheuristic）。強くするには `G._puctDet`/`G._puctLook`/`G._puctWidth` を上げる（遅くなるが強い）。
  **Phase 2 self-play の探索substrate**＝この探索が改善した手/勝敗を学習目標に prior/value を鍛えれば、同じ計算でさらに強くなる（part2）。

### 9.4 ✅ Phase 2 part2：puct 自己対戦【反復】ループ（完了・★出荷可能な有意の改善）
`tools/selfplay-puct.js`（Node自己対戦→PyTorch/MPS学習→JS反映→測定→反復）。**Stage C が退行した真因＝弱い教師(1-ply価値)**を、**崩壊しない強い教師＝puct自身の探索が選んだ手**に置換。
- **データ生成**: puct 自己対戦で各アタック判断の【puctが選んだ手】を方策ターゲットに記録（`src/70-ai.js` puctTurn の `G._puctRecSink`）。重いので CHUNK 分割（590s上限回避）。
- **学習**: PyTorch/MPS（`pytorch/train.py AZ_POLICY_ONLY=1`）で policy だけ再学習（value は手作りで最適のため据え置き）。
- **安定化（必須だった）**:
  - **replay buffer**（世代横断でデータ蓄積・直近MAXBUF）＝発散抑制。
  - **★per-leader gating**（`OPCG_GATE_LEADERS`）＝リーダーごとに「そのリーダーをheroにした測定で改善した時だけ」その byLeader モデルを採用。**単一マッチアップgatingは過適合**（teachに特化させ enel を有意に退行 -12.5pt p=0.041 させた実測）→ per-leader で回避。
- **結果（実機・決定的測定）**:
  - 自己対戦1世代で **teach の puct が +6.7→+16.7pt（改善5/退行0・p=0.016〜0.063）** に跳ねた＝**Stage C と違い強い教師では反復が機能**（AlphaZero が効いた実機証明）。方策top1は0.43と低い（puctの手は探索で多様＝模倣困難）が、**prior は高精度でなく"良い手へ探索を誘導"できれば強くなる**＝AlphaZeroの本質どおり。
  - per-leader gating が **teach=自己対戦強モデル / enel=Stage B** を別々に採用 → 合成方策の最終確認（N=80）: **teach +16.3pt（16/3 p=0.004★有意）/ enel ±0.0pt（11/11・退行なし）**。
  - **＝プロジェクト初の、出荷可能な統計的有意の heuristic 超え**（teach 有意・enel 中立で退行なし）。`src/ai-policy.js` を合成方策で出荷（puct の prior。既定CPU=heuristic は ai-policy を使わないので既定プレイは不変）。
- **学び**: ①自己対戦反復は **強い教師(=探索)＋gating＋replay buffer** が揃って初めて効く（弱い教師=Stage Cは退行）。②gating は **per-leader/複数マッチアップ** でないと特化して別マッチを壊す（測定で発覚・修正）。③`improvedAttack`(1-ply)はStage C用に残すが、強い教師は puct の境界価値。

### 9.5 Phase2 part3：value も自己対戦で学習してみた → ✗ 手作りeval の方が強い（採用せず）
`tools/selfplay-puct.js OPCG_TARGET=value`（`pytorch/train.py AZ_VALUE_ONLY=1`・per-leader gating を value にも一般化）。
puct自己対戦の【ターン境界の盤面特徴＋最終勝敗】で value NN を学習し、puctの葉評価を手作りevalから置換できるか試した。
- **測定の注意**: `measure-matchup` は puct測定時に手作りarmで `AI_WEIGHTS=null` 化するので、value効果は **「学習 vs 手作り」flip** に出る（そこをgating指標に）。
- **結果（N=30・per-leader gating）**: teach/enel とも **学習valueは手作りに負け**（net=teach -4/-5, enel -7/-6）→ **全棄却**、`src/ai-weights.js` は手作り(null)のまま。
- **結論**: **手作り evalState が puct の境界評価として既に優秀**（Stage A と整合＝学習value ≈/< 手作り）。**puct を強くするのは policy(prior) であって value ではない**。
  ＝小データ・小ネットの学習valueは、よく調整された手作りevalを超えられない（この規模では）。gating が正しく退行を全棄却＝出荷は安全。

### 9.6 Phase2 part4：policy gating を全6リーダー(ミラー)へ拡張 → ★5/6リーダーで有意の大勝＋enelの真の弱点を発見
`tools/selfplay-puct.js OPCG_GATE_LEADERS='lucy:lucy,...,enel:enel'`（全6リーダーをミラーでgating・現方策から継続）。
- **★最重要発見＝ミラー(公平な同型対戦)で測ると puct の真の実力が出る**。これまでの teach:enel / enel:teach は**デッキ相性で勝率が圧縮**され実力差を隠していた。ミラー実測（最終確認 N=40・全6）:
  | リーダー | puct 対h(ミラー) | p |
  |---|---|---|
  | **lucy** | **+45.0pt(20/2)** | 0.000★ |
  | **teach** | **+27.5pt(13/2)** | 0.007★ |
  | **ace** | **+25.0pt(12/2)** | 0.013★ |
  | **nami** | **+25.0pt(11/1)** | 0.006★ |
  | **hancock** | **+20.0pt(10/2)** | 0.039★ |
  | **enel** | **±0.0pt(フォールバック)** | — |
- **＝6リーダー中5つで heuristic を統計的有意に +20〜45pt 上回る**（part2の「teach単独」から大きく前進）。
- **★enel の真の弱点を発見**: enel(ドン循環エンジン)はミラー実測で **puct 対h -29.2pt(1/8 p=0.039)**＝**探索がランプ機構を壊す**（他5は+16〜46pt）。enel:teach が不利マッチで「中立」に見え隠れていた。
  → **対処（測定駆動）**: `src/70-ai.js` `PUCT_SKIP={enel:1}`＝**puctはenelでは素のheuristicにフォールバック**（`G._puctNoSkip`で無効化可）。enelは退行ゼロ・他は強い。
- gating結果: lucy/ace が自己対戦で更に微増(lucy +50pt)→採用。nami/hancock/teach は高いベースライン維持。enel は全モデル退行で **Stage B に復元**（puctがフォールバックするので enel policy は npolicy 用のみ）。
- 出荷: `src/ai-policy.js` = lucy/ace(part4自己対戦改善)+teach(part2)+nami/hancock/enel(Stage B)。**既定CPU=heuristicは不変**、puctはopt-in（enelは内部でheuristic）。

### 9.7 Phase2 part5：enel探索修正の試み（✗）＋ UIトグル追加（✅）
- **enel修正の試み（✗ 容易には直らず・フォールバック維持）**:
  - 仮説①「ランプを過小評価」→ **探索前にenelランプを確定実行**を試す → enelミラー -23pt（変化なし）。
  - 仮説②「look=1が近視眼でenelの長期計画を見ない」→ **look=3**を試す → enelミラー -29pt（変化なし）。
  - **結論＝enelの弱さは ramp/look ではなく「手作りvalueがenelのランプ/コントロール局面を正しく評価できない」根本**（part3で学習valueも手作り未満と判明済＝valueを直す道も塞がっている）。
    enelを直すには **enel特化の盤面評価 or 戦略知識** が要る（研究タスク）。**現状は heuristicフォールバック(`PUCT_SKIP={enel:1}`)が正しい安全解**（enel退行ゼロ）。試した変更は撤回。
- **✅ UIトグル追加**: デッキ選択画面に「CPU強さ: 標準 / 強い(AI探索)」（`src/60-screens-init.js` `setCpuStrength`/`doStart`）。
  「強い」＝`G.players.cpu.agent='puct'`（enelは内部でheuristicにフォールバック）。**これで part1-4 の強いCPUが実プレイで使える**。
- **到達点（確定）**: **puct は5/6リーダーで heuristic を有意に +20〜45pt 上回る強いCPU**（enelのみフォールバック）。UIから「強い(AI探索)」で有効化。
- ⏭ **part6候補**: ①**多手先のPUCT木**（現状1手再探索）＋方策ターゲット=訪問数分布 ②enel専用の盤面評価（フォールバック解除）③大データ・深ネット・2ヘッドで value 再挑戦。
- 限界（正直に）: 16GB/8コア/MPS単機は数百万局に届かない。それでも part1-4 で「探索＋自己対戦＋gating」が **5リーダー +20〜45pt(有意)** を達成＝**正しい構造なら天井(≈heuristic)を明確に超える**ことを実証。残りは規模拡大と enel 個別対応。
