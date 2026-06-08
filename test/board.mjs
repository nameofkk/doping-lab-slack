// Phase C 경영회의 — 명령 라우팅 regex + 목표(OKR) 파싱 + CEO focus JSON 파싱. index.js 로직 복제(한글 뒤 \b 회피 검증).
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 경영회의 명령 regex (index.js와 동일)
const boardRe = /(경영\s*회의|이사회|전략\s*회의|주간\s*회의|board\s*meeting|위클리\s*리뷰)/i;
ok(boardRe.test('경영회의'), '경영회의 매칭');
ok(boardRe.test('경영 회의 ㄱㄱ'), '경영 회의(공백) 매칭');
ok(boardRe.test('이사회 열어'), '이사회 매칭');
ok(boardRe.test('board meeting'), 'board meeting 매칭');
ok(!boardRe.test('고객 검토'), '고객 검토는 경영회의 아님');
ok(!boardRe.test('회의실 예약'), '회의실은 경영회의 아님');

// 2) 목표 등록 파싱 — 한글 뒤 \b 안 씀
const regRe = /목표\s*(등록|추가|설정)|okr\s*(등록|추가|설정)/i;
const mRe = /(?:목표|okr)\s*(?:등록|추가|설정)\s+(\S+)\s+([\s\S]+)/i;
ok(regRe.test('목표 등록 wewantpeace 이번 분기 유료 30명'), '목표 등록 트리거');
const m = '목표 등록 wewantpeace 이번 분기 유료 구독 30명'.match(mRe);
ok(m && m[1] === 'wewantpeace', '목표 등록 repo 파싱');
ok(m && m[2] === '이번 분기 유료 구독 30명', '목표 등록 내용 파싱(공백 포함)');
ok(regRe.test('OKR 추가 sponono 첫 차단 100건'), 'OKR 추가 트리거');

// 3) 목표 조회 regex — "목표" 단독 매칭(한글 뒤 \b 버그 회피 핵심)
const listRe1 = /^\s*(목표|okr)\s*$/i;
const listRe2 = /목표\s*(조회|목록|현황)|okr\s*(조회|목록|현황)/i;
ok(listRe1.test('목표'), '목표 단독 조회 매칭');
ok(listRe1.test('  OKR  '), 'OKR 단독(공백) 조회 매칭');
ok(listRe2.test('목표 목록'), '목표 목록 매칭');
ok(!listRe1.test('목표 등록 x y'), '목표 등록은 단독조회 아님');

// 4) CEO focus JSON 파싱 (prose + JSON 혼합 → focus만 추출)
const ceoRaw = `이번 주는 매출 0 이슈가 제일 급해. 알림 누수도 크지만 결제부터.\n측정 갭은 다음 주로 미룸.\n{"focus":[{"repo":"wewantpeace","task":"유료 6명 매출 0 원인 결제 웹훅 점검","kind":"investigate","target":"이번달 매출 정상화","why":"MRR 0은 치명"},{"repo":"wewantpeace","task":"첫 이슈 클릭 후 알림 권한 다이얼로그 추가","kind":"build","target":"푸시대상 50%+","why":"47/241=19%"}]}`;
const cjm = ceoRaw.match(/\{[\s\S]*"focus"[\s\S]*\}/);
ok(!!cjm, 'focus JSON 블록 발견');
const focus = cjm ? (JSON.parse(cjm[0]).focus || []).filter(f => f && f.task && ['investigate', 'build'].includes(f.kind)).slice(0, 3) : [];
ok(focus.length === 2, 'focus 2건 파싱');
ok(focus[0].kind === 'investigate' && focus[1].kind === 'build', 'focus kind 유효성');
const digest = ceoRaw.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*"focus"[\s\S]*\}/, '').trim();
ok(!/focus/.test(digest) && /매출 0/.test(digest), '회의록(prose)에서 JSON 제거됨');
// kind 필터: 잘못된 kind 제외
const bad = JSON.parse('{"focus":[{"task":"x","kind":"deploy"},{"task":"y","kind":"build"}]}').focus.filter(f => f && f.task && ['investigate', 'build'].includes(f.kind));
ok(bad.length === 1, '허용 안 된 kind(deploy) 제외');

console.log(fail ? '\n❌ board 실패 ' + fail : '\n✅ board 전부 통과');
process.exit(fail ? 1 : 0);
