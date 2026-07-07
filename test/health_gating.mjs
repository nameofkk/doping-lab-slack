// 헬스 게이팅 단언 — index.js checkServices의 헬스EP→다운 격상 결정부(2620~2633)와
// "헬스 게이팅" 토글 명령 파싱(3680~3686)을 결정론 복제해 드리프트/회귀 감지.
// 합의된 동작: 옵트인 기본 OFF, STREAK=3 디바운스, health발 다운이면 downCode에 헬스 실패코드.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// ── index.js와 동일 (복사본) ──
const HEALTH_GATE_STREAK = 3;

// 한 번의 체크 틱을 s에 반영 — index.js checkServices 본문 발췌(루트 판정 후 헬스 게이팅·전이 기록).
// inp: { rootUp(루트 2xx/3xx 여부), code(루트 코드), healthBad(헬스EP 이상), healthCode(헬스 실패코드) }
function stepCheck(s, inp) {
  const { rootUp, code, healthBad, healthCode } = inp;
  let up = rootUp;
  // 헬스EP 연속 실패수 — 깜빡임 디바운스용. 정상이거나 헬스URL 없으면 0으로 리셋
  s.healthFailStreak = healthBad ? ((s.healthFailStreak || 0) + 1) : 0;
  // 옵트인(s.healthGating) 한정: 루트는 200인데 헬스EP가 STREAK연속 죽었으면 '다운'으로 격상
  let healthGatedDown = false;
  if (up && s.healthGating && healthBad && (s.healthFailStreak || 0) >= HEALTH_GATE_STREAK) { up = false; healthGatedDown = true; }
  const wasUp = s.lastStatus !== 'down';
  s.lastStatus = up ? 'up' : 'down';
  s.failStreak = up ? 0 : ((s.failStreak || 0) + 1);
  if (wasUp && !up) { s.downSince = s.downSince || 1; s.downCode = healthGatedDown ? healthCode : code; s.downVia = healthGatedDown ? 'health' : 'http'; }
  else if (!wasUp && up && s.downSince) { s.downSince = null; s.downCode = null; s.downVia = null; }
  return { up, healthGatedDown, status: s.lastStatus, downCode: s.downCode, downVia: s.downVia, streak: s.healthFailStreak };
}

// 헬스EP 정상(루트도 정상)
const tickOK = { rootUp: true, code: '200', healthBad: false, healthCode: '000' };
// 헬스EP 이상(루트는 200) — 503 떨어진 케이스
const tickHealthBad = { rootUp: true, code: '200', healthBad: true, healthCode: '503' };

// 1) 옵트아웃(기본): 헬스가 계속 죽어도 절대 다운으로 안 뒤집힘 — '주의'로만(여기선 up 유지)
{
  const s = {};
  let r;
  for (let i = 0; i < 6; i++) r = stepCheck(s, tickHealthBad);
  ok(r.up === true && r.status === 'up' && !r.downVia, '옵트OFF: 헬스 6연속 실패해도 up 유지(다운 격상 안 함)');
  ok(r.streak === 6, '옵트OFF여도 healthFailStreak는 추적은 됨(6연속)');
}

// 2) 옵트인인데 STREAK 미만(1~2연속): 아직 격상 안 함
{
  const s = { healthGating: true };
  const r1 = stepCheck(s, tickHealthBad); ok(r1.up === true && r1.streak === 1, '옵트ON 1연속: 아직 up(디바운스)');
  const r2 = stepCheck(s, tickHealthBad); ok(r2.up === true && r2.streak === 2, '옵트ON 2연속: 아직 up(디바운스)');
}

// 3) 옵트인 + STREAK 도달(3연속): 다운으로 격상, downVia=health, downCode=헬스 실패코드
{
  const s = { healthGating: true };
  stepCheck(s, tickHealthBad); stepCheck(s, tickHealthBad);
  const r3 = stepCheck(s, tickHealthBad);
  ok(r3.up === false && r3.healthGatedDown === true && r3.status === 'down', '옵트ON 3연속: 다운으로 격상');
  ok(r3.downVia === 'health', 'health발 다운이면 downVia=health');
  ok(r3.downCode === '503', 'health발 다운이면 downCode에 헬스 실패코드(503) 기록');
}

// 4) 루트가 진짜 죽으면(비2xx) 옵트인이어도 루트 코드가 우선 — downVia=http, downCode=루트코드
{
  const s = { healthGating: true };
  const r = stepCheck(s, { rootUp: false, code: '502', healthBad: true, healthCode: '503' });
  ok(r.up === false && r.downVia === 'http' && r.downCode === '502', '루트 다운(502)이면 health보다 루트 우선: downVia=http, downCode=502');
}

// 5) 깜빡임: 2연속 실패 후 한 번 정상 들어오면 streak 리셋 → 다시 3연속 필요(오탐 차단)
{
  const s = { healthGating: true };
  stepCheck(s, tickHealthBad); stepCheck(s, tickHealthBad);
  const recover = stepCheck(s, tickOK);
  ok(recover.streak === 0 && recover.up === true, '헬스 정상 1회 들어오면 streak 0 리셋');
  const again = stepCheck(s, tickHealthBad);
  ok(again.up === true && again.streak === 1, '리셋 후엔 다시 1연속부터 — 깜빡임으로 다운 안 됨');
}

// 6) health발 다운 후 헬스 복구 → up 전이 + downCode/downVia 클리어
{
  const s = { healthGating: true };
  stepCheck(s, tickHealthBad); stepCheck(s, tickHealthBad); stepCheck(s, tickHealthBad);
  const rec = stepCheck(s, tickOK);
  ok(rec.up === true && rec.status === 'up' && !rec.downVia && !rec.downCode, 'health발 다운 후 헬스 복구 시 up 전이 & downCode/downVia 클리어');
}

// 7) 헬스 체크 자체 실패(네트워크 도구 막힘 등)는 healthBad=false로 들어와 streak에 반영 안 됨(오탐 방지)
{
  const s = { healthGating: true };
  stepCheck(s, tickHealthBad); stepCheck(s, tickHealthBad);
  const probeErr = stepCheck(s, tickOK); // catch 분기 = healthBad 미설정 = false
  ok(probeErr.streak === 0, '헬스 체크 예외(healthBad=false) → streak 리셋, 게이팅에 반영 안 함');
}

// ── "헬스 게이팅" 토글 명령 파싱 (index.js 3680~3686 복제) ──
function parseGating(raw) {
  const hg = String(raw).match(/^헬스\s*게이팅\s+(\S+)\s*(켜기|켜|on|끄기|꺼|off|해제)?$/i);
  if (!hg) return null;
  const off = /끄기|꺼|off|해제/i.test(hg[2] || '');
  return { svc: hg[1], action: off ? 'off' : 'on' };
}
ok(parseGating('헬스 게이팅 wewantpeace 켜기')?.action === 'on', '"켜기" → on');
ok(parseGating('헬스 게이팅 wewantpeace 끄기')?.action === 'off', '"끄기" → off');
ok(parseGating('헬스 게이팅 wewantpeace')?.action === 'on', '액션 생략 시 기본 on');
ok(parseGating('헬스게이팅 sponono off')?.action === 'off', '공백없음+off도 파싱');
ok(parseGating('헬스 게이팅 sponono 해제')?.action === 'off', '"해제" → off');
ok(parseGating('헬스게이팅 sponono')?.svc === 'sponono', '서비스명 캡처');
ok(!parseGating('헬스체크'), '"헬스체크"는 게이팅 토글 아님');
ok(!parseGating('헬스 항목 sponono https://x/health'), '"헬스 항목"은 게이팅 토글 아님');

console.log(fail ? '\n❌ 헬스 게이팅 실패 ' + fail : '\n✅ 헬스 게이팅 전부 통과');
process.exit(fail ? 1 : 0);
