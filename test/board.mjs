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

// 5) D1 닫힌 루프 — target_key 검증(validMetricKey) + 추적 등록 baseline + 효과측정
const BIZ_LABELS = { 'admin.monthly_revenue': { ko: '이번달 매출' }, 'admin.subscribers': { ko: '구독자' }, 'admin.dau': { ko: '활성유저' } };
const validMetricKey = k => (k && typeof k === 'string' && BIZ_LABELS[k]) ? k : null;
ok(validMetricKey('admin.monthly_revenue') === 'admin.monthly_revenue', '유효 지표키 통과');
ok(validMetricKey('made_up_key') === null, '미등록 지표키 거름(null)');
ok(validMetricKey(null) === null, 'null 지표키 안전');
// CEO focus에 target_key 달려 파싱되는지
const fJson = '{"focus":[{"repo":"wewantpeace","task":"매출 0 조사","kind":"investigate","target":"실MRR","target_key":"admin.monthly_revenue"},{"repo":"wewantpeace","task":"가짜키","kind":"build","target":"x","target_key":"bogus"}]}';
const ff = JSON.parse(fJson).focus.map(f => ({ ...f, targetKey: validMetricKey(f.target_key) }));
ok(ff[0].targetKey === 'admin.monthly_revenue', 'focus target_key 유효키 보존');
ok(ff[1].targetKey === null, 'focus target_key 가짜키 null');
// 추적 등록 baseline 캡처 + 효과측정 pct
const cur = { 'admin.monthly_revenue': 190000 };
const exp = { targetKey: 'admin.monthly_revenue', baseline: (typeof cur['admin.monthly_revenue'] === 'number' ? cur['admin.monthly_revenue'] : null) };
ok(exp.baseline === 190000, '추적 등록 시 baseline 캡처');
const after = { 'admin.monthly_revenue': 228000 };
const pct = exp.baseline ? Math.round((after['admin.monthly_revenue'] - exp.baseline) / exp.baseline * 100) : null;
ok(pct === 20, '효과측정 pct(+20% 적중) 계산');
// source 라벨
const srcLbl = s => s === 'board' ? '경영회의' : s === 'dept' ? '부서' : '그로스';
ok(srcLbl('board') === '경영회의' && srcLbl('dept') === '부서' && srcLbl('growth') === '그로스', 'source 라벨링');

// 11) D2 운영 리듬 — applyRhythm 적용 로직
function applyRhythm(opsConfig, changes) {
  const applied = [];
  for (const c of (changes || [])) { const o = opsConfig[c.id]; if (!o) continue;
    if (c.field === 'cadence' && ['daily', 'weekly', 'monthly'].includes(c.value)) { o.cadence = c.value; applied.push(c); }
    else if (c.field === 'enabled') { o.enabled = (c.value === true || c.value === 'true'); applied.push(c); }
    else if (c.field === 'hour') { const h = parseInt(c.value, 10); if (h >= 0 && h <= 23) { o.hour = h; applied.push(c); } }
    else if (c.field === 'dow') { const d = parseInt(c.value, 10); if (d >= 0 && d <= 6) { o.dow = d; applied.push(c); } }
    o.lastRunDay = null; }
  return applied;
}
const oc = { growth: { cadence: 'weekly', dow: 2, hour: 10, enabled: true, lastRunDay: 20260609 }, bizbrief: { cadence: 'daily', hour: 10, enabled: true } };
let ap = applyRhythm(oc, [{ id: 'growth', field: 'cadence', value: 'monthly' }, { id: 'bizbrief', field: 'enabled', value: 'false' }]);
ok(ap.length === 2, '리듬 변경 2건 적용');
ok(oc.growth.cadence === 'monthly', '그로스 주기 monthly로 변경');
ok(oc.bizbrief.enabled === false, '사업브리핑 끄기 적용');
ok(oc.growth.lastRunDay === null, '변경 시 lastRunDay 리셋(다음 due 재평가)');
ok(applyRhythm(oc, [{ id: 'growth', field: 'hour', value: 25 }]).length === 0, '잘못된 시각(25시) 거부');
ok(applyRhythm(oc, [{ id: 'nope', field: 'cadence', value: 'daily' }]).length === 0, '없는 업무 id 무시');

console.log(fail ? '\n❌ board 실패 ' + fail : '\n✅ board 전부 통과');
process.exit(fail ? 1 : 0);
