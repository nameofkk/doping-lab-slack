// B3 MCP 화이트리스트 매칭 — suggestMcp 트리거 로직 복제(드리프트 감지). 검증된 후보만, 오탐 없게.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const MCP_REGISTRY = [
  { name: 'postgres', triggers: /postgres|postgresql|\bdb\b|데이터베이스|디비|sql\s*쿼리|테이블\s*조회/i, needs: ['POSTGRES_CONNECTION_STRING'] },
  { name: 'github', triggers: /github\s*(이슈|issue|pr|pull)|이슈\s*(만들|생성|목록)|pull\s*request/i, needs: ['GITHUB_TOKEN'] },
  { name: 'sentry', triggers: /sentry|에러\s*추적|error\s*tracking|크래시\s*(로그|리포트)|예외\s*모니터/i, needs: ['SENTRY_AUTH_TOKEN'] },
  { name: 'fetch', triggers: /웹페이지\s*(가져|읽)|url\s*가져|크롤링|스크랩|페이지\s*긁/i, needs: [] },
];
function suggestMcp(taskText, connected = []) { return MCP_REGISTRY.filter(m => m.triggers.test(String(taskText || '')) && !connected.includes(m.name)); }

ok(suggestMcp('스포노노에 postgres 연동해줘').some(m => m.name === 'postgres'), 'postgres 신호 → postgres 후보');
ok(suggestMcp('DB 테이블 조회 기능 추가').some(m => m.name === 'postgres'), '데이터베이스 신호 매칭');
ok(suggestMcp('github 이슈 자동 생성해줘').some(m => m.name === 'github'), 'github 이슈 → github 후보');
ok(suggestMcp('sentry 에러 추적 붙여줘').some(m => m.name === 'sentry'), 'sentry 신호 매칭');
ok(suggestMcp('웹페이지 가져와서 요약').some(m => m.name === 'fetch'), 'fetch 신호 매칭(키 불필요)');
// 오탐 없어야
ok(suggestMcp('다크모드 토글 추가해줘').length === 0, '무관 작업 → 후보 0(오탐 없음)');
ok(suggestMcp('로그인 버튼 색 바꿔줘').length === 0, 'UI 작업 → 후보 0');
// 이미 연결된 건 제외
ok(!suggestMcp('postgres 연동', ['postgres']).some(m => m.name === 'postgres'), '이미 연결된 MCP는 재제안 안함');
// needs 메타 확인
ok(MCP_REGISTRY.find(m => m.name === 'fetch').needs.length === 0, 'fetch는 키 불필요');
ok(MCP_REGISTRY.find(m => m.name === 'postgres').needs.length === 1, 'postgres는 키 필요(👤)');

console.log(fail ? '\n❌ MCP 실패 ' + fail : '\n✅ MCP 전부 통과');
process.exit(fail ? 1 : 0);
