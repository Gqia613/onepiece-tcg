/* src/ai-weights.js — L3: 自己対戦で学習した盤面評価の重み（window.AI_WEIGHTS）。
   ★現在は null＝手作りeval/heuristic で動作（確実に強い）。`tools/selfplay-train.js` で学習すると byLeader 形式の重みが入る。

   ■結論（★非決定性バグ修正後の“信頼できる”決定的測定に基づく・正直に）:
   このシミュレーターでは **「よく調整された heuristic」が実用上の天井**。試した探索/学習は全て heuristic に ≒ か 劣る:
     ・MCTS(方針探索)        : 対heuristic ±0〜+7.5pt（不安定・deck依存）。heuristicが基本方策なのでめったに別手を選ばない。
     ・学習eval(L3, value)    : MCTSの葉評価では ≒手作り（±0〜2.5pt）。
     ・vlook(価値貪欲方策)    : 対heuristic -5〜-13pt。**貪欲は価値関数の誤差を突く**ため劣化。
     ・vlook + 学習value      : さらに悪化（teachミラー -27.5pt, p≈0.06）。線形valueは分布外でexploitable。
   ＝heuristicの実質評価より「正確で頑健な」価値/方策が要り、それは多反復policy iteration＋非線形＋大量self-play
     ＝AlphaZero規模。vanilla JS/Node の計算資源では現実的に届かない（Python/GPU/並列が前提）。
   → 確実な強さは heuristic（既定）。MCTSは任意の小さな上積み＋手の多様性。学習eval/vlook は experimental（既定off）。
   ■鉄則: 改良は必ず `tools/measure-matchup.js`【決定的・同一seedペア比較・符号検定】で有意に勝つ時だけ採用する。 */
window.AI_WEIGHTS = null;
