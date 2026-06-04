
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
