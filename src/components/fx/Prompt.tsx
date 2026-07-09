// モーダル選択UI（showPrompt / humanPick の解決UI）。
// 元 src/40-ui-render.js promptHTML() の DOM 構造・class を 1:1 で再現し、
// css/styles.css（→ battle.css にverbatimコピー）の #promptHost/.prompt/.opt/.opt-card 系を当てる。
//
// 設計:
//  - store.prompt(PromptState|null) を購読。null なら何も描かない（残骸を出さない）。
//  - body直付け相当のオーバーレイ #promptHost（position:fixed・pointer-events:none）。
//    その中の .prompt だけが pointer-events:auto（元CSS準拠）。
//  - AnimatePresence でフェード/スケールイン。.prompt は CSS で left:50%/translateX(-50%) 中央寄せ
//    なので、Framer の transform が translateX を潰さないよう x:'-50%' を常に保ち scale/opacity だけ動かす。
//  - 各ボタンの onClick で prompt.onPick(o.v) を呼ぶ（必ず解決＝フリーズ厳禁）。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';
import { Icon } from '../ui/Icon';
import type { PromptOption, Card } from '../../engine/types';

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
  const opp = aSide !== 'me';
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
  useEngineStore((s) => s.version); // 引き直し後の手札更新を拾う
  if (!engine) return null;
  const hand: Card[] = (engine.G?.players?.me?.hand || []) as Card[];
  const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden'; };
  const mid = (hand.length - 1) / 2;
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
        >
          <img src={IMG(c.no)} referrerPolicy="no-referrer" decoding="async" alt={c.base?.name || ''} onError={onErr} />
          <span className="mull-back" />
        </motion.div>
      ))}
    </div>
  );
}

export function Prompt() {
  const prompt = useEngineStore((s) => s.prompt);
  const peek = useEngineStore((s) => s.promptPeek);
  const setPeek = useEngineStore((s) => s.setPromptPeek);
  const pick = useEngineStore((s) => s.pick);
  const trigger = useEngineStore((s) => s.trigger);
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // pendingChoice の変化（render→bump）を拾う

  // 画像読み込み失敗時に .oc-art へ noimg を付与（元: onerror で parentNode.classList.add('noimg')）
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none';
    img.parentElement?.classList.add('noimg');
  };

  // 「盤面を見る」導線: 防御選択（カウンター/ブロッカー）に加え、アタック進行中の
  // 全プロンプト（相手アタック時のリーダー効果確認など）でも盤面を確認できるようにする。
  const atk = useEngineStore((s) => s.atk);
  const isDefense = !!prompt && (prompt.cls || '').includes('defense');
  const canPeek =
    !!prompt &&
    !(prompt.cls || '').includes('mulligan') &&
    ((isDefense && (prompt.opts || []).some((o) => o.card)) || !!atk);

  // 薄いスクリム: 純粋なボタン決断のときだけ。盤面タップが必要な場面
  // （pick/pendingChoice=光るカードをクリックで選択、trigger=カード大写しを背後に見せる）では出さない。
  const pendingChoice = !!(engine && engine.G && engine.G.pendingChoice);
  const showScrim = !!prompt && !(peek && canPeek) && !pick && !pendingChoice && !trigger;

  return (
    <div id="promptHost">
      <AnimatePresence>
        {showScrim && (
          <motion.div
            key="scrim"
            className="prompt-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
        )}
        {prompt && !(peek && canPeek) && (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            onImgError={onImgError}
            canPeek={canPeek}
            onPeek={() => setPeek(true)}
          />
        )}
      </AnimatePresence>
      {/* 退避中＝盤面を見ている。選択は保留のまま。ボタンでプロンプトに戻る。 */}
      {prompt && peek && canPeek && (
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
  onPeek,
}: {
  prompt: NonNullable<ReturnType<typeof useEngineStore.getState>['prompt']>;
  onImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  canPeek?: boolean;
  onPeek?: () => void;
}) {
  const opts: PromptOption[] = prompt.opts || [];
  // 元 promptHTML: card 付きと無しを分離（順序保持のため元 index は使わず o を直接渡す）
  const cardOpts = opts.filter((o) => o.card);
  const plainOpts = opts.filter((o) => !o.card);

  const pick = (o: PromptOption) => {
    if (o.disabled) return;
    prompt.onPick?.(o.v);
  };

  // マリガンも配置は他プロンプトと共通（中身の手札フリップ演出だけ特別）。
  const isMulligan = (prompt.cls || '').includes('mulligan');

  // 元 promptHTML は title/text/o.t/o.card.sub を innerHTML で描画（HTML可・エンジン生成の制御済み文字列）。
  // React のデフォルトはエスケープなので、ここは HTML として描画して元の見た目（<b>色付き等）を再現する。
  const html = (s: string) => ({ dangerouslySetInnerHTML: { __html: s } });

  return (
    <motion.div
      className={'prompt show ' + (prompt.cls || '')}
      // .prompt は left:50% + translateX(-50%) で中央寄せ。Framer が transform を上書きするため
      // x:'-50%' を常に維持し scale/opacity のみアニメ（横中央がズレないように）。
      initial={{ x: '-50%', opacity: 0, scale: 0.9 }}
      animate={{ x: '-50%', opacity: 1, scale: 1 }}
      exit={{ x: '-50%', opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* アタック進行中は常に攻撃情報をモーダル内に統合（atk が無ければ AttackHead は何も描かない） */}
      <AttackHead />
      <h3 {...html(prompt.title || '')} />
      {prompt.text ? <p {...html(prompt.text)} /> : null}

      {/* マリガン: スタートの手札5枚をフリップ公開 */}
      {isMulligan && <MulliganHand />}

      {/* 盤面を見たい時：選択を保留してプロンプトを退避（盤面が見える）。 */}
      {canPeek && (
        <button className="prompt-peek-btn" onClick={onPeek}>
          盤面を見る
        </button>
      )}

      {/* 候補が多いカード選択は件数を明示（縦スクロールで全候補に到達できる） */}
      {cardOpts.length >= 4 && <div className="opt-count">候補 {cardOpts.length}件（スクロールで全て表示）</div>}

      {cardOpts.length > 0 && (
        <div className="opt-cards">
          {cardOpts.map((o, i) => (
            <button
              key={i}
              className={'opt-card' + (o.ghost ? ' ghost' : '') + (o.disabled ? ' off' : '')}
              onClick={o.disabled ? undefined : () => pick(o)}
            >
              <span className="oc-art">
                <img
                  src={IMG(o.card!.no)}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  alt={o.t}
                  onError={onImgError}
                />
                <span className="oc-fb" {...html(o.t)} />
              </span>
              <span className="oc-cap" {...html(o.t + (o.card!.sub ? ' <b>' + o.card!.sub + '</b>' : ''))} />
            </button>
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
    </motion.div>
  );
}
