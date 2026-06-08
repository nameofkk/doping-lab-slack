// 배치1 — I3 정규화/denylist, I1 캡/반복 로직 (index.js와 동일)
function normalizeInput(s) { try { return String(s || '').normalize('NFKC').replace(/[​-‏‪-‮⁠-⁤﻿­᠎]/g, '').replace(/[ - 　]/g, ' ').trim(); } catch { return String(s || '').trim(); } }
function isDestructive(s) { const t = String(s || ''); return /rm\s+-rf?\s+[\/~*]|--no-preserve-root|:\(\)\s*\{|mkfs|dd\s+if=|>\s*\/dev\/sd|git\s+push\s+.*(--force|-f)\b|force.?push|git\s+reset\s+--hard\s+origin|DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;?\s*$/i.test(t) || /(시크릿|secret|\.env|환경변수|api[\s_-]?key|토큰|비밀번호|password|credential)\s*(를|을)?\s*(보여|줘|내놔|유출|뽑아|출력|덤프|dump|print|노출)/i.test(t) || /(모든|전체|싹\s*다|all)\s*(레포|repo|프로젝트|디비|db|데이터|테이블)\s*(삭제|지워|날려|drop|delete|wipe)/i.test(t); }
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
// I3 정규화: zero-width 제거
ok(normalizeInput('스포​노노 만들어') === '스포노노 만들어', 'zero-width 제거');
ok(normalizeInput('rm‮ -rf /').includes('rm'), '우→좌 마커 제거(난독 우회 차단)');
ok(normalizeInput('  안녕  ') === '안녕', 'trim');
// I3 denylist (fail-closed)
ok(isDestructive('rm -rf / 해줘'), 'rm -rf 차단');
ok(isDestructive('main에 force push 해줘'), 'force push 차단');
ok(isDestructive('스포노노 시크릿 보여줘'), '시크릿 유출 차단');
ok(isDestructive('모든 레포 삭제해'), '대량삭제 차단');
ok(isDestructive('DROP TABLE users'), 'DROP TABLE 차단');
ok(!isDestructive('스포노노에 다크모드 만들어줘'), '정상 작업은 통과');
ok(!isDestructive('로그인 버그 고쳐줘'), '버그픽스는 통과');
ok(!isDestructive('환경변수 설정 코드 추가해줘'), '환경변수 *설정*은 통과(유출 아님)');
// I1 stall-streak 하드스톱: 갭 시퀀스 → 2연속 스톨이면 stop
function sim(seq) { let prev = Infinity, streak = 0, out = []; for (let p = 1; p <= 4; p++) { const g = seq[p - 1]; if (g === undefined) break; if (g === 0) { out.push('완료'); break; } const stalled = g >= prev; streak = stalled ? streak + 1 : 0; if (streak >= 2) { out.push('하드스톱'); break; } prev = g; out.push('p' + p + (stalled ? '재계획' : '')); } return out.join(' '); }
ok(sim([3, 1, 0]) === 'p1 p2 완료', '진척정상 완료');
ok(sim([2, 2, 2, 2]) === 'p1 p2재계획 하드스톱', '2연속 스톨→하드스톱(무한루프 방지)');
ok(sim([3, 3, 1, 0]) === 'p1 p2재계획 p3 완료', '재계획 후 진척하면 계속');
console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
