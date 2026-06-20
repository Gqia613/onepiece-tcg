# ワンピースカードゲーム 効果定義の全洗い出し & 実装設計

> 目的：シミュレーターのバグが多いのは「効果を1枚ずつ場当たりで実装している」のが原因。
> 効果を **4つの構成要素（タイミング／条件／コスト／アクション）** に分解し、
> 公式ルールに沿った **統一スキーマ** で表現する設計図にする。
> 一次ソースは公式の総合ルール・公式QA・カードリスト。

最終更新: 2026年6月 / 対象シミュレーター: `index.html`

---

## 0. 参照した公式ルール

| 区分 | ソース | 要点 |
|---|---|---|
| 総合ルール | `onepiece-cardgame.com/pdf/rule_comprehensive.pdf`（ver.1.1.9） | 4-4-1 アクティブ/レスト、4-4-2 付与ドンは例外、8章 効果の発動と解決、10章 キーワード効果 |
| 公式QA・FEATURE | `onepiece-cardgame.com`（FEATURE記事・Q&A） | 起動メイン、ドン-1、レストのドン付与の扱い |
| カードリスト | `onepiece-cardgame.com/cardlist/` | 効果テキストの一次ソース（実装時は必ずここを正とする） |

### この設計に直結する公式ルールの確定事項

1. **アクティブ／レスト**：縦向き=アクティブ（未使用）、横向き=レスト（使用済）。リフレッシュフェイズで自分のレストを全てアクティブにし、**付与されているドンも全てアクティブでコストエリアに戻す**。
2. **ドン付与の状態**：プレイヤーが自分で行う付与は **アクティブのドンのみ**。**「レストのドン!!を付与」と書かれた効果だけがレスト状態のドンを付ける**（付与ドンはアクティブ/レストのどちらでもない中間状態として扱われ、リフレッシュで全てアクティブに戻る）。
3. **ドン!!-N**：自分の場（リーダー/キャラ/コストエリア/付与）のドンを N 枚 **ドン!!デッキに戻す**。アクティブ・レスト・付与のどこからでも戻せる（付与を戻すとその分パワーは下がる）。
4. **「する」と「できる」**（8-1-2）：「する」=必ず発動し可能な限り処理。「できる」=任意（やらなくてよい）。
5. **「〜まで」「〜を」**（8-4-4）：「〜まで」= 0個でも可（任意数）。「〜を」= 可能な限り対象を取る。
6. **発動コストの「〜できる：」**：コロンの前は発動条件（コスト）。例「このキャラをレストにできる：」「ドン!!2枚をレストにできる：」はそれを行うことが発動条件。

> ★ 今回の2バグ（「少女のドン付与がアクティブから出る」「エネルの効果が発動しない時がある」）は、いずれも **上記2（レスト付与）と状態管理の取り違え** が原因だった。詳細は §11。

---

## 1. 効果の解剖学：すべての効果は4要素に分解できる

```
【発動タイミング】【発動条件(ターン1回など)】（テキスト条件）：［発動コスト］：［アクション(効果の内容)］
```

例：`【起動メイン】【ターン1回】自分のリーダーが「エネル」の場合：ドン!!-1：カード1枚を引く。`

| 要素 | この例での値 |
|---|---|
| ① 発動タイミング | 起動メイン |
| ② 発動条件 | ターン1回 ＋ リーダーが「エネル」 |
| ③ 発動コスト | ドン!!-1 |
| ④ アクション | 1ドロー |

**実装の方針：この4要素をそのままデータ構造のフィールドにする。**
1枚ごとに手続きを書くのではなく「タイミング別フック」「コスト共通処理」「アクションopの組み合わせ」で表現すれば、新カードはデータ追加だけで実装でき、バグが激減する。

統一スキーマ（提案）:
```js
{
  timing: 'onPlay',          // §3の列挙から
  once:   true,              // 【ターン1回】
  condition: ['leaderIs:enel','donLE:6'],   // §7の条件式
  cost:   { don:1 },         // §5のコスト（無ければ省略 = コストなし）
  optional: true,            // 「できる」=true / 「する」=false
  effect: [                  // §6のアクションopの配列（上から順に解決）
    { op:'draw', n:1 }
  ]
}
```

---

## 2. 状態モデル（最重要・バグの温床）

効果を正しく解くには **ドンとカードの「状態」** を厳密に持つ必要がある。

### ドンの3つの居場所 × 状態
| 居場所 | 取りうる状態 | 何に使えるか |
|---|---|---|
| ドン!!デッキ | （山札） | リフレッシュ/効果で「追加」される元 |
| コストエリア | アクティブ / レスト | アクティブ=コスト支払い・**手動付与**に使える。レスト=使用済 |
| 付与（カードの下） | （中間） | パワー+1000/枚。リフレッシュで**アクティブでコストエリアに戻る** |

- **手動付与**（自分のメインで重ねる）：コストエリアの **アクティブ** から取る。
- **効果「レストのドン!!を付与」**：コストエリアの **レスト** から取る。← ここを間違えると§11のバグになる。
- **ドン!!-N**：アクティブ/レスト/付与のどこからでも **ドンデッキへ戻す**（donTotal が減る）。

> エンジンでの表現（現状）: `P.don={active, rested}` ＋ 各カードの `attachedDon`。
> `donTotal = active + rested + Σattached`。「ドンデッキ残 = donMax − donTotal」。
> エネルは `donMax(donDeck)=6`、通常は10。

### カードの状態
- アクティブ/レスト（`rested`）
- 凍結 = 次のリフレッシュでアクティブにならない（`frozen`／§6「アクティブにならない」）
- 効果無効（`negSeq`／期限管理）
- アタック不可（`noAtkSeq`）
- パワー補正（`buffs[]`：値・期限）
- 付与されたキーワード（`kwGrant[]`：kw・期限）
- 表向きライフ（`life[i]._faceUp`）

---

## 3. 発動タイミング（いつ発動するか）

| タイミング | 公式の意味 | エンジンのフック | 現状op/対応 |
|---|---|---|---|
| 【登場時】 | キャラ/ステージが場に出た時に1回 | `summon()` 内で `fx.onPlay` を解決 | ✅ `onPlay`（49枚） |
| 【起動メイン】 | 自分のメインフェイズに能動発動。コスト付随あり。アタック後も可 | プレイヤー操作 `activateAbility()` / `fx.act` | ✅ `act`（8枚）。リーダーは `leaderActivate()` |
| 【アタック時】 | アタック宣言時に発動 | `declareAttack()` 内で `fx.onAttack` | ✅ `onAttack`（7枚） |
| 【ブロック時】 | このキャラがブロックした時 | `chooseBlocker()` 解決後フック | ⚠️ フック未整備（該当カード少。要追加） |
| 【KO時】 | このキャラがKOされた時 | `koCard()` 内で `fx.onKO` | ✅ `onKO`（16枚） |
| 【自分のターン中】 | 自分のターンの間ずっと適用（永続） | `fx.static`＋`power()`/判定で都度評価 | ✅ `static`（16枚） |
| 【相手のターン中】 | 相手のターンの間ずっと適用（永続） | 同上（条件 `oppTurn`） | ✅ `static`＋cond |
| 【ターン終了時】 | エンドフェイズに解決 | `endTurn()` フック | ✅ `onTurnEnd`（§12-1） |
| 【相手のアタック時】 | 相手のアタック宣言時に防御側が発動 | `declareAttack()` 内で `fx.onOppAttack` | ✅ `onOppAttack`（`once:'turn'`可・§12-1） |
| 自分のキャラが場を離れた時 | 友軍離脱で誘発（リーダー） | `checkAllyLeave()`（KO/バウンス/デッキ下） | ✅ `onAllyLeave`（§12-1） |
| トラッシュから登場した時 | 復活キャラに反応（リーダー） | `summon(source='trash')`→`checkReviveTrigger()` | ✅ `onReviveFromTrash`（§12-1） |
| 【トリガー】 | ライフが手札に加わる時にコスト0で任意発動 | `dealLeaderDamage()`→`askTrigger()`→`fx.trigger` | ✅ `trigger`（29枚） |
| 誘発「自分が〜した時」 | 特定イベントで誘発（例：キャラ登場時にドロー＝ナミLD） | 各イベント発生箇所でフック | ✅ リーダー個別（nami等） |
| 常時（キーワード等） | 場にいる限り常に適用 | `static` 評価 | ✅ §4参照 |

**設計指針**：タイミングは上記の**閉じた列挙**にする。各フック地点で「該当タイミングの効果を集めて解決する」関数を1つ用意し、カード側はデータだけ持つ。

---

## 4. キーワード能力（常在の特殊ルール／総合ルール10章）

| キーワード | 公式定義 | 実装 | 現状 |
|---|---|---|---|
| 【ブロッカー】 | 相手のアタック後、このカードをレストにしアタック対象を自身に変更できる | `chooseBlocker()` で候補化 | ✅ `hasKw('blocker')` |
| 【速攻】(Rush) | 登場ターンにアタック可 | `canCardAttack()` の召喚酔い判定で許可 | ✅ `rush` |
| 【ダブルアタック】 | リーダーへのアタック成功時ダメージ1→2 | `dealLeaderDamage(times=2)` | ✅ `doubleAttack` |
| 【バニッシュ】 | リーダーアタック成功時、ライフを手札でなくトラッシュへ（トリガー不可） | `dealLeaderDamage(banish)` | ✅ `banish` |
| 条件付き付与 | 【ドン!!×N】等の条件で上記を得る | `condBlocker`/`condRush`＋`kwGrant` | ✅ 一部（`giveKeyword`/`grantUnblockable`） |

> ブロック不可は厳密にはキーワードではなくアタック側の状態だが、実装上 `unblockableAttack`/`grantUnblockable`/`denyBlockerVsLeader` で扱う。

---

## 5. 発動コスト（何を支払うか）

「できる」効果はコストを払えば発動、「する」効果は本文中の付随条件。**コストは共通の `payCost()` で「支払い可否判定→実行」を一元化**すべき（現状は個別実装で漏れやすい）。

| コスト表記 | 公式の処理 | エンジン表現（提案 `cost:{}`） | 現状 |
|---|---|---|---|
| ドン!!-N | 場のドンN枚をドンデッキへ戻す（アクティブ/レスト/付与どこからでも） | `cost.don:N` → `returnDonChoose()` | ✅ `donMinus` |
| ドン!!N枚をレストにできる | アクティブのドンN枚をレストにする | `cost.restDon:N` | ⚠️ 専用op薄い。要共通化 |
| このキャラ/ステージをレストにできる | 自身をレスト（アクティブに戻せば再使用可） | `cost.restSelf:true` | ✅ `act.cost.restSelf` |
| このカードを手札に戻す/トラッシュ/デッキ下 | 自身を移動 | `cost.selfTo:'hand'|'trash'|'deckBottom'` | 一部（`selfToHand`/`leaveProtect`の支払い） |
| 手札N枚を捨てる | 手札を選んでトラッシュ | `cost.discard:N` | ✅ `discardOwn` |
| 自分のライフN枚をトラッシュ | ライフ上をトラッシュ | `cost.trashLife:N` | ✅ `lifeTrash` |
| 自分のライフ上を表向きにできる | ライフ上を表向きに | `cost.flipLife:true` | ✅ `flipLifeUp`（今回追加） |
| ドンN枚をアクティブ/付与を戻す等 | カード個別 | 個別op | 個別 |

**「できる(任意)」=`optional:true`**：コストを払えるが、やらない選択も可。CPUは損得で判断、人間はプロンプトで選択。

---

## 6. アクション（効果の内容）

「対象選択」は **「〜まで」=任意(0可)** / **「〜を」=可能な限り**。期限（このバトル中／このターン中／次の相手のエンドフェイズ終了時まで 等）を必ず持たせる。

> 以下 6-1〜6-7 は初期設計の分類。**現在の完全なop一覧は §12（最新・実装準拠）を参照すること。**

### 6-1. 除去
| 効果 | 説明 | op | 現状 |
|---|---|---|---|
| KO | パワー/コスト条件でKO | `ko`（`maxPower`/`maxCost`/`count`） | ✅ |
| パワー0以下でKO | パワーを下げてKO（連動） | `koZero` | ✅ |
| レストにする | 対象をレスト | `restChar`（`maxPower`/`maxCost`） | ✅ |
| バウンス | 手札/デッキ上下に戻す | `bounce`/`handToBottom`/`deckBottom` | ✅ |

### 6-2. パワー操作
| 効果 | op | 現状 |
|---|---|---|
| +X/-X（期限付き） | `powerMod`（`amount`/`duration`/`side`/`count`） | ✅ |
| 元々のパワーをXにする | `setPowerOppTurn`（相手ターン中6000化など static） | ✅ |
| 他のカードのパワーをコピー | `powerCopy` | ✅ |
| 自身/リーダーへの恒常バフ | `condBuff`/`leaderBuff`/`counterBuff` | ✅ |

### 6-3. リソース
| 効果 | op | 現状 |
|---|---|---|
| ドロー | `draw` | ✅ |
| 手札をデッキ下 | `bottomOwn`/`handToBottom` | ✅ |
| デッキ上N枚から条件1枚をサーチ | `search`（`look`/`filter`/`exclude`/`optional`/`rest`） | ✅（今回「加えない」任意化） |
| デッキ上を覗いて並べ替え | `scry` | ✅ |
| トラッシュから手札/登場 | `selfToHand`/`reviveFromTrash` | ✅ |

### 6-4. 展開（踏み倒し）
| 効果 | op | 現状 |
|---|---|---|
| 手札からキャラ登場（条件付き） | `playCharFromHand`（`maxPower`/`maxCost`）/`playSpecificFromHand` | ✅ |
| このキャラを登場（トリガー等） | `playSelf` | ✅ |
| 手札からイベント発動 | `playEventFromHand` | ✅ |

### 6-5. ドン操作
| 効果 | op | 現状 |
|---|---|---|
| **レストのドンを付与** | `donAttach`/`donAttachAll`（**レストから取得**） | ✅ **今回修正** |
| ドンデッキから追加（アクティブ/レスト） | リーダー個別（エネル） | ✅ **今回修正** |
| ドンN枚をアクティブにする | レスト→アクティブ／ドンデッキから追加 | ✅ `donActivate`/`donFromDeck`（§12-5） |
| ドン!!-N（デッキへ戻す） | `donMinus`→`returnDonChoose` | ✅ |

### 6-6. ライフ操作
| 効果 | op | 現状 |
|---|---|---|
| デッキ上をライフに（裏向き） | `lifeAddFromDeck`/`lifeAddChoose` | ✅（今回「1枚まで」任意化＋残りデッキ下） |
| **表向きでライフに/ライフを表向きに** | `lifeAddFromDeck{faceUp}`/`flipLifeUp` | ✅ **今回追加**（EB03-053等） |
| ライフを手札に | `lifeToHand`/`lifeSwap` | ✅ |
| 手札をライフに | `handToLife` | ✅ |
| 相手ライフ操作 | `oppLifeToHand`/`oppDamage` | ✅ |
| ライフをトラッシュ | `lifeTrash` | ✅ |
| トラッシュからライフに | `trashToLife` | ✅ |

### 6-7. 状態付与・防御
| 効果 | op | 現状 |
|---|---|---|
| 効果を無効 | `negateEffect` | ✅ |
| 効果で場を離れない（耐性） | `effectImmune`（static） | ✅ |
| キーワード付与（速攻/ブロッカー等・期限付き） | `giveKeyword`/`grantUnblockable` | ✅ |
| 次のリフレッシュでアクティブにならない（凍結） | `lock`（`frozen`） | ✅ |
| ブロッカー発動不可（対リーダー） | `denyBlockerVsLeader`/`unblockableAttack` | ✅ |
| コスト+X/-X | `condBuff`系/コスト修正 | 一部 |
| KO/場離脱を肩代わり（ノラ等） | `leaveProtect`（static、支払いで肩代わり） | ✅ |
| カウンター（+X/効果） | `counterBuff` ＋ カウンターステップ | ✅ |

---

## 7. 条件・対象・任意の処理ルール（総合ルール8章準拠）

- **条件式** `condition`：`leaderIs:enel`／`donLE:6`（場のドン6以下）／`oppTurn`／`selfTurn`／`life<=N`／`oppLife>=N`／`trait:白ひげ海賊団` …を列挙で持ち、`checkCond()` で評価。
- **「〜まで」= 任意数（0可）**：`chooseCard(..., optional=true)`。対象0でも効果は実行（何もしない部分はスキップ）。
- **「〜を」= 強制**：可能な対象があれば必ず取る（`optional=false`）。対象が無ければその部分は不発。
- **「する」=強制／「できる」=任意**：`optional` フラグで分岐。
- **空対象でフリーズしない**：`chooseCard` は候補0で `null` を返す／`humanPick` は候補0で即 `null`（今回の堅牢化で確定）。

---

## 8. 解決順序とフック（エンジンのどこで呼ぶか）

### ターン進行のフック
```
リフレッシュ: レスト→アクティブ / 付与ドン→アクティブでコストエリアへ / 凍結解除
ドロー:      1枚（先攻1ターン目は無し）
ドン:        +2（先攻1ターン目+1）。donMaxで上限
メイン:      プレイ/手動付与/起動メイン/アタック をループ
エンド:      ターン終了時効果 / このターン中バフの失効
```

### バトルのフック（順序厳守）
```
① アタック宣言（攻撃側レスト）→【アタック時】効果・リーダーのアタック時
② 対象変更系（黒ひげの対象変更など）
③ ブロック（【ブロッカー】）→【ブロック時】
④ カウンター（手札のカウンター値/カウンターイベント）
⑤ パワー比較（攻撃側 ≧ 防御側 で成功）
⑥ ダメージ（リーダー=ライフ処理＋【トリガー】／キャラ=KO→【KO時】）
```

> このフック順を1関数（`declareAttack`）に固定し、各タイミングのフックを必ず通すことで、
> 「効果が呼ばれない」系バグを防ぐ。今回の攻撃可視化（誰が誰に）もこのフロー内に組み込み済み。

---

## 9. 統一効果スキーマ（提案・1枚を例に）

例：エネル（OP15-058）リーダー
```js
{
  leaderId:'enel',
  abilities:[{
    timing:'activate',           // 起動メイン
    once:true,                   // ターン1回
    condition:['turn>=2'],       // 第2ターン以降
    cost:{},                     // 追加コストなし
    optional:true,               // 「できる」
    effect:[
      { op:'donFromDeck', active:1, rested:4 },     // 1アクティブ+4レスト追加
      { op:'donAttach', target:'chooseOwnChar', n:4, from:'rested' } // レストのドン4まで付与
    ]
  }]
}
```
例：少女（P-096）起動メイン
```js
{ timing:'activate', cost:{}, optional:true,
  effect:[ { op:'donAttach', target:'leader', n:1, from:'rested' } ] }   // ←from:'rested'が肝
```

**設計の核**：`from:'rested'|'active'` を `donAttach` の必須意味付けにする。
テキストに「レストのドン」とあれば `rested`、プレイヤー手動付与だけ `active`。

---

## 10. 現エンジンとのギャップ & 移行ロードマップ

現状は **概ねこの設計に沿っている**（`fx:{onPlay/onAttack/onKO/trigger/static/act}` ＋ `doOp` の op スイッチ）。
バグの主因は「個別実装での状態取り違え」と「コスト/任意処理の不統一」。

| 優先 | 施策 | 効果 |
|---|---|---|
| ★高 | ドン状態の厳密化（active/rested/attached）と **付与は必ず `from` を明示** | 今回の2バグ類を根絶（修正済） |
| 〜 | ~~`payCost()` 共通化~~ | **部分対応済**：`revealCost`/`discardCost`/`restDonCost`/`trashOwnCharCost`/`trashSelfCost`/`bounceOwnCharCost`/`restOwnAsCost` の `{op,..,then}` 形コストopで統一（§12-2）。完全な単一`payCost()`化は将来課題 |
| 中 | タイミング別フックの明示 | **onTurnEnd 追加済**（自分のターン終了時）。**onOppAttack/onAllyLeave/onReviveFromTrash も追加**（§12-1）。**onBlock のみ未整備** |
| 中 | 期限(`duration`)の一元管理（このバトル中/このターン中/次の相手エンドまで） | `turnEnd`/`battle`/`ownerNextStart`/`oppNextEnd` タグで失効管理。パワー/キーワード/コスト/凍結に適用済 |
| 〜 | ~~`donFromDeck`/`donActivate` op追加~~ | **実装済**（§12-5）。海軍ランプ・エネル系を正確化 |
| 低 | カードデータを統一スキーマ(§9)へ段階移行 | 新カード追加がデータのみで完結 |
| 環境 | 2026/4 ブロックアイコン①ローテ（OP01–04スタン落ち） | デッキ合法性の見直し |

---

## 11. 今回修正した2バグ（ケーススタディ）

### バグA：少女（P-096）の「レストのドン付与」がアクティブから出ていた
- **原因**：`donAttach` op が常に `P.don.active` から取得していた。
- **公式**：効果の「レストのドン!!を付与」は **レスト状態のドン** を付ける（手動付与だけがアクティブ）。
- **修正**：`donAttach`/`donAttachAll` を `P.don.rested` から取得に変更。レストが無ければ0付与（アクティブは消費しない）。
- **検証**：ユニットテスト（active3/rested2で付与1→att=1, rested=1, active=3不変／rested0なら付与0）。

### バグB：エネルのリーダー効果が発動しない時があった
- **原因**：①「追加ドンを全部アクティブで入れる」誤実装、②付与もアクティブから、③`add>0` のときだけ動く分岐で、満杯時に「効果なし」で素通り。
- **公式**：`ドン!!デッキから1枚までアクティブ＋4枚までレスト追加 → キャラ1枚にレストのドン4枚まで付与`。ドンはドン-1イベント（放電・雷獣等）で**ドンデッキに戻り循環**する。
- **修正**：3ステップを**常に実行**（room計算で1アクティブ＋最大4レスト追加 → レストから最大4付与）。満杯でもクラッシュせず既存レストを付与。
- **検証**：ユニットテスト（場0→active+1, 付与4, 合計5／場満杯→追加0だが既存レスト2を付与）。

---

## 12. 拡張op・フィルタ・条件・タイミング 全リスト（最新・実装準拠）

> **これが現在の正式な語彙リファレンス。新カード実装前に必ずここを参照。** OP-16実装の過程で約85種を追加した。`cards-fx.js` の各カードはこの語彙で書く（実装は `index.html` の `doOp`／`power()`／`hasKw()`／`matchFilter()`／`checkCond()`／`evalCondObj()`／`protectFromEffect()`／`counterVal()` 等）。

### 12-1. タイミングキー（`fx` の直下キー）
`onPlay`（登場時）/ `onAttack`（アタック時）/ `onKO`（KO時）/ `onOppAttack`（**相手のアタック時**。配列内opに `once:'turn'` でターン1回）/ `onTurnEnd`（**自分のターン終了時**）/ `trigger`（トリガー）/ `static`（常在）/ `act`（起動メイン＝`{label,cost,fx}`）/ `main`（イベント＝`{don,fx}`）/ `counter`（カウンター＝`{cost,fx}`）。
**オブジェクト形のタイミング**（リーダーの誘発。`{filter,cond?,once?,fx:[...]}` 形）: `onAllyLeave`（**自分の filter一致キャラが場を離れた時**）/ `onReviveFromTrash`（**トラッシュから filter一致キャラが登場した時**＝`{filter,kw,duration}` で対象にキーワード付与）。
**fxと同階層のメタキー**（タイミングではない。`mergeCardDB` が base へ持ち上げる）: `costMod`（手札にある間の**プレイ（登場）コスト**±N）/ `condRush` / `condBlocker`（条件付き常時キーワード）。

### 12-2. コスト系op（`{op,..,then:[op...]}` 形。払えた時のみ then を実行・任意）
`revealCost`（手札を公開＝消費しない）/ `discardCost`（手札を捨てる）/ `restDonCost`（アクティブのドンをレスト）/ `trashOwnCharCost`（自キャラをトラッシュ）/ `trashSelfCost`（self自身＝キャラ/ステージをトラッシュ）/ `bounceOwnCharCost`（自キャラを手札へ）/ `restOwnAsCost`（自リーダー/ステージ/キャラをレスト）。いずれも `filter`/`count`/`n` でコスト対象を指定。

### 12-3. 除去・状態
`ko`（`maxPower`/`maxCost`/`count`/`cond`/`all`/`filter`）/ `koZero` / `restChar`（`all`可）/ `bounce`（`all`可）/ `deckBottom` / `lock`（`maxCost`/`restedOnly`/次のリフレッシュでアクティブにならない）/ `setAttackBan`（アタック不可・`duration`）/ `denyBlocker`（【ブロッカー】発動不可・このターン）/ **`restImmune`**（「レストにできない」＝アタックもブロックも不可・レスト効果対象外・`duration:'untilNextEnd'`）/ `negateEffect` / `negateChoose`（`charsOnly`/`maxCost`/`filter`/`duration`）/ `denyBlockerVsLeader`。

### 12-4. パワー
`powerMod`（`amount`/`side`/`count`/`battle`/`duration:'turn'|'untilNextStart'|'untilNextEnd'`/`all`/`leader`/`filter`＝side:'self'でも名前等で自キャラ限定可）/ `setPower`（`target:'self'|'leader'|'selfAndLeader'|'allOwn'|'chooseOwn'|'chooseOwnL'`, `value` または `valueFrom:'oppLeaderPower'|'selfLeaderPower'`, `duration`）/ `powerCopy` / `counterBuff`（カウンター中、防御対象へ+N）。
**static（fx.static内）**: `condBuff`（`cond`/`power`/`immune`）/ `countBuff`（`of:'selfChars'|'selfCharsOther'|'oppChars'|'trash'|'selfHand'|'selfLife'|'oppLife'|'don'`, `ofTrait`/`ofFilter`/`distinctBy:'name'|'no'`/`per`/`amount`/`max`/`cond`）/ `trashPower` / `setPowerOppTurn` / `leaderBuffStatic`（このキャラがいる間リーダー+N・`cond`）。

### 12-5. リソース・展開・ドン・ライフ
- ドロー/手札: `draw` / `discardOwn` / `bottomOwn` / `handToBottom`
- デッキ: `search`（`look`/`count`/`filter`/`exclude`/`optional`/`rest:'trash'`）/ `scry` / `deckToTrash`（ミル）
- トラッシュ: `trashToHand`（`count`/`filter`）/ `selfToHand` / `reviveFromTrash`（`maxCost`/`filter`）
- 相手リソース: `oppDiscard` / `oppHandToBottom` / `oppDonMinus` / `oppLifeToHand` / `oppDamage`
- 展開: `playCharFromHand`（`count`/`filter`/`distinctName`/`maxCost`/`trait`）/ `playSpecificFromHand`（`name`/`nameIncludes`/`choose`/`optional`/`noEnter`）/ `playSelf` / `playEventFromHand` / `playCharFromDeck`（`look`/`count`/`filter`/`distinctName`/`rest`）/ `playFromHandOrTrash`（`filter`）/ `reviveSelf`（KO時に自身をトラッシュから）
- ドン: `donAttach`（**レストのドン**から。`target:'leader'|'self'|'leaderAndChar'|'chooseOwn'`＋`filter`）/ `donAttachAll`（`incLeader`）/ `donMinus`（`fromActive`でアクティブ限定）/ `donActivate`（レスト→アクティブ）/ `donFromDeck`（ドンデッキから`mode:'rest'|'active'`で追加）
- ライフ: `lifeAddFromDeck`（`faceUp`）/ `lifeAddChoose` / `lifeToHand` / `lifeSwap` / `handToLife` / `lifeTrash` / `trashToLife` / `flipLifeUp`

### 12-6. 状態付与・防御・キーワード・コスト
- キーワード付与: `giveKeyword`（`target:'self'|'chooseOwn'|'chooseOwnL'|'allOwn'|'allOwnL'`, `kw`, `duration:'turn'|'untilNextEnd'`, `filter`）/ `grantUnblockable`
- static（fx.static内）: `staticKeyword`（自身に常時キーワード・`cond`）/ `grantKeywordToLeader`（このキャラがいる間リーダーに付与・`cond`）/ `unblockableAttack` / `effectImmune` / `leaveProtect`（`pay:'donToDeck'|'charToBottom'|'koSelf'|'discardFromHand'|'restOwnCards'`, `onlyKO`, `once`, `targetFilter`, `discardFilter`, `n`）
- 自身アクティブ化: `activateOwnChar`（`count`/`all`/`incLeader`/`target:'self'`/`filter`）
- **コスト操作（盤面 vs プレイの区別が重要）**:
  - **`staticCost`**（static）= 盤面に出た**キャラ自身のコスト±N**（「このキャラのコスト+3」。相手の「コストN以下KO/レスト」等の除去判定＝`matchFilter`の実効コストにのみ反映。**登場コスト＝`effCost`には影響しない**）
  - `addCostBuff`（op）= 一時的な盤面コスト±N（「このターン中コスト+20」＝しのぶ。`side`/`count`/`duration`/`filter`）
  - `costMod`（メタキー）= 手札にある間の**プレイ（登場）コスト**±N（「手札のこのカードはコスト-3」）
  - ※「このキャラのコスト+N」を`costMod`で書くのは**誤り**（プレイコストが変わってしまう）。必ず`staticCost`を使う。
- カウンター強化: `handCounterBuff`（static。手札の filter一致カードのカウンター+N。`counterVal()` がカウンターステップで参照）

### 12-7. 対象フィルタ `filter`（`matchFilter`）
`type` / `typeNot` / `trait` / `traitIncludes`（部分一致） / `traitNot` / `traits`（いずれか） / `name`（完全一致・全角半角正規化） / `nameIncludes` / `nameExcludes` / `cost`（厳密） / `minCost` / `maxCost` / `power`（厳密） / `minPower` / `maxPower` / `color` / `colorNot` / `hasTrigger` / `not:{...}`（除外） / `or:[{...}]`（いずれか一致）。
※ `cost`/`minCost`/`maxCost` は**盤面の実効コスト**（base + `staticCost` + `addCostBuff` + ティーチ+1）で判定。

### 12-8. 条件（`checkCond`／`evalCondObj`。`cond` または `cond.check`）
- 文字列: `don<=6` / `don>=6` / `don10` / `donX1`（付与ドン1以上） / `donX2` / `life<=1|2|3` / `oppLife>=3` / `oppLife<=3` / `oppTurn` / `selfTurn` / `koByOpp`（相手効果でKO時） / `koByBattle` / `leaderWB`/`leaderBH`/`leaderShichibukai`/`leaderKujya` 等。
- オブジェクト（複数キーAND）: `leaderTrait` / `leaderNameIncludes` / `leaderColor` / `selfChar:{...filter,min}` / `noSelfChar:{...}` / `allSelfChar:{...}`（〜のみ） / `allSelfCharOther:{...}` / `selfCharCount:{filter,distinctBy,min,max}` / `selfHand:{...,min}` / `donAtLeast` / `lifeAtMost` / `oppLifeAtMost` / `oppHandAtLeast` / `selfHandAtMost` / `trashAtLeast` / `trashAtMost` / `oppCharKOedThisTurn` / `selfCostAtLeast`（self盤面実効コスト≥N） / `selfTurn` / `oppTurn` / `and:[...]` / `or:[...]` / `not:{...}`。

### 12-9. キーワード
`blocker` / `rush` / `doubleAttack` / `banish` / `unblockable` / **`rushChar`**（【速攻：キャラ】＝登場ターンはキャラのみアタック可・リーダー不可。`canTargetLeader()` で制御）。
※ 属性（斬/打/特/知/射/賢/特殊）はゲームロジックで参照されない（純フレーバー）。「属性◯を得る」は実装不要（省略で不利益なし）。

### 12-10. OP-15 で追加した op・フィルタ・条件（緑系／空島・麦わら系／特殊）
- **相手リソース付与/操作**: `oppDonAttach {n, fromAny?, then?}`（相手のレストのドン→相手キャラへ付与。fromAnyでコストエリア＝アクティブも。then付きでコスト化）/ `oppTrashToBottom {n, filter?}` / `oppDiscard` / `oppHandToBottom` / `oppDonMinus`
- **ライフコスト**: `lifeCost {action:'toHand'|'trash'|'faceUp'|'faceDown', then}` / leaveProtect `pay:'lifeToHand'`
- **コスト系op**: `deckBottomOwnCharCost {filter?, then}` / `deckTrashCost {n, then}` / `trashToDeckCost {n, then}`（self除外）/ `restSelfCost {then}`（onOppAttack等で自身レスト）
- **特殊op**: `chooseOption {options:[{label,fx}]}`（モード選択）/ `revealTop {filter, then}`（デッキ上公開→条件分岐）/ `scheduleTurnEnd {fx}`（このターン終了時に予約発動）/ `oppMayReturnDon {n, elseFx}`（相手がアクティブのドンを戻すか選び、戻さなければelseFx）/ `selectKoIfCostEqualsDon {side, filter}`（コスト＝付与ドン枚数 の時のみKO）
- **対象拡張**: `restChar`/`lock` の `includeLeader`/`includeStage`（相手リーダー/ステージもレスト対象）、`lock` の `count`、`powerMod` の `includeLeader`（相手側）/ `perAttachedDon`（付与ドン数スケール）、`reviveFromTrash` の `grantKw`/`grantDuration`
- **フィルタ追加**: `hasAttachedDon` / `minAttachedDon` / `restedOnly` / `activeOnly` / `minEffPower`（実効パワー参照・再帰ガード付）/ `maxCostFrom:'oppLife'`（相手ライフ枚数で動的コスト判定）
- **条件追加**: `leaderPowerAtMost`/`leaderPowerAtLeast` / `oppHasAttachedDon` / `trashCount:{filter,min,max}` / `selfLifeLessThanOpp` / `selfLifeAtMost` / `selfSummonedThisTurn` / `deckEmpty` / `deckAtMost`
- **static追加**: `oppStaticPowerMod`（相手全キャラに常在パワー±）/ `staticRestImmune`（このキャラはレストされない）/ `cantAttack`（アタック不可）/ `staticCost` の cond対応 / `staticSetBase {value, cond}`（常在で元々パワーをNに）/ `setPowerOppTurn` の cond/leaderTarget / `grantKeywordNames {kw, names, self}`（名前グループ＋自身へ常在キーワード）/ `deckOutDelay`（デッキ0でも即敗北せずターン終了時に敗北）

---

## まとめ

- 効果は **タイミング／条件／コスト／アクション** の4要素に必ず分解できる。
- バグの大半は **状態（active/rested/attached）と任意処理の取り違え**。スキーマと共通処理で根絶できる。
- 次の一手は「**`payCost()`共通化**」と「**`from`明示の付与**」（後者は今回実装）。
- 新カードは §9 のスキーマでデータ追加するだけ、を目標にする。
