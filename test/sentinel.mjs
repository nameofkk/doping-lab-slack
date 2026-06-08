// 시스템1(운영 센티넬) 로직 단언 — index.js svcTrend 등 결정론 부분 복제(드리프트 감지).
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// ── index.js와 동일 (복사본) ──
function svcTrend(s) {
  if ((s.failStreak || 0) >= 2) return `⚠️${s.failStreak}연속다운`;
  const ups = (s.history || []).filter(h => h.up && h.ms != null);
  if (ups.length >= 6) {
    const recent = ups.slice(-3), prior = ups.slice(-6, -3);
    const avg = a => Math.round(a.reduce((x, h) => x + h.ms, 0) / a.length);
    const rA = avg(recent), pA = avg(prior);
    if (rA > pA * 1.5 && rA > 800) return `📈지연↑(${pA}→${rA}ms)`;
  }
  return '';
}
const up = ms => ({ up: true, ms, code: '200' });

// 연속 다운
ok(svcTrend({ failStreak: 3, history: [] }).includes('3연속다운'), '연속다운 2회+ → 경고');
ok(svcTrend({ failStreak: 1, history: [] }) === '', '1회 다운은 추세 아님');
// 지연 상승 (이전 ~200ms → 최근 ~1200ms)
ok(svcTrend({ failStreak: 0, history: [up(180), up(200), up(220), up(1100), up(1200), up(1300)] }).includes('지연↑'), '지연 1.5배+ & 800ms+ → 상승 감지');
// 정상(지연 안정)
ok(svcTrend({ failStreak: 0, history: [up(180), up(200), up(220), up(190), up(210), up(205)] }) === '', '안정 지연 → 추세 없음');
// 느리지만 안 오르면(이전도 높음) 경고 안 함
ok(svcTrend({ failStreak: 0, history: [up(1000), up(1000), up(1000), up(1100), up(1050), up(1080)] }) === '', '높지만 안정이면 경고 안함');
// 데이터 부족(6개 미만)
ok(svcTrend({ failStreak: 0, history: [up(200), up(1500)] }) === '', '샘플 부족하면 추세 판정 안함');
// 살짝 오르지만 800ms 미만이면 무시(오탐 방지)
ok(svcTrend({ failStreak: 0, history: [up(100), up(110), up(120), up(300), up(320), up(340)] }) === '', '300ms대는 오탐 안냄(임계 800ms)');

console.log(fail ? '\n❌ 센티넬 실패 ' + fail : '\n✅ 센티넬 전부 통과');
process.exit(fail ? 1 : 0);
