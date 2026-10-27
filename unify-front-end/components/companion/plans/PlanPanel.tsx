import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { stillOwned, type AccountSnapshot } from '@/services/account/accountSession';
import type { PlanClient, PlanProposalResult } from '@/services/companionActions/planClient';
import { planTaskTitle } from '@/services/companionActions/planClient';
import type {
  PlanDraftItem,
  PlanProposal,
  PlanReceipt,
  PlanTaskNow,
  PlanView,
} from '@/services/companionActions/planContract';
import {
  isPlanUnresolved,
  proposalKey,
  receiptKey,
  type PlanPhase,
  type PlanStore,
} from '@/services/companionActions/planStore';
import type { TaskState } from '@/services/companionActions/contract';
import {
  planProposalKey,
  usePlanClient,
  usePlanPhase,
  usePlanProposal,
  usePlans,
  usePlanStore,
} from '@/hooks/companion/usePlans';
import { useTaskProgress } from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';
import { planReceiptSummary, recordedTitles } from './planText';
import type { PlanTarget } from './PlanEntry';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';
const ERROR = '#B42318';

/**
 * Review and resume of a settlement plan (mobile-app#364), inside the direction B
 * bottom sheet. A draft shows which tasks are reused (with their current state) and
 * which would be added, the profile values it depends on, and one approval control
 * that names the real change count. Every edit is a new revision that needs its own
 * approval; it never changes saved progress. A saved plan reads each task's current
 * state from the shared Checklist rows, keeps its receipt's recorded meaning, and
 * offers receipt-specific Retry and Undo. Writes need a fresh successful read; nothing
 * is queued offline.
 */
export function PlanPanel({
  target,
  onOpenTask,
}: {
  target: PlanTarget;
  onOpenTask: (taskRef: string, title: string) => void;
}) {
  if ('proposalId' in target) return <DraftOrSaved proposalId={target.proposalId} onOpenTask={onOpenTask} />;
  return <SavedPlanById planId={target.planId} onOpenTask={onOpenTask} />;
}

function DraftOrSaved({
  proposalId,
  onOpenTask,
}: {
  proposalId: string;
  onOpenTask: (taskRef: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const store = usePlanStore('companion');
  const query = usePlanProposal(proposalId);
  const phase = usePlanPhase(store, proposalKey(proposalId));
  // A refreshed revision from a needs-review or already-saved reply is newer than the read.
  const fromPhase =
    phase.phase === 'needs_review' || phase.phase === 'changed' ? phase.proposal : null;
  const proposal =
    fromPhase && fromPhase.revision >= (query.data?.revision ?? 0) ? fromPhase : query.data;
  if (!proposal) {
    return (
      <Text style={styles.message} accessibilityLiveRegion='polite'>
        {query.isError ? t('plans.planUnavailable') : t('plans.loadingPlan')}
      </Text>
    );
  }
  const reply = phase.phase === 'saved' ? phase.reply : null;
  if (reply || proposal.status === 'applied') {
    return (
      <SavedPlan
        planId={reply?.plan?.planId ?? proposal.planId}
        fallback={reply?.plan ?? null}
        receipt={reply?.receipt ?? proposal.receipt}
        note={phase.phase === 'changed' ? t('plans.changedElsewhere') : null}
        onOpenTask={onOpenTask}
      />
    );
  }
  return <DraftReview proposal={proposal} store={store} phase={phase} />;
}

const PROFILE_FIELDS = [
  ['city', 'taskCreate.profileCity'],
  ['province', 'taskCreate.profileProvince'],
  ['arrivalDate', 'taskCreate.profileArrival'],
] as const;

function DraftReview({
  proposal,
  store,
  phase,
}: {
  proposal: PlanProposal;
  store: PlanStore | null;
  phase: PlanPhase;
}) {
  const { t, i18n } = useTranslation();
  const key = proposalKey(proposal.id);
  const view = useTaskProgress();
  const queryClient = useQueryClient();
  const bound = usePlanClient();
  // An edit or Not now in flight, or its refusal. It belongs to the account and session
  // it was made in, so it never shows for another one.
  const [request, setRequest] = useState<{ owner: AccountSnapshot; state: 'busy' | 'failed' } | null>(null);
  const ownRequest =
    request && bound && request.owner.accountId === bound.owner.accountId && request.owner.epoch === bound.owner.epoch
      ? request.state
      : null;
  const busy = isPlanUnresolved(phase) || ownRequest === 'busy';
  const draft = proposal.status === 'draft';
  const writable = Boolean(store && bound) && view.canWrite && draft;
  const canEdit = writable && !busy;
  const canApprove = canEdit && proposal.unresolved.length === 0;
  const tasks = new Map(proposal.tasks.map(task => [task.taskRef, task]));

  async function edit(run: (c: PlanClient) => Promise<PlanProposalResult>) {
    if (!bound || !stillOwned(bound.owner)) return;
    const { client, owner } = bound;
    setRequest({ owner, state: 'busy' });
    const result = await run(client);
    // A late reply after another account or session is dropped.
    if (!stillOwned(owner)) return;
    if (result.kind === 'ok' || result.kind === 'changed') {
      setRequest(null);
      queryClient.setQueryData(planProposalKey(owner.accountId as string, proposal.id), result.proposal);
      // A saved edit is a new revision: an earlier not-applied approval cannot apply.
      store?.supersedeNotApplied(key);
      store?.dismiss(key);
      return;
    }
    setRequest({ owner, state: 'failed' });
  }
  const revise = (items: PlanDraftItem[]) => {
    if (!canEdit) return;
    void edit(c => c.revise(proposal.id, proposal.revision, items));
  };
  const replaceItem = (index: number, next: PlanDraftItem[]) =>
    revise([...proposal.items.slice(0, index), ...next, ...proposal.items.slice(index + 1)]);

  const reviewNote = proposal.reviewReason
    ? t(
        proposal.reviewReason === 'edited'
          ? 'plans.reviewEdited'
          : proposal.reviewReason === 'context_changed'
            ? 'plans.reviewContextChanged'
            : 'plans.reviewRestored'
      )
    : null;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const profile = proposal.context?.profile;
  const before = proposal.reviewReason === 'context_changed' ? proposal.previousContext?.profile : null;

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.eyebrow}>{t('plans.draftBadge')}</Text>
        <Text style={styles.title} accessibilityRole='header'>
          {proposal.goal}
        </Text>
      </View>

      {view.stale && (
        <View style={styles.notice}>
          <MaterialIcons name='cloud-off' size={16} color={INK_MUTED} />
          <Text style={styles.noticeText}>{t('taskActions.offline')}</Text>
        </View>
      )}
      {reviewNote && (
        <View style={styles.review}>
          <Text style={styles.reviewText}>{reviewNote}</Text>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.label}>{t('taskCreate.basedOn')}</Text>
        {PROFILE_FIELDS.some(([f]) => profile?.[f]) ? (
          PROFILE_FIELDS.map(([field, label]) => {
            const value = profile?.[field];
            if (!value) return null;
            const shown = field === 'arrivalDate' ? formatDate(value, i18n.language) : value;
            const old = before?.[field];
            return (
              <View key={field}>
                <Text style={styles.contextLine}>{t(label, { value: shown })}</Text>
                {before && old && old !== value ? (
                  <Text style={styles.muted}>
                    {t('taskCreate.before', { value: field === 'arrivalDate' ? formatDate(old, i18n.language) : old })}
                  </Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.contextLine}>{t('taskCreate.noProfile')}</Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>{t('plans.existingSection')}</Text>
        {proposal.items.map((item, index) => {
          if (item.kind !== 'existing') return null;
          const now = tasks.get(item.taskRef);
          const title = (now && planTaskTitle(now)) ?? item.label ?? t('plans.untitledTask');
          const removed = now?.removed ?? false;
          return (
            <View key={item.taskRef} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={[styles.rowState, removed && styles.error]}>
                  {removed
                    ? t('plans.removedFromChecklist')
                    : t('plans.alreadyInChecklist', { state: stateLabel(now?.state ?? 'not_started') })}
                </Text>
              </View>
              {removed && (
                <SmallButton
                  label={t('plans.dropFromPlan')}
                  name={t('plans.dropA11y', { title })}
                  disabled={!canEdit}
                  onPress={() => replaceItem(index, [])}
                />
              )}
            </View>
          );
        })}
      </View>

      {proposal.items.some(i => i.kind === 'new') && (
        <View style={styles.block}>
          <Text style={styles.label}>{t('plans.newSection')}</Text>
          {proposal.items.map((item, index) => {
            if (item.kind !== 'new') return null;
            const matches = proposal.context?.matches[item.key] ?? [];
            const unresolved = proposal.unresolved.includes(item.key);
            const match = matches[0];
            const matchTitle = match
              ? match.title ?? (tasks.get(match.taskRef) && planTaskTitle(tasks.get(match.taskRef)!)) ?? item.title
              : null;
            return (
              <View key={item.key} style={styles.newItem}>
                <Pressable
                  accessibilityRole='checkbox'
                  accessibilityLabel={t('plans.includeA11y', { title: item.title })}
                  accessibilityState={{ checked: item.include, disabled: !canEdit }}
                  disabled={!canEdit}
                  onPress={() => replaceItem(index, [{ ...item, include: !item.include }])}
                  style={({ pressed }) => [styles.row, { minHeight: minTarget() }, pressed && styles.pressed]}
                >
                  <MaterialIcons
                    name={item.include ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={item.include ? ACCENT_STRONG : INK_MUTED}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowState}>
                      {item.include ? t('plans.newTaskToAdd') : t('plans.notIncluded')}
                    </Text>
                  </View>
                </Pressable>
                {item.include && match && (unresolved || item.confirmNew) && (
                  <View style={styles.match}>
                    <Text style={styles.contextLine}>
                      {item.confirmNew ? t('plans.keptAsNew') : t('plans.possibleMatch', { title: matchTitle })}
                    </Text>
                    {unresolved && (
                      <View style={styles.actions}>
                        <SmallButton
                          label={t('plans.useExisting')}
                          name={t('plans.useExisting')}
                          disabled={!canEdit}
                          onPress={() =>
                            replaceItem(index, [{ kind: 'existing', taskRef: match.taskRef, label: null }])
                          }
                        />
                        <SmallButton
                          label={t('plans.addAsNew')}
                          name={t('plans.addAsNew')}
                          disabled={!canEdit}
                          onPress={() => replaceItem(index, [{ ...item, confirmNew: true }])}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View accessibilityLiveRegion='polite' style={styles.status}>
        {proposal.status === 'cancelled' && <Text style={styles.contextLine}>{t('plans.cardClosed')}</Text>}
        {ownRequest === 'busy' && <Text style={styles.contextLine}>{t('plans.updating')}</Text>}
        {ownRequest === 'failed' && <Text style={[styles.contextLine, styles.error]}>{t('plans.editFailed')}</Text>}
        {draft && proposal.unresolved.length > 0 && (
          <Text style={styles.contextLine}>{t('plans.resolveFirst')}</Text>
        )}
        <PhaseLine phase={phase} store={store} storeKey={key} writable={writable && ownRequest !== 'busy'} />
      </View>

      {draft && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={
              proposal.changeCount > 0
                ? t('plans.approve', { count: proposal.changeCount })
                : t('plans.saveExisting')
            }
            disabled={!canApprove}
            accessibilityState={{ disabled: !canApprove }}
            onPress={() => canApprove && void store?.approve(proposal)}
            style={({ pressed }) => [
              styles.primaryButton,
              { minHeight: minTarget() },
              !canApprove && styles.disabled,
              pressed && canApprove && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {proposal.changeCount > 0
                ? t('plans.approve', { count: proposal.changeCount })
                : t('plans.saveExisting')}
            </Text>
          </Pressable>
          <SmallButton
            label={t('taskCreate.notNow')}
            name={t('taskCreate.notNow')}
            disabled={!canEdit}
            onPress={() => canEdit && void edit(c => c.cancel(proposal.id, proposal.revision))}
          />
        </View>
      )}
    </View>
  );
}

function SavedPlanById({
  planId,
  onOpenTask,
}: {
  planId: string;
  onOpenTask: (taskRef: string, title: string) => void;
}) {
  return <SavedPlan planId={planId} fallback={null} receipt={null} note={null} onOpenTask={onOpenTask} />;
}

function SavedPlan({
  planId,
  fallback,
  receipt: given,
  note,
  onOpenTask,
}: {
  planId: string | null;
  fallback: PlanView | null;
  receipt: PlanReceipt | null;
  note: string | null;
  onOpenTask: (taskRef: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const plans = usePlans();
  const store = usePlanStore('companion');
  const view = useTaskProgress();
  // The current plan from the account's latest read; its progress is the shared tasks'.
  const plan = plans.plans.find(p => p.planId === planId) ?? fallback;
  const receipt = plan?.receipt ?? given;
  const undoKey = receipt ? receiptKey(receipt.operationId) : null;
  const phase = usePlanPhase(store, undoKey);
  const compensation = phase.phase === 'undo_review' ? phase.proposal : null;
  const compPhase = usePlanPhase(store, compensation ? proposalKey(compensation.id) : null);
  const [confirming, setConfirming] = useState(false);
  const busy = isPlanUnresolved(phase) || isPlanUnresolved(compPhase);
  const writable = Boolean(store) && view.canWrite && !busy;

  const undone =
    (phase.phase === 'saved' && phase.reply.receipt.kind === 'plan_undo' ? phase.reply.receipt : null) ??
    (compPhase.phase === 'saved' ? compPhase.reply.receipt : null);
  if (!plan && !undone) {
    return (
      <Text style={styles.message} accessibilityLiveRegion='polite'>
        {plans.status === 'ready' ? t('plans.undoneBadge') : t('plans.loadingPlan')}
      </Text>
    );
  }
  const live = plan?.items ?? [];
  const added = receipt?.results.filter(r => r.outcome === 'created') ?? [];
  const failed = receipt?.results.filter(r => r.outcome === 'failed' && receipt.retryable.includes(r.key ?? '')) ?? [];
  const retried = phase.phase === 'saved' && phase.reply.receipt.kind === 'plan_retry' ? phase.reply.receipt : null;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.eyebrow}>{undone ? t('plans.undoneBadge') : t('plans.savedBadge')}</Text>
        <Text style={styles.title} accessibilityRole='header'>
          {plan?.goal ?? ''}
        </Text>
      </View>
      {note && <Text style={styles.contextLine}>{note}</Text>}
      {view.stale && (
        <View style={styles.notice}>
          <MaterialIcons name='cloud-off' size={16} color={INK_MUTED} />
          <Text style={styles.noticeText}>{t('taskActions.offline')}</Text>
        </View>
      )}

      {!undone && (
        <View style={styles.block}>
          {live.map(task => (
            <PlanTaskRow key={task.taskRef} task={task} stateLabel={stateLabel} onOpenTask={onOpenTask} />
          ))}
        </View>
      )}

      <View accessibilityLiveRegion='polite' style={styles.status}>
        {undone ? (
          <Text style={styles.receipt}>{planReceiptSummary(t, undone)}</Text>
        ) : receipt ? (
          <View style={styles.receiptBox}>
            <Text style={styles.receipt}>{planReceiptSummary(t, receipt)}</Text>
            {retried && <Text style={styles.contextLine}>{planReceiptSummary(t, retried)}</Text>}
            {receipt.results.some(r => r.outcome === 'failed') && failed.length > 0 && (
              <Text style={[styles.contextLine, styles.error]}>
                {t('plans.receiptFailed', { titles: recordedTitles(failed, t) })}
              </Text>
            )}
            {failed.length > 0 && !receipt.undoneBy && (
              <SmallButton
                label={t('plans.retryFailed', { count: failed.length })}
                name={t('plans.retryFailed', { count: failed.length })}
                disabled={!writable}
                onPress={() => writable && void store?.retryFailed(receipt.operationId)}
              />
            )}
            {receipt.undoable && !confirming && phase.phase !== 'undo_review' && (
              <SmallButton
                label={t('plans.undo')}
                name={t('plans.undo')}
                disabled={!writable}
                onPress={() => writable && setConfirming(true)}
              />
            )}
            {confirming && (
              <View style={styles.review}>
                <Text style={styles.reviewText}>
                  {receipt.removalCount > 0
                    ? t('plans.confirmUndo', { count: added.length, titles: recordedTitles(added, t) })
                    : t('plans.confirmUndoNone')}
                </Text>
                <View style={styles.actions}>
                  <PrimaryButton
                    label={t('plans.undoConfirm')}
                    disabled={!writable}
                    onPress={() => {
                      if (!writable) return;
                      setConfirming(false);
                      // The confirmation above is the user's explicit removal confirmation.
                      void store?.undo(receipt.operationId, { removalConfirmed: receipt.removalCount > 0 });
                    }}
                  />
                  <SmallButton label={t('plans.keepPlan')} name={t('plans.keepPlan')} onPress={() => setConfirming(false)} />
                </View>
              </View>
            )}
            {compensation && compPhase.phase !== 'saved' && (
              <View style={styles.review}>
                <Text style={styles.reviewText}>
                  {t('plans.undoConflict', {
                    titles: (phase.phase === 'undo_review' ? phase.current : [])
                      .map(c => c.title ?? t('plans.untitledTask'))
                      .join(', '),
                  })}
                </Text>
                <View style={styles.actions}>
                  <PrimaryButton
                    label={t('plans.undoTheRest')}
                    disabled={!writable}
                    onPress={() =>
                      writable && void store?.approve(compensation, { removalConfirmed: compensation.changeCount > 0 })
                    }
                  />
                  <SmallButton
                    label={t('plans.keepPlan')}
                    name={t('plans.keepPlan')}
                    onPress={() => undoKey && store?.dismiss(undoKey)}
                  />
                </View>
              </View>
            )}
            <PhaseLine phase={compensation ? compPhase : phase} store={store} storeKey={compensation ? proposalKey(compensation.id) : undoKey ?? ''} writable={Boolean(store) && view.canWrite} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PlanTaskRow({
  task,
  stateLabel,
  onOpenTask,
}: {
  task: PlanTaskNow;
  stateLabel: (s: TaskState) => string;
  onOpenTask: (taskRef: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const title = planTaskTitle(task) ?? t('plans.untitledTask');
  const state = task.removed ? t('plans.taskRemoved') : stateLabel(task.state);
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={t('plans.taskRowA11y', { title, state })}
      accessibilityState={{ disabled: task.removed }}
      // A removed task is never opened or recreated from the plan.
      disabled={task.removed}
      onPress={() => onOpenTask(task.taskRef, title)}
      style={({ pressed }) => [styles.row, { minHeight: minTarget() }, pressed && !task.removed && styles.pressed]}
    >
      <MaterialIcons
        name={task.state === 'completed' && !task.removed ? 'check-circle' : 'radio-button-unchecked'}
        size={20}
        color={task.removed ? INK_MUTED : ACCENT_STRONG}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, task.removed && styles.muted]}>{title}</Text>
        <Text style={styles.rowState}>{state}</Text>
      </View>
    </Pressable>
  );
}

function PhaseLine({
  phase,
  store,
  storeKey,
  writable,
}: {
  phase: PlanPhase;
  store: PlanStore | null;
  storeKey: string;
  writable: boolean;
}) {
  const { t } = useTranslation();
  const line = (text: string, isError = false) => (
    <Text style={[styles.contextLine, isError && styles.error]}>{text}</Text>
  );
  switch (phase.phase) {
    case 'saving':
      return line(t('taskActions.saving'));
    case 'checking':
      return line(t('taskActions.checking'));
    case 'pending':
    case 'lookup_failed':
      return (
        <View style={styles.actions}>
          {line(t(phase.phase === 'pending' ? 'taskActions.pending' : 'taskActions.lookupFailed'), true)}
          <SmallButton
            label={t('taskActions.checkAgain')}
            name={t('taskActions.checkAgain')}
            onPress={() => void store?.checkAgain(storeKey)}
          />
        </View>
      );
    case 'not_applied':
      return (
        <View style={styles.actions}>
          {line(t('taskActions.notApplied'), true)}
          <SmallButton
            label={t('taskActions.retry')}
            name={t('taskActions.retry')}
            disabled={!writable}
            onPress={() => writable && void store?.retrySame(storeKey)}
          />
        </View>
      );
    case 'refused':
      return line(phase.reason === 'task_removed' ? t('taskActions.removed') : t('taskActions.refused'), true);
    case 'already_undone':
      return line(t('plans.alreadyUndone'));
    case 'unavailable':
      return line(t('taskActions.unavailable'), true);
    case 'signed_out':
      return line(t('taskActions.signedOut'), true);
    default:
      return null;
  }
}

function SmallButton({
  label,
  name,
  onPress,
  disabled = false,
}: {
  label: string;
  name: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={name}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { minHeight: minTarget() },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { minHeight: minTarget() },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatDate(value: string, language: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  message: { ...typography.secondary, color: INK_MUTED, paddingVertical: 12 },
  eyebrow: { ...typography.caption, color: INK_MUTED },
  title: { ...typography.section, color: INK, marginTop: 2 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: SURFACE_MUTED },
  noticeText: { ...typography.caption, color: INK_SECONDARY, flex: 1 },
  review: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FBD5A5', backgroundColor: ACCENT_BG },
  reviewText: { ...typography.secondary, color: INK },
  block: { gap: 6 },
  label: { ...typography.caption, fontWeight: '600', color: INK },
  contextLine: { ...typography.secondary, color: INK_SECONDARY },
  muted: { color: INK_MUTED },
  error: { color: ERROR },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  rowState: { ...typography.caption, color: INK_SECONDARY },
  newItem: { gap: 6 },
  match: { gap: 6, paddingStart: 34 },
  status: { gap: 10 },
  receiptBox: { gap: 8 },
  receipt: { ...typography.secondary, fontWeight: '600', color: INK },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  primaryButton: { paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT_STRONG },
  primaryButtonText: { ...typography.secondary, fontWeight: '600', color: '#fff' },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: { ...typography.secondary, fontWeight: '600', color: INK },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
