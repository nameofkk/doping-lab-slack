# 도핑연구소 멀티에이전트 봇 — Railway 24/7 컨테이너.
# claude CLI를 구독 토큰(CLAUDE_CODE_OAUTH_TOKEN)으로 헤드리스 실행.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY index.js ./

ENV WORKDIR=/app
# 필요한 런타임 env (Railway 변수로 주입):
#   CLAUDE_CODE_OAUTH_TOKEN  (claude setup-token 으로 발급한 구독 토큰)
#   SLACK_BOT_TOKEN, SLACK_APP_TOKEN
#   (선택) SLACK_TOKEN_PM / _ARCHITECT / _DEVIL / _LEAD  ← 직원별 진짜 멤버
CMD ["node", "index.js"]
