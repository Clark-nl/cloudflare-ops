import { getAgentByName } from "agents";
import type { Target } from "./types";
import type { Env } from "./types";

export { MonitorAgent } from "./monitor-agent";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function authorized(request: Request, env: Env): boolean {
  // API_TOKEN 이 없으면 로컬 개발(wrangler dev)에서만 허용
  if (!env.API_TOKEN) return env.ENVIRONMENT === "development";
  return request.headers.get("authorization") === `Bearer ${env.API_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/health") return json({ status: "ok", time: new Date().toISOString() });
    if (pathname === "/") return json({ service: "cloudflare-ops", environment: env.ENVIRONMENT });
    if (!pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

    const agent = await getAgentByName(env.MonitorAgent, "default");

    try {
      // GET  /api/status            현재 상태
      // POST /api/targets           대상 추가/수정 { name, url, expectStatus?, keyword?, timeoutMs?, slowMs? }
      // DELETE /api/targets/:id     대상 삭제
      // POST /api/check             지금 바로 검사
      // GET  /api/incidents?limit=  알림 이력
      // POST /api/test-alert        알림 채널 테스트
      const [, , resource, id] = pathname.split("/");
      const method = request.method;

      if (resource === "status" && method === "GET") return json(await agent.getStatus());
      if (resource === "targets" && method === "POST" && !id) {
        const body = (await request.json()) as Partial<Target>;
        return json(await agent.upsertTarget(body), 201);
      }
      if (resource === "targets" && method === "DELETE" && id) {
        return (await agent.removeTarget(decodeURIComponent(id)))
          ? json({ deleted: id })
          : json({ error: "not found" }, 404);
      }
      if (resource === "check" && method === "POST") return json(await agent.runChecks());
      if (resource === "incidents" && method === "GET") {
        return json(await agent.getIncidents(Number(url.searchParams.get("limit")) || 50));
      }
      if (resource === "test-alert" && method === "POST") {
        const failed = await agent.sendTestAlert();
        return json({ sent: failed.length === 0, failed }, failed.length ? 502 : 200);
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  },
} satisfies ExportedHandler<Env>;
