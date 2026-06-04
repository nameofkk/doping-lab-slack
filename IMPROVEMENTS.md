# 도핑연구소 봇 자율 개선 로그

사용자 부재 중 자율로 버그/개선점을 찾아 고친 기록. 매 iteration: 리뷰 → 안전한 1~3개 수정 → node --check → 배포 → 부팅 확인.

## #1 (배포됨)
- 제작(runWork) 중 Claude 사용량 한도에 걸리면 빈 결과로 "변경 없음" 처리하던 것 → "한도 걸렸어, 안 올렸어" 명확히 안내하고 중단.
- 짧은 인사·맞장구("ㅎㅇ", "ㅇㅋ" 등)는 분류기(haiku) 호출 없이 바로 잡담 처리 → 사용량 절약.

## #2 (배포됨)
- liveCheck: Railway 라이브가 배포 직후 준비 안 됐을 수 있어 빈 화면을 찍던 문제 → 라이브 URL이 응답할 때까지 최대 60초 대기 후 촬영.
- captureShots 고정 파일명(/tmp/shot_d.png) → 동시 빌드 시 스크린샷이 서로 덮어쓰던 버그 → dir 기반 고유 prefix로 분리.
- prefix 계산의 연산자 우선순위 버그('shotundefined' 가능) 같이 수정.

## #3 (배포됨)
- "배포해줘"/"(레포) 재배포"가 안내문만 띄우던 걸 → 실제로 해당(또는 직전) 레포를 클론해서 Railway에 재배포하게 구현.
- runReport도 조사 중 한도에 걸리면 명확히 안내하고 중단(다른 모드들과 일관).

## #4 (배포됨)
- 동시 작업 충돌: 한 채널에서 무거운 작업(work/report/debate)이 도는 중에 새 요청이 오면, 진행상태(activeWork)를 덮어쓰고 두 개를 동시에 돌리던 걸 → "지금 ~하는 중, 끝나고 할게"로 안내하고 새로 시작 안 함. (classifier 경로)
- seen 메모리: 800개 초과 시 전체 clear(직전 메시지 재처리 위험)하던 걸 → 가장 오래된 것만 지우고 최근 400개 유지.
- ensureMembers는 이미 joinedChannels 선등록 + try/catch라 재시도/스팸 없음 → 손댈 것 없음(확인).

## #5 (배포됨) — 사용자 "다음 단계 다 해"
- 동시작업 가드를 헬퍼(guardBusy)로 빼고 명령 경로(작업:/기획:/마케팅/재배포)에도 전부 적용 → 어느 경로로 들어와도 진행 중이면 새 작업 안 겹침.
- 의존성 점검 기능 추가: "(레포) 의존성 점검" → 클론해서 npm audit(취약점) + npm outdated(오래된 패키지) 리포트.
- restart 명령은 이미 BUILDS_PROJECT_ID 링크 + RAILWAY_TOKEN= 무력화로 견고 → 변경 없음(확인).

## #6 (배포됨) — "안된 것들 직접 다 하기"
- Railway 자동배포 실전 검증 → 진짜 버그 발견·수정: `railway add`가 대화형으로 멈춰서 컨테이너에서 무한대기할 뻔. `up --service`가 서비스 자동생성하므로 add 제거, 모든 railway 명령에 </dev/null로 멈춤 방지. doping-portfolio 실제 배포 성공(HTTP 200): https://doping-portfolio-production.up.railway.app
- 의존성 자동 업데이트 명령("(레포) 의존성 업데이트") → 안전 업데이트 후 빌드확인 + PR.
- DodoPayments 결제 훅: 유료 기능 빌드 시 DodoPayments 연동(DODO_API_KEY 있으면 실연동, 없으면 UI+TODO).
- ASSET_RULE: 게임/비주얼 프로젝트는 대충 도형 금지, CC0 고품질 팩(Kenney 등) 받아쓰거나 디테일 SVG/스프라이트, ASSETS.md 기록, 스크린샷 검증.
- CS 폼: Slack webhook이면 no-cors POST로 보내게 빌드 규칙 보강.

## #7 (배포됨)
- pending project 30분 타임아웃: planQuestions 후 30분 이상 무응답이면 대기 컨텍스트를 자동 정리 → 오래된 질문에 새 메시지가 엉뚱하게 "답"으로 처리되던 UX 버그 수정.
- "중단" 핸들러 개선: 진행 중인 작업/대기 중인 질문이 없을 때 "중단" 하면 workCancel 플래그를 true로 남기지 않음 → 다음 스케줄 작업이 stale 플래그에 걸려 취소되던 버그 수정. pendingProject도 함께 정리.
- ROLE_MAP 직원 이름 키 추가: "한로로:", "아이유:", "정소민:", "윈터:", "우정잉:", "영듀:", "안다연:" 등 이름으로 시작하는 보고 줄도 distributeReport가 잡게 수정 → Claude가 역할 레이블 대신 이름으로 보고할 때 분배가 안 되던 문제 수정.

## 상태
코드 ⚙️ 주요 런타임 버그 정리됨. 남은 건 사용자 계정 연결(DodoPayments 키·Sentry DSN·애널리틱스·도메인·Slack webhook·files:write)뿐.
