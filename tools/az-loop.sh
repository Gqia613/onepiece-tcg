#!/bin/bash
# tools/az-loop.sh — AlphaZero反復ループ(段階A)。クラウドでそのまま回す本体。
#   各世代: ①self-play(puct strong・現生盤面value葉)→boardTensor+勝敗 ②value学習(生盤面・深いNN)
#           ③gating(新value puct vs 手作りをmeasure)→改善なら採用/退行なら巻き戻し
#   単機テスト: OPCG_GENS=1 OPCG_GAMES=40 bash tools/az-loop.sh
#   クラウド:   OPCG_GENS=20 OPCG_GAMES=2000 OPCG_PAR=32 bash tools/az-loop.sh
#   ★単機で悪化した「鶏と卵」を、深い探索(strong)＋gating(改善世代のみ採用)＋計算規模で突破できるか検証。
set -e
cd "$(dirname "$0")/.."
GENS=${OPCG_GENS:-3}
GAMES=${OPCG_GAMES:-120}
PY=${OPCG_PY:-pytorch/.venv/bin/python}
HERO=${OPCG_HERO:-teach}; VILLAIN=${OPCG_VILLAIN:-enel}; GN=${OPCG_GATE_N:-20}

echo "▶ AlphaZero反復ループ: $GENS 世代 × self-play $GAMES局 (gating: $HERO vs $VILLAIN N=$GN)"

# 初期value: 既に生盤面valueが pytorch/out にあればそれを葉に、無ければ手作りから1世代学習で作る
if [ -f pytorch/out/ai-weights.js ] && grep -q '"inputType":"board"' pytorch/out/ai-weights.js; then
  cp pytorch/out/ai-weights.js src/ai-weights.js
  echo "  初期value=既存の生盤面value(out)を葉に設定"
else
  echo "  初期value=手作り(生盤面valueが無いので世代1のself-playは手作り葉のpuctで開始)"
fi

best=""
for ((g=1; g<=GENS; g++)); do
  echo "===== 世代 $g/$GENS ====="
  # ① self-play(puct strong・現src/ai-weights.js を葉に)→ pytorch/data/value.json(boardTensor+勝敗)
  OPCG_GAMES=$GAMES node tools/selfplay-value.js
  # ② value学習(生盤面・深いNN) → pytorch/out/ai-weights.js
  AZ_VALUE_ONLY=1 AZ_BOARD=1 AZ_VHS=64,32 AZ_EPOCHS=300 $PY pytorch/train.py | grep -E "default acc" || true
  # ③ gating: 新value を葉にして puct学習 vs 手作り を測定
  cp src/ai-weights.js /tmp/az-prev-$$.js 2>/dev/null || true
  cp pytorch/out/ai-weights.js src/ai-weights.js
  echo "--- gating measure(世代$g の新value) ---"
  line=$(OPCG_AGENT=puct OPCG_N=$GN OPCG_HERO=$HERO OPCG_VILLAIN=$VILLAIN node tools/measure-matchup.js | grep "学習 vs 手作り" | head -1 || true)
  echo "  $line"
  # 改善判定(学習 vs 手作りが +pt か): 退行が大きければ前世代へ巻き戻し
  pt=$(echo "$line" | sed -E 's/.*学習 vs 手作り: ([+-][0-9.]+)pt.*/\1/')   # 「学習 vs 手作り」のptを正しく抽出(行頭のpuct対hでなく)
  if [ -n "$pt" ] && awk "BEGIN{exit !($pt < -5)}"; then
    echo "  ⚠ 世代$g は退行($pt pt) → 前世代に巻き戻し(gating)"
    [ -f /tmp/az-prev-$$.js ] && cp /tmp/az-prev-$$.js src/ai-weights.js
  else
    echo "  ✓ 世代$g 採用($pt pt)"
    cp src/ai-weights.js "pytorch/out/ai-weights-gen$g.js" 2>/dev/null || true
    best=$g
  fi
done
rm -f /tmp/az-prev-$$.js
echo "▶ 完了。最終採用世代=$best (各世代は pytorch/out/ai-weights-genN.js)"
