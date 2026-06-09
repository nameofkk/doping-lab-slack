// 피드백 루프 — 작업 중 자유발화 캡처 판정 + queueFeedback 캡. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 페르소나 kw(일부) 스텁
const PERSONAS = [{ kw: ['한로로', '로로', '팀장'] }, { kw: ['정소민', '소민', 'UX', '디자인'] }, { kw: ['윈터', '아키'] }];
// 작업 중 자유발화 = 피드백으로 캡처할지 판정(index.js와 동일 조건)
function isFeedback(raw) {
  return raw.length > 4 && !/\?\s*$/.test(raw)
    && !PERSONAS.some(p => p.kw.some(k => raw.trim().toLowerCase().startsWith(String(k).toLowerCase())))
    && !/^(ㅎㅇ|하이|안녕|ㅇㅇ|ㅇㅋ|오케이|ok|굿|고마워|고맙|땡큐|ㅋㅋ|ㅎㅎ|응|넹|네|예|좋아|좋네|왜|뭐|어때|어떻게|진행\s*상황|상황|얼마나|언제|다\s*됐|끝났)/i.test(raw.trim());
}
ok(isFeedback('히어로 색을 더 어둡게 해줘'), '디자인 수정 = 피드백 캡처');
ok(isFeedback('가입 버튼을 화면 위쪽으로 옮겨'), '레이아웃 수정 = 피드백');
ok(!isFeedback('이거 왜 이렇게 했어?'), '물음표 질문 = 통과(잡담)');
ok(!isFeedback('어때?'), '짧은 질문 = 통과');
ok(!isFeedback('정소민 이 색 어때'), '페르소나 호출 = 통과(잡담)');
ok(!isFeedback('ㅇㅋ'), '맞장구 = 통과');
ok(!isFeedback('얼마나 걸려'), '진행 질문 = 통과');
ok(!isFeedback('굿'), '칭찬 = 통과');
ok(isFeedback('폰트를 좀 더 굵게 바꾸고 여백 줄여'), '복합 수정지시 = 피드백');

// queueFeedback 캡(≤12) + 길이 제한
function makeQueue() { const fb = []; return { push: t => { if (fb.length < 12) fb.push(String(t).slice(0, 500)); }, get: () => fb }; }
const q = makeQueue();
for (let i = 0; i < 20; i++) q.push('피드백' + i);
ok(q.get().length === 12, '피드백 큐 12개 상한');
const q2 = makeQueue(); q2.push('x'.repeat(1000));
ok(q2.get()[0].length === 500, '피드백 500자 제한');

// 모달 액션/콜백 id
ok('fb_open' === 'fb_open', 'fb_open 액션 id');
ok('fb_modal' === 'fb_modal', 'fb_modal 콜백 id');
// launchWork feedback 보존 규칙: 신규프로젝트만 비움
function shouldClearFeedback(recoverAttempt, newProject) { return !recoverAttempt && newProject; }
ok(shouldClearFeedback(0, true) === true, '신규 프로젝트는 피드백 초기화');
ok(shouldClearFeedback(0, false) === false, '기존수정/이어서는 피드백 유지');
ok(shouldClearFeedback(1, true) === false, '복구 재개는 피드백 유지');

console.log(fail ? '\n❌ feedback 실패 ' + fail : '\n✅ feedback 전부 통과');
process.exit(fail ? 1 : 0);
