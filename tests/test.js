#!/usr/bin/env node
/* tests/test.js — シミュレーターの自動検証一式。
   使い方: node tests/test.js
   1) <script>抽出 → node --check（構文）
   2) デッキ整合（全6デッキ50枚・全カード定義済み）
   3) CPU対CPU 30戦（勝者が出る・同一ターンの二重アタックが無い）
   4) 人間オートパイロット 30戦（フリーズ＝真の停止が無い・選択不能プロンプトが無い）
   依存: Node.js のみ。 */
const fs=require('fs'), os=require('os'), path=require('path'), cp=require('child_process');
const { loadApp, runHarness }=require('./_load-app');
const ROOT=path.resolve(__dirname,'..');
const HTML=path.join(ROOT, process.env.OPCG_HTML||'index.html');

// 本体JS(src/00..60-*.js を index.html 記載順で連結)は loadApp(HTML)。
// 連結＋一時ファイル実行は _load-app.js の runHarness() に集約済。ここはハーネスファイルを読んで委譲するだけ。
function runConcat(name, harnessFile, timeoutMs){
  const harness=fs.readFileSync(path.join(__dirname,harnessFile),'utf8');
  return runHarness(name, harness, {timeout:timeoutMs});
}
let failed=0;
function step(label,fn){ process.stdout.write(`\n▶ ${label}\n`); try{ fn(); }catch(e){ failed++; process.stdout.write((e.stdout||'')+(e.stderr||'')); console.log(`  ✗ ${label} 失敗`); } }

// 1) 構文
step('構文チェック (node --check)', ()=>{
  const p=path.join(os.tmpdir(),`opcg-app-${Date.now()}.js`); fs.writeFileSync(p, loadApp(HTML));
  try{ cp.execSync('node --check '+JSON.stringify(p),{stdio:'inherit'}); console.log('  ✓ 構文OK'); }
  finally{ try{fs.unlinkSync(p);}catch(_){} }
});

// 2) デッキ整合
step('デッキ整合（全6デッキ50枚）', ()=>{
  const s=loadApp(HTML); const defs=new Set(); let m;
  // 複数行 def({ \n no: '...' } とコロン後の空白に対応
  const dre=/def\(\{\s*no:\s*['"]([\w-]+)['"]/g; while(m=dre.exec(s))defs.add(m[1]);
  // 空振り（正規表現が現行コード形式に未対応）を偽合格にしないためのガード
  if(defs.size<50) throw {stdout:`  ✗ カード定義の抽出に失敗（定義数 ${defs.size}）— 正規表現がコード形式に未対応の可能性\n`};
  const dkre=/id:\s*['"](\w+)['"][\s\S]*?leader:\s*['"]([\w-]+)['"][\s\S]*?list:\s*\{([\s\S]*?)\}/g;
  let d,bad=0,rep=[],deckCount=0;
  while(d=dkre.exec(s)){ deckCount++; let sum=0,miss=[]; const cre=/['"]([\w-]+)['"]\s*:\s*(\d+)/g; let c;
    while(c=cre.exec(d[3])){ sum+=+c[2]; if(!defs.has(c[1]))miss.push(c[1]); }
    if(sum!==50||!defs.has(d[2])||miss.length){ bad++; rep.push(`${d[1]}:sum=${sum}${defs.has(d[2])?'':' LEADER未定義='+d[2]}${miss.length?' MISSING='+miss.join(','):''}`); } }
  if(deckCount<6) throw {stdout:`  ✗ デッキ抽出に失敗（検出 ${deckCount}/6）— 正規表現がコード形式に未対応の可能性\n`};
  if(bad){ throw {stdout:'  NG: '+rep.join(' | ')+'\n'}; }
  console.log('  ✓ 全6デッキ50枚・全カード定義済み（定義数 '+defs.size+' / デッキ '+deckCount+'）');
});

// 3) CPU対CPU
step('CPU対CPU 30戦', ()=>{
  const out=runConcat('cpu','cpu-vs-cpu.js',200000); process.stdout.write('  '+out.trim()+'\n');
  if(!/noWinner=0 doubleAttacks=0/.test(out)) throw {stdout:'  ✗ 期待値(noWinner=0 doubleAttacks=0)を満たさず\n'};
  console.log('  ✓ 勝者あり・二重アタックなし');
});

// 4) 人間オートパイロット
step('人間オートパイロット 30戦', ()=>{
  const out=runConcat('human','human-fuzz.js',180000); process.stdout.write('  '+out.trim().replace(/\n/g,'\n  ')+'\n');
  if(!/真の停止:\s*0/.test(out)) throw {stdout:'  ✗ 真の停止が検出されました\n'};
  if(!/クリック不能プロンプト:\s*なし/.test(out)) throw {stdout:'  ✗ 選択不能プロンプトが検出されました\n'};
  console.log('  ✓ フリーズなし・選択不能プロンプトなし');
});

// 5) カード効果ユニットテスト（ドン状態モデル等の最重要回帰）
step('カード効果ユニット', ()=>{
  const p=path.join(__dirname,'unit-example.js');
  let out;
  try{ out=cp.execSync('node '+JSON.stringify(p),{encoding:'utf8'}); }
  catch(e){ throw {stdout:(e.stdout||'')+(e.stderr||'')}; }
  process.stdout.write('  '+out.trim()+'\n');
  if(!/fail=0/.test(out)) throw {stdout:'  ✗ ユニットテスト失敗\n'};
  console.log('  ✓ カード効果ユニット pass');
});

// 6) Phase3 実装カード(cards-fx.js)の効果検証
step('Phase3 効果カード', ()=>{
  const p=path.join(__dirname,'fx-cards.js');
  let out;
  try{ out=cp.execSync('node '+JSON.stringify(p),{encoding:'utf8'}); }
  catch(e){ throw {stdout:(e.stdout||'')+(e.stderr||'')}; }
  process.stdout.write('  '+out.trim()+'\n');
  if(!/fail=0/.test(out)) throw {stdout:'  ✗ Phase3効果テスト失敗\n'};
  console.log('  ✓ Phase3 効果カード pass');
});

// 7) カスタムデッキ(新効果カード中心)でのCPU対戦（フリーズ/二重アタック無し）
step('カスタムデッキ CPU対戦30戦', ()=>{
  const p=path.join(__dirname,'custom-decks.js');
  let out;
  try{ out=cp.execSync('node '+JSON.stringify(p),{encoding:'utf8',timeout:200000}); }
  catch(e){ throw {stdout:(e.stdout||'')+(e.stderr||'')}; }
  process.stdout.write('  '+out.trim().replace(/\n/g,'\n  ')+'\n');
  if(!/noWinner=0 doubleAttacks=0/.test(out)) throw {stdout:'  ✗ カスタムデッキ対戦で勝者なし/二重アタック\n'};
  console.log('  ✓ カスタムデッキ対戦 健全（新カードがCPUで稼働）');
});

// 8) デッキビルダー（50枚/色/枚数制限の検証＋JSON入出力の往復）
step('デッキビルダー 検証', ()=>{
  const p=path.join(__dirname,'deck-builder.js');
  let out;
  try{ out=cp.execSync('node '+JSON.stringify(p),{encoding:'utf8'}); }
  catch(e){ throw {stdout:(e.stdout||'')+(e.stderr||'')}; }
  process.stdout.write('  '+out.trim()+'\n');
  if(!/fail=0/.test(out)) throw {stdout:'  ✗ デッキビルダー検証 失敗\n'};
  console.log('  ✓ デッキビルダー（構築ルール・JSON往復）pass');
});

console.log('\n'+(failed?`❌ ${failed} 件のチェックが失敗しました`:'✅ 全チェック通過'));
process.exit(failed?1:0);
