// モーダル選択UI（showPrompt / humanPick の解決UI）。
// 元 src/40-ui-render.js promptHTML() の DOM 構造・class を 1:1 で再現し、
// css/styles.css（→ battle.css にverbatimコピー）の #promptHost/.prompt/.opt/.opt-card 系を当てる。
//
// 設計:
//  - store.prompt(PromptState|null) を購読。null なら何も描かない（残骸を出さない）。
//  - body直付け相当のオーバーレイ #promptHost（position:fixed・pointer-events:none）。
//    その中の .prompt だけが pointer-events:auto（元CSS準拠）。
//  - ★モーダル本体は framer の AnimatePresence を使わない（ストアの純関数として描画する）。
//    退場アニメの内部 state に依存すると、退場完了と新プロンプトの入場が同着したときに描画が消え、
//    「プロンプトはあるのに画面に出ない＝進行不能」になる（オンラインのブロック→カウンターで実際に発生）。
//    入退場の見た目は CSS（.prompt.show の promptIn）に任せる。
//  - 各ボタンの onClick で prompt.onPick(o.v) を呼ぶ（必ず解決＝フリーズ厳禁）。
import { useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion'; // マリガン手札のフリップ演出だけに使う（プロンプト本体は AnimatePresence を使わない＝下の Prompt() のコメント参照）
import { useEngineStore } from '../../state/engineStore';
import { useNetStore, seatLabel } from '../../state/netStore';
import { uiDispatch } from '../../net/dispatch';
import { recordCpuInput } from '../../net/cpuRecorder';
import type { PromptOption, Card } from '../../engine/types';
import { IMG } from '../../engine/img';
import { Icon } from '../ui/Icon';

// 効果テキスト等のHTMLタグを除いた素の文字列（大写しの名前ラベル用）。
const plain = (s: string) => (s || '').replace(/<[^>]*>/g, '').trim();
// カードを大写し（全カード共通の store.zoomCard 経由。長押し=盤面/選択肢、タップ=マリガン）。
const zoomTo = (no: string, name: string) => useEngineStore.getState().setZoomCard({ no, name });

// アタック進行中にモーダル上部へ出す「誰が誰にアタックしているか」ヘッダー。
// 旧: 別枠の浮動ダイアログ(AtkAnnounce)で表示 → モーダルと重なりテキストが読めないため、
// アタック中は全プロンプトに統合表示し、浮動ダイアログはプロンプトが無い時だけ出す。
// atk が無ければ何も描かない＝アタックと無関係なプロンプトには出ない。
function AttackHead() {
  const atk = useEngineStore((s) => s.atk);
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // カウンター加算などで power を再評価
  if (!atk || !atk.attacker || !atk.target || !engine) return null;
  const { attacker, target, aSide } = atk;
  const pw = (c: Card): number => { try { return (engine.power(c) as number) ?? 0; } catch { return 0; } };
  const opp = aSide !== useNetStore.getState().mySeat;
  const toN = target.base.type === 'LEADER' ? (opp ? 'あなたのリーダー' : '相手のリーダー') : target.base.name;
  const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden'; };
  return (
    <div className={'prompt-atkhead' + (opp ? '' : ' own')}>
      <span className="pah-side pah-atk">
        <img className="pah-card" src={IMG(attacker.base.no)} referrerPolicy="no-referrer" decoding="async" alt="" onError={hideImg} />
        <span className="pah-nm">{attacker.base.name}</span>
        <b className="pah-pw">P{pw(attacker)}</b>
      </span>
      <span className="pah-arrow"><Icon.swords size={20} /></span>
      <span className="pah-side pah-def">
        <img className="pah-card" src={IMG(target.base.no)} referrerPolicy="no-referrer" decoding="async" alt="" onError={hideImg} />
        <span className="pah-nm">{toN}</span>
        <b className="pah-pw def">P{pw(target)}</b>
      </span>
    </div>
  );
}

// マリガン専用: スタートの手札5枚を中央で1枚ずつフリップ公開（開封のワクワク演出）。
// ボトムシートだと手札が隠れて引いたカードが分からないため、モーダル内に大きく見せる。
function MulliganHand() {
  const engine = useEngineStore((s) => s.engine);
  const mySeat = useNetStore((s) => s.mySeat);
  useEngineStore((s) => s.version); // 引き直し後の手札更新を拾う
  if (!engine) return null;
  const hand: Card[] = (engine.G?.players?.[mySeat]?.hand || []) as Card[];
  const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden'; };
  const mid = (hand.length - 1) / 2;
  // マリガンのカードは選択アクションが無いので「タップ」で大写し（全カード共通の zoomCard へ）。
  return (
    <div className="mull-hand">
      {hand.map((c, i) => (
        <motion.div
          key={c.uid}
          className="mull-card"
          style={{ ['--d' as any]: (0.62 + i * 0.16) + 's' }} // シャイン掃引はフリップ完了後に
          initial={{ opacity: 0, y: 46, rotateY: 180, scale: 0.72, rotate: 0 }}
          animate={{ opacity: 1, y: Math.abs(i - mid) * 5, rotateY: 0, scale: 1, rotate: (i - mid) * 3 }}
          transition={{ delay: 0.15 + i * 0.16, type: 'spring', stiffness: 240, damping: 20 }}
          onClick={() => zoomTo(c.no, c.base?.name || '')}
        >
          <img src={IMG(c.no)} referrerPolicy="no-referrer" decoding="async" alt={c.base?.name || ''} onError={onErr} />
          <span className="mull-back" />
        </motion.div>
      ))}
    </div>
  );
}

// カード選択肢（カウンター/対象選択/サーチ等）の1枚。タップ=選択／長押し=大写し。
// 長押し中に選択されないよう、発火フラグで直後の click を握りつぶす（Card.tsx と同型）。
function OptCard({ o, onSelect, onImgError, html }: {
  o: PromptOption;
  onSelect: () => void;
  onImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  html: (s: string) => { dangerouslySetInnerHTML: { __html: string } };
}) {
  const timer = useRef<any>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; if (!t) return;
    fired.current = false; start.current = { x: t.clientX, y: t.clientY };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fired.current = true;
      zoomTo(o.card!.no, plain(o.t) || o.card!.no); // 無効な選択肢でも長押し大写しは許可（内容の確認用）
      try { (navigator as any).vibrate?.(12); } catch { /* ignore */ }
    }, 400);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]; if (!t || !start.current) return;
    if (Math.abs(t.clientX - start.current.x) > 10 || Math.abs(t.clientY - start.current.y) > 10) { clearTimeout(timer.current); timer.current = null; }
  };
  const onTouchEnd = () => { clearTimeout(timer.current); timer.current = null; };
  const onClick = () => { if (fired.current) { fired.current = false; return; } if (!o.disabled) onSelect(); };
  return (
    <button
      className={'opt-card' + (o.ghost ? ' ghost' : '') + (o.disabled ? ' off' : '')}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <span className="oc-art">
        <img src={IMG(o.card!.no)} referrerPolicy="no-referrer" decoding="async" alt={o.t} onError={onImgError} />
        <span className="oc-fb" {...html(o.t)} />
      </span>
      <span className="oc-cap" {...html(o.t + (o.card!.sub ? ' <b>' + o.card!.sub + '</b>' : ''))} />
    </button>
  );
}

export function Prompt() {
  const prompt = useEngineStore((s) => s.prompt);
  const peek = useEngineStore((s) => s.promptPeek);
  const setPeek = useEngineStore((s) => s.setPromptPeek);
  const pick = useEngineStore((s) => s.pick);
  const trigger = useEngineStore((s) => s.trigger);
  const engine = useEngineStore((s) => s.engine);
  const mySeat = useNetStore((s) => s.mySeat);
  const online = useNetStore((s) => s.mode) === 'online';
  const earlyMull = useNetStore((s) => s.earlyMulligan);
  const replayActive = useNetStore((s) => s.replayActive);
  const onPlay = useLocation().pathname === '/battle/play';
  useEngineStore((s) => s.version); // pendingChoice の変化（render→bump）を拾う

  // オンライン: 相手席の選択（非local）は選択肢を出さず「相手の選択待ち」だけ表示する
  const isRemote = !!prompt && online && !prompt.local && ((prompt.side || 'me') !== mySeat);
  const isMullPrompt = !!prompt && (prompt.cls || '').includes('mulligan');
  // マリガン同時化: エンジンは cpu席→me席 の順に聞くため、me席（ホスト）は相手の選択中に
  // 自分の判断を先行入力できる（相手席のマリガン表示中＝自分はまだ未回答なのは me席のみ）。
  const mullEarlyChooser = isRemote && isMullPrompt && mySeat === 'me' && earlyMull === null;
  // 自分のマリガンの番が来たとき、先行入力があれば自動送信（下のuseEffect）。その間はUIを出さない。
  const mullAutoSending = !!prompt && online && isMullPrompt && !prompt.local && (prompt.side || 'me') === mySeat && earlyMull !== null;
  useEffect(() => {
    if (!mullAutoSending || !prompt) return;
    const v = useNetStore.getState().earlyMulligan;
    useNetStore.getState().setEarlyMulligan(null);
    void uiDispatch({ t: 'prompt', v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mullAutoSending, prompt?.id]);

  // 画像読み込み失敗時に .oc-art へ noimg を付与（元: onerror で parentNode.classList.add('noimg')）
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none';
    img.parentElement?.classList.add('noimg');
  };

  // 「盤面を見る」導線: 防御選択（カウンター/ブロッカー）に加え、アタック進行中の
  // 全プロンプト（相手アタック時のリーダー効果確認など）でも盤面を確認できるようにする。
  // さらに、カード画像付き選択肢を持つ効果のカード選択（山札/トラッシュからのサーチで
  // 手札に加える札を選ぶ場面など）でも退避を許可する。これらはプロンプトが手札を覆う
  // （特にモバイルのボトムシート）ため、退避して今の手札を確認できるようにする。
  const atk = useEngineStore((s) => s.atk);
  const isDefense = !!prompt && (prompt.cls || '').includes('defense');
  const hasCardOpts = !!prompt && (prompt.opts || []).some((o) => o.card);
  const canPeek =
    !!prompt &&
    !(prompt.cls || '').includes('mulligan') &&
    (hasCardOpts || !!atk);
  // 退避ボタンの文言: 効果のカード選択（サーチ等）は「手札を見る」、防御やアタック確認は「盤面を見る」。
  const peekLabel = !isDefense && hasCardOpts ? '手札を見る' : '盤面を見る';

  // 薄いスクリム: 純粋なボタン決断のときだけ。盤面タップが必要な場面
  // （pick/pendingChoice=光るカードをクリックで選択、trigger=カード大写しを背後に見せる）では出さない。
  const pendingChoice = !!(engine && engine.G && engine.G.pendingChoice);
  const showScrim = !!prompt && !isRemote && !(peek && canPeek) && !pick && !pendingChoice && !trigger;

  // リプレイ再生中: プロンプトの応答はログが自動供給するため、選択UIは一切出さない
  if (replayActive) return <div id="promptHost" />;
  // 盤面（/battle/play）以外ではモーダルを出さない（対戦中に他画面へ移動しても残留させない。
  // エンジンは待ったまま＝盤面に戻れば再表示される）
  if (!onPlay) return <div id="promptHost" />;

  // ★AnimatePresence を使わない（ゲーム進行に必須のモーダルをアニメ内部状態に依存させない）。
  //   旧実装は scrim/待機/PromptCard を1つの <AnimatePresence> の子にし、全てに exit(0.2s) を付けていた。
  //   AnimatePresence は表示中の子を内部 state（renderedChildren）で持ち、退場完了時に「前回コミット時点の
  //   スナップショット」を書き戻す。オンラインのブロック→カウンターは
  //     setPrompt(null)（ブロックモーダル退場開始）→ エンジンが sleep(200) → counterStep の showPrompt
  //   となり、退場完了(≈200ms)と新プロンプトの入場コミットがちょうど同着する。書き戻しが後勝ちすると
  //   renderedChildren が空のまま固定され、ストアには自席のカウンタープロンプトがあるのに #promptHost が空＝
  //   「あなたの操作待ち」のまま進行不能になった（ホームへ出て戻ると AnimatePresence ごと再マウントされて直る）。
  //   → 描画をストアの純関数にする。入場アニメは CSS（.prompt.show の promptIn）が持っているので見た目は不変。
  //   退場フェードは無くなる（即消え）が、進行不能より遥かにマシ。
  return (
    <div id="promptHost">
      {showScrim && <div className="prompt-scrim" />}
      {prompt && mullEarlyChooser && (
        <div className="prompt show mulligan">
          <h3>マリガン</h3>
          <p>最初の手札を引き直しますか？（相手も同時に選んでいます。決定は相手の選択後に送信されます）</p>
          <MulliganHand />
          <div className="opts">
            <button className="opt" onClick={() => useNetStore.getState().setEarlyMulligan(true)}>引き直す</button>
            <button className="opt primary" onClick={() => useNetStore.getState().setEarlyMulligan(false)}>この手札でいく</button>
          </div>
        </div>
      )}
      {prompt && (isRemote || mullAutoSending) && !mullEarlyChooser && (
        <div className="prompt show waiting">
          <h3>{mullAutoSending ? '選択を送信中…' : seatLabel((prompt.side || 'cpu') as 'me' | 'cpu') + 'の選択待ち…'}</h3>
          <p>{mullAutoSending ? 'あなたのマリガン選択を反映しています' : '相手が' + ((prompt.cls || '').includes('defense') ? '防御' : (prompt.cls || '').includes('mulligan') ? 'マリガン' : '効果の対象') + 'を選んでいます'}</p>
        </div>
      )}
      {prompt && !isRemote && !mullAutoSending && !(peek && canPeek) && (
        <PromptCard
          key={prompt.id}
          prompt={prompt}
          onImgError={onImgError}
          canPeek={canPeek}
          peekLabel={peekLabel}
          onPeek={() => setPeek(true)}
        />
      )}
      {/* 退避中＝盤面を見ている。選択は保留のまま。ボタンでプロンプトに戻る。 */}
      {prompt && !isRemote && peek && canPeek && (
        <button className="peek-back" onClick={() => setPeek(false)}>
          {isDefense ? '防御にもどる' : '選択にもどる'}
        </button>
      )}
    </div>
  );
}

function PromptCard({
  prompt,
  onImgError,
  canPeek,
  peekLabel,
  onPeek,
}: {
  prompt: NonNullable<ReturnType<typeof useEngineStore.getState>['prompt']>;
  onImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  canPeek?: boolean;
  peekLabel?: string;
  onPeek?: () => void;
}) {
  const opts: PromptOption[] = prompt.opts || [];
  // 元 promptHTML: card 付きと無しを分離（順序保持のため元 index は使わず o を直接渡す）
  const cardOpts = opts.filter((o) => o.card);
  const plainOpts = opts.filter((o) => !o.card);

  // オンライン: 自席のゲームプロンプト（非local）は応答値を DO 経由で中継し、エコー適用で解決する。
  // ローカル確認（local）とオフラインは従来どおり直接解決。
  const net = useNetStore.getState();
  const relay = net.mode === 'online' && !prompt.local && ((prompt.side || 'me') === net.mySeat);
  const pick = (o: PromptOption) => {
    if (o.disabled) return;
    if (relay) {
      if (useNetStore.getState().sending) return; // echo待ち中の連打防止
      void uiDispatch({ t: 'prompt', v: o.v });
      return;
    }
    // CPU戦リプレイ収集: ゲームプロンプトの応答のみ記録（local=UI専用確認は中継と同じく対象外）
    if (net.mode !== 'online' && !prompt.local) recordCpuInput({ t: 'prompt', v: o.v });
    prompt.onPick?.(o.v);
  };

  // マリガンも配置は他プロンプトと共通（中身の手札フリップ演出だけ特別）。
  const isMulligan = (prompt.cls || '').includes('mulligan');

  // 元 promptHTML は title/text/o.t/o.card.sub を innerHTML で描画（HTML可・エンジン生成の制御済み文字列）。
  // React のデフォルトはエスケープなので、ここは HTML として描画して元の見た目（<b>色付き等）を再現する。
  const html = (s: string) => ({ dangerouslySetInnerHTML: { __html: s } });

  return (
    // 素の div（framer を使わない）。中央寄せは CSS の transform:translateX(-50%)、
    // 入場は .prompt.show の promptIn アニメが担う（Prompt() のコメント参照＝進行不能バグの修正）。
    <div className={'prompt show ' + (prompt.cls || '')}>
      {/* アタック進行中は常に攻撃情報をモーダル内に統合（atk が無ければ AttackHead は何も描かない） */}
      <AttackHead />
      <h3 {...html(prompt.title || '')} />
      {prompt.text ? <p {...html(prompt.text)} /> : null}

      {/* 「見る」効果のカード大写し（相手デッキ上/ライフ確認）。完了/選択を押すまで表示。タップで拡大。 */}
      {prompt.reveal && (
        <button
          type="button"
          className="prompt-reveal"
          onClick={() => zoomTo(prompt.reveal!.no, prompt.reveal!.name || '')}
          aria-label={(prompt.reveal.name || '') + 'を拡大'}
        >
          <img
            src={IMG(prompt.reveal.no)}
            referrerPolicy="no-referrer"
            decoding="async"
            alt={prompt.reveal.name || ''}
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
          {prompt.reveal.name ? <span className="pr-name" {...html(prompt.reveal.name)} /> : null}
        </button>
      )}

      {/* マリガン: スタートの手札5枚をフリップ公開 */}
      {isMulligan && <MulliganHand />}

      {/* 盤面/手札を見たい時：選択を保留してプロンプトを退避（盤面・手札が見える）。 */}
      {canPeek && (
        <button className="prompt-peek-btn" onClick={onPeek}>
          {peekLabel || '盤面を見る'}
        </button>
      )}

      {/* 候補が多いカード選択は件数を明示（縦スクロールで全候補に到達できる） */}
      {cardOpts.length >= 4 && <div className="opt-count">候補 {cardOpts.length}件（スクロールで全て表示）</div>}

      {cardOpts.length > 0 && (
        <div className="opt-cards">
          {cardOpts.map((o, i) => (
            <OptCard key={i} o={o} onSelect={() => pick(o)} onImgError={onImgError} html={html} />
          ))}
        </div>
      )}

      {/* テキストボタン候補が多い場合（例: ドン付与枚数）も件数を明示 */}
      {plainOpts.length >= 5 && <div className="opt-count">選択肢 {plainOpts.length}件（スクロールで全て表示）</div>}

      {plainOpts.length > 0 && (
        <div className="opts">
          {plainOpts.map((o, i) => (
            <button
              key={i}
              className={'opt ' + (o.primary ? 'primary' : '') + ' ' + (o.ghost ? 'ghost' : '')}
              disabled={o.disabled}
              onClick={o.disabled ? undefined : () => pick(o)}
              {...html(o.t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
