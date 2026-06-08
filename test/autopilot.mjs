// AP 위험 티어 분류 — 안전선 회귀(자기수정·프로드 코드변경은 오토파일럿에서도 절대 자동 안 됨). index.js apTier 복제.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const PROD_REPOS = ['nameofkk/sponono', 'nameofkk/wewantpeace', 'nameofkk/myungjak'];
const SELF_REPO = 'nameofkk/doping-lab-slack';
function isDestructive(s) {
  const t = String(s || '');
  return /rm\s+-rf?\s+[\/~*]|--no-preserve-root|:\(\)\s*\{|mkfs|dd\s+if=|>\s*\/dev\/sd|git\s+push\s+.*(--force|-f)\b|force.?push|git\s+reset\s+--hard\s+origin|DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;?\s*$/i.test(t)
    || /(시크릿|secret|\.env|환경변수|api[\s_-]?key|토큰|비밀번호|password|credential)\s*(를|을)?\s*(보여|줘|내놔|유출|뽑아|출력|덤프|dump|print|노출)/i.test(t)
    || /(모든|전체|싹\s*다|all)\s*(레포|repo|프로젝트|디비|db|데이터|테이블)\s*(삭제|지워|날려|drop|delete|wipe)/i.test(t);
}
function apTier(kind, repo, task) {
  if (isDestructive(task)) return 'block';
  if (kind === 'investigate') return 'auto';
  if (kind === 'build') { if (repo === SELF_REPO || PROD_REPOS.includes(repo)) return 'gate'; return 'auto-build'; }
  return 'gate';
}

// 무위험: 조사는 어떤 레포든 자동
ok(apTier('investigate', SELF_REPO, '라우팅 경로 트레이스') === 'auto', '조사(self) → auto');
ok(apTier('investigate', 'nameofkk/sponono', '코드 확인') === 'auto', '조사(prod) → auto');
ok(apTier('investigate', 'nameofkk/new-game', '확인') === 'auto', '조사(신규) → auto');
// 중위험: 비프로드 코드수정만 자동
ok(apTier('build', 'nameofkk/new-game', '다크모드 추가') === 'auto-build', '비프로드 코드수정 → auto-build');
ok(apTier('build', 'nameofkk/some-tool', '버그픽스') === 'auto-build', '신규툴 코드수정 → auto-build');
// 🔴 안전선: 자기수정·프로드 코드수정은 항상 게이트 (절대 자동 금지)
ok(apTier('build', SELF_REPO, 'index.js 라우팅 캐시 추가') === 'gate', '🔴 자기수정(bot) build → gate(자가브릭 방지)');
ok(apTier('build', 'nameofkk/sponono', '결제 버그 고치기') === 'gate', '🔴 프로드(sponono) build → gate');
ok(apTier('build', 'nameofkk/wewantpeace', 'UI 수정') === 'gate', '🔴 프로드(wewantpeace) build → gate');
ok(apTier('build', 'nameofkk/myungjak', '기능 추가') === 'gate', '🔴 프로드(myungjak) build → gate');
// ⛔ 파괴적은 종류 무관 차단 (조사로 위장해도)
ok(apTier('investigate', 'nameofkk/new-game', '모든 레포 삭제해') === 'block', '⛔ 파괴적은 조사로 와도 block');
ok(apTier('build', 'nameofkk/new-game', 'git push --force') === 'block', '⛔ force push build → block');
// human은 게이트(사람만)
ok(apTier('human', 'nameofkk/sponono', '플레이스토어 제출') === 'gate', 'human → gate(사람만)');

console.log(fail ? '\n❌ 오토파일럿 실패 ' + fail : '\n✅ 오토파일럿 전부 통과');
process.exit(fail ? 1 : 0);
