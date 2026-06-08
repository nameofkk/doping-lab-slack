// Phase A1 사업 메트릭 — flattenNums(숫자만 평탄화, 문자열/시크릿 제외) + 소스등록 파싱. index.js 로직 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
function flattenNums(obj, prefix, out) { for (const k of Object.keys(obj || {})) { const v = obj[k]; const key = prefix ? prefix + '.' + k : k; if (typeof v === 'number' && isFinite(v)) out[key] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) flattenNums(v, key, out); } return out; }

// wewantpeace /public/stats 실제 형태
const platform = flattenNums({ total_events: 1234, events_24h: 56, active_clusters: 7, monitored_countries: 195, new_clusters_7d: 3, updated_at: '2026-06-08T21:00:00Z' }, 'platform', {});
ok(platform['platform.events_24h'] === 56, '숫자 필드 추출(events_24h)');
ok(platform['platform.total_events'] === 1234, '숫자 필드 추출(total_events)');
ok(!('platform.updated_at' in platform), '문자열(updated_at)은 제외');
ok(Object.keys(platform).length === 5, '숫자 5개만');
// newsletter
const nl = flattenNums({ subscriber_count: 58 }, 'newsletter', {});
ok(nl['newsletter.subscriber_count'] === 58, 'newsletter 구독자수');
// 중첩
const nested = flattenNums({ revenue: { mrr: 1900, arpu: 32 }, name: 'sponono' }, 'sp', {});
ok(nested['sp.revenue.mrr'] === 1900 && nested['sp.revenue.arpu'] === 32, '중첩 객체 평탄화');
ok(!('sp.name' in nested), '중첩 속 문자열 제외');
// 소스 등록 파싱(Slack <url> 래핑 해제)
function parseBizReg(raw) { const u = raw.replace(/<(https?:\/\/[^>|]+)(\|[^>]*)?>/g, '$1'); const m = u.match(/^사업\s*(?:메트릭|지표)\s*(?:등록|추가)\s+(\S+)\s+(https?:\/\/\S+)\s*(\S+)?/i); return m ? { repo: m[1], url: m[2], name: m[3] } : null; }
ok(parseBizReg('사업 메트릭 등록 wewantpeace <https://api.wewantpeace.live/public/stats> platform').url === 'https://api.wewantpeace.live/public/stats', '소스등록 파싱+Slack래핑해제');
ok(!parseBizReg('사업 지표'), '사업 지표(조회)는 등록 아님');

console.log(fail ? '\n❌ biz 실패 ' + fail : '\n✅ biz 전부 통과');
process.exit(fail ? 1 : 0);
