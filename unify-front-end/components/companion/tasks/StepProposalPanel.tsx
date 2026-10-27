import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { Theme } from '@/constants/Theme';
import {
  isStepProposal,
  type StepProposal,
} from '@/services/companionActions/contract';
import {
  stillOwned,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import {
  isUnresolved,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  progressFor,
  stepProposalKey,
  useStepProposal,
  useTaskActionClient,
  useTaskActionPhase,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';
import { PhaseMessage } from './TaskStatePanel';
import { ReceiptBlock } from './ReceiptBlock';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT = Theme.primaryGatherRed;
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';
const ERROR = '#B42318';

interface StepProposalPanelProps {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** The current title of the task the steps are for, or null. */
  taskTitle: string | null;
}

/**
 * Review of suggested steps for one task (mobile-app#366), in the direction B bottom
 * sheet. Nothing is saved until approval. Choosing which steps to add saves a new
 * revision of the server draft first, so the approval always names exactly the steps
 * shown as selected. Not now closes the draft and writes nothing.
 */
export function StepProposalPanel({
  proposalId,
  view,
  store,
  taskTitle,
}: StepProposalPanelProps) {
  const { t } = useTranslation();
  const key = `proposal:${proposalId}`;
  const queryClient = useQueryClient();
  const bound = useTaskActionClient();
  const query = useStepProposal(proposalId);
  const phase = useTaskActionPhase(store, key);
  // The steps first suggested, so an excluded one can be selected again.
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const [request, setRequest] = useState<{
    owner: AccountSnapshot;
    state: 'busy' | 'failed';
  } | null>(null);
  const ownRequest =
    request &&
    bound &&
    request.owner.accountId === bound.owner.accountId &&
    request.owner.epoch === bound.owner.epoch
      ? request.state
      : null;

  const proposal: StepProposal | undefined =
    phase.phase === 'needs_review' &&
    isStepProposal(phase.proposal) &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;

  useEffect(() => {
    if (proposal && suggested === null) setSuggested(proposal.operation.titles);
  }, [proposal, suggested]);

  if (!proposal) {
    return (
      <Text style={styles.message} accessibilityLiveRegion='polite'>
        {query.isError ? t('taskCreate.draftUnavailable') : t('taskCreate.loadingDraft')}
      </Text>
    );
  }

  const selected = proposal.operation.titles;
  const all = [...(suggested ?? selected)];
  for (const title of selected) if (!all.includes(title)) all.push(title);
  const parent = progressFor(proposal.operation.task_ref, view);
  const requestBusy = ownRequest === 'busy';
  const busy = isUnresolved(phase) || requestBusy;
  const writable =
    Boolean(store && bound) &&
    view.canWrite &&
    !parent.removed &&
    parent.state !== 'completed';
  const canWrite = writable && proposal.status === 'draft' && !busy;
  const savedReceipt = phase.phase === 'saved' ? phase.receipt : null;
  const receipt = savedReceipt && savedReceipt.operationId !== proposal.receipt?.operationId
    ? savedReceipt
    : proposal.receipt ?? savedReceipt;
  const task = taskTitle ?? t('taskSteps.cardTitleUnknownTask');

  /** A Not now or selection change, made and shown only as the session that opened it. */
  async function draftRequest(
    run: () => ReturnType<NonNullable<typeof bound>['client']['reviseSteps']>
  ) {
    if (!bound || !stillOwned(bound.owner)) return;
    const { owner } = bound;
    setRequest({ owner, state: 'busy' });
    const result = await run();
    if (!stillOwned(owner)) return;
    if (result.kind === 'ok' || result.kind === 'changed') {
      setRequest(null);
      queryClient.setQueryData(stepProposalKey(owner.accountId as string, proposalId), result.proposal);
      return;
    }
    setRequest({ owner, state: 'failed' });
  }

  function toggle(title: string) {
    if (!canWrite || !bound) return;
    const next = all.filter(t2 =>
      t2 === title ? !selected.includes(title) : selected.includes(t2)
    );
    if (next.length === 0) return;
    // The selection is a new revision of the draft; approval then names exactly it.
    store?.supersedeNotApplied(key);
    void draftRequest(() =>
      bound.client.reviseSteps(proposal!.proposalId, proposal!.proposalRevision, {
        type: 'step.create',
        task_ref: proposal!.operation.task_ref,
        titles: next,
      })
    );
  }

  function approve() {
    if (!canWrite || !store) return;
    store.dismiss(key);
    void store.applyOperation(key, proposal!.operation, {
      kind: 'approved_proposal',
      proposal_id: proposal!.proposalId,
      proposal_revision: proposal!.proposalRevision,
    });
  }

  function notNow() {
    if (!canWrite || !bound) return;
    void draftRequest(() => bound.client.cancelSteps(proposal!.proposalId, proposal!.proposalRevision));
  }

  const reviewNote =
    proposal.status === 'draft' && proposal.reviewReason === 'context_changed'
      ? t('taskSteps.needsReview')
      : proposal.status === 'draft' && proposal.reviewReason === 'restored'
        ? t('taskSteps.restored')
        : null;

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.eyebrow}>
          {proposal.status === 'draft' ? t('taskSteps.draftBadge') : t('taskSteps.cardEyebrow')}
        </Text>
        <Text style={styles.title}>{t('taskSteps.forTask', { task })}</Text>
      </View>
      {view.stale && (
        <View style={styles.notice}>
          <MaterialIcons name='cloud-off' size={16} color={INK_MUTED} />
          <Text style={styles.noticeText}>{t('taskActions.offline')}</Text>
        </View>
      )}
      {parent.state === 'completed' && proposal.status === 'draft' && (
        <Text style={[styles.hint, styles.error]}>{t('taskSteps.taskCompleted')}</Text>
      )}
      {parent.removed && proposal.status === 'draft' && (
        <Text style={[styles.hint, styles.error]}>{t('taskSteps.removedTask')}</Text>
      )}
      {reviewNote && (
        <View style={styles.review}>
          <Text style={styles.reviewText}>{reviewNote}</Text>
        </View>
      )}
      {proposal.status === 'draft' && (
        <Text style={styles.hint}>{t('taskSteps.reviewHint')}</Text>
      )}

      <View accessibilityRole='list'>
        {(proposal.status === 'draft' ? all : selected).map(title => {
          const on = selected.includes(title);
          return (
            <Pressable
              key={title}
              accessibilityRole='checkbox'
              accessibilityLabel={title}
              accessibilityState={{ checked: on, disabled: !canWrite }}
              disabled={!canWrite || proposal.status !== 'draft'}
              onPress={() => toggle(title)}
              style={({ pressed }) => [styles.row, { minHeight: minTarget() }, pressed && styles.pressed]}
            >
              <MaterialIcons
                name={on ? 'check-box' : 'check-box-outline-blank'}
                size={22}
                color={on ? ACCENT : INK_MUTED}
              />
              <Text style={styles.rowText}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
      {proposal.existingSteps.map(s => (
        <Text key={s.stepId} style={styles.hint}>
          {t('taskSteps.sameTitle', { title: s.title })}
        </Text>
      ))}

      <View accessibilityLiveRegion='polite' style={styles.status}>
        {requestBusy && <Text style={styles.hint}>{t('taskSteps.updating')}</Text>}
        {ownRequest === 'failed' && (
          <Text style={[styles.hint, styles.error]}>{t('taskActions.refused')}</Text>
        )}
        {proposal.status === 'cancelled' && <Text style={styles.hint}>{t('taskSteps.closed')}</Text>}
        {receipt?.operationType === 'step.create' && (
          <Text style={styles.savedText}>
            {t('taskSteps.added', { count: receipt.steps?.length ?? 0 })}
          </Text>
        )}
        {phase.phase !== 'saved' && phase.phase !== 'needs_review' && (
          <PhaseMessage writable={writable} phase={phase} stateLabel={s => s} store={store} taskRef={key} />
        )}
        {phase.phase === 'refused' && phase.reason === 'task_completed' && (
          <Text style={[styles.hint, styles.error]}>{t('taskSteps.taskCompleted')}</Text>
        )}
        {receipt && (
          <ReceiptBlock
            receipt={receipt}
            storeKey={key}
            store={store}
            canWrite={writable && !busy && phase.phase !== 'undo_review'}
          />
        )}
      </View>

      {proposal.status === 'draft' && !receipt && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskSteps.approve', { count: selected.length })}
            disabled={!canWrite}
            accessibilityState={{ disabled: !canWrite }}
            onPress={approve}
            style={({ pressed }) => [
              styles.primaryButton,
              { minHeight: minTarget() },
              !canWrite && styles.disabled,
              pressed && canWrite && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {t('taskSteps.approve', { count: selected.length })}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskSteps.notNow')}
            disabled={!canWrite}
            accessibilityState={{ disabled: !canWrite }}
            onPress={notNow}
            style={({ pressed }) => [
              styles.secondaryButton,
              { minHeight: minTarget() },
              !canWrite && styles.disabled,
              pressed && canWrite && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{t('taskSteps.notNow')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  message: { ...typography.secondary, color: INK_SECONDARY, padding: 16 },
  eyebrow: { ...typography.caption, color: ACCENT_STRONG, fontWeight: '600' },
  title: { ...typography.cardTitle, color: INK },
  hint: { ...typography.caption, color: INK_MUTED },
  error: { color: ERROR },
  notice: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: SURFACE_MUTED,
  },
  noticeText: { ...typography.caption, color: INK_SECONDARY, flex: 1 },
  review: { padding: 12, borderRadius: 12, backgroundColor: ACCENT_BG },
  reviewText: { ...typography.secondary, color: INK },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowText: { ...typography.secondary, color: INK, flexShrink: 1 },
  status: { gap: 6 },
  savedText: { ...typography.secondary, color: INK, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_STRONG,
  },
  primaryButtonText: { ...typography.secondary, fontWeight: '600', color: '#fff' },
  secondaryButton: {
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
