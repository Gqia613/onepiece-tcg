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

### ⏭ Phase 2（次・ここが heuristic を超える鍵）
1. **本物の per-action PUCT 木探索を JS に実装**（`src/70-ai.js`）。prior=policyネット, leaf=valueネット, 不完全情報は **determinize(PIMC/IS-MCTS)**。
   既存の「1-ply / マクロ方針」を置換。探索数（sims/move）で強さが伸びる本物の探索。
2. **方策ターゲット = PUCT の訪問数分布**（heuristicの選択ではなく「探索が改善した手」）。`az-export.js` を PUCT 版に。
3. **value ターゲット = 自己対戦の最終結果**（既に対応）。**policy/value 2ヘッド・共有trunk**の深いネットへ（`train.py` を多層化）。
4. **反復**: self-play(PUCT) → 学習(MPS) → 重み更新 → 強くなった方策で再 self-play。各世代 `measure-matchup` で検証。
5. JS推論を**多層対応**に拡張（`mean,std,layers:[{W,b,act}]`）。深いネットを載せる。

### 想定と限界（正直に）
- 16GB/8コア/MPS の単機では **AlphaZero の「数百万局」には届かない**。狙うのは数万局規模の小型AlphaZero。
- それでも **①深いPUCT探索 ②MPSで大きめのネット ③探索改善した方策ターゲット** が揃えば、JS版（≈heuristic 天井）を**超える可能性がある**。
  超えられるかは Phase 2 を `measure-matchup` の決定的測定で検証して初めて分かる（「検証精度≠強さ・測定が正」は JS版と同じ鉄則）。
