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
  /**
   * How much the model thinks before answering. Without it nothing about reasoning is sent. A model that does not accept
   * the setting makes the client drop it (and `temperature`) and carry on without them, so it is safe to set.
   */
  reasoningEffort?: ReasoningEffort;
  /** Sampling temperature of the answers, for models that are not reasoning models. Sent only when set. */
  temperature?: number;
  /** Where the client says that it dropped a setting. Never gets a request or an answer. */
  logger?: Pick<Console, 'warn'>;
  /** The model that turns a question into lookups; the main model when not given. */
  routerModel?: string;
  /** Upper bound of the router's answer, hidden reasoning included. */
  routerMaxOutputTokens?: number;
}

/**
 * The efforts a model may accept. `gpt-6-luna` takes `none`, `low`, `medium`, `high`, `xhigh` and `max` (checked against the
 * API); `minimal` belongs to other models and is refused by that one.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** The effort to try again with when the thinking used up the whole answer; `undefined` means no reasoning setting at all. */
const lowerEffort = (effort: ReasoningEffort): ReasoningEffort | undefined =>
  ({ max: 'xhigh', xhigh: 'high', high: 'medium', medium: 'low', low: 'none', none: undefined, minimal: undefined } as const)[effort];

export type OpenAiFailure = 'not_configured' | 'rate_limited' | 'quota' | 'timeout' | 'unavailable' | 'rejected' | 'empty';

export class OpenAiError extends Error {
  constructor(readonly failure: OpenAiFailure, detail?: string, /** The parameter OpenAI says it refused (`temperature`, `reasoning.effort`), when it names one. */ readonly param?: string) {
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
  /**
   * Whether OpenAI's free moderation flags the text. With `only`, just those categories count (`sexual/minors`...), and a
   * flag for any other is ignored. Throws `OpenAiError` when the check cannot run.
   */
  flagged(text: string, only?: readonly string[]): Promise<boolean>;
  /** The same for several texts in one call: whether each one is flagged, in the same order. */
  flaggedEach(texts: readonly string[], only?: readonly string[]): Promise<boolean[]>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
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

interface ModerationBody {
  results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
}

/** Whether a result counts: any flag, or, with `only`, a flag in one of those categories. */
const verdictOf = (result: { flagged?: boolean; categories?: Record<string, boolean> }, only?: readonly string[]): boolean =>
  only ? only.some(category => result.categories?.[category] === true) : result.flagged === true;

const failureOf = async (response: Response): Promise<OpenAiError> => {
  let code = '';
  let param: string | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: string; type?: string; param?: string | null } };
    code = body.error?.code ?? body.error?.type ?? '';
    param = body.error?.param ?? undefined;
  } catch {
    // The body is only for the log line
  }
  const detail = `HTTP ${response.status}${code ? ` ${code}` : ''}`;
  if (response.status === 429) {
    const spent = /quota|spend_limit|billing/.test(code);
    return new OpenAiError(spent ? 'quota' : 'rate_limited', detail);
  }
  if (response.status >= 500) return new OpenAiError('unavailable', detail);
  return new OpenAiError('rejected', detail, param);
};

export const createOpenAiClient = (config: OpenAiConfig): OpenAiClient => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const logger = config.logger ?? console;
  /** What the model has refused: a setting it refused once is not sent again. */
  const refused = { reasoning: false, temperature: false };

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
      const send = async (effort: ReasoningEffort | undefined, sampling: boolean) => {
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
          ...(effort ? { reasoning: { effort } } : {}),
          ...(sampling && config.temperature !== undefined ? { temperature: config.temperature } : {}),
          // Nothing about the conversation is kept on OpenAI's side
          store: false,
          safety_identifier: safetyId,
        });
        const body = (await response.json()) as ResponsesBody;
        return { text: textOf(body), body };
      };

      let effort = refused.reasoning ? undefined : config.reasoningEffort;
      let sampling = !refused.temperature;
      let result;
      // A setting the model refuses is dropped, and only that one; the request is made again (at most twice). What was
      // dropped is remembered only once a request goes through, so a refusal for another reason never turns settings off.
      const dropped = { reasoning: false, temperature: false };
      for (let attempt = 0; ; attempt += 1) {
        try {
          result = await send(effort, sampling);
          break;
        } catch (error) {
          if (!(error instanceof OpenAiError) || error.failure !== 'rejected' || attempt >= 2) throw error;
          const temperatureSent = sampling && config.temperature !== undefined;
          const named = error.param ?? '';
          if (effort && (named.startsWith('reasoning') || (!named && !temperatureSent))) {
            dropped.reasoning = true;
            effort = undefined;
          } else if (temperatureSent && (named === 'temperature' || !named)) {
            dropped.temperature = true;
            sampling = false;
          } else {
            throw error;
          }
        }
      }
      if (dropped.reasoning) {
        refused.reasoning = true;
        logger.warn('[OpenAI] The model refused the reasoning effort; answering without it from now on.');
      }
      if (dropped.temperature) {
        refused.temperature = true;
        logger.warn('[OpenAI] The model refused the temperature; answering without it from now on.');
      }

      // The thinking used up the whole answer: once more, thinking less (and with no setting at all if that effort is
      // refused). Nothing is lower than `none`, so then there is nothing to try.
      const lower = effort ? lowerEffort(effort) : undefined;
      if (!result.text && result.body.incomplete_details?.reason === 'max_output_tokens' && lower) {
        try {
          result = await send(lower, sampling);
        } catch (error) {
          if (!(error instanceof OpenAiError) || error.failure !== 'rejected') throw error;
          result = await send(undefined, sampling);
        }
      }
      if (!result.text) throw new OpenAiError('empty', result.body.incomplete_details?.reason ?? result.body.status);
      return result.text;
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

    async flagged(text, only) {
      const response = await post('/moderations', { model: MODERATION_MODEL, input: text });
      const body = (await response.json()) as ModerationBody;
      return body.results?.[0] ? verdictOf(body.results[0], only) : false;
    },

    async flaggedEach(texts, only) {
      if (texts.length === 0) return [];
      const response = await post('/moderations', { model: MODERATION_MODEL, input: [...texts] });
      const body = (await response.json()) as ModerationBody;
      if (!body.results || body.results.length !== texts.length) throw new OpenAiError('empty', 'the moderation did not answer once for each text');
      return body.results.map(result => verdictOf(result, only));
    },
  };
};
