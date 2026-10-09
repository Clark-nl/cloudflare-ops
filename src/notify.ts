import type { Alert, Env } from "./types";

const EMOJI: Record<Alert["kind"], string> = {
  down: "🔴",
  recovered: "🟢",
  slow: "🟡",
  test: "🔔",
};

export function formatAlert(alert: Alert, env: Env): string {
  const label = alert.kind.toUpperCase();
  return `${EMOJI[alert.kind]} [${env.ENVIRONMENT}] ${label}: ${alert.target.name}\n${alert.target.url}\n${alert.message}`;
}

/** 설정된 모든 채널로 알림을 보낸다. 실패한 채널 이름을 반환한다. */
export async function sendAlert(alert: Alert, env: Env): Promise<string[]> {
  const text = formatAlert(alert, env);
  const jobs: Array<[string, Promise<Response>]> = [];

  if (env.SLACK_WEBHOOK_URL) {
    jobs.push(["slack", post(env.SLACK_WEBHOOK_URL, { text })]);
  }
  if (env.DISCORD_WEBHOOK_URL) {
    jobs.push(["discord", post(env.DISCORD_WEBHOOK_URL, { content: text })]);
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push([
      "telegram",
      post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    ]);
  }
  if (jobs.length === 0) {
    console.warn("알림 채널이 설정되지 않음:", text);
    return [];
  }

  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  const failed: string[] = [];
  results.forEach((r, i) => {
    const channel = jobs[i][0];
    if (r.status === "rejected" || !r.value.ok) {
      failed.push(channel);
      console.error(`알림 전송 실패 (${channel})`, r.status === "rejected" ? r.reason : r.value.status);
    }
  });
  return failed;
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
