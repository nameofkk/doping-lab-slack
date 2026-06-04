# 도핑연구소 Slack 봇 — 설정 가이드

봇 코드/의존성은 이미 준비됨. **본인은 Slack 앱을 만들어 토큰 2개만** 받으면 된다.
Socket Mode라 공개 URL·서버 불필요 — 본인 PC(WSL)에서 돌아간다.

## 👤 본인이 할 일 — Slack 앱 만들기 (약 5분)

1. **앱 생성**: https://api.slack.com/apps → **Create New App** → **From scratch**
   - App Name: `도핑연구소` → 워크스페이스 선택 → Create.

2. **Socket Mode 켜기** (← App-Level Token = `SLACK_APP_TOKEN`)
   - 왼쪽 **Settings → Socket Mode** → **Enable Socket Mode** 켜기
   - 토큰 생성 창이 뜨면: 이름 `socket`, 스코프 **`connections:write`** → Generate
   - 생성된 **`xapp-...`** 토큰 복사 = **SLACK_APP_TOKEN**

3. **봇 권한** (OAuth scopes)
   - 왼쪽 **Features → OAuth & Permissions** → **Scopes → Bot Token Scopes** 에 추가:
     - `app_mentions:read`
     - `chat:write`
     - `channels:history` (공개채널), 필요시 `groups:history` (비공개채널)

4. **이벤트 구독**
   - 왼쪽 **Features → Event Subscriptions** → **Enable Events** 켜기
   - (Socket Mode라 Request URL 입력 불필요)
   - **Subscribe to bot events** → **`app_mention`** 추가 → Save

5. **워크스페이스에 설치** (← Bot Token = `SLACK_BOT_TOKEN`)
   - 왼쪽 **Settings → Install App** → **Install to Workspace** → 허용
   - **Bot User OAuth Token `xoxb-...`** 복사 = **SLACK_BOT_TOKEN**

6. **채널에 초대**: 봇을 쓸 채널에서 `/invite @도핑연구소`

7. **토큰 2개(`xoxb-...`, `xapp-...`)를 나에게 주거나** 아래처럼 직접 `.env`에 넣는다.

## ⚙️ (내가 이미 해둠)
- 봇 코드(`index.js`), `package.json`, `.gitignore`, 이 가이드.
- `npm install` (의존성).
- 봇은 `claude` CLI를 **구독 인증**으로 헤드리스 실행 → 전역 도핑연구소 팀(`~/.claude/agents`) 자동 적용.

## 실행
```bash
cd ~/doping-lab-slack
cp .env.example .env      # SLACK_BOT_TOKEN / SLACK_APP_TOKEN 채우기
npm start
```
→ 콘솔에 "⚡ 도핑연구소 Slack 봇 실행 중" 뜨면 OK.
Slack 채널에서: `@도핑연구소 sponono /health 확인하고 보고해줘`
- 스레드에서 이어서 멘션하면 **같은 작업 맥락으로 대화 지속**.

## 사용 팁
- `WORKDIR`(.env)을 작업할 프로젝트 폴더로 지정하면 그 레포 기준으로 일한다.
- `CLAUDE_PERMISSION_MODE=bypassPermissions` 로 하면 완전 자동(주의: 봇이 무인 실행).
- `ALLOWED_SLACK_USER_IDS` 에 본인 Slack ID만 넣으면 다른 사람이 봇을 못 시킨다.
