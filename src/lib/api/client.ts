import { ApiError } from './errors';
import type { ApiEnvelope } from './types';

/** Timeouts per kind of call. `preAck` is for calls made before a Discord interaction is acknowledged. */
export const API_TIMEOUTS = { default: 8_000, preAck: 2_000, bulk: 30_000 } as const;

/**
 * For calls made before a Discord interaction is acknowledged (3 s to answer): one short attempt, no
 * retries, since a retry would outlast the interaction.
 */
export const PRE_ACK_REQUEST = { timeoutMs: API_TIMEOUTS.preAck, idempotent: false } as const;

const MAX_CONCURRENT = 6;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 300;
const BACKOFF_JITTER_MS = 100;
const SLOW_CALL_MS = 1_500;
const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'DELETE']);

export interface RequestOptions {
  /** Values for the `{name}` placeholders of the path. Always URL-encoded, so never build paths by hand. */
  params?: Record<string, string | number>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  /** Whether a failed call may be retried. Defaults to true for GET, PUT and DELETE. */
  idempotent?: boolean;
}

/** Overridable pieces, so tests need neither real delays nor real randomness. */
export interface ApiClientDeps {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/** Hands out a fixed number of slots; the rest wait in order. */
class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire() {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    // The slot is handed over directly by `release`, so `active` stays as it is.
    await new Promise<void>(resolve => this.waiting.push(resolve));
  }

  release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

const isEnvelope = (value: unknown): value is { data: unknown; meta?: unknown } =>
  typeof value === 'object' && value !== null && 'data' in value;

const errorFrom = (status: number, body: unknown, requestId: string | undefined): ApiError => {
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    const { code, message, details } = error as { code: string; message?: unknown; details?: unknown };
    return new ApiError(
      status,
      code,
      typeof message === 'string' ? message : `HTTP ${status}`,
      typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : undefined,
      requestId,
    );
  }
  // Not the API's envelope (e.g. a 429 from the firewall in front of it)
  return new ApiError(status, `http_${status}`, `HTTP ${status}`, undefined, requestId);
};

/**
 * Client of the Panita API: JSON in and out, the service key on every request, timeouts, retries for
 * idempotent calls and a cap on parallel requests. Only services (and the startup check) use it.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly slots = new Semaphore(MAX_CONCURRENT);
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;

  constructor(baseUrl: string, private readonly key: string, deps: ApiClientDeps = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.random = deps.random ?? Math.random;
    this.logger = deps.logger ?? console;
  }

  /** Performs a call and returns the whole success body, for lists that also need `meta`. */
  async requestEnvelope<T, M = undefined>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiEnvelope<T, M>> {
    const url = this.urlFor(path, options);
    const idempotent = options.idempotent ?? IDEMPOTENT_METHODS.has(method);

    for (let attempt = 0; ; attempt++) {
      try {
        return (await this.attempt(method, path, url, options)) as ApiEnvelope<T, M>;
      } catch (error) {
        if (!(error instanceof ApiError) || !idempotent || !error.retryable || attempt >= MAX_RETRIES) throw error;
        await this.sleep(BACKOFF_BASE_MS * 2 ** attempt + this.random() * BACKOFF_JITTER_MS);
      }
    }
  }

  /** Performs a call and returns `data`. */
  async request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    return (await this.requestEnvelope<T>(method, path, options)).data;
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }

  getEnvelope<T, M = undefined>(path: string, options?: RequestOptions) {
    return this.requestEnvelope<T, M>('GET', path, options);
  }

  put<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  /** Not retried by default; pass `idempotent: true` when repeating the call has no further effect. */
  patch<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { idempotent: false, ...options, body });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { idempotent: false, ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }

  private urlFor(path: string, { params = {}, query = {} }: RequestOptions): string {
    const resolved = path.replace(/\{(\w+)\}/g, (_, name: string) => {
      if (!(name in params)) throw new Error(`[API] Missing value for {${name}} in ${path}`);
      return encodeURIComponent(String(params[name]));
    });
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) search.set(name, String(value));
    }
    const queryString = search.size > 0 ? `?${search}` : '';
    return `${this.baseUrl}${resolved}${queryString}`;
  }

  /** One HTTP attempt, holding one concurrency slot, with its log line. */
  private async attempt(method: string, template: string, url: string, options: RequestOptions) {
    await this.slots.acquire();
    const started = Date.now();
    try {
      const { body, status, requestId } = await this.send(method, url, options);
      this.logSuccess(method, template, status, Date.now() - started, requestId);
      return body;
    } catch (error) {
      if (error instanceof ApiError) this.logFailure(method, template, error, Date.now() - started);
      throw error;
    } finally {
      this.slots.release();
    }
  }

  private async send(method: string, url: string, options: RequestOptions) {
    const timeoutMs = options.timeoutMs ?? API_TIMEOUTS.default;
    const headers: Record<string, string> = { 'X-Api-Key': this.key, Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(timeoutMs),
        // The key is a custom header that fetch would forward to wherever a redirect points
        redirect: 'manual',
      });
      text = await response.text();
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
      throw timedOut
        ? new ApiError(0, 'timeout', `No answer within ${timeoutMs} ms`)
        : new ApiError(0, 'network', 'The API could not be reached');
    }

    const requestId = response.headers.get('x-request-id') ?? undefined;
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }

    if (!response.ok) throw errorFrom(response.status, body, requestId);
    if (!isEnvelope(body)) {
      throw new ApiError(response.status, 'invalid_response', 'The API answered with an unexpected body', undefined, requestId);
    }
    return { body, status: response.status, requestId };
  }

  // One line per call; never the request or response body, never the key.

  private logSuccess(method: string, template: string, status: number, ms: number, requestId?: string) {
    const line = `[API] ${method} ${template} ${status} ${ms}ms${requestId ? ` req=${requestId}` : ''}`;
    if (ms > SLOW_CALL_MS) this.logger.warn(`${line} (slow)`);
    else this.logger.log(line);
  }

  private logFailure(method: string, template: string, error: ApiError, ms: number) {
    const outcome = error.status === 0 ? error.code : `${error.status} code=${error.code}`;
    const line = `[API] ${method} ${template} ${outcome} ${ms}ms${error.requestId ? ` req=${error.requestId}` : ''}`;
    // 4xx answers other than a rejected key or throttling are outcomes the caller handles (404 is a normal answer)
    const handledByCaller = error.status >= 400 && error.status < 500 && ![401, 403, 429].includes(error.status);
    if (handledByCaller) this.logger.log(line);
    else this.logger.error(line);
  }
}
