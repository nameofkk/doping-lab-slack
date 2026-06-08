// R5 핸들러 정규식 — 계획승인(진행/수정/넘어가) + 보드작업 재개(이어서 #N)
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const approve = r => /^(진행(해|하자|할게|시켜)?|승인(해)?|좋아(요)?|ㄱㄱ|고고|이대로(s*(가자|해|진행))?|오케이|ok|콜)s*$/i.test(r);
const modify = r => /^수정\s*[:：]?\s*(.+)/.test(r);
const drop = r => /^(넘어가|취소|안\s?해|됐어|패스|놔둬)/.test(r);
const jobN = r => { const m = r.match(/^(?:이어서|재개|다시\s*(?:해|시작|돌려))\s*#?\s*(\d+)\b/); return m ? +m[1] : null; };
console.log('--- 계획 승인 ---');
ok(approve('진행'), '진행→승인'); ok(approve('이대로'), '이대로→승인'); ok(approve('ㄱㄱ'), 'ㄱㄱ→승인');
ok(modify('수정: 다크모드 빼줘'), '수정:→수정'); ok(modify('수정 색깔 바꿔'), '수정 →수정');
ok(drop('넘어가'), '넘어가→폐기');
ok(!approve('진행상황 어때'), '진행상황은 승인 아님(\\b)');
console.log('--- 보드 작업 재개 ---');
ok(jobN('이어서 #12') === 12, '이어서 #12'); ok(jobN('재개 5') === 5, '재개 5'); ok(jobN('다시 시작 3') === 3, '다시 시작 3');
ok(jobN('이어서') === null, '이어서(번호없음)→일반재개로'); ok(jobN('이어서 만들어줘') === null, '이어서 만들어줘→번호없음');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
