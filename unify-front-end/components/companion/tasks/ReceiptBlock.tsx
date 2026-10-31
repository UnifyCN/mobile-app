import { reminderLabel } from '@/services/companionActions/reminders';
import { LiveText as Text } from '@/components/common/LiveText';
import React, { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  type Text as NativeText,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import type {
  TaskReceipt,
  TaskState,
} from '@/services/companionActions/contract';
import type { TaskActionStore } from '@/services/companionActions/taskActionStore';
import { minTarget } from '@/utils/touchTarget';
import { editReceiptText, receiptChanges, receiptChangeText } from './editText';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';

interface ReceiptBlockProps {
  receipt: TaskReceipt;
  /** Where this receipt's Undo is tracked in the store (a task ref or `proposal:<id>`). */
  storeKey: string;
  store: TaskActionStore | null;
  /** A connection, a fresh read and no unresolved write. */
  canWrite: boolean;
  /** The task's title, for a receipt that does not record one (#365, #367). */
  taskTitle?: string | null;
  /** Focus a newly saved removal result after native layout, rather than a displaced control. */
  focusResult?: boolean;
}

/**
 * The exact saved result of one action and the Undo of that receipt only
 * (mobile-app#361, #363, #365, #367). An added task's Undo removes it, so it asks first; Keep
 * sends nothing. An edit names each changed field with its recorded before and after.
 */
export function ReceiptBlock({
  receipt,
  storeKey,
  store,
  canWrite,
  taskTitle = null,
  focusResult = false,
}: ReceiptBlockProps) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const resultRef = useRef<NativeText>(null);
  const focusedOperation = useRef<string | null>(null);
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const title = receipt.title ?? taskTitle ?? '';
  // #367: a removal and its restore name the task (a custom title, else the Checklist one).
  const removal = receipt.operationType === 'task.remove';
  const restore = receipt.operationType === 'task.restore';
  const steps = receipt.steps ?? [];
  const first = steps[0];
  const isStep = receipt.operationType.startsWith('step.');
  // #366: a step receipt names the steps as they were saved, never their current text.
  const stepText = (): string => {
    const stepTitle = first?.title ?? '';
    switch (receipt.operationType) {
      case 'step.create':
        return steps.length === 1
          ? t('taskSteps.receiptAdded', { title: stepTitle })
          : t('taskSteps.receiptAddedMany', { count: steps.length });
      case 'step.update':
        return t('taskSteps.receiptRenamed', {
          from: first?.beforeTitle ?? '',
          to: stepTitle,
        });
      case 'step.set_done':
        return first?.done
          ? t('taskSteps.receiptChecked', { title: stepTitle })
          : t('taskSteps.receiptUnchecked', { title: stepTitle });
      case 'step.restore':
        return t('taskSteps.receiptRestored', { title: stepTitle });
      default:
        return steps.length === 1
          ? t('taskSteps.receiptRemoved', { title: stepTitle })
          : t('taskSteps.receiptRemovedMany', { count: steps.length });
    }
  };
  // A reason-only save keeps the state: name what changed instead of
  // "Waiting to Waiting".
  const text = receipt.reminder
    ? t(receipt.reminder.stopped ? 'reminders.stopped' : 'reminders.saved') +
      (receipt.reminder.remindAt && receipt.reminder.timeZone
        ? ' ' +
          reminderLabel(
            {
              remindAt: receipt.reminder.remindAt,
              timeZone: receipt.reminder.timeZone,
            },
            i18n.language
          )
        : '')
    : isStep
      ? stepText()
      : removal
        ? title
          ? t('taskRemove.receiptRemoved', { title })
          : t('taskRemove.receiptRemovedUnknown')
        : restore
          ? title
            ? t('taskRemove.receiptRestored', { title })
            : t('taskRemove.receiptRestoredUnknown')
          : receipt.operationType === 'task.edit_details'
            ? editReceiptText(
                t as never,
                receipt,
                receipt.title ?? taskTitle ?? ''
              )
            : receipt.operationType === 'task.create_custom'
              ? t('taskCreate.added', { title })
              : receipt.operationType === 'task.remove_created'
                ? t('taskCreate.removed', { title })
                : receipt.kind === 'undo'
                  ? t('taskActions.receiptUndo', {
                      state: stateLabel(receipt.afterState),
                    })
                  : receipt.beforeState === 'waiting' &&
                      receipt.afterState === 'waiting'
                    ? t('taskActions.receiptReason')
                    : t('taskActions.receiptChange', {
                        from: stateLabel(receipt.beforeState),
                        to: stateLabel(receipt.afterState),
                      });
  const time = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(receipt.createdAt));
  // Undo of an added task or added steps removes them: it asks first.
  const removes =
    receipt.operationType === 'reminder.schedule' ||
    receipt.operationType === 'task.create_custom' ||
    receipt.operationType === 'step.create';
  const confirmTitle = receipt.reminder
    ? t('reminders.undoConfirm')
    : isStep
      ? steps.length === 1
        ? t('taskSteps.confirmRemove', { title: first?.title ?? '' })
        : t('taskSteps.confirmRemoveMany', { count: steps.length })
      : t('taskCreate.confirmRemove', { title });

  function undo() {
    if (!canWrite || !store) return;
    if (removes) {
      setConfirming(true);
      return;
    }
    void store.undo(storeKey, receipt.operationId);
  }

  return (
    <View style={styles.receipt}>
      <Text
        key={receipt.operationId}
        ref={resultRef}
        accessible
        style={styles.receiptText}
        onLayout={() => {
          if (
            !focusResult ||
            focusedOperation.current === receipt.operationId ||
            !resultRef.current
          )
            return;
          focusedOperation.current = receipt.operationId;
          AccessibilityInfo.sendAccessibilityEvent(resultRef.current, 'focus');
        }}
      >
        {text}
      </Text>
      {receiptChanges(receipt).map(change => (
        <Text key={change.field} style={styles.receiptText}>
          {receiptChangeText(t as never, change)}
        </Text>
      ))}
      {removal && (
        <Text style={styles.receiptMeta}>
          {t('taskRemove.receiptEffects', {
            plans: receipt.plans?.length ?? 0,
            steps: receipt.stepsKept ?? 0,
            reminders: receipt.remindersStopped ?? 0,
          })}
        </Text>
      )}
      {receipt.stepsTotal !== null && receipt.stepsTotal > 0 && (
        <Text style={styles.receiptMeta}>
          {t('taskSteps.receiptAtCompletion', {
            done: receipt.stepsDone ?? 0,
            total: receipt.stepsTotal,
          })}
        </Text>
      )}
      <Text style={styles.receiptMeta}>
        {time}
        {!receipt.current ? ` · ${t('taskActions.receiptHistorical')}` : ''}
      </Text>
      {receipt.undoable && !confirming && (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={
            removal
              ? t('taskRemove.undoRemovalA11y', { change: text })
              : isStep
                ? t('taskSteps.undoA11y', { change: text })
                : removes
                  ? t('taskCreate.undoA11y', { title })
                  : t('taskActions.undo')
          }
          disabled={!canWrite}
          accessibilityState={{ disabled: !canWrite }}
          onPress={undo}
          style={({ pressed }) => [
            styles.undoButton,
            { minHeight: minTarget() },
            !canWrite && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name='undo' size={18} color={ACCENT_STRONG} />
          <Text style={styles.undoText}>
            {removal
              ? t('taskRemove.undoRemoval')
              : isStep
                ? t('taskSteps.undo')
                : removes
                  ? t('taskCreate.undo')
                  : t('taskActions.undo')}
          </Text>
        </Pressable>
      )}
      {confirming && (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>{confirmTitle}</Text>
          <Text style={styles.confirmBody}>
            {receipt.reminder
              ? t('reminders.undoConfirm')
              : isStep
                ? t('taskSteps.confirmRemoveBody')
                : t('taskCreate.confirmRemoveBody')}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={
                isStep ? t('taskSteps.remove') : t('taskCreate.remove')
              }
              disabled={!canWrite}
              accessibilityState={{ disabled: !canWrite }}
              onPress={() => {
                if (!canWrite || !store) return;
                setConfirming(false);
                void store.undo(storeKey, receipt.operationId, {
                  removalConfirmed: true,
                });
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                { minHeight: minTarget() },
                !canWrite && styles.disabled,
                pressed && canWrite && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isStep ? t('taskSteps.remove') : t('taskCreate.remove')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={
                isStep ? t('taskSteps.keep') : t('taskCreate.keep')
              }
              onPress={() => setConfirming(false)}
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: minTarget() },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {isStep ? t('taskSteps.keep') : t('taskCreate.keep')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 4,
  },
  undoText: {
    ...typography.secondary,
    fontWeight: '600',
    color: ACCENT_STRONG,
  },
  confirm: {
    gap: 6,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FBD5A5',
    backgroundColor: ACCENT_BG,
  },
  confirmTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  confirmBody: { ...typography.secondary, color: INK_SECONDARY },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
