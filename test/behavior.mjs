// P1 행동 eval — 단언 predicate가 classifyIntent 출력에 올바르게 pass/fail 내는지(순수로직). 실제 모델 호출은 런타임 runBehaviorCheck가 함.
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };

// index.js BEHAVIOR_ROUTE의 ok() 복제
const P = {
  bareVerify: r => !((r.action === 'report' || r.action === 'work') && ['sponono', 'wewantpeace', 'myungjak'].includes(r.repo)),
  sponoReport: r => r.action === 'report' && r.repo === 'sponono',
  build: r => r.action === 'work' && (r.newProject === true || r.repo === 'new'),
  newNoGuess: r => (r.newProject === true || r.repo === 'new') && !['sponono', 'wewantpeace', 'myungjak'].includes(r.repo),
  chat: r => r.action === 'chat',
  unknownOrChat: r => r.repo === 'unknown' || r.action === 'chat',
};

// "더 검증"이 엉뚱한 레포 조사로 분류되면 FAIL이어야(=predicate false)
ok(P.bareVerify({ action: 'report', repo: 'myungjak' }) === false, '"더 검증"→myungjak 조사면 행동eval이 잡아냄(fail)');
ok(P.bareVerify({ action: 'chat' }) === true, '"더 검증"→chat이면 통과');
ok(P.sponoReport({ action: 'report', repo: 'sponono' }) === true, 'sponono 조사 통과');
ok(P.sponoReport({ action: 'work', repo: 'sponono' }) === false, 'sponono인데 work면 잡음');
ok(P.build({ action: 'work', newProject: true, repo: 'new' }) === true, '신규 빌드 통과');
ok(P.build({ action: 'report' }) === false, '빌드 요청인데 report면 잡음');
ok(P.newNoGuess({ newProject: true, repo: 'new' }) === true, '신규(new) 통과');
ok(P.newNoGuess({ newProject: true, repo: 'myungjak' }) === false, '신규인데 기존레포 추측이면 잡음(추측금지)');
ok(P.chat({ action: 'chat' }) === true, '자기질문 chat 통과');
ok(P.chat({ action: 'report', repo: 'sponono' }) === false, '자기질문이 조사로 새면 잡음');
ok(P.unknownOrChat({ repo: 'unknown' }) === true, '불명확→unknown 통과');
ok(P.unknownOrChat({ action: 'report', repo: 'sponono' }) === false, '불명확인데 특정레포 추측이면 잡음');

// 날조 판정 로직 — 빈데이터 응답에 수치 있으면 fail(단 "미측정" 명시면 통과)
const fab = txt => !/\d+\s*(%|명|원|건|달러|\$|k\b)/i.test(txt) || /미측정|없|수집\s*안|데이터\s*없/.test(txt);
ok(fab('가입자·매출 전부 미측정이라 현황을 말할 수 없어.') === true, '"미측정" 명시 → 통과');
ok(fab('가입자 1,200명에 매출 340만원이야.') === false, '빈데이터에 수치 지어내면 잡음(fail)');
ok(fab('데이터가 없어서 판단 불가.') === true, '데이터 없다고 하면 통과');

console.log(fail ? '\n❌ behavior 실패 ' + fail : '\n✅ behavior 전부 통과');
process.exit(fail ? 1 : 0);
