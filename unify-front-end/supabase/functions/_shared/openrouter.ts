// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * Single source of truth for chat-completion calls in edge functions.
 *
 * Why OpenRouter: one API key for many upstream providers (Google, Anthropic,
 * Meta, DeepSeek, etc.) plus an automatic fallback chain on per-upstream 429s.
 *
 * Models default to env vars so they can be tuned without redeploying:
 *   OPENROUTER_MODEL_PRIMARY            (default: deepseek/deepseek-v4.1-flash)
 *   OPENROUTER_MODEL_FALLBACKS          (comma-separated; default:
 *                                        deepseek/deepseek-v4-flash-0731,
 *                                        google/gemini-3.1-flash-lite)
 *
 * Reasoning ("thinking") — also env-driven:
 *   OPENROUTER_REASONING                ("off" default | "on" | "minimal" |
 *                                        "low" | "medium" | "high")
 *   Hybrid models (DeepSeek V4 family, Qwen, Gemini 3.x) think BY DEFAULT and
 *   bill the hidden reasoning tokens as output. Our workloads are short chat /
 *   translation / JSON, where thinking roughly doubles cost and time-to-first-
 *   token for no measurable gain, so the helper sends `reasoning: { enabled:
 *   false }` unless a caller or the env asks otherwise. Callers pass
 *   `reasoning: null` to send nothing (provider default). NOTE: some Gemini
 *   3.x endpoints reject `enabled: false` with a 400 ("Reasoning is
 *   mandatory") — keep such models out of the default chain.
 *
 * Provider routing (latency tuning) — also env-driven:
 *   OPENROUTER_PROVIDER_SORT            (default: "throughput"; set to ""
 *                                        to disable; alternatives: "latency",
 *                                        "price")
 *   OPENROUTER_PROVIDER_ORDER           (comma-separated; e.g. "together,
 *                                        deepinfra"; takes precedence over
 *                                        sort when set)
 *   OPENROUTER_PROVIDER_ALLOW_FALLBACKS ("true" | "false"; default: "true")
 *
 * The helper requests inline usage data so we get token counts AND a USD cost
 * straight from OpenRouter — no per-model rate table to maintain.
 */

import { fetchWithRetry } from './fetchWithRetry.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_PRIMARY_MODEL = 'deepseek/deepseek-v4.1-flash';
const DEFAULT_FALLBACK_MODELS = [
  'deepseek/deepseek-v4-flash-0731',
  'google/gemini-3.1-flash-lite',
];

export type OpenRouterMessageRole = 'system' | 'user' | 'assistant';

export interface OpenRouterMessage {
  role: OpenRouterMessageRole;
  content: string;
}

export interface ProviderRouting {
  /** Pinned provider order — first available wins. Overrides `sort` when set. */
  order?: string[];
  /** Sort across providers when no `order` is given. */
  sort?: 'throughput' | 'latency' | 'price';
  /** When false, fail instead of falling back outside `order`. */
  allow_fallbacks?: boolean;
}

/** OpenRouter's unified reasoning config (normalized per provider upstream). */
export interface ReasoningConfig {
  /** false = disable thinking entirely (hybrid models think by default). */
  enabled?: boolean;
  effort?: 'minimal' | 'low' | 'medium' | 'high';
  max_tokens?: number;
}

export interface OpenRouterCallOptions {
  messages: OpenRouterMessage[];
  /** Primary model — overrides OPENROUTER_MODEL_PRIMARY env. */
  model?: string;
  /** Fallback chain — overrides OPENROUTER_MODEL_FALLBACKS env. */
  fallbackModels?: string[];
  maxTokens?: number;
  temperature?: number;
  /** Set true to request JSON-only output via response_format. */
  jsonMode?: boolean;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  /** Optional metadata for OpenRouter's dashboard / leaderboards. */
  appName?: string;
  appUrl?: string;
  /** Provider routing — overrides OPENROUTER_PROVIDER_* env vars. */
  provider?: ProviderRouting;
  /**
   * Reasoning config — overrides OPENROUTER_REASONING env. Default is
   * `{ enabled: false }`; pass `null` to omit the field (provider default).
   */
  reasoning?: ReasoningConfig | null;
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export type OpenRouterResult =
  | {
      ok: true;
      content: string;
      /** The actual model OpenRouter served from (after fallback resolution). */
      model: string;
      /** The upstream provider (e.g. "Google", "Anthropic"). */
      provider: string;
      usage: OpenRouterUsage;
    }
  | {
      ok: false;
      status: number;
      /** True if 429 or 5xx — caller can surface a "busy" message vs hard error. */
      retryable: boolean;
      message: string;
    };

function readDefaultPrimaryModel(): string {
  return Deno.env.get('OPENROUTER_MODEL_PRIMARY') ?? DEFAULT_PRIMARY_MODEL;
}

function readDefaultFallbackModels(): string[] {
  const raw = Deno.env.get('OPENROUTER_MODEL_FALLBACKS');
  if (!raw) return [...DEFAULT_FALLBACK_MODELS];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function readDefaultProviderRouting(): ProviderRouting | null {
  const orderRaw = Deno.env.get('OPENROUTER_PROVIDER_ORDER');
  // Default sort when env is unset is "throughput" — matches OpenRouter's
  // :nitro shortcut, the universal "go fast" hint. Set the env to empty
  // string to disable sorting entirely.
  const sortRaw = Deno.env.get('OPENROUTER_PROVIDER_SORT') ?? 'throughput';
  const allowFallbacksRaw = Deno.env.get('OPENROUTER_PROVIDER_ALLOW_FALLBACKS');

  const order = orderRaw
    ? orderRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;

  const sort =
    sortRaw === 'throughput' || sortRaw === 'latency' || sortRaw === 'price'
      ? (sortRaw as ProviderRouting['sort'])
      : undefined;

  const allow_fallbacks = allowFallbacksRaw
    ? allowFallbacksRaw.toLowerCase() !== 'false'
    : undefined;

  if (!order && !sort && allow_fallbacks === undefined) return null;

  return {
    ...(order && { order }),
    ...(sort && !order && { sort }),
    ...(allow_fallbacks !== undefined && { allow_fallbacks }),
  };
}

function readDefaultReasoning(): ReasoningConfig | null {
  const raw = (Deno.env.get('OPENROUTER_REASONING') ?? 'off').trim().toLowerCase();
  if (raw === 'off' || raw === 'false' || raw === '') return { enabled: false };
  if (raw === 'on' || raw === 'true') return null; // provider default
  if (raw === 'minimal' || raw === 'low' || raw === 'medium' || raw === 'high') {
    return { effort: raw };
  }
  console.warn(`Unrecognised OPENROUTER_REASONING="${raw}" — defaulting to off`);
  return { enabled: false };
}

function resolveReasoning(
  options: OpenRouterCallOptions
): ReasoningConfig | null {
  return options.reasoning === undefined
    ? readDefaultReasoning()
    : options.reasoning;
}

export async function callOpenRouter(
  options: OpenRouterCallOptions
): Promise<OpenRouterResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      retryable: false,
      message: 'OPENROUTER_API_KEY not set in Supabase secrets',
    };
  }

  const primary = options.model ?? readDefaultPrimaryModel();
  const fallbacks = options.fallbackModels ?? readDefaultFallbackModels();
  const models = [primary, ...fallbacks.filter(m => m !== primary)];

  const body: Record<string, unknown> = {
    model: primary,
    models,
    messages: options.messages,
    // Ask OpenRouter to inline usage + cost in the response.
    usage: { include: true },
  };
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const provider = options.provider ?? readDefaultProviderRouting();
  if (provider) body.provider = provider;

  const reasoning = resolveReasoning(options);
  if (reasoning) body.reasoning = reasoning;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  // HTTP header values must be valid ByteString (≤ U+00FF). Replace any
  // higher code points (em-dash, smart quotes, emoji, etc.) with '-' so
  // a caller passing a stylized appName doesn't crash request construction.
  if (options.appUrl) headers['HTTP-Referer'] = toByteString(options.appUrl);
  if (options.appName) headers['X-Title'] = toByteString(options.appName);

  try {
    const response = await fetchWithRetry(
      ENDPOINT,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      },
      {
        timeoutMs: options.timeoutMs ?? 25000,
        retries: options.retries ?? 1,
        retryDelayMs: options.retryDelayMs ?? 500,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
        message: `OpenRouter ${response.status}: ${errorBody.slice(0, 500)}`,
      };
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const content =
      typeof choice?.message?.content === 'string'
        ? choice.message.content.trim()
        : '';

    if (!content) {
      return {
        ok: false,
        status: 502,
        retryable: false,
        message: 'OpenRouter returned an empty completion',
      };
    }

    const usageRaw = data?.usage ?? {};
    const usage: OpenRouterUsage = {
      promptTokens: Number(usageRaw.prompt_tokens) || 0,
      completionTokens: Number(usageRaw.completion_tokens) || 0,
      totalTokens: Number(usageRaw.total_tokens) || 0,
      costUsd:
        typeof usageRaw.cost === 'number' ? usageRaw.cost : undefined,
    };

    const resolvedModel =
      typeof data?.model === 'string' ? data.model : primary;
    const resolvedProvider =
      typeof data?.provider === 'string'
        ? data.provider
        : extractProviderFromModel(resolvedModel);

    return {
      ok: true,
      content,
      model: resolvedModel,
      provider: resolvedProvider,
      usage,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        retryable: false,
        message: 'OpenRouter request aborted (timeout or caller cancelled)',
      };
    }
    return {
      ok: false,
      status: 500,
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// STREAMING
// ============================================================================

export interface OpenRouterStreamChunk {
  /** Incremental token text (may be empty for keep-alives). */
  delta?: string;
  /**
   * Provider error surfaced mid-stream (OpenRouter `data: {"error":{…}}`). When
   * set, the stream is error-terminated — callers must treat it as a failure,
   * not a successful (possibly empty) completion.
   */
  error?: string;
  /** True on the final chunk for a choice (finish_reason set). */
  done?: boolean;
  /** OpenRouter inlines usage on the final chunk when usage.include = true. */
  usage?: OpenRouterUsage;
  /** Resolved model (after fallback chain). Present on final chunk. */
  model?: string;
  /** Resolved upstream provider. Present on final chunk. */
  provider?: string;
}

export type OpenRouterStreamResult =
  | {
      ok: true;
      stream: AsyncIterable<OpenRouterStreamChunk>;
    }
  | {
      ok: false;
      status: number;
      retryable: boolean;
      message: string;
    };

/**
 * Streaming variant of {@link callOpenRouter}. Same env-driven model + provider
 * routing, same error model. Returns an async iterable that yields token deltas
 * as OpenRouter forwards them via SSE.
 *
 * Caller is responsible for accumulating the full text and computing any
 * post-processing (suggestion parsing, persistence). Token counts + cost
 * arrive on the final SSE chunk via OpenRouter's `usage: { include: true }`.
 *
 * Error handling:
 *  - Connect-time / non-2xx responses return `{ ok: false, ... }` (same as
 *    callOpenRouter).
 *  - A provider error emitted mid-stream (`data: {"error":{…}}`) is surfaced as
 *    a chunk with `error` set, so callers can fail instead of treating the
 *    truncated stream as a successful completion.
 *  - Malformed (unparseable) SSE chunks are logged and skipped — partial
 *    deltas are still delivered. The final `done: true` chunk is emitted
 *    when `[DONE]` arrives or the stream closes naturally.
 */
export async function callOpenRouterStream(
  options: OpenRouterCallOptions
): Promise<OpenRouterStreamResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      retryable: false,
      message: 'OPENROUTER_API_KEY not set in Supabase secrets',
    };
  }

  const primary = options.model ?? readDefaultPrimaryModel();
  const fallbacks = options.fallbackModels ?? readDefaultFallbackModels();
  const models = [primary, ...fallbacks.filter(m => m !== primary)];

  const body: Record<string, unknown> = {
    model: primary,
    models,
    messages: options.messages,
    stream: true,
    // Inline usage + cost on the final SSE chunk.
    usage: { include: true },
  };
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const provider = options.provider ?? readDefaultProviderRouting();
  if (provider) body.provider = provider;

  const reasoning = resolveReasoning(options);
  if (reasoning) body.reasoning = reasoning;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    Accept: 'text/event-stream',
  };
  if (options.appUrl) headers['HTTP-Referer'] = toByteString(options.appUrl);
  if (options.appName) headers['X-Title'] = toByteString(options.appName);

  let response: Response;
  try {
    // Reuse fetchWithRetry for the initial connection (covers DNS, TLS, 429,
    // 5xx). Once we're streaming, we don't retry mid-stream because there's
    // no idempotent way to resume an SSE token feed.
    response = await fetchWithRetry(
      ENDPOINT,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      },
      {
        timeoutMs: options.timeoutMs ?? 25000,
        retries: options.retries ?? 1,
        retryDelayMs: options.retryDelayMs ?? 500,
      }
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        retryable: false,
        message: 'OpenRouter request aborted (timeout or caller cancelled)',
      };
    }
    return {
      ok: false,
      status: 500,
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      message: `OpenRouter ${response.status}: ${errorBody.slice(0, 500)}`,
    };
  }

  if (!response.body) {
    return {
      ok: false,
      status: 502,
      retryable: false,
      message: 'OpenRouter returned no response body for streaming request',
    };
  }

  return {
    ok: true,
    stream: parseOpenRouterSseStream(response.body, primary),
  };
}

/**
 * Parse OpenRouter's SSE stream into token-level chunks.
 *
 * OpenRouter's SSE format mirrors OpenAI:
 *   data: {"id":"...","choices":[{"delta":{"content":"hi"},"finish_reason":null}],...}
 *   data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...},...}
 *   data: [DONE]
 *
 * Comments (`:`-prefixed lines) are keep-alives — ignored.
 */
async function* parseOpenRouterSseStream(
  body: ReadableStream<Uint8Array>,
  fallbackModel: string
): AsyncIterable<OpenRouterStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const chunk = parseOpenRouterSseMessage(rawMessage, fallbackModel);
        if (chunk) yield chunk;

        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function parseOpenRouterSseMessage(
  rawMessage: string,
  fallbackModel: string
): OpenRouterStreamChunk | null {
  const dataLines: string[] = [];
  for (const line of rawMessage.split('\n')) {
    if (line.length === 0) continue;
    if (line.startsWith(':')) continue; // SSE comment / keep-alive
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const field = line.slice(0, colonIndex);
    let value = line.slice(colonIndex + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    return { done: true };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    console.warn('Failed to parse OpenRouter SSE chunk:', err);
    return null;
  }

  // OpenRouter can emit an error payload mid-stream (`data: {"error":{…}}`)
  // instead of choices. Surface it so callers distinguish an error-terminated
  // stream from a successful completion (otherwise it'd fall through to null
  // below and be skipped as an empty chunk).
  if (parsed.error) {
    const errObj = parsed.error as { message?: unknown };
    const message =
      errObj && typeof errObj === 'object' && typeof errObj.message === 'string'
        ? errObj.message
        : typeof parsed.error === 'string'
          ? parsed.error
          : 'OpenRouter stream error';
    return { error: message };
  }

  const choices = (parsed.choices as Array<Record<string, unknown>>) ?? [];
  const choice = choices[0] ?? {};
  const delta = choice.delta as { content?: unknown } | undefined;
  const deltaContent =
    delta && typeof delta.content === 'string' ? delta.content : undefined;
  const finishReason = choice.finish_reason;
  const isDone =
    finishReason !== null && finishReason !== undefined && finishReason !== '';

  const usageRaw = parsed.usage as Record<string, unknown> | undefined;
  const usage: OpenRouterUsage | undefined = usageRaw
    ? {
        promptTokens: Number(usageRaw.prompt_tokens) || 0,
        completionTokens: Number(usageRaw.completion_tokens) || 0,
        totalTokens: Number(usageRaw.total_tokens) || 0,
        costUsd:
          typeof usageRaw.cost === 'number'
            ? (usageRaw.cost as number)
            : undefined,
      }
    : undefined;

  const resolvedModel =
    typeof parsed.model === 'string' ? parsed.model : fallbackModel;
  const resolvedProvider =
    typeof parsed.provider === 'string'
      ? parsed.provider
      : extractProviderFromModel(resolvedModel);

  // Skip empty chunks unless they carry meaningful metadata (done/usage).
  if (deltaContent === undefined && !isDone && !usage) return null;

  return {
    ...(deltaContent !== undefined && { delta: deltaContent }),
    ...(isDone && { done: true }),
    ...(usage && { usage }),
    ...(isDone || usage ? { model: resolvedModel, provider: resolvedProvider } : {}),
  };
}

/** Strip the "provider/" prefix from a model id, e.g. "google/gemini-2.5-flash" → "google". */
function extractProviderFromModel(model: string): string {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : 'openrouter';
}

/** Replace any code point > U+00FF with '-' so the string is a valid HTTP header value. */
function toByteString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x00-\xff]/g, '-');
}
