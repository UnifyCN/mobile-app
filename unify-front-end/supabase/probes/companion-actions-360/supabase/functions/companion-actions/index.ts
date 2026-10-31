// PROBE (#360): disposable stand-in for the shared Companion action service.
// It is the public request boundary the real service must have: one authenticated
// HTTP endpoint, contract-versioned, feature-gated, deriving the account from the
// JWT and doing every write through one SQL transaction (companion_apply_actions).
// Not production code. The fault hook at the bottom exists only for the probe.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
// Fault hooks answer only on a local (non-https) stack.
const LOCAL_STACK = !SUPABASE_URL.startsWith('https://');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['read', 'prepare', 'apply', 'status']);
const SQLSTATE_TO_HTTP: Record<string, [number, string]> = {
  CA403: [403, 'forbidden'],
  CA404: [404, 'not_found'],
  CA409: [409, 'revision_conflict'],
  CA410: [409, 'operation_id_reused'],
  CA422: [422, 'invalid_request'],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function userIdFrom(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const userId = await userIdFrom(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || !ACTIONS.has(body.action)) {
    return json({ error: 'invalid_request', detail: 'action' }, 400);
  }

  // Version negotiation and feature gate. Read per request so a flag flip is a rollback.
  const { data: gate, error: gateError } = await admin
    .from('companion_feature_gate').select('*').maybeSingle();
  if (gateError || !gate) return json({ error: 'feature_unavailable' }, 503);
  const version = body.contract_version;
  if (!Number.isInteger(version) || version < gate.min_contract_version || version > gate.max_contract_version) {
    return json({ error: 'unsupported_contract_version',
      supported: { min: gate.min_contract_version, max: gate.max_contract_version } }, 426);
  }
  if (!gate.enabled) return json({ error: 'feature_disabled' }, 403);
  const platform = body.client?.platform;
  if (typeof platform !== 'string' || !gate.allowed_platforms.includes(platform)) {
    return json({ error: 'platform_not_enabled' }, 403);
  }

  if (body.action === 'read') {
    const { data, error } = await admin.rpc('companion_read_tasks', { p_user_id: userId });
    return error ? json({ error: 'internal' }, 500) : json({ tasks: data });
  }
  if (body.action === 'status') {
    if (!UUID.test(body.operation_id ?? '')) return json({ error: 'invalid_request', detail: 'operation_id' }, 400);
    const { data, error } = await admin.rpc('companion_action_status', {
      p_user_id: userId, p_operation_id: body.operation_id });
    return error ? json({ error: 'internal' }, 500) : json(data);
  }
  if (!Array.isArray(body.operations)) return json({ error: 'invalid_request', detail: 'operations' }, 400);

  if (body.action === 'prepare') {
    const { data, error } = await admin.rpc('companion_prepare_proposal', {
      p_user_id: userId, p_operations: body.operations });
    return error ? mapError(error) : json(data);
  }

  // apply
  if (!UUID.test(body.operation_id ?? '')) return json({ error: 'invalid_request', detail: 'operation_id' }, 400);
  if (!body.authorization || typeof body.authorization !== 'object') {
    return json({ error: 'forbidden', detail: 'invalid_authorization' }, 403);
  }
  const { data, error } = await admin.rpc('companion_apply_actions', {
    p_user_id: userId,
    p_operation_id: body.operation_id,
    p_contract_version: version,
    p_authorization: body.authorization,
    p_operations: body.operations,
  });
  if (error) return mapError(error);

  // Probe-only fault: commit happened, response never arrives.
  if (LOCAL_STACK && req.headers.get('x-probe-drop-response') === '1') {
    await new Promise(resolve => setTimeout(resolve, 20_000));
  }
  return json(data);
});

function mapError(error: { code?: string; message?: string; details?: string }): Response {
  // lock_not_available: another request holds this operation. The outcome is not known yet.
  if (error.code === '55P03') {
    return new Response(JSON.stringify({ error: 'operation_in_flight' }), {
      status: 503, headers: { 'content-type': 'application/json', 'retry-after': '1' } });
  }
  const mapped = SQLSTATE_TO_HTTP[error.code ?? ''];
  if (!mapped) return json({ error: 'internal' }, 500);
  let detail: unknown;
  try { detail = error.details ? JSON.parse(error.details) : undefined; } catch { detail = undefined; }
  return json({ error: mapped[1], reason: error.message, detail }, mapped[0]);
}
