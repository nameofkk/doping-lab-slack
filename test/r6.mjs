// R6 구조화 태그 파싱·프로즈 스트립 (index.js와 동일 로직)
function parse(full) {
  const tagM = full.match(/⟦([\s\S]*?)⟧/);
  const tag = tagM ? tagM[1].replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  const prose = full.replace(/⟦[\s\S]*?⟧/, '').trim();
  return { tag, prose };
}
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const a = parse('서버가 다 돌려야 해. 클라는 뷰어.\n\n⟦핵심: 서버 권위 | 근거: 코드상 소켓 | 미해결: 부하 미확인⟧');
ok(a.tag === '핵심: 서버 권위 | 근거: 코드상 소켓 | 미해결: 부하 미확인', '태그 추출');
ok(a.prose === '서버가 다 돌려야 해. 클라는 뷰어.', '프로즈에서 태그 제거(깔끔)');
const b = parse('태그 안 단 발언이야.');
ok(b.tag === null, '태그 없으면 null'); ok(b.prose === '태그 안 단 발언이야.', '태그 없으면 프로즈 그대로');
const c = parse('여러줄\n주장이야\n\n⟦핵심: A\n근거: B | 미해결: C⟧');
ok(c.tag === '핵심: A 근거: B | 미해결: C', '여러줄 태그 한 줄로 정규화');
ok(!c.prose.includes('⟦'), '프로즈에 태그 잔여 없음');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
