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

// 서비스 등록 파싱 — Slack이 URL을 <url> / <url|텍스트>로 감싸는 것 해제(라이브 버그 회귀)
function parseSvcReg(raw) {
  const rawU = String(raw).replace(/<(https?:\/\/[^>|]+)(\|[^>]*)?>/g, '$1');
  const reg = rawU.match(/^서비스\s*(?:등록|추가|모니터링?)\s+(\S+)\s+(https?:\/\/\S+)/i);
  return reg ? { repo: reg[1], url: reg[2].replace(/[)>,]+$/, '') } : null;
}
ok(parseSvcReg('서비스 등록 sponono <https://sponono.com>') && parseSvcReg('서비스 등록 sponono <https://sponono.com>').url === 'https://sponono.com', 'Slack <url> 래핑 해제 등록');
ok(parseSvcReg('서비스 등록 wewantpeace <https://www.wewantpeace.live|WeWantPeace>') && parseSvcReg('서비스 등록 wewantpeace <https://www.wewantpeace.live|WeWantPeace>').url === 'https://www.wewantpeace.live', 'Slack <url|텍스트> 해제');
ok(parseSvcReg('서비스 등록 sponono https://sponono.com') && parseSvcReg('서비스 등록 sponono https://sponono.com').repo === 'sponono', '평문 URL 등록 파싱');
ok(!parseSvcReg('헬스체크'), '헬스체크는 등록 명령 아님');

// ── 서비스 레지스트리 영속화: 원자쓰기 + 로드시 .bak 백업 (index.js loadServices/persistServices 복제) ──
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
function makeStore(SERVICES_FILE) {
  let services = {};
  function loadServices() { try { if (fs.existsSync(SERVICES_FILE)) { services = JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8')) || {}; try { fs.copyFileSync(SERVICES_FILE, SERVICES_FILE + '.bak'); } catch (_) {} } } catch { services = {}; } }
  function persistServices() { try { const tmp = SERVICES_FILE + '.tmp.' + process.pid; fs.writeFileSync(tmp, JSON.stringify(services)); fs.renameSync(tmp, SERVICES_FILE); } catch {} }
  return { get: () => services, set: v => { services = v; }, loadServices, persistServices };
}
const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'));
const SF = path.join(tdir, 'services.json');

// 1. persist가 읽어들일 수 있는 정상 JSON을 쓴다
const s1 = makeStore(SF); s1.set({ 'a/b': { repo: 'a/b', url: 'https://x' } }); s1.persistServices();
ok(fs.existsSync(SF) && JSON.parse(fs.readFileSync(SF, 'utf8'))['a/b'].url === 'https://x', 'persist → 정상 JSON 기록');
// 2. 원자쓰기: rename으로 소비돼 .tmp 잔여물이 안 남는다
ok(!fs.existsSync(SF + '.tmp.' + process.pid), 'persist 후 .tmp 임시파일 안 남음(rename으로 소비)');
// 3. 기존 정상 파일을 다시 persist해도 깨지지 않고 갱신된다(rename 원자성)
s1.set({ 'a/b': { repo: 'a/b', url: 'https://y' } }); s1.persistServices();
ok(JSON.parse(fs.readFileSync(SF, 'utf8'))['a/b'].url === 'https://y', '재기록 시 원자적으로 교체됨');
// 4. 로드 성공 시 .bak 백업 1벌이 생긴다
const s2 = makeStore(SF); s2.loadServices();
ok(fs.existsSync(SF + '.bak'), '로드 성공 → .bak 백업 생성');
// 5. .bak 내용이 원본과 동일하다
ok(fs.readFileSync(SF, 'utf8') === fs.readFileSync(SF + '.bak', 'utf8'), '.bak 내용이 원본과 일치');
// 6. 로드된 데이터가 기록한 것과 동일하다(왕복)
ok(s2.get()['a/b'].url === 'https://y', '왕복: persist→load 데이터 보존');
// 7. 파일이 깨졌으면 services={}로 가고, 기존 .bak는 덮어쓰지 않는다(직전 양호 백업 보존)
const bakBefore = fs.readFileSync(SF + '.bak', 'utf8');
fs.writeFileSync(SF, '{이건깨진JSON');
const s3 = makeStore(SF); s3.loadServices();
ok(Object.keys(s3.get()).length === 0 && fs.readFileSync(SF + '.bak', 'utf8') === bakBefore, '파손 파일 → {} 복구 & 양호 .bak 보존(파손본으로 덮어쓰지 않음)');
// 8. 파일이 아예 없으면 services={} 유지하고 .bak도 안 만든다
const SF2 = path.join(tdir, 'none.json'); const s4 = makeStore(SF2); s4.loadServices();
ok(Object.keys(s4.get()).length === 0 && !fs.existsSync(SF2 + '.bak'), '파일 없으면 {} 유지 & .bak 미생성');
try { fs.rmSync(tdir, { recursive: true, force: true }); } catch (_) {}

console.log(fail ? '\n❌ 센티넬 실패 ' + fail : '\n✅ 센티넬 전부 통과');
process.exit(fail ? 1 : 0);
