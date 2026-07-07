// 共有アイコン集：フリーアイコン（Feather Icons=MIT / swordsはLucide=ISC）をインラインSVGで同梱。
// 外部リクエストなし・stroke=currentColor でボタンやテキストの色を継承。絵文字の置き換え用。
import type { ReactNode, CSSProperties } from 'react';

type P = { size?: number; style?: CSSProperties; className?: string };

function Svg({ size = 16, style, className, children }: P & { children: ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className}
      style={{ flex: '0 0 auto', display: 'inline-block', verticalAlign: 'middle', ...style }}
    >{children}</svg>
  );
}

export const Icon = {
  anchor: (p: P) => (<Svg {...p}><circle cx="12" cy="5" r="3" /><line x1="12" y1="22" x2="12" y2="8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></Svg>),
  cpu: (p: P) => (<Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></Svg>),
  menu: (p: P) => (<Svg {...p}><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></Svg>),
  volume: (p: P) => (<Svg {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></Svg>),
  volumeMute: (p: P) => (<Svg {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></Svg>),
  layers: (p: P) => (<Svg {...p}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></Svg>),
  logout: (p: P) => (<Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Svg>),
  tool: (p: P) => (<Svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Svg>),
  download: (p: P) => (<Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>),
  search: (p: P) => (<Svg {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>),
  arrowLeft: (p: P) => (<Svg {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></Svg>),
  shield: (p: P) => (<Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>),
  check: (p: P) => (<Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>),
  chevronDown: (p: P) => (<Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>),
  chevronRight: (p: P) => (<Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>),
  zap: (p: P) => (<Svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></Svg>),
  home: (p: P) => (<Svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Svg>),
  flag: (p: P) => (<Svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></Svg>),
  disc: (p: P) => (<Svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></Svg>),
  // Lucide "swords"（ISCライセンス）＝アタック用の交差剣。
  swords: (p: P) => (<Svg {...p}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" y1="19" x2="19" y2="13" /><line x1="16" y1="16" x2="20" y2="20" /><line x1="19" y1="21" x2="21" y2="19" /><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" /><line x1="5" y1="14" x2="9" y2="18" /><line x1="7" y1="17" x2="4" y2="20" /><line x1="3" y1="19" x2="5" y2="21" /></Svg>),
};
