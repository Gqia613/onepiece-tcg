/* tests/stubs.js — ヘッドレス検証用のDOM/環境スタブ。
   重要: タイマーは setImmediate ベースにする。
   setTimeout(0) のままだと、テスト側の `await setImmediate` 密ループが
   ゲーム側の連続 sleep を飢餓させ「停止」を誤検知するため。 */
function _el(){return {style:{},classList:{add(){},remove(){},toggle(){}},_html:'',set innerHTML(v){this._html=v;},get innerHTML(){return this._html;},textContent:'',value:'',scrollTop:0,offsetHeight:0,offsetWidth:0,appendChild(){},removeChild(){},addEventListener(){},remove(){},querySelector(){return null;},querySelectorAll(){return [];},getBoundingClientRect(){return{left:0,top:0,width:10,height:14,right:10,bottom:14};},getAttribute(){return null;},closest(){return null;}};}
var document={getElementById(){return _el();},querySelector(){return null;},querySelectorAll(){return [];},createElement(){return _el();},addEventListener(){},body:{appendChild(){}}};
var window={innerWidth:1200,innerHeight:800,addEventListener(){}};
var confirm=()=>false, alert=()=>{};
var fetch=()=>Promise.reject(new Error('no-net-in-test'));
global.setTimeout=(cb)=>setImmediate(cb);
