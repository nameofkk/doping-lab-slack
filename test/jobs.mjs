// R1 작업보드 실테스트 — 라이프사이클·재시작·캡·명령정규식·파일 라운드트립
import fs from 'fs';
let jobs = {}, jobSeq = 0;
const FILE = '/tmp/jobs_test.json';
function persistJobs() { try { const ids = Object.keys(jobs).map(Number).sort((a, b) => a - b); if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete jobs[id]; fs.writeFileSync(FILE, JSON.stringify({ seq: jobSeq, items: jobs })); } catch {} }
function loadJobs() { try { if (fs.existsSync(FILE)) { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); jobs = d.items || {}; jobSeq = d.seq || 0; } } catch { jobs = {}; } for (const id of Object.keys(jobs)) { const j = jobs[id]; if (['planning', 'running'].includes(j.status)) { j.status = 'interrupted'; } } persistJobs(); }
function createJob(channel, type, title, repo, by) { const id = ++jobSeq; jobs[id] = { id, channel, type, title: String(title || '').slice(0, 120), repo: repo || null, status: 'running', by, createdAt: 1000, updatedAt: 1000, artifacts: [] }; persistJobs(); return jobs[id]; }
function jobUpdateById(id, patch) { const j = jobs[id]; if (!j) return; Object.assign(j, patch, { updatedAt: (j.createdAt || 0) + 60000 }); persistJobs(); }

let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 라이프사이클
const j = createJob('C1', 'build', 'x'.repeat(200), 'nameofkk/swf', 'U1');
ok(j.status === 'running', '생성 시 running');
ok(j.title.length === 120, 'title 120 캡');
jobUpdateById(j.id, { status: 'awaiting-approval', artifacts: ['pr'] });
ok(jobs[j.id].status === 'awaiting-approval' && jobs[j.id].updatedAt > jobs[j.id].createdAt, '상태갱신+updatedAt');

// 2) 200 캡
jobs = {}; jobSeq = 0; for (let i = 0; i < 230; i++) createJob('C1', 'work', 't' + i);
ok(Object.keys(jobs).length === 200, '200개 캡 (현재 ' + Object.keys(jobs).length + ')');
ok(!jobs[1] && jobs[230], '오래된 것부터 삭제');

// 3) 파일 라운드트립 + 재시작 interrupt
jobs = {}; jobSeq = 0; createJob('C1', 'work', 'running-job'); jobUpdateById(1, { status: 'running' });
const j2 = createJob('C1', 'build', 'pr-job'); jobUpdateById(j2.id, { status: 'awaiting-approval' });
const j3 = createJob('C1', 'report', 'done-job'); jobUpdateById(j3.id, { status: 'done' });
jobs = {}; jobSeq = 0; loadJobs(); // 재시작 시뮬
ok(jobs[1].status === 'interrupted', '재시작: running→interrupted');
ok(jobs[2].status === 'awaiting-approval', '재시작: awaiting-approval 유지(PR대기)');
ok(jobs[3].status === 'done', '재시작: done 유지');

// 4) "작업현황" 명령 정규식 (실제 index.js 그대로)
const cmd = raw => (/^(작업\s*현황|진행\s*상황|작업\s*보드|작업\s*목록|작업\s*리스트|jobs?|지금\s*뭐\s*(하|돌)|뭐\s*(하는\s*중|돌아가))/i.test(raw) || /^(작업|진행)\s*(어때|있어|중이야)/.test(raw)) && !/(만들|짜줘|짜봐|추가|구현|개발|보고서|작성)/.test(raw);
console.log('--- 명령 매칭(되어야) ---');
for (const t of ['작업현황', '진행상황', '작업 보드', 'jobs', '작업 목록', '작업 어때', '진행 어때']) ok(cmd(t), 'MATCH: ' + t);
console.log('--- 오발동(안 돼야) ---');
for (const t of ['뭐 하는 게 좋을까', '뭐 만들까', '현황판 만들어줘', '작업 시작해줘', '진행시켜']) ok(!cmd(t), 'NOMATCH: ' + t);

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
fs.rmSync(FILE, { force: true });
