import { Agent } from "agents";
import { checkTarget } from "./check";
import { sendAlert } from "./notify";
import type { Alert, Env, MonitorState, Target, TargetStatus } from "./types";

export interface Incident {
  id: number;
  target_id: string;
  target_name: string;
  kind: string;
  message: string;
  created_at: string;
}

const MAX_INCIDENTS = 500;

/**
 * 등록된 URL을 주기적으로 검사하고 상태가 바뀌면 Slack/Discord/Telegram 으로 알린다.
 * 인스턴스는 하나("default")만 쓰며, 상태는 Durable Object 스토리지에 영구 저장된다.
 */
export class MonitorAgent extends Agent<Env, MonitorState> {
  initialState: MonitorState = { targets: [], status: {}, lastRun: null };

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;

    if (this.state.targets.length === 0 && this.env.MONITOR_TARGETS) {
      try {
        const seeded = JSON.parse(this.env.MONITOR_TARGETS) as Array<Partial<Target>>;
        for (const t of seeded) this.upsertTarget(t);
      } catch (err) {
        console.error("MONITOR_TARGETS 파싱 실패", err);
      }
    }

    // onStart 는 깨어날 때마다 실행되지만 scheduleEvery 는 같은 콜백을 중복 등록하지 않는다.
    await this.scheduleEvery(this.intervalSeconds, "runChecks");
  }

  private get intervalSeconds(): number {
    return Math.max(30, Number(this.env.CHECK_INTERVAL_SECONDS) || 60);
  }

  private get failureThreshold(): number {
    return Math.max(1, Number(this.env.FAILURE_THRESHOLD) || 2);
  }

  // ---- RPC: Worker 에서 호출 ----

  getStatus() {
    return {
      intervalSeconds: this.intervalSeconds,
      failureThreshold: this.failureThreshold,
      lastRun: this.state.lastRun,
      targets: this.state.targets.map((t) => ({ ...t, status: this.state.status[t.id] ?? null })),
    };
  }

  upsertTarget(input: Partial<Target>): Target {
    if (!input.url) throw new Error("url 은 필수입니다");
    const url = new URL(input.url); // 형식 검증
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("http(s) URL 만 지원합니다");

    const target: Target = {
      id: input.id ?? slugify(input.name ?? url.hostname),
      name: input.name ?? url.hostname,
      url: url.toString(),
      method: input.method,
      expectStatus: input.expectStatus,
      keyword: input.keyword,
      timeoutMs: input.timeoutMs,
      slowMs: input.slowMs,
    };
    const targets = this.state.targets.filter((t) => t.id !== target.id);
    targets.push(target);
    this.setState({ ...this.state, targets });
    return target;
  }

  removeTarget(id: string): boolean {
    if (!this.state.targets.some((t) => t.id === id)) return false;
    const { [id]: _removed, ...status } = this.state.status;
    this.setState({ ...this.state, targets: this.state.targets.filter((t) => t.id !== id), status });
    return true;
  }

  getIncidents(limit = 50): Incident[] {
    const n = Math.min(Math.max(1, limit), MAX_INCIDENTS);
    return this.sql<Incident>`SELECT * FROM incidents ORDER BY id DESC LIMIT ${n}`;
  }

  async sendTestAlert(): Promise<string[]> {
    return sendAlert(
      { kind: "test", target: { id: "test", name: "테스트 알림", url: "-" }, message: "알림 채널이 정상 연결되었습니다." },
      this.env,
    );
  }

  // ---- 스케줄 콜백 ----

  async runChecks() {
    const now = new Date().toISOString();
    const targets = this.state.targets;
    const results = await Promise.all(targets.map((t) => checkTarget(t)));

    const status = { ...this.state.status };
    const alerts: Alert[] = [];

    targets.forEach((target, i) => {
      const r = results[i];
      const prev = status[target.id];
      const failures = r.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1;
      const isDown = failures >= this.failureThreshold;
      const wasDown = prev ? !prev.up : false;
      const slow = r.ok && !!target.slowMs && (r.latencyMs ?? 0) > target.slowMs;

      // 실패가 임계치에 못 미치면 직전 상태(up)를 유지한다 — 일시적 오류로 인한 오탐 방지
      const up = r.ok ? true : prev ? (isDown ? false : prev.up) : !isDown;
      const next: TargetStatus = {
        up,
        httpStatus: r.httpStatus,
        latencyMs: r.latencyMs,
        error: r.error,
        lastChecked: now,
        since: prev && prev.up === up ? prev.since : now,
        consecutiveFailures: failures,
        alerted: prev?.alerted ?? false,
        slow,
      };

      const ref = { id: target.id, name: target.name, url: target.url };
      if (isDown && !next.alerted) {
        alerts.push({ kind: "down", target: ref, message: `${r.error} · 연속 ${failures}회 실패` });
        next.alerted = true;
      } else if (r.ok && (wasDown || next.alerted)) {
        const downFor = prev ? formatDuration(Date.parse(now) - Date.parse(prev.since)) : "";
        alerts.push({ kind: "recovered", target: ref, message: `복구됨 · 다운 시간 ${downFor} · ${r.latencyMs}ms` });
        next.alerted = false;
      } else if (slow && !prev?.slow) {
        alerts.push({ kind: "slow", target: ref, message: `응답 지연 ${r.latencyMs}ms (임계 ${target.slowMs}ms)` });
      }
      status[target.id] = next;
    });

    this.setState({ ...this.state, status, lastRun: now });

    for (const alert of alerts) {
      this.sql`INSERT INTO incidents (target_id, target_name, kind, message, created_at)
        VALUES (${alert.target.id}, ${alert.target.name}, ${alert.kind}, ${alert.message}, ${now})`;
      await sendAlert(alert, this.env);
    }
    if (alerts.length) {
      this.sql`DELETE FROM incidents WHERE id <= (SELECT MAX(id) FROM incidents) - ${MAX_INCIDENTS}`;
    }
    return this.getStatus();
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID().slice(0, 8);
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
