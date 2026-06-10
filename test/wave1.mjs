// Wave1 — 로드맵(RICE·다음마일스톤) + 당신차례 큐(디둡·해결). index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) RICE = 영향÷노력 (1~5 클램프)
function riceScore(impact, effort) { const i = Math.max(1, Math.min(5, +impact || 3)), e = Math.max(1, Math.min(5, +effort || 3)); return Math.round(i / e * 10) / 10; }
ok(riceScore(5, 1) === 5, 'RICE 영향5/노력1 = 5(최고)');
ok(riceScore(2, 4) === 0.5, 'RICE 영향2/노력4 = 0.5');
ok(riceScore(4, 2) === 2, 'RICE 영향4/노력2 = 2');
ok(riceScore(5, 3) === 1.7, 'RICE 5/3=1.67→1.7');
ok(riceScore(9, 9) === 1, 'RICE 범위 클램프(9·9→5·5=1.0)');

// 2) 로드맵 — 다음 마일스톤은 planned만, RICE 내림차순
const rm = [
  { title: 'A', status: 'planned', rice: 2 },
  { title: 'B', status: 'done', rice: 5 },
  { title: 'C', status: 'planned', rice: 4 },
  { title: 'D', status: 'in_progress', rice: 5 },
];
const next = rm.filter(m => m.status === 'planned').sort((a, b) => b.rice - a.rice).slice(0, 3);
ok(next.length === 2 && next[0].title === 'C', 'next= planned만, RICE 높은 순(C먼저, done/in_progress 제외)');

// 3) 마일스톤 디둡(같은 제목 + 미완료면 추가 안 함)
function canAdd(arr, title) { return !arr.some(m => m.title.toLowerCase() === title.toLowerCase() && m.status !== 'done'); }
ok(canAdd(rm, 'X') === true, '새 마일스톤 추가 가능');
ok(canAdd(rm, 'a') === false, '같은 제목 미완료 = 중복 차단');
ok(canAdd(rm, 'b') === true, '완료된 같은 제목은 재추가 가능');

// 4) 당신차례 큐 — sig 디둡 + 해결
function mkBlk() { const arr = []; let seq = 0; return {
  add(what) { const sig = String(what).toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 40); if (arr.some(b => b.status === 'open' && b.sig === sig)) return null; const b = { id: ++seq, what, sig, status: 'open' }; arr.push(b); return b; },
  resolve(id) { const b = arr.find(x => x.id === id || x.sig === id); if (b) b.status = 'done'; return b; },
  open() { return arr.filter(b => b.status === 'open'); }, arr };
}
const B = mkBlk();
B.add('PR 머지: 결제 수정'); B.add('PR 머지: 결제 수정'); // 디둡
ok(B.open().length === 1, '같은 막힌 것 디둡(중복 안 쌓임)');
B.add('LAW_OC 키 발급');
ok(B.open().length === 2, '다른 막힌 것은 추가');
B.resolve(1);
ok(B.open().length === 1, '해결하면 open에서 빠짐');

// 5) 캡처 kind 분류
function blkKind(t) { return /계정|결제|스토어/.test(t) ? 'account' : /도메인/.test(t) ? 'dns' : /키/.test(t) ? 'key' : 'todo'; }
ok(blkKind('결제·수익화 계정') === 'account', '결제계정→account');
ok(blkKind('커스텀 도메인') === 'dns', '도메인→dns');
ok(blkKind('애널리틱스 키') === 'key', '키→key');

console.log(fail ? '\n❌ wave1 실패 ' + fail : '\n✅ wave1 전부 통과');
process.exit(fail ? 1 : 0);
