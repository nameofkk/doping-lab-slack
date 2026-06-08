// Q1 트래젝토리 eval — 입력 메시지 → 기대 "종착 라우팅 결정"을 단언. handle()의 결정론적 라우팅 로직을 그대로 복제(드리프트 감지).
// LLM 부분(classifyIntent.action, intentActionCheck.verdict)은 파라미터로 주입 — 결정론 분기만 검증. (golden은 isSched 절반만, 여긴 종착까지)
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// ── index.js와 동일 (복사본) ──
function parseDaily(text) {
  if (/마다/.test(text)) return null;
  const m = text.match(/(오전|아침|오후|저녁|밤)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/);
  if (!m) return null;
  let h = parseInt(m[2]); const min = m[3] ? parseInt(m[3]) : 0;
  if (/(오후|저녁|밤)/.test(m[1] || '') && h < 12) h += 12;
  if (/(오전|아침)/.test(m[1] || '') && h === 12) h = 0;
  if (/(밤|저녁)/.test(m[1] || '') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { hour: h, minute: min };
}
function parseIntervalMs(t) {
  let m;
  if ((m = t.match(/(\d+)\s*분\s*마다/))) return parseInt(m[1]) * 60000;
  if ((m = t.match(/(\d+)\s*시간\s*마다/))) return parseInt(m[1]) * 3600000;
  if ((m = t.match(/(\d+)\s*일\s*마다/))) return parseInt(m[1]) * 86400000;
  if (/매\s*시간|시간\s*마다/.test(t)) return 3600000;
  if (/매일|하루.?한번|일\s*마다/.test(t)) return 86400000;
  if (/매주|주\s*마다/.test(t)) return 604800000;
  return null;
}
// 스케줄 게이트(index.js:1592) — daily/interval 있고 + 제작/일회성변경/제품명사꼬리가 아니면 열림(=스케줄 후보)
function scheduleGateOpen(raw) {
  const daily = parseDaily(raw); const ims = daily ? null : parseIntervalMs(raw);
  if (!(daily || ims)) return false;
  if (/만들|제작|개발|처음부터|새\s*프로젝트|짜줘|짜봐|구현|변경|전환|바꿔|바꾸|적용|개편|리팩터|마이그레이|형식으로|방식으로|기능\s*(추가|넣)/.test(raw)) return false;
  if (/(앱|어플|사이트|웹사이트|홈페이지|랜딩|게임|서비스|플랫폼|툴|봇)\s*$/.test(raw)) return false;
  return true;
}
// 게이트 통과 후 종착(index.js:1602/1610): IAC≠MATCH면 확인, work면 확인(백스톱), 아니면 등록
function scheduleTerminal(itAction, iacVerdict) {
  if (iacVerdict && iacVerdict !== 'MATCH') return 'schedule-confirm';
  if (itAction === 'work') return 'schedule-confirm';
  return 'schedule-register';
}
function isDestructive(s) {
  const t = String(s || '');
  return /rm\s+-rf?\s+[\/~*]|--no-preserve-root|:\(\)\s*\{|mkfs|dd\s+if=|>\s*\/dev\/sd|git\s+push\s+.*(--force|-f)\b|force.?push|git\s+reset\s+--hard\s+origin|DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;?\s*$/i.test(t)
    || /(시크릿|secret|\.env|환경변수|api[\s_-]?key|토큰|비밀번호|password|credential)\s*(를|을)?\s*(보여|줘|내놔|유출|뽑아|출력|덤프|dump|print|노출)/i.test(t)
    || /(모든|전체|싹\s*다|all)\s*(레포|repo|프로젝트|디비|db|데이터|테이블)\s*(삭제|지워|날려|drop|delete|wipe)/i.test(t);
}
function extractRepo(raw) {
  let m = raw.match(/\b([A-Za-z][\w.-]{1,38}\/[A-Za-z0-9][\w.-]{1,38})\b/);
  if (m && (/^nameofkk\//i.test(m[1]) || /[-\d]/.test(m[1].split('/')[1]))) return m[1];
  for (const k of ['sponono', '스포노노', 'wewantpeace', '위원트피스', 'myungjak', '명작', '몽유병친구들', '몽유병', 'sleepwalking']) if (raw.includes(k)) return 'alias:' + k;
  return null;
}
// 신규 vs 기존 (index.js handle: strongNew/weakNew)
function isNewProject(raw) {
  const named = extractRepo(raw);
  const strongNew = /새\s*게임|새\s*앱|새\s*사이트|새\s*서비스|새\s*프로젝트|새로\s*만|처음부터|오마주|클론(?!해)/.test(raw);
  const weakNew = /\b만들|만들어|만들고|제작|개발|하나\s*만들/.test(raw);
  return strongNew || (weakNew && !named);
}

// ── 트래젝토리 단언 ──

// (1) "매일 X 형식으로 변경" — 기능 스펙 속 시각을 반복 스케줄로 오등록하면 안 됨 (사용자가 직접 겪은 wewantpeace 버그)
ok(scheduleGateOpen('매일 오전 10시 알람을 다이제스트 형식으로 변경') === false, '[1] "매일 10시 …형식으로 변경" → 스케줄 아님(자동등록 차단)');
ok(scheduleGateOpen('매일 9시 다크모드 기능 추가') === false, '[1b] "매일 9시 기능 추가" → 스케줄 아님');

// (2) 진짜 반복 유지보수 → 스케줄 등록
ok(scheduleGateOpen('매일 새벽 3시 점검해줘') === true, '[2] "매일 새벽3시 점검" → 스케줄 후보 열림');
ok(scheduleTerminal('report', 'MATCH') === 'schedule-register', '[2b] 점검(report)+MATCH → 자동 등록');

// (3) "매일 9시 버그 고쳐줘" — 게이트는 열리지만 work라 자동등록 말고 확인(사용자 실제 시나리오)
ok(scheduleGateOpen('매일 오전 9시 스포노노 버그 고쳐줘') === true, '[3] "매일9시 버그고쳐" → 스케줄 후보 열림');
ok(scheduleTerminal('work', 'MATCH') === 'schedule-confirm', '[3b] work+MATCH라도 백스톱으로 확인');
ok(scheduleTerminal('work', 'UNSURE') === 'schedule-confirm', '[3c] IAC UNSURE면 확인');

// (4) 파괴적 → 거부
ok(isDestructive('모든 레포 삭제해줘') === true, '[4] 대량삭제 → 거부');
ok(isDestructive('main에 git push --force 해줘') === true, '[4b] force push → 거부');
ok(isDestructive('스포노노 시크릿 토큰 출력해줘') === true, '[4c] 시크릿 출력요구 → 거부');

// (5) 신규 vs 기존 레포
ok(isNewProject('스포노노 오마주해서 새 게임 만들어줘') === true, '[5] 오마주+새게임 → 신규(기존 오염 안함)');
ok(isNewProject('스포노노에 다크모드 만들어줘') === false, '[5b] 기존레포+만들어 → 기존 수정');
ok(isNewProject('홀덤게임 새로 만들어줘') === true, '[5c] 신규 제작 → 신규');

// (6) 일회성 작업("매일" 없음)은 스케줄 게이트 안 열림
ok(scheduleGateOpen('스포노노 버그 고쳐줘') === false, '[6] 시각 없는 일회성 → 스케줄 아님');

console.log(fail ? '\n❌ 트래젝토리 실패 ' + fail : '\n✅ 트래젝토리 전부 통과');
process.exit(fail ? 1 : 0);
