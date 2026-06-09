// D3 사업 선제 감시 — bizBreaches 임계치 판정 로직 복제 테스트
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const BIZ_LABELS = { 'admin.monthly_revenue': { ko: '이번달 매출' }, 'admin.subscribers': { ko: '구독자' }, 'admin.total_users': { ko: '총 회원' }, 'admin.dau': { ko: 'DAU' } };
const BIZ_WATCH = [
  { key: 'admin.monthly_revenue', dir: 'down', pct: 30, crit: true, why: '매출 급감' },
  { key: 'admin.subscribers', dir: 'down', pct: 20, crit: true, why: '유료 구독자 이탈' },
  { key: 'admin.total_users', dir: 'down', pct: 5, why: '회원수 감소(탈퇴 신호)' },
  { key: 'admin.dau', dir: 'down', pct: 50, why: 'DAU 급락' },
];
function bizBreaches(cur, prev) {
  const out = [];
  for (const w of BIZ_WATCH) { const cv = cur[w.key], pv = prev[w.key]; if (typeof cv !== 'number' || typeof pv !== 'number') continue; const d = cv - pv, pct = pv ? Math.round(d / pv * 100) : null; if (pct === null) continue; if (w.dir === 'down' ? (pct <= -w.pct) : (pct >= w.pct)) out.push({ key: w.key, label: BIZ_LABELS[w.key].ko, crit: !!w.crit, pct }); }
  const rev = cur['admin.monthly_revenue'], subs = cur['admin.subscribers'];
  if (typeof rev === 'number' && rev === 0 && typeof subs === 'number' && subs > 0) out.push({ key: 'admin.monthly_revenue', label: '이번달 매출', why: `유료 ${subs}명인데 매출 0`, crit: true, pct: null });
  return out;
}
// 매출 40% 급감 → 잡힘(critical)
let b = bizBreaches({ 'admin.monthly_revenue': 600000 }, { 'admin.monthly_revenue': 1000000 });
ok(b.length === 1 && b[0].crit && b[0].pct === -40, '매출 40% 급감 감지(긴급)');
// 매출 10% 감소 → 임계(30%) 미달, 안 잡힘
ok(bizBreaches({ 'admin.monthly_revenue': 900000 }, { 'admin.monthly_revenue': 1000000 }).length === 0, '매출 10% 감소는 임계 미달');
// 구독 25% 이탈 → 잡힘
ok(bizBreaches({ 'admin.subscribers': 6 }, { 'admin.subscribers': 8 }).some(x => x.key === 'admin.subscribers'), '구독자 25% 이탈 감지');
// 회원 증가 → 안 잡힘(하락만 감시)
ok(bizBreaches({ 'admin.total_users': 250 }, { 'admin.total_users': 241 }).length === 0, '회원 증가는 경보 아님');
// 유료 6명인데 매출 0 → 특수 임계 잡힘
b = bizBreaches({ 'admin.monthly_revenue': 0, 'admin.subscribers': 6 }, { 'admin.monthly_revenue': 0, 'admin.subscribers': 6 });
ok(b.some(x => x.why && /매출 0/.test(x.why)), '유료 있는데 매출 0 특수 임계');
// 유료 0명에 매출 0 → 정상(안 잡힘)
ok(bizBreaches({ 'admin.monthly_revenue': 0, 'admin.subscribers': 0 }, { 'admin.monthly_revenue': 0, 'admin.subscribers': 0 }).length === 0, '유료 0명 매출 0은 정상');
// DAU 60% 급락 → 잡힘
ok(bizBreaches({ 'admin.dau': 4 }, { 'admin.dau': 10 }).some(x => x.key === 'admin.dau'), 'DAU 60% 급락 감지');

console.log(fail ? '\n❌ sentinel_biz 실패 ' + fail : '\n✅ sentinel_biz 전부 통과');
process.exit(fail ? 1 : 0);
