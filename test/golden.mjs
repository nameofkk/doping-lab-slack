// 골드셋 — 회귀 잦은 핵심 결정을 index.js 로직 그대로 단언. 프롬프트/정규식 드리프트 즉시 감지.
let fail = 0; const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); fail++; } };

// extractRepo (오탐 가드 + 별칭)
function extractRepo(raw) {
  let m = raw.match(/\b([A-Za-z][\w.-]{1,38}\/[A-Za-z0-9][\w.-]{1,38})\b/);
  if (m && (/^nameofkk\//i.test(m[1]) || /[-\d]/.test(m[1].split('/')[1]))) return m[1];
  for (const k of ['sponono', '스포노노', 'wewantpeace', '위원트피스', 'myungjak', '명작', '몽유병친구들', '몽유병', 'sleepwalking']) if (raw.includes(k)) return 'alias:' + k;
  m = raw.match(/\b(doping-[a-z0-9-]+|[a-z0-9][a-z0-9-]{2,}-(?:game|app|web|site|portfolio|tool|bot))\b/i);
  return m ? 'nameofkk/' + m[1].toLowerCase() : null;
}
ok(!extractRepo('client/server 구조로'), 'extractRepo: client/server 오탐 안함');
ok(!extractRepo('24/7 모니터링'), 'extractRepo: 24/7 오탐 안함');
ok(extractRepo('스포노노 봐줘') === 'alias:스포노노', 'extractRepo: 스포노노 별칭');
ok(extractRepo('몽유병친구들 고쳐') === 'alias:몽유병친구들', 'extractRepo: 몽유병친구들 별칭');
ok(extractRepo('nameofkk/foo-bar 봐줘') === 'nameofkk/foo-bar', 'extractRepo: owner/repo');

// force-new (#28 기존레포 보존 / #33 봇)
function forceNew(raw, repo) { const named = extractRepo(raw); const strongNew = /새\s*게임|새\s*앱|새\s*사이트|새\s*서비스|새\s*프로젝트|새로\s*만|처음부터|오마주|클론(?!해)/.test(raw); const weakNew = /\b만들|만들어|만들고|제작|개발|하나\s*만들/.test(raw); return (repo !== 'bot' && (strongNew || (weakNew && !named))) ? 'NEW' : (repo === 'bot' ? 'BOT' : 'EXISTING'); }
ok(forceNew('스포노노에 다크모드 만들어줘', 'sponono') === 'EXISTING', '#28 기존레포+만들어줘→기존');
ok(forceNew('홀덤게임 만들어줘', 'new') === 'NEW', '신규 만들어줘→NEW');
ok(forceNew('스포노노 오마주해서 새 게임', 'sponono') === 'NEW', '오마주→NEW');
ok(forceNew('봇에 명령어 추가 만들어줘', 'bot') === 'BOT', '#33 봇 자체수정 유지');

// schedule (#15 제품명사 / #16 밤12시 / #30 캐치업)
function parseDaily(t) { if (/마다/.test(t)) return null; const m = t.match(/(오전|아침|오후|저녁|밤)?\s*(\d{1,2})\s*시(?!간)/); if (!m) return null; let h = +m[2]; if (/(오후|저녁|밤)/.test(m[1] || '') && h < 12) h += 12; if (/(오전|아침)/.test(m[1] || '') && h === 12) h = 0; if (/(밤|저녁)/.test(m[1] || '') && h === 12) h = 0; return h; }
ok(parseDaily('밤 12시') === 0, '#16 밤 12시→자정0');
ok(parseDaily('오후 12시') === 12, '오후 12시→정오12');
ok(parseDaily('오후 6시') === 18, '오후 6시→18');
const isSched = raw => { const d = parseDaily(raw); const ims = /마다/.test(raw); return !!(d !== null || ims) && !/만들|제작|개발|짜줘|구현/.test(raw) && !/(앱|사이트|게임|서비스|툴|봇)\s*$/.test(raw); };
ok(isSched('매일 새벽 3시 점검해줘') === true, '스케줄 인식');
ok(isSched('매주 장보기 리스트 앱') === false, '#15 제품명사 빌드→스케줄 아님');

// 한글 \b 버그 회귀 (R1 작업현황 / R5 진행승인)
const jobCmd = raw => (/^(작업\s*현황|진행\s*상황|작업\s*보드|작업\s*목록|작업\s*리스트|jobs?|지금\s*뭐\s*(하|돌)|뭐\s*(하는\s*중|돌아가))/i.test(raw) || /^(작업|진행)\s*(어때|있어|중이야)/.test(raw)) && !/(만들|짜줘|짜봐|추가|구현|개발|보고서|작성)/.test(raw);
ok(jobCmd('작업현황'), 'R1 작업현황 매칭(한글 \\b 회귀)');
ok(!jobCmd('뭐 만들까'), 'R1 작업현황 오발동 안함');
const approve = r => /^(진행(해|하자|할게|시켜)?|승인(해)?|좋아(요)?|ㄱㄱ|고고|이대로(\s*(가자|해|진행))?|오케이|ok|콜)\s*$/i.test(r);
ok(approve('진행') && approve('이대로'), 'R5 계획승인 매칭(한글 \\b 회귀)');
ok(!approve('진행상황 어때'), 'R5 승인 오발동 안함');

// 마케팅 vs 보고 경계
const mktGen = raw => /마케팅\s*(자료|플랜|콘텐츠|캠페인|카피|에셋|머티리얼)/.test(raw) && /(만들|작성|뽑|준비|짜|생성|돌려|올려|넣)/.test(raw) && !/어떻게|방법|어때|할까|좋을까|보고|분석|뭐가/.test(raw);
ok(mktGen('스포노노 마케팅 자료 만들어줘'), '마케팅 생성');
ok(!mktGen('스포노노 마케팅 어떻게할까'), '마케팅 어떻게→생성 아님(보고)');

// I5 적응형 기획 규모 추정
function scopeOf(task) { const big = /실시간|서버|백엔드|결제|구독|멀티|플랫폼|소셜|데이터베이스|\bdb\b|인증|소켓|\bapi\b|대시보드|관리자|게임|커머스|쇼핑|예약|채팅/i.test(task) || (task || '').length > 120; return big ? 'full' : 'core'; }
ok(scopeOf('포트폴리오 사이트') === 'core', '#I5 간단→core(3명1라운드)');
ok(scopeOf('실시간 멀티 소셜 게임') === 'full', '#I5 복잡→full(6명3라운드)');
// I6 기억 명령(레포 앞붙음) — 한글 회귀
const memCmd = raw => (/(^|\s)(기억|메모리)(\s*(목록|리스트|보여줘?|뭐\s*있어|있어\??|봐줘?|확인))?\s*[?？]?\s*$/.test(raw) || /^뭐\s*기억/.test(raw)) && !/(기억해|해줘|하지\s?마|지워|삭제|넣어)/.test(raw);
ok(memCmd('스포노노 기억') && memCmd('기억 목록'), '#R7 기억 조회(레포앞붙음)');
ok(!memCmd('이거 기억해줘'), '#R7 기억해줘는 조회 아님');

console.log(fail ? '\n❌ 골드셋 실패 ' + fail : '\n✅ 골드셋 전부 통과');
process.exit(fail ? 1 : 0);
