// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedTextsChecked } from '../_shared/embeddings.ts';
import { fetchSourcePage } from './lib/fetchPage.ts';
import { handleIngestRequest, isAuthorized } from './lib/handler.ts';
import { createRebuildStore, createStore } from './lib/supabaseStore.ts';
import type { IngestDeps } from './lib/types.ts';

Deno.serve(async (req: Request) => {
  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // Reject before reading configuration, so callers learn nothing else.
    if (!isAuthorized(req, serviceRoleKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      // A configuration fault is not a source failure: fail the run loudly
      // instead of stamping every source as attempted.
      throw new Error('Missing OPENROUTER_API_KEY');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );
    return await handleIngestRequest(req, {
      store: createStore(supabase),
      rebuild: createRebuildStore(supabase),
      now: () => new Date(),
      fetchPage: fetchSourcePage,
      embedChecked: (texts, options) =>
        embedTextsChecked(texts, openRouterApiKey, options),
      serviceRoleKey,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Ingest error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
