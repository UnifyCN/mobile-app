import {
  EMBEDDING_CONTRACT,
  EMBEDDING_MODEL,
  EMBEDDING_MAX_INPUTS,
  EmbeddingError,
  type EmbeddingReceipt,
} from '../../_shared/embeddings.ts';
import type { HandlerDeps } from './handler.ts';

/** One chunk of the frozen corpus that still needs a vector. */
export interface RebuildChunk {
  chunk_id: number;
  text: string;
}

export interface RebuildStore {
  status(): Promise<Record<string, unknown>>;
  begin(
    targetModel: string,
    contract: string
  ): Promise<Record<string, unknown>>;
  acquireWorker(runId: string, leaseSeconds: number): Promise<string | null>;
  releaseWorker(runId: string, token: string | null): Promise<void>;
  nextBatch(
    runId: string,
    token: string,
    limit: number,
    leaseSeconds: number
  ): Promise<{ remaining: number; rows: RebuildChunk[] }>;
  stageBatch(
    runId: string,
    token: string,
    model: string,
    contract: string,
    rows: { chunk_id: number; text_sha256: string; embedding: number[] }[],
    leaseSeconds: number
  ): Promise<{ staged: number; remaining: number }>;
  activate(runId: string, token: string): Promise<Record<string, unknown>>;
  abort(runId: string): Promise<void>;
  enableWriters(): Promise<void>;
  rollback(): Promise<Record<string, unknown>>;
  returnToQwen(): Promise<void>;
}

/** How long a rebuild worker holds the run without a call. */
export const WORKER_LEASE_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The body of a refused embedding call. An adapter error adds its category,
 * its HTTP status and the identity class of the answer, all fixed values;
 * the adapter's message is fixed text too. Nothing else from the provider.
 */
function failure(error: unknown, message: string): Record<string, unknown> {
  if (!(error instanceof EmbeddingError)) return { error: message };
  return {
    error: message,
    category: error.category,
    ...(error.status === undefined ? {} : { http_status: error.status }),
    ...(error.identity === undefined ? {} : { identity: error.identity }),
  };
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * The administrative interface for the embedding rebuild. The caller has
 * already passed the service-role check. Every operation is one database call,
 * except `embed_batch`, which reads at most 20 frozen chunks, makes one
 * embedding request for them and stages the result. The request never carries
 * text: the provider only sees text that is already in the knowledge base.
 */
export async function handleRebuildAction(
  body: Record<string, unknown>,
  deps: HandlerDeps
): Promise<Response> {
  const store = deps.rebuild;
  const embedChecked = deps.embedChecked;
  if (!store || !embedChecked) {
    return json({ error: 'Rebuild is not configured' }, 501);
  }
  const operation = body.operation;
  const run = uuid(body.run_id);
  const token = uuid(body.worker_token);

  try {
    switch (operation) {
      case 'status':
        return json({ status: await store.status() });
      case 'begin':
        return json(await store.begin(EMBEDDING_MODEL, EMBEDDING_CONTRACT));
      case 'acquire_worker': {
        if (!run) return json({ error: 'run_id is required' }, 400);
        const worker = await store.acquireWorker(run, WORKER_LEASE_SECONDS);
        return worker === null
          ? json({ error: 'Another worker holds this run' }, 409)
          : json({ worker_token: worker });
      }
      case 'release_worker': {
        if (!run) return json({ error: 'run_id is required' }, 400);
        // Only an absent token is the operator's controlled release. A token
        // that is present but not a UUID is a mistake, never a forced release,
        // or a typo would discard the live worker's paid batch.
        if (Object.hasOwn(body, 'worker_token') && token === null) {
          return json({ error: 'worker_token must be a valid UUID' }, 400);
        }
        await store.releaseWorker(run, token);
        return json({ released: true });
      }
      case 'embed_batch': {
        if (!run || !token) {
          return json({ error: 'run_id and worker_token are required' }, 400);
        }
        const batch = await store.nextBatch(
          run,
          token,
          EMBEDDING_MAX_INPUTS,
          WORKER_LEASE_SECONDS
        );
        if (batch.rows.length === 0) {
          return json({ sent: 0, staged: 0, remaining: 0 });
        }
        let vectors: number[][];
        let receipt: EmbeddingReceipt;
        try {
          ({ vectors, receipt } = await embedChecked(
            batch.rows.map(row => row.text)
          ));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Embedding failed';
          console.error(`Rebuild embedding failed: ${message}`);
          return json(failure(error, message), 502);
        }
        if (vectors.length !== batch.rows.length) {
          return json(
            {
              error: `Embedding returned ${vectors.length} of ${batch.rows.length} vectors`,
            },
            502
          );
        }
        const staged = await store.stageBatch(
          run,
          token,
          EMBEDDING_MODEL,
          EMBEDDING_CONTRACT,
          await Promise.all(
            batch.rows.map(async (row, index) => ({
              chunk_id: row.chunk_id,
              text_sha256: await sha256Hex(row.text),
              embedding: vectors[index],
            }))
          ),
          WORKER_LEASE_SECONDS
        );
        // The receipt goes only to this service-role caller, and only once
        // the batch is staged.
        return json({ sent: batch.rows.length, ...staged, receipt });
      }
      case 'activate':
        if (!run || !token) {
          return json({ error: 'run_id and worker_token are required' }, 400);
        }
        return json(await store.activate(run, token));
      case 'abort':
        if (!run) return json({ error: 'run_id is required' }, 400);
        await store.abort(run);
        return json({ aborted: true });
      case 'enable_writers':
        await store.enableWriters();
        return json({ writers_paused: false });
      case 'rollback':
        return json(await store.rollback());
      case 'return_to_qwen':
        await store.returnToQwen();
        return json({ returned: true });
      default:
        return json({ error: 'Unknown rebuild operation' }, 400);
    }
  } catch (error) {
    // A refusal by the database (wrong phase, lost lease, changed corpus).
    const message = error instanceof Error ? error.message : 'Rebuild failed';
    console.error(`Rebuild ${String(operation)} failed: ${message}`);
    return json({ error: message }, 409);
  }
}
