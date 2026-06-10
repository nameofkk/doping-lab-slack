// Q6 안티패턴 메모리 — 교훈 저장(source='lesson') + recall(키워드 무관 항상) + 명령 파싱. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const TTL = 90 * 86400000; const now = 1000000000000;

// 저장 모델: facts[repo]=[{text,at,source}], lesson은 source='lesson'
const facts = { 'nameofkk/sponono': [
  { text: '결제 코드는 통화 센트 단위라 100으로 나눠야 함', at: now - 86400000, source: 'lesson' },
  { text: '일반 사실 하나', at: now - 86400000, source: 'work' },
  { text: 'alembic 실패하면 uvicorn 안 떠 = 부팅 사망', at: now - 200 * 86400000, source: 'lesson' }, // 만료
] };
function recallLessons(repo) {
  const arr = (facts[repo] || []).filter(f => f.source === 'lesson' && now - (f.at || 0) < TTL).slice(-8);
  if (!arr.length) return '';
  return '\n\n[이 레포에서 전에 막혔거나 사용자가 고쳐준 것 — 같은 실수 반복 금지]\n' + arr.map(f => '- ' + f.text).join('\n');
}
const out = recallLessons('nameofkk/sponono');
ok(out.includes('통화 센트'), 'lesson만 회상(work 사실 제외)');
ok(!out.includes('일반 사실'), 'source=work는 교훈 회상에서 제외');
ok(!out.includes('alembic'), '만료(90일↑) 교훈 제외');
ok(out.includes('반복 금지'), '회상 헤더에 반복금지 명시(주입용)');
ok(recallLessons('nameofkk/none') === '', '교훈 없으면 빈 문자열');

// 명령 파싱: "교훈 추가 <내용>"
const addRe = /교훈\s*(추가|등록|기록)\s+(.+)$/;
const m = '스포노노 교훈 추가 결제는 통화 센트라 100으로 나눠'.match(addRe);
ok(m && m[2].includes('100으로 나눠'), '교훈 추가 명령 파싱');
// 조회 regex (단독)
const listRe = /(^|\s)교훈(\s*(목록|리스트|보여줘?|있어\??|확인))?\s*[?？]?\s*$/;
ok(listRe.test('교훈 목록'), '교훈 목록 매칭');
ok(listRe.test('스포노노 교훈'), '레포 교훈 매칭');
ok(!listRe.test('교훈 추가 x'), '교훈 추가는 조회 아님');

// 캡처 조건: 빌드 미완성 OR 사용자 피드백(기존수정)일 때만
function captureOnIncomplete(incomplete, repo) { return !!(incomplete && repo); }
function captureOnFeedback(fbBuild, repo, newProject) { return !!(fbBuild && repo && !newProject); }
ok(captureOnIncomplete(true, 'r') === true, '미완성 빌드 → 교훈 추출');
ok(captureOnIncomplete(false, 'r') === false, '완성되면 교훈 안 만듦');
ok(captureOnFeedback('히어로 색 어둡게', 'r', false) === true, '기존수정 피드백 → 교훈');
ok(captureOnFeedback('x', 'r', true) === false, '신규프로젝트 첫빌드 피드백은 교훈 X');

console.log(fail ? '\n❌ lessons 실패 ' + fail : '\n✅ lessons 전부 통과');
process.exit(fail ? 1 : 0);
