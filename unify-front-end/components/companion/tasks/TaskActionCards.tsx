import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import type {
  TaskProposal,
  TaskReceipt,
} from '@/services/companionActions/contract';
import {
  isUnresolved,
  type TaskActionPhase,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import { useTaskActionPhase } from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';

interface CardsProps {
  /** The saved message id the cards belong to; null for an unsaved message. */
  messageId: number | null;
  isUser: boolean;
  proposals: TaskProposal[];
  commands: { messageId: number; receipt: TaskReceipt }[];
  store: TaskActionStore | null;
  /** A connection and a fresh read: a retry is a write. */
  canWrite: boolean;
  onReview: (proposalId: string) => void;
  onViewTask: (taskRef: string, title: string) => void;
}

/**
 * Compact cards under a conversation message (direction B, mobile-app#363): a task
 * draft the answer suggested, or the result of a clear command in the user's own
 * message. A draft card says it is not saved; it opens the bottom sheet for review.
 * A result card shows the saved task by its receipt, not by any assistant text.
 */
export function TaskActionCards({
  messageId,
  isUser,
  proposals,
  commands,
  store,
  canWrite,
  onReview,
  onViewTask,
}: CardsProps) {
  if (messageId === null) return null;
  const mine = proposals.filter(p => p.source?.messageId === messageId);
  const command = commands.find(c => c.messageId === messageId) ?? null;
  return (
    <>
      {mine.map(p => (
        <DraftCard
          key={p.proposalId}
          proposal={p}
          store={store}
          onReview={() => onReview(p.proposalId)}
        />
      ))}
      {isUser && (
        <CommandCard
          messageId={messageId}
          saved={command?.receipt ?? null}
          store={store}
          canWrite={canWrite}
          onViewTask={onViewTask}
        />
      )}
    </>
  );
}

function CardIcon() {
  return (
    <View style={styles.icon}>
      <MaterialIcons name='checklist' size={18} color={ACCENT_STRONG} />
    </View>
  );
}

function CardButton({
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
        styles.button,
        { minHeight: minTarget() },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function DraftCard({
  proposal,
  store,
  onReview,
}: {
  proposal: TaskProposal;
  store: TaskActionStore | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, `proposal:${proposal.proposalId}`);
  const title = proposal.operation.title;
  const saved = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const draft = proposal.status === 'draft' && !saved;
  const status = saved
    ? t('taskCreate.added', { title: saved.title ?? title })
    : proposal.status === 'cancelled'
      ? t('taskCreate.closed')
      : isUnresolved(phase)
        ? t('taskActions.checking')
        : t('taskCreate.draftBadge');
  return (
    <View
      testID='task-draft-card'
      style={[styles.card, draft && styles.cardDraft]}
    >
      <CardIcon />
      <View style={styles.text}>
        <Text style={styles.eyebrow}>{t('taskCreate.cardEyebrow')}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.status} accessibilityLiveRegion='polite'>
          {status}
        </Text>
      </View>
      <CardButton
        label={draft ? t('taskCreate.review') : t('taskCreate.view')}
        name={
          draft ? t('taskCreate.reviewA11y', { title }) : t('taskCreate.view')
        }
        onPress={onReview}
      />
    </View>
  );
}

function commandText(
  t: (k: string, o?: Record<string, unknown>) => string,
  phase: TaskActionPhase
): string | null {
  switch (phase.phase) {
    case 'saving':
    case 'checking':
      return t('taskCreate.commandAdding', {
        title:
          phase.write.operation?.type === 'task.create_custom'
            ? phase.write.operation.title
            : '',
      });
    case 'pending':
      return t('taskActions.pending');
    case 'lookup_failed':
      return t('taskActions.lookupFailed');
    case 'not_applied':
      return t('taskActions.notApplied');
    case 'command_used':
      return t('taskCreate.commandUsed');
    case 'needs_clarification':
      return t('taskCreate.needsClarification');
    case 'refused':
      return t('taskActions.refused');
    case 'unavailable':
      return t('taskActions.unavailable');
    case 'signed_out':
      return t('taskActions.signedOut');
    default:
      return null;
  }
}

function CommandCard({
  messageId,
  saved,
  store,
  canWrite,
  onViewTask,
}: {
  messageId: number;
  saved: TaskReceipt | null;
  store: TaskActionStore | null;
  canWrite: boolean;
  onViewTask: (taskRef: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const key = `command:${messageId}`;
  const phase = useTaskActionPhase(store, key);
  const receipt = phase.phase === 'saved' ? phase.receipt : saved;
  if (receipt) {
    const title = receipt.title ?? '';
    return (
      <View testID='task-command-card' style={styles.card}>
        <CardIcon />
        <Text
          style={[styles.text, styles.result]}
          accessibilityLiveRegion='polite'
        >
          {receipt.operationType === 'task.remove_created'
            ? t('taskCreate.removed', { title })
            : t('taskCreate.added', { title })}
        </Text>
        <CardButton
          label={t('taskCreate.view')}
          name={t('taskCreate.view')}
          onPress={() => onViewTask(receipt.taskRef, title)}
        />
      </View>
    );
  }
  const text = commandText(t as never, phase);
  if (!text) return null;
  return (
    <View testID='task-command-card' style={styles.card}>
      <CardIcon />
      <Text
        style={[styles.text, styles.status]}
        accessibilityLiveRegion='polite'
      >
        {text}
      </Text>
      {(phase.phase === 'pending' || phase.phase === 'lookup_failed') && (
        <CardButton
          label={t('taskActions.checkAgain')}
          name={t('taskActions.checkAgain')}
          onPress={() => void store?.checkAgain(key)}
        />
      )}
      {phase.phase === 'not_applied' && (
        <CardButton
          label={t('taskActions.retry')}
          name={t('taskActions.retry')}
          disabled={!canWrite}
          onPress={() => canWrite && void store?.retry(key)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
  // A draft is not saved work: a dashed edge sets it apart from saved results.
  cardDraft: { borderStyle: 'dashed', borderColor: '#CBD5E1' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_BG,
  },
  text: { flex: 1 },
  eyebrow: { ...typography.caption, color: INK_MUTED },
  title: { ...typography.secondary, fontWeight: '600', color: INK },
  status: { ...typography.caption, color: INK_SECONDARY },
  result: { ...typography.secondary, color: INK },
  button: {
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  buttonText: { ...typography.secondary, fontWeight: '600', color: INK },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
