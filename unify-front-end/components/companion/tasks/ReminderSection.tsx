import React, { useRef } from 'react';
import { CompanionPushControl } from './CompanionPushControl';
import {
  View,
  Pressable,
  TextInput,
  StyleSheet,
  I18nManager,
  AccessibilityInfo,
  type Text as NativeText,
} from 'react-native';
import { LiveText as Text } from '@/components/common/LiveText';
import { useTranslation } from 'react-i18next';
import { type TaskProgressView } from '@/hooks/companion/useTaskActions';
import { useReminderEditor } from '@/hooks/companion/useReminderEditor';
import type { TaskActionStore } from '@/services/companionActions/taskActionStore';
import { reminderLabel } from '@/services/companionActions/reminders';
import { minTarget } from '@/utils/touchTarget';

const TIME_EXAMPLE = '2027-11-07T01:30-04:00';
const UNRESOLVED_PHASES = [
  'saving',
  'checking',
  'pending',
  'lookup_failed',
  'not_applied',
];
const ERROR_PHASES = ['conflict', 'refused', 'unavailable'];

export function ReminderSection({
  taskRef,
  view,
  store,
}: {
  taskRef: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
}) {
  const { t, i18n } = useTranslation();
  const e = useReminderEditor(taskRef, view, store);
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { minHeight: minTarget() },
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  const resultRef = useRef<NativeText>(null);
  const focusedResult = useRef<string | null>(null);
  const requestUndo = () => e.setConfirm('undo');
  const op = e.proposal?.operation;
  const receipt = e.phase.phase === 'saved' ? e.phase.receipt : null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole='header' style={styles.title}>
        {t('reminders.title')}
      </Text>
      <CompanionPushControl />
      <ReminderList view={view} taskRef={taskRef} />
      <Text>{t('reminders.instant')}</Text>
      <TextInput
        accessibilityLabel={t('reminders.instant')}
        value={e.draft.instant}
        onChangeText={v => e.change('instant', v)}
        placeholder={TIME_EXAMPLE}
        autoCapitalize='none'
        autoCorrect={false}
        style={[styles.input, { minHeight: minTarget() }]}
      />
      <Text>{t('reminders.zone')}</Text>
      <TextInput
        accessibilityLabel={t('reminders.zone')}
        value={e.draft.zone}
        onChangeText={v => e.change('zone', v)}
        autoCapitalize='none'
        autoCorrect={false}
        style={[styles.input, { minHeight: minTarget() }]}
      />
      <Text style={styles.secondary}>{t('reminders.timeHelp')}</Text>
      {e.error ? (
        <Text accessibilityRole='alert'>
          {t(
            e.error === 'time'
              ? 'reminders.invalidTime'
              : 'reminders.readFailed'
          )}
        </Text>
      ) : null}
      {button(t('reminders.review'), () => void e.prepare(), !e.canSchedule)}
      {e.active
        ? button(t('reminders.cancel'), () => void e.cancel(), !e.canWrite)
        : null}
      {op ? (
        <View accessibilityLiveRegion='polite' style={styles.review}>
          <Text>
            {op.type === 'reminder.schedule'
              ? reminderLabel(
                  { remindAt: op.remind_at, timeZone: op.time_zone },
                  i18n.language
                )
              : t('reminders.cancelConfirm')}
          </Text>
          {button(
            t(
              e.confirm === 'cancel'
                ? 'reminders.confirmCancel'
                : op.type === 'reminder.cancel'
                  ? 'reminders.cancel'
                  : 'reminders.save'
            ),
            e.save,
            !e.canWrite
          )}
          {button(t('reminders.keepEditing'), e.clearReview)}
        </View>
      ) : null}
      {receipt ? (
        <View accessibilityLiveRegion='polite'>
          <Text
            key={receipt.operationId}
            ref={resultRef}
            accessible
            onLayout={() => {
              if (
                e.isOwned() &&
                resultRef.current &&
                focusedResult.current !== receipt.operationId
              ) {
                focusedResult.current = receipt.operationId;
                AccessibilityInfo.sendAccessibilityEvent(
                  resultRef.current,
                  'focus'
                );
              }
            }}
          >
            {t(
              receipt.reminder?.stopped
                ? 'reminders.stopped'
                : 'reminders.saved'
            )}
          </Text>
          {receipt.reminder?.remindAt && receipt.reminder.timeZone ? (
            <Text>
              {reminderLabel(
                {
                  remindAt: receipt.reminder.remindAt,
                  timeZone: receipt.reminder.timeZone,
                },
                i18n.language
              )}
            </Text>
          ) : null}
          {receipt.reminder &&
          (!receipt.current ||
            view.reminders?.items.some(
              r =>
                r.reminderId === receipt.reminder!.reminderId &&
                r.status !== 'pending'
            )) ? (
            <Text>{t('reminders.history')}</Text>
          ) : null}
          <Text>{t('reminders.undoHelp')}</Text>
          {receipt.undoable
            ? button(t('taskActions.undo'), requestUndo, !e.canWrite)
            : null}
        </View>
      ) : null}
      {e.confirm === 'undo' ? (
        <View>
          <Text>{t('reminders.undoConfirm')}</Text>
          {button(t('reminders.confirmUndo'), e.undo, !e.canWrite)}
          {button(t('reminders.keep'), () => e.setConfirm(null))}
        </View>
      ) : null}
      {UNRESOLVED_PHASES.includes(e.phase.phase) ? (
        <View accessibilityLiveRegion='polite'>
          <Text>
            {t(
              `taskActions.${e.phase.phase === 'saving' ? 'saving' : e.phase.phase === 'checking' ? 'checking' : e.phase.phase === 'lookup_failed' ? 'lookupFailed' : e.phase.phase === 'not_applied' ? 'notApplied' : 'pending'}`
            )}
          </Text>
          {e.phase.phase === 'pending' || e.phase.phase === 'lookup_failed'
            ? button(t('taskActions.checkAgain'), e.lookup, !view.canWrite)
            : null}
          {e.phase.phase === 'not_applied'
            ? button(t('taskActions.retry'), e.retry, !view.canWrite)
            : null}
        </View>
      ) : null}
      {ERROR_PHASES.includes(e.phase.phase) ? (
        <Text accessibilityRole='alert'>{t('reminders.reviewAgain')}</Text>
      ) : null}
    </View>
  );
}
export function ReminderList({
  view,
  taskRef,
  onOpen,
}: {
  view: TaskProgressView;
  taskRef?: string;
  onOpen?: (ref: string, title: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const items =
    view.reminders?.items.filter(r => !taskRef || r.taskRef === taskRef) ?? [];
  if (!view.reminders) return null;
  return (
    <View style={styles.list}>
      {view.stale ? (
        <Text accessibilityLiveRegion='polite'>
          {t('reminders.readFailed')}
        </Text>
      ) : null}
      {view.reminders.scheduler !== 'ready' &&
      items.some(r => r.status === 'pending') ? (
        <Text>{t('reminders.schedulerUnavailable')}</Text>
      ) : null}
      {items.map(r => (
        <View key={r.reminderId} style={styles.item}>
          <Text>{r.title ?? t('taskActions.existingTask')}</Text>
          <Text>{reminderLabel(r, i18n.language)}</Text>
          <Text>
            {t(
              r.status !== 'pending'
                ? 'reminders.stopped'
                : r.due && !view.stale
                  ? 'reminders.due'
                  : 'reminders.scheduled'
            )}
          </Text>
          {r.cancelledReason === 'schema_rollback' ||
          r.cancelledReason === 'service_interruption' ? (
            <Text>{t('reminders.interruption')}</Text>
          ) : null}
          {onOpen && !view.stale && r.status === 'pending' ? (
            <Pressable
              accessibilityRole='button'
              onPress={() => {
                if (!view.stale)
                  onOpen(r.taskRef, r.title ?? t('taskActions.existingTask'));
              }}
              style={[styles.button, { minHeight: minTarget() }]}
            >
              <Text style={styles.buttonText}>{t('reminders.openTask')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  section: {
    gap: 12,
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 20,
  },
  title: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  secondary: { color: '#475569' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#0F172A',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  button: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF4E8',
  },
  buttonText: { color: '#9A4A00', fontWeight: '600' },
  disabled: { opacity: 0.45 },
  review: {
    gap: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  list: { gap: 12 },
  item: { gap: 6, paddingVertical: 8 },
});
