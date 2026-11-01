// Typed registry of the read capabilities rag-query may run before answering.
//
// Each entry fixes the capability's version, its access rule, its time budget
// and that it only reads. The runner validates input before the executor runs
// and output after it returns, bounds the time, and turns every failure into a
// typed status, so one failed read never fails the answer and never passes
// unvalidated data on. Nothing here can write: the registry has no write
// classification, and the model never chooses a capability or its input
// (plan.ts decides from the request).

import type { ReadCapabilityName, ReadStatus } from './contract.ts';

export type ReadAccess =
  /** Rows the signed-in user's own JWT can read under row-level security. */
  | 'owner_rls'
  /** Public app content (published CMS documents, knowledge base). */
  | 'public_content'
  /** Public pages on the open web, behind the official-domain and SSRF guards. */
  | 'external_public';

export interface ReadCapabilitySpec {
  name: ReadCapabilityName;
  version: 1;
  classification: 'read';
  access: ReadAccess;
  timeoutMs: number;
}

export const READ_CAPABILITIES: Readonly<Record<ReadCapabilityName, ReadCapabilitySpec>> = {
  'context.profile': {
    name: 'context.profile',
    version: 1,
    classification: 'read',
    access: 'owner_rls',
    timeoutMs: 4000,
  },
  'context.checklist': {
    name: 'context.checklist',
    version: 1,
    classification: 'read',
    access: 'owner_rls',
    timeoutMs: 5000,
  },
  'context.conversation': {
    name: 'context.conversation',
    version: 1,
    classification: 'read',
    access: 'owner_rls',
    timeoutMs: 4000,
  },
  'context.saved_details': {
    name: 'context.saved_details',
    version: 1,
    classification: 'read',
    access: 'owner_rls',
    timeoutMs: 4000,
  },
  'content.knowledge': {
    name: 'content.knowledge',
    version: 1,
    classification: 'read',
    access: 'public_content',
    timeoutMs: 20000,
  },
  'guidance.search': {
    name: 'guidance.search',
    version: 1,
    classification: 'read',
    access: 'external_public',
    timeoutMs: 9000,
  },
  'guidance.read': {
    name: 'guidance.read',
    version: 1,
    classification: 'read',
    access: 'external_public',
    timeoutMs: 6000,
  },
};

/** The user's JWT cannot see the record (RLS, another account, signed out). */
export class ReadDeniedError extends Error {
  constructor(message = 'read denied') {
    super(message);
    this.name = 'ReadDeniedError';
  }
}

/** The source is not configured or did not answer usefully. */
export class ReadUnavailableError extends Error {
  constructor(message = 'read unavailable') {
    super(message);
    this.name = 'ReadUnavailableError';
  }
}

export interface ReadExecution<I, O> {
  parseInput: (raw: unknown) => I | null;
  execute: (input: I, signal: AbortSignal) => Promise<O>;
  validateOutput: (raw: unknown) => O | null;
}

export type ReadOutcome<O> =
  | { status: 'ok'; value: O }
  | { status: Exclude<ReadStatus, 'ok'>; value?: undefined };

/**
 * Run one registered read. Invalid input is `skipped` (the read never runs);
 * a time-out or ReadUnavailableError is `unavailable`; ReadDeniedError is
 * `denied`; invalid output or any other throw is `error`.
 */
export async function runRead<I, O>(
  name: ReadCapabilityName,
  rawInput: unknown,
  execution: ReadExecution<I, O>
): Promise<ReadOutcome<O>> {
  const spec = READ_CAPABILITIES[name];
  if (!spec || spec.classification !== 'read' || spec.version !== 1) {
    return { status: 'error' };
  }
  const input = execution.parseInput(rawInput);
  if (input === null) return { status: 'skipped' };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, spec.timeoutMs);
  });
  try {
    const raced = await Promise.race([
      execution.execute(input, controller.signal),
      timeout,
    ]);
    if (raced === 'timeout') return { status: 'unavailable' };
    const value = execution.validateOutput(raced);
    return value === null ? { status: 'error' } : { status: 'ok', value };
  } catch (error) {
    if (error instanceof ReadDeniedError) return { status: 'denied' };
    if (error instanceof ReadUnavailableError) return { status: 'unavailable' };
    if (controller.signal.aborted) return { status: 'unavailable' };
    console.warn(`[rag-query] read ${name} failed`, error instanceof Error ? error.name : 'unknown');
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
