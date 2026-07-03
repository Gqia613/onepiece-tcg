#!/usr/bin/env node
/* tests/ai-hybrid-prompt.js — AIモード(hybrid)の「プロンプトに判断基準が載っているか」を決定的に検証する。
   Claude(proxy)呼び出しは fetch をモックして要求本文を捕捉し、返り値は固定の戦略(tool_use)を返す。
   検証点:
     1. 戦略のsystemにOPCGの判断原則が含まれる（Claudeの判断基準）。
     2. 盤面JSON(user)にエンジンのリーサル判定(エンジン判定)が含まれる（シミュ根拠）。
     3. 盤面JSON(user)に手札の効果文/カウンター値/キーワードが含まれる（カードの質）。
     4. sanitizeShapeが固定戦略を正しく返す。
     5. strategyKeyが盤面変化(キャラ追加)で変わる＝キャッシュ粒度（古い方針の使い回し防止）。
   使い方: node tests/ai-hybrid-prompt.js */
const { runHarness } = require('./_load-app');

const harness = String.raw`
process.on("unhandledRejection", e => { console.error("UNHANDLED", e && e.stack || e); process.exit(1); });
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; } else { fail++; console.log("  ✗ " + msg); } }

// マリガンは常に否定（即ゲーム進行可能に）
showPrompt = function (cfg) { if (cfg.onPick) cfg.onPick(false); return Promise.resolve(false); };
humanPick = function (c) { return Promise.resolve((c || [])[0] || null); };

// Claude(proxy)をモック: 要求本文を捕捉し、固定戦略を tool_use で返す。
// stubs.js が module スコープに var fetch を定義しているので、global ではなくその束縛へ再代入する。
let lastBody = null;
fetch = async function (url, opt) {
  lastBody = JSON.parse(opt.body);
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: {
    aggression: 'high', donReserve: 0, intent: '盤面を制圧して詰める',
    removalPriority: ['カタリーナ・デボン'],
    priorityCards: ['サボ'],
    shape: { ramp: 0.2, longevity: 0.1, control: 0.3, threatQuality: 0.2, tempo: 0.1 },
    priorBias: { playChar: 1.8, event: 1, act: 1.2, leader: 1 }
  } }] }) };
};

(async () => {
  startGame('lucy', 'teach');   // me=lucy, cpu=teach（cpuをAI側にする）
  G.aiOn = true;
  const cpu = G.players.cpu;
  // 手札に効果/カウンター持ちが居ることを保証（デッキ先頭から1枚挿す: 効果文ありを探す）
  const withText = window.CARD_DB.find(c => c.type === 'CHAR' && C[c.no] && (C[c.no].text || '').length > 4 && (C[c.no].counter || 0) > 0);
  if (withText) { const inst2 = inst(withText.no, 'cpu'); cpu.hand.push(inst2); }

  const sh = await fetchStrategyFromClaude('cpu');
  const sys = lastBody && lastBody.system || '';
  const usr = lastBody && lastBody.messages && lastBody.messages[0] && lastBody.messages[0].content || '';

  ok(sys.indexOf('【ワンピカードの判断原則】') >= 0, 'systemにOPCG判断原則が含まれる');
  ok(sys.indexOf('リーサル') >= 0, 'systemがリーサル判定の使い方に言及');
  ok(usr.indexOf('エンジン判定') >= 0, 'userの盤面JSONにエンジンのリーサル判定が含まれる(シミュ根拠)');
  ok(usr.indexOf('今ターン相手を倒せそう') >= 0, 'リーサル判定の具体フラグが含まれる');
  ok(/\/C\d/.test(usr) || /\[.*C\d/.test(usr), '手札/盤面にカウンター値(C)が含まれる(カードの質)');
  // 効果文 or 効果タイミングタグが含まれる（手札に効果持ちを入れたので登場時/起動/トリガー等が出るはず）
  ok(/登場時|起動|KO時|トリガー|アタック時|ブロッカー|速攻/.test(usr), '効果/キーワードのタグが盤面JSONに含まれる');
  ok(sh && sh.aggression === 'high' && sh.intent.indexOf('盤面を制圧') >= 0, 'sanitizeShapeが固定戦略を正しく返す');
  ok(sh && sh.shape && Math.abs(sh.shape.control - 0.3) < 1e-9, 'shape重みが保持される');
  ok(lastBody && lastBody.model === 'claude-sonnet-4-6', '戦略はSonnetモデルで問い合わせ');
  // ★具体プラン(#10/#11): デッキ勝ち筋の注入 と priorityCards の往復
  ok(usr.indexOf('自デッキの勝ち筋') >= 0, 'userの盤面JSONに自デッキの勝ち筋(DECK_STRATEGY)が含まれる');
  ok(sys.indexOf('priorityCards') >= 0, 'systemがpriorityCards(優先カード指定)の使い方に言及');
  ok(sh && Array.isArray(sh.priorityCards) && sh.priorityCards.indexOf('サボ') >= 0, 'sanitizeShapeがpriorityCardsを保持する');

  // strategyKeyの粒度: 盤面が変わるとキーが変わる
  const k1 = strategyKey('cpu');
  cpu.chars.push(inst('OP01-016', 'cpu'));   // キャラを1体追加（盤面変化）
  const k2 = strategyKey('cpu');
  ok(k1 !== k2, 'strategyKeyが盤面変化(キャラ追加)で変わる＝キャッシュ粒度');

  // ★防御助言(defenseAdvice)はユーザー要望で廃止（#9）＝人間の防御へClaude助言は出さない。当該検証(Haiku問い合わせ)は削除。

  console.log("ai-hybrid-prompt: pass=" + pass + " fail=" + fail);
  if (fail) { console.log("✗ AIモード プロンプト検証 失敗"); process.exit(1); }
  console.log("✓ AIモード プロンプト検証（判断原則/シミュ根拠/カードの質/キャッシュ粒度/モデル分け）pass");
  process.exit(0);
})();
`;
try { process.stdout.write(runHarness('aihp', harness)); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
