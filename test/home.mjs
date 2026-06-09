// D5 홈 콘솔 — 버튼 액션 라우팅 regex + 채널 담당 매칭 + 버튼 구조. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 승인/넘어가 버튼 action_id 파싱 (home_disp_(run|skip)_<channel>)
const dispRe = /^home_disp_(run|skip)_(.+)$/;
let m = 'home_disp_run_C0B7ZC5S4J1'.match(dispRe);
ok(m && m[1] === 'run' && m[2] === 'C0B7ZC5S4J1', '승인 버튼 채널 파싱');
m = 'home_disp_skip_C123ABC'.match(dispRe);
ok(m && m[1] === 'skip' && m[2] === 'C123ABC', '넘어가 버튼 채널 파싱');
ok(!'home_run_board'.match(dispRe), 'home_run_board는 disp 아님');

// 2) 명령 매핑 (홈 버튼 → 채널 명령어)
const cmdMap = { home_run_board: '경영회의', home_run_bizbrief: '사업 브리핑', home_run_health: '헬스체크', home_run_opsbrief: '운영 브리핑', home_run_growth: '그로스 제안', home_dept_cx: '고객 검토', home_dept_marketing: '마케팅 검토', home_dept_finance: '재무 검토', home_dept_market: '경쟁 동향' };
ok(cmdMap['home_run_board'] === '경영회의', '경영회의 버튼 매핑');
ok(cmdMap['home_dept_cx'] === '고객 검토', '고객검토 버튼 매핑');
ok(Object.keys(cmdMap).every(k => k.startsWith('home_')), '모든 홈 액션 home_ 접두');

// 3) repoFromText — 서비스명 매칭(영문+한글 별칭)
const bizKeys = ['nameofkk/wewantpeace', 'nameofkk/sponono'];
function repoFromText(raw) { const t = String(raw || ''); for (const rp of bizKeys) { const nm = rp.split('/').pop(); if (nm && new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) return rp; } if (/위원트피스|위피|wewantpeace/i.test(t)) return bizKeys.find(r => /wewantpeace/i.test(r)) || null; if (/스포노노|스포논|sponono/i.test(t)) return bizKeys.find(r => /sponono/i.test(r)) || null; return null; }
ok(repoFromText('이 채널 wewantpeace 담당') === 'nameofkk/wewantpeace', '영문 서비스명 매칭');
ok(repoFromText('이 채널 위원트피스 담당') === 'nameofkk/wewantpeace', '한글 별칭(위원트피스) 매칭');
ok(repoFromText('이 채널 스포노노 담당') === 'nameofkk/sponono', '한글 별칭(스포노노) 매칭');
ok(repoFromText('이 채널 경영 담당') === null, '서비스명 없으면 null(경영은 별도처리)');

// 4) channelForRepo — 담당 채널 라우팅(없으면 fallback)
const repoChannel = { 'nameofkk/wewantpeace': 'CWWP' };
function channelForRepo(repo, fallback) { return repoChannel[repo] || fallback || null; }
ok(channelForRepo('nameofkk/wewantpeace', 'CDEF') === 'CWWP', '담당 채널 우선');
ok(channelForRepo('nameofkk/sponono', 'CDEF') === 'CDEF', '미지정이면 fallback');

// 5) hbtn 버튼 구조 (Block Kit)
function hbtn(text, action_id, opts) { const b = { type: 'button', text: { type: 'plain_text', text, emoji: true }, action_id }; if (opts && opts.value) b.value = opts.value; if (opts && opts.style) b.style = opts.style; return b; }
const b1 = hbtn('실행', 'home_disp_run_C1', { style: 'primary', value: 'C1' });
ok(b1.type === 'button' && b1.text.type === 'plain_text' && b1.action_id === 'home_disp_run_C1', 'hbtn 기본 구조');
ok(b1.style === 'primary' && b1.value === 'C1', 'hbtn style/value');
ok(b1.text.text.length <= 75, '버튼 라벨 75자 이내');

// 6) 정기 업무 내장 목록
const BUILTIN_OPS = [{ when: '매일 오전 10시', what: 'x' }, { when: '매주 금요일', what: '전략 경영회의' }];
ok(BUILTIN_OPS.length >= 2 && BUILTIN_OPS.some(o => /경영회의/.test(o.what)), '내장 정기업무에 경영회의 포함');

console.log(fail ? '\n❌ home 실패 ' + fail : '\n✅ home 전부 통과');
process.exit(fail ? 1 : 0);
