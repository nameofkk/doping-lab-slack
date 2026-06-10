// Wave2 — 퍼널 계측: 측정갭 감지 + admin.* 키 매핑 + 라벨. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// 1) missingFunnel — 활성화율·D7·전환 중 숫자로 없는 것
const BIZ_LABELS = { 'admin.activation_rate': { ko: '활성화율' }, 'admin.retention_d7': { ko: 'D7 리텐션' }, 'admin.conversion_rate': { ko: '전환율' } };
function missingFunnel(metrics) { return ['admin.activation_rate', 'admin.retention_d7', 'admin.conversion_rate'].filter(k => typeof metrics[k] !== 'number'); }
ok(missingFunnel({}).length === 3, '아무 퍼널 지표 없으면 3개 다 빠짐');
ok(missingFunnel({ 'admin.activation_rate': 19.5 }).length === 2, '활성화율만 있으면 2개 빠짐');
ok(missingFunnel({ 'admin.activation_rate': 19.5, 'admin.retention_d7': 30, 'admin.conversion_rate': 4 }).length === 0, '셋 다 있으면 계측 OK');
ok(missingFunnel({ 'admin.activation_rate': null }).length === 3, 'null은 미측정 취급');

// 2) flattenNums 매핑 시뮬 — 엔드포인트 JSON이 admin.* 키로(소스명 prefix)
function flatten(j, prefix, out) { for (const k of Object.keys(j)) { if (typeof j[k] === 'number') out[`${prefix}.${k}`] = j[k]; } return out; }
const mapped = flatten({ activation_rate: 19.5, retention_d7: 30, total_users: 241 }, 'admin', {});
ok(mapped['admin.activation_rate'] === 19.5, '엔드포인트 activation_rate → admin.activation_rate(라벨과 매칭)');
ok(BIZ_LABELS['admin.activation_rate'].ko === '활성화율', '매핑된 키가 BIZ_LABELS에 라벨 있음 → 브리핑/그로스가 읽음');
ok(missingFunnel(mapped).length === 1, '매핑 후 전환율만 아직 빠짐(부분 계측 감지)');

// 3) 계측 작업 키워드 → INSTRUMENTATION_RULE 주입 트리거
const re = /계측|퍼널|funnel|활성화율|리텐션\s*측정|전환율\s*측정|코호트|instrument/i;
ok(re.test('wewantpeace 퍼널 계측'), '퍼널 계측 작업 → 룰 주입');
ok(re.test('활성화율 이벤트 로깅 추가'), '활성화율 작업 → 룰 주입');
ok(!re.test('히어로 색 바꾸기'), '일반 UI작업엔 계측룰 안 붙음');

// 4) 측정갭 → 로드맵 마일스톤(impact 5, RICE 높음)
function rice(i, e) { return Math.round(i / e * 10) / 10; }
ok(rice(5, 3) === 1.7, '계측 마일스톤 RICE(영향5/노력3)=1.7 — 우선순위 높게');

console.log(fail ? '\n❌ wave2 실패 ' + fail : '\n✅ wave2 전부 통과');
process.exit(fail ? 1 : 0);
