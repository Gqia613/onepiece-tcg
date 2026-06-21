# Python/GPU 版（AlphaZero 型）— 強いCPUへの本命ルート

JS版の足場（`docs/ai-design.md §8`）で「価値/方策を学習で差し替えても heuristic を超えない」ことが実機で確定した。
理由は **①探索が浅い（1-ply/マクロ方針）②ネットが小さく mid-state に exploitable ③self-play 局数が桁違いに足りない**。
本ディレクトリは ①②③ を同時に解く **Python/GPU(Apple MPS)** パイプライン。

## 設計（エンジンはJSのまま＝真実源）

264枚のカードfxを持つ検証済みエンジンを Python に再実装するのは非現実的・高リスク。よって **engine=JS** を保ち、橋でつなぐ:

```
[自己対戦] Node (tools/az-export.js)            ← エンジン再利用・並列・決定的(seed/ドレイン)
    │  pytorch/data/{value.json, policy.json, meta.json}
    ▼
[学習]   PyTorch + MPS (pytorch/train.py)        ← value/policy をGPUで学習（JSより大きいネットが可能）
    │  pytorch/out/{ai-weights.js, ai-policy.js}  （JSの重み形式と完全一致）
    ▼
[推論]   JS (src/70-ai.js mlpForward/mlpLogit)    ← 重みを読み戻して対局・探索で使用
```

- 特徴量は JS と完全一致（`evalFeatures`=17 / `polFeatures`=16）。`meta.json` 経由で名前を渡し DRY。
- 重み形式も JS と完全一致（`{type:'mlp'|'policy', mean,std,W1,b1,W2,b2}`）。`AZ_INSTALL=1` で `src/` に反映。

## 使い方

```bash
# 0) 依存（初回のみ・済）: python3 -m venv pytorch/.venv && pytorch/.venv/bin/pip install torch numpy
# 1) 自己対戦データ生成（Node・エンジン真実源）
OPCG_GAMES=400 node tools/az-export.js
# 2) 学習（MPS=Apple GPU）。pytorch/out/ に書き出し（src/は触らない＝安全）
AZ_VH=32 AZ_PH=24 AZ_EPOCHS=500 pytorch/.venv/bin/python pytorch/train.py
# 3) src/ に反映して対局/測定で使う場合
AZ_INSTALL=1 pytorch/.venv/bin/python pytorch/train.py
node tests/test.js                                   # 回帰（JSがPyTorch重みをロードして動く）
OPCG_AGENT=npolicy node tools/measure-matchup.js     # 強さ測定（同一seedペア＋符号検定）
```

`pytorch/.venv` `pytorch/data` `pytorch/out` は `.gitignore` 済（venv/データ/中間出力はコミットしない）。

## 進捗

### ✅ Phase 1（完了）— 橋の検証
- `tools/az-export.js`（Node→JSON）・`pytorch/train.py`（PyTorch/MPS→JS重み）を実装。
- 400局/value 9578・policy 10451 サンプルで学習。**MPS(GPU)で学習が走り、JSが重みをロードして動作**（`tests/ai-core.js` pass=20 fail=0）。
- 精度は JS版と同等（value acc 0.69〜0.92 / policy top1 0.78〜0.91）。**この段階は教師=heuristicなので強さは ≈heuristic**（橋の検証が目的）。

### ✅ Phase 2 part1（本物のper-action探索・完了）— ★崩壊しない初の探索
- `AGENTS.puct`（`src/70-ai.js`）。**方策ネット(prior)で候補を絞り → 各候補を「適用→heuristicで残りを打つ→相手LOOKターン→価値」で決定化K回平均評価 → 最良の第1手を実行**、を1手ずつ再探索。
- **核心＝評価は必ずターン境界の価値**（look=1＝次の自分手番開始＝価値ネット学習分布）。これで **vlook崩壊(-58pt)/Stage C退行(-25pt)を回避**。
- 測定（同一seedペア N=120）: **teach +7.5pt(p=0.15) / enel -3.3pt(p=0.61)** ＝ **≈heuristic（中立）だが崩壊しない・teachは弱い正**。
- 使い方: `OPCG_AGENT=puct node tools/measure-matchup.js`。対人UIは `G.players.cpu.agent='puct'`（既定はheuristic）。

### ⏭ Phase 2 part2（次・heuristic超えの鍵）
1. **探索を深く強く**: puctの sims/width/look を上げ、**多手先の木**へ（現状は1手再探索）。teach +7.5pt が有意に届くかを `measure-matchup` で測る。
2. **方策ターゲット = puct の訪問数分布**（heuristicの選択ではなく「探索が改善した手」）。`az-export.js` を puct 版に。
3. **value=自己対戦の最終結果＋policy/value 2ヘッド深層ネット**（`train.py` 多層化）。JS推論を `layers:[{W,b,act}]` 対応に拡張。
4. **反復**: self-play(puct) → 学習(MPS) → 重み更新 → 強い方策で再self-play。各世代 `measure-matchup` で検証。

### 想定と限界（正直に）
- 16GB/8コア/MPS の単機では **AlphaZero の「数百万局」には届かない**。狙うのは数万局規模の小型AlphaZero。
- それでも **①深いPUCT探索 ②MPSで大きめのネット ③探索改善した方策ターゲット** が揃えば、JS版（≈heuristic 天井）を**超える可能性がある**。
  超えられるかは Phase 2 を `measure-matchup` の決定的測定で検証して初めて分かる（「検証精度≠強さ・測定が正」は JS版と同じ鉄則）。
