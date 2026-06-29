# クラウドでAlphaZero反復（段階B/C）セットアップ手順

AlphaZero本格（生盤面value＋深い探索＋自己対戦反復）を、クラウドの多コアCPU＋GPUで回す手順。
単機では value↔探索の「鶏と卵」で悪循環（CLAUDE.md §8 part7）。**多世代＋大規模で改善するか**をクラウドで検証する。

> ⚠ **正直な前提**: 多世代で改善する保証はない（囲碁/将棋＝完全情報・最適化エンジンで成立した前提が、OPCG＝不完全情報・決定化・JS遅い で成立するかは未知）。**必ず段階B（数万円）で兆しを見てから段階C（数十万円）へ**。

---

## 0. 何が要るか
- **self-play**: Node engine（多コアCPU）。これが主コスト（JS遅い）。
- **学習**: PyTorch（GPU・MPSでなくCUDA）。データ少・NN中で軽い。
- 1インスタンスに「多コアCPU＋GPU」があれば完結（Vast.ai/RunPodで選べる）。

## 1. 推奨クラウドとインスタンス
- **Vast.ai**（最安・スポット）/ **RunPod**（UIが楽）。
- 選ぶスペック: **CPU 32コア以上 ＋ GPU 1枚（RTX3090/4090で十分）**。self-playがCPU律速なのでコア数優先。
- 目安料金: CPU多コア＋GPUで $0.5〜1.5/時。

## 2. 環境構築（インスタンス起動後・SSH）
```bash
# Node 20+（self-play用）
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
# リポジトリ
git clone <このリポジトリのURL> opcg && cd opcg
# PyTorch（CUDA）venv
python3 -m venv pytorch/.venv
pytorch/.venv/bin/pip install torch   # CUDA版が自動で入る環境を選ぶ
# 動作確認（単機と同じ1世代テスト）
OPCG_GENS=1 OPCG_GAMES=40 OPCG_GATE_N=12 bash tools/az-loop.sh
```
※ `pytorch/train.py` は `mps` が無ければ自動で `cpu`/`cuda` にフォールバック（DEV判定）。CUDAを使うなら train.py の DEV を `cuda` 優先に1行調整。

## 3. 段階B（まず数万円・5〜10世代で兆しを見る）
```bash
OPCG_GENS=8 OPCG_GAMES=2000 OPCG_PAR=32 OPCG_GATE_N=40 bash tools/az-loop.sh 2>&1 | tee az-B.log
```
- 各世代の `gating measure(世代N の新value)` 行を追う。
- **判定**: 「学習 vs 手作り」のptが、世代を追って **−から0、0から+へ動く兆し**があるか。
  - 兆しあり → 段階Cへ（投資価値あり）。
  - 全世代−のまま横ばい → **撤退**（鶏と卵がこの規模/手法では解けない＝数万円の損で確定）。

## 4. 段階C（兆しが出たら・数十万円・数十世代）
```bash
OPCG_GENS=40 OPCG_GAMES=8000 OPCG_PAR=64 OPCG_GATE_N=80 bash tools/az-loop.sh 2>&1 | tee az-C.log
```
- 採用された各世代は `pytorch/out/ai-weights-genN.js`。最強世代を `src/ai-weights.js` に。
- ローカルに持ち帰り `node tools/measure-matchup.js` で最終確認 → 良ければ出荷（既定CPUに採用 or opt-in）。

## 5. 主要な環境変数（tools/az-loop.sh）
| 変数 | 意味 | 段階B例 | 段階C例 |
|---|---|---|---|
| `OPCG_GENS` | 反復世代数 | 8 | 40 |
| `OPCG_GAMES` | 1世代のself-play局数 | 2000 | 8000 |
| `OPCG_PAR` | self-play並列数(=CPUコア-1) | 32 | 64 |
| `OPCG_GATE_N` | gating測定の局数/hero | 40 | 80 |
| `OPCG_PUCT_DET/LOOK/WIDTH` | 探索の深さ(strong) | 6/2/6 | 6/3/8 |

## 6. コスト早見（今日の実測 puct 120局/1.6分・7コア基準）
| 段階 | 局数×世代 | self-play時間(32コア) | 目安 |
|---|---|---|---|
| B | 2000×8 | 約3〜5時間 | **1〜3万円** |
| C | 8000×40 | 約60〜100時間 | **数十万円** |

※ JS engineが遅いのが律速。C++移植すれば10〜100倍速いがfx264枚は非現実的（CLAUDE.md §9.1）。

---

## 仕組み（tools/az-loop.sh の1世代）
1. `selfplay-value.js`: puct(深い探索)で自己対戦 → 各ターン境界の `boardTensor`＋最終勝敗を `value.json` に
2. `train.py`(AZ_BOARD=1): 生盤面value(深いNN)を学習 → `pytorch/out/ai-weights.js`
3. gating: 新valueを葉にして `measure-matchup`(puct vs 手作り) → 退行(<-5pt)なら前世代へ巻き戻し
4. 次世代へ（採用されたvalueが次のself-playの葉になる＝value↔探索が一緒に強くなる狙い）
