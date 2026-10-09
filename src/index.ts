export interface Env {
  ENVIRONMENT: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/":
        return json({ service: "edge-ops", environment: env.ENVIRONMENT });
      case "/health":
        return json({ status: "ok", time: new Date().toISOString() });
      case "/whoami":
        // 요청이 들어온 Cloudflare 엣지 위치와 클라이언트 정보
        return json({
          ip: request.headers.get("cf-connecting-ip"),
          colo: request.cf?.colo,
          country: request.cf?.country,
        });
      default:
        return json({ error: "not found" }, 404);
    }
  },
} satisfies ExportedHandler<Env>;
