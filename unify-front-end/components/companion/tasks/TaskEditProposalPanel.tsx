import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import type { TaskEditProposal } from '@/services/companionActions/contract';
import {
  stillOwned,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import {
  isUnresolved,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  taskProposalKey,
  useTaskActionClient,
  useTaskActionPhase,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';
import { ReceiptBlock } from './ReceiptBlock';
import { PhaseMessage } from './TaskStatePanel';
import { changeLines } from './editText';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';
const ERROR = '#B42318';

interface Props {
  proposal: TaskEditProposal;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** The task's title from the account's Checklist, when the draft does not carry one. */
  fallbackTitle: string | null;
}

/**
 * Review of one server-owned edit draft (mobile-app#365), direction B bottom sheet. It
 * shows the exact value each field has now and the value approval saves, and one control
 * that names the change. Approval binds to the shown revision: when a field it changes
 * moved on elsewhere, the server returns a revised draft, shown here with the value it
 * was suggested against, and nothing is saved until that revision is approved. Every
 * write needs a fresh successful read; after a failed read nothing is sent or queued.
 */
export function TaskEditProposalPanel({
  proposal: read,
  view,
  store,
  fallbackTitle,
}: Props) {
  const { t } = useTranslation();
  const key = `proposal:${read.proposalId}`;
  const queryClient = useQueryClient();
  const bound = useTaskActionClient();
  const phase = useTaskActionPhase(store, key);
  // A Not now request in flight, or its refusal, for the session it was made in.
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

  // A revised draft from a needs-review reply is newer than the last read.
  const proposal =
    phase.phase === 'needs_review' &&
    'kind' in phase.proposal &&
    phase.proposal.kind === 'task_edit' &&
    phase.proposal.proposalRevision >= read.proposalRevision
      ? phase.proposal
      : read;
  const title =
    proposal.task?.title ?? fallbackTitle ?? t('taskEdit.unknownTask');
  const revised = proposal.reviewReason === 'context_changed';
  // Only an open draft shows values to review; a saved one shows its receipt.
  const lines =
    proposal.status === 'draft'
      ? changeLines(
          t as never,
          proposal.operation,
          proposal.task,
          revised ? proposal.previousTask : null
        )
      : [];
  const nothingToSave = lines.length > 0 && lines.every(l => l.same);
  const busy = isUnresolved(phase) || ownRequest === 'busy';
  const writable =
    Boolean(store && bound) && view.canWrite && proposal.status === 'draft';
  const canWrite = writable && !busy;
  const canApprove = canWrite && !nothingToSave;
  const receipt = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const completes =
    proposal.operation.type === 'task.set_state' &&
    proposal.operation.state === 'completed';

  function approve() {
    if (!canApprove || !store) return;
    store.dismiss(key);
    void store.applyOperation(key, proposal.operation, {
      kind: 'approved_proposal',
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
    });
  }

  /** Not now, made as the account and session the panel shows; a late reply is dropped. */
  async function notNow() {
    if (!canWrite || !bound || !stillOwned(bound.owner)) return;
    const { client, owner } = bound;
    setRequest({ owner, state: 'busy' });
    const result = await client.cancel(
      proposal.proposalId,
      proposal.proposalRevision
    );
    if (!stillOwned(owner)) return;
    if (result.kind === 'ok' || result.kind === 'changed') {
      setRequest(null);
      queryClient.setQueryData(
        taskProposalKey(owner.accountId as string, proposal.proposalId),
        result.proposal
      );
      return;
    }
    setRequest({ owner, state: 'failed' });
  }

  const note =
    proposal.status !== 'draft'
      ? null
      : revised
        ? t('taskEdit.reviewContextChanged')
        : proposal.reviewReason === 'restored'
          ? t('taskEdit.reviewRestored')
          : null;

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.eyebrow}>
          {proposal.status === 'draft'
            ? t('taskEdit.draftBadge')
            : t('taskEdit.cardEyebrow')}
        </Text>
        <Text style={styles.title} accessibilityRole='header'>
          {title}
        </Text>
      </View>

      {view.stale && (
        <View style={styles.notice}>
          <MaterialIcons name='cloud-off' size={16} color={INK_MUTED} />
          <Text style={styles.noticeText}>{t('taskActions.offline')}</Text>
        </View>
      )}

      {note && (
        <View style={styles.review}>
          <Text style={styles.reviewText}>{note}</Text>
        </View>
      )}

      <View style={styles.block}>
        {lines.map(line => (
          <View
            key={line.field}
            style={styles.change}
            accessible
            accessibilityLabel={[
              line.label,
              line.from !== null ? t('taskEdit.now', { value: line.from }) : '',
              t('taskEdit.after', { value: line.to }),
              line.was ? t('taskEdit.was', { value: line.was }) : '',
            ]
              .filter(Boolean)
              .join('. ')}
          >
            <Text style={styles.label}>{line.label}</Text>
            {line.from !== null && (
              <Text style={styles.from}>
                {t('taskEdit.now', { value: line.from })}
              </Text>
            )}
            <Text style={styles.to}>
              {t('taskEdit.after', { value: line.to })}
            </Text>
            {line.was && (
              <Text style={styles.was}>
                {t('taskEdit.was', { value: line.was })}
              </Text>
            )}
          </View>
        ))}
        {completes && (
          <Text style={styles.hint}>{t('taskActions.completedHint')}</Text>
        )}
        {nothingToSave && proposal.status === 'draft' && (
          <Text style={styles.hint}>{t('taskEdit.alreadySet')}</Text>
        )}
      </View>

      <View accessibilityLiveRegion='polite' style={styles.status}>
        {proposal.status === 'cancelled' && (
          <Text style={styles.statusText}>{t('taskEdit.closed')}</Text>
        )}
        {ownRequest === 'failed' && (
          <Text style={[styles.statusText, styles.error]}>
            {t('taskActions.refused')}
          </Text>
        )}
        {phase.phase !== 'saved' && phase.phase !== 'needs_review' && (
          <PhaseMessage
            writable={writable && ownRequest !== 'busy'}
            phase={phase}
            stateLabel={s => t(`taskActions.state.${s}`)}
            store={store}
            taskRef={key}
          />
        )}
        {receipt && (
          <ReceiptBlock
            receipt={receipt}
            storeKey={key}
            store={store}
            canWrite={Boolean(store) && view.canWrite && !busy}
            taskTitle={title}
          />
        )}
      </View>

      {proposal.status === 'draft' && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskEdit.approveA11y', { title })}
            disabled={!canApprove}
            accessibilityState={{ disabled: !canApprove }}
            onPress={approve}
            style={({ pressed }) => [
              styles.primaryButton,
              { minHeight: minTarget() },
              !canApprove && styles.disabled,
              pressed && canApprove && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{t('taskEdit.approve')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskEdit.notNow')}
            disabled={!canWrite}
            accessibilityState={{ disabled: !canWrite }}
            onPress={() => void notNow()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { minHeight: minTarget() },
              !canWrite && styles.disabled,
              pressed && canWrite && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{t('taskEdit.notNow')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  eyebrow: { ...typography.caption, color: INK_MUTED },
  title: { ...typography.section, color: INK, marginTop: 2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: SURFACE_MUTED,
  },
  noticeText: { ...typography.caption, color: INK_SECONDARY, flex: 1 },
  review: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FBD5A5',
    backgroundColor: ACCENT_BG,
  },
  reviewText: { ...typography.secondary, color: INK },
  block: { gap: 10 },
  change: {
    gap: 2,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  label: { ...typography.caption, fontWeight: '600', color: INK },
  from: { ...typography.secondary, color: INK_SECONDARY },
  to: { ...typography.secondary, fontWeight: '600', color: INK },
  was: { ...typography.caption, color: INK_MUTED },
  hint: { ...typography.caption, color: INK_SECONDARY },
  status: { gap: 10 },
  statusText: { ...typography.secondary, color: INK_SECONDARY },
  error: { color: ERROR },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: {
    paddingHorizontal: 16,
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
