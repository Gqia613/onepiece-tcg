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
import type { PromptOption } from '../../engine/types';

export function Prompt() {
  const prompt = useEngineStore((s) => s.prompt);
  const peek = useEngineStore((s) => s.promptPeek);
  const setPeek = useEngineStore((s) => s.setPromptPeek);

  // 画像読み込み失敗時に .oc-art へ noimg を付与（元: onerror で parentNode.classList.add('noimg')）
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none';
    img.parentElement?.classList.add('noimg');
  };

  // 「盤面を見る」導線を出せるのは、カードを見比べたい防御選択（カウンター/ブロッカー）だけ。
  const canPeek = !!prompt && (prompt.cls || '').includes('defense') && (prompt.opts || []).some((o) => o.card);

  return (
    <div id="promptHost">
      <AnimatePresence>
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
          防御にもどる
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
      <h3 {...html(prompt.title || '')} />
      {prompt.text ? <p {...html(prompt.text)} /> : null}

      {/* 盤面を見たい時：選択を保留してプロンプトを退避（盤面が見える）。 */}
      {canPeek && (
        <button className="prompt-peek-btn" onClick={onPeek}>
          盤面を見る
        </button>
      )}

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
