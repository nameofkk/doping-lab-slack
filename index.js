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
  CLAUDE_PERMISSION_MODE = 'default',
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
  { name: '김채원 (PM)', kw: ['김채원','채원','PM'], emoji: ':bust_in_silhouette:', model: 'opus', tokenEnv: 'SLACK_TOKEN_PM',
    prompt: '너는 도핑연구소 PM이고 이름은 김채원이다. 밝고 야무지게 팀을 이끄는 리더야. 핵심을 똑부러지게 짚고 우선순위를 정해. 사용자 가치랑 시장성, 전용목적 위주로 본다.' },
  { name: '아이유 (리서처)', kw: ['아이유', '이유', '리서처', '리서치'], emoji: ':mag:', model: 'opus', tokenEnv: 'SLACK_TOKEN_RESEARCH',
    prompt: '너는 도핑연구소 사용자 리서처이고 이름은 아이유다. 차분하고 사려깊게 사람 마음과 진짜 니즈를 섬세하게 읽는다. 페인포인트·사용성 리스크를 따뜻하지만 정확하게 짚는다.' },
  { name: '정소민 (UX)', kw: ['정소민','소민','UX','디자이너','디자인'], emoji: ':art:', model: 'opus', tokenEnv: 'SLACK_TOKEN_UX',
    prompt: '너는 도핑연구소 UX·비주얼 디자이너이고 이름은 정소민이다. 친근하고 공감 가는 말투로 사용자 흐름·마찰·엣지케이스(빈상태/에러/로딩)를 챙긴다. 디자인은 항상 impeccable.style 기준(AI slop 금지: 이모지 아이콘·gradient hero·nested cards 금지, 대비 4.5:1+, 한국어 UI, 빈상태 캐릭터)과 그 프로젝트 design-system(MASTER.md)을 따른다.' },
  { name: '윈터 (아키텍트)', kw: ['윈터', '아키텍트', '아키'], emoji: ':building_construction:', model: 'opus', tokenEnv: 'SLACK_TOKEN_ARCHITECT',
    prompt: '너는 도핑연구소 아키텍트이고 이름은 윈터다. 시크하고 군더더기 없이 구조·실현가능성·기술/배포 리스크를 깔끔하게 정리한다.' },
  { name: '우정잉 (보안)', kw: ['우정잉', '정잉', '보안'], emoji: ':lock:', model: 'opus', tokenEnv: 'SLACK_TOKEN_SECURITY',
    prompt: '너는 도핑연구소 보안 엔지니어이고 이름은 우정잉이다. 꼼꼼하고 의심 많게 인증·권한·시크릿·개인정보·규제 리스크를 파고들고 완화책을 댄다.' },
  { name: '영듀 (마케터)', kw: ['영듀', '마케터', '마케팅'], emoji: ':mega:', model: 'opus', tokenEnv: 'SLACK_TOKEN_MARKETING',
    prompt: '너는 도핑연구소 마케터이고 이름은 영듀다. 텐션 높고 유쾌하게 바이럴·차별점·타깃·GTM을 재밌게 풀어낸다.' },
  { name: '안다연 (반론자)', kw: ['안다연','다연'], emoji: ':smiling_imp:', model: 'opus', tokenEnv: 'SLACK_TOKEN_DEVIL',
    prompt: '너는 도핑연구소의 악마의 변호인이고 이름은 안다연이다. 기획의 약점을 날카롭게 파고들어 반대 의견과 리스크를 짚고, 각 약점에 보완책도 함께 제시한다.' },
];
const LEAD = { name: '한로로 (팀장)', kw: ['한로로','로로','팀장'], emoji: ':test_tube:', model: 'opus', tokenEnv: 'SLACK_TOKEN_LEAD',
  prompt: '너는 도핑연구소 팀장이고 이름은 한로로다(최상위 모델). 진솔하고 본질을 짚는 스타일로 팀을 이끈다. 질문엔 직접 답하고, 기획 토론을 종합할 땐 목적·핵심기능·리스크 대응·다음 액션으로 정리한다.' };

// 모든 발언에 적용되는 말투/가독성 규칙
const STYLE = '\n\n[말투 규칙] 실제 한국 여성이 친한 동료랑 메신저로 편하게 수다 떨듯 자연스러운 구어체로 써라. 딱딱한 문어체나 설명조, 번역투 금지. 대시 기호(—, –, ㅡ, -)는 절대 쓰지 마라. 끊고 싶으면 문장을 나누거나 쉼표나 줄바꿈으로 해라. AI 티 나는 말투(도와드릴 수 있어요, ~에 대해 말씀드리면, 불필요한 사과나 안내) 금지. 마크다운 볼드 별표(**)나 머리표(#)도 쓰지 마라. 핵심만 2~4문장으로 짧고 친근하게, 읽기 쉽게.';
// 작업/조사 보고용 — 마크다운 금지 + 사람 말투 (길이는 제한 안 함)
const PLAIN = '\n\n[형식·말투 규칙] 마크다운 절대 금지: 별표(**), 샵(#), 표(|), 대시(—,–,ㅡ). 딱딱한 보고체("~다", "~상태다", "~된다", "~음") 쓰지 말고, 친한 동료한테 말하듯 편한 구어체로 써(예: ~야, ~거든, ~더라, ~인데). AI 말투(말씀드리면, ~할 수 있습니다) 금지. 내용은 충분히 쓰되 줄바꿈으로 읽기 쉽게.';
// 디자인 작업 시 항상 적용 — 사용자가 늘 쓰던 디자인 기준(PRD 기반)
const DESIGN_RULE = '\n\n[디자인 규칙 — 항상 적용] UI·화면·프론트·디자인 작업이면 코드 만지기 전에 반드시: (1) 그 프로젝트의 design-system 폴더(MASTER.md, pages/[페이지].md)와 .impeccable.md(있으면)를 먼저 읽고 색·타이포(Pretendard 700/600/500/400)·간격(4px 그리드)·radius(최소 12px)·그림자(claymorphism)를 엄격히 따른다. 페이지별 파일이 MASTER보다 우선. (2) impeccable.style 기준으로 AI slop 안티패턴을 절대 만들지 않는다: 이모지를 아이콘으로 쓰기 금지(Lucide 같은 실제 아이콘 사용), gradient hero 금지, nested cards 금지, 텍스트 대비 4.5:1 이상, 모든 클릭요소에 cursor-pointer, 한국어 UI(브랜드명 제외), 빈 상태 화면엔 캐릭터/안내 꼭, prefers-reduced-motion 존중, 반응형 375/768/1024/1440px. (3) 끝나면 가능하면 Playwright로 스크린샷 찍어 확인.';

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
    child.on('close', code => {
      if (code !== 0) return finish({ ok: false, text: (err || out || 'error').slice(0, 1500) });
      try { const j = JSON.parse(out); finish({ ok: !j.is_error, text: j.result || out }); }
      catch { finish({ ok: true, text: out.slice(0, 1500) }); }
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
async function runWork(client, channel, thread_ts, repo, task, newProject, forcePR) {
  if (!GITHUB_TOKEN) { await postAs(client, channel, thread_ts, LEAD, 'GITHUB_TOKEN이 아직 없어서 작업 모드는 못 돌려요. 토큰만 넣으면 바로 돼요.'); return; }
  const id = ++workSeq;
  workCancel[channel] = false;
  const dir = `/tmp/w${id}`;
  if (newProject) {
    const name = /포트폴리오|portfolio/i.test(task) ? 'doping-portfolio'
      : ((task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)) || `doping-app-${id}`);
    await postAs(client, channel, thread_ts, LEAD, `🆕 새 프로젝트 만들게요: ${name}\n요청: ${task}\nGitHub에 레포 만들고 처음부터 짜볼게요. 좀 걸려요.`);
    const created = await ghPost('/user/repos', { name, private: true, auto_init: true, description: '도핑연구소 자동 생성' });
    if (!created || !created.full_name) { await postAs(client, channel, thread_ts, LEAD, '레포 생성 실패ㅠ (같은 이름이 이미 있을 수도)\n' + JSON.stringify(created || {}).slice(0, 250)); return; }
    repo = created.full_name;
  } else {
    await postAs(client, channel, thread_ts, LEAD, `🛠️ 작업 받았어요\n레포: ${repo}\n할 일: ${task}\n클론하고 코드 손본 다음 ${WORK_BASE}에 바로 반영할게요. 좀 걸려요.`);
  }
  lastRepo[channel] = repo; // 채널이 방금 다룬 레포 기억 (후속 "이거 고쳐줘" 문맥용)
  const cl = await sh(`rm -rf ${dir} && git clone https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git ${dir} && chmod -R 777 ${dir}`);
  if (cl.code !== 0) { await postAs(client, channel, thread_ts, LEAD, '클론 실패ㅠ\n' + (cl.err || '').slice(0, 600)); return; }
  await sh(`git config user.name "doping-lab[bot]" && git config user.email "bot@doping.lab"`, dir);
  const intro = newProject
    ? '이 빈 저장소에 다음 요청대로 프로젝트를 처음부터 만들어라. 적절한 기술스택을 직접 고르고 실행 가능한 형태로, README도 작성해라.'
    : '이 저장소에서 다음 작업을 실제로 수행해라. 파일을 직접 수정하고, 필요하면 의존성 설치하고 테스트까지 돌려서 동작을 확인해라.';
  const res = await runClaude(`${intro}${rulesCtx(channel)}${PLAIN}${DESIGN_RULE}\n\n요청: ${task}\n\n끝나면 한 일을 담당 역할별로 나눠서 보고해라. 각 줄을 "역할: 한 일" 형식으로 써(역할은 PM/리서처/UX/아키텍트/보안/마케터 중 관련된 것만). 예:\n아키텍트: build.gradle 서명설정 추가\n보안: 미사용 권한 제거, proguard 규칙 작성\n한 역할당 1~2줄, 실제 한 일만.`, 'sonnet', dir, WORK_PERMISSION_MODE, 540000);
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
      await postAs(client, channel, thread_ts, LEAD, `✅ 다 끝냈어! ${repoUrl} (${WORK_BASE}에 반영)`);
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
  await postAs(client, channel, thread_ts, LEAD, `✅ 다 끝냈어! ${forcePR ? '승인모드라 PR로 올렸어 (머지하면 반영).' : 'PR로 올렸어.'}\nPR: ${url}`);
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
    const res = await runClaude(`${ctx ? '[최근 대화]\n' + ctx + '\n\n' : ''}다음 메시지의 의도를 판단해서 JSON만 출력해라. 설명 금지.\n메시지: ${JSON.stringify(text)}\n\n형식: {"action": "work"|"report"|"debate"|"chat", "task": "할 일/주제/볼 것을 한 문장", "newProject": true|false, "repo": "sponono|wewantpeace|myungjak|new 중 해당"}\n기준: 코드를 만들/고치/추가/개선/구현하라면 action=work. 프로젝트의 현황·상태·운영·구조를 조사·보고하라면 action=report. "토론하자/논의하자/토론해줘"처럼 새로운 주제로 팀 토론을 새로 시작하라고 할 때만 action=debate(task=토론 주제). 단 "다른 의견은?", "더 말해봐", "넌 어때", "다른사람들은?" 같은 진행 중 대화의 추가 질문이나 안부·잡담·단순 질문은 action=chat. 새 홈페이지/사이트/포트폴리오/앱이면 newProject=true 이고 repo=new. 위원트피스=wewantpeace, 스포노노=sponono, 명작=myungjak. 사용자가 말한 프로젝트가 sponono/wewantpeace/myungjak 중 어느 것도 아니거나 어느 프로젝트인지 불명확하면 repo는 반드시 "unknown"으로 해. 절대 가까운 걸로 추측해서 고르지 마. 이 슬랙 봇(도핑연구소 봇/너희들 자체)을 고치라면 repo="bot".`, 'haiku');
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
    if (/배포\s*(해|하자|해줘|좀|시작|go)/i.test(raw)) { await postAs(client, channel, thread_ts, LEAD, '배포 연동은 아직이야. Railway 배포 토큰을 연결하면 "배포해줘"로 실제 배포까지 되게 해줄게. 지금은 작업/조사/토론/스케줄/태스크까지 돼.'); return; }
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
    const intent = await classifyIntent(raw, ctx);
    if (['work', 'report', 'debate'].includes(intent && intent.action) && !canCommand(event.user)) {
      await postAs(client, channel, thread_ts, LEAD, '그건 지정된 사람만 시킬 수 있어. ("권한 나만"으로 잠그거나 "권한 모두"로 풀 수 있어)');
      return;
    }
    const resolveR = (r) => r === '__last__' ? lastRepo[channel] : resolveRepo(r);
    if (['work', 'report', 'debate'].includes(intent && intent.action) && intent.repo === 'unknown') {
      // 방금 다룬 레포가 있고 후속/지시대명사성 메시지면 그 레포로 이어감 (추측이 아니라 직전 문맥)
      const followup = /이거|이것|그거|그것|저거|위에|방금|아까|좀전|실패|에러|error|오류|안돼|안 ?되|고쳐|해결|다시|계속|이어/i.test(raw);
      if (followup && lastRepo[channel]) { intent.repo = '__last__'; intent.newProject = false; }
      else {
        await postAs(client, channel, thread_ts, LEAD, '어느 프로젝트(레포)를 말하는 거야? sponono, wewantpeace, myungjak 중에 있어, 아니면 정확한 레포 이름 알려줘. 모르는 채로는 엉뚱한 데 손대거나 헛소리해서 안 할게.');
        return;
      }
    }
    if (intent && intent.action === 'work' && intent.task) {
      const newProject = !!intent.newProject;
      const repo = newProject ? WORK_DEFAULT_REPO : resolveR(intent.repo);
      activeWork[channel] = { task: intent.task, started: Date.now() };
      runWork(client, channel, event.thread_ts || event.ts, repo, intent.task, newProject, !!settings.approval[channel]).catch(e => postAs(client, channel, thread_ts, LEAD, '작업 오류: ' + String(e).slice(0, 300))).finally(() => { activeWork[channel] = null; });
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
      const res = await runClaude(`${targeted.prompt}${STYLE}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락을 보고 너답게 대답해. 백그라운드 작업 진행상황은 [작업 상태]에 있는 사실만 말하고, 진행률이나 완료를 절대 지어내지 마.`, targeted.model);
      await postAs(client, channel, thread_ts, targeted, (res.text || '').trim().slice(0, 3000));
    } else {
      // 아무도 안 부른 일반 메시지 → 랜덤하게 1~3명이 답장 + 일부 이모지
      const responders = pickRandom(ALL, 1 + Math.floor(Math.random() * 3));
      for (const p of responders) {
        const r2 = await runClaude(`${p.prompt}${STYLE}${rulesCtx(channel)}${workStatusCtx(channel)}\n\n[최근 대화]\n${ctx}\n\n[방금 들은 말]\n${raw}\n\n위 맥락 보고 너답게 짧게 한마디 해. 작업 진행상황은 [작업 상태] 사실만 말하고 지어내지 마.`, p.model);
        await postAs(client, channel, thread_ts, p, (r2.text || '').trim().slice(0, 1500));
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
  setInterval(persistMemory, 15000);
  setInterval(() => {
    const n = kstNow();
    for (const s of schedules) {
      if (s.kind === 'daily' && s.hour === n.h && s.minute === n.m && s.lastRunDay !== n.day) {
        s.lastRunDay = n.day; persistSchedules(); jobFor(s)().catch(() => {});
      }
    }
  }, 60000);
  const real = TEAM.concat(LEAD).filter(p => process.env[p.tokenEnv]).map(p => p.name);
  console.log(`⚡ 도핑연구소 봇 실행 — 채널 글에 바로 응답 + 이름 부르면 그 직원이 답함\n   별도멤버: ${real.length ? real.join(', ') : '없음'}\n   ROUNDS=${ROUNDS}`);
})();
