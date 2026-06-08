// 배치3 — I6 facts TTL/충돌/source, I4 riskTier
const FACT_TTL_MS = 90*86400000;
let facts={};
function addFact(key,text,source){ const t=String(text||"").replace(/\s+/g," ").trim().slice(0,220); if(!t||t.length<6)return; const arr=(facts[key]=facts[key]||[]); const sig=t.toLowerCase().replace(/[^a-z가-힣0-9]/g,"").slice(0,24); const dup=arr.findIndex(f=>f.text===t||(f.text.toLowerCase().replace(/[^a-z가-힣0-9]/g,"").slice(0,24)===sig)); if(dup>=0){arr[dup]={text:t,at:Date.now(),source:source||arr[dup].source};return;} arr.push({text:t,at:Date.now(),source:source||"work"}); if(arr.length>40)facts[key]=arr.slice(-40); }
function recallCount(key){ const now=Date.now(); return (facts[key]||[]).filter(f=>now-(f.at||0)<FACT_TTL_MS).length; }
function riskTier(text){ const t=String(text||""); if(/배포|deploy|마이그레이션|삭제|지워|drop|결제|payment|프로덕션|force.?push/i.test(t))return "high"; if(/만들|제작|개발|구현|추가|수정|고치|변경/i.test(t))return "med"; return "low"; }
let fail=0; const ok=(c,m)=>{console.log((c?"PASS":"FAIL")+" "+m);if(!c)fail++;};
addFact("R","스포노노는 FastAPI 스택","조사"); addFact("R","스포노노는 FastAPI 스택!!","작업"); // 근사중복→갱신
ok(facts.R.length===1,"근사중복 갱신(1개): "+facts.R.length);
ok(facts.R[0].source==="작업","갱신 시 최신 source");
facts.S=[{text:"오래된 사실 stale",at:Date.now()-100*86400000,source:"work"},{text:"최근 사실",at:Date.now(),source:"작업"}];
ok(recallCount("S")===1,"90일 지난 사실 만료 제외(1개): "+recallCount("S"));
ok(riskTier("스포노노 배포해줘")==="high"&&riskTier("다크모드 추가")==="med"&&riskTier("코드 조사해줘")==="low","리스크 티어 3단계");
console.log(fail?"\n❌ 실패":"\n✅ 전부 통과");
