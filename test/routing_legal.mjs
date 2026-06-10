// 법무 쿨다운 + 헬스 서비스별 채널 라우팅 + 빈전달 판정 — index.js 로직 복제 검증
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 법무·규제 검토 트리거 — 신규 OR (규제 && 레포쿨다운 12h 지남)
const COOL = 12 * 3600000;
function legalDue(newProject, regulated, lastAt, now) { return newProject || (regulated && now - (lastAt || 0) > COOL); }
const t0 = 1000000000000;
ok(legalDue(true, false, 0, t0) === true, '신규 빌드는 항상 검토');
ok(legalDue(false, true, 0, t0) === true, '규제건드림 + 첫 검토 → 실행');
ok(legalDue(false, true, t0 - 1000, t0) === false, '규제건드림이지만 방금 검토함 → 스킵(이어서 반복 방지)');
ok(legalDue(false, true, t0 - (13 * 3600000), t0) === true, '12h 지나면 재검토');
ok(legalDue(false, false, 0, t0) === false, '비규제 기존작업 → 검토 안 함');

// 2) regulatedTask 판정 — 일부만
const reReg = /개인정보|회원|가입|로그인|인증|수집|결제|구독|금융|저작권|크롤|스크랩|광고|위치정보|생체|연령/i;
ok(reReg.test('회원가입 완료 → 푸시 권한'), '회원가입=규제');
ok(reReg.test('결제 웹훅 점검'), '결제=규제');
ok(!reReg.test('히어로 색을 더 어둡게'), '디자인 수정=비규제');
ok(!reReg.test('사용자한테 보이는 화면 마저 완성'), '일반 화면완성=비규제(이어서 오검출 방지)');

// 3) 헬스 채널 라우팅 — channelForWork(repo,'health',fallback) = workRoute > repoChannel > fallback
function channelForWork(workRoute, repoChannel, repo, func, fallback) { return (workRoute[repo + ':' + func]) || (repoChannel[repo]) || fallback || null; }
const wr = {}, rc = { 'nameofkk/sponono': 'C_SPON' };
ok(channelForWork(wr, rc, 'nameofkk/sponono', 'health', 'C_WWP') === 'C_SPON', 'sponono 헬스 → 자기 담당채널(남 채널 아님)');
ok(channelForWork(wr, {}, 'nameofkk/sponono', 'health', 'C_WWP') === 'C_WWP', '담당채널 미지정 → fallback');
ok(channelForWork({ 'nameofkk/sponono:health': 'C_OPS' }, rc, 'nameofkk/sponono', 'health', 'C_WWP') === 'C_OPS', 'workRoute override 우선');
// 서비스별 분리: 두 서비스가 다른 채널이면 각자 따로
const svcs = [{ repo: 'nameofkk/sponono', ch0: 'C_MIX' }, { repo: 'nameofkk/wewantpeace', ch0: 'C_MIX' }];
const rc2 = { 'nameofkk/sponono': 'C_SPON', 'nameofkk/wewantpeace': 'C_WWP' };
const grouped = {}; for (const s of svcs) { const tch = channelForWork(wr, rc2, s.repo, 'health', s.ch0); (grouped[tch] = grouped[tch] || []).push(s.repo); }
ok(Object.keys(grouped).length === 2, '담당채널 지정 시 두 서비스 분리(한 채널에 안 섞임)');

// 4) 빈 전달 판정 — 스테이지 변경 없고 origin대비 0커밋이면 "변경 없음"
function deliveredNothing(stagedNow, aheadN) { return !stagedNow && aheadN === 0; }
ok(deliveredNothing(false, 0) === true, '워킹트리 비고 커밋차 0 → 변경없음(거짓완료 방지)');
ok(deliveredNothing(true, 0) === false, '스테이지 변경 있으면 전달함');
ok(deliveredNothing(false, 2) === false, '에이전트가 이미 커밋(앞선 2커밋) → 전달함');

console.log(fail ? '\n❌ routing_legal 실패 ' + fail : '\n✅ routing_legal 전부 통과');
process.exit(fail ? 1 : 0);
