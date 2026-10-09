import type { Target } from "./types";

export interface CheckResult {
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function checkTarget(target: Target): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(target.url, {
      method: target.method ?? "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(target.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { "user-agent": "cloudflare-ops-monitor/1.0" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const body = target.keyword ? await res.text() : (await res.body?.cancel(), "");
    const latencyMs = Date.now() - started;

    const statusOk = target.expectStatus ? res.status === target.expectStatus : res.status < 400;
    if (!statusOk) {
      const expected = target.expectStatus ?? "2xx/3xx";
      return { ok: false, httpStatus: res.status, latencyMs, error: `HTTP ${res.status} (기대값 ${expected})` };
    }
    if (target.keyword && !body.includes(target.keyword)) {
      return { ok: false, httpStatus: res.status, latencyMs, error: `본문에 "${target.keyword}" 없음` };
    }
    return { ok: true, httpStatus: res.status, latencyMs, error: null };
  } catch (err) {
    const error =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? `타임아웃 (${target.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)`
        : String(err);
    return { ok: false, httpStatus: null, latencyMs: Date.now() - started, error };
  }
}
