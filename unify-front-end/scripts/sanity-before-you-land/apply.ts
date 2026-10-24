#!/usr/bin/env npx tsx
/**
 * Apply the ticket #342 checklist content to Sanity.
 *
 * Default: read-only dry run. Prints the plan and exits 1 on any conflict.
 *   npx tsx scripts/sanity-before-you-land/apply.ts
 * Read-only readback of the live dataset against the payload:
 *   npx tsx scripts/sanity-before-you-land/apply.ts --verify
 * Write (needs a write token and an explicit project confirmation):
 *   SANITY_API_TOKEN=... npx tsx scripts/sanity-before-you-land/apply.ts \
 *     --apply --confirm-project <projectId>
 *
 * Env: SANITY_PROJECT_ID or EXPO_PUBLIC_SANITY_PROJECT_ID,
 *      SANITY_DATASET or EXPO_PUBLIC_SANITY_DATASET (must equal the payload's
 *      expectedDataset), SANITY_API_TOKEN or SANITY_TOKEN (write modes only).
 *
 * Guards: new records use fixed _ids with createIfNotExists, so a rerun is a
 * no-op. The existing record is patched with ifRevisionID, only when it does
 * not already hold the target copy. A live record that differs from the plan,
 * or a draft of any target id, stops the run before any write. All writes go
 * in one transaction.
 */
import { createClient } from '@sanity/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMutations,
  planChanges,
  verifyReadback,
  validatePayload,
  type LiveDoc,
  type Payload,
  type PlanAction,
} from './content';

const ROOT = path.resolve(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'sanity', 'before-you-land');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}
const hasFlag = (flag: string) => process.argv.includes(flag);

function fail(message: string): never {
  console.error(`[before-you-land] ${message}`);
  process.exit(1);
}

async function main() {
  const payload: Payload = JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'payload.json'), 'utf8')
  );
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'snapshot-before.json'), 'utf8')
  );

  const errors = validatePayload(payload);
  if (errors.length) fail(`payload is invalid:\n${errors.join('\n')}`);

  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.EXPO_PUBLIC_SANITY_PROJECT_ID;
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.EXPO_PUBLIC_SANITY_DATASET ||
    'production';
  if (!projectId)
    fail('set SANITY_PROJECT_ID or EXPO_PUBLIC_SANITY_PROJECT_ID');
  if (dataset !== payload.expectedDataset) {
    fail(
      `dataset "${dataset}" is not the payload dataset "${payload.expectedDataset}"`
    );
  }

  const apply = hasFlag('--apply');
  const token = process.env.SANITY_API_TOKEN || process.env.SANITY_TOKEN;
  if (apply) {
    if (argValue('--confirm-project') !== projectId) {
      fail(
        '--apply needs --confirm-project <projectId> that equals the project in env'
      );
    }
    if (!token) fail('--apply needs SANITY_API_TOKEN or SANITY_TOKEN');
  }

  const client = createClient({
    projectId,
    dataset,
    apiVersion: '2024-01-01',
    useCdn: false,
    perspective: 'raw',
    token: apply ? token : undefined,
  });

  const ids = [
    ...payload.create.map(r => r._id),
    ...payload.patch.map(p => p._id),
  ];
  const draftIds = ids.map(id => `drafts.${id}`);
  const docs = await client.fetch<LiveDoc[]>('*[_id in $ids]', {
    ids: [...ids, ...draftIds],
  });
  const live: Record<string, LiveDoc | null> = Object.fromEntries(
    ids.map(id => [id, null])
  );
  const drafts = new Set<string>();
  for (const doc of docs) {
    if (doc._id.startsWith('drafts.'))
      drafts.add(doc._id.slice('drafts.'.length));
    else live[doc._id] = doc;
  }

  if (hasFlag('--verify')) {
    const problems = verifyReadback(payload, live, snapshot.portOfEntryRecord);
    for (const id of drafts)
      problems.push(`${id}: an unpublished draft exists`);
    if (problems.length) fail(`readback failed:\n${problems.join('\n')}`);
    console.log(
      `[before-you-land] readback OK: ${ids.length} records match the payload`
    );
    return;
  }

  const plan: PlanAction[] = planChanges(payload, live).map(action =>
    drafts.has(action.id)
      ? {
          ...action,
          kind: 'conflict',
          reason: 'an unpublished draft exists for this _id',
        }
      : action
  );
  for (const action of plan) {
    console.log(
      `${action.kind.padEnd(8)} ${action.id}${action.reason ? `  ${action.reason}` : ''}`
    );
  }
  if (plan.some(a => a.kind === 'conflict'))
    fail('conflicts found, nothing was written');
  if (!apply) {
    console.log('[before-you-land] dry run only. Add --apply to write.');
    return;
  }

  const mutations = buildMutations(payload, plan);
  if (mutations.length === 0) {
    console.log('[before-you-land] nothing to write');
  } else {
    // One mutate call is one atomic transaction.
    await client.mutate(mutations);
    console.log(`[before-you-land] wrote ${mutations.length} operation(s)`);
  }

  const after = await client.fetch<LiveDoc[]>('*[_id in $ids]', { ids });
  const afterLive: Record<string, LiveDoc | null> = Object.fromEntries(
    ids.map(id => [id, null])
  );
  for (const doc of after) afterLive[doc._id] = doc;
  const problems = verifyReadback(
    payload,
    afterLive,
    snapshot.portOfEntryRecord
  );
  if (problems.length)
    fail(`post-write readback failed:\n${problems.join('\n')}`);
  console.log('[before-you-land] post-write readback OK');
}

main().catch(error =>
  fail(error instanceof Error ? error.message : String(error))
);
