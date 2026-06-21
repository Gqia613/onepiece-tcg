/* cards-fx.js — Phase3で実装したカード効果(fx)。番号→fx の対応表。
   index.html が <script src> で読み込み、src/00-data.js の mergeCardDB が起動時に C の各カードへ付与する（dataOnly を解除）。
   全カードの効果fxをここに集約（src/00-data.js の def() からも移行済み）。fxは「プレーンなopオブジェクト」で書く。
   op語彙は docs/opcg-effect-system-design.md §12（最新の全op一覧）と doOp を参照。公式テキストと一致を確認済みのものだけ追加する。
   costMod/condRush/condBlocker は fx と同階層のメタキー（mergeCardDB が base へ持ち上げる）。
   現在: 検証用3枚 + OP-16(100枚) + OP-15(82枚)。 */
window.CARD_FX = {
  /* ===== リーダーのデータ駆動フック（onAllyEnter 等。従来は src/30 にハードコード） ===== */
  // OP11-041 ナミ:【ドン‼×1】自分のターン中に自分のキャラが登場した時、1ドローし手札1枚をデッキ下（ターン1回）
  "OP11-041": {"onAllyEnter":{"when":"selfTurn","once":"turn","cond":"donX1Self","fx":[{"op":"draw","n":1},{"op":"bottomOwn","n":1}]}},
  // OP14-041 ボア・ハンコック: 相手のターン中に自分のキャラが登場した時、1ドロー（ターン1回制限なし）
  "OP14-041": {"onAllyEnter":{"when":"oppTurn","fx":[{"op":"draw","n":1}]}},
  /* ----- 同名・別Noのリーダー（番号キーで実装。curatedの短縮キーとは独立＝誤適用なし） ----- */
  // OP15-098 モンキー・Ｄ・ルフィ(空島): 自分の元々パワー6000以上の《空島》キャラが相手に場を離れる時、代わりにライフ上1枚を手札に加えられる
  "OP15-098": {"static":[{"op":"leaveProtect","pay":"lifeToHand","targetFilter":{"minPower":6000,"trait":"空島"}}]},
  // ST29-001 モンキー・Ｄ・ルフィ(エッグヘッド/四皇): 【アタック時】自分のライフが2枚以下なら1ドローし手札1枚を捨てる
  "ST29-001": {"onAttack":[{"op":"cond","check":"life<=2","then":[{"op":"draw","n":1},{"op":"discardOwn","n":1}]}]},
  // OP16-022 モンキー・Ｄ・ルフィ(インペルダウン): 【起動メイン】【ターン1回】自キャラが《インペルダウン》のみの場合、ドン!!2枚までアクティブに
  "OP16-022": {"act":{"label":"インペルダウンのみ:ドン2アクティブ","cost":{},"fx":[{"op":"donActivate","n":2,"cond":{"allSelfChar":{"trait":"インペルダウン"}}}]}},
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
  "ST03-001": {"act":{"label":"ドン-4:コスト5以下を手札へ","cost":{},"fx":[{"op":"donMinus","n":4},{"op":"bounce","side":"opp","maxCost":5,"count":1,"optional":true}]}},
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
  "ST07-001": {"onAttack":[{"op":"cond","check":"donX2","then":[{"op":"lifeCost","action":"toHand","pos":"choose","then":[{"op":"cond","check":"life<=2","then":[{"op":"handToLife"}]}]}]}]},
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
  "P-086": {"act":{"label":"ドン-3＋自デッキ下:ハート登場","cost":{},"fx":[{"op":"donMinus","n":3},{"op":"deckBottomOwnCharCost","filter":{"minEffPower":3000},"then":[{"op":"playCharFromHand","maxCost":4,"filter":{"traitIncludes":"ハートの海賊団"},"count":1,"optional":true}]}]}},
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
  "OP10-045": {"onPlay":[{"op":"draw","n":1},{"op":"bottomOwn","n":1}]},
  "OP15-047": {"onPlay":[{"op":"giveKeyword","target":"chooseOwn","kw":"unblockable","duration":"turn"}]},
  "OP15-044": {"onKO":[{"op":"search","look":3,"filter":{"trait":"ドレスローザ","type":"EVENT"}}]},
  "OP15-046": {"onPlay":[{"op":"playEventFromHand","cond":{"leaderTrait":"ドレスローザ"},"filter":{"trait":"ドレスローザ","type":"EVENT"}}]},
  "OP15-021": {"costMod":{"cond":{"trashCount":{"filter":{"type":"EVENT"},"min":4}},"amount":-3},"main":{"don":0,"fx":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"powerMod","side":"opp","amount":-3000,"count":1,"battle":true,"optional":true}]}},
  "OP15-054": {"main":{"don":0,"fx":[{"op":"cond","check":{"leaderNameIncludes":"ルーシー"},"then":[{"op":"chooseOption","options":[{"label":"2ドロー・1捨て・ドレスローザ登場","fx":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"playCharFromHand","count":1,"optional":true,"filter":{"maxCost":4,"trait":"ドレスローザ"}}]},{"label":"ステージ1枚を持ち主の手札に戻す","fx":[{"op":"bounceStage","optional":true}]}]}]}]}},
  "OP04-056": {"main":{"don":0,"fx":[{"op":"bounce","side":"opp","maxCost":7,"count":1}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000}]}},
  "OP15-020": {"main":{"don":0,"fx":[{"op":"powerMod","side":"self","amount":3000,"count":1,"leader":true},{"op":"powerMod","side":"opp","amount":-8000,"count":1,"optional":true,"duration":"untilNextEnd"},{"op":"discardCost","count":2,"then":[{"op":"ko","side":"opp","count":1,"optional":true,"filter":{"maxEffPower":0}}]}]}},
  "OP15-056": {"main":{"don":0,"fx":[{"op":"draw","n":2},{"op":"leaderDoubleAttack","amount":3000,"cond":{"leaderNameIncludes":"ルーシー"}}]},"trigger":[{"op":"draw","n":2}]},
  "OP15-057": {"onPlay":[{"op":"cond","check":"leaderDressrosa","then":[{"op":"draw","n":1}]}],"onOppAttack":[{"op":"restSelfCost","then":[{"op":"discardCost","count":1,"filter":{"or":[{"type":"EVENT"},{"type":"STAGE"}]},"then":[{"op":"powerMod","side":"self","amount":2000,"count":1,"leader":true,"battle":true,"optional":true}]}]}]},
  "OP15-042": {"onPlay":[{"op":"discardCost","count":1,"optional":true,"then":[{"op":"cond","check":{"leaderNameIncludes":"レベッカ"},"then":[{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}]}],"onKO":[{"op":"selfToHand"}]},
  "OP13-016": {"onPlay":[{"op":"search","look":4,"filter":{"minCost":3}}]},
  "ST22-002": {"onPlay":[{"op":"search","look":5,"filter":{"trait":"白ひげ海賊団"}}]},
  "PRB02-008": {"onKO":[{"op":"draw","n":2}]},
  "OP13-043": {"onPlay":[{"op":"cond","check":"life<=3","then":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donAttach","target":"leader","n":1}]}]},
  "OP13-054": {"onPlay":[{"op":"bounce","side":"opp","maxCost":5,"count":1},{"op":"donAttach","target":"leader","n":1}],"static":[{"op":"condBuff","cond":"donX1Self","power":1000}]},
  "ST23-001": {"onPlay":[{"op":"deckBottom","side":"opp","maxCost":6,"count":1,"condLeader":"leaderRB"}]},
  "OP08-047": {"onPlay":[{"op":"bounce","side":"opp","maxCost":4,"count":1}]},
  "OP13-042": {"onPlay":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donAttach","target":"leaderAndChar","n":2}]},
  "OP08-043": {"onPlay":[{"op":"leaderBuff","amount":2000,"duration":"untilNextStart"}],"onAttack":[{"op":"ko","side":"opp","maxPower":3000,"count":1,"cond":"donX2"}]},
  "OP09-118": {"static":[{"op":"unblockableAttack"}],"onPlay":[{"op":"lifeToHand","n":1}]},
  "EB02-006": {"act":{"label":"リーダーにドン付与+速攻","cost":{},"fx":[{"op":"donAttach","target":"leader","n":1},{"op":"giveKeyword","target":"self","kw":"rush","duration":"turn"}]}},
  "ST22-015": {"main":{"don":0,"fx":[{"op":"playSpecificFromHand","name":"エドワード・ニューゲート","noEnter":true}]}},
  "OP13-057": {"main":{"don":0,"fx":[{"op":"cond","check":"life<=1","then":[{"op":"denyBlockerVsLeader"}]}]},"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000}]}},
  "OP11-054": {"onPlay":[{"op":"draw","n":3},{"op":"bottomOwn","n":2}]},
  "EB03-053": {"onPlay":[{"op":"donAttach","target":"leader","n":1},{"op":"cond","check":"oppLife>=3","then":[{"op":"oppLifeToHand","n":1}]}],"onKO":[{"op":"flipLifeUp"},{"op":"playCharFromHand","maxPower":6000}]},
  "EB04-058": {"onPlay":[{"op":"cond","check":"life<=2","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  "OP14-103": {"onPlay":[{"op":"lifeSwap","n":1}]},
  "EB03-055": {"onPlay":[{"op":"lifeTrash","n":1},{"op":"lifeAddFromDeck","n":2}],"onKO":[{"op":"cond","check":"oppTurn","then":[{"op":"oppDamage","n":1}]}]},
  "ST17-004": {"onPlay":[{"op":"scry","n":3},{"op":"donAttach","target":"leader","n":1}]},
  "OP08-050": {"onPlay":[{"op":"draw","n":2},{"op":"handToBottom","n":2}]},
  "OP06-101": {"onPlay":[{"op":"giveKeyword","target":"chooseOwnL","kw":"banish","duration":"turn"}],"trigger":[{"op":"ko","side":"opp","maxCost":5,"count":1,"optional":true}]},
  "OP14-105": {"trigger":[{"op":"playSelf"}],"act":{"label":"ドン付与","cost":{"restSelf":true},"fx":[{"op":"donAttachAll","n":1,"incLeader":true}]}},
  "OP14-104": {"onPlay":[{"op":"reviveFromTrash","maxCost":4,"filter":{"trait":"スリラーバーク海賊団"}}],"trigger":[{"op":"reviveFromTrash","maxCost":4}]},
  "OP15-113": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"lifeAddFromDeck","n":1,"optional":true}]}]},
  "OP14-112": {"onPlay":[{"op":"cond","check":"leaderShichibukai","then":[{"op":"lifeAddFromDeck","n":1},{"op":"oppLifeToHand","n":1}]}],"trigger":[{"op":"playCharFromHand","maxPower":6000,"needsTrigger":true}]},
  "OP07-057": {"main":{"don":0,"fx":[{"op":"powerMod","side":"self","amount":2000,"count":1,"leader":true,"optional":true},{"op":"giveKeyword","target":"chooseOwnL","kw":"unblockable","duration":"turn"}]},"trigger":[{"op":"bounce","side":"opp","maxCost":4,"count":1,"optional":true}]},
  "OP14-114": {"act":{"label":"九蛇にドン付与","cost":{},"fx":[{"op":"donAttach","target":"leader","n":1}]},"trigger":[{"op":"cond","check":"leaderKujya","then":[{"op":"playSelf"}]}]},
  "OP11-060": {"main":{"don":0,"fx":[{"op":"cond","check":"leaderMulti","then":[{"op":"search","look":5,"filter":{"trait":"麦わらの一味"}}]}]},"trigger":[{"op":"cond","check":"leaderMulti","then":[{"op":"search","look":5,"filter":{"trait":"麦わらの一味"}}]}]},
  "OP14-107": {"onPlay":[{"op":"cond","check":"oppLife<=3","then":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]}],"trigger":[{"op":"cond","check":"leaderKujya","then":[{"op":"playSelf"}]}]},
  "OP14-108": {"onPlay":[{"op":"cond","check":"leaderMulti","then":[{"op":"cond","check":"oppLife<=3","then":[{"op":"ko","side":"opp","maxPower":7000,"count":1,"optional":true}]}]}],"trigger":[{"op":"playSelf"}]},
  "OP14-113": {"onPlay":[{"op":"search","look":5,"filter":{"traits":["アマゾン・リリー","九蛇海賊団"]}},{"op":"discardOwn","n":1}],"trigger":[{"op":"cond","check":"leaderKujya","then":[{"op":"playSelf"}]}]},
  "OP12-119": {"onPlay":[{"op":"discardOwn","n":1,"optional":true},{"op":"lifeAddFromDeck","n":1,"optional":true}],"onKO":[{"op":"cond","check":"oppTurn","then":[{"op":"lifeAddFromDeck","n":1}]}]},
  "OP07-115": {"counter":{"cost":0,"fx":[{"op":"cond","check":"life<=2","then":[{"op":"counterBuff","amount":3000}]}]},"trigger":[{"op":"reviveFromTrash","maxCost":5,"filter":{"trait":"エッグヘッド"}}]},
  "OP11-106": {"onPlay":[{"op":"lifeToHand"},{"op":"ko","side":"opp","maxCost":5,"count":1,"optional":true}]},
  "OP06-106": {"onPlay":[{"op":"lifeToHand"},{"op":"handToLife"}]},
  "P-096": {"onPlay":[{"op":"draw","n":1},{"op":"discardOwn","n":1}],"act":{"label":"「ナミ」にレストのドン付与","cost":{},"fx":[{"op":"donAttach","target":"leader","n":1}]}},
  "OP15-052": {"static":[{"op":"leaveProtect","pay":"charToBottom"}]},
  "OP06-104": {"onKO":[{"op":"cond","check":"oppLife<=3","then":[{"op":"lifeAddFromDeck","n":1}]}],"trigger":[{"op":"cond","check":"oppLife<=3","then":[{"op":"playSelf"}]}]},
  "OP07-054": {"onPlay":[{"op":"draw","n":1}]},
  "OP09-095": {"act":{"label":"黒ひげをサーチ","cost":{"restSelf":true,"don":1},"fx":[{"op":"search","look":5,"filter":{"trait":"黒ひげ海賊団"}}]}},
  "OP16-110": {"onKO":[{"op":"draw","n":1},{"op":"restChar","side":"opp","maxCost":6,"count":1,"optional":true}],"trigger":[{"op":"draw","n":1},{"op":"restChar","side":"opp","maxCost":6,"count":1,"optional":true}]},
  "OP16-103": {"onKO":[{"op":"cond","check":{"and":["oppTurn","leaderBH"]},"then":[{"op":"draw","n":1},{"op":"powerMod","side":"opp","amount":-3000,"count":1,"includeLeader":true,"optional":true}]}]},
  "OP16-119": {"onPlay":[{"op":"lifeAddChoose","look":3}]},
  "OP16-108": {"onPlay":[{"op":"discardCost","count":1,"then":[{"op":"trashToLife","maxCost":6,"trait":"黒ひげ海賊団","optional":true,"faceUp":true}]}],"trigger":[{"op":"draw","n":2}]},
  "OP12-112": {"trigger":[{"op":"cond","check":"leaderMulti","then":[{"op":"draw","n":2}]}]},
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
  "OP14-019": {"main":{"fx":[{"op":"search","look":4,"filter":{"or":[{"traitIncludes":"超新星"},{"traitIncludes":"麦わらの一味"}]},"count":1}]}},
  // OP14-022: 【自分のターン終了時】リーダーが《FILM》か《麦わら》ならドン2アクティブ
  "OP14-022": {"onTurnEnd":[{"op":"cond","check":{"or":[{"leaderTrait":"FILM"},{"leaderTrait":"麦わらの一味"}]},"then":[{"op":"donActivate","n":2}]}]},
  // OP14-023: 【自分のターン終了時】このキャラをアクティブにする
  "OP14-023": {"onTurnEnd":[{"op":"activateOwnChar","target":"self"}]},
  // OP14-043: 【登場時】手札からコスト3以下の《魚人族》か《人魚族》1枚を登場 ／【KO時】1ドロー
  "OP14-043": {"onPlay":[{"op":"playCharFromHand","maxCost":3,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]},"count":1,"optional":true}],"onKO":[{"op":"draw","n":1}]},
  // OP14-050: 【登場時】リーダーが《魚人族》なら1ドロー
  "OP14-050": {"onPlay":[{"op":"cond","check":{"leaderTrait":"魚人族"},"then":[{"op":"draw","n":1}]}]},
  // OP14-057: 【メイン】自《魚人族》か《人魚族》のリーダーとキャラすべてを このターン中 +1000
  "OP14-057": {"main":{"fx":[{"op":"powerMod","side":"self","all":true,"leader":true,"amount":1000,"filter":{"or":[{"traitIncludes":"魚人族"},{"traitIncludes":"人魚族"}]}}]}},
  // OP14-059: 【メイン】リーダーが「ジンベエ」で手札2枚以下なら2ドロー
  "OP14-059": {"main":{"fx":[{"op":"cond","check":{"and":[{"leaderNameIncludes":"ジンベエ"},{"selfHandAtMost":2}]},"then":[{"op":"draw","n":2}]}]}},
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
  "OP14-018": {"counter":{"cost":0,"fx":[{"op":"cond","check":{"selfChar":{"minEffPower":8000}},"then":[{"op":"counterBuff","amount":4000}]}]}},
  // OP14-036: 【カウンター】自分のカード1枚をレストにできる：リーダーかキャラ1枚を このバトル中+4000
  "OP14-036": {"counter":{"cost":0,"fx":[{"op":"restOwnAsCost","then":[{"op":"counterBuff","amount":4000}]}]}},
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
  "OP09-093": {"onPlay":[{"op":"cond","check":"leaderBH","then":[{"op":"negateEffect"}]}]},
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
  "OP16-001": {"act":{"label":"パワー8000以上のルフィか白ひげに【速攻】","cost":{},"fx":[{"op":"giveKeyword","target":"chooseOwn","kw":"rush","duration":"turn","filter":{"minPower":8000,"or":[{"name":"モンキー・D・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]}}]}},
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
  "OP16-043": {"onKO":[{"op":"restOwnAsCost","filter":{"traitIncludes":"ドレスローザ","or":[{"type":"LEADER"},{"type":"STAGE"}]},"then":[]}]},
  "OP16-044": {"static":[{"op":"staticKeyword","kw":"blocker"}]},
  "OP16-045": {"static":[{"op":"staticKeyword","kw":"blocker"}],"onPlay":[{"op":"bounceOwnCharCost","filter":{"minCost":2},"then":[]}]},
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
  "OP16-118": {"static":[{"op":"handCounterBuff","filter":{"type":"CHAR","power":8000},"amount":2000}],"onPlay":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]},"optional":true}],"onKO":[{"op":"search","look":5,"count":1,"filter":{"or":[{"name":"モンキー・Ｄ・ルフィ"},{"traitIncludes":"白ひげ海賊団"}]},"optional":true}]}
};
