// 全カード共通のカード大写しオーバーレイ（store.zoomCard を購読）。
// 長押し（盤面/手札=Card.tsx・選択肢=Prompt opt-card・トラッシュ=TrashModal）と
// タップ（マリガン）を、この1つのオーバーレイに集約する。既存 ZoomView を再利用。
// App 直下に描画＝transform 祖先が無いので position:fixed がビューポート基準になる。
import { AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { ZoomView } from '../deck/CardZoom';

export function CardZoomOverlay() {
  const zoom = useEngineStore((s) => s.zoomCard);
  const close = () => useEngineStore.getState().setZoomCard(null);
  return (
    <AnimatePresence>
      {zoom ? <ZoomView key={zoom.no} no={zoom.no} name={zoom.name} onClose={close} /> : null}
    </AnimatePresence>
  );
}
