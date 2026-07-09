// ホバー中カードの効果プレビュー（元 #preview を再利用・カーソル追従）。
// store.hover を購読（専用スライス＝盤面は再描画しない）。幅<=1000 では CSS の #preview{display:none!important} で自動非表示。
import { useEffect, useRef, useState } from 'react';
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';

const TYPE_JA: Record<string, string> = { CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' };

export function CardPreview() {
  const hover = useEngineStore((s) => s.hover);
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  const [imgOk, setImgOk] = useState(true);
  const lastNo = useRef<string | null>(null);

  // カーソル追従（hover中のみリスナを張る）
  useEffect(() => {
    if (!hover) return;
    const onMove = (e: MouseEvent) => {
      const W = 200, H = 320, pad = 14;
      let x = e.clientX + 18, y = e.clientY + 18;
      if (x + W + pad > window.innerWidth) x = e.clientX - W - 20;
      if (y + H + pad > window.innerHeight) y = window.innerHeight - H - pad;
      if (y < pad) y = pad;
      setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [hover]);

  if (!hover) return null;
  const b = hover.base;
  if (lastNo.current !== b.no) { lastNo.current = b.no; if (!imgOk) setImgOk(true); }

  const showPow = b.type === 'CHAR' || b.type === 'LEADER';

  return (
    <div id="preview" style={{ display: 'block', left: pos.x, top: pos.y, width: 200 }}>
      {imgOk ? (
        <img src={IMG(b.no)} referrerPolicy="no-referrer" decoding="async" alt={b.name} onError={() => setImgOk(false)} />
      ) : null}
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--gold-soft)' }}>{b.name}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 2px' }}>
          <span>{TYPE_JA[b.type] || b.type}</span>
          {b.cost != null ? <span>コスト {b.cost}</span> : null}
          {showPow && b.power != null ? <span>パワー {b.power}</span> : null}
          {b.counter ? <span>カウンター {b.counter}</span> : null}
        </div>
        {b.traits && b.traits.length ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{b.traits.join(' / ')}</div>
        ) : null}
        {b.text ? (
          <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{b.text}</div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>（効果なし / バニラ）</div>
        )}
        {b.triggerText ? (
          <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.55, color: '#1a1205', background: 'linear-gradient(180deg,var(--gold-soft),var(--gold-dim))', borderRadius: 6, padding: '5px 7px', whiteSpace: 'pre-wrap' }}>
            {b.triggerText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
