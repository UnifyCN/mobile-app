import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import {
  TITLE_MAX,
  createTaskOperation,
  isStepProposal,
  type ProposalContext,
  type TaskProposal,
} from '@/services/companionActions/contract';
import type {
  ProposalResult,
  TaskActionClient,
} from '@/services/companionActions/client';
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
  useTaskActionDraft,
  useTaskActionPhase,
  useTaskProposal,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';
import { ReceiptBlock } from './ReceiptBlock';
import { PhaseMessage } from './TaskStatePanel';
import { TaskEditProposalPanel } from './TaskEditProposalPanel';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';
const ERROR = '#B42318';

interface TaskProposalPanelProps {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** The Checklist title of a task, for an edit draft that does not carry one (#365). */
  titleFor?: (taskRef: string) => string | null;
}

const PROFILE_FIELDS = [
  ['city', 'taskCreate.profileCity'],
  ['province', 'taskCreate.profileProvince'],
  ['arrivalDate', 'taskCreate.profileArrival'],
] as const;

/**
 * Review of one server-owned task draft (mobile-app#363), direction B bottom sheet.
 * The draft is not saved work: it shows its exact title, the profile context it was
 * prepared against, any task with the same title, and one approval control that
 * names the change. Approval binds to the shown revision; an edited title or a
 * changed profile needs a new approval. Every write needs a fresh successful read;
 * after a failed read nothing is sent or queued.
 */
export function TaskProposalPanel({
  proposalId,
  view,
  store,
  titleFor,
}: TaskProposalPanelProps) {
  const { t, i18n } = useTranslation();
  const key = `proposal:${proposalId}`;
  const queryClient = useQueryClient();
  const bound = useTaskActionClient();
  const client = bound?.client ?? null;
  const query = useTaskProposal(proposalId);
  const phase = useTaskActionPhase(store, key);
  const titleDraft = useTaskActionDraft(store, key);
  // A Save title or Not now request in flight, or its refusal. It belongs to the
  // account and session it was made in, so it never shows for another one.
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
  const requestBusy = ownRequest === 'busy';
  const requestFailed = ownRequest === 'failed';

  // A refreshed revision from a needs-review reply is newer than the last read.
  const proposal: TaskProposal | undefined =
    phase.phase === 'needs_review' &&
    !isStepProposal(phase.proposal) &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;

  if (!proposal) {
    return (
      <Text style={styles.message} accessibilityLiveRegion='polite'>
        {query.isError
          ? t('taskCreate.draftUnavailable')
          : t('taskCreate.loadingDraft')}
      </Text>
    );
  }
  // #365: a draft of a change to an existing task has its own review.
  if (proposal.kind === 'task_edit') {
    return (
      <TaskEditProposalPanel
        proposal={proposal}
        view={view}
        store={store}
        fallbackTitle={titleFor?.(proposal.operation.task_ref) ?? null}
      />
    );
  }
  const created = proposal;

  const busy = isUnresolved(phase) || requestBusy;
  const writable =
    Boolean(store && client) && view.canWrite && proposal.status === 'draft';
  const canWrite = writable && !busy;
  const savedTitle = proposal.operation.title;
  const title = titleDraft ?? savedTitle;
  const edited = title.trim() !== savedTitle;
  const titleValid =
    title.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    !/[\n\r]/.test(title);
  const shownTitle = edited ? title.trim() : savedTitle;
  const receipt = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const canApprove = canWrite && !edited;
  // After a confirmed "not applied" nothing was written, so a changed title can still
  // be saved as a new revision. While the outcome is unknown only a lookup is allowed.
  const unknownOutcome = isUnresolved(phase) && phase.phase !== 'not_applied';
  const canSaveTitle =
    writable && !requestBusy && !unknownOutcome && edited && titleValid;
  // Retry repeats the reviewed operation: only while the draft shows that title.
  const canRetry = writable && !requestBusy && !edited;

  /**
   * One Save title or Not now intent, made as the account and session the panel
   * shows. Its result, the cached draft and the panel state are written only while
   * that session is still the signed-in one: after another account or a sign-out
   * (even if the same account signs in again) the late reply is dropped.
   */
  async function proposalRequest(
    run: (c: TaskActionClient) => Promise<ProposalResult>
  ) {
    if (!bound || !stillOwned(bound.owner)) return null;
    const { client: own, owner } = bound;
    setRequest({ owner, state: 'busy' });
    const result = await run(own);
    if (!stillOwned(owner)) return null;
    if (result.kind === 'ok' || result.kind === 'changed') {
      setRequest(null);
      queryClient.setQueryData(
        taskProposalKey(owner.accountId as string, proposalId),
        result.proposal
      );
      return result;
    }
    setRequest({ owner, state: 'failed' });
    return null;
  }

  async function saveTitle() {
    if (!canSaveTitle) return;
    const submitted = title;
    const result = await proposalRequest(c =>
      c.revise(
        created.proposalId,
        created.proposalRevision,
        createTaskOperation(submitted)
      )
    );
    if (result?.kind !== 'ok') return;
    // The saved title is a new revision: an approval that was confirmed not applied
    // can no longer be retried; the new title needs its own approval.
    store?.supersedeNotApplied(key);
    // Clear the typed title only when this edit is the saved one.
    if ((store?.draft(key) ?? submitted) === submitted)
      store?.setDraft(key, undefined);
  }

  function approve() {
    if (!canApprove || !store) return;
    store.dismiss(key);
    void store.applyOperation(key, created.operation, {
      kind: 'approved_proposal',
      proposal_id: created.proposalId,
      proposal_revision: created.proposalRevision,
    });
  }

  function notNow() {
    if (!canWrite) return;
    void proposalRequest(c =>
      c.cancel(created.proposalId, created.proposalRevision)
    );
  }

  const profileLines = (ctx: ProposalContext | null) => {
    const before =
      created.reviewReason === 'context_changed'
        ? created.previousContext?.profile
        : null;
    return PROFILE_FIELDS.flatMap(([field, label]) => {
      const value = ctx?.profile?.[field];
      if (!value) return [];
      const shown =
        field === 'arrivalDate' ? formatDate(value, i18n.language) : value;
      const old = before?.[field];
      const changed = before && old !== value;
      return [
        <View key={field}>
          <Text style={styles.contextLine}>{t(label, { value: shown })}</Text>
          {changed && old ? (
            <Text style={styles.before}>
              {t('taskCreate.before', {
                value:
                  field === 'arrivalDate'
                    ? formatDate(old, i18n.language)
                    : old,
              })}
            </Text>
          ) : null}
        </View>,
      ];
    });
  };
  const lines = profileLines(proposal.context);

  const reviewNote =
    proposal.status === 'draft' && proposal.reviewReason
      ? t(
          proposal.reviewReason === 'edited'
            ? 'taskCreate.reviewEdited'
            : proposal.reviewReason === 'context_changed'
              ? 'taskCreate.reviewContextChanged'
              : 'taskCreate.reviewRestored'
        )
      : null;

  return (
    <View style={styles.root}>
      <View>
        <Text style={styles.eyebrow}>
          {proposal.status === 'draft'
            ? t('taskCreate.draftBadge')
            : t('taskCreate.cardEyebrow')}
        </Text>
        <Text style={styles.title}>{savedTitle}</Text>
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

      {proposal.status === 'draft' && (
        <View style={styles.block}>
          <Text style={styles.label} nativeID={`title-${proposalId}`}>
            {t('taskCreate.titleLabel')}
          </Text>
          <TextInput
            value={title}
            onChangeText={text => store?.setDraft(key, text)}
            maxLength={TITLE_MAX + 50}
            editable={Boolean(store)}
            accessibilityLabel={t('taskCreate.titleLabel')}
            accessibilityLabelledBy={`title-${proposalId}`}
            style={styles.input}
          />
          <Text style={[styles.hint, !titleValid && styles.error]}>
            {titleValid
              ? t('taskCreate.titleHint')
              : t('taskCreate.titleInvalid', { max: TITLE_MAX })}
          </Text>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskCreate.saveTitle')}
            disabled={!canSaveTitle}
            accessibilityState={{ disabled: !canSaveTitle }}
            onPress={() => void saveTitle()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { minHeight: minTarget() },
              !canSaveTitle && styles.disabled,
              pressed && canSaveTitle && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {t('taskCreate.saveTitle')}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.label}>{t('taskCreate.priorityDoSoon')}</Text>
        <Text style={[styles.label, styles.spaced]}>
          {t('taskCreate.basedOn')}
        </Text>
        {lines.length ? (
          lines
        ) : (
          <Text style={styles.contextLine}>{t('taskCreate.noProfile')}</Text>
        )}
        {proposal.context?.sameTitleTasks.map(task => (
          <Text key={task.taskRef} style={[styles.contextLine, styles.spaced]}>
            {t('taskCreate.sameTitle', { title: task.title })}
          </Text>
        ))}
      </View>

      <View accessibilityLiveRegion='polite' style={styles.status}>
        {proposal.status === 'cancelled' && (
          <Text style={styles.contextLine}>{t('taskCreate.closed')}</Text>
        )}
        {requestFailed && (
          <Text style={[styles.contextLine, styles.error]}>
            {t('taskActions.refused')}
          </Text>
        )}
        {phase.phase !== 'saved' && phase.phase !== 'needs_review' && (
          <PhaseMessage
            writable={canRetry}
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
          />
        )}
      </View>

      {proposal.status === 'draft' && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskCreate.approveA11y', {
              title: shownTitle,
            })}
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
            <Text style={styles.primaryButtonText}>
              {t('taskCreate.approve')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskCreate.notNow')}
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
            <Text style={styles.secondaryButtonText}>
              {t('taskCreate.notNow')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function formatDate(value: string, language: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  message: {
    ...typography.secondary,
    color: INK_MUTED,
    paddingVertical: 12,
  },
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
  block: { gap: 6, alignItems: 'stretch' },
  label: { ...typography.caption, fontWeight: '600', color: INK },
  spaced: { marginTop: 8 },
  input: {
    ...typography.secondary,
    color: INK,
    minHeight: 48,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  hint: { ...typography.caption, color: INK_MUTED },
  error: { color: ERROR },
  contextLine: { ...typography.secondary, color: INK_SECONDARY },
  before: { ...typography.caption, color: INK_MUTED },
  status: { gap: 10 },
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
    alignSelf: 'flex-start',
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
