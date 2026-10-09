# edge-ops

Cloudflare Workers 기반 인프라/운영용 엣지 서비스.

## 엔드포인트

| 경로 | 설명 |
|------|------|
| `/` | 서비스 이름, 환경 |
| `/health` | 헬스체크 (업타임 모니터링용) |
| `/whoami` | 클라이언트 IP, 응답한 Cloudflare 엣지(colo), 국가 |

## 시작하기

```bash
npm install
npm run dev        # http://localhost:8787
npx wrangler login # 최초 1회, Cloudflare 계정 연결
npm run deploy     # edge-ops.<계정>.workers.dev 로 배포
```

커스텀 도메인에 붙이려면 `wrangler.jsonc`의 `routes` 주석을 해제하고 도메인을 바꾼 뒤 다시 배포하세요.
