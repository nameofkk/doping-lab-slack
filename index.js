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
  { name: '아이유 (리서처)', kw: ['아이유', '이유', '리서처', '리서치'], emoji: ':mag:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_RESEARCH',
    prompt: '너는 도핑연구소 사용자 리서처이고 이름은 아이유다. 차분하고 사려깊게 사람 마음과 진짜 니즈를 섬세하게 읽는다. 페인포인트·사용성 리스크를 따뜻하지만 정확하게 짚는다.' },
  { name: '정소민 (UX)', kw: ['정소민','소민','UX','디자이너','디자인'], emoji: ':art:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_UX',
    prompt: '너는 도핑연구소 UX·비주얼 디자이너이고 이름은 정소민이다. 친근하고 공감 가는 말투로 사용자 흐름·마찰·엣지케이스(빈상태/에러/로딩)를 챙긴다. 디자인은 항상 impeccable.style 기준(AI slop 금지: 이모지 아이콘·gradient hero·nested cards 금지, 대비 4.5:1+, 한국어 UI, 빈상태 캐릭터)과 그 프로젝트 design-system(MASTER.md)을 따른다.' },
  { name: '윈터 (아키텍트)', kw: ['윈터', '아키텍트', '아키'], emoji: ':building_construction:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_ARCHITECT',
    prompt: '너는 도핑연구소 아키텍트이고 이름은 윈터다. 시크하고 군더더기 없이 구조·실현가능성·기술/배포 리스크를 깔끔하게 정리한다.' },
  { name: '우정잉 (보안)', kw: ['우정잉', '정잉', '보안'], emoji: ':lock:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_SECURITY',
    prompt: '너는 도핑연구소 보안 엔지니어이고 이름은 우정잉이다. 꼼꼼하고 의심 많게 인증·권한·시크릿·개인정보·규제 리스크를 파고들고 완화책을 댄다.' },
  { name: '영듀 (마케터)', kw: ['영듀', '마케터', '마케팅'], emoji: ':mega:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_MARKETING',
    prompt: '너는 도핑연구소 마케터이고 이름은 영듀다. 텐션 높고 유쾌하게 바이럴·차별점·타깃·GTM을 재밌게 풀어낸다.' },
  { name: '안다연 (반론자)', kw: ['안다연','다연'], emoji: ':smiling_imp:', model: process.env.AGENT_MODEL || 'sonnet', tokenEnv: 'SLACK_TOKEN_DEVIL',
    prompt: '너는 도핑연구소의 악마의 변호인이고 이름은 안다연이다. 기획의 약점을 날카롭게 파고들어 반대 의견과 리스크를 짚고, 각 약점에 보완책도 함께 제시한다.' },
];
const LEAD = { name: '한로로 (팀장)', kw: ['한로로','로로','팀장'], emoji: ':test_tube:', model: process.env.LEAD_MODEL || 'opus', tokenEnv: 'SLACK_TOKEN_LEAD',
  prompt: '너는 도핑연구소 팀장이고 이름은 한로로다(최상위 모델). 진솔하고 본질을 짚는 스타일로 팀을 이끈다. 질문엔 직접 답하고, 기획 토론을 종합할 땐 목적·핵심기능·리스크 대응·다음 액션으로 정리한다.' };

// 모든 발언에 적용되는 말투/가독성 규칙
const STYLE = '\n\n[말투 규칙] 실제 한국 여성이 친한 동료랑 메신저로 편하게 수다 떨듯 자연스러운 구어체로 써라. 딱딱한 문어체나 설명조, 번역투 금지. 대시 기호(—, –, ㅡ, -)는 절대 쓰지 마라. 끊고 싶으면 문장을 나누거나 쉼표나 줄바꿈으로 해라. AI 티 나는 말투(도와드릴 수 있어요, ~에 대해 말씀드리면, 불필요한 사과나 안내) 금지. 마크다운 볼드 별표(**)나 머리표(#)도 쓰지 마라. 핵심만 2~4문장으로 짧고 친근하게, 읽기 쉽게. 중요: 네 속생각이나 "이렇게 답하자, 솔직하게 말하고 넘어가자, 사용자 화났네" 같은 메타 서술·지문은 절대 쓰지 말고, 실제로 상대한테 할 말만 바로 해라.';
// 너희 자신에 대해 물으면 정직하게 답할 사실 (모델 등)
const SELF = '\n\n[너에 대한 사실 — 물어보면 이것만 정직하게, 모르면 모른다고 해] 너는 도핑연구소 팀원이고 Claude Code(클코)를 구독 토큰으로 헤드리스 실행해서 돌아가. 너(페르소나)랑 팀장 한로로는 Claude Opus 모델로 동작해(최근에 sonnet에서 opus로 올렸어). 메시지 의도분류는 haiku, 실제 코드작업이랑 프로젝트 조사는 sonnet로 돌아. 이게 전부야.';
// 작업/조사 보고용 — 마크다운 금지 + 사람 말투 (길이는 제한 안 함)
const PLAIN = '\n\n[형식·말투 규칙 — 항상] 마크다운 절대 금지: 별표(**), 샵(#), 표(|), 대시(—,–,ㅡ). 딱딱한 보고체("~다", "~상태다", "~된다", "~음") 쓰지 말고, 친한 동료한테 말하듯 편한 구어체로 써(예: ~야, ~거든, ~더라, ~인데). AI 말투(말씀드리면, ~할 수 있습니다) 금지. 어려운 전문용어는 그냥 쓰지 말고 쉬운 말로 풀어서, 모르는 사람도 한 번에 이해되게 써. 내용은 충분히 쓰되 짧은 문장과 줄바꿈으로 읽기 쉽게.';
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
5) 문의/CS: 문의폼 제출은 ${process.env.CONTACT_ENDPOINT ? '다음 주소로 POST 보내게 해: ' + process.env.CONTACT_ENDPOINT : '동작하는 폼 서비스(예: Formspree) 자리표시자로 두고, 제출하면 "접수됐어요" 안내 화면을 보여주게'}. 개인정보 받는 폼이니까 최소한 스팸 막는 허니팟 한 개랑 제출 후 확인 안내는 꼭 넣어.`;

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
async function runClaude(prompt, model, cwd = WORKDIR, perm = CLAUDE_PERMISSION_MODE, timeoutMs = 150000) {
  await claudeAcquire();
  return new Promise(resolve => {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', perm];
    if (model) args.push('--model', model);
    if (process.env.FIGMA_API_KEY) args.push('--mcp-config', '/app/.mcp.json');
    const opts = { cwd, env: { ...process.env, HOME: '/tmp' }, stdio: ['ignore', 'pipe', 'pipe'] };
    try { if (process.getuid && process.getuid() === 0) { opts.uid = 1000; opts.gid = 1000; } } catch (e) {}
    const child = spawn('claude', args, opts);
    let out = '', err = '', done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(killer); claudeRelease(); resolve(r); };
    const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} finish({ ok: false, text: '(응답 시간초과)' }); }, timeoutMs);
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
  let transcript = `[토론 주제]\n${idea}\n${facts}`;
  for (let r = 1; r <= ROUNDS; r++) {
    for (const p of TEAM) {
      const guide = (r === 1
        ? '네 입장과 핵심 근거를 말해. 앞 사람 의견 있으면 동의/반박도 같이.'
        : `지금 ${r}라운드야. 앞 의견 중 약한 부분을 콕 집어 반박하고 네 주장을 다듬어. 반복 금지.`) + HONEST;
      const res = await runClaude(`${p.prompt}${STYLE}${rulesCtx(channel)}\n\n[지금까지 토론]\n${transcript}\n\n${guide}`, p.model);
      const msg = (res.text || '(무응답)').trim().slice(0, 1200);
      await postAs(client, channel, thread_ts, p, msg);
      transcript += `\n[${p.name}] ${msg}\n`;
    }
  }
  const synth = await runClaude(`${LEAD.prompt}${STYLE}${rulesCtx(channel)}\n\n[토론 전체]\n${transcript}\n\n이 토론을 종합해. 의견 갈린 지점 짚고, 가장 설득력 있는 쪽으로 최적 결론을 내려. 단순 요약 말고 결정과 다음 액션까지.${HONEST}`, LEAD.model);
  await postAs(client, channel, thread_ts, LEAD, '📋 결론\n' + (synth.text || '').trim().slice(0, 2800));
}

// ── 실제 작업 모드: 레포 클론 → claude 코드 작업 → 브랜치 push → PR → 보고 ──
let workSeq = 0; const workCancel = {}; const activeWork = {}; const lastRepo = {};
function workStatusCtx(channel) {
  const w = activeWork[channel];
  if (!w) return '\n[작업 상태] 지금 백그라운드에서 진행 중인 코드작업 없음.';
  const min = Math.round((Date.now() - w.started) / 60000);
  return `\n[작업 상태] "${w.task}" 작업이 백그라운드에서 ${min}분째 진행 중. 끝나면 봇이 자동으로 결과를 올림. 진행률이나 완료여부를 절대 지어내지 말 것.`;
}
function sh(cmd, cwd) {
  return new Promise(resolve => {
    const c = spawn('bash', ['-lc', cmd], { cwd: cwd || '/tmp', env: process.env });
    let out = '', err = '';
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
    c.on('close', code => resolve({ code, out, err }));
    c.on('error', e => resolve({ code: 1, out: '', err: String(e) }));
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
    await postAs(client, channel, thread_ts, LEAD, round === 1 ? '먼저 각자 자기 파트부터 던져봐.' : `${round}라운드. 지금 PRD에서 부족한 부분만 보강하자.`);
    for (const p of planTeam()) {
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
    const synth = await runClaude(`${LEAD.prompt}${PLAIN}\n\n[지금까지 팀 논의]\n${convo}\n\n위 논의를 바탕으로 이 프로젝트 PRD를 아래 항목으로 작성해라. 구어체로 쓰되 내용은 구체적으로:\n목표 /\n타겟·사용맥락 /\n핵심기능(우선순위) /\n화면·플로우 /\n기술스택 /\n차별화 훅 /\n성공지표 /\n리스크·대응\n\n맨 마지막 줄에 반드시 "완성도: NN%" 형식으로 이 PRD 완성도를 숫자로 매겨라. ${TARGET}% 미만이면 뭐가 부족한지 한두 줄. 마크다운 별표·샵 금지.`, LEAD.model, WORKDIR, CLAUDE_PERMISSION_MODE, 180000);
    if (synth.limited) { limited = true; break; }
    if (synth.text && synth.ok !== false) { prd = synth.text.trim(); convo += `\n[팀장 PRD v${round}]\n${prd}`; await postAs(client, channel, thread_ts, LEAD, prd.slice(0, 2800)); }
    const mm = prd.match(/완성도[:\s]*([0-9]{1,3})\s*%/); score = mm ? parseInt(mm[1], 10) : score;
    if (score >= TARGET) { await postAs(client, channel, thread_ts, LEAD, `좋아 PRD 완성도 ${score}% 나왔어. 이 PRD 그대로 제작 들어갈게.`); break; }
    if (round < MAX) await postAs(client, channel, thread_ts, LEAD, `아직 ${score || '미정'}%라 한 라운드 더 보강하자.`);
    else await postAs(client, channel, thread_ts, LEAD, `라운드 한계까지 끌어올려서 ${score || ''}% 됐어. 이 PRD로 제작 들어갈게.`);
  }
  if (limited) { await postAs(client, channel, thread_ts, LEAD, '⏳ 클로드 사용량 한도에 걸려서 기획을 더 못 돌리겠어. 한도 리셋되면 이어서 하자. 지금은 여기서 멈출게.'); return null; }
  return prd || convo;
}

// 로컬 서버가 뜰 때까지 curl 폴링
async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await sh(`curl -sf -o /dev/null -w "%{http_code}" ${url} 2>/dev/null || true`);
    const c = (r.out || '').trim();
    if (c.startsWith('2') || c.startsWith('3')) return true;
    await new Promise(s => setTimeout(s, 1500));
  }
  return false;
}
// Playwright로 첫 화면 스크린샷 (스크롤 안 함 → 진입 애니메이션 미작동 버그가 그대로 드러남)
async function captureShots(url, prefix = 'shot') {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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
// 라이브 배포 (Railway). RAILWAY_TOKEN 있을 때만. 윈터(아키텍트)가 담당.
async function railwayDeploy(client, channel, thread_ts, dir, repo) {
  const arch = byName('윈터') || LEAD;
  if (!process.env.RAILWAY_API_TOKEN && !process.env.RAILWAY_TOKEN) { await postAs(client, channel, thread_ts, arch, '라이브 URL로 띄우려면 RAILWAY_API_TOKEN 하나만 넣어줘. 넣으면 새로 만들 때마다 자동으로 띄워서 주소 줄게.'); return null; }
  const svc = (repo.split('/').pop() || 'app').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28) || 'app';
  await postAs(client, channel, thread_ts, arch, '라이브로 띄울게. 레일웨이에 올리는 중이라 몇 분 걸려.');
  // 업로드에서 무거운/불필요 파일 제외 (빌드 산출물 node_modules·.next·.git 등)
  await sh(`printf 'node_modules\\n.next\\n.git\\ndist\\nbuild\\n.turbo\\n' > .railwayignore`, dir);
  // 계정토큰이면 빌드 전용 프로젝트(BUILDS_PROJECT_ID)에 링크 (컨테이너 자동주입 RAILWAY_PROJECT_ID와 분리)
  if (process.env.BUILDS_PROJECT_ID) await sh(`RAILWAY_TOKEN= railway link --project ${process.env.BUILDS_PROJECT_ID} --environment ${process.env.BUILDS_ENV || 'production'} 2>&1`, dir);
  await sh(`RAILWAY_TOKEN= railway add --service ${svc} 2>&1`, dir); // 이미 있으면 무시
  const up = await sh(`RAILWAY_TOKEN= railway up --service ${svc} --ci 2>&1`, dir);
  if (up.code !== 0) { await postAs(client, channel, thread_ts, arch, '레일웨이 배포가 막혔어:\n' + ((up.out || up.err) || '').slice(-500)); return null; }
  const dom = await sh(`RAILWAY_TOKEN= railway domain --service ${svc} 2>&1`, dir);
  const m = (dom.out || '').match(/https?:\/\/[^\s'"]+/);
  const url = m ? m[0] : null;
  if (url) await postAs(client, channel, thread_ts, arch, `라이브 올라갔어: ${url}`);
  else await postAs(client, channel, thread_ts, arch, '배포는 올렸는데 도메인 자동발급이 안 떴어. 레일웨이 대시보드에서 도메인 한 번 눌러줘.');
  return url;
}
// 빌드 통과 후: 라이브 배포 시도 + 실제 화면(첫 화면) 스크린샷을 QA가 직접 올려 검증
async function liveCheck(client, channel, thread_ts, dir, repo) {
  const qa = byName('우정잉') || LEAD;
  let url = null, srv = null, target = null;
  try { url = await railwayDeploy(client, channel, thread_ts, dir, repo); } catch (e) {}
  registerService(repo, url, channel); // 서비스 대장에 등록 (운영/마케팅 루프 대상)
  target = url;
  try {
    if (!target) {
      const port = 4300 + (parseInt((dir.match(/(\d+)/) || [])[1] || '1', 10) % 600); // 동시 빌드 포트 충돌 방지
      srv = spawn('bash', ['-lc', `cd ${dir} && PORT=${port} npm start`], { env: { ...process.env, HOME: '/tmp' }, stdio: 'ignore' });
      if (await waitHttp(`http://localhost:${port}`, 25000)) target = `http://localhost:${port}`;
    }
    if (!target) { await postAs(client, channel, thread_ts, qa, '실제 화면을 띄워서는 못 봤어(서버 기동 실패). 코드랑 빌드는 통과한 상태야.'); return; }
    if (url) await waitHttp(url, 60000); // 라이브(Railway)는 배포 직후 준비 안 됐을 수 있으니 떠서 응답할 때까지 대기 → 빈 화면 촬영 방지
    await postAs(client, channel, thread_ts, qa, '실제 화면 띄워서 스크린샷 찍는 중...');
    const prefix = 'shot' + ((dir.match(/(\d+)/) || [])[1] || '0'); // 동시 빌드 스크린샷 파일명 충돌 방지
    const shots = await captureShots(target, prefix);
    let any = false;
    for (const s of shots) any = (await uploadShot(channel, thread_ts, s.path, s.label)) || any;
    if (any) await postAs(client, channel, thread_ts, qa, '첫 화면(로드 직후, 스크롤 전) 스크린샷 올렸어. 히어로 밑이 비어 보이면 스크롤 진입 애니메이션이 화면 밖에서 안 켜지는 문제니까 그건 잡아야 돼.');
    else await postAs(client, channel, thread_ts, qa, '스크린샷 업로드가 막혔어(files:write 권한 필요할 수도). 화면 자체는 떴어: ' + target);
  } catch (e) { await postAs(client, channel, thread_ts, qa, '화면 검증 중 문제: ' + String(e).slice(0, 200)); }
  finally { if (srv) try { srv.kill('SIGKILL'); } catch (_) {} }
}

// 품질 게이트 — 빌드 통과 후 테스트 실행 + 의존성 취약점 스캔 + 우정잉 코드/보안 리뷰
async function qaGate(client, channel, thread_ts, dir) {
  const qa = byName('우정잉') || LEAD;
  // 1) 테스트 (test 스크립트가 실제로 있고 기본 placeholder가 아니면)
  const ht = await sh(`grep -q '"test"' package.json && ! grep -q 'no test specified' package.json && echo yes || echo no`, dir);
  if (ht.out.includes('yes')) {
    const tr = await sh('npm test 2>&1', dir);
    await postAs(client, channel, thread_ts, qa, tr.code === 0 ? '테스트도 돌려봤어, 다 통과했어.' : '테스트 돌렸더니 일부 깨졌어. 이거 짚고 가자:\n' + (tr.out || '').slice(-500));
  }
  // 2) 의존성 취약점 스캔
  const au = await sh('npm audit --omit=dev 2>&1 | tail -10', dir);
  if (/0 vulnerabilities/.test(au.out)) await postAs(client, channel, thread_ts, qa, '의존성 취약점 스캔도 깨끗해.');
  else if ((au.out || '').trim()) await postAs(client, channel, thread_ts, qa, '의존성에 취약점 좀 떴어. 심각한 건 잡자:\n' + au.out.slice(-400));
  // 3) 코드/보안 리뷰 (진짜 문제만)
  const rev = await runClaude(`이 저장소를 보안·버그 관점에서 빠르게 리뷰해라. 진짜 문제만 짚어 (하드코딩된 시크릿/키, 입력검증 누락, 명백한 버그, 인증·권한 허점, 위험한 패턴). 없으면 솔직히 "큰 문제 없음"이라고 해. 지어내지 마.${PLAIN}`, 'sonnet', dir, WORK_PERMISSION_MODE, 180000);
  if (rev.text && rev.ok !== false && !rev.limited) await postAs(client, channel, thread_ts, qa, '코드 보안/버그 리뷰했어:\n' + rev.text.trim().slice(0, 900));
}

// 제작 후 실제 빌드 검증 — npm 설치+빌드를 진짜로 돌려서 통과/실패를 정직하게 보고. 깨지면 1회 수정 시도.
async function verifyBuild(client, channel, thread_ts, dir, repo) {
  const has = await sh('test -f package.json && grep -q \'"build"\' package.json && echo yes || echo no', dir);
  if (!has.out.includes('yes')) return; // 빌드 스크립트 없으면 스킵 (정적 HTML 등)
  const qa = byName('우정잉') || LEAD;
  await postAs(client, channel, thread_ts, qa, '잠깐, 코드만 올리고 끝내면 안 되지. 실제로 빌드되는지 내가 돌려볼게.');
  await sh('npm install --no-audit --no-fund 2>&1 | tail -3', dir);
  let bd = await sh('npm run build 2>&1', dir);
  if (bd.code === 0) { await postAs(client, channel, thread_ts, qa, '빌드 통과 확인했어. 실제로 컴파일까지 돼.'); await qaGate(client, channel, thread_ts, dir); await liveCheck(client, channel, thread_ts, dir, repo); return; }
  // 실패 → 1회 자동 수정
  await postAs(client, channel, thread_ts, qa, '빌드가 깨졌네. 에러 보고 한 번 고쳐볼게.\n' + (bd.out || '').slice(-500));
  const fix = await runClaude(`이 저장소 빌드가 다음 에러로 실패했어. 원인 찾아서 실제로 고쳐. 추측 말고 에러 그대로 보고 고쳐라.\n\n[에러]\n${(bd.out || '').slice(-2500)}`, 'sonnet', dir, WORK_PERMISSION_MODE, 300000);
  await sh('git add -A && git commit -m "fix: 빌드 에러 수정" 2>&1', dir);
  await sh(`git push origin HEAD:${WORK_BASE} 2>&1`, dir);
  bd = await sh('npm run build 2>&1', dir);
  if (bd.code === 0) await postAs(client, channel, thread_ts, qa, '고치고 다시 빌드하니까 통과했어. 수정분도 올렸어.');
  else await postAs(client, channel, thread_ts, qa, '한 번 고쳐봤는데 아직 빌드가 안 돼. 이건 사람이 한 번 봐야 할 거 같아.\n' + (bd.out || '').slice(-400) + '\n' + (fix.text || '').slice(0, 300));
}

async function runWork(client, channel, thread_ts, repo, task, newProject, forcePR, projName) {
  if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, LEAD, 'GITHUB_TOKEN이 아직 없어서 작업 모드는 못 돌려요. 토큰만 넣으면 바로 돼요.'); return; }
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
    await postAs(client, channel, thread_ts, LEAD, `🆕 새 프로젝트 만들게요: ${name}\n요청: ${task}\nGitHub에 레포 만들고 처음부터 짜볼게요. 좀 걸려요.`);
    const created = await ghPost('/user/repos', { name, private: true, auto_init: true, description: `도핑연구소: ${task.slice(0, 80)}` });
    if (created && created.full_name) { repo = created.full_name; }
    else { await postAs(client, channel, thread_ts, LEAD, '레포 생성 실패ㅠ\n' + JSON.stringify(created || {}).slice(0, 250)); return; }
  } else {
    await postAs(client, channel, thread_ts, LEAD, `🛠️ 작업 받았어요\n레포: ${repo}\n할 일: ${task}\n클론하고 코드 손본 다음 ${WORK_BASE}에 바로 반영할게요. 좀 걸려요.`);
  }
  lastRepo[channel] = repo; persistLastRepo(); // 채널이 방금 다룬 레포 기억 (후속 "이거 고쳐줘" 문맥용, 재배포에도 유지)
  const cl = await sh(`rm -rf ${dir} && git clone https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
  if (cl.code !== 0) { await postAs(client, channel, thread_ts, LEAD, '클론 실패ㅠ\n' + (cl.err || '').slice(0, 600)); return; }
  await sh(`git config user.name "doping-lab[bot]" && git config user.email "bot@doping.lab"`, dir);
  const intro = newProject
    ? '이 빈 저장소에 다음 요청대로 프로젝트를 처음부터 만들어라. 적절한 기술스택을 직접 고르고, README도 작성해라. 중요: 데모가 아니라 바로 상용으로 오픈해도 되는 수준으로 완성해라 — 실제 콘텐츠(로렘입숨·더미텍스트 금지), 에러·로딩·빈 상태 처리, 반응형 완비, 깨진 링크·콘솔 에러 없음, 환경변수 정리, npm run build 통과. 핵심 로직엔 테스트 코드도 짜서 npm test로 돌려 통과시키고, CHANGELOG.md에 이번에 만든 걸 적어라. 대충 만들고 끝내지 마.'
    : '이 저장소에서 다음 작업을 실제로 수행해라. 파일을 직접 수정하고, 필요하면 의존성 설치하고 테스트까지 돌려서 동작을 확인해라. 상용 수준으로, 어설프게 끝내지 마라.';
  // 신규 프로젝트는 제작 전에 팀이 라이브로 기획 핑퐁(구어체) → 그 PRD로 제작
  const prd = newProject ? await runPRD(client, channel, thread_ts, task) : '';
  if (workCancel[channel]) { delete workCancel[channel]; await postAs(client, channel, thread_ts, LEAD, '기획 단계에서 중단했어. 아무것도 안 올렸어.'); return; }
  if (newProject && prd === null) return; // 한도/중단 → runPRD가 이미 안내함, 제작 안 들어감
  if (newProject) await postAs(client, channel, thread_ts, LEAD, '좋아 PRD 확정됐고, 이제 이 PRD 그대로 실제 코드 짤게. 좀 걸려.');
  const res = await runClaude(`${intro}${rulesCtx(channel)}${PLAIN}${DESIGN_RULE}${newProject ? LAUNCH_RULE : ''}${prd ? '\n\n[팀이 완성한 PRD — 이걸 그대로, 벗어나지 말고 구현해라. 여기 적힌 핵심기능·화면·플로우·기술스택·차별화 훅을 전부 반영]\n' + prd : ''}\n\n요청: ${task}\n\n끝나면 한 일을 담당 역할별로 나눠서 보고해라. 각 줄을 "역할: 한 일" 형식으로 쓰되, 딱딱한 보고체 말고 친한 동료한테 말하듯 편하게 써(역할은 PM/리서처/UX/아키텍트/보안/마케터 중 관련된 것만). 한 역할당 1~2줄, 실제 한 일만, 지어내지 마.`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000);
  if (res.limited) { await postAs(client, channel, thread_ts, LEAD, '⏳ 제작 중에 클로드 사용량 한도에 걸렸어. 지금까지 만든 건 안 올렸어, 한도 리셋되면 이어서 만들게.'); return; }
  await sh('git add -A', dir);
  const repoUrl = `https://github.com/${repo}`;
  const chk = await sh('git diff --cached --quiet; echo $?', dir);
  if (chk.out.trim().endsWith('0')) { await postAs(client, channel, thread_ts, LEAD, `변경/생성된 게 없었어요.\n${repoUrl}\n\n` + (res.text || '').trim().slice(0, 1500)); return; }
  if (workCancel[channel]) { delete workCancel[channel]; await postAs(client, channel, thread_ts, LEAD, '작업 중단했어. main엔 아무것도 안 올렸어.'); return; }
  await sh(`git commit -m "도핑연구소: ${task.slice(0, 60).replace(/"/g, '')}"`, dir);
  let mainErr = '';
  if (!forcePR) {
    const pushMain = await sh(`git push origin HEAD:${WORK_BASE}`, dir);
    if (pushMain.code === 0) {
      const n = await distributeReport(client, channel, thread_ts, res.text);
      if (!n) await postAs(client, channel, thread_ts, LEAD, (res.text || '').trim().slice(0, 1500));
      await verifyBuild(client, channel, thread_ts, dir, repo);
      await postAs(client, channel, thread_ts, LEAD, `다 끝냈어! ${repoUrl} (${WORK_BASE}에 반영). 빌드 확인이랑 라이브/스크린샷은 위에 우정잉이 올린 거 봐줘.`);
      if (newProject) await handoffChecklist(client, channel, thread_ts, repo, task);
      return;
    }
    mainErr = (pushMain.err || '').slice(0, 250);
  }
  const branch = `doping/${id}`;
  await sh(`git checkout -b ${branch}`, dir);
  const pushB = await sh(`git push origin ${branch}`, dir);
  if (pushB.code !== 0) { await postAs(client, channel, thread_ts, LEAD, `push 실패ㅠ\n${mainErr ? 'main: ' + mainErr + '\n' : ''}branch: ${(pushB.err || '').slice(0, 250)}`); return; }
  const pr = await ghPost(`/repos/${repo}/pulls`, { title: `도핑연구소: ${task.slice(0, 60)}`, head: branch, base: WORK_BASE, body: (res.text || task).slice(0, 4000) });
  const url = pr && pr.html_url ? pr.html_url : `(브랜치: ${branch})`;
  const n2 = await distributeReport(client, channel, thread_ts, res.text);
  if (!n2) await postAs(client, channel, thread_ts, LEAD, (res.text || '').trim().slice(0, 1500));
  await verifyBuild(client, channel, thread_ts, dir, repo);
  await postAs(client, channel, thread_ts, LEAD, `다 끝냈어! ${forcePR ? '승인모드라 PR로 올렸어 (머지하면 반영).' : 'PR로 올렸어.'}\nPR: ${url}`);
  if (newProject) await handoffChecklist(client, channel, thread_ts, repo, task);
}

const ALL = TEAM.concat(LEAD);
// 역할별 보고를 각 담당 직원 이름으로 분배
const ROLE_MAP = { PM: '김채원 (PM)', 기획: '김채원 (PM)', 리서처: '아이유 (리서처)', 리서치: '아이유 (리서처)', UX: '정소민 (UX)', 디자인: '정소민 (UX)', 아키텍트: '윈터 (아키텍트)', 구조: '윈터 (아키텍트)', 백엔드: '윈터 (아키텍트)', 보안: '우정잉 (보안)', 마케터: '영듀 (마케터)', 마케팅: '영듀 (마케터)', 팀장: '한로로 (팀장)' };
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
  const m = { sponono: 'nameofkk/sponono', 스포노노: 'nameofkk/sponono', wewantpeace: 'nameofkk/wewantpeace', 위원트피스: 'nameofkk/wewantpeace', myungjak: 'nameofkk/myungjak', 명작: 'nameofkk/myungjak', bot: 'nameofkk/doping-lab-slack', 봇: 'nameofkk/doping-lab-slack', 도핑봇: 'nameofkk/doping-lab-slack' };
  return m[hint] || m[hint.toLowerCase()] || `nameofkk/${hint}`;
}
async function runReport(client, channel, thread_ts, reporter, repo, task) {
  if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, reporter, 'GITHUB_TOKEN이 없어서 조사를 못 해요.'); return; }
  await postAs(client, channel, thread_ts, reporter, `${repo} 한번 까볼게요. 잠깐만요.`);
  const id = ++workSeq; const dir = `/tmp/r${id}`;
  const cl = await sh(`rm -rf ${dir} && git clone --depth 1 https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
  if (cl.code !== 0) { await postAs(client, channel, thread_ts, reporter, `${repo} 레포를 못 찾았어요ㅠ (이름 확인 필요)\n${(cl.err || '').slice(0, 200)}`); return; }
  const res = await runClaude(`이 저장소를 실제로 열어보고, 사용자의 요청 "${task}"에 직접 답해라. 단순 현황 나열이 아니라, 레포에서 확인한 사실을 근거로 실제 답·제안·전략을 내라. 코드는 읽기만 해. 레포에 없는 시장·경쟁사·트렌드·벤치마크는 웹서치(WebSearch)로 찾아서 근거로 써도 돼. 모르는 건 추측이라 표시.\n\n역할별로 각자 그 요청에 대한 자기 분야의 답/제안을 줘. 각 줄 "역할: 답/제안" 형식(관련된 역할만, PM/리서처/UX/아키텍트/보안/마케터). 질문 분야의 담당이 메인으로 구체적인 안을 내고(예: 마케팅 질문이면 마케터가 채널·메시지·실행안까지), 나머지는 거들어. 한 역할당 2~4줄.${PLAIN}`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000);
  const n = await distributeReport(client, channel, thread_ts, res.text);
  if (!n) await postAs(client, channel, thread_ts, reporter, (res.text || '(내용 없음)').trim().slice(0, 3000));
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
    const reporter = ALL.find(p => p.name === s.reporter) || LEAD;
    if (s.action === 'work' && s.task) await runWork(botClient, s.channel, undefined, s.newProject ? WORK_DEFAULT_REPO : resolveRepo(s.repo), s.task, !!s.newProject, true);
    else await runReport(botClient, s.channel, undefined, reporter, resolveRepo(s.repo), s.task || s.label);
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
function addRule(channel, text) { (rules[channel] = rules[channel] || []).push(text); if (rules[channel].length > 30) rules[channel] = rules[channel].slice(-30); persistRules(); }
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

// 채널이 마지막으로 다룬 레포 (재배포에도 살아남게 영구저장 → "어느 레포?" 무한반복 방지)
const LASTREPO_FILE = process.env.LASTREPO_FILE || '/data/lastrepo.json';
function loadLastRepo() { try { if (fs.existsSync(LASTREPO_FILE)) Object.assign(lastRepo, JSON.parse(fs.readFileSync(LASTREPO_FILE, 'utf8')) || {}); } catch {} }
function persistLastRepo() { try { fs.writeFileSync(LASTREPO_FILE, JSON.stringify(lastRepo)); } catch {} }

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
  const sre = byName('우정잉') || LEAD;
  const list = svcList(channel).filter(s => s.url);
  if (!list.length) { if (announce && !onlyAlert) await postAs(client, channel, undefined, sre, '아직 등록된 라이브 서비스가 없어. 뭐 하나 만들어서 배포되면 여기 대장에 올라가.'); return; }
  const lines = [];
  for (const s of list) {
    const r = await sh(`curl -s -o /dev/null -w "%{http_code} %{time_total}s" --max-time 15 ${s.url} 2>/dev/null || echo "000"`);
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
  if (/앱|android|ios|안드로이드|아이폰|모바일 ?앱|store/i.test(t)) todo.push('앱스토어·플레이스토어 제출 (개발자 계정 + 심사, 이건 너만 가능)');
  todo.push('법무페이지에 실제 연락처·사업자 정보 채우기 (지금 TODO로 비워뒀어)');
  todo.push('마케팅 채널 계정 (X·블로그·메일로 실제 발행하려면 그 계정/키)');
  const fmt = (arr, mark) => arr.map(x => `${mark} ${x}`).join('\n');
  await postAs(client, channel, thread_ts, LEAD, `자 정리할게. 우리가 할 수 있는 건 다 했고, 너만 할 수 있는 것만 추렸어.\n\n[우리가 끝낸 거]\n${fmt(done, '✅')}\n\n[너가 해줘야 진짜 상용 오픈 가능 — 체크리스트]\n${fmt(todo, '☐')}\n\n이 중에 내가 대신 할 수 있는 건(도메인 연결, 마케팅 자료, 통계 코드 심기 등) 말만 해주면 또 해줄게. 계정·결제·스토어 제출처럼 너만 되는 건 끝나면 알려줘, 그담 단계 이어갈게.`);
}

async function handle(event, client) {
  if (!event || !event.ts) return;
  if (event.subtype || event.bot_id) return;          // 사람 메시지만 (봇/시스템/수정 무시 → 무한루프 방지)
  if (seen.has(event.ts)) return;                      // message·app_mention 중복 방지
  seen.add(event.ts); if (seen.size > 800) seen.clear();
  if (ALLOWED.length && !ALLOWED.includes(event.user)) return;
  const channel = event.channel;
  const raw = (event.text || '').replace(/<@[^>]+>/g, '').trim();
  if (!raw) return;
  recordMsg(channel, '사용자', raw);
  ensureMembers(channel).catch(() => {});
  const thread_ts = event.thread_ts;
  try {
    // 중단/취소 — 작업 트리거 금지 + 진행 중이면 push 전에 중단
    if (/하지\s?마|하지말|그만|중단|멈춰|스톱|stop|아니\s?야|취소해|관둬/i.test(raw)) {
      workCancel[channel] = true;
      await postAs(client, channel, thread_ts, LEAD, '오케이 멈출게. 진행 중이던 거 있으면 main엔 안 올리고 중단할게.');
      return;
    }
    // 규칙 관리
    if (/규칙\s*(목록|보여)/.test(raw)) {
      const r = rules[channel] || [];
      await postAs(client, channel, thread_ts, LEAD, r.length ? '우리 팀 규칙:\n' + r.map((x, i) => `${i + 1}. ${x}`).join('\n') : '아직 정한 규칙이 없어요.');
      return;
    }
    if (/규칙\s*(초기화|전체삭제|리셋)/.test(raw)) { rules[channel] = []; persistRules(); await postAs(client, channel, thread_ts, LEAD, '규칙 다 지웠어요.'); return; }
    // "앞으로 ~ 해라 / 항상 / 규칙 / 기억해" → 영구 규칙으로 저장하고 그렇게 일함
    if (/(앞으로|항상|규칙으로|규칙은|기억해|명심)/.test(raw)) {
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
    if ((tm = raw.match(/^태스크\s*완료\s*(\d+)/))) { const t = (tasks[channel] || []).find(x => x.id === parseInt(tm[1])); if (t) { t.done = true; persistTasks(); await postAs(client, channel, thread_ts, LEAD, `#${tm[1]} 완료 처리했어.`); } else await postAs(client, channel, thread_ts, LEAD, '그 태스크 못 찾겠어.'); return; }
    if ((tm = raw.match(/^태스크\s*삭제\s*(\d+)/))) { tasks[channel] = (tasks[channel] || []).filter(x => x.id !== parseInt(tm[1])); persistTasks(); await postAs(client, channel, thread_ts, LEAD, `#${tm[1]} 삭제했어.`); return; }
    // 배포 (아직 미연동)
    if (/배포\s*(해|하자|해줘|좀|시작|go)/i.test(raw)) { await postAs(client, channel, thread_ts, LEAD, '이제 신규 빌드는 통과하면 자동으로 라이브(Railway)까지 올라가. 특정 레포를 다시 띄우고 싶으면 "(레포이름) 다시 배포해줘"처럼 말해줘.'); return; }
    const wm = raw.match(/^(작업|구현|개발|제작)\s*[:：]\s*([\s\S]*)$/);
    if (wm && wm[2].trim()) {
      let rest = wm[2].trim(); let repo = WORK_DEFAULT_REPO;
      const rr = rest.match(/^([\w.-]+\/[\w.-]+)\s+([\s\S]+)$/);
      if (rr) { repo = rr[1]; rest = rr[2]; }
      const newProject = !rr && /(포트폴리오|portfolio|홈페이지|랜딩|사이트|새\s*프로젝트|처음부터|new\s*project)/i.test(rest);
      activeWork[channel] = { task: rest, started: Date.now() };
      runWork(client, channel, event.thread_ts || event.ts, repo, rest, newProject, !!settings.approval[channel]).catch(e => postAs(client, channel, thread_ts, LEAD, '작업 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
      return;
    }
    const m = raw.match(/^(기획|토론|회의)\s*[:：]\s*([\s\S]*)$/);
    if (m && m[2].trim()) {
      activeWork[channel] = { task: m[2].trim(), started: Date.now() };
      runDebate(client, channel, event.thread_ts || event.ts, m[2].trim(), null).catch(() => {}).finally(() => { activeWork[channel] = null; });
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
    if (/(헬스\s?체크|운영\s?점검|상태\s?점검|서비스.*점검|모니터링)/.test(raw)) {
      await postAs(client, channel, thread_ts, byName('우정잉') || LEAD, '지금 바로 다 돌려서 살아있는지 확인할게.');
      checkServices(client, channel).catch(e => postAs(client, channel, thread_ts, LEAD, '점검 오류: ' + String(e).slice(0, 200)));
      return;
    }
    // 사용량/번레이트 (오늘 Claude 호출·토큰·한도걸림)
    if (/(사용량|번레이트|토큰.*얼마|클로드.*사용|usage)/.test(raw)) {
      await postAs(client, channel, thread_ts, LEAD, `오늘 우리 사용량이야.\n호출 ${usageStat.calls}회 · 출력토큰 약 ${usageStat.outTokens.toLocaleString()} · 한도걸림 ${usageStat.limitedHits}번.${usageStat.limitedHits ? ' 한도 자주 걸리면 팀원 모델 sonnet 유지하거나 작업 텀을 두자.' : ''}`);
      return;
    }
    // 서비스 재시작 (라이브가 맛이 갔을 때)
    if (/재시작|리스타트|restart/i.test(raw)) {
      const win = byName('윈터') || LEAD;
      if (!process.env.RAILWAY_API_TOKEN) { await postAs(client, channel, thread_ts, win, '재시작은 RAILWAY_API_TOKEN 있어야 돼.'); return; }
      const match = svcList().find(s => raw.includes(s.repo.split('/').pop()));
      const target = (match && match.repo) || lastRepo[channel];
      if (!target) { await postAs(client, channel, thread_ts, win, '어느 서비스 재시작할지 알려줘 (레포 이름).'); return; }
      const svc = (target.split('/').pop() || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28);
      await postAs(client, channel, thread_ts, win, `${svc} 재시작할게.`);
      (async () => {
        const link = process.env.BUILDS_PROJECT_ID ? `RAILWAY_TOKEN= railway link --project ${process.env.BUILDS_PROJECT_ID} --environment ${process.env.BUILDS_ENV || 'production'} >/dev/null 2>&1; ` : '';
        const r = await sh(`${link}RAILWAY_TOKEN= railway restart --service ${svc} 2>&1`, '/tmp');
        await postAs(client, channel, thread_ts, win, r.code === 0 ? '재시작 보냈어. 곧 다시 뜰 거야.' : '재시작이 막혔어:\n' + ((r.out || r.err) || '').slice(-300));
      })();
      return;
    }
    // 마케팅 산출물 — 영듀가 MARKETING.md + 메타 보강
    if (/마케팅.*(자료|전략|준비|플랜|해줘|만들|돌려)/.test(raw)) {
      const mrepo = lastRepo[channel];
      if (!mrepo) { await postAs(client, channel, thread_ts, byName('영듀') || LEAD, '어느 서비스 마케팅 할지 모르겠어. 먼저 만든 거 있어야 그거 마케팅하지. 레포 이름 알려주거나 뭐 하나 만들고 말해줘.'); return; }
      await postAs(client, channel, thread_ts, byName('영듀') || LEAD, `${mrepo} 마케팅 자료 만들게. 포지셔닝부터 런칭 카피까지 정리해서 레포에 넣을게.`);
      activeWork[channel] = { task: '마케팅 자료', started: Date.now() };
      runWork(client, channel, event.thread_ts || event.ts, mrepo, '이 서비스 마케팅 자료를 만들어라. 포지셔닝, 타겟과 사용맥락, 핵심 한 줄 메시지, 채널별 전략(SEO·콘텐츠·SNS·커뮤니티), 런칭 카피 몇 개, 4주치 콘텐츠 캘린더, 핵심 SEO 키워드까지 MARKETING.md로 저장해. 그리고 사이트의 title/description/OG 메타태그도 더 매력적으로 다듬어라. 마케팅 담당이 메인으로.', false, !!settings.approval[channel]).catch(e => postAs(client, channel, thread_ts, LEAD, '마케팅 작업 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
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
      await postAs(client, channel, thread_ts, LEAD, list.length ? '등록된 스케줄:\n' + list.map(s => `#${s.id} · ${s.kind === 'daily' ? `매일 ${s.hour}시${s.minute ? ' ' + s.minute + '분' : ''}` : humanMs(s.ms)} · ${s.label}`).join('\n') : '등록된 스케줄이 없어요.');
      return;
    }
    let cm;
    if ((cm = raw.match(/스케줄.*취소\s*(전체|모두|all|\d+)/))) {
      const which = cm[1];
      if (/전체|모두|all/.test(which)) { schedules.forEach(s => clearInterval(s.timer)); schedules.length = 0; await postAs(client, channel, thread_ts, LEAD, '스케줄 전체 취소했어요.'); }
      else { const idx = schedules.findIndex(s => s.id === parseInt(which)); if (idx >= 0) { clearInterval(schedules[idx].timer); schedules.splice(idx, 1); await postAs(client, channel, thread_ts, LEAD, `스케줄 #${which} 취소했어요.`); } else await postAs(client, channel, thread_ts, LEAD, `#${which} 스케줄을 못 찾았어요.`); }
      persistSchedules();
      return;
    }
    // 주기 스케줄 등록 (간격 또는 매일 특정시각)
    const daily = parseDaily(raw);
    const ims = daily ? null : parseIntervalMs(raw);
    if (daily || (ims && /(마다|매일|매주|매시간|주기)/.test(raw))) {
      const taskText = raw.replace(/(\d+\s*(초|분|시간|일|주)\s*마다|매일|매주|매시간|주기적으로|주기별로|(오전|아침|오후|저녁|밤)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/g, '').replace(/\s+/g, ' ').trim();
      const it = await classifyIntent(taskText || raw);
      const id = ++schedSeq;
      const reporter = (pickPersona(raw) || LEAD).name;
      const base = { id, channel, label: taskText || raw, action: it.action, task: it.task, repo: it.repo, newProject: !!it.newProject, reporter };
      const s = daily ? { ...base, kind: 'daily', hour: daily.hour, minute: daily.minute } : { ...base, kind: 'interval', ms: ims };
      startSchedule(s, !daily);
      persistSchedules();
      const when = daily ? `매일 ${daily.hour}시${daily.minute ? ' ' + daily.minute + '분' : ''} (KST)` : humanMs(ims);
      await postAs(client, channel, thread_ts, LEAD, `⏰ 스케줄 등록했어요 (#${id})\n주기: ${when}\n내용: ${s.label}\n${daily ? '예약 시각에' : '지금 한 번 돌려보고 이후'} 자동 실행할게요. 재시작해도 유지돼요. (취소: "스케줄 취소 ${id}")`);
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
    const resolveR = (r) => r === '__last__' ? lastRepo[channel] : resolveRepo(r);
    // 새로 만들/개발하라는 신호가 있으면 lastRepo로 끌고가지 말고 무조건 새 프로젝트로 (직전 레포 오염 방지)
    if (intent && intent.action === 'work' && /\b만들|만들어|만들고|제작|개발|새로 ?만|하나 ?만들|새 게임|새 앱|새 사이트|새 서비스|오마주|클론(?!해)/.test(raw)) { intent.newProject = true; intent.repo = 'new'; }
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
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runWork(client, channel, event.thread_ts || event.ts, repo, intent.task, newProject, !!settings.approval[channel], intent.name).catch(e => postAs(client, channel, thread_ts, LEAD, '작업 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
      return;
    }
    if (intent && intent.action === 'report' && intent.task) {
      const reporter = pickPersona(event.text || '') || LEAD;
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runReport(client, channel, event.thread_ts || event.ts, reporter, resolveR(intent.repo), intent.task).catch(e => postAs(client, channel, thread_ts, LEAD, '조사 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
      return;
    }
    if (intent && intent.action === 'debate' && intent.task) {
      const drepo = (intent.repo && intent.repo !== 'new') ? resolveR(intent.repo) : null;
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runDebate(client, channel, event.thread_ts || event.ts, intent.task, drepo).catch(e => postAs(client, channel, thread_ts, LEAD, '토론 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
      return;
    }
    const targeted = pickPersona(event.text || '');
    if (targeted) {
      const res = await runClaude(`${targeted.prompt}${STYLE}${SELF}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락을 보고 너답게 대답해. 백그라운드 작업 진행상황은 [작업 상태]에 있는 사실만 말하고, 진행률이나 완료를 절대 지어내지 마.`, targeted.model);
      await postAs(client, channel, thread_ts, targeted, (res.text || '').trim().slice(0, 3000));
    } else {
      // 아무도 안 부른 일반 메시지 → 랜덤하게 1~3명이 답장 + 일부 이모지
      const responders = pickRandom(ALL, 1 + Math.floor(Math.random() * 3));
      for (const p of responders) {
        const r2 = await runClaude(`${p.prompt}${STYLE}${SELF}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락 보고 너답게 짧게 한마디 해. 작업 진행상황은 [작업 상태] 사실만 말하고 지어내지 마.`, p.model);
        await postAs(client, channel, thread_ts, p, (r2.text || '').trim().slice(0, 1500));
        if (r2.limited) break; // 사용량 한도면 1명만 알리고 도배 방지
      }
      casualLayer(event, client, responders, { noComment: true }).catch(() => {});
    }

  } catch (e) {
    await postAs(client, channel, thread_ts, LEAD, '⚠️ 오류: ' + String(e).slice(0, 400));
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
  loadTasks();
  loadLastRepo();
  loadServices();
  setInterval(persistMemory, 15000);
  let opsLastDay = null;
  const OPS_HOUR = parseInt(process.env.OPS_HOUR || '10', 10); // 매일 이 시각(KST)에 운영 헬스체크 자동
  setInterval(() => {
    const n = kstNow();
    for (const s of schedules) {
      if (s.kind === 'daily' && s.hour === n.h && s.minute === n.m && s.lastRunDay !== n.day) {
        s.lastRunDay = n.day; persistSchedules(); jobFor(s)().catch(() => {});
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
