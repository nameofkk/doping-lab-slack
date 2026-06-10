// R10 회귀 하네스 — 배포 전 한 방으로 전체 회귀 감지. node ~/qa/regress.mjs (실패 시 exit 1)
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const tests = ['golden', 'i_batch1', 'i_batch3', 'jobs', 'r2', 'r4', 'r5', 'r6', 'r7', 'redteam', 'trajectories', 'sentinel', 'skills', 'mcp', 'autopilot', 'biz', 'board', 'home', 'sentinel_biz', 'board_progress', 'feedback', 'routing_legal']; // 단언 기반(PASS/FAIL or ❌) 테스트들
let fail = 0;
for (const t of tests) {
  try {
    const out = execSync(`node ${t}.mjs`, { cwd: dir, encoding: 'utf8' });
    const bad = /❌|^FAIL|\bFAIL /m.test(out);
    console.log((bad ? '❌' : '✅') + ' ' + t);
    if (bad) { fail++; out.split('\n').filter(l => /FAIL|❌/.test(l)).forEach(l => console.log('   ' + l)); }
  } catch (e) { console.log('💥 ' + t + ' (실행오류/실패)'); fail++; const o = (e.stdout || '') + (e.stderr || ''); o.split('\n').filter(l => /FAIL|❌|Error/.test(l)).slice(0, 5).forEach(l => console.log('   ' + l)); }
}
console.log(fail ? `\n❌ 회귀 ${fail}개 모듈 실패 — 배포 보류` : '\n✅ 전체 회귀 통과 — 배포 OK');
process.exit(fail ? 1 : 0);
