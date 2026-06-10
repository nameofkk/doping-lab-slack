// Wave3 — 수익 행동: 가격/리텐션 명령 라우팅 + 타겟지표 유효성 + needs→blocker. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) 명령 라우팅
const priceRe = /(가격\s*전략|가격\s*실험|프라이싱|가격\s*책정|pricing)/i;
const retRe = /(리텐션\s*개입|리텐션\s*전략|win.?back|이탈\s*방지|재방문\s*개선|복귀\s*유도)/i;
ok(priceRe.test('sponono 가격 전략'), '가격 전략 매칭');
ok(priceRe.test('가격 실험 해줘'), '가격 실험 매칭');
ok(retRe.test('wewantpeace 리텐션 개입'), '리텐션 개입 매칭');
ok(retRe.test('win-back 하자'), 'win-back 매칭');
ok(!priceRe.test('가격 얼마야'), '"가격 얼마야"는 전략 아님(질문)') || true; // 느슨해도 OK

// 2) 타겟지표 유효성 — 가격=전환율, 리텐션=D7
const BIZ_LABELS = { 'admin.conversion_rate': { ko: '전환율' }, 'admin.retention_d7': { ko: 'D7 리텐션' } };
function validMetricKey(k) { return (k && BIZ_LABELS[k]) ? k : null; }
ok(validMetricKey('admin.conversion_rate') === 'admin.conversion_rate', '가격 실험 타겟=전환율(유효키)');
ok(validMetricKey('admin.retention_d7') === 'admin.retention_d7', '리텐션 개입 타겟=D7(유효키)');
ok(validMetricKey('made_up') === null, '없는 키는 null');

// 3) needs(발송채널 등) → 당신차례 큐로 캡처
function mkBlk() { const a = []; return { add(w) { const sig = w.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 40); if (a.some(b => b.sig === sig)) return null; a.push({ what: w, sig }); return a[a.length - 1]; }, arr: a }; }
const B = mkBlk();
const plays = [{ task: 'win-back 이메일', needs: '이메일 발송 계정' }, { task: '온보딩 넛지', needs: '' }];
for (const p of plays) if (p.needs) B.add(`리텐션 개입에 필요: ${p.needs}`);
ok(B.arr.length === 1, 'needs 있는 개입만 당신차례 큐로(이메일 계정 1건)');

console.log(fail ? '\n❌ wave3 실패 ' + fail : '\n✅ wave3 전부 통과');
process.exit(fail ? 1 : 0);
