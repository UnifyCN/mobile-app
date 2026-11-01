/** #371. Transient action data for the existing authoritative profile. */
import { ContractError, parseReceipt, type TaskReceipt } from './contract';
export type ProfileField = 'province' | 'arrival_date';
export interface ProfileOperation {
  type: 'profile.update';
  field: ProfileField;
  value: string | null;
  expected_revision: number;
}
export interface ActionProfile {
  province: string | null;
  arrivalDate: string | null;
  city: string | null;
  revisions: { province: number; arrival_date: number; city: number };
}
export interface ProfileContext {
  field: ProfileField;
  value: string | null;
  revision: number;
}
export interface ProfileProposal {
  kind: 'profile_update';
  proposalId: string;
  proposalRevision: number;
  operation: ProfileOperation;
  context: ProfileContext;
  previousContext: ProfileContext | null;
  status: 'draft' | 'applied' | 'cancelled';
  reviewReason: 'edited' | 'context_changed' | 'restored' | null;
  source: { conversationId: string; messageId: number | null } | null;
  receipt: TaskReceipt | null;
}
type Json = Record<string, unknown>;
const object = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => {
  if (typeof v !== 'string') throw new ContractError('profile text');
  return v;
};
const nullable = (v: unknown): string | null => v === null ? null : text(v);
const revision = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new ContractError('profile revision');
  return v;
};
const field = (v: unknown): ProfileField => {
  if (v !== 'province' && v !== 'arrival_date') throw new ContractError('profile field');
  return v;
};
export function parseProfileOperation(raw: unknown): ProfileOperation {
  if (!object(raw) || raw.type !== 'profile.update') throw new ContractError('profile operation');
  return { type: 'profile.update', field: field(raw.field), value: nullable(raw.value), expected_revision: revision(raw.expected_revision) };
}
export function parseActionProfile(raw: unknown): ActionProfile | null {
  if (raw === null || raw === undefined) return null;
  if (!object(raw) || !object(raw.revisions)) throw new ContractError('profile');
  return { province: nullable(raw.province), arrivalDate: nullable(raw.arrival_date), city: nullable(raw.city),
    revisions: { province: revision(raw.revisions.province), arrival_date: revision(raw.revisions.arrival_date), city: revision(raw.revisions.city) } };
}
const context = (raw: unknown): ProfileContext => {
  if (!object(raw)) throw new ContractError('profile context');
  return { field: field(raw.field), value: nullable(raw.value), revision: revision(raw.revision) };
};
export function parseProfileProposal(raw: unknown): ProfileProposal {
  if (!object(raw) || raw.kind !== 'profile_update' || !Array.isArray(raw.operations) || raw.operations.length !== 1) throw new ContractError('profile proposal');
  if (raw.status !== 'draft' && raw.status !== 'applied' && raw.status !== 'cancelled') throw new ContractError('profile status');
  const reason = raw.review_reason ?? null;
  if (reason !== null && reason !== 'edited' && reason !== 'context_changed' && reason !== 'restored') throw new ContractError('profile review reason');
  const operation = parseProfileOperation(raw.operations[0]);
  const ctx = context(raw.context);
  if (ctx.field !== operation.field || ctx.revision !== operation.expected_revision) throw new ContractError('profile review values');
  return { kind: 'profile_update', proposalId: text(raw.proposal_id), proposalRevision: revision(raw.proposal_revision), operation,
    context: ctx, previousContext: raw.previous_context == null ? null : context(raw.previous_context),
    status: raw.status, reviewReason: reason,
    source: object(raw.source) ? { conversationId: text(raw.source.conversation_id), messageId: raw.source.message_id == null ? null : revision(raw.source.message_id) } : null,
    receipt: raw.receipt == null ? null : parseReceipt(raw.receipt) };
}
export function parseSuggestedProfile(raw: unknown): { type: 'profile.update'; field: ProfileField; value: string } | null {
  if (!object(raw) || raw.type !== 'profile.update' || raw.version !== 1 || typeof raw.value !== 'string' ||
      (raw.field !== 'province' && raw.field !== 'arrival_date')) return null;
  return { type: 'profile.update', field: raw.field, value: raw.value };
}
export const profileKey = (f: ProfileField) => `profile:${f}`;
