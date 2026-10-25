/**
 * Test-only harness: run an edge function's real `Deno.serve` handler with the
 * network, the environment and the server stubbed out. Nothing here is imported
 * by a deployed function. It follows the harness the web-app uses for its
 * rag-query handler tests.
 *
 * - `Deno.env.get` reads `testEnv`, so the tests need no --allow-env.
 * - `fetch` goes to the route function set by `setRoutes`; every call is
 *   recorded in `fetchLog`. An unrouted call answers 599, so a missing stub
 *   shows up as a failed request, not a hang.
 * - `captureServe` imports a function's index.ts with `Deno.serve` replaced by a
 *   capture, and returns the handler it registered.
 *
 * The stubs are process-wide and stay installed for the whole test run.
 */

export type Handler = (req: Request) => Response | Promise<Response>;

export interface FetchCall {
  url: URL;
  method: string;
  headers: Headers;
  /** The JSON-parsed request body, or the raw string when it is not JSON. */
  body: unknown;
  rawBody: string | undefined;
}

export type Route = (
  call: FetchCall
) => Response | Promise<Response | undefined> | undefined;

export const testEnv: Record<string, string | undefined> = {
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  OPENROUTER_API_KEY: 'openrouter-key',
};

export const fetchLog: FetchCall[] = [];

let route: Route = () => undefined;

export function setRoutes(next: Route): void {
  route = next;
  fetchLog.length = 0;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let installed = false;

function installStubs(): void {
  if (installed) return;
  installed = true;

  (Deno.env as { get: (key: string) => string | undefined }).get = key =>
    testEnv[key];

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const rawBody =
      typeof init?.body === 'string'
        ? init.body
        : request
          ? await request.clone().text()
          : undefined;
    let body: unknown = rawBody;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        // keep the raw string
      }
    }
    const call: FetchCall = { url, method, headers, body, rawBody };
    fetchLog.push(call);
    return (
      (await route(call)) ??
      new Response(`unrouted: ${method} ${url}`, { status: 599 })
    );
  };
}

/**
 * Capture the handler an edge function registers. Use with a LITERAL dynamic
 * import, so Deno resolves the module ahead of time:
 *
 *   const takeHandler = captureServe();
 *   await import('./index.ts');
 *   const handler = takeHandler();
 */
export function captureServe(): () => Handler {
  installStubs();
  let captured: Handler | null = null;
  const realServe = Deno.serve;
  (Deno as { serve: unknown }).serve = (handler: Handler) => {
    captured = handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  };
  return () => {
    (Deno as { serve: unknown }).serve = realServe;
    if (!captured) throw new Error('the module did not call Deno.serve');
    return captured;
  };
}
