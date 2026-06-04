# 직원을 "진짜 별도 Slack 멤버"로 승격하기

현재는 메인 봇(도핑연구소)이 이름/아이콘만 바꿔 게시(페르소나). 각 직원을 **진짜 별도 멤버**로 만들려면
직원당 Slack 앱을 1개씩 만들어 그 토큰을 Railway에 넣는다. (봇 코드는 이미 지원 — `SLACK_TOKEN_*`)

## 직원 ↔ 환경변수
| 직원 | Railway 변수 |
|---|---|
| PM (기획) | `SLACK_TOKEN_PM` |
| 아키텍트 | `SLACK_TOKEN_ARCHITECT` |
| 악마의 변호인 | `SLACK_TOKEN_DEVIL` |
| 팀장 | (메인 앱이 곧 팀장. 별도로 하려면 `SLACK_TOKEN_LEAD`) |

## 직원 앱 만들기 (직원 1명당, 매니페스트로 빠르게)
1. https://api.slack.com/apps → **Create New App → From an app manifest** → 워크스페이스 선택
2. `manifest-employee.json` 내용을 붙여넣되, 두 군데를 그 직원으로 수정:
   - `display_information.name` → 예: `도핑-PM`
   - `features.bot_user.display_name` → 예: `PM (기획)`  ← 채널에 이 이름으로 뜸
3. Create → **Install to Workspace** → **Bot User OAuth Token `xoxb-...`** 복사
4. 그 토큰을 Railway 변수로:
   ```bash
   cd ~/doping-lab-slack
   railway variable set --service doping-lab SLACK_TOKEN_PM=xoxb-그_직원_토큰
   ```
5. 그 봇을 채널에 초대: `/invite @PM (기획)` (또는 채널 멤버 추가)

PM·아키텍트·악마의 변호인 3명 만들면 → 토론 시 **3명이 각자 별도 멤버로** 채널에서 핑퐁한다.
(토큰을 넣은 직원만 별도 멤버가 되고, 안 넣은 직원은 페르소나로 게시된다.)

> 메인 앱(도핑연구소)에 `chat:write.customize` 권한을 넣으면, 토큰 안 넣은 직원도 이름/아이콘이 구분돼 보인다.
