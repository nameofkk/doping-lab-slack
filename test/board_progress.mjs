// D4 책임·진척 보드 — 상태 판정(progressBoard) 로직 복제 테스트
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
function daysBetweenDay(a, b) { const p = d => new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100); return Math.round((p(b) - p(a)) / 86400000); }
const today = 20260620;
function stateOf(e) {
  const age = Math.max(0, daysBetweenDay(e.startDay || today, today));
  if (e.status === 'proposed') return { state: 'proposed', age };
  if (e.status === 'measured' || (e.pct != null && e.pct >= 10)) return { state: 'hit', age };
  if (e.pct != null && e.pct <= -10) return { state: 'bad', age };
  if (age >= 14) return { state: 'stale', age };
  return { state: 'progress', age };
}
ok(stateOf({ status: 'proposed', startDay: 20260619 }).state === 'proposed', '발의 상태');
ok(stateOf({ status: 'executing', pct: 25, startDay: 20260618 }).state === 'hit', '효과 25% → 적중');
ok(stateOf({ status: 'measured', startDay: 20260601 }).state === 'hit', 'measured → 적중');
ok(stateOf({ status: 'executing', pct: -15, startDay: 20260618 }).state === 'bad', '-15% → 역효과');
ok(stateOf({ status: 'executing', pct: 3, startDay: 20260618 }).state === 'progress', '미미(3%) + 최근 → 진행');
ok(stateOf({ status: 'executing', pct: 2, startDay: 20260601 }).state === 'stale', '효과 미미 + 19일 → 지연(stale)');
ok(stateOf({ status: 'executing', pct: null, startDay: 20260605 }).state === 'stale', '측정 안됨 + 15일 → 지연');
ok(stateOf({ status: 'executing', pct: null, startDay: 20260619 }).age === 1, '나이 계산(1일)');

// archive: measured/bad만 정리, proposed/progress는 유지
function archiveDone(exps) { let n = 0; for (const e of exps) { if (!e.archived && (e.status === 'measured' || (e.pct != null && e.pct <= -10))) { e.archived = true; n++; } } return n; }
const exps = [{ status: 'measured' }, { status: 'executing', pct: -20 }, { status: 'executing', pct: 5 }, { status: 'proposed' }];
ok(archiveDone(exps) === 2, '완료 정리 = measured+역효과 2건');
ok(!exps[2].archived && !exps[3].archived, '진행/발의는 정리 안 함');

console.log(fail ? '\n❌ board_progress 실패 ' + fail : '\n✅ board_progress 전부 통과');
process.exit(fail ? 1 : 0);
