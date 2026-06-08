// R4 가드레일 판정 파싱 — haiku JSON → refuse/proceed, 파싱실패=proceed(fail-open)
function decide(text) { try { const m = (text || '').match(/\{[\s\S]*\}/); const o = m ? JSON.parse(m[0]) : { verdict: 'proceed' }; return o.verdict === 'refuse' ? o : { verdict: 'proceed' }; } catch { return { verdict: 'proceed' }; } }
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
ok(decide('{"verdict":"refuse","reason":"레포 전체 삭제"}').verdict === 'refuse', '파괴적→refuse');
ok(decide('여기: {"verdict":"proceed"}').verdict === 'proceed', '정상→proceed(앞 텍스트 섞여도)');
ok(decide('쓰레기 출력 JSON없음').verdict === 'proceed', 'JSON 없음→proceed(fail-open)');
ok(decide('').verdict === 'proceed', '빈 출력→proceed');
ok(decide('{"verdict":"clarify"}').verdict === 'proceed', 'clarify는 안 막음(refuse만 차단)');
ok(decide('{"verdict":"refuse","reason":"DB drop"}').reason === 'DB drop', 'refuse 사유 전달');
ok(decide('{ broken json').verdict === 'proceed', '깨진 JSON→proceed(fail-open)');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
