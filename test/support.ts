/**
 * Shared setup for tests of modules that use the shared API client. Import it FIRST in the test file:
 * it fills the environment (dotenv never overrides existing values, so a real `.env` is not used) and
 * `stubFetch` makes sure no test reaches the network.
 */
import { mock } from 'node:test';

for (const name of ['DISCORD_TOKEN', 'DATABASE_URL', 'DIRECT_URL', 'STAFF_ROLE_ID', 'DEVELOPER_ID', 'ALT_ROLE_ID']) {
  process.env[name] = 'test';
}
process.env.PANITA_API_KEY = 'pk_test_key';
process.env.PANITA_API_URL = 'https://api.test.invalid';
delete process.env.GUILD_ID;

export const API_BASE = 'https://api.test.invalid';

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const ok = (data: unknown, extra: Record<string, unknown> = {}, status = 200) => json(status, { data, ...extra });

export const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  json(status, { error: { code, message: `${code} happened`, details } });

export interface RecordedCall {
  method: string;
  /** Path and query, without the base URL. */
  path: string;
  body: unknown;
}

/** Answers each call with the next response (the last one repeats; an Error is a network failure). */
export const stubFetch = (...answers: Array<Response | Error>) => {
  const calls: RecordedCall[] = [];
  let next = 0;
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      path: url.replace(API_BASE, ''),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const answer = answers[Math.min(next++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  return calls;
};

/** Silences the client's one-line-per-call logging. */
export const silenceApiLogs = () => {
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
};
