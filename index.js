// 도핑연구소 Slack 멀티에이전트 봇.
// - 각 직원이 자기 정체성으로 채널에서 토론.
//   · 직원별 Slack 토큰(SLACK_TOKEN_*)이 있으면 → 그 토큰으로 게시 = '진짜 별도 멤버'.
//   · 없으면 → 메인 봇이 username/아이콘만 바꿔 게시(페르소나). chat:write.customize 필요.
// - 발언 생성: claude CLI(구독, CLAUDE_CODE_OAUTH_TOKEN). API 키 불필요.
// - Railway 등 클라우드에서 24/7(PC 꺼져도) 실행 가능.
require('dotenv').config();
const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const {
  SLACK_BOT_TOKEN, SLACK_APP_TOKEN,
  WORKDIR = '/app',
  CLAUDE_PERMISSION_MODE = 'bypassPermissions',
  ALLOWED_SLACK_USER_IDS = '',
  DEBATE_ROUNDS = '2',
  GITHUB_TOKEN = '',
  WORK_DEFAULT_REPO = 'nameofkk/sponono',
  WORK_PERMISSION_MODE = 'bypassPermissions',
  WORK_BASE = 'main',
} = process.env;

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error('❌ SLACK_BOT_TOKEN / SLACK_APP_TOKEN 필요.');
  process.exit(1);
}
const ALLOWED = ALLOWED_SLACK_USER_IDS.split(',').map(s => s.trim()).filter(Boolean);
const ROUNDS = parseInt(DEBATE_ROUNDS, 10) || 2;

// ── 직원(페르소나). tokenEnv 에 토큰이 있으면 진짜 별도 멤버로 게시 ──
const TEAM = [
  { name: '김채원 (PM)', kw: ['김채원','채원','PM'], emoji: ':bust_in_silhouette:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_PM',
    prompt: '너는 도핑연구소 PM이고 이름은 김채원이다. 밝고 야무지게 팀을 이끄는 리더야. 핵심을 똑부러지게 짚고 우선순위를 정해. 사용자 가치랑 시장성, 전용목적 위주로 본다.' },
  { name: '아이유 (리서처)', kw: ['아이유', '리서처', '리서치'], emoji: ':mag:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_RESEARCH',
    prompt: '너는 도핑연구소 사용자 리서처이고 이름은 아이유다. 차분하고 사려깊게 사람 마음과 진짜 니즈를 섬세하게 읽는다. 페인포인트·사용성 리스크를 따뜻하지만 정확하게 짚는다.' },
  { name: '정소민 (UX)', kw: ['정소민','소민','UX','디자이너','디자인','화면','비주얼','시안'], emoji: ':art:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_UX',
    prompt: '너는 도핑연구소 UX·비주얼 디자이너이고 이름은 정소민이다. 친근하고 공감 가는 말투로 사용자 흐름·마찰·엣지케이스(빈상태/에러/로딩)를 챙긴다. 디자인은 항상 impeccable.style 기준(AI slop 금지: 이모지 아이콘·gradient hero·nested cards 금지, 대비 4.5:1+, 한국어 UI, 빈상태 캐릭터)과 그 프로젝트 design-system(MASTER.md)을 따른다. 만든 화면은 스크린샷으로 실제로 띄워서 눈으로 검증하는 것까지 네 일이다.' },
  { name: '윈터 (아키텍트)', kw: ['윈터', '아키텍트', '아키', '배포', '운영', '데브옵스', 'devops', '인프라', '빌드', '서버'], emoji: ':building_construction:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_ARCHITECT',
    prompt: '너는 도핑연구소 아키텍트 겸 엔지니어이고 이름은 윈터다. 시크하고 군더더기 없이 구조·스택을 정하고, 빌드·테스트·배포·인프라·운영(헬스체크/장애대응/재시작)·의존성 관리까지 직접 책임진다. 기술/배포 리스크를 깔끔하게 정리한다.' },
  { name: '우정잉 (보안)', kw: ['우정잉', '정잉', '보안', '취약점', '시크릿'], emoji: ':lock:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_SECURITY',
    prompt: '너는 도핑연구소 보안 엔지니어이고 이름은 우정잉이다. 꼼꼼하고 의심 많게 인증·권한·시크릿·개인정보·규제 리스크와 코드 취약점(보안 리뷰·의존성 취약점 스캔)을 파고들고 완화책을 댄다.' },
  { name: '영듀 (마케터)', kw: ['영듀', '마케터', '마케팅'], emoji: ':mega:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_MARKETING',
    prompt: '너는 도핑연구소 마케터이고 이름은 영듀다. 텐션 높고 유쾌하게 바이럴·차별점·타깃·GTM을 재밌게 풀어낸다.' },
  { name: '안다연 (반론자)', kw: ['안다연','다연'], emoji: ':smiling_imp:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_DEVIL',
    prompt: '너는 도핑연구소의 악마의 변호인이고 이름은 안다연이다. 기획의 약점을 날카롭게 파고들어 반대 의견과 리스크를 짚고, 각 약점에 보완책도 함께 제시한다.' },
];
const LEAD = { name: '한로로 (팀장)', kw: ['한로로','로로','팀장'], emoji: ':test_tube:', model: process.env.LEAD_MODEL || 'opus', tokenEnv: 'SLACK_TOKEN_LEAD',
  prompt: '너는 도핑연구소 팀장이고 이름은 한로로다(최상위 모델). 진솔하고 본질을 짚는 스타일로 팀을 이끈다. 질문엔 직접 답하고, 기획 토론을 종합할 땐 목적·핵심기능·리스크 대응·다음 액션으로 정리한다.' };

// 모든 발언에 적용되는 말투/가독성 규칙
const STYLE = '\n\n[말투 규칙] 실제 한국 여성이 친한 동료랑 메신저로 편하게 수다 떨듯 자연스러운 구어체로 써라. 무조건 반말로 일관되게 써라 — 존댓말(~요, ~습니다, ~에요)을 절대 섞지 마라(한 메시지 안에서 반말/존댓말 왔다갔다 금지). 딱딱한 문어체나 설명조, 번역투 금지. 대시 기호(—, –, ㅡ, -)는 절대 쓰지 마라. 끊고 싶으면 문장을 나누거나 쉼표나 줄바꿈으로 해라. AI 티 나는 말투(도와드릴 수 있어요, ~에 대해 말씀드리면, 불필요한 사과나 안내) 금지. 마크다운 볼드 별표(**)나 머리표(#)도 쓰지 마라. 핵심만 2~4문장으로 짧고 친근하게, 읽기 쉽게. 중요: 네 속생각이나 "이렇게 답하자, 솔직하게 말하고 넘어가자, 사용자 화났네" 같은 메타 서술·지문은 절대 쓰지 말고, 실제로 상대한테 할 말만 바로 해라.';
// 너희 자신에 대해 물으면 정직하게 답할 사실 (모델 등)
const SELF = '\n\n[너에 대한 사실 — 물어보면 이것만 정직하게, 모르면 모른다고 해] 너는 도핑연구소 팀원이고 Claude Code(클코)를 구독 토큰으로 헤드리스 실행해서 돌아가. 팀장 한로로는 Claude Opus, 나머지 팀원들은 Claude Sonnet으로 동작해(사용량 한도 아끼려고 팀원은 sonnet, 팀장만 opus로 맞춰놨어). 메시지 의도분류는 haiku로 돌아. 이게 전부야. 중요: 한도가 왜 걸렸는지, 모델별 쿼터가 어떻게 나뉘는지, 인프라가 어떻게 도는지 같은 내부 동작은 네가 정확히 알 수 없는 거야. 그럴듯하게 추측해서 사실처럼 설명하지 마. 모르면 "그건 나도 정확힌 몰라"라고 솔직히 말해.';
// 작업/조사 보고용 — 마크다운 금지 + 사람 말투 (길이는 제한 안 함)
const PLAIN = '\n\n[형식·말투 규칙 — 항상] 마크다운 절대 금지: 별표(**), 샵(#), 표(|), 대시(—,–,ㅡ). 무조건 반말로 일관되게(존댓말 ~요/~습니다 섞지 마). 딱딱한 보고체("~다", "~상태다", "~된다", "~음") 쓰지 말고, 친한 동료한테 말하듯 편한 구어체로 써(예: ~야, ~거든, ~더라, ~인데). AI 말투(말씀드리면, ~할 수 있습니다) 금지. 어려운 전문용어는 그냥 쓰지 말고 쉬운 말로 풀어서, 모르는 사람도 한 번에 이해되게 써. 내용은 충분히 쓰되 짧은 문장과 줄바꿈으로 읽기 쉽게.';
// 디자인 작업 시 항상 적용 — 사용자가 늘 쓰던 디자인 기준(PRD 기반)
const DESIGN_RULE = `

[디자인 규칙 — UI·화면·프론트·디자인 작업이면 코드 짜기 전에 반드시 이 순서로. 출처: Anthropic 공식 frontend-design 스킬의 frontend_aesthetics + impeccable.style]
0) 무드 선언 먼저: 코드 짜기 전에 "이번 화면의 방향(레퍼런스 1~2개, 폰트, 지배색+강조색, 모션 컨셉)"을 한두 줄로 정해서 먼저 말해라. 방향 없이 바로 코딩하면 그게 AI slop의 원인이다. 절대 금지.
1) 기존 디자인시스템이 최우선: 그 프로젝트에 design-system 폴더(MASTER.md, pages/[페이지].md)나 .impeccable.md가 있으면 먼저 읽고 거기 색·타이포·간격·radius·그림자를 그대로 따른다(페이지 파일이 MASTER보다 우선). 기존 시스템이 있으면 아래 2)의 폰트/컬러 자유선택보다 기존 시스템이 항상 이긴다.
2) 기존 시스템이 없는 신규 디자인일 때만 — '뻔한 AI 디자인'을 피해 과감하게 정한다:
   타이포: Inter/Roboto/Open Sans/Lato/Arial/시스템폰트/Space Grotesk 같은 뻔한 거 절대 금지. 무드로 골라라. 코드감=JetBrains Mono·Fira Code, 에디토리얼=Playfair Display·Fraunces·Crimson Pro, 스타트업=Clash Display·Satoshi·Cabinet Grotesk, 테크=IBM Plex, 개성=Bricolage Grotesque·Newsreader. 대비 크게(100/200 vs 800/900), 크기 점프 3배 이상. 폰트 하나 정해서 결단력 있게, Google Fonts 로드. 코딩 전에 고른 폰트를 말해라.
   컬러: 하나의 일관된 무드에 올인. CSS 변수로 통일. 균등하게 퍼진 소심한 팔레트 말고 '지배색 + 날카로운 강조색'. 흰 배경에 보라 그라데이션 같은 제일 흔한 AI 티는 절대 금지.
   모션: 흩뿌리지 말고 임팩트 한 방. 페이지 로드 때 staggered reveal(animation-delay)이 자잘한 마이크로인터랙션 여러개보다 낫다. HTML은 CSS-only, React는 Motion 라이브러리.
   배경: 단색만 깔지 말고 분위기/깊이를 줘라. 은은한 CSS 그라데이션 레이어, 기하 패턴, 맥락에 맞는 효과.
3) AI slop 안티패턴 금지(impeccable.style): 이모지를 아이콘으로 쓰기 금지(Lucide 등 실제 아이콘), nested cards 금지, 예측가능한 3카드 그리드 같은 뻔한 레이아웃 금지, 텍스트 대비 4.5:1 이상, 모든 클릭요소 cursor-pointer, 한국어 UI(브랜드명 제외), 빈 상태 화면엔 캐릭터/안내, prefers-reduced-motion 존중, 반응형 375/768/1024/1440px.
4) 한 번에 다 만들지 말고 컴포넌트 단위로(히어로 → 카드 → 가격/기능 → 푸터 순). shadcn/ui 쓰면 기존 토큰·패턴 따르고 직접 space-y 남발 금지.
5) 끝나면 Playwright로 실제 스크린샷 찍어 눈으로 확인. "될 것이다/잘 나왔을 것이다" 금지, 못 본 건 미확인이라고 말해라.`;

// 신규 웹/사이트/앱 제작 시 항상 — 출시·마케팅·운영까지 준비된 상태로 만들게 하는 규칙
const LAUNCH_RULE = `

[출시·마케팅 준비 — 웹/사이트/앱 신규 제작이면 코드에 같이 넣어라]
1) SEO/공유 메타: 모든 페이지에 title, meta description, Open Graph(og:title/description/image/url), 트위터 카드, lang=ko, 시맨틱 HTML(h1 하나만), 적절하면 JSON-LD. public에 sitemap.xml, robots.txt, favicon 넣어.
2) 출시 필수 페이지: 개인정보처리방침(/privacy)과 이용약관(/terms)을 한국어 기본 틀로 작성. 연락처 자리는 비워두고 "TODO 연락처" 표시.
3) 성능·접근성: 이미지 최적화랑 lazy-load, 의미있는 alt, 키보드 접근, 기본적인 Lighthouse 신경.
${process.env.ANALYTICS_SNIPPET ? '4) 접속 통계(애널리틱스): 다음 스니펫을 head에 그대로 넣어라:\n' + process.env.ANALYTICS_SNIPPET + '\n' : '4) 접속 통계(애널리틱스): 아직 키가 안 주어졌으니 들어갈 자리만 주석 TODO로 잡아두고 실제 코드는 비워둬.'}
5) 문의/CS: 문의폼 제출은 ${process.env.CONTACT_ENDPOINT ? '다음 주소로 POST 보내게 해(Slack Incoming Webhook이면 브라우저 CORS 때문에 fetch에 mode:"no-cors" 쓰고 본문은 {text: ...} JSON으로): ' + process.env.CONTACT_ENDPOINT : '동작하는 폼 서비스(예: Formspree) 자리표시자로 두고, 제출하면 "접수됐어요" 안내 화면을 보여주게'}. 개인정보 받는 폼이니까 최소한 스팸 막는 허니팟 한 개랑 제출 후 확인 안내는 꼭 넣어.
6) 결제(유료 기능 있을 때만): 결제는 도도페이먼츠(DodoPayments)를 쓴다. ${process.env.DODO_API_KEY ? 'DODO_API_KEY가 환경변수로 있으니 DodoPayments 체크아웃/구독 연동을 실제로 붙여라(서버에서 키 사용, 클라이언트 노출 금지).' : 'DODO_API_KEY가 아직 없으니, 결제 버튼·플랜 UI까지만 만들고 실제 연동부는 DodoPayments SDK 자리만 TODO 주석으로 잡아둬(키는 비워둠).'} 결제 키는 절대 프론트 코드에 하드코딩하지 마라.`;

// 게임/비주얼 많은 프로젝트 — 에셋을 상용 수준으로 (대충 도형 금지)
const ASSET_RULE = `

[에셋·아트 규칙 — 게임이나 비주얼 비중 큰 프로젝트면 반드시. 대충 도형 금지]
1) 코드 짜기 전에 아트 디렉션이랑 에셋 목록부터 정의해라: 캐릭터/배경/오브젝트/UI/이펙트/사운드 각각 몇 개, 통일된 스타일·팔레트·크기(픽셀 그리드). ASSETS.md에 적어.
2) 절대 금지: 회색 네모를 적, 동그라미를 공, 단색 사각형을 건물로 대충 붙이고 "에셋"이라 하기. 진짜 출시 게임에 써도 될 수준이어야 함.
3) 에셋 우선순위:
   (a) 무료 CC0 고품질 에셋 팩을 받아서 써라 — Kenney.nl(kenney.nl, 전부 CC0)·OpenGameArt(CC0 필터)·itch.io CC0 팩. 게임 컨셉에 맞는 팩을 curl/wget으로 받아 public/assets에 넣고, 출처·라이선스를 ASSETS.md에 기록(CC0/저작자표시 여부 확인).
   (b) 직접 그려야 하면 디테일 있는 SVG나 Canvas로: 레이어·음영·하이라이트·외곽선, 캐릭터는 idle/걷기/액션 여러 프레임으로 애니메이션. 단색 단순도형 한 개로 때우지 마.
4) 일관성: 모든 에셋이 같은 아트 스타일·팔레트·해상도. 짜깁기 금지.
5) 사운드: 필요하면 CC0 효과음/BGM(예: Kenney audio, freesound CC0) 받아서 넣어.
6) 끝나면 Playwright 스크린샷으로 실제 화면 확인 — 도형 덩어리로 보이면 통과 아님, 다시 해.${process.env.IMAGE_API_KEY ? '\n7) 진짜 커스텀 스프라이트가 필요하면 IMAGE_API_KEY로 이미지 생성 API를 호출해서 만들어라.' : ''}`;

const app = new App({ token: SLACK_BOT_TOKEN, appToken: SLACK_APP_TOKEN, socketMode: true });
const clientCache = new Map();
function clientFor(persona) {
  const tok = persona.tokenEnv && process.env[persona.tokenEnv];
  if (!tok) return null;
  if (!clientCache.has(tok)) clientCache.set(tok, new WebClient(tok));
  return clientCache.get(tok);
}
async function postAs(defaultClient, channel, thread_ts, persona, text) {
  try {
    const wc = clientFor(persona);
    if (wc) await wc.chat.postMessage({ channel, thread_ts, text });          // 진짜 별도 멤버
    else await defaultClient.chat.postMessage({ channel, thread_ts, text, username: persona.name, icon_emoji: persona.emoji });
    recordMsg(channel, persona.name, text);
  } catch (e) { /* not_in_channel 등 → 채널에 초대 안 된 봇은 조용히 패스 */ }
}

let claudeRunning = 0; const claudeQueue = [];
const MAX_CLAUDE = parseInt(process.env.MAX_CLAUDE || '3', 10);
// 사용량 집계 (오늘 Claude 호출/토큰/한도걸림) — 번레이트 보려고
let usageStat = { day: null, calls: 0, outTokens: 0, limitedHits: 0 };
function bumpUsage(j, limited) {
  try { const n = kstNow(); if (usageStat.day !== n.day) usageStat = { day: n.day, calls: 0, outTokens: 0, limitedHits: 0 };
    usageStat.calls++; if (limited) usageStat.limitedHits++;
    const ot = j && j.usage && (j.usage.output_tokens || 0); if (ot) usageStat.outTokens += ot;
  } catch (e) {}
}
function claudeAcquire() { return new Promise(res => { if (claudeRunning < MAX_CLAUDE) { claudeRunning++; res(); } else claudeQueue.push(res); }); }
function claudeRelease() { claudeRunning = Math.max(0, claudeRunning - 1); if (claudeQueue.length) { claudeRunning++; claudeQueue.shift()(); } }
// 일시적 rate limit(429)면 잠깐 쉬고 재시도 → 진짜 세션 한도일 때만 포기 (88%에서 조기중단 방지)
async function runClaude(prompt, model, cwd = WORKDIR, perm = CLAUDE_PERMISSION_MODE, timeoutMs = 240000, useMcp = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await runClaudeOnce(prompt, model, cwd, perm, timeoutMs, useMcp);
    if (!r.limited) return r;
    if (attempt < 2) await new Promise(s => setTimeout(s, 8000 * (attempt + 1))); // 8s, 16s 백오프
  }
  return { ok: false, limited: true, text: '⏳ 클로드 사용량 한도가 계속 걸려. 좀 있다 다시 시도해줘.' };
}
async function runClaudeOnce(prompt, model, cwd = WORKDIR, perm = CLAUDE_PERMISSION_MODE, timeoutMs = 240000, useMcp = false) {
  await claudeAcquire();
  return new Promise(resolve => {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', perm];
    if (model) args.push('--model', model);
    if (useMcp && process.env.FIGMA_API_KEY) args.push('--mcp-config', '/app/.mcp.json'); // figma MCP는 실제 디자인/제작 호출에만 — 분류·잡담·리포트마다 MCP 서브프로세스 띄우는 오버헤드 제거(타임아웃 감소)
    const opts = { cwd, env: { ...process.env, HOME: '/tmp' }, stdio: ['ignore', 'pipe', 'pipe'] };
    try { if (process.getuid && process.getuid() === 0) { opts.uid = 1000; opts.gid = 1000; } } catch (e) {}
    const child = spawn('claude', args, opts);
    let out = '', err = '', done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(killer); claudeRelease(); resolve(r); };
    const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} finish({ ok: false, timedout: true, text: '(방금 건 처리가 제한시간을 넘겨서 한 번 끊겼어 — 게으름이 아니라 응답이 너무 길어진 거야. 다시 시도해줘.)' }); }, timeoutMs);
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => finish({ ok: false, text: String(e) }));
    const isLimit = (s) => /session limit|usage limit|rate limit|api_error_status.{0,6}429|429/i.test(s || '');
    child.on('close', code => {
      let j = null; try { j = JSON.parse(out); } catch {}
      if (j) {
        const res = typeof j.result === 'string' ? j.result : '';
        const lim = isLimit(res) || j.api_error_status === 429;
        bumpUsage(j, lim);
        if (j.is_error || lim) {
          return finish({ ok: false, limited: lim, text: lim ? '⏳ 지금 클로드 사용량 한도에 걸렸어. 한도 리셋되면 다시 할게.' : (res || '오류가 났어').slice(0, 500) });
        }
        return finish({ ok: true, text: res || out.slice(0, 1500) });
      }
      if (code !== 0 || isLimit(out) || isLimit(err)) return finish({ ok: false, limited: isLimit(out) || isLimit(err), text: (isLimit(out) || isLimit(err)) ? '⏳ 지금 클로드 사용량 한도에 걸렸어. 한도 리셋되면 다시 할게.' : (err || out || 'error').slice(0, 800) });
      finish({ ok: true, text: out.slice(0, 1500) });
    });
  });
}

async function runDebate(client, channel, thread_ts, idea, repo) {
  ensureJob(channel, 'debate', idea, repo); // R1: 보드에 기록
  await postAs(client, channel, thread_ts, LEAD, `🧪 토론 시작할게. 주제: ${idea}\n${repo ? '먼저 프로젝트 좀 까보고 ' : ''}${ROUNDS}라운드 치고받은 다음에 내가 결론 정리할게.`);
  let facts = '';
  if (repo && GITHUB_TOKEN) {
    const id = ++workSeq; const dir = `/tmp/d${id}`;
    const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
    if (cl.code === 0) {
      const sum = await runClaude(`이 저장소가 실제로 뭘 하는 프로젝트인지 README랑 코드를 읽고 사실만 6~10줄로 요약해. 필요하면 웹서치로 비슷한 서비스나 시장 맥락도 한두 줄 덧붙여도 돼. 마크다운 금지.`, 'sonnet', dir, WORK_PERMISSION_MODE, 300000);
      if (sum.text && sum.ok !== false) facts = `\n[프로젝트 실제 정보 (${repo})]\n${sum.text.trim().slice(0, 1500)}\n`;
    } else {
      await postAs(client, channel, thread_ts, LEAD, `${repo} 레포를 못 찾겠어. 정확한 레포 이름 알려주면 까보고 제대로 토론할게. 모르는 채로는 헛소리 나와서 안 할래.`);
      return;
    }
  }
  const HONEST = facts
    ? ' 위 [프로젝트 실제 정보]를 근거로만 말해. 거기 없는 건 추측이라고 표시해.'
    : ' 이 프로젝트가 정확히 뭔지 모르면 절대 지어내지 마. 모르면 솔직히 "이거 뭔지 정확히 모르겠다"고 하고 사용자한테 어떤 건지 물어봐.';
  let transcript = `[토론 주제]\n${idea}\n${facts}`, stopped = false;
  for (let r = 1; r <= ROUNDS && !stopped; r++) {
    for (const p of TEAM) {
      bumpWork(channel); // 토론은 자체 스피너가 없어서 여기서 생존신호 갱신 (긴 토론이 워치독에 안 끊기게)
      if (workCancel[channel]) { stopped = true; break; } // "중단"하면 토론 즉시 멈춤
      const guide = (r === 1
        ? '네 입장과 핵심 근거를 말해. 앞 사람 의견 있으면 동의/반박도 같이.'
        : `지금 ${r}라운드야. 앞 의견 중 약한 부분을 콕 집어 반박하고 네 주장을 다듬어. 반복 금지.`) + HONEST;
      const res = await runClaude(`${p.prompt}${STYLE}${rulesCtx(channel)}\n\n[지금까지 토론]\n${transcript}\n\n${guide}`, p.model);
      if (res.limited) { await postAs(client, channel, thread_ts, LEAD, '⏳ 한도 걸려서 토론 더 못 돌려. 리셋되면 다시 하자.'); return; }
      const msg = (res.text || '(무응답)').trim().slice(0, 1200);
      await postAs(client, channel, thread_ts, p, msg);
      transcript += `\n[${p.name}] ${msg}\n`;
    }
  }
  if (stopped) { delete workCancel[channel]; await postAs(client, channel, thread_ts, LEAD, '토론 중단했어.'); return; }
  const synth = await runClaude(`${LEAD.prompt}${STYLE}${rulesCtx(channel)}\n\n[토론 전체]\n${transcript}\n\n이 토론을 종합해. 의견 갈린 지점 짚고, 가장 설득력 있는 쪽으로 최적 결론을 내려. 단순 요약 말고 결정과 다음 액션까지.${HONEST}`, LEAD.model);
  await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}📋 결론\n` + (synth.text || '').trim().slice(0, 2800));
  // 결론의 액션아이템을 뽑아서 "승인하면 실제로 착수"하게 제시 (자동 실행 X — 사용자 승인 게이트). 레포 있을 때만(코드로 할 게 있어야 함).
  if (repo && synth.text && synth.ok !== false) {
    const items = await extractActionItems(synth.text);
    const doable = items.filter(x => x.kind !== 'human');
    if (doable.length) {
      pendingDispatch[channel] = { repo, items, at: Date.now() };
      const label = k => k === 'investigate' ? '조사' : k === 'build' ? '코드수정' : '사람만';
      const fmt = items.map((x, i) => `${i + 1}. [${label(x.kind)}] ${x.who ? x.who + ' — ' : ''}${x.task}`).join('\n');
      await postAs(client, channel, thread_ts, LEAD, `위 결론에서 실제로 착수 가능한 액션 뽑았어:\n${fmt}\n\n"실행"이라고 하면 조사·코드수정 항목을 내가 바로 돌릴게(조사는 코드 까서 사실로, 코드수정은 PR로 올려서 네가 머지). 골라서 "실행 1,3"도 돼. 안 할 거면 "넘어가". (사람만 가능한 건 빼고 돌려)`);
    }
  }
}

// ── 실제 작업 모드: 레포 클론 → claude 코드 작업 → 브랜치 push → PR → 보고 ──
let workSeq = 0; const workCancel = {}; const activeWork = {}; const lastRepo = {}; const lastRequester = {}; const pendingProject = {}; const feedback = {}; const pausedWork = {}; const pendingDispatch = {};
function drainFeedback(channel) { const f = (feedback[channel] || []).join('\n'); feedback[channel] = []; return f; } // 작업 중 사용자가 끼어든 수정요청 모아서 반환
// 토론/회의 결론 → 실제 착수 가능한 액션아이템 추출 (조사/코드수정/사람만 분류). 자동 실행 아님 — 사용자 승인용 목록.
async function extractActionItems(conclusion) {
  try {
    const r = await runClaude(`다음은 팀 회의 결론이야. 우리 팀(에이전트)이 코드/레포로 실제 착수 가능한 구체 액션아이템만 뽑아 JSON 배열로만 출력해. 설명 금지.\n\n[결론]\n${String(conclusion || '').slice(0, 3000)}\n\n각 항목: {"who":"담당(한 단어)","task":"무엇을 할지 한 문장, 레포에서 확인/수정할 구체 대상 포함","kind":"investigate|build|human"}\n- investigate: 레포 코드/파일 까서 확인하는 읽기전용(예 "regex 실행에 타임아웃 있는지 확인")\n- build: 코드를 실제 고치거나 추가(예 "regex에 타임아웃 추가")\n- human: 계정·심사·결제·외부결정 등 사람만 가능(예 "Play Store 심사상태 확인")\n추상적 방향·중복은 빼고 최대 8개. JSON 배열만.`, 'sonnet', WORKDIR, CLAUDE_PERMISSION_MODE, 120000);
    const m = (r.text || '').match(/\[[\s\S]*\]/);
    const arr = m ? JSON.parse(m[0]) : [];
    return Array.isArray(arr) ? arr.filter(x => x && x.task && ['investigate', 'build', 'human'].includes(x.kind)).slice(0, 8) : [];
  } catch { return []; }
}
// 승인된 액션아이템 실제 실행 — 조사는 한 번에 묶어 read-only 리포트로, 코드수정은 PR로(또 승인받게). 사람만 항목은 건너뜀.
async function dispatchActionItems(client, channel, thread_ts, repo, items) {
  const investigates = items.filter(x => x.kind === 'investigate');
  const builds = items.filter(x => x.kind === 'build');
  if (!investigates.length && !builds.length) { await postAs(client, channel, thread_ts, LEAD, '코드로 착수할 수 있는 건 없네. 나머진 사람이 해야 하는 거야(계정·심사 등).'); return; }
  activeWork[channel] = { task: '액션아이템 실행 ' + repo, started: Date.now(), beat: Date.now(), repo };
  try {
    if (investigates.length) {
      const combined = '팀이 "확인 필요"라고 한 것들을 레포 코드로 직접 확인해서 사실로 답해라(추측 금지, 코드 근거로):\n' + investigates.map((x, i) => `${i + 1}. ${x.task}`).join('\n');
      await postAs(client, channel, thread_ts, LEAD, `🔍 조사 ${investigates.length}건 한 번에 까볼게.`);
      await runReport(client, channel, thread_ts, byName('우정잉') || LEAD, repo, combined);
    }
    for (const b of builds.slice(0, 3)) {
      if (workCancel[channel]) { delete workCancel[channel]; break; }
      bumpWork(channel);
      await postAs(client, channel, thread_ts, LEAD, `🛠️ 코드작업: ${b.task} — PR로 올릴게(머지는 네가).`);
      await runWork(client, channel, thread_ts, repo, b.task, false, true); // forcePR — 승인(머지) 거쳐 반영
    }
    if (builds.length > 3) await postAs(client, channel, thread_ts, LEAD, `코드작업 ${builds.length}개 중 3개만 했어. 나머진 "작업: ..."로 시켜줘.`);
    await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}액션아이템 실행 끝. 조사 결과·PR 위에서 확인해줘.`);
  } catch (e) { await postAs(client, channel, thread_ts, LEAD, '실행 중 오류: ' + String(e).slice(0, 200)); }
  finally { activeWork[channel] = null; }
}
// 명확한 "중단/취소 명령"일 때만 true (문장 속에 '중단','스톱' 단어가 섞인 일반 요청은 제외 — "중단했던 거 이어서", "스톱워치 추가" 등 오작동 방지)
function isStopMsg(s) {
  const t = (s || '').trim();
  return /^(그만(해|하자|좀|둬)?|중단(해|하자|시켜|해줘)?|멈춰(줘)?|스톱|stop|취소(해|해줘)?|관둬|일단\s*(중단|그만|멈춰|스톱))$/i.test(t) || (t.length <= 6 && /(그만|중단|멈춰|스톱|stop|취소)/i.test(t));
}
// 답변/완료 시 요청자를 @멘션 (자리 비웠어도 핑 가게). 채널의 마지막 요청자 기준
function mention(channel) { const u = (activeWork[channel] && activeWork[channel].by) || lastRequester[channel]; return u ? `<@${u}> ` : ''; }
function workStatusCtx(channel) {
  const w = activeWork[channel];
  if (!w) return '\n[작업 상태] 지금 백그라운드에서 진행 중인 코드작업 없음.';
  const min = Math.round((Date.now() - w.started) / 60000);
  return `\n[작업 상태] "${w.task}" 작업이 백그라운드에서 ${min}분째 진행 중. 끝나면 봇이 자동으로 결과를 올림. 진행률이나 완료여부를 절대 지어내지 말 것.`;
}
function sh(cmd, cwd, timeoutMs = 480000) {
  return new Promise(resolve => {
    const c = spawn('bash', ['-lc', cmd], { cwd: cwd || '/tmp', env: process.env });
    let out = '', err = '', done = false;
    const fin = (r) => { if (done) return; done = true; clearTimeout(t); resolve(r); };
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} fin({ code: 124, out, err: (err + '\n(명령이 시간초과로 강제 종료됨)').slice(-800) }); }, timeoutMs); // 멈춘 명령이 채널을 영구히 막지 않게
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
    c.on('close', code => fin({ code, out, err }));
    c.on('error', e => fin({ code: 1, out: '', err: String(e) }));
  });
}
function ghPost(path, payload) {
  return new Promise(resolve => {
    const data = JSON.stringify(payload);
    const req = https.request({ hostname: 'api.github.com', path, method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'doping-lab', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); });
    req.on('error', () => resolve(null)); req.write(data); req.end();
  });
}
function ghGet(path) {
  return new Promise(resolve => {
    const req = https.request({ hostname: 'api.github.com', path, method: 'GET',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'doping-lab' } },
      r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); });
    req.on('error', () => resolve(null)); req.end();
  });
}
const GH_OWNER = 'nameofkk';
const byName = (frag) => TEAM.find(p => p.name.includes(frag));
// 기획에 의견 내는 빌더들 (PM·리서처·UX·아키텍트·보안·마케터). 반론자 안다연은 이들 뒤에 따로 반박 턴.
function planTeam() { return ['김채원', '아이유', '정소민', '윈터', '우정잉', '영듀'].map(byName).filter(Boolean); }

// 제작 전 라이브 기획 핑퐁 — 팀이 구어체로 PRD를 만들고, 팀장이 완성도 98% 될 때까지 반복해서 끌어올림.
// 반환: 완성된 PRD 문서(문자열). 한도/중단이면 null (호출측이 제작 중단).
async function runPRD(client, channel, thread_ts, task) {
  const TARGET = parseInt(process.env.PRD_TARGET || '98', 10);
  const MAX = parseInt(process.env.PRD_MAX_ROUNDS || '3', 10);
  await postAs(client, channel, thread_ts, LEAD, `오 좋다. "${task}" 이거 바로 코드 안 짜고 기획부터 제대로 잡자. PRD 만들어서 완성도 ${TARGET}% 될 때까지 핑퐁 돌릴게.`);
  let convo = `[만들 것]\n${task}\n`, prd = '', score = 0, limited = false;
  const devil = byName('안다연');
  for (let round = 1; round <= MAX; round++) {
    if (workCancel[channel]) return null;
    const fb = drainFeedback(channel); // 사용자가 중간에 끼어든 수정요청 반영
    if (fb) { convo += `\n[사용자가 중간에 준 수정/지시 — 반드시 이대로 PRD를 고쳐라]\n${fb}\n`; await postAs(client, channel, thread_ts, LEAD, `사용자가 중간에 "${fb.replace(/\n/g, ' ').slice(0, 50)}" 줬어, 이거 반영해서 다시 잡을게.`); }
    await postAs(client, channel, thread_ts, LEAD, round === 1 ? '먼저 각자 자기 파트부터 던져봐.' : `${round}라운드. 지금 PRD에서 부족한 부분이랑 방금 사용자 피드백 반영해서 보강하자.`);
    for (const p of planTeam()) {
      bumpWork(channel); // PRD 핑퐁 도는 동안 생존신호(외부 스피너가 덮지만 이중 보강)
      if (workCancel[channel]) return null;
      const guide = round === 1 ? '네 담당 관점에서 이걸 어떻게 만들지 핵심 2~3개 구체적으로.' : '지금 PRD에서 네 영역에 빠졌거나 약한 부분만 콕 집어 보강해. 반복 말고 새로 더할 것만.';
      const r = await runClaude(`${p.prompt}${STYLE}${rulesCtx(channel)}\n\n[지금까지 기획/PRD]\n${convo}\n\n${guide} 친한 동료처럼 편하게, 마크다운 금지.`, p.model, WORKDIR, CLAUDE_PERMISSION_MODE, 120000);
      if (r.limited) { limited = true; break; }
      const msg = (r.text || '').trim().slice(0, 900);
      if (msg && r.ok !== false) { await postAs(client, channel, thread_ts, p, msg); convo += `\n${p.name}: ${msg}`; }
    }
    if (limited) break;
    if (devil && !workCancel[channel]) {
      const r = await runClaude(`${devil.prompt}${STYLE}${rulesCtx(channel)}\n\n[지금 PRD/논의]\n${convo}\n\n넌 반론자야. 빠졌거나 위험하거나 과하거나 사용자가 안 쓸 부분 콕 집어 반박하고, 지적마다 보완책 한 줄씩. 편하게, 마크다운 금지.`, devil.model, WORKDIR, CLAUDE_PERMISSION_MODE, 120000);
      if (r.limited) { limited = true; break; }
      const dm = (r.text || '').trim().slice(0, 900);
      if (dm && r.ok !== false) { await postAs(client, channel, thread_ts, devil, dm); convo += `\n안다연(반론): ${dm}`; }
    }
    // 팀장: PRD 문서 작성 + 완성도 평가
    const synth = await runClaude(`${LEAD.prompt}${PLAIN}${rulesCtx(channel)}\n\n[지금까지 팀 논의]\n${convo}\n\n위 논의를 바탕으로 이 프로젝트 PRD를 아래 항목으로 작성해라. 구어체로 쓰되 내용은 구체적으로:\n목표 /\n타겟·사용맥락 /\n핵심기능(우선순위) /\n화면·플로우 /\n기술스택 /\n차별화 훅 /\n성공지표 /\n리스크·대응\n\n맨 마지막 줄에 반드시 "완성도: NN%" 형식으로 이 PRD 완성도를 숫자로 매겨라. ${TARGET}% 미만이면 뭐가 부족한지 한두 줄. 마크다운 별표·샵 금지.`, LEAD.model, WORKDIR, CLAUDE_PERMISSION_MODE, 180000);
    if (synth.limited) { limited = true; break; }
    if (synth.text && synth.ok !== false) { prd = synth.text.trim(); convo += `\n[팀장 PRD v${round}]\n${prd}`; await postAs(client, channel, thread_ts, LEAD, prd.slice(0, 2800)); }
    const all = [...prd.matchAll(/완성도\s*[^0-9%]{0,5}([0-9]{1,3})\s*(?:%|퍼센트|점)/g)]; score = all.length ? parseInt(all[all.length - 1][1], 10) : score; // 맨 마지막 "완성도 NN%"(최종 점수)를 잡음 — 본문에 목표치(예 "완성도 98% 목표") 먼저 언급해도 그걸로 오인해 조기 제작 안 하게. "완성도는 95%"/"95점"도 인식
    if (score >= TARGET) { await postAs(client, channel, thread_ts, LEAD, `좋아 PRD 완성도 ${score}% 나왔어. 이 PRD 그대로 제작 들어갈게.`); break; }
    if (round < MAX) await postAs(client, channel, thread_ts, LEAD, `아직 ${score || '미정'}%라 한 라운드 더 보강하자.`);
    else await postAs(client, channel, thread_ts, LEAD, `라운드 한계까지 끌어올려서 ${score || ''}% 됐어. 이 PRD로 제작 들어갈게.`);
  }
  if (limited) {
    // 한도 걸려도 지금까지 잡은 PRD가 쓸 만하면(이미 1라운드 이상 + 내용 있음) 버리지 말고 그걸로 제작 들어감
    if (prd && prd.length > 300) { await postAs(client, channel, thread_ts, LEAD, `⏳ 한도 때문에 기획을 ${TARGET}%까지는 못 끌어올렸는데(현재 ${score || '80'}% 정도), 지금까지 잡은 PRD가 충분히 탄탄하니까 이걸로 바로 제작 들어갈게. 부족하면 나중에 보강하자.`); return prd; }
    await postAs(client, channel, thread_ts, LEAD, '⏳ 한도에 걸려서 기획을 시작도 제대로 못 했어. 한도 풀리면 다시 시켜줘.'); return null;
  }
  return prd || convo;
}

// 로컬 서버가 뜰 때까지 curl 폴링
async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await sh(`curl -sf -o /dev/null -w "%{http_code}" '${String(url).replace(/'/g, '')}' 2>/dev/null || true`);
    const c = (r.out || '').trim();
    if (c.startsWith('2') || c.startsWith('3')) return true;
    await new Promise(s => setTimeout(s, 1500));
  }
  return false;
}
// Playwright로 첫 화면 스크린샷 (스크롤 안 함 → 진입 애니메이션 미작동 버그가 그대로 드러남)
async function captureShots(url, prefix = 'shot') {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 30000 });
  const out = [];
  try {
    for (const [w, h, label, file] of [[1440, 900, '데스크탑 첫 화면 (로드 직후, 스크롤 전)', `/tmp/${prefix}_d.png`], [375, 812, '모바일 첫 화면', `/tmp/${prefix}_m.png`]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await p.waitForTimeout(1800);
      await p.screenshot({ path: file });
      out.push({ path: file, label }); await p.close();
    }
  } finally { try { await b.close(); } catch (_) {} }
  return out;
}
// 스크린샷을 슬랙에 업로드 (botClient — 채널 멤버라 files:write 가능성 높음)
async function uploadShot(channel, thread_ts, file, comment) {
  try { await botClient.files.uploadV2({ channel_id: channel, thread_ts, file: fs.readFileSync(file), filename: file.split('/').pop(), initial_comment: comment }); return true; }
  catch (e) { return false; }
}
// 코드 자체를 슬랙에 압축해서 올림 (프라이빗 레포 안 거치고 바로 받아보게). files:write 있을 때만 동작
async function uploadCodeZip(channel, thread_ts, dir, repo) {
  try {
    const name = (repo.split('/').pop() || 'code');
    const tgz = `/tmp/${name}-${Date.now().toString(36)}.tgz`;
    await sh(`cd ${dir} && tar --exclude=node_modules --exclude=.git --exclude=.next --exclude=dist --exclude=build --exclude=.turbo -czf ${tgz} . 2>&1`, dir, 120000);
    if (!fs.existsSync(tgz)) return false;
    const sz = fs.statSync(tgz).size;
    if (sz > 45 * 1024 * 1024) { try { fs.unlinkSync(tgz); } catch {} return false; } // 너무 크면 스킵
    await botClient.files.uploadV2({ channel_id: channel, thread_ts, file: fs.readFileSync(tgz), filename: `${name}.tgz`, initial_comment: '코드 통째로 압축해서 올렸어. 받아서 풀면 깃허브 안 거쳐도 바로 볼 수 있어.' });
    try { fs.unlinkSync(tgz); } catch {}
    return true;
  } catch (e) { return false; }
}
// 라이브 배포 (Railway). RAILWAY_TOKEN 있을 때만. 윈터(아키텍트)가 담당.
async function railwayDeploy(client, channel, thread_ts, dir, repo) {
  const arch = byName('윈터') || LEAD;
  if (!process.env.RAILWAY_API_TOKEN && !process.env.RAILWAY_TOKEN) { await postAs(client, channel, thread_ts, arch, '라이브 URL로 띄우려면 RAILWAY_API_TOKEN 하나만 넣어줘. 넣으면 새로 만들 때마다 자동으로 띄워서 주소 줄게.'); return null; }
  const svc = (repo.split('/').pop() || 'app').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28) || 'app';
  await postAs(client, channel, thread_ts, arch, '라이브로 띄울게. 레일웨이에 올리는 중이라 몇 분 걸려.');
  // 업로드에서 무거운/불필요 파일 제외 (빌드 산출물 node_modules·.next·.git 등)
  await sh(`printf 'node_modules\\n.next\\n.git\\ndist\\nbuild\\n.turbo\\n' > .railwayignore`, dir);
  // 계정토큰이면 빌드 전용 프로젝트(BUILDS_PROJECT_ID)에 링크 (컨테이너 자동주입 RAILWAY_PROJECT_ID와 분리). </dev/null로 대화형 멈춤 방지
  if (process.env.BUILDS_PROJECT_ID) await sh(`env -u RAILWAY_TOKEN railway link --project ${process.env.BUILDS_PROJECT_ID} --environment ${process.env.BUILDS_ENV || 'production'} </dev/null 2>&1`, dir);
  // 서비스 먼저 생성 (없으면 up이 "Service not found" 냄). </dev/null로 대화형 프롬프트 멈춤 방지. 이미 있으면 무시됨
  await sh(`env -u RAILWAY_TOKEN railway add --service ${svc} </dev/null 2>&1`, dir);
  const up = await sh(`env -u RAILWAY_TOKEN railway up --service ${svc} --ci </dev/null 2>&1`, dir);
  if (up.code !== 0) {
    const emsg = (up.out || up.err) || '';
    await postAs(client, channel, thread_ts, arch, '레일웨이 배포가 막혔어:\n' + emsg.slice(-500));
    if (/invalid|token|unauthorized|permission|not ?found|undefined|TypeError|env|변수/i.test(emsg)) selfHeal(client, channel, thread_ts, '[railway 배포 실패] ' + emsg.slice(-600)).catch(() => {}); // 설정/코드성 에러면 자가수정
    return null;
  }
  const dom = await sh(`env -u RAILWAY_TOKEN railway domain --service ${svc} </dev/null 2>&1`, dir);
  const m = (dom.out || '').match(/https?:\/\/[^\s'"]+/);
  const url = m ? m[0] : null;
  if (url) await postAs(client, channel, thread_ts, arch, `라이브 올라갔어: ${url}`);
  else await postAs(client, channel, thread_ts, arch, '배포는 올렸는데 도메인 자동발급이 안 떴어. 레일웨이 대시보드에서 도메인 한 번 눌러줘.');
  return url;
}
// 빌드 통과 후: 라이브 배포 시도 + 실제 화면(첫 화면) 스크린샷을 QA가 직접 올려 검증
async function liveCheck(client, channel, thread_ts, dir, repo) {
  const qa = byName('정소민') || LEAD; // 화면 스크린샷 비주얼 검증 = UX
  let url = null, srv = null, target = null;
  const deployable = (await sh(`test -f package.json && echo yes || echo no`, dir)).out.includes('yes'); // 정적 HTML은 package.json 없음 → 레일웨이 배포 스킵
  if (deployable) { try { url = await railwayDeploy(client, channel, thread_ts, dir, repo); } catch (e) {} }
  registerService(repo, url, channel); // 서비스 대장에 등록 (운영/마케팅 루프 대상)
  target = url;
  try {
    if (!target) {
      const port = 4300 + (parseInt((dir.match(/(\d+)/) || [])[1] || '1', 10) % 600); // 동시 빌드 포트 충돌 방지
      const hasStart = deployable && (await sh(`grep -q '"start"' package.json && echo yes || echo no`, dir)).out.includes('yes');
      let cmd, serveDir = dir;
      if (hasStart) cmd = `cd ${dir} && PORT=${port} npm start`; // Next 등
      else { // 정적 HTML → index.html 있는 폴더를 python으로 서빙
        const idx = (await sh(`find ${dir} -maxdepth 3 -name index.html -not -path '*/node_modules/*' | head -1`, dir)).out.trim();
        serveDir = idx ? idx.replace(/\/index\.html$/, '') : dir;
        cmd = `cd ${serveDir} && python3 -m http.server ${port}`;
      }
      srv = spawn('bash', ['-lc', cmd], { env: { ...process.env, HOME: '/tmp' }, stdio: 'ignore' });
      if (await waitHttp(`http://localhost:${port}`, 25000)) target = `http://localhost:${port}`;
    }
    if (!target) { await postAs(client, channel, thread_ts, qa, '실제 화면을 띄워서는 못 봤어(서버 기동 실패). 코드랑 빌드는 통과한 상태야.'); return; }
    if (url) await waitHttp(url, 60000); // 라이브(Railway)는 배포 직후 준비 안 됐을 수 있으니 떠서 응답할 때까지 대기 → 빈 화면 촬영 방지
    await postAs(client, channel, thread_ts, qa, '실제 화면 띄워서 스크린샷 찍는 중...');
    const prefix = 'shot' + ((dir.match(/(\d+)/) || [])[1] || '0'); // 동시 빌드 스크린샷 파일명 충돌 방지
    const shots = await captureShots(target, prefix);
    let any = false;
    for (const s of shots) any = (await uploadShot(channel, thread_ts, s.path, s.label)) || any;
    const liveNote = url ? `\n실제로 열어서 테스트하려면 여기로: ${url}` : '\n근데 라이브 배포가 막혀서 너가 열어볼 공개 주소는 아직 없어(내 내부에서만 띄워서 확인한 거야). 배포 고쳐서 다시 올리면 공개 주소 줄게.';
    if (any) await postAs(client, channel, thread_ts, qa, '첫 화면(로드 직후, 스크롤 전) 스크린샷 올렸어. 히어로 밑이 비어 보이면 스크롤 진입 애니메이션이 화면 밖에서 안 켜지는 문제니까 그건 잡아야 돼.' + liveNote);
    else await postAs(client, channel, thread_ts, qa, '스크린샷 업로드는 막혔는데(files:write 권한 필요), 내가 직접 띄워서 화면은 확인했어.' + liveNote);
  } catch (e) { await postAs(client, channel, thread_ts, qa, '화면 검증 중 문제: ' + String(e).slice(0, 200)); }
  finally { if (srv) try { srv.kill('SIGKILL'); } catch (_) {} }
}

// 품질 게이트 — 빌드 통과 후 테스트 실행 + 의존성 취약점 스캔 + 우정잉 코드/보안 리뷰
async function qaGate(client, channel, thread_ts, dir) {
  const eng = byName('윈터') || LEAD;  // 테스트 실행 = 엔지니어링
  const sec = byName('우정잉') || LEAD; // 취약점·보안 리뷰 = 보안
  // 1) 테스트 (test 스크립트가 실제로 있고 기본 placeholder가 아니면) — 윈터
  const ht = await sh(`grep -q '"test"' package.json && ! grep -q 'no test specified' package.json && echo yes || echo no`, dir);
  if (ht.out.includes('yes')) {
    const tr = await sh('npm test 2>&1', dir);
    await postAs(client, channel, thread_ts, eng, tr.code === 0 ? '테스트도 돌려봤어, 다 통과했어.' : '테스트 돌렸더니 일부 깨졌어. 이거 짚고 가자:\n' + (tr.out || '').slice(-500));
  }
  // 2) 의존성 취약점 스캔 — 우정잉
  const au = await sh('npm audit --omit=dev 2>&1 | tail -10', dir);
  if (/0 vulnerabilities/.test(au.out)) await postAs(client, channel, thread_ts, sec, '의존성 취약점 스캔도 깨끗해.');
  else if ((au.out || '').trim()) await postAs(client, channel, thread_ts, sec, '의존성에 취약점 좀 떴어. 심각한 건 잡자:\n' + au.out.slice(-400));
  // 3) 코드/보안 리뷰 (진짜 문제만)
  const rev = await runClaude(`이 저장소를 보안·버그 관점에서 빠르게 리뷰해라. 진짜 문제만 짚어 (하드코딩된 시크릿/키, 입력검증 누락, 명백한 버그, 인증·권한 허점, 위험한 패턴). 없으면 솔직히 "큰 문제 없음"이라고 해. 지어내지 마.${PLAIN}`, 'sonnet', dir, WORK_PERMISSION_MODE, 180000);
  if (rev.text && rev.ok !== false && !rev.limited) await postAs(client, channel, thread_ts, sec, '코드 보안/버그 리뷰했어:\n' + rev.text.trim().slice(0, 900));
}

// 앱 빈구멍 탐지 — 빌드는 통과해도 실제 사용자 화면/핵심이 비어있는 "껍데기"를 잡아냄 (빈 Next 앱도 build는 통과하므로 build 성공≠완성)
async function checkAppGaps(dir) {
  const gaps = [];
  try {
    const next = (await sh(`find ${dir} -name "next.config.*" -not -path "*/node_modules/*" | head -1`, dir)).out.trim();
    if (next) { // Next.js 앱인데 페이지(라우트)가 layout/error 빼고 하나도 없으면 = 보여줄 화면이 없음
      const pages = (await sh(`find ${dir} \\( -name "page.tsx" -o -name "page.jsx" -o -name "page.js" -o -path "*/pages/index.*" \\) -not -path "*/node_modules/*" -not -path "*/.next/*" | head -3`, dir)).out.trim();
      if (!pages) gaps.push('웹 화면(라우트 page)이 하나도 없음 — 사용자가 볼 게 404뿐');
    }
    const vite = (await sh(`find ${dir} -name "vite.config.*" -o -name "index.html" -not -path "*/node_modules/*" | head -1`, dir)).out.trim();
    if (vite && !next) {
      const comps = (await sh(`find ${dir}/src -name "*.tsx" -o -name "*.jsx" 2>/dev/null -not -path "*/node_modules/*" | wc -l`, dir)).out.trim();
      if (comps === '0') gaps.push('프론트 컴포넌트가 하나도 없음');
    }
  } catch {}
  return gaps;
}
// R3: Critic — PR/완료 전, 별도 claude가 "요청을 실제로 충족했나" 엄격 심사. FAIL이면 지적대로 1회 고치고 재심사. 빈껍데기·미충족을 거짓완료로 넘기는 것 방지(Devin Critic + evaluator-optimizer).
async function runCritic(client, channel, thread_ts, dir, task, prd) {
  const sec = byName('우정잉') || LEAD;
  for (let attempt = 1; attempt <= 2; attempt++) {
    bumpWork(channel);
    const c = await runClaude(`너는 깐깐한 심사자(critic)다. 이 저장소가 아래 요청을 "실제로" 충족했는지 코드를 직접 열어 판정해라. 후하게 주지 말고 코드 근거로.\n\n요청: "${task}"\n\n체크: 1) 요청한 걸 실제 구현했나(빈 껍데기·플레이스홀더·로렘입숨·TODO 주석은 미충족) 2) 빌드/타입 깨진 데 없나 3) 명백한 버그·보안구멍 없나${prd ? ' 4) PRD 핵심기능 반영했나' : ''}\n\n첫 줄에 반드시 "PASS" 또는 "FAIL" 한 단어. FAIL이면 다음 줄부터 무엇이 미충족이고 무엇을 고쳐야 하는지 구체적으로(파일·증상). 마크다운 금지.`, 'sonnet', dir, WORK_PERMISSION_MODE, 300000);
    const verdict = (c.text || '').trim();
    if (c.limited || /^\s*PASS/i.test(verdict)) { jobUpdate(channel, { critic: 'PASS' }); return true; }
    await postAs(client, channel, thread_ts, sec, `🔎 심사에서 걸렸어. 고치고 갈게:\n${verdict.slice(0, 500)}`);
    jobUpdate(channel, { critic: 'FAIL→수정', note: verdict.replace(/\n/g, ' ').slice(0, 150) });
    if (attempt >= 2) return false; // 두 번째도 FAIL이면 더 안 돌리고 정직하게 미충족 보고(아래 호출측)
    const fix = await runClaude(`심사자가 이 저장소를 보고 다음을 지적했어. 지적대로 실제로 고쳐라(추측 말고 코드 직접 수정). 빌드 통과 유지.\n\n[지적]\n${verdict.slice(0, 2000)}\n\n원래 요청: "${task}"`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000, true);
    if (fix.limited) return false;
  }
  return false;
}
// 제작 후 실제 빌드 검증 — npm 설치+빌드를 진짜로 돌려서 통과/실패를 정직하게 보고. 깨지면 1회 수정 시도.
async function verifyBuild(client, channel, thread_ts, dir, repo, pushRef = WORK_BASE) {
  const has = await sh('test -f package.json && grep -q \'"build"\' package.json && echo yes || echo no', dir);
  if (!has.out.includes('yes')) { // 빌드 스크립트 없음(정적 HTML 등) → 빌드는 스킵하되 라이브/스크린샷은 띄워
    const idx = (await sh(`find ${dir} -maxdepth 3 -name index.html -not -path '*/node_modules/*' | head -1`, dir)).out.trim();
    if (idx) await liveCheck(client, channel, thread_ts, dir, repo); // index.html 있으면 정적 서빙해서 화면 찍음
    return;
  }
  const qa = byName('윈터') || LEAD; // 빌드 검증 = 엔지니어링
  await postAs(client, channel, thread_ts, qa, '잠깐, 코드만 올리고 끝내면 안 되지. 실제로 빌드되는지 내가 돌려볼게.');
  await sh('npm install --no-audit --no-fund 2>&1 | tail -3', dir);
  let bd = await sh('npm run build 2>&1', dir);
  if (bd.code === 0) { const g = await checkAppGaps(dir); await postAs(client, channel, thread_ts, qa, g.length ? `빌드는 통과하는데, 솔직히 아직 껍데기야 — ${g.join(', ')}. 컴파일만 되고 실제 화면이 없어서 이대로는 못 써.` : '빌드 통과 확인했어. 실제로 컴파일까지 돼.'); await qaGate(client, channel, thread_ts, dir); await liveCheck(client, channel, thread_ts, dir, repo); return; }
  // 실패 → 1회 자동 수정
  await postAs(client, channel, thread_ts, qa, '빌드가 깨졌네. 에러 보고 한 번 고쳐볼게.\n' + (bd.out || '').slice(-500));
  const fix = await runClaude(`이 저장소 빌드가 다음 에러로 실패했어. 원인 찾아서 실제로 고쳐. 추측 말고 에러 그대로 보고 고쳐라.\n\n[에러]\n${(bd.out || '').slice(-2500)}`, 'sonnet', dir, WORK_PERMISSION_MODE, 300000);
  await sh('git add -A && git commit -m "fix: 빌드 에러 수정" 2>&1', dir);
  await sh(`git push origin HEAD:${pushRef} 2>&1`, dir); // 작업이 올라간 ref로 푸시(승인모드/PR이면 그 브랜치로) — main 직행해 승인 우회하던 거 방지
  bd = await sh('npm run build 2>&1', dir);
  if (bd.code === 0) await postAs(client, channel, thread_ts, qa, '고치고 다시 빌드하니까 통과했어. 수정분도 올렸어.');
  else await postAs(client, channel, thread_ts, qa, '한 번 고쳐봤는데 아직 빌드가 안 돼. 이건 사람이 한 번 봐야 할 거 같아.\n' + (bd.out || '').slice(-400) + '\n' + (fix.text || '').slice(0, 300));
}

async function runWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName) {
  ensureJob(channel, newProject ? 'build' : 'work', task, repo); // R1: launchWork 외 경로(스케줄·자가수정·디스패치)가 부른 작업도 보드에 기록
  if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, LEAD, 'GITHUB_TOKEN이 아직 없어서 작업 모드는 못 돌려. 토큰만 넣으면 바로 돼.'); return; }
  const id = ++workSeq;
  workCancel[channel] = false;
  const dir = `/tmp/w${id}`;
  if (newProject) {
    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    const base = /포트폴리오|portfolio/i.test(task) ? 'doping-portfolio' : (clean(projName) || clean(task) || 'doping-app');
    // 깔끔한 이름으로, 진짜 겹칠 때만 -2, -3 ...
    let name = base;
    for (let n = 2; n <= 50; n++) {
      const ex = await ghGet(`/repos/${GH_OWNER}/${name}`);
      if (!ex || !ex.full_name) break;   // 비어있음 → 이 이름 사용
      name = `${base}-${n}`;
    }
    await postAs(client, channel, thread_ts, LEAD, `🆕 새 프로젝트 만들게: ${name}\n요청: ${task}\n깃허브에 레포 만들고 처음부터 짜볼게. 좀 걸려.`);
    const desc = `도핑연구소: ${task}`.replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); // 깃허브 description은 제어문자(줄바꿈 등) 금지
    let created = await ghPost('/user/repos', { name, private: true, auto_init: true, description: desc });
    if (!created || !created.full_name) created = await ghPost('/user/repos', { name, private: true, auto_init: true, description: '도핑연구소 자동 생성' }); // 1회 자동 재시도 (description 문제면 안전값으로)
    if (created && created.full_name) { repo = created.full_name; if (activeWork[channel]) { activeWork[channel].repo = repo; activeWork[channel].newProject = false; } } // 레포 생겼으니 재개 시엔 이 레포에서 이어감(중복 생성 방지)
    else { await postAs(client, channel, thread_ts, LEAD, '레포 생성이 두 번 다 실패했어ㅠ 같은 이름이 이미 있거나 깃허브 쪽 문제일 수 있어.\n' + JSON.stringify(created || {}).slice(0, 200)); return; }
  } else {
    await postAs(client, channel, thread_ts, LEAD, `🛠️ 작업 받았어\n레포: ${repo}\n할 일: ${task}\n클론하고 코드 손본 다음 ${forcePR ? 'PR로 올릴게(승인모드)' : WORK_BASE + '에 바로 반영할게'}. 좀 걸려.`);
  }
  lastRepo[channel] = repo; persistLastRepo(); // 채널이 방금 다룬 레포 기억 (후속 "이거 고쳐줘" 문맥용, 재배포에도 유지)
  const prog = startProgress(channel, thread_ts, '일단 레포 받아오는 중');
  try {
  const cl = await sh(`rm -rf ${dir} && git clone https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
  if (cl.code !== 0) { await postAs(client, channel, thread_ts, LEAD, `클론 실패ㅠ — '${repo}' 레포 이름이 맞는지 확인해줘 (없는 이름이면 못 받아와). "서비스 목록"으로 확인되고, sponono/wewantpeace/myungjak 중 하나거나 정확한 owner/repo면 돼.\n` + (cl.err || '').slice(0, 300)); return; }
  await sh(`git config user.name "doping-lab[bot]" && git config user.email "bot@doping.lab"`, dir);
  const intro = newProject
    ? '이 빈 저장소에 다음 요청대로 프로젝트를 처음부터 만들어라. 적절한 기술스택을 직접 고르고, README도 작성해라. 중요: 데모가 아니라 바로 상용으로 오픈해도 되는 수준으로 완성해라 — 실제 콘텐츠(로렘입숨·더미텍스트 금지), 에러·로딩·빈 상태 처리, 반응형 완비, 깨진 링크·콘솔 에러 없음, 환경변수 정리, npm run build 통과. 핵심 로직엔 테스트 코드도 짜서 npm test로 돌려 통과시키고, CHANGELOG.md에 이번에 만든 걸 적어라. 대충 만들고 끝내지 마.'
    : '이 저장소에서 다음 작업을 실제로 수행해라. 파일을 직접 수정하고, 필요하면 의존성 설치하고 테스트까지 돌려서 동작을 확인해라. 상용 수준으로, 어설프게 끝내지 마라.';
  // 신규 프로젝트는 제작 전에 팀이 라이브로 기획 핑퐁(구어체) → 그 PRD로 제작
  if (newProject) prog.phase('다 같이 기획 짜는 중');
  const prd = newProject ? await runPRD(client, channel, thread_ts, task) : '';
  if (workCancel[channel]) { delete workCancel[channel]; await postAs(client, channel, thread_ts, LEAD, '기획 단계에서 중단했어. 아무것도 안 올렸어.'); return; }
  if (newProject && prd === null) return; // 한도/중단 → runPRD가 이미 안내함, 제작 안 들어감
  if (newProject) await postAs(client, channel, thread_ts, LEAD, '좋아 PRD 확정됐고, 이제 이 PRD 그대로 실제 코드 짤게. 좀 걸려.');
  prog.phase('지금 코드 짜는 중이야');
  const assetHeavy = /게임|game|sprite|스프라이트|캐릭터|에셋|asset|픽셀|pixel|애니메이션|아케이드|arcade|2d|3d|canvas|phaser/i.test(task);
  // UI/화면 관련이거나 신규 프로젝트일 때만 디자인 규칙 적용 (백엔드·봇 자가수정 등엔 노이즈라 빼)
  const uiish = newProject || /ui|화면|디자인|프론트|컴포넌트|페이지|버튼|css|스타일|레이아웃|frontend|react|html|랜딩|사이트|홈페이지|게임/i.test(task);
  const fbBuild = drainFeedback(channel); // 제작 직전 들어온 사용자 수정요청도 반영
  const res = await runClaude(`${intro}${rulesCtx(channel)}${PLAIN}${uiish ? DESIGN_RULE : ''}${newProject ? LAUNCH_RULE : ''}${assetHeavy ? ASSET_RULE : ''}${prd ? '\n\n[팀이 완성한 PRD — 이걸 그대로, 벗어나지 말고 구현해라. 여기 적힌 핵심기능·화면·플로우·기술스택·차별화 훅을 전부 반영]\n' + prd : ''}${fbBuild ? '\n\n[사용자가 추가로 준 지시 — 반드시 반영]\n' + fbBuild : ''}\n\n요청: ${task}\n\n끝나면 한 일을 담당 역할별로 나눠서 보고해라. 각 줄을 "역할: 한 일" 형식으로 쓰되, 딱딱한 보고체 말고 친한 동료한테 말하듯 편하게 써(역할은 PM/리서처/UX/아키텍트/보안/마케터 중 관련된 것만). 한 역할당 1~2줄, 실제 한 일만, 지어내지 마.`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000, true);
  if (res.limited) { jobUpdate(channel, { status: 'limited' }); await postAs(client, channel, thread_ts, LEAD, '⏳ 제작 중에 클로드 사용량 한도에 걸렸어. 지금까지 만든 건 안 올렸어, 한도 리셋되면 이어서 만들게.'); return; }
  // 연속완성 패스(R2: Task/Progress 원장 + 재계획) — 신규 풀빌드/화면작업은 한 번에 안 끝나고 스캐폴딩만 남기 쉬움. 갭이 줄어드는지(진척) 추적해서, 직전 패스가 진척이 없었으면(스톨) 같은 방식 반복 말고 접근을 바꿔 재계획. 진행기록은 job 원장에 남김.
  if ((newProject || uiish || (feedback[channel] || []).length) && !res.limited) {
    let prevGapCount = Infinity; const progress = [];
    for (let pass = 1; pass <= 4 && !workCancel[channel]; pass++) { // 재계획 여지로 3→4
      bumpWork(channel);
      const gaps = await checkAppGaps(dir);
      const fbCont = drainFeedback(channel); // 메인 생성 도중 들어온 사용자 피드백("그거 빼고/바꿔")을 이 패스에서 실제로 반영
      if (!gaps.length && !fbCont) { progress.push(`${pass - 1}차 후 갭 없음 → 완료`); break; }
      const stalled = gaps.length && gaps.length >= prevGapCount; // 직전 패스가 갭을 못 줄임 = 진척 없음
      prevGapCount = gaps.length;
      progress.push(`${pass}차: 갭 ${gaps.length}개${stalled ? '(진척없음→재계획)' : ''}${fbCont ? '+피드백' : ''}`);
      jobUpdate(channel, { ledger: { plan: prd ? 'PRD 기반 빌드' : task.slice(0, 80), gaps, progress: progress.slice(-6) } });
      prog.phase(stalled ? `접근 바꿔서 다시 (${pass}차)` : fbCont ? `방금 준 피드백 반영 (${pass}차)` : `아직 비어서 더 채우는 중 (${pass}차)`);
      const replanNote = stalled ? '\n\n[중요 — 재계획] 직전 시도가 진척이 없었어(같은 게 여전히 비어있음). 똑같은 방식 반복하지 마. 왜 안 됐는지 코드를 직접 보고 원인을 짚은 다음, 다른 접근(다른 파일 구조/다른 구현 방식)으로 실제로 끝까지 구현해라.' : '';
      const cont = await runClaude(`이 저장소를 더 다듬어라.${gaps.length ? ` 특히 지금 비어있는 것: ${gaps.join(' / ')} — 데모·플레이스홀더·로렘입숨·"TODO" 금지로 실제 화면(라우트 page)·컴포넌트·핵심 플로우를 끝까지 만들어라.` : ''}${replanNote}${fbCont ? `\n\n[사용자가 방금 추가로 준 지시 — 반드시 그대로 반영]\n${fbCont}` : ''}\n\n이미 있는 서버/타입은 활용하고 npm run build 통과 유지.${prd ? '\n\n[따라야 할 PRD]\n' + prd.slice(0, 5000) : ''}`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000, true);
      if (cont.limited) { await postAs(client, channel, thread_ts, LEAD, '⏳ 이어서 채우다가 한도에 걸렸어. 지금까지 만든 만큼만 올릴게, 리셋되면 "이어서"라고 해줘.'); break; }
    }
  }
  // R3: PR/완료 전 critic 심사 (신규·UI 작업만 — 작은 수정엔 과함). FAIL이면 runCritic이 1회 고치고 재심사.
  let criticPass = true;
  if ((newProject || uiish) && !workCancel[channel]) { prog.phase('요청대로 됐는지 심사하는 중'); criticPass = await runCritic(client, channel, thread_ts, dir, task, prd); }
  await sh('git add -A', dir);
  const repoUrl = `https://github.com/${repo}`;
  const chk = await sh('git diff --cached --quiet; echo $?', dir);
  if (chk.out.trim().endsWith('0')) { jobUpdate(channel, { status: 'done', note: '변경 없음' }); await postAs(client, channel, thread_ts, LEAD, `변경/생성된 게 없었어.\n${repoUrl}\n\n` + (res.text || '').trim().slice(0, 1500)); return; }
  if (workCancel[channel]) { delete workCancel[channel]; jobUpdate(channel, { status: 'cancelled' }); await postAs(client, channel, thread_ts, LEAD, '작업 중단했어. main엔 아무것도 안 올렸어.'); return; }
  const cmsg = task.slice(0, 60).replace(/[`$"\\!\r\n;|&<>()]/g, '').trim() || '작업'; // 셸 명령치환/인젝션 방지 (백틱·$·따옴표 등 제거)
  await sh(`git commit -m "도핑연구소: ${cmsg}"`, dir);
  prog.phase('빌드 되나 돌려보고 라이브로 띄우는 중');
  const finalGaps = (newProject || uiish) ? await checkAppGaps(dir) : []; // 최종 빈구멍 — "다 끝냈어 상용수준" 거짓완료 방지
  const incomplete = finalGaps.length > 0 || !criticPass; // R3: 심사 미통과도 미완성으로
  const doneHead = incomplete ? `⚠️ 초안은 올렸는데 아직 미완성이야 — ${finalGaps.length ? finalGaps.join(', ') : '심사에서 일부 미충족(위 지적 확인)'}. 이대로는 상용 아니고, 더 채워야 진짜 동작해. ("이어서"라고 하면 계속 채울게)` : '다 끝냈어! (심사 통과)';
  let mainErr = '';
  if (!forcePR) {
    const pushMain = await sh(`git push origin HEAD:${WORK_BASE}`, dir);
    if (pushMain.code === 0) {
      const n = await distributeReport(client, channel, thread_ts, res.text);
      if (!n) await postAs(client, channel, thread_ts, LEAD, (res.text || '').trim().slice(0, 1500));
      await verifyBuild(client, channel, thread_ts, dir, repo);
      jobUpdate(channel, { status: incomplete ? 'awaiting-approval' : 'done', artifacts: [repoUrl], note: incomplete ? '미완성(이어서 필요)' : undefined });
      await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}${doneHead} ${repoUrl} (${WORK_BASE}에 반영)\n코드 브라우저로 보려면: https://github.dev/${repo}\n빌드·라이브·스크린샷은 위에 확인해줘. (코드 파일로 받고 싶으면 "코드 줘"라고 해)`);
      if (newProject && !incomplete) await handoffChecklist(client, channel, thread_ts, repo, task); // 미완성이면 "상용 오픈 체크리스트" 안 띄움(거짓 신호 방지)
      return;
    }
    mainErr = (pushMain.err || '').slice(0, 250);
  }
  const branch = `doping/${id}-${Date.now().toString(36).slice(-5)}`; // 재시작으로 id 리셋돼도 안 겹치게 시각 꼬리표
  await sh(`git checkout -b ${branch}`, dir);
  const pushB = await sh(`git push origin ${branch}`, dir);
  if (pushB.code !== 0) { await postAs(client, channel, thread_ts, LEAD, `push 실패ㅠ\n${mainErr ? 'main: ' + mainErr + '\n' : ''}branch: ${(pushB.err || '').slice(0, 250)}`); return; }
  const prTitle = `도핑연구소: ${task}`.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
  const pr = await ghPost(`/repos/${repo}/pulls`, { title: prTitle, head: branch, base: WORK_BASE, body: (res.text || task).slice(0, 4000) });
  const url = pr && pr.html_url ? pr.html_url : `(브랜치: ${branch})`;
  const n2 = await distributeReport(client, channel, thread_ts, res.text);
  if (!n2) await postAs(client, channel, thread_ts, LEAD, (res.text || '').trim().slice(0, 1500));
  await verifyBuild(client, channel, thread_ts, dir, repo, branch); // PR 경로 → 빌드 자동수정도 PR 브랜치로(main 직행 금지)
  jobUpdate(channel, { status: 'awaiting-approval', artifacts: [url], note: 'PR 머지 대기' });
  await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}${doneHead} ${forcePR ? '승인모드라 PR로 올렸어 (머지하면 반영).' : 'PR로 올렸어.'}\nPR: ${url}\n코드 브라우저로 보려면: https://github.dev/${repo}`);
  if (newProject && !incomplete) await handoffChecklist(client, channel, thread_ts, repo, task);
  } finally { await prog.done(); }
}

const ALL = TEAM.concat(LEAD);
// 역할별 보고를 각 담당 직원 이름으로 분배
const ROLE_MAP = { PM: '김채원 (PM)', 기획: '김채원 (PM)', 리서처: '아이유 (리서처)', 리서치: '아이유 (리서처)', UX: '정소민 (UX)', 디자인: '정소민 (UX)', 화면: '정소민 (UX)', 비주얼: '정소민 (UX)', 아키텍트: '윈터 (아키텍트)', 구조: '윈터 (아키텍트)', 백엔드: '윈터 (아키텍트)', 빌드: '윈터 (아키텍트)', 테스트: '윈터 (아키텍트)', 배포: '윈터 (아키텍트)', 운영: '윈터 (아키텍트)', 데브옵스: '윈터 (아키텍트)', 인프라: '윈터 (아키텍트)', 보안: '우정잉 (보안)', 취약점: '우정잉 (보안)', 마케터: '영듀 (마케터)', 마케팅: '영듀 (마케터)', 그로스: '영듀 (마케터)', 팀장: '한로로 (팀장)', 한로로: '한로로 (팀장)', 로로: '한로로 (팀장)', 김채원: '김채원 (PM)', 채원: '김채원 (PM)', 아이유: '아이유 (리서처)', 정소민: '정소민 (UX)', 소민: '정소민 (UX)', 윈터: '윈터 (아키텍트)', 우정잉: '우정잉 (보안)', 정잉: '우정잉 (보안)', 영듀: '영듀 (마케터)', 안다연: '안다연 (반론자)', 다연: '안다연 (반론자)', 반론자: '안다연 (반론자)' }; // 역할키 + 직원 이름키 둘 다 — Claude가 이름으로 보고("윈터: …")해도 분배 안 끊기게
// 메인 앱이 활동하는 채널에 직원 봇 7명을 자동 초대 (채널당 1회)
const joinedChannels = new Set();
async function ensureMembers(channel) {
  if (joinedChannels.has(channel)) return;
  joinedChannels.add(channel);
  for (const p of TEAM) {
    if (!p.userId) continue;
    try { await botClient.conversations.invite({ channel, users: p.userId }); } catch (e) {}
  }
}
async function distributeReport(client, channel, thread_ts, text) {
  let posted = 0;
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)?\s*@?\s*([가-힣A-Za-z]+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const name = ROLE_MAP[m[1].trim()] || ROLE_MAP[m[1].trim().toUpperCase()];
    const p = name && ALL.find(x => x.name === name);
    if (!p) continue;
    await postAs(client, channel, thread_ts, p, m[2].trim().slice(0, 1200));
    posted++;
  }
  return posted;
}
// 각 직원의 Slack user_id 확보 (그 직원을 @멘션했을 때 라우팅용)
async function resolveIds() {
  for (const p of ALL) {
    const tok = (p.tokenEnv && process.env[p.tokenEnv]) || (p === LEAD ? SLACK_BOT_TOKEN : null);
    if (!tok) continue;
    try { const r = await new WebClient(tok).auth.test(); p.userId = r.user_id; } catch (_) {}
  }
}
// 누구한테 한 말인지: ①그 직원 봇 멘션 ②본문에 이름 ③기본 팀장
function pickPersona(text) {
  for (const p of ALL) if (p.userId && text.includes(`<@${p.userId}>`)) return p;
  const plain = text.replace(/<@[^>]+>/g, '');
  for (const p of ALL) if ((p.kw || []).some(k => plain.includes(k))) return p;
  return null; // 아무도 호명 안 됨
}

// ── 캐주얼 반응: 채널 글에 랜덤 일부 직원이 이모지/짧은 코멘트 ──
const EMOJIS = ['eyes','fire','+1','thinking_face','heart','tada','bulb','100','clap','raised_hands','ok_hand','sparkles','rocket','star2','muscle','open_mouth','joy'];
function pickRandom(arr, k) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.max(0, k));
}
async function react(persona, defaultClient, channel, ts) {
  const wc = clientFor(persona) || defaultClient;
  const name = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  try { await wc.reactions.add({ channel, timestamp: ts, name }); } catch (_) { /* reactions:write 없으면 조용히 무시 */ }
}
async function casualLayer(event, client, exclude, opts = {}) {
  const ex = Array.isArray(exclude) ? exclude : (exclude ? [exclude] : []);
  const others = TEAM.filter(p => !ex.includes(p));
  const emojiPpl = pickRandom(others, 1 + Math.floor(Math.random() * 3)); // 1~3명 이모지
  for (const p of emojiPpl) await react(p, client, event.channel, event.ts);
  if (!opts.noComment && Math.random() < 0.4) { // ~40% 확률로 1명 짧은 코멘트
    const [c] = pickRandom(others.filter(p => !emojiPpl.includes(p)), 1);
    if (c) {
      const text = (event.text || '').replace(/<@[^>]+>/g, '').trim();
      const res = await runClaude(`${c.prompt}${STYLE}\n\n[채널에서 이 글을 봤다]\n${text}\n\n여기에 한두 문장으로 아주 짧게, 너답게 가볍게 반응해라.`, c.model);
      if (res.text) await postAs(client, event.channel, event.thread_ts, c, res.text.trim().slice(0, 500));
    }
  }
}

const seen = new Set();
// 특정 단어 없이도 메시지가 "작업 요청"인지 AI가 판단
async function classifyIntent(text, ctx) {
  try {
    const res = await runClaude(`${ctx ? '[최근 대화]\n' + ctx + '\n\n' : ''}다음 메시지의 의도를 판단해서 JSON만 출력해라. 설명 금지.\n메시지: ${JSON.stringify(text)}\n\n형식: {"action": "work"|"report"|"debate"|"chat", "task": "할 일/주제/볼 것을 한 문장", "newProject": true|false, "repo": "sponono|wewantpeace|myungjak|new 중 해당", "name": "newProject일 때만, 이 프로젝트를 잘 나타내는 영문 짧은 레포이름(소문자와 하이픈만, 예: ramen-shop-game, todo-app). 아니면 빈문자열"}\n기준: 코드를 만들/고치/추가/개선/구현하라면 action=work. 프로젝트의 현황·상태·운영·구조를 조사·보고하라면 action=report. "토론하자/논의하자/토론해줘"처럼 새로운 주제로 팀 토론을 새로 시작하라고 할 때만 action=debate(task=토론 주제). 단 "다른 의견은?", "더 말해봐", "넌 어때", "다른사람들은?" 같은 진행 중 대화의 추가 질문이나 안부·잡담·단순 질문은 action=chat. 너희(이 봇/팀원들) 자신에 대한 질문(누가 뭐 담당하냐, 무슨 모델 쓰냐, 자기소개, 인사, "각자 ~해봐" 같은 멤버 호출)은 프로젝트 보고가 아니라 action=chat. 새로 뭔가(홈페이지/사이트/포트폴리오/앱/게임/툴/서비스 등) 만들거나 개발하라면 거의 다 newProject=true 이고 repo=new. "X 만들고 싶어", "X 게임 만들어줘", "새로 ~ 하나" 같은 건 무조건 newProject=true, repo=new (기존 레포에 작업하는 게 절대 아님). 위원트피스=wewantpeace, 스포노노=sponono, 명작=myungjak. 사용자가 말한 프로젝트가 sponono/wewantpeace/myungjak 중 어느 것도 아니거나 어느 프로젝트인지 불명확하면 repo는 반드시 "unknown"으로 해. 절대 가까운 걸로 추측해서 고르지 마. 이 슬랙 봇(도핑연구소 봇/너희들 자체)을 고치라면 repo="bot".`, 'haiku');
    const mm = (res.text || '').match(/\{[\s\S]*\}/);
    return mm ? JSON.parse(mm[0]) : { action: 'chat' };
  } catch { return { action: 'chat' }; }
}

function resolveRepo(hint) {
  if (!hint) return WORK_DEFAULT_REPO;
  if (hint.includes('/')) return hint;
  const m = { sponono: 'nameofkk/sponono', 스포노노: 'nameofkk/sponono', wewantpeace: 'nameofkk/wewantpeace', 위원트피스: 'nameofkk/wewantpeace', myungjak: 'nameofkk/myungjak', 명작: 'nameofkk/myungjak', 몽유병친구들: 'nameofkk/sleepwalking-friends-4', 몽유병: 'nameofkk/sleepwalking-friends-4', sleepwalking: 'nameofkk/sleepwalking-friends-4', bot: 'nameofkk/doping-lab-slack', 봇: 'nameofkk/doping-lab-slack', 도핑봇: 'nameofkk/doping-lab-slack' };
  return m[hint] || m[hint.toLowerCase()] || `nameofkk/${hint}`;
}
// 메시지에서 명시된 레포 이름을 뽑아냄 (분류기가 모르는 doping-portfolio 같은 것도 인식)
function extractRepo(raw) {
  // owner/repo — 단, client/server·24/7·and/or·TCP/IP 같은 일반 표현 오탐 방지(소유자 명시되거나 레포명에 하이픈/숫자 있는 진짜 레포꼴만)
  let m = raw.match(/\b([A-Za-z][\w.-]{1,38}\/[A-Za-z0-9][\w.-]{1,38})\b/);
  if (m && (/^nameofkk\//i.test(m[1]) || /[-\d]/.test(m[1].split('/')[1]))) return m[1];
  for (const k of ['sponono', '스포노노', 'wewantpeace', '위원트피스', 'myungjak', '명작', '몽유병친구들', '몽유병', 'sleepwalking']) if (raw.includes(k)) return resolveRepo(k); // 알려진 프로젝트 별칭
  const svc = svcList().find(s => raw.includes(s.repo.split('/').pop())); if (svc) return svc.repo; // 등록된 서비스
  m = raw.match(/\b(doping-[a-z0-9-]+|[a-z0-9][a-z0-9-]{2,}-(?:game|app|web|site|portfolio|tool|bot))\b/i); // doping-* 또는 -game/-app 등으로 끝나는 토큰
  if (m) return `${GH_OWNER}/${m[1].toLowerCase()}`;
  return null;
}
async function runReport(client, channel, thread_ts, reporter, repo, task) {
  ensureJob(channel, 'report', task, repo); // R1: 보드에 기록
  if (!GITHUB_TOKEN) { jobUpdate(channel, { status: 'failed', error: 'GITHUB_TOKEN 없음' }); await postAs(client, channel, thread_ts, reporter, 'GITHUB_TOKEN이 없어서 조사를 못 해.'); return; }
  await postAs(client, channel, thread_ts, reporter, `${repo} 한번 까볼게. 잠깐만.`);
  const id = ++workSeq; const dir = `/tmp/r${id}`;
  const prog = startProgress(channel, thread_ts, `${repo.split('/').pop()} 까보고 정리하는 중`, reporter);
  try {
    const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
    if (cl.code !== 0) { await postAs(client, channel, thread_ts, reporter, `${mention(channel)}${repo} 레포를 못 찾았어ㅠ (이름 확인 필요)\n${(cl.err || '').slice(0, 200)}`); return; }
    const GROUND = '\n\n[사실 근거 규칙 — 엄격] 레포 코드/파일로 직접 확인되는 것만 사실로 말해라. 배포 여부, 앱스토어·플레이스토어 제출/승인 여부, 실제 유저 수, 매출, 광고 활성화 여부 같은 외부·운영 상태는 코드만으론 절대 알 수 없다. 코드에 준비/설정이 있어도 "제출됨/출시됨/활성화됨"이라고 단정하지 마. 그런 건 "코드엔 준비돼 있는데 실제 제출/활성화 여부는 확인 안 됨"으로 표시해라. 지어내면 안 된다.';
    const res = await runClaude(`이 저장소를 실제로 열어보고, 사용자의 요청 "${task}"에 직접 답해라. 단순 현황 나열이 아니라, 레포에서 확인한 사실을 근거로 실제 답·제안·전략을 내라. 코드는 읽기만 해. 레포에 없는 시장·경쟁사·트렌드·벤치마크는 웹서치(WebSearch)로 찾아서 근거로 써도 돼.${GROUND}${rulesCtx(channel)}\n\n역할별로 각자 그 요청에 대한 자기 분야의 답/제안을 줘. 각 줄 "역할: 답/제안" 형식(관련된 역할만, PM/리서처/UX/아키텍트/보안/마케터). 질문 분야의 담당이 메인으로 구체적인 안을 내고(예: 마케팅 질문이면 마케터가 채널·메시지·실행안까지), 나머지는 거들어. 한 역할당 2~4줄.${PLAIN}`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000);
    if (res.limited) { await postAs(client, channel, thread_ts, reporter, `${mention(channel)}⏳ 조사 중에 클로드 사용량 한도에 걸렸어. 리셋되면 다시 봐줄게.`); return; }
    const n = await distributeReport(client, channel, thread_ts, res.text);
    if (!n) await postAs(client, channel, thread_ts, reporter, (res.text || '(내용 없음)').trim().slice(0, 3000));
    // 반론자 안다연 — 위 의견들 검토해서 약점/리스크/근거 약한 부분 반박 (특히 코드로 확인 안 된 걸 사실처럼 말한 거)
    const devil = byName('안다연'); let devilText = '';
    if (devil && !workCancel[channel]) {
      const dr = await runClaude(`${devil.prompt}${STYLE}${rulesCtx(channel)}\n\n[사용자 질문]\n${task}\n\n[팀이 낸 의견들]\n${(res.text || '').slice(0, 2500)}\n\n반론자로서 이 의견들의 약점·리스크·빠뜨린 점·근거 약한 부분을 콕 집어 반박하고, 각 지적마다 보완책 한 줄씩. 특히 코드로 확인 안 된 걸 사실처럼 단정한 게 있으면 반드시 짚어줘. 편하게, 마크다운 금지.`, devil.model, WORKDIR, CLAUDE_PERMISSION_MODE, 150000);
      if (dr.text && dr.ok !== false && !dr.limited) { devilText = dr.text.trim(); await postAs(client, channel, thread_ts, devil, devilText.slice(0, 1200)); }
    }
    // 팀장 한로로 — 의견들 + 반론 다 검토해서 최종 실행안으로 종합·보완 (그냥 의견 나열로 끝내지 않게)
    if (workCancel[channel]) { delete workCancel[channel]; return; } // 중단 요청 시 종합 안 함
    const synth = await runClaude(`${LEAD.prompt}${PLAIN}${rulesCtx(channel)}\n\n[사용자 질문]\n${task}\n\n[팀 의견]\n${(res.text || '').slice(0, 2500)}\n\n[안다연 반론]\n${devilText.slice(0, 1200)}\n\n위를 다 검토해서 "최종안"으로 종합·보완해라. 의견 충돌은 네가 정리하고, 우선순위(1·2·3)를 매기고, 코드로 확인 안 된 가정은 빼거나 "확인 필요"로 표시해라. 바로 실행 가능한 구체적 액션으로 끝내. 마크다운 금지.`, LEAD.model, WORKDIR, CLAUDE_PERMISSION_MODE, 180000);
    if (synth.text && synth.ok !== false) await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}📌 최종안 (팀 의견+반론 종합)\n${synth.text.trim().slice(0, 2500)}`);
    else await postAs(client, channel, thread_ts, reporter, `${mention(channel)}다 정리했어, 위에 봐줘!`);
  } finally { await prog.done(); }
}

// ── 주기 스케줄 (영구 저장) ──
const SCHED_FILE = process.env.SCHEDULES_FILE || '/data/schedules.json';
const schedules = []; let schedSeq = 0; let botClient = null;
function persistSchedules() {
  try {
    fs.mkdirSync(path.dirname(SCHED_FILE), { recursive: true });
    const items = schedules.map(s => ({ id: s.id, channel: s.channel, kind: s.kind, ms: s.ms, hour: s.hour, minute: s.minute, lastRunDay: s.lastRunDay, label: s.label, action: s.action, task: s.task, repo: s.repo, newProject: s.newProject, reporter: s.reporter }));
    fs.writeFileSync(SCHED_FILE, JSON.stringify({ seq: schedSeq, items }));
  } catch (e) { /* 볼륨 없으면 메모리만 */ }
}
function jobFor(s) {
  return async () => {
    if (activeWork[s.channel]) return; // 채널에 진행 중 작업 있으면 이번 스케줄은 양보(동시 빌드·메시지 뒤섞임 방지)
    const reporter = ALL.find(p => p.name === s.reporter) || LEAD;
    const repo = s.newProject ? WORK_DEFAULT_REPO : resolveRepo(s.repo);
    activeWork[s.channel] = { task: s.task || s.label, started: Date.now(), beat: Date.now(), repo, scheduled: true }; // 스케줄 작업도 채널 점유(진행중 새작업 차단 + beat로 워치독 적용)
    try {
      if (s.action === 'work' && s.task) await runWork(botClient, s.channel, undefined, repo, s.task, !!s.newProject, true);
      else await runReport(botClient, s.channel, undefined, reporter, repo, s.task || s.label);
    } catch (e) { /* 스케줄 작업 오류는 조용히 — 다음 회차에 재시도 */ }
    finally { activeWork[s.channel] = null; }
  };
}
function startSchedule(s, runNow) {
  if (s.kind !== 'daily') s.timer = setInterval(() => jobFor(s)().catch(() => {}), s.ms);
  schedules.push(s);
  if (runNow) jobFor(s)().catch(() => {});
}
function loadSchedules() {
  try {
    if (!fs.existsSync(SCHED_FILE)) return;
    const d = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
    schedSeq = d.seq || 0;
    for (const s of (d.items || [])) startSchedule({ ...s }, false);
    console.log(`복원된 스케줄: ${schedules.length}개`);
  } catch (e) {}
}
function kstNow() {
  const d = new Date(Date.now() + 9 * 3600000);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), day: d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate() };
}
function parseDaily(text) {
  if (/마다/.test(text)) return null;
  const m = text.match(/(오전|아침|오후|저녁|밤)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/);
  if (!m) return null;
  let h = parseInt(m[2]); const min = m[3] ? parseInt(m[3]) : 0;
  if (/(오후|저녁|밤)/.test(m[1] || '') && h < 12) h += 12;
  if (/(오전|아침)/.test(m[1] || '') && h === 12) h = 0;
  if (/(밤|저녁)/.test(m[1] || '') && h === 12) h = 0; // "밤 12시" = 자정(0시). (오후 12시는 정오로 유지)
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
function humanMs(ms) {
  if (ms % 604800000 === 0) return `${ms / 604800000}주마다`;
  if (ms % 86400000 === 0) return ms === 86400000 ? '매일' : `${ms / 86400000}일마다`;
  if (ms % 3600000 === 0) return ms === 3600000 ? '매시간' : `${ms / 3600000}시간마다`;
  return `${Math.round(ms / 60000)}분마다`;
}

// ── 채널 기억(메모리) ──
const MEM_FILE = process.env.MEMORY_FILE || '/data/memory.json';
let memory = {}; let memDirty = false;
function loadMemory() { try { if (fs.existsSync(MEM_FILE)) memory = JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')) || {}; } catch { memory = {}; } }
function persistMemory() { if (!memDirty) return; try { fs.writeFileSync(MEM_FILE, JSON.stringify(memory)); memDirty = false; } catch {} }
function recordMsg(channel, who, text) {
  if (!channel || !text) return;
  (memory[channel] = memory[channel] || []).push({ who, text: String(text).slice(0, 400) });
  if (memory[channel].length > 25) memory[channel] = memory[channel].slice(-25);
  memDirty = true;
}
function recentCtx(channel) { return (memory[channel] || []).slice(-14).map(m => `${m.who}: ${m.text}`).join('\n'); }

// ── 팀 규칙(영구 지시) ──
const RULES_FILE = process.env.RULES_FILE || '/data/rules.json';
let rules = {};
function loadRules() { try { if (fs.existsSync(RULES_FILE)) rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')) || {}; } catch { rules = {}; } }
function persistRules() { try { fs.writeFileSync(RULES_FILE, JSON.stringify(rules)); } catch {} }
function addRule(channel, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200); // 개별 규칙 길이 제한 — 긴 단락이 통째 규칙되어 모든 프롬프트(rulesCtx) 부풀리는 거 방지
  if (!t) return;
  const arr = (rules[channel] = rules[channel] || []);
  if (arr.includes(t)) return; // 같은 규칙 중복 저장 방지
  arr.push(t);
  if (arr.length > 30) rules[channel] = arr.slice(-30);
  persistRules();
}
function rulesCtx(channel) { const r = rules[channel] || []; return r.length ? `\n\n[팀 규칙 — 항상 지켜라]\n${r.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : ''; }

// ── 설정(권한/승인) + 태스크보드 (영구) ──
const SET_FILE = process.env.SETTINGS_FILE || '/data/settings.json';
let settings = { commanders: [], approval: {} };
function loadSettings() { try { if (fs.existsSync(SET_FILE)) settings = JSON.parse(fs.readFileSync(SET_FILE, 'utf8')) || settings; } catch {} settings.commanders = settings.commanders || []; settings.approval = settings.approval || {}; }
function persistSettings() { try { fs.writeFileSync(SET_FILE, JSON.stringify(settings)); } catch {} }
function canCommand(user) { return !settings.commanders.length || settings.commanders.includes(user); }
const TASK_FILE = process.env.TASKS_FILE || '/data/tasks.json';
let tasks = {}; let taskSeq = 0;
function loadTasks() { try { if (fs.existsSync(TASK_FILE)) { const d = JSON.parse(fs.readFileSync(TASK_FILE, 'utf8')); tasks = d.items || {}; taskSeq = d.seq || 0; } } catch { tasks = {}; } }
function persistTasks() { try { fs.writeFileSync(TASK_FILE, JSON.stringify({ seq: taskSeq, items: tasks })); } catch {} }
function addTask(channel, text, who) { const t = { id: ++taskSeq, text, who, done: false }; (tasks[channel] = tasks[channel] || []).push(t); persistTasks(); return t; }
// ── R1: 자동 작업 보드(jobs) — 봇이 실제로 돌리는 작업을 영속 추적. fire-and-forget 탈피 + 재시작 생존 + 조회 ──
const JOBS_FILE = process.env.JOBS_FILE || '/data/jobs.json';
let jobs = {}; let jobSeq = 0; // jobs[id] = {id,channel,type,title,repo,status,by,createdAt,updatedAt,artifacts[],error,plan,note}
function loadJobs() {
  try { if (fs.existsSync(JOBS_FILE)) { const d = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); jobs = d.items || {}; jobSeq = d.seq || 0; } } catch { jobs = {}; }
  for (const id of Object.keys(jobs)) { const j = jobs[id]; if (['planning', 'running'].includes(j.status)) { j.status = 'interrupted'; j.note = (j.note ? j.note + ' / ' : '') + '재시작으로 중단됨'; } } // 프로세스 죽으면 진행중이던 것만 interrupted (awaiting-approval=PR대기는 재시작에도 유효하니 유지)
  persistJobs();
}
function persistJobs() { try { const ids = Object.keys(jobs).map(Number).sort((a, b) => a - b); if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete jobs[id]; fs.writeFileSync(JOBS_FILE, JSON.stringify({ seq: jobSeq, items: jobs })); } catch {} } // 최근 200개만 유지
function createJob(channel, type, title, repo, by) { const id = ++jobSeq; jobs[id] = { id, channel, type, title: String(title || '').slice(0, 120), repo: repo || null, status: 'running', by: by || null, createdAt: Date.now(), updatedAt: Date.now(), artifacts: [] }; persistJobs(); return jobs[id]; }
function jobUpdateById(id, patch) { const j = jobs[id]; if (!j) return; Object.assign(j, patch, { updatedAt: Date.now() }); persistJobs(); }
function jobUpdate(channel, patch) { const id = activeWork[channel] && activeWork[channel].jobId; if (id) jobUpdateById(id, patch); } // 현재 채널 진행작업에 연결된 job 갱신 (jobId 없으면 무시)
function ensureJob(channel, type, title, repo) { if (!activeWork[channel]) return null; if (!activeWork[channel].jobId) activeWork[channel].jobId = createJob(channel, type, title, repo, activeWork[channel].by).id; return activeWork[channel].jobId; } // report/debate처럼 호출측이 activeWork만 세팅한 경우 job 붙이기
function endJob(channel) { const id = activeWork[channel] && activeWork[channel].jobId; if (id && jobs[id] && jobs[id].status === 'running') jobUpdateById(id, { status: 'done' }); } // 종료 시 아직 running이면 done (정확한 상태는 각 함수가 먼저 박음)
function jobBoard(channel) {
  const mine = Object.values(jobs).filter(j => j.channel === channel).sort((a, b) => b.id - a.id).slice(0, 12);
  if (!mine.length) return '아직 기록된 작업이 없어.';
  const icon = { running: '🔵', 'awaiting-approval': '🟡', done: '✅', failed: '❌', interrupted: '⚠️', limited: '⏳', cancelled: '⏹️', planning: '📝' };
  const fmt = j => { const m = Math.round((j.updatedAt - j.createdAt) / 60000); const led = j.ledger && j.ledger.progress && j.ledger.progress.length ? '\n   📝 ' + j.ledger.progress[j.ledger.progress.length - 1] : ''; return `${icon[j.status] || '•'} #${j.id} [${j.status}] ${j.type} · ${j.title}${j.repo ? ' (' + j.repo.split('/').pop() + ')' : ''}${m ? ' ·' + m + '분' : ''}${led}${j.artifacts && j.artifacts.length ? '\n   ↳ ' + j.artifacts.join(' ') : ''}`; };
  return '📋 작업 현황 (최근 12개)\n' + mine.map(fmt).join('\n');
}

// 채널이 마지막으로 다룬 레포 (재배포에도 살아남게 영구저장 → "어느 레포?" 무한반복 방지)
const LASTREPO_FILE = process.env.LASTREPO_FILE || '/data/lastrepo.json';
function loadLastRepo() { try { if (fs.existsSync(LASTREPO_FILE)) Object.assign(lastRepo, JSON.parse(fs.readFileSync(LASTREPO_FILE, 'utf8')) || {}); } catch {} }
function persistLastRepo() { try { fs.writeFileSync(LASTREPO_FILE, JSON.stringify(lastRepo)); } catch {} }
// 물어보고 대기 중인 작업 (봇 재시작에도 유지 → 답을 엉뚱하게 처리하지 않게)
const PENDING_FILE = process.env.PENDING_FILE || '/data/pending.json';
function loadPending() { try { if (fs.existsSync(PENDING_FILE)) Object.assign(pendingProject, JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) || {}); } catch {} }
function persistPending() { try { fs.writeFileSync(PENDING_FILE, JSON.stringify(pendingProject)); } catch {} }

// ── 서비스 레지스트리 (회사가 운영하는 서비스 대장) — 운영/데이터/마케팅 루프의 공통 대상 ──
const SERVICES_FILE = process.env.SERVICES_FILE || '/data/services.json';
let services = {}; // repo -> { repo, url, channel, created, lastStatus, lastCheck }
function loadServices() { try { if (fs.existsSync(SERVICES_FILE)) services = JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8')) || {}; } catch { services = {}; } }
function persistServices() { try { fs.writeFileSync(SERVICES_FILE, JSON.stringify(services)); } catch {} }
function registerService(repo, url, channel) {
  if (!repo) return;
  const ex = services[repo] || {};
  services[repo] = { repo, url: url || ex.url || null, channel: channel || ex.channel, created: ex.created || Date.now(), lastStatus: ex.lastStatus, lastCheck: ex.lastCheck };
  persistServices();
}
function svcList(channel) { return Object.values(services).filter(s => !channel || s.channel === channel); }
// 운영 헬스체크 — 각 라이브 서비스 curl로 상태 확인 → 우정잉(QA/SRE)이 보고, 다운이면 윈터가 알림
async function checkServices(client, channel, announce = true, onlyAlert = false) {
  const sre = byName('윈터') || LEAD; // 운영·헬스체크 = 인프라
  const list = svcList(channel).filter(s => s.url);
  if (!list.length) { if (announce && !onlyAlert) await postAs(client, channel, undefined, sre, '아직 등록된 라이브 서비스가 없어. 뭐 하나 만들어서 배포되면 여기 대장에 올라가.'); return; }
  const lines = [];
  for (const s of list) {
    const r = await sh(`curl -s -o /dev/null -w "%{http_code} %{time_total}s" --max-time 15 '${String(s.url).replace(/'/g, '')}' 2>/dev/null || echo "000"`);
    const out = (r.out || '').trim(); const up = /^2\d\d|^3\d\d/.test(out);
    const wasUp = s.lastStatus !== 'down';
    s.lastStatus = up ? 'up' : 'down'; s.lastCheck = Date.now(); s.wasUp = wasUp;
    lines.push(`${up ? '🟢' : '🔴'} ${s.repo} · ${s.url} (${out || 'no response'})`);
  }
  persistServices();
  const down = list.filter(s => s.lastStatus === 'down');
  // onlyAlert(시간별 감시)면 새로 죽은 게 있을 때만 알림, 평소엔 조용
  if (onlyAlert) {
    const newlyDown = down.filter(s => s.wasUp);
    if (newlyDown.length) await postAs(client, channel, undefined, byName('윈터') || LEAD, `🔴 방금 다운 감지: ${newlyDown.map(s => s.repo).join(', ')}. 라이브가 죽었어, 확인할게.`);
    return;
  }
  await postAs(client, channel, undefined, sre, '서비스 헬스체크 결과\n' + lines.join('\n'));
  if (down.length) await postAs(client, channel, undefined, byName('윈터') || LEAD, `⚠️ ${down.length}개 다운됐어. 확인 필요: ${down.map(s => s.repo).join(', ')}. 라이브가 진짜 죽은 건지 내가 로그 봐야겠어.`);
}

// 제작 끝나고 핸드오프 — 에이전트가 끝낸 것(✅)과 사람만 할 수 있는 것(☐ 체크리스트)을 구분해서 보고
async function handoffChecklist(client, channel, thread_ts, repo, task) {
  const t = task || '';
  const url = (services[repo] && services[repo].url) || null;
  const done = [
    '코드 제작 (PRD대로, 상용 수준 목표)',
    '빌드 실제로 돌려서 통과 확인',
    url ? `라이브 배포 (${url})` : '라이브 배포 시도 (주소는 위 메시지 참고)',
    'SEO·공유 메타·sitemap·robots 넣음',
    '개인정보처리방침·이용약관 초안 작성',
    '서비스 대장 등록 + 매일 자동 헬스체크 켜둠',
  ];
  const todo = [];
  todo.push('커스텀 도메인 (지금은 임시 주소야. 도메인 사두면 "도메인 연결해줘" 하면 내가 붙여줄게)');
  if (!process.env.ANALYTICS_SNIPPET) todo.push('접속 통계(애널리틱스) 키 (방문자·유입 보려면 필요. 키 주면 코드에 심을게)');
  if (!process.env.CONTACT_ENDPOINT) todo.push('문의폼 받는 곳 (이메일이나 폼서비스 연결 안 하면 문의가 어디로도 안 가)');
  if (/결제|유료|구독|판매|쇼핑|커머스|payment|subscribe|pricing/i.test(t)) todo.push('결제·수익화 계정 (유료 기능 있으면 결제 연동에 너 계정 필요)');
  if (/android|ios|안드로이드|아이폰|아이패드|모바일|네이티브|react ?native|flutter|expo|apk|app ?store|play ?store|앱스토어|플레이스토어|스토어 ?(제출|출시|등록)/i.test(t) && !/웹\s?앱|web ?app|pwa/i.test(t)) todo.push('앱스토어·플레이스토어 제출 (개발자 계정 + 심사, 이건 너만 가능)'); // 바 "앱"만으론 안 붙임 — 이 봇은 웹(Railway) 배포라 "웹앱/투두 앱"엔 스토어 제출 불필요(틀린 안내 방지). 네이티브·모바일·스토어 신호일 때만
  todo.push('법무페이지에 실제 연락처·사업자 정보 채우기 (지금 TODO로 비워뒀어)');
  todo.push('마케팅 채널 계정 (X·블로그·메일로 실제 발행하려면 그 계정/키)');
  const fmt = (arr, mark) => arr.map(x => `${mark} ${x}`).join('\n');
  await postAs(client, channel, thread_ts, LEAD, `자 정리할게. 우리가 할 수 있는 건 다 했고, 너만 할 수 있는 것만 추렸어.\n\n[우리가 끝낸 거]\n${fmt(done, '✅')}\n\n[너가 해줘야 진짜 상용 오픈 가능 — 체크리스트]\n${fmt(todo, '☐')}\n\n이 중에 내가 대신 할 수 있는 건(도메인 연결, 마케팅 자료, 통계 코드 심기 등) 말만 해주면 또 해줄게. 계정·결제·스토어 제출처럼 너만 되는 건 끝나면 알려줘, 그담 단계 이어갈게.`);
}

// 자가수정 — 봇이 내부 에러를 내면 자기 코드(doping-lab-slack)에서 원인 찾아 고치고 PR. (안전: PR만, 자기 재배포 안 함, 쿨다운/중복 방지)
let selfHealing = false, selfHealAt = 0, lastHealSig = '';
const SELF_HEAL_REPO = 'nameofkk/doping-lab-slack';
async function selfHeal(client, channel, thread_ts, errText) {
  if (process.env.SELF_HEAL === 'off' || !GITHUB_TOKEN) return;
  if (selfHealing) return;
  if (activeWork[channel]) return; // 다른 작업 도는 중엔 끼어들지 않음 (동시 실행으로 슬롯 경쟁/타임아웃 방지). 에러가 또 나면 그때 고침
  const now = Date.now(); const sig = String(errText || '').slice(0, 80);
  if (now - selfHealAt < 30 * 60 * 1000 && sig === lastHealSig) return; // 같은 에러 30분 내 반복 자가수정 금지
  if (now - selfHealAt < 5 * 60 * 1000) return;                          // 어떤 에러든 최소 5분 간격
  selfHealing = true; selfHealAt = now; lastHealSig = sig;
  activeWork[channel] = { task: '봇 자가수정', started: Date.now(), beat: Date.now(), repo: SELF_HEAL_REPO, selfHeal: true }; // 자가수정 도는 동안 채널 점유 → 사용자 메시지가 동시 작업 시작하는 충돌 방지(beat로 워치독도 적용)
  const sec = byName('우정잉') || LEAD;
  try {
    await postAs(client, channel, thread_ts, sec, '방금 내부 에러 났네. 내 봇 코드에서 원인 찾아서 고쳐볼게. 고치면 PR로 올릴 테니까 확인하고 머지해줘 (라이브 반영은 재배포 필요).');
    await runWork(client, channel, thread_ts, SELF_HEAL_REPO, `이 슬랙 봇(너 자신)이 방금 다음 에러를 냈다. index.js에서 원인을 찾아 실제로 고쳐라. 추측하지 말고 코드를 직접 읽어서 정확한 원인을 짚고 최소한으로 안전하게 수정해라. node --check 통과하는지 확인하고, 뭘 왜 고쳤는지 보고해라.\n\n[에러]\n${sig ? String(errText).slice(0, 900) : '(내용 미상)'}`, false, true);
  } catch (e) { try { await postAs(client, channel, thread_ts, sec, '자가수정 시도 중에 또 막혔어: ' + String(e).slice(0, 150)); } catch (_) {} }
  finally { selfHealing = false; activeWork[channel] = null; }
}
// 작업 생존신호(heartbeat) — 진행 중이면 beat 갱신. "오래 걸린다"고 살아있는 작업을 죽은 걸로 오인하지 않게 (워치독/스테일해제가 시작시각 아닌 beat 기준으로 판단)
function bumpWork(channel) { if (activeWork[channel]) activeWork[channel].beat = Date.now(); }
// 진행 상황 라이브 표시 — 한 메시지를 계속 갱신하며 경과시간·단계를 보여줌 (긴 작업도 살아있다는 신호)
function startProgress(channel, thread_ts, label = '진행', persona = LEAD) {
  const wc = clientFor(persona) || botClient;
  const frames = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
  let ts = null, phase = label, started = Date.now(), tick = 0, stopped = false;
  const render = (tail) => { const s = Math.floor((Date.now() - started) / 1000); const m = Math.floor(s / 60); return `${stopped ? '☑️' : frames[tick % 12]} ${phase} ${tail || `(벌써 ${m ? m + '분 ' : ''}${s % 60}초째 하고 있어, 좀만 기다려)`}`; };
  (async () => { try { const r = await wc.chat.postMessage({ channel, thread_ts, text: render() }); ts = r.ts; } catch (e) {} })();
  const timer = setInterval(async () => { tick++; bumpWork(channel); if (stopped || !ts) return; try { await wc.chat.update({ channel, ts, text: render() }); } catch (e) {} }, 12000); // 스피너 도는 동안 = 작업 살아있음 → beat 갱신
  return {
    phase: (p) => { phase = p; },
    done: async () => { if (stopped) return; stopped = true; clearInterval(timer); if (ts) { try { await wc.chat.update({ channel, ts, text: render('이 단계는 끝!') }); } catch (e) {} } }
  };
}
// 이 채널에서 무거운 작업이 도는 중이면 새로 시작 막고 안내 (진행상태 덮어쓰기/리소스 충돌 방지)
async function guardBusy(client, channel, thread_ts) {
  if (!activeWork[channel]) return false;
  await postAs(client, channel, thread_ts, LEAD, `지금 "${(activeWork[channel].task || '').slice(0, 40)}" 하는 중이라 그것부터 끝내고 할게. 급하면 "중단"이라고 해줘.`);
  return true;
}
// 작업 실행(activeWork 세팅 + runWork + 정리) 공통
function launchWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName) {
  feedback[channel] = []; delete pausedWork[channel]; // 새 작업 시작 → 묵은 피드백·옛 중단작업 정리(스테일 "이어서" 방지)
  const job = createJob(channel, newProject ? 'build' : 'work', task, repo, lastRequester[channel]); // R1: 작업 보드에 기록
  activeWork[channel] = { task, started: Date.now(), beat: Date.now(), by: lastRequester[channel], repo, newProject, forcePR, projName, jobId: job.id }; // 재개(이어서)용 컨텍스트 포함
  runWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName)
    .catch(e => { jobUpdateById(job.id, { status: 'failed', error: String(e).slice(0, 200) }); postAs(client, channel, thread_ts, LEAD, '작업 오류: ' + String(e).slice(0, 300)); })
    .finally(() => { if (jobs[job.id] && jobs[job.id].status === 'running') jobUpdateById(job.id, { status: 'done' }); activeWork[channel] = null; }); // runWork가 정확한 종료상태 안 박았으면 done 처리
}
// 작업(신규 제작이든 기존 수정이든) 시작 전, 정말 방향이 갈리는 중요한 결정이 있으면 사용자에게 먼저 물어봄 (없으면 그냥 진행)
async function planQuestions(task, newProject) {
  try {
    const r = await runClaude(`${newProject ? '새 프로젝트' : '기존 프로젝트 수정/작업'} 요청: ${JSON.stringify(task)}\n\n이걸 ${newProject ? '만들기' : '작업하기'} 전에 사용자한테 꼭 확인해야 할 중요한 결정이 있으면 1~3개만 질문으로 뽑아. 정말 방향이 크게 갈려서 잘못 정하면 다시 해야 하는 것만(예: 핵심 컨셉/타겟, 꼭 필요한 기능 범위, 톤·스타일, 플랫폼, 어떤 방식으로 구현할지 갈리는 선택). 요청에 이미 답이 있거나 사소하면 절대 묻지 마(빈 배열).\n\n[중요·반드시 지켜] 오직 위 요청 텍스트만 보고 판단해라. 파일시스템·현재 디렉토리·주변 코드를 들여다보지 마라(거기 뭐가 있든 무관). 그리고 다음은 절대 묻지 마라: 어떤 프로젝트/레포인지, 파일·폴더 경로, 현재 코드가 뭔지, 어디에 있는지 — 그건 시스템이 이미 정했고 너가 물을 게 아니다. 질문은 반드시 한국어로 자연스럽게(영어 금지). JSON만 출력: {"questions":["한국어 질문","..."]}`, 'haiku');
    const m = (r.text || '').match(/\{[\s\S]*\}/);
    const o = m ? JSON.parse(m[0]) : {};
    return Array.isArray(o.questions) ? o.questions.filter(q => typeof q === 'string' && q.trim()).slice(0, 3) : [];
  } catch { return []; }
}
// R4: 입력 가드레일 — 무거운 작업 파이프라인 돌리기 전 haiku로 싸게 사전심사. 파괴적·악의적·범위밖이면 차단. 실패하면 막지 않음(가용성 우선). OpenAI guardrails 패턴.
async function guardrailCheck(task) {
  try {
    const r = await runClaude(`코드 에이전트가 다음 작업을 실행하기 전 빠른 안전·범위 심사. JSON만.\n요청: ${JSON.stringify(String(task).slice(0, 600))}\n\n{"verdict":"proceed|refuse","reason":"refuse면 왜인지 한 문장"}\n기준: refuse = 명백히 파괴적(레포/데이터/DB 삭제·드롭, 시크릿·자격증명 탈취·유출, 대량파괴)·악의적·코드/조사/배포와 전혀 무관(봇 범위 밖). 그 외 코드 만들기·고치기·기능추가·조사·배포·마케팅은 전부 proceed. 애매하면 proceed(막는 건 명백할 때만).`, 'haiku');
    const m = (r.text || '').match(/\{[\s\S]*\}/);
    const o = m ? JSON.parse(m[0]) : { verdict: 'proceed' };
    return o.verdict === 'refuse' ? o : { verdict: 'proceed' };
  } catch { return { verdict: 'proceed' }; }
}
async function startWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName) {
  // 이미 질문 던져놓고 답 기다리는 중이면 똑같은 질문 또 안 함 (같은 요청 재전송 시 무한 질문 방지)
  if (pendingProject[channel]) { await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}아까 물어본 거에 답해주면 바로 들어갈게. 알아서 정해도 되면 "알아서 해"라고 해도 돼.`); return; }
  // R4: 무거운 작업 전 안전·범위 가드 (파괴적·악의적·범위밖 차단)
  const guard = await guardrailCheck(task);
  if (guard.verdict === 'refuse') { await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}이건 못 해줘 — ${guard.reason || '안전·범위 밖 요청'}. 코드 제작·수정·조사·배포 쪽으로 다시 말해줘.`); return; }
  // 기존 레포 작업·이어가기·완성은 질문 없이 바로 진행 (정체성/경로 같은 쓸데없는 재질문 마찰 제거). 질문은 방향이 크게 갈리는 '신규 제작'에서만.
  const qs = newProject ? await planQuestions(task, newProject) : [];
  if (qs.length) {
    pendingProject[channel] = { repo, task, newProject, forcePR, projName, at: Date.now() }; persistPending();
    await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오 좋다. ${newProject ? '만들기' : '작업'} 전에 이것만 먼저 정해주라:\n${qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n답 주면 그대로 들어갈게. 알아서 정해도 되면 "알아서 해"라고 해도 돼.`);
    return;
  }
  launchWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName);
}
async function handle(event, client) {
  if (!event || !event.ts) return;
  if (event.subtype || event.bot_id) return;          // 사람 메시지만 (봇/시스템/수정 무시 → 무한루프 방지)
  if (seen.has(event.ts)) return;                      // message·app_mention 중복 방지
  seen.add(event.ts); if (seen.size > 800) { const a = [...seen]; a.slice(0, a.length - 400).forEach(x => seen.delete(x)); } // 최근 400개만 유지(전체 비우면 직전 메시지 재처리 위험)
  if (ALLOWED.length && !ALLOWED.includes(event.user)) return;
  const channel = event.channel;
  const raw = (event.text || '').replace(/<@[^>]+>/g, '').trim();
  if (!raw) return;
  recordMsg(channel, '사용자', raw);
  if (event.user) lastRequester[channel] = event.user; // 완료 시 이 사람을 @멘션
  const thread_ts = event.thread_ts;
  // 새 프로젝트 시작 전 물어본 질문에 대한 답 → 그 답대로 기획 시작
  if (pendingProject[channel] && pendingProject[channel].at && Date.now() - pendingProject[channel].at > 30 * 60 * 1000) { delete pendingProject[channel]; persistPending(); } // 30분 지난 미답변 질문은 만료 — 한참 뒤 무관한 메시지를 '답'으로 오인하는 거 방지
  if (pendingProject[channel]) {
    if (isStopMsg(raw) || /^(안\s?해|관둬|됐어|아니[ ,]?다)$/.test(raw.trim())) { delete pendingProject[channel]; persistPending(); await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이, 그건 접을게.`); return; }
    if (!activeWork[channel]) {
      const pp = pendingProject[channel]; delete pendingProject[channel]; persistPending();
      await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이 그렇게 갈게, 바로 들어간다.`);
      launchWork(client, channel, thread_ts, pp.repo, `${pp.task}\n\n[사용자가 정해준 방향]\n${raw}`, pp.newProject, pp.forcePR, pp.projName);
      return;
    }
  }
  ensureMembers(channel).catch(() => {});
  try {
    // 중단/취소 — 명확한 중단 명령일 때만 (문장 속 '중단/스톱' 부분일치로 오작동하던 거 수정)
    if (isStopMsg(raw)) {
      if (activeWork[channel] && activeWork[channel].repo !== undefined) pausedWork[channel] = { ...activeWork[channel] }; // 재개용 컨텍스트 보관
      const had = !!activeWork[channel];
      workCancel[channel] = true; activeWork[channel] = null; feedback[channel] = []; // 즉시 채널 해제 (스테일 activeWork로 막히는 거 방지)
      await postAs(client, channel, thread_ts, LEAD, (had ? '오케이 멈출게. 진행 중이던 거 main엔 안 올리고 중단할게.' : '오케이, 지금 도는 작업은 없어. 깨끗하게 풀어놨어.') + (pausedWork[channel] ? ' ("이어서"라고 하면 그 작업 다시 이어갈게)' : ''));
      return;
    }
    // 스테일 activeWork 자동 해제 — 생존신호(beat)가 12분 넘게 끊겼으면 진짜 죽은 걸로 보고 풀어줌 (정상적으로 오래 걸리는 작업은 beat가 계속 갱신돼서 안 끊김 → 벽돌화/피드백 무한루프만 방지)
    if (activeWork[channel] && Date.now() - (activeWork[channel].beat || activeWork[channel].started || 0) > 12 * 60 * 1000) {
      if (activeWork[channel].repo !== undefined) pausedWork[channel] = { ...activeWork[channel] }; // 재개("이어서"/"다시 해") 가능하게 보관
      activeWork[channel] = null; feedback[channel] = [];
    }
    // 재개 — 중단했던 작업을 새로 만들지 말고 그대로 이어감
    if (!activeWork[channel] && pausedWork[channel] && (/^(이어서|이어가|이어|계속(해|하자|진행)?|마저|아까\s*거|이전\s*거)/.test(raw) || /^다시(\s*(해|해줘|진행|시작|시켜|돌려|돌려줘))?\s*$/.test(raw) || /(이전에|전에|아까)\s*하던\s*거|하던\s*거\s*(그대로|다시|이어)/.test(raw))) {
      const pw = pausedWork[channel]; delete pausedWork[channel];
      await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이, 아까 "${(pw.task || '').slice(0, 40)}" 그거 다시 이어갈게.`);
      launchWork(client, channel, thread_ts, pw.repo, pw.task, pw.newProject, pw.forcePR, pw.projName);
      return;
    }
    // "이어서"인데 보관된 중단작업은 없지만 직전 레포가 있으면 → 그 레포 미완성분(특히 사용자 화면) 마저 완성 ("다 끝냈어" 후에도 이어가게)
    if (!activeWork[channel] && !pausedWork[channel] && lastRepo[channel] && lastRepo[channel] !== SELF_HEAL_REPO && canCommand(event.user) && (/^(이어서|이어가|계속(해|하자|진행)?|마저|마저\s*해|이어서\s*(해|만들|완성|채워)|미완성.*완성|마무리(해|지어)?)\s*/.test(raw) || /^다시(\s*(해|해줘|진행|시작))?\s*$/.test(raw))) {
      const tgt = lastRepo[channel];
      await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이, 직전에 만들던 ${tgt.split('/').pop()}에서 아직 미완성인 부분(특히 사용자 화면) 마저 완성할게.`);
      launchWork(client, channel, thread_ts, tgt, '이전에 만들던 이 프로젝트에서 아직 미완성인 부분, 특히 사용자한테 보이는 화면(라우트 page)과 핵심 사용자 플로우를 실제로 동작하게 끝까지 완성해라. 데모·플레이스홀더·로렘입숨 금지, 실제 화면과 로직으로. npm run build 통과 유지.', false, !!settings.approval[channel]);
      return;
    }
    // 토론 결론 액션아이템 실행 승인 — "실행"/"실행 1,3"으로 착수, "넘어가"로 폐기 (승인 게이트: 자동 실행 안 함)
    if (pendingDispatch[channel]) {
      if (pendingDispatch[channel].at && Date.now() - pendingDispatch[channel].at > 30 * 60 * 1000) { delete pendingDispatch[channel]; } // 30분 만료
      else if (/^(넘어가|패스|무시|안\s?해|됐어|취소|놔둬|나중에)/.test(raw)) { delete pendingDispatch[channel]; await postAs(client, channel, thread_ts, LEAD, '오케이, 그건 안 돌릴게. 나중에 "스포노노 ~ 조사해줘"나 "작업: ..."로 직접 시켜도 돼.'); return; }
      else if (/^(실행|진행해?|착수|돌려(줘)?|고고|ㄱㄱ|다\s*해|전부\s*(해|돌려))(\s*[\d,\s및과~-]+)?\s*$/.test(raw) && canCommand(event.user)) {
        if (await guardBusy(client, channel, thread_ts)) return; // 작업 중이면 안내만, pendingDispatch 유지
        const pd = pendingDispatch[channel]; delete pendingDispatch[channel];
        let items = pd.items;
        const nums = (raw.match(/\d+/g) || []).map(Number);
        if (nums.length) items = items.filter((_, i) => nums.includes(i + 1));
        const doable = items.filter(x => x.kind !== 'human');
        await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이, ${doable.length}개 착수할게 (조사 ${doable.filter(x => x.kind === 'investigate').length}·코드수정 ${doable.filter(x => x.kind === 'build').length}). 좀 걸려.`);
        dispatchActionItems(client, channel, thread_ts, pd.repo, items).catch(e => postAs(client, channel, thread_ts, LEAD, '실행 오류: ' + String(e).slice(0, 200)));
        return;
      }
    }
    // 작업 진행 중 "수정/지시"만 진행 중 작업에 반영(피드백). 명확한 수정 신호일 때만 — 원문 재전송·새 시작명령(제작/만들/시작/진행)은 제외, 중복 방지
    if (activeWork[channel] && /(바꿔|바꾸|수정|추가해|빼고|빼줘|말고|대신|틀렸|틀려|반영|변경|고쳐|로 ?해|로 ?가|넣어|이렇게|저렇게|먼저|우선|강조|제외|보강)/.test(raw) && !/^(제작|만들|시작|진행)/.test(raw)) {
      const fb = (feedback[channel] = feedback[channel] || []);
      if (fb[fb.length - 1] !== raw) fb.push(raw);
      await postAs(client, channel, thread_ts, LEAD, `${mention(channel)}오케이, 그거 지금 작업에 반영할게.`);
      return;
    }
    // 규칙 관리
    if (/규칙\s*(목록|보여)/.test(raw)) {
      const r = rules[channel] || [];
      await postAs(client, channel, thread_ts, LEAD, r.length ? '우리 팀 규칙:\n' + r.map((x, i) => `${i + 1}. ${x}`).join('\n') : '아직 정한 규칙이 없어.');
      return;
    }
    if (/규칙\s*(초기화|전체삭제|리셋)/.test(raw)) { rules[channel] = []; persistRules(); await postAs(client, channel, thread_ts, LEAD, '규칙 다 지웠어.'); return; }
    // "앞으로 ~ 해라 / 항상 / 규칙 / 기억해" → 영구 규칙으로 저장하고 그렇게 일함
    if (/(앞으로|항상|규칙으로|규칙은|기억해|명심)/.test(raw) && !/[?？]|할까|할래|어때|어떻게|언제|어디|왜|뭐|뭘|될까|줄까|있을까|날까|건가|는지/.test(raw) && !/짜줘|짜봐|만들어|만들래|만들자|제작|개발해|그려줘/.test(raw)) { // 질문·작업요청에 '앞으로/항상' 들어간 거 규칙으로 오저장 방지
      addRule(channel, raw);
      const who = pickPersona(raw) || LEAD;
      const res = await runClaude(`${who.prompt}${STYLE}\n\n사용자가 앞으로 팀이 지킬 규칙을 줬어: "${raw}"\n알겠다고 짧게 답하고, 앞으로 그렇게 하겠다고 해라.`, who.model);
      await postAs(client, channel, thread_ts, who, (res.text || '알겠어, 앞으로 그렇게 할게.').trim().slice(0, 800));
      return;
    }
    // 권한
    if (/^권한\s*(나만|본인|me)/.test(raw)) { settings.commanders = [event.user]; persistSettings(); await postAs(client, channel, thread_ts, LEAD, '이제 작업·조사·토론은 너만 시킬 수 있어. ("권한 모두"로 풀 수 있어)'); return; }
    if (/^권한\s*(모두|전체|풀|open)/.test(raw)) { settings.commanders = []; persistSettings(); await postAs(client, channel, thread_ts, LEAD, '권한 풀었어. 이제 아무나 시킬 수 있어.'); return; }
    // 승인모드
    if (/승인\s*모드\s*(켜|on|온)/i.test(raw)) { settings.approval[channel] = true; persistSettings(); await postAs(client, channel, thread_ts, LEAD, '승인모드 켰어. 앞으로 코드작업은 main에 바로 안 넣고 PR로 올릴게 (네가 머지하면 반영).'); return; }
    if (/승인\s*모드\s*(꺼|off|오프)/i.test(raw)) { delete settings.approval[channel]; persistSettings(); await postAs(client, channel, thread_ts, LEAD, '승인모드 껐어. main에 바로 반영할게.'); return; }
    // 태스크보드
    let tm;
    if ((tm = raw.match(/^태스크\s*추가\s*[:：]?\s*([\s\S]+)/))) { const t = addTask(channel, tm[1].trim(), event.user); await postAs(client, channel, thread_ts, LEAD, `📌 태스크 추가 (#${t.id}): ${t.text}`); return; }
    if (/^태스크\s*(목록|보드|리스트)/.test(raw)) { const l = tasks[channel] || []; await postAs(client, channel, thread_ts, LEAD, l.length ? '📋 할 일 보드:\n' + l.map(t => `#${t.id} [${t.done ? '완료' : '진행'}] ${t.text}`).join('\n') : '등록된 태스크가 없어.'); return; }
    // R1: 봇 작업 현황 보드 (자동 추적 — 지금 뭐 돌고 있는지, 뭐 끝났는지, 재시작에 끊긴 건 뭔지)
    if ((/^(작업\s*현황|진행\s*상황|작업\s*보드|작업\s*목록|작업\s*리스트|jobs?|지금\s*뭐\s*(하|돌)|뭐\s*(하는\s*중|돌아가))/i.test(raw) || /^(작업|진행)\s*(어때|있어|중이야)/.test(raw)) && !/(만들|짜줘|짜봐|추가|구현|개발|보고서|작성)/.test(raw)) { await postAs(client, channel, thread_ts, LEAD, jobBoard(channel)); return; }
    if ((tm = raw.match(/^태스크\s*완료\s*(\d+)/))) { const t = (tasks[channel] || []).find(x => x.id === parseInt(tm[1])); if (t) { t.done = true; persistTasks(); await postAs(client, channel, thread_ts, LEAD, `#${tm[1]} 완료 처리했어.`); } else await postAs(client, channel, thread_ts, LEAD, '그 태스크 못 찾겠어.'); return; }
    if ((tm = raw.match(/^태스크\s*삭제\s*(\d+)/))) { tasks[channel] = (tasks[channel] || []).filter(x => x.id !== parseInt(tm[1])); persistTasks(); await postAs(client, channel, thread_ts, LEAD, `#${tm[1]} 삭제했어.`); return; }
    // 배포 — 특정/직전 레포를 Railway에 다시 올림 (단, 고치고/만들고 같은 작업 의도가 있으면 여기서 안 잡고 작업으로 보냄)
    if ((/배포\s*(해|하자|해줘|좀|시작|go|다시|재)/i.test(raw) || /재배포|다시\s*배포/.test(raw)) && !/고치|고쳐|수정|버그|만들|추가|개선|구현|바꿔|바꾸|업데이트|기능|넣어|반영/.test(raw)) {
      const win = byName('윈터') || LEAD;
      if (!process.env.RAILWAY_API_TOKEN) { await postAs(client, channel, thread_ts, win, '라이브 배포는 RAILWAY_API_TOKEN 있어야 돼. 넣으면 바로 해줄게.'); return; }
      const target = extractRepo(raw) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, win, '어느 레포 배포할지 알려줘. (만든 적 있는 거면 "서비스 목록"으로 이름 확인돼)'); return; }
      if (/\/(sponono|wewantpeace|myungjak)$/.test(target)) { await postAs(client, channel, thread_ts, win, `${target.split('/').pop()}은 자기 배포 파이프라인(모노레포·전용 서비스)이 따로 있어서 내가 railway up으로 통째로 올리면 깨져. 그건 DEPLOY.md 방식대로 따로 배포해야 해. 새로 만든 단일 프로젝트만 자동배포 가능해.`); return; }
      if (await guardBusy(client, channel, thread_ts)) return;
      activeWork[channel] = { task: '재배포 ' + target, started: Date.now() };
      (async () => {
        const id = ++workSeq; const dir = `/tmp/dp${id}`;
        await postAs(client, channel, thread_ts, win, `${target} 다시 띄울게. 클론하고 레일웨이에 올린다.`);
        const prog = startProgress(channel, thread_ts, `${target.split('/').pop()} 다시 배포하는 중`, win);
        try {
          const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${target}.git ${dir} && chmod -R 777 ${dir}`);
          if (cl.code !== 0) { await postAs(client, channel, thread_ts, win, `${mention(channel)}클론 실패ㅠ\n` + (cl.err || '').slice(0, 200)); return; }
          const u = await railwayDeploy(client, channel, thread_ts, dir, target);
          if (u) await postAs(client, channel, thread_ts, win, `${mention(channel)}다시 띄웠어! ${u}`);
        } finally { await prog.done(); }
      })().catch(e => postAs(client, channel, thread_ts, win, '배포 오류: ' + String(e).slice(0, 200))).finally(() => { activeWork[channel] = null; });
      return;
    }
    const wm = raw.match(/^(작업|구현|개발|제작)\s*[:：]\s*([\s\S]*)$/);
    if (wm && wm[2].trim()) {
      let rest = wm[2].trim(); let repo = WORK_DEFAULT_REPO;
      const rr = rest.match(/^([\w.-]+\/[\w.-]+)\s+([\s\S]+)$/);
      if (rr) { repo = rr[1]; rest = rr[2]; }
      const newProject = !rr && /(포트폴리오|portfolio|홈페이지|랜딩|사이트|새\s*프로젝트|처음부터|new\s*project)/i.test(rest);
      if (await guardBusy(client, channel, thread_ts)) return;
      startWork(client, channel, event.thread_ts || event.ts, repo, rest, newProject, !!settings.approval[channel]);
      return;
    }
    const m = raw.match(/^(기획|토론|회의)\s*[:：]\s*([\s\S]*)$/);
    if (m && m[2].trim()) {
      if (await guardBusy(client, channel, thread_ts)) return;
      activeWork[channel] = { task: m[2].trim(), started: Date.now() };
      runDebate(client, channel, event.thread_ts || event.ts, m[2].trim(), null).catch(e => jobUpdate(channel, { status: 'failed', error: String(e).slice(0, 150) })).finally(() => { endJob(channel); activeWork[channel] = null; });
      return;
    }
    // 운영: 서비스 대장 + 헬스체크
    if (/(서비스|서버|운영).*(목록|현황|리스트|대장|상태)/.test(raw)) {
      const list = svcList(channel);
      if (!list.length) { await postAs(client, channel, thread_ts, LEAD, '아직 우리가 운영하는 서비스가 없어. 하나 만들어서 배포되면 여기 올라가.'); return; }
      const fmt = list.map(s => `· ${s.repo}${s.url ? ' → ' + s.url : ' (라이브 미배포)'}${s.lastStatus ? ' [' + (s.lastStatus === 'up' ? '🟢' : '🔴') + ']' : ''}`).join('\n');
      await postAs(client, channel, thread_ts, LEAD, `우리가 운영 중인 서비스 (${list.length}개)\n${fmt}`);
      return;
    }
    // 스크린샷 받기 — 라이브 서비스 화면을 찍어서 슬랙에 올림 (요청할 때)
    if ((/(스크린샷|캡쳐|캡처|스샷).*(줘|보여|찍어|올려|첨부)/.test(raw) || /화면\s*(줘|보여|찍어|캡)/.test(raw)) && !/검증/.test(raw)) {
      const ux = byName('정소민') || LEAD;
      const target = extractRepo(raw) || lastRepo[channel];
      const url = target && services[target] && services[target].url;
      if (!url) { await postAs(client, channel, thread_ts, ux, '그 서비스 라이브 주소가 없어서 화면을 못 찍어. 먼저 배포돼 있어야 돼 ("서비스 목록"으로 확인). 아니면 레포 이름 알려줘.'); return; }
      if (await guardBusy(client, channel, thread_ts)) return;
      await postAs(client, channel, thread_ts, ux, `${target.split('/').pop()} 화면 찍어서 올릴게. 잠깐만.`);
      activeWork[channel] = { task: '스크린샷 ' + target, started: Date.now(), by: lastRequester[channel] };
      (async () => {
        const shots = await captureShots(url, 'cap' + (++workSeq));
        let any = false;
        for (const s of shots) any = (await uploadShot(channel, thread_ts, s.path, s.label)) || any;
        if (any) await postAs(client, channel, thread_ts, ux, `${mention(channel)}화면 올렸어 ↑`);
        else await postAs(client, channel, thread_ts, ux, `${mention(channel)}스크린샷 업로드가 막혔어(봇 앱에 files:write 권한 필요). 화면은 여기서 봐: ${url}`);
      })().catch(e => postAs(client, channel, thread_ts, ux, '스크린샷 오류: ' + String(e).slice(0, 200))).finally(() => { activeWork[channel] = null; });
      return;
    }
    // 코드 받기 — 레포 코드를 압축해서 슬랙에 올림 (프라이빗 우회, 요청할 때만 / 매번 자동 아님)
    if ((/(코드|소스|파일).*(줘|받|다운|보여|zip|압축)/.test(raw) || /^(코드|zip)\s*(줘|받)/.test(raw)) && !/리뷰|점검|보안|취약|마케팅/.test(raw)) {
      const win = byName('윈터') || LEAD;
      const target = extractRepo(raw) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, win, '어느 레포 코드 줄지 알려줘. ("서비스 목록"으로 이름 확인돼)'); return; }
      if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, win, 'GITHUB_TOKEN이 없어서 못 가져와.'); return; }
      if (await guardBusy(client, channel, thread_ts)) return;
      await postAs(client, channel, thread_ts, win, `${target} 코드 압축해서 올릴게. 잠깐만.`);
      activeWork[channel] = { task: '코드 zip ' + target, started: Date.now(), by: lastRequester[channel] };
      (async () => {
        const id = ++workSeq; const dir = `/tmp/cz${id}`;
        const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${target}.git ${dir} && chmod -R 777 ${dir}`);
        if (cl.code !== 0) { await postAs(client, channel, thread_ts, win, `${mention(channel)}클론 실패ㅠ\n` + (cl.err || '').slice(0, 200)); return; }
        const ok = await uploadCodeZip(channel, thread_ts, dir, target);
        if (ok) await postAs(client, channel, thread_ts, win, `${mention(channel)}코드 올렸어 ↑ 받아서 풀면 돼.`);
        else await postAs(client, channel, thread_ts, win, `${mention(channel)}슬랙에 파일 올리는 게 막혔어(봇 앱에 files:write 권한 추가가 필요해). 대신 github.dev로 봐: https://github.dev/${target}`);
      })().catch(e => postAs(client, channel, thread_ts, win, '코드 가져오기 오류: ' + String(e).slice(0, 200))).finally(() => { activeWork[channel] = null; });
      return;
    }
    if (/(헬스\s?체크|운영\s?점검|상태\s?점검|서비스.*점검|모니터링)/.test(raw)) {
      await postAs(client, channel, thread_ts, byName('윈터') || LEAD, '지금 바로 다 돌려서 살아있는지 확인할게.');
      checkServices(client, channel).catch(e => postAs(client, channel, thread_ts, LEAD, '점검 오류: ' + String(e).slice(0, 200)));
      return;
    }
    // 사용량/번레이트 (오늘 Claude 호출·토큰·한도걸림)
    if (/(사용량|번레이트|토큰.*얼마|클로드.*사용|usage)/.test(raw)) {
      await postAs(client, channel, thread_ts, LEAD, `오늘 우리 사용량이야.\n호출 ${usageStat.calls}회 · 출력토큰 약 ${usageStat.outTokens.toLocaleString()} · 한도걸림 ${usageStat.limitedHits}번.${usageStat.limitedHits ? ' 한도 자주 걸리면 팀원 모델 sonnet 유지하거나 작업 텀을 두자.' : ''}`);
      return;
    }
    // 의존성 업데이트 → 안전하게 올리고 빌드 확인 후 PR
    if (/(의존성|디펜던시|패키지|dependency).*(업데이트|갱신|올려|올리|update)/.test(raw)) {
      const eng = byName('윈터') || LEAD; // 의존성 업데이트 = 유지보수/엔지니어링
      const target = extractRepo(raw) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, eng, '어느 레포 의존성 올릴지 알려줘.'); return; }
      if (await guardBusy(client, channel, thread_ts)) return;
      activeWork[channel] = { task: '의존성 업데이트 ' + target, started: Date.now() };
      runWork(client, channel, event.thread_ts || event.ts, target, '의존성을 안전하게 최신으로 업데이트해라. 메이저 버전 업은 호환성 깨질 수 있으니 신중히(마이너·패치 위주). package.json 갱신하고 npm install + npm run build로 안 깨지는지 꼭 확인한 다음, 뭘 올렸는지 보고해라.', false, true).catch(e => postAs(client, channel, thread_ts, eng, '업데이트 오류: ' + String(e).slice(0, 200))).finally(() => { activeWork[channel] = null; });
      return;
    }
    // 의존성 점검 — 취약점(npm audit) + 오래된 패키지(npm outdated) 리포트
    if (/(의존성|디펜던시|dependency|패키지|취약점).*(점검|확인|스캔|체크|봐|상태)/.test(raw)) {
      const sec = byName('우정잉') || LEAD;
      const target = extractRepo(raw) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, sec, '어느 레포 의존성 볼지 알려줘. ("서비스 목록"으로 이름 확인돼)'); return; }
      if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, sec, 'GITHUB_TOKEN이 없어서 못 까봐.'); return; }
      if (await guardBusy(client, channel, thread_ts)) return;
      activeWork[channel] = { task: '의존성 점검 ' + target, started: Date.now() };
      await postAs(client, channel, thread_ts, sec, `${target} 의존성 까볼게. 취약점이랑 오래된 패키지 본다.`);
      (async () => {
        const id = ++workSeq; const dir = `/tmp/dep${id}`;
        const prog = startProgress(channel, thread_ts, `${target.split('/').pop()} 의존성 까보는 중`, sec);
        try {
          const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${target}.git ${dir} && chmod -R 777 ${dir}`);
          if (cl.code !== 0) { await postAs(client, channel, thread_ts, sec, `${mention(channel)}클론 실패ㅠ\n` + (cl.err || '').slice(0, 200)); return; }
          const hasPkg = await sh('test -f package.json && echo yes || echo no', dir);
          if (!hasPkg.out.includes('yes')) { await postAs(client, channel, thread_ts, sec, `${mention(channel)}package.json이 없어서 npm 의존성 점검은 해당 없어.`); return; }
          await sh('npm install --no-audit --no-fund 2>&1 | tail -2', dir);
          const au = await sh('npm audit 2>&1 | tail -15', dir);
          const od = await sh('npm outdated 2>&1 | head -20', dir);
          const clean = /0 vulnerabilities/.test(au.out);
          await postAs(client, channel, thread_ts, sec, `${mention(channel)}${target} 의존성 점검 결과\n\n[취약점]\n${clean ? '깨끗해, 0개야.' : (au.out || '').slice(-700)}\n\n[오래된 패키지]\n${((od.out || '').trim()) || '다 최신이야.'}`.slice(0, 2800));
        } finally { await prog.done(); }
      })().catch(e => postAs(client, channel, thread_ts, sec, '의존성 점검 오류: ' + String(e).slice(0, 200))).finally(() => { activeWork[channel] = null; });
      return;
    }
    // 서비스 재시작 (라이브가 맛이 갔을 때)
    if (/재시작|리스타트|restart/i.test(raw)) {
      const win = byName('윈터') || LEAD;
      if (!process.env.RAILWAY_API_TOKEN) { await postAs(client, channel, thread_ts, win, '재시작은 RAILWAY_API_TOKEN 있어야 돼.'); return; }
      const target = extractRepo(raw) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, win, '어느 서비스 재시작할지 알려줘 (레포 이름).'); return; }
      const svc = (target.split('/').pop() || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28);
      await postAs(client, channel, thread_ts, win, `${svc} 재시작할게.`);
      (async () => {
        const link = process.env.BUILDS_PROJECT_ID ? `env -u RAILWAY_TOKEN railway link --project ${process.env.BUILDS_PROJECT_ID} --environment ${process.env.BUILDS_ENV || 'production'} </dev/null >/dev/null 2>&1; ` : '';
        const r = await sh(`${link}env -u RAILWAY_TOKEN railway restart --service ${svc} </dev/null 2>&1`, '/tmp');
        await postAs(client, channel, thread_ts, win, r.code === 0 ? '재시작 보냈어. 곧 다시 뜰 거야.' : '재시작이 막혔어:\n' + ((r.out || r.err) || '').slice(-300));
      })();
      return;
    }
    // 마케팅 산출물 — 영듀가 MARKETING.md + 메타 보강
    // 마케팅 "자료 생성" 명령만 (질문/조사 "어떻게/방법/보고"는 여기서 안 잡고 아래 report로 보냄)
    if (/마케팅\s*(자료|플랜|콘텐츠|캠페인|카피|에셋|머티리얼)/.test(raw) && /(만들|작성|뽑|준비|짜|생성|돌려|올려|넣)/.test(raw) && !/어떻게|방법|어때|할까|좋을까|보고|분석|뭐가/.test(raw)) {
      const mrepo = extractRepo(raw) || lastRepo[channel];
      if (!mrepo) { await postAs(client, channel, thread_ts, byName('영듀') || LEAD, '어느 서비스 마케팅 자료 만들지 알려줘. 레포 이름 알려주거나 뭐 하나 만들고 말해줘.'); return; }
      await postAs(client, channel, thread_ts, byName('영듀') || LEAD, `${mrepo} 마케팅 자료 만들게. 포지셔닝부터 런칭 카피까지 정리해서 레포에 넣을게.`);
      if (await guardBusy(client, channel, thread_ts)) return;
      startWork(client, channel, event.thread_ts || event.ts, mrepo, '이 서비스 마케팅 자료를 만들어라. 포지셔닝, 타겟과 사용맥락, 핵심 한 줄 메시지, 채널별 전략(SEO·콘텐츠·SNS·커뮤니티), 런칭 카피 몇 개, 4주치 콘텐츠 캘린더, 핵심 SEO 키워드까지 MARKETING.md로 저장해. 그리고 사이트의 title/description/OG 메타태그도 더 매력적으로 다듬어라. 마케팅 담당이 메인으로.', false, !!settings.approval[channel]);
      return;
    }
    // 데이터/지표 리포트 (애널리틱스 연결 상태 정직하게)
    if (/(지표|분석|애널리틱스|데이터).*(리포트|보고|현황|어때|봐줘)/.test(raw)) {
      const da = byName('아이유') || LEAD;
      if (!process.env.ANALYTICS_API && !process.env.ANALYTICS_READ_URL) { await postAs(client, channel, thread_ts, da, '아직 접속 통계(애널리틱스)가 연결이 안 돼 있어. 솔직히 지금은 읽을 데이터가 없어. 너가 애널리틱스 계정이랑 키 넣어주면 그때부터 방문·유입·리텐션 주간으로 정리해줄게. 지어내서 보고하진 않을게.'); return; }
      await postAs(client, channel, thread_ts, da, '지표 보고는 곧 붙일게(읽기 연동 작업 중). 키는 들어와 있어.');
      return;
    }
    // 스케줄 관리 명령
    if (/스케줄.*(목록|보여|리스트)/.test(raw)) {
      const list = schedules.filter(s => s.channel === channel);
      await postAs(client, channel, thread_ts, LEAD, list.length ? '등록된 스케줄:\n' + list.map(s => `#${s.id} · ${s.kind === 'daily' ? `매일 ${s.hour}시${s.minute ? ' ' + s.minute + '분' : ''}` : humanMs(s.ms)} · ${s.label}`).join('\n') : '등록된 스케줄이 없어.');
      return;
    }
    let cm;
    if ((cm = raw.match(/스케줄.*취소\s*(전체|모두|all|\d+)/))) {
      const which = cm[1];
      if (/전체|모두|all/.test(which)) { schedules.forEach(s => clearInterval(s.timer)); schedules.length = 0; await postAs(client, channel, thread_ts, LEAD, '스케줄 전체 취소했어.'); }
      else { const idx = schedules.findIndex(s => s.id === parseInt(which)); if (idx >= 0) { clearInterval(schedules[idx].timer); schedules.splice(idx, 1); await postAs(client, channel, thread_ts, LEAD, `스케줄 #${which} 취소했어.`); } else await postAs(client, channel, thread_ts, LEAD, `#${which} 스케줄을 못 찾았어.`); }
      persistSchedules();
      return;
    }
    // 주기 스케줄 등록 (간격 또는 매일 특정시각)
    const daily = parseDaily(raw);
    const ims = daily ? null : parseIntervalMs(raw);
    if ((daily || ims) && !/만들|제작|개발|처음부터|새\s*프로젝트|짜줘|짜봐|구현/.test(raw) && !/(앱|어플|사이트|웹사이트|홈페이지|랜딩|게임|서비스|플랫폼|툴|봇)\s*$/.test(raw)) { // 신규제작 요청에 '매일' 들어간 거 스케줄로 오등록 방지, "하루한번 점검"은 포함. 동사 없이 제품명사로 끝나면(예: "매주 장보기 리스트 앱") 빌드 요청 → 스케줄 제외
      const taskText = raw.replace(/(\d+\s*(초|분|시간|일|주)\s*마다|매일|매주|매시간|주기적으로|주기별로|(오전|아침|오후|저녁|밤)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/g, '').replace(/\s+/g, ' ').trim();
      const it = await classifyIntent(taskText || raw);
      const id = ++schedSeq;
      const reporter = (pickPersona(raw) || LEAD).name;
      const base = { id, channel, label: taskText || raw, action: it.action, task: it.task, repo: it.repo, newProject: !!it.newProject, reporter };
      const s = daily ? { ...base, kind: 'daily', hour: daily.hour, minute: daily.minute } : { ...base, kind: 'interval', ms: ims };
      startSchedule(s, !daily);
      persistSchedules();
      const when = daily ? `매일 ${daily.hour}시${daily.minute ? ' ' + daily.minute + '분' : ''} (KST)` : humanMs(ims);
      await postAs(client, channel, thread_ts, LEAD, `⏰ 스케줄 등록했어 (#${id})\n주기: ${when}\n내용: ${s.label}\n${daily ? '예약 시각에' : '지금 한 번 돌려보고 이후'} 자동 실행할게. 재시작해도 유지돼. (취소: "스케줄 취소 ${id}")`);
      return;
    }
    // 알려진 프로젝트에 대한 질문/분석/조언 요청은 무조건 조사(report)로 → 잡담으로 새서 "프라이빗이라 못 봐" 같은 헛소리 방지
    const projRepo = extractRepo(raw);
    if (projRepo && /어떻게|방법|전략|할까|좋을까|봐줘|봐 ?줘|보고|분석|점검|현황|어때|개선|뭐가|뭘|어디서|왜|있어\?|되[가나]/.test(raw) && canCommand(event.user) && !/만들|새로|처음부터/.test(raw)) {
      if (await guardBusy(client, channel, thread_ts)) return;
      const reporter = pickPersona(raw) || LEAD;
      activeWork[channel] = { task: raw, started: Date.now(), by: lastRequester[channel] };
      runReport(client, channel, event.thread_ts || event.ts, reporter, projRepo, raw).catch(e => { jobUpdate(channel, { status: 'failed', error: String(e).slice(0, 150) }); postAs(client, channel, thread_ts, LEAD, '조사 오류: ' + String(e).slice(0, 300)); }).finally(() => { endJob(channel); activeWork[channel] = null; });
      return;
    }
    // 특정 단어 없어도 AI가 의도 판단 → 작업이면 알아서 수행
    const ctx = recentCtx(channel);
    // 짧은 인사·맞장구는 분류기(haiku) 안 돌리고 바로 잡담 처리 → 사용량 절약
    const trivial = raw.length <= 8 && /^(ㅎㅇ|하이|안녕(하세요)?|hi|hello|헬로|ㅇㅇ|ㅇㅋ|오케이|오키|ok|굿|good|ㄳ|고마워|고맙|땡큐|thx|ㅋㅋ+|ㅎㅎ+|ㄷㄷ+|응|넹|네+|예+|좋아|좋네|오+|와+|헐)$/i.test(raw);
    const intent = trivial ? { action: 'chat' } : await classifyIntent(raw, ctx);
    if (['work', 'report', 'debate'].includes(intent && intent.action) && !canCommand(event.user)) {
      await postAs(client, channel, thread_ts, LEAD, '그건 지정된 사람만 시킬 수 있어. ("권한 나만"으로 잠그거나 "권한 모두"로 풀 수 있어)');
      return;
    }
    // 이 채널에서 무거운 작업이 이미 도는 중이면 새로 시작 안 하고(진행상태 덮어쓰기/리소스 충돌 방지) 안내만
    if (['work', 'report', 'debate'].includes(intent && intent.action) && activeWork[channel]) {
      await postAs(client, channel, thread_ts, LEAD, `지금 "${(activeWork[channel].task || '').slice(0, 40)}" 하는 중이라 그것부터 끝내고 할게. 급하면 "중단"이라고 해줘.`);
      return;
    }
    const named = extractRepo(raw); // 메시지에 명시된 레포(doping-portfolio 등)
    const resolveR = (r) => r === '__last__' ? lastRepo[channel] : r === '__named__' ? named : resolveRepo(r);
    // 새로 만들/개발하라는 신호가 있으면 lastRepo로 끌고가지 말고 새 프로젝트로 (직전 레포 오염 방지)
    // 단, 강한 신규신호(새 게임/오마주/처음부터…)는 명시 레포가 있어도 새로, 약한 신호(만들/제작/개발)는 명시된 기존 레포가 없을 때만 새로 — "스포노노에 다크모드 만들어줘"를 새 레포로 안 빼게
    const strongNew = /새\s*게임|새\s*앱|새\s*사이트|새\s*서비스|새\s*프로젝트|새로\s*만|처음부터|오마주|클론(?!해)/.test(raw);
    const weakNew = /\b만들|만들어|만들고|제작|개발|하나\s*만들/.test(raw);
    // 분류기가 '봇 자체 수정'(repo=bot)으로 잡았으면 "만들어"가 들어가도 새 프로젝트로 덮지 않음 — "봇에 X 기능 만들어줘"를 새 레포로 빼던 버그(봇은 extractRepo에 없어 named 보호도 못 받음)
    if (intent && intent.action === 'work' && intent.repo !== 'bot' && (strongNew || (weakNew && !named))) { intent.newProject = true; intent.repo = 'new'; }
    // 명시된 레포가 있고 신규생성이 아니면 그 레포로 (분류기가 모르는 이름도 인식 → 엉뚱한 lastRepo 방지)
    if (named && intent && ['work', 'report', 'debate'].includes(intent.action) && !intent.newProject) { intent.repo = '__named__'; }
    if (['work', 'report', 'debate'].includes(intent && intent.action) && intent.repo === 'unknown') {
      // 이 채널이 방금 다룬 레포가 있으면 그걸로 이어감 (추측이 아니라 직전 문맥 — "이거 보여줘/고쳐줘" 같은 후속)
      if (lastRepo[channel]) { intent.repo = '__last__'; intent.newProject = false; }
      else if (intent.action === 'work') {
        // 다룬 적 없는 채널에서 코드를 고치라는데 대상 불명 → 추측 말고 물어봄
        await postAs(client, channel, thread_ts, LEAD, '어느 프로젝트(레포)를 말하는 거야? sponono, wewantpeace, myungjak 중에 있어, 아니면 정확한 레포 이름 알려줘. 모르는 채로는 엉뚱한 데 손대거나 헛소리해서 안 할게.');
        return;
      }
      else { intent.action = 'chat'; } // report/debate인데 대상 불명 → 게이트 대신 그냥 대화로 답함(레포 안 건드림)
    }
    if (intent && intent.action === 'work' && intent.task) {
      const newProject = !!intent.newProject;
      const repo = newProject ? WORK_DEFAULT_REPO : resolveR(intent.repo);
      // 시작 전에 정말 애매한 중요 결정 있으면 먼저 물어보고(없으면 바로 진행) — 신규·수정 둘 다
      startWork(client, channel, event.thread_ts || event.ts, repo, intent.task, newProject, !!settings.approval[channel], intent.name);
      return;
    }
    if (intent && intent.action === 'report' && intent.task) {
      const reporter = pickPersona(event.text || '') || LEAD;
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runReport(client, channel, event.thread_ts || event.ts, reporter, resolveR(intent.repo), intent.task).catch(e => { jobUpdate(channel, { status: 'failed', error: String(e).slice(0, 150) }); postAs(client, channel, thread_ts, LEAD, '조사 오류: ' + String(e).slice(0, 300)); }).finally(() => { endJob(channel); activeWork[channel] = null; });
      return;
    }
    if (intent && intent.action === 'debate' && intent.task) {
      const drepo = (intent.repo && intent.repo !== 'new') ? resolveR(intent.repo) : null;
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runDebate(client, channel, event.thread_ts || event.ts, intent.task, drepo).catch(e => { jobUpdate(channel, { status: 'failed', error: String(e).slice(0, 150) }); postAs(client, channel, thread_ts, LEAD, '토론 오류: ' + String(e).slice(0, 300)); }).finally(() => { endJob(channel); activeWork[channel] = null; });
      return;
    }
    const targeted = pickPersona(event.text || '');
    if (targeted) {
      const res = await runClaude(`${targeted.prompt}${STYLE}${SELF}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락을 보고 너답게 대답해. 백그라운드 작업 진행상황은 [작업 상태]에 있는 사실만 말하고, 진행률이나 완료를 절대 지어내지 마. 그리고 넌 지금 잡담 중이라 레포 코드를 직접 안 봤어 — 프로젝트의 코드·기능·상태를 아는 척 지어내지 마. 잘 모르면 "그건 조사 한 번 돌려봐야 정확해"라고 솔직히 말해.`, targeted.model);
      await postAs(client, channel, thread_ts, targeted, (res.text || '').trim().slice(0, 3000));
    } else {
      // 아무도 안 부른 일반 메시지 → 랜덤하게 1~3명이 답장 + 일부 이모지
      const responders = pickRandom(ALL, 1 + Math.floor(Math.random() * 3));
      for (const p of responders) {
        const r2 = await runClaude(`${p.prompt}${STYLE}${SELF}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락 보고 너답게 짧게 한마디 해. 작업 진행상황은 [작업 상태] 사실만 말하고 지어내지 마. 레포 코드를 직접 안 본 상태니 프로젝트 내용을 아는 척 지어내지 말고, 모르면 조사 돌려보자고 해.`, p.model);
        await postAs(client, channel, thread_ts, p, (r2.text || '').trim().slice(0, 1500));
        if (r2.ok === false) break; // 한도/타임아웃이면 1명만 말하고 도배 방지
      }
      casualLayer(event, client, responders, { noComment: true }).catch(() => {});
    }

  } catch (e) {
    await postAs(client, channel, thread_ts, LEAD, '⚠️ 오류: ' + String(e).slice(0, 400));
    selfHeal(client, channel, thread_ts, String(e && e.stack || e)).catch(() => {}); // 내부 예외 → 자가수정 시도
  }
}

app.event('message', async ({ event, client }) => { await handle(event, client); });
app.event('app_mention', async ({ event, client }) => { await handle(event, client); });

(async () => {
  // root와 uid1000(claude)이 같은 clone 디렉토리를 둘 다 신뢰하도록 (dubious ownership 방지)
  try { await sh(`git config --system --add safe.directory '*'`); } catch (e) {}
  await app.start();
  botClient = app.client;
  await resolveIds();
  loadSchedules();
  loadMemory();
  loadRules();
  loadSettings();
  loadTasks(); loadJobs();
  loadLastRepo();
  loadServices();
  loadPending();
  setInterval(persistMemory, 15000);
  let opsLastDay = null;
  const OPS_HOUR = parseInt(process.env.OPS_HOUR || '10', 10); // 매일 이 시각(KST)에 운영 헬스체크 자동
  setInterval(() => {
    // 워치독: 생존신호(beat)가 25분 넘게 끊긴 작업만 풀어줌 → 영구 블록 방지. 정상적으로 오래 도는 작업(PRD 핑퐁+빌드 등)은 beat가 계속 갱신되니 안 끊음(예전엔 시작시각 기준이라 살아있는 작업을 죽여서 "풀어둘게" 쏘고 실제론 완성되는 레이스가 있었음)
    for (const ch of Object.keys(activeWork)) {
      const w = activeWork[ch];
      if (w && Date.now() - (w.beat || w.started || 0) > 25 * 60 * 1000) {
        if (w.repo !== undefined) pausedWork[ch] = { ...w }; // 재개 가능하게 보관
        activeWork[ch] = null;
        postAs(botClient, ch, undefined, LEAD, '아까 그 작업이 응답이 끊긴 거 같아서 일단 풀어둘게. "다시 해"나 "이어서"라고 하면 이어갈게.').catch(() => {});
      }
    }
    const n = kstNow();
    for (const s of schedules) {
      // 일일 스케줄: 정확한 분만 보면 60초 인터벌 드리프트·짧은 재시작에 그 분을 놓쳐 그날 통째 누락됨. 예정시각 지나고 15분 안이면 따라잡아 1회 실행(lastRunDay로 중복 방지), 너무 늦으면 그날 스킵.
      if (s.kind === 'daily' && s.lastRunDay !== n.day) {
        const nowMin = n.h * 60 + n.m, schMin = (s.hour || 0) * 60 + (s.minute || 0);
        if (nowMin >= schMin && nowMin - schMin <= 15 && !activeWork[s.channel]) { // 진행중이면 lastRunDay 안 박고 다음 틱(윈도우 내) 재시도 → 사용자 작업 끝나면 따라잡음
          s.lastRunDay = n.day; persistSchedules(); jobFor(s)().catch(() => {});
        }
      }
    }
    // 매일 OPS_HOUR에 전체 헬스체크 리포트 (운영 부서 자동화)
    if (n.h === OPS_HOUR && n.m === 0 && opsLastDay !== n.day) {
      opsLastDay = n.day;
      const chans = [...new Set(svcList().filter(s => s.url && s.channel).map(s => s.channel))];
      for (const ch of chans) checkServices(botClient, ch, false).catch(() => {});
    }
    // 매시 정각엔 조용히 감시하다가 새로 죽은 게 있으면 즉시 알림 (실시간 다운 감지)
    if (n.m === 0 && n.h !== OPS_HOUR) {
      const chans = [...new Set(svcList().filter(s => s.url && s.channel).map(s => s.channel))];
      for (const ch of chans) checkServices(botClient, ch, false, true).catch(() => {});
    }
  }, 60000);
  const real = TEAM.concat(LEAD).filter(p => process.env[p.tokenEnv]).map(p => p.name);
  console.log(`⚡ 도핑연구소 봇 실행 — 채널 글에 바로 응답 + 이름 부르면 그 직원이 답함\n   별도멤버: ${real.length ? real.join(', ') : '없음'}\n   ROUNDS=${ROUNDS}`);
})();
