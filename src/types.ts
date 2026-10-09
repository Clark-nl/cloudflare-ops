export interface Env {
  MonitorAgent: DurableObjectNamespace<import("./monitor-agent").MonitorAgent>;
  ENVIRONMENT: string;
  /** 체크 주기(초). 기본 60 */
  CHECK_INTERVAL_SECONDS?: string;
  /** 연속 실패 몇 번이면 DOWN 알림을 보낼지. 기본 2 */
  FAILURE_THRESHOLD?: string;
  /** 최초 기동 시 등록할 모니터링 대상 (JSON 배열) */
  MONITOR_TARGETS?: string;
  /** secrets: `wrangler secret put <NAME>` */
  API_TOKEN?: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface Target {
  id: string;
  name: string;
  url: string;
  method?: "GET" | "HEAD";
  /** 기대 HTTP 상태 코드. 없으면 2xx/3xx 를 정상으로 본다 */
  expectStatus?: number;
  /** 응답 본문에 반드시 포함돼야 하는 문자열 */
  keyword?: string;
  timeoutMs?: number;
  /** 이 시간(ms)을 넘기면 느림 경고 */
  slowMs?: number;
}

export interface TargetStatus {
  up: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
  lastChecked: string;
  /** 현재 상태(up/down)가 시작된 시각 */
  since: string;
  consecutiveFailures: number;
  /** DOWN 알림을 이미 보냈는지 */
  alerted: boolean;
  slow: boolean;
}

export interface MonitorState {
  targets: Target[];
  status: Record<string, TargetStatus>;
  lastRun: string | null;
}

export type AlertKind = "down" | "recovered" | "slow" | "test";

export interface Alert {
  kind: AlertKind;
  target: Pick<Target, "id" | "name" | "url">;
  message: string;
}
