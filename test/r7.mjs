// R7 장기메모리 — addFact(중복/캡), recallFacts(키워드 회상), 명령 정규식
let facts = {};
function addFact(key, text) { const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 220); if (!t || t.length < 6) return; const arr = (facts[key] = facts[key] || []); if (arr.some(f => f.text === t)) return; arr.push({ text: t, at: 1 }); if (arr.length > 40) facts[key] = arr.slice(-40); }
function recallFacts(key, taskText) { const arr = facts[key] || []; if (!arr.length) return ''; const words = String(taskText || '').toLowerCase().match(/[a-z가-힣0-9]{2,}/g) || []; const scored = arr.map(f => ({ f, s: words.filter(w => f.text.toLowerCase().includes(w)).length })); const rel = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.f); const use = rel.length ? rel : arr.slice(-5); return use.map(f => f.text); }
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
addFact('R', '스포노노는 FastAPI+Redis+Postgres 스택'); addFact('R', '스포노노는 FastAPI+Redis+Postgres 스택'); // 중복
addFact('R', '캐릭터 Mochi 11종 SVG'); addFact('R', 'a'); // 너무 짧음 → 무시
ok(facts.R.length === 2, '중복·짧은 것 제외(2개): ' + facts.R.length);
for (let i = 0; i < 50; i++) addFact('R', 'fact number ' + i); ok(facts.R.length === 40, '40개 캡: ' + facts.R.length);
facts = {}; addFact('R', '스포노노 결제는 RevenueCat 쓰기로 결정'); addFact('R', '캐릭터는 Mochi 스타일'); addFact('R', 'Redis 캐시 키에 패턴 원문 금지');
const rec = recallFacts('R', '스포노노 결제 붙여줘');
ok(rec[0].includes('RevenueCat'), '키워드(결제) 관련 사실 우선 회상: ' + rec[0]);
ok(recallFacts('없는키', '아무거나') === '', '없는 키 → 빈 회상');
const cmd = raw => (/(^|\s)(기억|메모리)(\s*(목록|리스트|보여줘?|뭐\s*있어|있어\??|봐줘?|확인))?\s*[?？]?\s*$/.test(raw) || /^뭐\s*기억/.test(raw)) && !/(기억해|해줘|하지\s?마|지워|삭제|넣어)/.test(raw);
ok(cmd('기억 목록'), '기억 목록→조회'); ok(cmd('메모리'), '메모리→조회'); ok(cmd('스포노노 기억'), '스포노노 기억(앞에 레포)→조회');
ok(!cmd('이거 기억해줘'), '기억해줘→조회 아님(저장 의도)'); ok(!cmd('기억 지워'), '기억 지워→조회 아님');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
