/* cards-fx.js — Phase3で実装したカード効果(fx)。番号→fx の対応表。
   index.html が <script src> で読み込み、src/00-data.js の mergeCardDB が起動時に C の各カードへ付与する（dataOnly を解除）。
   全カードの効果fxをここに集約（src/00-data.js の def() からも移行済み）。fxは「プレーンなopオブジェクト」で書く。
   op語彙は docs/opcg-effect-system-design.md §12（最新の全op一覧）と doOp を参照。公式テキストと一致を確認済みのものだけ追加する。
   costMod/condRush/condBlocker は fx と同階層のメタキー（mergeCardDB が base へ持ち上げる）。
   現在: 検証用3枚 + OP-16(100枚) + OP-15(82枚)。 */
window.CARD_FX = {
  /* ===== リーダーのデータ駆動フック（onAllyEnter 等。従来は src/30 にハードコード） ===== */
  // OP11-041 ナミ:【自分のターン中】【ターン1回】ライフが離れた時、手札7枚以下なら1ドロー ／【ドン‼×1】【相手のアタック時】【ターン1回】手札1枚を捨てて、このリーダーはこのターン中パワー+2000
  "OP11-041": {"onLifeLeave":{"when":"selfTurn","anyLife":true,"once":"turn","optional":true,"cond":{"selfHandAtMost":7},"fx":[{"op":"draw","n":1}]},"onOppAttack":[{"op":"cond","once":"turn","check":"donX1","then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"leaderBuff","amount":2000,"duration":"turnEnd"}]}]}]},
  // OP14-041 ボア・ハンコック: 相手のターン中に自分のキャラが登場した時、1ドロー（ターン1回制限なし）
  "OP14-041": {"onAllyEnter":{"when":"oppTurn","fx":[{"op":"draw","n":1}]},"onAllyLeave":{"ko":true,"once":"turn","cond":"donX1","filter":{"minPower":5000,"traits":["アマゾン・リリー","九蛇海賊団"]},"fx":[{"op":"oppLifeToHand","n":1,"optional":true}]}},
  /* ----- 同名・別Noのリーダー（番号キーで実装。curatedの短縮キーとは独立＝誤適用なし） ----- */
  // ST29-001 モンキー・Ｄ・ルフィ(エッグヘッド/四皇): 【アタック時】自分のライフが2枚以下なら1ドローし手札1枚を捨てる
  "ST29-001": {"onAttack":[{"op":"cond","check":"life<=2","then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP16-001 ポートガス・Ｄ・エース: 【起動メイン】【ターン1回】自分のパワー8000以上の「モンキー・Ｄ・ルフィ」か《白ひげ海賊団》キャラ1枚までにこのターン中【速攻】
  "OP16-001": {"act":{"label":"P8000+のルフィ/白ひげに速攻","cost":{},"fx":[{"op":"giveKeyword","kw":"rush","target":"chooseOwn","filter":{"minEffPower":8000,"or":[{"name":"モンキー・Ｄ・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]}}]}},
  // OP11-040 ルフィ(麦わら): ターン開始時、場のドン8以上ならデッキ上5枚から《麦わら》1枚を手札へ（残りはデッキ下＝並び替え選択は簡略）
  "OP11-040": {"onTurnStart":{"cond":{"donAtLeast":8},"fx":[{"op":"search","look":5,"filter":{"traitIncludes":"麦わらの一味"},"count":1}]}},
  // OP13-001 ルフィ: 【ドン×1】【相手のアタック時】アクティブドン5以下なら、ドン任意レスト→1枚ごとにリーダー/《麦わら》1枚を このバトル中+2000
  "OP13-001": {"onOppAttack":[{"op":"restDonForBuff","amount":2000,"filter":{"traitIncludes":"麦わらの一味"},"cond":{"and":["donX1Self",{"activeDonAtMost":5}]}}]},
  // OP07-038 ハンコック: 【自分のターン中】【ターン1回】キャラが自分の効果で場を離れた時、手札5枚以下なら1ドロー
  "OP07-038": {"onAllyLeave":{"when":"selfTurn","once":"turn","cause":"ownEffect","cond":{"selfHandAtMost":5},"fx":[{"op":"draw","n":1}]}},
  // OP05-098 エネル: 【相手のターン中】【ターン1回】自分のライフが0になった時、デッキ上1枚をライフに加え、その後手札1枚を捨てる
  "OP05-098": {"onLifeZero":{"when":"oppTurn","once":"turn","fx":[{"op":"lifeAddFromDeck","n":1},{"op":"discardOwn","n":1}]}},
  // OP03-040 / P-117 ナミ: デッキ0で勝利＋【ドン×1】このリーダーのアタックで相手ライフにダメージ時、自分のデッキ上1枚をトラッシュしてもよい（自爆デッキ）
  "OP03-040": {"static":[{"op":"deckOutWin"}],"onLeaderHitLife":{"cond":"donX1Self","fx":[{"op":"deckTrashCost","n":1,"then":[]}]}},
  "P-117": {"static":[{"op":"deckOutWin"}],"onLeaderHitLife":{"cond":"donX1Self","fx":[{"op":"deckTrashCost","n":1,"then":[]}]}},
  /* ----- 既存フックに載る未実装リーダーの追加実装（hot pathに触れずcards-fx.jsのみ） ----- */
  // OP02-001 エドワード・ニューゲート(白ひげ): 【自分のターン終了時】自分のライフ上1枚を手札に加える
  "OP02-001": {"onTurnEnd":[{"op":"lifeToHand"}]},
  // OP02-049 エンポリオ・イワンコフ: 【自分のターン終了時】手札0枚なら2ドロー
  "OP02-049": {"onTurnEnd":[{"op":"draw","n":2,"cond":{"selfHandAtMost":0}}]},
  // OP01-031 光月おでん: 【起動メイン】【ターン1回】手札の《ワノ国》1枚を捨てられる：ドン!!2枚までアクティブ
  "OP01-031": {"act":{"label":"ワノ国捨て:ドン2アクティブ","cost":{},"fx":[{"op":"discardCost","filter":{"traitIncludes":"ワノ国"},"count":1,"then":[{"op":"donActivate","n":2}]}]}},
  // OP02-072 ゼット: 【アタック時】ドン!!-4：相手のコスト3以下キャラ1枚までKO、その後このリーダーをこのターン中+1000（KO対象がいる時のみ＝ドン浪費防止）
  "OP02-072": {"onAttack":[{"op":"cond","check":{"oppChar":{"maxCost":3}},"then":[{"op":"donMinus","n":4},{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true},{"op":"leaderBuff","amount":1000}]}]},
  // OP02-093 スモーカー: 【ドン!!×1】【起動メイン】【ターン1回】相手キャラ1枚までこのターン中コスト-1。その後コスト0のキャラがいればこのリーダー+1000
  "OP02-093": {"act":{"label":"相手コスト-1→0なら自分+1000","cost":{},"fx":[{"op":"cond","check":"donX1Self","then":[{"op":"addCostBuff","side":"opp","amount":-1,"count":1,"optional":true},{"op":"cond","check":{"oppChar":{"maxCost":0}},"then":[{"op":"leaderBuff","amount":1000}]}]}]}},
  // OP03-022 アーロン: 【ドン!!×2】【アタック時】①：手札からコスト4以下の【トリガー】持ちキャラ1枚までを登場
  "OP03-022": {"onAttack":[{"op":"cond","check":"donX2","then":[{"op":"restDonCost","n":1,"then":[{"op":"playCharFromHand","maxCost":4,"needsTrigger":true,"count":1,"optional":true}]}]}]},
  /* ----- 軽量リーダー バッチ1（既存フック/op/condのみ・src非干渉） ----- */
  // OP04-019 ペローナ: 【自分のターン終了時】ドン!!2枚までアクティブ
  "OP04-019": {"onTurnEnd":[{"op":"donActivate","n":2}]},
  // OP09-001 ゾロ十郎: 【ターン1回】相手がアタックした時、相手のリーダーかキャラ1枚までを このターン中 パワー-1000
  "OP09-001": {"onOppAttack":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"includeLeader":true,"optional":true,"once":"turn"}]},
  // EB01-040 ニコ・ロビン: 【起動メイン】【ターン1回】自ライフ上1枚を表向きにできる：相手のコスト0キャラ1枚までKO
  "EB01-040": {"act":{"label":"ライフ表→相手コスト0をKO","cost":{},"fx":[{"op":"lifeCost","action":"faceUp","then":[{"op":"ko","side":"opp","maxCost":0,"count":1,"optional":true}]}]}},
  // ST01-001 ルフィ(ST): 【起動メイン】【ターン1回】リーダーか自キャラ1枚にレストのドン!!1枚まで付与
  "ST01-001": {"act":{"label":"レストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  // ST03-001 クロコダイル(L): 【起動メイン】【ターン1回】ドン!!-4：コスト5以下キャラ1枚を持ち主の手札に戻す
  "ST03-001": {"act":{"label":"ドン-4:コスト5以下を手札へ","cost":{},"fx":[{"op":"donMinus","n":4},{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}]}},
  // ST05-001 / _r1 シャンクス(FILM): 【起動メイン】【ターン1回】ドン!!-3：自《FILM》全てを このターン中 パワー+2000
  "ST05-001": {"act":{"label":"ドン-3:FILM全+2000","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"powerMod","side":"self","all":true,"amount":2000,"filter":{"traitIncludes":"FILM"}}]}},
  "ST05-001_r1": {"act":{"label":"ドン-3:FILM全+2000","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"powerMod","side":"self","all":true,"amount":2000,"filter":{"traitIncludes":"FILM"}}]}},
  // P-047 ボルサリーノ: 【ドン!!×1】【アタック時】自分の手札が3枚以下なら1ドロー
  "P-047": {"onAttack":[{"op":"cond","check":"donX1Self","then":[{"op":"draw","n":1,"cond":{"selfHandAtMost":3}}]}]},
  // P-076 つる: 【起動メイン】【ターン1回】手札の《海軍》1枚を捨てられる：相手キャラ1枚までを このターン中 コスト-1
  "P-076": {"act":{"label":"海軍捨て:相手コスト-1","cost":{},"fx":[{"op":"discardCost","filter":{"traitIncludes":"海軍"},"count":1,"then":[{"op":"addCostBuff","side":"opp","amount":-1,"count":1,"optional":true}]}]}},
  // ST09-001 おでん(L): 【ドン!!×1】【相手のターン中】自ライフ2枚以下ならこのリーダー パワー+1000（常在）
  "ST09-001": {"static":[{"op":"condBuff","cond":{"and":["donX1Self","oppTurn","life<=2"]},"power":1000}]},
  // OP08-021 ネコマムシ: 【起動メイン】【ターン1回】自《ミンク族》がいる場合、相手のコスト5以下キャラ1枚までレスト
  "OP08-021": {"act":{"label":"ミンク族で相手コスト5以下レスト","cost":{},"fx":[{"op":"cond","check":{"selfChar":{"traitIncludes":"ミンク族"}},"then":[{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}]}]}},
  // OP05-041 サボ: 【起動メイン】【ターン1回】手札1枚捨て：1ドロー ／【アタック時】相手キャラ1枚まで このターン中 コスト-1
  "OP05-041": {"act":{"label":"手札1捨て1ドロー","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"draw","n":1}]}]},"onAttack":[{"op":"addCostBuff","side":"opp","amount":-1,"count":1,"optional":true}]},
  // ST07-001 ハンコック(L): 【ドン!!×2】【アタック時】ライフ上下1枚を手札に加えられる：ライフ2以下なら手札1枚をライフ上へ
  "ST07-001": {"onAttack":[{"op":"cond","check":"donX2","then":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"cond","check":"life<=2","then":[{"op":"handToLife","optional":true}]}]}]}]},
  /* ----- 軽量リーダー バッチ2（既存フック/op/condのみ・src非干渉） ----- */
  // OP06-021 サー・クロコダイル: 【起動メイン】【ターン1回】以下から1つ：相手コスト4以下1枚レスト／相手キャラ1枚コスト-1
  "OP06-021": {"act":{"label":"レスト or コスト-1を選ぶ","cost":{},"fx":[{"op":"chooseOption","options":[{"label":"相手コスト4以下を1枚レスト","fx":[{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}]},{"label":"相手キャラ1枚をコスト-1","fx":[{"op":"addCostBuff","side":"opp","amount":-1,"count":1,"optional":true}]}]}]}},
  // ST06-001 ドフラミンゴ(L): 【起動メイン】【ターン1回】③＋手札1枚捨て：相手コスト0キャラ1枚までKO
  "ST06-001": {"act":{"label":"③＋手札捨て:相手コスト0KO","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"discardCost","count":1,"then":[{"op":"ko","side":"opp","maxCost":0,"count":1,"optional":true}]}]}]}},
  // OP09-042 バギー: 【起動メイン】自ドン5枚レスト＋手札1捨て：手札の《クロスギルド》キャラ1枚まで登場
  "OP09-042": {"act":{"label":"ドン5レスト＋捨て:クロスギルド登場","cost":{},"fx":[{"op":"restDonCost","n":5,"then":[{"op":"discardCost","count":1,"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"クロスギルド"},"count":1,"optional":true}]}]}]}},
  // EB02-010 ルフィ(麦わら): 【起動メイン】【ターン1回】ドン!!-2：自キャラが《麦わら》のみならドン2アクティブ＋次相手ターン終了まで+1000
  "EB02-010": {"act":{"label":"ドン-2:麦わらのみでドン2＋自+1000","cost":{},"fx":[{"op":"donMinus","n":2},{"op":"cond","check":{"allSelfChar":{"traitIncludes":"麦わらの一味"}},"then":[{"op":"donActivate","n":2},{"op":"leaderBuff","amount":1000,"duration":"untilNextEnd"}]}]}},
  // ST12-001 ルフィ(L): 【ドン!!×1】【アタック時】【ターン1回】コスト2以上キャラ手札に戻す：自パワー7000以下1枚アクティブ
  "ST12-001": {"onAttack":[{"op":"cond","check":"donX1Self","once":"turn","then":[{"op":"bounceOwnCharCost","filter":{"minCost":2},"then":[{"op":"activateOwnChar","filter":{"maxEffPower":7000},"count":1,"optional":true}]}]}]},
  // ST10-001 ロー(L): 【起動メイン】【ターン1回】ドン!!-3：相手パワー3000以下1枚をデッキ下＋手札からコスト4以下キャラ登場
  "ST10-001": {"act":{"label":"ドン-3:相手をデッキ下＋登場","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"deckBottom","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true},{"op":"playCharFromHand","maxCost":4,"count":1,"optional":true}]}},
  // EB01-021 マゼラン(EB): 【自分のターン終了時】コスト2以上《インペルダウン》1枚を手札に戻せる：ドンデッキからアクティブ追加
  "EB01-021": {"onTurnEnd":[{"op":"bounceOwnCharCost","filter":{"minCost":2,"traitIncludes":"インペルダウン"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP07-079 ブルック: 【アタック時】デッキ上2枚をトラッシュできる：相手キャラ1枚までコスト-1
  "OP07-079": {"onAttack":[{"op":"deckTrashCost","n":2,"then":[{"op":"addCostBuff","side":"opp","amount":-1,"count":1,"optional":true}]}]},
  // OP12-001 ボニー: 【起動メイン】【ターン1回】手札のイベント2枚を公開できる：自元々パワー4000以下1枚を このターン中+2000
  "OP12-001": {"act":{"label":"イベ2公開:自P4000以下+2000","cost":{},"fx":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1,"filter":{"maxPower":4000}}]}]}},
  // OP07-019 たしぎ: 【相手のアタック時】【ターン1回】①：相手のリーダーかキャラ1枚までレスト
  "OP07-019": {"onOppAttack":[{"op":"restDonCost","n":1,"once":"turn","then":[{"op":"restChar","side":"opp","count":1,"includeLeader":true,"optional":true}]}]},
  // OP14-040 ジンベエ(L): 【起動メイン】手札1枚捨て：《魚人族》か《人魚族》のリーダーかキャラ1枚にレストのドン2付与
  "OP14-040": {"act":{"label":"捨て:魚人/人魚にレストのドン2付与","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"donAttach","target":"chooseOwn","n":2,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}}]}]}},
  /* ----- 軽量リーダー バッチ3（既存opチェーン・src非干渉） ----- */
  // OP03-077 シャーロット・リンリン: 【ドン!!×2】【アタック時】②＋手札1捨て：自ライフ1以下ならデッキ上1枚をライフに加える
  "OP03-077": {"onAttack":[{"op":"cond","check":"donX2","then":[{"op":"restDonCost","n":2,"then":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":"life<=1","then":[{"op":"lifeAddFromDeck","n":1}]}]}]}]}]},
  // OP06-080 ペローナ(SB): 【ドン!!×1】【アタック時】②＋手札1捨て：デッキ上2枚トラッシュ→トラッシュのコスト4以下《スリラーバーク海賊団》1枚登場
  "OP06-080": {"onAttack":[{"op":"cond","check":"donX1Self","then":[{"op":"restDonCost","n":2,"then":[{"op":"discardCost","count":1,"then":[{"op":"deckToTrash","n":2},{"op":"reviveFromTrash","maxCost":4,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]}]}]}]},
  // OP08-002 ベガパンク: 【ドン!!×1】【起動メイン】【ターン1回】1ドロー＋手札1枚をデッキ下へ、その後相手キャラ1枚まで このターン中 パワー-2000
  "OP08-002": {"act":{"label":"1ドロー＋手札デッキ下→相手-2000","cost":{},"fx":[{"op":"cond","check":"donX1Self","then":[{"op":"draw","n":1},{"op":"handToBottom","n":1},{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]}]}},
  // OP08-057 ステューシー: 【起動メイン】【ターン1回】ドン!!-2：以下から1つ（手札5以下で1ドロー／相手キャラ1枚 コスト-2）
  "OP08-057": {"act":{"label":"ドン-2:ドロー or コスト-2","cost":{},"fx":[{"op":"donMinus","n":2},{"op":"chooseOption","options":[{"label":"手札5以下で1ドロー","fx":[{"op":"draw","n":1,"cond":{"selfHandAtMost":5}}]},{"label":"相手キャラをコスト-2","fx":[{"op":"addCostBuff","side":"opp","amount":-2,"count":1,"optional":true}]}]}]}},
  // OP06-001 シャンクス(FILM): 【アタック時】手札の《FILM》1枚を捨てられる：相手キャラ1枚まで このターン中 パワー-2000、その後ドンデッキからレスト追加
  "OP06-001": {"onAttack":[{"op":"discardCost","filter":{"traitIncludes":"FILM"},"count":1,"then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"rest"}]}]},
  // P-086 ロー(P): 【起動メイン】【ターン1回】ドン!!-3＋自パワー3000以上1枚をデッキ下：手札のコスト4以下《ハートの海賊団》1枚登場
  "P-086": {"act":{"label":"ドン-3＋自デッキ下:ハート登場","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"deckBottomOwnCharCost","filter":{"minEffPower":3000},"then":[{"op":"playCharFromHand","filter":{"maxCost":4,"traitIncludes":"ハートの海賊団"},"count":1,"optional":true}]}]}},
  // OP10-002 ロー(PH): 【ドン!!×2】【アタック時】自コスト2以上《パンクハザード》1枚を手札に戻せる：相手パワー4000以下1枚KO
  "OP10-002": {"onAttack":[{"op":"cond","check":"donX2","then":[{"op":"bounceOwnCharCost","filter":{"minCost":2,"traitIncludes":"パンクハザード"},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}]}]},
  /* ===== index.html def() から移行した効果（一元化） ===== */
  // OP05-077 ガンマナイフ(イベント/紫/コスト2/ハートの海賊団): 公式 tcg-portal/cardrush で照合
  // 【メイン】ドン!!-1：相手のキャラ1枚までを、このターン中、パワー-5000。 【トリガー】ドン!!デッキからドン!!1枚までを、アクティブで追加する。
  "OP05-077": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-5000,"count":1,"optional":true}]},"trigger":[{"op":"donFromDeck","n":1,"mode":"active"}]},
  /* ===== 【ブロック時】(onBlock) — onBlockフック整備に伴い公式テキストで実装（blockerは text由来でmergeCardDBが付与） ===== */
  // OP05-036 モネ:【ブロック時】相手のコスト4以下のキャラ1枚までを、レストにする。
  "OP05-036": {"onBlock":[{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}]},
  // OP12-033 ヘルメッポ:【ブロック時】相手のコスト5以下のキャラ1枚までを、レストにする。
  "OP12-033": {"onBlock":[{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}]},
  // OP02-110 ヒナ:【ブロック時】相手のコスト6以下のキャラ1枚までを選ぶ。選んだキャラは、このターン中、アタックできない。
  "OP02-110": {"onBlock":[{"op":"setAttackBan","side":"opp","maxCost":6,"count":1,"optional":true}]},
  // EB04-053 戦桃丸:【ブロック時】自分のライフが2枚以下の場合、カード1枚を引く。
  "EB04-053": {"onBlock":[{"op":"draw","n":1,"cond":"life<=2"}]},
  // OP10-077 ベラミー:【ブロック時】自分のドン‼2枚をレストにできる：ドン!!デッキからドン!!1枚までを、アクティブで追加する。
  "OP10-077": {"onBlock":[{"op":"restDonCost","n":2,"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP01-014 ジンベエ:【ドン‼×1】【ブロック時】手札からコスト2以下の赤のキャラ1枚までを登場
  "OP01-014": {"onBlock":[{"op":"cond","check":"donX1Self","then":[{"op":"playCharFromHand","filter":{"maxCost":2,"color":"赤"},"count":1,"optional":true}]}]},
  // OP01-039 キラー:【ドン‼×1】【ブロック時】自分のキャラが3枚以上いる場合、1ドロー
  "OP01-039": {"onBlock":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfCharCount":{"min":3}}]}}]},
  "OP01-039_r1": {"onBlock":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfCharCount":{"min":3}}]}}]},
  // OP01-078 ボア・ハンコック:【ドン‼×1】【アタック時】/【ブロック時】自分の手札が5枚以下なら1ドロー
  "OP01-078": {"onAttack":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfHandAtMost":5}]}}],"onBlock":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfHandAtMost":5}]}}]},
  "OP01-078_r1": {"onAttack":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfHandAtMost":5}]}}],"onBlock":[{"op":"draw","n":1,"cond":{"and":["donX1Self",{"selfHandAtMost":5}]}}]},
  // OP05-036_r1 モネ(再録): OP05-036と同一
  "OP05-036_r1": {"onBlock":[{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}]},
  // ST05-004 ウタ:【ブロック時】ドン‼-1：相手のコスト5以下のキャラ1枚までを、レストにする。
  "ST05-004": {"onBlock":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}]},
  "ST05-004_r1": {"onBlock":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}]},
  // OP01-111 ブラックマリア:【ブロック時】ドン‼-1：このターン中、このキャラはパワー+1000。
  "OP01-111": {"onBlock":[{"op":"donMinus","n":1},{"op":"powerMod","target":"self","amount":1000}]},
  // OP05-047 バジル・ホーキンス:【ブロック時】自分の手札が3枚以下なら1ドロー。その後このキャラはこのバトル中パワー+1000。
  "OP05-047": {"onBlock":[{"op":"cond","check":{"selfHandAtMost":3},"then":[{"op":"draw","n":1},{"op":"powerMod","target":"self","amount":1000,"battle":true}]}]},
  // OP06-009 シュライヤ:【アタック時】/【ブロック時】【ターン1回】このキャラは次の自分のターン開始時まで相手リーダーと同じパワーになる（once:'turn'は両タイミング共有）。
  "OP06-009": {"onAttack":[{"op":"setPower","target":"self","valueFrom":"oppLeaderPower","duration":"untilNextStart","once":"turn"}],"onBlock":[{"op":"setPower","target":"self","valueFrom":"oppLeaderPower","duration":"untilNextStart","once":"turn"}]},
  // ST09-007 しのぶ:【ブロック時】自分のライフの上か下から1枚を手札に加えられる：このキャラはこのバトル中パワー+4000。
  "ST09-007": {"onBlock":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"powerMod","target":"self","amount":4000,"battle":true}]}]},
  // ST03-003 クロコダイル:【ドン‼×1】【ブロック時】コスト2以下のキャラ1枚までを、持ち主のデッキの下に置く（公式は相手除去用途。deckBottom=相手対象）。
  "ST03-003": {"onBlock":[{"op":"cond","check":"donX1Self","then":[{"op":"deckBottom","maxCost":2,"optional":true}]}]},
"OP15-067": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1}]},
  "OP15-061": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1}],"onAttack":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"cond":"don<=6"}]},
  "OP15-066": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1}],"onAttack":[{"op":"scry","n":2,"cond":"don<=6"}]},
  "OP15-063": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1}],"onKO":[{"op":"ko","side":"opp","maxEffPower":2000,"count":1,"optional":true,"cond":"don<=6"}]},
  "OP12-071": {"onPlay":[{"op":"search","look":4,"filter":{"type":"EVENT"}}]},
  "OP15-060": {"static":[{"op":"condBuff","cond":"don<=6","power":2000,"immune":true}],"act":{"label":"ドン-1:ブロッカー付与","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"giveKeyword","target":"self","kw":"blocker","duration":"untilNextEnd"},{"op":"discardOwn","n":1}]}},
  "OP15-118": {"static":[{"op":"condBuff","cond":"don<=6","power":2000,"immune":true}],"onPlay":[{"op":"donMinus","n":1},{"op":"search","look":5,"filter":{}},{"op":"discardOwn","n":1}]},
  "OP15-076": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderNameIncludes":"エネル"},"then":[{"op":"draw","n":1},{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000}]}},
  "OP15-074": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderNameIncludes":"エネル"},"then":[{"op":"draw","n":1},{"op":"addCostBuff","side":"self","amount":2,"count":1,"optional":true,"duration":"untilNextEnd"}]}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000}]}},
  "OP15-075": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderNameIncludes":"エネル"},"then":[{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true},{"op":"ko","side":"opp","maxEffPower":3000,"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000}]}},
  "OP15-077": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"draw","n":1},{"op":"lock","side":"opp","maxEffPower":6000,"count":1,"restedOnly":true,"optional":true}]}},
  "OP15-078": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"draw","n":1},{"op":"restChar","side":"opp","maxEffPower":5000,"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":1000},{"op":"cond","check":"don<=6","then":[{"op":"draw","n":1}]}]}},
  "OP15-070": {"static":[{"op":"grantUnblockable","names":["シュラ"],"self":true},{"op":"setPowerOppTurn","names":["シュラ"],"self":true,"power":6000}]},
  "OP15-069": {"static":[{"op":"leaveProtect","pay":"donToDeck"}]},
  "OP15-040": {"onPlay":[{"op":"search","look":3,"filter":{"trait":"ドレスローザ"}}]},
  "OP15-053": {"onPlay":[{"op":"search","look":3,"filter":{"trait":"ドレスローザ"}}]},
  "OP10-045": {"onAttack":[{"op":"draw","n":2,"once":"turn"},{"op":"discardOwn","n":1}]},
  "OP15-047": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn"}]},
  "OP15-044": {"onKO":[{"op":"search","look":3,"filter":{"trait":"ドレスローザ","type":"EVENT"}}]},
  "OP15-046": {"onPlay":[{"op":"playEventFromHand","cond":{"leaderTrait":"ドレスローザ"},"filter":{"trait":"ドレスローザ","type":"EVENT"}}]},
  "OP15-021": {"costMod":{"cond":{"trashCount":{"filter":{"type":"EVENT"},"min":4}},"amount":-3},"main":{"don":0,"fx":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"battle":true,"optional":true}]}},
  "OP15-054": {"main":{"don":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"ルーシー"},"then":[{"op":"chooseOption","options":[{"label":"2ドロー・1捨て・ドレスローザ登場","fx":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"playCharFromHand","count":1,"optional":true,"filter":{"maxCost":4,"trait":"ドレスローザ"}}]},{"label":"ステージ1枚を持ち主の手札に戻す","fx":[{"op":"bounceStage","optional":true}]}]}]}]}},
  "OP04-056": {"main":{"don":0,"fx":[{"op":"deckBottom","count":1,"optional":true}]},"trigger":[{"op":"deckBottom","count":1,"maxCost":4,"optional":true}]},
  "OP15-020": {"main":{"don":0,"fx":[{"op":"powerMod","side":"self","amount":3000,"count":1,"leader":true},{"op":"powerMod","side":"opp","amount":-8000,"count":1,"optional":true,"duration":"untilNextEnd"},{"op":"discardCost","count":2,"then":[{"op":"ko","side":"opp","count":1,"optional":true,"filter":{"maxEffPower":0}}]}]}},
  "OP15-056": {"main":{"don":0,"fx":[{"op":"draw","n":2},{"op":"leaderDoubleAttack","amount":3000,"cond":{"leaderNameIncludes":"ルーシー"}}]}},
  "OP15-057": {"onPlay":[{"op":"cond","check":"leaderDressrosa","then":[{"op":"draw","n":1}]}],"onOppAttack":[{"op":"restSelfCost","then":[{"op":"discardCost","count":1,"filter":{"or":[{"type":"EVENT"},{"type":"STAGE"}]},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1,"leader":true,"battle":true,"optional":true}]}]}]},
  "OP15-042": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderNameIncludes":"レベッカ"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]}],"onKO":[{"op":"selfToHand"}]},
  "OP13-016": {"onPlay":[{"op":"search","look":4,"filter":{"minCost":3}}]},
  "ST22-002": {"onPlay":[{"op":"search","look":5,"count":1,"optional":true,"filter":{"traitIncludes":"白ひげ海賊団","nameExcludes":"イゾウ"}}],"onOppAttack":[{"op":"trashSelfCost","cpuSkip":true,"then":[{"op":"draw","n":1},{"op":"bottomOwn","n":1}]}]},
  "PRB02-008": {"onKO":[{"op":"draw","n":2}]},
  "PRB02-015": {"static":[{"op":"staticKeyword","kw":"blocker","cond":"leaderBH"},{"op":"staticCost","amount":4,"cond":"leaderBH"}],"onKO":[{"op":"cond","check":"leaderBH","then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]},
  "OP13-043": {"onPlay":[{"op":"cond","check":"life<=3","then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  "OP13-054": {"onPlay":[{"op":"cond","check":"life<=3","then":[{"op":"draw","n":2},{"op":"donAttach","target":"leader","n":1}]}]},
  "ST23-001": {"costMod":{"cond":{"selfChar":{"minEffPower":10000}},"amount":-4}},
  "OP08-047": {"onPlay":[{"op":"bounceOwnCharCost","excludeSelf":true,"then":[{"op":"bounce","side":"any","maxCost":6,"count":1,"optional":true}]}]},
  "OP13-042": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donAttach","target":"leaderAndChar","n":2}]},
  "OP08-043": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTrait":"白ひげ海賊団"},{"lifeAtMost":2}]},"then":[{"op":"attackTax","side":"opp","n":2,"duration":"untilNextEnd"}]}]},
  "OP09-118": {"static":[{"op":"winOnBlockLife0"}]},
  "EB02-006": {"act":{"label":"リーダーにドン付与+速攻","cost":{},"fx":[{"op":"cond","check":{"or":[{"leaderTrait":"ワノ国"},{"leaderNameIncludes":"ポートガス"}]},"then":[{"op":"donAttach","target":"leader","n":1},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]}},
  "ST22-015": {"main":{"don":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"playSpecificFromHand","name":"エドワード・ニューゲート","choose":true,"optional":true},{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]}]}},
  "OP13-057": {"main":{"don":0,"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":"life<=1","then":[{"op":"denyBlockerVsLeader"}]}]}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":3000}]}},
  "OP11-054": {"onPlay":[{"op":"draw","n":3},{"op":"bottomOwn","n":2}]},
  "EB03-053": {"onPlay":[{"op":"donAttach","target":"leader","n":1},{"op":"cond","check":"oppLife>=3","then":[{"op":"oppLifeToHand","n":1,"optional":true}]}],"onKO":[{"op":"flipLifeUp"},{"op":"playCharFromHand","maxPower":6000,"optional":true}]},
  "EB04-058": {"onPlay":[{"op":"cond","check":"life<=2","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  "OP14-102": {"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  "OP14-103": {"onPlay":[{"op":"lifeSwap","n":1}],"trigger":[{"op":"playSelf"}]},
  "EB03-055": {"onPlay":[{"op":"lifeCost","action":"trash","then":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"lifeAddFromDeck","n":2}]}]}],"onKO":[{"op":"cond","check":"oppTurn","then":[{"op":"oppDamage","n":1,"optional":true}]}]},
  "ST17-004": {"onPlay":[{"op":"scry","n":3},{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"traitIncludes":"王下七武海"}}]},
  "OP08-050": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2}]},
  "OP06-101": {"onPlay":[{"op":"giveKeyword","target":"chooseOwnL","kw":"banish","duration":"turn"}],"trigger":[{"op":"ko","side":"opp","maxCost":5,"count":1,"optional":true}]},
  "OP14-105": {"act":{"label":"手札3公開:全体にレストドン1","cost":{},"fx":[{"op":"revealCost","count":3,"filter":{"traits":["アマゾン・リリー","九蛇海賊団"]},"then":[{"op":"donAttachAll","n":1,"incLeader":true}]}]},"trigger":[{"op":"cond","check":{"leaderTrait":"九蛇海賊団"},"then":[{"op":"playSelf"}]}]},
  "OP14-104": {"onPlay":[{"op":"chooseOption","options":[{"label":"登場させる","fx":[{"op":"reviveFromTrash","maxCost":4,"filter":{"trait":"スリラーバーク海賊団"}}]},{"label":"ライフの上に表向きで加える","fx":[{"op":"trashToLife","maxCost":4,"trait":"スリラーバーク海賊団","faceUp":true,"optional":true}]}]}],"trigger":[{"op":"reviveFromTrash","maxCost":4}]},
  "OP15-113": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"lifeAddFromDeck","n":1,"optional":true}]}]},
  "OP14-112": {"onPlay":[{"op":"cond","check":"leaderShichibukai","then":[{"op":"lifeAddFromDeck","n":1},{"op":"oppLifeToHand","n":1}]}],"trigger":[{"op":"playCharFromHand","filter":{"maxPower":6000},"needsTrigger":true,"count":1,"optional":true}]},
  "OP07-057": {"main":{"don":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"count":1,"leader":true,"optional":true,"filter":{"trait":"王下七武海"}},{"op":"giveKeyword","target":"chooseOwnL","kw":"unblockable","duration":"turn","filter":{"trait":"王下七武海"}}]},"trigger":[{"op":"draw","n":1}]},
  "OP14-114": {"act":{"label":"九蛇のリーダー/キャラにレストドン1","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"traitIncludes":"九蛇海賊団"}}]},"trigger":[{"op":"cond","check":{"leaderTrait":"九蛇海賊団"},"then":[{"op":"playSelf"}]}]},
  "OP11-060": {"main":{"don":0,"fx":[{"op":"cond","check":"leaderMulti","then":[{"op":"search","look":5,"filter":{"trait":"麦わらの一味"}}]}]},"trigger":[{"op":"cond","check":"leaderMulti","then":[{"op":"search","look":5,"filter":{"trait":"麦わらの一味"}}]}]},
  "OP14-106": {"trigger":[{"op":"playSelf"}]},
  "OP14-107": {"onPlay":[{"op":"cond","check":"oppLife<=3","then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}],"trigger":[{"op":"cond","check":{"leaderTrait":"九蛇海賊団"},"then":[{"op":"playSelf"}]}]},
  "OP14-108": {"onPlay":[{"op":"cond","check":"leaderMulti","then":[{"op":"cond","check":"oppLife<=3","then":[{"op":"ko","side":"opp","maxPower":7000,"count":1,"optional":true}]}]}],"trigger":[{"op":"cond","check":"leaderMulti","then":[{"op":"cond","check":"oppLife<=3","then":[{"op":"ko","side":"opp","maxPower":7000,"count":1,"optional":true}]}]}]},
  "OP14-109": {"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  "OP14-113": {"onPlay":[{"op":"search","look":5,"filter":{"traits":["アマゾン・リリー","九蛇海賊団"]}},{"op":"discardOwn","n":1}],"trigger":[{"op":"cond","check":{"leaderTrait":"九蛇海賊団"},"then":[{"op":"playSelf"}]}]},
  "OP12-119": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"lifeAddFromDeck","n":1,"optional":true},{"op":"addCostBuff","target":"self","amount":2,"duration":"untilNextEnd"}]}],"onKO":[{"op":"cond","check":"oppTurn","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  "OP07-115": {"counter":{"cost":0,"fx":[{"op":"cond","check":"life<=2","then":[{"op":"counterBuff","amount":3000}]}]},"trigger":[{"op":"reviveFromTrash","maxCost":5,"filter":{"traitIncludes":"エッグヘッド"}}]},
  "OP06-106": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"handToLife"}]}]},
  "P-096": {"onPlay":[{"op":"draw","n":1},{"op":"discardOwn","n":1}],"act":{"label":"「ナミ」にレストのドン付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"nameIncludes":"ナミ"}}]}},
  "OP15-052": {"static":[{"op":"leaveProtect","pay":"charToBottom"}]},
  "OP06-104": {"onKO":[{"op":"cond","check":"oppLife<=3","then":[{"op":"lifeAddFromDeck","n":1}]}],"trigger":[{"op":"cond","check":"oppLife<=3","then":[{"op":"playSelf"}]}]},
  "OP07-054": {"onPlay":[{"op":"draw","n":1}]},
  "OP09-095": {"act":{"label":"黒ひげをサーチ","cost":{"restSelf":true,"don":1},"fx":[{"op":"search","look":5,"filter":{"trait":"黒ひげ海賊団"}}]}},
  "OP16-110": {"onKO":[{"op":"draw","n":1},{"op":"restChar","side":"opp","maxCost":6,"count":1,"optional":true}],"trigger":[{"op":"draw","n":1},{"op":"restChar","side":"opp","maxCost":6,"count":1,"optional":true}]},
  "OP16-103": {"onKO":[{"op":"cond","check":{"and":["oppTurn","leaderBH"]},"then":[{"op":"draw","n":1},{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}]}],"trigger":[{"op":"cond","check":{"leaderBH":true},"then":[{"op":"draw","n":1},{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}]}]},
  "OP16-119": {"onPlay":[{"op":"lifeAddChoose","look":3}]},
  "OP16-108": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"trashToLife","maxCost":6,"trait":"黒ひげ海賊団","optional":true,"faceUp":true}]}],"trigger":[{"op":"draw","n":2}]},
  "OP09-086": {"static":[{"op":"effectImmune","koOnly":true},{"op":"trashPower","per":4,"amount":1000,"cond":"leaderBH"}]},
  "OP09-086_r2": {"static":[{"op":"effectImmune","koOnly":true},{"op":"trashPower","per":4,"amount":1000,"cond":"leaderBH"}]},
  // OP02-027 イヌアラシ: 自分のドン!!がすべてレストの場合、相手の効果で場を離れない（場を離れない＝condBuff immune・KO/バウンス/デッキ送りのみ無効）
  "OP02-027": {"static":[{"op":"condBuff","cond":{"activeDonAtMost":0},"immune":true}]},
  /* ===== OP14 バッチ1（既存opのみ・src非干渉。自パワー/自レスト系は新cond/hook要のため後続バッチ） ===== */
  // OP14-005: 【起動メイン】【ターン1回】リーダーか自キャラ1枚にレストのドン1付与
  "OP14-005": {"act":{"label":"レストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  // OP14-015: 【速攻】(textで付与) 【アタック時】相手キャラ1枚まで このターン中 パワー-1000
  "OP14-015": {"onAttack":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true}]},
  // OP14-019: 【メイン】デッキ上4枚から《超新星》か《麦わら》1枚を手札へ
  "OP14-019": {"main":{"fx":[{"op":"search","look":4,"filter":{"type":"CHAR","or":[{"traitIncludes":"超新星"},{"traitIncludes":"麦わらの一味"}]},"count":1}]},"trigger":[{"op":"draw","n":1}]},
  // OP14-022: 【自分のターン終了時】リーダーが《FILM》か《麦わら》ならドン2アクティブ
  "OP14-022": {"onTurnEnd":[{"op":"cond","check":{"or":[{"leaderTrait":"FILM"},{"leaderTrait":"麦わらの一味"}]},"then":[{"op":"donActivate","n":2}]}]},
  // OP14-023: 【自分のターン終了時】このキャラをアクティブにする
  "OP14-023": {"onTurnEnd":[{"op":"activateOwnChar","target":"self"}]},
  // OP14-043: 【登場時】手札からコスト3以下の《魚人族》か《人魚族》1枚を登場 ／【KO時】1ドロー
  "OP14-043": {"onPlay":[{"op":"playCharFromHand","maxCost":3,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"count":1,"optional":true}],"onKO":[{"op":"draw","n":1}]},
  // OP14-050: 【登場時】リーダーが《魚人族》なら1ドロー
  "OP14-050": {"onPlay":[{"op":"cond","check":{"leaderTrait":"魚人族"},"then":[{"op":"draw","n":1}]}]},
  // OP14-057: 【メイン】自《魚人族》か《人魚族》のリーダーとキャラすべてを このターン中 +1000
  "OP14-057": {"main":{"fx":[{"op":"powerMod","side":"self","all":true,"leader":true,"amount":1000,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}}]},"trigger":[{"op":"draw","n":2}]},
  // OP14-059: 【メイン】リーダーが「ジンベエ」で手札2枚以下なら2ドロー
  "OP14-059": {"main":{"fx":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"ジンベエ"},{"selfHandAtMost":2}]},"then":[{"op":"draw","n":2}]}]},"trigger":[{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}]},
  // OP14-064: 【KO時】ドンデッキからレスト追加→相手の元々パワー0のキャラ1枚KO
  "OP14-064": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rest"},{"op":"ko","side":"opp","filter":{"maxPower":0},"count":1,"optional":true}]},
  // OP14-071: 【自分のターン終了時】リーダーが《ドンキホーテ海賊団》ならドンデッキからアクティブ追加
  "OP14-071": {"onTurnEnd":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP14-075: 【KO時】ドンデッキからレスト追加→相手キャラ1枚を このターン中 -2000
  "OP14-075": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rest"},{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]},
  // OP14-081: 【登場時】デッキ上3枚トラッシュ ／【KO時】相手の元々コスト1のキャラ1枚KO
  "OP14-081": {"onPlay":[{"op":"deckToTrash","n":3}],"onKO":[{"op":"ko","side":"opp","filter":{"minBaseCost":1,"maxBaseCost":1},"count":1,"optional":true}]},
  // OP14-083: 【起動メイン】自身をトラッシュ：相手のコスト0キャラ1枚を このターン中 -3000
  "OP14-083": {"act":{"label":"自身トラッシュ:相手コスト0を-3000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"filter":{"maxCost":0},"optional":true}]}]}},
  /* ===== OP14 バッチ2（新cond selfPowerAtLeast/selfRested・新hook onSelfRested を使用） ===== */
  // OP14-002: 【アタック時】自パワー5000以上なら1ドロー＋相手の元々パワー3000以下1枚KO
  "OP14-002": {"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":5000},"then":[{"op":"draw","n":1},{"op":"ko","side":"opp","filter":{"maxPower":3000},"count":1,"optional":true}]}]},
  // OP14-004: 自パワー5000以上なら【速攻】
  "OP14-004": {"condRush":{"selfPowerAtLeast":5000}},
  // OP14-006: 【アタック時】自パワー5000以上なら相手キャラ1枚を このターン中 -2000
  "OP14-006": {"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":5000},"then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]}]},
  // OP14-012: 【アタック時】自パワー5000以上ならリーダーか自キャラにレストのドン2付与
  "OP14-012": {"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":5000},"then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]},
  // OP14-026: 【相手のターン中】このキャラがレストの場合、パワー+2000（常在）
  "OP14-026": {"static":[{"op":"condBuff","cond":{"and":["oppTurn",{"selfRested":true}]},"power":2000}]},
  // OP14-028: 【自分のターン中】このキャラがレストになった時、相手のレストのコスト2以下1枚KO
  "OP14-028": {"onSelfRested":[{"op":"ko","side":"opp","filter":{"maxCost":2,"restedOnly":true},"count":1,"optional":true}]},
  // OP14-032: 【自分のターン中】このキャラがレストになった時、相手のコスト4以下1枚レスト
  "OP14-032": {"onSelfRested":[{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}]},
  // OP14-035: 【自分のターン中】このキャラがレストになった時、相手のレストのコスト4以下1枚を次リフレッシュでアクティブにしない
  "OP14-035": {"onSelfRested":[{"op":"lock","side":"opp","restedOnly":true,"filter":{"maxCost":4},"count":1,"optional":true}]},
  /* ----- OP14 既存opのみ ----- */
  // OP14-013: 【登場時】デッキ上5枚から「ルフィ」以外の《超新星》1枚を手札へ ／【アタック時】相手1枚-1000
  "OP14-013": {"onPlay":[{"op":"search","look":5,"filter":{"traitIncludes":"超新星","nameExcludes":"モンキー・Ｄ・ルフィ"},"count":1}],"onAttack":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true}]},
  // OP14-014: 【ブロッカー】(text) 【登場時】リーダー《超新星》なら手札のパワー2000以下の赤キャラ1枚を登場
  "OP14-014": {"onPlay":[{"op":"cond","check":{"leaderTrait":"超新星"},"then":[{"op":"playCharFromHand","filter":{"maxPower":2000,"color":"赤"},"count":1,"optional":true}]}]},
  // OP14-031: 【登場時】相手コスト8以下2枚レスト→このターン終了時ドン5アクティブ
  "OP14-031": {"onPlay":[{"op":"restChar","side":"opp","maxCost":8,"count":2,"optional":true},{"op":"scheduleTurnEnd","fx":[{"op":"donActivate","n":5}]}]},
  // OP14-042: 【登場時】リーダー《魚人族》ならデッキ上4枚からコスト2以上1枚を手札へ
  "OP14-042": {"onPlay":[{"op":"cond","check":{"leaderTrait":"魚人族"},"then":[{"op":"search","look":4,"filter":{"minCost":2},"count":1}]}]},
  // OP14-044: 【ブロッカー】(text) 【登場時】デッキ上1枚公開、白ひげ海賊団なら2ドロー＋手札1捨て
  "OP14-044": {"onPlay":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // OP14-047: 【ブロッカー】(text) 【登場時】1ドロー＋手札のコスト3以下の魚人/人魚1枚を登場
  "OP14-047": {"onPlay":[{"op":"draw","n":1},{"op":"playCharFromHand","maxCost":3,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"count":1,"optional":true}]},
  // OP14-051: 【ドン‼×2】【KO時】1ドロー
  "OP14-051": {"onKO":[{"op":"cond","check":"donX2","then":[{"op":"draw","n":1}]}]},
  // OP14-067: 【KO時】ドンデッキからレスト追加→デッキ上5枚から《ドンキホーテ海賊団》1枚を手札へ
  "OP14-067": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rest"},{"op":"search","look":5,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"count":1}]},
  // OP14-072: 【登場時】ドンデッキからアクティブ追加 ／【KO時】ドン-1→デッキ上1枚をライフ上に
  "OP14-072": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"onKO":[{"op":"donMinus","n":1},{"op":"lifeAddFromDeck","n":1}]},
  /* ===== OP14 バッチ3（既存opのみ・src非干渉。カウンターイベント＋既存opチェーン） ===== */
  // OP14-018: 【カウンター】自分にパワー8000以上キャラがいれば、リーダーかキャラ1枚を このバトル中+4000
  "OP14-018": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfChar":{"minEffPower":8000}},"then":[{"op":"counterBuff","amount":4000}]}]},"trigger":[{"op":"playCharFromHand","filter":{"maxPower":2000,"color":"赤"},"count":1,"optional":true}]},
  // OP14-036: 【カウンター】自分のカード1枚をレストにできる：リーダーかキャラ1枚を このバトル中+4000
  "OP14-036": {"counter":{"cost":0,"fx":[{"op":"restOwnAsCost","then":[{"op":"counterBuff","amount":4000}]}]},"trigger":[{"op":"restOwnAsCost","then":[{"op":"restChar","side":"opp","filter":{"maxPower":7000},"count":1,"optional":true}]}]},
  // OP14-077: 【カウンター】リーダーかキャラ1枚+4000→相手にパワー6000以上いればドンデッキからレスト追加
  "OP14-077": {"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":4000},{"op":"cond","check":{"oppChar":{"minEffPower":6000}},"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}]}},
  // OP14-010: 【KO時】デッキ上5枚から「ホーキンス」以外のパワー2000以下の《超新星》1枚を登場
  "OP14-010": {"onKO":[{"op":"playCharFromDeck","look":5,"filter":{"maxPower":2000,"traitIncludes":"超新星","nameExcludes":"バジル・ホーキンス"},"count":1}]},
  // OP14-011: 【ドン‼×2】このキャラは【ブロッカー】を得る
  "OP14-011": {"condBlocker":"donX2"},
  // OP14-016: 【相手ターン中】【ターン1回】超新星が相手効果で場を離れる場合、代わりにリーダー-2000 ／【ドン‼×1】【アタック時】相手1枚-2000
  "OP14-016": {"static":[{"op":"leaveProtect","pay":"leaderPowerMinus","amount":2000,"targetFilter":{"traitIncludes":"超新星"},"once":"turn"}],"onAttack":[{"op":"cond","check":"donX1Self","then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]}]},
  // OP14-025: 【登場時】リーダーが「クロ」なら手札のコスト6以下《東の海》1枚を登場
  "OP14-025": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"クロ"},"then":[{"op":"playCharFromHand","maxCost":6,"filter":{"traitIncludes":"東の海"},"count":1,"optional":true}]}]},
  // OP14-033: 【登場時】相手コスト5以下2枚を次相手エンド終了までレスト不可 ／【KO時】自カード1枚レスト：手札のコスト5以下の緑キャラ登場
  "OP14-033": {"onPlay":[{"op":"restImmune","side":"opp","maxCost":5,"count":2,"duration":"untilNextEnd","optional":true}],"onKO":[{"op":"restOwnAsCost","then":[{"op":"playCharFromHand","maxCost":5,"filter":{"color":"緑"},"count":1,"optional":true}]}]},
  // OP14-046: 【起動メイン】自身をトラッシュ：魚人/人魚のリーダーかキャラ1枚を このターン中+2000
  "OP14-046": {"act":{"label":"自身トラッシュ:魚人/人魚に+2000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"count":1,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"optional":true}]}]}},
  // OP14-052: 【ブロッカー】(text) 【登場時】手札3枚捨て：手札のコスト6以下《インペルダウン》1枚を登場
  "OP14-052": {"onPlay":[{"op":"discardCost","count":3,"then":[{"op":"playCharFromHand","maxCost":6,"filter":{"traitIncludes":"インペルダウン"},"count":1,"optional":true}]}]},
  // OP14-062: 【KO時】ドン‼-1：相手の元々パワー6000以下1枚をKOかレスト（二択）
  "OP14-062": {"onKO":[{"op":"donMinus","n":1},{"op":"chooseOption","options":[{"label":"KOする","fx":[{"op":"ko","side":"opp","filter":{"maxPower":6000},"count":1,"optional":true}]},{"label":"レストにする","fx":[{"op":"restChar","side":"opp","maxPower":6000,"count":1,"optional":true}]}]}]},
  // OP14-065: 【KO時】相手は自身のドン‼1枚をドンデッキに戻す
  "OP14-065": {"onKO":[{"op":"oppDonMinus","n":1}]},
  // OP14-074: 【登場時】リーダー《ドンキ》ならドンデッキからアクティブ追加 ／【KO時】2ドロー＋1捨て→ドンデッキからレスト2追加
  "OP14-074": {"onPlay":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}],"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donFromDeck","n":2,"mode":"rest"}]},
  /* ===== OP14 バッチ4（新op swapPower/addCostBuff-all を使用） ===== */
  // OP14-009: 【速攻】(text) 【相手のアタック時】【ターン1回】手札2枚捨て：リーダーと自キャラ1枚の元々パワーをこのバトル中入れ替える
  "OP14-009": {"onOppAttack":[{"op":"discardCost","count":2,"once":"turn","then":[{"op":"swapPower","withLeader":true,"battle":true}]}]},
  // OP14-017: 【メイン】相手の元々パワー9000以下のキャラ2枚の元々パワーをこのターン中入れ替える
  "OP14-017": {"main":{"fx":[{"op":"swapPower","filter":{"maxPower":9000}}]}},
  // OP14-082: 【KO時】自《スリラーバーク海賊団》すべてを次相手エンド終了までコスト+4
  "OP14-082": {"onKO":[{"op":"addCostBuff","side":"self","all":true,"amount":4,"duration":"untilNextEnd","filter":{"traitIncludes":"スリラーバーク海賊団"}}],"trigger":[{"op":"reviveFromTrash","maxCost":2,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-021: 【自分のターン中】このキャラがレストになった時、ライフ上1枚を手札に加えられる：相手のレストのキャラ/ステージ1枚を次リフレッシュでアクティブにしない
  "OP14-021": {"onSelfRested":[{"op":"lifeCost","action":"toHand","then":[{"op":"lock","side":"opp","restedOnly":true,"includeStage":true,"count":1,"optional":true}]}]},
  // OP14-061: 【ターン1回】《ドンキ》が相手効果で場を離れる場合、代わりにドン1枚をドンデッキへ ／【アタック時】ドン‼-1：相手1枚-2000
  "OP14-061": {"static":[{"op":"leaveProtect","pay":"donToDeck","targetFilter":{"traitIncludes":"ドンキホーテ海賊団"},"once":"turn"}],"onAttack":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]},
  // OP14-069: 【登場時】ドン‼-3：二択（ドンキならコスト8以下KO ／ 相手コスト7以下3枚を次相手エンドまでレスト不可）
  "OP14-069": {"onPlay":[{"op":"donMinus","n":3},{"op":"chooseOption","options":[{"label":"ドンキならコスト8以下KO","fx":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"ko","side":"opp","maxCost":8,"count":1,"optional":true}]}]},{"label":"コスト7以下3枚レスト不可","fx":[{"op":"restImmune","side":"opp","maxCost":7,"count":3,"duration":"untilNextEnd","optional":true}]}]}]},
  // OP14-076: 【メイン】ドン2レスト：ドンキならドンデッキからレスト追加 ／【カウンター】リーダーをこのバトル中+3000
  "OP14-076": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-078: 【カウンター】ドン‼-1：ドンキならリーダーかキャラ1枚をこのバトル中+4000（+2000→+2000）
  "OP14-078": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"counterBuff","amount":2000},{"op":"counterBuff","amount":2000,"duration":"turnEnd"}]}]}},
  /* ===== OP14 バッチ5（既存opのみ・src非干渉） ===== */
  // OP14-085 / 089: 【KO時】2ドロー＋手札2枚捨て
  "OP14-085": {"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  "OP14-089": {"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":2}],"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-091: 【KO時】手札orトラッシュから「ベンサム」以外のコスト5以下《B・W》1枚を登場
  "OP14-091": {"onKO":[{"op":"playFromHandOrTrash","filter":{"maxCost":5,"traitIncludes":"B・W","nameExcludes":"ボン・クレー"}}]},
  // OP14-093: 【ブロッカー】(text) 【KO時】トラッシュからコスト8以下《B・W》1枚を手札へ
  "OP14-093": {"onKO":[{"op":"trashToHand","filter":{"maxCost":8,"traitIncludes":"B・W"},"count":1,"optional":true}]},
  // OP14-097: 【メイン】デッキ上3枚から《スリラーバーク》1枚を手札へ、残りトラッシュ
  "OP14-097": {"main":{"fx":[{"op":"search","look":3,"filter":{"traitIncludes":"スリラーバーク海賊団","nameExcludes":"早くおれを"},"count":1,"rest":"trash"}]},"trigger":[{"op":"search","look":3,"filter":{"traitIncludes":"スリラーバーク海賊団","nameExcludes":"早くおれを"},"count":1,"rest":"trash"}]},
  // OP14-099: 【メイン】デッキ上3枚から《B・W》1枚を手札へ、残りトラッシュ
  "OP14-099": {"main":{"fx":[{"op":"search","look":3,"filter":{"traitIncludes":"B・W","nameExcludes":"不服か"},"count":1,"rest":"trash"}]},"trigger":[{"op":"search","look":3,"filter":{"traitIncludes":"B・W","nameExcludes":"不服か"},"count":1,"rest":"trash"}]},
  // OP14-100: 【KO時】デッキ上3枚から《スリラーバーク》1枚を手札へ
  "OP14-100": {"onKO":[{"op":"search","look":3,"filter":{"traitIncludes":"スリラーバーク海賊団"},"count":1}],"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-111: 【登場時】/【KO時】相手コスト6以下1枚を次相手エンド終了までアタック不可
  "OP14-111": {"onPlay":[{"op":"setAttackBan","side":"opp","maxCost":6,"duration":"untilNextEnd","count":1,"optional":true}],"onKO":[{"op":"setAttackBan","side":"opp","maxCost":6,"duration":"untilNextEnd","count":1,"optional":true}],"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-116: 【カウンター】リーダーかキャラ1枚+2000→手札のコスト4以下《アマゾン・リリー》/《九蛇》1枚を登場
  "OP14-116": {"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000},{"op":"playCharFromHand","maxCost":4,"filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"count":1,"optional":true}]},"trigger":[{"op":"draw","n":1}]},
  // OP14-117: 【カウンター】自《スリラーバーク》のリーダーかキャラ1枚を このバトル中+3000
  "OP14-117": {"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":3000}]},"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-118: 【カウンター】自ライフ2枚以下なら相手のアクティブキャラ1枚を このターン アタック不可
  "OP14-118": {"counter":{"cost":0,"fx":[{"op":"cond","check":"life<=2","then":[{"op":"setAttackBan","side":"opp","filter":{"activeOnly":true},"count":1,"optional":true}]}]},"trigger":[{"op":"playCharFromHand","filter":{"maxPower":6000},"needsTrigger":true,"count":1,"optional":true}]},
  // OP14-096: 【メイン】ドン2レスト：相手コスト5以下1枚を効果無効 ／【カウンター】トラッシュ10以上ならリーダーかキャラ1枚+4000
  "OP14-096": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"negateChoose","maxCost":5,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"counterBuff","amount":4000}]}]}},
  // OP14-094: 【ブロッカー】(text) 【登場時】コスト0か8以上のキャラがいれば2ドロー＋手札1捨て
  "OP14-094": {"onPlay":[{"op":"cond","check":{"or":[{"selfChar":{"maxCost":0}},{"selfChar":{"minCost":8}},{"oppChar":{"maxCost":0}},{"oppChar":{"minCost":8}}]},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  /* ===== OP14 バッチ6（新cond leaderTraitIncludes/oppDonAtLeast・new op拡張） ===== */
  // OP14-084: 【登場時】リーダーが『B・W』含む特徴なら、トラッシュからコスト4以下と1の『B・W』を1枚ずつ登場
  "OP14-084": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"reviveFromTrash","filter":{"traitIncludes":"B・W","maxCost":4}},{"op":"reviveFromTrash","filter":{"traitIncludes":"B・W","cost":1}}]}]},
  // OP14-087: 【登場時】リーダーが『B・W』含むなら、デッキ上4枚から「ミキータ」以外の『B・W』1枚を手札へ、残りトラッシュ
  "OP14-087": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"search","look":4,"filter":{"traitIncludes":"B・W","nameExcludes":"ミキータ"},"count":1,"rest":"trash"}]}]},
  // OP14-098: 【メイン】コスト0か8以上のキャラがいれば自『B・W』全コスト+3(次相手エンドまで) ／【カウンター】リーダー+3000
  "OP14-098": {"main":{"fx":[{"op":"cond","check":{"or":[{"selfChar":{"maxCost":0}},{"selfChar":{"minCost":8}},{"oppChar":{"maxCost":0}},{"oppChar":{"minCost":8}}]},"then":[{"op":"addCostBuff","side":"self","all":true,"amount":3,"duration":"untilNextEnd","filter":{"traitIncludes":"B・W"}}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-063: 【登場時】ドンデッキからアクティブ追加 ／【KO時】相手の場のドンが6枚以上なら手札のコスト5以下《ドンキ》1枚を登場
  "OP14-063": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"onKO":[{"op":"cond","check":{"oppDonAtLeast":6},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ドンキホーテ海賊団","maxCost":5},"count":1,"optional":true}]}]},
  // OP14-110: 【KO時】トラッシュから「ホグバック」以外のコスト4以下の【トリガー】持ちキャラ1枚を登場
  "OP14-110": {"onKO":[{"op":"reviveFromTrash","maxCost":4,"needsTrigger":true,"filter":{"nameExcludes":"ホグバック"}}],"trigger":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-092: 【相手のターン中】【ターン1回】このキャラがKOされる場合、代わりにトラッシュ3枚をデッキ下に置きKO回避
  "OP14-092": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"pay":"trashToDeck","n":3,"once":"turn"}]},
  // OP14-048: 【登場時】相手キャラ1枚を手札に戻す→自分の手札すべてを捨てる
  "OP14-048": {"onPlay":[{"op":"bounce","side":"opp","count":1,"optional":true},{"op":"discardOwn","all":true}]},
  // OP14-054: 【登場時】リーダー《魚人族》なら3ドロー ／【自分のターン終了時】手札が5枚になるよう捨てる
  "OP14-054": {"onPlay":[{"op":"cond","check":{"leaderTrait":"魚人族"},"then":[{"op":"draw","n":3}]}],"onTurnEnd":[{"op":"discardOwn","toSize":5}]},
  // OP14-039 STAGE: 【登場時】リーダー「ミホーク」なら1ドロー ／【自分のターン終了時】リーダー「ミホーク」ならドン1枚をアクティブに
  "OP14-039": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ミホーク"},"then":[{"op":"draw","n":1}]}],"onTurnEnd":[{"op":"cond","check":{"leaderNameIncludes":"ミホーク"},"then":[{"op":"donActivate","n":1}]}]},
  // OP14-037: 【メイン】自カード3枚レスト：相手のレストの元々パワー7000以下1枚KO ／【カウンター】リーダー+3000
  "OP14-037": {"main":{"fx":[{"op":"restOwnAsCost","count":3,"then":[{"op":"ko","side":"opp","filter":{"maxPower":7000,"restedOnly":true},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-038: 【メイン】自カード2枚レスト：1ドロー＋相手の元々パワー7000以下1枚レスト ／【カウンター】リーダー+3000
  "OP14-038": {"main":{"fx":[{"op":"restOwnAsCost","count":2,"then":[{"op":"draw","n":1},{"op":"restChar","side":"opp","filter":{"maxPower":7000},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-119: 【自ターン中】レストになった時、相手コスト9以下1枚を次相手エンドまでレスト不可 ／【相手アタック時】【ターン1回】手札1捨て：リーダーかキャラ1枚を このバトル中+2000
  "OP14-119": {"onSelfRested":[{"op":"restImmune","side":"opp","maxCost":9,"duration":"untilNextEnd","count":1,"optional":true}],"onOppAttack":[{"op":"discardCost","count":1,"once":"turn","then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]},
  // OP14-120: 【登場時】相手コスト9以下1枚を次相手エンドまでアタック不可→コスト0か8以上いれば1ドロー ／【KO時】手札1捨て：このキャラをトラッシュから登場
  "OP14-120": {"onPlay":[{"op":"setAttackBan","side":"opp","maxCost":9,"duration":"untilNextEnd","count":1,"optional":true},{"op":"cond","check":{"or":[{"oppChar":{"maxCost":0}},{"oppChar":{"minCost":8}}]},"then":[{"op":"draw","n":1}]}],"onKO":[{"op":"discardCost","count":1,"then":[{"op":"reviveSelf"}]}]},
  // OP14-029: 【相手ターン中】このキャラが相手効果で場を離れる場合、代わりに自カード1枚レスト ／【起動メイン】自カード2枚レスト：このキャラを次相手エンドまで+2000
  "OP14-029": {"static":[{"op":"leaveProtect","targetSelf":true,"pay":"restOwnCards","n":1}],"act":{"label":"自カード2枚レスト:自身+2000","cost":{},"fx":[{"op":"restOwnAsCost","count":2,"then":[{"op":"powerMod","target":"self","amount":2000,"duration":"untilNextEnd"}]}]}},
  /* ===== OP14 バッチ7（新op koStage/selfDamage/negateSelf/setSummonBan/basePower・新hook onSelfHandDiscarded・汎用リダイレクトリーダー） ===== */
  // OP14-027 シャンクス: 【自分のターン中】レストになった時、相手の元々パワー7000以下1枚までレスト ／【相手のターン中】レストの場合、相手のキャラすべてパワー-1000
  "OP14-027": {"onSelfRested":[{"op":"restChar","side":"opp","filter":{"maxPower":7000},"count":1,"optional":true}],"static":[{"op":"oppStaticPowerMod","power":-1000,"cond":{"and":[{"oppTurn":true},{"selfRested":true}]}}]},
  // OP14-001 ロー LEADER: 【起動メイン】【ターン1回】自分の《超新星》か《ハートの海賊団》キャラ2枚の元々のパワーを入れ替える
  "OP14-001": {"act":{"label":"超新星/ハートのキャラ2枚の元々パワーを入替","cost":{},"fx":[{"op":"swapPower","ownPair":true,"filter":{"traits":["超新星","ハートの海賊団"]}}]}},
  // OP14-080 モリア LEADER: 【起動メイン】スリラーバークをKO：リーダーとキャラ全+1000 ／【アタック時】手札3捨て(任意)：デッキ上1枚をライフに
  "OP14-080": {"act":{"label":"スリラーバークをKO:リーダーとキャラ全+1000","cost":{},"fx":[{"op":"trashOwnCharCost","filter":{"trait":"スリラーバーク海賊団"},"then":[{"op":"powerMod","side":"self","all":true,"leader":true,"amount":1000,"duration":"turn"}]}]},"onAttack":[{"op":"discardCost","count":3,"cpuSkip":true,"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // OP14-060 ドフラミンゴ LEADER: 【相手のアタック時】【ターン1回】ドン‼-1：リーダーかドンキホーテ海賊団キャラへ対象変更（leaderRedirect）
  "OP14-060": {"onOppAttack":[{"op":"redirect","cost":{"donMinus":1},"dest":{"leader":true,"traitIncludes":"ドンキホーテ海賊団"},"once":"turn"}]},
  // OP14-058 海流一本背負い EVENT: 【メイン】ドン3レスト：コスト3以下《魚人族》1枚まで登場→元々パワー6000のキャラ1枚まで手札へ ／【カウンター】1ドロー＋リーダー+3000
  "OP14-058": {"main":{"fx":[{"op":"restDonCost","n":3,"then":[{"op":"playCharFromHand","maxCost":3,"filter":{"traitIncludes":"魚人族"},"count":1,"optional":true},{"op":"bounce","side":"any","filter":{"basePower":6000},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"draw","n":1},{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-088 ドロフィー: 【KO時】リーダーが『B・W』含むなら1ドロー＋相手コスト1ステージ1枚までKO
  "OP14-088": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"draw","n":1},{"op":"koStage","filter":{"cost":1}}]}]},
  // OP14-115 リンドウ: 【相手のターン中】【KO時】デッキ上1枚までをライフに加える→自分は1ダメージを受ける
  "OP14-115": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"selfDamage","n":1}]}],"trigger":[{"op":"cond","check":{"leaderTrait":"九蛇海賊団"},"then":[{"op":"playSelf"}]}]},
  // OP14-090 ダズ: コスト0か8以上のキャラがいれば登場ターンにキャラへアタック可(rushChar) ／【登場時】相手コスト0キャラ1枚までレスト
  "OP14-090": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"or":[{"selfChar":{"maxCost":0}},{"selfChar":{"minCost":8}},{"oppChar":{"maxCost":0}},{"oppChar":{"minCost":8}}]}}],"onPlay":[{"op":"restChar","side":"opp","filter":{"cost":0},"count":1,"optional":true}]},
  // OP14-024 錦えもん: 【登場時】ドン3アクティブ→このターン登場不可 ／【KO時】相手のカード1枚までレスト
  "OP14-024": {"onPlay":[{"op":"donActivate","n":3},{"op":"setSummonBan"}],"onKO":[{"op":"restChar","side":"opp","count":1,"optional":true,"includeLeader":true,"includeStage":true}]},
  // OP14-020 ミホーク LEADER: 【起動メイン】自カード1枚レスト：コスト5以上キャラがいればドン3アクティブ→このターン登場不可
  "OP14-020": {"static":[{"op":"condBuff","cond":{"oppLeaderAttr":"斬"},"power":1000}],"act":{"label":"自カード1枚レスト:コスト5以上いればドン3アクティブ+登場不可","cost":{},"fx":[{"op":"restOwnAsCost","count":1,"then":[{"op":"cond","check":{"selfChar":{"minCost":5}},"then":[{"op":"donActivate","n":3},{"op":"setSummonBan"}]}]}]}},
  // OP14-045 クロオビ: 効果で自分の手札が捨てられた時このターン【速攻】 ／【KO時】1ドロー
  "OP14-045": {"onSelfHandDiscarded":[{"op":"giveKeyword","target":"self","kw":"rush"}],"onKO":[{"op":"draw","n":1}]},
  // OP14-049 ジンベエ: 効果で自分の手札が捨てられた時このターン【速攻】 ／【登場時】ドン2レスト：2ドロー＋コスト7以下キャラ1枚まで手札へ
  "OP14-049": {"onSelfHandDiscarded":[{"op":"giveKeyword","target":"self","kw":"rush"}],"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"draw","n":2},{"op":"bounce","side":"any","maxCost":7,"count":1,"optional":true}]}]},
  // OP14-056 ワダツミ: このキャラはアタックできない(cantAttack＝無効化で解除可) ／効果で自分の手札が捨てられた時このターン効果無効
  "OP14-056": {"static":[{"op":"cantAttack"}],"onSelfHandDiscarded":[{"op":"negateSelf"}]},
  /* ===== OP14 バッチ8（場全体の常在＝allyPower/allyCost・ベッジ源パワーKO耐性・クロコダイル自己制約・ビスタ setBaseToLeader・トレーボル/バッファロー新フック） ===== */
  // OP14-003 カポネ・ベッジ: 相手の元々パワー5000以下のキャラの効果でKOされない(koImmuneFromWeakSource)
  "OP14-003": {"static":[{"op":"koImmuneFromWeakSource","maxBasePower":5000}]},
  // OP14-034 ルフィ: 【自分のターン中】自分の元々コスト4以上の緑《麦わらの一味》全+1000(allyPower) ／【ターン1回】麦わらが相手効果でKO→代わりに自分カード1枚レスト(leaveProtect)
  "OP14-034": {"static":[{"op":"allyPower","power":1000,"cond":{"selfTurn":true},"filter":{"minBaseCost":4,"color":"緑","traitIncludes":"麦わらの一味"}},{"op":"leaveProtect","targetFilter":{"traitIncludes":"麦わらの一味"},"onlyKO":true,"once":"turn","pay":"restOwnCards","n":1,"excludeLeader":true}]},
  // OP14-053 ビスタ: 【ブロッカー】 ／【相手のターン中】手札7枚以下なら元々のパワーが自分のリーダーの元々パワーと同じになる(staticSetBaseToLeader)
  "OP14-053": {"static":[{"op":"staticKeyword","kw":"blocker"},{"op":"staticSetBaseToLeader","cond":{"and":[{"oppTurn":true},{"selfHandAtMost":7}]}}]},
  // OP14-068 トレーボル: 【相手のターン中】【ターン1回】自分の場のドンがドンデッキに戻された時、ドンキホーテリーダーならドンデッキからドン1レスト追加(onDonReturned)
  "OP14-068": {"onDonReturned":[{"op":"cond","once":"turn","check":{"and":[{"oppTurn":true},{"leaderTraitIncludes":"ドンキホーテ海賊団"}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP14-070 バッファロー: 【ブロッカー】 ／相手のキャラ効果でレストになった時、ドン1をドンデッキに戻して自身アクティブ(onOppRested→donMinusActivateSelf)
  "OP14-070": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onOppRested":[{"op":"donMinusActivateSelf"}]},
  // OP14-079 クロコダイル LEADER: 相手キャラすべては自分の効果で場を離れない(oppLeaveImmuneFromSelf) ／【起動メイン】B・WをKO：相手キャラ1枚コスト-10→デッキ上2枚トラッシュ
  "OP14-079": {"static":[{"op":"oppLeaveImmuneFromSelf"}],"act":{"label":"B・WをKO:相手キャラ1枚コスト-10","cost":{},"fx":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"B・W"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-10,"duration":"turn","optional":true},{"op":"deckToTrash","n":2,"optional":true}]}]}},
  // OP14-086 ザラ: 自分のトラッシュ7枚以上なら自身+1000(condBuff)＋自分の『B・W』含む特徴のキャラ全コスト+2(allyCost)
  "OP14-086": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"power":1000},{"op":"allyCost","cond":{"trashAtLeast":7},"amount":2,"filter":{"traitIncludes":"B・W"}}]},
  "OP09-093": {"act":{"label":"黒ひげ＆登場ターン:相手リーダー＆キャラを効果無効","cost":{},"fx":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"黒ひげ海賊団"},{"selfSummonedThisTurn":true}]},"then":[{"op":"negateEffect"}]}]}},
  "OP16-104": {"onAttack":[{"op":"powerCopy"}],"trigger":[{"op":"draw","n":1},{"op":"reviveFromTrash","filter":{"cost":1,"traitIncludes":"黒ひげ海賊団"}}]},
  "OP16-109": {"onKO":[{"op":"cond","check":"leaderBH","then":[{"op":"draw","n":1},{"op":"ko","side":"opp","maxCost":1,"count":2,"optional":true}]}],"trigger":[{"op":"cond","check":"leaderBH","then":[{"op":"draw","n":1},{"op":"ko","side":"opp","maxCost":1,"count":2,"optional":true}]}]},
  "OP09-096": {"main":{"don":0,"fx":[{"op":"search","look":3,"filter":{"trait":"黒ひげ海賊団"},"exclude":"おれの時代だァ!!!!","rest":"trash"}]},"trigger":[{"op":"search","look":3,"filter":{"trait":"黒ひげ海賊団"},"exclude":"おれの時代だァ!!!!","rest":"trash"}]},
  "OP16-116": {"main":{"don":0,"fx":[{"op":"cond","check":"don10","then":[{"op":"playSpecificFromHand","nameIncludes":"マーシャル","choose":true},{"op":"oppLifeToHand","n":1}]}]},"trigger":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  "OP09-099": {"act":{"label":"デッキ上3枚から黒ひげ1枚","cost":{"restSelf":true},"fx":[{"op":"discardOwn","n":1},{"op":"search","look":3,"filter":{"trait":"黒ひげ海賊団"}}]}},
  "EB01-023": {"onPlay":[{"op":"draw","n":1}]},
  "OP04-045": {"onPlay":[{"op":"draw","n":1}]},
  "OP07-044": {"onPlay":[{"op":"draw","n":1}]},
  "OP15-001": {"static":[{"op":"oppStaticPowerMod","power":-2000,"cond":{"and":["donX1","oppTurn",{"allSelfChar":{"trait":"東の海"}}]}}],"act":{"label":"相手のドン2枚以上付与キャラ1枚をレスト","cost":{},"fx":[{"op":"restChar","side":"opp","count":1,"optional":true,"filter":{"minAttachedDon":2}}]}},
  "OP15-003": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"includeBattle":true,"pay":"discardFromHand","discardFilter":{"type":"CHAR","maxPower":6000}}],"act":{"label":"相手にドン付与→自分にレストのドン付与","cost":{},"fx":[{"op":"oppDonAttach","n":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "OP15-004": {"onPlay":[{"op":"cond","check":{"leaderPowerAtMost":0},"then":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true,"duration":"turn"}]}]},
  "OP15-005": {"onAttack":[{"op":"cond","check":{"oppHasAttachedDon":true},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1}]}]},
  "OP15-006": {"static":[{"op":"condBuff","cond":{"trashCount":{"filter":{"type":"EVENT"},"min":4}},"power":2000}]},
  "OP15-007": {"onPlay":[{"op":"cond","check":{"leaderTrait":"東の海"},"then":[{"op":"playCharFromHand","maxCost":5,"count":1}]}]},
  "OP15-008": {"onPlay":[{"op":"oppDonAttach","n":3},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}],"act":{"label":"相手キャラ全て付与ドン1枚につき-1000","cost":{},"fx":[{"op":"cond","check":{"selfSummonedThisTurn":true},"then":[{"op":"powerMod","side":"opp","all":true,"perAttachedDon":true,"amount":-1000}]}]}},
  "OP15-009": {"static":[{"op":"leaveProtect","pay":"leaderPowerMinus","amount":2000}]},
  "OP15-010": {"act":{"label":"ドン付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  "OP15-011": {"condBlocker":{"and":["oppTurn",{"leaderTrait":"東の海"}]},"static":[{"op":"condBuff","cond":{"and":["oppTurn",{"leaderTrait":"東の海"}]},"power":2000}],"onKO":[{"op":"cond","check":{"leaderTrait":"東の海"},"then":[{"op":"ko","side":"opp","count":1,"maxPower":6000,"optional":true}]}]},
  "OP15-012": {"onAttack":[{"op":"donAttach","target":"chooseOwn","n":1}],"onKO":[{"op":"draw","n":1}]},
  "OP15-013": {"costMod":{"cond":{"leaderPowerAtMost":0},"amount":-2},"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP15-014": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"includeBattle":true,"pay":"discardFromHand","discardFilter":{"type":"EVENT"}}],"onPlay":[{"op":"playEventFromHand","filter":{"type":"EVENT","trait":"ドレスローザ","maxBaseCost":3}}]},
  "OP15-015": {"onPlay":[{"op":"oppDonAttach","n":1},{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"filter":{"hasAttachedDon":true}}]},
  "OP15-017": {"static":[{"op":"staticKeyword","kw":"blocker"}],"act":{"label":"相手にレストのドン1付与:自分に1付与","cost":{},"fx":[{"op":"oppDonAttach","n":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "OP15-018": {"onAttack":[{"op":"ko","side":"opp","count":1,"optional":true,"filter":{"hasAttachedDon":true,"maxEffPower":3000}}]},
  "OP15-019": {"main":{"don":0,"fx":[{"op":"draw","n":1},{"op":"leaderBuff","amount":1000,"duration":"untilNextEnd"}]},"trigger":[{"op":"powerMod","side":"opp","amount":-4000,"count":1,"optional":true}]},
  "OP15-022": {"static":[{"op":"deckOutDelay"}],"act":{"label":"デッキ上4枚トラッシュ→デッキ0でキャラアクティブ","cost":{},"fx":[{"op":"deckToTrash","n":4},{"op":"cond","check":{"deckEmpty":true},"then":[{"op":"activateOwnChar","count":1,"optional":true}]}]}},
  "OP15-023": {"onKO":[{"op":"lock","side":"opp","count":2,"restedOnly":true,"includeLeader":true,"optional":true}],"act":{"label":"相手にレストのドン付与→自分にコストエリアのドン付与","cost":{},"fx":[{"op":"oppDonAttach","n":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1,"fromAny":true}]}]}},
  "OP15-024": {"condBlocker":"oppTurn","static":[{"op":"staticRestImmune","cond":"oppTurn"}],"onKO":[{"op":"restChar","side":"opp","count":1,"optional":true,"includeLeader":true,"filter":{"maxCost":7}}]},
  "OP15-025": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"oppDonAttach","n":2,"fromAny":true},{"op":"scheduleTurnEnd","fx":[{"op":"lock","side":"opp","count":1,"restedOnly":true,"optional":true,"filter":{"minAttachedDon":3}}]}]},
  "OP15-026": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"trait":"東の海"}}],"act":{"label":"このキャラをトラッシュ：相手キャラにレストのドン付与","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"oppDonAttach","n":1}]}]}},
  "OP15-027": {"onPlay":[{"op":"restChar","side":"opp","count":1,"optional":true,"filter":{"hasAttachedDon":true}}]},
  "OP15-028": {"onPlay":[{"op":"cond","check":{"leaderTrait":"東の海"},"then":[{"op":"oppDonAttach","n":1,"fromAny":true}]}]},
  "OP15-029": {"onPlay":[{"op":"restImmune","side":"opp","count":1,"maxCost":5,"optional":true,"duration":"untilNextEnd"}]},
  "OP15-031": {"onPlay":[{"op":"selectKoIfCostEqualsDon","side":"opp","filter":{"restedOnly":true},"optional":true}]},
  "OP15-032": {"onPlay":[{"op":"restChar","side":"opp","count":1,"optional":true,"includeLeader":true,"includeStage":true}],"act":{"label":"トラッシュ置きキャラをアクティブ","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"activateOwnChar","count":1,"optional":true,"filter":{"maxBaseCost":8}}]}]}]}},
  "OP15-033": {"onPlay":[{"op":"cond","check":{"leaderTrait":"魚人族"},"then":[{"op":"activateOwnChar","all":true,"incLeader":true,"filter":{"type":"LEADER"}}]},{"op":"lifeToHand","n":1}]},
  "OP15-034": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"count":1,"optional":true,"filter":{"nameIncludes":"ブルック"}}]},
  "OP15-035": {"static":[{"op":"leaveProtect","pay":"restOwnCards","n":2}]},
  "OP15-036": {"onPlay":[{"op":"ko","side":"opp","count":1,"optional":true,"filter":{"restedOnly":true,"maxCost":4}}],"onAttack":[{"op":"ko","side":"opp","count":1,"optional":true,"filter":{"restedOnly":true,"maxCost":4}}]},
  "OP15-037": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"trait":"東の海","nameExcludes":"強ェ弱ェは結果が決めるのさ"}}]},"trigger":[{"op":"draw","n":1}]},
  "OP15-038": {"main":{"fx":[{"op":"lock","restedOnly":true,"optional":true,"filter":{"maxCost":8,"minAttachedDon":2}}]},"counter":{"fx":[{"op":"powerMod","side":"self","amount":4000,"count":1,"battle":true,"optional":true,"filter":{"name":"クリーク"}}]}},
  "OP15-039": {"static":[{"op":"cantAttack"}],"act":{"label":"ドレスローザを手札に戻しコスト3登場","cost":{"restSelf":true},"fx":[{"op":"bounceOwnCharCost","filter":{"trait":"ドレスローザ"},"then":[{"op":"playCharFromHand","count":1,"optional":true,"filter":{"cost":3,"trait":"ドレスローザ"}}]}]}},
  "OP15-041": {"onKO":[{"op":"draw","n":1}],"act":{"label":"自キャラをデッキ下→速攻","fx":[{"op":"deckBottomOwnCharCost","then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]}},
  "OP15-043": {"onPlay":[{"op":"playSpecificFromHand","name":"ボビー・ファンク","choose":true,"optional":true}]},
  "OP15-045": {"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"EVENT"},"then":[{"op":"draw","n":2}]}]},
  "OP15-048": {"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"EVENT"},"then":[{"op":"draw","n":2}]}],"onKO":[{"op":"cond","check":"oppTurn","then":[{"op":"oppHandToBottom","n":1}]}]},
  "OP15-050": {"static":[{"op":"condBuff","cond":{"selfChar":{"name":"ケリー・ファンク"}},"power":3000}]},
  "OP15-051": {"static":[{"op":"condBuff","cond":{"and":["oppTurn",{"leaderTrait":"ドレスローザ"}]},"power":3000}]},
  "OP15-055": {"main":{"don":0,"fx":[{"op":"chooseOption","options":[{"label":"カード2枚を引く","fx":[{"op":"draw","n":2}]},{"label":"ドレスローザに【ブロッカー】","fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"blocker","duration":"untilNextEnd","filter":{"trait":"ドレスローザ"}}]}]}]}},
  "OP15-059": {"onOppAttack":[{"op":"restSelfCost","then":[{"op":"oppMayReturnDon","n":1,"elseFx":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"includeLeader":true}]}]}]},
  "OP15-064": {"act":{"label":"サトリ&ホトリで相手レスト","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":2},{"op":"cond","check":{"and":[{"selfChar":{"name":"サトリ"}},{"selfChar":{"name":"ホトリ"}}]},"then":[{"op":"restChar","side":"opp","count":1,"maxEffPower":5000,"optional":true}]}]}},
  "OP15-065": {"onPlay":[{"op":"revealTop","filter":{"maxCost":2},"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}]},
  "OP15-068": {"condBlocker":"don<=6"},
  "OP15-071": {"static":[{"op":"grantKeywordNames","kw":"doubleAttack","names":["オーム"],"self":true},{"op":"setPowerOppTurn","names":["オーム"],"self":true,"power":6000}]},
  "OP15-072": {"act":{"label":"相手キャラ-3000","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":2},{"op":"cond","check":{"and":[{"selfChar":{"name":"コトリ"}},{"selfChar":{"name":"サトリ"}}]},"then":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true}]}]}},
  "OP15-073": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"playCharFromHand","count":1,"optional":true,"filter":{"cost":1,"or":[{"nameIncludes":"神兵"},{"trait":"神官"}]}}]},
  "OP15-079": {"onKO":[{"op":"trashToHand","count":1,"filter":{"trait":"スリラーバーク海賊団"},"optional":true}]},
  "OP15-080": {"static":[{"op":"condBuff","cond":{"and":[{"selfChar":{"minEffPower":10000,"name":"ゲッコー・モリア"}},{"selfCharCount":{"filter":{"name":"オーズ"},"max":1}}]},"power":7000}],"onKO":[{"op":"trashToDeckCost","n":3,"then":[{"op":"reviveSelf"}]}]},
  "OP15-081": {"onPlay":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"deckToTrash","n":5}]}]},
  "OP15-082": {"onPlay":[{"op":"deckToTrash","n":3}],"onKO":[{"op":"trashToHand","count":1,"filter":{"type":"CHAR","maxCost":8},"optional":true}]},
  "OP15-083": {"onPlay":[{"op":"deckToTrash","n":3}],"act":{"label":"トラッシュ15+で自身トラッシュ→ドン付与","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}]}},
  "OP15-084": {"onPlay":[{"op":"cond","check":{"leaderTrait":"スリラーバーク海賊団"},"then":[{"op":"deckToTrash","n":5}]}],"onKO":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"draw","n":1}]}]},
  "OP15-085": {"onPlay":[{"op":"deckToTrash","n":3}],"act":{"label":"トラッシュから麦わら回収","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"trashToHand","count":1,"filter":{"type":"CHAR","trait":"麦わらの一味","nameExcludes":"トニートニー・チョッパー"},"optional":true}]}]}]}},
  "OP15-086": {"onPlay":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"reviveFromTrash","maxCost":7,"filter":{"trait":"麦わらの一味"},"grantKw":"rush","grantDuration":"turn"}]}]},
  "OP15-087": {"condBlocker":{"trashAtLeast":10},"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  "OP15-088": {"static":[{"op":"staticCost","amount":6}],"onPlay":[{"op":"deckTrashCost","n":3,"then":[{"op":"reviveFromTrash","maxCost":2,"filter":{"trait":"麦わらの一味"}}]}]},
  "OP15-090": {"static":[{"op":"leaveProtect","pay":"discardFromHand"}]},
  "OP15-091": {"onPlay":[{"op":"oppTrashToBottom","n":1}]},
  "OP15-092": {"static":[{"op":"staticCost","amount":10,"cond":{"trashAtLeast":10}},{"op":"staticSetBase","value":9000,"cond":{"trashAtLeast":10}},{"op":"setPowerOppTurn","leaderTarget":true,"power":7000,"cond":{"trashAtLeast":20}},{"op":"condBuff","cond":{"trashAtLeast":30},"power":1000}]},
  "OP15-093": {"act":{"label":"トラッシュ15+でルフィに速攻:キャラ","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"rushChar","duration":"turn","filter":{"name":"モンキー・Ｄ・ルフィ"}}]}]}]}},
  "OP15-094": {"static":[{"op":"leaveProtect","pay":"koSelf","targetFilter":{"trait":"麦わらの一味"}},{"op":"staticKeyword","kw":"blocker"}]},
  "OP15-095": {"main":{"don":0,"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"count":1,"optional":true,"filter":{"traitIncludes":"麦わらの一味"}}]}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"count":1,"battle":true,"optional":true}]}]}},
  "OP15-096": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"deckToTrash","n":5}]}]}]},"counter":{"fx":[{"op":"discardCost","count":1,"filter":{},"then":[{"op":"powerMod","side":"self","amount":3000,"count":1,"battle":true,"leader":true,"optional":true}]}]}},
  "OP15-097": {"main":{"fx":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"setAttackBan","side":"opp","count":1,"maxBaseCost":5,"optional":true,"duration":"untilNextEnd"}]}]},"trigger":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"setAttackBan","side":"opp","count":1,"maxBaseCost":5,"optional":true,"duration":"untilNextEnd"}]}]},
  "OP15-098": {"static":[{"op":"leaveProtect","pay":"lifeToHand","includeBattle":true,"targetFilter":{"minPower":6000,"trait":"空島"}}]},
  "OP15-099": {"onPlay":[{"op":"discardCost","count":1,"filter":{"trait":"超新星"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}],"act":{"label":"ライフ裏向き：リーダーかキャラにレストのドン1付与","cost":{},"fx":[{"op":"lifeCost","action":"faceDown","then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "OP15-100": {"onPlay":[{"op":"trashSelfCost","then":[{"op":"lifeCost","action":"toHand","then":[{"op":"ko","side":"opp","count":1,"maxCost":6,"optional":true}]}]}]},
  "OP15-101": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"search","look":5,"count":2,"filter":{"or":[{"name":"モンブラン・ノーランド"},{"trait":"シャンドラの戦士"}]}}]}]},
  "OP15-102": {"costMod":{"cond":{"selfChar":{"minEffPower":7000,"trait":"空島"}},"amount":-3},"onPlay":[{"op":"restChar","side":"opp","count":1,"optional":true,"filter":{"maxCostFrom":"oppLife"}}]},
  "OP15-104": {"onPlay":[{"op":"cond","check":{"selfLifeLessThanOpp":true},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}],"trigger":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  "OP15-105": {"static":[{"op":"leaveProtect","pay":"lifeToHand"}]},
  "OP15-108": {"onPlay":[{"op":"search","look":3,"filter":{"trait":"空島"}}]},
  "OP15-109": {"onPlay":[{"op":"lifeCost","action":"toHand","then":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"playCharFromHand","count":1,"optional":true,"filter":{"maxCost":5,"trait":"空島"}}]}]}]},
  "OP15-110": {"onKO":[{"op":"cond","check":{"leaderTrait":"シャンドラの戦士"},"then":[{"op":"lifeAddFromDeck","n":1,"optional":true}]}]},
  "OP15-111": {"onAttack":[{"op":"cond","check":"donX1","then":[{"op":"giveKeyword","target":"chooseOwn","kw":"rush","duration":"turn","filter":{"name":"カルガラ"}}]}]},
  "OP15-112": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"playCharFromHand","count":1,"optional":true,"filter":{"trait":"シャンドラの戦士","maxCost":3}}]},
  "OP15-114": {"onPlay":[{"op":"lifeCost","action":"faceUp","then":[{"op":"powerMod","side":"opp","all":true,"amount":-2000},{"op":"koZero","side":"opp"}]}],"act":{"label":"空島にレストのドン付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"trait":"空島"}}]}},
  "OP15-115": {"main":{"don":2,"fx":[{"op":"ko","side":"opp","count":1,"maxCost":4,"optional":true},{"op":"lifeToHand","n":1}]},"trigger":[{"op":"ko","side":"opp","count":1,"maxCost":4,"optional":true}]},
  "OP15-116": {"main":{"fx":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"lifeTrash"},{"op":"lifeAddFromDeck","n":1},{"op":"discardOwn","n":1}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","all":true,"leader":true,"amount":4000,"battle":true,"filter":{"type":"LEADER"}}]}},
  "OP15-117": {"main":{"fx":[{"op":"draw","n":1},{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"trait":"空島"}}]},"trigger":[{"op":"cond","check":{"leaderTrait":"空島"},"then":[{"op":"draw","n":2}]}]},
  "OP16-002": {"onPlay":[{"op":"revealCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"draw","n":1}]}]},
  "OP16-003": {"static":[{"op":"grantKeywordToLeader","kw":"doubleAttack","cond":"selfTurn"},{"op":"leaderBuffStatic","power":2000,"cond":"selfTurn"}],"onPlay":[{"op":"revealCost","count":2,"filter":{"type":"CHAR","power":8000},"then":[{"op":"powerMod","side":"opp","amount":-6000,"count":1,"optional":true}]}]},
  "OP16-005": {"costMod":{"cond":{"selfChar":{"minPower":8000,"traitIncludes":"白ひげ海賊団"}},"amount":-3},"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-006": {"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"ko","side":"opp","count":1,"maxEffPower":4000,"optional":true}]}]},
  "OP16-007": {"onPlay":[{"op":"revealCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true}]}]},
  "OP16-008": {"onPlay":[{"op":"trashOwnCharCost","filter":{"power":10000},"then":[{"op":"ko","side":"opp","count":1,"maxEffPower":8000,"optional":true}]}]},
  "OP16-009": {"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"untilNextEnd"},{"op":"powerMod","side":"self","amount":2000,"count":1,"duration":"untilNextEnd"}]}]},
  "OP16-010": {"onPlay":[{"op":"revealCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"ko","side":"opp","count":1,"maxPower":2000,"optional":true}]}]},
  "OP16-011": {"onPlay":[{"op":"revealCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"draw","n":1}]}],"onAttack":[{"op":"ko","side":"opp","maxPower":2000,"count":2,"optional":true,"cond":"donX1"}]},
  "OP16-012": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"and":[{"leaderTrait":"赤髪海賊団"},{"donAtLeast":10}]},"then":[{"op":"playSpecificFromHand","nameIncludes":"シャンクス","choose":true,"optional":true}]}]}]},
  "OP16-013": {"onKO":[{"op":"ko","side":"opp","count":1,"maxPower":8000,"optional":true}]},
  "OP16-014": {"static":[{"op":"leaveProtect","pay":"koSelf","targetFilter":{"type":"CHAR"}}],"onKO":[{"op":"discardCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"reviveSelf"}]}]},
  "OP16-015": {"costMod":{"cond":{"and":[{"leaderNameIncludes":"エース"},{"donAtLeast":6}]},"amount":-2},"onOppAttack":[{"op":"discardCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"setPower","target":"selfAndLeader","value":7000,"duration":"turn"}]}]},
  "OP16-017": {"static":[{"op":"condBuff","cond":{"noSelfChar":{"minCost":8,"traitIncludes":"白ひげ海賊団"}},"power":-4000},{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-018": {"static":[{"op":"leaveProtect","pay":"discardFromHand","onlyKO":true,"includeBattle":true,"once":"turn","targetFilter":{"trait":"赤髪海賊団"},"discardFilter":{"type":"CHAR","minPower":6000}}]},
  "OP16-019": {"main":{"don":0,"fx":[{"op":"playCharFromHand","count":2,"filter":{"type":"CHAR","power":8000,"traitIncludes":"白ひげ海賊団"}}]}},
  "OP16-020": {"main":{"don":0,"fx":[{"op":"restDonCost","n":1,"then":[{"op":"revealCost","count":1,"filter":{"type":"CHAR","power":8000},"then":[{"op":"draw","n":1}]}]}]},"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"filter":{},"then":[{"op":"counterBuff","amount":3000}]}]}},
  "OP16-021": {"onPlay":[{"op":"cond","check":{"leaderTrait":"白ひげ海賊団"},"then":[{"op":"search","look":3,"optional":true}]}],"act":{"label":"トラッシュ：リーダーかキャラにレストのドン1付与","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "OP16-022": {"act":{"label":"ドン最大2枚アクティブ","cost":{},"fx":[{"op":"cond","check":{"allSelfChar":{"trait":"インペルダウン"}},"then":[{"op":"donActivate","n":2}]}]}},
  "OP16-024": {"onKO":[{"op":"restChar","side":"opp","count":1,"optional":true,"cond":"koByOpp"}],"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-025": {"onAttack":[{"op":"cond","check":{"selfChar":{"name":"ツノッコフ"}},"then":[{"op":"playCharFromHand","maxCost":2,"optional":true}]}]},
  "OP16-026": {"onPlay":[{"op":"search","look":3,"filter":{"trait":"インペルダウン"}},{"op":"playCharFromHand","maxCost":2,"optional":true}]},
  "OP16-027": {"static":[{"op":"condBuff","cond":"donX1","power":2000}]},
  "OP16-029": {"onAttack":[{"op":"cond","check":{"selfChar":{"name":"ウサッコフ"}},"then":[{"op":"playCharFromHand","maxCost":2,"optional":true}]}]},
  "OP16-030": {"onPlay":[{"op":"lock","side":"opp","count":1,"restedOnly":true,"optional":true}],"onTurnEnd":[{"op":"activateOwnChar","all":true,"filter":{"maxCost":5,"color":"緑"}}]},
  "OP16-031": {"onKO":[{"op":"playSpecificFromHand","name":"インペルダウンの囚人","choose":true,"optional":true}]},
  "OP16-032": {"static":[{"op":"unblockableAttack"}],"onPlay":[{"op":"restImmune","side":"opp","count":1,"optional":true,"duration":"untilNextEnd","filter":{"nameExcludes":"モンキー・Ｄ・ルフィ"}}]},
  "OP16-033": {"static":[{"op":"leaveProtect","pay":"restOwnCards","n":2,"onlyKO":true,"targetFilter":{"name":"モーリー"}},{"op":"unblockableAttack"}]},
  "OP16-034": {"static":[{"op":"countBuff","of":"selfChars","distinctBy":"name","amount":1000,"cond":{"and":["donX1","selfTurn"]}}],"onPlay":[{"op":"search","look":3,"filter":{"trait":"インペルダウン"},"optional":true}]},
  "OP16-035": {"onPlay":[{"op":"restChar","side":"opp","count":1,"optional":true},{"op":"discardCost","count":1,"filter":{},"then":[{"op":"donAttach","target":"leader","n":3}]}]},
  "OP16-036": {"onPlay":[{"op":"restChar","side":"opp","count":1,"maxCost":4,"optional":true}],"onAttack":[{"op":"setPower","target":"self","valueFrom":"oppLeaderPower","duration":"turn"}]},
  "OP16-037": {"onPlay":[{"op":"cond","check":{"leaderTrait":"インペルダウン"},"then":[{"op":"restChar","side":"opp","count":1,"maxCost":5,"optional":true}]}]},
  "OP16-038": {"main":{"don":0,"fx":[{"op":"restDonCost","n":6,"then":[{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"インペルダウン"},"distinctBy":"name","min":5}},"then":[{"op":"activateOwnChar","all":true,"incLeader":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"count":1,"amount":3000,"battle":true,"filter":{"type":"LEADER"}}]}},
  "OP16-039": {"main":{"don":0,"fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"nameIncludes":"モンキー・Ｄ・ルフィ"}},{"op":"cond","check":{"leaderTrait":"インペルダウン"},"then":[{"op":"restChar","side":"opp","count":2,"maxCost":3,"optional":true}]}]}},
  "OP16-040": {"main":{"don":0,"fx":[{"op":"cond","check":{"and":[{"selfChar":{"name":"モンキー・Ｄ・ルフィ"}},{"selfChar":{"name":"Mr.3(ギャルディーノ)"}}]},"then":[{"op":"lock","maxCost":6,"restedOnly":true,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"battle":true,"amount":3000,"filter":{"type":"LEADER"}}]}},
  "OP16-041": {"onAllyLeave":{"filter":{"trait":"インペルダウン"},"cond":"donX1","once":"turn","fx":[{"op":"playSpecificFromHand","nameIncludes":"インペルダウンの囚人","choose":true,"optional":true}]}},
  "OP16-043": {"onKO":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"bounce","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  "OP16-044": {"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-045": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"bounceOwnCharCost","filter":{"minCost":2},"then":[{"op":"playCharFromHand","filter":{"maxCost":2,"traitIncludes":"インペルダウン"},"count":1,"optional":true}]}]},
  "OP16-047": {"act":{"label":"相手手札2枚デッキ下","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"oppHandAtLeast":8},"then":[{"op":"oppHandToBottom","n":2}]}]}},
  "OP16-048": {"onPlay":[{"op":"cond","check":{"leaderTrait":"インペルダウン"},"then":[{"op":"draw","n":1},{"op":"playSpecificFromHand","nameIncludes":"インペルダウンの囚人","choose":true,"optional":true}]}],"onOppAttack":[{"op":"giveKeyword","target":"chooseOwn","kw":"blocker","duration":"turn","filter":{"name":"インペルダウンの囚人"},"once":"turn"}]},
  "OP16-049": {"act":{"label":"自分をレストにしてドロー","cost":{"restSelf":true},"fx":[{"op":"draw","n":1}]}},
  "OP16-050": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"bounceOwnCharCost","filter":{"minCost":2},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  "OP16-051": {"onPlay":[{"op":"cond","check":{"not":{"selfHand":{"min":6}}},"then":[{"op":"draw","n":2}]}]},
  "OP16-052": {"act":{"label":"リーダーかキャラにレストのドン付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  "OP16-053": {"onAttack":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"draw","n":1}]}]},
  "OP16-054": {"static":[{"op":"condBuff","cond":{"and":["donX1","selfTurn",{"selfHand":{"min":5}}]},"power":3000}],"onPlay":[{"op":"draw","n":1}]},
  "OP16-055": {"onPlay":[{"op":"draw","n":1}],"onAttack":[{"op":"setPower","target":"self","valueFrom":"oppLeaderPower","duration":"turn","cond":"donX1"}]},
  "OP16-056": {"act":{"label":"トラッシュ：2ドロー・アタック不可","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"draw","n":2},{"op":"setAttackBan","side":"opp","count":1,"maxCost":9,"optional":true,"duration":"untilNextEnd"}]}]}},
  "OP16-057": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfChar":{"name":"インペルダウンの囚人","min":2}},"then":[{"op":"powerMod","side":"self","amount":4000,"count":1,"leader":true,"battle":true,"optional":true}]}]},"trigger":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  "OP16-058": {"main":{"don":0,"fx":[{"op":"cond","check":"don10","then":[{"op":"setPower","target":"allOwn","value":7000,"duration":"turn","filter":{"name":"インペルダウンの囚人"}}]}]},"counter":{"fx":[{"op":"powerMod","side":"self","amount":4000,"count":1,"battle":true,"optional":true,"filter":{"name":"バギー"}}]}},
  "OP16-059": {"main":{"fx":[{"op":"restDonCost","n":7,"then":[{"op":"playCharFromDeck","look":5,"count":2,"filter":{"maxPower":6000,"trait":"インペルダウン","type":"CHAR"}}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","amount":3000,"leader":true,"battle":true,"filter":{"type":"LEADER"}}]}},
  "OP16-060": {"act":{"label":"アクティブのドン8戻し：大将3体登場","cost":{},"fx":[{"op":"donMinus","n":8,"fromActive":true},{"op":"playCharFromHand","count":3,"filter":{"trait":"大将"},"distinctName":true}]}},
  "OP16-063": {"onPlay":[{"op":"donFromDeck","n":2,"mode":"rest"}],"act":{"label":"ドン-1：相手キャラ1枚のブロッカー発動不可","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"denyBlocker","side":"opp","count":1,"optional":true}]}},
  "OP16-064": {"onPlay":[{"op":"search","look":5,"filter":{"trait":"海軍"},"exclude":"コビー","optional":true}]},
  "OP16-065": {"onPlay":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-6000,"count":1,"optional":true,"duration":"untilNextEnd"}],"act":{"label":"ドンデッキからドン2枚をアクティブ追加","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"donFromDeck","n":2,"mode":"active","cond":{"leaderTrait":"海軍"}}]}]}},
  "OP16-066": {"onPlay":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"donFromDeck","n":2,"mode":"rest"},{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  "OP16-067": {"onPlay":[{"op":"search","look":5,"filter":{"trait":"海軍"}},{"op":"discardOwn","n":1}]},
  "OP16-068": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"onAttack":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"powerMod","side":"self","amount":3000,"count":1}]}]},
  "OP16-069": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"onAttack":[{"op":"donFromDeck","n":1,"mode":"active"}]},
  "OP16-070": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}]}]},
  "OP16-071": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}],"onKO":[{"op":"donFromDeck","n":1,"mode":"rest"}]},
  "OP16-072": {"onPlay":[{"op":"search","look":5,"filter":{"trait":"インペルダウン"}}]},
  "OP16-073": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"donFromDeck","n":1,"mode":"rest"}],"onTurnEnd":[{"op":"donMinus","n":2},{"op":"activateOwnChar","target":"self"},{"op":"giveKeyword","target":"self","kw":"blocker","duration":"untilNextEnd"}]},
  "OP16-074": {"onPlay":[{"op":"cond","check":{"leaderTrait":"インペルダウン"},"then":[{"op":"oppDonMinus","n":1}]}],"onKO":[{"op":"oppDonMinus","n":4}]},
  "OP16-075": {"onPlay":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"donFromDeck","n":1,"mode":"rest"}]}]},
  "OP16-076": {"main":{"fx":[{"op":"restDonCost","n":3,"then":[{"op":"powerMod","side":"self","amount":2000,"count":3,"optional":true,"filter":{"trait":"大将"}}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfChar":{"trait":"大将"}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"count":1,"optional":true,"battle":true}]}]}},
  "OP16-077": {"main":{"fx":[{"op":"search","look":5,"count":2,"filter":{"trait":"海軍"}},{"op":"discardOwn","n":1}]}},
  "OP16-078": {"onPlay":[{"op":"search","look":5,"filter":{"trait":"海軍"}}],"act":{"label":"ドン-1:1ドロー後手札1枚捨て","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":1},{"op":"draw","n":1},{"op":"discardOwn","n":1}]}},
  "OP16-079": {"onReviveFromTrash":{"filter":{"trait":"ワノ国"},"kw":"rush","duration":"turn"}},
  "OP16-081": {"act":{"label":"相手キャラに-2000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"or":[{"selfChar":{"minCost":8}},{"oppChar":{"minCost":8}}]},"then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]}]}},
  "OP16-082": {"static":[{"op":"staticCost","amount":3}],"onPlay":[{"op":"cond","check":{"leaderTrait":"ワノ国"},"then":[{"op":"search","look":5,"filter":{"trait":"ワノ国"},"optional":true,"rest":"trash"}]}]},
  "OP16-083": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"CHAR","minCost":8},"then":[{"op":"draw","n":2}]}]},
  "OP16-084": {"act":{"label":"コスト20以上→トラッシュ→コスト9モモの助登場","cost":{},"fx":[{"op":"cond","check":{"and":[{"selfCostAtLeast":20},{"donAtLeast":9},{"trashHas":{"name":"光月モモの助","cost":9}}]},"then":[{"op":"trashSelfCost","then":[{"op":"reviveFromTrash","filter":{"name":"光月モモの助","cost":9}}]}]}]}},
  "OP16-085": {"onPlay":[{"op":"reviveFromTrash","maxCost":6,"filter":{"trait":"ワノ国","nameExcludes":"光月モモの助"}}]},
  "OP16-087": {"onPlay":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTrait":"ワノ国"},"then":[{"op":"draw","n":1},{"op":"addCostBuff","side":"self","count":1,"amount":20,"duration":"turn","optional":true,"filter":{"name":"光月モモの助"}}]}]}]},
  "OP16-088": {"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-089": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2},{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]},
  "OP16-090": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2},{"op":"ko","side":"opp","count":1,"maxCost":1,"optional":true}]},
  "OP16-091": {"onPlay":[{"op":"cond","check":{"leaderTrait":"ワノ国"},"then":[{"op":"search","look":4,"filter":{"trait":"ワノ国"},"exclude":"ナミ","optional":true,"rest":"trash"}]}]},
  "OP16-092": {"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"CHAR","minCost":8},"then":[{"op":"draw","n":2}]}]},
  "OP16-093": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2},{"op":"donAttach","target":"chooseOwn","n":1}]},
  "OP16-094": {"onKO":[{"op":"oppDiscard","n":2}],"act":{"label":"ワノ国にレストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"traitIncludes":"ワノ国"}}]}},
  "OP16-095": {"static":[{"op":"unblockableAttack"}],"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn","filter":{"color":"黒","trait":"ワノ国"}}]},
  "OP16-096": {"static":[{"op":"unblockableAttack"}],"onKO":[{"op":"reviveFromTrash","maxCost":6,"filter":{"name":"ヤマト"}}]},
  "OP16-097": {"onPlay":[{"op":"trashToHand","count":1,"filter":{"type":"CHAR","maxCost":6,"trait":"ワノ国"},"optional":true},{"op":"playCharFromHand","maxCost":2,"count":1,"optional":true}]},
  "OP16-098": {"onPlay":[{"op":"draw","n":1},{"op":"discardOwn","n":1}],"act":{"label":"トラッシュ：コスト8黒ヤマトを登場","cost":{},"fx":[{"op":"cond","check":{"trashHas":{"cost":8,"color":"黒","nameIncludes":"ヤマト"}},"then":[{"op":"trashSelfCost","then":[{"op":"reviveFromTrash","filter":{"cost":8,"color":"黒","nameIncludes":"ヤマト"}}]}]}]}},
  "OP16-099": {"main":{"fx":[{"op":"restDonCost","n":6,"then":[{"op":"deckToTrash","n":5},{"op":"reviveFromTrash","maxCost":6,"filter":{"trait":"ワノ国"}}]}]},"counter":{"cost":1,"fx":[{"op":"powerMod","side":"self","leader":true,"battle":true,"amount":3000,"count":1,"filter":{"type":"LEADER"}}]}},
  "OP16-100": {"main":{"don":0,"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"oppCharKOedThisTurn":true},"then":[{"op":"activateOwnChar","incLeader":true,"all":true,"filter":{"type":"LEADER"}}]}]}]},"counter":{"cost":1,"fx":[{"op":"powerMod","side":"self","leader":true,"battle":true,"amount":3000,"count":1,"filter":{"type":"LEADER"}}]}},
  "OP16-101": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"count":1,"optional":true,"duration":"turn"},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"ko","side":"opp","count":1,"maxCost":2,"optional":true}]}]},"trigger":[{"op":"trashToHand","count":1,"filter":{"name":"ヤマト"},"optional":true}]},
  "OP16-102": {"onKO":[{"op":"draw","n":1},{"op":"playFromHandOrTrash","filter":{"name":"ハチノス"},"optional":true}],"trigger":[{"op":"draw","n":1},{"op":"playFromHandOrTrash","filter":{"name":"ハチノス"},"optional":true}]},
  "OP16-106": {"onKO":[{"op":"cond","check":{"leaderTrait":"黒ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"setPower","target":"chooseOwnL","value":7000,"duration":"turn","optional":true}]}]},
  "OP16-107": {"onKO":[{"op":"oppLifeToHand","n":1,"optional":true}]},
  "OP16-111": {"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-113": {"static":[{"op":"staticKeyword","kw":"blocker","cond":"life<=2"}]},
  "OP16-114": {"onKO":[{"op":"ko","side":"opp","count":1,"maxCost":4,"optional":true}]},
  "OP16-115": {"main":{"fx":[{"op":"cond","check":{"leaderTrait":"黒ひげ海賊団"},"then":[{"op":"trashToHand","count":1,"filter":{"hasTrigger":true,"nameExcludes":"闇水"},"optional":true}]}]}},
  "OP16-117": {"main":{"fx":[{"op":"discardCost","count":1,"filter":{"hasTrigger":true},"then":[{"op":"negateChoose","charsOnly":true,"maxCost":8,"optional":true}]}]}},
  "OP16-118": {"static":[{"op":"handCounterBuff","filter":{"type":"CHAR","power":8000},"amount":2000}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]},"optional":true}],"onKO":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]},"optional":true}]},
  /* ===== OP13 バッチ1（赤・既存opのみ。リーダー002/003/004 と新pay要の017は後続） ===== */
  // OP13-005 イナズマ: 【登場時】自分のリーダーにレストのドン1付与
  "OP13-005": {"onPlay":[{"op":"donAttach","target":"leader","n":1}]},
  // OP13-006 ウープ・スラップ: 【登場時】「モンキー・Ｄ・ルフィ」1枚にレストのドン2付与
  "OP13-006": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":2,"filter":{"name":"モンキー・Ｄ・ルフィ"}}]},
  // OP13-007 エース＆サボ＆ルフィ: 【起動メイン】リーダーかキャラにアクティブのドン1付与＋自身トラッシュ：相手1枚-3000
  "OP13-007": {"act":{"label":"ドン1付与+自身トラッシュ:相手1枚-3000","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"fromAny":true},{"op":"trashSelfCost","then":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true,"duration":"turn"}]}]}},
  // OP13-008 イワンコフ: 自分の革命軍が相手効果でKOされる場合、代わりに自身をトラッシュ
  "OP13-008": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"革命軍"},"onlyKO":true,"pay":"koSelf"}]},
  // OP13-009 カーリー・ダダン: このカード以外の《山賊》がいる場合【ダブルアタック】
  "OP13-009": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"selfCharCount":{"filter":{"trait":"山賊"},"min":2}}}]},
  // OP13-012 ネフェルタリ・ビビ: 【登場時】デッキ上4枚からコスト2以上の《アラバスタ王国》か《麦わらの一味》1枚を手札へ、残りデッキ下
  "OP13-012": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"minCost":2,"or":[{"traitIncludes":"アラバスタ王国"},{"traitIncludes":"麦わらの一味"}]},"optional":true}]},
  // OP13-013 ヒグマ: 【登場時】相手のパワー0以下のキャラ1枚までをKO
  "OP13-013": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":0},"count":1,"optional":true}]},
  // OP13-015 マキノ: 【起動メイン】このキャラをレスト：「モンキー・Ｄ・ルフィ」1枚を+2000
  "OP13-015": {"act":{"label":"レスト:ルフィ1枚+2000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":2000,"count":1,"optional":true,"duration":"turn","filter":{"name":"モンキー・Ｄ・ルフィ"}}]}},
  // OP13-019 “火炎”が許さねェってよ!!: 【メイン】ドン4レスト→相手1枚-3000→相手パワー3000以下KO ／【カウンター】リーダー+3000
  "OP13-019": {"main":{"fx":[{"op":"restDonCost","n":4,"then":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true,"duration":"turn"},{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP13-020 拳・骨・隕石: 【メイン】相手1枚を-5000
  "OP13-020": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-5000,"count":1,"optional":true,"duration":"turn"}]}},
  // OP13-021 ゴムゴムの銃乱打: 【メイン】「モンキー・Ｄ・ルフィ」1枚にレストのドン1付与→相手1枚-2000
  "OP13-021": {"main":{"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"name":"モンキー・Ｄ・ルフィ"}},{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"turn"}]}},
  // OP13-022 フーシャ村 STAGE: 【起動メイン】このステージをレスト：元々パワー2000以下のキャラ1枚を+1000
  "OP13-022": {"act":{"label":"レスト:元々P2000以下を+1000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":1000,"count":1,"optional":true,"duration":"turn","filter":{"maxPower":2000}}]}},
  /* ===== OP13 バッチ2（緑・新基盤: 登場ban(コスト条件)/setPlayBan/delayedDonActivate/donActivate all/playCharFromHand rested） ===== */
  // OP13-023 ウタ: 【登場時】ドン2アクティブ→元々コスト5以上を登場不可 ／【KO時】手札からコスト5以下を1枚レストで登場
  "OP13-023": {"onPlay":[{"op":"donActivate","n":2},{"op":"setSummonBan","minBaseCost":5}],"onKO":[{"op":"playCharFromHand","maxCost":5,"count":1,"optional":true,"rested":true}]},
  // OP13-024 ゴードン: 【登場時】手札の《音楽》か《FILM》1枚公開：このターン終了時ドン2アクティブ
  "OP13-024": {"onPlay":[{"op":"revealCost","filter":{"or":[{"traitIncludes":"音楽"},{"traitIncludes":"FILM"}]},"then":[{"op":"delayedDonActivate","n":2}]}]},
  // OP13-025 コビー: 【ブロッカー】 ／【登場時】リーダーが《FILM》ならドン1アクティブ
  "OP13-025": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"FILM"},{"leaderAttr":"打"}]},"then":[{"op":"donActivate","n":1}]}]},
  // OP13-026 サニーくん: 【起動メイン】ドン1レスト：自身を次の相手ターン終了まで+2000
  "OP13-026": {"act":{"label":"ドン1レスト:自身+2000","cost":{"don":1},"fx":[{"op":"powerMod","target":"self","amount":2000,"duration":"untilNextEnd"}]}},
  // OP13-027 サンジ: 【登場時】ドン2アクティブ ／【自分のターン終了時】リーダー《FILM》か《麦わら》ならドン1アクティブ
  "OP13-027": {"onPlay":[{"op":"donActivate","n":2}],"onTurnEnd":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"FILM"},{"leaderTraitIncludes":"麦わらの一味"}]},"then":[{"op":"donActivate","n":1}]}]},
  // OP13-028 シャンクス: 【登場時】ドンすべてアクティブ→このターン手札からプレイ不可
  "OP13-028": {"onPlay":[{"op":"donActivate","all":true},{"op":"setPlayBan"}]},
  // OP13-030 チョッパー: 【登場時】ドン2アクティブ
  "OP13-030": {"onPlay":[{"op":"donActivate","n":2}]},
  // OP13-031 ロー: ライフ1以下で【ブロッカー】 ／【登場時】自キャラ1枚を手札に戻す：コスト5以下を1枚レストで登場
  "OP13-031": {"static":[{"op":"staticKeyword","kw":"blocker","cond":"life<=1"}],"onPlay":[{"op":"bounceOwnCharCost","then":[{"op":"playCharFromHand","maxCost":5,"count":1,"optional":true,"rested":true}]}]},
  // OP13-032 ニコ・ロビン: 【登場時】相手コスト8以下1枚を次相手エンドまでレスト不可
  "OP13-032": {"onPlay":[{"op":"restImmune","side":"opp","maxCost":8,"duration":"untilNextEnd","count":1,"optional":true}]},
  // OP13-033 フランキー: 【KO時】相手のカード2枚までをレスト
  "OP13-033": {"onKO":[{"op":"restChar","side":"opp","count":2,"optional":true,"includeLeader":true}]},
  // OP13-034 ブルック: 【登場時】リーダー《FILM》か《麦わら》ならドン1アクティブ
  "OP13-034": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"FILM"},{"leaderTraitIncludes":"麦わらの一味"}]},"then":[{"op":"donActivate","n":1}]}]},
  // OP13-035 ベポ: 【自分のターン終了時】このキャラか自分のドン1枚までをアクティブにする
  "OP13-035": {"onTurnEnd":[{"op":"chooseOption","options":[{"label":"ドン1アクティブ","fx":[{"op":"donActivate","n":1}]},{"label":"このキャラをアクティブ","fx":[{"op":"activateOwnChar","target":"self"}]}]}]},
  // OP13-037 ロロノア・ゾロ: 【登場時】リーダー《FILM》か《麦わら》ならドン2アクティブ ／【自分のターン終了時】このキャラをアクティブ
  "OP13-037": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"FILM"},{"leaderTraitIncludes":"麦わらの一味"}]},"then":[{"op":"donActivate","n":2}]}],"onTurnEnd":[{"op":"activateOwnChar","target":"self"}]},
  // OP13-038 ゴムゴムの象銃: 【メイン】相手コスト5以下1枚をレスト→このターン終了時ドン2アクティブ
  "OP13-038": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"delayedDonActivate","n":2}]}},
  // OP13-039 ゴムゴムの蛇銃: 【カウンター】相手のレストのコスト4以下1枚をKO
  "OP13-039": {"counter":{"cost":0,"fx":[{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}]}},
  // OP13-040 強ェとわかってんだから…: 【メイン】ドン2レスト→相手レストのコスト7以下2枚を次リフレッシュでアクティブにしない ／【カウンター】リーダー+3000
  "OP13-040": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"lock","side":"opp","filter":{"maxCost":7,"restedOnly":true},"count":2,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  /* ===== OP13 バッチ3（青・白ひげ/ハンコック。新cond leaderMulticolor・giveKeyword banish） ===== */
  // OP13-041 イゾウ: 【登場時】2ドロー
  "OP13-041": {"onPlay":[{"op":"draw","n":2}]},
  // OP13-044 クリエル: 【アタック時】白ひげのリーダーかキャラにレストのドン1付与 ／【KO時】1ドロー
  "OP13-044": {"onAttack":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"traitIncludes":"白ひげ海賊団"}}],"onKO":[{"op":"draw","n":1}]},
  // OP13-045 ハルタ: 【アタック時】手札4枚以下なら1ドロー
  "OP13-045": {"onAttack":[{"op":"cond","check":{"selfHandAtMost":4},"then":[{"op":"draw","n":1}]}]},
  // OP13-046 ビスタ: 【ダブルアタック】 ／【ターン1回】KO/相手効果で場を離れる代わりに白ひげ1枚を手札から捨てる
  "OP13-046": {"static":[{"op":"leaveProtect","targetSelf":true,"includeBattle":true,"once":"turn","pay":"discardFromHand","discardFilter":{"traitIncludes":"白ひげ海賊団"}}]},
  // OP13-047 フォッサ: 自分の白ひげが相手効果でKOされる場合、代わりに自身をトラッシュ
  "OP13-047": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"白ひげ海賊団"},"onlyKO":true,"pay":"koSelf"}]},
  // OP13-050 ボア・サンダーソニア: 【登場時】リーダー「ボア・ハンコック」なら手札からコスト3以下「ボア・ハンコック」を登場
  "OP13-050": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ボア・ハンコック"},"then":[{"op":"playCharFromHand","maxCost":3,"filter":{"name":"ボア・ハンコック"},"count":1,"optional":true}]}]},
  // OP13-051 ボア・ハンコック: 【KO時】リーダー「ボア・ハンコック」か多色なら2ドロー
  "OP13-051": {"onKO":[{"op":"cond","check":{"or":[{"leaderNameIncludes":"ボア・ハンコック"},{"leaderMulticolor":true}]},"then":[{"op":"draw","n":2}]}]},
  // OP13-052 ボア・マリーゴールド: 【ブロッカー】 ／【登場時】リーダー「ボア・ハンコック」なら手札からコスト6以下「ボア・ハンコック」を登場
  "OP13-052": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ボア・ハンコック"},"then":[{"op":"playCharFromHand","maxCost":6,"filter":{"name":"ボア・ハンコック"},"count":1,"optional":true}]}]},
  // OP13-053 マーシャル・Ｄ・ティーチ: 【アタック時】白ひげ1枚トラッシュ：1ドロー＋このターン【バニッシュ】
  "OP13-053": {"onAttack":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"giveKeyword","target":"self","kw":"banish","duration":"turn"}]}]},
  // OP13-055 ラクヨウ: 【アタック時】手札4枚以下なら自分の白ひげ全てを+1000
  "OP13-055": {"onAttack":[{"op":"cond","check":{"selfHandAtMost":4},"then":[{"op":"powerMod","side":"self","all":true,"amount":1000,"duration":"turn","filter":{"traitIncludes":"白ひげ海賊団"}}]}]},
  // OP13-056 リトルオーズJr.: 【アタック時】リーダーが白ひげなら1ドロー
  "OP13-056": {"onAttack":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":1}]}]},
  // OP13-058 鳳梨礫: 【メイン】ドン1レスト→相手パワー3000以下1枚をデッキ下 ／【カウンター】リーダー+3000
  "OP13-058": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"deckBottom","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP13-059 ブリリアント・パンク: 【メイン】自キャラ1枚を手札に戻す：コスト6以下のキャラ1枚を手札に戻す
  "OP13-059": {"main":{"fx":[{"op":"bounceOwnCharCost","then":[{"op":"bounce","side":"any","maxCost":6,"count":1,"optional":true}]}]}},
  /* ===== OP13 バッチ4（紫・ロジャー/付与ドンシナジー。新cond selfAttachedDon・checkAllyLeave一般化。064は黒082等と同バッチへ） ===== */
  // OP13-060 天月トキ: 自分のロジャー海賊団が相手効果でKOされる場合、代わりに自身をトラッシュ
  "OP13-060": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"ロジャー海賊団"},"onlyKO":true,"pay":"koSelf"}]},
  // OP13-061 イヌアラシ: 【登場時】付与ドンあれば、ドンデッキからドン1レスト追加→相手コスト1以下1枚をKO
  "OP13-061": {"onPlay":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"},{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP13-062 クロッカス: 【登場時】付与ドンあればドン1アクティブ追加 ／【アタック時】相手の元々パワー3000以下1枚を手札に戻す
  "OP13-062": {"onPlay":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}],"onAttack":[{"op":"bounce","side":"opp","filter":{"maxPower":3000},"count":1,"optional":true}]},
  // OP13-063 光月おでん: 【ブロッカー】 ／【登場時】付与ドンあればドン1レスト追加
  "OP13-063": {"onPlay":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP13-065 シャンクス: 【登場時】デッキ上5枚から「シャンクス」以外のロジャー海賊団1枚を手札へ(残りデッキ下)
  "OP13-065": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ロジャー海賊団","nameExcludes":"シャンクス"},"optional":true}]},
  // OP13-066 シルバーズ・レイリー: 【速攻】 ／【登場時】付与ドンあれば相手コスト5以下1枚レスト→このターン終了時ドン1アクティブ追加
  "OP13-066": {"onPlay":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"scheduleTurnEnd","fx":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // OP13-067 スコッパー・ギャバン: 【登場時】リーダーがロジャー海賊団なら2ドロー1捨て→ドン1レスト追加
  "OP13-067": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ロジャー海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP13-068 ダグラス・バレット: 場のドン8以上で+2000 ／【登場時】リーダーがロジャー海賊団ならドン1レスト追加
  "OP13-068": {"static":[{"op":"condBuff","cond":{"donAtLeast":8},"power":2000}],"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ロジャー海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP13-069 ドンキホーテ・ドフラミンゴ: 【登場時】ドン‼-3：以下から1つ（ドンキならコスト8以下KO ／ コスト7以下3枚を次相手エンドまでレスト不可）
  "OP13-069": {"onPlay":[{"op":"donMinus","n":3},{"op":"chooseOption","options":[{"label":"ドンキならコスト8以下1枚KO","fx":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":8},"count":1,"optional":true}]}]},{"label":"相手コスト7以下3枚をレスト不可","fx":[{"op":"restImmune","side":"opp","maxCost":7,"count":3,"duration":"untilNextEnd","optional":true}]}]}]},
  // OP13-071 ネコマムシ: 【登場時】場のドン8以上なら相手の元々パワー3000以下1枚をKO
  "OP13-071": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"ko","side":"opp","filter":{"maxPower":3000},"count":1,"optional":true}]}]},
  // OP13-072 バギー: 【登場時】リーダーがロジャー海賊団で付与ドンあればドン1レスト追加
  "OP13-072": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ロジャー海賊団"},{"selfAttachedDon":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP13-074 ヘラ: 【登場時】手札からパワー3000以下の《ホーミーズ》1枚を登場
  "OP13-074": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"ホーミーズ","maxPower":3000},"count":1,"optional":true}]},
  // OP13-075 いっちょやるか…: 【メイン】ドン1レスト→リーダー「ゴール・Ｄ・ロジャー」で付与ドンあればドン1レスト追加 ／【カウンター】リーダー+3000
  "OP13-075": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"ゴール・Ｄ・ロジャー"},{"selfAttachedDon":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP13-076 神避: 【メイン】ドン5レスト→付与ドンあれば相手1枚-8000 ／【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP13-076": {"main":{"fx":[{"op":"restDonCost","n":5,"then":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"powerMod","side":"opp","amount":-8000,"count":1,"optional":true,"duration":"turn"}]}]}]},"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP13-077 頂点まで行って来い!!!: 【メイン】ドン3レスト→付与ドンあれば相手の元々パワー4000以下1枚と3000以下1枚をKO ／【カウンター】リーダー+3000
  "OP13-077": {"main":{"fx":[{"op":"restDonCost","n":3,"then":[{"op":"cond","check":{"selfAttachedDon":true},"then":[{"op":"ko","side":"opp","filter":{"maxPower":4000},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxPower":3000},"count":1,"optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP13-078 オーロ・ジャクソン号 STAGE: 【ターン1回】ロジャー海賊団が相手効果で場を離れた時、ドンデッキからドン1レスト追加
  "OP13-078": {"onAllyLeave":{"cause":"oppEffect","filter":{"traitIncludes":"ロジャー海賊団"},"once":"turn","fx":[{"op":"donFromDeck","n":1,"mode":"rested"}]}},
  /* ===== OP13 バッチ5（黒・五老星/天竜人/トラッシュ。新op trashToBottomCost。079/082/084/092/099は最終バッチ） ===== */
  // OP13-080 ナス寿郎聖: トラッシュ7以上で 場を離れず・【速攻】 ／【アタック時】トラッシュ10以上で相手1枚-2000
  "OP13-080": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"immune":true},{"op":"staticKeyword","kw":"rush","cond":{"trashAtLeast":7}}],"onAttack":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"turn"}]}]},
  // OP13-081 コアラ: リーダー《革命軍》でコスト+3 ／【起動メイン】トラッシュ1枚デッキ下：リーダーかキャラにレストのドン1付与
  "OP13-081": {"static":[{"op":"staticCost","cond":{"leaderTraitIncludes":"革命軍"},"amount":3}],"act":{"label":"トラッシュ1枚デッキ下:付与ドン1","cost":{},"fx":[{"op":"trashToBottomCost","then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  // OP13-083 ジェイガルシア・サターン聖: トラッシュ7以上で場を離れない ／【登場時】デッキ上5枚から《五老星》1枚を手札へ
  "OP13-083": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"immune":true}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"trait":"五老星"},"optional":true}]},
  // OP13-086 シャルリア宮: 【登場時】デッキ上3枚から「シャルリア宮」以外の《天竜人》1枚を手札へ(残りトラッシュ)→手札1捨て
  "OP13-086": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"天竜人","nameExcludes":"シャルリア宮"},"rest":"trash","optional":true},{"op":"discardOwn","n":1}]},
  // OP13-087 チャルロス聖: 【ブロッカー】 ／【登場時】デッキ上1枚をトラッシュ
  "OP13-087": {"onPlay":[{"op":"deckToTrash","n":1}]},
  // OP13-089 トップマン・ウォーキュリー聖: トラッシュ7以上で 場を離れず・【ブロッカー】 ／【KO時】1ドロー
  "OP13-089": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"immune":true},{"op":"staticKeyword","kw":"blocker","cond":{"trashAtLeast":7}}],"onKO":[{"op":"draw","n":1}]},
  // OP13-091 マーカス・マーズ聖: トラッシュ7以上で 場を離れず・【ブロッカー】 ／【登場時】手札1捨て：相手の元々コスト5以下1枚をKO
  "OP13-091": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"immune":true},{"op":"staticKeyword","kw":"blocker","cond":{"trashAtLeast":7}}],"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":5},"count":1,"optional":true}]}]},
  // OP13-093 モルガンズ: 【ブロッカー】 ／【登場時】2ドロー2捨て
  "OP13-093": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP13-094 ヨーク: 【登場時】自分の《天竜人》1枚を+2000
  "OP13-094": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"count":1,"optional":true,"duration":"turn","filter":{"traitIncludes":"天竜人"}}]},
  // OP13-095 ロズワード聖: 【登場時】手札1捨て：自キャラが《天竜人》のみなら相手の元々コスト3以下2枚をKO
  "OP13-095": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"allSelfChar":{"trait":"天竜人"}},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":2,"optional":true}]}]}]},
  // OP13-096 “五老星”ここに!!!: 【メイン】デッキ上3枚から自身以外の《天竜人》1枚を手札へ(残りトラッシュ)
  "OP13-096": {"main":{"fx":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"天竜人","nameExcludes":"ここに"},"rest":"trash","optional":true}]}},
  // OP13-097 世界の均衡など…: 【メイン】ドン5レスト→自キャラが《天竜人》のみなら相手の元々コスト6以下1枚をKO ／【カウンター】リーダー+3000
  "OP13-097": {"main":{"fx":[{"op":"restDonCost","n":5,"then":[{"op":"cond","check":{"allSelfChar":{"trait":"天竜人"}},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP13-098 元々…ないではないか…: 【メイン】ドン1レスト→リーダー「イム」なら相手のコスト7ステージKO ／【カウンター】リーダー「イム」ならリーダーかキャラ+4000
  "OP13-098": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"leaderNameIncludes":"イム"},"then":[{"op":"koStage","filter":{"cost":7}}]}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"イム"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  /* ===== OP13 バッチ6（黄・トリガー/エッグヘッド/ライフ。新op flipLifeCost・新cond selfLifeLEOpp。105/106/109/119は最終バッチ） ===== */
  // OP13-100 ジュエリー・ボニー LEADER: 【自分のターン中】トリガー持ちキャラ登場時、リーダーかキャラにレストのドン2付与
  "OP13-100": {"onAllyEnter":{"when":"selfTurn","filter":{"hasTrigger":true},"fx":[{"op":"donAttach","target":"chooseOwn","n":2}]}},
  // OP13-102 エジソン: 【起動メイン】自身トラッシュ：自分のライフが相手以下なら1ドロー＋相手コスト3以下1枚レスト
  "OP13-102": {"act":{"label":"自身トラッシュ:ライフ条件で1ドロー＋相手レスト","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"selfLifeLEOpp":true},"then":[{"op":"draw","n":1},{"op":"restChar","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true}]}]}]}},
  // OP13-104 光月日和: 【ブロッカー】 ／【KO時】手札1捨て：リーダーが多色ならデッキ上1枚をライフに加える
  "OP13-104": {"onKO":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"lifeAddFromDeck","n":1}]}]}]},
  // OP13-108 ジュエリー・ボニー: 【登場時】リーダーが《エッグヘッド》なら速攻を得る→相手は自身のライフ上1枚を手札に加える
  "OP13-108": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"エッグヘッド"},"then":[{"op":"giveKeyword","target":"self","kw":"rush"},{"op":"oppLifeToHand","n":1}]}]},
  // OP13-110 ステューシー: 【ブロッカー】 ／【登場時】リーダーが《エッグヘッド》なら手札からコスト5以下のトリガー持ちキャラを登場
  "OP13-110": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"エッグヘッド"},"then":[{"op":"playCharFromHand","maxCost":5,"filter":{"hasTrigger":true},"count":1,"optional":true}]}]},
  // OP13-113 リリス: 【登場時】デッキ上4枚から「リリス」以外のトリガー持ち1枚を手札へ
  "OP13-113": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"hasTrigger":true,"nameExcludes":"リリス"},"optional":true}]},
  // OP13-114 S-スネーク: 【登場時】/【アタック時】ライフ上1枚を表向き：相手1枚を-2000
  "OP13-114": {"onPlay":[{"op":"flipLifeCost","then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"turn"}]}],"onAttack":[{"op":"flipLifeCost","then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"turn"}]}]},
  // OP13-115 「紙絵」“残身”: 【カウンター】リーダーかキャラ+3000→相手ライフ2以下ならさらに+1000
  "OP13-115": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}]}},
  // OP13-116 この海で一番自由な奴が海賊王だ!!!: 【メイン】デッキ上5枚から《超新星》キャラ1枚を手札へ
  "OP13-116": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星","type":"CHAR"},"optional":true}]}},
  // OP13-117 ゴムゴムの白いスタンプ: 【メイン】ライフ上1枚を表向き：相手の元々コスト6以下1枚をKO
  "OP13-117": {"main":{"fx":[{"op":"flipLifeCost","then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true}]}]}},
  // OP13-118 モンキー・Ｄ・ルフィ: 【ダブルアタック】 ／【登場時】リーダー多色ならドン4アクティブ→元々コスト5以上を登場不可
  "OP13-118": {"onPlay":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"donActivate","n":4},{"op":"setSummonBan","minBaseCost":5}]}]},
  // OP13-120 サボ: 【ブロッカー】 ／【起動メイン】自分のキャラ1枚を次相手ターン終了までコスト+2→リーダーにレストのドン1付与
  "OP13-120": {"act":{"label":"自キャラ1枚コスト+2→リーダーに付与ドン1","cost":{},"fx":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true},{"op":"donAttach","target":"leader","n":1}]}},
  /* ===== OP13 バッチ7（最終・リーダー/複雑キャラ。boardBuff/allySetBase/negateNonTrait/massReviveFromTrash/onTrigger/donPhaseAttach等） ===== */
  // OP13-002 ポートガス・Ｄ・エース LEADER: 【相手のアタック時】ターン1回 手札1捨て：相手リーダーかキャラ1枚を-2000（※被ダメ/6000+KO時の1ドローは未実装）
  "OP13-002": {"onOppAttack":[{"op":"discardCost","count":1,"once":"turn","cpuSkip":true,"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"battle":true,"count":1,"optional":true}]}]},
  // OP13-003 ゴール・Ｄ・ロジャー LEADER: ドンフェイズのドン1枚をリーダーに付与 ／ 場のドン9以下でリーダー-2000
  "OP13-003": {"static":[{"op":"donPhaseAttach"},{"op":"condBuff","cond":{"donAtMost":9},"power":-2000}]},
  // OP13-004 サボ LEADER: ライフ4以上でリーダー-1000 ／【ドン×1】コスト8以上キャラがいればリーダーとキャラ全+1000
  "OP13-004": {"static":[{"op":"condBuff","cond":{"lifeAtLeast":4},"power":-1000},{"op":"boardBuff","cond":{"and":[{"donX1":true},{"selfChar":{"minCost":8}}]},"power":1000}]},
  // OP13-017 モンキー・Ｄ・ドラゴン: 【ターン1回】革命軍が相手効果で場を離れる代わりに、このキャラを-2000で残す
  "OP13-017": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"革命軍"},"once":"turn","pay":"selfPowerMinus","amount":2000}]},
  // OP13-064 ゴール・Ｄ・ロジャー: 自分のリーダー以外＆非「ロジャー海賊団」の自キャラは効果無効 ／【登場時】ドン-3：リーダー+2000＋相手全-2000(次相手エンドまで)
  "OP13-064": {"static":[{"op":"negateNonTrait","trait":"ロジャー海賊団"}],"onPlay":[{"op":"donMinus","n":3},{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"},{"op":"powerMod","side":"opp","all":true,"amount":-2000,"duration":"untilNextEnd"}]},
  // OP13-082 五老星: 【起動メイン】リーダー「イム」ならドン1レスト＋手札1捨て：自キャラ全トラッシュ→トラッシュからパワー5000の異名《五老星》5体登場
  "OP13-082": {"act":{"label":"イム:自キャラ全トラッシュ→五老星5体登場","cost":{"don":1},"fx":[{"op":"cond","check":{"leaderNameIncludes":"イム"},"then":[{"op":"discardCost","count":1,"then":[{"op":"massReviveFromTrash","filter":{"power":5000,"trait":"五老星"},"count":5}]}]}]}},
  // OP13-084 シェパード・十・ピーター聖: トラッシュ7以上で場を離れない ／【自分のターン中】トラッシュ10以上で《五老星》全ての元々パワーを7000
  "OP13-084": {"static":[{"op":"condBuff","cond":{"trashAtLeast":7},"immune":true},{"op":"allySetBase","value":7000,"filter":{"trait":"五老星"},"cond":{"and":[{"selfTurn":true},{"trashAtLeast":10}]}}]},
  // OP13-092 ミョスガルド聖: 【登場時】ライフ3以下なら、トラッシュからコスト1の《聖地マリージョア》ステージを登場
  "OP13-092": {"onPlay":[{"op":"cond","check":{"lifeAtMost":3},"then":[{"op":"reviveStage","filter":{"cost":1,"traitIncludes":"聖地マリージョア"},"optional":true}]}]},
  // OP13-099 虚の玉座 STAGE: 【自分のターン中】トラッシュ19以上でリーダー+1000 ／【起動メイン】このカードとドン3レスト：手札から場のドン枚数以下のコストの黒《五老星》を登場
  "OP13-099": {"static":[{"op":"leaderBuffStatic","cond":{"and":[{"selfTurn":true},{"trashAtLeast":19}]},"power":1000}],"act":{"label":"このカードとドン3レスト:黒五老星を登場","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"playCharFromHand","filter":{"color":"黒","trait":"五老星","maxCostFrom":"don"},"count":1,"optional":true}]}]}},
  // OP13-105 光月モモの助: 【登場時】自分のライフすべてを見て好きな順に置く（並べ替えUIは無いため確認のみ）
  "OP13-105": {"onPlay":[{"op":"reorderLife"}]},
  // OP13-106 コニー: 【相手のターン中】【トリガー】が発動した時、このキャラはこのターン中【ブロッカー】を得る
  "OP13-106": {"onTrigger":{"when":"oppTurn","fx":[{"op":"giveKeyword","target":"self","kw":"blocker","duration":"turn"}]}},
  // OP13-109 ジュエリー・ボニー: このキャラが相手効果で場を離れる代わりに、自分のライフ上1枚を表向きにする
  "OP13-109": {"static":[{"op":"leaveProtect","targetSelf":true,"pay":"flipLifeUp"}]},
  // OP13-119 ポートガス・Ｄ・エース: ライフ3以下で【速攻】 ／【登場時】リーダーにレストのドン1付与→相手コスト5以下1枚を手札に戻す→戻したら相手はコスト4以下を登場(oppPlayAfter)
  "OP13-119": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"lifeAtMost":3}}],"onPlay":[{"op":"donAttach","target":"leader","n":1},{"op":"bounce","side":"opp","maxCost":5,"count":1,"optional":true,"oppPlayAfter":4}]},
  // OP13-079 イム LEADER: 【起動メイン】【ターン1回】《天竜人》キャラか手札1枚をトラッシュ：1ドロー（デッキ構築制約=builderValidate / ゲーム開始時マリージョア登場=startGame で実装済）
  "OP13-079": {"act":{"label":"天竜人キャラか手札1枚をトラッシュ:1ドロー","cost":{},"fx":[{"op":"chooseOption","options":[{"label":"天竜人キャラをトラッシュ","fx":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"天竜人"},"then":[{"op":"draw","n":1}]}]},{"label":"手札1枚を捨てる","fx":[{"op":"discardCost","count":1,"then":[{"op":"draw","n":1}]}]}]}]}},
  /* ===== OP12 バッチ1（赤・イベント2公開/付与ドン。レイリー覇気016-019は後続） ===== */
  // OP12-003 クロッカス: 【KO時】イベント2枚公開：手札からパワー3000以下の赤キャラを登場
  "OP12-003": {"onKO":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"playCharFromHand","filter":{"color":"赤","maxPower":3000},"count":1,"optional":true}]}]},
  // OP12-004 光月おでん: 【起動メイン】イベント2枚公開：自身+2000
  "OP12-004": {"act":{"label":"イベント2枚公開:自身+2000","cost":{},"fx":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"powerMod","target":"self","amount":2000,"duration":"turn"}]}]}},
  // OP12-006 シャクヤク: 【登場時】デッキ上5枚から「ルフィ」か赤イベント1枚を手札へ
  "OP12-006": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"color":"赤","type":"EVENT"}]},"optional":true}]},
  // OP12-007 シャンクス(c2): 【登場時】「シャンクス」以外のロジャー海賊団キャラ1枚にこのターン【速攻】
  "OP12-007": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"rush","duration":"turn","filter":{"traitIncludes":"ロジャー海賊団","nameExcludes":"シャンクス"}}]},
  // OP12-008 シャンクス(c4): 【ブロッカー】 ／【相手のアタック時】手札1捨て：相手リーダーかキャラ1枚を-2000
  "OP12-008": {"onOppAttack":[{"op":"discardCost","count":1,"once":"turn","then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"battle":true,"count":1,"optional":true}]}]},
  // OP12-009 ジンベエ: 【登場時】イベント2枚公開：このターン【速攻】＋次相手エンドまで+1000
  "OP12-009": {"onPlay":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"giveKeyword","target":"self","kw":"rush"},{"op":"powerMod","target":"self","amount":1000,"duration":"untilNextEnd"}]}]},
  // OP12-012 バギー: 【登場時】「バギー」以外のロジャー海賊団キャラ1枚に次相手エンドまで【ブロッカー】
  "OP12-012": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"blocker","duration":"untilNextEnd","filter":{"traitIncludes":"ロジャー海賊団","nameExcludes":"バギー"}}]},
  // OP12-013 はっちゃん: 【起動メイン】このキャラをレスト＋イベント2枚公開：リーダーかキャラにレストのドン2付与
  "OP12-013": {"act":{"label":"レスト+イベント2公開:付与ドン2","cost":{"restSelf":true},"fx":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]}},
  // OP12-014 ボア・ハンコック: 【登場時】デッキ上5枚から「ルフィ」か赤イベント1枚 ／【起動メイン】自身トラッシュ：付与ドン2
  "OP12-014": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"color":"赤","type":"EVENT"}]},"optional":true}],"act":{"label":"自身トラッシュ:付与ドン2","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]}},
  // OP12-015 モンキー・Ｄ・ルフィ: 付与ドン合計2以上で+2000 ／【登場時】イベント2枚公開：パワー3000以下の赤キャラ登場→付与ドン1
  "OP12-015": {"static":[{"op":"condBuff","cond":{"selfAttachedDonAtLeast":2},"power":2000}],"onPlay":[{"op":"revealCost","count":2,"filter":{"type":"EVENT"},"then":[{"op":"playCharFromHand","filter":{"color":"赤","maxPower":3000},"count":1,"optional":true},{"op":"donAttach","target":"chooseOwn","n":1}]}]},
  // OP12-016 “疑わない事”それが“強さ”だ: 【メイン】レイリーにアクティブのドン2付与→そのカードにブロック不可 ／【カウンター】キャラ1枚+2000
  "OP12-016": {"main":{"fx":[{"op":"donAttach","target":"chooseOwn","n":2,"fromAny":true,"filter":{"name":"シルバーズ・レイリー"}},{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn","filter":{"name":"シルバーズ・レイリー"}}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"battle":true,"count":1,"optional":true}]}},
  // OP12-017 見聞色の覇気: 【メイン】レイリーにアクティブのドン1付与→デッキ上4枚から赤イベントかコスト3以上キャラ1枚を手札へ
  "OP12-017": {"main":{"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"fromAny":true,"filter":{"name":"シルバーズ・レイリー"}},{"op":"search","look":4,"count":1,"filter":{"or":[{"color":"赤","type":"EVENT"},{"minCost":3,"type":"CHAR"}]},"optional":true}]}},
  // OP12-018 覇王色の覇気: 【カウンター】キャラ1枚+2000→ドン1レストできれば相手リーダーとキャラ全-1000
  "OP12-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"battle":true,"count":1,"optional":true},{"op":"restDonCost","n":1,"then":[{"op":"powerMod","side":"opp","all":true,"includeLeader":true,"amount":-1000,"duration":"turn"}]}]}},
  // OP12-019 武装色の覇気: 【メイン】レイリーにアクティブのドン1付与→リーダーかキャラ1枚+1000 ／【カウンター】キャラ1枚+2000
  "OP12-019": {"main":{"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"fromAny":true,"filter":{"name":"シルバーズ・レイリー"}},{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"battle":true,"count":1,"optional":true}]}},
  /* ===== OP12 バッチ2（緑・ゾロ/斬。新cond donX3/selfActive/leaderBattledChar/restedCardsAtLeast） ===== */
  // OP12-020 ロロノア・ゾロ LEADER: 【ドン×3】【起動メイン】相手キャラとバトル済ならリーダーをアクティブ（※その後「コスト7以下にアタック不可」は近似で省略）
  "OP12-020": {"act":{"label":"ドン3:相手キャラとバトル済ならリーダーをアクティブ","cost":{},"fx":[{"op":"cond","check":{"and":[{"donX3":true},{"leaderBattledChar":true}]},"then":[{"op":"activateOwnChar","incLeader":true,"all":true,"filter":{"type":"LEADER"}}]}]}},
  // OP12-022 イヌアラシ: 【起動メイン】レスト：相手レストのコスト5以下1枚を次リフレッシュでアクティブにしない
  "OP12-022": {"act":{"label":"レスト:相手レスト5以下をアクティブにしない","cost":{"restSelf":true},"fx":[{"op":"lock","side":"opp","filter":{"maxCost":5,"restedOnly":true},"count":1,"optional":true}]}},
  // OP12-024 牛鬼丸: アクティブの間は相手効果でKOされない ／【アタック時】付与ドン合計3以上で相手の元々コスト6以下1枚レスト
  "OP12-024": {"static":[{"op":"condBuff","cond":{"selfActive":true},"immune":true}],"onAttack":[{"op":"cond","check":{"selfAttachedDonAtLeast":3},"then":[{"op":"restChar","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true}]}]},
  // OP12-026 くいな: 【起動メイン】レスト：相手の元々コスト4以下1枚レスト→ゾロ(リーダー)にレストのドン3付与
  "OP12-026": {"act":{"label":"レスト:相手4以下レスト→ゾロに付与ドン3","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true},{"op":"donAttach","target":"leader","n":3}]}},
  // OP12-028 光月日和: 【起動メイン】ドン1+レスト：ゾロなら斬属性か緑イベント1枚をサーチ
  "OP12-028": {"act":{"label":"ドン1+レスト:ゾロなら斬/緑イベントサーチ","cost":{"don":1,"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"ロロノア・ゾロ"},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"attr":"斬"},{"color":"緑","type":"EVENT"}]},"optional":true}]}]}},
  // OP12-029 霜月コウ三郎: 【登場時】相手コスト2以下1枚レスト→相手レストの元々コスト1以下1枚KO
  "OP12-029": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxBaseCost":1,"restedOnly":true},"count":1,"optional":true}]},
  // OP12-030 ジュラキュール・ミホーク: 【ブロッカー】 ／【登場時】ドン4アクティブ→元々コスト7以上を登場不可
  "OP12-030": {"onPlay":[{"op":"donActivate","n":4},{"op":"setSummonBan","minBaseCost":7}]},
  // OP12-031 たしぎ: 【登場時】相手の元々コスト6以下1枚レスト→ゾロ(リーダー)にレストのドン3付与
  "OP12-031": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true},{"op":"donAttach","target":"leader","n":3}]},
  // OP12-034 ペローナ: 【登場時】リーダーが属性(斬)なら斬属性か緑イベント1枚をサーチ
  "OP12-034": {"onPlay":[{"op":"cond","check":{"leaderAttr":"斬"},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"attr":"斬"},{"color":"緑","type":"EVENT"}]},"optional":true}]}]},
  // OP12-036 ロロノア・ゾロ(c4): リーダーが属性(斬)なら+1000（※「効果で登場できない」「斬とのバトルでKOされない」は近似で省略）
  "OP12-036": {"static":[{"op":"condBuff","cond":{"leaderAttr":"斬"},"power":1000}]},
  // OP12-037 鬼気九刀流阿修羅: 【メイン】ドン3レスト：相手キャラ2枚までレスト（※「キャラかドン」のドン側は省略） ／【カウンター】リーダー+3000
  "OP12-037": {"main":{"fx":[{"op":"restDonCost","n":3,"then":[{"op":"restChar","side":"opp","count":2,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP12-038 二刀流居合羅生門: 【メイン】ドン2レスト：相手レストの元々コスト4以下2枚KO ／【カウンター】リーダー+3000
  "OP12-038": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":4,"restedOnly":true},"count":2,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP12-039 ルフィは海賊王になる男だ: 【メイン】ゾロ(リーダー)をアクティブにする
  "OP12-039": {"main":{"fx":[{"op":"activateOwnChar","incLeader":true,"all":true,"filter":{"type":"LEADER"}}]}},
  // OP12-118 ジュエリー・ボニー(緑): 【ブロッカー】 ／【登場時】レストのカード8枚以上で2ドロー1捨て→ドン1アクティブ
  "OP12-118": {"onPlay":[{"op":"cond","check":{"restedCardsAtLeast":8},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donActivate","n":1}]}]},
  /* ===== OP12 バッチ3（青・海軍/麦わら。新cond selfHandAtLeast/trashEventAtLeast・drawDiscarded） ===== */
  // OP12-040 クザン LEADER: 海軍の効果で手札が捨てられた時、捨てた枚数分ドロー（drawDiscarded）
  "OP12-040": {"onSelfHandDiscarded":[{"op":"drawDiscarded"}]},
  // OP12-041 サンジ LEADER: 【起動メイン】ドン-1：手札から元々コスト3以下の麦わらイベント1枚を発動 ／【アタック時】自ドン≤相手ドンでドン1レスト追加
  "OP12-041": {"act":{"label":"ドン-1:麦わらイベント発動","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"playEventFromHand","filter":{"maxBaseCost":3,"traitIncludes":"麦わらの一味"},"optional":true}]},"onAttack":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP12-042 アルビダ: 元々コスト5以上のキャラが2枚以上でコスト+1 ／【登場時】相手の元々コスト1以下1枚をデッキ下
  "OP12-042": {"static":[{"op":"staticCost","cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}},"amount":1}],"onPlay":[{"op":"deckBottom","side":"opp","filter":{"maxBaseCost":1},"count":1,"optional":true}]},
  // OP12-043 クザン(c6): 手札5枚以上でコスト+1 ／【登場時】手札1捨て：相手1枚を次相手エンドまでアタック不可
  "OP12-043": {"static":[{"op":"staticCost","cond":{"selfHandAtLeast":5},"amount":1}],"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"setAttackBan","side":"opp","count":1,"duration":"untilNextEnd","optional":true}]}]},
  // OP12-044 サカズキ: 【登場時】リーダー海軍なら2ドロー ／【起動メイン】手札1捨て：リーダーかキャラにレストのドン1付与
  "OP12-044": {"onPlay":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"draw","n":2}]}],"act":{"label":"手札1捨て:付与ドン1","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  // OP12-046 ゼファー: 【登場時】手札2枚を捨てる ／【起動メイン】自身トラッシュ：コスト5以下を手札に戻す
  "OP12-046": {"onPlay":[{"op":"discardOwn","n":2}],"act":{"label":"自身トラッシュ:コスト5以下を手札に戻す","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}]}]}},
  // OP12-047 センゴク: 【登場時】手札1捨て：デッキ上5枚から「センゴク」以外の海軍2枚を手札へ
  "OP12-047": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"search","look":5,"count":2,"filter":{"trait":"海軍","nameExcludes":"センゴク"},"optional":true}]}]},
  // OP12-048 ドンキホーテ・ロシナンテ(青): 青海軍が相手効果で場を離れる代わりに自カード1枚レスト（※「手札1捨て」併用は近似で省略）
  "OP12-048": {"static":[{"op":"leaveProtect","targetFilter":{"color":"青","traitIncludes":"海軍"},"pay":"restOwnCards","n":1}]},
  // OP12-051 ヒナ: 【起動メイン】レスト＋手札1捨て：相手の元々コスト4以下1枚はこのターン【ブロッカー】不可
  "OP12-051": {"act":{"label":"レスト+手札1捨て:相手4以下をブロッカー不可","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"denyBlocker","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]}},
  // OP12-053 ボルサリーノ: 【ターン1回】場を離れる代わりに手札1捨て ／【相手のターン中】リーダー海軍なら【ブロッカー】＋1000
  "OP12-053": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"discardFromHand"},{"op":"staticKeyword","kw":"blocker","cond":{"and":[{"oppTurn":true},{"leaderTrait":"海軍"}]}},{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"leaderTrait":"海軍"}]},"power":1000}]},
  // OP12-054 マーシャル・Ｄ・ティーチ: 【登場時】リーダー王下七武海なら相手コスト1以下1枚を手札に戻す
  "OP12-054": {"onPlay":[{"op":"cond","check":{"leaderTrait":"王下七武海"},"then":[{"op":"bounce","side":"opp","maxCost":1,"count":1,"optional":true}]}]},
  // OP12-056 モンキー・Ｄ・ガープ: 【登場時】手札1捨て：手札から「ガープ」以外のパワー8000以下の青海軍を登場
  "OP12-056": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"playCharFromHand","filter":{"color":"青","traitIncludes":"海軍","maxPower":8000,"nameExcludes":"モンキー・Ｄ・ガープ"},"count":1,"optional":true}]}]},
  // OP12-057 アイス塊暴雉嘴: 【カウンター】リーダー1枚+4000→手札1捨て
  "OP12-057": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"filter":{"type":"LEADER"}},{"op":"discardOwn","n":1}]}},
  // OP12-059 粗砕: 【メイン】リーダー「サンジ」なら1ドロー ／【カウンター】トラッシュにイベント4枚以上でリーダー1枚+4000
  "OP12-059": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"draw","n":1}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"trashEventAtLeast":4},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"filter":{"type":"LEADER"}}]}]}},
  // OP12-060 牛肉バースト: 【メイン】リーダー多色なら二択（相手コスト4以下を手札へ／手札6以下なら2ドロー）
  "OP12-060": {"main":{"fx":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"chooseOption","options":[{"label":"相手コスト4以下を手札に戻す","fx":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]},{"label":"手札6以下なら2ドロー","fx":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"draw","n":2}]}]}]}]}]}},
  /* ===== OP12 バッチ4（紫・サンジ/ロー/ドンキ。oppDonFromDeck・trashEvent countBuff） ===== */
  // OP12-061 ドンキホーテ・ロシナンテ LEADER: 【ターン1回】「ロー」がKOされる代わりにライフ上1枚を手札に（※起動メインのコスト軽減は近似で省略）
  "OP12-061": {"static":[{"op":"leaveProtect","targetFilter":{"name":"トラファルガー・ロー"},"onlyKO":true,"once":"turn","pay":"lifeToHand"}]},
  // OP12-062 ヴィンスモーク・ソラ: 【登場時】リーダー「サンジ」で自ドン≤相手ドンなら、ドン1レスト追加→1ドロー
  "OP12-062": {"onPlay":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"サンジ"},{"donLEOpp":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"},{"op":"draw","n":1}]}]},
  // OP12-065 エンポリオ・イワンコフ: トラッシュにイベント4枚以上で【ブロッカー】 ／【KO時】トラッシュからイベント1枚を手札へ
  "OP12-065": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"trashEventAtLeast":4}}],"onKO":[{"op":"trashToHand","count":1,"filter":{"type":"EVENT"},"optional":true}]},
  // OP12-069 クロコダイル(紫): 【相手のアタック時】ドン-1：リーダーが『B・W』含むなら自分のリーダーかキャラ1枚を+2000
  "OP12-069": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}]},
  // OP12-070 サンジ(紫): トラッシュのイベント5枚ごとに+1000 ／場を離れる代わりに自分の場のドン1枚をドンデッキに戻せる
  "OP12-070": {"static":[{"op":"countBuff","of":"trash","ofFilter":{"type":"EVENT"},"per":5,"amount":1000},{"op":"leaveProtect","targetSelf":true,"pay":"donToDeck","n":1}]},
  // OP12-072 ゼフ: 自分の場のドンがドンデッキに戻された時、リーダー「サンジ」ならこのキャラはこのターン【速攻】
  "OP12-072": {"onDonReturned":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"giveKeyword","target":"self","kw":"rush"}]}]},
  // OP12-073 トラファルガー・ロー(c7): 【登場時】自ドン≤相手ドンならドン1アクティブ追加→「ロシナンテ」とハート全を次相手エンドまで+1000
  "OP12-073": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]},{"op":"powerMod","side":"self","all":true,"amount":1000,"duration":"untilNextEnd","filter":{"or":[{"name":"ドンキホーテ・ロシナンテ"},{"traitIncludes":"ハートの海賊団"}]}}]},
  // OP12-074 パティ: 【登場時】手札からイベント1枚を捨てる：リーダー「サンジ」ならドン1アクティブ追加
  "OP12-074": {"onPlay":[{"op":"discardCost","count":1,"filter":{"type":"EVENT"},"then":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // OP12-075 ミス・オールサンデー: 【登場時】相手の元々コスト3以下1枚をKO→相手はドンデッキからドン1アクティブ追加してもよい
  "OP12-075": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true},{"op":"oppDonFromDeck","n":1}]},
  // OP12-077 “影消し”の術: 【メイン】「ロー」1枚を+2000→そのカードにブロック不可
  "OP12-077": {"main":{"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"name":"トラファルガー・ロー"}},{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn","filter":{"name":"トラファルガー・ロー"}}]}},
  // OP12-078 串焼き: 【メイン】自ドン≤相手ドンなら1ドロー→相手1枚を-3000
  "OP12-078": {"main":{"fx":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"draw","n":1}]},{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true,"duration":"turn"}]}},
  // OP12-079 ルフィは“海賊王”になる男だ(紫): 【メイン】リーダー「サンジ」ならデッキ上3枚から1枚を手札へ
  "OP12-079": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"search","look":3,"count":1,"optional":true}]}]}},
  // OP12-080 バラティエ STAGE: 【起動メイン】このステージをデッキ下：リーダー「サンジ」ならデッキ上3枚からイベント1枚を手札へ
  "OP12-080": {"act":{"label":"ステージをデッキ下:サンジならイベントサーチ","cost":{},"fx":[{"op":"stageToBottomCost","then":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"search","look":3,"count":1,"filter":{"type":"EVENT"},"optional":true}]}]}]}},
  /* ===== OP12 バッチ5（黒・革命軍。onLeaderAttack。staticCost(革命軍)多用） ===== */
  // OP12-081 コアラ LEADER: 相手リーダーにアタック時、コスト8以上が2枚以上なら1ドロー（※「相手の登場時に相手ライフ手札」は後続/省略）
  "OP12-081": {"onLeaderAttack":{"vsLeader":true,"cond":{"selfCharCount":{"filter":{"minBaseCost":8},"min":2}},"fx":[{"op":"draw","n":1}]}},
  // OP12-084 エンポリオ・イワンコフ(c3): 【ブロッカー】 ／【登場時】リーダー革命軍ならデッキ上3枚をトラッシュ
  "OP12-084": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"deckToTrash","n":3}]}]},
  // OP12-085 カラス: リーダー革命軍でコスト+3 ／【アタック時】リーダー革命軍＋相手手札5枚以上なら相手は手札1枚を捨てる
  "OP12-085": {"static":[{"op":"staticCost","cond":{"leaderTraitIncludes":"革命軍"},"amount":3}],"onAttack":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"oppHandAtLeast":5}]},"then":[{"op":"oppDiscard","n":1}]}]},
  // OP12-086 コアラ(c1): 【登場時】リーダー革命軍ならデッキ上3枚から「コアラ」以外の革命軍か「ニコ・ロビン」1枚を手札へ(残りトラッシュ)
  "OP12-086": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"search","look":3,"count":1,"filter":{"or":[{"traitIncludes":"革命軍","nameExcludes":"コアラ"},{"name":"ニコ・ロビン"}]},"rest":"trash","optional":true}]}]},
  // OP12-087 ニコ・ロビン: リーダーが「コアラ」か「ルフィ」なら【ブロッカー】＋コスト+3 ／【登場時】手札1捨て：相手手札5枚以上なら相手は手札2枚を捨てる
  "OP12-087": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"or":[{"leaderNameIncludes":"コアラ"},{"leaderNameIncludes":"モンキー・Ｄ・ルフィ"}]}},{"op":"staticCost","cond":{"or":[{"leaderNameIncludes":"コアラ"},{"leaderNameIncludes":"モンキー・Ｄ・ルフィ"}]},"amount":3}],"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppDiscard","n":2}]}]}]},
  // OP12-089 ハック: リーダー革命軍で【ブロッカー】＋コスト+4 ／【KO時】リーダー革命軍なら相手の元々コスト4以下1枚KO
  "OP12-089": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderTraitIncludes":"革命軍"}},{"op":"staticCost","cond":{"leaderTraitIncludes":"革命軍"},"amount":4}],"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]},
  // OP12-090 ベロ・ベティ: 【アタック時】デッキ上2枚トラッシュ：相手1枚をこのターンコスト-2
  "OP12-090": {"onAttack":[{"op":"deckToTrash","n":2,"optional":true,"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]},
  // OP12-091 ポーカー: 【起動メイン】トラッシュ3枚をデッキ下：自分の《SMILE》2枚を+2000
  "OP12-091": {"act":{"label":"トラッシュ3枚デッキ下:SMILE2枚+2000","cost":{},"fx":[{"op":"trashToBottomCost","n":3,"then":[{"op":"powerMod","side":"self","amount":2000,"count":2,"optional":true,"duration":"turn","filter":{"traitIncludes":"SMILE"}}]}]}},
  // OP12-093 モーリー: リーダー革命軍でコスト+4
  "OP12-093": {"static":[{"op":"staticCost","cond":{"leaderTraitIncludes":"革命軍"},"amount":4}]},
  // OP12-094 モンキー・Ｄ・ドラゴン: 【登場時】トラッシュの革命軍3枚をデッキ下：リーダー革命軍ならトラッシュからコスト6以下を登場
  "OP12-094": {"onPlay":[{"op":"trashToBottomCost","n":3,"filter":{"traitIncludes":"革命軍"},"then":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"reviveFromTrash","maxCost":6}]}]}]},
  // OP12-095 リンドバーグ: リーダー革命軍でコスト+4 ／【登場時】1ドロー1捨て
  "OP12-095": {"static":[{"op":"staticCost","cond":{"leaderTraitIncludes":"革命軍"},"amount":4}],"onPlay":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]},
  // OP12-096 熊の衝撃: 【メイン】相手の元々コスト4以下1枚をKO（自分のコスト8以上キャラがいればコスト6以下を対象に）
  "OP12-096": {"main":{"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"minBaseCost":8},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true}],"else":[{"op":"ko","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]}},
  // OP12-097 軍隊長集結: 【メイン】デッキ上3枚から「軍隊長集結」以外の革命軍1枚を手札へ(残りトラッシュ)
  "OP12-097": {"main":{"fx":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"革命軍","nameExcludes":"軍隊長集結"},"rest":"trash","optional":true}]}},
  // OP12-098 夢打撃処裏拳: 【カウンター】リーダーかキャラ1枚+2000→コスト8以上の革命軍がいればそのカードも+2000
  "OP12-098": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"selfCharCount":{"filter":{"and":[{"minBaseCost":8},{"traitIncludes":"革命軍"}]},"min":1}},"then":[{"op":"powerMod","side":"self","amount":2000,"battle":true,"count":1,"optional":true,"filter":{"and":[{"minBaseCost":8},{"traitIncludes":"革命軍"}]}}]}]}},
  /* ===== OP12 バッチ6（黄・超新星/ロー/海王類。onLifeLeave・revealTopPlay）＋白ひげ058 ===== */
  // OP12-058 …おれは白ひげを王にする: 【メイン】リーダー白ひげなら、デッキ上1枚公開→コスト9以下の白ひげキャラなら登場(任意)し【速攻】
  "OP12-058": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"revealTopPlay","filter":{"type":"CHAR","traitIncludes":"白ひげ海賊団","maxCost":9},"grantKw":"rush"}]}]}},
  // OP12-099 カルガラ: 【自分のターン中】ライフが離れた時、1ドロー（※「このターン自分の効果でドロー不可」は近似で省略）
  "OP12-099": {"onLifeLeave":{"when":"selfTurn","anyLife":true,"fx":[{"op":"draw","n":1}]}},
  // OP12-100 サボ: ライフ3以下で【ブロッカー】＋コスト+3 ／【登場時】ライフ上1枚を手札に：2ドロー1捨て
  "OP12-100": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"lifeAtMost":3}},{"op":"staticCost","cond":{"lifeAtMost":3},"amount":3}],"onPlay":[{"op":"lifeToHand","pos":"top","n":1,"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // OP12-101 ジュエリー・ボニー(c3): 【起動メイン】レスト：自分の《超新星》リーダーを次の相手ターン終了まで+1000
  "OP12-101": {"act":{"label":"レスト:超新星リーダー+1000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"leaderBuff","amount":1000,"duration":"untilNextEnd"}]}]}},
  // OP12-102 しらほし: 元々コスト6以下が相手効果で離れる代わりにライフ上1枚を表向き ／【相手のターン中】他のコスト2「しらほし」がいなければ海王類全+2000
  "OP12-102": {"static":[{"op":"leaveProtect","targetFilter":{"maxBaseCost":6},"pay":"flipLifeUp"},{"op":"allyPower","power":2000,"cond":{"and":[{"oppTurn":true},{"noSelfChar":{"name":"しらほし","cost":2}}]},"filter":{"traitIncludes":"海王類"}}]},
  // OP12-105 トラファルガー・ラミ: 【自分のターン中】【登場時】「トラファルガー・ロー」1枚を+2000
  "OP12-105": {"onPlay":[{"op":"cond","check":{"selfTurn":true},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1,"optional":true,"duration":"turn","filter":{"name":"トラファルガー・ロー"}}]}]},
  // OP12-107 ドンキホーテ・ドフラミンゴ(c8): ライフ2以下で【速攻】 ／【相手のターン中】【KO時】デッキ上1枚までをライフに加える
  "OP12-107": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"lifeAtMost":2}}],"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // OP12-108 ドンキホーテ・ロシナンテ(c1): 【登場時】デッキ上5枚から「ロー」1枚を手札へ
  "OP12-108": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"name":"トラファルガー・ロー"},"optional":true}]},
  // OP12-113 ロロノア・ゾロ(c5黄): 【KO時】リーダー超新星なら手札からコスト4以下の超新星をレストで登場
  "OP12-113": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"超新星","maxBaseCost":4},"count":1,"optional":true,"rested":true}]}]},
  // OP12-115 愛してるぜ!!: 【カウンター】リーダーかキャラ1枚+2000→ライフ2以下ならトラッシュから「ロー」1枚を手札へ
  "OP12-115": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"trashToHand","count":1,"filter":{"name":"トラファルガー・ロー"},"optional":true}]}]}},
  // OP12-116 鐘を鳴らして君を待つ: 【メイン】デッキ上5枚から《シャンドラの戦士》キャラか「ノーランド」2枚を手札へ
  "OP12-116": {"main":{"fx":[{"op":"search","look":5,"count":2,"filter":{"or":[{"traitIncludes":"シャンドラの戦士","type":"CHAR"},{"name":"モンブラン・ノーランド"}]},"optional":true}]}},
  // OP12-117 破壊弦: 【メイン】ドン5レスト：リーダー超新星ならコスト9以下1枚を持ち主のライフ上か下に裏向きで加える ／【カウンター】リーダー+3000
  "OP12-117": {"main":{"fx":[{"op":"restDonCost","n":5,"then":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"charToLife","side":"any","filter":{"maxCost":9},"count":1,"optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  /* ===== OP11 バッチ1（赤・海軍/SWORD。新機構: attackActive/koImmuneFromSourceAttr/condAttacker/onOppEvent/allyKeyword） ===== */
  // OP11-001 コビー LEADER: SWORDキャラは登場ターンにキャラへアタック可 ／【ターン1回】元々P7000以下の海軍が相手効果で離れる代わりにトラッシュ3枚をデッキ下
  "OP11-001": {"static":[{"op":"allyKeyword","kw":"rushChar","filter":{"traitIncludes":"SWORD"}},{"op":"leaveProtect","targetFilter":{"traitIncludes":"海軍","maxPower":7000},"once":"turn","pay":"trashToDeck","n":3}]},
  // OP11-002 アイン: 【登場時】相手1枚を-1000→相手パワー0以下1枚KO
  "OP11-002": {"onPlay":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"},{"op":"ko","side":"opp","filter":{"maxEffPower":0},"count":1,"optional":true}]},
  // OP11-004 孔雀: 【登場時】デッキ上5枚から「孔雀」以外の海軍1枚を手札へ ／【起動メイン】自身トラッシュ：自キャラ1枚+1000
  "OP11-004": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"trait":"海軍","nameExcludes":"孔雀"},"optional":true}],"act":{"label":"自身トラッシュ:自キャラ1枚+1000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"self","amount":1000,"count":1,"optional":true,"duration":"turn"}]}]}},
  // OP11-005 スモーカー: 【ブロッカー】 ／【ドン×1】属性(特)を持たないキャラの効果でKOされない
  "OP11-005": {"static":[{"op":"koImmuneFromSourceAttr","lacksAttr":"特","cond":{"donX1":true}}]},
  // OP11-006 ゼット: 【ドン×1】【アタック時】相手の属性(特)キャラ1枚を-5000
  "OP11-006": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-5000,"count":1,"optional":true,"duration":"turn","filter":{"attr":"特"}}]}]},
  // OP11-007 たしぎ: 【起動メイン】レスト：海軍リーダーなら海軍1枚を+2000
  "OP11-007": {"act":{"label":"レスト:海軍リーダーなら海軍1枚+2000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1,"optional":true,"duration":"turn","filter":{"traitIncludes":"海軍"}}]}]}},
  // OP11-008 ドール: 【ブロッカー】 ／【登場時】手札1捨て：海軍リーダーなら相手1枚を-6000
  "OP11-008": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"powerMod","side":"opp","amount":-6000,"count":1,"optional":true,"duration":"turn"}]}]}]},
  // OP11-009 ニコ・ロビン: 【ドン×2】【アタック時】相手1枚を次相手ターン終了まで-2000
  "OP11-009": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"untilNextEnd"}]}]},
  // OP11-010 ひばり: 【登場時】相手1枚-2000 ／【アタック時】自身+1000→海軍リーダーはアクティブにもアタック可
  "OP11-010": {"onPlay":[{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true,"duration":"turn"}],"onAttack":[{"op":"powerMod","target":"self","amount":1000,"duration":"turn"},{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"type":"LEADER","traitIncludes":"海軍"}}]},
  // OP11-012 フランキー: 【自分のターン中】【ターン1回】相手がイベントを発動した時、自分のキャラ全+2000
  "OP11-012": {"onOppEvent":{"when":"selfTurn","once":"turn","fx":[{"op":"powerMod","side":"self","all":true,"amount":2000,"duration":"turn"}]}},
  // OP11-013 プリンス・グルス: 【アタック時】相手のパワー2000以下のキャラ全ては【ブロッカー】発動不可
  "OP11-013": {"onAttack":[{"op":"denyBlocker","side":"opp","filter":{"maxEffPower":2000},"all":true}]},
  // OP11-014 ボルサリーノ: 【ブロッカー】 ／【起動メイン】レスト：海軍リーダーかキャラはアクティブにもアタック可
  "OP11-014": {"act":{"label":"レスト:海軍はアクティブにもアタック可","cost":{"restSelf":true},"fx":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"海軍"}}]}},
  // OP11-016 ロロノア・ゾロ(c5): 【起動メイン】リーダーかキャラにレストのドン1付与
  "OP11-016": {"act":{"label":"リーダーかキャラにレストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  // OP11-018 実直拳骨: 【メイン】相手1枚-4000→相手パワー6000以下1枚KO
  "OP11-018": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-4000,"count":1,"optional":true,"duration":"turn"},{"op":"ko","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}]}},
  // OP11-019 粘土の巣: 【カウンター】リーダーかキャラ+2000→相手にパワー6000以上がいればさらに+1000
  "OP11-019": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"oppChar":{"minEffPower":6000}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP11-020 X狩場: 【メイン】相手2枚-2000→海軍1枚+1000
  "OP11-020": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-2000,"count":2,"optional":true,"duration":"turn"},{"op":"powerMod","side":"self","amount":1000,"count":1,"optional":true,"duration":"turn","filter":{"traitIncludes":"海軍"}}]}},
  /* ===== OP11 バッチ2（緑・魚人/しらほし。oppRestedCardsAtLeast・maxCostFrom:'don'） ===== */
  // OP11-021 ジンベエ LEADER: 【自分のターン終了時】手札6枚以下なら《魚人族》か《人魚族》1枚とドン1をアクティブに
  "OP11-021": {"onTurnEnd":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"activateOwnChar","count":1,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}},{"op":"donActivate","n":1}]}]},
  // OP11-022 しらほし LEADER: アタックできない ／【起動メイン】ドン1+ライフ裏向き：場のドン枚数以下のコストの《海王類》か「メガロ」を登場
  "OP11-022": {"static":[{"op":"cantAttack"}],"act":{"label":"ドン1+ライフ裏向き:海王類/メガロ登場","cost":{"don":1},"fx":[{"op":"lifeFlipDownCost","then":[{"op":"playCharFromHand","filter":{"or":[{"traitIncludes":"海王類"},{"name":"メガロ"}],"maxCostFrom":"don"},"count":1,"optional":true}]}]}},
  // OP11-023 アーロン: 手札のこのカードは、魚人族リーダー＋ライフ3以下＋相手レスト5枚以上でコスト-3
  "OP11-023": {"costMod":{"cond":{"and":[{"leaderTraitIncludes":"魚人族"},{"lifeAtMost":3},{"oppRestedCardsAtLeast":5}]},"amount":-3}},
  // OP11-024 アラディン: 相手効果でKOされた時、手札1捨て＋ドン1レスト：コスト6以下の《魚人族》か《人魚族》を登場
  "OP11-024": {"onKO":[{"op":"discardCost","count":1,"then":[{"op":"restDonCost","n":1,"then":[{"op":"playCharFromHand","filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}],"maxCost":6},"count":1,"optional":true}]}]}]},
  // OP11-025 イシリー: 【相手のアタック時】ドン1+このキャラをレスト：リーダーかキャラ+1000
  "OP11-025": {"onOppAttack":[{"op":"restDonCost","n":1,"then":[{"op":"restOwnAsCost","count":1,"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}]}]},
  // OP11-027 ギョロ目: リーダーが「しらほし」なら登場ターンにキャラへアタック可
  "OP11-027": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"leaderNameIncludes":"しらほし"}}]},
  // OP11-028 近海の主: 【登場時】相手レスト1枚を次リフレッシュでアクティブにしない
  "OP11-028": {"onPlay":[{"op":"lock","side":"opp","filter":{"restedOnly":true},"count":1,"optional":true}]},
  // OP11-029 シャーロット・プラリネ: 【ブロッカー】 ／【登場時】相手コスト1以下1枚をレスト
  "OP11-029": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},
  // OP11-030 しらほし(c1): 【起動メイン】ドン1+このキャラをレスト：デッキ上5枚から《海王類》か《魚人島》1枚を手札へ
  "OP11-030": {"act":{"label":"ドン1+レスト:海王類/魚人島サーチ","cost":{"don":1,"restSelf":true},"fx":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"海王類"},{"traitIncludes":"魚人島"}]},"optional":true}]}},
  // OP11-031 ジンベエ(c6): 【登場時】魚人/人魚リーダーなら相手コスト5以下1枚レスト ／【起動メイン】魚人/人魚1枚は登場ターンにキャラへアタック可
  "OP11-031": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"魚人族"},{"leaderTraitIncludes":"人魚族"}]},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}],"act":{"label":"魚人/人魚1枚に速攻:キャラ","cost":{},"fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"rushChar","duration":"turn","filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}}]}},
  // OP11-034 はっちゃん: 【起動メイン】レスト：魚人/人魚リーダーなら相手コスト3以下1枚を次相手ターン終了までレスト不可
  "OP11-034": {"act":{"label":"レスト:魚人リーダーなら相手3以下レスト不可","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"魚人族"},{"leaderTraitIncludes":"人魚族"}]},"then":[{"op":"restImmune","side":"opp","maxCost":3,"count":1,"duration":"untilNextEnd","optional":true}]}]}},
  // OP11-035 フィッシャー・タイガー: 相手効果でKOされた時 ドン1レスト：コスト4以下の魚人/人魚を登場 ／【登場時】相手1枚レスト
  "OP11-035": {"onKO":[{"op":"restDonCost","n":1,"then":[{"op":"playCharFromHand","filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}],"maxCost":4},"count":1,"optional":true}]}],"onPlay":[{"op":"restChar","side":"opp","count":1,"optional":true}]},
  // OP11-036 マダラ: 【登場時】「しらほし」リーダーならデッキ上5枚から《海王類》か「しらほし」1枚を手札へ
  "OP11-036": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"海王類"},{"name":"しらほし"}]},"optional":true}]}]},
  // OP11-037 “古代兵器”「ポセイドン」: 【メイン】デッキ上4枚から《海王類》か《魚人島》のキャラ1枚を手札へ
  "OP11-037": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"type":"CHAR","or":[{"traitIncludes":"海王類"},{"traitIncludes":"魚人島"}]},"optional":true}]}},
  // OP11-038 ゴムゴムの象銃乱打: 【メイン】ドン1レスト：相手コスト5以下1枚レスト ／【カウンター】リーダー+3000
  "OP11-038": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP11-039 武頼貫: 【カウンター】魚人/人魚のリーダーかキャラ+3000→相手コスト3以下1枚レスト
  "OP11-039": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"},{"type":"LEADER"}]}},{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}},
  /* ===== OP11 バッチ3（青・ジェルマ/麦わら。playFromDeck・allSelfChar） ===== */
  // OP11-042 ヴィト: 【登場時】《ファイアタンク海賊団》1枚を手札から捨てる：このターン【速攻】
  "OP11-042": {"onPlay":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"ファイアタンク海賊団"},"then":[{"op":"giveKeyword","target":"self","kw":"rush"}]}]},
  // OP11-043 ヴィンスモーク・イチジ: 【ブロッカー】 ／【相手のアタック時】自キャラが『ジェルマ』のみなら、リーダーかキャラ+1000→デッキ上2枚トラッシュ
  "OP11-043": {"onOppAttack":[{"op":"cond","check":{"allSelfChar":{"traitIncludes":"ジェルマ"}},"once":"turn","then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]},
  // OP11-044 ヴィンスモーク・ジャッジ: 【起動メイン】手札1捨て：《ジェルマ66》全を+1000
  "OP11-044": {"act":{"label":"手札1捨て:ジェルマ66全+1000","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"powerMod","side":"self","all":true,"amount":1000,"duration":"turn","filter":{"traitIncludes":"ジェルマ66"}}]}]}},
  // OP11-046 ヴィンスモーク・ジャッジ: 【ブロッカー】 ／自分のキャラが『ジェルマ』のみなら相手の効果でKOされずレストにされない
  "OP11-046": {"static":[{"op":"condBuff","koImmune":true,"cond":{"allSelfChar":{"traitIncludes":"ジェルマ"}}},{"op":"staticOppRestImmune","cond":{"allSelfChar":{"traitIncludes":"ジェルマ"}}}]},
  // OP11-047 ヴィンスモーク・レイジュ: 【登場時】《ヴィンスモーク家》リーダーならデッキ上5枚から『ジェルマ』1枚を手札へ(残りトラッシュ)
  "OP11-047": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ヴィンスモーク家"},"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ジェルマ"},"rest":"trash","optional":true}]}]},
  // OP11-048 カポネ・ベッジ(青): 【登場時】デッキ上4枚からコスト2以上の《ファイアタンク海賊団》か《麦わら》1枚を手札へ
  "OP11-048": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"minCost":2,"or":[{"traitIncludes":"ファイアタンク海賊団"},{"traitIncludes":"麦わらの一味"}]},"optional":true}]},
  // OP11-049 キャロット: 【登場時】デッキ上3枚を並び替えデッキ上/下 ／【相手のアタック時】自身トラッシュ：リーダー+1000
  "OP11-049": {"onPlay":[{"op":"scry","look":3}],"onOppAttack":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"filter":{"type":"LEADER"}}]}]},
  // OP11-050 ゴッティ: 【アタック時】《ファイアタンク海賊団》1枚を手札から捨てる：コスト1以下1枚を手札かデッキ下に戻す
  "OP11-050": {"onAttack":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"ファイアタンク海賊団"},"then":[{"op":"bounce","side":"opp","maxCost":1,"count":1,"optional":true}]}]},
  // OP11-051 サンジ: 相手効果でKOされた時 デッキ上5枚からコスト5以下の麦わらを登場 ／【登場時】元々パワー5000以下1枚を手札に戻す
  "OP11-051": {"onKO":[{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"麦わらの一味","maxCost":5}}],"onPlay":[{"op":"bounce","side":"opp","filter":{"maxPower":5000},"count":1,"optional":true}]},
  // OP11-056 ブルック(青): 【ブロッカー】 ／【登場時】元々コスト1のキャラ1枚をデッキ下
  "OP11-056": {"onPlay":[{"op":"deckBottom","side":"opp","filter":{"cost":1},"count":1,"optional":true}]},
  // OP11-057 ペドロ: 手札4枚以下なら【ブロッカー】を得る
  "OP11-057": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfHandAtMost":4}}]},
  // OP11-058 モンキー・Ｄ・ルフィ(青5): 【ブロッカー】 ／ 手札5枚以上ならこのキャラはアタックできない
  "OP11-058": {"static":[{"op":"cantAttack","cond":{"selfHandAtLeast":5}}]},
  // OP11-059 ゴムゴムの王蛇: 【カウンター】リーダーかキャラ+2000→手札4以下ならさらに+2000
  "OP11-059": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"selfHandAtMost":4},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP11-061 ゴムゴムのJET大蛇砲: 【メイン】相手の元々コスト4以下1枚をデッキ下
  "OP11-061": {"main":{"fx":[{"op":"deckBottom","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}},
  /* ===== OP11 バッチ4（紫・ビッグ・マム。costGuess・peekOppDeck・oppTrashToBottom） ===== */
  // OP11-062 シャーロット・カタクリ LEADER: 【アタック時】/【相手のアタック時】ドン-1：相手デッキ上を見る→リーダー+1000
  "OP11-062": {"onAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"peekOppDeck"},{"op":"leaderBuff","amount":1000,"duration":"battle"}]}],"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"peekOppDeck"},{"op":"leaderBuff","amount":1000,"duration":"battle"}]}]},
  // OP11-063 サディちゃん: 【登場時】ドン-1：インペルダウンリーダーなら相手コスト3以下1枚レスト
  "OP11-063": {"onPlay":[{"op":"donMinus","n":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}]},
  // OP11-065 シャーロット・アナナ: 「アナナ」以外の自分の紫・ビッグ・マム海賊団キャラがいれば【ブロッカー】を得る
  "OP11-065": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"color":"紫","traitIncludes":"ビッグ・マム海賊団"}}}}]},
  // OP11-066 シャーロット・オーブン: 【起動メイン】レスト＋コスト宣言：相手デッキ上が一致なら相手の元々コスト3以下1枚KO→ドン1レスト追加
  "OP11-066": {"act":{"label":"レスト+コスト宣言:一致で相手3以下KO","cost":{"restSelf":true},"fx":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // OP11-067 シャーロット・カタクリ(c8): 【ブロッカー】 ／【自分のターン終了時】コスト3以上のビッグ・マム2枚をアクティブ→ドン1レスト追加
  "OP11-067": {"onTurnEnd":[{"op":"activateOwnChar","count":2,"filter":{"minBaseCost":3,"traitIncludes":"ビッグ・マム海賊団"}},{"op":"donFromDeck","n":1,"mode":"rested"}]},
  // OP11-069 シャーロット・ブリュレ: 【登場時】ライフ上1枚を手札に：ビッグ・マムリーダーならドン1アクティブ追加
  "OP11-069": {"onPlay":[{"op":"lifeToHand","n":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"ビッグ・マム海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // OP11-070 シャーロット・プリン(紫): 【登場時】デッキ上5枚からコスト2以上のビッグ・マム1枚を手札へ ／【起動メイン】ドン-1+レスト：相手デッキ上を見る
  "OP11-070": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"minCost":2,"traitIncludes":"ビッグ・マム海賊団"},"optional":true}],"act":{"label":"ドン-1+レスト:相手デッキ上を見る","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":1,"then":[{"op":"peekOppDeck"}]}]}},
  // OP11-071 シャーロット・ペロスペロー: 【起動メイン】手札1捨て＋コスト宣言：一致なら1ドロー→ドン1アクティブ追加
  "OP11-071": {"act":{"label":"手札1捨て+コスト宣言:一致で1ドロー","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"draw","n":1},{"op":"donFromDeck","n":1,"mode":"active"}]}]}]}},
  // OP11-072 シャーロット・モンドール: 【起動メイン】ドン-1+レスト：相手はトラッシュ2枚をデッキ下→ライフ上1枚を手札に
  "OP11-072": {"act":{"label":"ドン-1+レスト:相手トラッシュ2枚デッキ下→ライフ手札","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":1,"then":[{"op":"oppTrashToBottom","n":2},{"op":"lifeToHand","n":1}]}]}},
  // OP11-073 シャーロット・リンリン: ビッグ・マムリーダーで【速攻】 ／【相手のアタック時】ドン-5+コスト宣言：一致ならリーダー+2000
  "OP11-073": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"leaderTraitIncludes":"ビッグ・マム海賊団"}}],"onOppAttack":[{"op":"donMinus","n":5,"once":"turn","then":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"leaderBuff","amount":2000,"duration":"turn"}]}]}]},
  // OP11-074 シュトロイゼン: 【起動メイン】ドン-1+レスト+コスト宣言：一致なら相手コスト4以下1枚レスト
  "OP11-074": {"act":{"label":"ドン-1+レスト+コスト宣言:一致で相手4以下レスト","cost":{"restSelf":true},"fx":[{"op":"donMinus","n":1,"then":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}]}},
  // OP11-075 ハグワール・D・サウロ: 【登場時】リーダー「ニコ・ロビン」＋場のドン7以上で2ドロー
  "OP11-075": {"onPlay":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"ニコ・ロビン"},{"donAtLeast":7}]},"then":[{"op":"draw","n":2}]}]},
  // OP11-076 ハンニャバル: 【ブロッカー】 ／【登場時】インペルダウンリーダーなら手札からコスト3以下のインペルダウンを登場
  "OP11-076": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"インペルダウン","maxCost":3},"count":1,"optional":true}]}]},
  // OP11-077 ランドルフ: 【自分のターン中】【ターン1回】自分のドンがドンデッキに戻された時、ビッグ・マム1枚を次相手ターン終了までコスト+2
  "OP11-077": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true,"filter":{"traitIncludes":"ビッグ・マム海賊団"}}]}]},
  // OP11-079 男の勝負に…!!!: 【カウンター】コスト宣言：一致ならリーダーかキャラ+5000
  "OP11-079": {"counter":{"cost":0,"fx":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"powerMod","side":"self","leader":true,"amount":5000,"battle":true,"count":1,"optional":true}]}]}},
  // OP11-080 ギア2: 【メイン】ドン2レスト：リーダーが青を含むならドン1レスト追加 ／【カウンター】リーダー+3000
  "OP11-080": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderColor":"青"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP11-081 皇帝剣破々刃: 【メイン】コスト宣言：相手デッキ上が一致なら相手の元々コスト8以下1枚KO
  "OP11-081": {"main":{"fx":[{"op":"costGuess","cpuGuess":1,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":8},"count":1,"optional":true}]}]}},
  /* ===== OP11 バッチ5（黒・海軍/SMILE。attackActive・trashToDeckCost・reviveFromTrash） ===== */
  // OP11-082 アラマキ: 【起動メイン】自身トラッシュ：海軍リーダーなら海軍1枚がアクティブにもアタック可→デッキ上2枚トラッシュ
  "OP11-082": {"act":{"label":"自身トラッシュ:海軍にアクティブアタック付与","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"海軍"}}]},{"op":"deckToTrash","n":2}]}]}},
  // OP11-083 カリブー(黒): 【ブロッカー】 ／【登場時】自分の手札2枚を捨てる
  "OP11-083": {"onPlay":[{"op":"discardOwn","n":2}]},
  // OP11-084 クザン(黒): 【登場時】デッキ上3枚トラッシュ ／【アタック時】海軍のリーダーかキャラ1枚がアクティブにもアタック可
  "OP11-084": {"onPlay":[{"op":"deckToTrash","n":3}],"onAttack":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"海軍"}}]},
  // OP11-085 黒炭オロチ: 【登場時】トラッシュからコスト5以下のSMILE1枚を手札に
  "OP11-085": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"maxCost":5,"traitIncludes":"SMILE"}}]},
  // OP11-086 コリブー: 【登場時】手札1枚を捨てる ／【起動メイン】自身トラッシュ：トラッシュからコスト4以下「カリブー」1枚を登場
  "OP11-086": {"onPlay":[{"op":"discardOwn","n":1}],"act":{"label":"自身トラッシュ:コスト4以下カリブー登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"reviveFromTrash","maxCost":4,"filter":{"nameIncludes":"カリブー"}}]}]}},
  // OP11-088 シュウ: 【ブロッカー】 ／【ターン1回】相手のアタック時、そのキャラが属性(斬)なら このバトル中+5000
  "OP11-088": {"onOppAttack":[{"op":"condAttacker","attr":"斬","once":"turn","then":[{"op":"powerMod","side":"self","target":"self","amount":5000,"battle":true}]}]},
  // OP11-091 ベリーグッド: 【登場時】相手は自身のトラッシュからイベント3枚をデッキ下
  "OP11-091": {"onPlay":[{"op":"oppTrashToBottom","n":3,"filter":{"type":"EVENT"}}]},
  // OP11-092 ヘルメッポ(黒): 【登場時】手札1捨て：1ドロー＋トラッシュから「ヘルメッポ」以外のコスト8以下SWORDを登場(ターン終了時デッキ下)
  "OP11-092": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"draw","n":1},{"op":"reviveFromTrash","maxCost":8,"returnEndTurn":true,"filter":{"traitIncludes":"SWORD","nameExcludes":"ヘルメッポ"}}]}]},
  // OP11-095 モンキー・D・ガープ: 【登場時】トラッシュから海軍3枚をデッキ下：リーダーにレストのドン1付与→コスト9以上のキャラがいれば相手コスト7以下1枚KO
  "OP11-095": {"onPlay":[{"op":"trashToDeckCost","n":3,"filter":{"traitIncludes":"海軍"},"then":[{"op":"donAttach","target":"leader","n":1},{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":9},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxCost":7},"count":1,"optional":true}]}]}]},
  // OP11-096 リッパー: 「リッパー」以外の自分の黒・海軍キャラがいれば【ブロッカー】を得る
  "OP11-096": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"color":"黒","traitIncludes":"海軍"}}}}]},
  // OP11-097 すっかり衰えた……!!!: 【カウンター】リーダーかキャラ+1000→トラッシュ10枚以上ならコスト3以下の黒キャラ1枚を手札に
  "OP11-097": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"maxCost":3,"color":"黒","type":"CHAR"}}]}]}},
  // OP11-098 海底落下: 【メイン】デッキ上3枚トラッシュ：相手コスト2以下1枚KO
  "OP11-098": {"main":{"fx":[{"op":"deckTrashCost","n":3,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP11-099 ぼくは!!!海軍将校になる男です!!!!: 【メイン】デッキ上3枚から「自身」以外の海軍1枚を公開し手札に(残りトラッシュ)
  "OP11-099": {"main":{"fx":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"海軍"},"exclude":"ぼくは!!!海軍将校になる男です!!!!","rest":"trash","optional":true}]}},
  /* ===== OP11 バッチ6（黄・しらほし/魚人島。lifeFlipDownCost・lifeCost choose・onOppEvent） ===== */
  // OP11-100 オトヒメ: 【登場時】しらほしリーダーなら ライフ上1枚を裏向き：1ドロー
  "OP11-100": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeFlipDownCost","then":[{"op":"draw","n":1}]}]}]},
  // OP11-101 カポネ・ベッジ(黄): 【ブロッカー】 ／【ターン1回】「カポネ・ベッジ」以外の自分の超新星が相手効果で離れる場合、代わりにライフ上に裏向きで加える
  "OP11-101": {"static":[{"op":"leaveProtect","pay":"toLifeFaceDown","once":"turn","targetFilter":{"traitIncludes":"超新星","nameExcludes":"カポネ・ベッジ"}}]},
  // OP11-102 ケイミー: 【自分のターン中】【ターン1回】相手がイベントを発動した時、相手ライフ2枚以上なら お互いのライフ上1枚をトラッシュ
  "OP11-102": {"onOppEvent":{"when":"selfTurn","once":"turn","cond":{"oppLifeAtLeast":2},"fx":[{"op":"lifeTrash","side":"both"}]}},
  // OP11-103 シャクレ: 【起動メイン】しらほしリーダーで このキャラをレスト＋ライフ上1枚裏向き：相手コスト3以下1枚KO
  "OP11-103": {"act":{"label":"レスト+ライフ裏向き:相手3以下KO","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeFlipDownCost","then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}]}},
  // OP11-104 シャーリー: 【ブロッカー】 ／【登場時】ライフ上1枚裏向き：デッキ上3枚から魚人島1枚を手札に(残りデッキ上下)
  "OP11-104": {"onPlay":[{"op":"lifeFlipDownCost","then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"魚人島"},"optional":true}]}]},
  // OP11-106 ゼウス: 【登場時】ライフ上か下1枚を手札に：相手コスト5以下1枚KO
  "OP11-106": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  // OP11-107 チョンマゲ: 【ブロッカー】 ／【起動メイン】【ターン1回】しらほしリーダーで ライフ上1枚裏向き：このターン終了時このキャラをアクティブに
  "OP11-107": {"act":{"label":"ライフ裏向き:ターン終了時アクティブ","cost":{},"fx":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeFlipDownCost","then":[{"op":"scheduleTurnEnd","fx":[{"op":"activateSelf"}]}]}]}]}},
  // OP11-108 ネプチューン: 【登場時】しらほしリーダーで ライフ上1枚裏向き：2ドロー＋手札1枚を捨てる
  "OP11-108": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeFlipDownCost","then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]}]},
  // OP11-109 パッパグ: 【登場時】自分の「ケイミー」がいれば 2ドロー＋手札2枚を捨てる
  "OP11-109": {"onPlay":[{"op":"cond","check":{"selfChar":{"nameIncludes":"ケイミー"}},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP11-110 フカボシ: KOされる場合 代わりに「魚人島」かリーダー「しらほし」1枚をレスト ／【登場時】ライフ上か下1枚を手札に：相手コスト1以下1枚KO
  "OP11-110": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"pay":"restOwnCards","n":1,"filter":{"or":[{"traitIncludes":"魚人島"},{"type":"LEADER","nameIncludes":"しらほし"}]}}],"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP11-112 メガロ: 【ブロッカー】 ／【相手のターン中】しらほしリーダーなら このキャラ+4000
  "OP11-112": {"static":[{"op":"condBuff","cond":{"oppTurn":true,"leaderNameIncludes":"しらほし"},"power":4000}]},
  // OP11-114 ゴムゴムの火拳銃: 【メイン】ドン3レスト：お互いライフ合計5以上で相手の元々コスト5以下1枚KO ／【カウンター】リーダー+3000
  "OP11-114": {"main":{"fx":[{"op":"restDonCost","n":3,"then":[{"op":"cond","check":{"totalLifeAtLeast":5},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":5},"count":1,"optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP11-115 タイプじゃないんですっ…………!!: 【カウンター】しらほしリーダーなら リーダーかキャラ+4000
  "OP11-115": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  // OP11-116 人魚柔術 ウルトラマリン: 【メイン】コスト6以下1枚を持ち主のライフ上か下に表向きで加える
  "OP11-116": {"main":{"fx":[{"op":"charToLife","side":"any","filter":{"maxCost":6},"faceUp":true,"optional":true}]}},
  // OP11-117 魚人島(STAGE): 【起動メイン】【ターン1回】しらほしリーダーで ライフ上1枚表向き：海王類/魚人族/人魚族1枚を+1000
  "OP11-117": {"act":{"label":"ライフ表向き:海王類/魚人/人魚に+1000","cost":{},"fx":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"flipLifeCost","then":[{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"or":[{"traitIncludes":"海王類"},{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}}]}]}]}},
  // OP11-118 モンキー・Ｄ・ルフィ(青8): 【速攻】 ／【アタック時】手札1捨て：コスト4以下1枚を手札に戻す→リーダーかキャラ1枚にレストのドン1付与
  "OP11-118": {"onAttack":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true},{"op":"donAttach","target":"chooseOwn","n":1}]}]},
  // OP11-119 コビー(黒8): 【登場時】自分のキャラ1枚がアクティブにもアタック可 ／【アタック時】トラッシュ2枚をデッキ下：リーダーかキャラ1枚を次相手ターン終了まで+1000
  "OP11-119": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"attackActive","duration":"turn"}],"onAttack":[{"op":"trashToDeckCost","n":2,"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"untilNextEnd","count":1,"optional":true}]}]},
  /* ===== 既完成弾(OP12/13)の条件付き常在カードの補完 ===== */
  // OP12-021 いっぽんマツ: 属性(斬)リーダー＋レストのドン6以上で相手の効果でレストされない／【ブロッカー】
  "OP12-021": {"static":[{"op":"staticOppRestImmune","cond":{"and":[{"leaderAttr":"斬"},{"restedDonAtLeast":6}]}}]},
  // OP12-027 コウシロウ: このキャラ以外のコスト5以下・属性(斬)キャラが相手効果でKOされる場合、代わりにこのキャラをレスト／【ブロッカー】
  "OP12-027": {"static":[{"op":"leaveProtect","onlyKO":true,"pay":"restSelf","targetFilter":{"attr":"斬","maxCost":5}}]},
  // OP12-063 ヴィンスモーク・レイジュ: トラッシュにイベント4枚以上で+2000しコスト+5／【ブロッカー】
  "OP12-063": {"static":[{"op":"condBuff","cond":{"trashEventAtLeast":4},"power":2000},{"op":"staticCost","cond":{"trashEventAtLeast":4},"amount":5}]},
  // OP12-066 カルネ: トラッシュにイベント4枚以上で【ブロッカー】を得る
  "OP12-066": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"trashEventAtLeast":4}}]},
  // OP13-112 ベガパンク: 付与ドン合計2枚以上で【ブロッカー】を得る
  "OP13-112": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfAttachedDonAtLeast":2}}]},
  /* ===== OP10（パンクハザード）バッチ1（赤・001-021） ===== */
  // OP10-001 スモーカー LEADER: 【相手のターン中】海軍/パンクハザードキャラ全+1000 ／【起動メイン】パワー7000以上がいればドン2アクティブ
  "OP10-001": {"static":[{"op":"allyPower","cond":{"oppTurn":true},"power":1000,"filter":{"or":[{"traitIncludes":"海軍"},{"traitIncludes":"パンクハザード"}]}}],"act":{"label":"パワー7000以上がいればドン2アクティブ","cost":{},"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":7000},"min":1}},"then":[{"op":"donActivate","n":2}]}]}},
  // OP10-003 シュガー LEADER: 【自分のターン終了時】パワー6000以上のドンキ海賊団がいればドン1アクティブ
  "OP10-003": {"onTurnEnd":[{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":6000,"traitIncludes":"ドンキホーテ海賊団"},"min":1}},"then":[{"op":"donActivate","n":1}]}]},
  // OP10-004 ヴェルゴ: 【登場時】デッキ上5枚から「ヴェルゴ」以外のパンクハザード1枚を手札に(残りデッキ下)
  "OP10-004": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"パンクハザード"},"exclude":"ヴェルゴ","optional":true}]},
  // OP10-005 サンジ: 【自分のターン中】+3000 ／【KO時】1ドロー
  "OP10-005": {"static":[{"op":"condBuff","cond":{"selfTurn":true},"power":3000}],"onKO":[{"op":"draw","n":1}]},
  // OP10-006 シーザー・クラウン: 【登場時】デッキ上5枚から「スマイリー」1枚を手札に→手札から「スマイリー」1枚を登場
  "OP10-006": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"nameIncludes":"スマイリー"},"optional":true},{"op":"playSpecificFromHand","name":"スマイリー","optional":true}]},
  // OP10-007 シーザー兵: 【登場時】手札からコスト2以下のパンクハザード1枚を登場
  "OP10-007": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"パンクハザード","maxCost":2},"count":1,"optional":true}]},
  // OP10-008 スコッチ: 【ブロッカー】 ／【登場時】「ロック」がいなければ手札から「ロック」1枚を登場
  "OP10-008": {"onPlay":[{"op":"cond","check":{"noSelfChar":{"nameIncludes":"ロック"}},"then":[{"op":"playSpecificFromHand","name":"ロック","optional":true}]}]},
  // OP10-009 スマイリー: 【登場時】パンクハザードリーダーなら相手キャラ1枚を-3000
  "OP10-009": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"パンクハザード"},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]},
  // OP10-010 茶ひげ: 【アタック時】パワー6000以上のキャラが1枚以下なら このキャラ+1000
  "OP10-010": {"onAttack":[{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":6000},"max":1}},"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  // OP10-011 トニートニー・チョッパー: 【ブロッカー】 ／【相手のターン中】+2000
  "OP10-011": {"static":[{"op":"condBuff","cond":{"oppTurn":true},"power":2000}]},
  // OP10-015 モチャ: 【登場時】相手キャラ1枚を-1000
  "OP10-015": {"onPlay":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]},
  // OP10-016 モネ: 【起動メイン】レスト：リーダーかキャラ1枚にレストのドン2付与→相手キャラ1枚を-1000
  "OP10-016": {"act":{"label":"レスト:レストのドン2付与→相手-1000","cost":{"restSelf":true},"fx":[{"op":"donAttach","target":"chooseOwn","n":2},{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}},
  // OP10-017 ロック: 【登場時】「スコッチ」がいなければ手札から「スコッチ」1枚を登場
  "OP10-017": {"onPlay":[{"op":"cond","check":{"noSelfChar":{"nameIncludes":"スコッチ"}},"then":[{"op":"playSpecificFromHand","name":"スコッチ","optional":true}]}]},
  // OP10-018 カマクラ十草紙: 【カウンター】リーダーかキャラ+3000→相手リーダーかキャラ-2000
  "OP10-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}},
  // OP10-019 神避: 【メイン】ドン5レスト：相手のパワー8000以下1枚KO ／【カウンター】リーダー+3000
  "OP10-019": {"main":{"fx":[{"op":"restDonCost","n":5,"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":8000},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP10-020 ゴムゴムのUFO: 【メイン】相手キャラ1枚を-4000→自ライフ2枚以下ならリーダーかキャラ+1000
  "OP10-020": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP10-021 パンクハザード(STAGE): 【起動メイン】レスト：シーザー・クラウンリーダーならリーダーかキャラ1枚にレストのドン1付与
  "OP10-021": {"act":{"label":"レスト:シーザーならレストのドン1付与","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"シーザー・クラウン"},"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  /* ===== OP10 バッチ2（緑・022-041。ODYSSEY/レスト参照） ===== */
  // OP10-022 トラファルガー・ロー LEADER: 【ドン×1】【起動メイン】キャラのコスト合計5以上で 自キャラ1枚を手札に戻す：ライフ上を公開しコスト5以下超新星キャラなら登場してもよい
  "OP10-022": {"act":{"label":"自キャラを戻しライフ公開→超新星を登場","cost":{},"fx":[{"op":"cond","check":{"and":[{"donX1":true},{"selfCharCostSumAtLeast":5}]},"then":[{"op":"bounceOwnCharCost","then":[{"op":"revealLifePlay","filter":{"type":"CHAR","traitIncludes":"超新星","maxCost":5}}]}]}]}},
  // OP10-023 イッショウ: 【登場時】海軍リーダーなら相手コスト5以下2枚レスト
  "OP10-023": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":2,"optional":true}]}]},
  // OP10-024 エドワード・ニューゲート: 【登場時】レストのキャラ2枚以上なら相手コスト5以下1枚レスト→相手のレストのコスト3以下1枚KO
  "OP10-024": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}]},
  // OP10-025 エネル: 【登場時】レストのキャラ2枚以上なら3ドロー＋手札2枚を捨てる
  "OP10-025": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"draw","n":3},{"op":"discardOwn","n":2}]}]},
  // OP10-026 錦えもん(c2 p1000): 【起動メイン】自身＋トラッシュのパワー0「錦えもん」をデッキ下：手札からコスト6「錦えもん」を登場 ※近似(トラッシュ条件は任意)
  "OP10-026": {"act":{"label":"自身をデッキ下:コスト6錦えもん登場","cost":{},"fx":[{"op":"selfToBottomCost","then":[{"op":"trashToDeckCost","n":1,"filter":{"nameIncludes":"錦えもん","basePower":0},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"錦えもん","filter":{"cost":6},"optional":true}]}]}},
  // OP10-027 錦えもん(c2 p0): 同上（トラッシュ側パワー1000）
  "OP10-027": {"act":{"label":"自身をデッキ下:コスト6錦えもん登場","cost":{},"fx":[{"op":"selfToBottomCost","then":[{"op":"trashToDeckCost","n":1,"filter":{"nameIncludes":"錦えもん","basePower":1000},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"錦えもん","filter":{"cost":6},"optional":true}]}]}},
  // OP10-028 光月モモの助: 【起動メイン】ドン2レスト＋自身トラッシュ：デッキ上5枚から赤鞘九人男2枚を手札に(残りデッキ下)
  "OP10-028": {"act":{"label":"ドン2レスト+自身トラッシュ:赤鞘2枚回収","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"trashSelfCost","then":[{"op":"search","look":5,"count":2,"filter":{"traitIncludes":"赤鞘九人男"},"optional":true}]}]}]}},
  // OP10-029 ジュラキュール・ミホーク: 【登場時】レストのキャラ2枚以上なら 自分のレストのコスト5以下ODYSSEY1枚をアクティブ
  "OP10-029": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":5,"traitIncludes":"ODYSSEY"}}]}]},
  // OP10-030 スモーカー(c5): 【バニッシュ】 ／【起動メイン】ドン1アクティブ（※「以後キャラ効果でドン不可」の制約は未実装）
  "OP10-030": {"act":{"label":"ドン1アクティブ","cost":{},"fx":[{"op":"donActivate","n":1}]}},
  // OP10-032 たしぎ: 「たしぎ」以外の自分の緑キャラが相手効果で離れる場合、代わりにこのキャラをレスト
  "OP10-032": {"static":[{"op":"leaveProtect","pay":"restSelf","targetFilter":{"color":"緑","nameExcludes":"たしぎ"}}]},
  // OP10-033 ナミ: 【登場時】レストのODYSSEYキャラ2枚以上なら 相手のレストのドン1枚は次のリフレッシュでアクティブにならない
  "OP10-033": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"donRefreshLock","n":1}]}]},
  // OP10-034 フランキー: 【ターン1回】このキャラがバトルでKOされる場合、代わりにライフ上1枚を手札に加えてもよい
  "OP10-034": {"static":[{"op":"leaveProtect","targetSelf":true,"includeBattle":true,"once":"turn","pay":"lifeToHand"}]},
  // OP10-035 ブルック: 【KO時】相手のリーダーかコスト5以下1枚をレスト
  "OP10-035": {"onKO":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"includeLeader":true,"count":1,"optional":true}]},
  // OP10-036 ペローナ: 【自分のターン中】【ターン1回】キャラが自分の効果でレストになった時、ドン1アクティブ
  "OP10-036": {"onOwnRest":{"when":"selfTurn","once":"turn","fx":[{"op":"donActivate","n":1}]}},
  // OP10-037 リム: このキャラが相手効果で離れる場合 代わりにODYSSEY1枚をレスト ／【自分のターン終了時】ODYSSEY1枚をアクティブ
  "OP10-037": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"restOwnCards","n":1,"filter":{"traitIncludes":"ODYSSEY"}}],"onTurnEnd":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"ODYSSEY"}}]},
  // OP10-038 ロロノア・ゾロ: 【相手のターン中】レストのキャラ2枚以上で +2000
  "OP10-038": {"static":[{"op":"condBuff","cond":{"oppTurn":true,"selfRestedCharsAtLeast":2},"power":2000}]},
  // OP10-039 ゴムゴムの龍火炎銃巻き星: 【メイン】ODYSSEYリーダーなら デッキ上5枚からODYSSEYキャラ2枚を手札に
  "OP10-039": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ODYSSEY"},"then":[{"op":"search","look":5,"count":2,"filter":{"traitIncludes":"ODYSSEY","type":"CHAR"},"optional":true}]}]}},
  // OP10-040 弱ェ奴は死に方も選べねェ: 【メイン】/【カウンター】相手のレストのコスト7以下1枚KO
  "OP10-040": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":7},"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":7},"count":1,"optional":true}]}},
  // OP10-041 ラジオナイフ: 【メイン】相手コスト6以下1枚レスト→相手のレストのコスト5以下1枚KO
  "OP10-041": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":1,"optional":true}]}},
  /* ===== OP10 バッチ3（青・042-061。ドレスローザ＝リーダー/ステージをレストにするコスト） ===== */
  // OP10-042 ウソップ LEADER: ドレスローザ(コスト2以上)全コスト+1 ／【相手のターン中】ドレスローザがKO/相手効果離脱時、手札5以下なら1ドロー
  "OP10-042": {"static":[{"op":"allyCost","filter":{"traitIncludes":"ドレスローザ","minBaseCost":2},"amount":1}],"onAllyLeave":{"when":"oppTurn","once":"turn","filter":{"traitIncludes":"ドレスローザ"},"cond":{"selfHandAtMost":5},"fx":[{"op":"draw","n":1}]}},
  // OP10-043 ウーシー: 【登場時】ドレスローザのリーダー/ステージ1枚をレスト：「ルフィ」キャラ1枚に【バニッシュ】
  "OP10-043": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"banish","duration":"turn","filter":{"nameIncludes":"モンキー・Ｄ・ルフィ"}}]}]},
  // OP10-044 カブ: 【登場時】ドレスローザのリーダー/ステージ1枚をレスト：相手コスト1以下1枚を手札に戻す
  "OP10-044": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"bounce","side":"opp","maxCost":1,"count":1,"optional":true}]}]},
  // OP10-046 キュロス: 【登場時】コスト5以下1枚を持ち主の手札に戻す
  "OP10-046": {"onPlay":[{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}]},
  // OP10-047 コアラ: 【アタック時】コスト3以上の革命軍1枚を手札に戻す：このキャラ+3000
  "OP10-047": {"onAttack":[{"op":"bounceOwnCharCost","filter":{"traitIncludes":"革命軍","minCost":3},"excludeSelf":true,"then":[{"op":"powerMod","side":"self","target":"self","amount":3000,"duration":"turn"}]}]},
  // OP10-048 サイ: 【登場時】ドレスローザのリーダー/ステージ1枚をレスト：相手コスト1以下1枚を手札に戻す
  "OP10-048": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"bounce","side":"opp","maxCost":1,"count":1,"optional":true}]}]},
  // OP10-049 サボ: 「サボ」以外の自分の元々コスト7以下が相手効果で離れる場合、代わりにこのキャラを手札に戻す
  "OP10-049": {"static":[{"op":"leaveProtect","pay":"bounceSelf","targetFilter":{"maxBaseCost":7,"nameExcludes":"サボ"}}]},
  // OP10-051 ハック: 【ドン×1】【アタック時】デッキ上3枚から革命軍キャラ1枚を手札に(残りデッキ下)
  "OP10-051": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"革命軍","type":"CHAR"},"optional":true}]}]},
  // OP10-052 バルトロメオ: 【ブロッカー】 ／【登場時】コスト1以下1枚を持ち主のデッキ下
  "OP10-052": {"onPlay":[{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},
  // OP10-053 ビアン: 「ビアン」以外の自分のトンタッタ族がいれば【ブロッカー】を得る
  "OP10-053": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"traitIncludes":"トンタッタ族"}}}}]},
  // OP10-055 マルコ: 【ブロッカー】 ／【KO時】相手コスト4以下1枚を持ち主の手札に戻す
  "OP10-055": {"onKO":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]},
  // OP10-056 マンシェリー: 【登場時】ドレスローザのリーダー/ステージをレスト＋コスト4以上のドレスローザ1枚を手札に戻す：相手コスト4以下1枚を手札に戻す
  "OP10-056": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"bounceOwnCharCost","filter":{"traitIncludes":"ドレスローザ","minCost":4},"excludeSelf":true,"then":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]}]}]},
  // OP10-057 レオ: 【登場時】リーダー/ステージ1枚をレスト：ウソップリーダーなら デッキ上5枚から「レオ」以外のドレスローザ2枚を手札に＋手札1枚を捨てる
  "OP10-057": {"onPlay":[{"op":"restOwnAsCost","filter":{"or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"cond","check":{"leaderNameIncludes":"ウソップ"},"then":[{"op":"search","look":5,"count":2,"filter":{"traitIncludes":"ドレスローザ"},"exclude":"レオ","optional":true},{"op":"discardOwn","n":1}]}]}]},
  // OP10-058 レベッカ: 【登場時】コスト8以上のキャラがいれば1ドロー→手札からドレスローザのコスト7以下を最大2枚登場 ※近似(2枚目のレスト登場は省略)
  "OP10-058": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"draw","n":1},{"op":"playCharFromHand","filter":{"traitIncludes":"ドレスローザ","maxCost":7,"nameExcludes":"レベッカ"},"count":2,"optional":true}]}]},
  // OP10-059 おまえ…タチ…わ…おれ…が…み…ち…び…く…!!!: 【メイン】デッキ上5枚からドレスローザキャラ1枚を手札に
  "OP10-059": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドレスローザ","type":"CHAR"},"optional":true}]}},
  // OP10-060 バリバリの銃: 【メイン】相手のパワー6000以下1枚を持ち主のデッキ下
  "OP10-060": {"main":{"fx":[{"op":"deckBottom","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}]}},
  // OP10-061 必殺!!遠距離“蓑虫星”: 【メイン】1ドロー→相手コスト2以下1枚を手札に戻す
  "OP10-061": {"main":{"fx":[{"op":"draw","n":1},{"op":"bounce","side":"opp","maxCost":2,"count":1,"optional":true}]}},
  /* ===== OP10 バッチ4（紫・062-081。ドンキホーテ＋ドン-1） ===== */
  // OP10-062 ヴァイオレット: 【ブロッカー】 ／【KO時】ドンキリーダーならドン-1：トラッシュから紫イベント1枚を手札に
  "OP10-062": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"donMinus","n":1},{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"紫","type":"EVENT"}}]}]},
  // OP10-063 ヴィンスモーク・サンジ: 【登場時】『ジェルマ』リーダーなら デッキ上5枚から『ジェルマ』1枚を手札に
  "OP10-063": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ジェルマ"},"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ジェルマ"},"optional":true}]}]},
  // OP10-065 シュガー(c1): 【起動メイン】ドン1レスト＋自身レスト：デッキ上5枚からドンキ1枚を手札に
  "OP10-065": {"act":{"label":"ドン1+自身レスト:ドンキ1枚回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"optional":true}]}]}},
  // OP10-066 ジョーラ: 【相手のアタック時】【ターン1回】ドン2レスト：相手コスト4以下1枚レスト
  "OP10-066": {"onOppAttack":[{"op":"restDonCost","n":2,"once":"turn","then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // OP10-067 セニョール・ピンク: 【登場時】ドン-1：トラッシュからコスト5以下の紫イベント1枚を手札に→ドン1アクティブ
  "OP10-067": {"onPlay":[{"op":"donMinus","n":1},{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"紫","type":"EVENT","maxCost":5}},{"op":"donActivate","n":1}]},
  // OP10-069 闘魚: 【ドン×1】【アタック時】ドン-1：相手コスト1以下1枚KO
  "OP10-069": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP10-070 トレーボル: 【ブロッカー】 ／【登場時】次の相手ターン終了まで 自分の元々パワー1000以下のキャラ全ては相手効果でKOされない
  "OP10-070": {"onPlay":[{"op":"grantWeakKoImmune","maxBasePower":1000,"duration":"untilNextEnd"}]},
  // OP10-071 ドンキホーテ・ドフラミンゴ: 【登場時】ドン-1：手札からコスト5以下ドンキ1枚を登場 ／【相手のアタック時】【ターン1回】ドン1レスト：ドンデッキからドン1アクティブ追加
  "OP10-071": {"onPlay":[{"op":"donMinus","n":1},{"op":"playCharFromHand","filter":{"traitIncludes":"ドンキホーテ海賊団","maxCost":5},"count":1,"optional":true}],"onOppAttack":[{"op":"restDonCost","n":1,"once":"turn","then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP10-072 ドンキホーテ・ロシナンテ: 【登場時】手札からイベント1枚を捨てる：2ドロー ／【自分のターン終了時】ドン7以上ならドン2アクティブ
  "OP10-072": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"type":"EVENT"},"then":[{"op":"draw","n":2}]}],"onTurnEnd":[{"op":"cond","check":{"donAtLeast":7},"then":[{"op":"donActivate","n":2}]}]},
  // OP10-074 ピーカ: 【ターン1回】このキャラが相手効果でKOされる場合、代わりにアクティブのドン2枚をレストにできる
  "OP10-074": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"restActiveDon","n":2}]},
  // OP10-075 フォクシー: 【起動メイン】このキャラをトラッシュ：自分のドンが相手のドン以下なら1ドロー
  "OP10-075": {"act":{"label":"自身トラッシュ:ドン劣勢なら1ドロー","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"draw","n":1}]}]}]}},
  // OP10-076 ベビー5: 【登場時】手札1枚を捨てる：ドンキリーダーならドンデッキからドン1アクティブ追加
  "OP10-076": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // OP10-078 家族を笑う者はおれが許さん…!!!: 【メイン】/【カウンター】デッキ上3枚から「自身」以外のドンキ1枚を手札に
  "OP10-078": {"main":{"fx":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"exclude":"家族を笑う者はおれが許さん…!!!","optional":true}]},"counter":{"cost":0,"fx":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"exclude":"家族を笑う者はおれが許さん…!!!","optional":true}]}},
  // OP10-079 神誅殺: 【メイン】相手コスト5以下1枚KO→ドンデッキからドン1アクティブ追加
  "OP10-079": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"active"}]}},
  // OP10-080 小熊玩具: 【カウンター】リーダーかキャラ+4000→ドン7以上かつ手札5以下なら1ドロー
  "OP10-080": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"and":[{"donAtLeast":7},{"selfHandAtMost":5}]},"then":[{"op":"draw","n":1}]}]}},
  // OP10-081 ウソップ(c4): 【登場時】ドレスローザのリーダー/ステージをレスト：相手コスト2以下1枚KO→デッキ上2枚トラッシュ
  "OP10-081": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]},
  /* ===== OP10 バッチ5（黒・082-099。黒ひげ/ドレスローザ起動メイン） ===== */
  // OP10-082 クザン(黒): 相手効果で場を離れない ／【起動メイン】自身トラッシュ：1ドロー→トラッシュから「クザン」以外のコスト5以下黒ひげを登場
  "OP10-082": {"static":[{"op":"condBuff","immune":true}],"act":{"label":"自身トラッシュ:1ドロー＋黒ひげ蘇生","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"draw","n":1},{"op":"reviveFromTrash","maxCost":5,"filter":{"traitIncludes":"黒ひげ海賊団","nameExcludes":"クザン"}}]}]}},
  // OP10-083 光月モモの助(黒c2): 【起動メイン】自身＋ドレスローザのリーダー/ステージをレスト：相手キャラ1枚をコスト-2
  "OP10-083": {"act":{"label":"自身+ドレスローザをレスト:相手コスト-2","cost":{"restSelf":true},"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]}},
  // OP10-085 ジーザス・バージェス: 【ドン×1】トラッシュ8枚以上で【速攻】
  "OP10-085": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"and":[{"donX1":true},{"trashAtLeast":8}]}}]},
  // OP10-086 シリュウ: 【相手のターン中】+2000 ／【起動メイン】【ターン1回】黒ひげリーダーでこのキャラ登場ターンなら相手の元々コスト3以下1枚KO
  "OP10-086": {"static":[{"op":"condBuff","cond":{"oppTurn":true},"power":2000}],"act":{"label":"黒ひげ＆登場ターン:相手元々コスト3以下KO","cost":{},"fx":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"黒ひげ海賊団"},{"selfSummonedThisTurn":true}]},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true}]}]}},
  // OP10-087 トニートニー・チョッパー(黒c2): 【起動メイン】自身＋ドレスローザのリーダー/ステージをレスト：相手手札5以上なら相手1枚捨て→デッキ上2枚トラッシュ
  "OP10-087": {"act":{"label":"自身+ドレスローザをレスト:相手手札破壊","cost":{"restSelf":true},"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppDiscard","n":1}]},{"op":"deckToTrash","n":2}]}]}},
  // OP10-088 ナミ(黒c2): 【起動メイン】自身＋ドレスローザのリーダー/ステージをレスト：1ドロー→デッキ上2枚トラッシュ
  "OP10-088": {"act":{"label":"自身+ドレスローザをレスト:1ドロー","cost":{"restSelf":true},"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"draw","n":1},{"op":"deckToTrash","n":2}]}]}},
  // OP10-090 フランキー(黒): 【ブロッカー】 ／【KO時】トラッシュからコスト3以下ドレスローザをレストで登場
  "OP10-090": {"onKO":[{"op":"reviveFromTrash","maxCost":3,"rested":true,"filter":{"traitIncludes":"ドレスローザ"}}]},
  // OP10-091 ブルック(黒c3): 【起動メイン】自身＋ドレスローザのリーダー/ステージをレスト：相手コスト1以下1枚KO→デッキ上2枚トラッシュ
  "OP10-091": {"act":{"label":"自身+ドレスローザをレスト:相手1以下KO","cost":{"restSelf":true},"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]}},
  // OP10-092 ペローナ(黒): 【起動メイン】【ターン1回】トラッシュからスリラーバーク2枚をデッキ下：「ペローナ」以外のキャラ1枚を+2000
  "OP10-092": {"act":{"label":"スリラーバーク2枚デッキ下:他キャラ+2000","cost":{},"fx":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"スリラーバーク海賊団"},"then":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameExcludes":"ペローナ"}}]}]}},
  // OP10-093 ホーミング聖: 【起動メイン】自身トラッシュ：自分の黒キャラ1枚を次相手ターン終了までコスト+3
  "OP10-093": {"act":{"label":"自身トラッシュ:黒キャラをコスト+3","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"addCostBuff","side":"self","count":1,"amount":3,"duration":"untilNextEnd","optional":true,"filter":{"color":"黒"}}]}]}},
  // OP10-094 リューマ: 【ドン×1】【ダブルアタック】
  "OP10-094": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"donX1":true}}]},
  // OP10-095 ロロノア・ゾロ(黒c4): 【登場時】ドレスローザのリーダー/ステージをレスト：相手コスト4以下1枚KO→デッキ上2枚トラッシュ
  "OP10-095": {"onPlay":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]},
  // OP10-096 王下七武海はもう要らねェ…!!!: 【メイン】相手のコスト8以下の王下七武海1枚KO
  "OP10-096": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"traitIncludes":"王下七武海","maxCost":8},"count":1,"optional":true}]}},
  // OP10-097 ゴムゴムの犀榴弾砲: 【メイン】ドレスローザ1枚を+2000→トラッシュ10枚以上なら【バニッシュ】(近似:対象は再選択)
  "OP10-097": {"main":{"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ドレスローザ"}},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"banish","duration":"turn","filter":{"traitIncludes":"ドレスローザ"}}]}]}},
  // OP10-098 解放: 【メイン】自分のキャラが相手より2枚以上少ないなら 相手の元々コスト6以下1枚＋コスト4以下1枚KO
  "OP10-098": {"main":{"fx":[{"op":"cond","check":{"selfCharsFewerBy":2},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":6},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]}},
  // OP10-099 ユースタス・キッド LEADER: 【自分のターン終了時】ライフ上1枚を表向き：コスト3〜8の超新星1枚をアクティブにし次相手ターン終了まで【ブロッカー】
  "OP10-099": {"onTurnEnd":[{"op":"flipLifeCost","then":[{"op":"activateOwnChar","count":1,"filter":{"traitIncludes":"超新星","minCost":3,"maxCost":8,"restedOnly":true},"grantKw":"blocker","grantDuration":"untilNextEnd"}]}]},
  /* ===== OP10 バッチ6（黄・100-119。超新星＝ライフ操作） ===== */
  // OP10-100 イナズマ: 【ドン×1】【アタック時】お互いのライフ合計以下のコストの相手キャラ1枚をレスト
  "OP10-100": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCostFrom":"totalLife"},"count":1,"optional":true}]}]},
  // OP10-102 エンポリオ・イワンコフ: 【起動メイン】【ターン1回】革命軍3枚を+1000→ライフ上1枚を手札に
  "OP10-102": {"act":{"label":"革命軍3枚+1000→ライフ手札","cost":{},"fx":[{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":3,"optional":true,"filter":{"traitIncludes":"革命軍"}},{"op":"lifeToHand","n":1}]}},
  // OP10-103 カポネ・ベッジ(黄): 【登場時】ライフ上か下1枚を手札に：手札から超新星キャラ1枚をライフ上に表向きで加える
  "OP10-103": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"超新星"}}]}]},
  // OP10-104 カリブー: 【ドン×1】超新星リーダーかつ相手ライフ3以上で このキャラはバトルでKOされない
  "OP10-104": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"and":[{"donX1":true},{"leaderTraitIncludes":"超新星"},{"oppLifeAtLeast":3}]}}]},
  // OP10-106 キラー: 【KO時】超新星リーダーなら デッキ上3枚から超新星かキッド海賊団1枚を手札に
  "OP10-106": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"search","look":3,"count":1,"filter":{"or":[{"traitIncludes":"超新星"},{"traitIncludes":"キッド海賊団"}]},"optional":true}]}]},
  // OP10-107 ジュエリー・ボニー: 【ブロッカー】 ／【登場時】ライフ上か下1枚を手札に：手札からコスト5の超新星キャラ1枚をライフ上に表向きで加える
  "OP10-107": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"超新星","cost":5}}]}]},
  // OP10-108 スクラッチメン・アプー: 「アプー」以外の自分の黄・超新星がいれば【ブロッカー】を得る
  "OP10-108": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"color":"黄","traitIncludes":"超新星"}}}}]},
  // OP10-109 バジル・ホーキンス: 【KO時】相手のライフ上1枚をトラッシュ
  "OP10-109": {"onKO":[{"op":"lifeTrash","side":"opp"}]},
  // OP10-110 ヒート＆ワイヤー: 【登場時】相手のライフ枚数以下のコストの相手キャラ1枚をレスト
  "OP10-110": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]},
  // OP10-111 モンキー・D・ルフィ(c1): 【登場時】デッキ上5枚から「ルフィ」以外の超新星1枚を手札に
  "OP10-111": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星"},"exclude":"モンキー・D・ルフィ","optional":true}]},
  // OP10-112 ユースタス・キッド(c8): 【登場時】このキャラをレスト：相手ライフ上1枚をトラッシュ ／【自分のターン終了時】相手ライフ2枚以下なら1ドロー＋手札1枚捨て
  "OP10-112": {"onPlay":[{"op":"restSelfCost","then":[{"op":"lifeTrash","side":"opp"}]}],"onTurnEnd":[{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP10-113 ロロノア・ゾロ(c3): 自分のライフが相手より少ないと【速攻】
  "OP10-113": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"selfLifeLessThanOpp":true}}]},
  // OP10-114 X・ドレーク: 【起動メイン】このキャラをレスト：自ライフが相手以下なら相手コスト4以下1枚レスト
  "OP10-114": {"act":{"label":"自身レスト:ライフ劣勢なら相手4以下レスト","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"selfLifeLEOpp":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP10-115 “新世界”で会おうぜ: 【カウンター】リーダーかキャラ+4000→自ライフ0なら1ドロー
  "OP10-115": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":0},"then":[{"op":"draw","n":1}]}]}},
  // OP10-116 電磁砲: 【メイン】相手コスト5以下1枚KO（ライフ確認の並べ替えは簡略）
  "OP10-116": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}},
  // OP10-117 ROOM: 【カウンター】自ライフ1枚以下なら リーダーかキャラ+3000→自分のコスト5以下1枚をアクティブに
  "OP10-117": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"activateOwnChar","count":1,"filter":{"maxCost":5,"restedOnly":true}}]}]}},
  // OP10-118 モンキー・D・ルフィ(c6): ターン1回相手効果でKOされない ／【アタック時】トラッシュ3枚をデッキ下：相手手札5以上なら相手1枚捨て
  "OP10-118": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"free"}],"onAttack":[{"op":"trashToDeckCost","n":3,"then":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppDiscard","n":1}]}]}]},
  // OP10-119 トラファルガー・ロー(c7): 【登場時】手札から超新星キャラ1枚をライフ上に裏向きで加える→超新星リーダーにレストのドン1付与
  "OP10-119": {"onPlay":[{"op":"handCharToLife","filter":{"traitIncludes":"超新星"}},{"op":"donAttach","target":"leader","n":1}]},
  /* ===== OP09（エモーショナルメモリーズ）バッチ1（赤・001-021＝赤髪海賊団） ===== */
  // OP09-002 ウタ: 【登場時】デッキ上5枚から赤髪海賊団1枚を手札に
  "OP09-002": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"赤髪海賊団"},"optional":true}]},
  // OP09-003 シャチ＆ペンギン: 【アタック時】相手キャラ1枚を-2000
  "OP09-003": {"onAttack":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  // OP09-004 シャンクス(c10): 相手キャラ全-1000 ／【速攻】
  "OP09-004": {"static":[{"op":"oppStaticPowerMod","power":-1000}]},
  // OP09-005 シルバーズ・レイリー: 【ブロッカー】 ／【登場時】相手の元々パワー5000以上が2枚以上なら2ドロー＋手札1枚捨て
  "OP09-005": {"onPlay":[{"op":"cond","check":{"oppChar":{"minPower":5000,"min":2}},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // OP09-007 ヒート: 【ブロッカー】 ／【登場時】パワー4000以下のリーダー1枚を+1000
  "OP09-007": {"onPlay":[{"op":"cond","check":{"leaderEffPowerAtMost":4000},"then":[{"op":"leaderBuff","amount":1000,"duration":"turn"}]}]},
  // OP09-008 ビルディング・スネイク: 【起動メイン】このキャラをデッキ下：相手キャラ1枚を-3000
  "OP09-008": {"act":{"label":"自身をデッキ下:相手-3000","cost":{},"fx":[{"op":"selfToBottomCost","then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP09-009 ベン・ベックマン: 【登場時】相手のパワー6000以下1枚をトラッシュ(KO)
  "OP09-009": {"onPlay":[{"op":"trashChar","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}]},
  // OP09-010 ボンク・パンチ: 【登場時】手札から「モンスター」1枚を登場 ／【ドン×1】【アタック時】+2000
  "OP09-010": {"onPlay":[{"op":"playSpecificFromHand","name":"モンスター","optional":true}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}]},
  // OP09-011 ホンゴウ: 【起動メイン】レスト：赤髪リーダーなら相手キャラ1枚を-2000
  "OP09-011": {"act":{"label":"レスト:赤髪なら相手-2000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"赤髪海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP09-012 モンスター: 自分の「ボンク・パンチ」が効果でKOされる場合、代わりにこのキャラをトラッシュ
  "OP09-012": {"static":[{"op":"leaveProtect","onlyKO":true,"pay":"koSelf","targetFilter":{"nameIncludes":"ボンク・パンチ"}}]},
  // OP09-013 ヤソップ: 【登場時】リーダー1枚を次相手ターン終了まで+1000 ／【ドン×1】【アタック時】相手キャラ1枚を-1000
  "OP09-013": {"onPlay":[{"op":"leaderBuff","amount":1000,"duration":"untilNextEnd"}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}]},
  // OP09-014 ライムジュース: 【登場時】相手のパワー4000以下1枚はこのターン【ブロッカー】発動不可
  "OP09-014": {"onPlay":[{"op":"denyBlocker","filter":{"maxEffPower":4000},"count":1,"optional":true}]},
  // OP09-015 ラッキー・ルウ: 【ブロッカー】 ／【KO時】赤髪リーダーなら相手の元々パワー6000以下1枚KO
  "OP09-015": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"赤髪海賊団"},"then":[{"op":"ko","side":"opp","filter":{"maxPower":6000},"count":1,"optional":true}]}]},
  // OP09-017 ワイヤー: 【ドン×1】リーダーがパワー7000以上かつキッド海賊団で【速攻】
  "OP09-017": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"and":[{"donX1":true},{"leaderEffPowerAtLeast":7000},{"leaderTraitIncludes":"キッド海賊団"}]}}]},
  // OP09-018 失せろ: 【メイン】相手キャラ2枚までをパワー合計4000以下になるようKO
  "OP09-018": {"main":{"fx":[{"op":"koByTotalPower","count":2,"maxTotal":4000}]}},
  // OP09-019 おれは友達を傷つける奴は許さない!!!!: 【メイン】赤髪リーダーなら相手キャラ1枚を-3000→相手にパワー5000以上がいれば1ドロー
  "OP09-019": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"赤髪海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"oppChar":{"minEffPower":5000}},"then":[{"op":"draw","n":1}]}]}]}},
  // OP09-020 来い…!!!おれ達が相手をしてやる!!!: 【メイン】デッキ上5枚から「自身」以外の赤髪海賊団1枚を手札に
  "OP09-020": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"赤髪海賊団"},"exclude":"来い…!!!おれ達が相手をしてやる!!!","optional":true}]}},
  // OP09-021 レッド・フォース号(STAGE): 【起動メイン】レスト：赤髪リーダーなら相手キャラ1枚を-1000
  "OP09-021": {"act":{"label":"レスト:赤髪なら相手-1000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"赤髪海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}]}},
  /* ===== OP09 バッチ2（緑・022-041＝ODYSSEY レスト軸） ===== */
  // OP09-022 リム LEADER: 自分のキャラはレストで登場 ／【起動メイン】【ターン1回】ドン3レスト：ドンデッキからドン1レスト追加＋手札からコスト5以下ODYSSEY1枚を登場
  "OP09-022": {"static":[{"op":"summonRested"}],"act":{"label":"ドン3レスト:ドン追加＋ODYSSEY登場","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"donFromDeck","n":1,"mode":"rested"},{"op":"playCharFromHand","filter":{"traitIncludes":"ODYSSEY","maxCost":5},"count":1,"optional":true}]}]}},
  // OP09-023 アディオ: 【登場時】ODYSSEYリーダーならドン3アクティブ ／【相手のアタック時】【ターン1回】ドン1レスト：リーダーかキャラ+2000
  "OP09-023": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ODYSSEY"},"then":[{"op":"donActivate","n":3}]}],"onOppAttack":[{"op":"restDonCost","n":1,"once":"turn","then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]},
  // OP09-024 ウソップ: 【登場時】レストのキャラ2枚以上なら2ドロー＋手札2枚捨て
  "OP09-024": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP09-025 クロコダイル: ODYSSEYリーダーなら リーダーとのバトルでKOされない（近似:バトルKO耐性）
  "OP09-025": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"leaderTraitIncludes":"ODYSSEY"}}]},
  // OP09-026 サカズキ: 【登場時】レストのキャラ2枚以上なら相手コスト5以下1枚KO
  "OP09-026": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  // OP09-027 サボ: 【アタック時】【ターン1回】レストのキャラ3枚以上なら1ドロー
  "OP09-027": {"onAttack":[{"op":"cond","check":{"selfRestedCharsAtLeast":3},"once":"turn","then":[{"op":"draw","n":1}]}]},
  // OP09-028 サンジ: 【KO時】ライフ上か下1枚を手札に：トラッシュからコスト4以下のODYSSEY/麦わらをレストで登場
  "OP09-028": {"onKO":[{"op":"lifeCost","pos":"choose","then":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"or":[{"traitIncludes":"ODYSSEY"},{"traitIncludes":"麦わらの一味"}]}}]}]},
  // OP09-029 トニートニー・チョッパー: 【自分のターン終了時】コスト4以下のODYSSEY1枚をアクティブ
  "OP09-029": {"onTurnEnd":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":4,"traitIncludes":"ODYSSEY"}}]},
  // OP09-030 トラファルガー・ロー(c3): 【登場時】自キャラ1枚を手札に戻す：手札から「ロー」以外のコスト3以下ODYSSEY1枚を登場
  "OP09-030": {"onPlay":[{"op":"bounceOwnCharCost","excludeSelf":true,"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ODYSSEY","maxCost":3,"nameExcludes":"トラファルガー・ロー"},"count":1,"optional":true}]}]},
  // OP09-031 ドンキホーテ・ドフラミンゴ(c5): 【ブロッカー】 ／【自分のターン終了時】レストのキャラ2枚以上ならこのキャラをアクティブ
  "OP09-031": {"onTurnEnd":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"activateSelf"}]}]},
  // OP09-032 ドンキホーテ・ロシナンテ(c3): 【ブロッカー】 ／【相手のアタック時】【ターン1回】このキャラをアクティブ
  "OP09-032": {"onOppAttack":[{"op":"activateSelf","once":"turn"}]},
  // OP09-033 ニコ・ロビン: 【登場時】レストのキャラ2枚以上なら 自分のODYSSEY/麦わら全ては次相手ターン終了まで効果でKOされない
  "OP09-033": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"grantTraitKoImmune","duration":"untilNextEnd","filter":{"or":[{"traitIncludes":"ODYSSEY"},{"traitIncludes":"麦わらの一味"}]}}]}]},
  // OP09-034 ペローナ: 【登場時】デッキ上5枚からスリラーバークか「ミホーク」1枚を手札に＋手札1枚捨て
  "OP09-034": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"スリラーバーク海賊団"},{"nameIncludes":"ジュラキュール・ミホーク"}]},"optional":true},{"op":"discardOwn","n":1}]},
  // OP09-035 ポートガス・D・エース: 【登場時】レストのキャラ2枚以上なら相手コスト5以下1枚レスト
  "OP09-035": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  // OP09-036 モンキー・D・ルフィ(c5): 【登場時】レストのキャラ2枚以上なら相手コスト6以下1枚をレスト（ドン選択は簡略）
  "OP09-036": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]}]},
  // OP09-037 リム(c3): 【登場時】デッキ上5枚から「リム」以外のODYSSEY1枚を手札に ／【自分のターン終了時】レストのキャラ3枚以上ならこのキャラをアクティブ
  "OP09-037": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ODYSSEY"},"exclude":"リム","optional":true}],"onTurnEnd":[{"op":"cond","check":{"selfRestedCharsAtLeast":3},"then":[{"op":"activateSelf"}]}]},
  // OP09-039 ゴムゴムの「四本樹」JET十字架ショックバズーカ: 【カウンター】ODYSSEYリーダー＋レストのキャラ2枚以上なら リーダーかキャラ+2000
  "OP09-039": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ODYSSEY"},{"selfRestedCharsAtLeast":2}]},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP09-040 雷光槍フリップ煩悩鳳ショット: 【メイン】レストのキャラ2枚以上なら相手コスト4以下1枚KO
  "OP09-040": {"main":{"fx":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP09-041 魂のフランキー風速計BOXING喪剣: 【カウンター】リーダーかキャラ+2000→ODYSSEYリーダー＋レストのキャラ2枚以上なら自キャラ2枚をアクティブ
  "OP09-041": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ODYSSEY"},{"selfRestedCharsAtLeast":2}]},"then":[{"op":"activateOwnChar","count":2,"filter":{"restedOnly":true}}]}]}},
  /* ===== OP09 バッチ3（青・042-061＝クロスギルド/白ひげ） ===== */
  // OP09-043 アルビダ: 【KO時】クロスギルドリーダーなら手札から「アルビダ」以外のコスト5以下を登場
  "OP09-043": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"クロスギルド"},"then":[{"op":"playCharFromHand","filter":{"maxCost":5,"nameExcludes":"アルビダ"},"count":1,"optional":true}]}]},
  // OP09-044 イゾウ: 【アタック時】デッキ上5枚からワノ国か白ひげ海賊団1枚を手札に＋手札1枚捨て
  "OP09-044": {"onAttack":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"ワノ国"},{"traitIncludes":"白ひげ海賊団"}]},"optional":true},{"op":"discardOwn","n":1}]},
  // OP09-045 カバジ: 自分の「バギー」か「モージ」がいるとバトルでKOされない
  "OP09-045": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"or":[{"selfChar":{"nameIncludes":"バギー"}},{"selfChar":{"nameIncludes":"モージ"}}]}}]},
  // OP09-046 クロコダイル(c7): 【登場時】手札からコスト5以下のクロスギルドかB・W1枚を登場
  "OP09-046": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"traitIncludes":"クロスギルド"},{"traitIncludes":"B・W"}]},"count":1,"optional":true}]},
  // OP09-047 光月おでん: 【ダブルアタック】 ／【KO時】2ドロー＋手札1枚捨て
  "OP09-047": {"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  // OP09-048 ジュラキュール・ミホーク(c6): 【ブロッカー】 ／【登場時】2ドロー＋手札1枚捨て
  "OP09-048": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  // OP09-050 ナミ(c1): 【アタック時】デッキ上5枚から青のイベント1枚を手札に
  "OP09-050": {"onAttack":[{"op":"search","look":5,"count":1,"filter":{"color":"青","type":"EVENT"},"optional":true}]},
  // OP09-051 バギー(c10): 【登場時】相手キャラ1枚をデッキ下→自分のコスト5以上が5枚いなければこのキャラをデッキ下
  "OP09-051": {"onPlay":[{"op":"deckBottom","side":"opp","count":1,"optional":true},{"op":"cond","check":{"not":{"selfCharCount":{"filter":{"minCost":5},"min":5}}},"then":[{"op":"selfToDeckBottom"}]}]},
  // OP09-052 マルコ(c3): 【相手のターン中】手札1枚を捨てる：このキャラが相手効果でKOされた時、トラッシュからレストで登場
  "OP09-052": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"reviveSelfRested"}]}]}]},
  // OP09-053 モージ: 【登場時】デッキ上5枚から「リッチー」1枚を手札に→手札から「リッチー」1枚を登場
  "OP09-053": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"nameIncludes":"リッチー"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"リッチー","optional":true}]},
  // OP09-056 Mr.3(ギャルディーノ): 【登場時】デッキ上4枚から「自身」以外のクロスギルドかB・W1枚を手札に
  "OP09-056": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"or":[{"traitIncludes":"クロスギルド"},{"traitIncludes":"B・W"}]},"exclude":"Mr.3(ギャルディーノ)","optional":true}]},
  // OP09-057 クロスギルド: 【メイン】デッキ上4枚からクロスギルド1枚を手札に
  "OP09-057": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"traitIncludes":"クロスギルド"},"optional":true}]}},
  // OP09-058 特製マギー玉: 【メイン】相手のコスト6以下1枚を手札に戻す
  "OP09-058": {"main":{"fx":[{"op":"bounce","side":"opp","maxCost":6,"count":1,"optional":true}]}},
  // OP09-059 湯けむり殺人事件: 【カウンター】リーダーかキャラ+3000→手札2枚まで捨て、捨てた枚数だけデッキ上トラッシュ(近似:各2枚)
  "OP09-059": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"discardCost","count":2,"optional":true,"then":[{"op":"deckToTrash","n":2}]}]}},
  // OP09-060 カライ・バリ島(STAGE): 【起動メイン】手札2枚をデッキ下＋このステージをレスト：クロスギルドリーダーなら2ドロー
  "OP09-060": {"act":{"label":"手札2枚デッキ下+レスト:クロスギルドなら2ドロー","cost":{"restSelf":true},"fx":[{"op":"handToBottomCost","n":2,"then":[{"op":"cond","check":{"leaderTraitIncludes":"クロスギルド"},"then":[{"op":"draw","n":2}]}]}]}},
  // OP09-061 モンキー・D・ルフィ LEADER: 【ドン×1】自分のキャラ全コスト+1 ／【ターン1回】自分のドンが2枚以上戻された時、ドン1アクティブ＋ドン1レスト追加(近似:返却ごと)
  "OP09-061": {"static":[{"op":"allyCost","cond":{"donX1":true},"amount":1}],"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  /* ===== OP09 バッチ4（紫・062-081＝麦わら/ドン循環） ===== */
  // OP09-062 ニコ・ロビン LEADER: 【バニッシュ】 ／【アタック時】手札の【トリガー】1枚を捨てる：ドンデッキからドン1レスト追加
  "OP09-062": {"onAttack":[{"op":"discardCost","count":1,"optional":true,"filter":{"hasTrigger":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP09-064 キラー: 【登場時】ドン-1：キッド海賊団リーダー1枚をアクティブに
  "OP09-064": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"キッド海賊団"},"then":[{"op":"activateOwnChar","incLeader":true,"count":0}]}]},
  // OP09-065 サンジ(c7): 【登場時】ドン-1：このターン【速攻】→相手コスト6以下1枚をレスト
  "OP09-065": {"onPlay":[{"op":"donMinus","n":1},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"},{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]},
  // OP09-066 ジャンバール: 【登場時】相手のドンが自分より多いなら相手コスト3以下1枚KO
  "OP09-066": {"onPlay":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP09-068 トニートニー・チョッパー(c5): 【自分のターン終了時】ドン-1：このキャラをアクティブ→次相手ターン終了まで【ブロッカー】
  "OP09-068": {"onTurnEnd":[{"op":"donMinus","n":1},{"op":"activateSelf"},{"op":"giveKeyword","target":"self","kw":"blocker","duration":"untilNextEnd"}]},
  // OP09-069 トラファルガー・ロー(c1): 【登場時】デッキ上4枚からコスト2以上の麦わらかハート1枚を手札に
  "OP09-069": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"minCost":2,"or":[{"traitIncludes":"麦わらの一味"},{"traitIncludes":"ハートの海賊団"}]},"optional":true}]},
  // OP09-070 ナミ(c3): 【登場時】ドン-1：リーダーかキャラ1枚にレストのドン2付与
  "OP09-070": {"onPlay":[{"op":"donMinus","n":1},{"op":"donAttach","target":"chooseOwn","n":2}]},
  // OP09-072 フランキー(c4): 【ブロッカー】 ／【登場時】ドン-2＋手札1枚捨て：2ドロー
  "OP09-072": {"onPlay":[{"op":"donMinus","n":2},{"op":"discardCost","count":1,"optional":true,"then":[{"op":"draw","n":2}]}]},
  // OP09-073 ブルック(c6): 【アタック時】ドン-1：相手キャラ2枚を-2000
  "OP09-073": {"onAttack":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]},
  // OP09-074 ベポ: 【自分のターン中】【ターン1回】ドンが戻された時、リーダーかキャラ1枚を+1000
  "OP09-074": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]},
  // OP09-075 ユースタス・キッド(c3): 【登場時】ライフ上1枚を手札に：キッド海賊団リーダーならドンデッキからドン1アクティブ追加
  "OP09-075": {"onPlay":[{"op":"lifeCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"キッド海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // OP09-076 ロロノア・ゾロ(c3): 【登場時】ドン-1：ドンデッキからドン1アクティブ追加
  "OP09-076": {"onPlay":[{"op":"donMinus","n":1},{"op":"donFromDeck","n":1,"mode":"active"}]},
  // OP09-077 ゴムゴムの雷: 【メイン】ドン-2：相手のパワー6000以下1枚KO
  "OP09-077": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"ko","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}]}},
  // OP09-078 ゴムゴムの巨人: 【カウンター】ドン-2＋手札1枚捨て：麦わらリーダーならリーダーかキャラ+4000→2ドロー
  "OP09-078": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":2},{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"draw","n":2}]}]}]}},
  // OP09-079 ゴムゴムの縄跳び: 【メイン】ドン-2：相手コスト5以下1枚をレスト→1ドロー
  "OP09-079": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"draw","n":1}]}},
  // OP09-080 サウザンド・サニー号(STAGE): 【相手のターン中】このステージをレスト：麦わらキャラが相手効果で離れた時、ドンデッキからドン1レスト追加
  "OP09-080": {"onAllyLeave":{"when":"oppTurn","cause":"oppEffect","filter":{"traitIncludes":"麦わらの一味"},"fx":[{"op":"restSelfCost","then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // OP09-081 マーシャル・Ｄ・ティーチ LEADER: 自分の登場時効果は無効 ／【起動メイン】手札1枚を捨てる：次相手ターン終了まで相手の登場時効果を無効
  "OP09-081": {"static":[{"op":"negateOwnOnPlay"}],"act":{"label":"手札1捨て:相手の登場時効果を無効","cost":{},"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"negateOppOnPlay","duration":"untilNextEnd"}]}]}},
  /* ===== OP09 バッチ5（黒・082-099＝黒ひげ） ===== */
  // OP09-083 ヴァン・オーガー: 【起動メイン】レスト：黒ひげリーダーなら相手キャラ1枚をコスト-3 ／【KO時】1ドロー
  "OP09-083": {"act":{"label":"レスト:黒ひげなら相手コスト-3","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]},"onKO":[{"op":"draw","n":1}]},
  // OP09-084 カタリーナ・デボン: 【起動メイン】【ターン1回】黒ひげリーダーなら次相手ターン終了まで【Wアタック】か【バニッシュ】か【ブロッカー】
  "OP09-084": {"act":{"label":"黒ひげ:Wアタック/バニッシュ/ブロッカーを得る","cost":{},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"chooseOption","options":[{"label":"ダブルアタック","fx":[{"op":"giveKeyword","target":"self","kw":"doubleAttack","duration":"untilNextEnd"}]},{"label":"バニッシュ","fx":[{"op":"giveKeyword","target":"self","kw":"banish","duration":"untilNextEnd"}]},{"label":"ブロッカー","fx":[{"op":"giveKeyword","target":"self","kw":"blocker","duration":"untilNextEnd"}]}]}]}]}},
  // OP09-085 ゲッコー・モリア: 【登場時】トラッシュからコスト2以下のスリラーバークをレストで登場
  "OP09-085": {"onPlay":[{"op":"reviveFromTrash","maxCost":2,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP09-087 シャーロット・プリン: 【登場時】相手の手札5枚以上なら相手1枚捨て
  "OP09-087": {"onPlay":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppDiscard","n":1}]}]},
  // OP09-088 シリュウ(c3): 【ドン×1】【アタック時】手札2枚を捨てる：2ドロー
  "OP09-088": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"draw","n":2}]}]}]},
  // OP09-089 ストロンガー: 【起動メイン】手札1枚捨て＋自身トラッシュ：黒ひげリーダーなら1ドロー→相手キャラ1枚をコスト-2
  "OP09-089": {"act":{"label":"手札1捨て+自身トラッシュ:黒ひげで1ドロー＋相手-2","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]}]}]}},
  // OP09-090 ドクQ: 【起動メイン】レスト：黒ひげリーダーなら相手コスト1以下1枚KO ／【KO時】1ドロー
  "OP09-090": {"act":{"label":"レスト:黒ひげなら相手1以下KO","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},"onKO":[{"op":"draw","n":1}]},
  // OP09-092 マーシャル・D・ティーチ(c3): 【起動メイン】レスト：手札が相手より3枚以上少ないなら2ドロー＋手札1枚捨て
  "OP09-092": {"act":{"label":"レスト:手札劣勢なら2ドロー＋1捨て","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"selfHandFewerBy":3},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]}},
  // OP09-097 闇水: 【カウンター】相手のリーダーかキャラ1枚を効果無効＋-4000
  "OP09-097": {"counter":{"cost":0,"fx":[{"op":"negateChoose","side":"opp","duration":"turn","amount":-4000,"optional":true}]}},
  // OP09-098 闇穴道: 【メイン】黒ひげリーダーなら相手キャラ1枚を効果無効→コスト4以下ならKO
  "OP09-098": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"negateChoose","side":"opp","charsOnly":true,"duration":"turn","koIfMaxCost":4,"optional":true}]}]}},
  /* ===== OP09 バッチ6（黄・100-119＝革命軍/オハラ/ライフ） ===== */
  // OP09-101 クザン(c4): 【登場時】相手コスト3以下1枚を相手ライフに表向きで置く→相手1枚捨て
  "OP09-101": {"onPlay":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true},{"op":"oppDiscard","n":1}]},
  // OP09-102 クローバー博士: 【登場時】ニコ・ロビンリーダーなら デッキ上3枚から【トリガー】1枚を手札に
  "OP09-102": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ニコ・ロビン"},"then":[{"op":"search","look":3,"count":1,"filter":{"hasTrigger":true},"optional":true}]}]},
  // OP09-103 コアラ(c6): 【ブロッカー】 ／【登場時】ライフ上か下1枚を手札に：手札からコスト4以下の革命軍1枚を登場→1ドロー
  "OP09-103": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"playCharFromHand","filter":{"traitIncludes":"革命軍","maxCost":4},"count":1,"optional":true},{"op":"draw","n":1}]}]},
  // OP09-104 サボ(c7): 【登場時】手札から革命軍キャラ1枚をライフ上に表向きで加える→ライフ2枚以上ならライフ上か下1枚を手札に
  "OP09-104": {"onPlay":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"革命軍"}},{"op":"cond","check":{"lifeAtLeast":2},"then":[{"op":"lifeCost","pos":"choose"}]}]},
  // OP09-106 ニコ・オルビア: 【登場時】リーダーが「ニコ・ロビン」なら+3000
  "OP09-106": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ニコ・ロビン"},"then":[{"op":"leaderBuff","amount":3000,"duration":"turn"}]}]},
  // OP09-107 ニコ・ロビン(c6): 【登場時】相手ライフ3枚以上なら相手ライフ上1枚をトラッシュ
  "OP09-107": {"onPlay":[{"op":"cond","check":{"oppLifeAtLeast":3},"then":[{"op":"lifeTrash","side":"opp"}]}]},
  // OP09-110 ピエール: 【登場時】2ドロー＋手札2枚捨て
  "OP09-110": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP09-112 ベロ・ベティ: 【登場時】自ライフ2枚以下なら1ドロー
  "OP09-112": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"draw","n":1}]}]},
  // OP09-114 リンドバーグ: 【登場時】お互いライフ合計5枚以下なら相手のパワー2000以下1枚KO
  "OP09-114": {"onPlay":[{"op":"cond","check":{"totalLifeAtMost":5},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}]},
  // OP09-115 アイス塊「両棘矛」: 【メイン】相手のコスト3以下の【トリガー】持ち1枚KO
  "OP09-115": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":3,"hasTrigger":true},"count":1,"optional":true}]}},
  // OP09-116 ”奇跡”ナメんじゃないよォ!!!!: 【カウンター】リーダーかキャラ+2000
  "OP09-116": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}},
  // OP09-117 デレシ!!: 【メイン】デッキ上5枚から「自身」以外の【トリガー】持ち2枚を手札に
  "OP09-117": {"main":{"fx":[{"op":"search","look":5,"count":2,"filter":{"hasTrigger":true},"exclude":"デレシ!!","optional":true}]}},
  // OP09-119 モンキー・D・ルフィ(c9): 【登場時】ドン-1：1ドロー＋このターン【速攻】
  "OP09-119": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]},
  /* ===== OP08（二つの伝説）バッチ1（赤・001-021＝ドラム王国/動物） ===== */
  // OP08-001 トニートニー・チョッパー LEADER: 【起動メイン】【ターン1回】動物/ドラム王国3枚までにレストのドン1ずつ付与
  "OP08-001": {"act":{"label":"動物/ドラム王国3枚にレストのドン付与","cost":{},"fx":[{"op":"donAttachAll","n":1,"max":3,"filter":{"or":[{"traitIncludes":"動物"},{"traitIncludes":"ドラム王国"}]}}]}},
  // OP08-004 クロマーリモ: 【登場時】自分の「チェス」がいれば相手のパワー3000以下1枚KO
  "OP08-004": {"onPlay":[{"op":"cond","check":{"selfChar":{"nameIncludes":"チェス"}},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},
  // OP08-005 チェス: 【登場時】相手キャラ1枚を-2000→「クロマーリモ」がいなければ手札から「クロマーリモ」1枚を登場
  "OP08-005": {"onPlay":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"noSelfChar":{"nameIncludes":"クロマーリモ"}},"then":[{"op":"playSpecificFromHand","name":"クロマーリモ","optional":true}]}]},
  // OP08-006 チェスマーリモ: 【自分のターン中】トラッシュに「クロマーリモ」と「チェス」があれば+2000
  "OP08-006": {"static":[{"op":"condBuff","cond":{"and":[{"selfTurn":true},{"trashCount":{"filter":{"nameIncludes":"クロマーリモ"},"min":1}},{"trashCount":{"filter":{"nameIncludes":"チェス"},"min":1}}]},"power":2000}]},
  // OP08-007 トニートニー・チョッパー(c3): 【自分のターン中】【登場時】/【アタック時】デッキ上5枚からパワー4000以下の動物1枚をレストで登場
  "OP08-007": {"onPlay":[{"op":"cond","check":{"selfTurn":true},"then":[{"op":"playFromDeck","look":5,"rested":true,"filter":{"traitIncludes":"動物","maxPower":4000}}]}],"onAttack":[{"op":"playFromDeck","look":5,"rested":true,"filter":{"traitIncludes":"動物","maxPower":4000}}]},
  // OP08-008 ドルトン: 【登場時】相手キャラ1枚を-1000 ／【ドン×1】【起動メイン】【ターン1回】ライフ上1枚を手札に：このターン【速攻】
  "OP08-008": {"onPlay":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}],"act":{"label":"ライフ上1枚を手札に:このターン速攻","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"lifeCost","then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]}]}},
  // OP08-010 ハイキングベア: 【ドン×1】【起動メイン】【ターン1回】このキャラ以外の動物1枚を+1000
  "OP08-010": {"act":{"label":"他の動物1枚を+1000","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"動物"}}]}]}},
  // OP08-012 ラパーン: 【ドン×2】【アタック時】ドラム王国リーダーなら相手のパワー4000以下1枚KO
  "OP08-012": {"onAttack":[{"op":"cond","check":{"and":[{"donX2":true},{"leaderTraitIncludes":"ドラム王国"}]},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}]},
  // OP08-013 ロブソン: 【ドン×2】【速攻】
  "OP08-013": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donX2":true}}]},
  // OP08-014 ワポル: 【ドン×1】【アタック時】相手キャラ1枚を-2000→このキャラは次相手ターン終了まで+2000
  "OP08-014": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextEnd"}]}]},
  // OP08-015 Dr.くれは: 【登場時】デッキ上4枚から「くれは」以外のドラム王国か「チョッパー」1枚を手札に
  "OP08-015": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"or":[{"traitIncludes":"ドラム王国"},{"nameIncludes":"トニートニー・チョッパー"}]},"exclude":"Dr.くれは","optional":true}]},
  // OP08-016 Dr.ヒルルク: 【起動メイン】レスト：チョッパーリーダーなら自分の「チョッパー」すべて+2000
  "OP08-016": {"act":{"label":"レスト:チョッパー全+2000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"トニートニー・チョッパー"},"then":[{"op":"powerMod","side":"self","all":true,"amount":2000,"duration":"turn","filter":{"nameIncludes":"トニートニー・チョッパー"}}]}]}},
  // OP08-017 おれは決して お前を撃たねェ!!!!: 【カウンター】リーダーかキャラ+4000→相手のリーダーかキャラ-1000
  "OP08-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"powerMod","side":"opp","includeLeader":true,"amount":-1000,"duration":"turn","count":1,"optional":true}]}},
  // OP08-018 刻蹄『桜』: 【メイン】自分のキャラ3枚を+1000→相手キャラ1枚を-2000
  "OP08-018": {"main":{"fx":[{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":3,"optional":true},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}},
  // OP08-019 バクバク食: 【メイン】/【カウンター】相手キャラ1枚を-3000→自分のキャラ1枚を+3000
  "OP08-019": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true},{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true},{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}},
  // OP08-020 ドラム王国(STAGE): 【相手のターン中】自分のドラム王国キャラ全+1000
  "OP08-020": {"static":[{"op":"allyPower","cond":{"oppTurn":true},"power":1000,"filter":{"traitIncludes":"ドラム王国"}}]},
  /* ===== OP08 バッチ2（緑・022-041＝ミンク族・リフレッシュロック） ===== */
  // OP08-022 イヌアラシ: 【登場時】ミンク族リーダーなら相手のレストのコスト5以下2枚を次リフレッシュロック
  "OP08-022": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"lockRefresh","filter":{"maxCost":5},"count":2,"optional":true}]}]},
  // OP08-023 キャロット: 【登場時】/【アタック時】相手のレストのコスト7以下1枚を次リフレッシュロック
  "OP08-023": {"onPlay":[{"op":"lockRefresh","filter":{"maxCost":7},"count":1,"optional":true}],"onAttack":[{"op":"lockRefresh","filter":{"maxCost":7},"count":1,"optional":true}]},
  // OP08-024 コンスロット: 【アタック時】相手のレストのコスト4以下1枚を次リフレッシュロック
  "OP08-024": {"onAttack":[{"op":"lockRefresh","filter":{"maxCost":4},"count":1,"optional":true}]},
  // OP08-025 シシリアン: 【登場時】相手のレストのコスト3以下1枚を次リフレッシュロック
  "OP08-025": {"onPlay":[{"op":"lockRefresh","filter":{"maxCost":3},"count":1,"optional":true}]},
  // OP08-026 ジョバンニ: 【ドン×1】【アタック時】相手のレストのコスト1以下1枚を次リフレッシュロック
  "OP08-026": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"lockRefresh","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP08-028 ネコマムシ: 【登場時】相手のレストのカードが7枚以上なら このターン【速攻】
  "OP08-028": {"onPlay":[{"op":"cond","check":{"oppRestedCardsAtLeast":7},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP08-029 ペコムズ: アクティブの時、「ペコムズ」以外のコスト3以下ミンク族は効果でKOされない
  "OP08-029": {"static":[{"op":"allyKoImmune","whenActive":true,"filter":{"maxBaseCost":3,"traitIncludes":"ミンク族","nameExcludes":"ペコムズ"}}]},
  // OP08-030 ペドロ: 【ブロッカー】 ／【KO時】相手のドン1枚をレスト か 相手のレストのコスト6以下1枚KO
  "OP08-030": {"onKO":[{"op":"chooseOption","options":[{"label":"相手のドン1枚をレスト","fx":[{"op":"restOppDon","n":1}]},{"label":"相手のレストのコスト6以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":6},"count":1,"optional":true}]}]}]},
  // OP08-031 ミヤギ: 【登場時】コスト2以下のミンク族1枚をアクティブ
  "OP08-031": {"onPlay":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":2,"traitIncludes":"ミンク族"}}]},
  // OP08-032 ミルキー: 【起動メイン】レスト：ミンク族リーダーならドン1アクティブ
  "OP08-032": {"act":{"label":"レスト:ミンク族ならドン1アクティブ","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"donActivate","n":1}]}]}},
  // OP08-033 ロディ: 【登場時】ミンク族リーダー＋相手のレストのカード7枚以上なら相手のレストのコスト2以下1枚KO
  "OP08-033": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ミンク族"},{"oppRestedCardsAtLeast":7}]},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":2},"count":1,"optional":true}]}]},
  // OP08-034 ワンダ: 【登場時】デッキ上5枚から「ワンダ」以外のミンク族1枚を手札に
  "OP08-034": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ミンク族"},"exclude":"ワンダ","optional":true}]},
  // OP08-036 エレクトリカルルナ: 【メイン】相手のレストのコスト7以下すべてを次リフレッシュロック
  "OP08-036": {"main":{"fx":[{"op":"lockRefresh","all":true,"filter":{"maxCost":7}}]}},
  // OP08-037 ガルチュー: 【メイン】ミンク族1枚をレスト：相手キャラ1枚をレスト
  "OP08-037": {"main":{"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ミンク族"},"then":[{"op":"restChar","side":"opp","count":1,"optional":true}]}]}},
  // OP08-038 敵に“仲間”は売らんぜよ!!!: 【メイン】自分のキャラ2枚をレスト：自分のキャラ全ては次相手ターン終了まで効果でKOされない
  "OP08-038": {"main":{"fx":[{"op":"restOwnAsCost","count":2,"then":[{"op":"grantTraitKoImmune","duration":"untilNextEnd","filter":{"type":"CHAR"}}]}]}},
  // OP08-039 ゾウ(STAGE): 【起動メイン】レスト：ミンク族リーダーならドン1アクティブ ／【自分のターン終了時】ミンク族1枚をアクティブ
  "OP08-039": {"act":{"label":"レスト:ミンク族ならドン1アクティブ","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"donActivate","n":1}]}]},"onTurnEnd":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"ミンク族"}}]},
  // OP08-040 アトモス: 【登場時】手札から白ひげ2枚を公開：白ひげリーダーなら相手コスト4以下1枚を手札に戻す
  "OP08-040": {"onPlay":[{"op":"revealCost","count":2,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]}]}]},
  // OP08-041 アフェランドラ: 【起動メイン】このキャラを手札に戻す：九蛇海賊団リーダーなら相手コスト1以下1枚をデッキ下
  "OP08-041": {"act":{"label":"自身を手札へ:九蛇なら相手1以下デッキ下","cost":{},"fx":[{"op":"bounceSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"九蛇海賊団"},"then":[{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]}]}},
  /* ===== OP08 バッチ3（青・042-061＝白ひげ/百獣/ビッグマム） ===== */
  // OP08-042 エドワード・ウィーブル: 【ドン×1】【アタック時】コスト3以下1枚を手札に戻す
  "OP08-042": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]}]},
  // OP08-044 キングデュー: 【起動メイン】【ターン1回】手札から白ひげ2枚を公開：このキャラ+2000
  "OP08-044": {"act":{"label":"白ひげ2枚公開:このキャラ+2000","cost":{},"fx":[{"op":"revealCost","count":2,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}]}},
  // OP08-045 サッチ: KO/相手効果離脱の代わりにトラッシュへ置き1ドロー
  "OP08-045": {"static":[{"op":"leaveProtect","targetSelf":true,"pay":"trashSelfDraw","draw":1}],"onKO":[{"op":"draw","n":1}]},
  // OP08-046 シャクヤク: 【自分のターン中】【ターン1回】キャラが自分の効果で離れた時、相手手札5以上なら相手は手札1枚をデッキ下→このキャラをレスト
  "OP08-046": {"onAllyLeave":{"when":"selfTurn","once":"turn","cause":"ownEffect","fx":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppHandToBottom","n":1}]},{"op":"restThis"}]}},
  // OP08-049 スピード・ジル: 【登場時】デッキ上1枚を公開、白ひげなら このターン【速攻】
  "OP08-049": {"onPlay":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP08-051 バッキン: 【自分のターン中】【登場時】自分の「エドワード・ウィーブル」1枚を+2000
  "OP08-051": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"エドワード・ウィーブル"}}]},
  // OP08-052 ポートガス・D・エース(c5): 【登場時】デッキ上1枚公開、コスト4以下の白ひげキャラを登場
  "OP08-052": {"onPlay":[{"op":"playFromDeck","look":1,"filter":{"traitIncludes":"白ひげ海賊団","maxCost":4}}]},
  // OP08-053 愛してくれて………ありがとう!!!: 【メイン】白ひげリーダーなら デッキ上3枚から白ひげか「ルフィ」1枚を手札に
  "OP08-053": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"search","look":3,"count":1,"filter":{"or":[{"traitIncludes":"白ひげ海賊団"},{"nameIncludes":"モンキー・D・ルフィ"}]},"optional":true}]}]}},
  // OP08-054 いきなり“キング”は取れねェだろうよい: 【カウンター】リーダーかキャラ+3000→デッキ上1枚公開しコスト3以下の白ひげキャラを登場
  "OP08-054": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"playFromDeck","look":1,"filter":{"traitIncludes":"白ひげ海賊団","maxCost":3}}]}},
  // OP08-055 鳳凰印: 【メイン】手札から白ひげ2枚を公開：コスト6以下1枚を持ち主のデッキ下
  "OP08-055": {"main":{"fx":[{"op":"revealCost","count":2,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"deckBottom","side":"any","maxCost":6,"count":1,"optional":true}]}]}},
  // OP08-056 モビー・ディック号(STAGE): 【自分のターン中】【ターン1回】白ひげキャラが効果で離れた時、1ドロー＋手札1枚をデッキへ
  "OP08-056": {"onAllyLeave":{"when":"selfTurn","once":"turn","filter":{"traitIncludes":"白ひげ海賊団"},"fx":[{"op":"draw","n":1},{"op":"handToBottom","n":1}]}},
  // OP08-058 シャーロット・プリン LEADER: 【アタック時】ライフ上2枚を表向き：ドンデッキからドン1レスト追加
  "OP08-058": {"onAttack":[{"op":"flipLifeCost","n":2,"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP08-059 アルベル: 【起動メイン】自身トラッシュ：百獣リーダー＋場のドン10枚なら手札からコスト7以下「キング」1枚を登場
  "OP08-059": {"act":{"label":"自身トラッシュ:ドン10で「キング」登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"百獣海賊団"},{"donAtLeast":10}]},"then":[{"op":"playSpecificFromHand","name":"キング","filter":{"maxCost":7},"optional":true}]}]}]}},
  // OP08-060 キング: 【登場時】ドン-1：相手の場のドン5枚以上なら このターン【速攻】
  "OP08-060": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"oppDonAtLeast":5},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP08-061 シャーロット・オーブン: 【アタック時】ドン-1：相手コスト3以下1枚KO
  "OP08-061": {"onAttack":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},
  /* ===== OP08 バッチ4（紫・062-081＝ビッグマム/百獣 ドン循環） ===== */
  // OP08-062 シャーロット・カタクリ(c2): 【起動メイン】自身トラッシュ：ビッグマムリーダーなら手札からコスト3以上かつ相手ドン以下の「カタクリ」を登場
  "OP08-062": {"act":{"label":"自身トラッシュ:カタクリを登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ビッグ・マム海賊団"},"then":[{"op":"playSpecificFromHand","nameIncludes":"シャーロット・カタクリ","filter":{"minCost":3,"maxCostFrom":"oppDon"},"optional":true}]}]}]}},
  // OP08-063 シャーロット・カタクリ(c6): 【登場時】ライフ上1枚を裏向き：ドンデッキからドン1アクティブ追加
  "OP08-063": {"onPlay":[{"op":"lifeFlipDownCost","then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP08-064 シャーロット・クラッカー: 【起動メイン】【ターン1回】ドン-1：手札から「ビスケット兵」1枚を登場
  "OP08-064": {"act":{"label":"ドン-1:ビスケット兵を登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"playSpecificFromHand","name":"ビスケット兵","optional":true}]}},
  // OP08-066 シャーロット・ブリュレ: 【ブロッカー】 ／【KO時】ドンデッキからドン1レスト追加
  "OP08-066": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rested"}]},
  // OP08-067 シャーロット・プリン(c3): 【自分のターン中】【ターン1回】ドンが戻された時、ドンデッキからドン1レスト追加
  "OP08-067": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP08-068 シャーロット・ペロスペロー: 【KO時】ドンデッキからドン1レスト追加
  "OP08-068": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rested"}]},
  // OP08-069 シャーロット・リンリン(c9): 【登場時】ドン-1＋手札1枚捨て：デッキ上1枚をライフに→相手コスト6以下1枚を相手ライフに表向き
  "OP08-069": {"onPlay":[{"op":"donMinus","n":1},{"op":"discardCost","count":1,"optional":true,"then":[{"op":"lifeAddFromDeck","n":1},{"op":"charToLife","filter":{"maxCost":6},"faceUp":true,"optional":true}]}]},
  // OP08-070 タマゴ男爵: 【ブロッカー】 ／【KO時】ドン-1：手札からコスト5以下「ヒヨコ子爵」1枚を登場
  "OP08-070": {"onKO":[{"op":"donMinus","n":1},{"op":"playSpecificFromHand","name":"ヒヨコ子爵","filter":{"maxCost":5},"optional":true}]},
  // OP08-071 ニワトリ伯爵: 【相手のターン中】【KO時】ドン-1：デッキからコスト4以下「タマゴ男爵」1枚を登場しシャッフル
  "OP08-071": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"donMinus","n":1},{"op":"playFromDeck","look":"all","filter":{"nameIncludes":"タマゴ男爵","maxCost":4}}]}]},
  // OP08-073 ヒヨコ子爵: 【相手のターン中】【KO時】ドン-1：デッキからコスト6以下「ニワトリ伯爵」1枚を登場しシャッフル
  "OP08-073": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"donMinus","n":1},{"op":"playFromDeck","look":"all","filter":{"nameIncludes":"ニワトリ伯爵","maxCost":6}}]}]},
  // OP08-074 ブラックマリア: 【起動メイン】【ターン1回】他に「ブラックマリア」がいなければドン5レスト追加→ターン終了時、相手のドン枚数に合わせて自分のドンを戻す
  "OP08-074": {"act":{"label":"ドン5レスト追加(ターン終了時に調整)","cost":{},"fx":[{"op":"cond","check":{"noSelfChar":{"nameIncludes":"ブラックマリア"}},"then":[{"op":"donFromDeck","n":5,"mode":"rested"},{"op":"scheduleTurnEnd","fx":[{"op":"donReturnToMatchOpp"}]}]}]}},
  // OP08-075 キャンディメイデン: 【メイン】ドン-1：相手コスト2以下1枚をレスト→自分のライフをすべて裏向きに
  "OP08-075": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"flipAllLifeDown"}]}},
  // OP08-076 しぬほど…おいしい♡: 【メイン】ドン1アクティブ追加→相手にパワー6000以上がいればさらにドン1アクティブ追加
  "OP08-076": {"main":{"fx":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"cond","check":{"oppChar":{"minEffPower":6000}},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}},
  // OP08-077 覇海: 【メイン】ドン-2：百獣かビッグマムリーダーなら相手コスト6以下2枚KO
  "OP08-077": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"cond","check":{"or":[{"leaderTraitIncludes":"百獣海賊団"},{"leaderTraitIncludes":"ビッグ・マム海賊団"}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":6},"count":2,"optional":true}]}]}},
  // OP08-079 カイドウ(c9): 【起動メイン】【ターン1回】手札1枚捨て：登場ターンなら相手コスト7以下1枚KO→相手1枚捨て
  "OP08-079": {"act":{"label":"手札1捨て:登場ターンなら相手7以下をトラッシュ＋相手捨て","cost":{},"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"selfSummonedThisTurn":true},"then":[{"op":"trashChar","side":"opp","filter":{"maxCost":7},"count":1,"optional":true},{"op":"oppDiscard","n":1}]}]}]}},
  // OP08-080 クイーン(c1): 【登場時】デッキ上5枚から「クイーン」以外の百獣1枚を手札に
  "OP08-080": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"百獣海賊団"},"exclude":"クイーン","optional":true}]},
  // OP08-081 ゲルニカ: 【アタック時】トラッシュから『CP』3枚をデッキ下：相手のコスト0キャラ1枚KO
  "OP08-081": {"onAttack":[{"op":"trashToDeckCost","n":3,"filter":{"traitIncludes":"CP"},"then":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]},
  /* ===== OP08 バッチ5（黒・082-099＝百獣/コスト下げ） ===== */
  // OP08-082 ササキ: 【起動メイン】ドン1レスト＋自身レスト：相手キャラ1枚をコスト-2
  "OP08-082": {"act":{"label":"ドン1+自身レスト:相手コスト-2","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]}},
  // OP08-083 シープスヘッド: 【ドン×1】【自分のターン中】相手のキャラ全コスト-1
  "OP08-083": {"static":[{"op":"oppCostMod","amount":-1,"cond":{"and":[{"donX1":true},{"selfTurn":true}]}}]},
  // OP08-084 ジャック: このキャラのコスト+4 ／【起動メイン】レスト：1ドロー＋手札1枚捨て→相手コスト3以下1枚KO
  "OP08-084": {"static":[{"op":"staticCost","amount":4}],"act":{"label":"レスト:1ドロー1捨て→相手3以下KO","cost":{"restSelf":true},"fx":[{"op":"draw","n":1},{"op":"discardOwn","n":1},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}},
  // OP08-085 ジンベエ: 【ドン×1】【アタック時】自分にコスト8以上がいれば相手コスト4以下1枚KO
  "OP08-085": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"selfCharCount":{"filter":{"minCost":8},"min":1}}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // OP08-086 ジンラミー: 【登場時】相手にコスト0がいれば2ドロー＋手札2枚捨て
  "OP08-086": {"onPlay":[{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP08-087 スクラッチメン・アプー(c4): 【ブロッカー】 ／【起動メイン】【ターン1回】相手キャラ1枚をコスト-1
  "OP08-087": {"act":{"label":"相手キャラ1枚をコスト-1","cost":{},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]}},
  // OP08-088 デュバル: 【登場時】自分のキャラ1枚を次相手ターン終了までコスト+1
  "OP08-088": {"onPlay":[{"op":"addCostBuff","side":"self","count":1,"amount":1,"duration":"untilNextEnd","optional":true}]},
  // OP08-090 ハムレット: 【登場時】トラッシュからコスト2以下のSMILE1枚を登場
  "OP08-090": {"onPlay":[{"op":"reviveFromTrash","maxCost":2,"filter":{"traitIncludes":"SMILE"}}]},
  // OP08-091 フーズ・フー: 【登場時】手札1枚を捨てる：相手コスト3以下1枚KO
  "OP08-091": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP08-092 ページワン: 【登場時】トラッシュからコスト4以下「うるティ」1枚を登場
  "OP08-092": {"onPlay":[{"op":"reviveFromTrash","maxCost":4,"filter":{"nameIncludes":"うるティ"}}]},
  // OP08-093 X・ドレーク: 【ドン×1】このキャラのコスト+2
  "OP08-093": {"static":[{"op":"staticCost","amount":2,"cond":{"donX1":true}}]},
  // OP08-094 炎皇: 【メイン】/【カウンター】トラッシュ3枚をデッキ下：相手コスト2以下1枚KO
  "OP08-094": {"main":{"fx":[{"op":"trashToBottomCost","n":3,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"trashToBottomCost","n":3,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP08-095 鉄塊 牙閃: 【メイン】トラッシュ10枚以上なら自分のキャラ1枚を次相手ターン終了まで+2000
  "OP08-095": {"main":{"fx":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"powerMod","side":"self","amount":2000,"duration":"untilNextEnd","count":1,"optional":true}]}]}},
  // OP08-096 人の夢は!!!終わらねェ!!!!: 【カウンター】デッキ上1枚トラッシュ、コスト6以上ならリーダーかキャラ+5000
  "OP08-096": {"counter":{"cost":0,"fx":[{"op":"millBuff","minCost":6,"then":[{"op":"powerMod","side":"self","leader":true,"amount":5000,"battle":true,"count":1,"optional":true}]}]}},
  // OP08-097 ヘリケラトプス: 【メイン】百獣リーダーなら相手キャラ1枚をコスト-2→相手のコスト0キャラ1枚KO
  "OP08-097": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true},{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]}},
  // OP08-098 カルガラ LEADER: 【ドン×1】【アタック時】手札から自分のドン以下のコストのシャンドラの戦士1枚を登場→登場したらライフ上1枚を手札に
  "OP08-098": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"シャンドラの戦士","maxCostFrom":"don"},"count":1,"optional":true},{"op":"lifeToHand","n":1}]}]},
  /* ===== OP08 バッチ6（黄・100-119＝空島/シャンドラ/エッグヘッド） ===== */
  // OP08-100 サウスバード: 【登場時】デッキ上7枚から「アッパーヤード」を登場
  "OP08-100": {"onPlay":[{"op":"playFromDeck","look":7,"filter":{"nameIncludes":"アッパーヤード"}}]},
  // OP08-101 シャーロット・エンゼル: 【起動メイン】【ターン1回】ライフ上1枚をトラッシュ：ビッグマムリーダーなら ターン終了時デッキ上1枚をライフに
  "OP08-101": {"act":{"label":"ライフ1枚トラッシュ:ターン終了時ライフ補充","cost":{},"fx":[{"op":"lifeCost","action":"trash","then":[{"op":"cond","check":{"leaderTraitIncludes":"ビッグ・マム海賊団"},"then":[{"op":"scheduleTurnEnd","fx":[{"op":"lifeAddFromDeck","n":1}]}]}]}]}},
  // OP08-102 シャーロット・オペラ: 【登場時】手札1枚捨て：自分のライフ枚数以下のコストの相手キャラ1枚KO
  "OP08-102": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"casterLife"},"count":1,"optional":true}]}]},
  // OP08-103 シャーロット・カスタード: 【起動メイン】【ターン1回】ライフ上1枚を手札に：自分のキャラ1枚を次相手ターン終了まで+1000
  "OP08-103": {"act":{"label":"ライフ1枚手札:キャラ+1000","cost":{},"fx":[{"op":"lifeCost","then":[{"op":"powerMod","side":"self","amount":1000,"duration":"untilNextEnd","count":1,"optional":true}]}]}},
  // OP08-105 ジュエリー・ボニー: 【ドン×1】【自分のターン中】【ターン1回】相手のライフが離れた時、2ドロー＋手札1枚捨て
  "OP08-105": {"onOppLifeLeave":{"when":"selfTurn","once":"turn","fx":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}},
  // OP08-106 ナミ(エッグヘッド): 【登場時】手札の【トリガー】1枚を捨てる：相手コスト5以下1枚KO→手札3枚以下なら1ドロー
  "OP08-106": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"hasTrigger":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"cond","check":{"selfHandAtMost":3},"then":[{"op":"draw","n":1}]}]}]},
  // OP08-107 ニトロ: 【起動メイン】レスト：自分の「シャーロット・プリン」1枚を+2000
  "OP08-107": {"act":{"label":"レスト:プリン1枚+2000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"シャーロット・プリン"}}]}},
  // OP08-109 モンブラン・ノーランド: 【登場時】シャンドラリーダー＋自分の「カルガラ」がいれば デッキ上1枚をライフに
  "OP08-109": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"シャンドラの戦士"},{"selfChar":{"nameIncludes":"カルガラ"}}]},"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // OP08-110 ワイパー: 【登場時】デッキ上5枚から「アッパーヤード」1枚を手札に→手札から「アッパーヤード」1枚を登場
  "OP08-110": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"nameIncludes":"アッパーヤード"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"アッパーヤード","optional":true}]},
  // OP08-111 S-シャーク: 【ドン×1】【アタック時】相手はこのバトル中【ブロッカー】発動不可
  "OP08-111": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"denyBlocker","all":true}]}]},
  // OP08-112 S-スネーク: 【登場時】「ルフィ」以外の相手コスト6以下1枚は次相手ターン終了までアタック不可
  "OP08-112": {"onPlay":[{"op":"setAttackBan","filter":{"maxCost":6,"nameExcludes":"モンキー・D・ルフィ"},"count":1,"duration":"untilNextEnd","optional":true}]},
  // OP08-114 S-ホーク: 【ドン×1】自分のライフが相手より少ないと 斬とのバトルでKOされず+2000（近似:全バトル耐性）
  "OP08-114": {"static":[{"op":"condBuff","battleImmune":true,"power":2000,"cond":{"and":[{"donX1":true},{"selfLifeLessThanOpp":true}]}}]},
  // OP08-115 大地は敗けない!!!: 【カウンター】シャンドラリーダーなら リーダーかキャラ+3000→手札から「アッパーヤード」1枚を登場
  "OP08-115": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"シャンドラの戦士"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"playSpecificFromHand","nameIncludes":"アッパーヤード","optional":true}]}]}},
  // OP08-116 燃焼砲: 【カウンター】リーダーかキャラ+4000→ライフ上か下1枚を手札に：手札からシャンドラの戦士1枚をライフ上に表向きで加える
  "OP08-116": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"lifeCost","pos":"choose","then":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"シャンドラの戦士"}}]}]}},
  // OP08-117 燃焼剣: 【メイン】ライフ上1枚トラッシュ：相手コスト7以下1枚KO
  "OP08-117": {"main":{"fx":[{"op":"lifeCost","action":"trash","then":[{"op":"ko","side":"opp","filter":{"maxCost":7},"count":1,"optional":true}]}]}},
  // OP08-118 シルバーズ･レイリー(c8): 【登場時】相手2枚を-3000/-2000(次相手ターン終了まで)→相手のパワー3000以下1枚KO
  "OP08-118": {"onPlay":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"untilNextEnd","count":1,"optional":true},{"op":"powerMod","side":"opp","amount":-2000,"duration":"untilNextEnd","count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]},
  // OP08-119 カイドウ＆リンリン(c10): 【アタック時】ドン-10：このキャラ以外の全キャラKO→デッキ上1枚をライフに＋相手ライフ上1枚をトラッシュ
  "OP08-119": {"onAttack":[{"op":"donMinus","n":10},{"op":"koAllExceptSelf"},{"op":"lifeAddFromDeck","n":1},{"op":"lifeTrash","side":"opp"}]},
  /* ===== OP07（500年後の未来）バッチ1（赤・001-021＝革命軍/ゴア王国/エース） ===== */
  // OP07-001 モンキー・D・ドラゴン LEADER: 【起動メイン】【ターン1回】自分の付与ドン合計2枚までを自分のキャラ1枚に移す
  "OP07-001": {"act":{"label":"付与ドン2枚を1キャラに移す","cost":{},"fx":[{"op":"moveAttachedDon","n":2}]}},
  // OP07-002 アイン: 【登場時】相手キャラ1枚をこのターン中パワー0
  "OP07-002": {"onPlay":[{"op":"setPower","side":"opp","value":0,"count":1,"optional":true}]},
  // OP07-003 アウトルック3世: 【起動メイン】自身トラッシュ：相手キャラ2枚を-2000
  "OP07-003": {"act":{"label":"自身トラッシュ:相手2枚-2000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]}]}},
  // OP07-004 カーリー・ダダン: 【登場時】手札1枚捨て：デッキ上5枚からパワー2000以下のキャラ1枚を手札に
  "OP07-004": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"search","look":5,"count":1,"filter":{"type":"CHAR","maxPower":2000},"optional":true}]}]},
  // OP07-005 カリーナ: 【ブロッカー】 ／【登場時】相手キャラ1枚を-2000
  "OP07-005": {"onPlay":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  // OP07-006 ステリー: 【登場時】自分のアクティブのリーダーを-5000：1ドロー＋手札1枚捨て
  "OP07-006": {"onPlay":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP07-009 ドグラ＆マグラ: 【登場時】自分のコスト1の赤キャラ1枚に【ダブルアタック】
  "OP07-009": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"cost":1,"color":"赤"}}]},
  // OP07-010 バカラ: 【ブロッカー】 ／【相手のアタック時】【ターン1回】手札1枚捨て：リーダーかキャラ+2000
  "OP07-010": {"onOppAttack":[{"op":"discardCost","count":1,"optional":true,"once":"turn","then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]},
  // OP07-011 ブルージャム: 【ドン×1】【アタック時】相手のパワー2000以下1枚KO
  "OP07-011": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}]},
  // OP07-012 ポルシェーミ: 【登場時】相手キャラ1枚を-1000
  "OP07-012": {"onPlay":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]},
  // OP07-013 マスクド・デュース: 【登場時】エースリーダーなら デッキ上5枚から「エース」か赤イベント1枚を手札に
  "OP07-013": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ポートガス・D・エース"},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"nameIncludes":"ポートガス・D・エース"},{"color":"赤","type":"EVENT"}]},"optional":true}]}]},
  // OP07-014 モーダ: 【自分のターン中】【登場時】自分の「エース」1枚を+2000
  "OP07-014": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"ポートガス・D・エース"}}]},
  // OP07-015 モンキー・D・ドラゴン(c8): 【速攻】 ／【登場時】リーダーかキャラ1枚にレストのドン2付与
  "OP07-015": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":2}]},
  // OP07-016 銀河・WINK: 【メイン】革命軍1枚を+2000→相手キャラ1枚を-1000
  "OP07-016": {"main":{"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"革命軍"}},{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}},
  // OP07-017 竜の息吹: 【メイン】相手のパワー3000以下1枚＋コスト1以下のステージ1枚をKO
  "OP07-017": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true},{"op":"koStage","filter":{"maxCost":1},"optional":true}]}},
  // OP07-018 KEEP OUT: 【カウンター】革命軍1枚を次の自分のターン終了まで+2000(近似:untilNextEnd)
  "OP07-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"untilNextEnd","count":1,"optional":true,"filter":{"traitIncludes":"革命軍"}}]}},
  // OP07-020 アラディン: 【ブロッカー】 ／【KO時】魚人族リーダーなら手札からコスト3以下の魚人/人魚1枚を登場
  "OP07-020": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"魚人族"},"then":[{"op":"playCharFromHand","filter":{"maxCost":3,"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"count":1,"optional":true}]}]},
  // OP07-021 ウルージ: 【ブロッカー】 ／【自分のターン終了時】ドン1アクティブ
  "OP07-021": {"onTurnEnd":[{"op":"donActivate","n":1}]},
  /* ===== OP07 バッチ2（緑・022-041＝超新星/魚人族/ワノ国） ===== */
  // OP07-022 お玉: 【登場時】デッキ上5枚から「お玉」以外の緑ワノ国1枚を手札に
  "OP07-022": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"緑","traitIncludes":"ワノ国"},"exclude":"お玉","optional":true}]},
  // OP07-023 カリブー: レストのドン6枚以上で+1000 ／【ブロッカー】
  "OP07-023": {"static":[{"op":"condBuff","cond":{"restedDonAtLeast":6},"power":1000}]},
  // OP07-024 コアラ: 【相手のアタック時】このキャラをレスト：コスト5以下の魚人族1枚に【ブロッカー】
  "OP07-024": {"onOppAttack":[{"op":"restSelfCost","then":[{"op":"giveKeyword","target":"chooseOwn","kw":"blocker","duration":"turn","filter":{"traitIncludes":"魚人族","maxCost":5}}]}]},
  // OP07-025 コリブー(c3): 【登場時】手札からコスト4以下「カリブー」1枚をレストで登場
  "OP07-025": {"onPlay":[{"op":"playSpecificFromHand","nameIncludes":"カリブー","filter":{"maxCost":4},"rested":true,"optional":true}]},
  // OP07-026 ジュエリー・ボニー(c5): 【登場時】相手のレストのキャラ1枚を次リフレッシュロック
  "OP07-026": {"onPlay":[{"op":"lockRefresh","count":1,"optional":true}]},
  // OP07-029 バジル・ホーキンス: 超新星リーダーで【ブロッカー】 ／【ターン1回】相手効果で離れる場合、代わりに相手キャラ1枚をレスト
  "OP07-029": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderTraitIncludes":"超新星"}},{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"restOpp"}]},
  // OP07-030 パッパグ: 自分の「ケイミー」がいれば【ブロッカー】を得る
  "OP07-030": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfChar":{"nameIncludes":"ケイミー"}}}]},
  // OP07-031 バルトロメオ(c3): 【ブロッカー】 ／【自分のターン中】【ターン1回】キャラが自分の効果でレストになった時、1ドロー＋手札1枚捨て
  "OP07-031": {"onOwnRest":{"when":"selfTurn","once":"turn","fx":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}},
  // OP07-032 フィッシャー・タイガー: 登場ターンにキャラへアタック可(速攻:キャラ) ／【登場時】魚人/人魚リーダーなら相手コスト6以下1枚レスト
  "OP07-032": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"魚人族"},{"leaderTraitIncludes":"人魚族"}]},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]}]},
  // OP07-033 モンキー・D・ルフィ(c5): 自分のキャラ3枚以上なら「ルフィ」以外のコスト3以下キャラは相手効果でKOされない
  "OP07-033": {"static":[{"op":"allyKoImmune","cond":{"selfCharCount":{"min":3}},"filter":{"maxBaseCost":3,"nameExcludes":"モンキー・D・ルフィ"}}]},
  // OP07-034 ロロノア・ゾロ(c1): 【アタック時】自分のキャラ3枚以上なら このキャラ+2000
  "OP07-034": {"onAttack":[{"op":"cond","check":{"selfCharCount":{"min":3}},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}]},
  // OP07-035 因果晒し: 【カウンター】リーダーかキャラ+2000→自分のキャラ3枚以上ならさらに+1000
  "OP07-035": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"selfCharCount":{"min":3}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}]}},
  // OP07-036 鬼気 九刀流 阿修羅 魔九閃: 【メイン】リーダーかキャラ+3000→コスト3以上の自キャラ1枚をレスト：相手コスト5以下1枚をレスト
  "OP07-036": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true},{"op":"restOwnAsCost","filter":{"minCost":3},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}},
  // OP07-037 ピザお～か～わ～り～!!!: 【メイン】デッキ上5枚から「自身」以外の超新星1枚を手札に
  "OP07-037": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星"},"exclude":"ピザお～か～わ～り～!!!","optional":true}]}},
  // OP07-039 エドワード・ウィーブル(c4): 【ドン×1】【アタック時】デッキ上3枚を並び替え
  "OP07-039": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"scry","look":3}]}]},
  // OP07-040 クロコダイル(c4): 【登場時】ドン1レスト：コスト2以下1枚を手札に戻す
  "OP07-040": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"bounce","side":"opp","maxCost":2,"count":1,"optional":true}]}]},
  // OP07-041 グロリオーサ(ニョン婆): 【登場時】デッキ上5枚から「自身」以外のアマゾン・リリーか九蛇1枚を手札に
  "OP07-041": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"exclude":"グロリオーサ(ニョン婆)","optional":true}]},
  /* ===== OP07 バッチ3（青・042-061＝王下七武海/九蛇/フォクシー） ===== */
  // OP07-042 ゲッコー・モリア: 【ターン1回】王下七武海リーダーで相手効果で離れる場合、代わりに「モリア以外」のキャラ1枚をデッキ下
  "OP07-042": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"deckBottomOther","cond":{"leaderTraitIncludes":"王下七武海"},"filter":{"nameExcludes":"ゲッコー・モリア"}}]},
  // OP07-043 サロメ: 【自分のターン中】【登場時】自分の「ボア・ハンコック」1枚を+2000
  "OP07-043": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"ボア・ハンコック"}}]},
  // OP07-045 ジンベエ(c4): 【登場時】手札から「ジンベエ」以外のコスト4以下の王下七武海1枚を登場
  "OP07-045": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"王下七武海","maxCost":4,"nameExcludes":"ジンベエ"},"count":1,"optional":true}]},
  // OP07-046 センゴク(c1): 【登場時】デッキ上5枚から王下七武海1枚を手札に
  "OP07-046": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"王下七武海"},"optional":true}]},
  // OP07-047 トラファルガー・ロー(c4): 【起動メイン】このキャラを手札に戻す：相手手札6枚以上なら相手は手札1枚をデッキ下
  "OP07-047": {"act":{"label":"自身を手札へ:相手手札6以上で1枚デッキ下","cost":{},"fx":[{"op":"bounceSelfCost","then":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppHandToBottom","n":1}]}]}]}},
  // OP07-048 ドンキホーテ・ドフラミンゴ(c3): 【起動メイン】【ターン1回】ドン2レスト：デッキ上1枚を公開、コスト4以下の王下七武海ならレストで登場
  "OP07-048": {"act":{"label":"ドン2レスト:デッキ上から王下七武海をレスト登場","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"playFromDeck","look":1,"rested":true,"filter":{"traitIncludes":"王下七武海","maxCost":4}}]}]}},
  // OP07-049 バッキン(c2): 【登場時】手札からコスト4以下「エドワード・ウィーブル」1枚をレストで登場
  "OP07-049": {"onPlay":[{"op":"playSpecificFromHand","nameIncludes":"エドワード・ウィーブル","filter":{"maxCost":4},"rested":true,"optional":true}]},
  // OP07-050 ボア・サンダーソニア: 【登場時】アマゾン/九蛇が2枚以上なら相手コスト3以下1枚を手札に戻す
  "OP07-050": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"min":2}},"then":[{"op":"bounce","side":"opp","maxCost":3,"count":1,"optional":true}]}]},
  // OP07-051 ボア・ハンコック(c6): 【登場時】「ルフィ」以外の相手1枚は次相手ターン終了までアタック不可→コスト1以下1枚をデッキ下
  "OP07-051": {"onPlay":[{"op":"setAttackBan","filter":{"nameExcludes":"モンキー・D・ルフィ"},"count":1,"duration":"untilNextEnd","optional":true},{"op":"deckBottom","side":"any","filter":{"maxCost":1},"count":1,"optional":true}]},
  // OP07-052 ボア・マリーゴールド: 【登場時】アマゾン/九蛇が2枚以上ならコスト2以下1枚をデッキ下
  "OP07-052": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"min":2}},"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP07-053 ポートガス・D・エース(c5): 【ブロッカー】 ／【登場時】2ドロー→手札2枚をデッキの上か下へ
  "OP07-053": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2}]},
  // OP07-055 蛇ダンス: 【カウンター】リーダーかキャラ+4000→自分のキャラ1枚を手札に戻す
  "OP07-055": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"bounceOwnCharCost"}]}},
  // OP07-056 虜の矢: 【カウンター】コスト2以上の自キャラ1枚を手札に戻す：リーダーかキャラ+4000
  "OP07-056": {"counter":{"cost":0,"fx":[{"op":"bounceOwnCharCost","filter":{"minCost":2},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  // OP07-058 女ヶ島(STAGE): 【起動メイン】手札1枚捨て＋レスト：九蛇リーダーなら自分のアマゾン/九蛇キャラ1枚を手札に戻す
  "OP07-058": {"act":{"label":"手札1捨て+レスト:アマゾン/九蛇を手札に","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"九蛇海賊団"},"then":[{"op":"bounceOwnCharCost","filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]}}]}]}]}},
  // OP07-059 フォクシー LEADER: 【アタック時】ドン-3：フォクシーが3枚以上なら相手のレストのリーダーとキャラ1枚を次リフレッシュロック
  "OP07-059": {"onAttack":[{"op":"donMinus","n":3},{"op":"cond","check":{"selfCharCount":{"filter":{"traitIncludes":"フォクシー海賊団"},"min":3}},"then":[{"op":"lockRefresh","count":1,"includeLeader":true,"optional":true}]}]},
  // OP07-060 イトミミズ: 【起動メイン】【ターン1回】フォクシーリーダーで他に「イトミミズ」がいなければドンデッキからドン1レスト追加
  "OP07-060": {"act":{"label":"フォクシー:ドン1レスト追加","cost":{},"fx":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"フォクシー海賊団"},{"not":{"selfCharOther":{"filter":{"nameIncludes":"イトミミズ"}}}}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // OP07-061 ヴィンスモーク・サンジ(c1): 【登場時】ドン-1：ヴィンスモーク家リーダーなら1ドロー
  "OP07-061": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"ヴィンスモーク家"},"then":[{"op":"draw","n":1}]}]},
  /* ===== OP07 バッチ4（紫・062-081＝フォクシー海賊団 ドン劣勢シナジー） ===== */
  // OP07-062 ヴィンスモーク・レイジュ(c1): 【登場時】ドンが相手以下なら自分のコスト1のヴィンスモーク家1枚を手札に戻す
  "OP07-062": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"bounceOwnCharCost","filter":{"cost":1,"traitIncludes":"ヴィンスモーク家"},"excludeSelf":true}]}]},
  // OP07-063 カポーティ: 【登場時】ドン-1：フォクシーリーダーなら相手コスト6以下1枚は次相手ターン終了までアタック不可
  "OP07-063": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"フォクシー海賊団"},"then":[{"op":"setAttackBan","filter":{"maxCost":6},"count":1,"duration":"untilNextEnd","optional":true}]}]},
  // OP07-064 サンジ(c6): ドンが相手より2枚以上少ないとコスト-3 ／【ブロッカー】
  "OP07-064": {"costMod":{"cond":{"selfDonFewerBy":2},"amount":-3},"static":[{"op":"staticKeyword","kw":"blocker"}]},
  // OP07-065 ジーナ: 【登場時】フォクシーリーダー＋ドンが相手以下ならドン1アクティブ追加
  "OP07-065": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"フォクシー海賊団"},{"donLEOpp":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP07-066 トニートニー・チョッパー(c2): 【ブロッカー】 ／【登場時】ドンが相手以下ならドン1レスト追加
  "OP07-066": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP07-068 ハンバーグ: 【ドン×1】【アタック時】ドンが相手以下ならドン1レスト追加
  "OP07-068": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"donLEOpp":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP07-069 ピクルス: ドンが相手以下なら「ピクルス」以外のフォクシーは相手効果でKOされない
  "OP07-069": {"static":[{"op":"allyKoImmune","cond":{"donLEOpp":true},"filter":{"traitIncludes":"フォクシー海賊団","nameExcludes":"ピクルス"}}]},
  // OP07-070 ビッグパン: 【登場時】ドンが相手以下なら手札からコスト4以下のフォクシー1枚を登場
  "OP07-070": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"フォクシー海賊団","maxCost":4},"count":1,"optional":true}]}]},
  // OP07-071 フォクシー(c7): 【相手のターン中】フォクシーリーダーなら相手キャラ全-1000 ／【起動メイン】【ターン1回】ドン1レスト追加
  "OP07-071": {"static":[{"op":"oppStaticPowerMod","power":-1000,"cond":{"and":[{"oppTurn":true},{"leaderTraitIncludes":"フォクシー海賊団"}]}}],"act":{"label":"ドン1レスト追加","cost":{},"fx":[{"op":"donFromDeck","n":1,"mode":"rested"}]}},
  // OP07-072 ポルチェ: 【登場時】ドン-1：デッキ上5枚からフォクシー1枚を手札に→手札からパワー4000以下の紫キャラ1枚を登場
  "OP07-072": {"onPlay":[{"op":"donMinus","n":1},{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"フォクシー海賊団"},"optional":true},{"op":"playCharFromHand","filter":{"color":"紫","maxPower":4000},"count":1,"optional":true}]},
  // OP07-073 モンキー・D・ルフィ(c6): 【起動メイン】【ターン1回】ドン-3：相手キャラ3枚以上ならこのキャラをアクティブ
  "OP07-073": {"act":{"label":"ドン-3:相手3枚以上で自身アクティブ","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"cond","check":{"oppChar":{"min":3}},"then":[{"op":"activateSelf"}]}]}},
  // OP07-074 モンダ: 【起動メイン】自身トラッシュ：フォクシーリーダーならドン1レスト追加
  "OP07-074": {"act":{"label":"自身トラッシュ:フォクシーでドン1レスト追加","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"フォクシー海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]}},
  // OP07-075 ノロノロビ～～～～ム: 【カウンター】ドン-1：相手のリーダーかキャラ1枚を-2000
  "OP07-075": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"leaderBuff","side":"opp","amount":-2000,"duration":"turn"},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}},
  // OP07-076 ノロノロビームソード: 【カウンター】ドン-1：リーダーかキャラ+2000→相手キャラ1枚をレスト
  "OP07-076": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"restChar","side":"opp","count":1,"optional":true}]}},
  // OP07-077 “ひとつなぎの大秘宝”を獲りに行くぞ!!!: 【メイン】百獣かビッグマムリーダーなら デッキ上5枚から百獣/ビッグマム1枚を手札に
  "OP07-077": {"main":{"fx":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"百獣海賊団"},{"leaderTraitIncludes":"ビッグ・マム海賊団"}]},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"百獣海賊団"},{"traitIncludes":"ビッグ・マム海賊団"}]},"optional":true}]}]}},
  // OP07-078 メガトン九尾ラッシュ: 【メイン】ドンが相手以下なら自分の「フォクシー」1枚をアクティブ
  "OP07-078": {"main":{"fx":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"nameIncludes":"フォクシー"}}]}]}},
  // OP07-080 カク: 【登場時】トラッシュから『CP』2枚をデッキ下：相手キャラ1枚をコスト-3
  "OP07-080": {"onPlay":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"CP"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]},
  // OP07-081 カリファ: 【ドン×1】【自分のターン中】相手のキャラ全コスト-1
  "OP07-081": {"static":[{"op":"oppCostMod","amount":-1,"cond":{"and":[{"donX1":true},{"selfTurn":true}]}}]},
  /* ===== OP07 バッチ5（黒・082-099＝CP0/CP9/科学者） ===== */
  // OP07-082 キャプテン・ジョン: 【登場時】デッキ上2枚トラッシュ＋相手キャラ1枚をコスト-1
  "OP07-082": {"onPlay":[{"op":"deckToTrash","n":2},{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]},
  // OP07-083 ゲッコー・モリア(c4): 【起動メイン】トラッシュのスリラーバーク4枚をデッキ下：このターン【バニッシュ】＋1000
  "OP07-083": {"act":{"label":"スリラーバーク4枚デッキ下:バニッシュ＋1000","cost":{},"fx":[{"op":"trashToBottomCost","n":4,"filter":{"traitIncludes":"スリラーバーク海賊団"},"then":[{"op":"giveKeyword","target":"self","kw":"banish","duration":"turn"},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]}},
  // OP07-085 ステューシー(c9): 【登場時】自分のキャラ1枚をトラッシュ：相手キャラ1枚KO
  "OP07-085": {"onPlay":[{"op":"trashOwnCharCost","then":[{"op":"ko","side":"opp","count":1,"optional":true}]}]},
  // OP07-086 スパンダム: 【登場時】デッキ上2枚トラッシュ＋相手キャラ1枚をコスト-2
  "OP07-086": {"onPlay":[{"op":"deckToTrash","n":2},{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]},
  // OP07-087 バスカビル: 【自分のターン中】相手にコスト0がいれば+3000
  "OP07-087": {"static":[{"op":"condBuff","cond":{"and":[{"selfTurn":true},{"oppChar":{"cost":0}}]},"power":3000}]},
  // OP07-088 ハットリ: 【自分のターン中】【登場時】自分の「ロブ・ルッチ」1枚を+2000
  "OP07-088": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"ロブ・ルッチ"}}]},
  // OP07-090 モルガンズ: 【登場時】相手は手札1枚捨て(公開)→相手は1ドロー
  "OP07-090": {"onPlay":[{"op":"oppDiscard","n":1},{"op":"oppDraw","n":1}]},
  // OP07-091 モンキー・D・ルフィ(c5): 【アタック時】相手コスト2以下1枚KO→トラッシュのコスト4以上を3枚デッキ下で+1000(近似)
  "OP07-091": {"onAttack":[{"op":"trashChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"trashToBottomCost","n":3,"filter":{"minCost":4,"type":"CHAR"},"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  // OP07-092 ヨセフ: 【登場時】トラッシュの『CP』2枚をデッキ下：相手コスト1以下1枚KO
  "OP07-092": {"onPlay":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"CP"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP07-093 ロブ・ルッチ(c5): 【登場時】トラッシュ3枚をデッキ下：相手1枚捨て→相手トラッシュ1枚をデッキ下
  "OP07-093": {"onPlay":[{"op":"trashToBottomCost","n":3,"then":[{"op":"oppDiscard","n":1},{"op":"oppTrashToBottom","n":1}]}]},
  // OP07-094 剃: 【カウンター】リーダーかキャラ+2000→トラッシュ10枚以上なら『CP』キャラ1枚を手札に戻す
  "OP07-094": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"bounceOwnCharCost","filter":{"traitIncludes":"CP"}}]}]}},
  // OP07-095 鉄塊: 【カウンター】リーダーかキャラ+4000→トラッシュ10枚以上ならさらに+2000
  "OP07-095": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP07-096 嵐脚: 【メイン】1ドロー→トラッシュ10枚以上なら相手キャラ1枚をコスト-3
  "OP07-096": {"main":{"fx":[{"op":"draw","n":1},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]}},
  // OP07-097 ベガパンク LEADER: このリーダーはアタック不可 ／【起動メイン】【ターン1回】ドン1レスト：手札からコスト5以下エッグヘッドをライフ表向きか登場
  "OP07-097": {"static":[{"op":"cantAttack"}],"act":{"label":"ドン1レスト:エッグヘッドをライフか登場","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"chooseOption","options":[{"label":"ライフ上に表向きで加える","fx":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"エッグヘッド","maxCost":5}}]},{"label":"登場させる","fx":[{"op":"playCharFromHand","filter":{"traitIncludes":"エッグヘッド","maxCost":5},"count":1,"optional":true}]}]}]}]}},
  // OP07-098 アトラス: 自分のライフが相手より少ないとバトルでKOされない
  "OP07-098": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"selfLifeLessThanOpp":true}}]},
  /* ===== OP07 バッチ6（黄・100-119＝エッグヘッド/ライフ管理） ===== */
  // OP07-100 エジソン: 【登場時】自ライフ2枚以下なら2ドロー＋手札2枚捨て
  "OP07-100": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP07-105 ピタゴラス: 【KO時】自ライフ2枚以下ならトラッシュからコスト4以下のエッグヘッドをレストで登場
  "OP07-105": {"onKO":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"エッグヘッド"}}]}]},
  // OP07-106 フザ: 【ドン×1】【アタック時】自ライフ1枚以下なら相手コスト3以下1枚KO
  "OP07-106": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"lifeAtMost":1}]},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP07-109 モンキー・D・ルフィ(c5): 【起動メイン】自身トラッシュ：自ライフ2枚以下なら相手コスト4以下1枚KO→1ドロー
  "OP07-109": {"act":{"label":"自身トラッシュ:ライフ2以下で相手4以下KO＋1ドロー","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true},{"op":"draw","n":1}]}]}]}},
  // OP07-110 ヨーク: 【登場時】ライフ上か下1枚を手札に：相手コスト2以下1枚KO
  "OP07-110": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP07-111 リリス: 【登場時】デッキ上5枚から「リリス」以外のエッグヘッド1枚を手札に
  "OP07-111": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"エッグヘッド"},"exclude":"リリス","optional":true}]},
  // OP07-112 ルーシー(c6): 【アタック時】【ターン1回】ライフ上か下1枚を手札に：相手コスト4以下1枚レスト→自ライフ1枚以下ならデッキ上1枚をライフに
  "OP07-112": {"onAttack":[{"op":"lifeCost","pos":"choose","once":"turn","then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"lifeAddFromDeck","n":1}]}]}]},
  // OP07-114 世界最大の頭脳を持つ男: 【メイン】デッキ上5枚から「自身」以外のエッグヘッド1枚を手札に
  "OP07-114": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"エッグヘッド"},"exclude":"世界最大の頭脳を持つ男","optional":true}]}},
  // OP07-116 焔裂き: 【メイン】/【カウンター】リーダーかキャラ+1000→相手ライフ2枚以下なら相手コスト4以下1枚レスト
  "OP07-116": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP07-117 エッグヘッド(STAGE): 【自分のターン終了時】自ライフ3枚以下ならコスト5以下のエッグヘッド1枚をアクティブ
  "OP07-117": {"onTurnEnd":[{"op":"cond","check":{"lifeAtMost":3},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":5,"traitIncludes":"エッグヘッド"}}]}]},
  // OP07-118 サボ(c8): 【登場時】手札1枚捨て：相手コスト5以下1枚＋コスト3以下1枚KO
  "OP07-118": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP07-119 ポートガス・D・エース(c10): 【登場時】デッキ上1枚をライフに→自ライフ2枚以下ならこのターン【速攻】
  "OP07-119": {"onPlay":[{"op":"lifeAddFromDeck","n":1},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  /* ===== OP06（ツインズ/双子の運命）バッチ1（赤FILM/革命軍・緑魚人族/新魚人） ===== */
  // OP06-002 イナズマ: パワー7000以上で【バニッシュ】
  "OP06-002": {"static":[{"op":"staticKeyword","kw":"banish","cond":{"selfPowerAtLeast":7000}}]},
  // OP06-003 エンポリオ・イワンコフ: 【登場時】デッキ上3枚からパワー5000以下の革命軍を登場
  "OP06-003": {"onPlay":[{"op":"playFromDeck","look":3,"filter":{"traitIncludes":"革命軍","maxPower":5000}}]},
  // OP06-004 オマツリ男爵: 【登場時】手札から「リリーカーネーション」1枚を登場
  "OP06-004": {"onPlay":[{"op":"playSpecificFromHand","name":"リリーカーネーション","optional":true}]},
  // OP06-006 サガ: 【ドン×1】【アタック時】次の自分ターン開始まで+1000→ターン終了時、自分のFILM1枚をトラッシュ
  "OP06-006": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"untilNextStart"},{"op":"scheduleTurnEnd","fx":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"FILM"}}]}]}]},
  // OP06-007 シャンクス(c10): 【登場時】相手のパワー10000以下1枚KO
  "OP06-007": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":10000},"count":1,"optional":true}]},
  // OP06-010 ダグラス・バレット: FILMリーダーで【ブロッカー】を得る
  "OP06-010": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderTraitIncludes":"FILM"}}]},
  // OP06-011 トットムジカ: 【起動メイン】【ターン1回】自分の「ウタ」1枚をレスト：このキャラ+5000
  "OP06-011": {"act":{"label":"ウタをレスト:このキャラ+5000","cost":{},"fx":[{"op":"restOwnAsCost","filter":{"nameIncludes":"ウタ"},"then":[{"op":"powerMod","side":"self","target":"self","amount":5000,"duration":"turn"}]}]}},
  // OP06-012 ベアキング: 相手に元々パワー6000以上のリーダーかキャラがいるとバトルでKOされない
  "OP06-012": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"oppChar":{"minPower":6000}}}]},
  // OP06-013 モンキー・D・ルフィ(c2): 【登場時】デッキ上3枚からFILM1枚を手札に
  "OP06-013": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"FILM"},"optional":true}]},
  // OP06-014 ラチェット: 【相手のアタック時】FILMを捨て、1枚ごとリーダーかキャラ+1000(近似:最大1枚)
  "OP06-014": {"onOppAttack":[{"op":"discardCost","count":1,"optional":true,"filter":{"traitIncludes":"FILM"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}]},
  // OP06-015 リリーカーネーション: 【起動メイン】【ターン1回】パワー6000以上の自キャラをトラッシュ：トラッシュのパワー2000-5000のFILMをレストで登場
  "OP06-015": {"act":{"label":"パワー6000以上をトラッシュ:FILMをレスト登場","cost":{},"fx":[{"op":"trashOwnCharCost","filter":{"minEffPower":6000},"then":[{"op":"reviveFromTrash","rested":true,"filter":{"traitIncludes":"FILM","minPower":2000,"maxPower":5000}}]}]}},
  // OP06-016 レイズ・マックス: 【起動メイン】このキャラをデッキ下：相手キャラ1枚を-3000
  "OP06-016": {"act":{"label":"自身をデッキ下:相手-3000","cost":{},"fx":[{"op":"selfToBottomCost","then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP06-017 恋のメテオストライク: 【メイン】/【カウンター】ライフ1枚を手札に：リーダーかキャラ+3000
  "OP06-017": {"main":{"fx":[{"op":"lifeCost","then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"lifeCost","then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP06-018 ゴムゴムの大猿王銃乱打: 【メイン】リーダーかキャラ+3000→相手にパワー7000以上がいればさらに+1000
  "OP06-018": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"oppChar":{"minEffPower":7000}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP06-019 青龍印 流水: 【メイン】相手のパワー5000以下1枚KO
  "OP06-019": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":5000},"count":1,"optional":true}]}},
  // OP06-020 ホーディ・ジョーンズ LEADER: 【起動メイン】レスト：相手のコスト3以下キャラ1枚をレスト→このターン効果でライフを手札に加えられない
  "OP06-020": {"act":{"label":"レスト:相手3以下レスト(ライフ手札不可)","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true},{"op":"setNoLifeToHand"}]}},
  // OP06-022 ヤマト LEADER: 【ダブルアタック】 ／【起動メイン】【ターン1回】相手ライフ3枚以下なら自キャラ1枚にレストのドン2付与
  "OP06-022": {"act":{"label":"相手ライフ3以下:キャラにレストのドン2付与","cost":{},"fx":[{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]}},
  // OP06-023 アーロン: 【登場時】手札1枚捨て：相手のレストのリーダーは次相手ターン終了までアタック不可
  "OP06-023": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"setAttackBan","leaderOnly":true,"restedOnly":true,"duration":"untilNextEnd"}]}]},
  // OP06-024 イカロス・ムッヒ: 【登場時】新魚人リーダーなら手札からコスト4以下の魚人族を登場→ライフ上1枚を手札に
  "OP06-024": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"新魚人海賊団"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"魚人族","maxCost":4},"count":1,"optional":true},{"op":"lifeToHand","n":1}]}]},
  // OP06-025 ケイミー: 【登場時】デッキ上4枚から「ケイミー」以外の魚人/人魚1枚を手札に
  "OP06-025": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"exclude":"ケイミー","optional":true}]},
  // OP06-026 コウシロウ: 【登場時】コスト4以下の属性(斬)1枚をアクティブ→このターンリーダーにアタック不可
  "OP06-026": {"onPlay":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":4,"attr":"斬"}},{"op":"setCantAttackLeader"}]},
  // OP06-027 ジャイロ: 【KO時】相手コスト3以下1枚をレスト
  "OP06-027": {"onKO":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},
  // OP06-028 ゼオ: 【ドン×1】【アタック時】新魚人リーダーならドン1アクティブ＋このキャラ+1000→ライフ上1枚を手札に
  "OP06-028": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"leaderTraitIncludes":"新魚人海賊団"}]},"then":[{"op":"donActivate","n":1},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"},{"op":"lifeToHand","n":1}]}]},
  // OP06-029 ダルマ: 【ドン×1】【アタック時】【ターン1回】新魚人リーダーならこのキャラをアクティブ＋1000→ライフ上1枚を手札に
  "OP06-029": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"leaderTraitIncludes":"新魚人海賊団"}]},"once":"turn","then":[{"op":"activateSelf"},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"},{"op":"lifeToHand","n":1}]}]},
  // OP06-030 ドスン: 【アタック時】新魚人リーダーなら次の自分ターン開始までバトルKO耐性＋2000→ライフ上1枚を手札に
  "OP06-030": {"onAttack":[{"op":"cond","check":{"leaderTraitIncludes":"新魚人海賊団"},"then":[{"op":"grantBattleImmune","target":"self","amount":2000,"duration":"untilNextStart"},{"op":"lifeToHand","n":1}]}]},
  // OP06-033 バンダー・デッケン九世: 【登場時】魚人族1枚を捨てる：相手のレストのキャラ1枚KO
  "OP06-033": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"traitIncludes":"魚人族"},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true},"count":1,"optional":true}]}]},
  // OP06-034 ヒョウゾウ: 【起動メイン】【ターン1回】相手コスト4以下1枚をレスト＋このキャラ+1000→ライフ上1枚を手札に
  "OP06-034": {"act":{"label":"相手4以下レスト＋自身+1000→ライフ手札","cost":{},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"},{"op":"lifeToHand","n":1}]}},
  // OP06-035 ホーディ・ジョーンズ(c7): 【速攻】 ／【登場時】相手のキャラかドン合計2枚をレスト→ライフ上1枚を手札に
  "OP06-035": {"onPlay":[{"op":"restChar","side":"opp","count":2,"optional":true},{"op":"lifeToHand","n":1}]},
  // OP06-036 リューマ(c4): 【登場時】/【KO時】相手のレストのコスト4以下1枚KO
  "OP06-036": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":1,"optional":true}],"onKO":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":1,"optional":true}]},
  // OP06-038 一大・三千・大千・世界: 【カウンター】リーダーかキャラ+2000→レストのカード8枚以上ならさらに+2000
  "OP06-038": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"restedCardsAtLeast":8},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP06-039 お前じゃ退屈凌ぎにもなりゃしねェ!!!: 【メイン】相手コスト6以下1枚レスト か 相手のレストのコスト6以下1枚KO
  "OP06-039": {"main":{"fx":[{"op":"chooseOption","options":[{"label":"相手コスト6以下1枚をレスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]},{"label":"相手のレストのコスト6以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":6},"count":1,"optional":true}]}]}]}},
  // OP06-040 矢武鮫: 【メイン】相手のレストのコスト3以下2枚KO
  "OP06-040": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":2,"optional":true}]}},
  // OP06-041 方舟ノア(STAGE): 【登場時】相手のキャラすべてをレスト
  "OP06-041": {"onPlay":[{"op":"restChar","side":"opp","all":true}]},
  /* ===== OP06 バッチ2（青海軍・紫ジェルマ66・黒スリラーバーク・黄ワノ国/空島） ===== */
  // OP06-042 ヴィンスモーク・レイジュ LEADER: 【ターン1回】自分のドンが戻された時1ドロー
  "OP06-042": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"draw","n":1}]}]},
  // OP06-043 アラマキ: 【ブロッカー】 ／【起動メイン】【ターン1回】手札1捨て＋コスト2以下1枚をデッキ下：このキャラ+3000
  "OP06-043": {"act":{"label":"手札1捨て＋コスト2以下デッキ下:+3000","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true},{"op":"powerMod","side":"self","target":"self","amount":3000,"duration":"turn"}]}]}},
  // OP06-044 ギオン: 【自分のターン中】【ターン1回】相手がイベント発動時、相手は手札1枚をデッキ下
  "OP06-044": {"onOppEvent":{"when":"selfTurn","once":"turn","fx":[{"op":"oppHandToBottom","n":1}]}},
  // OP06-045 クザン(c3): 【登場時】2ドロー→手札2枚をデッキの上か下へ
  "OP06-045": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2}]},
  // OP06-046 サカズキ(c5): 【登場時】コスト2以下1枚を持ち主のデッキ下
  "OP06-046": {"onPlay":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]},
  // OP06-047 シャーロット・プリン(c4): 【登場時】相手は手札を山に戻しシャッフル→5枚引く
  "OP06-047": {"onPlay":[{"op":"oppHandToDeckDraw","n":5}]},
  // OP06-048 ゼフ: 【自分のターン中】相手が【ブロッカー】かイベント発動時、東の海リーダーならデッキ上4枚トラッシュ
  "OP06-048": {"onOppEvent":{"when":"selfTurn","cond":{"leaderTraitIncludes":"東の海"},"fx":[{"op":"deckToTrash","n":4,"optional":true}]}},
  // OP06-050 たしぎ(c1): 【登場時】デッキ上5枚から「たしぎ」以外の海軍1枚を手札に
  "OP06-050": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"海軍"},"exclude":"たしぎ","optional":true}]},
  // OP06-051 つる: 【登場時】手札2枚を捨てる：相手は自身のキャラ1枚を手札に戻す
  "OP06-051": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"bounce","side":"opp","count":1,"optional":true}]}]},
  // OP06-052 トキカケ: 【ドン×1】手札4枚以下でバトルでKOされない
  "OP06-052": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"and":[{"donX1":true},{"selfHandAtMost":4}]}}]},
  // OP06-053 ハグワール・D・サウロ(c2): 【KO時】コスト2以下1枚を持ち主のデッキ下
  "OP06-053": {"onKO":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]},
  // OP06-054 ボルサリーノ(c2): 手札5枚以下で【ブロッカー】を得る
  "OP06-054": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfHandAtMost":5}}]},
  // OP06-055 モンキー・D・ガープ(c5): 【ドン×2】【アタック時】手札4枚以下なら相手はこのバトル中【ブロッカー】不可
  "OP06-055": {"onAttack":[{"op":"cond","check":{"and":[{"donX2":true},{"selfHandAtMost":4}]},"then":[{"op":"denyBlocker","all":true}]}]},
  // OP06-056 天叢雲剣: 【メイン】相手のコスト2以下1枚＋コスト1以下1枚をデッキ下
  "OP06-056": {"main":{"fx":[{"op":"deckBottom","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}},
  // OP06-057 おれは女の涙を疑わねェっ!!!!: 【メイン】リーダーかキャラ+1000→デッキ上1枚公開しコスト2のキャラを登場
  "OP06-057": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true},{"op":"playFromDeck","look":1,"filter":{"cost":2,"type":"CHAR"}}]}},
  // OP06-058 重力刀 猛虎: 【メイン】コスト6以下2枚を持ち主のデッキ下
  "OP06-058": {"main":{"fx":[{"op":"deckBottom","side":"any","filter":{"maxCost":6},"count":2,"optional":true}]}},
  // OP06-059 ホワイトスネーク: 【カウンター】リーダーかキャラ+1000し1ドロー
  "OP06-059": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"draw","n":1}]}},
  // OP06-060 ヴィンスモーク・イチジ(c4): 【起動メイン】ドン-1＋自身トラッシュ：ジェルマ66リーダーなら手札/トラッシュのコスト7「イチジ」を登場
  "OP06-060": {"act":{"label":"ドン-1+自身トラッシュ:コスト7イチジ登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ジェルマ66"},"then":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"ヴィンスモーク・イチジ","cost":7}}]}]}]}},
  // OP06-061 ヴィンスモーク・イチジ(c7): 【登場時】ドンが相手以下なら相手キャラ1枚-2000＋このキャラ【速攻】
  "OP06-061": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP06-062 ヴィンスモーク・ジャッジ(c8): 【登場時】ドン-1＋手札2枚捨て：トラッシュの異名パワー4000以下ジェルマ66を4枚登場 ／【起動メイン】【ターン1回】ドン-1：相手ドン1枚レスト
  "OP06-062": {"onPlay":[{"op":"donMinus","n":1},{"op":"discardCost","count":2,"optional":true,"then":[{"op":"multiReviveFromTrash","count":4,"filter":{"traitIncludes":"ジェルマ66","maxPower":4000}}]}],"act":{"label":"ドン-1:相手ドン1枚レスト","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"restOppDon","n":1}]}},
  // OP06-063 ヴィンスモーク・ソラ: 【登場時】手札1枚捨て：ドンが相手以下ならトラッシュのパワー4000以下ヴィンスモーク家1枚を手札に
  "OP06-063": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"traitIncludes":"ヴィンスモーク家","maxPower":4000}}]}]}]},
  // OP06-064 ヴィンスモーク・ニジ(c3): 【起動メイン】ドン-1＋自身トラッシュ:ジェルマ66リーダーで手札/トラッシュのコスト5「ニジ」を登場
  "OP06-064": {"act":{"label":"ドン-1+自身トラッシュ:コスト5ニジ登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ジェルマ66"},"then":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"ヴィンスモーク・ニジ","cost":5}}]}]}]}},
  // OP06-065 ヴィンスモーク・ニジ(c5): 【登場時】ドンが相手以下なら 相手コスト2以下1枚KO か 相手コスト4以下1枚を手札に戻す
  "OP06-065": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"chooseOption","options":[{"label":"相手コスト2以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},{"label":"相手コスト4以下1枚を手札に戻す","fx":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]}]}]}]},
  // OP06-066 ヴィンスモーク・ヨンジ(c2): 【起動メイン】ドン-1＋自身トラッシュ:ジェルマ66リーダーで手札/トラッシュのコスト4「ヨンジ」を登場
  "OP06-066": {"act":{"label":"ドン-1+自身トラッシュ:コスト4ヨンジ登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ジェルマ66"},"then":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"ヴィンスモーク・ヨンジ","cost":4}}]}]}]}},
  // OP06-067 ヴィンスモーク・ヨンジ(c4): ドンが相手以下で+1000 ／【ブロッカー】
  "OP06-067": {"static":[{"op":"condBuff","cond":{"donLEOpp":true},"power":1000}]},
  // OP06-068 ヴィンスモーク・レイジュ(c2): 【起動メイン】ドン-1＋自身トラッシュ:ジェルマ66リーダーで手札/トラッシュのコスト4「レイジュ」を登場
  "OP06-068": {"act":{"label":"ドン-1+自身トラッシュ:コスト4レイジュ登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ジェルマ66"},"then":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"ヴィンスモーク・レイジュ","cost":4}}]}]}]}},
  // OP06-069 ヴィンスモーク・レイジュ(c4): 【登場時】ドンが相手以下かつ手札5枚以下なら2ドロー
  "OP06-069": {"onPlay":[{"op":"cond","check":{"and":[{"donLEOpp":true},{"selfHandAtMost":5}]},"then":[{"op":"draw","n":2}]}]},
  // OP06-071 ギルド・テゾーロ: 【登場時】ドン-1：FILMリーダーならトラッシュのコスト4以下FILM2枚を手札に
  "OP06-071": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"FILM"},"then":[{"op":"trashToHand","count":2,"optional":true,"filter":{"traitIncludes":"FILM","maxCost":4}}]}]},
  // OP06-072 コゼット: ジェルマ66リーダーかつドンが相手より2枚以上少ないと【ブロッカー】
  "OP06-072": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"and":[{"leaderTraitIncludes":"ジェルマ66"},{"selfDonFewerBy":2}]}}]},
  // OP06-073 シキ: 【ブロッカー】 ／【登場時】場のドン8枚以上で1ドロー＋手札1枚捨て
  "OP06-073": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP06-074 ゼファー: 【登場時】ドン-1：相手キャラ1枚を効果無効→パワー5000以下ならKO
  "OP06-074": {"onPlay":[{"op":"donMinus","n":1},{"op":"negateChoose","side":"opp","charsOnly":true,"duration":"turn","koIfMaxEffPower":5000,"optional":true}]},
  // OP06-075 バトラー伯爵: 【登場時】ドン-1：相手コスト2以下2枚をレスト
  "OP06-075": {"onPlay":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":2,"optional":true}]},
  // OP06-076 人斬り鎌ぞう: 【自分のターン中】【ターン1回】ドンが戻された時、相手コスト2以下1枚KO
  "OP06-076": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP06-077 混色バグ: 【メイン】ドンが相手以下なら相手コスト5以下1枚を持ち主のデッキ下
  "OP06-077": {"main":{"fx":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"deckBottom","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}},
  // OP06-078 GERMA 66: 【メイン】デッキ上5枚から「自身」以外の『ジェルマ』1枚を手札に
  "OP06-078": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ジェルマ"},"exclude":"GERMA66","optional":true}]}},
  // OP06-079 ジェルマ王国(STAGE): 【起動メイン】手札1捨て＋レスト：デッキ上3枚から『ジェルマ』1枚を手札に
  "OP06-079": {"act":{"label":"手札1捨て+レスト:ジェルマ1枚回収","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ジェルマ"},"optional":true}]}]}},
  // OP06-081 アブサロム: 【登場時】トラッシュ2枚をデッキ下：コスト2以下1枚KO
  "OP06-081": {"onPlay":[{"op":"trashToBottomCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP06-082 犬っぺ: 【登場時】/【KO時】スリラーバークリーダーなら2ドロー＋手札2枚捨て
  "OP06-082": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"スリラーバーク海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}],"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"スリラーバーク海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP06-083 オーズ: アタック不可 ／【起動メイン】スリラーバーク1枚をKO：このターン効果無効
  "OP06-083": {"static":[{"op":"cantAttack"}],"act":{"label":"スリラーバーク1枚KO:自身効果無効","cost":{},"fx":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"スリラーバーク海賊団"},"then":[{"op":"negateSelf"}]}]}},
  // OP06-084 風のジゴロウ: 【KO時】リーダーかキャラ1枚を+1000
  "OP06-084": {"onKO":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]},
  // OP06-085 クマシー: 【ドン×2】【自分のターン中】トラッシュ5枚につき+1000
  "OP06-085": {"static":[{"op":"trashPower","per":5,"amount":1000,"cond":{"and":[{"donX2":true},{"selfTurn":true}]}}]},
  // OP06-086 ゲッコー・モリア(c8): 【登場時】トラッシュからコスト4以下＋コスト2以下を1枚ずつ登場(1枚レスト)
  "OP06-086": {"onPlay":[{"op":"reviveFromTrash","maxCost":4},{"op":"reviveFromTrash","maxCost":2,"rested":true}]},
  // OP06-088 サイ: ドレスローザリーダーがアクティブなら+2000
  "OP06-088": {"static":[{"op":"condBuff","cond":{"and":[{"leaderTraitIncludes":"ドレスローザ"},{"leaderActive":true}]},"power":2000}]},
  // OP06-089 タララン: 【登場時】/【KO時】デッキ上3枚をトラッシュ
  "OP06-089": {"onPlay":[{"op":"deckToTrash","n":3}],"onKO":[{"op":"deckToTrash","n":3}]},
  // OP06-090 ドクトル・ホグバック: 【登場時】トラッシュ2枚をデッキ下：トラッシュの「自身」以外のスリラーバーク1枚を手札に
  "OP06-090": {"onPlay":[{"op":"trashToBottomCost","n":2,"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"traitIncludes":"スリラーバーク海賊団","nameExcludes":"ドクトル・ホグバック"}}]}]},
  // OP06-091 ビクトリア・シンドリー: 【登場時】スリラーバークリーダーならデッキ上5枚トラッシュ
  "OP06-091": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"スリラーバーク海賊団"},"then":[{"op":"deckToTrash","n":5}]}]},
  // OP06-092 ブルック(c6): 【登場時】相手コスト4以下1枚KO か 相手はトラッシュ3枚をデッキ下
  "OP06-092": {"onPlay":[{"op":"chooseOption","options":[{"label":"相手コスト4以下1枚をトラッシュ","fx":[{"op":"trashChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},{"label":"相手はトラッシュ3枚をデッキ下","fx":[{"op":"oppTrashToBottom","n":3}]}]}]},
  // OP06-093 ペローナ(c4): 【登場時】相手手札5枚以上なら 相手1枚捨て か 相手キャラ1枚コスト-3
  "OP06-093": {"onPlay":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"chooseOption","options":[{"label":"相手は手札1枚を捨てる","fx":[{"op":"oppDiscard","n":1}]},{"label":"相手キャラ1枚をコスト-3","fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]}]}]},
  // OP06-095 影の集合地: 【メイン】/【カウンター】リーダー+1000→コスト2以下スリラーバークを任意KO、1枚ごとリーダー+1000(近似:1枚)
  "OP06-095": {"main":{"fx":[{"op":"leaderBuff","amount":1000,"duration":"turn"},{"op":"trashOwnCharCost","filter":{"traitIncludes":"スリラーバーク海賊団","maxCost":2},"then":[{"op":"leaderBuff","amount":1000,"duration":"turn"}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":1000,"duration":"battle"},{"op":"trashOwnCharCost","filter":{"traitIncludes":"スリラーバーク海賊団","maxCost":2},"then":[{"op":"leaderBuff","amount":1000,"duration":"battle"}]}]}},
  // OP06-096 …なにも!!!な゛かった…!!!!: 【カウンター】ライフ1枚を手札に：自分のコスト7以下キャラ全てはこのターンバトルでKOされない
  "OP06-096": {"counter":{"cost":0,"fx":[{"op":"lifeCost","then":[{"op":"grantAllBattleImmune","duration":"turn","filter":{"maxCost":7,"type":"CHAR"}}]}]}},
  // OP06-097 ネガティブホロウ: 【メイン】相手の手札1枚を捨てる
  "OP06-097": {"main":{"fx":[{"op":"oppDiscard","n":1}]}},
  // OP06-098 スリラーバーク(STAGE): 【起動メイン】ドン1レスト＋レスト：スリラーバークリーダーならトラッシュのコスト2以下スリラーバークをレスト登場
  "OP06-098": {"act":{"label":"ドン1+レスト:スリラーバークをレスト登場","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"スリラーバーク海賊団"},"then":[{"op":"reviveFromTrash","maxCost":2,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]}]}]}},
  // OP06-099 アイサ: 【登場時】自分か相手のライフ上1枚を見て上か下に置く(情報)
  "OP06-099": {"onPlay":[{"op":"peekLifeTopPlace"}]},
  // OP06-100 イヌアラシ(c4): 【ドン×2】【アタック時】手札1捨て：相手のライフ枚数以下のコストの相手キャラ1枚KO
  "OP06-100": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]}]}]},
  // OP06-102 カマキリ: 【起動メイン】【ターン1回】コスト1ステージをデッキ下：相手コスト2以下1枚KO
  "OP06-102": {"act":{"label":"コスト1ステージをデッキ下:相手2以下KO","cost":{},"fx":[{"op":"stageToBottomCost","filter":{"maxCost":1},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP06-103 河松: 【アタック時】手札2枚捨て：自分のパワー0のキャラ1枚を持ち主のライフに表向きで置く
  "OP06-103": {"onAttack":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"charToLife","side":"self","filter":{"power":0},"faceUp":true,"optional":true}]}]},
  // OP06-107 光月モモの助(c5): 【ブロッカー】 ／【登場時】「モモ」以外のワノ国1枚を持ち主のライフに表向きで加える
  "OP06-107": {"onPlay":[{"op":"charToLife","side":"self","filter":{"traitIncludes":"ワノ国","nameExcludes":"光月モモの助"},"faceUp":true,"optional":true}]},
  // OP06-109 傳ジロー: 【ドン×2】相手ライフ3枚以下で効果でKOされない
  "OP06-109": {"static":[{"op":"condBuff","koImmune":true,"cond":{"and":[{"donX2":true},{"oppLifeAtMost":3}]}}]},
  // OP06-110 ネコマムシ(c4): 【ドン×2】相手のアクティブのキャラにもアタックできる
  "OP06-110": {"static":[{"op":"staticKeyword","kw":"attackActive","cond":{"donX2":true}}]},
  // OP06-111 ブラハム: 【起動メイン】【ターン1回】コスト1ステージをデッキ下:相手コスト4以下1枚レスト
  "OP06-111": {"act":{"label":"コスト1ステージをデッキ下:相手4以下レスト","cost":{},"fx":[{"op":"stageToBottomCost","filter":{"maxCost":1},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP06-112 雷ぞう: 【アタック時】手札1捨て：相手のドン1枚をレスト
  "OP06-112": {"onAttack":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"restOppDon","n":1},{"op":"donRefreshLock","n":1}]}]},
  // OP06-113 ラキ: 「ラキ」以外のシャンドラの戦士がいれば【ブロッカー】を得る
  "OP06-113": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"traitIncludes":"シャンドラの戦士"}}}}]},
  // OP06-114 ワイパー(c5): 【登場時】コスト1ステージをデッキ下:デッキ上5枚から「アッパーヤード」かシャンドラ1枚を手札に
  "OP06-114": {"onPlay":[{"op":"stageToBottomCost","filter":{"maxCost":1},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"nameIncludes":"アッパーヤード"},{"traitIncludes":"シャンドラの戦士"}]},"optional":true}]}]},
  // OP06-115 お前が消えろ: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP06-115": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP06-116 排撃: 【メイン】相手コスト5以下1枚KO か 相手ライフ1枚なら1ダメージ＋ライフ上1枚を手札に
  "OP06-116": {"main":{"fx":[{"op":"chooseOption","options":[{"label":"相手コスト5以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]},{"label":"相手ライフ1枚なら1ダメージ＋ライフ手札","fx":[{"op":"cond","check":{"oppLifeAtMost":1},"then":[{"op":"oppDamage","n":1},{"op":"lifeToHand","n":1}]}]}]}]}},
  // OP06-117 方舟マクシム(STAGE): 【起動メイン】このカードと「エネル」をレスト：相手コスト2以下すべてKO
  "OP06-117": {"act":{"label":"自身＋エネルをレスト:相手2以下全KO","cost":{"restSelf":true},"fx":[{"op":"restOwnAsCost","filter":{"nameIncludes":"エネル"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"all":true}]}]}},
  // OP06-118 ロロノア・ゾロ(c9): 【アタック時】①このキャラをアクティブ ／【起動メイン】②このキャラをアクティブ
  "OP06-118": {"onAttack":[{"op":"restDonCost","n":1,"once":"turn","then":[{"op":"activateSelf"}]}],"act":{"label":"ドン2レスト:このキャラをアクティブ","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"activateSelf"}]}]}},
  // OP06-119 サンジ(c9): 【登場時】デッキ上1枚公開し「サンジ」以外のコスト9以下キャラを登場
  "OP06-119": {"onPlay":[{"op":"playFromDeck","look":1,"filter":{"maxCost":9,"nameExcludes":"サンジ"}}]},
  /* ===== OP05（新時代の主役）バッチ1（赤革命軍・緑ドンキホーテ海賊団） ===== */
  // OP05-001 サボ LEADER: 【ドン×1】【相手のターン中】【ターン1回】パワー5000以上の自キャラがKOされる代わりに-1000
  "OP05-001": {"static":[{"op":"leaveProtect","once":"turn","when":"oppTurn","pay":"targetMinus","amount":1000,"cond":{"donX1":true},"targetFilter":{"minEffPower":5000}}]},
  // OP05-002 ベロ・ベティ LEADER: 【起動メイン】【ターン1回】革命軍1枚を捨てる：革命軍か【トリガー】持ち3枚を+3000
  "OP05-002": {"act":{"label":"革命軍1捨て:革命軍/トリガー3枚+3000","cost":{},"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"革命軍"},"then":[{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":3,"optional":true,"filter":{"or":[{"traitIncludes":"革命軍"},{"hasTrigger":true}]}}]}]}},
  // OP05-003 イナズマ: このキャラ以外にパワー7000以上の自キャラがいると【速攻】
  "OP05-003": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"selfCharOther":{"filter":{"minEffPower":7000}}}}]},
  // OP05-004 エンポリオ・イワンコフ(c4): 【起動メイン】【ターン1回】パワー7000以上なら手札から「自身」以外のパワー5000以下革命軍を登場
  "OP05-004": {"act":{"label":"パワー7000以上:革命軍を登場","cost":{},"fx":[{"op":"cond","check":{"selfPowerAtLeast":7000},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"革命軍","maxPower":5000,"nameExcludes":"エンポリオ・イワンコフ"},"count":1,"optional":true}]}]}},
  // OP05-005 カラス: 【登場時】革命軍リーダーなら相手1枚-1000 ／【アタック時】パワー7000以上なら相手1枚-1000
  "OP05-005": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-1000,"duration":"turn","count":1,"optional":true}]}],"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":7000},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-1000,"duration":"turn","count":1,"optional":true}]}]},
  // OP05-006 コアラ: 【登場時】革命軍リーダーなら相手キャラ1枚-3000
  "OP05-006": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"革命軍"},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]},
  // OP05-007 サボ(c6): 【登場時】相手キャラ2枚を合計4000以下になるようKO
  "OP05-007": {"onPlay":[{"op":"koByTotalPower","count":2,"maxTotal":4000}]},
  // OP05-008 チャカ: 【ドン×1】【起動メイン】【ターン1回】リーダーかキャラ1枚にレストのドン2付与
  "OP05-008": {"act":{"label":"リーダーかキャラにレストのドン2付与","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]}},
  // OP05-009 トト: 【登場時】自分のリーダーのパワーが0以下なら1ドロー
  "OP05-009": {"onPlay":[{"op":"cond","check":{"leaderEffPowerAtMost":0},"then":[{"op":"draw","n":1}]}]},
  // OP05-010 ニコ・ロビン(c1): 【登場時】相手のパワー1000以下1枚KO
  "OP05-010": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":1000},"count":1,"optional":true}]},
  // OP05-011 バーソロミュー・くま(c2): 【登場時】相手のパワー2000以下1枚KO
  "OP05-011": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]},
  // OP05-014 ペル: 【ドン×1】【アタック時】相手キャラ1枚-2000
  "OP05-014": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]},
  // OP05-015 ベロ・ベティ(c1): 【登場時】デッキ上5枚から「自身」以外の革命軍1枚を手札に
  "OP05-015": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"革命軍"},"exclude":"ベロ・ベティ","optional":true}]},
  // OP05-016 モーリー: 【アタック時】パワー7000以上なら相手はこのバトル中【ブロッカー】不可
  "OP05-016": {"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":7000},"then":[{"op":"denyBlocker","all":true}]}]},
  // OP05-017 リンドバーグ(c4): 【アタック時】パワー7000以上なら相手のパワー3000以下1枚KO
  "OP05-017": {"onAttack":[{"op":"cond","check":{"selfPowerAtLeast":7000},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},
  // OP05-018 エンポリオ・テンションホルモン: 【カウンター】リーダーかキャラ+3000→手札からパワー5000以下革命軍を登場
  "OP05-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"playCharFromHand","filter":{"traitIncludes":"革命軍","maxPower":5000},"count":1,"optional":true}]}},
  // OP05-019 火拳: 【メイン】相手キャラ1枚-4000→自ライフ2枚以下なら相手のパワー0以下1枚KO
  "OP05-019": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":0},"count":1,"optional":true}]}]}},
  // OP05-020 四千枚瓦正拳: 【メイン】リーダーかキャラ+2000→相手のパワー2000以下1枚KO
  "OP05-020": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"duration":"turn","count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}},
  // OP05-021 革命軍総本部(STAGE): 【起動メイン】手札1捨て＋レスト：デッキ上3枚から革命軍1枚を手札に
  "OP05-021": {"act":{"label":"手札1捨て+レスト:革命軍1枚回収","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"革命軍"},"optional":true}]}]}},
  // OP05-022 ドンキホーテ・ロシナンテ LEADER: 【ブロッカー】 ／【自分のターン終了時】手札6枚以下ならこのリーダーをアクティブ
  "OP05-022": {"onTurnEnd":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"activateOwnChar","incLeader":true,"count":0}]}]},
  // OP05-023 ヴェルゴ(c3): 【ドン×1】【アタック時】相手のレストのコスト3以下1枚KO
  "OP05-023": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}]},
  // OP05-025 グラディウス: 【起動メイン】レスト：相手コスト3以下1枚をレスト
  "OP05-025": {"act":{"label":"レスト:相手コスト3以下1枚レスト","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}},
  // OP05-026 サーキース: 【ドン×1】【アタック時】【ターン1回】コスト3以上の自キャラ1枚をレスト：このキャラをアクティブ
  "OP05-026": {"onAttack":[{"op":"cond","check":{"donX1":true},"once":"turn","then":[{"op":"restOwnAsCost","filter":{"minCost":3},"then":[{"op":"activateSelf"}]}]}]},
  // OP05-027 トラファルガー・ロー(c1): 【起動メイン】自身トラッシュ：相手コスト3以下1枚をレスト
  "OP05-027": {"act":{"label":"自身トラッシュ:相手3以下レスト","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}},
  // OP05-028 ドンキホーテ・ドフラミンゴ(c1): 【起動メイン】自身トラッシュ：相手のレストのコスト2以下1枚KO
  "OP05-028": {"act":{"label":"自身トラッシュ:相手レスト2以下KO","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":2},"count":1,"optional":true}]}]}},
  // OP05-029 ドンキホーテ・ドフラミンゴ(c7): 【相手のアタック時】【ターン1回】ドン1レスト：相手コスト6以下1枚をレスト
  "OP05-029": {"onOppAttack":[{"op":"restDonCost","n":1,"once":"turn","then":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]}]},
  // OP05-030 ドンキホーテ・ロシナンテ(c2): 【ブロッカー】 ／【相手のターン中】自分のレストのキャラがKOされる代わりにこのキャラをトラッシュ
  "OP05-030": {"static":[{"op":"leaveProtect","when":"oppTurn","onlyKO":true,"includeBattle":true,"pay":"koSelf","targetFilter":{"restedOnly":true}}]},
  // OP05-031 バッファロー: 【アタック時】【ターン1回】レストのキャラ2枚以上ならレストのコスト1キャラ1枚をアクティブ
  "OP05-031": {"onAttack":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"once":"turn","then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"cost":1}}]}]},
  // OP05-032 ピーカ: 【自分のターン終了時】ドン1レスト：このキャラをアクティブ ／【ターン1回】KOされる代わりに「ピーカ」以外のコスト3以上の自キャラをレスト
  "OP05-032": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"restOwnCards","n":1,"filter":{"minCost":3,"nameExcludes":"ピーカ"}}],"onTurnEnd":[{"op":"restDonCost","n":1,"then":[{"op":"activateSelf"}]}]},
  // OP05-033 ベビー5(c1): 【起動メイン】ドン1レスト＋自身レスト：手札からコスト2以下のドンキ1枚を登場
  "OP05-033": {"act":{"label":"ドン1+自身レスト:コスト2以下ドンキ登場","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ドンキホーテ海賊団","maxCost":2},"count":1,"optional":true}]}]}},
  // OP05-034 ベビー5(c1 alt): 【起動メイン】ドン1レスト＋自身レスト：デッキ上5枚からドンキ1枚を手札に
  "OP05-034": {"act":{"label":"ドン1+自身レスト:ドンキ1枚回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"optional":true}]}]}},
  // OP05-037 勝者だけが正義だ!!!!: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP05-037": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP05-038 舞踏石: 【カウンター】リーダーかキャラ+4000→手札1捨ててもよい：ドン3枚アクティブ
  "OP05-038": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"discardCost","count":1,"optional":true,"then":[{"op":"donActivate","n":3}]}]}},
  // OP05-039 ベタベットン流星: 【カウンター】リーダーかキャラ+4000→相手のレストのコスト3以下1枚KO
  "OP05-039": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}},
  // OP05-040 鳥カゴ(STAGE): 【自分のターン終了時】ドン10ならレストのコスト5以下すべてKO→自身トラッシュ（リフレッシュロック静的は近似で省略）
  "OP05-040": {"onTurnEnd":[{"op":"cond","check":{"donAtLeast":10},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"all":true},{"op":"negateSelf"}]}]},
  /* ===== OP05 バッチ2（青海軍・紫麦わら/キッド/ハート・黒ドレスローザ/天竜人・黄空島） ===== */
  // OP05-042 イッショウ: 【登場時】相手コスト7以下1枚は次の自分ターン開始までアタック不可
  "OP05-042": {"onPlay":[{"op":"setAttackBan","filter":{"maxCost":7},"count":1,"duration":"untilNextStart","optional":true}]},
  // OP05-043 うるティ: 【登場時】多色リーダーならデッキ上3枚から1枚を手札に
  "OP05-043": {"onPlay":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"search","look":3,"count":1,"optional":true}]}]},
  // OP05-045 ステンレス: 【起動メイン】手札1捨て＋レスト：コスト2以下1枚を持ち主のデッキ下
  "OP05-045": {"act":{"label":"手札1捨て+レスト:コスト2以下デッキ下","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP05-046 ダルメシアン: 【KO時】1ドロー＋手札1枚をデッキ下
  "OP05-046": {"onKO":[{"op":"draw","n":1},{"op":"handToBottom","n":1}]},
  // OP05-048 バスティーユ: 【ドン×1】【アタック時】コスト2以下1枚を持ち主のデッキ下
  "OP05-048": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP05-049 八茶: 【ドン×1】【アタック時】コスト3以下1枚を手札に戻す
  "OP05-049": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]}]},
  // OP05-050 ヒナ: 【登場時】手札5枚以下で1ドロー
  "OP05-050": {"onPlay":[{"op":"cond","check":{"selfHandAtMost":5},"then":[{"op":"draw","n":1}]}]},
  // OP05-051 ボルサリーノ(c7): 【登場時】コスト4以下1枚を持ち主のデッキ下
  "OP05-051": {"onPlay":[{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true}]},
  // OP05-053 モザンビア: 【自分のターン中】【ターン1回】ドローフェイズ以外で引いた時+2000
  "OP05-053": {"onExtraDraw":{"once":"turn","fx":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}},
  // OP05-054 モンキー・D・ガープ(c3): 【登場時】2ドロー→手札2枚をデッキ下
  "OP05-054": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2}]},
  // OP05-055 X・ドレーク(c5): 【ブロッカー】 ／【登場時】デッキ上5枚を並び替え
  "OP05-055": {"onPlay":[{"op":"scry","look":5}]},
  // OP05-056 X・バレルズ: 【登場時】このキャラ以外の自キャラ1枚をデッキ下：1ドロー
  "OP05-056": {"onPlay":[{"op":"deckBottomOwnCharCost","excludeSelf":true,"then":[{"op":"draw","n":1}]}]},
  // OP05-057 犬噛紅蓮: 【メイン】リーダーかキャラ+3000→コスト2以下1枚を持ち主のデッキ下
  "OP05-057": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true},{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true}]}},
  // OP05-058 命がも゛ったいだいっ!!!!: 【メイン】コスト3以下すべてを持ち主のデッキ下→お互い手札5枚になるよう捨てる
  "OP05-058": {"main":{"fx":[{"op":"deckBottom","side":"opp","filter":{"maxCost":3},"all":true},{"op":"discardOwn","toSize":5},{"op":"oppDiscardToSize","n":5}]}},
  // OP05-059 始めよう”暴力の世界”!!!: 【メイン】多色リーダーなら1ドロー→コスト5以下1枚を手札に戻す
  "OP05-059": {"main":{"fx":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"draw","n":1}]},{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}]}},
  // OP05-060 モンキー・D・ルフィ LEADER: 【起動メイン】【ターン1回】ライフ1枚を手札に：ドン0か3以上ならドン1アクティブ追加
  "OP05-060": {"act":{"label":"ライフ1枚手札:ドン0/3+でドン追加","cost":{},"fx":[{"op":"lifeCost","then":[{"op":"cond","check":{"or":[{"donAtMost":0},{"donAtLeast":3}]},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]}},
  // OP05-061 ウソ八: 【ドン×1】【アタック時】場のドン8以上なら相手コスト4以下1枚をレスト
  "OP05-061": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"donAtLeast":8}]},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // OP05-062 おナミ: 場のドン10で【ブロッカー】を得る
  "OP05-062": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"donAtLeast":10}}]},
  // OP05-063 おロビ: 【登場時】場のドン8以上なら相手コスト3以下1枚KO
  "OP05-063": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP05-064 キラー(c1): 【登場時】デッキ上5枚から「キラー」以外のキッド海賊団1枚を手札に
  "OP05-064": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"キッド海賊団"},"exclude":"キラー","optional":true}]},
  // OP05-066 ジンベエ(c5): 【ブロッカー】 ／【相手のターン中】場のドン10で+1000
  "OP05-066": {"static":[{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"donAtLeast":10}]},"power":1000}]},
  // OP05-067 ゾロ十郎: 【アタック時】自ライフ3枚以下ならドン1アクティブ追加
  "OP05-067": {"onAttack":[{"op":"cond","check":{"lifeAtMost":3},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP05-068 チョパえもん: 【登場時】場のドン8以上ならパワー6000以下の紫麦わら1枚をアクティブ
  "OP05-068": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"color":"紫","traitIncludes":"麦わらの一味","maxEffPower":6000}}]}]},
  // OP05-069 トラファルガー・ロー(c3): 【アタック時】相手のドンが多いならデッキ上5枚からハート1枚を手札に
  "OP05-069": {"onAttack":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ハートの海賊団"},"optional":true}]}]},
  // OP05-070 フラの介: 【ドン×1】場のドン8以上で【速攻】
  "OP05-070": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"and":[{"donX1":true},{"donAtLeast":8}]}}]},
  // OP05-071 ベポ: 【アタック時】相手のドンが多いなら相手キャラ1枚-2000
  "OP05-071": {"onAttack":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]},
  // OP05-072 ホネ吉: 【登場時】場のドン8以上なら相手キャラ2枚-2000
  "OP05-072": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]}]},
  // OP05-073 ザラ: 【登場時】手札1枚捨て：ドン1レスト追加
  "OP05-073": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP05-074 ユースタス・キッド(c5): 【ブロッカー】 ／【ターン1回】ドンが戻された時、ドン1アクティブ追加
  "OP05-074": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP05-075 Mr.1(ダズ・ボーネス): 【相手のアタック時】【ターン1回】ドン-1：手札からコスト3以下のB・Wを登場
  "OP05-075": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"playCharFromHand","filter":{"traitIncludes":"B・W","maxCost":3},"count":1,"optional":true}]}]},
  // OP05-076 海は海賊が相手だ!!!: 【メイン】デッキ上3枚から麦わら/キッド/ハート1枚を手札に
  "OP05-076": {"main":{"fx":[{"op":"search","look":3,"count":1,"filter":{"or":[{"traitIncludes":"麦わらの一味"},{"traitIncludes":"キッド海賊団"},{"traitIncludes":"ハートの海賊団"}]},"optional":true}]}},
  // OP05-078 磁気魔人: 【メイン】ドン-1：自分のキッド海賊団リーダーかキャラ1枚+5000
  "OP05-078": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","leader":true,"amount":5000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"キッド海賊団"}}]}},
  // OP05-079 ヴィオラ: 【登場時】相手はトラッシュ3枚をデッキ下
  "OP05-079": {"onPlay":[{"op":"oppTrashToBottom","n":3}]},
  // OP05-080 エリザベローⅡ世: 【アタック時】【ターン1回】トラッシュ20枚を山へ：このバトル中【Wアタック】＋10000
  "OP05-080": {"onAttack":[{"op":"trashToDeckCost","n":20,"once":"turn","then":[{"op":"giveKeyword","target":"self","kw":"doubleAttack","duration":"battle"},{"op":"powerMod","side":"self","target":"self","amount":10000,"battle":true}]}]},
  // OP05-081 片足の兵隊: 【起動メイン】自身トラッシュ：相手キャラ1枚をコスト-3
  "OP05-081": {"act":{"label":"自身トラッシュ:相手コスト-3","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]}},
  // OP05-082 しらほし(c1): 【起動メイン】レスト＋トラッシュ2枚をデッキ下：相手手札6枚以上なら相手1枚捨て
  "OP05-082": {"act":{"label":"レスト+トラッシュ2枚デッキ下:相手捨て","cost":{"restSelf":true},"fx":[{"op":"trashToBottomCost","n":2,"then":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppDiscard","n":1}]}]}]}},
  // OP05-084 チャルロス聖: 【自分のターン中】自キャラが天竜人のみなら相手キャラ全コスト-4
  "OP05-084": {"static":[{"op":"oppCostMod","amount":-4,"cond":{"and":[{"selfTurn":true},{"allSelfChar":{"traitIncludes":"天竜人"}}]}}]},
  // OP05-085 ネフェルタリ・コブラ: 【ブロッカー】 ／【登場時】デッキ上1枚をトラッシュ
  "OP05-085": {"onPlay":[{"op":"deckToTrash","n":1}]},
  // OP05-086 ネフェルタリ・ビビ: トラッシュ10枚以上で【ブロッカー】を得る
  "OP05-086": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"trashAtLeast":10}}]},
  // OP05-087 ハクバ: 【ドン×1】【アタック時】このキャラ以外の自キャラ1枚をKO：相手キャラ1枚をコスト-5
  "OP05-087": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"trashOwnCharCost","excludeSelf":true,"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-5,"duration":"turn","optional":true}]}]}]},
  // OP05-088 マンシェリー: 【起動メイン】ドン1レスト＋レスト＋トラッシュ2枚デッキ下：トラッシュのコスト3-5黒キャラ1枚を手札に
  "OP05-088": {"act":{"label":"ドン1+レスト+トラッシュ2:黒キャラ回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"trashToBottomCost","n":2,"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"黒","minCost":3,"maxCost":5}}]}]}]}},
  // OP05-089 ミョスガルド聖: 【起動メイン】ドン1レスト＋このキャラと自キャラ1枚レスト：トラッシュのコスト1黒キャラ1枚を手札に
  "OP05-089": {"act":{"label":"ドン1+2枚レスト:コスト1黒キャラ回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"restOwnAsCost","then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"黒","cost":1}}]}]}]}},
  // OP05-090 リク・ドルド3世: 【ブロッカー】 ／【登場時】/【KO時】ドレスローザ1枚を+2000
  "OP05-090": {"onPlay":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ドレスローザ"}}],"onKO":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ドレスローザ"}}]},
  // OP05-091 レベッカ: 【ブロッカー】 ／【登場時】トラッシュの「自身」以外のコスト3-7黒キャラを手札に→手札からコスト3以下黒キャラをレスト登場
  "OP05-091": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"黒","minCost":3,"maxCost":7,"nameExcludes":"レベッカ"}},{"op":"playCharFromHand","filter":{"color":"黒","maxCost":3},"count":1,"optional":true,"rested":true}]},
  // OP05-092 ロズワード聖: 【自分のターン中】自キャラが天竜人のみなら相手キャラ全コスト-6
  "OP05-092": {"static":[{"op":"oppCostMod","amount":-6,"cond":{"and":[{"selfTurn":true},{"allSelfChar":{"traitIncludes":"天竜人"}}]}}]},
  // OP05-093 ロブ・ルッチ(c4): 【登場時】トラッシュ3枚をデッキ下：相手コスト2以下1枚＋コスト1以下1枚KO
  "OP05-093": {"onPlay":[{"op":"trashToBottomCost","n":3,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP05-094 高級仕立パッチ★ワーク: 【メイン】相手キャラ1枚をコスト-3→相手コスト0キャラ1枚を次リフレッシュロック
  "OP05-094": {"main":{"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true},{"op":"lockRefresh","filter":{"maxCost":0},"count":1,"optional":true}]}},
  // OP05-095 竜の鉤爪: 【カウンター】リーダーかキャラ+4000→トラッシュ15枚以上なら相手コスト4以下1枚KO
  "OP05-095": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP05-096 5億で買うえ～～!!!: 【メイン】相手コスト1以下1枚をKO/手札/ライフ→自分に天竜人がいれば1ドロー
  "OP05-096": {"main":{"fx":[{"op":"chooseOption","options":[{"label":"相手コスト1以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},{"label":"相手コスト1以下1枚を手札に戻す","fx":[{"op":"bounce","side":"opp","maxCost":1,"count":1,"optional":true}]},{"label":"相手コスト1以下1枚をライフに表向き","fx":[{"op":"charToLife","filter":{"maxCost":1},"faceUp":true,"optional":true}]}]},{"op":"cond","check":{"selfChar":{"traitIncludes":"天竜人"}},"then":[{"op":"draw","n":1}]}]}},
  // OP05-097 聖地マリージョア(STAGE): 自分が手札から登場させるコスト2以上の天竜人のコスト-1
  "OP05-097": {"static":[{"op":"playCostReduce","minCost":2,"amount":1,"filter":{"traitIncludes":"天竜人"}}]},
  // OP05-099 アマゾン: 【相手のアタック時】このキャラをレスト：相手はライフ上1枚トラッシュしてよい、しなければ相手1枚-2000(近似:常に-2000)
  "OP05-099": {"onOppAttack":[{"op":"restSelfCost","then":[{"op":"oppMayTrashLife","elseFx":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}]}]},
  // OP05-100 エネル: 【速攻】 ／【ターン1回】場を離れる代わりに自分のライフ上1枚をトラッシュ(自分に「ルフィ」がいると無効)
  "OP05-100": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"selfLifeTrash","unless":{"nameIncludes":"モンキー・D・ルフィ"}}]},
  // OP05-101 オーム: 自ライフ2枚以下で+1000 ／【登場時】デッキ上5枚から「ホーリー」1枚を手札に→手札から「ホーリー」1枚を登場
  "OP05-101": {"static":[{"op":"condBuff","cond":{"lifeAtMost":2},"power":1000}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"nameIncludes":"ホーリー"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"ホーリー","optional":true}]},
  // OP05-102 ゲダツ: 【登場時】相手のライフ枚数以下のコストの相手キャラ1枚KO
  "OP05-102": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]},
  // OP05-103 コトリ: 【登場時】自分の「ホトリ」がいれば相手のライフ枚数以下のコストの相手キャラ1枚KO
  "OP05-103": {"onPlay":[{"op":"cond","check":{"selfChar":{"nameIncludes":"ホトリ"}},"then":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]}]},
  // OP05-104 コニス: 【登場時】自分のステージをデッキ下：1ドロー＋手札1枚捨て
  "OP05-104": {"onPlay":[{"op":"stageToBottomCost","side":"self","then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP05-106 シュラ: 【登場時】デッキ上5枚から「シュラ」以外の空島1枚を手札に
  "OP05-106": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"空島"},"exclude":"シュラ","optional":true}]},
  // OP05-107 スペーシー中尉: 【自分のターン中】【ターン1回】ライフが手札に加わった時+2000
  "OP05-107": {"onLifeToHand":{"once":"turn","fx":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}},
  // OP05-109 パガヤ: 【ターン1回】【トリガー】が発動した時、2ドロー＋手札2枚捨て
  "OP05-109": {"onTrigger":{"once":"turn","fx":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}},
  // OP05-111 ホトリ: 【登場時】手札から「コトリ」を登場：相手コスト3以下1枚を相手ライフに表向き
  "OP05-111": {"onPlay":[{"op":"playSpecificFromHand","name":"コトリ","optional":true},{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true}]},
  // OP05-112 マッキンリー隊長: 【ブロッカー】 ／【KO時】手札からコスト1の空島1枚を登場
  "OP05-112": {"onKO":[{"op":"playCharFromHand","filter":{"traitIncludes":"空島","cost":1},"count":1,"optional":true}]},
  // OP05-114 神の裁き: 【カウンター】リーダーかキャラ+2000→相手ライフ2枚以下ならさらに+2000
  "OP05-114": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP05-115 2億V雷神: 【メイン】リーダーかキャラ+3000→自ライフ1枚以下なら相手コスト4以下1枚レスト
  "OP05-115": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP05-116 3000万V雷鳥: 【メイン】相手のライフ枚数以下のコストの相手キャラ1枚KO
  "OP05-116": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]}},
  // OP05-117 アッパーヤード(STAGE): 【登場時】デッキ上5枚から空島1枚を手札に
  "OP05-117": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"空島"},"optional":true}]},
  // OP05-118 カイドウ(c10): 【登場時】相手ライフ3枚以下なら4ドロー
  "OP05-118": {"onPlay":[{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"draw","n":4}]}]},
  // OP05-119 モンキー・D・ルフィ(c10): 【登場時】ドン-10：他の自キャラをデッキ下→追加ターン ／【起動メイン】ドン1レスト：ドン1アクティブ追加
  "OP05-119": {"onPlay":[{"op":"donMinus","n":10},{"op":"bottomOwnCharsExceptSelf"},{"op":"extraTurn"}],"act":{"label":"ドン1レスト:ドン1アクティブ追加","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}},
  /* ===== OP04（謀略の王国）バッチ1（赤アラバスタ・緑ドンキ・001-060） ===== */
  // OP04-001 ネフェルタリ・ビビ LEADER: アタック不可 ／【起動メイン】【ターン1回】ドン2レスト：1ドロー＋自キャラ1枚に【速攻】
  "OP04-001": {"static":[{"op":"cantAttack"}],"act":{"label":"ドン2レスト:1ドロー＋速攻","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"draw","n":1},{"op":"giveKeyword","target":"chooseOwn","kw":"rush","duration":"turn"}]}]}},
  // OP04-002 イガラム: 【起動メイン】レスト＋リーダー-5000：デッキ上5枚からアラバスタ1枚を手札に
  "OP04-002": {"act":{"label":"レスト＋リーダー-5000:アラバスタ回収","cost":{"restSelf":true},"fx":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"アラバスタ王国"},"optional":true}]}]}},
  // OP04-003 ウソップ(c4): 【KO時】相手の元々パワー5000以下1枚KO
  "OP04-003": {"onKO":[{"op":"ko","side":"opp","filter":{"maxPower":5000},"count":1,"optional":true}]},
  // OP04-004 カルー: 【起動メイン】レスト：アラバスタ全てにレストのドン1ずつ付与
  "OP04-004": {"act":{"label":"レスト:アラバスタ全にレストのドン1付与","cost":{"restSelf":true},"fx":[{"op":"donAttachAll","n":1,"filter":{"traitIncludes":"アラバスタ王国"}}]}},
  // OP04-005 クンフージュゴン: 他の「クンフージュゴン」がいれば【ブロッカー】
  "OP04-005": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharOther":{"filter":{"nameIncludes":"クンフージュゴン"}}}}]},
  // OP04-006 コーザ: 【アタック時】リーダー-5000：このキャラは次の自分ターン開始まで+2000
  "OP04-006": {"onAttack":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"}]}]},
  // OP04-008 チャカ(c3): 【ドン×1】【アタック時】ビビリーダーなら相手1枚-3000→相手のパワー0以下1枚KO
  "OP04-008": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"leaderNameIncludes":"ネフェルタリ・ビビ"}]},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":0},"count":1,"optional":true}]}]},
  // OP04-009 超カルガモ部隊: 【アタック時】リーダー-5000：ターン終了時このキャラを手札に戻す
  "OP04-009": {"onAttack":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"scheduleTurnEnd","fx":[{"op":"bounceSelfCost"}]}]}]},
  // OP04-010 トニートニー・チョッパー(c3): 【登場時】手札からパワー3000以下の動物1枚を登場
  "OP04-010": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"動物","maxPower":3000},"count":1,"optional":true}]},
  // OP04-011 ナミ(c2): 【アタック時】デッキ上1枚公開、パワー6000以上のキャラなら+3000、その後デッキ下
  "OP04-011": {"onAttack":[{"op":"revealTop","filter":{"type":"CHAR","minPower":6000},"then":[{"op":"powerMod","side":"self","target":"self","amount":3000,"duration":"turn"}]},{"op":"deckTopToBottom"}]},
  // OP04-012 ネフェルタリ・コブラ(c2): 【自分のターン中】このキャラ以外のアラバスタ全+1000
  "OP04-012": {"static":[{"op":"allyPower","cond":{"selfTurn":true},"power":1000,"filter":{"traitIncludes":"アラバスタ王国"}}]},
  // OP04-013 ペル(c5): 【ドン×1】【アタック時】相手のパワー4000以下1枚KO
  "OP04-013": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}]},
  // OP04-015 ロロノア・ゾロ(c5): 【登場時】相手キャラ1枚-2000
  "OP04-015": {"onPlay":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  // OP04-016 反行儀キックコース: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP04-016": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP04-017 幸せパンチ: 【カウンター】相手1枚-2000→自リーダーがアクティブなら相手1枚-1000
  "OP04-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"leaderActive":true},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-1000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP04-018 魅惑のメマーイダンス: 【メイン】アラバスタリーダーなら相手2枚-2000
  "OP04-018": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"アラバスタ王国"},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]}]}},
  // OP04-020 イッショウ LEADER: 【ドン×1】【自分のターン中】相手キャラ全コスト-1 ／【自分のターン終了時】ドン1レスト：コスト5以下1枚をアクティブ
  "OP04-020": {"static":[{"op":"oppCostMod","amount":-1,"cond":{"and":[{"donX1":true},{"selfTurn":true}]}}],"onTurnEnd":[{"op":"restDonCost","n":1,"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":5}}]}]},
  // OP04-021 ヴィオラ(c3): 【相手のアタック時】ドン2レスト：相手のドン1枚をレスト
  "OP04-021": {"onOppAttack":[{"op":"restDonCost","n":2,"then":[{"op":"restOppDon","n":1},{"op":"donRefreshLock","n":1}]}]},
  // OP04-022 エリック: 【起動メイン】レスト：相手コスト1以下1枚をレスト
  "OP04-022": {"act":{"label":"レスト:相手コスト1以下レスト","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}},
  // OP04-024 シュガー: 【相手のターン中】【ターン1回】相手がキャラ登場時ドンキリーダーなら相手1枚レスト→自身レスト ／【登場時】相手コスト4以下1枚レスト
  "OP04-024": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}],"onOppEnter":{"when":"oppTurn","once":"turn","cond":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"fx":[{"op":"restChar","side":"opp","count":1,"optional":true},{"op":"restThis"}]}},
  // OP04-025 ジョーラ: 【相手のアタック時】ドン2レスト：相手コスト4以下1枚レスト
  "OP04-025": {"onOppAttack":[{"op":"restDonCost","n":2,"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // OP04-026 セニョール・ピンク: 【アタック時】ドン1レスト：ドンキリーダーなら相手コスト4以下1枚レスト→ターン終了時ドン1アクティブ
  "OP04-026": {"onAttack":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true},{"op":"delayedDonActivate","n":1}]}]}]},
  // OP04-027 ダディ・マスターソン: 【ドン×1】【自分のターン終了時】このキャラをアクティブ
  "OP04-027": {"onTurnEnd":[{"op":"cond","check":{"donX1":true},"then":[{"op":"activateSelf"}]}]},
  // OP04-028 ディアマンテ: 【ブロッカー】 ／【ドン×1】【自分のターン終了時】アクティブのドン2枚以上ならこのキャラをアクティブ
  "OP04-028": {"onTurnEnd":[{"op":"cond","check":{"and":[{"donX1":true},{"activeDonAtLeast":2}]},"then":[{"op":"activateSelf"}]}]},
  // OP04-029 デリンジャー: 【自分のターン終了時】ドン1アクティブ
  "OP04-029": {"onTurnEnd":[{"op":"donActivate","n":1}]},
  // OP04-030 トレーボル(c6): 【登場時】相手のレストのコスト5以下1枚KO ／【相手のアタック時】ドン2レスト：相手コスト4以下1枚レスト
  "OP04-030": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":1,"optional":true}],"onOppAttack":[{"op":"restDonCost","n":2,"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // OP04-031 ドンキホーテ・ドフラミンゴ(c10): 【登場時】相手のレストのリーダーとキャラ合計3枚を次リフレッシュロック
  "OP04-031": {"onPlay":[{"op":"lockRefresh","count":3,"includeLeader":true,"optional":true}]},
  // OP04-032 ベビー5(c1): 【自分のターン終了時】このキャラをトラッシュ：ドン2アクティブ
  "OP04-032": {"onTurnEnd":[{"op":"trashSelfCost","then":[{"op":"donActivate","n":2}]}]},
  // OP04-033 マッハバイス: 【登場時】ドンキリーダーなら相手コスト5以下1枚レスト→ターン終了時ドン1アクティブ
  "OP04-033": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"delayedDonActivate","n":1}]}]},
  // OP04-034 ラオG: 【自分のターン終了時】アクティブのドン3枚以上なら相手のレストのコスト3以下1枚KO
  "OP04-034": {"onTurnEnd":[{"op":"cond","check":{"activeDonAtLeast":3},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}]},
  // OP04-035 蜘蛛の巣がき: 【カウンター】リーダーかキャラ+4000→自キャラ1枚をアクティブ
  "OP04-035": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true}}]}},
  // OP04-036 ドンキホーテファミリー: 【カウンター】デッキ上5枚からドンキ1枚を手札に
  "OP04-036": {"counter":{"cost":0,"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"optional":true}]}},
  // OP04-037 羽撃糸: 【カウンター】ドンキリーダーならリーダーかキャラ+2000
  "OP04-037": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ドンキホーテ海賊団"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP04-038 弱ェ奴は死に方も選べねェ!!!: 【メイン】/【カウンター】相手リーダーかキャラ1枚レスト→相手のレストのコスト6以下1枚KO
  "OP04-038": {"main":{"fx":[{"op":"restChar","side":"opp","includeLeader":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":6},"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"restChar","side":"opp","includeLeader":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":6},"count":1,"optional":true}]}},
  // OP04-039 レベッカ LEADER: アタック不可 ／【起動メイン】【ターン1回】ドン1レスト：手札6枚以下ならデッキ上2枚からドレスローザ1枚を手札に(残りトラッシュ)
  "OP04-039": {"static":[{"op":"cantAttack"}],"act":{"label":"ドン1レスト:ドレスローザ回収","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"search","look":2,"count":1,"filter":{"traitIncludes":"ドレスローザ"},"rest":"trash","optional":true}]}]}]}},
  // OP04-040 クイーン LEADER: 【ドン×1】【アタック時】ライフ+手札4枚以下なら1ドロー(コスト8以上がいればライフ追加に変更・近似:1ドロー)
  "OP04-040": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"cond","check":{"totalHandLifeAtMost":4},"then":[{"op":"draw","n":1}]}]}]},
  // OP04-041 アピス: 【登場時】手札2枚捨て：デッキ上5枚から東の海1枚を手札に
  "OP04-041": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"東の海"},"optional":true}]}]},
  // OP04-042 いっぽんマツ: 【登場時】属性(斬)1枚+3000→デッキ上1枚トラッシュ
  "OP04-042": {"onPlay":[{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"attr":"斬"}},{"op":"deckToTrash","n":1}]},
  // OP04-043 うるティ(c3): 【ドン×1】【アタック時】コスト2以下1枚を手札かデッキ下に戻す
  "OP04-043": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"bounce","side":"any","maxCost":2,"count":1,"optional":true}]}]},
  // OP04-044 カイドウ(c10): 【登場時】コスト8以下1枚＋コスト3以下1枚を手札に戻す
  "OP04-044": {"onPlay":[{"op":"bounce","side":"any","maxCost":8,"count":1,"optional":true},{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]},
  // OP04-046 クイーン(c4): 【登場時】百獣リーダーならデッキ上7枚から「疫災弾」か「氷鬼」2枚を手札に
  "OP04-046": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"search","look":7,"count":2,"filter":{"or":[{"nameIncludes":"疫災弾"},{"nameIncludes":"氷鬼"}]},"optional":true}]}]},
  // OP04-047 氷鬼: 【自分のターン中】このキャラがコスト5以下とバトル終了時、その相手をデッキ下(近似:ブロック時)
  "OP04-047": {"onBlock":[{"op":"bounceAttackerToBottom","maxCost":5}]},
  // OP04-048 ササキ(c3): 【登場時】手札全てを山に戻しシャッフル→戻した枚数引く
  "OP04-048": {"onPlay":[{"op":"selfHandToDeckDraw"}]},
  // OP04-049 ジャック(c2): 【KO時】1ドロー
  "OP04-049": {"onKO":[{"op":"draw","n":1}]},
  // OP04-050 ハンガーさん: 【起動メイン】手札1捨て＋レスト：1ドロー
  "OP04-050": {"act":{"label":"手札1捨て+レスト:1ドロー","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"draw","n":1}]}]}},
  // OP04-051 フーズ・フー(c1): 【登場時】デッキ上5枚から「自身」以外の百獣1枚を手札に
  "OP04-051": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"百獣海賊団"},"exclude":"フーズ・フー","optional":true}]},
  // OP04-052 ブラックマリア(c3): 【起動メイン】ドン2レスト＋このキャラレスト：1ドロー
  "OP04-052": {"act":{"label":"ドン2+レスト:1ドロー","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"draw","n":1}]}]}},
  // OP04-053 ページワン(c4): 【ドン×1】【ターン1回】自分がイベント発動時、1ドロー→手札1枚をデッキ下
  "OP04-053": {"onSelfEvent":{"once":"turn","cond":{"donX1":true},"fx":[{"op":"draw","n":1},{"op":"handToBottom","n":1}]}},
  // OP04-055 疫災弾: 【メイン】手札の「氷鬼」1枚を捨て＋コスト4以下1枚をデッキ下：トラッシュから「氷鬼」を登場
  "OP04-055": {"main":{"fx":[{"op":"discardCost","count":1,"filter":{"nameIncludes":"氷鬼"},"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true},{"op":"reviveFromTrash","filter":{"nameIncludes":"氷鬼"}}]}]}},
  // OP04-057 龍巻壊風: 【カウンター】リーダーかキャラ+4000→コスト1以下1枚を持ち主のデッキ下
  "OP04-057": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"deckBottom","side":"any","filter":{"maxCost":1},"count":1,"optional":true}]}},
  // OP04-058 クロコダイル LEADER: 【相手のターン中】【ターン1回】自分のドンが自分の効果で戻された時、ドン1アクティブ追加
  "OP04-058": {"onDonReturned":[{"op":"cond","once":"turn","check":{"oppTurn":true},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  // OP04-059 アイスバーグ: 【相手のアタック時】ドン-1：W7リーダーならこのターン【ブロッカー】
  "OP04-059": {"onOppAttack":[{"op":"donMinus","n":1,"then":[{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"giveKeyword","target":"self","kw":"blocker","duration":"turn"}]}]}]},
  // OP04-060 クロコダイル(c8): 【登場時】ドン-2：B・Wリーダーならデッキトップをライフへ ／【相手のアタック時】【ターン1回】ドン-1：1ドロー＋手札1枚捨て
  "OP04-060": {"onPlay":[{"op":"donMinus","n":2},{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"lifeAddFromDeck","n":1}]}],"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  /* ===== OP04 バッチ2（青B・W/W7・黒ドレスローザ・黄ワノ国/ビッグマム・061-119） ===== */
  // OP04-061 トム: 【起動メイン】自身トラッシュ：W7リーダーならドン1レスト追加
  "OP04-061": {"act":{"label":"自身トラッシュ:W7でドン1レスト追加","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]}},
  // OP04-063 フランキー(c1): 【相手のアタック時】【ターン1回】ドン-1：W7リーダーならリーダーかキャラ+1000
  "OP04-063": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}]}]},
  // OP04-064 ミス・オールサンデー: 【登場時】ドン1レスト追加→場のドン6枚以上で1ドロー
  "OP04-064": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"rested"},{"op":"cond","check":{"donAtLeast":6},"then":[{"op":"draw","n":1}]}]},
  // OP04-065 マリアンヌ: 【登場時】B・Wリーダーなら相手コスト5以下1枚は次の自分ターン開始までアタック不可
  "OP04-065": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"setAttackBan","filter":{"maxCost":5},"count":1,"duration":"untilNextStart","optional":true}]}]},
  // OP04-066 ミキータ: 【登場時】デッキ上5枚からB・W1枚を手札に
  "OP04-066": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"B・W"},"optional":true}]},
  // OP04-068 ヨコヅナ: 【ブロッカー】 ／【相手のアタック時】ドン-1：相手コスト2以下1枚を手札に戻す
  "OP04-068": {"onOppAttack":[{"op":"donMinus","n":1,"then":[{"op":"bounce","side":"opp","maxCost":2,"count":1,"optional":true}]}]},
  // OP04-069 ベンサム: 【相手のアタック時】ドン-1：このキャラの元々パワーを相手アタッカーと同じに(近似:+2000)
  "OP04-069": {"onOppAttack":[{"op":"donMinus","n":1,"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"battle":true}]}]},
  // OP04-070 Mr.3(ギャルディーノ): 【相手のアタック時】【ターン1回】ドン-1：相手キャラ1枚-1000
  "OP04-070": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}]},
  // OP04-071 Mr.4(ベーブ): 【相手のアタック時】ドン-1：このバトル中【ブロッカー】＋1000
  "OP04-071": {"onOppAttack":[{"op":"donMinus","n":1,"then":[{"op":"giveKeyword","target":"self","kw":"blocker","duration":"turn"},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  // OP04-072 Mr.5(ジェム): 【相手のアタック時】【ターン1回】ドン-2＋このキャラレスト：相手コスト4以下1枚KO
  "OP04-072": {"onOppAttack":[{"op":"donMinus","n":2,"once":"turn","then":[{"op":"restSelfCost","then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}]},
  // OP04-073 Mr.13&ミス・フライデー: 【起動メイン】このキャラと自分のB・W1枚をトラッシュ：ドン1アクティブ追加
  "OP04-073": {"act":{"label":"自身＋B・Wトラッシュ:ドン1アクティブ追加","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"B・W"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]}},
  // OP04-074 カラーズトラップ: 【カウンター】ドン-1：リーダーかキャラ+1000→相手コスト4以下1枚レスト
  "OP04-074": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}},
  // OP04-075 鼻空想砲: 【カウンター】リーダーかキャラ+6000→自ライフ2枚以下ならドン1レスト追加
  "OP04-075": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":6000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // OP04-076 弱ェってのは…罪なもんだ…: 【カウンター】ドン-1：リーダーかキャラ+1000
  "OP04-076": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true}]}},
  // OP04-079 オオロンブス: 【起動メイン】【ターン1回】相手キャラ1枚コスト-4＋デッキ上2枚トラッシュ→自分のドレスローザ1枚をKO
  "OP04-079": {"act":{"label":"相手コスト-4＋デッキ2枚トラッシュ→自ドレスローザKO","cost":{},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true},{"op":"deckToTrash","n":2},{"op":"trashOwnCharCost","filter":{"traitIncludes":"ドレスローザ"}}]}},
  // OP04-080 ギャッツ: 【登場時】ドレスローザ1枚はアクティブのキャラにもアタックできる
  "OP04-080": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"ドレスローザ"}}]},
  // OP04-081 キャベンディッシュ: 【ドン×1】アクティブにもアタック可 ／【アタック時】リーダーをレスト：相手コスト1以下1枚KO→デッキ上2枚トラッシュ
  "OP04-081": {"static":[{"op":"staticKeyword","kw":"attackActive","cond":{"donX1":true}}],"onAttack":[{"op":"restOwnAsCost","filter":{"type":"LEADER"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]},
  // OP04-082 キュロス: KOされる代わりにリーダーか「コリーダコロシアム」をレスト ／【登場時】レベッカリーダーなら相手コスト1以下1枚KO→デッキ上1枚トラッシュ
  "OP04-082": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"pay":"restOwnCards","n":1,"filter":{"or":[{"type":"LEADER"},{"nameIncludes":"コリーダコロシアム"}]}}],"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"レベッカ"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"deckToTrash","n":1}]}]},
  // OP04-083 サボ(c5): 【ブロッカー】 ／【登場時】自キャラ全ては次の自分ターン開始まで効果でKOされない→2ドロー＋手札2枚捨て
  "OP04-083": {"onPlay":[{"op":"grantTraitKoImmune","duration":"untilNextStart","filter":{"type":"CHAR"}},{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP04-084 ステューシー(c2): 【登場時】デッキ上3枚から「自身」以外のコスト2以下『CP』を登場(残りトラッシュ)
  "OP04-084": {"onPlay":[{"op":"playFromDeck","look":3,"filter":{"traitIncludes":"CP","maxCost":2}}]},
  // OP04-085 スレイマン: 【登場時】/【アタック時】ドレスローザリーダーなら相手キャラ1枚コスト-2→デッキ上1枚トラッシュ
  "OP04-085": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ドレスローザ"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true},{"op":"deckToTrash","n":1}]}],"onAttack":[{"op":"cond","check":{"leaderTraitIncludes":"ドレスローザ"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true},{"op":"deckToTrash","n":1}]}]},
  // OP04-086 チンジャオ: 【ドン×1】バトルで相手をKOした時、2ドロー＋手札2枚捨て(近似:アタック時)
  "OP04-086": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  // OP04-088 ハイルディン: 【起動メイン】リーダーをレスト：相手キャラ1枚コスト-4
  "OP04-088": {"act":{"label":"リーダーレスト:相手コスト-4","cost":{},"fx":[{"op":"restOwnAsCost","filter":{"type":"LEADER"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]}]}},
  // OP04-090 モンキー・D・ルフィ(c7): アクティブにもアタック可 ／【起動メイン】【ターン1回】トラッシュ7枚をデッキ下：このキャラをアクティブ＋次リフレッシュロック(自分)
  "OP04-090": {"static":[{"op":"staticKeyword","kw":"attackActive"}],"act":{"label":"トラッシュ7枚デッキ下:自身アクティブ","cost":{},"fx":[{"op":"trashToBottomCost","n":7,"then":[{"op":"activateSelf"}]}]}},
  // OP04-091 レオ(c1): 【登場時】リーダーをレスト：ドレスローザリーダーなら相手コスト1以下1枚KO→デッキ上2枚トラッシュ
  "OP04-091": {"onPlay":[{"op":"restOwnAsCost","filter":{"type":"LEADER"},"then":[{"op":"cond","check":{"leaderTraitIncludes":"ドレスローザ"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"deckToTrash","n":2}]}]}]},
  // OP04-092 レベッカ(c1): 【登場時】デッキ上3枚から「自身」以外のドレスローザ1枚を手札に(残りトラッシュ)
  "OP04-092": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ドレスローザ"},"exclude":"レベッカ","rest":"trash","optional":true}]},
  // OP04-093 ゴムゴムの大猿王銃: 【メイン】ドレスローザ1枚+6000→トラッシュ15枚以上なら【ダブルアタック】
  "OP04-093": {"main":{"fx":[{"op":"powerMod","side":"self","amount":6000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ドレスローザ"}},{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"traitIncludes":"ドレスローザ"}}]}]}},
  // OP04-094 雷の破壊剣: 【メイン】相手コスト4以下1枚KO(トラッシュ15枚以上ならコスト6以下)
  "OP04-094": {"main":{"fx":[{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"ko","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}],"else":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP04-095 バ～～～～リアッ!!: 【カウンター】リーダーかキャラ+2000→トラッシュ15枚以上ならさらに+2000
  "OP04-095": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"trashAtLeast":15},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP04-096 コリーダコロシアム(STAGE): ドレスローザリーダーなら自分のドレスローザは登場ターンにキャラへアタック可
  "OP04-096": {"static":[{"op":"allyKeyword","kw":"rushChar","cond":{"leaderTraitIncludes":"ドレスローザ"},"filter":{"traitIncludes":"ドレスローザ"}}]},
  // OP04-097 お玉(c1): 【登場時】相手コスト3以下の動物かSMILE1枚を相手ライフ上に表向きで加える
  "OP04-097": {"onPlay":[{"op":"charToLife","filter":{"maxCost":3,"or":[{"traitIncludes":"動物"},{"traitIncludes":"SMILE"}]},"faceUp":true,"optional":true}]},
  // OP04-098 おトコ: 【登場時】手札からワノ国2枚を捨てる：自ライフ1枚以下ならデッキ上1枚をライフに
  "OP04-098": {"onPlay":[{"op":"discardCost","count":2,"filter":{"traitIncludes":"ワノ国"},"then":[{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"lifeAddFromDeck","n":1}]}]}]},
  // OP04-101 カルメル: 【自分のターン中】【登場時】1ドロー
  "OP04-101": {"onPlay":[{"op":"draw","n":1}]},
  // OP04-102 錦えもん(c6): 【起動メイン】【ターン1回】ドン1レスト＋ライフ上か下1枚を手札に：このキャラをアクティブ
  "OP04-102": {"act":{"label":"ドン1+ライフ手札:自身アクティブ","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"lifeCost","pos":"choose","then":[{"op":"activateSelf"}]}]}]}},
  // OP04-103 光月日和: 【登場時】ワノ国のリーダーかキャラ1枚+1000
  "OP04-103": {"onPlay":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ワノ国"}}]},
  // OP04-105 シャーロット・アマンド: 【起動メイン】【ターン1回】手札の【トリガー】1枚を捨てる：相手コスト2以下1枚レスト
  "OP04-105": {"act":{"label":"トリガー1捨て:相手2以下レスト","cost":{},"fx":[{"op":"discardCost","count":1,"filter":{"hasTrigger":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP04-106 シャーロット・ババロア: 【ドン×1】自ライフが相手より少ないと+1000
  "OP04-106": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfLifeLessThanOpp":true}]},"power":1000}]},
  // OP04-108 シャーロット・モスカート: 【ドン×1】【バニッシュ】
  "OP04-108": {"static":[{"op":"staticKeyword","kw":"banish","cond":{"donX1":true}}]},
  // OP04-109 トの康: 【起動メイン】自身トラッシュ：ワノ国のリーダーかキャラ1枚+3000
  "OP04-109": {"act":{"label":"自身トラッシュ:ワノ国+3000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"ワノ国"}}]}]}},
  // OP04-110 パウンド: 【ブロッカー】 ／【KO時】相手コスト3以下1枚を相手ライフに表向きで加える
  "OP04-110": {"onKO":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true}]},
  // OP04-111 ヘラ: 【起動メイン】このキャラ以外のホーミーズ1枚をトラッシュ＋このキャラレスト：「シャーロット・リンリン」1枚をアクティブ
  "OP04-111": {"act":{"label":"ホーミーズ1トラッシュ＋レスト:リンリンをアクティブ","cost":{"restSelf":true},"fx":[{"op":"trashOwnCharCost","filter":{"traitIncludes":"ホーミーズ"},"excludeSelf":true,"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"nameIncludes":"シャーロット・リンリン"}}]}]}},
  // OP04-112 ヤマト(c9): 【登場時】お互いライフ合計以下のコストの相手キャラ1枚KO→自ライフ1枚以下ならデッキ上1枚をライフに
  "OP04-112": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxCostFrom":"totalLife"},"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // OP04-115 銃・擬鬼: 【メイン】ライフ上か下1枚を手札に：ワノ国1枚に【ダブルアタック】
  "OP04-115": {"main":{"fx":[{"op":"lifeCost","pos":"choose","then":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"traitIncludes":"ワノ国"}}]}]}},
  // OP04-116 悪魔風脚 ほほ肉シュート: 【カウンター】リーダーかキャラ+6000→お互いライフ合計4枚以下なら相手コスト2以下1枚KO
  "OP04-116": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":6000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"totalLifeAtMost":4},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP04-117 天上の火: 【メイン】相手コスト3以下1枚を相手ライフに表向きで加える
  "OP04-117": {"main":{"fx":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true}]}},
  // OP04-118 ネフェルタリ・ビビ(c7): このキャラ以外のコスト3以上の赤キャラは【速攻】
  "OP04-118": {"static":[{"op":"allyKeyword","kw":"rush","filter":{"color":"赤","minBaseCost":3}}]},
  // OP04-119 ドンキホーテ・ロシナンテ(c8): 【相手のターン中】このキャラがレストなら自分のアクティブの元々コスト5キャラは効果でKOされない(近似) ／【登場時】レスト：手札からコスト5の緑キャラを登場
  "OP04-119": {"onPlay":[{"op":"restSelfCost","then":[{"op":"playCharFromHand","filter":{"cost":5,"color":"緑"},"count":1,"optional":true}]}]},
  /* ===== OP03（強大な敵）バッチ1（赤白ひげ・緑東の海・001-060） ===== */
  // OP03-001 ポートガス・D・エース LEADER: アタック/被アタック時、イベント/ステージを任意枚捨て1枚ごと+1000(近似:最大2)
  "OP03-001": {"onAttack":[{"op":"discardCost","count":1,"optional":true,"filter":{"or":[{"type":"EVENT"},{"type":"STAGE"}]},"then":[{"op":"leaderBuff","amount":1000,"duration":"battle"}]}],"onOppAttack":[{"op":"discardCost","count":1,"optional":true,"filter":{"or":[{"type":"EVENT"},{"type":"STAGE"}]},"then":[{"op":"leaderBuff","amount":1000,"duration":"battle"}]}]},
  // OP03-002 アディオ: 【ドン×1】【アタック時】相手はこのバトル中パワー2000以下のキャラの【ブロッカー】不可
  "OP03-002": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"denyBlocker","all":true,"filter":{"maxEffPower":2000}}]}]},
  // OP03-003 イゾウ(c1): 【登場時】デッキ上5枚から「自身」以外の白ひげ1枚を手札に
  "OP03-003": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"白ひげ海賊団"},"exclude":"イゾウ","optional":true}]},
  // OP03-004 クリエル: 登場ターンはリーダーにアタック不可 ／【ドン×1】【速攻】
  "OP03-004": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"donX1":true}}]},
  // OP03-005 サッチ: 【起動メイン】【ターン1回】このキャラ+2000→ターン終了時このキャラをトラッシュ
  "OP03-005": {"act":{"label":"+2000(ターン終了時トラッシュ)","cost":{},"fx":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"},{"op":"scheduleTurnEnd","fx":[{"op":"trashSelfCost"}]}]}},
  // OP03-008 バギー(c1): 斬とのバトルでKOされない ／【登場時】デッキ上5枚から赤イベント1枚を手札に
  "OP03-008": {"static":[{"op":"condBuff","battleImmune":true}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"赤","type":"EVENT"},"optional":true}]},
  // OP03-009 ハルタ: 【起動メイン】【ターン1回】リーダーかキャラ1枚にレストのドン1付与
  "OP03-009": {"act":{"label":"レストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  // OP03-011 ブラメンコ: 【ドン×1】【アタック時】相手キャラ1枚-2000
  "OP03-011": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]},
  // OP03-012 マーシャル・D・ティーチ(c4): 【アタック時】パワー4000以上の赤キャラをトラッシュ：1ドロー＋このキャラ+1000
  "OP03-012": {"onAttack":[{"op":"trashOwnCharCost","filter":{"color":"赤","minEffPower":4000},"excludeSelf":true,"then":[{"op":"draw","n":1},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  // OP03-013 マルコ(c5): 【自分のターン中】【登場時】相手のパワー3000以下1枚KO ／【KO時】イベント1枚捨て：トラッシュからレスト登場
  "OP03-013": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}],"onKO":[{"op":"discardCost","count":1,"optional":true,"filter":{"type":"EVENT"},"then":[{"op":"reviveSelfRested"}]}]},
  // OP03-014 モンキー・D・ガープ(c3): 【アタック時】手札からコスト1の赤キャラ1枚を登場
  "OP03-014": {"onAttack":[{"op":"playCharFromHand","filter":{"cost":1,"color":"赤"},"count":1,"optional":true}]},
  // OP03-015 リム(c3): 【ブロッカー】 ／【相手のターン中】このキャラがKOされた時、相手リーダーかキャラ1枚-2000
  "OP03-015": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}]},
  // OP03-016 炎帝: 【メイン】エースリーダーなら相手のパワー8000以下1枚KO＋リーダー【ダブルアタック】＋3000
  "OP03-016": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ポートガス・D・エース"},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":8000},"count":1,"optional":true},{"op":"leaderDoubleAttack"},{"op":"leaderBuff","amount":3000,"duration":"turn"}]}]}},
  // OP03-017 十字火: 【メイン】/【カウンター】白ひげリーダーなら相手キャラ1枚-4000
  "OP03-017": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true}]}]}},
  // OP03-018 火拳: 【メイン】イベント1枚捨て：相手のパワー5000以下1枚＋パワー4000以下1枚KO
  "OP03-018": {"main":{"fx":[{"op":"discardCost","count":1,"filter":{"type":"EVENT"},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":5000},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}]}},
  // OP03-019 火達磨: 【メイン】リーダー+4000
  "OP03-019": {"main":{"fx":[{"op":"leaderBuff","amount":4000,"duration":"turn"}]}},
  // OP03-020 ストライカー(STAGE): 【起動メイン】ドン2レスト＋このステージレスト：エースリーダーならデッキ上5枚からイベント1枚を手札に
  "OP03-020": {"act":{"label":"ドン2＋レスト:イベント回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderNameIncludes":"ポートガス・D・エース"},"then":[{"op":"search","look":5,"count":1,"filter":{"type":"EVENT"},"optional":true}]}]}]}},
  // OP03-021 クロ LEADER: 【起動メイン】ドン3レスト＋東の海2枚レスト：このリーダーをアクティブ＋相手コスト5以下1枚レスト
  "OP03-021": {"act":{"label":"ドン3＋東の海2レスト:リーダーアクティブ＋相手レスト","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"restOwnAsCost","count":2,"filter":{"traitIncludes":"東の海"},"then":[{"op":"activateOwnChar","incLeader":true,"count":0},{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}]}},
  // OP03-024 ギン: 【登場時】東の海リーダーなら相手コスト4以下2枚をレスト
  "OP03-024": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"東の海"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":2,"optional":true}]}]},
  // OP03-025 クリーク: 【登場時】手札1枚捨て：相手のレストのコスト4以下2枚KO ／【ドン×1】【ダブルアタック】
  "OP03-025": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"donX1":true}}],"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":2,"optional":true}]}]},
  // OP03-026 クロオビ: 【登場時】東の海リーダーなら相手キャラ1枚をレスト
  "OP03-026": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"東の海"},"then":[{"op":"restChar","side":"opp","count":1,"optional":true}]}]},
  // OP03-027 シャム: 【登場時】東の海リーダーなら相手コスト2以下1枚レスト＋「ブチ」がいなければ手札から「ブチ」を登場
  "OP03-027": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"東の海"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"cond","check":{"noSelfChar":{"nameIncludes":"ブチ"}},"then":[{"op":"playSpecificFromHand","name":"ブチ","optional":true}]}]}]},
  // OP03-028 ジャンゴ: 【登場時】東の海のリーダー/コスト6以下キャラ1枚をアクティブ か このキャラと相手キャラ1枚をレスト
  "OP03-028": {"onPlay":[{"op":"chooseOption","options":[{"label":"東の海のリーダー/コスト6以下1枚をアクティブ","fx":[{"op":"activateOwnChar","incLeader":true,"count":1,"filter":{"restedOnly":true,"traitIncludes":"東の海","maxCost":6}}]},{"label":"このキャラと相手1枚をレスト","fx":[{"op":"restThis"},{"op":"restChar","side":"opp","count":1,"optional":true}]}]}]},
  // OP03-029 チュウ: 【登場時】相手のレストのコスト4以下1枚KO
  "OP03-029": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":1,"optional":true}]},
  // OP03-030 ナミ(c2): 【登場時】デッキ上5枚から「ナミ」以外の緑・東の海1枚を手札に
  "OP03-030": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"緑","traitIncludes":"東の海"},"exclude":"ナミ","optional":true}]},
  // OP03-032 バギー(c3): 斬とのバトルでKOされない
  "OP03-032": {"static":[{"op":"condBuff","battleImmune":true}]},
  // OP03-034 ブチ: 【登場時】相手のレストのコスト2以下1枚KO
  "OP03-034": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":2},"count":1,"optional":true}]},
  // OP03-036 杓死: 【メイン】東の海1枚をレスト：自分の「クロ」1枚をアクティブ
  "OP03-036": {"main":{"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"東の海"},"then":[{"op":"activateOwnChar","incLeader":true,"count":1,"filter":{"restedOnly":true,"nameIncludes":"クロ"}}]}]}},
  // OP03-037 歯ガム: 【メイン】東の海1枚をレスト：相手のレストのコスト3以下1枚KO
  "OP03-037": {"main":{"fx":[{"op":"restOwnAsCost","filter":{"traitIncludes":"東の海"},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}]}},
  // OP03-038 猛毒ガス弾『M・H・５』: 【メイン】相手コスト2以下2枚をレスト
  "OP03-038": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":2,"optional":true}]}},
  // OP03-039 ワン・ツー・ジャンゴ: 【メイン】相手コスト1以下1枚レスト→自キャラ1枚+1000
  "OP03-039": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":1,"optional":true}]}},
  // OP03-041 ウソップ(c4): 【速攻】 ／【ドン×1】アタックでライフダメージ時、デッキ上7枚トラッシュ(近似:アタック時)
  "OP03-041": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"deckToTrash","n":7,"optional":true}]}]},
  // OP03-042 ウソップ海賊団: 【登場時】トラッシュの青の「ウソップ」1枚を手札に
  "OP03-042": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"青","nameIncludes":"ウソップ"}}]},
  // OP03-043 ガイモン: ライフダメージ時、デッキ上3枚トラッシュしこのキャラをトラッシュ(近似:アタック時)
  "OP03-043": {"onAttack":[{"op":"deckToTrash","n":3,"optional":true}]},
  // OP03-044 カヤ: 【登場時】2ドロー＋手札2枚捨て
  "OP03-044": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP03-045 カルネ: 【ブロッカー】 ／【相手のターン中】デッキ20枚以下で+3000
  "OP03-045": {"static":[{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"deckAtMost":20}]},"power":3000}]},
  // OP03-047 ゼフ(c5): 【ドン×1】アタックでライフダメージ時デッキ上7枚トラッシュ(近似) ／【登場時】コスト3以下1枚を手札に戻し、デッキ上2枚トラッシュ
  "OP03-047": {"onPlay":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true},{"op":"deckToTrash","n":2,"optional":true}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"deckToTrash","n":7,"optional":true}]}]},
  // OP03-048 ノジコ: 【登場時】ナミリーダーなら相手コスト5以下1枚を手札に戻す
  "OP03-048": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ナミ"},"then":[{"op":"bounce","side":"opp","maxCost":5,"count":1,"optional":true}]}]},
  // OP03-049 パティ: 【登場時】デッキ20枚以下ならコスト3以下1枚を手札に戻す
  "OP03-049": {"onPlay":[{"op":"cond","check":{"deckAtMost":20},"then":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]}]},
  // OP03-050 ブードル: 【ブロッカー】 ／【KO時】デッキ上1枚トラッシュ
  "OP03-050": {"onKO":[{"op":"deckToTrash","n":1,"optional":true}]},
  // OP03-051 ベルメール: 【ドン×1】ライフダメージ時デッキ上7枚トラッシュ(近似) ／【KO時】デッキ上3枚トラッシュ
  "OP03-051": {"onKO":[{"op":"deckToTrash","n":3,"optional":true}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"deckToTrash","n":7,"optional":true}]}]},
  // OP03-053 ヨサク&ジョニー: 【ドン×1】デッキ20枚以下で+2000
  "OP03-053": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"deckAtMost":20}]},"power":2000}]},
  // OP03-054 ウソーーップ輪ごーむっ!!!: 【カウンター】リーダーかキャラ+2000→デッキ上1枚トラッシュ
  "OP03-054": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"deckToTrash","n":1,"optional":true}]}},
  // OP03-055 ゴムゴムの大槌: 【カウンター】手札1捨て：リーダー+4000→デッキ上2枚トラッシュ
  "OP03-055": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"leaderBuff","amount":4000,"duration":"battle"},{"op":"deckToTrash","n":2,"optional":true}]}]}},
  // OP03-056 サンジのピラフ: 【メイン】2ドロー
  "OP03-056": {"main":{"fx":[{"op":"draw","n":2}]}},
  // OP03-057 三・千・世・界: 【メイン】コスト5以下1枚を持ち主のデッキ下
  "OP03-057": {"main":{"fx":[{"op":"deckBottom","side":"any","filter":{"maxCost":5},"count":1,"optional":true}]}},
  // OP03-058 アイスバーグ LEADER: アタック不可 ／【起動メイン】ドン-1＋このリーダーレスト：手札からコスト5以下のGCを登場
  "OP03-058": {"static":[{"op":"cantAttack"}],"act":{"label":"ドン-1＋レスト:GCを登場","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"restOwnAsCost","filter":{"type":"LEADER"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"GC","maxCost":5},"count":1,"optional":true}]}]}},
  // OP03-059 カク(c5): 【アタック時】ドン-1：このバトル中【バニッシュ】
  "OP03-059": {"onAttack":[{"op":"donMinus","n":1},{"op":"giveKeyword","target":"self","kw":"banish","duration":"battle"}]},
  // OP03-060 カリファ(c4): 【アタック時】ドン-1：2ドロー＋手札1枚捨て
  "OP03-060": {"onAttack":[{"op":"donMinus","n":1},{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  /* ===== OP03 バッチ2（青W7/GC・黒CP9/海軍・黄ビッグマム・061-119） ===== */
  // OP03-062 ココロ: 【登場時】デッキ上5枚から「自身」以外のW7 1枚を手札に
  "OP03-062": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"W7"},"exclude":"ココロ","optional":true}]},
  // OP03-063 ザンバイ: 【ブロッカー】 ／【登場時】ドン-1：W7リーダーなら1ドロー
  "OP03-063": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"draw","n":1}]}]},
  // OP03-064 タイルストン: 【KO時】GCリーダーならドン1レスト追加
  "OP03-064": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"GC"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP03-066 パウリー: 【登場時】ドン2レスト：ドン1アクティブ追加→場のドン8以上なら相手コスト4以下1枚KO
  "OP03-066": {"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}]},
  // OP03-067 ピープリー・ルル: 【ドン×1】【アタック時】GCリーダーならドン1レスト追加
  "OP03-067": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"leaderTraitIncludes":"GC"}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP03-068 ミノゼブラ: 【バニッシュ】 ／【KO時】インペルダウンリーダーならドン1レスト追加
  "OP03-068": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP03-069 ミノリノケロス: 【KO時】インペルダウンリーダーなら2ドロー＋手札1枚捨て
  "OP03-069": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // OP03-070 モンキー・D・ルフィ(c6): 【登場時】ドン-1＋コスト5キャラ1枚捨て：このターン【速攻】
  "OP03-070": {"onPlay":[{"op":"donMinus","n":1},{"op":"discardCost","count":1,"optional":true,"filter":{"cost":5,"type":"CHAR"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP03-071 ロブ・ルッチ(c5): 【アタック時】ドン-1：相手コスト5以下1枚をレスト
  "OP03-071": {"onAttack":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]},
  // OP03-072 ゴムゴムのJET銃乱打: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP03-072": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP03-073 船底解体斬り: 【メイン】ドン-1：W7リーダーなら相手コスト2以下1枚KO
  "OP03-073": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  // OP03-074 独楽結び: 【メイン】ドン-2：相手コスト4以下1枚を持ち主のデッキ下
  "OP03-074": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true}]}},
  // OP03-075 ガレーラカンパニー(STAGE): 【起動メイン】レスト：アイスバーグリーダーならドン1レスト追加
  "OP03-075": {"act":{"label":"レスト:アイスバーグでドン1レスト追加","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"アイスバーグ"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // OP03-076 ロブ・ルッチ LEADER: 【自分のターン中】【ターン1回】手札2枚捨て：相手キャラがKOされた時、このリーダーをアクティブ(近似:手札2捨てでリーダーアクティブ)
  "OP03-076": {"act":{"label":"手札2捨て:リーダーをアクティブ","cost":{},"fx":[{"op":"discardCost","count":2,"then":[{"op":"activateOwnChar","incLeader":true,"count":0}]}]}},
  // OP03-078 イッショウ(c8): 【ドン×1】【自分のターン中】相手キャラ全コスト-3 ／【登場時】相手手札6枚以上なら相手手札2枚捨て
  "OP03-078": {"static":[{"op":"oppCostMod","amount":-3,"cond":{"and":[{"donX1":true},{"selfTurn":true}]}}],"onPlay":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppDiscard","n":2}]}]},
  // OP03-079 ヴェルゴ(c5): 【ドン×1】バトルでKOされない
  "OP03-079": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"donX1":true}}]},
  // OP03-080 カク(c5): 【登場時】トラッシュの『CP』2枚をデッキ下：相手コスト3以下1枚KO
  "OP03-080": {"onPlay":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"CP"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP03-081 カリファ(c4): 【登場時】2ドロー＋手札2枚捨て→相手キャラ1枚コスト-2
  "OP03-081": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":2},{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]},
  // OP03-083 コーギー: 【登場時】デッキ上5枚から2枚をトラッシュ
  "OP03-083": {"onPlay":[{"op":"search","look":5,"count":0,"optional":true},{"op":"deckToTrash","n":2}]},
  // OP03-086 スパンダム: 【登場時】CPリーダーならデッキ上3枚から「自身」以外のCP1枚を手札に(残りトラッシュ)
  "OP03-086": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"CP"},"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"CP"},"exclude":"スパンダム","rest":"trash","optional":true}]}]},
  // OP03-088 フクロウ: 効果でKOされない ／【ブロッカー】
  "OP03-088": {"static":[{"op":"effectImmune"}]},
  // OP03-089 ブランニュー: 【登場時】デッキ上3枚から「自身」以外の海軍1枚を手札に(残りトラッシュ)
  "OP03-089": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"海軍"},"exclude":"ブランニュー","rest":"trash","optional":true}]},
  // OP03-090 ブルーノ: 【ドン×1】【ブロッカー】 ／【KO時】トラッシュからコスト4以下のCPをレスト登場
  "OP03-090": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"donX1":true}}],"onKO":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"CP"}}]},
  // OP03-091 ヘルメッポ: 【登場時】相手の元々効果のないキャラ1枚をこのターンコスト0に
  "OP03-091": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-99,"duration":"turn","optional":true,"filter":{"noEffect":true}}]},
  // OP03-092 ロブ・ルッチ(c6): 【登場時】トラッシュの『CP』2枚をデッキ下：このターン【速攻】
  "OP03-092": {"onPlay":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"CP"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP03-093 ワンゼ: 【登場時】手札1枚捨て：CPリーダーなら相手コスト1以下1枚KO
  "OP03-093": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"CP"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]}]},
  // OP03-094 空気開扉: 【メイン】CPリーダーならデッキ上5枚からコスト5以下のCPを登場(残りトラッシュ)
  "OP03-094": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"CP"},"then":[{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"CP","maxCost":5}},{"op":"deckToTrash","n":4,"optional":true}]}]}},
  // OP03-095 石鹼羊: 【メイン】相手キャラ2枚をコスト-2
  "OP03-095": {"main":{"fx":[{"op":"addCostBuff","side":"opp","count":2,"amount":-2,"duration":"turn","optional":true}]}},
  // OP03-096 嵐脚 周断: 【メイン】相手のコスト0キャラかコスト3以下のステージ1枚をKO
  "OP03-096": {"main":{"fx":[{"op":"chooseOption","options":[{"label":"相手のコスト0キャラをKO","fx":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]},{"label":"相手のコスト3以下ステージをKO","fx":[{"op":"koStage","filter":{"maxCost":3},"optional":true}]}]}]}},
  // OP03-097 六王銃: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP03-097": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP03-098 エニエス・ロビー(STAGE): 【起動メイン】レスト：CPリーダーなら相手キャラ1枚コスト-2
  "OP03-098": {"act":{"label":"レスト:CPで相手コスト-2","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"CP"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]}},
  // OP03-099 シャーロット・カタクリ LEADER: 【ドン×1】【アタック時】ライフ確認＋このリーダー+1000(近似:+1000)
  "OP03-099": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"leaderBuff","amount":1000,"duration":"battle"}]}]},
  // OP03-102 サンジ(c2): 【ドン×2】【アタック時】ライフ上か下1枚を手札に：デッキ上1枚をライフに
  "OP03-102": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"lifeCost","pos":"choose","then":[{"op":"lifeAddFromDeck","n":1}]}]}]},
  // OP03-104 シャーリー(c3): 【ブロッカー】 ／【登場時】ライフ確認(情報)
  "OP03-104": {"onPlay":[{"op":"peekLifeTopPlace"}]},
  // OP03-105 シャーロット・オーブン(c3): 【ドン×1】【アタック時】手札の【トリガー】1枚を捨てる：このキャラ+3000
  "OP03-105": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"filter":{"hasTrigger":true},"then":[{"op":"powerMod","side":"self","target":"self","amount":3000,"battle":true}]}]}]},
  // OP03-108 シャーロット・クラッカー(c4): 【ドン×1】自ライフが相手より少ないと【ダブルアタック】＋1000
  "OP03-108": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"and":[{"donX1":true},{"selfLifeLessThanOpp":true}]}},{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfLifeLessThanOpp":true}]},"power":1000}]},
  // OP03-109 シャーロット・シフォン: 【登場時】ライフ上か下1枚をトラッシュ：デッキ上1枚をライフに
  "OP03-109": {"onPlay":[{"op":"lifeCost","action":"trash","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // OP03-110 シャーロット・スムージー(c4): 【アタック時】ライフ上か下1枚を手札に：このキャラ+2000
  "OP03-110": {"onAttack":[{"op":"lifeCost","pos":"choose","then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"battle":true}]}]},
  // OP03-112 シャーロット・プリン(c1): 【登場時】デッキ上4枚から「自身」以外のビッグマムか「サンジ」1枚を手札に
  "OP03-112": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"or":[{"traitIncludes":"ビッグ・マム海賊団"},{"nameIncludes":"サンジ"}]},"exclude":"シャーロット・プリン","optional":true}]},
  // OP03-113 シャーロット・ペロスペロー: 【KO時】デッキ上3枚からビッグマム1枚を手札に
  "OP03-113": {"onKO":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ビッグ・マム海賊団"},"optional":true}]},
  // OP03-114 シャーロット・リンリン(c10): 【登場時】ビッグマムリーダーならデッキ上1枚をライフに→相手ライフ上1枚をトラッシュ
  "OP03-114": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ビッグ・マム海賊団"},"then":[{"op":"lifeAddFromDeck","n":1}]},{"op":"lifeTrash","side":"opp"}]},
  // OP03-115 シュトロイゼン: 【登場時】手札の【トリガー】1枚を捨てる：相手コスト1以下1枚KO
  "OP03-115": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"hasTrigger":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  // OP03-116 しらほし(c5): 【登場時】3ドロー＋手札2枚捨て
  "OP03-116": {"onPlay":[{"op":"draw","n":3},{"op":"discardOwn","n":2}]},
  // OP03-117 ナポレオン: 【起動メイン】レスト：「シャーロット・リンリン」1枚を次の自分ターン開始まで+1000
  "OP03-117": {"act":{"label":"レスト:リンリン+1000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":1000,"duration":"untilNextStart","count":1,"optional":true,"filter":{"nameIncludes":"シャーロット・リンリン"}}]}},
  // OP03-118 威国: 【カウンター】リーダーかキャラ+5000
  "OP03-118": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":5000,"battle":true,"count":1,"optional":true}]}},
  // OP03-119 斬・切・餅: 【メイン】自ライフが相手より少ないなら相手コスト4以下1枚KO
  "OP03-119": {"main":{"fx":[{"op":"cond","check":{"selfLifeLessThanOpp":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  // OP03-120 熱海温泉: 【メイン】相手ライフ4枚以上なら相手ライフ上1枚をトラッシュ
  "OP03-120": {"main":{"fx":[{"op":"cond","check":{"oppLifeAtLeast":4},"then":[{"op":"lifeTrash","side":"opp"}]}]}},
  // OP03-121 雷霆: 【メイン】ライフ上1枚をトラッシュ：相手コスト5以下1枚KO
  "OP03-121": {"main":{"fx":[{"op":"lifeCost","action":"trash","then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}},
  // OP03-122 そげキング: 【登場時】コスト6以下1枚を手札に戻す→2ドロー＋手札2枚捨て
  "OP03-122": {"onPlay":[{"op":"bounce","side":"any","maxCost":6,"count":1,"optional":true},{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP03-123 シャーロット・カタクリ(c8): 【登場時】コスト8以下1枚を持ち主のライフに表向きで加える
  "OP03-123": {"onPlay":[{"op":"charToLife","side":"any","filter":{"maxCost":8},"faceUp":true,"optional":true}]},
  /* ===== OP02（頂上決戦）バッチ1（赤白ひげ/山賊・緑ワノ国/FILM・001-060） ===== */
  // OP02-002 モンキー・D・ガープ LEADER: 【自分のターン中】ドンが付与された時、相手コスト7以下1枚をコスト-1
  "OP02-002": {"onDonAttached":{"when":"selfTurn","fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true,"filter":{"maxCost":7}}]}},
  // OP02-004 エドワード・ニューゲート(c9): 【登場時】リーダー1枚を次の自分ターン開始まで+2000→このターン効果でライフ手札不可 ／【ドン×2】【アタック時】相手のパワー3000以下1枚KO
  "OP02-004": {"onPlay":[{"op":"leaderBuff","amount":2000,"duration":"untilNextStart"},{"op":"setNoLifeToHand"}],"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},
  // OP02-005 カーリー・ダダン(c2): 【登場時】デッキ上5枚からコスト1の赤キャラ1枚を手札に
  "OP02-005": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"cost":1,"color":"赤","type":"CHAR"},"optional":true}]},
  // OP02-008 ジョズ: 【ドン×1】自ライフ2枚以下＋白ひげリーダーで【速攻】
  "OP02-008": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"and":[{"donX1":true},{"lifeAtMost":2},{"leaderTraitIncludes":"白ひげ海賊団"}]}}]},
  // OP02-009 スクアード: 【登場時】白ひげリーダーなら相手キャラ1枚-4000＋ライフ上1枚を手札に
  "OP02-009": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true},{"op":"lifeToHand","n":1}]}]},
  // OP02-010 ドグラ: 【起動メイン】レスト：手札から「ドグラ」以外のコスト1の赤キャラを登場
  "OP02-010": {"act":{"label":"レスト:コスト1赤キャラ登場","cost":{"restSelf":true},"fx":[{"op":"playCharFromHand","filter":{"cost":1,"color":"赤","nameExcludes":"ドグラ"},"count":1,"optional":true}]}},
  // OP02-011 ビスタ: 【登場時】相手のパワー3000以下1枚KO
  "OP02-011": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]},
  // OP02-013 ポートガス・D・エース(c7): 【登場時】相手キャラ2枚-3000→白ひげリーダーなら【速攻】
  "OP02-013": {"onPlay":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":2,"optional":true},{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP02-014 ホワイティベイ: 【ドン×1】相手のアクティブのキャラにもアタックできる
  "OP02-014": {"static":[{"op":"staticKeyword","kw":"attackActive","cond":{"donX1":true}}]},
  // OP02-015 マキノ: 【起動メイン】レスト：コスト1の赤キャラ1枚+3000
  "OP02-015": {"act":{"label":"レスト:コスト1赤キャラ+3000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"cost":1,"color":"赤"}}]}},
  // OP02-016 マグラ: 【登場時】コスト1の赤キャラ1枚+3000
  "OP02-016": {"onPlay":[{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"cost":1,"color":"赤"}}]},
  // OP02-017 マスクド・デュース: 【ドン×2】【アタック時】相手のパワー2000以下1枚KO
  "OP02-017": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}]},
  // OP02-018 マルコ(c4): 【ブロッカー】 ／【KO時】白ひげ1枚捨て：自ライフ2枚以下ならトラッシュからレスト登場
  "OP02-018": {"onKO":[{"op":"discardCost","count":1,"optional":true,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"reviveSelfRested"}]}]}]},
  // OP02-019 ラクヨウ: 【ドン×1】【自分のターン中】白ひげキャラ全+1000
  "OP02-019": {"static":[{"op":"allyPower","cond":{"and":[{"donX1":true},{"selfTurn":true}]},"power":1000,"filter":{"traitIncludes":"白ひげ海賊団"}}]},
  // OP02-021 海震: 【メイン】白ひげリーダーなら相手のパワー3000以下1枚KO
  "OP02-021": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]}},
  // OP02-022 白ひげ海賊団: 【メイン】デッキ上5枚から白ひげキャラ1枚を手札に
  "OP02-022": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"白ひげ海賊団","type":"CHAR"},"optional":true}]}},
  // OP02-023 バカな息子をそれでも愛そう…: 【メイン】自ライフ3以下ならこのターン効果でライフ手札不可
  "OP02-023": {"main":{"fx":[{"op":"cond","check":{"lifeAtMost":3},"then":[{"op":"setNoLifeToHand"}]}]}},
  // OP02-024 モビー・ディック号(STAGE): 【自分のターン中】自ライフ1枚以下なら「ニューゲート」と白ひげキャラ全+2000
  "OP02-024": {"static":[{"op":"allyPower","cond":{"and":[{"selfTurn":true},{"lifeAtMost":1}]},"power":2000,"filter":{"traitIncludes":"白ひげ海賊団"}}]},
  // OP02-025 錦えもん LEADER: 【起動メイン】【ターン1回】キャラ1枚以下なら次に登場のコスト3以上ワノ国のコスト-1
  "OP02-025": {"act":{"label":"次のコスト3以上ワノ国を-1","cost":{},"fx":[{"op":"cond","check":{"selfCharCount":{"max":1}},"then":[{"op":"nextPlayCostReduce","minCost":3,"amount":1,"filter":{"traitIncludes":"ワノ国"}}]}]}},
  // OP02-026 サンジ LEADER: 【ターン1回】元々効果のないキャラ登場時、キャラ3枚以下ならドン2アクティブ
  "OP02-026": {"onAllyEnter":{"once":"turn","filter":{"noEffect":true},"cond":{"selfCharCount":{"max":3}},"fx":[{"op":"donActivate","n":2}]}},
  // OP02-029 キャロット(c5): 【自分のターン終了時】ドン1アクティブ
  "OP02-029": {"onTurnEnd":[{"op":"donActivate","n":1}]},
  // OP02-030 光月おでん(c8): 【起動メイン】【ターン1回】ドン3レスト：このキャラをアクティブ ／【KO時】デッキからコスト3の緑ワノ国を登場しシャッフル
  "OP02-030": {"act":{"label":"ドン3レスト:自身アクティブ","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"activateSelf"}]}]},"onKO":[{"op":"playFromDeck","look":"all","filter":{"cost":3,"color":"緑","traitIncludes":"ワノ国"}}]},
  // OP02-031 光月トキ: 「光月おでん」がいれば【ブロッカー】を得る
  "OP02-031": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfChar":{"nameIncludes":"光月おでん"}}}]},
  // OP02-032 シシリアン: 【登場時】ドン2レスト：コスト5以下のミンク族1枚をアクティブ
  "OP02-032": {"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":5,"traitIncludes":"ミンク族"}}]}]},
  // OP02-034 トニートニー・チョッパー(c2): 【ドン×1】【アタック時】相手コスト2以下1枚をレスト
  "OP02-034": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // OP02-035 トラファルガー・ロー(c2): 【起動メイン】ドン1レスト＋このキャラを手札に：手札からコスト3のキャラを登場
  "OP02-035": {"act":{"label":"ドン1+自身手札:コスト3キャラ登場","cost":{},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"bounceSelfCost","then":[{"op":"playCharFromHand","filter":{"cost":3},"count":1,"optional":true}]}]}]}},
  // OP02-036 ナミ(c3): 【登場時】/【アタック時】ドン1レスト：デッキ上3枚から「ナミ」以外のFILM1枚を手札に
  "OP02-036": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"FILM"},"exclude":"ナミ","optional":true}]}],"onAttack":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"FILM"},"exclude":"ナミ","optional":true}]}]},
  // OP02-037 ニコ・ロビン(c3): 【登場時】手札からコスト2以下のFILMか麦わら1枚を登場
  "OP02-037": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":2,"or":[{"traitIncludes":"FILM"},{"traitIncludes":"麦わらの一味"}]},"count":1,"optional":true}]},
  // OP02-040 ブルック(c4): 【登場時】手札からコスト3以下のFILMか麦わら1枚を登場
  "OP02-040": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":3,"or":[{"traitIncludes":"FILM"},{"traitIncludes":"麦わらの一味"}]},"count":1,"optional":true}]},
  // OP02-041 モンキー・Ｄ・ルフィ(c7): 【ブロッカー】 ／【登場時】手札からコスト4以下のFILMか麦わら1枚を登場
  "OP02-041": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":4,"or":[{"traitIncludes":"FILM"},{"traitIncludes":"麦わらの一味"}]},"count":1,"optional":true}]},
  // OP02-042 ヤマト(c4): 別名「光月おでん」 ／【登場時】相手コスト6以下1枚をレスト
  "OP02-042": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]},
  // OP02-044 ワンダ(c2): 【登場時】手札から「ワンダ」以外のコスト3以下のミンク族を登場
  "OP02-044": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":3,"traitIncludes":"ミンク族","nameExcludes":"ワンダ"},"count":1,"optional":true}]},
  // OP02-045 三刀流 鬼斬り: 【カウンター】リーダーかキャラ+6000→手札からコスト3以下の元々効果のないキャラを登場
  "OP02-045": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":6000,"battle":true,"count":1,"optional":true},{"op":"playCharFromHand","filter":{"maxCost":3,"noEffect":true},"count":1,"optional":true}]}},
  // OP02-046 悪魔風脚 野獣肉シュート: 【メイン】相手のレストのコスト4以下1枚KO
  "OP02-046": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":1,"optional":true}]}},
  // OP02-047 桃源十拳: 【メイン】相手コスト4以下1枚をレスト
  "OP02-047": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}},
  // OP02-048 ワノ国(STAGE): 【起動メイン】ワノ国1枚捨て＋レスト：ドン1アクティブ
  "OP02-048": {"act":{"label":"ワノ国1捨て+レスト:ドン1アクティブ","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"ワノ国"},"then":[{"op":"donActivate","n":1}]}]}},
  // OP02-050 イナズマ(c4): 手札1枚以下で+2000 ／【ブロッカー】
  "OP02-050": {"static":[{"op":"condBuff","cond":{"selfHandAtMost":1},"power":2000}]},
  // OP02-051 エンポリオ・イワンコフ(c7): 【登場時】手札3枚になるよう引く→手札からコスト6以下の青インペルダウンを登場
  "OP02-051": {"onPlay":[{"op":"drawToSize","n":3},{"op":"playCharFromHand","filter":{"maxCost":6,"color":"青","traitIncludes":"インペルダウン"},"count":1,"optional":true}]},
  // OP02-052 カバジ(c2): 【登場時】自分の「モージ」がいれば2ドロー＋手札1枚捨て
  "OP02-052": {"onPlay":[{"op":"cond","check":{"selfChar":{"nameIncludes":"モージ"}},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // OP02-056 ドンキホーテ・ドフラミンゴ(c1): 【登場時】デッキ上3枚を並び替え ／【ドン×1】【アタック時】手札1捨て：相手コスト1以下1枚をデッキ下
  "OP02-056": {"onPlay":[{"op":"scry","look":3}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]}]},
  // OP02-057 バーソロミュー・くま(c3): 【登場時】デッキ上2枚から王下七武海1枚を手札に
  "OP02-057": {"onPlay":[{"op":"search","look":2,"count":1,"filter":{"traitIncludes":"王下七武海"},"optional":true}]},
  // OP02-058 バギー(c1): 【登場時】デッキ上5枚から「バギー」以外の青インペルダウン1枚を手札に
  "OP02-058": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"青","traitIncludes":"インペルダウン"},"exclude":"バギー","optional":true}]},
  // OP02-059 ボア・ハンコック(c4): 【アタック時】1ドロー＋手札1枚捨て→手札3枚まで捨て
  "OP02-059": {"onAttack":[{"op":"draw","n":1},{"op":"discardOwn","n":1},{"op":"discardCost","count":3,"optional":true}]},
  /* ===== OP02 バッチ2（黒インペルダウン/ドン-N・黄海軍/コスト下げ・061-121） ===== */
  // OP02-061 モーリー: 【アタック時】手札1枚以下なら相手はこのバトル中コスト5以下の【ブロッカー】不可
  "OP02-061": {"onAttack":[{"op":"cond","check":{"selfHandAtMost":1},"then":[{"op":"denyBlocker","all":true,"filter":{"maxCost":5}}]}]},
  // OP02-062 モンキー・Ｄ・ルフィ(c6): 【登場時】/【アタック時】手札2枚捨て：コスト4以下1枚を手札に戻す→【ダブルアタック】
  "OP02-062": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true},{"op":"giveKeyword","target":"self","kw":"doubleAttack","duration":"turn"}]}],"onAttack":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true},{"op":"giveKeyword","target":"self","kw":"doubleAttack","duration":"turn"}]}]},
  // OP02-063 Mr.1(ダズ・ボーネス): 【登場時】トラッシュからコスト1の青イベント1枚を手札に
  "OP02-063": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"cost":1,"color":"青","type":"EVENT"}}]},
  // OP02-064 Mr.2・ボン・クレー(c5): 【ドン×1】【アタック時】手札1捨て：コスト2以下1枚をデッキ下→このバトル後このキャラもデッキ下
  "OP02-064": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":2},"count":1,"optional":true},{"op":"scheduleTurnEnd","fx":[{"op":"selfToDeckBottom"}]}]}]}]},
  // OP02-065 Mr.3(ギャルディーノ)(c4): 【ブロッカー】 ／【自分のターン終了時】手札1捨て：このキャラをアクティブ
  "OP02-065": {"onTurnEnd":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"activateSelf"}]}]},
  // OP02-066 インペルダウンオールスター: 【メイン】手札2枚捨て：インペルダウンリーダーなら2ドロー
  "OP02-066": {"main":{"fx":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"draw","n":2}]}]}]}},
  // OP02-067 唐草瓦正拳: 【メイン】コスト4以下1枚を手札に戻す
  "OP02-067": {"main":{"fx":[{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}]}},
  // OP02-068 ゴムゴムの雨: 【カウンター】手札1捨て：リーダーかキャラ+3000
  "OP02-068": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  // OP02-069 DEATH WINK: 【カウンター】リーダーかキャラ+6000→手札2枚になるよう引く
  "OP02-069": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":6000,"battle":true,"count":1,"optional":true},{"op":"drawToSize","n":2}]}},
  // OP02-070 ニューカマーランド(STAGE): 【起動メイン】レスト：イワンコフリーダーなら1ドロー＋手札1枚捨て→手札3枚まで捨て
  "OP02-070": {"act":{"label":"レスト:イワンコフでドロー＆手札整理","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"エンポリオ・イワンコフ"},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1},{"op":"discardCost","count":3,"optional":true}]}]}},
  // OP02-071 マゼラン LEADER: 【自分のターン中】【ターン1回】ドンが戻された時、このリーダー+1000
  "OP02-071": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"leaderBuff","amount":1000,"duration":"turn"}]}]},
  // OP02-073 サディちゃん: 【登場時】手札から獄卒獣キャラ1枚を登場
  "OP02-073": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"獄卒獣"},"count":1,"optional":true}]},
  // OP02-074 サルデス: 自分の「ブルゴリ」は【ブロッカー】を得る(近似:このキャラがブロッカー)
  "OP02-074": {"static":[{"op":"allyKeyword","kw":"blocker","filter":{"nameIncludes":"ブルゴリ"}}]},
  // OP02-076 シリュウ(c4): 【登場時】ドン-1：相手コスト1以下1枚KO
  "OP02-076": {"onPlay":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},
  // OP02-078 ダイフゴー: 【登場時】ドン-2：手札から「自身」以外のコスト3以下のSMILEを登場
  "OP02-078": {"onPlay":[{"op":"donMinus","n":2},{"op":"playCharFromHand","filter":{"traitIncludes":"SMILE","maxCost":3,"nameExcludes":"ダイフゴー"},"count":1,"optional":true}]},
  // OP02-079 ダグラス・バレット(c5): 【登場時】ドン-1：相手コスト4以下1枚をレスト
  "OP02-079": {"onPlay":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},
  // OP02-082 バーンディ・ワールド(c8): 【起動メイン】ドン-8：このキャラ+792000
  "OP02-082": {"act":{"label":"ドン-8:このキャラ+792000","cost":{},"fx":[{"op":"donMinus","n":8},{"op":"powerMod","side":"self","target":"self","amount":792000,"duration":"turn"}]}},
  // OP02-083 ハンニャバル(c1): 【登場時】デッキ上5枚から「自身」以外の紫インペルダウン1枚を手札に
  "OP02-083": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"紫","traitIncludes":"インペルダウン"},"exclude":"ハンニャバル","optional":true}]},
  // OP02-085 マゼラン(c5): 【登場時】ドン-1：相手はドン1枚をドンデッキへ ／【相手のターン中】KO時、相手はドン2枚をドンデッキへ
  "OP02-085": {"onPlay":[{"op":"donMinus","n":1},{"op":"oppDonToDeck","n":1}],"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"oppDonToDeck","n":2}]}]},
  // OP02-086 ミノコアラ: 【ブロッカー】 ／【KO時】インペルダウンリーダーならドン1レスト追加
  "OP02-086": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP02-087 ミノタウロス: 【ダブルアタック】 ／【KO時】インペルダウンリーダーならドン1レスト追加
  "OP02-087": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP02-089 地獄の審判: 【カウンター】ドン-1：相手リーダーかキャラ2枚を-3000
  "OP02-089": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","includeLeader":true,"amount":-3000,"duration":"turn","count":2,"optional":true}]}},
  // OP02-090 毒竜: 【メイン】ドン-1：相手キャラ1枚-3000
  "OP02-090": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}},
  // OP02-091 毒の道: 【メイン】ドン1アクティブ追加
  "OP02-091": {"main":{"fx":[{"op":"donFromDeck","n":1,"mode":"active"}]}},
  // OP02-092 インペルダウン(STAGE): 【起動メイン】手札1捨て＋レスト：デッキ上3枚からインペルダウン1枚を手札に
  "OP02-092": {"act":{"label":"手札1捨て+レスト:インペルダウン回収","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"インペルダウン"},"optional":true}]}]}},
  // OP02-094 イスカ: 【ドン×1】【ターン1回】バトルで相手をKOした時このキャラをアクティブ(近似:アタック時)
  "OP02-094": {"onAttack":[{"op":"cond","check":{"donX1":true},"once":"turn","then":[{"op":"activateSelf"}]}]},
  // OP02-095 オニグモ: コスト0のキャラがいると【バニッシュ】
  "OP02-095": {"static":[{"op":"staticKeyword","kw":"banish","cond":{"oppChar":{"cost":0}}}]},
  // OP02-096 クザン(c4): 【登場時】1ドロー ／【アタック時】相手キャラ1枚コスト-4
  "OP02-096": {"onPlay":[{"op":"draw","n":1}],"onAttack":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]},
  // OP02-098 コビー(c3): 【登場時】手札1捨て：相手コスト3以下1枚KO
  "OP02-098": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP02-099 サカズキ(c6): 【登場時】手札1捨て：相手コスト5以下1枚KO
  "OP02-099": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  // OP02-100 ジャンゴ(c2): 自分の「フルボディ」がいるとバトルでKOされない
  "OP02-100": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"selfChar":{"nameIncludes":"フルボディ"}}}]},
  // OP02-101 ストロベリー: 【アタック時】コスト0のキャラがいると相手はこのバトル中コスト5以下の【ブロッカー】不可
  "OP02-101": {"onAttack":[{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"denyBlocker","all":true,"filter":{"maxCost":5}}]}]},
  // OP02-102 スモーカー(c3): 効果でKOされない ／【アタック時】コスト0のキャラがいると+2000
  "OP02-102": {"static":[{"op":"effectImmune"}],"onAttack":[{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"battle":true}]}]},
  // OP02-103 センゴク(c2): 【ドン×1】【アタック時】相手キャラ1枚コスト-2
  "OP02-103": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]},
  // OP02-105 たしぎ(c3): 【ドン×1】【アタック時】相手キャラ1枚コスト-3
  "OP02-105": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]},
  // OP02-106 つる(c1): 【登場時】相手キャラ1枚コスト-2
  "OP02-106": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]},
  // OP02-111 フルボディ: 【アタック時】自分の「ジャンゴ」がいると+3000
  "OP02-111": {"onAttack":[{"op":"cond","check":{"selfChar":{"nameIncludes":"ジャンゴ"}},"then":[{"op":"powerMod","side":"self","target":"self","amount":3000,"battle":true}]}]},
  // OP02-112 ベルメール(c1): 【起動メイン】レスト：相手キャラ1枚コスト-1→自リーダーかキャラ+1000
  "OP02-112": {"act":{"label":"レスト:相手コスト-1＋自+1000","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true},{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}},
  // OP02-113 ヘルメッポ(c3): 【アタック時】相手キャラ1枚コスト-2→コスト0がいれば+2000
  "OP02-113": {"onAttack":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true},{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"battle":true}]}]},
  // OP02-114 ボルサリーノ(c4): 【相手のターン中】効果でKOされず+1000 ／【ブロッカー】
  "OP02-114": {"static":[{"op":"condBuff","koImmune":true,"cond":{"oppTurn":true}},{"op":"condBuff","cond":{"oppTurn":true},"power":1000}]},
  // OP02-115 モンキー・D・ガープ(c2): 【ドン×2】【アタック時】相手のコスト0キャラ1枚KO
  "OP02-115": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]},
  // OP02-117 氷河時代: 【メイン】相手キャラ1枚コスト-5
  "OP02-117": {"main":{"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-5,"duration":"turn","optional":true}]}},
  // OP02-118 八尺瓊勾玉: 【カウンター】手札1捨て：自キャラ1枚はこのバトル中KOされない
  "OP02-118": {"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"grantAllBattleImmune","duration":"battle","filter":{"type":"CHAR"}}]}]}},
  // OP02-119 流星火山: 【メイン】相手コスト1以下1枚KO
  "OP02-119": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}},
  // OP02-120 ウタ(c8): 【登場時】ドン-2：自分のリーダーとキャラ全を次の自分ターン開始まで+1000
  "OP02-120": {"onPlay":[{"op":"donMinus","n":2},{"op":"powerMod","side":"self","all":true,"leader":true,"amount":1000,"duration":"untilNextStart"}]},
  // OP02-121 クザン(c10): 【自分のターン中】相手キャラ全コスト-5 ／【登場時】相手のコスト0キャラ1枚KO
  "OP02-121": {"static":[{"op":"oppCostMod","amount":-5,"cond":{"selfTurn":true}}],"onPlay":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]},
  /* ===== OP01（ROMANCE DAWN）バッチ1（赤麦わら/超新星・緑ワノ国/ハート・001-060） ===== */
  // OP01-001 ロロノア・ゾロ LEADER: 【ドン×1】【自分のターン中】自分のキャラ全+1000
  "OP01-001": {"static":[{"op":"allyPower","cond":{"and":[{"donX1":true},{"selfTurn":true}]},"power":1000}]},
  // OP01-002 トラファルガー・ロー LEADER: 【起動メイン】【ターン1回】ドン2レスト：キャラ5枚なら自キャラ1枚を手札に戻し、異なる色のコスト5以下を登場
  "OP01-002": {"act":{"label":"ドン2レスト:キャラ入替","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"selfCharCount":{"min":5}},"then":[{"op":"bounceOwnCharCost","then":[{"op":"playCharFromHand","filter":{"maxCost":5},"count":1,"optional":true}]}]}]}]}},
  // OP01-003 モンキー・D・ルフィ LEADER: 【起動メイン】【ターン1回】ドン4レスト：コスト5以下の超新星/麦わら1枚をアクティブ＋1000
  "OP01-003": {"act":{"label":"ドン4レスト:超新星/麦わらをアクティブ＋1000","cost":{},"fx":[{"op":"restDonCost","n":4,"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":5,"or":[{"traitIncludes":"超新星"},{"traitIncludes":"麦わらの一味"}]},"grantKw":null}]},{"op":"powerMod","side":"self","amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"or":[{"traitIncludes":"超新星"},{"traitIncludes":"麦わらの一味"}]}}]}},
  // OP01-004 ウソップ: 【ドン×1】【自分のターン中】【ターン1回】相手がイベント発動時、1ドロー
  "OP01-004": {"onOppEvent":{"when":"selfTurn","once":"turn","cond":{"donX1":true},"fx":[{"op":"draw","n":1}]}},
  // OP01-005 ウタ(c4): 【登場時】トラッシュの「自身」以外のコスト3以下赤キャラ1枚を手札に
  "OP01-005": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"color":"赤","maxCost":3,"nameExcludes":"ウタ"}}]},
  // OP01-006 お玉(c1): 【登場時】相手キャラ1枚-2000
  "OP01-006": {"onPlay":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  // OP01-007 カリブー: 【KO時】相手のパワー4000以下1枚KO
  "OP01-007": {"onKO":[{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]},
  // OP01-008 キャベンディッシュ: 【登場時】ライフ1枚を手札に：このターン【速攻】
  "OP01-008": {"onPlay":[{"op":"lifeCost","then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // OP01-011 ゴードン: 【登場時】手札1枚をデッキ下：1ドロー
  "OP01-011": {"onPlay":[{"op":"handToBottomCost","n":1,"then":[{"op":"draw","n":1}]}]},
  // OP01-013 サンジ(c2): 【起動メイン】【ターン1回】ライフ1枚を手札に：このキャラ+2000→レストのドン2付与
  "OP01-013": {"act":{"label":"ライフ1枚手札:+2000＋レストのドン2","cost":{},"fx":[{"op":"lifeCost","then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"},{"op":"donAttach","target":"self","n":2}]}]}},
  // OP01-015 トニートニー・チョッパー(c3): 【ドン×1】【アタック時】手札1捨て：トラッシュの「自身」以外のコスト4以下麦わら1枚を手札に
  "OP01-015": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"traitIncludes":"麦わらの一味","maxCost":4,"nameExcludes":"トニートニー・チョッパー"}}]}]}]},
  // OP01-016 ナミ(c1): 【登場時】デッキ上5枚から「ナミ」以外の麦わら1枚を手札に
  "OP01-016": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"麦わらの一味"},"exclude":"ナミ","optional":true}]},
  // OP01-017 ニコ・ロビン(c3): 【ドン×1】【アタック時】相手のパワー3000以下1枚KO
  "OP01-017": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}]},
  // OP01-019 バルトロメオ(c2): 【ブロッカー】 ／【ドン×2】【相手のターン中】+3000
  "OP01-019": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"oppTurn":true}]},"power":3000}]},
  // OP01-020 ヒョウ五郎: 【起動メイン】レスト：リーダーかキャラ1枚+2000
  "OP01-020": {"act":{"label":"レスト:リーダーかキャラ+2000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"duration":"turn","count":1,"optional":true}]}},
  // OP01-021 フランキー(c3): 【ドン×1】相手のアクティブのキャラにもアタックできる
  "OP01-021": {"static":[{"op":"staticKeyword","kw":"attackActive","cond":{"donX1":true}}]},
  // OP01-022 ブルック(c4): 【ドン×1】【アタック時】相手キャラ2枚-2000
  "OP01-022": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]}]},
  // OP01-024 モンキー・D・ルフィ(c2): 【ドン×2】打とのバトルでKOされない ／【起動メイン】【ターン1回】レストのドン2付与
  "OP01-024": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"donX2":true}}],"act":{"label":"レストのドン2付与","cost":{},"fx":[{"op":"donAttach","target":"self","n":2}]}},
  // OP01-026 ゴムゴムの火拳銃: 【カウンター】リーダーかキャラ+4000→相手のパワー4000以下1枚KO
  "OP01-026": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}},
  // OP01-027 円卓: 【メイン】相手キャラ1枚-10000
  "OP01-027": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-10000,"duration":"turn","count":1,"optional":true}]}},
  // OP01-028 必殺緑星ラフレシア: 【カウンター】相手リーダーかキャラ1枚-2000
  "OP01-028": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}},
  // OP01-029 ラディカルビ～～～ム‼‼: 【カウンター】リーダーかキャラ+2000→自ライフ2枚以下ならさらに+2000
  "OP01-029": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // OP01-030 2年後に‼!シャボンディ諸島で!!!: 【メイン】デッキ上5枚から麦わらキャラ1枚を手札に
  "OP01-030": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"麦わらの一味","type":"CHAR"},"optional":true}]}},
  // OP01-032 アシュラ童子: 【ドン×1】相手のレストのキャラ2枚以上で+2000
  "OP01-032": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"oppRestedCardsAtLeast":2}]},"power":2000}]},
  // OP01-033 イゾウ(c3): 【登場時】相手コスト4以下1枚をレスト
  "OP01-033": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},
  // OP01-034 イヌアラシ(c3): 【ドン×2】【アタック時】ドン1アクティブ
  "OP01-034": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"donActivate","n":1}]}]},
  // OP01-035 お菊: 【ドン×1】【アタック時】【ターン1回】相手コスト5以下1枚をレスト
  "OP01-035": {"onAttack":[{"op":"cond","check":{"donX1":true},"once":"turn","then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  // OP01-038 カン十郎: 【ドン×1】【アタック時】相手のレストのコスト2以下1枚KO ／【KO時】相手が自分の手札1枚を選び捨てる(近似:自分で捨てる)
  "OP01-038": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":2},"count":1,"optional":true}]}],"onKO":[{"op":"discardOwn","n":1}]},
  // OP01-040 錦えもん(c6): 【登場時】おでんリーダーなら手札からコスト3以下赤鞘を登場 ／【ドン×1】【アタック時】【ターン1回】赤鞘1枚をアクティブ
  "OP01-040": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"光月おでん"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"赤鞘九人男","maxCost":3},"count":1,"optional":true}]}],"onAttack":[{"op":"cond","check":{"donX1":true},"once":"turn","then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"赤鞘九人男","maxCost":3}}]}]},
  // OP01-041 光月モモの助(c1): 【起動メイン】ドン1レスト＋このキャラレスト：デッキ上5枚からワノ国1枚を手札に
  "OP01-041": {"act":{"label":"ドン1+レスト:ワノ国回収","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ワノ国"},"optional":true}]}]}},
  // OP01-042 小紫: 【登場時】ドン3レスト：おでんリーダーならコスト3以下のワノ国1枚をアクティブ
  "OP01-042": {"onPlay":[{"op":"restDonCost","n":3,"then":[{"op":"cond","check":{"leaderNameIncludes":"光月おでん"},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"ワノ国","maxCost":3}}]}]}]},
  // OP01-044 シャチ: 【ブロッカー】 ／【登場時】「ペンギン」がいなければ手札から「ペンギン」を登場
  "OP01-044": {"onPlay":[{"op":"cond","check":{"noSelfChar":{"nameIncludes":"ペンギン"}},"then":[{"op":"playSpecificFromHand","name":"ペンギン","optional":true}]}]},
  // OP01-046 傳ジロー(c5): 【ドン×1】【アタック時】おでんリーダーならドン2アクティブ
  "OP01-046": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"leaderNameIncludes":"光月おでん"}]},"then":[{"op":"donActivate","n":2}]}]},
  // OP01-047 トラファルガー・ロー(c5): 【ブロッカー】 ／【登場時】自キャラ1枚を手札に戻す：手札からコスト3以下を登場
  "OP01-047": {"onPlay":[{"op":"bounceOwnCharCost","excludeSelf":true,"then":[{"op":"playCharFromHand","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // OP01-048 ネコマムシ(c2): 【登場時】相手コスト3以下1枚をレスト
  "OP01-048": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},
  // OP01-049 ベポ(c4): 【ドン×1】【アタック時】手札から「ベポ」以外のコスト4以下ハート1枚を登場
  "OP01-049": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ハートの海賊団","maxCost":4,"nameExcludes":"ベポ"},"count":1,"optional":true}]}]},
  // OP01-050 ペンギン: 【ブロッカー】 ／【登場時】「シャチ」がいなければ手札から「シャチ」を登場
  "OP01-050": {"onPlay":[{"op":"cond","check":{"noSelfChar":{"nameIncludes":"シャチ"}},"then":[{"op":"playSpecificFromHand","name":"シャチ","optional":true}]}]},
  // OP01-051 ユースタス・キッド(c8): 【ドン×1】レスト時、相手はキッド以外にアタック不可(近似:省略) ／【起動メイン】【ターン1回】レスト：手札からコスト3以下を登場
  "OP01-051": {"act":{"label":"レスト:コスト3以下を登場","cost":{"restSelf":true},"fx":[{"op":"playCharFromHand","filter":{"maxCost":3},"count":1,"optional":true}]}},
  // OP01-052 雷ぞう(c3): 【アタック時】【ターン1回】レストのキャラ2枚以上で1ドロー
  "OP01-052": {"onAttack":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"once":"turn","then":[{"op":"draw","n":1}]}]},
  // OP01-054 X・ドレーク(c5): 【登場時】相手のレストのコスト4以下1枚KO
  "OP01-054": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":4},"count":1,"optional":true}]},
  // OP01-055 おれの”侍”になれ‼!: 【メイン】自キャラ2枚をレスト：2ドロー
  "OP01-055": {"main":{"fx":[{"op":"restOwnAsCost","count":2,"then":[{"op":"draw","n":2}]}]}},
  // OP01-056 降魔の相: 【メイン】相手のレストのコスト5以下2枚KO
  "OP01-056": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":2,"optional":true}]}},
  // OP01-057 桃源白滝: 【カウンター】リーダーかキャラ+2000→自キャラ1枚をアクティブ
  "OP01-057": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true}}]}},
  // OP01-058 磁気弦: 【カウンター】リーダーかキャラ+4000→相手コスト4以下1枚をレスト
  "OP01-058": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}},
  // OP01-059 べべんっ‼: 【メイン】ワノ国1枚捨て：コスト3以下のワノ国1枚をアクティブ
  "OP01-059": {"main":{"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"ワノ国"},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"ワノ国","maxCost":3}}]}]}},
  // OP01-060 ドンキホーテ・ドフラミンゴ LEADER: 【ドン×2】【アタック時】ドン1レスト：デッキ上1枚公開しコスト4以下の王下七武海ならレスト登場
  "OP01-060": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"restDonCost","n":1,"then":[{"op":"playFromDeck","look":1,"rested":true,"filter":{"traitIncludes":"王下七武海","maxCost":4}}]}]}]},
  /* ===== OP01 バッチ2（黒王下七武海/B・W・黄百獣海賊団・061-121） ===== */
  // OP01-061 カイドウ LEADER: 【ドン×1】【自分のターン中】【ターン1回】相手キャラがKOされた時、ドン1アクティブ追加
  "OP01-061": {"onOppKO":{"when":"selfTurn","once":"turn","cond":{"donX1":true},"fx":[{"op":"donFromDeck","n":1,"mode":"active"}]}},
  // OP01-062 クロコダイル LEADER: 【ドン×1】自分がイベント発動時、手札4枚以下かつこのターンこのリーダー効果で引いてなければ1ドロー(近似:ターン1回)
  "OP01-062": {"onSelfEvent":{"once":"turn","cond":{"and":[{"donX1":true},{"selfHandAtMost":4}]},"fx":[{"op":"draw","n":1}]}},
  // OP01-063 アーロン: 【ドン×1】【起動メイン】レスト：相手手札1枚を公開、イベントなら相手ライフ1枚をデッキ下
  "OP01-063": {"act":{"label":"レスト:相手手札公開(イベントならライフ削り)","cost":{"restSelf":true},"fx":[{"op":"peekOppHand"}]}},
  // OP01-064 アルビダ(c2): 【ドン×1】【アタック時】手札1捨て：相手コスト3以下1枚を手札に戻す
  "OP01-064": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"bounce","side":"opp","maxCost":3,"count":1,"optional":true}]}]}]},
  // OP01-067 クロコダイル(c7): 【バニッシュ】 ／【ドン×1】自分の手札の青イベントをコスト-1
  "OP01-067": {"static":[{"op":"eventCostReduce","amount":1,"filter":{"color":"青","type":"EVENT"},"cond":{"donX1":true}}]},
  // OP01-068 ゲッコー・モリア(c4): 【自分のターン中】手札5枚以上で【ダブルアタック】
  "OP01-068": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"and":[{"selfTurn":true},{"selfHandAtLeast":5}]}}]},
  // OP01-069 シーザー・クラウン(c4): 【KO時】デッキから「スマイリー」を登場しシャッフル
  "OP01-069": {"onKO":[{"op":"playFromDeck","look":"all","filter":{"nameIncludes":"スマイリー"}}]},
  // OP01-070 ジュラキュール・ミホーク(c9): 【登場時】コスト7以下1枚を持ち主のデッキ下
  "OP01-070": {"onPlay":[{"op":"deckBottom","side":"any","filter":{"maxCost":7},"count":1,"optional":true}]},
  // OP01-071 ジンベエ(c4): 【登場時】コスト3以下1枚を持ち主のデッキ下
  "OP01-071": {"onPlay":[{"op":"deckBottom","side":"any","filter":{"maxCost":3},"count":1,"optional":true}]},
  // OP01-072 スマイリー(c3): 【ドン×1】【自分のターン中】手札1枚につき+1000
  "OP01-072": {"static":[{"op":"countBuff","cond":{"and":[{"donX1":true},{"selfTurn":true}]},"of":"selfHand","per":1,"amount":1000}]},
  // OP01-073 ドンキホーテ・ドフラミンゴ(c3): 【ブロッカー】 ／【登場時】デッキ上5枚を並び替え
  "OP01-073": {"onPlay":[{"op":"scry","look":5}]},
  // OP01-074 バーソロミュー・くま(c4): 【ブロッカー】 ／【KO時】手札からコスト4以下「パシフィスタ」を登場
  "OP01-074": {"onKO":[{"op":"playSpecificFromHand","nameIncludes":"パシフィスタ","filter":{"maxCost":4},"optional":true}]},
  // OP01-077 ペローナ(c1): 【登場時】デッキ上5枚を並び替え
  "OP01-077": {"onPlay":[{"op":"scry","look":5}]},
  // OP01-079 ミス・オールサンデー(c3): 【ブロッカー】 ／【KO時】B・WリーダーならトラッシュのイベントをHandに
  "OP01-079": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"trashToHand","count":1,"optional":true,"filter":{"type":"EVENT"}}]}]},
  // OP01-080 ミス・ダブルフィンガー(ザラ)(c3): 【KO時】1ドロー
  "OP01-080": {"onKO":[{"op":"draw","n":1}]},
  // OP01-083 Mr.1(ダズ・ボーネス)(c2): 【ドン×1】【自分のターン中】B・Wリーダーならトラッシュのイベント2枚につき+1000
  "OP01-083": {"static":[{"op":"countBuff","cond":{"and":[{"donX1":true},{"selfTurn":true},{"leaderTraitIncludes":"B・W"}]},"of":"trash","ofFilter":{"type":"EVENT"},"per":2,"amount":1000}]},
  // OP01-084 Mr.2ボン・クレー(c3): 【ドン×1】【アタック時】デッキ上5枚からB・Wイベント1枚を手札に
  "OP01-084": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"B・W","type":"EVENT"},"optional":true}]}]},
  // OP01-085 Mr.3(ギャルディーノ)(c2): 【登場時】B・Wリーダーなら相手コスト4以下1枚は次相手ターン終了までアタック不可
  "OP01-085": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"setAttackBan","filter":{"maxCost":4},"count":1,"duration":"untilNextEnd","optional":true}]}]},
  // OP01-086 超過鞭糸: 【カウンター】リーダーかキャラ+4000→アクティブのコスト3以下1枚を手札に戻す
  "OP01-086": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"bounce","side":"opp","maxCost":3,"count":1,"optional":true,"filter":{"activeOnly":true}}]}},
  // OP01-087 オフィサーエージェント: 【カウンター】手札からコスト3以下のB・Wを登場
  "OP01-087": {"counter":{"cost":0,"fx":[{"op":"playCharFromHand","filter":{"traitIncludes":"B・W","maxCost":3},"count":1,"optional":true}]}},
  // OP01-088 砂漠の宝刀: 【カウンター】リーダーかキャラ+2000→デッキ上3枚を並び替え
  "OP01-088": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"scry","look":3}]}},
  // OP01-089 三日月形砂丘: 【カウンター】王下七武海リーダーならコスト5以下1枚を手札に戻す
  "OP01-089": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"王下七武海"},"then":[{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}]}]}},
  // OP01-090 バロックワークス: 【メイン】デッキ上5枚から「自身」以外のB・W1枚を手札に
  "OP01-090": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"B・W"},"exclude":"バロックワークス","optional":true}]}},
  // OP01-091 キング LEADER: 【自分のターン中】場のドン10で相手キャラ全-1000
  "OP01-091": {"static":[{"op":"oppStaticPowerMod","power":-1000,"cond":{"and":[{"selfTurn":true},{"donAtLeast":10}]}}]},
  // OP01-093 うるティ(c2): 【登場時】ドン1レスト：ドン1レスト追加
  "OP01-093": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // OP01-094 カイドウ(c10): 【登場時】ドン-6：百獣リーダーならこのキャラ以外の全キャラKO
  "OP01-094": {"onPlay":[{"op":"donMinus","n":6},{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"koAllExceptSelf"}]}]},
  // OP01-095 狂死郎(c5): 【登場時】場のドン8以上で1ドロー
  "OP01-095": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"draw","n":1}]}]},
  // OP01-096 キング(c7): 【登場時】ドン-2：相手コスト3以下1枚＋コスト2以下1枚KO
  "OP01-096": {"onPlay":[{"op":"donMinus","n":2},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},
  // OP01-097 クイーン(c6): 【登場時】ドン-1：このターン【速攻】→相手キャラ1枚-2000
  "OP01-097": {"onPlay":[{"op":"donMinus","n":1},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  // OP01-098 黒炭オロチ(c1): 【登場時】デッキから「人造悪魔の実SMILE」1枚を手札に＋シャッフル
  "OP01-098": {"onPlay":[{"op":"searchDeck","filter":{"nameIncludes":"人造悪魔の実SMILE"}}]},
  // OP01-099 黒炭せみ丸: 「自身」以外の黒炭家はバトルでKOされない(近似:効果KO耐性も)
  "OP01-099": {"static":[{"op":"allyKoImmune","filter":{"traitIncludes":"黒炭家","nameExcludes":"黒炭せみ丸"}}]},
  // OP01-101 ササキ(c3): 【ドン×1】【アタック時】手札1捨て：ドン1レスト追加
  "OP01-101": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]},
  // OP01-102 ジャック(c3): 【アタック時】ドン-1：相手は手札1枚を捨てる
  "OP01-102": {"onAttack":[{"op":"donMinus","n":1},{"op":"oppDiscard","n":1}]},
  // OP01-105 バオファン: 【登場時】相手の手札2枚を公開(情報)
  "OP01-105": {"onPlay":[{"op":"peekOppHand","n":2}]},
  // OP01-106 バジル・ホーキンス(c4): 【登場時】ドン1レスト追加
  "OP01-106": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"rested"}]},
  // OP01-108 人斬り鎌ぞう(c4): 【KO時】ドン-1：相手コスト5以下1枚KO
  "OP01-108": {"onKO":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]},
  // OP01-109 フーズ・フー(c2): 【ドン×1】【自分のターン中】場のドン8以上で+1000
  "OP01-109": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfTurn":true},{"donAtLeast":8}]},"power":1000}]},
  // OP01-112 ページワン(c4): 【起動メイン】【ターン1回】ドン-1：このターン相手のアクティブにもアタックできる
  "OP01-112": {"act":{"label":"ドン-1:アクティブにもアタック可","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"giveKeyword","target":"self","kw":"attackActive","duration":"turn"}]}},
  // OP01-113 ホールデム(c3): 【KO時】ドン1レスト追加
  "OP01-113": {"onKO":[{"op":"donFromDeck","n":1,"mode":"rested"}]},
  // OP01-114 X・ドレーク(c5): 【登場時】ドン-1：相手は手札1枚を捨てる
  "OP01-114": {"onPlay":[{"op":"donMinus","n":1},{"op":"oppDiscard","n":1}]},
  // OP01-115 象の鼻息: 【メイン】相手コスト2以下1枚KO＋ドン1アクティブ追加
  "OP01-115": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"active"}]}},
  // OP01-116 人造悪魔の実SMILE: 【メイン】デッキ上5枚からコスト3以下のSMILEを登場
  "OP01-116": {"main":{"fx":[{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"SMILE","maxCost":3}}]}},
  // OP01-117 シープスホーン: 【メイン】ドン-1：相手コスト6以下1枚をレスト
  "OP01-117": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]}},
  // OP01-118 ウル頭銃: 【カウンター】ドン-2：リーダーかキャラ+2000→1ドロー
  "OP01-118": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":2},{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"draw","n":1}]}},
  // OP01-119 雷鳴八卦: 【カウンター】リーダーかキャラ+4000→自ライフ2枚以下ならドン1レスト追加 ／【トリガー】ドン1アクティブ追加
  "OP01-119": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},"trigger":[{"op":"donFromDeck","n":1,"mode":"active"}]},
  // OP01-120 シャンクス(c9): 【速攻】 ／【アタック時】相手はこのバトル中パワー2000以下の【ブロッカー】不可
  "OP01-120": {"onAttack":[{"op":"denyBlocker","all":true,"filter":{"maxEffPower":2000}}]}
};
/* ===== EB01（メモリアルコレクション）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  // EB01-001 光月おでん LEADER: 【ドン×1】【アタック時】コスト5以上ワノ国がいればこのリーダーは次の自分ターン開始まで+1000（カウンター付与ルールは近似で省略）
  "EB01-001": {"static":[{"op":"handCounterBuff","filter":{"trait":"ワノ国","noCounter":true,"type":"CHAR"},"amount":1000}],"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"selfCharCount":{"filter":{"minCost":5,"traitIncludes":"ワノ国"},"min":1}}]},"then":[{"op":"leaderBuff","amount":1000,"duration":"untilNextStart"}]}]},
  // EB01-002 イゾウ(c5): 【登場時】レストのドン1付与 ／【相手のアタック時】【ターン1回】手札1捨て：ワノ国/白ひげリーダーなら相手リーダーかキャラ1枚-2000
  "EB01-002": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":1}],"onOppAttack":[{"op":"discardCost","count":1,"optional":true,"once":"turn","then":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"ワノ国"},{"leaderTraitIncludes":"白ひげ海賊団"}]},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}]}]},
  // EB01-003 キッド&キラー: 【速攻】 ／【アタック時】相手ライフ2枚以下で+2000
  "EB01-003": {"onAttack":[{"op":"cond","check":{"oppLifeAtMost":2},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}]},
  // EB01-004 コーザ(c2): 【アタック時】リーダー-5000：相手キャラ1枚-3000
  "EB01-004": {"onAttack":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]},
  // EB01-006 トニートニー・チョッパー(c3): 【ブロッカー】 ／【ドン×2】【アタック時】相手キャラ1枚-3000
  "EB01-006": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]},
  // EB01-008 リトルオーズJr.: 【ターン1回】効果でKOされる代わりに手札のイベント/ステージ1枚を捨てる
  "EB01-008": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"discardFromHand","discardFilter":{"or":[{"type":"EVENT"},{"type":"STAGE"}]}}]},
  // EB01-009 うるせェ!!!いこう!!!!: 【カウンター】デッキ上5枚からコスト3以下の動物を登場
  "EB01-009": {"counter":{"cost":0,"fx":[{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"動物","maxCost":3}}]}},
  // EB01-010 お前がおれに!!!勝てるわけねェだろうが!!!!: 【カウンター】相手の元々パワー6000以下1枚KO
  "EB01-010": {"counter":{"cost":0,"fx":[{"op":"ko","side":"opp","filter":{"maxPower":6000},"count":1,"optional":true}]}},
  // EB01-011 ミニメリー2号(STAGE): 【起動メイン】レスト＋元々パワー1000のキャラ1枚をデッキ下：1ドロー
  "EB01-011": {"act":{"label":"レスト＋パワー1000をデッキ下:1ドロー","cost":{},"fx":[{"op":"cond","check":{"selfActive":true},"then":[{"op":"deckBottomOwnCharCost","filter":{"basePower":1000},"then":[{"op":"restThis"},{"op":"draw","n":1}]}]}]}},
  // EB01-012 キャベンディッシュ(c5): 【登場時】/【アタック時】超新星リーダー＋他に「キャベンディッシュ」がいなければドン2アクティブ
  "EB01-012": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"超新星"},{"not":{"selfCharOther":{"filter":{"nameIncludes":"キャベンディッシュ"}}}}]},"then":[{"op":"donActivate","n":2}]}],"onAttack":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"超新星"},{"not":{"selfCharOther":{"filter":{"nameIncludes":"キャベンディッシュ"}}}}]},"then":[{"op":"donActivate","n":2}]}]},
  // EB01-013 光月日和(c4): 【起動メイン】自身トラッシュ：手札から「自身」以外のコスト5以下ワノ国を登場→1ドロー
  "EB01-013": {"act":{"label":"自身トラッシュ:ワノ国登場＋1ドロー","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ワノ国","maxCost":5,"nameExcludes":"光月日和"},"count":1,"optional":true},{"op":"draw","n":1}]}]}},
  // EB01-014 サンジ(c4): 【ドン×1】【自分のターン中】レストのドン3枚につき+1000（近似:場のドンで計算）
  "EB01-014": {"static":[{"op":"countBuff","cond":{"and":[{"donX1":true},{"selfTurn":true}]},"of":"restedDon","per":3,"amount":1000}]},
  // EB01-015 スクラッチメン・アプー(c1): 【登場時】相手コスト2以下1枚をレスト
  "EB01-015": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},
  // EB01-016 びん豪: 【起動メイン】レスト：相手のレストのコスト1以下1枚KO
  "EB01-016": {"act":{"label":"レスト:相手レスト1以下KO","cost":{"restSelf":true},"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":1},"count":1,"optional":true}]}},
  // EB01-019 盾白糸: 【カウンター】リーダーかキャラ+4000→デッキ上3枚からドンキ1枚を手札に
  "EB01-019": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団","type":"CHAR"},"optional":true}]}},
  // EB01-020 シャンブルズ: 【メイン】超新星リーダーなら自キャラ1枚を手札に戻し、異なる色のコスト2以下を登場
  "EB01-020": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"bounceOwnCharCost","then":[{"op":"playCharFromHand","diffColorFrom":"costCard","filter":{"maxCost":2},"count":1,"optional":true}]}]}]}},
  // EB01-022 イナズマ(c6): 【自分のターン終了時】手札2枚以下なら2ドロー
  "EB01-022": {"onTurnEnd":[{"op":"cond","check":{"selfHandAtMost":2},"then":[{"op":"draw","n":2}]}]},
  // EB01-024 ハムレット(c3): 手札4枚以下なら自分のSMILE全+1000
  "EB01-024": {"static":[{"op":"allyPower","cond":{"selfHandAtMost":4},"power":1000,"filter":{"traitIncludes":"SMILE"}}]},
  // EB01-026 プリンス・ベレット: 【ドン×1】【アタック時】手札1枚以下ならコスト3以下1枚を手札に戻す
  "EB01-026": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"selfHandAtMost":1}]},"then":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]}]},
  // EB01-027 Mr.1(ダズ・ボーネス)(c5): B・Wリーダーならトラッシュのイベント2枚につき+1000 ／【登場時】2ドロー＋手札1枚捨て
  "EB01-027": {"static":[{"op":"countBuff","cond":{"leaderTraitIncludes":"B・W"},"of":"trash","ofFilter":{"type":"EVENT"},"per":2,"amount":1000}],"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  // EB01-028 ゴムゴムのチャンピオン回転弾: 【カウンター】インペルダウンリーダーならリーダーかキャラ+2000→相手はアクティブのキャラ1枚を手札に戻す
  "EB01-028": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"bounce","side":"opp","count":1,"oppChooses":true,"filter":{"activeOnly":true}}]}]}},
  // EB01-029 わりいおれ死んだ: 【カウンター】デッキ上1枚公開しコスト4以上なら自キャラ1枚を手札に戻す→デッキ下
  "EB01-029": {"counter":{"cost":0,"fx":[{"op":"revealTop","filter":{"minCost":4},"then":[{"op":"bounceOwnCharCost"}]},{"op":"deckTopToBottom"}]}},
  // EB01-030 ローグタウン(STAGE): 【起動メイン】このカードと手札1枚をデッキ下：2ドロー
  "EB01-030": {"act":{"label":"自身＋手札1枚デッキ下:2ドロー","cost":{},"fx":[{"op":"handToBottomCost","n":1,"then":[{"op":"stageToBottomCost","then":[{"op":"draw","n":2}]}]}]}},
  // EB01-031 カリファ(c5): 【登場時】ドン-1：W7リーダーならトラッシュのコスト4以下キャラ2枚を手札に
  "EB01-031": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"trashToHand","count":2,"optional":true,"filter":{"type":"CHAR","maxCost":4}}]}]},
  // EB01-033 ブルーノ(c4): 【登場時】ドン-1：W7リーダーなら手札/トラッシュから「自身」以外のコスト5のW7を登場
  "EB01-033": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"playFromHandOrTrash","filter":{"traitIncludes":"W7","cost":5,"nameExcludes":"ブルーノ"}}]}]},
  // EB01-034 ミス・ウェンズデー(c3): 【ブロッカー】 ／【相手のアタック時】【ターン1回】ドン-1：B・Wリーダーならドン1アクティブ追加
  "EB01-034": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}]},
  // EB01-035 ミス・マンデー(c3): 【登場時】B・Wリーダーならリーダーかキャラ1枚+1000
  "EB01-035": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]},
  // EB01-036 ミノチワワ: 【速攻】 ／【KO時】インペルダウンリーダーならドン1レスト追加
  "EB01-036": {"onKO":[{"op":"cond","check":{"leaderTraitIncludes":"インペルダウン"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // EB01-037 Mr.9: 【相手のアタック時】【ターン1回】ドン-1：相手コスト2以下1枚KO
  "EB01-037": {"onOppAttack":[{"op":"donMinus","n":1,"once":"turn","then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // EB01-038 オカマ道: 【カウンター】ドン-1：B・Wリーダーなら自キャラ1枚にアタック対象を変更(近似:ブロッカー風肩代わりは省略・+0)
  "EB01-038": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"B・W"},"then":[{"op":"counterRedirect"}]}]}},
  // EB01-039 降三世 引奈落: 【メイン】ドン-1：相手コスト8以下1枚KO
  "EB01-039": {"main":{"fx":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":8},"count":1,"optional":true}]}},
  // EB01-042 スカーレット: 【起動メイン】自身トラッシュ：手札から「自身」以外のコスト3以下ドレスローザをレスト登場→相手キャラ1枚コスト-2
  "EB01-042": {"act":{"label":"自身トラッシュ:ドレスローザ登場＋相手-2","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ドレスローザ","maxCost":3,"nameExcludes":"スカーレット"},"count":1,"optional":true,"rested":true},{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}]}},
  // EB01-043 スパンダイン: 【登場時】トラッシュの『CP』3枚をデッキ下：トラッシュから「自身」以外のコスト4以下CPをレスト登場
  "EB01-043": {"onPlay":[{"op":"trashToBottomCost","n":3,"filter":{"traitIncludes":"CP"},"then":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"traitIncludes":"CP","nameExcludes":"スパンダイン"}}]}]},
  // EB01-044 ファンクフリード: 【起動メイン】レスト：自分の「スパンダム」1枚+3000
  "EB01-044": {"act":{"label":"レスト:スパンダム+3000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"スパンダム"}}]}},
  // EB01-045 ブルック(c3 ルンバー): 【登場時】相手にコスト0がいれば このターン【速攻】
  "EB01-045": {"onPlay":[{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  // EB01-046 ブルック(c3 麦わら): 【登場時】/【アタック時】相手キャラ1枚コスト-1→相手のコスト0キャラ1枚KO
  "EB01-046": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true},{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}],"onAttack":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true},{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]},
  // EB01-047 ラブーン(c2): 【ターン1回】キャラがKOされた時、1ドロー＋手札1枚捨て（近似:自分のキャラKO時=onKOは持てないので相手キャラKO時に）
  "EB01-047": {"onOppKO":{"once":"turn","fx":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}},
  // EB01-048 ラブーン(c4): 【起動メイン】レスト：相手キャラ1枚コスト-4
  "EB01-048": {"act":{"label":"レスト:相手コスト-4","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]}},
  // EB01-049 Tボーン(c5): 【登場時】相手コスト2以下1枚KO
  "EB01-049": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},
  // EB01-050 生ぎたいっ!!!!: 【カウンター】トラッシュ30枚以上ならデッキ上1枚をライフに
  "EB01-050": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"trashAtLeast":30},"then":[{"op":"lifeAddFromDeck","n":1}]}]}},
  // EB01-051 指銃: 【メイン】デッキ上2枚トラッシュ：相手コスト5以下1枚KO
  "EB01-051": {"main":{"fx":[{"op":"deckTrashCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}},
  // EB01-052 ヴィオラ(c2): 【ブロッカー】 ／【登場時】相手ライフを見て並べ替え か 自ライフをすべて裏向き
  "EB01-052": {"onPlay":[{"op":"chooseOption","options":[{"label":"相手のライフを見て並べ替える","fx":[{"op":"reorderLife","side":"opp"}]},{"label":"自分のライフをすべて裏向き","fx":[{"op":"flipAllLifeDown"}]}]}]},
  // EB01-053 ガスティーノ: 【登場時】相手コスト3以下1枚を相手ライフに表向きで置く
  "EB01-053": {"onPlay":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true}]},
  // EB01-054 ガン・フォール: 【ブロッカー】 ／【登場時】相手ライフ1枚以下なら相手コスト3以下1枚KO
  "EB01-054": {"onPlay":[{"op":"cond","check":{"oppLifeAtMost":1},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  // EB01-056 シャーロット・フランペ: 【登場時】ライフ上か下1枚を手札に：1ドロー
  "EB01-056": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"draw","n":1}]}]},
  // EB01-057 しらほし(c2): 相手効果でKOされた時、デッキ上1枚をライフに ／【ブロッカー】
  "EB01-057": {"onKO":[{"op":"cond","check":"koByOpp","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // EB01-058 モンブラン・クリケット: 【ドン×1】【自分のターン中】自ライフ2枚以下で+2000
  "EB01-058": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfTurn":true},{"lifeAtMost":2}]},"power":2000}]},
  // EB01-059 雷迎: 【メイン】相手キャラ1枚KO→自ライフが1枚になるよう上からトラッシュ
  "EB01-059": {"main":{"fx":[{"op":"ko","side":"opp","count":1,"optional":true},{"op":"lifeTrashToSize","n":1}]}},
  // EB01-060 我が神なり: 【メイン】手札/トラッシュからコスト7以下「エネル」を登場→自ライフが1枚になるよう上からトラッシュ
  "EB01-060": {"main":{"fx":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"エネル","maxCost":7}},{"op":"lifeTrashToSize","n":1}]}},
  // EB01-061 Mr.2・ボン・クレー(c4): 【登場時】ドン1アクティブ追加 ／【アタック時】このキャラの元々パワーを選んだ相手キャラと同じに
  "EB01-061": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"onAttack":[{"op":"powerCopy"}]}
});})();
/* ===== EB02（ANIME 25th collection）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  // EB02-002 サボ(c4): 【起動メイン】レスト：「サボ」以外の革命軍1枚+2000
  "EB02-002": {"act":{"label":"レスト:革命軍+2000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"革命軍","nameExcludes":"サボ"}}]}},
  // EB02-003 トニートニー・チョッパー(c3): 【ドン×2】【相手のターン中】+2000 ／【登場時】麦わらリーダーならレストのドン1付与
  "EB02-003": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"oppTurn":true}]},"power":2000}],"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]},
  // EB02-005 ニセ麦わらの一味: 【自分のターン中】+2000 ／【相手のターン中】-2000
  "EB02-005": {"static":[{"op":"condBuff","cond":{"selfTurn":true},"power":2000},{"op":"condBuff","cond":{"oppTurn":true},"power":-2000}]},
  // EB02-007 刻蹄・桜吹雪: 【メイン】リーダーとキャラ3枚+1000→相手のパワー3000以下1枚KO
  "EB02-007": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":3,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true}]}},
  // EB02-008 最高到達点: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-008": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-009 サウザンド・サニー号(STAGE): 【起動メイン】レスト：自分の付与ドン1枚を麦わらキャラ1枚に付与
  "EB02-009": {"act":{"label":"レスト:付与ドン1を麦わらへ移す","cost":{"restSelf":true},"fx":[{"op":"moveAttachedDon","n":1,"filter":{"traitIncludes":"麦わらの一味"}}]}},
  // EB02-011 アーロン(c3): 【登場時】魚人/東の海リーダーならリーダーにレストのドン1付与→相手コスト5以下1枚は次相手ターン終了までレスト不可
  "EB02-011": {"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"魚人族"},{"leaderTraitIncludes":"東の海"}]},"then":[{"op":"donAttach","target":"leader","n":1},{"op":"restImmune","side":"opp","filter":{"maxCost":5},"count":1,"duration":"untilNextEnd","optional":true}]}]},
  // EB02-012 ガイモン: 「サーファンクル」がいれば【ブロッカー】
  "EB02-012": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfChar":{"nameIncludes":"サーファンクル"}}}]},
  // EB02-013 キャロット(c1): 【登場時】場のドン3以上ならデッキ上7枚から「ゾウ」1枚を手札に→手札から「ゾウ」を登場
  "EB02-013": {"onPlay":[{"op":"cond","check":{"donAtLeast":3},"then":[{"op":"search","look":7,"count":1,"filter":{"nameIncludes":"ゾウ"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"ゾウ","optional":true}]}]},
  // EB02-014 サーファンクル: 【登場時】手札から「ガイモン」1枚を登場
  "EB02-014": {"onPlay":[{"op":"playSpecificFromHand","name":"ガイモン","optional":true}]},
  // EB02-015 ジュエリー・ボニー(c7): 【登場時】相手のレストのキャラ1枚を次リフレッシュロック→ターン終了時ドン1アクティブ
  "EB02-015": {"onPlay":[{"op":"lockRefresh","count":1,"optional":true},{"op":"delayedDonActivate","n":1}]},
  // EB02-016 チョッパーマン: 別名トニートニー・チョッパー ／【登場時】手札からコスト3以下の動物を登場
  "EB02-016": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"動物","maxCost":3},"count":1,"optional":true}]},
  // EB02-018 バギー(c4): 【登場時】他に「バギー」がいなければリーダー1枚に【ダブルアタック】
  "EB02-018": {"onPlay":[{"op":"cond","check":{"not":{"selfCharOther":{"filter":{"nameIncludes":"バギー"}}}},"then":[{"op":"leaderDoubleAttack"}]}]},
  // EB02-019 ロロノア・ゾロ(c4): 相手キャラ2枚以上で登場ターンキャラへアタック可 ／【登場時】麦わらリーダーなら相手コスト4以下1枚レスト
  "EB02-019": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"oppChar":{"min":2}}}],"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // EB02-020 ウィーアー！: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-020": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-021 ゴムゴムの巨人の銃: 【メイン】麦わら1枚+6000→次の自分リフレッシュでアクティブにしない(近似:省略)
  "EB02-021": {"main":{"fx":[{"op":"powerMod","side":"self","amount":6000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"麦わらの一味"}}]}},
  // EB02-022 ウソップ(c4): 【登場時】パワー5000以上が2枚以下なら手札からパワー6000以下の元々効果のないキャラを登場
  "EB02-022": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":5000},"max":2}},"then":[{"op":"playCharFromHand","filter":{"maxPower":6000,"noEffect":true},"count":1,"optional":true}]}]},
  // EB02-023 クロコダイル(c4): 【自分のターン中】【ターン1回】相手キャラが自分の効果で手札に戻った時、デッキ上3枚を並び替え(反応型フックは近似で省略・登場時に並び替え)
  "EB02-023": {"onOppBounce":{"once":"turn","fx":[{"op":"scry","n":3}]}},
  // EB02-024 そげキング(c4): 別名ウソップ ／【登場時】2ドロー→手札2枚をデッキ下→コスト1以下1枚を手札に戻す
  "EB02-024": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2,"posChoose":true},{"op":"bounce","side":"any","maxCost":1,"count":1,"optional":true}]},
  // EB02-025 ドンキホーテ・ロシナンテ(c2): 【起動メイン】ドン1＋このキャラレスト：ロシナンテリーダーならデッキ上5枚からコスト2以下をレスト登場
  "EB02-025": {"act":{"label":"ドン1+レスト:コスト2以下をレスト登場","cost":{},"fx":[{"op":"cond","check":{"selfActive":true},"then":[{"op":"restDonCost","n":1,"then":[{"op":"restThis"},{"op":"cond","check":{"leaderNameIncludes":"ドンキホーテ・ロシナンテ"},"then":[{"op":"playFromDeck","look":5,"rested":true,"filter":{"maxCost":2}}]}]}]}]}},
  // EB02-026 ネフェルタリ・ビビ(c3): 【登場時】多色リーダー＋手札5枚以下なら2ドロー
  "EB02-026": {"onPlay":[{"op":"cond","check":{"and":[{"leaderMulticolor":true},{"selfHandAtMost":5}]},"then":[{"op":"draw","n":2}]}]},
  // EB02-027 ビスタ(c4): 【登場時】相手のパワー1000以下1枚を持ち主のデッキ下
  "EB02-027": {"onPlay":[{"op":"deckBottom","side":"opp","filter":{"maxEffPower":1000},"count":1,"optional":true}]},
  // EB02-028 ポートガス・D・エース(c5): 【登場時】白ひげリーダーならデッキ上5枚からコスト2キャラ1枚を手札に→手札からコスト2キャラをレスト登場
  "EB02-028": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"search","look":5,"count":1,"filter":{"cost":2,"type":"CHAR"},"optional":true},{"op":"playCharFromHand","filter":{"cost":2},"count":1,"optional":true,"rested":true}]}]},
  // EB02-030 仲間の夢を笑われた時だ!!!!: 【カウンター】自分のキャラ全てはこのターンバトルでKOされる代わりに手札1枚捨て(近似:バトルKO耐性)
  "EB02-030": {"counter":{"cost":0,"fx":[{"op":"grantBattleKoSubstitute"}]}},
  // EB02-031 Hope: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-031": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-032 アイスバーグ(c1): 【登場時】場のドン3以上ならデッキ上7枚から「ガレーラカンパニー」を手札に→手札から登場
  "EB02-032": {"onPlay":[{"op":"cond","check":{"donAtLeast":3},"then":[{"op":"search","look":7,"count":1,"filter":{"nameIncludes":"ガレーラカンパニー"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"ガレーラカンパニー","optional":true}]}]},
  // EB02-033 クラバウターマン: 「ゴーイング・メリー号」があれば【ブロッカー】
  "EB02-033": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfStage":{"nameIncludes":"ゴーイング・メリー号"}}}]},
  // EB02-035 サンジ&プリン(c5): 【ターン1回】ドンが戻された時ドン1アクティブ追加 ／【登場時】ドンが相手以下なら1ドロー
  "EB02-035": {"onDonReturned":[{"op":"cond","once":"turn","check":{"and":[{"selfTurn":true},{"donReturnedAtLeast":2}]},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}],"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"draw","n":1}]}]},
  // EB02-036 ニコ・ロビン(c3): 【ブロッカー】 ／【KO時】ドン-1：デッキ上3枚から麦わら1枚を手札に
  "EB02-036": {"onKO":[{"op":"donMinus","n":1},{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"麦わらの一味"},"optional":true}]},
  // EB02-037 フランキー(c3): 【登場時】/【アタック時】麦わらリーダー＋ドンが相手以下ならドン1レスト追加
  "EB02-037": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"麦わらの一味"},{"donLEOpp":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}],"onAttack":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"麦わらの一味"},{"donLEOpp":true}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // EB02-038 マゼラン(c3): 【登場時】手札からコスト2以下のインペルダウンを登場
  "EB02-038": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"インペルダウン","maxCost":2},"count":1,"optional":true}]},
  // EB02-039 GERMA 66: 【メイン】手札からパワー4000以下ジェルマ66を捨て：ドンが相手以下ならトラッシュのパワー5000-7000の同名を登場(近似:同コスト帯ジェルマ)
  "EB02-039": {"main":{"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"ジェルマ66","maxPower":4000},"then":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"reviveFromTrash","filter":{"traitIncludes":"ジェルマ66","minPower":5000,"maxPower":7000}}]}]}]}},
  // EB02-040 BRAND NEW WORLD: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-040": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-041 ゴーイング・メリー号(STAGE): 【登場時】麦わらリーダーなら1ドロー ／【起動メイン】レスト：ドンが相手以下なら麦わら1枚を次相手ターン終了までコスト+2
  "EB02-041": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"draw","n":1}]}],"act":{"label":"レスト:麦わらをコスト+2","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true,"filter":{"traitIncludes":"麦わらの一味"}}]}]}},
  // EB02-044 センゴク(c7): 【ブロッカー】 ／【登場時】トラッシュからコスト4以下の黒・海軍をレスト登場
  "EB02-044": {"onPlay":[{"op":"reviveFromTrash","maxCost":4,"rested":true,"filter":{"color":"黒","traitIncludes":"海軍"}}]},
  // EB02-045 トラファルガー・ロー(c5): 【ブロッカー】 ／【登場時】トラッシュ2枚をデッキ下：1ドロー か 相手手札5以上で相手1枚捨て
  "EB02-045": {"onPlay":[{"op":"trashToBottomCost","n":2,"then":[{"op":"chooseOption","options":[{"label":"1ドロー","fx":[{"op":"draw","n":1}]},{"label":"相手手札5以上なら相手1枚捨て","fx":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppDiscard","n":1}]}]}]}]}]},
  // EB02-047 ブルーノ(c5): 【起動メイン】手札1捨て＋自身トラッシュ：トラッシュから「自身」以外のコスト5以下のCPを登場
  "EB02-047": {"act":{"label":"手札1捨て+自身トラッシュ:CP登場","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"trashSelfCost","then":[{"op":"reviveFromTrash","maxCost":5,"filter":{"traitIncludes":"CP","nameExcludes":"ブルーノ"}}]}]}]}},
  // EB02-048 ブルック(c5): 【登場時】トラッシュから「ラブーン」1枚を手札に ／【KO時】手札からコスト4以下「ラブーン」を登場
  "EB02-048": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"nameIncludes":"ラブーン"}}],"onKO":[{"op":"playSpecificFromHand","nameIncludes":"ラブーン","filter":{"maxCost":4},"optional":true}]},
  // EB02-049 モンキー・D・ガープ(c5): 【登場時】リーダーにレストのドン2付与 ／【起動メイン】レスト：ガープリーダーなら相手コスト1以下1枚KO
  "EB02-049": {"onPlay":[{"op":"donAttach","target":"leader","n":2}],"act":{"label":"レスト:ガープで相手1以下KO","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderNameIncludes":"モンキー・D・ガープ"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]}},
  // EB02-050 ココロのちず: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-050": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-051 鼻唄三丁矢筈斬り: 【メイン】相手コスト2以下1枚KO か 相手キャラ1枚コスト-4
  "EB02-051": {"main":{"fx":[{"op":"chooseOption","options":[{"label":"相手コスト2以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},{"label":"相手キャラ1枚コスト-4","fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]}]}]}},
  // EB02-052 エネル(c10): 空島リーダーで【速攻】 ／【アタック時】手札1捨て：自ライフ1枚以下ならデッキ上1枚をライフに＋このキャラ+1000
  "EB02-052": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"leaderTraitIncludes":"空島"}}],"onAttack":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"lifeAddFromDeck","n":1}]},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  // EB02-053 オルガ・ミスキナ: 【登場時】/【KO時】ライフ確認(情報)
  "EB02-053": {"onPlay":[{"op":"peekLifeTopPlace"}],"onKO":[{"op":"peekLifeTopPlace"}]},
  // EB02-054 サンジ(c5): 【ブロッカー】 ／【登場時】自ライフ2枚以下なら2ドロー＋手札1枚捨て
  "EB02-054": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  // EB02-056 ベガパンク(c5): 【ブロッカー】 ／【登場時】デッキ上5枚から「自身」以外のコスト5以下科学者を登場→相手キャラ2枚以下なら手札1枚捨て
  "EB02-056": {"onPlay":[{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"科学者","maxCost":5}},{"op":"cond","check":{"oppChar":{"max":2}},"then":[{"op":"discardOwn","n":1}]}]},
  // EB02-057 マッド・トレジャー: 【アタック時】ライフ上か下1枚を手札に：相手コスト3以下1枚を相手ライフに表向き
  "EB02-057": {"onAttack":[{"op":"lifeCost","pos":"choose","then":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"optional":true}]}]},
  // EB02-058 あーーっす！: 【メイン】デッキ上4枚からコスト4以上1枚を手札に
  "EB02-058": {"main":{"fx":[{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}]}},
  // EB02-059 お前がいねェと…!!: 【カウンター】リーダーかキャラ+1000→自ライフ1枚以下なら手札からコスト5以下の黄・麦わらか「サンジ」を登場
  "EB02-059": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"color":"黄","traitIncludes":"麦わらの一味"},{"nameIncludes":"サンジ"}]},"count":1,"optional":true}]}]}},
  // EB02-060 ゴーイング・メリー号(c2 STAGE): 【起動メイン】レスト＋ライフ上1枚表向き：麦わら1枚を次相手ターン終了まで+1000
  "EB02-060": {"act":{"label":"レスト＋ライフ表向き:麦わら+1000","cost":{"restSelf":true},"fx":[{"op":"flipLifeCost","then":[{"op":"powerMod","side":"self","amount":1000,"duration":"untilNextEnd","count":1,"optional":true,"filter":{"traitIncludes":"麦わらの一味"}}]}]}},
  // EB02-061 モンキー・D・ルフィ(c6): 多色リーダー＋相手ドン5以上で【速攻】 ／【アタック時】【ターン1回】アクティブのドン2枚を戻す：このキャラをアクティブ→ライフ上1枚を手札に
  "EB02-061": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"and":[{"leaderMulticolor":true},{"oppDonAtLeast":5}]}}],"onAttack":[{"op":"donMinus","n":2,"fromActive":true,"once":"turn","then":[{"op":"activateSelf"},{"op":"lifeToHand","n":1}]}]}
});})();
/* ===== EB03（PILLARS OF STRENGTH/THE THREE BROTHERS）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  // EB03-001 ネフェルタリ・ビビ LEADER: 【ターン1回】元々コスト4以上がKOされる代わりに手札1枚捨て ／【起動メイン】レスト：相手1枚-2000→アタック時効果のないキャラ1枚に【速攻】
  "EB03-001": {"static":[{"op":"leaveProtect","onlyKO":true,"once":"turn","pay":"discardFromHand","targetFilter":{"minBaseCost":4}}],"act":{"label":"レスト:相手-2000＋速攻付与","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"giveKeyword","target":"chooseOwn","kw":"rush","duration":"turn"}]}},
  // EB03-003 ウタ(c5): 【登場時】「ウタ」リーダーなら2ドロー→手札からパワー6000以下の元々効果のないキャラを登場
  "EB03-003": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"draw","n":2},{"op":"playCharFromHand","filter":{"maxPower":6000,"noEffect":true},"count":1,"optional":true}]}]},
  // EB03-004 カリーナ(c3): 【ブロッカー】 ／【相手のターン中】多色リーダー＋元々パワー6000以上がいなければ+4000
  "EB03-004": {"static":[{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"leaderMulticolor":true},{"noSelfChar":{"minPower":6000}}]},"power":4000}]},
  // EB03-005 シュガー(c3): 【登場時】「シュガー」リーダーなら手札からパワー6000以下のドンキをレスト登場
  "EB03-005": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"シュガー"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ドンキホーテ海賊団","maxPower":6000},"count":1,"optional":true,"rested":true}]}]},
  // EB03-006 ナミ(c5): 【登場時】リーダー-5000：1ドロー ／【起動メイン】【ターン1回】アラバスタリーダーなら相手1枚-1000
  "EB03-006": {"onPlay":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"draw","n":1}]}],"act":{"label":"アラバスタ:相手-1000","cost":{},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"アラバスタ王国"},"then":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}]}},
  // EB03-007 バカラ(c4): 【ブロッカー】 ／【KO時】手札からパワー6000以下の元々効果のないキャラを登場
  "EB03-007": {"onKO":[{"op":"playCharFromHand","filter":{"maxPower":6000,"noEffect":true},"count":1,"optional":true}]},
  // EB03-008 ひばり: 【登場時】/【アタック時】SWORDのリーダーかキャラ1枚がアクティブにもアタック可 ／【起動メイン】【ターン1回】相手1枚-1000
  "EB03-008": {"onPlay":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"SWORD"}}],"onAttack":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"SWORD"}}],"act":{"label":"相手-1000","cost":{},"fx":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}},
  // EB03-009 マキノ(c1): 【起動メイン】レスト：元々効果のないキャラ1枚+2000
  "EB03-009": {"act":{"label":"レスト:効果なしキャラ+2000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"noEffect":true}}]}},
  // EB03-010 モネ(c5): 【ブロッカー】 ／【登場時】デッキ上5枚からパワー1000以下キャラかイベント1枚を手札に
  "EB03-010": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"maxPower":1000,"type":"CHAR"},{"type":"EVENT"}]},"optional":true}]},
  // EB03-011 いつかまた会えたら…: 【カウンター】ビビリーダーならリーダーかキャラ+4000
  "EB03-011": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"ネフェルタリ・ビビ"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  // EB03-012 お玉(c2): 【起動メイン】レスト：相手のコスト3以下の動物/SMILEキャラ1枚をレスト
  "EB03-012": {"act":{"label":"レスト:相手の動物/SMILEをレスト","cost":{"restSelf":true},"fx":[{"op":"chooseOption","options":[{"label":"キャラをレスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":3,"or":[{"traitIncludes":"動物"},{"traitIncludes":"SMILE"}]},"count":1,"optional":true}]},{"label":"相手のドン1枚をレスト","fx":[{"op":"restOppDon","n":1}]}]}]}},
  // EB03-013 キャロット(c6): 【起動メイン】【ターン1回】登場ターンなら相手のレストのコスト5以下1枚KO→手札から「ゾウ」を登場
  "EB03-013": {"act":{"label":"登場ターン:相手レスト5以下KO＋ゾウ登場","cost":{},"fx":[{"op":"cond","check":{"selfSummonedThisTurn":true},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":1,"optional":true},{"op":"playSpecificFromHand","nameIncludes":"ゾウ","optional":true}]}]}},
  // EB03-014 くいな(c2): 【起動メイン】レスト：属性(斬)リーダーにレストのドン2付与
  "EB03-014": {"act":{"label":"レスト:斬リーダーにレストのドン2","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderAttr":"斬"},"then":[{"op":"donAttach","target":"leader","n":2}]}]}},
  // EB03-015 ケイミー(c2): 【起動メイン】レスト：魚人/人魚のリーダーかキャラにレストのドン1付与→相手コスト2以下1枚レスト
  "EB03-015": {"act":{"label":"レスト:魚人にドン付与＋相手レスト","cost":{"restSelf":true},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}},{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}},
  // EB03-016 光月日和(c1): 【登場時】おでんリーダーなら1ドロー ／【起動メイン】自身トラッシュ：ワノ国リーダーにレストのドン1付与
  "EB03-016": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"光月おでん"},"then":[{"op":"draw","n":1}]}],"act":{"label":"自身トラッシュ:ワノ国リーダーにドン1","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ワノ国"},"then":[{"op":"donAttach","target":"leader","n":1}]}]}]}},
  // EB03-017 ジュエリー・ボニー(c5): 【登場時】超新星リーダーならドン1アクティブ→相手コスト8以下1枚は次相手エンドまでレスト不可
  "EB03-017": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"donActivate","n":1},{"op":"restImmune","side":"opp","filter":{"maxCost":8},"count":1,"duration":"untilNextEnd","optional":true}]}]},
  // EB03-018 たしぎ(c4): 【相手のターン中】効果でKOされず【ブロッカー】 ／【自分のターン終了時】ドン1レスト＋手札1捨て：このキャラをアクティブ
  "EB03-018": {"static":[{"op":"condBuff","koImmune":true,"cond":{"oppTurn":true}},{"op":"staticKeyword","kw":"blocker","cond":{"oppTurn":true}}],"onTurnEnd":[{"op":"restDonCost","n":1,"then":[{"op":"discardCost","count":1,"then":[{"op":"activateSelf"}]}]}]},
  // EB03-020 出た!負け惜しみ～: 【カウンター】リーダーかキャラ+2000→FILMが2枚以上ならさらに+2000
  "EB03-020": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"traitIncludes":"FILM"},"min":2}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}],"else":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}},
  // EB03-021 アルビダ(c4): 【登場時】手札1捨て：相手の元々パワー4000以下1枚＋元々コスト3以下1枚を持ち主のデッキ下
  "EB03-021": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"deckBottom","side":"opp","filter":{"maxPower":4000},"count":1,"optional":true},{"op":"deckBottom","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true}]}]},
  // EB03-022 イスカ(c6): 【ブロッカー】 ／【登場時】コスト4以下1枚を持ち主のデッキ下
  "EB03-022": {"onPlay":[{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true}]},
  // EB03-023 カヤ(c2): 【登場時】デッキ上5枚を並び替え
  "EB03-023": {"onPlay":[{"op":"scry","look":5}]},
  // EB03-024 ネフェルタリ・ビビ(c5): 【ブロッカー】 ／【登場時】手札からコスト5以下のアラバスタ/麦わらを登場→このターン登場不可(近似:省略)
  "EB03-024": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"traitIncludes":"アラバスタ王国"},{"traitIncludes":"麦わらの一味"}]},"count":1,"optional":true},{"op":"setSummonBan"}]},
  // EB03-025 ヒナ(c5): 【登場時】手札1捨て：元々パワー6000のキャラ1枚を手札に戻す
  "EB03-025": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"bounce","side":"any","filter":{"basePower":6000},"count":1,"optional":true}]}]},
  // EB03-026 ボア・ハンコック(c6): 【登場時】相手手札5以上なら相手は手札1枚をデッキ下 ／【起動メイン】【ターン1回】自キャラ1枚をデッキ下：リーダーとキャラにレストのドン1ずつ
  "EB03-026": {"onPlay":[{"op":"cond","check":{"oppHandAtLeast":5},"then":[{"op":"oppHandToBottom","n":1}]}],"act":{"label":"自キャラデッキ下:リーダーとキャラにドン1ずつ","cost":{},"fx":[{"op":"deckBottomOwnCharCost","then":[{"op":"donAttachAll","n":1,"max":1,"incLeader":true}]}]}},
  // EB03-027 マーガレット(c6): 【登場時】元々パワー7000のキャラ1枚を手札に戻す
  "EB03-027": {"onPlay":[{"op":"bounce","side":"any","filter":{"basePower":7000},"count":1,"optional":true}]},
  // EB03-028 ユウ(c2): 【登場時】手札1枚を捨てる ／【起動メイン】自身トラッシュ：手札4枚以下なら2ドロー
  "EB03-028": {"onPlay":[{"op":"discardOwn","n":1}],"act":{"label":"自身トラッシュ:手札4以下で2ドロー","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"selfHandAtMost":4},"then":[{"op":"draw","n":2}]}]}]}},
  // EB03-029 不届き者‼控えよ‼: 【メイン】ドン4レスト：ハンコックリーダーなら手札からコスト6以下のアマゾン/九蛇を登場 ／【カウンター】「ハンコック」+3000
  "EB03-029": {"main":{"fx":[{"op":"restDonCost","n":4,"then":[{"op":"cond","check":{"leaderNameIncludes":"ボア・ハンコック"},"then":[{"op":"playCharFromHand","filter":{"maxCost":6,"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"count":1,"optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true,"filter":{"nameIncludes":"ボア・ハンコック"}}]}},
  // EB03-031 ヴィンスモーク・レイジュ(c5): 【登場時】ドン-1：「サンジ」リーダーならトラッシュのコスト7以下イベントのメイン効果を発動(近似:省略・代わりに1ドロー)
  "EB03-031": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"draw","n":1}]}]},
  // EB03-032 シャーロット・フランペ(c1): 【自分のターン中】【登場時】自分の「シャーロット・カタクリ」1枚+2000
  "EB03-032": {"onPlay":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"シャーロット・カタクリ"}}]},
  // EB03-033 シャーロット・ブリュレ(c5): 【相手のターン中】【ターン1回】ドンが戻された時、ビッグマムリーダーならドン1レスト追加
  "EB03-033": {"onDonReturned":[{"op":"cond","once":"turn","check":{"and":[{"oppTurn":true},{"leaderTraitIncludes":"ビッグ・マム海賊団"}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // EB03-034 シャーロット・リンリン(c7): 【登場時】1ドロー＋手札1枚をデッキ上→ドン1アクティブ追加 ／【KO時】ドン-1：デッキ上1枚をライフに
  "EB03-034": {"onPlay":[{"op":"draw","n":1},{"op":"handToBottom","n":1},{"op":"donFromDeck","n":1,"mode":"active"}],"onKO":[{"op":"donMinus","n":1},{"op":"lifeAddFromDeck","n":1}]},
  // EB03-035 シャーロット・プリン(c4): 【ブロッカー】 ／【登場時】ドンが相手以下ならドン1レスト追加
  "EB03-035": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // EB03-036 ベビー5(c4): 【登場時】ドン-1：相手の元々コスト3以下2枚KO
  "EB03-036": {"onPlay":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":2,"optional":true}]},
  // EB03-037 リム(c4): 【登場時】場のドン7以上なら自分のODYSSEYリーダーとキャラ全を次相手エンドまで+1000
  "EB03-037": {"onPlay":[{"op":"cond","check":{"donAtLeast":7},"then":[{"op":"powerMod","side":"self","all":true,"leader":true,"amount":1000,"duration":"untilNextEnd","filter":{"traitIncludes":"ODYSSEY"}}]}]},
  // EB03-038 ごち♡: 【メイン】ドン1レスト：ドン相手以下＋自キャラがジェルマのみならドン2レスト追加 ／【カウンター】リーダー+3000
  "EB03-038": {"main":{"fx":[{"op":"restDonCost","n":1,"then":[{"op":"cond","check":{"and":[{"donLEOpp":true},{"allSelfChar":{"traitIncludes":"ジェルマ"}}]},"then":[{"op":"donFromDeck","n":2,"mode":"rested"}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // EB03-039 うるティ(c6): 【登場時】百獣リーダーなら1ドロー＋手札1捨て→トラッシュからパワー6000以下の元々効果のないキャラを登場
  "EB03-039": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1},{"op":"reviveFromTrash","filter":{"maxPower":6000,"noEffect":true}}]}]},
  // EB03-041 孔雀(c4): 【相手のターン中】自分のコスト6以下SWORD全+2000 ／【登場時】海軍1枚捨て：2ドロー
  "EB03-041": {"static":[{"op":"allyPower","cond":{"oppTurn":true},"power":2000,"filter":{"traitIncludes":"SWORD","maxCost":6}}],"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"traitIncludes":"海軍"},"then":[{"op":"draw","n":2}]}]},
  // EB03-042 コアラ(c4): 革命軍リーダーでコスト+4 ／【相手のターン中】【KO時】手札/トラッシュから「自身」以外のコスト6以下革命軍か「ロビン」を登場
  "EB03-042": {"static":[{"op":"staticCost","amount":4,"cond":{"leaderTraitIncludes":"革命軍"}}],"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"playFromHandOrTrash","filter":{"maxCost":6,"or":[{"traitIncludes":"革命軍"},{"nameIncludes":"ニコ・ロビン"}],"nameExcludes":"コアラ"}}]}]},
  // EB03-043 ステューシー(c7): 【ブロッカー】 ／【登場時】トラッシュの『CP』2枚をデッキ下：相手コスト4以下1枚KO
  "EB03-043": {"onPlay":[{"op":"trashToBottomCost","n":2,"filter":{"traitIncludes":"CP"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]},
  // EB03-044 ブラックマリア(c3): 多色リーダーで【ブロッカー】 ／【登場時】デッキ上5枚から「鬼ヶ島」を手札に→手札から「鬼ヶ島」を登場
  "EB03-044": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderMulticolor":true}}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"nameIncludes":"鬼ヶ島"},"optional":true},{"op":"playSpecificFromHand","nameIncludes":"鬼ヶ島","optional":true}]},
  // EB03-045 ペローナ(c4): 【ブロッカー】 ／【登場時】リーダーかキャラにレストのドン1付与→トラッシュ10以上ならトラッシュのコスト2以下スリラーバークをレスト登場
  "EB03-045": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":1},{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"reviveFromTrash","maxCost":2,"rested":true,"filter":{"traitIncludes":"スリラーバーク海賊団"}}]}]},
  // EB03-046 ミス・ダブルフィンガー(ザラ)(c4): 【登場時】コスト0か8以上がいれば1ドロー ／【KO時】デッキ上2枚トラッシュ
  "EB03-046": {"onPlay":[{"op":"cond","check":{"or":[{"oppChar":{"or":[{"cost":0},{"minCost":8}]}},{"selfChar":{"or":[{"cost":0},{"minCost":8}]}}]},"then":[{"op":"draw","n":1}]}],"onKO":[{"op":"deckToTrash","n":2}]},
  // EB03-047 ミス・バレンタイン(ミキータ)(c2): 【登場時】デッキ上3枚トラッシュ ／【KO時】1ドロー
  "EB03-047": {"onPlay":[{"op":"deckToTrash","n":3}],"onKO":[{"op":"draw","n":1}]},
  // EB03-048 レベッカ(c2): 【ブロッカー】 ／【登場時】デッキ上5枚からドレスローザのステージを手札に→手札からコスト1のドレスローザステージを登場
  "EB03-048": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドレスローザ","type":"STAGE"},"optional":true},{"op":"playSpecificFromHand","filter":{"traitIncludes":"ドレスローザ","type":"STAGE","cost":1},"optional":true}]},
  // EB03-049 やっぱりお前らかこの大騒ぎ: 【メイン】ドン7レスト：ペローナリーダーなら手札/トラッシュからコスト6以下＋コスト4以下のスリラーバークを登場 ／【カウンター】リーダー+3000
  "EB03-049": {"main":{"fx":[{"op":"restDonCost","n":7,"then":[{"op":"cond","check":{"leaderNameIncludes":"ペローナ"},"then":[{"op":"playFromHandOrTrash","filter":{"traitIncludes":"スリラーバーク海賊団","maxCost":6}},{"op":"playFromHandOrTrash","filter":{"traitIncludes":"スリラーバーク海賊団","maxCost":4}}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // EB03-050 コニス(c2): 【登場時】空島1枚に【ダブルアタック】
  "EB03-050": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"traitIncludes":"空島"}}]},
  // EB03-051 シャーロット・スムージー(c3): 【登場時】表向きライフがあれば相手コスト2以下1枚KO→自ライフ全裏向き(近似:常時)
  "EB03-051": {"onPlay":[{"op":"cond","check":{"faceUpLifeAtLeast":1},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"flipAllLifeDown"}]}]},
  // EB03-052 しらほし(c3): 【起動メイン】自身トラッシュ：しらほしリーダーならデッキ上1枚をライフに→海王類全+1000
  "EB03-052": {"act":{"label":"自身トラッシュ:ライフ補充＋海王類+1000","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"powerMod","side":"self","all":true,"amount":1000,"duration":"turn","filter":{"traitIncludes":"海王類"}}]}]}]}},
  // EB03-054 ニコ・ロビン(c3): 【登場時】ライフ上1枚をトラッシュ：デッキ上1枚をライフに
  "EB03-054": {"onPlay":[{"op":"lifeCost","action":"trash","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // EB03-056 ベロ・ベティ(c4): 【登場時】ライフ上1枚を表向き：相手の元々コスト3以下1枚KO
  "EB03-056": {"onPlay":[{"op":"flipLifeCost","then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":3},"count":1,"optional":true}]}]},
  // EB03-057 ヤマト(c5): 【登場時】ワノ国リーダーにレストのドン3付与 ／【KO時】相手ライフ上1枚をトラッシュ
  "EB03-057": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ワノ国"},"then":[{"op":"donAttach","target":"leader","n":3}]}],"onKO":[{"op":"lifeTrash","side":"opp"}]},
  // EB03-058 リリス(c5): 【自分のターン中】【登場時】自ライフ2枚以下で1ドロー
  "EB03-058": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"draw","n":1}]}]},
  // EB03-059 S-スネーク(c6): 【登場時】エッグヘッドリーダー＋ライフ2枚以上なら手札の【トリガー】持ちキャラをライフ上に表向きで加える
  "EB03-059": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"エッグヘッド"},{"lifeAtLeast":2}]},"then":[{"op":"handCharToLife","faceUp":true,"filter":{"hasTrigger":true}}]}]},
  // EB03-060 私のしもべになる？: 【メイン】ナミリーダーならデッキ上4枚からコスト2-8のカード1枚を手札に
  "EB03-060": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ナミ"},"then":[{"op":"search","look":4,"count":1,"filter":{"minCost":2,"maxCost":8},"optional":true}]}]}},
  // EB03-061 ウタ(c7): 【起動メイン】【ターン1回】ドン1アクティブ→相手のコスト4以下キャラかドン1枚をレスト ／【自分のターン終了時】ドン1レスト：FILM1枚をアクティブ
  "EB03-061": {"act":{"label":"ドン1アクティブ＋相手レスト","cost":{},"fx":[{"op":"donActivate","n":1},{"op":"chooseOption","options":[{"label":"キャラをレスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},{"label":"相手のドン1枚をレスト","fx":[{"op":"restOppDon","n":1}]}]}]},"onTurnEnd":[{"op":"restDonCost","n":1,"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"FILM"}}]}]},
  // EB03-062 トラファルガー・ロー(c8): 【速攻】 ／【起動メイン】手札1捨て＋自身トラッシュ：デッキ上1枚をライフに→手札からコスト7以下「ロー」を登場
  "EB03-062": {"act":{"label":"手札1捨て+自身トラッシュ:ライフ補充＋ロー登場","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"trashSelfCost","then":[{"op":"lifeAddFromDeck","n":1},{"op":"playSpecificFromHand","nameIncludes":"トラファルガー・ロー","filter":{"maxCost":7},"optional":true}]}]}]}}
});})();
/* ===== EB04（EXTRA BOOSTER 4）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  // EB04-001 ジュエリー・ボニー LEADER: 【相手のターン中】自ライフ1枚以下で+2000 ／【起動メイン】【ターン1回】相手1枚-1000→自ライフ2枚以上ならライフ上1枚を手札に
  "EB04-001": {"static":[{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"lifeAtMost":1}]},"power":2000}],"act":{"label":"相手-1000→ライフ手札","cost":{},"fx":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"lifeAtLeast":2},"then":[{"op":"lifeToHand","n":1,"optional":true}]}]}},
  // EB04-002 ジュエリー・ボニー(c1): 【登場時】デッキ上4枚から「自身」以外のエッグヘッド/麦わら1枚を手札に
  "EB04-002": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"or":[{"traitIncludes":"エッグヘッド"},{"traitIncludes":"麦わらの一味"}]},"exclude":"ジュエリー・ボニー","optional":true}]},
  // EB04-003 スモーカー＆たしぎ(c8): 【速攻】 ／【相手のターン中】自分の海軍リーダーを元々パワー7000に
  "EB04-003": {"static":[{"op":"setPowerOppTurn","leaderTarget":true,"power":7000,"cond":{"leaderTraitIncludes":"海軍"}}]},
  // EB04-004 ゼフ(c7): 【アタック時】自分のリーダーを次相手エンドまで元々パワー7000に
  "EB04-004": {"onAttack":[{"op":"setPower","target":"leader","value":7000,"duration":"untilNextEnd"}]},
  // EB04-005 トラファルガー・ロー(c3): 相手の元々パワー5000以上が2枚未満ならアタックできない
  "EB04-005": {"static":[{"op":"cantAttack","cond":{"not":{"oppChar":{"minPower":5000,"min":2}}}}]},
  // EB04-006 モーダ(c1): 【登場時】デッキ上7枚から「ルルシア王国」1枚を手札に
  "EB04-006": {"onPlay":[{"op":"search","look":7,"count":1,"filter":{"nameIncludes":"ルルシア王国"},"optional":true}]},
  // EB04-007 ロロノア・ゾロ(c7): 【登場時】リーダーを次相手エンドまで+2000 ／【起動メイン】【ターン1回】相手にパワー8000以上がいれば【速攻：キャラ】
  "EB04-007": {"onPlay":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}],"act":{"label":"相手8000+がいれば速攻:キャラ","cost":{},"fx":[{"op":"cond","check":{"oppChar":{"minEffPower":8000}},"then":[{"op":"giveKeyword","target":"self","kw":"rushChar","duration":"turn"}]}]}},
  // EB04-008 歪んだ未来: 【メイン】自ライフ2枚以下で相手1枚-3000 ／【カウンター】リーダー+3000
  "EB04-008": {"main":{"fx":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // EB04-009 弟子の船出だ…: 【メイン】「レイリー」にアクティブのドン1付与：相手1枚-2000 ／【カウンター】キャラか「レイリー」+2000
  "EB04-009": {"main":{"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"fromActive":true,"filter":{"nameIncludes":"シルバーズ・レイリー"}},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}},
  // EB04-010 ルルシア王国(STAGE): 【相手のターン中】自分の元々コスト1のキャラ全+5000 ／【登場時】相手1枚をパワー0に
  "EB04-010": {"static":[{"op":"allyPower","cond":{"oppTurn":true},"power":5000,"filter":{"maxBaseCost":1,"minBaseCost":1}}],"onPlay":[{"op":"setPower","side":"opp","value":0,"count":1,"optional":true}]},
  // EB04-011 ウロコ(c7): 【速攻：キャラ】 ／【登場時】海王類の数だけ引いて同数捨てる
  "EB04-011": {"onPlay":[{"op":"drawDiscardByCount","of":"selfChars","ofFilter":{"traitIncludes":"海王類"}}]},
  // EB04-012 菊之丞(c7): 【起動メイン】【ターン1回】登場ターンならワノ国リーダーをアクティブ
  "EB04-012": {"act":{"label":"登場ターン:ワノ国リーダーをアクティブ","cost":{},"fx":[{"op":"cond","check":{"and":[{"selfSummonedThisTurn":true},{"leaderTraitIncludes":"ワノ国"}]},"then":[{"op":"activateOwnChar","incLeader":true,"count":0}]}]}},
  // EB04-013 キャロット(c8): 【登場時】ミンク族リーダーならミンク族2枚とリーダーをアクティブ
  "EB04-013": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"activateOwnChar","incLeader":true,"count":2,"filter":{"restedOnly":true,"traitIncludes":"ミンク族"}}]}]},
  // EB04-014 光月スキヤキ(c3): 【ブロッカー】 ／【起動メイン】【ターン1回】ワノ国リーダーにレストのドン1付与
  "EB04-014": {"act":{"label":"ワノ国リーダーにレストのドン1","cost":{},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ワノ国"},"then":[{"op":"donAttach","target":"leader","n":1}]}]}},
  // EB04-015 ジンベエ(c7): 【ブロッカー】 ／【KO時】自分のカード1枚をレスト：魚人/人魚リーダーなら手札からコスト6以下の緑キャラを登場
  "EB04-015": {"onKO":[{"op":"restOwnAsCost","then":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"魚人族"},{"leaderTraitIncludes":"人魚族"}]},"then":[{"op":"playCharFromHand","filter":{"color":"緑","maxCost":6},"count":1,"optional":true}]}]}]},
  // EB04-016 トリ(c5): 【起動メイン】ドン1アクティブ ／【アタック時】海王類3枚以上なら相手コスト8以下1枚をレスト
  "EB04-016": {"act":{"label":"ドン1アクティブ","cost":{},"fx":[{"op":"donActivate","n":1},{"op":"setNoDonActivateChar"}]},"onAttack":[{"op":"cond","check":{"selfCharCount":{"filter":{"traitIncludes":"海王類"},"min":3}},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":8},"count":1,"optional":true}]}]},
  // EB04-017 ナゾムズ(c6): 【自分のターン中】ミンク族3枚以上で相手キャラ全コスト-1 ／【登場時】ミンク族リーダーなら手札からコスト5以下のミンク族を登場
  "EB04-017": {"static":[{"op":"oppCostMod","amount":-1,"cond":{"and":[{"selfTurn":true},{"selfCharCount":{"filter":{"traitIncludes":"ミンク族"},"min":3}}]}}],"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"playCharFromHand","filter":{"traitIncludes":"ミンク族","maxCost":5},"count":1,"optional":true}]}]},
  // EB04-018 メガロ(c4): 【登場時】このキャラレスト：相手のレストのパワー8000以下1枚KO
  "EB04-018": {"onPlay":[{"op":"restSelfCost","then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxEffPower":8000},"count":1,"optional":true}]}]},
  // EB04-019 エレ爪: 【メイン】自分のカード1枚をレスト：ミンク族リーダーなら相手キャラ1枚コスト-3 ／【カウンター】ミンク族+3000
  "EB04-019": {"main":{"fx":[{"op":"restOwnAsCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"ミンク族"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]}]}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true,"filter":{"traitIncludes":"ミンク族"}}]}},
  // EB04-020 鮫瓦正拳: 【カウンター】魚人族のリーダーかキャラ+3000→魚人族1枚をアクティブ
  "EB04-020": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true,"filter":{"traitIncludes":"魚人族"}},{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"魚人族"}}]}},
  // EB04-021 イガラム(c3): 【登場時】ビビリーダーなら2ドロー＋手札1捨て ／【起動メイン】【ターン1回】手札1捨て：リーダーかキャラにレストのドン1付与
  "EB04-021": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ネフェルタリ・ビビ"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}],"act":{"label":"手札1捨て:レストのドン1付与","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  // EB04-022 イッショウ(c5): 【登場時】手札2枚捨て：相手手札6以上なら相手は手札2枚をデッキ下 ／【ドン×1】【アタック時】手札1捨て：相手1枚-2000
  "EB04-022": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppHandToBottom","n":2}]}]}],"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]}]},
  // EB04-023 チャカ＆ペル(c8): 【ダブルアタック】 ／【登場時】リーダー-5000：2ドロー
  "EB04-023": {"onPlay":[{"op":"leaderMinusCost","amount":5000,"then":[{"op":"draw","n":2}]}]},
  // EB04-024 テラコッタ(c2): 【起動メイン】レスト＋手札1捨て：アラバスタ1枚に【ブロック不可】
  "EB04-024": {"act":{"label":"レスト＋手札1捨て:アラバスタにブロック不可","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn","filter":{"traitIncludes":"アラバスタ王国"}}]}]}},
  // EB04-025 ネフェルタリ・ビビ(c7): 【登場時】手札から「自身」以外のコスト8以下アラバスタを登場→相手は手札1枚をデッキ下
  "EB04-025": {"onPlay":[{"op":"playCharFromHand","filter":{"traitIncludes":"アラバスタ王国","maxCost":8,"nameExcludes":"ネフェルタリ・ビビ"},"count":1,"optional":true},{"op":"oppHandToBottom","n":1}]},
  // EB04-026 ブルーグラス(c4): 【登場時】相手コスト1以下1枚を持ち主のデッキ下 ／【アタック時】1ドロー＋手札1捨て
  "EB04-026": {"onPlay":[{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}],"onAttack":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]},
  // EB04-027 ボア・ハンコック(c5): 【登場時】2ドロー＋手札1捨て
  "EB04-027": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  // EB04-028 アイスタイム: 【メイン】手札1捨て：海軍リーダーなら相手のパワー10000以下2枚は次相手エンドまでアタック不可
  "EB04-028": {"main":{"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"setAttackBan","filter":{"maxEffPower":10000},"count":2,"duration":"untilNextEnd","optional":true}]}]}]}},
  // EB04-029 女の…涙の落ちる音がした: 【メイン】サンジリーダーならデッキ上3枚から「サンジ」かイベントを手札に ／【カウンター】手札1捨て：「サンジ」+4000
  "EB04-029": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"サンジ"},"then":[{"op":"search","look":3,"count":1,"filter":{"or":[{"nameIncludes":"サンジ"},{"type":"EVENT"}]},"rest":"trash","optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true,"filter":{"nameIncludes":"サンジ"}}]}]}},
  // EB04-030 カイドウ(c7): KOされる代わりにドン1枚をドンデッキへ ／【登場時】ドン-2：百獣リーダーなら【速攻】→相手コスト7以下1枚レスト
  "EB04-030": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"pay":"donToDeck"}],"onPlay":[{"op":"donMinus","n":2},{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"},{"op":"restChar","side":"opp","filter":{"maxCost":7},"count":1,"optional":true}]}]},
  // EB04-031 キング(c6): KOされる代わりにドン1枚をドンデッキへ ／【起動メイン】【ターン1回】百獣リーダー＋他に「キング」なしならドン1アクティブ＋1レスト追加
  "EB04-031": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"pay":"donToDeck"}],"act":{"label":"ドン1アクティブ＋1レスト追加","cost":{},"fx":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"百獣海賊団"},{"not":{"selfCharOther":{"filter":{"nameIncludes":"キング"}}}}]},"then":[{"op":"donFromDeck","n":1,"mode":"active"},{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  // EB04-032 クイーン(c1): 【登場時】百獣1枚捨て：2ドロー ／【起動メイン】【ターン1回】ドン2レスト：百獣リーダーならドン1レスト追加
  "EB04-032": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"traitIncludes":"百獣海賊団"},"then":[{"op":"draw","n":2}]}],"act":{"label":"ドン2レスト:百獣でドン1レスト追加","cost":{},"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}]}},
  // EB04-033 グロッキーモンスターズ(c5): 【登場時】ドン-1：フォクシー3枚以上なら相手の元々パワー6000以下1枚KO
  "EB04-033": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"selfCharCount":{"filter":{"traitIncludes":"フォクシー海賊団"},"min":3}},"then":[{"op":"ko","side":"opp","filter":{"maxPower":6000},"count":1,"optional":true}]}]},
  // EB04-034 シャーロット・プリン(c2): 【ブロッカー】 ／【相手のアタック時】【ターン1回】手札1捨て：トラッシュにイベント4枚以上ならリーダーかキャラ+2000
  "EB04-034": {"onOppAttack":[{"op":"discardCost","count":1,"optional":true,"once":"turn","then":[{"op":"cond","check":{"trashEventAtLeast":4},"then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]}]},
  // EB04-035 人斬り鎌ぞう(c3): 【ブロッカー】 ／【ターン1回】ドンが戻された時、キッドリーダーならドン1レスト追加
  "EB04-035": {"onDonReturned":[{"op":"cond","once":"turn","check":{"and":[{"selfTurn":true},{"leaderTraitIncludes":"キッド海賊団"}]},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  // EB04-036 フォクシー(c8): 【登場時】ドン-1：フォクシーリーダーなら2ドロー＋手札1捨て→相手コスト9以下1枚レスト ／【起動メイン】【ターン1回】ドン1レスト追加
  "EB04-036": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"フォクシー海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":9},"count":1,"optional":true}]}],"act":{"label":"ドン1レスト追加","cost":{},"fx":[{"op":"donFromDeck","n":1,"mode":"rested"}]}},
  // EB04-037 ポルチェ(c1): 【登場時】フォクシーリーダーならデッキ上5枚からフォクシー1枚を手札に
  "EB04-037": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"フォクシー海賊団"},"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"フォクシー海賊団"},"optional":true}]}]},
  // EB04-038 ロシナンテ＆ロー(c6): 別名ロー＆ロシナンテ ／【ブロッカー】 ／【登場時】ドンが相手以下なら1ドロー→ドン1アクティブ追加
  "EB04-038": {"onPlay":[{"op":"cond","check":{"donLEOpp":true},"then":[{"op":"draw","n":1}]},{"op":"donFromDeck","n":1,"mode":"active"}]},
  // EB04-039 ユースタス・キッド(c7): 【登場時】ドン1アクティブ追加 ／【起動メイン】自身トラッシュ：手札からコスト5以下のキッド海賊団を登場
  "EB04-039": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"active"}],"act":{"label":"自身トラッシュ:キッド海賊団を登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"playCharFromHand","filter":{"traitIncludes":"キッド海賊団","maxCost":5},"count":1,"optional":true}]}]}},
  // EB04-040 火龍大炬: 【メイン】ドン6レスト：「カイドウ」1枚+3000→相手1枚レスト ／【カウンター】ドン-1：リーダー+4000
  "EB04-040": {"main":{"fx":[{"op":"restDonCost","n":6,"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true,"filter":{"nameIncludes":"カイドウ"}},{"op":"restChar","side":"opp","count":1,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"leaderBuff","amount":4000,"duration":"battle"}]}},
  // EB04-041 ステルス・ブラック: 【メイン】サンジリーダー＋場のドン4以上なら手札/トラッシュからパワー6000以下「サンジ」を登場
  "EB04-041": {"main":{"fx":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"サンジ"},{"donAtLeast":4}]},"then":[{"op":"playFromHandOrTrash","filter":{"nameIncludes":"サンジ","maxPower":6000}}]}]}},
  // EB04-042 アルファ(c1): 【登場時】デッキ上3枚トラッシュ：相手キャラ1枚コスト-1
  "EB04-042": {"onPlay":[{"op":"deckTrashCost","n":3,"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]}]},
  // EB04-043 カク(c3): 【ターン1回】元々コスト5以下の黒キャラが相手効果KOされる代わりにトラッシュ3枚をデッキ下 ／【登場時】デッキ上2枚トラッシュ
  "EB04-043": {"static":[{"op":"leaveProtect","onlyKO":true,"once":"turn","pay":"trashToDeck","targetFilter":{"maxBaseCost":5,"color":"黒"}}],"onPlay":[{"op":"deckToTrash","n":2}]},
  // EB04-044 コビー(c6): 【ターン1回】海軍リーダーでこのキャラが離れる代わりに手札1捨て ／【自分のターン中】【ターン1回】相手キャラKO時1ドロー
  "EB04-044": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"discardFromHand","cond":{"leaderTraitIncludes":"海軍"}}],"onOppKO":{"when":"selfTurn","once":"turn","fx":[{"op":"draw","n":1}]}},
  // EB04-045 ジニー(c1): 【起動メイン】レスト：コスト8以上が2枚以上なら革命軍のリーダーかキャラ+1000
  "EB04-045": {"act":{"label":"レスト:コスト8以上2枚で革命軍+1000","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":2}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"革命軍"}}]}]}},
  // EB04-046 ドール(c2): 【ブロッカー】 ／【相手のターン中】自分の海軍キャラ全コスト+2
  "EB04-046": {"static":[{"op":"allyCost","cond":{"oppTurn":true},"amount":2,"filter":{"traitIncludes":"海軍"}}]},
  // EB04-047 ヘルメッポ(c3): 【起動メイン】自身トラッシュ：手札/トラッシュから「自身」以外のコスト3以下SWORDを登場
  "EB04-047": {"act":{"label":"自身トラッシュ:SWORDを登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"playFromHandOrTrash","filter":{"traitIncludes":"SWORD","maxCost":3,"nameExcludes":"ヘルメッポ"}}]}]}},
  // EB04-048 ロブ・ルッチ(c4): CPリーダーでトラッシュ5枚につき+1000しコスト+2 ／【登場時】自キャラ1枚トラッシュ：1ドロー
  "EB04-048": {"static":[{"op":"trashPower","per":5,"amount":1000,"cond":{"leaderTraitIncludes":"CP"}},{"op":"staticCost","per":5,"amount":2,"cond":{"leaderTraitIncludes":"CP"}}],"onPlay":[{"op":"trashOwnCharCost","then":[{"op":"draw","n":1}]}]},
  // EB04-049 指銃 黄蓮: 【メイン】デッキ上2枚トラッシュ：相手の元々コスト5以下1枚KO
  "EB04-049": {"main":{"fx":[{"op":"deckTrashCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":5},"count":1,"optional":true}]}]}},
  // EB04-050 調教してあげる♡: 【メイン】SWORDのリーダーかキャラ1枚がアクティブにもアタック可 ／【カウンター】リーダー+3000
  "EB04-050": {"main":{"fx":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"SWORD"}}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // EB04-051 エメト(c8): 元々パワー12000以上がいないとアタックできない
  "EB04-051": {"static":[{"op":"cantAttack","cond":{"not":{"or":[{"selfCharCount":{"filter":{"minPower":12000},"min":1}},{"oppChar":{"minPower":12000}}]}}}]},
  // EB04-052 サンジ(c4): 【アタック時】このキャラの元々パワーを相手リーダーと同じに ／【KO時】自ライフ2枚以下なら手札からパワー6000以下の黄キャラを登場
  "EB04-052": {"onAttack":[{"op":"setPower","target":"self","valueFrom":"oppLeaderPower"}],"onKO":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playCharFromHand","filter":{"color":"黄","maxPower":6000},"count":1,"optional":true}]}]},
  // EB04-054 バーソロミュー・くま(c7): 【登場時】自ライフ2枚以下ならデッキ上1枚をライフに ／【KO時】相手ライフ上1枚を持ち主の手札に
  "EB04-054": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"lifeAddFromDeck","n":1}]}],"onKO":[{"op":"oppLifeToHand","n":1,"optional":true}]},
  // EB04-055 バーソロミュー・くま(c4): 【KO時】手札からコスト4以下の革命軍を登場
  "EB04-055": {"onKO":[{"op":"playCharFromHand","filter":{"traitIncludes":"革命軍","maxCost":4},"count":1,"optional":true}]},
  // EB04-056 パシフィスタ(c1): 自分の「ジュエリー・ボニー」がいて自ライフ0なら【ブロッカー】
  "EB04-056": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"and":[{"selfChar":{"nameIncludes":"ジュエリー・ボニー"}},{"lifeAtMost":0}]}}]},
  // EB04-057 ベガパンク(c2): 自ライフ2枚以下で自分の黄・科学者は相手効果で場を離れない ／【ドン×1】【ブロッカー】
  "EB04-057": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"donX1":true}},{"op":"allyLeaveImmune","cond":{"lifeAtMost":2},"filter":{"color":"黄","trait":"科学者"}}]},
  // EB04-059 黒縄・大龍巻: 【メイン】ライフ上1枚を表向き：自キャラが相手より少ないなら相手コスト6以下1枚＋コスト5以下1枚KO
  "EB04-059": {"main":{"fx":[{"op":"flipLifeCost","then":[{"op":"cond","check":{"selfCharsFewerBy":1},"then":[{"op":"ko","side":"opp","filter":{"maxCost":6},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]}]}},
  // EB04-060 ゴムゴムの鷹銃乱打: 【メイン】ライフ上か下1枚を手札に：手札からエッグヘッドキャラをライフ上に表向きで加える→相手1枚-1000
  "EB04-060": {"main":{"fx":[{"op":"lifeCost","pos":"choose","then":[{"op":"handCharToLife","faceUp":true,"filter":{"traitIncludes":"エッグヘッド"}},{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}]}},
  // EB04-061 モンキー・D・ルフィ(c10): 自ライフ1枚以下でコスト-1 ／【登場時】手札1捨て：リーダーを次相手エンドまで+2000→このキャラは次相手エンドまで【ブロッカー】
  "EB04-061": {"costMod":{"cond":{"lifeAtMost":1},"amount":-1},"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"},{"op":"giveKeyword","target":"self","kw":"blocker","duration":"untilNextEnd"}]}]}
});})();
/* ===== 再録カード（EB/ST/P/PRB）＝効果テキストが本編と完全一致 → 本編のfxを再利用（DRY） ===== */
(function () { var R = {
  "EB01-007": "OP03-009", "EB02-017": "OP01-016", "EB02-046": "OP07-082",
  "P-069": "OP11-016", "PRB02-012": "OP01-016",
  "ST05-002": "OP01-106", "ST06-016": "OP09-116", "ST07-008": "OP06-099",
  "ST08-008": "OP02-106", "ST14-002": "OP08-085", "ST21-004": "OP14-051",
  "ST23-005": "OP03-009", "ST24-003": "OP04-029",
  "P-013": "OP06-016", "P-017": "OP01-006", "P-019": "OP01-017", "P-062": "OP06-034", "P-094": "OP03-034", "P-049": "EB03-023", "P-093": "EB03-035"
}; for (var k in R) if (window.CARD_FX[R[k]] && !window.CARD_FX[k]) window.CARD_FX[k] = window.CARD_FX[R[k]]; })();
/* ===== ST01-ST10（スターターデッキ）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  "ST01-002": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"denyBlocker","all":true,"filter":{"minEffPower":5000}}]}]},
  "ST01-004": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donX2":true}}]},
  "ST01-005": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"self","leader":true,"excludeSelf":true,"amount":1000,"duration":"turn","count":1,"optional":true}]}]},
  "ST01-007": {"act":{"label":"リーダーかキャラにレストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","n":1}]}},
  "ST01-011": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":2}]},
  "ST01-012": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"denyBlocker","all":true}]}]},
  "ST01-013": {"static":[{"op":"condBuff","cond":{"donX1":true},"power":1000}]},
  "ST01-014": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}},
  "ST01-015": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}]}},
  "ST01-016": {"main":{"fx":[{"op":"giveKeyword","target":"chooseOwnL","kw":"unblockable","duration":"turn","filter":{"traitIncludes":"麦わらの一味"}}]}},
  "ST01-017": {"act":{"label":"レスト:麦わらのリーダーかキャラ+1000","cost":{"restSelf":true},"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"麦わらの一味"}}]}},
  "ST02-001": {"act":{"label":"ドン3レスト＋手札1捨て:リーダーをアクティブ","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"discardCost","count":1,"then":[{"op":"activateOwnChar","incLeader":true,"count":0}]}]}]}},
  "ST02-003": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfCharCount":{"min":3}}]},"power":2000}]},
  "ST02-005": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]},
  "ST02-007": {"act":{"label":"ドン1＋レスト:超新星サーチ","cost":{"restSelf":true},"fx":[{"op":"restDonCost","n":1,"then":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星"},"optional":true}]}]}},
  "ST02-008": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"restOppDon","n":1},{"op":"donRefreshLock","n":1}]}]},
  "ST02-009": {"onPlay":[{"op":"activateOwnChar","count":1,"optional":true,"filter":{"restedOnly":true,"maxCost":5,"or":[{"traitIncludes":"超新星"},{"traitIncludes":"ハートの海賊団"}]}}]},
  "ST02-010": {"onAttack":[{"op":"condTargetChar","once":"turn","then":[{"op":"cond","check":{"donX1":true},"then":[{"op":"activateSelf"}]}]}]},
  "ST02-013": {"onTurnEnd":[{"op":"cond","check":{"donX1":true},"then":[{"op":"activateSelf"}]}]},
  "ST02-014": {"static":[{"op":"allyPower","cond":{"and":[{"donX1":true},{"selfTurn":true},{"selfRested":true}]},"power":1000,"filter":{"or":[{"traitIncludes":"超新星"},{"traitIncludes":"海軍"}]}}]},
  "ST02-015": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"donActivate","n":1}]}},
  "ST02-016": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"donActivate","n":1}]}},
  "ST02-017": {"main":{"fx":[{"op":"restChar","side":"opp","count":1,"optional":true}]}},
  "ST03-004": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"maxCost":4,"or":[{"traitIncludes":"王下七武海"},{"traitIncludes":"スリラーバーク海賊団"}],"nameExcludes":"ゲッコー・モリア"}}]},
  "ST03-005": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}]},
  "ST03-007": {"act":{"label":"ドン2レスト:デッキからパシフィスタ登場","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"restDonCost","n":2,"then":[{"op":"playFromDeck","look":"all","filter":{"nameIncludes":"パシフィスタ","maxCost":4}}]}]}]}},
  "ST03-009": {"onPlay":[{"op":"bounce","side":"any","maxCost":7,"count":1,"optional":true}]},
  "ST03-010": {"onPlay":[{"op":"scry","look":3}]},
  "ST03-014": {"onPlay":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]},
  "ST03-015": {"main":{"fx":[{"op":"bounce","side":"any","maxCost":7,"count":1,"optional":true}]}},
  "ST03-016": {"counter":{"cost":0,"fx":[{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}]}},
  "ST03-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"selfHandAtMost":3},"then":[{"op":"draw","n":1}]}]}},
  "ST04-001": {"act":{"label":"ドン-7:相手ライフ1枚をトラッシュ","cost":{},"fx":[{"op":"donMinus","n":7},{"op":"lifeTrash","side":"opp"}]}},
  "ST04-002": {"onPlay":[{"op":"donMinus","n":1},{"op":"playSpecificFromHand","nameIncludes":"ページワン","filter":{"maxCost":4},"optional":true}]},
  "ST04-003": {"onPlay":[{"op":"donMinus","n":5},{"op":"ko","side":"opp","filter":{"maxCost":6},"count":1,"optional":true},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]},
  "ST04-004": {"onPlay":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},
  "ST04-005": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":2},{"op":"discardOwn","n":1}]},
  "ST04-006": {"onPlay":[{"op":"donMinus","n":1},{"op":"draw","n":1}]},
  "ST04-008": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  "ST04-010": {"onPlay":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},
  "ST04-014": {"main":{"fx":[{"op":"draw","n":1},{"op":"donFromDeck","n":1,"mode":"active"}]}},
  "ST04-015": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":6},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"active"}]}},
  "ST04-016": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}},
  "ST04-017": {"act":{"label":"レスト:百獣でドン1レスト追加","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"百獣海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]}},
  "ST05-005": {"act":{"label":"レスト＋FILM捨て:ドン劣勢で2レスト追加","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"FILM"},"then":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"donFromDeck","n":2,"mode":"rested"}]}]}]}},
  "ST05-006": {"onAttack":[{"op":"donMinus","n":2},{"op":"draw","n":2}]},
  "ST05-008": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"donAtLeast":8}}]},
  "ST05-010": {"onAttack":[{"op":"condTargetChar","attr":"打","then":[{"op":"powerMod","target":"self","amount":3000,"duration":"turn"}]}],"onOppAttack":[{"op":"condAttacker","attr":"打","then":[{"op":"powerMod","target":"self","amount":3000,"duration":"turn"}]}],"act":{"label":"ドン-1:このキャラ+2000","cost":{},"fx":[{"op":"donMinus","n":1},{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"turn"}]}},
  "ST05-011": {"act":{"label":"ドン-4:相手2枚レスト＋【ダブルアタック】","cost":{},"fx":[{"op":"donMinus","n":4},{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":2,"optional":true},{"op":"giveKeyword","target":"self","kw":"doubleAttack","duration":"turn"}]}},
  "ST05-014": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"FILM"},"exclude":"ブエナ・フェスタ","optional":true}]},
  "ST05-016": {"main":{"fx":[{"op":"donMinus","n":2},{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}},
  "ST05-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true,"koImmuneIfChar":true,"filter":{"traitIncludes":"FILM"}}]}},
  "ST06-002": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]},
  "ST06-004": {"static":[{"op":"effectImmune"},{"op":"staticKeyword","kw":"doubleAttack","cond":{"and":[{"donX1":true},{"or":[{"oppChar":{"cost":0}},{"selfChar":{"cost":0}}]}]}}]},
  "ST06-005": {"onAttack":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]},
  "ST06-006": {"act":{"label":"レスト:相手コスト-2","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}},
  "ST06-008": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]},
  "ST06-010": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]},
  "ST06-012": {"act":{"label":"手札1捨て＋レスト:相手コスト4以下KO","cost":{"restSelf":true},"fx":[{"op":"discardCost","count":1,"then":[{"op":"ko","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}]}},
  "ST06-014": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"activeOnly":true,"maxCost":3},"count":1,"optional":true}]}},
  "ST06-015": {"main":{"fx":[{"op":"draw","n":1},{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}},
  "ST06-017": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}],"act":{"label":"レスト:海軍で相手コスト-1","cost":{"restSelf":true},"fx":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]}]}},
  "ST07-003": {"onPlay":[{"op":"peekLifeTopPlace"},{"op":"cond","check":{"selfLifeLessThanOpp":true},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  "ST07-004": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"lifeCost","pos":"choose","then":[{"op":"giveKeyword","target":"self","kw":"banish","duration":"battle"},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]}]},
  "ST07-005": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"lifeCost","pos":"choose","then":[{"op":"lifeAddFromDeck","n":1}]}]}]},
  "ST07-009": {"act":{"label":"レスト＋ライフ手札:相手コスト3以下KO","cost":{"restSelf":true},"fx":[{"op":"lifeCost","pos":"choose","then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}},
  "ST07-010": {"onPlay":[{"op":"chooseOption","chooser":"opp","options":[{"label":"自分のライフ上1枚をトラッシュ","fx":[{"op":"lifeTrash","side":"opp"}]},{"label":"デッキ上1枚をライフに加える","fx":[{"op":"oppLifeAddFromDeck","n":1}]}]}]},
  "ST07-011": {"act":{"label":"レスト:リンリンに【バニッシュ】","cost":{"restSelf":true},"fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"banish","duration":"turn","filter":{"nameIncludes":"シャーロット・リンリン"}}]}},
  "ST07-013": {"act":{"label":"レスト:リンリンに【ダブルアタック】","cost":{"restSelf":true},"fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"doubleAttack","duration":"turn","filter":{"nameIncludes":"シャーロット・リンリン"}}]}},
  "ST07-015": {"main":{"fx":[{"op":"chooseOption","chooser":"opp","options":[{"label":"自分のライフ上1枚をトラッシュ","fx":[{"op":"lifeTrash","side":"opp"}]},{"label":"デッキ上1枚をライフに加える","fx":[{"op":"oppLifeAddFromDeck","n":1}]}]}]}},
  "ST07-016": {"counter":{"cost":0,"fx":[{"op":"peekLifeTopPlace"},{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}},
  "ST07-017": {"act":{"label":"レスト＋ライフ手札:コスト3キャラをライフに","cost":{"restSelf":true},"fx":[{"op":"lifeCost","pos":"choose","then":[{"op":"charToLife","side":"self","filter":{"cost":3},"faceUp":true,"optional":true}]}]}},
  "ST08-001": {"onOppKO":{"when":"selfTurn","anySide":true,"fx":[{"op":"donAttach","target":"leader","n":1}]}},
  "ST08-002": {"static":[{"op":"condBuff","battleImmune":true,"vsLeaderOnly":true}],"act":{"label":"レスト:相手コスト-2","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"opp","count":1,"amount":-2,"duration":"turn","optional":true}]}},
  "ST08-004": {"act":{"label":"レスト:相手コスト2以下KO","cost":{"restSelf":true},"fx":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}},
  "ST08-005": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"any","filter":{"maxCost":1},"all":true}]}]},
  "ST08-006": {"onPlay":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]},
  "ST08-009": {"onPlay":[{"op":"cond","check":{"or":[{"oppChar":{"cost":0}},{"selfChar":{"cost":0}}]},"then":[{"op":"draw","n":1}]}]},
  "ST08-013": {"onBattleEndVsChar":[{"op":"cond","check":{"donX1":true},"then":[{"op":"koBattledTarget"}]}]},
  "ST08-014": {"main":{"fx":[{"op":"lifeCost","then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-7,"duration":"turn","optional":true}]}]}},
  "ST08-015": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}},
  "ST09-004": {"static":[{"op":"condBuff","battleImmune":true,"cond":{"and":[{"donX1":true},{"lifeAtMost":2}]}}]},
  "ST09-005": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"donX1":true}}],"onKO":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  "ST09-008": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"lifeCost","pos":"choose","then":[{"op":"playCharFromHand","filter":{"color":"黄","traitIncludes":"ワノ国","maxCost":4},"count":1,"optional":true}]}]}]},
  "ST09-010": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"selfLifeTrash"}]},
  "ST09-012": {"onAttack":[{"op":"lifeCost","pos":"choose","then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"}]}]},
  "ST09-014": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-3000,"duration":"turn","count":1,"optional":true}]}]}},
  "ST09-015": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"charToLife","filter":{"maxCost":3},"faceUp":true,"pos":"choose","optional":true}]}]}},
  "ST10-002": {"act":{"label":"ドン0か8以上:ドン1アクティブ追加","cost":{},"fx":[{"op":"cond","check":{"or":[{"donAtMost":0},{"donAtLeast":8}]},"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]}},
  "ST10-003": {"static":[{"op":"condBuff","cond":{"and":[{"selfTurn":true},{"lifeAtLeast":4}]},"power":-1000}],"onAttack":[{"op":"donMinus","n":1},{"op":"leaderBuff","amount":2000,"duration":"turn"}]},
  "ST10-004": {"onPlay":[{"op":"cond","check":{"oppChar":{"minEffPower":5000}},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  "ST10-005": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]}]},
  "ST10-006": {"onOppBlocker":{"once":"turn","fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":8000},"count":1,"optional":true}]}},
  "ST10-007": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":1,"optional":true}]}]},
  "ST10-008": {"onPlay":[{"op":"cond","check":{"donAtMost":3},"then":[{"op":"donFromDeck","n":2,"mode":"rested"}]}]},
  "ST10-009": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"donFromDeck","n":1,"mode":"active"}]}]},
  "ST10-010": {"onPlay":[{"op":"donMinus","n":1},{"op":"cond","check":{"oppHandAtLeast":7},"then":[{"op":"oppDiscard","n":2}]}]},
  "ST10-011": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"}]}]},
  "ST10-012": {"onPlay":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}],"onAttack":[{"op":"cond","check":{"oppDonGreater":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  "ST10-013": {"onPlay":[{"op":"donMinus","n":1},{"op":"leaderBuff","amount":1000,"duration":"untilNextStart"}],"onAttack":[{"op":"donMinus","n":1},{"op":"leaderBuff","amount":1000,"duration":"untilNextStart"}]},
  "ST10-014": {"onDonReturned":[{"op":"cond","once":"turn","check":{"selfTurn":true},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  "ST10-015": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}},
  "ST10-016": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":7000},"count":1,"optional":true}]}},
  "ST10-017": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"rested"}]}}
});})();
/* ===== ST11-ST20（スターターデッキ）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  "ST11-001": {"onAttack":[{"op":"cond","check":{"donX1":true},"once":"turn","then":[{"op":"search","look":1,"count":1,"filter":{"traitIncludes":"FILM"},"optional":true}]}]},
  "ST11-002": {"onTurnEnd":[{"op":"discardCost","count":1,"optional":true,"filter":{"type":"EVENT"},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"FILM"}}]}]},
  "ST11-003": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"chooseOption","options":[{"label":"相手コスト5以下1枚レスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]},{"label":"相手のレストのコスト5以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":1,"optional":true}]}]}]}]}},
  "ST11-004": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"FILM"},"exclude":"新時代","optional":true},{"op":"donActivate","n":1}]}]}},
  "ST11-005": {"main":{"fx":[{"op":"activateOwnChar","incLeader":true,"count":0}]}},
  "ST12-002": {"act":{"label":"レスト:相手コスト4以下レスト","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]}},
  "ST12-003": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"max":2}},"then":[{"op":"playCharFromHand","filter":{"maxCost":4,"or":[{"traitIncludes":"シッケアール王国"},{"attr":"斬"}],"nameExcludes":"ジュラキュール・ミホーク"},"count":1,"optional":true,"rested":true}]}]},
  "ST12-006": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"chooseOption","options":[{"label":"相手コスト2以下1枚レスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]},{"label":"相手のレストのコスト2以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":2},"count":1,"optional":true}]}]}]}]},
  "ST12-007": {"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"oppLifeAtLeast":3},"then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":4,"attr":"斬"}}]}]}]},
  "ST12-008": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]}]},
  "ST12-010": {"onPlay":[{"op":"playFromDeck","look":1,"restPos":"choose","filter":{"cost":2,"type":"CHAR"}}],"onAttack":[{"op":"cond","check":{"selfHandAtMost":6},"once":"turn","then":[{"op":"draw","n":1}]}]},
  "ST12-011": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"selfHandAtMost":5}]},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"}]}]},
  "ST12-012": {"act":{"label":"このキャラを手札に戻す","cost":{},"fx":[{"op":"bounceSelfCost"}]}},
  "ST12-013": {"onPlay":[{"op":"scry","look":3}],"onAttack":[{"op":"playFromDeck","look":1,"rested":true,"restPos":"choose","filter":{"cost":2,"type":"CHAR"}}]},
  "ST12-014": {"onPlay":[{"op":"scry","look":3}]},
  "ST12-016": {"main":{"fx":[{"op":"restChar","side":"opp","includeLeader":true,"filter":{"maxCost":4},"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"restChar","side":"opp","includeLeader":true,"filter":{"maxCost":4},"count":1,"optional":true}]}},
  "ST12-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"playFromDeck","look":1,"restPos":"choose","filter":{"cost":2,"type":"CHAR"}}]}},
  "ST13-001": {"act":{"label":"コスト3以上パワー7000以上をライフへ:キャラ+2000","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"charToLife","side":"self","filter":{"minCost":3,"minEffPower":7000},"faceUp":true,"optional":true},{"op":"powerMod","side":"self","amount":2000,"duration":"untilNextStart","count":1,"optional":true}]}]}},
  "ST13-002": {"act":{"label":"デッキ上5枚からコスト5キャラをライフに表向き","cost":{},"fx":[{"op":"cond","check":"donX2","then":[{"op":"searchToLife","look":5,"filter":{"cost":5,"type":"CHAR"},"faceUp":true}]}]},"onTurnEnd":[{"op":"lifeTrashFaceUp"}]},
  "ST13-003": {"act":{"label":"手札1捨て:ライフ0なら手札/トラッシュのコスト5を2枚ライフに","cost":{},"fx":[{"op":"cond","check":"donX2","then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"lifeAtMost":0},"then":[{"op":"handCharToLife","faceUp":true,"fromTrash":true,"filter":{"cost":5}},{"op":"handCharToLife","faceUp":true,"fromTrash":true,"filter":{"cost":5}}]}]}]}]}},
  "ST13-004": {"onPlay":[{"op":"lifeAddFromDeck","n":1},{"op":"reorderLife","oneToDeckTop":true}]},
  "ST13-005": {"onPlay":[{"op":"lifeCost","action":"trash","pos":"choose","then":[{"op":"handCharToLife","filter":{"cost":5}}]}]},
  "ST13-006": {"onPlay":[{"op":"playSpecificFromHand","name":"サボ","filter":{"cost":2},"optional":true},{"op":"playSpecificFromHand","name":"ポートガス・D・エース","filter":{"cost":2},"optional":true},{"op":"playSpecificFromHand","name":"モンキー・D・ルフィ","filter":{"cost":2},"optional":true}]},
  "ST13-007": {"act":{"label":"自身トラッシュ:ライフ公開しコスト5「サボ」を登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"revealLifePlay","filter":{"nameIncludes":"サボ","cost":5}},{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]}},
  "ST13-008": {"onPlay":[{"op":"lifeCost","pos":"choose","action":"trash","then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  "ST13-009": {"onPlay":[{"op":"lifeFlipDownCost","then":[{"op":"cond","check":{"oppHandAtLeast":7},"then":[{"op":"lifeTrash","side":"opp"}]}]}]},
  "ST13-010": {"act":{"label":"自身トラッシュ:ライフ公開しコスト5「エース」を登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"revealLifePlay","filter":{"nameIncludes":"ポートガス・D・エース","cost":5}},{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]}},
  "ST13-011": {"onPlay":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]},
  "ST13-012": {"onPlay":[{"op":"lifeCost","pos":"choose","then":[{"op":"reorderLife"}]}]},
  "ST13-013": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"maxCost":5,"or":[{"nameIncludes":"サボ"},{"nameIncludes":"ポートガス・D・エース"},{"nameIncludes":"モンキー・D・ルフィ"}]},"optional":true}]},
  "ST13-014": {"act":{"label":"自身トラッシュ:ライフ公開しコスト5「ルフィ」を登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"revealLifePlay","filter":{"nameIncludes":"モンキー・Ｄ・ルフィ","cost":5}},{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]}},
  "ST13-015": {"act":{"label":"このキャラ+2000→1ドロー＋ライフ1枚トラッシュ","cost":{},"fx":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"},{"op":"cond","check":{"lifeAtLeast":1},"then":[{"op":"draw","n":1},{"op":"lifeTrash"}]}]}},
  "ST13-016": {"onPlay":[{"op":"reorderLife","oneToDeckTop":true}]},
  "ST13-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"reorderLife"}]}},
  "ST13-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":0},"then":[{"op":"draw","n":1}]}]}},
  "ST13-019": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"maxCost":5,"or":[{"nameIncludes":"サボ"},{"nameIncludes":"ポートガス・D・エース"},{"nameIncludes":"モンキー・Ｄ・ルフィ"}]},"optional":true}]}},
  "ST14-001": {"static":[{"op":"allyCost","cond":{"donX1":true},"amount":1},{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfCharCount":{"filter":{"minCost":8},"min":1}}]},"power":1000}]},
  "ST14-003": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":6},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  "ST14-004": {"act":{"label":"黒麦わら1枚をコスト+2","cost":{},"fx":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true,"filter":{"color":"黒","traitIncludes":"麦わらの一味"}}]}},
  "ST14-006": {"onPlay":[{"op":"cond","check":{"and":[{"selfCharCount":{"filter":{"minCost":8},"min":1}},{"selfHandAtMost":6}]},"then":[{"op":"draw","n":1}]}]},
  "ST14-007": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-5,"duration":"turn","optional":true}]}],"onAttack":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-5,"duration":"turn","optional":true}]}]},
  "ST14-008": {"act":{"label":"レスト:黒麦わら+2＋コスト8以上で1ドロー1捨て","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true,"filter":{"color":"黒","traitIncludes":"麦わらの一味"}},{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]}},
  "ST14-009": {"static":[{"op":"condBuff","koImmune":true,"cond":{"and":[{"donX1":true},{"oppTurn":true},{"selfCharCount":{"filter":{"minCost":6},"min":1}}]}},{"op":"condBuff","cond":{"and":[{"donX1":true},{"oppTurn":true},{"selfCharCount":{"filter":{"minCost":6},"min":1}}]},"power":2000}]},
  "ST14-011": {"act":{"label":"レスト:黒麦わら1枚をコスト+2","cost":{"restSelf":true},"fx":[{"op":"addCostBuff","side":"self","count":1,"amount":2,"duration":"untilNextEnd","optional":true,"filter":{"color":"黒","traitIncludes":"麦わらの一味"}}]}},
  "ST14-012": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"selfCharCount":{"filter":{"minCost":10},"min":1}}}]},
  "ST14-014": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true}]}]}},
  "ST14-015": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]}},
  "ST14-016": {"main":{"fx":[{"op":"draw","n":1},{"op":"addCostBuff","side":"self","count":1,"amount":3,"duration":"untilNextEnd","optional":true}]}},
  "ST14-017": {"static":[{"op":"allyCost","amount":1,"filter":{"color":"黒","traitIncludes":"麦わらの一味"}}],"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"draw","n":1}]}]},
  "ST15-001": {"onAttack":[{"op":"cond","check":{"leaderNameIncludes":"エドワード・ニューゲート"},"then":[{"op":"setNoLifeToHand"}]}]},
  "ST15-002": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":1}],"act":{"label":"レスト:相手のパワー5000以下KO","cost":{"restSelf":true},"fx":[{"op":"ko","side":"opp","filter":{"maxEffPower":5000},"count":1,"optional":true}]}},
  "ST15-003": {"onKO":[{"op":"cond","check":{"and":[{"oppTurn":true},"koByEffect"]},"then":[{"op":"leaderBuff","amount":2000,"duration":"turn"}]}]},
  "ST15-004": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true},{"op":"lifeToHand","n":1}]}]},
  "ST15-005": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"leaderTraitIncludes":"白ひげ海賊団"}},{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"selfPowerMinus","amount":2000}]},
  "ST16-001": {"act":{"label":"FILM1捨て:リーダーかキャラにレストのドン1","cost":{},"fx":[{"op":"discardCost","count":1,"filter":{"traitIncludes":"FILM"},"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "ST16-002": {"onOppAttack":[{"op":"discardLoopBuff","amount":1000,"duration":"battle","targetChoose":"ownL","filter":{"traitIncludes":"音楽"}}]},
  "ST16-003": {"static":[{"op":"condBuff","cond":{"and":[{"leaderTraitIncludes":"FILM"},{"restedCardsAtLeast":6}]},"power":2000}]},
  "ST16-004": {"onPlay":[{"op":"ko","side":"opp","filter":{"restedOnly":true},"count":1,"optional":true}]},
  "ST16-005": {"static":[{"op":"condBuff","cond":{"selfChar":{"nameIncludes":"ウタ","restedOnly":true}},"power":1000}]},
  "ST17-001": {"onPlay":[{"op":"revealTop","filter":{"traitIncludes":"王下七武海"},"then":[{"op":"draw","n":2},{"op":"handToBottom","n":1,"pos":"top"}]}]},
  "ST17-002": {"onPlay":[{"op":"bounceOwnCharCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"王下七武海"},"then":[{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}]}]}]},
  "ST17-003": {"onPlay":[{"op":"scry","look":3,"pos":"top"}]},
  "ST17-005": {"act":{"label":"手札1枚をデッキ上:リーダーかキャラにレストのドン2","cost":{},"fx":[{"op":"handToBottomCost","n":1,"pos":"top","then":[{"op":"donAttach","target":"chooseOwn","n":2}]}]}},
  "ST18-001": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  "ST18-002": {"onPlay":[{"op":"cond","check":{"donAtLeast":8},"then":[{"op":"discardOwn","n":1},{"op":"draw","n":2}]}]},
  "ST18-003": {"onAttack":[{"op":"cond","check":{"donAtLeast":8},"once":"turn","then":[{"op":"draw","n":1}]}]},
  "ST18-004": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"color":"紫","traitIncludes":"麦わらの一味"},"optional":true}]},
  "ST18-005": {"onPlay":[{"op":"donMinus","n":1},{"op":"playCharFromHand","filter":{"color":"紫","traitIncludes":"麦わらの一味","maxCost":5},"count":1,"optional":true}]},
  "ST19-001": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"color":"黒","traitIncludes":"海軍"},"then":[{"op":"setAttackBan","filter":{"maxCost":4},"count":2,"duration":"untilNextEnd","optional":true}]}]},
  "ST19-002": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"filter":{"color":"黒","traitIncludes":"海軍"},"then":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"draw","n":3}]}]}]},
  "ST19-003": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"スモーカー"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-4,"duration":"turn","optional":true}]}],"act":{"label":"登場ターン:相手コスト0をトラッシュ","cost":{},"fx":[{"op":"cond","check":{"selfSummonedThisTurn":true},"then":[{"op":"trashChar","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]}},
  "ST19-004": {"static":[{"op":"staticCost","amount":4,"cond":{"and":[{"donX1":true},{"oppTurn":true}]}}],"act":{"label":"トラッシュ1枚デッキ下:リーダーかキャラにレストのドン1","cost":{},"fx":[{"op":"trashToDeckCost","n":1,"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "ST19-005": {"act":{"label":"トラッシュ1枚デッキ下:相手コスト-1","cost":{},"fx":[{"op":"trashToDeckCost","n":1,"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]}]}},
  "ST20-001": {"act":{"label":"ライフ表向き:リーダーかキャラにレストのドン1","cost":{},"fx":[{"op":"flipLifeCost","then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "ST20-002": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"lifeTrash"}]},
  "ST20-004": {"onPlay":[{"op":"lifeCost","then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"maxCost":3,"traitIncludes":"ビッグ・マム海賊団"}}]}]},
  "ST20-005": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"chooseOption","chooser":"opp","options":[{"label":"相手は手札2枚を捨てる","fx":[{"op":"oppDiscard","n":2}]},{"label":"相手のライフ上1枚をトラッシュ","fx":[{"op":"lifeTrash","side":"opp"}]}]}]}]}
});})();
/* ===== ST21-ST30（スターターデッキ）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  "ST21-001": {"act":{"label":"キャラ1枚にレストのドン2付与","cost":{},"fx":[{"op":"cond","check":{"donX1":true},"then":[{"op":"donAttach","target":"chooseOwn","filter":{"type":"CHAR"},"n":2}]}]}},
  "ST21-002": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"oppTurn":true}]},"power":2000}]},
  "ST21-003": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","filter":{"minEffPower":6000,"traitIncludes":"麦わらの一味"},"kw":"unblockable","duration":"turn"}]},
  "ST21-009": {"act":{"label":"麦わら1枚にレストのドン2付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","filter":{"traitIncludes":"麦わらの一味"},"n":2}]}},
  "ST21-010": {"onAttack":[{"op":"cond","check":{"donX2":true},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":4000},"count":1,"optional":true}]}]},
  "ST21-011": {"static":[{"op":"allyPower","cond":{"and":[{"donX2":true},{"oppTurn":true}]},"filter":{"maxPower":4000,"traitIncludes":"麦わらの一味"},"power":1000}]},
  "ST21-012": {"onAttack":[{"op":"donAttach","target":"chooseOwn","n":2}]},
  "ST21-014": {"onAttack":[{"op":"donAttach","target":"chooseOwn","n":1}]},
  "ST21-015": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donX2":true}}],"onKO":[{"op":"playCharFromHand","filter":{"color":"赤","maxPower":6000,"nameExcludes":"ロロノア・ゾロ"},"count":1,"optional":true}]},
  "ST21-016": {"main":{"fx":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true},{"op":"denyBlocker","filter":{"maxEffPower":4000},"count":1,"optional":true}]}},
  "ST21-017": {"main":{"fx":[{"op":"powerMod","side":"opp","amount":-5000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":6000},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}]}},
  "ST22-001": {"act":{"label":"白ひげ1枚公開:1ドロー","cost":{},"fx":[{"op":"revealCost","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"revealedToDeckTop"}]}]}},
  "ST22-003": {"onPlay":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":2}]}]},
  "ST22-005": {"static":[{"op":"leaveProtect","targetSelf":true,"pay":"discardFromHand","n":2}],"act":{"label":"ドン3レスト+他キャラ手札:このキャラをアクティブ","cost":{},"fx":[{"op":"restDonCost","n":3,"then":[{"op":"bounceOwnCharCost","excludeSelf":true,"then":[{"op":"activateSelf"}]}]}]}},
  "ST22-006": {"onPlay":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
  "ST22-007": {"act":{"label":"デッキ上公開:白ひげなら1枚にレストのドン1","cost":{},"fx":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "ST22-011": {"onPlay":[{"op":"cond","check":{"and":[{"selfTurn":true},{"leaderTraitIncludes":"白ひげ海賊団"}]},"then":[{"op":"revealCost","count":2,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"leaderBuff","amount":2000,"duration":"turn"}]}]}]},
  "ST22-012": {"static":[{"op":"leaveProtect","targetSelf":true,"onlyKO":true,"once":"turn","pay":"discardFromHand"}],"onAttack":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"untilNextEnd"}]}]},
  "ST22-016": {"counter":{"cost":0,"fx":[{"op":"revealTop","filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  "ST22-017": {"main":{"fx":[{"op":"revealCost","count":2,"filter":{"traitIncludes":"白ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"deckBottom","side":"any","filter":{"maxCost":5},"count":1,"optional":true}]}]}},
  "ST23-002": {"static":[{"op":"handCostCond","amount":-3,"cond":{"oppChar":{"minPower":8000}}}],"onPlay":[{"op":"cond","check":{"or":[{"leaderTraitIncludes":"赤髪海賊団"},{"leaderNameIncludes":"ウタ"}]},"then":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]},
  "ST23-003": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderTraitIncludes":"赤髪海賊団"},"then":[{"op":"ko","side":"opp","filter":{"maxPower":4000},"count":1,"optional":true}]}]}]},
  "ST23-004": {"act":{"label":"ドン1+このキャラをレスト:相手1枚-1000","cost":{"don":1,"restSelf":true},"fx":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]}},
  "ST24-001": {"onPlay":[{"op":"cond","check":{"restedCardsAtLeast":6},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  "ST24-002": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星"},"optional":true}],"onOppAttack":[{"op":"trashSelfCost","then":[{"op":"donActivate","n":1}]}]},
  "ST24-004": {"onPlay":[{"op":"lock","count":1,"optional":true},{"op":"cond","check":{"oppChar":{"restedOnly":true,"min":2}},"then":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]},
  "ST24-005": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"delayedDonActivate","n":1}]}]},
  "ST25-001": {"static":[{"op":"staticCost","amount":1,"cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}}}],"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"バギー"},"then":[{"op":"draw","n":3},{"op":"discardOwn","n":2}]}]},
  "ST25-002": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}}},{"op":"staticCost","amount":1,"cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}}},{"op":"condBuff","cond":{"oppTurn":true},"power":5000}]},
  "ST25-003": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"playCharFromHand","filter":{"maxCost":4,"traitIncludes":"クロスギルド"},"count":1,"optional":true}],"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"クロスギルド"},"once":"turn","pay":"discardFromHand"}]},
  "ST25-004": {"act":{"label":"手札1捨て+このキャラトラッシュ:クロスギルド登場","cost":{},"fx":[{"op":"discardCost","count":1,"then":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderNameIncludes":"バギー"},"then":[{"op":"playCharFromHand","filter":{"maxCost":6,"traitIncludes":"クロスギルド"},"count":1,"optional":true}]}]}]}]}},
  "ST25-005": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}}},{"op":"staticCost","amount":1,"cond":{"selfCharCount":{"filter":{"minBaseCost":5},"min":2}}}],"onKO":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"バギー"},{"selfHandAtMost":3}]},"then":[{"op":"draw","n":1}]}]},
  "ST26-001": {"costMod":{"cond":{"selfChar":{"minPower":7000,"or":[{"nameIncludes":"サン五郎"},{"nameIncludes":"サンジ"}]}},"amount":-5},"onPlay":[{"op":"bounce","side":"own","all":true,"filter":{"or":[{"nameIncludes":"サン五郎"},{"nameIncludes":"サンジ"}]}}]},
  "ST26-002": {"onPlay":[{"op":"donMinus","n":2},{"op":"chooseOption","options":[{"label":"コスト1以下のキャラをレスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},{"label":"相手のドン1枚をレスト","fx":[{"op":"restOppDon","n":1}]}]}]},
  "ST26-003": {"onPlay":[{"op":"donMinus","n":2},{"op":"donFromDeck","n":1,"mode":"active"}]},
  "ST26-004": {"onPlay":[{"op":"donMinus","n":2},{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]},
  "ST26-005": {"onPlay":[{"op":"donMinus","n":2},{"op":"cond","check":{"and":[{"leaderTraitIncludes":"麦わらの一味"},{"leaderMulticolor":true},{"oppDonAtLeast":5}]},"then":[{"op":"setPower","target":"leader","value":7000,"duration":"untilNextEnd"}]}],"onAttack":[{"op":"donMinus","n":2},{"op":"cond","check":{"and":[{"leaderTraitIncludes":"麦わらの一味"},{"leaderMulticolor":true},{"oppDonAtLeast":5}]},"then":[{"op":"setPower","target":"leader","value":7000,"duration":"untilNextEnd"}]}]},
  "ST27-001": {"act":{"label":"ハチノス1枚レスト:黒ひげなら+4000","cost":{},"fx":[{"op":"restOwnAsCost","filter":{"name":"ハチノス"},"then":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"powerMod","side":"self","target":"self","amount":4000,"duration":"turn"}]}]}]},"onKO":[{"op":"draw","n":1}]},
  "ST27-002": {"act":{"label":"このキャラトラッシュ:黒ひげなら相手1枚コスト-1","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"cond","check":{"leaderTraitIncludes":"黒ひげ海賊団"},"then":[{"op":"addCostBuff","side":"opp","count":1,"amount":-1,"duration":"turn","optional":true}]}]}]},"onKO":[{"op":"draw","n":1}]},
  "ST27-003": {"onKO":[{"op":"reviveFromTrash","filter":{"maxCost":5,"traitIncludes":"黒ひげ海賊団"},"rested":true,"optional":true}]},
  "ST27-004": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderTraitIncludes":"黒ひげ海賊団"}}],"onPlay":[{"op":"discardOwn","n":1}]},
  "ST27-005": {"act":{"label":"このキャラをレスト:コスト3以下KO","cost":{"restSelf":true},"fx":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},"onKO":[{"op":"trashToHand","filter":{"color":"黒"},"count":1,"optional":true}]},
  "ST28-001": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ワノ国"},{"oppLifeAtLeast":3}]},"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":5},"count":1,"optional":true}]}]},
  "ST28-002": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"donX2":true}}],"onPlay":[{"op":"giveKeyword","target":"chooseOwnL","filter":{"type":"LEADER","traitIncludes":"ワノ国"},"kw":"banish","duration":"turn"}]},
  "ST28-004": {"static":[{"op":"allyPower","cond":{"and":[{"selfTurn":true},{"lifeAtMost":2}]},"filter":{"type":"LEADER"},"power":1000}],"act":{"label":"付与ドン2枚をコストエリアにレスト:速攻+1000","cost":{},"fx":[{"op":"attachedDonToCost","n":2,"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"},{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]}},
  "ST28-005": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"selfTurn":true}]},"power":3000}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"minBaseCost":2,"traitIncludes":"ワノ国"},"optional":true}]},
  "ST29-002": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}],"onAttack":[{"op":"restChar","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}]},
  "ST29-003": {"static":[{"op":"condBuff","cond":{"selfLifeLEOpp":true},"power":1000}]},
  "ST29-004": {"onPlay":[{"op":"search","look":4,"count":1,"filter":{"traitIncludes":"麦わらの一味"},"optional":true}]},
  "ST29-007": {"onKO":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"handToLife","optional":true}]}]},
  "ST29-008": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"エッグヘッド"},"onlyKO":true,"pay":"flipLifeUp"}]},
  "ST29-012": {"act":{"label":"ルフィ1枚にレストのドン1付与","cost":{},"fx":[{"op":"donAttach","target":"chooseOwn","filter":{"nameIncludes":"モンキー・Ｄ・ルフィ"},"n":1}]}},
  "ST29-014": {"act":{"label":"トリガー1枚捨て:1ドロー+ドン1付与","cost":{},"fx":[{"op":"discardCost","count":1,"filter":{"hasTrigger":true},"then":[{"op":"draw","n":1},{"op":"donAttach","target":"chooseOwn","n":1}]}]}},
  "ST29-015": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}]}},
  "ST29-016": {"main":{"fx":[{"op":"giveKeyword","target":"chooseOwn","filter":{"nameIncludes":"モンキー・Ｄ・ルフィ"},"kw":"unblockable","duration":"turn"}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  "ST29-017": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}},
  "ST30-001": {"static":[{"op":"condBuff","cond":{"selfCharCount":{"filter":{"minPower":7000},"min":1}},"power":-2000},{"op":"allyPower","cond":{"oppTurn":true},"filter":{"or":[{"nameIncludes":"ポートガス・Ｄ・エース"},{"nameIncludes":"モンキー・Ｄ・ルフィ"}]},"power":3000}]},
  "ST30-002": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"basePower":6000},"optional":true}]},
  "ST30-003": {"static":[{"op":"allyPower","cond":{"selfTurn":true},"filter":{"basePower":6000},"power":1000}]},
  "ST30-004": {"onPlay":[{"op":"revealCost","count":2,"filter":{"basePower":6000},"then":[{"op":"draw","n":3},{"op":"discardOwn","n":2}]}]},
  "ST30-006": {"onPlay":[{"op":"discardCost","count":1,"filter":{"basePower":6000},"then":[{"op":"draw","n":2}]}]},
  "ST30-007": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}],"onAttack":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}]},
  "ST30-008": {"onKO":[{"op":"discardCost","count":1,"filter":{"basePower":6000},"then":[{"op":"reviveSelfRested"}]}]},
  "ST30-009": {"static":[{"op":"leaveProtect","targetFilter":{"basePower":6000},"pay":"koSelf","drawAfter":1}]},
  "ST30-010": {"onPlay":[{"op":"lockRefresh","count":1,"optional":true}]},
  "ST30-011": {"static":[{"op":"leaveProtect","targetFilter":{"basePower":6000},"pay":"restSelf"}]},
  "ST30-012": {"onPlay":[{"op":"restDonCost","n":1,"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}],"onAttack":[{"op":"restChar","side":"opp","filter":{"hasKw":"blocker"},"count":1,"optional":true}]},
  "ST30-014": {"act":{"label":"このキャラをレスト:元々パワー6000のキャラにレストのドン2ずつ","cost":{"restSelf":true},"fx":[{"op":"donAttach","target":"chooseOwn","filter":{"basePower":6000},"n":2},{"op":"donAttach","target":"chooseOwn","excludePrev":true,"filter":{"basePower":6000},"n":2}]}},
  "ST30-015": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfCharCount":{"filter":{"basePower":6000},"min":2}},"then":[{"op":"powerMod","side":"self","leader":true,"amount":4000,"battle":true,"count":1,"optional":true}]}]}},
  "ST30-016": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"cond","check":{"and":[{"selfChar":{"basePower":6000,"nameIncludes":"ポートガス・Ｄ・エース"}},{"selfChar":{"basePower":6000,"nameIncludes":"モンキー・Ｄ・ルフィ"}}]},"then":[{"op":"draw","n":1}]}]}},
  "ST30-017": {"main":{"fx":[{"op":"search","look":5,"count":1,"filter":{"basePower":6000},"optional":true}]}}
});})();
/* ===== P（プロモ）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  "P-001": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donX2":true}}]},
  "P-002": {"main":{"fx":[{"op":"selfHandToDeckDraw"}]}},
  "P-003": {"static":[{"op":"staticKeyword","kw":"doubleAttack","cond":{"donX2":true}}]},
  "P-004": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"donX1":true}}]},
  "P-005": {"act":{"label":"ドン-2:このターン【バニッシュ】","cost":{},"fx":[{"op":"donMinus","n":2},{"op":"giveKeyword","target":"self","kw":"banish","duration":"turn"}]}},
  "P-006": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"selfTurn":true}]},"power":2000}]},
  "P-007": {"static":[{"op":"battleImmuneVsAttr","attr":"打","has":true,"cond":{"donX1":true}}]},
  "P-008": {"act":{"label":"このキャラをレスト:相手コスト2以下レスト","cost":{"restSelf":true},"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}},
  "P-009": {"onPlay":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppLifeToHand","n":1}]}]},
  "P-010": {"onTurnEnd":[{"op":"donFromDeck","n":1,"mode":"active"}]},
  "P-011": {"act":{"label":"ドン①:元々効果なしキャラ1枚+2000","cost":{"don":1},"fx":[{"op":"powerMod","side":"self","filter":{"noEffect":true},"amount":2000,"duration":"turn","count":1,"optional":true}]}},
  "P-020": {"onPlay":[{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true}]},
  "P-024": {"main":{"fx":[{"op":"leaderBuffPerChar","amount":1000,"duration":"turn"}]}},
  "P-025": {"static":[{"op":"battleImmuneVsAttr","attr":"特","has":false,"vsCharOnly":true,"cond":{"donX1":true}}]},
  "P-026": {"onAttack":[{"op":"addCostBuff","side":"opp","count":1,"amount":-3,"duration":"turn","optional":true}]},
  "P-027": {"static":[{"op":"allyPower","cond":{"oppTurn":true},"filter":{"maxPower":3000},"power":1000}]},
  "P-029": {"onTurnEnd":[{"op":"restSelfCost","then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"FILM","nameExcludes":"バルトロメオ"}}]}]},
  "P-030": {"onKO":[{"op":"deckBottom","side":"any","filter":{"maxCost":3},"count":1,"optional":true}]},
  "P-031": {"onPlay":[{"op":"donFromDeck","n":1,"mode":"rested"}]},
  "P-032": {"static":[{"op":"oppCostMod","amount":-2,"cond":{"and":[{"donX1":true},{"selfTurn":true}]}}]},
  "P-033": {"act":{"label":"このキャラをデッキ下:1ドロー","cost":{},"fx":[{"op":"selfToBottomCost","then":[{"op":"draw","n":1}]}]}},
  "P-034": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfTurn":true},{"lifeAtMost":2}]},"power":2000}]},
  "P-035": {"onAttack":[{"op":"cond","check":{"donX1":true},"then":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"ko","side":"opp","filter":{"cost":0},"count":1,"optional":true}]}]}]},
  "P-036": {"onAttack":[{"op":"lifeToHand","n":1,"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"},{"op":"powerMod","side":"self","leader":true,"amount":1000,"duration":"turn","count":1,"optional":true,"filter":{"type":"LEADER"}}]}]},
  "P-037": {"onAttack":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]},
  "P-038": {"onPlay":[{"op":"restOwnAsCost","filter":{"type":"LEADER"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]}]},
  "P-039": {"static":[{"op":"condBuff","cond":{"and":[{"donX2":true},{"lifeAtMost":0}]},"power":2000}]},
  "P-040": {"static":[{"op":"condBuff","cond":{"oppDonAtLeast":10},"koImmune":true}]},
  "P-043": {"onPlay":[{"op":"bounce","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]},
  "P-044": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfHandAtMost":4}]},"power":2000}]},
  "P-046": {"onPlay":[{"op":"handAllToBottomDraw"}]},
  "P-048": {"onAttack":[{"op":"cond","check":{"and":[{"donX1":true},{"lifeAtLeast":4}]},"then":[{"op":"oppHandToBottom","n":1}]}]},
  "P-050": {"static":[{"op":"condBuff","cond":{"and":[{"donX1":true},{"selfTurn":true},{"selfHandAtMost":3}]},"power":4000}]},
  "P-051": {"onAttack":[{"op":"discardLoopBuff","amount":1000,"duration":"battle"}]},
  "P-052": {"static":[{"op":"battleImmuneVsAttr","attr":"斬","has":true,"cond":{"donX1":true}}]},
  "P-053": {"onPlay":[{"op":"cond","check":{"selfHandAtMost":3},"then":[{"op":"bounce","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]},
  "P-054": {"static":[{"op":"battleImmuneVsAttr","attr":"打","has":true,"cond":{"donX1":true}}]},
  "P-055": {"onPlay":[{"op":"discardCost","count":2,"optional":true,"then":[{"op":"deckBottom","side":"opp","count":1}]}]},
  "P-056": {"onPlay":[{"op":"restDonCost","n":2,"then":[{"op":"bounce","side":"any","filter":{"maxCost":5},"count":1,"optional":true}]}]},
  "P-057": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"lockRefresh","count":2,"filter":{"maxCost":4},"optional":true}]}]}},
  "P-058": {"main":{"fx":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"scheduleTurnEnd","fx":[{"op":"activateOwnChar","all":true,"filter":{"traitIncludes":"FILM"}}]}]}]}},
  "P-059": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"bounceOwnAnyBuff","amount":2000,"duration":"battle"}]}]}},
  "P-060": {"main":{"fx":[{"op":"restOwnAsCost","filter":{"name":"ウタ"},"then":[{"op":"restOppDon","n":2}]}]}},
  "P-063": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}]},
  "P-065": {"onAttack":[{"op":"cond","check":{"oppChar":{"cost":0}},"then":[{"op":"powerMod","side":"self","target":"self","amount":2000,"duration":"untilNextStart"}]}]},
  "P-066": {"static":[{"op":"allyPower","cond":{"and":[{"selfTurn":true},{"selfHandAtMost":5}]},"filter":{"traitIncludes":"九蛇海賊団"},"power":1000}]},
  "P-067": {"static":[{"op":"taunt"}]},
  "P-068": {"act":{"label":"このキャラトラッシュ:デッキ上5枚並べ替え","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"scry","look":5}]}]}},
  "P-071": {"onKO":[{"op":"selfToHand","optional":true}]},
  "P-072": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}],"onKO":[{"op":"restChar","side":"opp","filter":{"maxCost":4},"count":1,"optional":true}]},
  "P-073": {"act":{"label":"ライフ1枚手札:このキャラ+1000","cost":{},"fx":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"powerMod","side":"self","target":"self","amount":1000,"duration":"turn"}]}]}},
  "P-074": {"act":{"label":"このキャラ手札:デッキ上5枚並べ替え","cost":{},"fx":[{"op":"bounceSelfCost","then":[{"op":"scry","look":5}]}]}},
  "P-075": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":1}],"onAttack":[{"op":"cond","check":{"selfCharCount":{"filter":{"minBaseCost":8},"min":1}},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  "P-077": {"onDonReturned":[{"op":"cond","check":{"donReturnedAtLeast":2},"then":[{"op":"donFromDeck","n":1},{"op":"activateStage","filter":{"color":"紫"}}]}]},
  "P-078": {"static":[{"op":"condBuff","cond":{"selfCharCount":{"filter":{"traitIncludes":"ODYSSEY","restedOnly":true},"min":2}},"power":1000}]},
  "P-079": {"onTurnEnd":[{"op":"cond","check":{"selfCharCount":{"filter":{"traitIncludes":"ODYSSEY","restedOnly":true},"min":2}},"then":[{"op":"activateOwnChar","target":"self"}]}]},
  "P-081": {"act":{"label":"このキャラ手札:青クロスギルド3枚以上でコスト5登場","cost":{},"fx":[{"op":"bounceSelfCost","then":[{"op":"cond","check":{"selfCharCount":{"filter":{"color":"青","traitIncludes":"クロスギルド"},"min":3}},"then":[{"op":"playCharFromHand","filter":{"cost":5,"traitIncludes":"クロスギルド"},"count":1,"optional":true}]}]}]}},
  "P-082": {"onPlay":[{"op":"cond","check":{"and":[{"selfTurn":true},{"or":[{"leaderTraitIncludes":"クロスギルド"},{"leaderTraitIncludes":"B・W"}]}]},"then":[{"op":"deckBottom","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}]},
  "P-083": {"onAttack":[{"op":"discardCost","count":1,"filter":{"type":"CHAR"},"optional":true,"then":[{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true},{"op":"draw","n":1}]}]},
  "P-084": {"static":[{"op":"cantAttack"},{"op":"globalAttackBan","cond":{"leaderNameIncludes":"バギー"},"filter":{"or":[{"cost":3},{"cost":4}]}}],"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":6,"traitIncludes":"クロスギルド"},"count":1,"optional":true}]},
  "P-085": {"onPlay":[{"op":"cond","check":{"and":[{"leaderTraitIncludes":"超新星"},{"selfLifeLEOpp":true}]},"then":[{"op":"charToLife","side":"opp","filter":{"maxCost":4},"faceUp":true,"optional":true}]}]},
  "P-090": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"donMinus","n":1},{"op":"playCharFromHand","filter":{"traitIncludes":"ビッグ・マム海賊団","maxCostFrom":"oppDon","nameExcludes":"シャーロット・スムージー"},"count":1,"optional":true}]}]},
  "P-091": {"onPlay":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"traitIncludes":"海王類"},{"traitIncludes":"魚人島"}]},"count":1,"optional":true}],"act":{"label":"このキャラをレスト:海王類1枚が登場ターンにキャラへアタック可","cost":{"restSelf":true},"fx":[{"op":"activateOwnChar","count":1,"grantKw":"rushChar","filter":{"traitIncludes":"海王類"}}]}},
  "P-092": {"static":[{"op":"condBuff","cond":{"oppTurn":true},"power":-3000}],"onAttack":[{"op":"cond","check":{"leaderTraitIncludes":"海軍"},"then":[{"op":"setPower","target":"leader","value":7000,"duration":"untilNextEnd"}]}]},
  "P-095": {"onOppAttack":[{"op":"discardCost","count":1,"filter":{"type":"EVENT"},"optional":true,"once":"turn","then":[{"op":"powerMod","side":"self","leader":true,"amount":2000,"battle":true,"count":1,"optional":true}]}]},
  "P-097": {"onPlay":[{"op":"denyBlocker","all":true}],"onAttack":[{"op":"denyBlocker","all":true}]},
  "P-098": {"onPlay":[{"op":"cond","check":{"selfCharCount":{"filter":{"minBaseCost":5},"min":5}},"else":[{"op":"selfToDeckBottom"}]}]},
  "P-099": {"onAttack":[{"op":"donMinus","n":10},{"op":"activateSelf"}]},
  "P-100": {"onAttack":[{"op":"negateEffect","all":true}]},
  "P-101": {"onPlay":[{"op":"donAttach","target":"leader","n":1}]},
  "P-102": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"麦わらの一味"},"then":[{"op":"donActivate","n":2}]}]},
  "P-103": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2,"posChoose":true},{"op":"donAttach","target":"leader","n":1}]},
  "P-104": {"static":[{"op":"leaveProtect","targetSelf":true,"cond":{"or":[{"donAtLeast":10},{"oppDonAtLeast":10}]},"pay":"free"}]},
  "P-105": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"leaderTraitIncludes":"革命軍"}},{"op":"staticCost","amount":4,"cond":{"leaderTraitIncludes":"革命軍"}}],"onPlay":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"donAttach","target":"chooseOwn","n":1}]}]},
  "P-106": {"onTurnEnd":[{"op":"flipLifeCost","then":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"エッグヘッド"}}]}]},
  "P-107": {"onPlay":[{"op":"cond","check":{"or":[{"donAtLeast":10},{"oppDonAtLeast":10}]},"then":[{"op":"leaderBuff","amount":2000,"duration":"untilNextEnd"}]}]},
  "P-108": {"onKO":[{"op":"donActivate","n":2}]},
  "P-109": {"onPlay":[{"op":"scry","look":3},{"op":"donAttach","target":"chooseOwn","n":1}]},
  "P-111": {"static":[{"op":"leaveProtect","targetFilter":{"traitIncludes":"麦わらの一味"},"once":"turn","pay":"restActiveDon","n":1}]},
  "P-112": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"ナミ"},"then":[{"op":"donAttach","target":"leader","n":1},{"op":"playCharFromHand","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  "P-113": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"and":[{"donX2":true},{"oppTurn":true}]}},{"op":"condBuff","cond":{"and":[{"donX2":true},{"oppTurn":true}]},"power":2000}]},
  "P-114": {"onTurnEnd":[{"op":"cond","check":{"activeDonAtLeast":1},"then":[{"op":"activateOwnChar","target":"self"}]}]},
  "P-115": {"onPlay":[{"op":"donAttach","target":"chooseOwn","n":1}]},
  "P-116": {"onKO":[{"op":"cond","check":{"trashAtLeast":7},"then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  "P-118": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"エッグヘッド"},"then":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"traitIncludes":"エッグヘッド"},{"hasTrigger":true}]},"count":1,"optional":true}]}]},
  "P-120": {"static":[{"op":"handCostCond","amount":-2,"cond":{"oppLifeLeftThisTurn":true}}]},
  "P-121": {"onPlay":[{"op":"millSelf","n":3}],"onKO":[{"op":"oppDiscard","n":2}]},
  "P-135": {"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]},
  // P-150 クザン: 【自分のターン中】【登場時】トラッシュからコスト1の【トリガー】持ちキャラ登場（トリガー登場等の相手ターン登場では発動しない）
  "P-150": {"onPlay":[{"op":"cond","check":{"selfTurn":true},"then":[{"op":"reviveFromTrash","maxCost":1,"filter":{"minCost":1},"needsTrigger":true}]}],"trigger":[{"op":"draw","n":1},{"op":"setAttackBan","side":"opp","maxCost":6,"count":1,"optional":true}]},
  // P-151 スモーカー: 【登場時】手札1捨てできる→リーダーが《海軍》ならドン1レスト追加＋デッキ上5枚から海軍1枚サーチ
  "P-151": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"donFromDeck","n":1},{"op":"search","look":5,"count":1,"filter":{"trait":"海軍"},"optional":true}]}]}]}
});})();
/* ===== PRB（プレミアムブースター）新規カード ===== */
(function () { Object.assign(window.CARD_FX, {
  "PRB01-001": {"act":{"label":"コスト8以下の登場時効果なしキャラに速攻","cost":{},"fx":[{"op":"giveKeyword","target":"chooseOwn","filter":{"maxCost":8,"noOnPlay":true},"kw":"rush","duration":"turn"}]}},
  "PRB02-001": {"static":[{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"leaderTraitIncludes":"海軍"}]},"power":1000}],"onAttack":[{"op":"ko","side":"opp","filter":{"maxPower":3000},"count":1,"optional":true},{"op":"cond","check":{"selfHandAtMost":6},"then":[{"op":"draw","n":1}]}]},
  "PRB02-002": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"selfPowerMinus","amount":2000}],"onAttack":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":1,"optional":true}]},
  "PRB02-003": {"onPlay":[{"op":"discardCost","count":1,"filter":{"minPower":6000},"optional":true,"then":[{"op":"draw","n":2}]}]},
  "PRB02-004": {"onOppAttack":[{"op":"donActivate","n":1,"once":"turn"}]},
  "PRB02-005": {"onPlay":[{"op":"cond","check":{"and":[{"leaderMulticolor":true},{"oppDonAtMost":7}]},"then":[{"op":"restOppDon","n":1},{"op":"donRefreshLock","n":1}]}]},
  "PRB02-006": {"static":[{"op":"restRedirect"}]},
  "PRB02-007": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"王下七武海","nameExcludes":"ジンベエ"},"optional":true}],"onAttack":[{"op":"deckBottom","side":"any","filter":{"maxCost":1},"count":1,"optional":true}]},
  // PRB02-009: 「このキャラが【相手の効果で】レストになった時」＝ターン制限なし・原因限定（他の onSelfRested 勢＝【自分のターン中】とは条件が違う）
  "PRB02-009": {"onSelfRested":{"when":"any","cause":"oppEffect","fx":[{"op":"trashSelfCost","then":[{"op":"draw","n":2}]}]}},
  "PRB02-010": {"onPlay":[{"op":"donMinus","n":2},{"op":"cond","check":{"and":[{"leaderTraitIncludes":"ビッグ・マム海賊団"},{"oppDonAtLeast":6}]},"then":[{"op":"draw","n":2},{"op":"playCharFromHand","filter":{"minPower":6000,"maxPower":8000,"traitIncludes":"ビッグ・マム海賊団"},"count":1,"optional":true}]}]},
  "PRB02-011": {"onPlay":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"donFromDeck","n":1,"mode":"rested"}]}]},
  "PRB02-013": {"onPlay":[{"op":"cond","check":{"leaderTraitIncludes":"スリラーバーク海賊団"},"then":[{"op":"reviveFromTrash","filter":{"maxCost":4},"rested":true,"optional":true},{"op":"donAttach","target":"chooseOwn","n":1}]}]},
  "PRB02-014": {"static":[{"op":"handCostCond","amount":-3,"cond":{"trashAtLeast":15}}]},
  "PRB02-016": {"act":{"label":"このキャラをレスト+ライフ1枚手札:リーダーかキャラ+3000","cost":{"restSelf":true},"fx":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"duration":"turn","count":1,"optional":true}]}]}},
  "PRB02-017": {"onPlay":[{"op":"discardCost","count":1,"filter":{"hasTrigger":true},"optional":true,"then":[{"op":"setAttackBan","side":"opp","includeLeader":true,"leaderRestedOnly":true,"filter":{"nameExcludes":"モンキー・Ｄ・ルフィ"},"count":1,"duration":"untilNextEnd","optional":true}]}]},
  "PRB02-018": {"onPlay":[{"op":"cond","check":{"faceUpLifeAtLeast":1},"then":[{"op":"playCharFromHand","filter":{"cost":2,"or":[{"nameIncludes":"サボ"},{"nameIncludes":"ポートガス・Ｄ・エース"},{"nameIncludes":"モンキー・Ｄ・ルフィ"}]},"count":1,"optional":true}]}]}
});})();
/* ===== 既存パックの取りこぼし補完 ===== */
(function () { Object.assign(window.CARD_FX, {
  // OP15-119 ルフィ: ドン6以上で速攻（常在）。相手イベ/ブロッカー時のライフ公開バフは近似省略。
  "OP15-119": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donAtLeast":6}}],"onOppEvent":{"fx":[{"op":"revealLifeCostBuff"}]},"onOppBlocker":[{"op":"revealLifeCostBuff"}]}
});})();




/* ===== ST-31〜36（新スタートデッキ6種・新規30枚。正本=tools/official-full.json） =====
   ・キーワードは cards.js の text から自動派生（00-data.js innateKw）。条件付き付与だけ staticKeyword(cond) を書く
     （cond付き staticKeyword は 00-data.js:524 が text由来の無条件フラグを打ち消す＝ST31-001速攻/ST31-003ブロッカー/ST32-004速攻：キャラ）。
     ST35-004「【ブロッカー】を得て」は無条件付与なので text由来のまま（fxに書かない）。
   ・特徴は trait（完全一致）で書く: traitIncludes だと ニセ麦わらの一味 / 元ビッグ・マム海賊団 / NEO海軍・元海軍 を誤って拾う。 */
(function () { Object.assign(window.CARD_FX, {
  // ST31-001 サンジ:【ドン‼×2】速攻 ／【登場時】1ドロー＋手札から「サンジ」以外のコスト5以下《麦わらの一味》1枚まで登場
  "ST31-001": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"donX2":true}}],"onPlay":[{"op":"draw","n":1},{"op":"playCharFromHand","filter":{"maxCost":5,"trait":"麦わらの一味","not":{"name":"サンジ"}},"count":1,"optional":true}]},
  // ST31-002 ジンベエ:【ブロッカー】(text由来) ／【登場時】1ドロー＋手札からコスト1の《麦わらの一味》カード1枚まで登場（STAGE=サニー号も対象なので playSpecificFromHand）
  "ST31-002": {"onPlay":[{"op":"draw","n":1},{"op":"playSpecificFromHand","choose":true,"optional":true,"filter":{"cost":1,"trait":"麦わらの一味","or":[{"type":"CHAR"},{"type":"STAGE"}]}}]},
  // ST31-003 ブルック:【相手のターン中】付与ドン合計3枚以上で【ブロッカー】＋パワー+3000
  "ST31-003": {"static":[{"op":"staticKeyword","kw":"blocker","cond":{"and":[{"oppTurn":true},{"selfAttachedDonAtLeast":3}]}},{"op":"condBuff","cond":{"and":[{"oppTurn":true},{"selfAttachedDonAtLeast":3}]},"power":3000}]},
  // ST31-004 ルフィ: 付与ドン合計3枚以上で【速攻】／【登場時】自分の場の《麦わらの一味》1枚につき相手キャラ1枚まで -1000（リーダー/ステージ/キャラ最大5＝7分岐で枚数分の対象を取る）
  "ST31-004": {"static":[{"op":"staticKeyword","kw":"rush","cond":{"selfAttachedDonAtLeast":3}}],"onPlay":[{"op":"cond","check":{"leaderTrait":"麦わらの一味"},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfStage":{"trait":"麦わらの一味"}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"麦わらの一味"},"min":1}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"麦わらの一味"},"min":2}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"麦わらの一味"},"min":3}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"麦わらの一味"},"min":4}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]},{"op":"cond","check":{"selfCharCount":{"filter":{"trait":"麦わらの一味"},"min":5}},"then":[{"op":"powerMod","side":"opp","amount":-1000,"count":1,"optional":true,"duration":"turn"}]}]},
  // ST31-005 サウザンド・サニー号(STAGE):【登場時】デッキ上5枚から《麦わらの一味》1枚まで手札 ／【起動メイン】自身をレスト：「ルフィ」1枚にレストのドン1枚まで付与
  "ST31-005": {"onPlay":[{"op":"search","look":5,"count":1,"filter":{"trait":"麦わらの一味"},"optional":true}],"act":{"label":"レストにする：「モンキー・Ｄ・ルフィ」にレストのドン‼1枚","cost":{"restSelf":true},"fx":[{"op":"donAttach","target":"chooseOwn","n":1,"filter":{"name":"モンキー・Ｄ・ルフィ"}}]}},
  // ST32-001 錦えもん:【登場時】属性(斬)リーダー か ドン‼1枚をレスト：2ドロー・手札1枚捨て（両方払えるときだけ選択させ、片方しか無ければ自動で払う）
  "ST32-001": {"onPlay":[{"op":"cond","check":{"and":[{"leaderAttr":"斬"},{"leaderActive":true},{"activeDonAtLeast":1}]},"then":[{"op":"chooseOption","options":[{"label":"ドン‼1枚をレスト：2ドロー・1捨て","fx":[{"op":"restDonCost","n":1,"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},{"label":"属性(斬)のリーダーをレスト：2ドロー・1捨て","fx":[{"op":"restOwnAsCost","count":1,"filter":{"type":"LEADER","attr":"斬"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},{"label":"使わない","fx":[]}]}],"else":[{"op":"cond","check":{"activeDonAtLeast":1},"then":[{"op":"restDonCost","n":1,"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}],"else":[{"op":"restOwnAsCost","count":1,"filter":{"type":"LEADER","attr":"斬"},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]}]}]},
  // ST32-002 光月おでん:【登場時】1ドロー＋相手の元々のコスト6以下キャラ1枚までを次の相手エンドまでレスト不可
  "ST32-002": {"onPlay":[{"op":"draw","n":1},{"op":"restImmune","side":"opp","filter":{"maxBaseCost":6},"count":1,"duration":"untilNextEnd","optional":true}]},
  // ST32-003 ミホーク:【自分のターン中】このキャラがレストになった時(=アタック)、1ドロー・1捨て ／【登場時】斬リーダーなら手札からコスト5以下の「ペローナ」か属性(斬)キャラ1枚まで登場
  "ST32-003": {"onSelfRested":[{"op":"draw","n":1},{"op":"discardOwn","n":1}],"onPlay":[{"op":"cond","check":{"leaderAttr":"斬"},"then":[{"op":"playCharFromHand","filter":{"maxCost":5,"or":[{"name":"ペローナ"},{"attr":"斬"}]},"count":1,"optional":true}]}]},
  // ST32-004 レイリー: 斬リーダーなら【速攻：キャラ】／【登場時】相手のコスト2以下キャラ2枚までをレスト
  "ST32-004": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"leaderAttr":"斬"}}],"onPlay":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":2,"optional":true}]},
  // ST32-005 ゾロ:【速攻：キャラ】(text由来) ／【登場時】斬リーダーなら相手のコスト2以下キャラ1枚までをレスト
  "ST32-005": {"onPlay":[{"op":"cond","check":{"leaderAttr":"斬"},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // ST33-001 コビー:【ブロッカー】(text由来) ／【登場時】手札1枚を捨てられる：1ドロー
  "ST33-001": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"draw","n":1}]}]},
  // ST33-002 サカズキ:【アタック時】手札1枚を捨てられる：相手の手札6枚以上なら相手が1枚捨てる ／【KO時】手札からコスト4以下《海軍》1枚まで登場
  "ST33-002": {"onAttack":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"oppHandAtLeast":6},"then":[{"op":"oppDiscard","n":1}]}]}],"onKO":[{"op":"playCharFromHand","filter":{"trait":"海軍","maxCost":4},"count":1,"optional":true}]},
  // ST33-003 スモーカー:【登場時】手札1枚を捨てられる：相手のコスト2以下キャラ2枚までを持ち主のデッキの下へ（deckBottomはcountを読まないのでop2個）
  "ST33-003": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"deckBottom","side":"opp","filter":{"maxCost":2},"optional":true},{"op":"deckBottom","side":"opp","filter":{"maxCost":2},"optional":true}]}]},
  // ST33-004 ボルサリーノ: 手札のこのカードは、効果で自分の手札が捨てられているターン中コスト-3（cond selfHandDiscardedThisTurn＝10-engine-core.js）／【ブロッカー】はtext由来
  "ST33-004": {"costMod":{"cond":{"selfHandDiscardedThisTurn":true},"amount":-3}},
  // ST33-005 ガープ:【登場時】《海軍》リーダーなら手札から「ガープ」以外のパワー8000以下・青・《海軍》キャラ1枚まで登場
  "ST33-005": {"onPlay":[{"op":"cond","check":{"leaderTrait":"海軍"},"then":[{"op":"playCharFromHand","filter":{"color":"青","trait":"海軍","maxPower":8000,"nameExcludes":"モンキー・Ｄ・ガープ"},"count":1,"optional":true}]}]},
  // ST34-001 カタクリ:【自分のターン中】【ターン1回】自分の場のドンがドンデッキに戻された時、BM団リーダーならドンデッキからドン2枚までレストで追加 ／【KO時】手札からパワー8000以下キャラ1枚まで登場
  "ST34-001": {"onDonReturned":[{"op":"cond","once":"turn","check":{"and":[{"selfTurn":true},{"leaderTrait":"ビッグ・マム海賊団"}]},"then":[{"op":"donFromDeck","n":2,"mode":"rested"}]}],"onKO":[{"op":"playCharFromHand","filter":{"maxPower":8000},"count":1,"optional":true}]},
  // ST34-002 クラッカー:【登場時】BM団リーダーならドンデッキからドン1枚までレストで追加→相手のコスト2以下キャラ1枚までKO
  "ST34-002": {"onPlay":[{"op":"cond","check":{"leaderTrait":"ビッグ・マム海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rested"},{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}]},
  // ST34-003 ブリュレ:【登場時】デッキ上3枚から《ビッグ・マム海賊団》1枚まで手札（残りはデッキ下）
  "ST34-003": {"onPlay":[{"op":"search","look":3,"count":1,"filter":{"trait":"ビッグ・マム海賊団"},"optional":true}]},
  // ST34-004 リンリン:【登場時】ドン‼-4・手札1枚を捨てられる：デッキ上1枚までライフの上へ→相手キャラ1枚までを このターン中 元々のパワー0
  "ST34-004": {"onPlay":[{"op":"donMinus","n":4},{"op":"discardCost","count":1,"optional":true,"then":[{"op":"lifeAddFromDeck","n":1},{"op":"setPower","side":"opp","value":0,"count":1,"optional":true,"duration":"turn"}]}]},
  // ST34-005 タマゴ男爵＆ペコムズ:【アタック時】ドン‼-1：相手の元々のパワー2000以下キャラ1枚までKO
  "ST34-005": {"onAttack":[{"op":"donMinus","n":1},{"op":"ko","side":"opp","filter":{"maxPower":2000},"count":1,"optional":true}]},
  // ST35-001 ハック:【ブロッカー】(text由来) ／【登場時】相手の元々のパワー2000以下キャラ1枚までKO
  "ST35-001": {"onPlay":[{"op":"ko","side":"opp","filter":{"maxPower":2000},"count":1,"optional":true}]},
  // ST35-002 リンドバーグ:【登場時】相手キャラ1枚までを このターン中 -3000
  "ST35-002": {"onPlay":[{"op":"powerMod","side":"opp","amount":-3000,"duration":"turn","count":1,"optional":true}]},
  // ST35-003 カラス:【アタック時】デッキ上2枚をトラッシュできる：相手の手札7枚以上なら相手が1枚捨てる
  "ST35-003": {"onAttack":[{"op":"deckTrashCost","n":2,"then":[{"op":"cond","check":{"oppHandAtLeast":7},"then":[{"op":"oppDiscard","n":1}]}]}]},
  // ST35-004 コアラ:【ブロッカー】を得てコスト+1（ブロッカーは無条件＝text由来のまま） ／【登場時】リーダーにレストのドン1枚まで付与→手札かトラッシュからパワー4000以下《革命軍》1枚まで登場
  "ST35-004": {"static":[{"op":"staticCost","amount":1}],"onPlay":[{"op":"donAttach","target":"leader","n":1},{"op":"playFromHandOrTrash","filter":{"trait":"革命軍","maxPower":4000},"optional":true}]},
  // ST35-005 くま: このキャラのコスト+3 ／【登場時】リーダーにレストのドン1枚まで付与→手札かトラッシュからパワー4000以下《革命軍》1枚まで登場
  "ST35-005": {"static":[{"op":"staticCost","amount":3}],"onPlay":[{"op":"donAttach","target":"leader","n":1},{"op":"playFromHandOrTrash","filter":{"trait":"革命軍","maxPower":4000},"optional":true}]},
  // ST36-001 キャベンディッシュ:【KO時】手札1枚を捨てられる：デッキ上1枚までライフの上へ
  "ST36-001": {"onKO":[{"op":"discardCost","count":1,"then":[{"op":"lifeAddFromDeck","n":1}]}]},
  // ST36-002 キラー:【自分のターン中】【登場時】《キッド海賊団》リーダーならデッキ上1枚までライフの上へ ／【トリガー】相手のライフ3枚以下ならこのカードを登場
  "ST36-002": {"onPlay":[{"op":"cond","check":{"and":[{"selfTurn":true},{"leaderTrait":"キッド海賊団"}]},"then":[{"op":"lifeAddFromDeck","n":1}]}],"trigger":[{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}]},
  // ST36-003 アプー:【トリガー】1ドロー＋自分の《超新星》リーダーを このターン中 元々のパワー7000に（本文の効果は無し）
  "ST36-003": {"trigger":[{"op":"draw","n":1},{"op":"cond","check":{"leaderTrait":"超新星"},"then":[{"op":"setPower","target":"leader","value":7000,"duration":"turn"}]}]},
  // ST36-004 バルトロメオ:【登場時】手札から《超新星》1枚を捨てられる：2ドロー
  "ST36-004": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"filter":{"trait":"超新星"},"then":[{"op":"draw","n":2}]}]},
  // ST36-005 キッド:【相手のアタック時】【ターン1回】ライフの上か下1枚を裏向きにできる：アタック対象を自分の元々のパワー5000以上の「キッド」に変更
  //   ／【起動メイン】【ターン1回】ライフの上か下1枚を表向きにできる：リーダーにレストのドン1枚まで付与
  //   ※counterRedirect はブロック宣言後に対象を差し替える（公式はブロック前）。対象が居ないとコストだけ払うため cond で事前ガード。
  "ST36-005": {"onOppAttack":[{"op":"cond","once":"turn","check":{"faceUpLifeAtLeast":1,"selfChar":{"name":"ユースタス・キッド","minPower":5000}},"then":[{"op":"lifeCost","action":"faceDown","pos":"choose","then":[{"op":"counterRedirect","filter":{"name":"ユースタス・キッド","minPower":5000},"optional":false}]}]}],"act":{"label":"ライフを表向き：リーダーにレストのドン‼1枚","cost":{},"fx":[{"op":"lifeCost","action":"faceUp","pos":"choose","then":[{"op":"donAttach","target":"leader","n":1}]}]}}
});})();

/* ===== audit駆動【トリガー】一括実装（docs/card-audit-workflow.md §5・頻出テンプレート順・318枚。既存fxへtriggerをマージ／パラレルは親を共有） ===== */
(function () {
  var FX = window.CARD_FX;
  var T = {
  "EB01-020": [{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"bounceOwnCharCost","then":[{"op":"playCharFromHand","diffColorFrom":"costCard","filter":{"maxCost":2},"count":1,"optional":true}]}]}],
  "EB01-029": [{"op":"bounce","side":"any","maxCost":8,"count":1,"optional":true}],
  "EB01-030": [{"op":"playSelf"}],
  "EB01-039": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "EB01-051": [{"op":"deckTrashCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}],
  "EB01-060": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "EB02-007": [{"op":"ko","side":"opp","maxEffPower":4000,"count":1,"optional":true}],
  "EB02-008": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB02-018": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "EB02-020": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB02-021": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "EB02-030": [{"op":"draw","n":1}],
  "EB02-031": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB02-040": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB02-050": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB02-056": [{"op":"draw","n":1}],
  "EB02-058": [{"op":"search","look":4,"count":1,"filter":{"minCost":4},"optional":true}],
  "EB03-011": [{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}],
  "EB03-054": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "EB03-058": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "EB03-060": [{"op":"cond","check":{"leaderNameIncludes":"ナミ"},"then":[{"op":"search","look":4,"count":1,"filter":{"minCost":2,"maxCost":8},"optional":true}]}],
  "EB04-020": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "EB04-028": [{"op":"bounce","side":"any","maxCost":5,"count":1,"optional":true}],
  "EB04-041": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "EB04-049": [{"op":"deckTrashCost","n":2,"then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":5},"count":1,"optional":true}]}],
  "EB04-055": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "EB04-059": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "EB04-060": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP01-009": [{"op":"playSelf"}],
  "OP01-026": [{"op":"powerMod","side":"opp","amount":-10000,"count":1,"includeLeader":true,"optional":true}],
  "OP01-028": [{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}],
  "OP01-029": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP01-030": [{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"麦わらの一味","type":"CHAR"},"optional":true}],
  "OP01-037": [{"op":"playSelf"}],
  "OP01-057": [{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}],
  "OP01-058": [{"op":"restChar","side":"opp","count":1,"optional":true}],
  "OP01-071": [{"op":"playSelf"}],
  "OP01-082": [{"op":"playSelf"}],
  "OP01-086": [{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}],
  "OP01-087": [{"op":"playCharFromHand","filter":{"traitIncludes":"B・W","maxCost":3},"count":1,"optional":true}],
  "OP01-088": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP01-104": [{"op":"playSelf"}],
  "OP01-106": [{"op":"playSelf"}],
  "OP01-115": [{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP01-116": [{"op":"playFromDeck","look":5,"filter":{"traitIncludes":"SMILE","maxCost":3}}],
  "OP01-118": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP02-021": [{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}],
  "OP02-022": [{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"白ひげ海賊団","type":"CHAR"},"optional":true}],
  "OP02-024": [{"op":"playSelf"}],
  "OP02-047": [{"op":"ko","side":"opp","filter":{"maxCost":3,"restedOnly":true},"count":1,"optional":true}],
  "OP02-066": [{"op":"draw","n":2}],
  "OP02-067": [{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}],
  "OP02-068": [{"op":"bounce","side":"any","maxCost":2,"count":1,"optional":true}],
  "OP02-069": [{"op":"bounce","side":"any","maxCost":7,"count":1,"optional":true}],
  "OP02-104": [{"op":"playSelf"}],
  "OP02-113": [{"op":"playSelf"}],
  "OP02-117": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "OP02-119": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP03-016": [{"op":"ko","side":"opp","maxEffPower":6000,"count":1,"optional":true}],
  "OP03-017": [{"op":"cond","check":{"leaderTraitIncludes":"白ひげ海賊団"},"then":[{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true}]}],
  "OP03-018": [{"op":"ko","side":"opp","maxEffPower":5000,"count":1,"optional":true}],
  "OP03-019": [{"op":"powerMod","side":"opp","amount":-10000,"count":1,"includeLeader":true,"optional":true}],
  "OP03-026": [{"op":"playSelf"}],
  "OP03-029": [{"op":"playSelf"}],
  "OP03-030": [{"op":"playSelf"}],
  "OP03-033": [{"op":"cond","check":{"leaderTraitIncludes":"東の海"},"then":[{"op":"playSelf"}]}],
  "OP03-036": [{"op":"ko","side":"opp","filter":{"maxCost":3,"restedOnly":true},"count":1,"optional":true}],
  "OP03-038": [{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}],
  "OP03-039": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP03-055": [{"op":"bounce","side":"any","maxCost":4,"count":1,"optional":true}],
  "OP03-056": [{"op":"draw","n":2}],
  "OP03-072": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP03-073": [{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTraitIncludes":"W7"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}],
  "OP03-074": [{"op":"donMinus","n":2},{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true}],
  "OP03-096": [{"op":"draw","n":2}],
  "OP03-098": [{"op":"playSelf"}],
  "OP03-108": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP03-110": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP03-113": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP03-116": [{"op":"playSelf"}],
  "OP03-117": [{"op":"playSelf"}],
  "OP03-118": [{"op":"discardCost","count":2,"then":[{"op":"lifeAddFromDeck","n":1}]}],
  "OP03-120": [{"op":"cond","check":{"oppLifeAtLeast":4},"then":[{"op":"lifeTrash","side":"opp"}]}],
  "OP03-121": [{"op":"ko","side":"opp","maxCost":5,"count":1,"optional":true}],
  "OP04-016": [{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}],
  "OP04-018": [{"op":"cond","check":{"leaderTraitIncludes":"アラバスタ王国"},"then":[{"op":"powerMod","side":"opp","amount":-2000,"duration":"turn","count":2,"optional":true}]}],
  "OP04-036": [{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドンキホーテ海賊団"},"optional":true}],
  "OP04-037": [{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}],
  "OP04-038": [{"op":"donActivate","n":5}],
  "OP04-052": [{"op":"playSelf"}],
  "OP04-055": [{"op":"discardCost","count":1,"filter":{"nameIncludes":"氷鬼"},"then":[{"op":"deckBottom","side":"any","filter":{"maxCost":4},"count":1,"optional":true},{"op":"reviveFromTrash","filter":{"nameIncludes":"氷鬼"}}]}],
  "OP04-057": [{"op":"bounce","side":"any","maxCost":6,"count":1,"optional":true}],
  "OP04-073": [{"op":"playSelf"}],
  "OP04-074": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP04-075": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP04-076": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP04-093": [{"op":"draw","n":3},{"op":"discardOwn","n":2}],
  "OP04-095": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP04-099": [{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"playSelf"}]}],
  "OP04-103": [{"op":"playSelf"}],
  "OP04-104": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP04-106": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP04-108": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP04-111": [{"op":"playSelf"}],
  "OP04-113": [{"op":"playSelf"}],
  "OP04-115": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP04-116": [{"op":"draw","n":1}],
  "OP05-019": [{"op":"powerMod","side":"opp","amount":-4000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":0},"count":1,"optional":true}]}],
  "OP05-020": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP05-037": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP05-039": [{"op":"ko","side":"opp","filter":{"maxCost":5,"restedOnly":true},"count":1,"optional":true}],
  "OP05-057": [{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}],
  "OP05-059": [{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"draw","n":2}]}],
  "OP05-076": [{"op":"search","look":3,"count":1,"filter":{"or":[{"traitIncludes":"麦わらの一味"},{"traitIncludes":"キッド海賊団"},{"traitIncludes":"ハートの海賊団"}]},"optional":true}],
  "OP05-078": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP05-094": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP05-105": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP05-106": [{"op":"playSelf"}],
  "OP05-115": [{"op":"discardCost","count":2,"then":[{"op":"lifeAddFromDeck","n":1}]}],
  "OP05-116": [{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}],
  "OP06-013": [{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"FILM"},"optional":true}],
  "OP06-018": [{"op":"ko","side":"opp","maxEffPower":5000,"count":1,"optional":true}],
  "OP06-019": [{"op":"ko","side":"opp","maxEffPower":4000,"count":1,"optional":true}],
  "OP06-023": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP06-038": [{"op":"ko","side":"opp","filter":{"maxCost":3,"restedOnly":true},"count":1,"optional":true}],
  "OP06-039": [{"op":"chooseOption","options":[{"label":"相手コスト6以下1枚をレスト","fx":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]},{"label":"相手のレストのコスト6以下1枚KO","fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":6},"count":1,"optional":true}]}]}],
  "OP06-040": [{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":3},"count":2,"optional":true}],
  "OP06-041": [{"op":"playSelf"}],
  "OP06-056": [{"op":"deckBottom","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"deckBottom","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}],
  "OP06-078": [{"op":"draw","n":1}],
  "OP06-095": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP06-096": [{"op":"lifeCost","then":[{"op":"grantAllBattleImmune","duration":"turn","filter":{"maxCost":7,"type":"CHAR"}}]}],
  "OP06-097": [{"op":"oppDiscard","n":1}],
  "OP06-100": [{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}],
  "OP06-102": [{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}],
  "OP06-103": [{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}],
  "OP06-109": [{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}],
  "OP06-110": [{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}],
  "OP06-111": [{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}],
  "OP06-112": [{"op":"cond","check":{"oppLifeAtMost":3},"then":[{"op":"playSelf"}]}],
  "OP06-116": [{"op":"draw","n":1}],
  "OP07-008": [{"op":"playSelf"}],
  "OP07-016": [{"op":"powerMod","side":"self","amount":2000,"duration":"turn","count":1,"optional":true,"filter":{"traitIncludes":"革命軍"}},{"op":"powerMod","side":"opp","amount":-1000,"duration":"turn","count":1,"optional":true}],
  "OP07-017": [{"op":"ko","side":"opp","filter":{"maxEffPower":3000},"count":1,"optional":true},{"op":"koStage","filter":{"maxCost":1},"optional":true}],
  "OP07-018": [{"op":"powerMod","side":"self","amount":2000,"duration":"untilNextEnd","count":1,"optional":true,"filter":{"traitIncludes":"革命軍"}}],
  "OP07-035": [{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}],
  "OP07-036": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP07-037": [{"op":"draw","n":1}],
  "OP07-076": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP07-077": [{"op":"cond","check":{"or":[{"leaderTraitIncludes":"百獣海賊団"},{"leaderTraitIncludes":"ビッグ・マム海賊団"}]},"then":[{"op":"search","look":5,"count":1,"filter":{"or":[{"traitIncludes":"百獣海賊団"},{"traitIncludes":"ビッグ・マム海賊団"}]},"optional":true}]}],
  "OP07-078": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP07-095": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP07-096": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "OP07-098": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-100": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-101": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-105": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-107": [{"op":"draw","n":1},{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"playSelf"}]}],
  "OP07-109": [{"op":"ko","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP07-110": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-111": [{"op":"cond","check":{"leaderNameIncludes":"ベガパンク"},"then":[{"op":"playSelf"}]}],
  "OP07-114": [{"op":"draw","n":1}],
  "OP07-116": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP07-117": [{"op":"playSelf"}],
  "OP08-017": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP08-018": [{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}],
  "OP08-019": [{"op":"ko","side":"opp","maxEffPower":5000,"count":1,"optional":true}],
  "OP08-036": [{"op":"restChar","side":"opp","count":1,"optional":true}],
  "OP08-037": [{"op":"draw","n":1}],
  "OP08-038": [{"op":"restChar","side":"opp","maxCost":3,"count":1,"optional":true}],
  "OP08-053": [{"op":"draw","n":1}],
  "OP08-056": [{"op":"playSelf"}],
  "OP08-075": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP08-076": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP08-091": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "OP08-094": [{"op":"trashToBottomCost","n":3,"then":[{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}]}],
  "OP08-095": [{"op":"powerMod","side":"self","amount":2000,"count":1,"leader":true,"optional":true}],
  "OP08-097": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "OP08-105": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP08-106": [{"op":"discardCost","count":1,"optional":true,"filter":{"hasTrigger":true},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true},{"op":"cond","check":{"selfHandAtMost":3},"then":[{"op":"draw","n":1}]}]}],
  "OP08-112": [{"op":"setAttackBan","filter":{"maxCost":6,"nameExcludes":"モンキー・D・ルフィ"},"count":1,"duration":"untilNextEnd","optional":true}],
  "OP08-115": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP09-019": [{"op":"draw","n":1}],
  "OP09-020": [{"op":"draw","n":1}],
  "OP09-039": [{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}],
  "OP09-040": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP09-041": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP09-057": [{"op":"search","look":4,"count":1,"filter":{"traitIncludes":"クロスギルド"},"optional":true}],
  "OP09-058": [{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}],
  "OP09-059": [{"op":"draw","n":1}],
  "OP09-077": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP09-079": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP09-100": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "OP09-102": [{"op":"cond","check":{"leaderNameIncludes":"ニコ・ロビン"},"then":[{"op":"search","look":3,"count":1,"filter":{"hasTrigger":true},"optional":true}]}],
  "OP09-104": [{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"draw","n":2}]}],
  "OP09-108": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "OP09-109": [{"op":"cond","check":{"leaderNameIncludes":"ニコ・ロビン"},"then":[{"op":"playSelf"}]}],
  "OP09-110": [{"op":"playSelf"}],
  "OP09-112": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "OP09-115": [{"op":"draw","n":1}],
  "OP09-117": [{"op":"draw","n":1}],
  "OP10-018": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP10-020": [{"op":"ko","side":"opp","maxEffPower":3000,"count":1,"optional":true}],
  "OP10-039": [{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}],
  "OP10-041": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP10-059": [{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"ドレスローザ","type":"CHAR"},"optional":true}],
  "OP10-060": [{"op":"deckBottom","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}],
  "OP10-061": [{"op":"bounce","side":"any","maxCost":2,"count":1,"optional":true}],
  "OP10-079": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP10-080": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP10-097": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP10-100": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"革命軍"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "OP10-109": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP10-110": [{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}],
  "OP10-116": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP10-117": [{"op":"draw","n":1}],
  "OP11-018": [{"op":"ko","side":"opp","maxEffPower":6000,"count":1,"optional":true}],
  "OP11-019": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP11-020": [{"op":"ko","side":"opp","maxEffPower":4000,"count":1,"optional":true}],
  "OP11-023": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP11-028": [{"op":"ko","side":"opp","filter":{"maxCost":3,"restedOnly":true},"count":1,"optional":true}],
  "OP11-037": [{"op":"draw","n":1}],
  "OP11-039": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP11-059": [{"op":"bounce","side":"any","maxCost":2,"count":1,"optional":true}],
  "OP11-075": [{"op":"cond","check":{"and":[{"leaderNameIncludes":"ニコ・ロビン"},{"donAtLeast":7}]},"then":[{"op":"draw","n":2}]}],
  "OP11-079": [{"op":"draw","n":1}],
  "OP11-081": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "OP11-098": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP11-099": [{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"海軍"},"exclude":"ぼくは!!!海軍将校になる男です!!!!","rest":"trash","optional":true}],
  "OP11-115": [{"op":"ko","side":"opp","maxCost":2,"count":1,"optional":true}],
  "OP12-039": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "OP12-058": [{"op":"draw","n":1}],
  "OP12-077": [{"op":"draw","n":1}],
  "OP12-080": [{"op":"playSelf"}],
  "OP12-097": [{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"革命軍","nameExcludes":"軍隊長集結"},"rest":"trash","optional":true}],
  "OP12-101": [{"op":"cond","check":{"leaderTraitIncludes":"超新星"},"then":[{"op":"playSelf"}]}],
  "OP12-104": [{"op":"ko","side":"opp","maxCost":4,"count":1,"optional":true}],
  "OP12-112": [{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"draw","n":2}]}],
  "OP12-116": [{"op":"draw","n":1}],
  "OP13-020": [{"op":"powerMod","side":"opp","amount":-5000,"count":1,"optional":true,"duration":"turn"}],
  "OP13-021": [{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}],
  "OP13-038": [{"op":"restChar","side":"opp","maxCost":5,"count":1,"optional":true}],
  "OP13-039": [{"op":"ko","side":"opp","filter":{"maxCost":4,"restedOnly":true},"count":1,"optional":true}],
  "OP13-059": [{"op":"draw","n":1}],
  "OP13-096": [{"op":"search","look":3,"count":1,"filter":{"traitIncludes":"天竜人","nameExcludes":"ここに"},"rest":"trash","optional":true}],
  "OP13-106": [{"op":"playSelf"}],
  "OP13-109": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "OP13-113": [{"op":"search","look":4,"count":1,"filter":{"hasTrigger":true,"nameExcludes":"リリス"},"optional":true}],
  "OP13-114": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP13-115": [{"op":"draw","n":1}],
  "OP13-116": [{"op":"search","look":5,"count":1,"filter":{"traitIncludes":"超新星","type":"CHAR"},"optional":true}],
  "OP13-117": [{"op":"draw","n":1}],
  "OP15-056": [{"op":"draw","n":2}],
  "OP15-079": [{"op":"trashToHand","count":1,"filter":{"trait":"スリラーバーク海賊団"},"optional":true}],
  "OP15-103": [{"op":"draw","n":1},{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}],
  "OP16-106": [{"op":"cond","check":{"leaderTrait":"黒ひげ海賊団"},"then":[{"op":"draw","n":1},{"op":"setPower","target":"chooseOwnL","value":7000,"duration":"turn","optional":true}]}],
  "OP16-107": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "OP16-111": [{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}],
  "OP16-113": [{"op":"cond","check":{"leaderTraitIncludes":"九蛇海賊団"},"then":[{"op":"playSelf"}]}],
  "OP16-114": [{"op":"ko","side":"opp","count":1,"maxCost":4,"optional":true}],
  "P-002": [{"op":"selfHandToDeckDraw"}],
  "P-014": [{"op":"playSelf"}],
  "P-024": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "P-042": [{"op":"ko","side":"opp","maxCost":4,"count":1,"optional":true}],
  "P-057": [{"op":"cond","check":{"leaderNameIncludes":"ウタ"},"then":[{"op":"lockRefresh","count":2,"filter":{"maxCost":4},"optional":true}]}],
  "P-088": [{"op":"cond","check":{"and":[{"leaderTraitIncludes":"超新星"},{"totalLifeAtMost":5}]},"then":[{"op":"playSelf"}]}],
  "P-113": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "PRB02-012": [{"op":"playSelf"}],
  "PRB02-016": [{"op":"restChar","side":"opp","maxCost":4,"count":1,"optional":true}],
  "PRB02-017": [{"op":"ko","side":"opp","maxCost":4,"count":1,"optional":true}],
  "ST01-002": [{"op":"playSelf"}],
  "ST01-014": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "ST01-015": [{"op":"ko","side":"opp","filter":{"maxEffPower":6000},"count":1,"optional":true}],
  "ST02-005": [{"op":"playSelf"}],
  "ST02-015": [{"op":"donActivate","n":2}],
  "ST03-010": [{"op":"playSelf"}],
  "ST03-013": [{"op":"playSelf"}],
  "ST03-015": [{"op":"bounce","side":"any","maxCost":7,"count":1,"optional":true}],
  "ST03-016": [{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}],
  "ST04-010": [{"op":"playSelf"}],
  "ST04-014": [{"op":"draw","n":1},{"op":"donFromDeck","n":1,"mode":"active"}],
  "ST04-015": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "ST05-009": [{"op":"playSelf"}],
  "ST05-016": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "ST05-017": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "ST06-014": [{"op":"ko","side":"opp","maxCost":4,"count":1,"optional":true}],
  "ST07-007": [{"op":"playSelf"}],
  "ST07-009": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "ST07-011": [{"op":"playSelf"}],
  "ST07-013": [{"op":"playSelf"}],
  "ST07-015": [{"op":"lifeTrash","side":"opp"}],
  "ST07-017": [{"op":"playSelf"}],
  "ST08-007": [{"op":"playSelf"}],
  "ST08-015": [{"op":"draw","n":1}],
  "ST09-014": [{"op":"discardCost","count":2,"then":[{"op":"lifeAddFromDeck","n":1}]}],
  "ST09-015": [{"op":"draw","n":1}],
  "ST10-017": [{"op":"donFromDeck","n":1,"mode":"active"}],
  "ST11-005": [{"op":"powerMod","side":"self","amount":1000,"count":1,"leader":true,"optional":true}],
  "ST12-002": [{"op":"playSelf"}],
  "ST12-016": [{"op":"restChar","side":"opp","includeLeader":true,"filter":{"maxCost":4},"count":1,"optional":true}],
  "ST13-019": [{"op":"search","look":5,"count":1,"filter":{"maxCost":5,"or":[{"nameIncludes":"サボ"},{"nameIncludes":"ポートガス・D・エース"},{"nameIncludes":"モンキー・Ｄ・ルフィ"}]},"optional":true}],
  "ST14-016": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "ST20-002": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "ST20-004": [{"op":"restChar","side":"opp","maxCost":3,"count":1,"optional":true}],
  "ST21-016": [{"op":"ko","side":"opp","maxEffPower":4000,"count":1,"optional":true}],
  "ST21-017": [{"op":"powerMod","side":"opp","amount":-5000,"duration":"turn","count":1,"optional":true},{"op":"cond","check":{"selfCharCount":{"filter":{"minEffPower":6000},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxEffPower":2000},"count":1,"optional":true}]}],
  "ST22-016": [{"op":"draw","n":1}],
  "ST22-017": [{"op":"bounce","side":"any","maxCost":3,"count":1,"optional":true}],
  "ST29-003": [{"op":"ko","side":"opp","maxCost":3,"count":1,"optional":true}],
  "ST29-004": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"}]}],
  "ST29-005": [{"op":"cond","check":{"leaderNameIncludes":"モンキー・Ｄ・ルフィ"},"then":[{"op":"playSelf"}]}],
  "ST29-008": [{"op":"cond","check":{"leaderNameIncludes":"モンキー・Ｄ・ルフィ"},"then":[{"op":"playSelf"}]}],
  "ST29-009": [{"op":"cond","check":{"leaderNameIncludes":"モンキー・Ｄ・ルフィ"},"then":[{"op":"playSelf"}]}],
  "ST29-012": [{"op":"playSelf"}],
  "ST29-015": [{"op":"draw","n":1}],
  "ST29-017": [{"op":"draw","n":2},{"op":"discardOwn","n":1}],
  "ST30-015": [{"op":"ko","side":"opp","maxEffPower":6000,"count":1,"optional":true}],
  "ST30-017": [{"op":"search","look":5,"count":1,"filter":{"basePower":6000},"optional":true}]
  };
  // ★fxオブジェクトは複数no間で参照共有される場合がある（例 OP01-016/EB02-017/PRB02-012）。
  //   in-place代入だと公式にトリガーの無い別noへ漏れる → 浅いクローンにtriggerを載せ替え、共有元は不変にする。
  for (var no in T) { FX[no] = Object.assign({}, FX[no], { trigger: T[no] }); }
})();

/* ===== audit駆動【トリガー】追補（長尾・個別実装118枚＝残り全部。docs/card-audit-workflow.md §5・正本=official-full.json） =====
   近似メモ: OP06-059(scry=並び順維持で上/下振り分け・自由並び替えは未対応) / ST06-016(grantTraitKoImmune=効果KO耐性・バトルKOは対象外)
   OP04-117/OP08-117/ST13-017/018(handToLifeは最小カウンター自動選択) */
(function () {
  var FX = window.CARD_FX;
  var T = {
  "EB01-010": [{"op":"ko","side":"opp","filter":{"maxPower":5000},"count":1,"optional":true}],
  "EB01-028": [{"op":"deckBottom","filter":{"maxCost":3},"optional":true}],
  "EB01-035": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "EB01-038": [{"op":"donMinus","n":1},{"op":"draw","n":2}],
  "EB01-053": [{"op":"powerMod","side":"opp","includeLeader":true,"amount":-3000,"duration":"turn","count":2,"optional":true}],
  "EB01-059": [{"op":"ko","side":"opp","filter":{"maxCostFrom":"totalLife"},"count":1,"optional":true}],
  "EB02-055": [{"op":"cond","check":{"and":[{"or":[{"leaderTrait":"魚人族"},{"leaderTrait":"人魚族"}]},{"lifeAtMost":2}]},"then":[{"op":"playSelf"}]}],
  "EB03-020": [{"op":"activateOwnChar","count":1,"optional":true}],
  "EB03-059": [{"op":"setAttackBan","side":"opp","filter":{"maxCost":6,"nameExcludes":"モンキー・Ｄ・ルフィ"},"count":1,"optional":true}],
  "EB04-027": [{"op":"playCharFromHand","filter":{"maxPower":5000,"hasTrigger":true},"count":1,"optional":true}],
  "EB04-051": [{"op":"powerMod","side":"opp","all":true,"amount":-3000,"duration":"turn"},{"op":"cond","check":{"lifeAtMost":0},"then":[{"op":"playSelf"}]}],
  "OP02-023": [{"op":"powerMod","side":"self","leader":true,"filter":{"type":"LEADER"},"amount":1000,"duration":"turn","count":1,"optional":true}],
  "OP02-045": [{"op":"restChar","side":"opp","includeLeader":true,"filter":{"maxCost":5},"count":1,"optional":true}],
  "OP02-046": [{"op":"playCharFromHand","filter":{"maxCost":4,"noEffect":true},"count":1,"optional":true}],
  "OP02-075": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP02-089": [{"op":"cond","check":{"oppDonAtLeast":6},"then":[{"op":"oppDonToDeck","n":1}]}],
  "OP02-090": [{"op":"cond","check":{"oppDonAtLeast":6},"then":[{"op":"oppDonToDeck","n":1}]}],
  "OP02-091": [{"op":"cond","check":{"oppDonAtLeast":6},"then":[{"op":"oppDonToDeck","n":1}]}],
  "OP02-118": [{"op":"koStage","maxCost":3}],
  "OP03-037": [{"op":"playCharFromHand","filter":{"maxCost":4,"hasTrigger":true},"count":1,"optional":true}],
  "OP03-054": [{"op":"draw","n":1},{"op":"deckToTrash","n":1,"optional":true}],
  "OP03-057": [{"op":"deckBottom","filter":{"maxCost":3},"optional":true}],
  "OP03-094": [{"op":"reviveFromTrash","maxCost":3,"filter":{"color":"黒"}}],
  "OP03-095": [{"op":"oppDiscard","n":1}],
  "OP03-097": [{"op":"draw","n":1},{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true}],
  "OP03-100": [{"op":"lifeCost","action":"trash","pos":"choose","then":[{"op":"playSelf"}]}],
  "OP03-119": [{"op":"playCharFromHand","filter":{"maxCost":4,"hasTrigger":true},"count":1,"optional":true}],
  "OP04-035": [{"op":"powerMod","side":"self","leader":true,"filter":{"type":"LEADER"},"amount":2000,"duration":"turn","count":1,"optional":true}],
  "OP04-064": [{"op":"donMinus","n":2},{"op":"playSelf"}],
  "OP04-065": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP04-066": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP04-067": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP04-069": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP04-094": [{"op":"restOwnAsCost","count":1,"filter":{"type":"LEADER"},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}],
  "OP04-100": [{"op":"setAttackBan","side":"opp","includeLeader":true,"count":1,"optional":true}],
  "OP04-101": [{"op":"playSelf"},{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}],
  "OP04-117": [{"op":"lifeCost","pos":"choose","then":[{"op":"handToLife","optional":true}]}],
  "OP05-011": [{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"playSelf"}]}],
  "OP05-016": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"playSelf"}]}]}],
  "OP05-017": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderMulticolor":true},"then":[{"op":"playSelf"}]}]}],
  "OP05-018": [{"op":"playCharFromHand","filter":{"maxPower":5000,"trait":"革命軍"},"count":1,"optional":true}],
  "OP05-038": [{"op":"restChar","side":"opp","includeLeader":true,"filter":{"maxCost":3},"count":1,"optional":true}],
  "OP05-058": [{"op":"deckBottom","all":true,"filter":{"maxCost":2}}],
  "OP05-073": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP05-096": [{"op":"chooseOption","options":[{"label":"コスト6以下をKO","fx":[{"op":"ko","side":"opp","filter":{"maxCost":6},"count":1,"optional":true}]},{"label":"コスト6以下を手札に戻す","fx":[{"op":"bounce","maxCost":6,"count":1,"optional":true}]}]}],
  "OP05-114": [{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}],
  "OP06-031": [{"op":"playCharFromHand","filter":{"maxCost":3,"or":[{"trait":"魚人族"},{"trait":"人魚族"}]},"count":1,"optional":true}],
  "OP06-057": [{"op":"playCharFromHand","filter":{"minCost":2,"maxCost":2},"count":1,"optional":true}],
  "OP06-058": [{"op":"deckBottom","filter":{"maxCost":5},"optional":true}],
  "OP06-059": [{"op":"scry","n":5}],
  "OP06-077": [{"op":"deckBottom","filter":{"maxCost":4},"optional":true}],
  "OP06-108": [{"op":"powerMod","side":"self","leader":true,"filter":{"trait":"ワノ国"},"amount":2000,"duration":"turn","count":1,"optional":true}],
  "OP06-115": [{"op":"cond","check":{"lifeAtMost":0},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"discardOwn","n":1}]}],
  "OP07-055": [{"op":"bounceOwnCharCost","then":[{"op":"bounce","maxCost":5,"count":1,"optional":true}]}],
  "OP07-056": [{"op":"draw","n":2},{"op":"bottomOwn","n":2}],
  "OP07-094": [{"op":"bounce","side":"own","count":1,"optional":true}],
  "OP07-099": [{"op":"powerMod","side":"self","leader":true,"filter":{"trait":"エッグヘッド"},"amount":2000,"duration":"untilNextEnd","count":1,"optional":true}],
  "OP07-102": [{"op":"bounce","maxCost":4,"count":1,"optional":true},{"op":"selfToHand"}],
  "OP07-103": [{"op":"giveKeyword","target":"chooseOwn","kw":"blocker","duration":"turn","filter":{"trait":"エッグヘッド"}},{"op":"selfToHand"}],
  "OP07-104": [{"op":"cond","check":{"leaderTrait":"エッグヘッド"},"then":[{"op":"draw","n":2}]}],
  "OP07-113": [{"op":"cond","check":{"leaderTrait":"エッグヘッド"},"then":[{"op":"restChar","side":"opp","includeLeader":true,"count":1,"optional":true}]}],
  "OP08-068": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP08-096": [{"op":"reviveFromTrash","maxCost":3,"filter":{"color":"黒"}}],
  "OP08-104": [{"op":"discardCost","count":1,"then":[{"op":"playSelf"},{"op":"draw","n":1}]}],
  "OP08-111": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}]}],
  "OP08-113": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"},{"op":"ko","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}]}]}],
  "OP08-114": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"lifeAtMost":2},"then":[{"op":"playSelf"}]}]}],
  "OP08-117": [{"op":"lifeCost","then":[{"op":"handToLife","optional":true}]}],
  "OP09-097": [{"op":"negateChoose","duration":"turn"}],
  "OP09-098": [{"op":"negateChoose","duration":"turn"}],
  "OP09-105": [{"op":"cond","check":{"leaderTrait":"エッグヘッド"},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"discardOwn","n":2}]}],
  "OP09-106": [{"op":"cond","check":{"leaderNameIncludes":"ニコ・ロビン"},"then":[{"op":"draw","n":3},{"op":"discardOwn","n":2}]}],
  "OP09-107": [{"op":"playCharFromHand","filter":{"maxCost":3,"color":"黄"},"count":1,"optional":true}],
  "OP09-111": [{"op":"cond","check":{"and":[{"leaderTrait":"エッグヘッド"},{"oppHandAtLeast":6}]},"then":[{"op":"oppDiscard","n":2}]}],
  "OP09-114": [{"op":"cond","check":{"totalLifeAtMost":5},"then":[{"op":"playSelf"}]}],
  "OP09-116": [{"op":"playCharFromHand","filter":{"maxCost":4,"trait":"革命軍"},"count":1,"optional":true}],
  "OP10-096": [{"op":"ko","side":"opp","filter":{"maxCost":4,"trait":"王下七武海"},"count":1,"optional":true}],
  "OP10-098": [{"op":"negateChoose","leaderOnly":true,"duration":"turn"},{"op":"negateChoose","charsOnly":true,"duration":"turn"}],
  "OP10-113": [{"op":"discardCost","count":1,"then":[{"op":"cond","check":{"leaderTrait":"超新星"},"then":[{"op":"playSelf"}]}]}],
  "OP10-115": [{"op":"ko","side":"opp","filter":{"maxCostFrom":"oppLife"},"count":1,"optional":true}],
  "OP11-061": [{"op":"deckBottom","filter":{"maxCost":1},"optional":true}],
  "OP11-116": [{"op":"charToLife","filter":{"maxCost":4},"faceUp":true,"pos":"choose","optional":true}],
  "OP12-057": [{"op":"discardCost","count":1,"then":[{"op":"draw","n":1}]}],
  "OP12-075": [{"op":"donMinus","n":1},{"op":"playSelf"}],
  "OP12-096": [{"op":"draw","n":1},{"op":"deckToTrash","n":1}],
  "OP12-098": [{"op":"draw","n":1},{"op":"deckToTrash","n":1}],
  "OP12-109": [{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"selfToHand"}],
  "OP12-113": [{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"selfToHand"}],
  "OP13-014": [{"op":"powerMod","side":"self","leader":true,"filter":{"name":"ポートガス・Ｄ・エース"},"amount":3000,"duration":"turn","count":1,"optional":true}],
  "OP13-102": [{"op":"draw","n":1},{"op":"restChar","side":"opp","filter":{"maxCost":3},"count":1,"optional":true}],
  "OP13-108": [{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"restChar","side":"opp","filter":{"maxCost":7},"count":1,"optional":true}]}],
  "OP15-106": [{"op":"draw","n":1},{"op":"playSpecificFromHand","choose":true,"optional":true,"filter":{"maxCost":2,"color":"黄","or":[{"type":"CHAR"},{"type":"STAGE"}]}}],
  "OP16-019": [{"op":"leaderBuff","amount":1000,"duration":"turn"}],
  "OP16-039": [{"op":"restChar","side":"opp","leaderOnly":true}],
  "OP16-105": [{"op":"cond","check":{"lifeAtMost":1},"then":[{"op":"reviveFromTrash","maxCost":4,"filter":{"name":"アブサロム"}},{"op":"reviveFromTrash","maxCost":4,"filter":{"name":"ドクトル・ホグバック"}},{"op":"reviveFromTrash","maxCost":4,"filter":{"name":"ペローナ"}}]}],
  "OP16-115": [{"op":"negateChoose","duration":"turn"}],
  "OP16-117": [{"op":"trashToHand","filter":{"trait":"黒ひげ海賊団"},"count":1}],
  "OP16-119": [{"op":"negateChoose","charsOnly":true,"duration":"turn"},{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}],
  "P-058": [{"op":"activateOwnChar","all":true,"filter":{"trait":"FILM"}}],
  "P-106": [{"op":"draw","n":1},{"op":"ko","side":"opp","filter":{"maxCost":2},"count":1,"optional":true}],
  "P-115": [{"op":"playCharFromHand","filter":{"maxPower":5000,"color":"黄","hasTrigger":true},"count":1,"optional":true}],
  "ST01-016": [{"op":"ko","side":"opp","filter":{"maxCost":3,"hasKw":"blocker"},"count":1,"optional":true}],
  "ST02-017": [{"op":"playSpecificFromHand","choose":true,"optional":true,"filter":{"maxCost":2,"trait":"超新星","or":[{"type":"CHAR"},{"type":"STAGE"}]}}],
  "ST06-015": [{"op":"oppDiscard","n":1}],
  "ST06-016": [{"op":"draw","n":1},{"op":"grantTraitKoImmune","duration":"turn"}],
  "ST07-016": [{"op":"draw","n":1},{"op":"peekLifeTopPlace"}],
  "ST08-014": [{"op":"trashToHand","filter":{"maxCost":2,"color":"黒","type":"CHAR"},"count":1}],
  "ST09-002": [{"op":"restChar","side":"opp","filter":{"maxCost":2},"count":1,"optional":true},{"op":"selfToHand"}],
  "ST09-009": [{"op":"ko","side":"opp","filter":{"maxCost":1},"count":1,"optional":true},{"op":"selfToHand"}],
  "ST10-016": [{"op":"powerMod","side":"self","leader":true,"filter":{"type":"LEADER"},"amount":1000,"duration":"untilNextEnd","count":1,"optional":true}],
  "ST13-017": [{"op":"lifeCost","pos":"choose","then":[{"op":"handToLife","optional":true}]}],
  "ST13-018": [{"op":"lifeCost","pos":"choose","then":[{"op":"handToLife","optional":true}]}],
  "ST14-014": [{"op":"trashToHand","filter":{"maxCost":2,"type":"CHAR"},"count":1}],
  "ST14-015": [{"op":"cond","check":{"selfCharCount":{"filter":{"minCost":8},"min":1}},"then":[{"op":"ko","side":"opp","filter":{"maxCost":5},"count":1,"optional":true}]}],
  "ST20-003": [{"op":"peekLifeTopPlace"},{"op":"selfToHand"}],
  "ST28-003": [{"op":"cond","check":{"and":[{"leaderTrait":"ワノ国"},{"oppLifeAtMost":3}]},"then":[{"op":"playSelf"}]}],
  "ST29-007": [{"op":"powerMod","side":"self","leader":true,"filter":{"name":"モンキー・Ｄ・ルフィ"},"amount":2000,"duration":"turn","count":1,"optional":true}],
  "ST29-013": [{"op":"ko","side":"opp","filter":{"maxCostFrom":"totalLife"},"count":1,"optional":true}]
  };
  // 参照共有対策: 浅いクローンに trigger を載せ替え（既存マージIIFEと同方式・パラレルは親を継承）
  for (var no in T) { FX[no] = Object.assign({}, FX[no], { trigger: T[no] }); }
})();
