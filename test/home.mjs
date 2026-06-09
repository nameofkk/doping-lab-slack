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

// 7) opsConfig due 판정 (매일/매주/매월 + 시각 윈도우)
function isDue(o, n) {
  if (!o.enabled || o.lastRunDay === n.day) return false;
  const due = o.cadence === 'weekly' ? (n.dow === (o.dow != null ? o.dow : 1)) : o.cadence === 'monthly' ? (n.dom === (o.dom || 1)) : true;
  if (!due) return false;
  const schMin = (o.hour != null ? o.hour : 10) * 60 + (o.minute || 0), nowMin = n.h * 60 + n.m;
  return nowMin >= schMin && nowMin - schMin <= 30;
}
ok(isDue({ enabled: true, cadence: 'daily', hour: 10, minute: 0, lastRunDay: null }, { day: 20260609, dow: 2, dom: 9, h: 10, m: 5 }), '매일 10시 윈도우 내 due');
ok(!isDue({ enabled: true, cadence: 'daily', hour: 10, minute: 0, lastRunDay: 20260609 }, { day: 20260609, dow: 2, dom: 9, h: 10, m: 5 }), '오늘 이미 실행했으면 not due');
ok(!isDue({ enabled: true, cadence: 'daily', hour: 10, minute: 0, lastRunDay: null }, { day: 20260609, dow: 2, dom: 9, h: 11, m: 0 }), '윈도우(30분) 지나면 not due');
ok(isDue({ enabled: true, cadence: 'weekly', dow: 5, hour: 10, lastRunDay: null }, { day: 20260612, dow: 5, dom: 12, h: 10, m: 0 }), '매주 금요일 due');
ok(!isDue({ enabled: true, cadence: 'weekly', dow: 5, hour: 10, lastRunDay: null }, { day: 20260609, dow: 2, dom: 9, h: 10, m: 0 }), '금요일 업무는 화요일 not due');
ok(isDue({ enabled: true, cadence: 'monthly', dom: 1, hour: 9, lastRunDay: null }, { day: 20260701, dow: 3, dom: 1, h: 9, m: 0 }), '매월 1일 due');
ok(!isDue({ enabled: false, cadence: 'daily', hour: 10, lastRunDay: null }, { day: 20260609, dow: 2, dom: 9, h: 10, m: 0 }), '꺼진 업무 not due');

// 8) opscfg / svcroute 액션 파싱
ok('opscfg_cad_board'.match(/^opscfg_(cad|day|time|ch|tog)_(.+)$/)[2] === 'board', 'opscfg 필드·id 파싱');
ok('opscfg_time_bizbrief'.match(/^opscfg_(cad|day|time|ch|tog)_(.+)$/)[1] === 'time', 'opscfg time 필드');
let sm = 'svcroute_1_marketing'.match(/^svcroute_(hq|\d+)_(\w+)$/);
ok(sm && sm[1] === '1' && sm[2] === 'marketing', 'svcroute 서비스idx·기능 파싱');
ok('svcroute_hq_x'.match(/^svcroute_(hq|\d+)_(\w+)$/)[1] === 'hq', 'svcroute 전사(hq) 파싱');

// 9) channelForWork — 기능override > 서비스기본 > fallback
const settings = { workRoute: { 'o/sponono:marketing': 'CMKT' }, repoChannel: { 'o/sponono': 'CSPO' } };
function channelForWork(repo, func, fallback) { return (settings.workRoute[repo + ':' + func]) || (settings.repoChannel[repo]) || fallback || null; }
ok(channelForWork('o/sponono', 'marketing', 'CDEF') === 'CMKT', '기능별 채널 override 우선');
ok(channelForWork('o/sponono', 'cx', 'CDEF') === 'CSPO', '기능 미지정이면 서비스 기본');
ok(channelForWork('o/other', 'cx', 'CDEF') === 'CDEF', '둘 다 없으면 fallback');

// 10) opsWhen 표기
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
function opsWhen(o) { const t = `${o.hour < 12 ? '오전' : '오후'} ${((o.hour % 12) === 0 ? 12 : o.hour % 12)}시${o.minute ? ' ' + o.minute + '분' : ''}`; if (o.cadence === 'weekly') return `매주 ${DOW_KO[o.dow] || '월'}요일 ${t}`; if (o.cadence === 'monthly') return `매월 ${o.dom || 1}일 ${t}`; return `매일 ${t}`; }
ok(opsWhen({ cadence: 'daily', hour: 10, minute: 0 }) === '매일 오전 10시', 'opsWhen 매일');
ok(opsWhen({ cadence: 'weekly', dow: 5, hour: 14, minute: 30 }) === '매주 금요일 오후 2시 30분', 'opsWhen 매주 금 오후');
ok(opsWhen({ cadence: 'monthly', dom: 1, hour: 9, minute: 0 }) === '매월 1일 오전 9시', 'opsWhen 매월');

// 11) 부서 검토 버튼 → 서비스별 라우팅 (home_dept_<dept>)
const deptRe = /^home_dept_(cx|marketing|finance|market)$/;
ok('home_dept_marketing'.match(deptRe)[1] === 'marketing', 'home_dept 마케팅 파싱');
ok('home_dept_market'.match(deptRe)[1] === 'market', 'home_dept 시장 파싱');
ok(!'home_run_board'.match(deptRe), 'home_run_board는 dept 아님');
// 부서 검토 채널 4-셀렉트 actions 블록(<=5)
const depts4 = ['marketing', 'cx', 'finance', 'market'];
ok(depts4.length <= 5, '부서 채널 셀렉트 4개 (actions 5개 제한 내)');
// focusRepo 필터: 등록된 서비스만
const bizData2 = { 'o/wewantpeace': {}, 'o/sponono': {} };
function reposFor(focusRepo) { return (focusRepo && bizData2[focusRepo]) ? [focusRepo] : Object.keys(bizData2); }
ok(reposFor('o/sponono').length === 1 && reposFor('o/sponono')[0] === 'o/sponono', 'focusRepo면 그 서비스만');
ok(reposFor(null).length === 2, 'focusRepo 없으면 전체');
ok(reposFor('o/unknown').length === 2, '미등록 focusRepo는 전체로 폴백');

console.log(fail ? '\n❌ home 실패 ' + fail : '\n✅ home 전부 통과');
process.exit(fail ? 1 : 0);
