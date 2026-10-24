export type ChecklistRecord = {
  _id: string;
  _type: 'checklist';
  language: string;
  stage: string;
  personas: string[];
  class: string;
  class_order: number;
  link_tab?: string;
  title: string;
  description: string;
};

export type PatchEntry = {
  _id: string;
  expectedRev: string;
  set: { title: string; description: string };
};

export type Payload = {
  expectedDataset: string;
  create: ChecklistRecord[];
  patch: PatchEntry[];
};

const PROVINCE_WORDING =
  /\b(BC|B\.C\.|British Columbia|Alberta|Saskatchewan|Manitoba|Ontario|Quebec|Nova Scotia|New Brunswick|Newfoundland|Labrador|Prince Edward Island|PEI|Yukon|Nunavut|Northwest Territories|MSP|OHIP|AHCIP|RAMQ)\b/;

function textOf(record: { title: string; description: string }): string {
  return `${record.title}\n${record.description}`;
}

// The six values of the deployed checklist schema allowed-value rule (level error).
// The app also reads 'other', but the schema rejects it as value.not-allowed.
const PERSONAS = [
  'international_student',
  'refugee',
  'protected_person',
  'skilled_worker',
  'immigrant',
  'pr',
];
const LINK_TABS = ['home', 'community', 'companion', 'checklist', 'learn'];
const MAX_TITLE = 170;
const MAX_DESCRIPTION = 450;
const CLASSES = ['do_now', 'do_soon', 'explore_and_connect', 'optional_later'];

export function validatePayload(payload: Payload): string[] {
  const errors: string[] = [];
  for (const record of payload.create) {
    if (!CLASSES.includes(record.class)) {
      errors.push(
        `${record._id}: class "${record.class}" is not in the schema`
      );
    }
    if (record.language !== 'en') {
      errors.push(`${record._id}: language must be "en"`);
    }
    if (record.stage !== 'not_arrived') {
      errors.push(`${record._id}: stage must be "not_arrived"`);
    }
    const badPersona = record.personas.find(p => !PERSONAS.includes(p));
    if (badPersona || record.personas.length === 0) {
      errors.push(`${record._id}: persona "${badPersona}" is not allowed`);
    }
    if (!record.link_tab) {
      errors.push(`${record._id}: needs a link_tab (no module link is used)`);
    } else if (!LINK_TABS.includes(record.link_tab)) {
      errors.push(
        `${record._id}: link_tab "${record.link_tab}" is not in the schema`
      );
    }
    if (!Number.isInteger(record.class_order) || record.class_order < 0) {
      errors.push(`${record._id}: class_order must be an integer of 0 or more`);
    }
    if (record.title.length > MAX_TITLE) {
      errors.push(
        `${record._id}: title is longer than ${MAX_TITLE} characters`
      );
    }
    if (
      !record.description.startsWith('Why: ') ||
      record.description.length > MAX_DESCRIPTION
    ) {
      errors.push(
        `${record._id}: description must start with "Why: " and stay under ${MAX_DESCRIPTION} characters`
      );
    }
    if (textOf(record).includes('\u2014')) {
      errors.push(`${record._id}: contains an em dash`);
    }
    const match = PROVINCE_WORDING.exec(textOf(record));
    if (match) {
      errors.push(
        `${record._id}: province wording "${match[0]}" breaks national wording`
      );
    }
  }
  return errors;
}

export type LiveDoc = Record<string, unknown> & { _id: string; _rev?: string };

export type PlanAction = {
  kind: 'create' | 'patch' | 'noop' | 'conflict';
  id: string;
  reason?: string;
  set?: PatchEntry['set'];
  ifRevisionID?: string;
};

const SYSTEM_FIELDS = ['_rev', '_createdAt', '_updatedAt', '_system'];

function contentOf(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc).filter(([key]) => !SYSTEM_FIELDS.includes(key))
  );
}

function sameContent(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): boolean {
  return (
    JSON.stringify(sortKeys(expected)) ===
    JSON.stringify(sortKeys(contentOf(actual)))
  );
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, sortKeys(inner)])
    );
  }
  return value;
}

export function planChanges(
  payload: Payload,
  live: Record<string, LiveDoc | null | undefined>
): PlanAction[] {
  const creates = payload.create.map((record): PlanAction => {
    const current = live[record._id];
    if (!current) return { kind: 'create', id: record._id };
    if (sameContent(record, current)) return { kind: 'noop', id: record._id };
    return {
      kind: 'conflict',
      id: record._id,
      reason: 'a live record with this _id differs from the payload',
    };
  });
  const patches = payload.patch.map((entry): PlanAction => {
    const current = live[entry._id];
    if (!current) {
      return {
        kind: 'conflict',
        id: entry._id,
        reason: 'the record to patch does not exist',
      };
    }
    const alreadyTarget = Object.entries(entry.set).every(
      ([key, value]) => current[key] === value
    );
    if (alreadyTarget) return { kind: 'noop', id: entry._id };
    if (current._rev !== entry.expectedRev) {
      return {
        kind: 'conflict',
        id: entry._id,
        reason: `revision moved from ${entry.expectedRev} to ${current._rev}`,
      };
    }
    return {
      kind: 'patch',
      id: entry._id,
      set: entry.set,
      ifRevisionID: entry.expectedRev,
    };
  });
  return [...creates, ...patches];
}

export function verifyReadback(
  payload: Payload,
  live: Record<string, LiveDoc | null | undefined>,
  beforePatched: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  for (const record of payload.create) {
    const current = live[record._id];
    if (!current) {
      errors.push(`${record._id}: missing in the live dataset`);
    } else if (!sameContent(record, current)) {
      errors.push(`${record._id}: live content differs from the payload`);
    }
  }
  for (const entry of payload.patch) {
    const current = live[entry._id];
    if (!current) {
      errors.push(`${entry._id}: missing in the live dataset`);
      continue;
    }
    const expected: Record<string, unknown> = {
      ...contentOf(beforePatched),
      ...entry.set,
    };
    const actual = contentOf(current);
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      if (
        JSON.stringify(sortKeys(expected[key])) !==
        JSON.stringify(sortKeys(actual[key]))
      ) {
        errors.push(
          `${entry._id}: field "${key}" differs from the expected result`
        );
      }
    }
  }
  return errors;
}

export type Mutation =
  | { createIfNotExists: ChecklistRecord }
  | { patch: { id: string; ifRevisionID?: string; set: PatchEntry['set'] } };

export function buildMutations(
  payload: Payload,
  plan: PlanAction[]
): Mutation[] {
  const mutations: Mutation[] = [];
  for (const action of plan) {
    if (action.kind === 'create') {
      const record = payload.create.find(r => r._id === action.id);
      if (record) mutations.push({ createIfNotExists: record });
    } else if (action.kind === 'patch' && action.set) {
      mutations.push({
        patch: {
          id: action.id,
          ifRevisionID: action.ifRevisionID,
          set: action.set,
        },
      });
    }
  }
  return mutations;
}
