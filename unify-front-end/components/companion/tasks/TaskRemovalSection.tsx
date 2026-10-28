import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import {
  isRemovalProposal,
  taskRemoveOperation,
  type RemovalProposal,
  type TaskProgress,
} from '@/services/companionActions/contract';
import {
  isUnresolved,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import { stillOwned } from '@/services/account/accountSession';
import {
  useTaskActionClient,
  useTaskActionPhase,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const BORDER = '#E2E8F0';
const ERROR = '#B42318';
const ERROR_BG = '#FEF3F2';

type Review =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; proposal: RemovalProposal; changed: boolean };

interface TaskRemovalSectionProps {
  taskRef: string;
  /** The task's title as the Checklist shows it (content-backed tasks have no server title). */
  taskTitle: string | null;
  progress: TaskProgress;
  store: TaskActionStore | null;
  /** A connection, a fresh read and a live task. */
  writable: boolean;
}

const noopSubscribe = () => () => {};

/**
 * Removal of one task (mobile-app#367), inside the task panel of the Checklist sheet and
 * the Companion bottom sheet. "Remove task" asks the action service for a removal review
 * that names the task and what removing it affects (saved plans, steps kept as history,
 * pending reminders). Only "Remove task" in that review removes it, bound to the reviewed
 * revision; Cancel sends nothing. A change since the review opens a revised review.
 */
export function TaskRemovalSection({
  taskRef,
  taskTitle,
  progress,
  store,
  writable,
}: TaskRemovalSectionProps) {
  const { t } = useTranslation();
  const actions = useTaskActionClient();
  const phase = useTaskActionPhase(store, taskRef);
  const [review, setReview] = useState<Review>({ status: 'idle' });
  const busy = isUnresolved(phase);
  const removeRef = useRef<View>(null);
  const headingRef = useRef<Text>(null);
  const focusTarget = useRef<'heading' | 'remove' | null>(null);

  const requested = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.hasRemovalRequest(taskRef) ?? false,
    () => false
  );

  async function open(proposalId: string | null) {
    if (!actions || progress.removed) return;
    const { client, owner } = actions;
    setReview({ status: 'loading' });
    const result = proposalId
      ? await client.removalProposal(proposalId)
      : await client.prepareRemoval(taskRemoveOperation(progress), null);
    // A reply for an account that is no longer signed in reaches no screen.
    if (!stillOwned(owner)) return;
    if (result.kind === 'ok' || result.kind === 'changed') {
      // A review that was already used names its receipt; a fresh one is prepared instead.
      if (result.proposal.status !== 'draft' && proposalId) return open(null);
      focusTarget.current = 'heading';
      setReview({ status: 'ready', proposal: result.proposal, changed: false });
    } else {
      setReview({ status: 'failed' });
    }
  }

  // A removal asked for from a conversation card or the Checklist sheet header.
  useEffect(() => {
    if (!requested || !store) return;
    const proposalId = store.takeRemovalRequest(taskRef);
    if (proposalId !== undefined) void open(proposalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, store, taskRef]);

  // The approval found a change since the review: show the revised review, nothing removed.
  useEffect(() => {
    if (phase.phase === 'needs_review' && isRemovalProposal(phase.proposal)) {
      focusTarget.current = 'heading';
      setReview({ status: 'ready', proposal: phase.proposal, changed: true });
    }
  }, [phase]);

  useEffect(() => {
    const target =
      focusTarget.current === 'heading' ? headingRef.current : focusTarget.current === 'remove' ? removeRef.current : null;
    if (!target) return;
    focusTarget.current = null;
    const node = findNodeHandle(target);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  });

  function cancel() {
    // Sends nothing: the task, its plans, steps and reminders stay as they are.
    if (phase.phase === 'needs_review') store?.dismiss(taskRef);
    focusTarget.current = 'remove';
    setReview({ status: 'idle' });
  }

  function confirm() {
    if (review.status !== 'ready' || !store || !writable || busy) return;
    const { proposal } = review;
    setReview({ status: 'idle' });
    void store.applyOperation(taskRef, proposal.operation, {
      kind: 'approved_proposal',
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
      removal_confirmed: true,
    });
  }

  // A removed task (here or on another device) has nothing to remove: no review, no control.
  if (progress.removed) return null;
  // An Undo that met a newer edit already offers its own reviewed change (a removal or a
  // restore) in this panel: one removal control at a time.
  if (phase.phase === 'undo_review') return null;

  if (review.status === 'ready') {
    const { proposal, changed } = review;
    const effects = proposal.effects;
    const title = effects.title ?? taskTitle;
    const canConfirm = writable && !busy && proposal.status === 'draft' && !effects.removed;
    return (
      <View style={styles.review} testID='task-removal-review'>
        <Text ref={headingRef} style={styles.reviewTitle} accessibilityRole='header'>
          {title ? t('taskRemove.reviewTitle', { title }) : t('taskRemove.reviewTitleUnknown')}
        </Text>
        {changed && (
          <Text style={[styles.text, styles.error]} accessibilityLiveRegion='polite'>
            {t('taskRemove.changed')}
          </Text>
        )}
        <Text style={styles.text}>
          {t('taskRemove.currentState', { state: t(`taskActions.state.${effects.state}`) })}
        </Text>
        <Text style={styles.text}>
          {effects.plans.length > 0
            ? t('taskRemove.effectPlans', { goals: effects.plans.map(p => p.goal).join(', ') })
            : t('taskRemove.effectNoPlans')}
        </Text>
        {effects.stepsTotal > 0 && (
          <Text style={styles.text}>{t('taskRemove.effectSteps', { n: effects.stepsTotal })}</Text>
        )}
        {effects.remindersPending > 0 && (
          <Text style={styles.text}>
            {t('taskRemove.effectReminders', { n: effects.remindersPending })}
          </Text>
        )}
        <Text style={styles.text}>{t('taskRemove.effectChecklist')}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskRemove.confirm')}
            disabled={!canConfirm}
            accessibilityState={{ disabled: !canConfirm }}
            onPress={confirm}
            style={({ pressed }) => [
              styles.dangerButton,
              { minHeight: minTarget() },
              !canConfirm && styles.disabled,
              pressed && canConfirm && styles.pressed,
            ]}
          >
            <Text style={styles.dangerButtonText}>{t('taskRemove.confirm')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskRemove.cancel')}
            onPress={cancel}
            style={({ pressed }) => [
              styles.secondaryButton,
              { minHeight: minTarget() },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{t('taskRemove.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const canStart = writable && !busy && Boolean(actions) && review.status !== 'loading';
  return (
    <View style={styles.section}>
      {review.status === 'loading' && (
        <Text style={styles.text} accessibilityLiveRegion='polite'>
          {t('taskRemove.preparing')}
        </Text>
      )}
      {review.status === 'failed' && (
        <Text style={[styles.text, styles.error]} accessibilityLiveRegion='polite'>
          {t('taskRemove.prepareFailed')}
        </Text>
      )}
      <Pressable
        ref={removeRef}
        accessibilityRole='button'
        accessibilityLabel={
          review.status === 'failed'
            ? t('taskRemove.tryAgain')
            : taskTitle
              ? t('taskRemove.removeTaskA11y', { title: taskTitle })
              : t('taskRemove.removeTask')
        }
        disabled={!canStart}
        accessibilityState={{ disabled: !canStart }}
        onPress={() => canStart && void open(null)}
        style={({ pressed }) => [
          styles.removeButton,
          { minHeight: minTarget() },
          !canStart && styles.disabled,
          pressed && canStart && styles.pressed,
        ]}
      >
        <MaterialIcons name='delete-outline' size={18} color={ERROR} />
        <Text style={styles.removeText}>
          {review.status === 'failed' ? t('taskRemove.tryAgain') : t('taskRemove.removeTask')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: BORDER },
  text: { ...typography.secondary, color: INK_SECONDARY },
  error: { color: ERROR },
  review: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECDCA',
    backgroundColor: ERROR_BG,
  },
  reviewTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
  },
  removeText: { ...typography.secondary, fontWeight: '600', color: ERROR },
  dangerButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ERROR,
  },
  dangerButtonText: { ...typography.secondary, fontWeight: '600', color: '#fff' },
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
