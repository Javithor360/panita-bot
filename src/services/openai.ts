/**
 * The only module that talks to OpenAI. It sends text and gets text back: no tools, no function calling and no
 * browsing are ever requested, so the model cannot act on anything. The key travels in the header and neither it
 * nor the text of a request is ever logged.
 */

export interface OpenAiConfig {
  apiKey: string | undefined;
  model: string;
  baseUrl: string;
  timeoutMs?: number;
  /** Upper bound of the answer, hidden reasoning included. */
  maxOutputTokens?: number;
  /** The model that turns a question into lookups; the main model when not given. */
  routerModel?: string;
  /** Upper bound of the router's answer, hidden reasoning included. */
  routerMaxOutputTokens?: number;
}

export type OpenAiFailure = 'not_configured' | 'rate_limited' | 'quota' | 'timeout' | 'unavailable' | 'rejected' | 'empty';

export class OpenAiError extends Error {
  constructor(readonly failure: OpenAiFailure, detail?: string) {
    super(detail ? `[OpenAI] ${failure}: ${detail}` : `[OpenAI] ${failure}`);
  }
}

export interface AnswerRequest {
  /** Rules and knowledge of the bot. */
  instructions: string;
  /** What the member wrote. It always goes in the user role, never in the instructions. */
  input: string;
  /** The exchanges that came before in the same talk, oldest first. They go as earlier turns of the conversation. */
  history?: ReadonlyArray<{ question: string; answer: string }>;
  /** Stable, anonymous id of the member (never the Discord id), so OpenAI can tell abusers apart. */
  safetyId: string;
}

export interface RouteRequest {
  instructions: string;
  /** The text to classify. It always goes in the user role. */
  input: string;
  schemaName: string;
  /** The JSON schema the answer must follow (strict). It describes data: nothing here can be called. */
  schema: object;
  safetyId: string;
}

export interface OpenAiClient {
  /** Whether a key is set at all. */
  readonly configured: boolean;
  answer(request: AnswerRequest): Promise<string>;
  /**
   * One call to the router model with a strict JSON schema, and the parsed JSON back (untrusted: the caller checks every
   * value). It is a plain answer in a fixed shape: no tool, no function and no browsing is enabled.
   */
  route(request: RouteRequest): Promise<unknown>;
  /** Whether OpenAI's free moderation flags the text. Throws `OpenAiError` when the check cannot run. */
  flagged(text: string): Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const DEFAULT_ROUTER_MAX_OUTPUT_TOKENS = 500;
const MODERATION_MODEL = 'omni-moderation-latest';

interface OutputContent {
  type?: string;
  text?: string;
  refusal?: string;
}

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type?: string; content?: OutputContent[] }>;
}

/** The text of the first message of a Responses API answer (a refusal counts as text). */
const textOf = (body: ResponsesBody): string => {
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
      else if (content.type === 'refusal' && content.refusal) parts.push(content.refusal);
    }
  }
  return parts.join('\n').trim();
};

const failureOf = async (response: Response): Promise<OpenAiError> => {
  let code = '';
  try {
    const body = (await response.json()) as { error?: { code?: string; type?: string } };
    code = body.error?.code ?? body.error?.type ?? '';
  } catch {
    // The body is only for the log line
  }
  const detail = `HTTP ${response.status}${code ? ` ${code}` : ''}`;
  if (response.status === 429) {
    const spent = /quota|spend_limit|billing/.test(code);
    return new OpenAiError(spent ? 'quota' : 'rate_limited', detail);
  }
  if (response.status >= 500) return new OpenAiError('unavailable', detail);
  return new OpenAiError('rejected', detail);
};

export const createOpenAiClient = (config: OpenAiConfig): OpenAiClient => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const post = async (path: string, body: unknown): Promise<Response> => {
    if (!config.apiKey) throw new OpenAiError('not_configured');
    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw await failureOf(response);
      return response;
    } catch (error) {
      if (error instanceof OpenAiError) throw error;
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new OpenAiError(timedOut ? 'timeout' : 'unavailable', timedOut ? undefined : 'network error');
    }
  };

  return {
    configured: !!config.apiKey,

    async answer({ instructions, input, history = [], safetyId }) {
      const response = await post('/responses', {
        model: config.model,
        instructions,
        // With no history it is just the text; otherwise the earlier turns come first, in their own roles
        input: history.length === 0
          ? input
          : [
            ...history.flatMap(turn => [
              { role: 'user', content: turn.question },
              { role: 'assistant', content: turn.answer },
            ]),
            { role: 'user', content: input },
          ],
        max_output_tokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        // Nothing about the conversation is kept on OpenAI's side
        store: false,
        safety_identifier: safetyId,
      });
      const body = (await response.json()) as ResponsesBody;
      const text = textOf(body);
      if (!text) throw new OpenAiError('empty', body.incomplete_details?.reason ?? body.status);
      return text;
    },

    async route({ instructions, input, schemaName, schema, safetyId }) {
      const response = await post('/responses', {
        model: config.routerModel ?? config.model,
        instructions,
        input,
        text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
        max_output_tokens: config.routerMaxOutputTokens ?? DEFAULT_ROUTER_MAX_OUTPUT_TOKENS,
        store: false,
        safety_identifier: safetyId,
      });
      const body = (await response.json()) as ResponsesBody;
      const text = textOf(body);
      if (!text) throw new OpenAiError('empty', body.incomplete_details?.reason ?? body.status);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OpenAiError('empty', 'the router did not answer JSON');
      }
    },

    async flagged(text) {
      const response = await post('/moderations', { model: MODERATION_MODEL, input: text });
      const body = (await response.json()) as { results?: Array<{ flagged?: boolean }> };
      return body.results?.[0]?.flagged === true;
    },
  };
};
