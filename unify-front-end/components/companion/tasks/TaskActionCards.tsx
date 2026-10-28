import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import type {
  StepProposal,
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
import { changeLines, editReceiptText, receiptChangeText } from './editText';

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
  onReview: (proposalId: string, kind: TaskProposal['kind']) => void;
  onViewTask: (taskRef: string, title: string) => void;
  /** #366: suggested-step drafts of the conversation, and how to open one. */
  stepProposals?: StepProposal[];
  onReviewSteps?: (proposalId: string) => void;
  /** The current title of a Checklist task, or null when this account has no such task. */
  taskTitleOf?: (taskRef: string) => string | null;
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
  stepProposals = [],
  onReviewSteps,
  taskTitleOf,
}: CardsProps) {
  if (messageId === null) return null;
  const mine = proposals.filter(p => p.source?.messageId === messageId);
  const mySteps = stepProposals.filter(p => p.source?.messageId === messageId);
  const command = commands.find(c => c.messageId === messageId) ?? null;
  return (
    <>
      {mine.map(p =>
        p.kind === 'task_edit' ? (
          <EditDraftCard
            key={p.proposalId}
            proposal={p}
            store={store}
            title={p.task?.title ?? taskTitleOf?.(p.operation.task_ref) ?? null}
            onReview={() => onReview(p.proposalId, p.kind)}
          />
        ) : (
          <DraftCard
            key={p.proposalId}
            proposal={p}
            store={store}
            onReview={() => onReview(p.proposalId, p.kind)}
          />
        )
      )}
      {mySteps.map(p => (
        <StepDraftCard
          key={p.proposalId}
          proposal={p}
          store={store}
          taskTitle={taskTitleOf?.(p.operation.task_ref) ?? null}
          onReview={() => onReviewSteps?.(p.proposalId)}
        />
      ))}
      {isUser && (
        <CommandCard
          messageId={messageId}
          saved={command?.receipt ?? null}
          store={store}
          canWrite={canWrite}
          onViewTask={onViewTask}
          taskTitleOf={taskTitleOf ?? (() => null)}
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
  proposal: Extract<TaskProposal, { kind: 'task_create' }>;
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

/** #366: suggested steps for one task. Says it is not saved; opens the sheet for review. */
function StepDraftCard({
  proposal,
  store,
  taskTitle,
  onReview,
}: {
  proposal: StepProposal;
  store: TaskActionStore | null;
  taskTitle: string | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, `proposal:${proposal.proposalId}`);
  const saved = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const draft = proposal.status === 'draft' && !saved;
  const heading = taskTitle
    ? t('taskSteps.cardTitle', { task: taskTitle })
    : t('taskSteps.cardTitleUnknownTask');
  const status = saved
    ? t('taskSteps.added', { count: saved.steps?.length ?? 0 })
    : proposal.status === 'cancelled'
      ? t('taskSteps.closed')
      : isUnresolved(phase)
        ? t('taskActions.checking')
        : t('taskSteps.draftBadge');
  const task = taskTitle ?? t('taskSteps.cardTitleUnknownTask');
  return (
    <View testID='step-draft-card' style={[styles.card, draft && styles.cardDraft]}>
      <CardIcon />
      <View style={styles.text}>
        <Text style={styles.eyebrow}>{t('taskSteps.cardEyebrow')}</Text>
        <Text style={styles.title}>{heading}</Text>
        {draft && (
          <Text style={styles.status}>
            {t('taskSteps.cardCount', { count: proposal.operation.titles.length })}
          </Text>
        )}
        <Text style={styles.status} accessibilityLiveRegion='polite'>
          {status}
        </Text>
      </View>
      <CardButton
        label={draft ? t('taskSteps.review') : t('taskSteps.view')}
        name={draft ? t('taskSteps.reviewA11y', { task }) : t('taskSteps.view')}
        onPress={onReview}
      />
    </View>
  );
}

/** A suggested change to an existing task (#365): what it changes, not yet saved. */
function EditDraftCard({
  proposal,
  store,
  title,
  onReview,
}: {
  proposal: Extract<TaskProposal, { kind: 'task_edit' }>;
  store: TaskActionStore | null;
  title: string | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, `proposal:${proposal.proposalId}`);
  const saved = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const draft = proposal.status === 'draft' && !saved;
  const name = title ?? t('taskEdit.unknownTask');
  const summary = changeLines(t as never, proposal.operation, proposal.task)
    .map(line => `${line.label}: ${line.to}`)
    .join(' · ');
  const status = saved
    ? t('taskEdit.saved')
    : proposal.status === 'cancelled'
      ? t('taskEdit.closed')
      : isUnresolved(phase)
        ? t('taskActions.checking')
        : t('taskEdit.draftBadge');
  return (
    <View
      testID='task-edit-draft-card'
      style={[styles.card, draft && styles.cardDraft]}
    >
      <CardIcon />
      <View style={styles.text}>
        <Text style={styles.eyebrow}>{t('taskEdit.cardEyebrow')}</Text>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.status}>{summary}</Text>
        <Text style={styles.status} accessibilityLiveRegion='polite'>
          {status}
        </Text>
      </View>
      <CardButton
        label={draft ? t('taskEdit.review') : t('taskEdit.view')}
        name={
          draft
            ? t('taskEdit.reviewA11y', { title: name })
            : t('taskEdit.view')
        }
        onPress={onReview}
      />
    </View>
  );
}

function commandText(
  t: (k: string, o?: Record<string, unknown>) => string,
  phase: TaskActionPhase,
  titleFor: (taskRef: string) => string | null
): string | null {
  switch (phase.phase) {
    case 'saving':
    case 'checking': {
      const op = phase.write.operation;
      if (op && op.type !== 'task.create_custom') {
        return t('taskEdit.commandSaving', {
          title:
            ('task_ref' in op ? titleFor(op.task_ref) : null) ??
            t('taskEdit.unknownTask'),
        });
      }
      return t('taskCreate.commandAdding', {
        title: op?.type === 'task.create_custom' ? op.title : '',
      });
    }
    case 'conflict':
      return t('taskEdit.commandConflict');
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
  taskTitleOf,
}: {
  messageId: number;
  saved: TaskReceipt | null;
  store: TaskActionStore | null;
  canWrite: boolean;
  onViewTask: (taskRef: string, title: string) => void;
  taskTitleOf: (taskRef: string) => string | null;
}) {
  const { t } = useTranslation();
  const key = `command:${messageId}`;
  const phase = useTaskActionPhase(store, key);
  const receipt = phase.phase === 'saved'
    ? saved?.operationId === phase.receipt.operationId
      ? {
          ...phase.receipt,
          current: saved.current,
          undoable: saved.undoable,
          undoneBy: saved.undoneBy,
        }
      : phase.receipt
    : saved;
  if (
    receipt &&
    (receipt.operationType === 'task.edit_details' ||
      receipt.operationType === 'task.set_state')
  ) {
    // #365: a clear edit command's saved change, named field by field.
    const title =
      receipt.title ?? taskTitleOf(receipt.taskRef) ?? t('taskEdit.unknownTask');
    return (
      <View testID='task-command-card' style={styles.card}>
        <CardIcon />
        <View style={styles.text} accessibilityLiveRegion='polite'>
          <Text style={styles.result}>
            {editReceiptText(t as never, receipt, title)}
          </Text>
          {receipt.changes.map(change => (
            <Text key={change.field} style={styles.status}>
              {receiptChangeText(t as never, change)}
            </Text>
          ))}
          {!receipt.current && (
            <Text style={styles.status}>
              {t('taskActions.receiptHistorical')}
            </Text>
          )}
        </View>
        <CardButton
          label={t('taskCreate.view')}
          name={t('taskEdit.viewA11y', { title })}
          onPress={() => onViewTask(receipt.taskRef, title)}
        />
      </View>
    );
  }
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
  const text = commandText(t as never, phase, taskTitleOf);
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
