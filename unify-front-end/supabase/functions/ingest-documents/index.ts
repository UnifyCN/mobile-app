// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/fetchWithRetry.ts';
import { handleIngestRequest, isAuthorized } from './lib/handler.ts';
import { createStore } from './lib/supabaseStore.ts';
import type { IngestDeps } from './lib/types.ts';

const EMBEDDING_MODEL =
  Deno.env.get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small';

async function fetchPage(url: string): Promise<string> {
  const response = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'UnifyBot/1.0 (+https://unifysocial.ca; educational-knowledge-indexer)',
      },
    },
    { timeoutMs: 15000, retries: 2, retryDelayMs: 500 }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

function createEmbed(apiKey: string): IngestDeps['embed'] {
  return async texts => {
    const response = await fetchWithRetry(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      },
      { timeoutMs: 30000, retries: 2, retryDelayMs: 500 }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI embedding error ${response.status}: ${errorText}`
      );
    }
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  };
}

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

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      // A configuration fault is not a source failure: fail the run loudly
      // instead of stamping every source as attempted.
      throw new Error('Missing OPENAI_API_KEY');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );
    return await handleIngestRequest(req, {
      store: createStore(supabase),
      now: () => new Date(),
      fetchPage,
      embed: createEmbed(openaiApiKey),
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
