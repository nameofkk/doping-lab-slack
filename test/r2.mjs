// R2 스톨/재계획 로직 — 패스별 갭 시퀀스로 stalled 판정·완료·재계획 트리거 검증 (index.js 루프와 동일)
function sim(gapSeq) {
  let prevGapCount = Infinity; const out = [];
  for (let pass = 1; pass <= 4; pass++) {
    const gaps = gapSeq[pass - 1]; if (gaps === undefined) break;
    if (gaps.length === 0) { out.push('p' + pass + ':완료'); break; }
    const stalled = gaps.length && gaps.length >= prevGapCount;
    prevGapCount = gaps.length;
    out.push('p' + pass + ':갭' + gaps.length + (stalled ? '↻재계획' : ''));
  }
  return out.join(' ');
}
const g = n => Array(n).fill('x');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
ok(sim([g(3), g(1), g(0)]) === 'p1:갭3 p2:갭1 p3:완료', '진척정상: 재계획 없이 완료 [' + sim([g(3), g(1), g(0)]) + ']');
ok(sim([g(3), g(3), g(2), g(0)]) === 'p1:갭3 p2:갭3↻재계획 p3:갭2 p4:완료', '스톨 후 재계획→진척→완료 [' + sim([g(3), g(3), g(2), g(0)]) + ']');
ok(sim([g(2), g(2), g(2), g(2)]) === 'p1:갭2 p2:갭2↻재계획 p3:갭2↻재계획 p4:갭2↻재계획', '계속막힘: 매번 재계획 시도 [' + sim([g(2), g(2), g(2), g(2)]) + ']');
ok(sim([g(0)]) === 'p1:완료', '첫패스부터 완성');
ok(sim([g(1), g(3)]) === 'p1:갭1 p2:갭3↻재계획', '악화도 스톨로 감지(재계획)');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
