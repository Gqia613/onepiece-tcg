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
  "PRB02-015": {"static":[{"op":"staticKeyword","kw":"blocker","cond":"leaderBH"},{"op":"staticCost","amount":4,"cond":"leaderBH"}],"onKO":[{"op":"cond","check":"leaderBH","then":[{"op":"ko","side":"opp","filter":{"maxBaseCost":4},"count":1,"optional":true}]}]},
  "OP13-043": {"onPlay":[{"op":"cond","check":"life<=3","then":[{"op":"draw","n":2},{"op":"discardOwn","n":1},{"op":"donAttach","target":"leader","n":1}]}]},
  "OP13-054": {"onPlay":[{"op":"bounce","side":"opp","maxCost":5,"count":1},{"op":"donAttach","target":"leader","n":1}],"static":[{"op":"condBuff","cond":"donX1Self","power":1000}]},
  "ST23-001": {"onPlay":[{"op":"deckBottom","side":"opp","maxCost":6,"count":1,"condLeader":"leaderRB"}]},
  "OP08-047": {"onPlay":[{"op":"bounceOwnCharCost","excludeSelf":true,"then":[{"op":"bounce","side":"any","maxCost":6,"count":1,"optional":true}]}]},
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
  /* ===== OP14 バッチ4（新op swapPower/addCostBuff-all を使用） ===== */
  // OP14-009: 【速攻】(text) 【相手のアタック時】【ターン1回】手札2枚捨て：リーダーと自キャラ1枚の元々パワーをこのバトル中入れ替える
  "OP14-009": {"onOppAttack":[{"op":"discardCost","count":2,"once":"turn","then":[{"op":"swapPower","withLeader":true,"battle":true}]}]},
  // OP14-017: 【メイン】相手の元々パワー9000以下のキャラ2枚の元々パワーをこのターン中入れ替える
  "OP14-017": {"main":{"fx":[{"op":"swapPower","filter":{"maxPower":9000}}]}},
  // OP14-082: 【KO時】自《スリラーバーク海賊団》すべてを次相手エンド終了までコスト+4
  "OP14-082": {"onKO":[{"op":"addCostBuff","side":"self","all":true,"amount":4,"duration":"untilNextEnd","filter":{"traitIncludes":"スリラーバーク海賊団"}}]},
  // OP14-021: 【自分のターン中】このキャラがレストになった時、ライフ上1枚を手札に加えられる：相手のレストのキャラ/ステージ1枚を次リフレッシュでアクティブにしない
  "OP14-021": {"onSelfRested":[{"op":"lifeCost","action":"toHand","then":[{"op":"lock","side":"opp","restedOnly":true,"includeStage":true,"count":1,"optional":true}]}]},
  // OP14-061: 【ターン1回】《ドンキ》が相手効果で場を離れる場合、代わりにドン1枚をドンデッキへ ／【アタック時】ドン‼-1：相手1枚-2000
  "OP14-061": {"static":[{"op":"leaveProtect","pay":"donToDeck","targetFilter":{"traitIncludes":"ドンキホーテ海賊団"},"once":"turn"}],"onAttack":[{"op":"donMinus","n":1},{"op":"powerMod","side":"opp","amount":-2000,"count":1,"optional":true}]},
  // OP14-069: 【登場時】ドン‼-3：二択（ドンキならコスト8以下KO ／ 相手コスト7以下3枚を次相手エンドまでレスト不可）
  "OP14-069": {"onPlay":[{"op":"donMinus","n":3},{"op":"chooseOption","options":[{"label":"ドンキならコスト8以下KO","fx":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"ko","side":"opp","maxCost":8,"count":1,"optional":true}]}]},{"label":"コスト7以下3枚レスト不可","fx":[{"op":"restImmune","side":"opp","maxCost":7,"count":3,"duration":"untilNextEnd","optional":true}]}]}]},
  // OP14-076: 【メイン】ドン2レスト：ドンキならドンデッキからレスト追加 ／【カウンター】リーダーをこのバトル中+3000
  "OP14-076": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"donFromDeck","n":1,"mode":"rest"}]}]}]},"counter":{"cost":0,"fx":[{"op":"leaderBuff","amount":3000,"duration":"battle"}]}},
  // OP14-078: 【カウンター】ドン‼-1：ドンキならリーダーかキャラ1枚をこのバトル中+4000（+2000→+2000）
  "OP14-078": {"counter":{"cost":0,"fx":[{"op":"donMinus","n":1},{"op":"cond","check":{"leaderTrait":"ドンキホーテ海賊団"},"then":[{"op":"counterBuff","amount":4000}]}]}},
  /* ===== OP14 バッチ5（既存opのみ・src非干渉） ===== */
  // OP14-085 / 089: 【KO時】2ドロー＋手札2枚捨て
  "OP14-085": {"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  "OP14-089": {"onKO":[{"op":"draw","n":2},{"op":"discardOwn","n":2}]},
  // OP14-091: 【KO時】手札orトラッシュから「ベンサム」以外のコスト5以下《B・W》1枚を登場
  "OP14-091": {"onKO":[{"op":"playFromHandOrTrash","filter":{"maxCost":5,"traitIncludes":"B・W","nameExcludes":"ボン・クレー"}}]},
  // OP14-093: 【ブロッカー】(text) 【KO時】トラッシュからコスト8以下《B・W》1枚を手札へ
  "OP14-093": {"onKO":[{"op":"trashToHand","filter":{"maxCost":8,"traitIncludes":"B・W"},"count":1,"optional":true}]},
  // OP14-097: 【メイン】デッキ上3枚から《スリラーバーク》1枚を手札へ、残りトラッシュ
  "OP14-097": {"main":{"fx":[{"op":"search","look":3,"filter":{"traitIncludes":"スリラーバーク海賊団","nameExcludes":"早くおれを"},"count":1,"rest":"trash"}]}},
  // OP14-099: 【メイン】デッキ上3枚から《B・W》1枚を手札へ、残りトラッシュ
  "OP14-099": {"main":{"fx":[{"op":"search","look":3,"filter":{"traitIncludes":"B・W","nameExcludes":"不服か"},"count":1,"rest":"trash"}]}},
  // OP14-100: 【KO時】デッキ上3枚から《スリラーバーク》1枚を手札へ
  "OP14-100": {"onKO":[{"op":"search","look":3,"filter":{"traitIncludes":"スリラーバーク海賊団"},"count":1}]},
  // OP14-111: 【登場時】/【KO時】相手コスト6以下1枚を次相手エンド終了までアタック不可
  "OP14-111": {"onPlay":[{"op":"setAttackBan","side":"opp","maxCost":6,"duration":"untilNextEnd","count":1,"optional":true}],"onKO":[{"op":"setAttackBan","side":"opp","maxCost":6,"duration":"untilNextEnd","count":1,"optional":true}]},
  // OP14-116: 【カウンター】リーダーかキャラ1枚+2000→手札のコスト4以下《アマゾン・リリー》/《九蛇》1枚を登場
  "OP14-116": {"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":2000},{"op":"playCharFromHand","maxCost":4,"filter":{"or":[{"traitIncludes":"アマゾン・リリー"},{"traitIncludes":"九蛇海賊団"}]},"count":1,"optional":true}]}},
  // OP14-117: 【カウンター】自《スリラーバーク》のリーダーかキャラ1枚を このバトル中+3000
  "OP14-117": {"counter":{"cost":0,"fx":[{"op":"counterBuff","amount":3000}]}},
  // OP14-118: 【カウンター】自ライフ2枚以下なら相手のアクティブキャラ1枚を このターン アタック不可
  "OP14-118": {"counter":{"cost":0,"fx":[{"op":"cond","check":"life<=2","then":[{"op":"setAttackBan","side":"opp","filter":{"activeOnly":true},"count":1,"optional":true}]}]}},
  // OP14-096: 【メイン】ドン2レスト：相手コスト5以下1枚を効果無効 ／【カウンター】トラッシュ10以上ならリーダーかキャラ1枚+4000
  "OP14-096": {"main":{"fx":[{"op":"restDonCost","n":2,"then":[{"op":"negateChoose","maxCost":5,"optional":true}]}]},"counter":{"cost":0,"fx":[{"op":"cond","check":{"trashAtLeast":10},"then":[{"op":"counterBuff","amount":4000}]}]}},
  // OP14-094: 【ブロッカー】(text) 【登場時】コスト0か8以上のキャラがいれば2ドロー＋手札1捨て
  "OP14-094": {"onPlay":[{"op":"cond","check":{"or":[{"selfChar":{"maxCost":0}},{"selfChar":{"minCost":8}}]},"then":[{"op":"draw","n":2},{"op":"discardOwn","n":1}]}]},
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
  "OP14-110": {"onKO":[{"op":"reviveFromTrash","maxCost":4,"needsTrigger":true,"filter":{"nameExcludes":"ホグバック"}}]},
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
  "OP14-115": {"onKO":[{"op":"cond","check":{"oppTurn":true},"then":[{"op":"lifeAddFromDeck","n":1},{"op":"selfDamage","n":1}]}]},
  // OP14-090 ダズ: コスト0か8以上のキャラがいれば登場ターンにキャラへアタック可(rushChar) ／【登場時】相手コスト0キャラ1枚までレスト
  "OP14-090": {"static":[{"op":"staticKeyword","kw":"rushChar","cond":{"or":[{"selfChar":{"maxCost":0}},{"selfChar":{"minCost":8}},{"oppChar":{"maxCost":0}},{"oppChar":{"minCost":8}}]}}],"onPlay":[{"op":"restChar","side":"opp","filter":{"cost":0},"count":1,"optional":true}]},
  // OP14-024 錦えもん: 【登場時】ドン3アクティブ→このターン登場不可 ／【KO時】相手のカード1枚までレスト
  "OP14-024": {"onPlay":[{"op":"donActivate","n":3},{"op":"setSummonBan"}],"onKO":[{"op":"restChar","side":"opp","count":1,"optional":true,"includeLeader":true}]},
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
  "OP13-002": {"onOppAttack":[{"op":"discardCost","count":1,"once":"turn","then":[{"op":"powerMod","side":"opp","includeLeader":true,"amount":-2000,"battle":true,"count":1,"optional":true}]}]},
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
  "OP12-099": {"onLifeLeave":{"when":"selfTurn","fx":[{"op":"draw","n":1}]}},
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
  "OP11-083": {"onPlay":[{"op":"discardCost","count":2}]},
  // OP11-084 クザン(黒): 【登場時】デッキ上3枚トラッシュ ／【アタック時】海軍のリーダーかキャラ1枚がアクティブにもアタック可
  "OP11-084": {"onPlay":[{"op":"deckToTrash","n":3}],"onAttack":[{"op":"giveKeyword","target":"chooseOwnL","kw":"attackActive","duration":"turn","filter":{"traitIncludes":"海軍"}}]},
  // OP11-085 黒炭オロチ: 【登場時】トラッシュからコスト5以下のSMILE1枚を手札に
  "OP11-085": {"onPlay":[{"op":"trashToHand","count":1,"optional":true,"filter":{"maxCost":5,"traitIncludes":"SMILE"}}]},
  // OP11-086 コリブー: 【登場時】手札1枚を捨てる ／【起動メイン】自身トラッシュ：トラッシュからコスト4以下「カリブー」1枚を登場
  "OP11-086": {"onPlay":[{"op":"discardCost","count":1}],"act":{"label":"自身トラッシュ:コスト4以下カリブー登場","cost":{},"fx":[{"op":"trashSelfCost","then":[{"op":"reviveFromTrash","maxCost":4,"filter":{"nameIncludes":"カリブー"}}]}]}},
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
  "OP11-108": {"onPlay":[{"op":"cond","check":{"leaderNameIncludes":"しらほし"},"then":[{"op":"lifeFlipDownCost","then":[{"op":"draw","n":2},{"op":"discardCost","count":1}]}]}]},
  // OP11-109 パッパグ: 【登場時】自分の「ケイミー」がいれば 2ドロー＋手札2枚を捨てる
  "OP11-109": {"onPlay":[{"op":"cond","check":{"selfChar":{"nameIncludes":"ケイミー"}},"then":[{"op":"draw","n":2},{"op":"discardCost","count":2}]}]},
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
  "OP10-018": {"counter":{"cost":0,"fx":[{"op":"powerMod","side":"self","leader":true,"amount":3000,"battle":true,"count":1,"optional":true},{"op":"powerMod","side":"opp","leader":true,"amount":-2000,"duration":"turn","count":1,"optional":true}]}},
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
  "OP10-025": {"onPlay":[{"op":"cond","check":{"selfRestedCharsAtLeast":2},"then":[{"op":"draw","n":3},{"op":"discardCost","count":2}]}]},
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
  // OP10-037 リム: このキャラが相手効果で離れる場合 代わりにODYSSEY1枚をレスト ／【自分のターン終了時】ODYSSEY1枚をアクティブ
  "OP10-037": {"static":[{"op":"leaveProtect","targetSelf":true,"once":"turn","pay":"restOwnCards","n":1,"filter":{"traitIncludes":"ODYSSEY"}}],"onTurnEnd":[{"op":"activateOwnChar","count":1,"filter":{"restedOnly":true,"traitIncludes":"ODYSSEY"}}]},
  // OP10-038 ロロノア・ゾロ: 【相手のターン中】レストのキャラ2枚以上で +2000
  "OP10-038": {"static":[{"op":"condBuff","cond":{"oppTurn":true,"selfRestedCharsAtLeast":2},"power":2000}]},
  // OP10-039 ゴムゴムの龍火炎銃巻き星: 【メイン】ODYSSEYリーダーなら デッキ上5枚からODYSSEYキャラ2枚を手札に
  "OP10-039": {"main":{"fx":[{"op":"cond","check":{"leaderTraitIncludes":"ODYSSEY"},"then":[{"op":"search","look":5,"count":2,"filter":{"traitIncludes":"ODYSSEY","type":"CHAR"},"optional":true}]}]}},
  // OP10-040 弱ェ奴は死に方も選べねェ: 【メイン】/【カウンター】相手のレストのコスト7以下1枚KO
  "OP10-040": {"main":{"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":7},"count":1,"optional":true}]},"counter":{"cost":0,"fx":[{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":7},"count":1,"optional":true}]}},
  // OP10-041 ラジオナイフ: 【メイン】相手コスト6以下1枚レスト→相手のレストのコスト5以下1枚KO
  "OP10-041": {"main":{"fx":[{"op":"restChar","side":"opp","filter":{"maxCost":6},"count":1,"optional":true},{"op":"ko","side":"opp","filter":{"restedOnly":true,"maxCost":5},"count":1,"optional":true}]}}
};
