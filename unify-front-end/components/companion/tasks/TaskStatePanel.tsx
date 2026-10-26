import React, { useEffect, useRef } from 'react';
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
  setStateOperation,
  type TaskReceipt,
  type TaskState,
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

const STATE_ICON: Record<TaskState, React.ComponentProps<typeof MaterialIcons>['name']> = {
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
}

/**
 * Explicit controls for one existing Checklist task (mobile-app#361): the four
 * states, an editable waiting reason, the exact saved receipt with Undo for that
 * receipt only, and every unresolved outcome. Used by the Checklist task sheet and
 * the Companion task sheet; both read the same saved record.
 */
export function TaskStatePanel({ taskRef, view, store }: TaskStatePanelProps) {
  const { t, i18n } = useTranslation();
  const phase = useTaskActionPhase(store, taskRef);
  const progress = progressFor(taskRef, view);
  const draft = useTaskActionDraft(store, taskRef);
  const reasonValue = draft ?? progress.waitingReason ?? '';
  const busy = isUnresolved(phase);
  const canWrite = Boolean(store) && view.canWrite && !progress.removed && !busy;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const reasonChanged = reasonValue.trim() !== (progress.waitingReason ?? '');

  // Screen readers hear the saved result once; the status text also stays on screen.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (phase.phase === 'saved' && announced.current !== phase.receipt.operationId) {
      announced.current = phase.receipt.operationId;
      AccessibilityInfo.announceForAccessibility(
        t('taskActions.savedAnnouncement', { state: stateLabel(phase.receipt.afterState) })
      );
    }
  });

  function choose(next: TaskState) {
    if (!canWrite || !store || next === progress.state) return;
    void store.setState(
      setStateOperation(progress, next, next === 'waiting' ? reasonValue : undefined)
    );
  }

  function saveReason() {
    if (!canWrite || !store || progress.state !== 'waiting' || !reasonChanged) return;
    void store
      .setState(setStateOperation(progress, 'waiting', reasonValue))
      .then(() => {
        if (store.get(taskRef).phase === 'saved') store.setDraft(taskRef, undefined);
      });
  }

  const receipt: TaskReceipt | null =
    phase.phase === 'saved' ? phase.receipt : progress.lastReceipt;
  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

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
              accessibilityState={{ selected, checked: selected, disabled: !canWrite }}
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
              <Text style={[styles.stateText, selected && styles.stateTextSelected]}>
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
                (!canWrite || !reasonChanged) && styles.buttonDisabled,
                pressed && styles.stateOptionPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{t('taskActions.saveReason')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View
        accessibilityLiveRegion='polite'
        style={styles.statusBlock}
      >
        <PhaseMessage phase={phase} stateLabel={stateLabel} store={store} taskRef={taskRef} />
        {receipt && phase.phase !== 'undo_review' && (
          <View style={styles.receipt}>
            <Text style={styles.receiptText}>
              {receipt.kind === 'undo'
                ? t('taskActions.receiptUndo', { state: stateLabel(receipt.afterState) })
                : t('taskActions.receiptChange', {
                    from: stateLabel(receipt.beforeState),
                    to: stateLabel(receipt.afterState),
                  })}
            </Text>
            <Text style={styles.receiptMeta}>
              {formatTime(receipt.createdAt)}
              {!receipt.current ? ` · ${t('taskActions.receiptHistorical')}` : ''}
            </Text>
            {receipt.undoable && (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={t('taskActions.undo')}
                disabled={!canWrite}
                accessibilityState={{ disabled: !canWrite }}
                onPress={() => canWrite && store && void store.undo(taskRef, receipt.operationId)}
                style={({ pressed }) => [
                  styles.undoButton,
                  !canWrite && styles.buttonDisabled,
                  pressed && styles.stateOptionPressed,
                ]}
              >
                <MaterialIcons name='undo' size={18} color={ACCENT_STRONG} />
                <Text style={styles.undoText}>{t('taskActions.undo')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function PhaseMessage({
  phase,
  stateLabel,
  store,
  taskRef,
}: {
  phase: TaskActionPhase;
  stateLabel: (s: TaskState) => string;
  store: TaskActionStore | null;
  taskRef: string;
}) {
  const { t } = useTranslation();
  const line = (text: string, tone: 'neutral' | 'error' = 'neutral') => (
    <Text style={[styles.statusText, tone === 'error' && styles.statusError]}>{text}</Text>
  );
  const action = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.stateOptionPressed]}
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
      return line(
        phase.reason === 'task_removed' ? t('taskActions.removed') : t('taskActions.refused'),
        'error'
      );
    case 'conflict':
      return line(t('taskActions.conflict'), 'error');
    case 'already_undone':
      return line(t('taskActions.alreadyUndone'));
    case 'signed_out':
      return line(t('taskActions.signedOut'), 'error');
    case 'unavailable':
      return line(t('taskActions.unavailable'), 'error');
    case 'pending':
    case 'lookup_failed':
      return (
        <View style={styles.statusRow}>
          {line(
            t(phase.phase === 'pending' ? 'taskActions.pending' : 'taskActions.lookupFailed'),
            'error'
          )}
          {action(t('taskActions.checkAgain'), () => void store?.checkAgain(taskRef))}
        </View>
      );
    case 'not_applied':
      return (
        <View style={styles.statusRow}>
          {line(t('taskActions.notApplied'), 'error')}
          {action(t('taskActions.retry'), () => void store?.retry(taskRef))}
        </View>
      );
    case 'undo_review': {
      const proposed = phase.proposal.operations[0];
      return (
        <View style={styles.review}>
          <Text style={styles.reviewTitle}>{t('taskActions.undoConflictTitle')}</Text>
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
              onPress={() => void store?.approveCompensation(taskRef)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.stateOptionPressed]}
            >
              <Text style={styles.primaryButtonText}>{t('taskActions.applyCompensating')}</Text>
            </Pressable>
            {action(t('taskActions.keepCurrent'), () => store?.dismiss(taskRef))}
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
  receipt: {
    gap: 2,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_MUTED,
  },
  receiptText: { ...typography.secondary, color: INK },
  receiptMeta: { ...typography.caption, color: INK_MUTED },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 44,
    marginTop: 4,
  },
  undoText: { ...typography.secondary, fontWeight: '600', color: ACCENT_STRONG },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: { ...typography.secondary, fontWeight: '600', color: INK },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_STRONG,
  },
  primaryButtonText: { ...typography.secondary, fontWeight: '600', color: '#fff' },
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
