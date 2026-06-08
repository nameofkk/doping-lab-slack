
## QA 세션 (사용자 부재중 시나리오 테스트, 배포 보류 — 한꺼번에 배포 예정)

### #1 stop-word 과잉매칭 [수정함]
- 증상: "중단했던 거 이어서 만들어줘"→STOP, "스톱워치 기능 추가"→STOP, "그만 좀 멋지게"→STOP, "아니야 그건 빼고"(수정)→STOP
- 원인: stop 정규식이 문장 속 부분일치까지 잡음
- 수정: isStopMsg() — 명확한 중단 명령(짧거나 정확히 일치)일 때만. pending-cancel도 동일 적용.
- 검증: 로컬 시나리오 테스트로 6케이스 통과 확인.

### 다음 점검 후보
- "중단했던 거/이전 거 다시 이어서" → 지금은 classifier→newProject(새 레포 또 만듦). 진짜 "이어서"(중단된 기획/작업 재개) 미구현. resume 기능 필요.
- 작업 중 "얼마나 남았어?/됐어?" → classifier→chat 가는데, 진행상황 인디케이터 있으니 OK인지 재확인.
- runReport/runDebate 한도·에러 엣지, 동시 다발 메시지, 권한 게이트 중 작업요청 등.

### #2 "이어서/다시 진행"이 재개가 아니라 새 작업(중복 레포) [수정함]
- 증상: 중단 후 "이어서/이전 거 다시 진행"하면 새 레포를 또 만들고 원래 작업 컨텍스트 유실.
- 수정: 중단 시 작업 컨텍스트를 pausedWork에 저장 → "이어서/계속/마저/다시 진행/이전 거"면 그 컨텍스트로 재개. 레포 생성됐으면 newProject=false로 기존 레포에서 이어가(중복 생성 방지).

### #3 extractRepo 오탐 [수정함]
- 증상: "client/server 구조", "24/7", "and/or", "TCP/IP", "A/B 테스트", "i/o" 등이 레포로 오인식 → 엉뚱한 레포 클론 시도/실패.
- 수정: owner/repo 패턴을 소유자 명시(nameofkk/) 또는 레포명에 하이픈/숫자 있는 진짜 레포꼴만 잡게 좁힘. 9개 오탐 케이스 (null) 확인, 실제 레포 4개 정상.

(누적 커밋만, 배포는 사용자 복귀 후 한꺼번에)

### #4 [치명적] 피드백 기능이 채널을 벽돌화 [수정함]
- 증상: activeWork가 스테일(작업 안 도는데 잡힌 상태)이면 모든 메시지가 "반영할게 (N개 대기)"로만 먹히고 아무것도 실행 안 됨. "중단"도 안 풀림 → 영구 막힘.
- 원인: (1)중단이 activeWork를 안 비움 (2)피드백 캡처가 raw.length>14면 무조건 잡아서 원문 재전송·새 명령까지 삼킴 (3)스테일 activeWork 회수 없음.
- 수정: 중단 시 activeWork=null+feedback=[] 즉시 해제 / 12분 넘은 activeWork 자동 해제 / 피드백은 명확한 수정신호일 때만 + 제작·만들·시작·진행으로 시작하는 새명령 제외 + 중복 방지 + "(N개 대기)" 표기 제거.

### #5 같은 질문 반복 + "다시 진행" 재기획 안 함 [수정함]
- 증상: 같은 신규요청을 재전송하면 똑같은 확인질문을 매번 다시 물음. "이전 거 다시 진행"이 재개 아니라 새 작업(문서만 작성)됨.
- 수정: startWork에서 이미 pendingProject(질문 대기중)이면 재질문 안 하고 "답해주면 갈게"로 안내. 재개 인식 정규식을 "이전에/전에/아까 하던 거", "하던 거 그대로/다시"까지 확장.

### #6 스케줄 오등록 + PRD 점수파싱 누락 [수정함]
- 스케줄: "매일 쓰는 앱 만들어줘"가 매일 때문에 일일 스케줄로 오등록되던 거 → 신규제작 신호(만들/제작/개발/구현/짜줘) 있으면 스케줄에서 제외. "하루한번 점검"은 정상 포함되게 게이트 단순화(daily||ims).
- PRD 점수: "완성도: 95%"만 잡고 "완성도는 95%/완성도 약 88%/완성도 92점"은 못 잡아 무한 라운드 → 정규식 완화(완성도+최대5자+숫자+%|퍼센트|점). 6케이스 검증.

### #7 pickPersona "이유" 충돌 + redeploy 모노레포 [수정함]
- pickPersona: "이거 안 되는 이유 알려줘" 등 일반 단어 "이유"가 아이유(리서처)로 오호명 → 아이유 kw에서 이유 제거(아이유/리서처/리서치만). (서버→윈터, 화면→정소민, 디자인→정소민은 토픽상 맞아 유지)
- redeploy: sponono/wewantpeace/myungjak(모노레포·전용 파이프라인)에 railway up 통째로 돌면 깨짐 → 그 레포는 "자기 배포방식 따로 있다"고 안내하고 시도 안 함.

### #8 addRule "앞으로/항상" 오발동 [수정함]
- 증상: "앞으로 어떻게 할까", "앞으로 뭐 만들까?", "앞으로의 계획 짜줘", "항상 느린 이유가 뭐야" 같은 질문/작업요청이 앞으로/항상 때문에 영구 규칙으로 잘못 저장됨.
- 수정: 질문어(?,할까,어때,어떻게,왜,뭐,는지 등)나 작업동사(짜줘,만들어,제작,개발해,그려줘)가 있으면 규칙 저장 안 함. 지시문("앞으로 거짓보고 하지마", "항상 반말로 해줘")만 규칙으로.
- 점검완료(이상없음): workCancel은 runWork 시작 시 false로 리셋돼 잔류 없음. 읽기전용 명령(서비스목록/사용량/헬스체크)은 작업중에도 피드백/guardBusy에 안 막히고 동작. distributeReport는 ROLE_MAP 키만 게시해 코드블록/일반문장 오파싱 없음.

### #9 runDebate가 "중단"·한도에 안 멈춤 [수정함]
- 증상: 토론(기획:/토론:)이 TEAM 8명 x ROUNDS = 16+ 호출인데 루프에 workCancel·한도 체크가 없어 "중단"해도 끝까지 돌고, 한도 걸려도 계속 시도.
- 수정: 각 발언 전 workCancel 체크해 즉시 멈춤("토론 중단했어"), 한도(limited)면 안내하고 종료. (runPRD엔 있었는데 runDebate엔 누락이었음)
- 점검완료(이상없음): recentCtx — 진행인디케이터/업로드는 postAs 안 거쳐 컨텍스트 오염 없음, 25개 슬라이스 정상. 태스크 정규식 "태스크추가"(공백없음)도 \s* 로 매칭됨. 채널별 상태(activeWork 등) key 격리 정상.

### #10 PR 브랜치명 충돌 + runReport 종합 중단 누락 [수정함]
- 브랜치: PR 경로 브랜치명이 doping/{workSeq}인데 재시작하면 workSeq=0부터라 같은 이름 재사용 → 리모트에 이미 있으면 push 실패 → 시각 꼬리표 붙여 유니크화.
- runReport: 팀장 최종 종합 직전에 workCancel 체크 추가(중단 시 종합 안 함). 안다연 반론은 이미 체크 있었음.
- 점검완료(이상없음): qaGate/verifyBuild는 빌드 통과 후 짧게 도는 단계라 중단 누락 영향 작음(다음 작업 시 workCancel 리셋). startProgress chat.update 실패는 try/catch로 무시되고 done()이 finally에서 정리. selfHeal은 5분/30분 쿨다운 + activeWork 가드로 재진입 안전.

### #11 클론 실패 안내 친절화 [수정함] + 마무리 스윕 결과
- clone 실패 시 레포 이름 확인 안내 추가(없는 별칭에 nameofkk/ 붙여 실패한 경우 사용자가 원인 파악 쉽게).
- 점검완료(이상없음): PR 생성 실패→"(브랜치: ...)" 폴백 있음. classifyIntent JSON파싱 실패→{action:chat} 폴백 있음. startSchedule는 부팅 시 loadSchedules 1회만 호출돼 timer 중복 없음. 빈 메시지→if(!raw)return, 이모지/초장문→classifier/feedback로 안전. guardBusy는 pending 중엔 activeWork 없어서 안 뜨고 pending-dedup가 안내. jobFor가 죽은 채널/레포 가리켜도 postAs try/catch로 조용히 실패(크래시 없음).

## QA 한 바퀴 완료
실버그 11건 수정(stop-word/재개/extractRepo/피드백벽돌화/질문반복/스케줄오등록/PRD점수/pickPersona/redeploy모노레포/addRule/runDebate중단/PR브랜치충돌/클론안내). 나머지 점검 영역은 모두 폴백 정상(이상없음). 더 이상 명백한 신규 버그 안 보임 → 저빈도 감시 모드로 전환. 전부 커밋만, 배포는 사용자 복귀 후 한꺼번에.

### 저빈도 감시 틱1: 이상없음
- 영어혼용/짧은명령/특수문자/이모지 → classifier 안전. 콤보("마케팅 어떻게+배포")는 REPORT 우선. 멀티라인 "기획:\n..." 붙여넣기는 토론명령 오인 안 함(정규식 $ 앵커). 새 버그 없음, 코드 변경 없음.

### #12 [보안] git commit 메시지 셸 인젝션 [수정함]
- 증상: 제작 후 git commit -m "도핑연구소: ${task}"에서 task의 백틱/$가 안 막혀서, task에 백틱·$(...)이 있으면 bash 명령치환 실행됨(보안 위험) + 일반 백틱도 커밋 깨짐.
- 수정: 커밋 메시지에서 셸 위험문자(백틱 $ " \ ! ; | & <> ()) 제거 후 사용. clone의 repo/target은 extractRepo/resolveRepo가 단어·점·하이픈·슬래시만 허용해 안전(확인).
- 검증: "게임 \`whoami\` \$(id) 만들어; rm -rf x" → "게임 whoami id 만들어 rm -rf x"로 무해화.

### #13 curl URL 셸 인터폴레이션 방어 + 인젝션 스윕 결과 [수정함]
- waitHttp/checkServices의 curl ${url}을 작은따옴표로 감싸 셸 분리(url은 railway/localhost 시스템생성이라 위험 낮지만 방어적). 따옴표 자체는 제거.
- 점검완료(이상없음): railway svc명은 [^a-zA-Z0-9-] 제거로 안전. clone repo/target은 extractRepo/resolveRepo가 단어·점·하이픈만 허용. 코드zip/스크린샷 파일경로는 sanitize된 basename. ghPost는 JSON.stringify라 셸/인젝션 무관. captureShots url은 playwright goto(셸 아님). pickPersona kw에 app/web 같은 흔한 영단어 없음(UX/PM만, 빈도낮음).

### #14 스테일 pausedWork → 엉뚱한 "이어서" [수정함]
- 증상: 작업A를 중단(pausedWork=A) 후 작업B를 새로 하면, pausedWork에 A가 남아 나중에 "이어서" 하면 B가 아니라 옛날 A가 재개됨.
- 수정: launchWork(새 작업 시작) 시 pausedWork[channel] 삭제 → 새 작업이 시작되면 옛 중단작업은 잊음.
- 점검완료(이상없음): resolveR("__named__")는 named가 truthy일 때만 설정돼 null 위험 없음. 스케줄 work는 forcePR=true로 자율변경 안전. selfHeal 대상(doping-lab-slack)은 build/index.html 없어 verifyBuild→liveCheck 안 돎(배포·스크린샷 시도 안 함). mention은 launchWork에서 by 스냅샷.

### 저빈도 감시 틱5: 이상없음
- persist load 폴백·botClient 할당순서·세마포어 release·distributeReport/ROLE_MAP·MAX_CLAUDE큐 전부 정독 확인. 새 버그 없음, 코드 변경 없음.

### #15 주기 스케줄 오등록 — 동사 없이 제품명사로 끝나는 빌드 요청 (저빈도 감시 틱6)
- 증상: "매주 장보기 리스트 앱"처럼 만들/제작 동사 없이 제품명사(앱/사이트/게임 등)로 끝나는 신규 빌드 요청이, 매주=interval 매칭 + 빌드동사 부재로 스케줄 게이트를 통과 → 매주 반복 스케줄로 잘못 등록될 수 있었음.
- 수정: 스케줄 게이트에 `!/(앱|어플|사이트|웹사이트|홈페이지|랜딩|게임|서비스|플랫폼|툴|봇)\s*$/` 가드 추가. 주기 스케줄은 항상 동작동사(점검/백업/올려/PR/업데이트/봐줘)로 끝나므로 정상 케이스는 영향 없음.
- 검증: sched.mjs — 빌드 4종 모두 (not), 정상 스케줄 6종 모두 SCHEDULE 유지. node --check 통과.
- 비고: rule.mjs의 "앞으로의 계획 짜줘"=RULE은 하네스가 stale(실제 index.js addRule엔 짜줘 가드 있음), 봇은 정상.

### #16 parseDaily "밤 12시" 자정 오인 (저빈도 감시 틱7)
- 증상: "밤 12시에 백업" 같은 일일 스케줄이 자정(0시) 아닌 정오(12시)로 등록됨. (밤+h<12→+12 규칙은 h=12에 안 걸리고, 오전12→0 규칙도 안 걸려 12 그대로 남음)
- 수정: `if(/(밤|저녁)/.test(m[1])&&h===12)h=0;` 한 줄 추가. "오후 12시"=정오(12)는 그대로 유지되도록 (밤|저녁)만 대상.
- 검증: 밤12시→0, 오후12시→12, 오전12시→0, 밤11시→23, 저녁7시→19 전부 정상. node --check 통과.

### #17 handoffChecklist 웹앱에 앱스토어 제출 오안내 (틱8, 복귀 후 마무리)
- 증상: 핸드오프 체크리스트가 바 "앱" 단어만으로 "앱스토어·플레이스토어 제출" 항목을 붙임. 이 봇은 Railway 웹 배포라 "웹앱/투두 앱/앱처럼" 같은 웹 프로젝트에도 스토어 제출이 필요하다고 틀리게 안내(할루시성).
- 수정: 명시적 네이티브/모바일/스토어 신호(android·ios·안드로이드·아이폰·모바일·네이티브·react native·flutter·expo·apk·앱스토어·플레이스토어·스토어 제출/출시/등록)일 때만 붙이고, 웹앱/web app/pwa는 제외.
- 검증: 웹앱·앱처럼·PWA·랜딩 → 미부착 / 안드로이드·아이폰·모바일·flutter·플레이스토어 → 부착. node --check 통과.
- 점검했고 이상없던 곳: classifyIntent의 bot/unknown 분기(resolveRepo bot→doping-lab-slack, unknown은 물어보거나 lastRepo), 마케팅 생성게이트↔REPORT(known) 경계(부정어+순서로 정상 분리), extractRepo 영문 오탐 가드(client/server·24/7·TCP/IP·"AI 앱" 전부 null).

## 실사용 로그 기반 — 기획→제작 레이스 치명버그 (복귀 후, 몽유병친구들 케이스)
사용자 증상: 기획(PRD 97%)→제작 들어갔는데 봇이 "작업이 너무 오래 걸려서 풀어둘게" 하고 놔버림 → 근데 실제 작업은 백그라운드에서 계속 돌아 완성됨(레이스) → "다시 해" 하니 기획 안 이어가고 새 작업으로 분류 → PRD 날아가고 질문 또 함. "기획하고 제작하는 꼴을 못 보겠다".

### #18 워치독/스테일해제가 시작시각 기준이라 살아있는 작업을 죽임 (핵심)
- 원인: 25분 워치독(setInterval)과 12분 스테일해제 둘 다 `Date.now()-started`만 봄. 풀게임 PRD 핑퐁(3R×7명+반론+종합)+빌드는 정상적으로 25분 초과 → 살아있는 작업을 죽은 걸로 선언하고 activeWork 비우고 "풀어둘게" 발송. 실제 async runWork는 계속 돌아 "다 끝냈어"까지 감(레이스). activeWork가 비는 순간 동시 새 작업도 가능해져 중복 빌드.
- 수정: 생존신호(heartbeat) 도입. bumpWork(channel)로 activeWork.beat 갱신 — 진행 스피너 timer(12초마다), runPRD 라운드, runDebate 매 발언에서 갱신. 워치독·스테일해제를 `beat||started` 기준으로 바꿈. 정상적으로 오래 걸리는 작업은 beat가 계속 갱신돼 절대 안 끊기고, 진짜 응답 끊긴(beat 12/25분 정지) 것만 풀어줌.

### #19 "다시 해"가 재개로 인식 안 됨 → 새 작업으로 분류
- 원인: 재개 정규식이 "다시\s*진행"만 매칭해서 "다시 해"는 통과 못 함 → classifier로 가서 새 작업 → 기획 다시 안 이어가고 planQuestions 또 물어봄.
- 수정: 재개 트리거에 `^다시(\s*(해|해줘|진행|시작|시켜|돌려|돌려줘))?\s*$` 추가(앵커로 단독/재개동사 동반만). "다시 로그인 만들어줘"·"다시 한번 홀덤 만들자"·"다시보기 추가" 같은 새 작업은 제외. 강한 재개어(이어서/계속/마저)는 무앵커 유지.

### #20 스테일해제·워치독이 pausedWork 미저장 → 풀린 작업 재개 불가
- 원인: 두 자동해제가 activeWork만 비우고 pausedWork 보관을 안 해서, 풀린 뒤 "다시 해/이어서" 해도 이어갈 컨텍스트가 없어 새로 시작.
- 수정: 둘 다 해제 직전 repo 있으면 pausedWork에 보관. 워치독 메시지도 "응답이 끊긴 거 같아서 풀어둘게, 다시 해/이어서 하면 이어갈게"로 명확화.
- 검증: node --check 통과, 재개 정규식 회귀(재개 9종 정상/새작업 5종 제외) 통과. #18은 beat 갱신 경로 정독으로 검증(스피너 timer가 runWork 전구간 12초마다 beat).

### #21·#22 봇 자가수정분 로컬 반영 (배포로 유실 방지)
- 배경: 봇이 "봇 수정해" 요청으로 자기 repo(doping-lab-slack) main에 자가수정 푸시함(ROLE_MAP 이름키, pending 30분 타임아웃). 배포는 로컬을 올리므로 로컬에 없으면 유실됨 → 로컬에 반영.
- #21 ROLE_MAP에 직원 이름키(한로로/로로/김채원/채원/아이유/정소민/소민/윈터/우정잉/정잉/영듀/안다연/다연/반론자) 추가. Claude가 "윈터: …"처럼 이름으로 보고해도 distributeReport 분배 안 끊김. (검증: 바 이름+콜론 매핑 정상)
- #22 pendingProject 30분 만료. 질문 던지고 30분 넘게 답 없으면 대기 컨텍스트 삭제 — 한참 뒤 무관한 메시지를 답으로 오인하던 UX버그 방지.

## #23 빈 껍데기 + 거짓완료 (몽유병친구들 검토에서 발견 — 가장 큰 구현 실패 원인)
실증거: sleepwalking-friends-4 클론 검토 → 서버 로직(worldSimulation/encounter/npc/character, prisma, sockets)은 진짜로 짜였으나, apps/web에 page.tsx가 아예 없어 next build 결과 라우트가 /404 하나뿐. 즉 "라이브 배포 완료"가 실제론 404짜리 빈 앱. 기획 핵심 UX(복귀화면·맵·온보딩·캐릭터생성·행동선택·기억오브젝트) 전부 미구현.
근본원인 3가지:
- A) 제작이 단일 runClaude 1회(9분 캡) — 풀스택 게임 전체엔 부족 → 스캐폴딩만 만들고 종료.
- B) `npm run build` 통과를 완성으로 침 — 빈 Next 앱도 build는 통과 → 거짓 "빌드 통과".
- C) 화면 유무와 무관하게 "다 끝냈어 상용 수준" + 핸드오프 체크리스트 발송 → 거짓 완료 보고.
수정:
- checkAppGaps(dir): Next 앱인데 page 라우트가 0개면(=화면 없음) 빈구멍으로 탐지. (실제 swf 레포로 검증 — 정확히 탐지)
- runWork 연속완성 패스: 신규 풀빌드는 빈구멍 없어질 때까지 최대 3패스 추가 생성("데모·플레이스홀더 금지, 실제 화면·핵심 루프 끝까지"). 하트비트(#18)로 안 끊김.
- 정직한 완료 보고: 빈구멍 있으면 "다 끝냈어" 대신 "⚠️ 미완성 — OO 비어있음, 이어서 채울게"로 바꾸고 핸드오프 체크리스트(상용오픈 신호) 안 띄움. verifyBuild "빌드 통과" 메시지도 빈 앱이면 "껍데기야"로 정직화.
- 검증: node --check 통과, checkAppGaps가 실제 빈 레포에서 GAP 정확 탐지.

### #24 "이어서" 완성 경로 보강 (몽유병친구들 마무리용)
- 연속완성/빈구멍 게이트를 newProject뿐 아니라 uiish(화면작업)에도 적용 → 기존 레포 화면 채우기도 연속완성 패스 돌게.
- "이어서/마저/계속" + 보관작업 없지만 직전 레포 있으면 → 그 레포 미완성분(특히 사용자 화면) 마저 완성. 단 봇 자기 레포(SELF_HEAL_REPO)는 제외(바 "이어서"가 봇 건드는 거 방지).
- 별칭 추가: 몽유병친구들/몽유병/sleepwalking → nameofkk/sleepwalking-friends-4 (이름으로 정확히 지목 가능). 검증: 별칭 해석 정상, 무관어 오매칭 없음.
- 주의(설계상): "X 만들어줘"는 신규레포 강제(직전레포 오염방지 가드) 유지 → 기존 프로젝트 이어갈 땐 "완성/마저/채워" 표현 사용.

### #25 planQuestions가 기존 레포 이어가기에도 질문 + 자기 폴더 탐색해 정체성 혼란
- 증상: "몽유병친구들 화면 마저 완성해줘"에 봇이 "현재 /app엔 도핑연구소 봇 프로젝트가 있는데 sleepwalking 경로 알려달라"는 헛질문. 원인 ①기존 레포 작업(!newProject)인데도 planQuestions 발동 ②planQuestions의 haiku가 cwd(/app=봇 자기 디렉토리)를 탐색해서 "현재 프로젝트가 봇"이라고 혼동.
- 수정: ①startWork에서 planQuestions는 newProject일 때만 — 기존 레포 작업·이어가기·완성은 질문 없이 바로 진행. ②planQuestions 프롬프트에 "파일시스템·현재 폴더 보지 말고 요청 텍스트만 보고 판단, 프로젝트/레포/경로/현재코드는 절대 묻지 마(시스템이 이미 정함)" 강제.
- 검증: node --check 통과. (레포 해석은 정상이었음 — extractRepo가 몽유병친구들→sleepwalking-friends-4 정확 매핑, 질문만 군더더기였음)

### #26 타임아웃을 "바빠서 좀 있다 답할게"로 위장 (사용자: "한로로가 왜 바쁘대?")
- 증상: 작업 중 한로로가 "어 지금 딴 거 하느라 바빠서, 좀 있다 답할게" — 사용자 무시처럼 보이고 오지 않을 후속 약속까지.
- 원인: runClaude 타임아웃(SIGKILL) 폴백 텍스트가 그 캐주얼 멘트로 박혀 있었음. 실패(시간초과)를 게으름/딴짓으로 위장 + 거짓 후속약속.
- 수정: 폴백을 정직하게 — "(처리가 제한시간 넘겨 한 번 끊겼어, 게으름 아니라 응답이 길어진 거야, 다시 시도해줘)". 거짓 약속 제거.

### #27 타임아웃 과다 (사용자: "타임아웃이 너무 많은데 왜?")
- 원인: ①기본 타임아웃 150초가 빡빡(특히 opus 한로로) ②figma MCP를 모든 claude 호출마다 로드 — 분류·잡담·PRD·리포트 등 figma 안 쓰는 호출까지 매번 figma-developer-mcp 서브프로세스 띄우는 순수 오버헤드 ③MAX_CLAUDE=3 동시실행 + 빌드/플레이라이트 CPU 경합.
- 수정: ①기본 타임아웃 150→240초(opus 헤드룸). ②runClaude에 useMcp 인자(기본 false) — figma MCP는 실제 제작 호출(메인 생성·연속완성)에만 붙이고 나머지(분류·잡담·리포트·PRD·토론·리뷰)는 MCP 안 띄움. 잦은 짧은 호출의 startup 비용 제거.
- 검증: node --check 통과. (③ 동시성은 PRD는 순차 실행이라 영향 적어 유지)

## 자율루프 2회차 (배포권한 있음) — 시작
### 틱1: 에이전트 재현성 검증 + 라이브배포 점검
- ✅ 재현성: 봇이 몽유병친구들 실제 화면까지 제작(QA#23 연속완성 패스 효과) — 직접 클론·빌드·스크린샷으로 확인(홈/온보딩/맵, 라우트 3개 정상).
- ✅ liveCheck 정직성: railwayDeploy 실패 시 url=null로 두고 "라이브 배포 막혀서 공개주소 없어, 고쳐서 다시 올리면 줄게"라고 정직 보고(라인 403). 거짓 라이브 주장 안 함 → 버그 아님.
- ⚠️ 알려진 한계(파킹): Next.js 모노레포(워크스페이스 의존) 웹은 Railway 배포가 신규/기존 프로젝트 양쪽 다 실패. 빌드로그가 계정토큰 GraphQL 403이라 직접 진단 불가 → 무한재시도 금지 원칙대로 보류. 백엔드까지 포함한 제대로 된 배포는 별도 과제.
- 이 틱 코드변경 없음(정직성은 이미 정상). 억지수정 안 함.

### #28 기존 레포 지목 + "만들어줘" → 새 프로젝트로 오인 생성 (자율루프2 틱2, 사용자 핵심불만)
- 증상: "스포노노에 다크모드 만들어줘"처럼 기존 레포를 명시해도 force-new 규칙이 "만들어"만 보고 newProject=true·repo=new로 강제 → 명시 레포(named) 무시하고 새 레포 생성. 사용자가 반복적으로 겪은 "기존 프로젝트인데 새로 만들어버린다".
- 수정: force-new를 강/약 신호로 분리. 강한 신규신호(새 게임/새 앱/새 프로젝트/새로 만/처음부터/오마주/클론)는 명시 레포 있어도 새로. 약한 신호(만들/제작/개발)는 **명시된 기존 레포(named)가 없을 때만** 새로. → "스포노노에 ~만들어줘"=기존 작업, "오마주해서 새 게임 만들어줘"=새로.
- 검증: 기존레포 4종(스포노노 다크모드·버그·명작 공유·몽유병 결제) 전부 기존 유지, 새프로젝트 4종(홀덤·포트폴리오·오마주새게임·처음부터투두) 전부 NEW. node --check 통과.

### #29 제작 중 늦은 피드백 유실 — "반영할게" 거짓약속 (자율루프2 틱3)
- 증상: 사용자가 제작 중 "그거 빼고/바꿔" 주면 봇이 "반영할게"라 하고 feedback 버퍼에 쌓지만, 소비점이 runPRD 라운드(266)와 메인생성 직전(512)뿐이라 **메인 코드생성(~9분) 도중 들어온 피드백은 드레인 뒤라 유실** → 이번 빌드에 반영 안 됨(거짓 약속). 사용자가 겪던 "반영 대기" 헛점.
- 수정: 연속완성 패스(QA#23)에서 매 패스 drainFeedback 해서 늦은 피드백을 실제로 반영. 루프 게이트도 (newProject||uiish||피드백 있음)으로 확장 → 백엔드 작업 등에서도 피드백 있으면 패스 돌려 반영. 빈구멍 없고 피드백도 없을 때만 종료.
- 검증: node --check 통과. 피드백 흐름: PRD중=라운드반영, 메인생성직전=fbBuild, 생성도중/패스간=연속완성 패스에서 반영(신규).

### #30 일일 스케줄이 정확한 분 놓치면 그날 통째 누락 (자율루프2 틱4)
- 증상: 일일 스케줄 실행 조건이 s.hour===n.h && s.minute===n.m (정확한 분 일치). 60초 인터벌이 타이머 드리프트나 짧은 재시작으로 해당 분을 한 번 건너뛰면 그날 스케줄이 영영 안 돌아감(다음날까지 누락). "매일 새벽 3시 점검" 같은 게 조용히 실패.
- 수정: 예정시각(분 단위) 지나고 15분 이내면 따라잡아 1회 실행(lastRunDay로 같은날 중복 방지), 15분 초과면 그날 스킵(엉뚱하게 늦게 도는 것 방지). → 드리프트·짧은 재시작 견딤.
- 검증: 정시·+8·+14분=실행, +20분=스킵, 예정전=대기. node --check 통과. lastRunDay 가드로 윈도우 내 중복실행 없음.

### #31 스케줄 작업이 activeWork 미점유 → 진행중 작업과 동시충돌 (자율루프2 틱5)
- 증상: jobFor가 runWork/runReport를 직접 호출하며 activeWork를 안 잡음. ①스케줄이 사용자 작업 도중 발화하면 같은 채널 동시 빌드(진행 메시지 뒤섞임·리소스 경합) ②스케줄 작업 도는 동안 사용자 메시지가 guardBusy를 통과해 또 새 작업 시작.
- 수정: jobFor가 (a)이미 activeWork 있으면 이번 회차 양보 (b)자기 작업 동안 activeWork 점유(scheduled:true, beat 포함)하고 finally에서 해제. 일일 스케줄 틱도 busy면 lastRunDay 안 박고 다음 틱(15분 윈도우)에 재시도 → 사용자 작업 끝나면 따라잡음.
- 효과: 스케줄↔사용자 작업 동시충돌 제거, 스케줄 작업도 워치독(beat) 적용, daily는 busy여도 윈도우 내 캐치업.
- 검증: node --check 통과. runReport/runWork는 원래 activeWork를 호출측에서 잡으므로 jobFor가 잡는 것과 이중세팅 없음.

### 자율루프2 틱6: 이상없음
- (m)읽기명령(스크린샷/코드줘/헬스체크/사용량): guardBusy로 작업중 차단되거나 순수읽기 → activeWork 안 건드림, 안전.
- (i)재배포: railwayDeploy가 실패를 내부 정직보고(363), 모노레포(sponono/wewantpeace/myungjak) 가드, extractRepo||lastRepo 해석 정상.
- (d)마케팅생성 vs REPORT(known) vs 작업/토론 경계: #28 라우팅 변경 후에도 회귀 없음(route 하네스 확인).
- 관찰(개선 안 함): railwayDeploy 실패→selfHeal 트리거 정규식이 사용자 프로젝트 배포실패에도 발동 가능하나 PR만·쿨다운이라 무해. 코드변경 없음.

### #32 팀 규칙(rulesCtx)이 리포트·PRD 생성/종합에 미적용 (자율루프2 틱7)
- 증상: 사용자 정의 팀 규칙(rules[channel], 예 "마크다운 쓰지마"/"항상 ~형식")이 작업·토론·잡담·PRD라운드엔 적용되는데, (1)메인 runReport 생성(671), (2)팀장 PRD 최종종합(286), (3)팀장 리포트 최종종합(683)엔 누락. 정작 사용자가 제일 많이 읽는 팀장 최종 답변이 규칙 무시 가능.
- 수정: 세 곳 모두 rulesCtx(channel) 주입 → 규칙이 모든 사용자대면 산출물에 일관 적용.
- 검증: node --check 통과. (보안리뷰·빌드수정·분류·규칙확인 같은 내부/기계적 호출은 규칙 무관이라 제외 — 의도적)

### #33 "봇에 X 만들어줘" → 봇 자체수정 대신 새 프로젝트 생성 (자율루프2 틱8)
- 증상: classifyIntent가 봇 자체수정을 repo="bot"으로 정확히 잡아도, force-new(#28)가 "만들어"만 보고 newProject=true·repo=new로 덮어씀. 봇은 extractRepo 별칭에 없어서(챗봇/디스코드봇 오매칭 위험 때문에 의도적으로 제외) named 보호도 못 받아 → "봇에 일정기능 만들어줘"가 엉뚱한 새 레포 생성.
- 수정: force-new 조건에 intent.repo!=="bot" 추가. 분류기가 봇 자체수정으로 판단했으면 "만들어"가 있어도 새 프로젝트로 안 뺌. "챗봇 만들어줘"는 분류기가 repo=new로 주므로 영향 없음(새 프로젝트 유지).
- 검증: 봇수정 3종(봇에 기능/봇 고쳐/봇에 명령어) 전부 봇 유지, 새프로젝트 3종(챗봇/디스코드봇/홀덤) 전부 NEW. node --check 통과. resolveRepo("bot")=nameofkk/doping-lab-slack 라우팅 끝까지 확인.

### #34 PRD 점수 첫 매치 파싱 → 목표치 언급에 조기 제작 (자율루프2 틱9)
- 증상: PRD 완성도 파싱이 .match로 첫 "완성도 NN%"를 잡음. 팀장이 본문에 목표치를 먼저 언급("완성도 98% 목표인데...")하고 마지막 줄에 실제 점수("완성도: 90%")를 쓰면, 98%로 오인해 목표 미달 PRD로 조기 제작 진입 → 기획 덜 된 채 빌드.
- 수정: matchAll로 모든 "완성도 NN%" 중 마지막(=프롬프트가 요구한 맨 마지막 줄의 최종 점수)을 채택.
- 검증: "완성도 98%목표...완성도:90%"→90, "...최종 완성도:97%"→97, "완성도:100%"→100, "88점"→88. node --check 통과.

### 자율루프2 틱10: 이상없음
- mention(channel): activeWork.by||lastRequester[channel] 채널격리 OK.
- registerService: repo키 dedup, url 보존갱신(url||ex.url), created 보존. svcList 채널필터 OK.
- ghPost/ghGet: JSON.parse try/catch→null, req error→null, 비200은 기대필드 없는 객체로 와 호출측 실패처리. graceful.
- uploadCodeZip: tar 120s 타임아웃·45MB 캡·uploadV2 try/catch→false(권한없으면 github.dev 폴백). graceful.
- 관찰(개선 안 함): distributeReport 정규식이 "1. 마케팅: ..." 류 섹션헤더를 역할로 오분배할 이론적 엣지. "역할: 답" 포맷 프롬프트라 실발생 낮아 기록만.

### #35 addRule 길이제한·중복방지 없음 → 프롬프트 토큰 폭증 (자율루프2 틱11)
- 증상: addRule이 raw(전체 메시지)를 규칙으로 저장하는데 개별 길이제한·중복 dedup 없음. "항상" 든 긴 단락이 통째 영구 규칙이 되면 rulesCtx가 모든 작업/리포트/잡담/PRD 프롬프트에 주입되니, 30개×수천자 = 매 claude 호출 토큰 폭증·비용·혼란. 같은 규칙 반복 저장도 누적.
- 수정: addRule에서 (a)개별 규칙 200자 캡+공백정규화 (b)이미 있는 규칙이면 스킵(중복방지). 개수 30 캡은 유지.
- 검증: 중복 1개 제거(4→3), 긴 규칙 200자 캡, 40개→30 캡. node --check 통과.

### #36 selfHeal이 activeWork 미점유 → 자가수정 중 사용자 작업 동시충돌 (자율루프2 틱12, #31과 동류)
- 증상: selfHeal이 runWork를 직접 호출하는데 activeWork를 안 잡음. 시작 전(875)엔 activeWork 체크하지만 자기 runWork 도는 동안엔 activeWork가 비어 있어, 그 사이 사용자 메시지가 guardBusy를 통과해 동시 작업 시작 → 같은 채널 동시 빌드·메시지 뒤섞임. selfHealing 플래그는 다른 selfHeal만 막지 사용자 작업은 못 막음.
- 수정: selfHeal이 runWork 동안 activeWork 점유(selfHeal:true, beat 포함), finally에서 selfHealing=false와 함께 해제. 시작 전 activeWork 체크(875)는 유지되므로 사용자 작업 중엔 selfHeal 안 끼어듦(이중세팅 없음).
- 검증: node --check 통과. 점검 clean: 승인모드 forcePR 일관 라우팅(work/marketing/resume 다 !!settings.approval), selfHeal 쿨다운(30분 동일에러·5분 최소간격)·PR만·자기재배포 안함.

### 자율루프2 틱13: 이상없음
- depUpdate/depCheck: guardBusy 체크 + activeWork 점유 + finally 해제 정상(#31/#36 동시충돌 패턴 아님). beat는 스피너/runWork가 곧 갱신.
- seen 중복방지: size>800이면 오래된 400 삭제·최근 400 유지. 트림 대상은 재전송 불가능한 옛 메시지라 재처리 위험 없음.
- pickPersona: TEAM 순서 첫매치=단일 응답자 선택(설계의도). 복수 호명 시 한 명만 응답은 기능범위.
- distributeReport 0줄 폴백: 호출측(작업 508·리포트 639)이 raw 텍스트로 폴백. OK.
- 코드변경 없음.

### 자율루프2 틱14: 이상없음 → 2연속 무결, 간격 확대
- restart: 대상해석·svc 새니타이즈·실패 정직보고. railway CLI 빠른 호출이라 activeWork 불필요(빌드와 독립).
- usageStat: kstNow 날짜 바뀌면 리셋, calls/limitedHits/outTokens 갱신 정상. 날짜경계 OK.
- captureShots: require(playwright)/launch/goto 실패 모두 rejected→호출측(liveCheck try-catch, 스크린샷 핸들러 .catch) graceful. uploadShot try/catch→false.
- qaGate: placeholder 테스트(no
test specified) 판별해 안 돌림.

## 자율루프2 핵심영역 검증 완료(틱13·14 연속무결): 실버그 9건 수정·배포 #28~#36. 검증 clean 다수. 감시 간격 1500→3600초로 확대(순환 유지).

### 저빈도 순환 틱15: 이상없음 (3연속 무결)
- node --check OK. persist 8종(schedules/memory/rules/settings/tasks/lastrepo/pending/services) 전부 try/catch 손상 폴백 확인.
- ~/qa 하네스 5종(route/extract/sched/persona/rule) 전부 에러·undefined·NaN 없이 정상 — 라우팅 회귀 없음.
- 코드변경 없음. 간격 3600초 유지.

### 저빈도 순환 틱16: 이상없음 (4연속 무결)
- ensureMembers: joinedChannels dedup + invite try/catch(이미멤버·권한없음 무해) graceful.
- checkServices: curl --max-time15 || echo 000(네트워크실패=다운, 크래시X), URL 따옴표 새니타이즈(#13), onlyAlert는 신규다운만 알림. graceful.
- 코드변경 없음.

### #37 빌드 자동수정이 PR/승인모드에서 main 직행 (저빈도 틱17)
- 증상: verifyBuild의 빌드 1회 자동수정이 git push HEAD:WORK_BASE(main) 하드코딩. PR 경로(승인모드 또는 main push 실패 폴백)에서 호출되면 빌드 수정이 PR 브랜치가 아니라 main으로 직행 → 승인모드 우회(미리뷰 코드가 main에 반영) + 정작 PR엔 수정 누락.
- 수정: verifyBuild에 pushRef 파라미터(기본 WORK_BASE). main-성공 경로(544)는 기본값, PR 경로(560)는 branch 전달 → 자동수정이 작업과 같은 ref로.
- 검증: node --check 통과. main 경로 영향없음(기본 WORK_BASE), PR/승인모드는 브랜치로.

## #38 [기능] 토론 결론 액션아이템 → 승인 후 실제 디스패치
- 배경: 사용자 지적 — 토론(runDebate)이 결론·액션아이템을 텍스트로만 뱉고 실제 실행은 0이었음(말만 함).
- 구현: 결론 뒤 extractActionItems로 착수가능 액션 추출·분류(investigate/build/human) → 번호목록 제시 + pendingDispatch에 보관. 사용자가 "실행"/"실행 1,3" 하면(승인 게이트) dispatchActionItems가 조사는 read-only 리포트 한 번에, 코드수정은 forcePR(머지로 또 승인)로 착수. "넘어가"면 폐기. 30분 만료. human(계정·심사 등)은 제외.
- 안전장치: 자동실행 안 함(반드시 승인), guardBusy로 작업중엔 보류, 코드수정은 PR만(main 직행 X), 코드작업 3개 캡.
- 검증: node --check 통과, 트리거 정규식(실행/넘어가/오발동) 검증.

## R1 [기능] 영속 작업 보드(jobs) — fire-and-forget 탈피
- 배경: 레퍼런스 벤치마크 최대 갭 = 작업이 메모리에만 있고 재시작하면 날아가고 현황 조회 불가(Magentic-One 원장·LangGraph 체크포인트).
- 구현: jobs 스토어(/data/jobs.json 영속, 최근200개). createJob/jobUpdate/ensureJob/endJob. work/build/report/debate 라이프사이클 훅 — 생성 시 running, 종료 시 정확한 상태(done/awaiting-approval/limited/cancelled/failed/변경없음). 재시작 시 running/planning→interrupted(awaiting-approval=PR대기는 유지). 슬랙 "작업현황/진행상황/jobs"로 최근 12개 조회(아이콘·타입·경과·산출물링크).
- 효과: 지금 뭐 돌고 끝났는지 실패했는지 재시작에 끊겼는지 한눈에. R2~R5의 토대(원장·resume·계획승인이 이 job 레코드에 얹힘).
- 검증: node --check 통과, createJob/상태전이/재시작 interrupt/보드출력 시뮬 정상.

### R1-fix: 작업현황 명령 한글 미매칭( 워드경계 버그)
- 테스트로 발견: 끝의 가 ASCII 기준이라 한글 "현황" 뒤 경계 없어 매칭 실패 → 작업현황/진행상황/작업보드/작업목록 전부 안 먹히고 "jobs"만 됐음.
- 수정:  제거, 시작앵커+구체구문, 빌드동사(만들/짜/추가/보고서) 동반 시 제외(오발동 방지). 테스트 12케이스 전부 통과.

## R2 Task/Progress 원장 + 재계획 (Magentic-One식)
- 연속완성 패스가 진척(갭 감소) 추적. 직전 패스가 갭 못 줄이면 stalled 판정해 접근전환 재계획 지시 주입. cap 3 to 4. 진행기록을 job 원장에 남겨 작업현황 노출.
- 검증: 스톨 로직 5케이스 전부 통과, node --check 통과.

## R3 Critic 단계 (PR/완료 전 엄격 심사)
- 구현: runCritic — 별도 claude가 요청 충족·빌드·버그/보안·PRD반영을 코드 직접 보고 PASS/FAIL 판정. FAIL이면 지적대로 1회 고치고 재심사(최대 2회). 신규/UI 작업만(작은 수정 제외). 미통과면 완료보고를 정직하게 미완성 표시(거짓완료 방지, 빌드통과 양과 별개로 요청충족 검증).
- 검증: 판정/루프 6케이스 전부 통과, node --check 통과.

## R4 입력 가드레일 (무거운 작업 전 싸게 사전심사)
- 구현: guardrailCheck — startWork 진입 시 haiku가 파괴적(레포/DB 삭제, 시크릿 탈취)·악의적·범위밖 요청을 차단. 그 외 코드/조사/배포는 proceed. 실패 시 fail-open(막지 않음, 가용성 우선). OpenAI guardrails 패턴(싼 모델로 비싼 파이프라인 전에 스크리닝).
- 검증: 판정 파싱 7케이스 전부 통과(refuse만 차단·fail-open·사유전달), node --check 통과.

## R5 계획 미리보기 승인 + 보드 작업 재개
- R5a: "이어서/재개 #N" — 작업보드의 특정 작업 번호로 재실행(끊긴것/실패/완료 다 가능).
- R5b: 승인모드+신규제작이면 만들기 전 계획 6~8줄 보여주고 진행/수정/넘어가 승인. 평소엔 바로 진행.
- 발견·수정: 계획승인 정규식 한글 워드경계(b) 버그(R1과 동일) — 진행/이대로/ㄱㄱ 매칭 안 됨. 끝앵커로 수정. 전수스캔 결과 다른 기능적 인스턴스 없음.
- 검증: 정규식 12케이스 전부 통과, node --check 통과.

## R6 구조화 페르소나 핸드오프 (토론)
- 구현: 각 페르소나가 발언 끝에 구조화 태그(핵심|근거|미해결) 방출 → 파싱해 structured[] 누적. 슬랙 프로즈는 태그 빼고 깔끔하게. 다음 페르소나는 구조화 주장 digest를 입력으로 받고(전문 대신 핵심), 팀장 종합도 구조화 주장을 1차 근거로 소비. 미해결 항목은 액션아이템 후보로 연결.
- 효과: 8개 독백+요약 → 구조화된 주장 핸드오프. 팀장이 전문 재독 대신 핵심 소비(OpenAI/AG2 handoffs 패턴).
- 검증: 태그 파싱/스트립 6케이스 전부 통과, node --check 통과.

## R7 장기 메모리 (mem0식, 레포별 durable 사실)
- 구현: facts 스토어(/data/facts.json, 레포당 40캡·중복방지). extractFacts(haiku)가 작업/조사/토론 끝나고 durable 사실 0~3개 추출·저장. recallFacts(키워드 스코어링)가 작업/조사 시작 시 관련 사실 주입 — 25줄 슬라이딩윈도우 한계 극복(벡터 대신 레포키+키워드, 인프라 0). "기억 목록"/"스포노노 기억"으로 조회.
- 발견·수정: "스포노노 기억"처럼 레포 앞붙은 형태가 명령 미매칭(기억 맨앞 요구). 레포단어 뒤 기억도 잡게 수정, 저장의도(기억해줘/지워/넣어)는 제외.
- 검증: addFact 중복/캡, recall 키워드회상, 명령 8케이스 전부 통과. node --check 통과.

## R8 MCP 툴 플러그인
- 구현: buildMcpConfig — 내장 figma(FIGMA_API_KEY) + 사용자 /data/mcp.json의 mcpServers를 병합해 동적 구성. 툴 추가가 index.js 수정이 아니라 설정으로(claude CLI가 MCP 네이티브). 사용자파일 없으면 기존 figma 단독(하위호환). "MCP 목록"으로 연결툴 조회, "MCP 추가"로 설정법 안내(API키는 👤).
- 검증: 병합/단독/키없음/깨진파일복원/명령 7케이스 전부 통과. node --check 통과. figma만 있을 땐 기존과 동일 동작(저위험).

## R9 durable 실행 (저널 기반 resume — 인프라 0)
- 배경: Temporal 풀버전은 외부서비스/계정(👤). 대신 인프라 없는 저널 방식.
- 구현: runWork가 진행 단계(코드생성/빌드·배포)를 job.stage에 체크포인트. 재시작 시 running→interrupted(R1) + 부팅 8초 후 끊긴 작업을 채널당 1건 자동 알림("이어서 #N 하면 이어갈게", 어디까지 갔는지 표시). resumeNotified로 재알림 방지. 실제 이어가기는 R5a("이어서 #N").
- 한계(명시): /tmp 작업물은 재시작에 소실되므로 resume=재실행(레포 기반 재클론). 진짜 mid-job replay는 Temporal 붙일 때.
- 검증: 알림 선택 5케이스 전부 통과, node --check 통과.

## R10 eval 셋 + 회귀 하네스
- 구현: test/golden.mjs(회귀 잦은 핵심 결정을 index.js 로직 그대로 단언 — extractRepo 오탐/별칭, force-new #28/#33, 스케줄 #15/#16, 한글 \b 회귀 작업현황/진행승인, 마케팅 vs 보고). test/regress.mjs가 golden+jobs+r2/r4/r5/r6/r7 전체를 한 방에 실행·집계, 실패 시 exit 1. package.json "npm run regress" = 배포 전 게이트.
- 효과: 프롬프트/정규식 드리프트를 배포 전에 잡음. 실제로 r7 테스트가 옛 정규식 쓰던 것을 이 하네스가 잡아냄(drift 감지 실증). (테스트는 Dockerfile이 안 복사 — 런타임 무영향, dev/CI 전용)
- 검증: 전체 회귀 통과(exit 0), node --check 통과.

## 개선 배치1 — 안전·비용 토대 (I3+I1+I8)
- I3 입력정규화: 메시지 intake에서 NFKC 정규화+zero-width/비가시/RTL마커 제거(가드레일 우회 난독화 차단).
- I3 fail-CLOSED denylist: rm -rf/force push/git reset --hard origin/DROP TABLE/시크릿 유출/대량삭제는 LLM 가드와 무관하게 결정론적 무조건 차단. 정상작업·환경변수설정은 통과.
- I1 하드캡: job당 토큰 추정 캡(JOB_TOKEN_CAP 90만)+벽시계 캡(20분) 초과 시 연속완성 루프 하드스톱. 2연속 스톨(재계획에도 진척없음)이면 하드스톱 — 2700만 토큰 무한루프류 방지.
- I8 비용추적: job당 토큰 추정 누적, 작업현황 보드에 ~Nk토큰 표시.
- 검증: 정규화·denylist·캡/반복 14케이스 전부 통과. 전체 회귀(golden+i_batch1+R) 통과. node --check 통과.

## 개선 배치2 — I2 critic 그라운딩 + I5 적응형 기획
- I2: runCritic이 자기 의견 말고 실제 npm run build 결과를 1차 ground truth로 받고, 점수 루브릭(요청충족/빌드/정합성/보안/PRD반영 각 0~1, PASS=평균≥0.7 & 빌드=1)으로 판정. 자기선호·장황 편향, "reflection이 오히려 악화" 실패 완화(실행신호 앵커).
- I5: 코드작성은 이미 단일스레드(claude 1개) 유지. 기획(PRD)을 규모별 적응 — scopeOf(task)로 작은 건 핵심 3명·1라운드, 큰 건(실시간/서버/결제/멀티/게임 등 or >120자) 풀 6명·3라운드. 멀티에이전트 ~15배 토큰을 규모에 맞게.
- 검증: scope 6케이스 전부 통과, 전체 회귀 통과, node --check 통과.

## 개선 배치3 — I6 메모리 하드닝 + I4 리스크 티어
- I6: facts에 TTL(90일 자동만료, recall 시 만료 제외·정리)+출처(작업/조사/토론)+근사중복 갱신(superseded). extractFacts가 신뢰소스(봇이 코드/실행으로 확인)에서만 추출. MINJA 포이즈닝·staleness 방어. "기억" 명령에 출처·경과(Nd) 표시.
- I4: riskTier(low/med/high) 함수. 디스패치 액션아이템에 리스크 이모지(🟢🟡🔴) 점진적 공개 — 조사=읽기전용 저위험, 코드수정/배포/삭제=내용따라. 고무도장 방지·뭐가 위험한지 한눈에.
- 검증: TTL/충돌/출처/리스크 4케이스 통과, 전체 회귀 통과, node --check 통과.

## 개선 배치4 — I7 job 격리 + I8 repo-map·정리·골든확장
- I8 repo-map(Aider식): 기존 레포 작업 시 압축 구조 인덱스(소스파일 트리 70개)를 생성 프롬프트에 주입 → 파일 덤프 대신 구조로 그라운딩(할루시↓·탐색토큰↓).
- I7 격리: 작업/조사 후 /tmp 임시 디렉토리 rm -rf 정리(디스크 보호). 기존 격리(작업별 고유 /tmp 디렉토리 + claude를 uid1000·HOME=/tmp로 실행) 확인. **풀 컨테이너 샌드박스(container-use, Docker-in-Docker)는 인프라/계정 필요 → 파킹**(R9 Temporal처럼 스케일 시).
- I8 골든 확장: scopeOf(I5)·기억명령(R7 한글회귀)을 골든셋에 추가. 회귀 게이트 강화.
- 검증: 전체 회귀(golden 확장+i_batch1/3+R) 통과, node --check 통과.

## 개선 8종 완료 요약 (리서치 Top8 반영)
I1 토큰/시간/반복 하드캡 · I2 critic 빌드결과 그라운딩+루브릭 · I3 입력정규화+fail-closed denylist · I4 리스크 티어 점진공개 · I5 규모별 적응형 기획(코드는 단일스레드) · I6 메모리 TTL/출처/충돌 하드닝 · I7 임시 디렉토리 정리(+컨테이너 파킹) · I8 비용추적+repo-map+골든확장. 전부 테스트→배포→회귀게이트 통과.

## 버그픽스 — 일회성 기능변경이 매일 반복 스케줄로 오등록 (wewantpeace 매일10시)
- 증상: "알람을 개별전송→다이제스트 형식으로 변경"이 매일 오전10시 반복 스케줄로 등록됨. 요청에 든 "매일 오전10시"(기능 스펙)를 스케줄 파서가 스케줄 지시로 오인 → 매일 같은 코드변경 재실행. 이미 적용돼 git diff 비어 "변경없었어"인데 페르소나는 한일 보고(모순)+재배포 겹치면 R9 끊김알림.
- 수정: (1)스케줄 게이트에 일회성 변경동사(변경/전환/바꿔/적용/개편/형식으로/방식으로/기능추가) 제외 추가 — 스케줄은 반복 모니터링/유지보수(점검/백업/리포트/업데이트)만. (2)부팅 loadSchedules에서 일회성 기능변경이 반복 work 스케줄로 잘못 등록된 것 자동 제거(이미 등록된 wewantpeace 건 다음 배포 시 자동 purge).
- 검증: 게이트(기능변경 제외/유지보수 유지) + 자동정리 로직 + 골든셋 회귀 추가. 전체 회귀 통과.

## 이상행동 방어 — A(sanity-check)+B(결정로깅)+서킷브레이커 (리서치 검증)
- A 결정론적 확인 티어: 반복 스케줄이 work(코드변경)면 조용히 등록 말고 확인("정말 반복?/1회만/취소"). 리서치 1순위(결정론적 action-tier gate)와 일치. 정규식 의도구분이 아니라 *resolved action의 희소성/위험*으로 게이트.
- B 결정 로깅: 주요 판단(스케줄 등록·작업 신규vs기존·이상행동)을 /data/decisions.json에 기록+console. "결정 로그"/"왜 그랬어"로 조회. 실제 트래픽 감사→골든셋을 진짜 실패에서 키움(리서치 3순위 trace→assertion).
- 서킷브레이커(deadman): 스케줄 work가 "변경 없음"(멱등 재실행)을 2회 연속이면 자동 일시정지+알림. Type-III "unwarranted continuation" 방어(리서치 6순위). wewantpeace 매일10시류를 등록돼도 자동으로 멈춤.
- 검증: 확인응답/로그명령/서킷브레이커 + 전체 회귀 통과. node --check 통과.

## 이상행동 방어 2 — #2 의도-행동 일치 체크 (리서치 최고레버리지)
- intentActionCheck(message, actionDesc): 위험·비가역 행동 직전 별도 haiku가 "사용자 말 vs 내 행동" 일치 판정(MATCH/MISMATCH/UNSURE+질문). 정규식이 못 잡는 의도오해(스펙 속 시각 등)를 일반적으로 방어. 모델 확신도가 아니라 *불일치*로 트리거(과신 회피 — 리서치 1c 경고). 실패 시 MATCH(fail-open).
- 적용(과확인 방지로 드문 행동만): (1)스케줄 등록 — 정규식 게이트+A 결정론 백스톱 위에 LLM 일치체크 추가(이중방어). (2)새 프로젝트 생성 — 기존레포 수정 오인 아닌지 확인, 어긋나면 한 줄 묻고 멈춤(active disambiguation #5). 일반 수정엔 미적용(피로 방지).
- 검증: 파싱(MATCH/MISMATCH/UNSURE·fail-open) + 전체 회귀 통과. node --check 통과.
- 비고: #4 자기일관성 3샘플 투표는 #2 단일 일치체크로 목적 달성(비용 절감), 필요 시 추가.

## 상용 레벨업 Batch A — L1 AGENTS.md 주입 + L2 실제 검증 게이트
- L1: readProjectRules — 레포의 AGENTS.md/CLAUDE.md/.cursorrules/copilot-instructions(nearest-wins) 읽어 작업 프롬프트에 주입. 표준 프로젝트 규칙 반영(상용 에이전트 다 읽는 표준).
- L2: runCritic ground-truth를 빌드만이 아니라 lint·tsc --noEmit·테스트 수트까지 실제 실행해 먹임. "빌드통과 ≠ 동작" 극복(타입에러·테스트깨짐도 critic이 잡음). 검증 항목 하나라도 실패면 점수 0.
- 검증: node --check + 전체 회귀 통과.

## 상용 레벨업 L3 — Block Kit 버튼 승인
- 구현: 메인봇(botClient)이 승인 프롬프트 뒤에 버튼 메시지 게시(페르소나는 별개 토큰이라 라우팅 안 됨). app.action(/^(dispatch|plan|sched)_/)이 클릭 받아 동등 텍스트명령(실행/진행/스케줄등록/1회만/취소/넘어가)을 합성→handle() 재사용. 로직 무리팩터.
- 적용: 디스패치(전부실행/넘어가), 계획승인(진행/넘어가), 스케줄 확인(반복등록/1회만/취소). 텍스트 명령은 그대로 폴백.
- 주의: 버튼 클릭 경로는 라이브 슬랙에서만 검증 가능(로컬 불가) → 텍스트 폴백 유지로 무위험. node --check+회귀 통과. 사용자 클릭 테스트 필요.

## L3-fix: 버튼 [취소]가 전역 중단 핸들러에 잡힘
- 증상(사용자 클릭 테스트로 발견): 스케줄 확인 [취소] 버튼→"취소" 합성→isStopMsg가 먼저 잡아 "작업 없어 풀어놨어"(전역 중단) 응답. 스케줄 취소 핸들러까지 못 감.
- 수정: 중단 핸들러 진입 시 대기 결정(pendingSchedule/Plan/Dispatch) 있으면 그 결정 취소로 처리하고 종료(전역 중단 아님). 버튼 클릭 라우팅 자체는 정상 작동 확인됨(app.action→handle).
- 검증: node --check + 회귀 통과.

## L3-fix2: 버튼 1회용화 + 스테일 클릭 가드 (라이브 연타 버그)
- 증상(사용자 실클릭): [취소]→취소됨 OK, 근데 버튼이 안 사라져 또 눌림→전역중단 "작업 없어" ×2, [1회만] 연타→작업 ×2 시작(중복 디스패치).
- 원인: app.action이 클릭마다 handle 재실행. 버튼이 1회용이 아니었고, 대기결정 사라진 뒤 클릭도 그대로 처리됨.
- 수정: (1) 클릭 즉시 botClient.chat.update로 버튼 메시지를 "✅ 선택: X"로 교체→재클릭 불가. (2) 스테일 가드: action_id 접두사로 pendingDispatch/Plan/Schedule 확인, 이미 비었으면 무시.
- 검증: node --check + 회귀 통과.

## L4: App Home 탭 대시보드
- app.event(app_home_opened) → client.views.publish로 홈 탭에 작업현황/예약스케줄/판단기록/장기기억 한 화면. 채널 명령과 동일 데이터, 읽기전용.
- buildHomeBlocks(): Block Kit header+section+divider+context, 각 섹션 2900자 캡(3000 한도).
- 👤 필요: Slack 앱설정에서 App Home의 Home Tab ON + Event Subscriptions에 app_home_opened 구독. 안 켜져 있으면 views.publish가 조용히 실패(로그만).
- 검증: node --check + 회귀 통과. 실제 홈 렌더는 탭 켠 뒤 사용자 확인 필요(미확인).

## L5: 모델 라우팅 정리
- 흩어진 모델 매직스트링(opus/sonnet/haiku ~16곳)을 MODEL 티어 상수 한 곳으로 통합. env로 티어별 오버라이드(LEAD_MODEL/AGENT_MODEL/FAST_MODEL).
- 정책 명문화: LEAD=통합·최종판단(opus), TEAM=제작·리포트·토론·비평·리뷰·계획(sonnet), FAST=분류·가드·의도일치·질문생성·사실추출(haiku).
- 순수 리팩터(값 동일), 잔여 리터럴 0 확인. node --check + 회귀 통과.

## Q2: 가드레일 — OWASP LLM01 프롬프트 인젝션 (입출력 100%)
- (a) 구조적 분리: wrapUntrusted(s) + UNTRUSTED_PREAMBLE — 원문을 "데이터지 명령 아님" 마커로 격리. 적용: runWork(요청/fbBuild), runReport(요청), chat 페르소나(targeted/random), 규칙(rules). classifier 등 JSON.stringify 판정기는 유지.
- (b) 입력 가드 injectionScan(raw) — 결정론적 fail-CLOSED, handle의 normalizeInput 직후 전 경로(chat/report/work) 공통. 지시무시/시크릿출력/역할탈취/역할혼동 신호. 적중→거부+logDecision(injection-block).
- (c) 출력 검증 scrubOutput(text) — 발신 단일통로 postAs에서 시크릿형(xoxb/xapp/ghp_/github_pat/sk-ant) + 봇 env 실토큰값 동적 마스킹.
- (d) test/redteam.mjs — 28 단언(한/영 인젝션 차단, zero-width 난독, 정상요청 오탐0, 출력 마스킹, isDestructive). regress에 편입.
- 버그 잡음: injectionScan 끝 \b가 한글("이제") 뒤에서 실패(프로젝트 단골 버그) → 제거. 테스트 normalizeInput 복사본이 제어문자 정규식을 ASCII로 깨뜨려 공백 먹던 것 → 실바이트(hexdump) 확인 후 수정.
- 검증: node --check + 전체 회귀 통과(redteam 포함). 라이브 인젝션 재현은 배포 후 사용자 확인 필요(미확인).

## Q1: Evals-in-CI 배포 게이트
- test/trajectories.mjs — 입력→종착 라우팅 결정 단언(14개): "매일 X 형식으로 변경"=자동등록 차단, work 스케줄=백스톱 확인, 점검=등록, 파괴적=거부, 신규vs기존. handle() 결정론 로직 복제(LLM부분은 파라미터 주입).
- package.json: npm run eval(node --check + 전체회귀), npm run deploy(eval && railway up) — eval 실패 시 railway up 차단(&&).
- regress에 redteam+trajectories 편입 → 총 11개 모듈.
- 검증: npm run eval 그린. 이 배포부터 npm run deploy(게이트 경유)로 진행.

## Q3: 관측성 (구조화로그·트레이스·메트릭영속·드리프트알림)
- (a) log(level,kind,fields) JSON 한 줄 로거. job-start/job-end(종착 전이시) 구조화 로그.
- (b) createJob에 trace_id 부여, 로그에 동반 → 이벤트→잡→결과 상관.
- (c) usageStat /data 영속 + N일(30) 롤링 히스토리(loadUsage/persistUsage, 20s 스로틀). "운영 리포트" 명령(7일 호출·실토큰·한도·잡 성공률) + 홈탭 "운영 메트릭" 섹션. 재시작에도 보존.
- (d) 드리프트 알림: 60s 워치독에서 최근1h 잡 실패율>30% 또는 한도걸림≥10 → OWNER_USER_ID DM(1h 쿨다운). OWNER 없으면 스킵.
- 👤: OWNER_USER_ID env + im:write 스코프(알림 DM용).
- 검증: npm run eval 통과. 라이브 메트릭/로그는 배포 후 확인.

## Q4: 신뢰성 (크래시복구·graceful shutdown·서킷브레이커·실토큰)
- (b) graceful shutdown: SIGTERM/SIGINT/uncaughtException 핸들러 → draining=true(새 메시지 차단), 진행 잡 interrupted 표시, persistJobs/Usage/Pending/Schedules/Memory, claude 자식 ~10s 자연종료 대기 후 exit(0). 반쪽 git commit 방지. handle()에 draining 가드.
- (c) 서킷브레이커: claude 연속실패 5회→60s 회로개방, 개방 중 3×재시도 난타 대신 즉시 강등. log(breaker-open).
- (d) 실토큰 회계: runClaudeOnce가 j.usage.output_tokens를 outTokens로 반환→addJobTokens 3곳이 실토큰 우선(없으면 estTokens). 한글 len/4 ~2배오차 제거. JOB_TOKEN_CAP·운영리포트 정확도↑.
- (a) 크래시 복구: graceful shutdown의 interrupted 표시 + 기존 R9 저널(boot resume DM)으로 커버.
- 검증: npm run eval 통과. graceful shutdown 실증은 배포 후 재시작 SIGTERM 로그로 확인.

## A1+A2: 운영 센티넬 — 메트릭 시계열 + 인시던트 메모리
- A1: checkServices가 상태코드·응답지연(ms)·연속실패(failStreak)를 서비스별 링버퍼(최근20)로 services.json에 누적. svcTrend()로 연속다운/지연상승(1.5배&800ms+) 추세 판정. 헬스체크 메시지·홈탭 "🩺 라이브 서비스" 섹션에 노출.
- A2: 다운 시작(downSince/downCode) 기록, 복구 시 "HTTP X로 N분 다운 후 복구"를 facts(svc:repo, source:incident) 저장 + log(incident-recovered). 다음 다운 알림에 recallFacts로 과거 이력 첨부.
- test/sentinel.mjs 7단언(추세 판정) + regress 편입.
- 검증: eval 통과. 라이브 메트릭/인시던트는 헬스체크 실행 후 확인.

## A3: 자율 운영 브리핑
- runOpsBriefing(): services/jobs(7일 실패)/usage(7일)/decisions/인시던트facts 종합 → LEAD 1콜로 "건강·악화·예측·개선후보 1~3" 요약. 읽기전용. 데이터는 wrapUntrusted+UNTRUSTED_PREAMBLE로 격리, 출력 scrubOutput.
- 수동: "운영 브리핑" 명령. 자동: OPS_HOUR 일1회(18h 가드) → 채널 게시 + OWNER DM.
- 검증: eval 통과. 라이브 브리핑은 "운영 브리핑" 쳐서 실데이터 요약 확인 필요.

## A4: 능동 강화 + 개선 제안 게이트
- runImprovementProposal(): 운영데이터(실패잡·판단패턴빈도·서비스)에서 "효과 큰 개선 1영역" + 액션아이템(최대3, investigate/build) 생성 → 기존 pendingDispatch+dispatch_run/skip 버튼 게이트로 발의. 실행은 승인 후 dispatchActionItems(기존). repo=resolveRepo(bot 포함).
- 수동 "개선 제안" 명령 + 주1회(월) OPS루프 자동.
- 능동 강화: 2연속다운+ 서비스는 5분마다 즉시 재확인(시간 안 기다림).
- 서비스 등록/목록 명령 추가(라이브 URL을 센티넬 대상으로). kstNow에 dow 추가.
- 검증: eval 통과. 라이브는 "개선 제안" 트리거 → 제안 버튼 → 승인 시 디스패치 확인.

## A4-fix: 서비스 등록이 Slack <url> 래핑 때문에 work로 오분류
- 증상(라이브): "서비스 등록 sponono https://sponono.com" → 등록 안 되고 백그라운드 work job으로 돌음.
- 원인: Slack이 URL을 <https://...> / <url|텍스트>로 감싸 보내는데 등록 정규식이 못 잡아 분류기로 흘러감.
- 수정: 등록 파싱 전 Slack URL 래핑 해제(replace). sentinel.mjs에 회귀 4단언 추가.
- 검증: eval 통과. 라이브 재등록 필요.

## B1: 스킬 라이브러리 (Voyager 패턴)
- skills.json + addSkill/recallSkills/extractSkill. 성공 작업(runWork, incomplete 아닐 때) → extractSkill로 재사용 레시피 0~2개 추출 저장. runWork 프롬프트에 recallSkills top-3 주입(recallFacts 옆). 재사용 카운트(uses).
- facts(지식)와 별개 skills(실행 노하우). 키워드 회상, 인프라0. 이름 중복=개선 갱신, 캡 30.
- "스킬 목록" 명령 + 부팅 loadSkills. test/skills.mjs 7단언 + regress.
- 검증: eval 통과. 라이브는 비슷한 작업 2건 연속 → 2번째에 스킬 주입(trace) 확인.

## B2: MCP 핫리로드
- addMcpServer(name,config): /data/mcp.json 병합 + buildMcpConfig 재호출(재시작 없이 반영). "MCP 리로드" 명령. MCP 목록/추가 안내를 핫리로드 기준으로 갱신.
- 검증: eval 통과. 라이브 "MCP 리로드" 동작 확인.

## B3: MCP 자동 제안 (화이트리스트 레지스트리)
- MCP_REGISTRY 내장 화이트리스트(postgres/github/sentry/fetch + 필요 키 명시). suggestMcp(task)=트리거 매칭 & 미연결만. 아무 MCP나 자동설치 금지(ServiceNow식).
- startWork 훅: 작업이 후보 매칭하면 1개 비차단 제안(proposeMcp). "MCP 추천" 명령. pendingMcp 게이트 + mcp_add/mcp_skip 버튼 + 텍스트(붙여/넘어가). 승인 시 addMcpServer(B2 핫리로드), 키 필요하면 👤 안내.
- 중단 핸들러 가드에 pendingMcp 포함. test/mcp.mjs 10단언 + regress.
- 검증: eval 통과. 라이브는 "postgres 연동" 류 작업/추천 → 제안 버튼 확인.

## B4: 능동 자기개선 루프
- runSelfImproveScan(): 봇 자체 운영 신호(self/heal/route/schedule/iac/drift 판단 + 최근 실패)를 스캔 → "내 코드(index.js) 개선" 1~3개 제안 → pendingDispatch(repo=SELF_HEAL_REPO) 게이트. selfHeal(에러 반응)의 능동 버전.
- 안전: 실행=조사(읽기)+코드수정(PR). 머지·배포는 사람 + Q1 eval 게이트 통과해야 배포(자기수정 폭주 차단).
- "자기개선" 수동 + 주1회(수) 자동. 개선제안(A4)과 분리(자기/self 키워드).
- 검증: eval 통과. 라이브 "자기개선" → 제안 버튼 확인.

## AP1+AP2: 오토파일럿 토글 + 위험 티어 자동실행
- settings.autopilot[channel] + "오토파일럿 켜/꺼/상태" 명령(canCommand 게이트). 켤 때 위험모델 안내.
- apTier(kind,repo,task): isDestructive=block, investigate=auto, build+비프로드=auto-build, build+self(bot)/prod(sponono/wewantpeace/myungjak)=gate.
- proposeOrAuto(): OFF=기존 버튼게이트. ON=무위험(조사)+비프로드코드 자동 dispatchActionItems(코드는 PR로 머지는 사람=안전판), 고위험은 게이트로 분리. logDecision(autopilot-run)+OWNER DM. AP_BUILD_CAP 일일상한, activeWork 동시성, 작업중이면 게이트로.
- 제안생성기 3개(A4 개선제안·B4 자기개선·runDebate) proposeOrAuto로 통일.
- 🔴 안전선: 자기수정(bot)·프로드 코드변경은 ON에서도 항상 게이트. test/autopilot.mjs 12단언으로 잠금.
- 검증: eval 통과. 라이브 오토파일럿 ON→개선제안→조사 자동실행 / self build 게이트 확인.
