# cloudflare-ops

Cloudflare Workers + [Agents SDK](https://developers.cloudflare.com/agents/) 기반 **모니터링 알림 에이전트**.

등록한 URL을 주기적으로(기본 60초) 검사하고, 장애·복구·응답 지연이 생기면 Slack / Discord / Telegram 으로 알립니다.
상태와 알림 이력은 Durable Object(SQLite)에 영구 저장되므로 별도 DB가 필요 없습니다.

## 동작 방식

- `MonitorAgent`(Durable Object)가 `scheduleEvery` 로 스스로 주기 실행
- 연속 `FAILURE_THRESHOLD`회(기본 2) 실패해야 🔴 DOWN — 일시적 오류로 인한 오탐 방지
- 복구되면 🟢 RECOVERED (다운 시간 포함), `slowMs` 초과 시 🟡 SLOW
- 같은 장애에 대해 알림은 한 번만 발송

## 설치 및 배포

```bash
npm install
npx wrangler login

# 시크릿 등록 (사용할 채널만)
npx wrangler secret put API_TOKEN            # 관리 API 인증 토큰 (필수)
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID

npm run deploy
```

로컬 개발: `cp .dev.vars.example .dev.vars` 후 `npm run dev`

## 관리 API

모든 `/api/*` 요청에 `Authorization: Bearer <API_TOKEN>` 헤더가 필요합니다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/status` | 전체 대상과 현재 상태 |
| POST | `/api/targets` | 대상 추가/수정 |
| DELETE | `/api/targets/:id` | 대상 삭제 |
| POST | `/api/check` | 지금 바로 검사 |
| GET | `/api/incidents?limit=50` | 알림 이력 |
| POST | `/api/test-alert` | 알림 채널 테스트 |

```bash
H="Authorization: Bearer $API_TOKEN"
BASE=https://cloudflare-ops.<계정>.workers.dev

curl -H "$H" -X POST $BASE/api/targets -d '{
  "name": "메인 사이트",
  "url": "https://example.com",
  "keyword": "Example Domain",
  "slowMs": 2000
}'
curl -H "$H" -X POST $BASE/api/test-alert
curl -H "$H" $BASE/api/status
```

대상 필드: `name`, `url`(필수), `id`, `method`(GET/HEAD), `expectStatus`, `keyword`, `timeoutMs`(기본 10000), `slowMs`

## 설정 (`wrangler.jsonc` → `vars`)

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `CHECK_INTERVAL_SECONDS` | 60 | 검사 주기 (최소 30) |
| `FAILURE_THRESHOLD` | 2 | DOWN 판정까지 연속 실패 횟수 |
| `MONITOR_TARGETS` | `[]` | 최초 기동 시 등록할 대상 JSON 배열 |

커스텀 도메인에 붙이려면 `wrangler.jsonc`의 `routes` 주석을 해제하세요.
