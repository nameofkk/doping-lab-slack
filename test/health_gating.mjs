// 헬스 게이팅 로직 단언 — index.js checkServices의 헬스EP 판정·격상(2620~2640줄) 결정론 부분 복제(드리프트 감지).
// 핵심: 옵트인(s.healthGating)된 서비스만 헬스EP 연속실패를 '다운'으로 격상, STREAK=3 디바운스,
//       격상 시 downCode=헬스EP코드/downVia='health', 복구 시 마크 리셋. 옵트인 안 했으면 '주의'로만.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// ── index.js와 동일 (복사본) ──
const HEALTH_GATE_STREAK = 3; // index.js 동일 상수 — 바뀌면 같이 바꿔야 함

// 헬스EP 응답 파싱: curl -w "\n%{http_code}" 출력에서 코드/본문 분리 → bad 판정 (index.js 2621줄 복제)
function parseHealth(rawOut, healthKeyword) {
  const ho = (rawOut || '').trim();
  const hc = ((ho.match(/(\d{3})\s*$/) || [])[1]) || '000';
  const hbody = ho.replace(/\d{3}\s*$/, '');
  const codeBad = !/^2/.test(hc);
  const kwBad = !!(healthKeyword && !hbody.includes(healthKeyword));
  return { healthBad: codeBad || kwBad, healthCode: (codeBad || kwBad) ? hc : '000' };
}

// 한 번의 체크 틱: 루트코드 + 헬스판정 → 상태머신 전이 (index.js 2620~2640줄 복제)
function tick(s, { code, healthBad, healthCode = '000' }, now = 1000) {
  let up = /^2\d\d|^3\d\d/.test(code);
  s.healthFailStreak = healthBad ? ((s.healthFailStreak || 0) + 1) : 0;
  let healthGatedDown = false;
  if (up && s.healthGating && healthBad && (s.healthFailStreak || 0) >= HEALTH_GATE_STREAK) { up = false; healthGatedDown = true; }
  const issuesLen = healthBad ? 1 : 0; // 본 테스트는 헬스EP 이상만 issue로 추적
  const degraded = up && !!issuesLen;
  const wasUp = s.lastStatus !== 'down';
  s.lastStatus = up ? 'up' : 'down';
  s.failStreak = up ? 0 : ((s.failStreak || 0) + 1);
  if (wasUp && !up) { s.downSince = s.downSince || now; s.downCode = healthGatedDown ? healthCode : code; s.downVia = healthGatedDown ? 'health' : 'http'; }
  else if (!wasUp && up && s.downSince) { s.downSince = null; s.downCode = null; s.downVia = null; }
  return { up, degraded, healthGatedDown };
}

// ── 헬스EP 응답 파싱 ──
ok(parseHealth('ok\n200', 'ok').healthBad === false, '200 + 기대문구 있음 → 정상');
ok(parseHealth('down\n503').healthBad === true && parseHealth('down\n503').healthCode === '503', '503 → bad, 코드 503 캡처');
ok(parseHealth('\n000').healthBad === true && parseHealth('\n000').healthCode === '000', '무응답(000) → bad');
ok(parseHealth('something\n200', 'ok').healthBad === true, '200이어도 기대문구 없으면 bad');
ok(parseHealth('version 12345\n200', '12345').healthBad === false, '본문 끝 숫자 있어도 마지막 3자리가 코드 — 오인 안 함');
ok(parseHealth('ok\n200').healthCode === '000', '정상일 땐 healthCode를 코드로 안 싣음(000)');

// ── 옵트인 OFF: 헬스EP가 계속 죽어도 절대 다운으로 격상 안 함(주의로만) ──
{
  const s = { repo: 'a/off', healthUrl: 'h', healthGating: false };
  let r;
  for (let i = 0; i < 5; i++) r = tick(s, { code: '200', healthBad: true, healthCode: '503' });
  ok(r.up === true && r.degraded === true, '옵트인 OFF: 헬스 5연속 실패해도 up 유지(degraded만)');
  ok(s.lastStatus === 'up' && s.downVia == null && s.downCode == null, '옵트인 OFF: down/ downVia 안 찍힘');
  ok((s.healthFailStreak || 0) === 5, '옵트인 OFF여도 연속실패수는 누적(켜면 바로 반영되게)');
}

// ── 옵트인 ON: STREAK=3 디바운스 후 격상, downCode=헬스코드/downVia=health ──
{
  const s = { repo: 'a/on', healthUrl: 'h', healthGating: true };
  let r1 = tick(s, { code: '200', healthBad: true, healthCode: '503' });
  ok(r1.up === true && r1.degraded === true && s.healthFailStreak === 1, '옵트인 ON 1회: 아직 다운 아님(주의)');
  let r2 = tick(s, { code: '200', healthBad: true, healthCode: '503' });
  ok(r2.up === true && s.healthFailStreak === 2, '옵트인 ON 2회: 여전히 디바운스 중(STREAK<3)');
  let r3 = tick(s, { code: '200', healthBad: true, healthCode: '503' });
  ok(r3.up === false && r3.healthGatedDown === true, '옵트인 ON 3회 연속: 다운으로 격상');
  ok(s.downVia === 'health', '격상 시 downVia=health');
  ok(s.downCode === '503', '격상 시 downCode=헬스EP 실패코드(503) — 루트 200 아님');
  ok(s.lastStatus === 'down' && s.failStreak === 1, '격상 후 lastStatus=down, failStreak 증가');
}

// ── 깜빡임(flicker): 2번 실패 후 1번 정상 끼면 스트릭 리셋 → 격상 안 됨 ──
{
  const s = { repo: 'a/flick', healthUrl: 'h', healthGating: true };
  tick(s, { code: '200', healthBad: true, healthCode: '500' });   // streak 1
  tick(s, { code: '200', healthBad: true, healthCode: '500' });   // streak 2
  const rOk = tick(s, { code: '200', healthBad: false });          // 정상 → streak 0
  ok(rOk.up === true && s.healthFailStreak === 0, '중간에 정상 1번 → 스트릭 0으로 리셋');
  const rb1 = tick(s, { code: '200', healthBad: true, healthCode: '500' }); // streak 1
  const rb2 = tick(s, { code: '200', healthBad: true, healthCode: '500' }); // streak 2
  ok(rb1.up === true && rb2.up === true, '리셋 후엔 다시 3연속 필요 — 깜빡임으론 격상 안 됨');
}

// ── 루트 다운이 우선: 헬스EP 정상이어도 루트가 죽으면 http 다운 ──
{
  const s = { repo: 'a/root', healthUrl: 'h', healthGating: true };
  const r = tick(s, { code: '000', healthBad: false });
  ok(r.up === false && s.downVia === 'http' && s.downCode === '000', '루트 000 → http 다운(헬스 정상이어도). downVia=http');
}

// ── 복구: 헬스 격상 다운 → 헬스 정상 회복되면 up 복귀 & 마크 리셋 ──
{
  const s = { repo: 'a/rec', healthUrl: 'h', healthGating: true };
  tick(s, { code: '200', healthBad: true, healthCode: '503' });
  tick(s, { code: '200', healthBad: true, healthCode: '503' });
  tick(s, { code: '200', healthBad: true, healthCode: '503' }); // 격상 다운
  ok(s.lastStatus === 'down' && s.downVia === 'health', '격상 다운 상태 진입 확인');
  const rec = tick(s, { code: '200', healthBad: false });        // 헬스 회복
  ok(rec.up === true, '헬스 회복 → up 복귀');
  ok(s.downSince == null && s.downCode == null && s.downVia == null, '복구 시 downSince/downCode/downVia 모두 리셋');
  ok(s.healthFailStreak === 0 && s.failStreak === 0, '복구 시 스트릭 리셋');
}

// ── 격상된 down 중 루트까지 죽으면 downVia는 http로(루트 우선), 이후 healthBad라도 루트가 지배 ──
{
  const s = { repo: 'a/both', healthUrl: 'h', healthGating: true };
  tick(s, { code: '200', healthBad: true, healthCode: '503' });
  tick(s, { code: '200', healthBad: true, healthCode: '503' });
  tick(s, { code: '200', healthBad: true, healthCode: '503' }); // health 격상 다운
  // 이미 down 상태에서 루트가 죽음 — wasUp=false라 downCode/Via는 첫 다운값(health/503) 유지(전이 시점에만 기록)
  const r = tick(s, { code: '000', healthBad: true, healthCode: '503' });
  ok(r.up === false && s.failStreak === 2, '다운 지속 중 루트도 죽음 → failStreak 누적');
  ok(s.downVia === 'health', '다운 전이는 한 번만 기록 — 최초 격상 사유(health) 유지');
}

console.log(fail ? '\n❌ 헬스게이팅 실패 ' + fail : '\n✅ 헬스게이팅 전부 통과');
process.exit(fail ? 1 : 0);
