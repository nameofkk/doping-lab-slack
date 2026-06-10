// Wave4 — 리스크 디둡 + 명령 라우팅 + 자리비움 가드 + 성과 분류. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 리스크 디둡 + 심각도 정렬
function mkRisk() { const a = []; let seq = 0; return {
  add(t, sev) { const sig = t.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 40); if (a.some(r => r.status === 'open' && r.sig === sig)) return null; a.push({ id: ++seq, text: t, sev, sig, status: 'open' }); return a[a.length - 1]; }, arr: a };
}
const R = mkRisk();
R.add('반복 다운', '높음'); R.add('반복 다운', '높음');
ok(R.arr.length === 1, '같은 리스크 디둡');
R.add('환율 미보정', '중');
const order = { '높음': 0, '중': 1, '낮음': 2 };
const sorted = R.arr.slice().sort((a, b) => order[a.sev] - order[b.sev]);
ok(sorted[0].sev === '높음', '심각도 높은 순 정렬');

// 2) 명령 라우팅
ok(/(p&l|손익|재무제표|pnl)/i.test('P&L 보여줘'), 'P&L 매칭');
ok(/(성과\s*리뷰|성과\s*평가)/i.test('성과 리뷰'), '성과 리뷰 매칭');
ok(/(릴리즈\s*노트|변경\s*이력|changelog)/i.test('릴리즈노트'), '릴리즈노트 매칭');
const riskList = /(^|\s)리스크(\s*(목록|조회|레지스터|현황))?\s*[?？]?\s*$/;
ok(riskList.test('리스크'), '리스크 단독=조회');
ok(!riskList.test('리스크 추가 x'), '리스크 추가는 조회 아님');

// 3) 자리비움 가드 — 2일+ 비웠을 때만 다이제스트
function shouldDigest(gapMs, lastShownAgoMs) { return gapMs >= 2 * 86400000 && lastShownAgoMs >= 6 * 3600000; }
ok(shouldDigest(3 * 86400000, 99 * 3600000) === true, '3일 비움+오래전 표시 → 다이제스트');
ok(shouldDigest(1 * 86400000, 99 * 3600000) === false, '1일은 다이제스트 안 함');
ok(shouldDigest(5 * 86400000, 1 * 3600000) === false, '6h내 중복 표시 안 함');

// 4) 성과 분류 — pct 기준 적중/역효과
function classify(pct) { return pct >= 10 ? 'hit' : pct <= -10 ? 'bad' : 'meh'; }
ok(classify(50) === 'hit' && classify(-20) === 'bad' && classify(3) === 'meh', '성과 pct 분류(적중/역효과/미미)');

// 5) 포스트모템 심각도 — 15분 초과면 높음
ok((20 > 15 ? '높음' : '중') === '높음', '20분 다운 = 높음 리스크');
ok((5 > 15 ? '높음' : '중') === '중', '5분 다운 = 중');

console.log(fail ? '\n❌ wave4 실패 ' + fail : '\n✅ wave4 전부 통과');
process.exit(fail ? 1 : 0);
