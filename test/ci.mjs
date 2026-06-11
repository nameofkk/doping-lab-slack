// CI 워치독 순수로직 — 워크플로별 최신 run 그룹핑 + 에러줄 추출 + 라우팅. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 워크플로별 최신 run — 여러 워크플로 중 하나만 실패해도 잡아야(나중에 돈 성공이 가리지 않게)
function latestPerWf(runs) { const byWf = new Map(); for (const r of runs) { if (!['main', 'master'].includes(r.head_branch)) continue; if (!byWf.has(r.workflow_id)) byWf.set(r.workflow_id, r); } return [...byWf.values()]; }
const runs = [ // desc(최신 먼저) — Deploy가 Tests보다 나중에 성공
  { id: 5, workflow_id: 2, name: 'Deploy to Railway', head_branch: 'main', conclusion: 'success' },
  { id: 4, workflow_id: 1, name: 'Tests', head_branch: 'main', conclusion: 'failure' },
  { id: 3, workflow_id: 1, name: 'Tests', head_branch: 'main', conclusion: 'success' },
  { id: 2, workflow_id: 1, name: 'Tests', head_branch: 'feat/x', conclusion: 'failure' }, // PR 브랜치 → 무시
];
const latest = latestPerWf(runs);
ok(latest.length === 2, '워크플로별 최신 2개(Tests·Deploy)');
const failing = latest.filter(r => r.conclusion === 'failure');
ok(failing.length === 1 && failing[0].name === 'Tests' && failing[0].id === 4, '나중 성공(Deploy)이 가려도 Tests 실패 잡음');
ok(!latest.some(r => r.head_branch === 'feat/x'), 'PR 브랜치 run은 무시(main/master만)');

// 2) 에러줄 추출 — 타임스탬프 프리픽스 제거 + 에러성 줄만
function ciErrorLines(raw) { if (!raw) return ''; const hit = raw.split('\n').filter(l => /error|fail|assert|exception|traceback|cannot|not found|exit code|no such|undefined|module|✕|✗|FAILED|\bE\d{3}\b/i.test(l)).map(l => l.replace(/^[0-9T:.\-Z]+\s/, '').trim()).filter(Boolean); return hit.slice(-25).join('\n'); }
const log = [
  '2026-06-10T19:40:53.1234567Z ===== test session starts =====',
  '2026-06-10T19:40:55.0000000Z collected 42 items',
  '2026-06-10T19:41:10.0000000Z FAILED backend/tests/test_smoke.py::test_smoke_health - assert 503 == 200',
  '2026-06-10T19:41:11.0000000Z some normal line that should be dropped',
  '2026-06-10T19:41:12.0000000Z KeyError: \'status\'',
].join('\n');
const ex = ciErrorLines(log);
ok(ex.includes('FAILED backend/tests/test_smoke.py'), '실패 테스트 줄 추출');
ok(ex.includes("KeyError: 'status'"), '에러 메시지 줄 추출');
ok(!/\d{4}-\d{2}-\d{2}T/.test(ex), '타임스탬프 프리픽스 제거됨');
ok(!ex.includes('normal line'), '비-에러 줄 제외');
ok(ciErrorLines('') === '', '빈 로그 → 빈 문자열(레포 직접 재현 폴백)');

// 3) 상태키는 (repo, workflow) 단위 — 같은 레포의 다른 워크플로가 서로 안 덮어쓰게
const key = (repo, wf) => `${repo}::${wf}`;
ok(key('a/b', 1) !== key('a/b', 2), '같은 레포·다른 워크플로 키 분리');

// 4) 라우팅 — monitorChannel 우선, 없으면 서비스 채널
function ciChannel(settings, svcCh) { return settings.monitorChannel || svcCh || settings.hqChannel || null; }
ok(ciChannel({ monitorChannel: 'CMON' }, 'CSVC') === 'CMON', '모니터링 채널 우선');
ok(ciChannel({ monitorChannel: null, hqChannel: 'CHQ' }, 'CSVC') === 'CSVC', '없으면 서비스 채널');
ok(ciChannel({ monitorChannel: null, hqChannel: 'CHQ' }, null) === 'CHQ', '서비스 채널 없으면 본사 채널');

console.log(fail ? '\n❌ ci 실패 ' + fail : '\n✅ ci 전부 통과');
process.exit(fail ? 1 : 0);
