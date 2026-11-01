import { useEffect, useState } from 'react';
import { taskProgressFor } from '@/services/companionActions/contract';
import {
  useTaskActionClient,
  useTaskActionPhase,
  useTaskActionDraft,
  type TaskProgressView,
} from './useTaskActions';
import { stillOwned } from '@/services/account/accountSession';
import {
  isUnresolved,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  reminderTime,
  type ReminderProposal,
  type ReminderOperation,
} from '@/services/companionActions/reminders';

/** The common review/save flow uses the existing operation store and account epoch. */
export function useReminderEditor(
  taskRef: string,
  view: TaskProgressView,
  store: TaskActionStore | null
) {
  const bound = useTaskActionClient();
  const key = `reminder:${taskRef}`;
  const draftText = useTaskActionDraft(store, `reminder-draft:${taskRef}`);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let draft = {
    instant: '',
    zone: !deviceZone || deviceZone === 'UTC' ? 'Etc/UTC' : deviceZone,
  };
  try {
    if (draftText) draft = JSON.parse(draftText);
  } catch {
    /* A damaged local draft is not an approval. */
  }
  const phase = useTaskActionPhase(store, key);
  const reviewRequest = useTaskActionDraft(store, `reminder-review:${taskRef}`);
  const identity = bound ? `${bound.owner.accountId}:${bound.owner.epoch}` : '';
  const [review, setReview] = useState<{
    owner: string;
    proposal: ReminderProposal;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'time' | 'read' | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | 'undo' | null>(null);
  const progress = taskProgressFor(taskRef, view);
  const active = view.reminders?.items.find(
    r => r.taskRef === taskRef && r.status === 'pending'
  );
  const proposal = review?.owner === identity ? review.proposal : null;
  const canRecover = Boolean(bound && store && view.canWrite && !pending);
  const canWrite = Boolean(
    bound && store && view.canWrite && !isUnresolved(phase) && !pending
  );
  const [seenIdentity, setSeenIdentity] = useState(identity);
  if (seenIdentity !== identity) {
    setSeenIdentity(identity);
    setReview(null);
    setPending(false);
    setError(null);
    setConfirm(null);
  }
  useEffect(() => {
    if (!reviewRequest || !bound?.client.reminderProposal) return;
    let cancelled = false;
    void bound.client.reminderProposal(reviewRequest).then(result => {
      if (cancelled || !stillOwned(bound.owner)) return;
      if (result.kind === 'ok' || result.kind === 'changed')
        setReview({ owner: identity, proposal: result.proposal });
      else setError('read');
    });
    return () => {
      cancelled = true;
    };
  }, [reviewRequest, bound, identity]);
  const change = (field: 'instant' | 'zone', value: string) => {
    store?.setDraft(
      `reminder-draft:${taskRef}`,
      JSON.stringify({ ...draft, [field]: value })
    );
    setReview(null);
    setError(null);
  };
  async function prepare(operation?: ReminderOperation) {
    if (!bound || !canWrite || !bound.client.prepareReminder) return;
    const time = reminderTime(draft.instant, draft.zone);
    if (
      !operation &&
      (!time || new Date(time.instant).getTime() <= Date.now())
    ) {
      setError('time');
      return;
    }
    const op: ReminderOperation = operation ?? {
      type: 'reminder.schedule',
      task_ref: taskRef,
      expected_revision: progress.revision,
      remind_at: time!.instant,
      time_zone: draft.zone,
      wall_time: time!.wall,
      ...(active
        ? {
            reminder_id: active.reminderId,
            expected_reminder_revision: active.revision,
          }
        : {}),
    };
    setPending(true);
    setError(null);
    const result = await bound.client.prepareReminder(op, null);
    if (!stillOwned(bound.owner)) return;
    setPending(false);
    if (result.kind === 'ok' || result.kind === 'changed') {
      setReview({ owner: identity, proposal: result.proposal });
      setConfirm(null);
    } else {
      setError('read');
      view.refetch();
    }
  }
  const save = () => {
    if (
      !bound ||
      !canWrite ||
      !proposal ||
      proposal.status !== 'draft' ||
      !stillOwned(bound.owner)
    )
      return;
    if (proposal.operation.type === 'reminder.cancel' && confirm !== 'cancel') {
      setConfirm('cancel');
      return;
    }
    void store!.applyOperation(key, proposal.operation, {
      kind: 'approved_proposal',
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
      ...(proposal.operation.type === 'reminder.cancel'
        ? { removal_confirmed: true as const }
        : {}),
    });
    setReview(null);
    setConfirm(null);
    store?.setDraft(`reminder-review:${taskRef}`, undefined);
  };
  return {
    key,
    isOwned: () => Boolean(bound && stillOwned(bound.owner)),
    draft,
    phase,
    proposal,
    pending,
    error,
    confirm,
    active,
    canWrite,
    canSchedule:
      canWrite && !progress.removed && progress.state !== 'completed',
    change,
    prepare,
    save,
    setConfirm,
    clearReview: () => {
      setReview(null);
      setConfirm(null);
    },
    cancel: () =>
      active &&
      prepare({
        type: 'reminder.cancel',
        task_ref: taskRef,
        expected_revision: progress.revision,
        reminder_id: active.reminderId,
        expected_reminder_revision: active.revision,
      }),
    undo: () => {
      if (canWrite && phase.phase === 'saved') {
        void store?.undo(key, phase.receipt.operationId, {
          removalConfirmed: true,
        });
        setConfirm(null);
      }
    },
    lookup: () => canRecover && store?.checkAgain(key),
    retry: () => canRecover && store?.retry(key),
  };
}
