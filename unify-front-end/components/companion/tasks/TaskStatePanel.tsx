import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { Theme } from '@/constants/Theme';
import {
  TASK_STATES,
  WAITING_REASON_MAX,
  isRemoval,
  setStateOperation,
  type TaskReceipt,
  type TaskState,
  type TaskStep,
} from '@/services/companionActions/contract';
import {
  isUnresolved,
  type TaskActionPhase,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  progressFor,
  useTaskActionDraft,
  useTaskActionPhase,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';
import { ReceiptBlock } from './ReceiptBlock';
import { TaskRemovalSection } from './TaskRemovalSection';
import { TaskStepsSection } from './TaskStepsSection';

const STATE_ICON: Record<
  TaskState,
  React.ComponentProps<typeof MaterialIcons>['name']
> = {
  not_started: 'radio-button-unchecked',
  in_progress: 'timelapse',
  waiting: 'hourglass-empty',
  completed: 'check-circle',
};

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
// The brand orange marks selection; text and filled buttons use a darker orange
// so they keep at least 4.5:1 contrast.
const ACCENT = Theme.primaryGatherRed;
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';
const ERROR = '#B42318';

interface TaskStatePanelProps {
  taskRef: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** #367: the title the Checklist shows (named in the removal review and its receipt). */
  taskTitle?: string | null;
}

/**
 * Explicit controls for one existing Checklist task (mobile-app#361): the four
 * states, an editable waiting reason, the exact saved receipt with Undo for that
 * receipt only, and every unresolved outcome. Since #366 also the task's steps.
 * Used by the Checklist task sheet and the Companion task sheet; both read the same
 * saved record.
 */
export function TaskStatePanel({
  taskRef,
  view,
  store,
  taskTitle = null,
}: TaskStatePanelProps) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, taskRef);
  const progress = progressFor(taskRef, view);
  const draft = useTaskActionDraft(store, taskRef);
  const reasonValue = draft ?? progress.waitingReason ?? '';
  const busy = isUnresolved(phase);
  // Opening these controls is an editing entry: progress may have changed on
  // another platform since the last read. Read it again, and keep every control
  // off until a read that finished after this entry is on screen.
  const [enteredAt] = useState(() => Date.now());
  const { refetch } = view;
  useEffect(() => {
    refetch();
  }, [refetch]);
  const reconciled = view.readAt >= enteredAt;
  // Every write, including a retry or an approved compensating change, needs a
  // fresh successful read; after a failed read nothing is sent or queued.
  const writable =
    Boolean(store) && view.canWrite && reconciled && !progress.removed;
  const canWrite = writable && !busy;
  // #367: the Undo of a removal restores a removed task, so it does not need a live task.
  const canUndoRemoval =
    Boolean(store) && view.canWrite && reconciled && !busy;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const reasonChanged = reasonValue.trim() !== (progress.waitingReason ?? '');

  // Screen readers hear the saved result once; the status text also stays on screen.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (
      phase.phase === 'saved' &&
      announced.current !== phase.receipt.operationId
    ) {
      announced.current = phase.receipt.operationId;
      const receipt = phase.receipt;
      const title = receipt.title ?? taskTitle;
      const result = receipt.operationType === 'task.remove'
        ? title
          ? t('taskRemove.receiptRemoved', { title })
          : t('taskRemove.receiptRemovedUnknown')
        : receipt.operationType === 'task.restore'
          ? title
            ? t('taskRemove.receiptRestored', { title })
            : t('taskRemove.receiptRestoredUnknown')
          : t('taskActions.savedAnnouncement', {
              state: stateLabel(receipt.afterState),
            });
      AccessibilityInfo.announceForAccessibility(result);
    }
  });

  function choose(next: TaskState) {
    if (!canWrite || !store || next === progress.state) return;
    void store.setState(
      setStateOperation(
        progress,
        next,
        next === 'waiting' ? reasonValue : undefined
      )
    );
  }

  function saveReason() {
    if (!canWrite || !store || progress.state !== 'waiting' || !reasonChanged)
      return;
    // Clear the draft only when this exact text was saved and nothing newer was
    // typed while the save was in flight.
    const submitted = reasonValue;
    void store
      .setState(setStateOperation(progress, 'waiting', submitted))
      .then(() => {
        if (
          store.get(taskRef).phase === 'saved' &&
          (store.draft(taskRef) ?? submitted) === submitted
        )
          store.setDraft(taskRef, undefined);
      });
  }

  // The result of this panel's last save stays on screen, but it stops reading as
  // current once the saved task moves past the revision it produced (a newer
  // change here or on another platform). Its Undo still names this receipt only.
  const receipt: TaskReceipt | null =
    phase.phase === 'saved'
      ? {
          ...phase.receipt,
          current:
            phase.receipt.current &&
            progress.revision === phase.receipt.afterRevision,
        }
      : progress.lastReceipt;

  return (
    <View style={styles.root}>
      {view.stale && (
        <View style={styles.notice}>
          <MaterialIcons name='cloud-off' size={16} color={INK_MUTED} />
          <Text style={styles.noticeText}>{t('taskActions.offline')}</Text>
        </View>
      )}
      {progress.removed && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t('taskActions.removed')}</Text>
        </View>
      )}

      <TaskStepsSection
        taskRef={taskRef}
        progress={progress}
        view={view}
        store={store}
        writable={writable}
      />

      <Text style={styles.sectionLabel} accessibilityRole='header'>
        {t('taskActions.stateLabel')}
      </Text>
      <View
        style={styles.stateGrid}
        accessibilityRole='radiogroup'
        accessibilityLabel={t('taskActions.stateLabel')}
      >
        {TASK_STATES.map(s => {
          const selected = progress.state === s;
          return (
            <Pressable
              key={s}
              accessibilityRole='radio'
              accessibilityLabel={stateLabel(s)}
              accessibilityState={{
                selected,
                checked: selected,
                disabled: !canWrite,
              }}
              onPress={() => choose(s)}
              style={({ pressed }) => [
                styles.stateOption,
                selected && styles.stateOptionSelected,
                !canWrite && !selected && styles.stateOptionDisabled,
                pressed && canWrite && styles.stateOptionPressed,
              ]}
            >
              <MaterialIcons
                name={STATE_ICON[s]}
                size={18}
                color={selected ? ACCENT : INK_MUTED}
              />
              <Text
                style={[styles.stateText, selected && styles.stateTextSelected]}
              >
                {stateLabel(s)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('taskActions.completedHint')}</Text>

      {progress.state === 'waiting' && (
        <View style={styles.reasonBlock}>
          <Text style={styles.sectionLabel} nativeID={`reason-${taskRef}`}>
            {t('taskActions.waitingLabel')}
          </Text>
          <TextInput
            value={reasonValue}
            onChangeText={text => store?.setDraft(taskRef, text)}
            placeholder={t('taskActions.waitingPlaceholder')}
            placeholderTextColor='#94A3B8'
            maxLength={WAITING_REASON_MAX}
            multiline
            editable={Boolean(store)}
            accessibilityLabel={t('taskActions.waitingLabel')}
            accessibilityLabelledBy={`reason-${taskRef}`}
            style={styles.reasonInput}
            textAlignVertical='top'
          />
          <View style={styles.reasonFooter}>
            <Text style={styles.counter}>
              {t('taskActions.charactersLeft', {
                remaining: WAITING_REASON_MAX - reasonValue.length,
              })}
            </Text>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskActions.saveReason')}
              disabled={!canWrite || !reasonChanged}
              accessibilityState={{ disabled: !canWrite || !reasonChanged }}
              onPress={saveReason}
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: minTarget() },
                (!canWrite || !reasonChanged) && styles.buttonDisabled,
                pressed && styles.stateOptionPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {t('taskActions.saveReason')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View accessibilityLiveRegion='polite' style={styles.statusBlock}>
        <PhaseMessage
          writable={writable}
          phase={phase}
          stateLabel={stateLabel}
          store={store}
          taskRef={taskRef}
          steps={view.stepsByRef.get(taskRef)}
          canRestore={canUndoRemoval}
        />
        {receipt && phase.phase !== 'undo_review' && (
          <ReceiptBlock
            receipt={receipt}
            storeKey={taskRef}
            store={store}
            canWrite={
              receipt.operationType === 'task.remove' ? canUndoRemoval : canWrite
            }
            taskTitle={taskTitle}
          />
        )}
      </View>

      <TaskRemovalSection
        taskRef={taskRef}
        taskTitle={taskTitle}
        progress={progress}
        store={store}
        writable={writable}
      />
    </View>
  );
}

/** The visible outcome of the last write of one store key (task, draft or command). */
export function PhaseMessage({
  writable,
  phase,
  stateLabel,
  store,
  taskRef,
  steps = [],
  canRestore = false,
}: {
  writable: boolean;
  phase: TaskActionPhase;
  stateLabel: (s: TaskState) => string;
  store: TaskActionStore | null;
  taskRef: string;
  steps?: readonly TaskStep[];
  /** #367: a fresh read and no unresolved write; the task may be removed. */
  canRestore?: boolean;
}) {
  const { t } = useTranslation();
  const line = (text: string, isError = false) => (
    <Text style={[styles.statusText, isError && styles.statusError]}>
      {text}
    </Text>
  );
  const errorLine = (text: string) => line(text, true);
  const action = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { minHeight: minTarget() },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.stateOptionPressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );

  switch (phase.phase) {
    case 'saving':
      return line(t('taskActions.saving'));
    case 'checking':
      return line(t('taskActions.checking'));
    case 'saved':
      return line(t('taskActions.saved'));
    case 'refused':
      return errorLine(
        phase.reason === 'task_removed'
          ? t('taskActions.removed')
          : t('taskActions.refused')
      );
    case 'conflict':
      return errorLine(t('taskActions.conflict'));
    case 'already_undone':
      return line(t('taskActions.alreadyUndone'));
    case 'undo_blocked':
      return line(
        phase.reason === 'not_removed'
          ? t('taskRemove.undoNotRemoved')
          : t('taskRemove.undoRemovedAgain')
      );
    case 'command_used':
      return line(t('taskCreate.commandUsed'));
    case 'needs_clarification':
      return errorLine(t('taskCreate.needsClarification'));
    case 'signed_out':
      return errorLine(t('taskActions.signedOut'));
    case 'unavailable':
      return errorLine(t('taskActions.unavailable'));
    case 'pending':
    case 'lookup_failed':
      return (
        <View style={styles.statusRow}>
          {errorLine(
            t(
              phase.phase === 'pending'
                ? 'taskActions.pending'
                : 'taskActions.lookupFailed'
            )
          )}
          {action(
            t('taskActions.checkAgain'),
            () => void store?.checkAgain(taskRef)
          )}
        </View>
      );
    case 'not_applied':
      return (
        <View style={styles.statusRow}>
          {errorLine(t('taskActions.notApplied'))}
          {action(
            t('taskActions.retry'),
            () => writable && void store?.retry(taskRef),
            !writable
          )}
        </View>
      );
    case 'undo_review': {
      const proposed = phase.proposal.operations[0];
      if (proposed.type.startsWith('step.')) {
        // #366: Undo of a step change met a newer edit. Nothing changed; the offered
        // change needs approval, and a removal also its confirmation (this button).
        const removes = isRemoval(proposed);
        const targets = proposed.type === 'step.remove_created'
          ? proposed.steps
          : proposed.type === 'step.remove'
            ? [{ step_id: proposed.step_id, expected_revision: proposed.expected_revision }]
            : [];
        const currentTargets = targets.map(target => ({
          ...target,
          current: steps.find(step => step.stepId === target.step_id),
        }));
        const detailsMatch = currentTargets.length > 0 && currentTargets.every(
          target => target.current?.revision === target.expected_revision
        );
        const canApprove = writable && (!removes || detailsMatch);
        return (
          <View style={styles.review}>
            <Text style={styles.statusText}>
              {removes
                ? t('taskSteps.undoConflictRemove')
                : t('taskSteps.undoConflict')}
            </Text>
            {proposed.type === 'step.update' && (
              <Text style={styles.statusText}>
                {t('taskSteps.proposedText', { title: proposed.title })}
              </Text>
            )}
            {removes && (
              <View>
                {currentTargets.map(target => target.current && (
                  <Text key={target.step_id} style={styles.statusText}>
                    {target.current.title}
                  </Text>
                ))}
                {!detailsMatch && (
                  <Text style={[styles.statusText, styles.statusError]}>
                    {t('taskSteps.removalNeedsRefresh', { keep: t('taskActions.keepCurrent'), undo: t('taskSteps.undo') })}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.reviewActions}>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={
                  removes
                    ? t('taskSteps.remove')
                    : t('taskActions.applyCompensating')
                }
                disabled={!canApprove}
                accessibilityState={{ disabled: !canApprove }}
                onPress={() =>
                  canApprove &&
                  void store?.approveCompensation(taskRef, {
                    removalConfirmed: removes,
                  })
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  { minHeight: minTarget() },
                  !canApprove && styles.buttonDisabled,
                  pressed && canApprove && styles.stateOptionPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {removes
                    ? t('taskSteps.remove')
                    : t('taskActions.applyCompensating')}
                </Text>
              </Pressable>
              {action(t('taskActions.keepCurrent'), () =>
                store?.dismiss(taskRef)
              )}
            </View>
          </View>
        );
      }
      if (proposed.type === 'task.remove_created') {
        // Undo of an added task met a newer edit: nothing was removed. Removing it
        // now is a reviewed change; this button is the user's confirmation.
        return (
          <View style={styles.review}>
            <Text style={styles.statusText}>
              {t('taskCreate.undoConflict')}
            </Text>
            <View style={styles.reviewActions}>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={t('taskCreate.removeAnyway')}
                disabled={!writable}
                accessibilityState={{ disabled: !writable }}
                onPress={() =>
                  writable &&
                  void store?.approveCompensation(taskRef, {
                    removalConfirmed: true,
                  })
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  { minHeight: minTarget() },
                  !writable && styles.buttonDisabled,
                  pressed && writable && styles.stateOptionPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {t('taskCreate.removeAnyway')}
                </Text>
              </Pressable>
              {action(t('taskCreate.keep'), () => store?.dismiss(taskRef))}
            </View>
          </View>
        );
      }
      if (proposed.type === 'task.restore') {
        // #367: Undo of a removal met a newer edit of the removed task. Nothing changed;
        // restoring it keeps that edit and is a reviewed change.
        return (
          <View style={styles.review}>
            <Text style={styles.statusText}>{t('taskRemove.restoreConflict')}</Text>
            <View style={styles.reviewActions}>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={t('taskRemove.restoreTask')}
                disabled={!canRestore}
                accessibilityState={{ disabled: !canRestore }}
                onPress={() => canRestore && void store?.approveCompensation(taskRef)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { minHeight: minTarget() },
                  !canRestore && styles.buttonDisabled,
                  pressed && canRestore && styles.stateOptionPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>{t('taskRemove.restoreTask')}</Text>
              </Pressable>
              {action(t('taskRemove.keepRemoved'), () => store?.dismiss(taskRef))}
            </View>
          </View>
        );
      }
      if (proposed.type !== 'task.set_state') return null;
      return (
        <View style={styles.review}>
          <Text style={styles.reviewTitle}>
            {t('taskActions.undoConflictTitle')}
          </Text>
          <Text style={styles.statusText}>
            {t('taskActions.undoConflictBody', {
              current: phase.current ? stateLabel(phase.current.state) : '-',
              proposed: stateLabel(proposed.state),
            })}
          </Text>
          {proposed.waiting_reason ? (
            <Text style={styles.statusText}>
              {t('taskActions.waitingFor', { reason: proposed.waiting_reason })}
            </Text>
          ) : null}
          <View style={styles.reviewActions}>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskActions.applyCompensating')}
              disabled={!writable}
              accessibilityState={{ disabled: !writable }}
              onPress={() =>
                writable && void store?.approveCompensation(taskRef)
              }
              style={({ pressed }) => [
                styles.primaryButton,
                { minHeight: minTarget() },
                !writable && styles.buttonDisabled,
                pressed && writable && styles.stateOptionPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {t('taskActions.applyCompensating')}
              </Text>
            </Pressable>
            {action(t('taskActions.keepCurrent'), () =>
              store?.dismiss(taskRef)
            )}
          </View>
        </View>
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: SURFACE_MUTED,
  },
  noticeText: { ...typography.caption, color: INK_SECONDARY, flex: 1 },
  sectionLabel: { ...typography.caption, fontWeight: '600', color: INK },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stateOption: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
  },
  stateOptionSelected: { borderColor: ACCENT, backgroundColor: ACCENT_BG },
  stateOptionDisabled: { opacity: 0.55 },
  stateOptionPressed: { opacity: 0.7 },
  stateText: { ...typography.secondary, color: INK_SECONDARY, flexShrink: 1 },
  stateTextSelected: { color: INK, fontWeight: '600' },
  hint: { ...typography.caption, color: INK_MUTED },
  reasonBlock: { gap: 8 },
  reasonInput: {
    ...typography.secondary,
    color: INK,
    minHeight: 72,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: 10,
  },
  reasonFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  counter: { ...typography.caption, color: '#94A3B8' },
  statusBlock: { gap: 10 },
  statusRow: { gap: 8, alignItems: 'flex-start' },
  statusText: { ...typography.secondary, color: INK_SECONDARY },
  statusError: { color: ERROR },
  secondaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    ...typography.secondary,
    fontWeight: '600',
    color: INK,
  },
  primaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_STRONG,
  },
  primaryButtonText: {
    ...typography.secondary,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: { opacity: 0.5 },
  review: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FBD5A5',
    backgroundColor: ACCENT_BG,
  },
  reviewTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
