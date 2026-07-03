// @vitest-environment happy-dom
// 盤面演出（元 src/40-ui-render.js の spawnAt/drawFly/donFly/shakeScreen/drawAtkLine）が
// reactAdapter 経由で実DOM(.felt)に一時要素を生成することを検証する。
// エンジンはスタブDOMで動くため演出は adapter 側（実 document）で実行される＝ここが実装の要。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeReactAdapter } from '../src/engine/reactAdapter';

// jsdom はレイアウトを持たず getBoundingClientRect が全て0を返す→ atkline の len>0 を作れないので、
// data-uid/クラスごとに異なる矩形を返すスタブを入れる（座標の正しさではなく「要素が出るか」を見る）。
let origRect: any;
function stubRects() {
  origRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const uid = this.getAttribute && this.getAttribute('data-uid');
    const base = uid ? Number(uid) * 100 : (this.classList && this.classList.contains('felt') ? 0 : 20);
    return { left: base, top: base, width: 40, height: 56, right: base + 40, bottom: base + 56, x: base, y: base, toJSON() {} } as DOMRect;
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="board"><div class="felt">
      <div class="side me">
        <div class="zone-side ga-cost"><div class="donrow"></div></div>
        <div class="zone-side ga-deck"><div class="pile cardback"></div></div>
        <div class="card" data-uid="1"></div>
      </div>
      <div class="side opp">
        <div class="zone-side ga-hand"><div class="pile cardback"></div></div>
        <div class="card" data-uid="2"></div>
      </div>
      <div class="handzone"></div>
    </div></div>`;
}

// makeReactAdapter が要求する最小 store。演出に必要なのは engine.G._sim と setAtk のみ。
function makeStore() {
  const g: any = { _sim: false, _atkFrom: null, _atkTo: null };
  const state: any = {
    engine: { G: g }, muted: true,
    bump() {}, setPrompt() {}, setPick() {}, pushFx() {}, setAtk() {}, setEnd() {}, setThinking() {}, pushLog() {},
  };
  return { store: { getState: () => state } as any, g };
}

describe('盤面演出が実DOMに要素を生成する', () => {
  beforeEach(() => { setupDom(); stubRects(); });
  afterEach(() => { Element.prototype.getBoundingClientRect = origRect; });

  it('spawnAt: ring/spark は単一エフェクト・burst は粒子12個', () => {
    const { store } = makeStore();
    const a = makeReactAdapter(store);
    a.spawnAt!(1, 'ring');
    expect(document.querySelector('.felt .spawnfx.ring')).toBeTruthy();
    a.spawnAt!(1, 'burst');
    expect(document.querySelectorAll('.felt .spawnfx.burst > i').length).toBe(12);
  });

  it('drawFly / donFly: 飛翔要素が .felt に出る', () => {
    const { store } = makeStore();
    const a = makeReactAdapter(store);
    a.drawFly!('me');
    expect(document.querySelector('.felt .flycard')).toBeTruthy();
    a.donFly!('me', 1);
    expect(document.querySelector('.felt .donfly')).toBeTruthy();
  });

  it('shakeScreen: .felt に quake クラスが付く', () => {
    const { store } = makeStore();
    const a = makeReactAdapter(store);
    a.shakeScreen!();
    expect(document.querySelector('.felt.quake')).toBeTruthy();
  });

  it('攻撃ライン: showAtkAnnounce で .atkline を引き・clearAtkAnnounce で消す', () => {
    const { store } = makeStore();
    const a = makeReactAdapter(store);
    a.showAtkAnnounce!('me', { uid: 1 } as any, { uid: 2 } as any);
    const line = document.querySelector('.felt .atkline') as HTMLElement;
    expect(line).toBeTruthy();
    expect(parseFloat(line.style.width)).toBeGreaterThan(0); // len>0（別座標）
    a.clearAtkAnnounce!();
    expect(document.querySelector('.felt .atkline')).toBeFalsy();
  });

  it('_sim（AI探索）中は演出を出さない', () => {
    const { store, g } = makeStore();
    g._sim = true;
    const a = makeReactAdapter(store);
    a.spawnAt!(1, 'ring');
    a.shakeScreen!();
    expect(document.querySelector('.felt .spawnfx')).toBeFalsy();
    expect(document.querySelector('.felt.quake')).toBeFalsy();
  });
});
