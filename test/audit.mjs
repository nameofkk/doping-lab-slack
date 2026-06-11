// 전수감사 픽스 순수로직 회귀 — index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// A-2: isProd 동적 판정 — 정적목록 ∪ 라이브URL ∪ 사업지표
const PROD_REPOS = ['nameofkk/sponono', 'nameofkk/wewantpeace', 'nameofkk/myungjak'];
function isProd(repo, services, bizData) { return PROD_REPOS.includes(repo) || (services[repo] && !!services[repo].url) || !!bizData[repo]; }
ok(isProd('nameofkk/sponono', {}, {}), '정적 프로드 목록');
ok(isProd('a/new', { 'a/new': { url: 'http://x' } }, {}), '라이브 URL 있으면 프로드(신규 온보딩)');
ok(isProd('a/biz', {}, { 'a/biz': {} }), '사업지표 추적 중이면 프로드');
ok(!isProd('a/random', {}, {}), '아무것도 없으면 비프로드');

// A-1: 프로드/미완성은 PR 강제(main 직행 금지)
function mustPR(forcePR, prod, incomplete) { return forcePR || (prod && !forcePR) || (incomplete && !forcePR); }
ok(mustPR(false, true, false), '프로드는 PR 강제');
ok(mustPR(false, false, true), '미완성은 PR 강제');
ok(!mustPR(false, false, false), '비프로드+완성은 main 직행 가능');

// B-8: 효과측정 배포검증 — changelog(배포) 있어야 적중
function credited(pct, repo, expAt, changelog) { return pct >= 10 && (changelog[repo] || []).some(c => c.at > expAt); }
ok(credited(20, 'r', 100, { r: [{ at: 200 }] }), '배포(changelog) 있으면 적중');
ok(!credited(20, 'r', 100, { r: [{ at: 50 }] }), '실험 시작 전 배포만 있으면 귀속 안 함');
ok(!credited(20, 'r', 100, {}), '배포 없으면(유기적 성장) 적중 안 함');

// B-10: 스킬 강등 — fail 2회 또는 fail>pass면 review
function tierAfter(pass, fail) { return (fail >= 2 || fail > pass) ? 'review' : 'active'; }
ok(tierAfter(5, 2) === 'review', 'fail 2회 → 강등');
ok(tierAfter(1, 2) === 'review', 'fail>pass → 강등');
ok(tierAfter(5, 1) === 'active', 'fail 1회·pass 많으면 유지');

// C-12: 게이트 gid 불일치 = 옛 버튼 거부
function gateStale(btnGid, curGid) { return !!(btnGid && curGid && btnGid !== curGid); }
ok(gateStale('g1', 'g2'), '옛 버튼(gid 불일치) 거부');
ok(!gateStale('g2', 'g2'), '현재 버튼(gid 일치) 통과');

// A-5: childEnv 민감키 제외
const CHILD_ENV_DENY = new Set(['SLACK_BOT_TOKEN', 'BOT_STATS_KEY', 'RAILWAY_TOKEN', 'OWNER_USER_ID']);
function childEnv(env) { const e = {}; for (const k of Object.keys(env)) if (!CHILD_ENV_DENY.has(k)) e[k] = env[k]; return e; }
const ce = childEnv({ PATH: '/x', SLACK_BOT_TOKEN: 'xoxb', GITHUB_TOKEN: 'gh', BOT_STATS_KEY: 'k' });
ok(ce.PATH === '/x' && ce.GITHUB_TOKEN === 'gh', 'claude 필요 env는 유지(PATH·GITHUB_TOKEN)');
ok(!('SLACK_BOT_TOKEN' in ce) && !('BOT_STATS_KEY' in ce), 'Slack·stats 토큰은 자식 env에서 제외');

// D-17: 다운 재에스컬레이션 마크 — 더 높은 임계만 새로 발화
function escalate(failStreak, prevMark) { for (const m of [15, 60, 240]) if (failStreak >= m && prevMark < m) return m; return prevMark; }
ok(escalate(15, 0) === 15, '15연속 → 1차 에스컬');
ok(escalate(60, 15) === 60, '60연속 → 2차');
ok(escalate(20, 15) === 15, '같은 구간 재발화 안 함');

// D-20: id seq 복원 = max(기존 id), 오프셋 제거 → 단조 증가
function nextId(items, seq) { const restored = items.reduce((m, x) => Math.max(m, x.id || 0), seq); return restored + 1; }
ok(nextId([{ id: 1003 }, { id: 7 }], 0) === 1004, '재시작 후 max id+1(충돌 없음)');

console.log(fail ? '\n❌ audit 실패 ' + fail : '\n✅ audit 전부 통과');
process.exit(fail ? 1 : 0);
