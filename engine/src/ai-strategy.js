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
