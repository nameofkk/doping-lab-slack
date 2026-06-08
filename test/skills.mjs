// B1 스킬 라이브러리 — addSkill(이름 중복 갱신/캡), recallSkills(키워드 회상·재사용카운트). index.js 로직 복제.
let skills = {};
function persistSkills() {}
function addSkill(key, name, when, recipe) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60); recipe = String(recipe || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!name || recipe.length < 12) return;
  const arr = (skills[key] = skills[key] || []);
  const dup = arr.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (dup >= 0) { arr[dup] = { ...arr[dup], when: when || arr[dup].when, recipe, at: 1 }; return; }
  arr.push({ name, when: String(when || '').slice(0, 120), recipe, uses: 0, at: 1 });
  if (arr.length > 30) skills[key] = arr.slice(-30);
}
function recallSkills(key, taskText) {
  const arr = skills[key] || []; if (!arr.length) return '';
  const words = String(taskText || '').toLowerCase().match(/[a-z가-힣0-9]{2,}/g) || [];
  const scored = arr.map(s => ({ s, sc: words.filter(w => (s.name + ' ' + s.when + ' ' + s.recipe).toLowerCase().includes(w)).length }));
  const rel = scored.filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 3).map(x => x.s);
  if (!rel.length) return '';
  rel.forEach(s => { s.uses = (s.uses || 0) + 1; });
  return '\n\n[전에 비슷한 작업에서 통한 방식(스킬)]\n' + rel.map(s => `· ${s.name}: ${s.recipe}`).join('\n');
}
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

addSkill('R', 'Next.js 다크모드', '다크모드 추가할 때', 'tailwind darkMode class 설정 + ThemeProvider로 토글, localStorage 저장');
addSkill('R', 'Next.js 다크모드', '다크모드', 'a'); // recipe 너무 짧음 → 무시(기존 유지)
ok(skills.R.length === 1 && skills.R[0].recipe.includes('tailwind'), '같은 이름+짧은 recipe는 갱신 안함');
addSkill('R', 'Stripe 결제연동', '결제 붙일 때', 'Stripe Checkout Session 만들고 webhook으로 결제완료 처리');
ok(skills.R.length === 2, '다른 이름은 추가(2개)');
addSkill('R', 'next.js 다크모드', '', 'darkMode class + next-themes 패키지로 더 간단히'); // 같은 이름(대소문자무시) → 갱신
ok(skills.R.length === 2 && skills.R[0].recipe.includes('next-themes'), '같은 이름(대소문자무시) recipe 개선 갱신');

const rec = recallSkills('R', '스포노노에 다크모드 토글 추가해줘');
ok(rec.includes('다크모드') && !rec.includes('Stripe'), '키워드(다크모드) 관련 스킬만 회상');
ok(skills.R[0].uses === 1, '회상되면 재사용 카운트 증가');
ok(recallSkills('R', '완전 무관한 작업 xyz') === '', '관련 없으면 빈 회상');
ok(recallSkills('없는키', '아무거나') === '', '없는 키 → 빈 회상');

console.log(fail ? '\n❌ 스킬 실패 ' + fail : '\n✅ 스킬 전부 통과');
process.exit(fail ? 1 : 0);
