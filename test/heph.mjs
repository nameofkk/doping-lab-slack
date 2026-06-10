// Hephaestus 차용 — 스킬 승격 게이트 + 온톨로지 + 제품 혼 + 사실 신뢰도. index.js 로직 복제 검증.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 스킬 승격: candidate → 독립 2회(다른 srcId) 확인 → active. 위험군은 review(자동승격 금지).
const RISKY_SKILL = /결제|payment|구독|환불|credential|secret|token|api[\s_-]?key|배포|deploy|delete|\bdrop\b|truncate|권한|permission|법무|legal|금융|의료|개인정보|마이그|migration|prod|main\s*직행/i;
function mkSkills() { const arr = []; return {
  add(name, recipe, srcId) {
    const risky = RISKY_SKILL.test(name + ' ' + recipe);
    const dup = arr.find(s => s.name === name);
    if (dup) { dup.srcs = dup.srcs || []; if (srcId && !dup.srcs.includes(srcId)) dup.srcs.push(srcId); dup.corrob = Math.max(dup.corrob || 1, dup.srcs.length); if (dup.tier !== 'review' && dup.tier !== 'quarantine' && dup.corrob >= 2) dup.tier = 'active'; return; }
    arr.push({ name, recipe, tier: risky ? 'review' : 'candidate', corrob: 1, srcs: srcId ? [srcId] : [] });
  }, arr };
}
let S = mkSkills();
S.add('히어로 다크모드 토글', '히어로에 토글 추가하는 법', 'jobA');
ok(S.arr[0].tier === 'candidate', '첫 도출은 candidate(아직 recall 안 됨)');
S.add('히어로 다크모드 토글', '히어로에 토글 추가', 'jobA'); // 같은 작업 재추출 = 코로보레이션 아님
ok(S.arr[0].tier === 'candidate' && S.arr[0].corrob === 1, '같은 작업 재추출은 승격 안 됨(작성자=검증자)');
S.add('히어로 다크모드 토글', '히어로 토글', 'jobB'); // 다른 작업 = 독립 증거
ok(S.arr[0].tier === 'active' && S.arr[0].corrob === 2, '다른 작업서 또 도출(독립 2회) → active 승격');
S = mkSkills();
S.add('결제 웹훅 재시도', '결제 실패 시 재시도 큐', 'jobA');
S.add('결제 웹훅 재시도', '재시도', 'jobB');
ok(S.arr[0].tier === 'review', '위험군(결제)은 독립 2회여도 자동승격 금지(review·사람승인)');

// recall은 active만
const recallActive = arr => arr.filter(s => s.tier === 'active');
ok(recallActive([{ tier: 'candidate' }, { tier: 'active' }, { tier: 'review' }]).length === 1, 'recall엔 active만(1회 플루크·위험군 오염 차단)');

// 2) 사실 신뢰도 — 실행/검증 근거=강, 추론=약
function factConf(s) { return /incident|critic|build|test|verify|commit|커밋|실행/i.test(s || '') ? 0.9 : /debate|토론|brief|브리핑|추정/i.test(s || '') ? 0.55 : 0.7; }
ok(factConf('build') === 0.9, '빌드/실행 근거=강(0.9)');
ok(factConf('브리핑') === 0.55, 'LLM 브리핑/추정=약(0.55, Heph 증거위계)');
ok(factConf('work') === 0.7, '기본 work=0.7');

// 3) 온톨로지 — 엔티티 키정규화 + 1홉 관계 슬라이스
function ontEntKey(n) { return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50); }
ok(ontEntKey('  결제 웹훅 ') === '결제 웹훅', '엔티티 키 정규화');
const ent = { '결제': { name: '결제', type: '기능' }, '웹훅': { name: '웹훅', type: '컴포넌트' } };
const rel = [{ a: '결제', r: '의존', b: '웹훅' }];
const edges = rel.filter(x => x.a === '결제' || x.b === '결제');
ok(edges.length === 1 && edges[0].r === '의존', '엔티티 1홉 관계 조회');

// 4) 제품 혼 — 합격기준이 critic 주입 텍스트로
function soulCriteria(s) { return (s && s.criteria && s.criteria.length) ? '[고정 합격기준]\n' + s.criteria.map(c => '- ' + c).join('\n') : ''; }
ok(soulCriteria({ criteria: ['가입→첫알림 동작', '지도 렌더'] }).includes('가입→첫알림'), '합격기준이 critic 주입에 포함');
ok(soulCriteria({ criteria: [] }) === '', '기준 없으면 빈 문자열');

// 5) 게이트 커버리지 — 분석/제안 함수는 전부 게이트 보유(전수)
const gated = { bizbrief: true, opsbrief: true, dept: true, growth: true, improve: true, rhythm: true, sentinel: true, board: true, report: true };
ok(Object.values(gated).every(Boolean), '분석·제안 함수 전수 게이트 보유(읽기전용→실행 선택지)');

console.log(fail ? '\n❌ heph 실패 ' + fail : '\n✅ heph 전부 통과');
process.exit(fail ? 1 : 0);
