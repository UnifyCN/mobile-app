import { useState } from 'react';
import { stillOwned } from '@/services/account/accountSession';
import type { ProfileField, ProfileProposal } from '@/services/companionActions/profile';
import type { TaskActionStore } from '@/services/companionActions/taskActionStore';
import { isUnresolved } from '@/services/companionActions/taskActionStore';
import { useProfileProposal, useTaskActionClient, useTaskActionDraft, useTaskActionPhase, type TaskProgressView } from './useTaskActions';

/** State stays in the account action store across close/reopen. Async work checks its owner. */
export function useProfileEditor(view: TaskProgressView, store: TaskActionStore | null, proposalId: string | null = null) {
  const owned = useTaskActionClient();
  const storedId = useTaskActionDraft(store, 'profile:review');
  const activeId = proposalId ?? storedId ?? null;
  const query = useProfileProposal(activeId);
  const selected = useTaskActionDraft(store, 'profile:editing');
  const editing: ProfileField | null = selected === 'province' || selected === 'arrival_date' ? selected : null;
  const typed = useTaskActionDraft(store, `profile:text:${editing}`);
  const current = editing === 'province' ? view.profile?.province : view.profile?.arrivalDate;
  const text = typed ?? current ?? '';
  const key = activeId ? `profile-review:${activeId}` : 'profile:prepare';
  const phase = useTaskActionPhase(store, key);
  const proposal: ProfileProposal | null = phase.phase === 'profile_review' ? phase.proposal : query.data ?? null;
  const receipt = phase.phase === 'saved' ? phase.receipt : proposal?.receipt ?? null;
  const scope = owned ? `${owned.owner.accountId}:${owned.owner.epoch}` : '';
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ scope: string; key: string } | null>(null);
  const localPending = pending === scope;
  const busy = localPending || isUnresolved(phase);
  const loadingKind = phase.phase === 'checking' ? 'checking'
    : localPending || phase.phase === 'saving' ? 'saving' : 'loading';
  const waits = localPending || phase.phase === 'saving' || phase.phase === 'checking'
    || (Boolean(activeId) && query.isPending);

  const edit = (field: ProfileField) => {
    setFailure(null);
    store?.setDraft('profile:editing', field);
  };
  const prepare = async () => {
    if (!owned || !store || !editing || !view.profile || !view.canWrite || busy || !stillOwned(owned.owner)) return;
    setPending(scope); setFailure(null);
    const result = await owned.client.prepareProfile?.({ type: 'profile.update', field: editing, value: text.trim(),
      expected_revision: view.profile.revisions[editing] }, null);
    if (!stillOwned(owned.owner)) return;
    setPending(null);
    if (result?.kind === 'ok' || result?.kind === 'changed') {
      store.setDraft('profile:review', result.proposal.proposalId);
      store.setDraft('profile:editing', undefined);
    } else setFailure({ scope, key: 'profileActions.invalid' });
  };
  const cancel = async () => {
    if (!owned || !store || !proposal || busy || !stillOwned(owned.owner)) return;
    setPending(scope);
    const result = await owned.client.cancelProfile?.(proposal.proposalId, proposal.proposalRevision);
    if (!stillOwned(owned.owner)) return;
    setPending(null);
    if (result?.kind === 'ok' || result?.kind === 'changed') {
      store.setDraft('profile:review', undefined);
      void query.refetch();
    } else setFailure({ scope, key: 'taskActions.unavailable' });
  };
  const approve = () => {
    if (!owned || !store || !proposal || proposal.status !== 'draft' || !view.canWrite || busy || !stillOwned(owned.owner)) return;
    void store.applyOperation(key, proposal.operation, { kind: 'approved_proposal', proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision });
  };
  return { editing, text, edit, setText: (value: string) => store?.setDraft(`profile:text:${editing}`, value),
    prepare, cancel, approve, key, phase, proposal, receipt, busy, waiting: waits, loadingKind,
    failure: failure?.scope === scope ? failure.key : null,
    queryFailed: Boolean(activeId) && query.isError,
    canApprove: Boolean(proposal?.status === 'draft' && !receipt && view.canWrite && !busy),
    clearEditor: () => store?.setDraft('profile:editing', undefined) };
}
