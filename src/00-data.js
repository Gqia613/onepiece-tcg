    "use strict";
    /* =========================================================================
       ONE PIECE カードゲーム 対戦シミュレーター  (スタンダードレギュレーション)
       - ルールエンジンは公式ルールに準拠（フェイズ/ドン/ライフ=手札/バトル/トリガー/キーワード）
       - カード効果はデータ駆動。主要効果を実装、複雑なものは簡易実装フラグ付き
       ========================================================================= */

    /* ---------- 公式カード画像URL ---------- */
    /* 公式カード画像。サイト側のクロスサイト埋め込み制限を回避するため画像プロキシ(weserv)を経由。
       失敗時は公式URL直 → それも失敗ならテキスト表示の3段フォールバック。 */
    const IMG_RAW = no => `https://www.onepiece-cardgame.com/images/cardlist/card/${no}.png`;
    const IMG = no => `https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/images/cardlist/card/${no}.png&w=320`;
    /* ライフ用：横向き(左=カード上部)に回転した表面画像 */
    const IMG_ROT = no => `https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/images/cardlist/card/${no}.png&ro=270&w=320`;

    /* ---------- 色 ---------- */
    const COLOR_HEX = { 赤: 'var(--c-red)', 緑: 'var(--c-green)', 青: 'var(--c-blue)', 紫: 'var(--c-purple)', 黒: 'var(--c-black)', 黄: 'var(--c-yellow)' };

    /* =========================================================================
       カードライブラリ
       フィールド: no,name,color[],cost,power,counter,type,traits[]
       keywords: rush,blocker,doubleAttack,banish
       condBlocker: 'don<=6' | 'donX1'(=自分のドン付与1以上) 等
       fx: { onPlay:[ops], onAttack:[ops], onKO:[ops], trigger:[ops], static:[ops],
             main:{don,fx:[ops]}(イベント), counter:{cost,fx:[ops]}(イベント/カウンター),
             act:{label,cost:{don,restSelf},fx:[ops]}(起動メイン) }
       simp:true で「簡易実装」表示
       leader: リーダー固有ロジックのキー
       ========================================================================= */
    const C = {}; // card library keyed by no
    function def(c) { C[c.no] = c; return c; }

    /* 効果(fx)は cards-fx.js に一元化済み。def() はメタ情報（コスト/パワー/特徴/リーダーキー/キーワード等）のみを定義する。 */

    /* ============================ 紫エネル (Tier1) ============================ */
    def({
      no: 'OP15-058', name: 'エネル', color: ['紫'], type: 'LEADER', life: 5, power: 5000, traits: ['空島'], donDeck: 6, leader: 'enel',
      text: 'ルール上ドン‼デッキは6枚。【起動メイン】【ターン1回】第2T以降:ドン‼1枚アクティブ+4枚レスト追加、キャラ1枚にレスト4枚付与。'
    });
    def({
      no: 'OP15-067', name: 'シュラ', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['空島', '神官'], condRush: 'don<=6', text: 'ドン6以下で【速攻】。【登場時】ドン-1:1ドロー'
    });
    def({
      no: 'OP15-061', name: 'オーム', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['空島', '神官'],
      text: '【登場時】ドン-1:1ドロー 【アタック時】ドン6以下:相手キャラ-1000'
    });
    def({
      no: 'OP15-066', name: 'サトリ', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['空島', '神官'],
      text: '【登場時】ドン-1:1ドロー 【アタック時】ドン6以下:デッキトップ2枚操作'
    });
    def({
      no: 'OP15-063', name: 'ゲダツ', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['空島', '神官'],
      text: '【登場時】ドン-1:1ドロー 【KO時】ドン6以下:相手パワー2000以下を1体KO'
    });
    def({
      no: 'OP12-071', name: 'シャーロット・プリン', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['ビッグ・マム海賊団'], text: '【登場時】デッキ上4枚からイベント1枚を手札に'
    });
    def({
      no: 'OP15-060', name: 'エネル', color: ['紫'], type: 'CHAR', cost: 6, power: 8000, traits: ['空島'],
      text: 'ドン6以下:相手効果で離れず+2000。【起動】ドン-1:【ブロッカー】獲得し手札1枚捨て'
    });
    def({
      no: 'OP15-118', name: 'エネル', color: ['紫'], type: 'CHAR', cost: 6, power: 8000, traits: ['空島'],
      text: 'ドン6以下:相手効果で離れず+2000。【登場時】デッキ上5枚から1枚手札に、手札1枚捨て'
    });
    def({
      no: 'OP15-076', name: '雷獣', color: ['紫'], type: 'EVENT', cost: 0, traits: ['空島'],
      text: '【メイン】ドン-1:1ドロー+相手キャラ-1000 【カウンター】エネルに+2000'
    });
    def({
      no: 'OP15-074', name: '放電', color: ['紫'], type: 'EVENT', cost: 0, traits: ['空島'],
      text: '【メイン】ドン-1:リーダーがエネルなら1ドロー、その後自キャラ1枚を次の相手エンドまでコスト+2 【カウンター】自分のエネル1枚を+2000'
    });
    def({
      no: 'OP15-075', name: '神の裁き', color: ['紫'], type: 'EVENT', cost: 0, traits: ['空島'],
      text: '【メイン】ドン-1:自リーダー/キャラ+1000、相手3000以下KO 【カウンター】+2000'
    });
    def({
      no: 'OP15-077', name: '雷龍', color: ['紫'], type: 'EVENT', cost: 0, traits: ['空島'],
      text: '【メイン】ドン-1:1ドロー+相手レスト6000以下を次もレスト固定'
    });
    def({
      no: 'OP15-078', name: '万雷', color: ['紫'], type: 'EVENT', cost: 0, traits: ['空島'],
      text: '【メイン】ドン-2:1ドロー+相手5000以下をレスト 【カウンター】+1000し1ドロー'
    });
    def({
      no: 'OP15-070', name: 'フザ', color: ['紫'], type: 'CHAR', cost: 3, power: 4000, counter: 1000, traits: ['動物', '空島'], text: '自分の「シュラ」すべてと自身は【ブロック不可】。【相手のターン中】自分の「シュラ」すべてと自身を元々のパワー6000にする'
    });
    def({
      no: 'OP15-069', name: 'ノラ', color: ['紫'], type: 'CHAR', cost: 1, power: 2000, counter: 2000, traits: ['動物', '空島'],
      text: '自分の元々パワー7000以下のキャラが相手効果で場を離れる時、代わりに自分の場のドン1枚をドンデッキに戻せる'
    });

    /* ============================ 赤青ルーシー (Tier2) ============================ */
    def({
      no: 'OP15-002', name: 'ルーシー', color: ['赤', '青'], type: 'LEADER', life: 4, power: 5000, traits: ['ドレスローザ', '革命軍'], leader: 'lucy',
      text: '【アタック時/相手のアタック時】手札のイベント/ステージを任意枚捨て、1枚につきリーダー+1000。【起動】コスト3以上イベント使用時:1ドロー'
    });
    def({
      no: 'OP15-040', name: 'ヴィオラ', color: ['青'], type: 'CHAR', cost: 1, power: 2000, counter: 2000, traits: ['ドレスローザ', 'ドンキホーテ海賊団'], text: '【登場時】デッキ上3枚からドレスローザ1枚を手札に'
    });
    def({
      no: 'OP15-053', name: 'レベッカ', color: ['青'], type: 'CHAR', cost: 1, power: 0, counter: 1000, traits: ['ドレスローザ'], condBlocker: 'donX1', text: 'ドン付与1以上で【ブロッカー】。【登場時】デッキ上3枚からドレスローザ1枚'
    });
    def({
      no: 'OP10-045', name: 'キャベンディッシュ', color: ['青'], type: 'CHAR', cost: 4, power: 6000, counter: 0, traits: ['美しき海賊団'], text: '【登場時】1ドロー、手札1枚をデッキ下'
    });
    def({
      no: 'OP15-047', name: 'サンジ', color: ['青'], type: 'CHAR', cost: 3, power: 4000, counter: 1000, blocker: true, traits: ['ドレスローザ', '麦わらの一味'], text: '【ブロッカー】【登場時】自キャラ1枚に【ブロック不可】'
    });
    def({
      no: 'OP15-044', name: 'コアラ', color: ['青'], type: 'CHAR', cost: 3, power: 2000, counter: 1000, blocker: true, traits: ['ドレスローザ', '革命軍'], text: '【ブロッカー】【KO時】デッキ上3枚からドレスローザのイベント1枚'
    });
    def({
      no: 'OP15-046', name: 'サボ', color: ['青'], type: 'CHAR', cost: 7, power: 9000, blocker: true, traits: ['ドレスローザ', '革命軍'], text: '【ブロッカー】【登場時】手札のドレスローザのイベント1枚を発動'
    });
    def({
      no: 'OP15-021', name: '見てろよ!エース!!!', color: ['赤'], type: 'EVENT', cost: 4, traits: ['ドレスローザ', '革命軍'],
      text: 'トラッシュにイベント4枚以上でコスト-3。【メイン/カウンター】相手キャラ-3000'
    });
    def({
      no: 'OP15-054', name: '誰にも渡さねェよ!“あいつ”の形見だ', color: ['青'], type: 'EVENT', cost: 4, traits: ['ドレスローザ', '革命軍'],
      text: '【メイン】2ドロー手札1枚捨て、コスト4以下のドレスローザを登場'
    });
    def({
      no: 'OP04-056', name: 'ゴムゴムの業火拳銃', color: ['青'], type: 'EVENT', cost: 6, traits: ['麦わらの一味'],
      text: '【メイン】相手コスト7以下を手札に戻す 【カウンター】+2000'
    });
    def({
      no: 'OP15-020', name: '火拳', color: ['赤'], type: 'EVENT', cost: 7, traits: ['ドレスローザ', '革命軍'],
      text: '【メイン】自リーダー+3000、相手キャラ-8000、手札2枚捨ててパワー0以下をKO'
    });
    def({
      no: 'OP15-056', name: '“メラメラの実”はおれが食っていいか？', color: ['青'], type: 'EVENT', cost: 7, traits: ['ドレスローザ', '革命軍'],
      text: '【メイン】2ドロー、リーダー「ルーシー」に【ダブルアタック】+3000'
    });
    def({
      no: 'OP15-057', name: 'ドレスローザ王国', color: ['青'], type: 'STAGE', cost: 1, traits: ['ドレスローザ'], text: '【登場時】ドレスローザリーダーなら1ドロー（ルーシーのカウンター資源にも）'
    });
    def({
      no: 'OP15-042', name: 'キュロス', color: ['青'], type: 'CHAR', cost: 3, power: 5000, counter: 0, traits: ['ドレスローザ'],
      text: '【登場時】手札1枚を捨てる:リーダーが「レベッカ」なら速攻 【KO時】このカードをトラッシュから手札に加える'
    });

    /* ============================ 赤青エース (Tier2) ============================ */
    def({
      no: 'OP13-002', name: 'ポートガス・D・エース', color: ['赤', '青'], type: 'LEADER', life: 3, power: 6000, traits: ['白ひげ海賊団'], leader: 'ace',
      text: '【相手のアタック時】【ターン1】手札1枚捨て:相手1枚-2000。【ドン×1】【ターン1】ダメージ受けた時/自分の元6000以上KO時:1ドロー'
    });
    def({
      no: 'OP13-016', name: 'モンキー・D・ガープ', color: ['赤'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['海軍'], text: '【登場時】デッキ上4枚からコスト3以上1枚を手札に'
    });
    def({
      no: 'ST22-002', name: 'イゾウ', color: ['青'], type: 'CHAR', cost: 1, power: 0, counter: 1000, traits: ['ワノ国', '元白ひげ海賊団'], text: '【登場時】デッキ上5枚から白ひげ海賊団1枚を手札に'
    });
    def({
      no: 'PRB02-008', name: 'マルコ', color: ['青'], type: 'CHAR', cost: 4, power: 6000, blocker: true, traits: ['ワノ国', '元白ひげ海賊団'], text: '【ブロッカー】【KO時】2ドロー'
    });
    def({
      no: 'OP13-043', name: 'お玉', color: ['青'], type: 'CHAR', cost: 1, power: 0, traits: ['ワノ国'],
      text: '【登場時】ライフ3以下:2ドロー手札1枚捨て、リーダーにドン1付与'
    });
    def({
      no: 'OP13-054', name: 'ヤマト', color: ['青'], type: 'CHAR', cost: 5, power: 6000, traits: ['ワノ国'],
      text: '【登場時】相手コスト5以下を手札に戻す、リーダーにドン1付与。【ドン×1】+1000'
    });
    def({
      no: 'ST23-001', name: 'ウタ', color: ['赤'], type: 'CHAR', cost: 6, costMod: { cond: 'leaderRB', amount: -4 }, power: 4000, blocker: true, traits: ['FILM'],
      text: 'リーダー赤/青でコスト-4。【ブロッカー】【登場時】相手コスト6以下をデッキ下'
    });
    def({
      no: 'OP08-047', name: 'ジョズ', color: ['青'], type: 'CHAR', cost: 6, costMod: { cond: 'leaderWB', amount: -4 }, power: 7000, blocker: true, traits: ['白ひげ海賊団'], text: '白ひげリーダーでコスト-4。【ブロッカー】【登場時】相手コスト4以下を手札に戻す'
    });
    def({
      no: 'OP13-042', name: 'エドワード・ニューゲート', color: ['青'], type: 'CHAR', cost: 10, power: 12000, blocker: true, traits: ['四皇', '白ひげ海賊団'],
      text: '【ブロッカー】【登場時】2ドロー手札1枚捨て、リーダーとキャラにドン2ずつ付与'
    });
    def({
      no: 'OP08-043', name: 'エドワード・ニューゲート', color: ['赤'], type: 'CHAR', cost: 10, power: 12000, traits: ['四皇', '白ひげ海賊団'],
      text: '【登場時】自リーダー+2000(次の自ターンまで)。【ドン×2】【アタック時】相手3000以下KO'
    });
    def({
      no: 'OP09-118', name: 'ゴール・D・ロジャー', color: ['赤'], type: 'CHAR', cost: 10, power: 13000, rush: true, traits: ['ロジャー海賊団'],
      text: '【速攻】アタック時ブロッカー不可。【登場時】自ライフ上1枚を手札に'
    });
    def({
      no: 'EB02-006', name: 'ヤマト', color: ['赤'], type: 'CHAR', cost: 6, power: 7000, traits: ['ワノ国'],
      text: '【起動】【ターン1】リーダーにドン1付与し、自身【速攻】'
    });
    def({
      no: 'ST22-015', name: 'おれァ“白ひげ”だァア!!!!', color: ['青'], type: 'EVENT', cost: 8, traits: ['白ひげ海賊団'],
      text: '【メイン】手札の「エドワード・ニューゲート」を登場（登場時効果なし）'
    });
    def({
      no: 'OP13-057', name: '"力"に屈したら男に生まれた意味がねェだろう', color: ['青'], type: 'EVENT', cost: 1, traits: ['白ひげ海賊団'],
      text: '【メイン】ライフ1以下:相手はリーダーへのアタックにブロッカー不可 【カウンター】+2000'
    });

    /* ============================ 青黄ナミ (Tier2) ============================ */
    def({
      no: 'OP11-041', name: 'ナミ', color: ['青', '黄'], type: 'LEADER', life: 4, power: 5000, traits: ['麦わらの一味'], leader: 'nami',
      text: '【ドン×1】【自分のターン中】自分のキャラが登場した時、1ドローし手札1枚をデッキ下（ターン1）'
    });
    def({
      no: 'OP11-054', name: 'ナミ', color: ['青'], type: 'CHAR', cost: 5, power: 6000, counter: 1000, blocker: true, traits: ['麦わらの一味'], text: '【ブロッカー】【登場時】3ドロー、手札2枚をデッキ上か下'
    });
    def({
      no: 'EB03-053', name: 'ナミ', color: ['黄'], type: 'CHAR', cost: 5, power: 6000, counter: 1000, traits: ['麦わらの一味'],
      text: '【登場時】リーダーにレストのドン1枚付与、相手ライフ3以上なら相手ライフ上1枚を手札に 【KO時】自ライフ上1枚を表向きにして手札からパワー6000以下を登場'
    });
    def({
      no: 'EB04-058', name: 'ボルサリーノ', color: ['黄'], type: 'CHAR', cost: 5, power: 6000, counter: 1000, blocker: true, traits: ['エッグヘッド', '海軍'],
      text: '【ブロッカー】【登場時】自分のライフが2枚以下ならデッキ上1枚をライフの上に加える'
    });
    def({
      no: 'OP14-103', name: 'グロリオーサ(ニョン婆)', color: ['黄'], type: 'CHAR', cost: 2, power: 0, counter: 1000, traits: ['アマゾン・リリー'], text: '【登場時】ライフの上か下から1枚を手札に加える:手札1枚までをライフの上に加える'
    });
    def({
      no: 'EB03-055', name: 'ニコ・ロビン', color: ['黄'], type: 'CHAR', cost: 7, power: 8000, traits: ['麦わらの一味'],
      text: '【登場時】自分のライフ上1枚をトラッシュにできる:リーダーが麦わらの一味ならデッキ上2枚をライフに加える 【相手のターン中】【KO時】相手に1ダメージ'
    });
    def({
      no: 'ST17-004', name: 'ボア・ハンコック', color: ['青'], type: 'CHAR', cost: 4, power: 6000, blocker: true, traits: ['王下七武海', '九蛇海賊団'],
      text: '【ブロッカー】【登場時】デッキ上3枚を見て好きな順で上か下に置き、その後王下七武海のリーダーかキャラ1枚にレストのドン1枚付与'
    });
    def({
      no: 'OP08-050', name: 'ナミュール', color: ['青'], type: 'CHAR', cost: 3, power: 2000, counter: 1000, blocker: true, traits: ['魚人族', '白ひげ海賊団'], text: '【ブロッカー】【登場時】カード2枚を引き、自分の手札2枚をデッキの上か下に置く'
    });
    def({
      no: 'OP06-101', name: 'おナミ', color: ['黄'], type: 'CHAR', cost: 2, power: 3000, counter: 1000, traits: ['麦わらの一味'],
      text: '【登場時】自分のリーダーかキャラ1枚は、このターン中【バニッシュ】を得る 【トリガー】相手のコスト5以下のキャラ1枚までをKO'
    });

    /* ============================ 青黄ハンコック (Tier3) ============================ */
    def({
      no: 'OP14-041', name: 'ボア・ハンコック', color: ['青', '黄'], type: 'LEADER', life: 4, power: 5000, traits: ['王下七武海', '九蛇海賊団'], leader: 'hancock',
      text: '相手のターン中に自分のキャラが登場した時、1ドロー 【ドン×1】自分の元々パワー5000以上のアマゾン・リリー/九蛇キャラがKOされた時、相手ライフ上1枚を手札に加えさせる'
    });
    def({
      no: 'OP14-105', name: 'ゴルゴン三姉妹', color: ['黄'], type: 'CHAR', cost: 6, power: 5000, counter: 2000, traits: ['王下七武海', '九蛇海賊団'],
      text: '【起動メイン】ターン1回 手札からアマゾン/九蛇3枚公開:リーダーとキャラ全てにレストのドン1枚ずつ付与 【トリガー】リーダーが九蛇なら登場'
    });
    def({
      no: 'OP14-104', name: 'ゲッコー・モリア', color: ['黄'], type: 'CHAR', cost: 8, power: 10000, traits: ['王下七武海', 'スリラーバーク海賊団'],
      text: '【登場時】トラッシュからコスト4以下のスリラーバーク1枚をライフ上に加えるか登場 【トリガー】トラッシュからコスト4以下のキャラ1枚を登場'
    });
    def({
      no: 'OP15-113', name: 'ロロノア・ゾロ', color: ['黄'], type: 'CHAR', cost: 4, power: 6000, counter: 0, traits: ['麦わらの一味'], text: '【登場時】自分の手札1枚を捨てられる:デッキの上から1枚をライフの上に加える'
    });
    def({
      no: 'OP14-112', name: 'ボア・ハンコック', color: ['黄'], type: 'CHAR', cost: 9, power: 10000, traits: ['王下七武海', '九蛇海賊団'],
      text: '【登場時】リーダーが王下七武海なら、デッキ上1枚をライフに加え、相手ライフ上1枚を相手の手札に加える 【トリガー】手札からパワー6000以下の【トリガー】持ちキャラ1枚を登場'
    });
    def({
      no: 'OP07-057', name: '芳香脚', color: ['青'], type: 'EVENT', cost: 2, traits: ['王下七武海', '九蛇海賊団'],
      text: '【メイン】自分の王下七武海のリーダーかキャラ1枚を+2000し、このターン中そのカードのアタックを相手はブロックできない 【トリガー】相手のコスト4以下のキャラ1枚を持ち主の手札に戻す'
    });
    def({
      no: 'OP14-114', name: 'ラン', color: ['黄'], type: 'CHAR', cost: 4, power: 5000, counter: 1000, traits: ['九蛇海賊団'],
      text: '【起動メイン】【ターン1回】自分の九蛇海賊団のリーダーかキャラ1枚にレストのドン1枚を付与 【トリガー】リーダーが九蛇なら、このカードを登場させる'
    });
    def({
      no: 'OP11-060', name: '式をブッ壊そう!!!', color: ['青'], type: 'EVENT', cost: 1, traits: ['麦わらの一味'],
      text: '【メイン】リーダーが多色なら、デッキ上5枚から「式をブッ壊そう!!!」以外の麦わらの一味1枚を手札に加え、残りをデッキの下 【トリガー】同じ効果'
    });
    def({
      no: 'OP14-107', name: 'シャクヤク', color: ['黄'], type: 'CHAR', cost: 6, power: 5000, counter: 2000, traits: ['アマゾン・リリー'],
      text: '【登場時】相手のライフが3枚以下の場合、カード2枚を引き、自分の手札2枚を捨てる 【トリガー】リーダーが九蛇なら、このカードを登場させる'
    });
    def({
      no: 'OP14-108', name: 'シルバーズ・レイリー', color: ['黄'], type: 'CHAR', cost: 6, power: 6000, counter: 1000, traits: ['元ロジャー海賊団'],
      text: '【登場時】自分のリーダーが多色で相手のライフが3枚以下の場合、相手の元々のパワー7000以下のキャラ1枚をKO 【トリガー】このカードの登場時効果を発動する（登場）'
    });
    def({
      no: 'OP14-113', name: 'マーガレット', color: ['黄'], type: 'CHAR', cost: 3, power: 5000, counter: 0, traits: ['アマゾン・リリー'],
      text: '【登場時】デッキ上5枚からアマゾン・リリーか九蛇海賊団1枚を手札に加え、残りをデッキの下、手札1枚を捨てる 【トリガー】リーダーが九蛇なら登場'
    });
    def({
      no: 'OP12-119', name: 'バーソロミュー・くま', color: ['黄'], type: 'CHAR', cost: 6, power: 7000, counter: 1000, traits: ['王下七武海', '革命軍'],
      text: '【登場時】手札1枚を捨てて、デッキ上1枚をライフに加える 【相手のターン中】【KO時】デッキ上1枚をライフに加える'
    });
    def({
      no: 'OP07-115', name: '助けてクエーサ～!!!', color: ['黄'], type: 'EVENT', cost: 1, traits: ['科学者', 'エッグヘッド'],
      text: '【カウンター】自分のライフが2枚以下の場合、自分のリーダーかキャラ1枚を+3000 【トリガー】トラッシュからコスト5以下のエッグヘッド1枚を登場'
    });
    def({
      no: 'OP11-106', name: 'ゼウス', color: ['黄'], type: 'CHAR', cost: 2, power: 2000, counter: 2000, traits: ['ホーミーズ', 'ビッグ・マム海賊団'],
      text: '【登場時】自分のライフの上か下から1枚を手札に加えることができる：相手のコスト5以下のキャラ1枚までを、KOする'
    });
    def({
      no: 'OP06-106', name: '光月日和', color: ['黄'], type: 'CHAR', cost: 2, power: 0, counter: 2000, traits: ['ワノ国', '光月家'],
      text: '【登場時】自分のライフの上か下から1枚を手札に加えることができる：自分の手札1枚までを、ライフの上に加える'
    });
    def({
      no: 'P-096', name: '少女', color: ['青'], type: 'CHAR', cost: 2, power: 0, counter: 1000, traits: ['シャボンディ諸島'],
      text: '【登場時】カード1枚を引き、自分の手札1枚を捨てる 【起動メイン】ターン1回：自分の「ナミ」1枚にレストのドン1枚までを付与'
    });
    def({
      no: 'OP15-052', name: 'レオ', color: ['青'], type: 'CHAR', cost: 1, power: 2000, counter: 2000, traits: ['トンタッタ族', 'ドレスローザ'],
      text: '自分の元々のパワー7000以下のキャラが相手の効果で場を離れる場合、代わりに自分のキャラ1枚を持ち主のデッキの下に置くことができる'
    });
    def({
      no: 'OP06-104', name: '菊之丞', color: ['黄'], type: 'CHAR', cost: 4, power: 6000, counter: 0, traits: ['ワノ国', '赤鞘九人男'],
      text: '【KO時】相手のライフが3枚以下の場合、デッキ上1枚をライフに加える 【トリガー】相手のライフが3枚以下の場合、このカードを登場させる'
    });
    def({
      no: 'OP15-119', name: 'モンキー・D・ルフィ', color: ['黄'], type: 'CHAR', cost: 5, power: 7000, counter: 0, traits: ['空島', '麦わらの一味'], condRush: 'don>=6',
      text: '自分の場のドン6枚以上で【速攻】。相手がイベントかブロッカーを発動した時、自分のライフ上1枚を公開しコスト1につきこのターン中パワー+1000'
    });
    def({
      no: 'OP07-054', name: 'マーガレット', color: ['青'], type: 'CHAR', cost: 3, power: 2000, counter: 0, blocker: true, traits: ['アマゾン・リリー'], text: '【ブロッカー】【登場時】カード1枚を引く'
    });
    def({
      no: 'OP14-101', name: 'オーズ', color: ['黄'], type: 'CHAR', cost: 8, power: 10000, counter: 1000, traits: ['巨人族', 'スリラーバーク海賊団'],
      text: '（テキストなし）'
    });

    /* =========================================================================
       デッキ定義（各50枚 / ドンデッキ10・エネルのみ6）
       ========================================================================= */
    /* =========================================================================
       黒黄ティーチ (OP16 / Tier1)  ※公式カードリスト検証
       実テキスト準拠: リーダーOP16-080 / ドクQ OP16-109 / バスコ OP16-110 / シリュウ OP16-108 /
                       OP16-119 ティーチ / OP09-093 ティーチ / ジーザス OP09-086 / ハチノス OP09-099 / ゼハハ OP16-116
       近似(simp): ヴァン・オーガー減少値 / カタリーナ / ボルサリーノ / おれの時代だ / ラフィット / ベビー5
       ========================================================================= */
    def({
      no: 'OP16-080', name: 'マーシャル・Ｄ・ティーチ', color: ['黒', '黄'], type: 'LEADER', life: 4, power: 5000, traits: ['王下七武海', '黒ひげ海賊団'], leader: 'teach',
      text: '【相手のターン中】自分のキャラ全体コスト+1 【相手のアタック時】【ターン1回】手札のトリガー1枚を捨て、アタックの対象をこのリーダーか黒ひげ海賊団キャラに変更'
    });
    def({
      no: 'OP09-095', name: 'ラフィット', color: ['黒'], type: 'CHAR', cost: 1, power: 1000, counter: 1000, traits: ['黒ひげ海賊団'],
      text: '【起動メイン】自分のドン1枚とこのキャラをレスト:デッキ上5枚から黒ひげ1枚を手札に加え、残りをデッキの下'
    });
    def({
      no: 'OP16-110', name: 'バスコ・ショット', color: ['黄'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['インペルダウン', '黒ひげ海賊団'],
      text: '【KO時】1ドローし相手コスト6以下1枚をレスト 【トリガー】同効果'
    });
    def({
      no: 'OP16-103', name: 'ヴァン・オーガー', color: ['黄'], type: 'CHAR', cost: 1, power: 2000, counter: 1000, traits: ['黒ひげ海賊団'],
      text: '【相手のターン中】【KO時】リーダーが黒ひげなら1ドロー、相手のリーダーかキャラ1枚をこのターン中パワー-3000'
    });
    def({
      no: 'OP16-119', name: 'マーシャル・Ｄ・ティーチ', color: ['黄'], type: 'CHAR', cost: 8, power: 10000, traits: ['王下七武海', '黒ひげ海賊団'],
      text: '【登場時】デッキ上3枚から1枚をライフの上に加える'
    });
    def({
      no: 'OP16-108', name: 'シリュウ', color: ['黄'], type: 'CHAR', cost: 6, power: 8000, traits: ['インペルダウン', '黒ひげ海賊団'],
      text: '【登場時】手札1枚を捨て、トラッシュのコスト6以下黒ひげ1枚をライフ上に追加 【トリガー】2ドロー'
    });
    def({
      no: 'OP12-112', name: 'ベビー５', color: ['黄'], type: 'CHAR', cost: 4, power: 5000, counter: 2000, traits: ['ドンキホーテ海賊団'],
      text: '【トリガー】自分のリーダーが多色の場合、カード2枚を引く'
    });
    def({
      no: 'OP09-086', name: 'ジーザス・バージェス', color: ['黒'], type: 'CHAR', cost: 4, power: 5000, counter: 1000, traits: ['黒ひげ海賊団'],
      text: 'このキャラは相手の効果ではKOされない。リーダーが黒ひげ海賊団なら自分のトラッシュ4枚につきパワー+1000'
    });
    def({
      no: 'OP09-093', name: 'マーシャル・D・ティーチ', color: ['黒'], type: 'CHAR', cost: 10, power: 12000, blocker: true, traits: ['王下七武海', '黒ひげ海賊団'],
      text: '【ブロッカー】【登場時(登場ターン専用の起動メインを再現)】リーダーが黒ひげ海賊団なら、相手リーダー1枚をこのターン中効果無効。その後、相手キャラ1枚を次の相手ターン終了時まで効果無効にし、そのキャラはアタックできない'
    });
    def({
      no: 'OP16-104', name: 'カタリーナ・デボン', color: ['黄'], type: 'CHAR', cost: 4, power: 3000, counter: 2000, traits: ['インペルダウン', '黒ひげ海賊団'],
      text: '【アタック時】相手キャラ1枚を選び、このキャラの元々のパワーをこのターン中その値にする 【トリガー】1ドロー＋トラッシュのコスト1黒ひげ1枚を登場'
    });
    def({
      no: 'OP16-109', name: 'ドクQ', color: ['黄'], type: 'CHAR', cost: 1, power: 0, counter: 2000, traits: ['黒ひげ海賊団'],
      text: '【KO時】リーダーが黒ひげなら1ドローし相手コスト1以下2枚までKO 【トリガー】同効果'
    });
    def({
      no: 'OP09-096', name: 'おれの時代だァ!!!!', color: ['黒'], type: 'EVENT', cost: 1, traits: ['黒ひげ海賊団'],
      text: '【メイン】デッキ上3枚から「おれの時代だァ!!!!」以外の黒ひげ1枚を手札に加え、残りをトラッシュ 【トリガー】同効果'
    });
    def({
      no: 'OP16-116', name: 'ゼハハハハハハ!!!', color: ['黄'], type: 'EVENT', cost: 8, traits: ['王下七武海', '黒ひげ海賊団'],
      text: '【メイン】場のドン10枚なら手札からティーチ1枚を登場し相手ライフ1枚を手札へ 【トリガー】カード2枚を引き手札1枚を捨てる'
    });
    def({
      no: 'OP09-099', name: 'ハチノス', color: ['黒'], type: 'STAGE', cost: 1, traits: ['黒ひげ海賊団'],
      text: '【起動メイン】手札1枚を捨てこのステージをレスト:デッキ上3枚から黒ひげ1枚を手札に、残りをデッキ下'
    });

    const DECKS = [
      {
        id: 'enel', name: '紫エネル', leader: 'OP15-058', colors: ['紫'], tier: 'TIER 1', usage: '19.1%',
        style: 'コントロール', accuracy: 'high',
        desc: '独自の6ドンシステムから10000・効果耐性のエネルを毎ターン展開。除去されない大型と神官の連撃で制圧する環境最強格。',
        list: {
          'OP15-067': 4, 'OP15-061': 4, 'OP15-066': 4, 'OP12-071': 4, 'OP15-063': 2, 'OP15-069': 2, 'OP15-070': 2,
          'OP15-060': 4, 'OP15-118': 4, 'OP15-076': 4, 'OP15-074': 4, 'OP15-075': 4, 'OP15-077': 4, 'OP15-078': 4
        }
      },
      {
        id: 'lucy', name: '赤青ルーシー', leader: 'OP15-002', colors: ['赤', '青'], tier: 'TIER 2', usage: '6.0%',
        style: 'コントロール', accuracy: 'high',
        desc: 'イベント/ステージを実質カウンターに変換。赤の火力除去＋青のバウンスで盤面を制し、9000ブロッカーのサボで蓋をする。',
        list: {
          'OP15-040': 4, 'OP15-053': 4, 'OP10-045': 4, 'OP15-047': 4, 'OP15-044': 4, 'OP15-042': 4, 'OP15-052': 4, 'OP15-046': 4,
          'OP15-021': 4, 'OP15-054': 4, 'OP04-056': 4, 'OP15-020': 2, 'OP15-056': 2, 'OP15-057': 2
        }
      },
      {
        id: 'ace', name: '赤青エース', leader: 'OP13-002', colors: ['赤', '青'], tier: 'TIER 2', usage: '6.8%',
        style: 'ミッドレンジ', accuracy: 'high',
        desc: '被弾するほどドローが進むライフ3リーダー。12000ブロッカーのニューゲートと速攻ロジャーで攻守を両立する万能型。',
        list: {
          'OP13-016': 4, 'ST22-002': 4, 'OP10-045': 4, 'PRB02-008': 4, 'OP13-043': 4, 'OP13-054': 4, 'EB02-006': 2, 'ST23-001': 4, 'OP08-047': 4,
          'OP13-042': 4, 'OP08-043': 2, 'OP09-118': 2, 'ST22-015': 4, 'OP13-057': 4
        }
      },
      {
        id: 'nami', name: '青黄ナミ', leader: 'OP11-041', colors: ['青', '黄'], tier: 'TIER 2', usage: '9.4%',
        style: 'コントロール', accuracy: 'mid',
        desc: 'ライフ回復とブロッカー・トリガーで守り抜く高耐久デッキ。山札操作で強力なトリガーを仕込み、攻めを受け流す。',
        list: {
          'EB04-058': 4, 'EB03-055': 4, 'EB03-053': 4, 'OP13-042': 4, 'OP11-106': 4, 'OP06-106': 4, 'OP07-115': 4,
          'OP06-104': 3, 'P-096': 3, 'OP15-119': 3, 'OP14-108': 3, 'OP12-112': 3, 'OP15-052': 3, 'PRB02-008': 2, 'OP12-119': 2
        }
      },
      {
        id: 'hancock', name: '青黄ハンコック', leader: 'OP14-041', colors: ['青', '黄'], tier: 'TIER 3', usage: '3.8%',
        style: 'コントロール', accuracy: 'mid',
        desc: '通称ゾンビハンコック。倒してもトリガーや蘇生で次々キャラが湧く継戦力と、ライフ回復で粘り勝つ。',
        list: {
          'OP14-105': 4, 'OP14-107': 4, 'OP14-112': 4, 'EB04-058': 4, 'OP15-113': 4, 'ST17-004': 4, 'OP07-115': 4,
          'OP14-104': 3, 'OP08-050': 3, 'OP14-103': 3, 'OP14-108': 3, 'OP14-114': 4, 'OP14-113': 2, 'OP12-119': 2, 'OP07-057': 2
        }
      },
      {
        id: 'teach', name: '黒黄ティーチ', leader: 'OP16-080', colors: ['黒', '黄'], tier: 'TIER 1', usage: '16.2%',
        style: 'ミッドレンジ', accuracy: 'mid',
        desc: 'OP16最新環境のトップ。KO時効果を持つ黒ひげ達をリーダー効果でアタックに引き込み、除去とドローで盤面と手札を整える。ドン10枚から「ゼハハ」＋大型ティーチでライフ差を一気に広げる。2026/6/7フラッグシップ優勝構築準拠。',
        list: {
          'OP09-095': 4, 'OP16-110': 4, 'OP16-103': 2, 'OP16-119': 4, 'OP16-108': 4, 'OP12-112': 1, 'EB04-058': 4, 'OP09-086': 3, 'OP09-093': 4,
          'OP16-104': 4, 'OP16-109': 4, 'OP09-096': 4, 'OP16-116': 4, 'OP09-099': 4
        }
      },
    ];

    /* OP16黒黄ティーチを収録（公式カードリスト検証済み）。OP09-093は正しくはマーシャル・D・ティーチであり、
       旧データのマーガレット誤登録を正しい型番OP07-054へ修正済み。 */

    /* ---------- 全カードデータ(cards.js)を C に統合 ----------
       実装済み(fxあり)カードはそのまま維持。未実装カードは「データのみ」として登録し、
       基本戦闘（パワー/カウンター）＋テキストから検出したキーワード（ブロッカー/速攻/W/バニッシュ）で動く。
       複雑な効果(登場時/トリガー/起動/常在)は未実装＝発動しない（ビルダーでは「効果未実装」と表示）。 */
    (function mergeCardDB() {
      const DB = (typeof window !== 'undefined' && window.CARD_DB) || (typeof CARD_DB !== 'undefined' ? CARD_DB : null);
      if (!DB) return;
      const FX = (typeof window !== 'undefined' && window.CARD_FX) || (typeof CARD_FX !== 'undefined' ? CARD_FX : null);
      const ATTR = (typeof window !== 'undefined' && window.CARD_ATTR) || (typeof CARD_ATTR !== 'undefined' ? CARD_ATTR : null); // 属性(斬/打/射/特/知)。cards-attr.js
      for (const cd of DB) {
        if (!cd || !cd.no) continue;
        let base = C[cd.no];          // def() 済みカードはメタ情報を維持して再利用
        const wasDef = !!base;
        if (!base) {
          const t = cd.text || '';
          base = {
            no: cd.no, name: cd.name, type: cd.type, color: cd.color || [], traits: cd.traits || [],
            cost: cd.cost != null ? cd.cost : 0, power: cd.power || 0, counter: cd.counter || 0,
            text: t, dataOnly: true
          };
          if (/【ブロッカー】/.test(t)) base.blocker = true;
          if (/【速攻】/.test(t)) base.rush = true;
          if (/【速攻：キャラ】/.test(t)) base.rushChar = true; // 登場ターンにキャラへのみアタック可
          if (/【ダブルアタック】/.test(t)) base.doubleAttack = true;
          if (/【バニッシュ】/.test(t)) base.banish = true;
          if (cd.type === 'LEADER') { base.leader = '_' + cd.no; base.life = cd.life != null ? cd.life : 5; base.donDeck = 10; }
        }
        // 効果fxは CARD_FX を正とし、def済み/データのみ問わず一律に付与（効果定義を cards-fx.js に一元化）。
        // ★パラレル(_rN=別イラストの同一カード)は本体noのfxを共有する（CARD_FXは本体noのみキー。例: OP09-099_r1ハチノスが効果を失っていた）
        const fxKey = (FX && FX[cd.no]) ? cd.no : cd.no.replace(/_r\d+$/, '');
        if (FX && FX[fxKey]) {
          const fxe = FX[fxKey];
          if (fxe.costMod && base.costMod == null) base.costMod = fxe.costMod;   // 手札にある間の条件付きコスト増減（effCostが参照）。defのメタは上書きしない
          if (fxe.condRush && base.condRush == null) base.condRush = fxe.condRush; // 条件付き【速攻】
          if (fxe.condBlocker && base.condBlocker == null) { base.condBlocker = fxe.condBlocker; base.blocker = false; } // 条件付き【ブロッカー】（テキスト由来の無条件blockerを打ち消す）
          if (fxe.condRush) base.rush = false;  // 条件付き【速攻】も同様にテキスト由来の無条件rushを打ち消す
          if (fxe.static) for (const o of fxe.static) { if (o.op === 'staticKeyword' && o.cond && base[o.kw]) base[o.kw] = false; } // 条件付きキーワード(staticKeyword cond)はテキスト由来の無条件キーワードを打ち消す（hasKwがcond評価。OP13-009ダダン等）
          const timed = {}; for (const k in fxe) if (k !== 'costMod' && k !== 'condRush' && k !== 'condBlocker') timed[k] = fxe[k];
          if (Object.keys(timed).length) base.fx = timed;
          delete base.dataOnly;
        }
        // 属性(斬/打/射/特/知)を付与。パラレル(_rN)は本体noの属性を共有。
        if (ATTR) { const a = ATTR[cd.no] || ATTR[cd.no.replace(/_r\d+$/, '')]; if (a) base.attribute = a; }
        if (!wasDef) C[cd.no] = base;
      }
    })();
