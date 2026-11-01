import { LiveText as Text } from '@/components/common/LiveText';
import React, { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { typography } from '@/constants/Typography';
import {
  DETAIL_TEXT_MAX,
  detailRemoveOperation,
  detailUpdateOperation,
  isDetailProposal,
  verifiedCompensationDetail,
  type DetailProposal,
  type SavedDetail,
  type TaskReceipt,
} from '@/services/companionActions/contract';
import {
  isUnresolved,
  type TaskActionPhase,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  useDetailProposal,
  useTaskActionClient,
  useTaskActionDraft,
  useTaskActionPhase,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget } from '@/utils/touchTarget';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT_STRONG = '#9A4A00';
const ERROR = '#B42318';

/** Store keys (#370): one saved detail's own changes, and its edit text. */
export const detailKey = (detailId: string) => `detail:${detailId}`;
const editDraftKey = (detailId: string) => `detail-edit:${detailId}`;

type T = (key: string, options?: Record<string, unknown>) => string;

/** The confirmation replaces its opener. Restore focus after the opener has a native layout. */
function useConfirmationFocus() {
  const ref = useRef<View>(null);
  const pending = useRef(false);
  return {
    ref,
    request: () => { pending.current = true; },
    onLayout: () => {
      if (!pending.current || !ref.current) return;
      pending.current = false;
      AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    },
  };
}

function Button({
  label,
  name,
  onPress,
  disabled = false,
  primary = false,
  confirmationFocus,
}: {
  label: string;
  name?: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  confirmationFocus?: ReturnType<typeof useConfirmationFocus>;
}) {
  return (
    <Pressable
      ref={confirmationFocus?.ref}
      onLayout={confirmationFocus?.onLayout}
      accessibilityRole='button'
      accessibilityLabel={name ?? label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        primary ? styles.primaryButton : styles.secondaryButton,
        { minHeight: minTarget() },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={primary ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

/** The exact change a detail receipt saved, from its own recorded text (never prose). */
export function detailReceiptText(t: T, receipt: TaskReceipt): string {
  const d = receipt.detail;
  if (!d) return '';
  switch (receipt.operationType) {
    case 'detail.update':
      return t('savedDetails.changed', { before: d.beforeText ?? '', text: d.text });
    case 'detail.remove':
      return t('savedDetails.removed', { text: d.text });
    case 'detail.restore':
      return t('savedDetails.restored', { text: d.text });
    default:
      return t('savedDetails.saved', { text: d.text });
  }
}

/**
 * One saved-detail receipt with its revision-checked Undo (#370). The receipt is current
 * only while the detail is still at the revision it produced; otherwise it is history and
 * offers no Undo. An Undo that removes the detail (the Undo of a save) asks first; a
 * conflicting Undo changes nothing and offers the reviewed change.
 */
export function DetailReceipt({
  receipt,
  storeKey,
  store,
  view,
}: {
  receipt: TaskReceipt;
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const undoFocus = useConfirmationFocus();
  const phase = useTaskActionPhase(store, storeKey);
  const shown = phase.phase === 'saved' ? phase.receipt : receipt;
  const d = shown.detail;
  if (!d) return null;
  const live = view.details.find(x => x.detailId === d.detailId);
  // Current while the detail is still exactly as this receipt left it.
  const current =
    shown.current && view.status === 'ready' && (d.removed ? !live : live?.revision === shown.afterRevision);
  const canUndo =
    shown.kind === 'change' && shown.undoable && current && view.canWrite && !isUnresolved(phase);
  const undoRemoves = shown.operationType === 'detail.create' || shown.operationType === 'detail.restore';
  const undoName =
    shown.operationType === 'detail.update'
      ? t('savedDetails.undoChangeA11y', { text: d.text })
      : shown.operationType === 'detail.remove'
        ? t('savedDetails.undoRemoveA11y', { text: d.text })
        : t('savedDetails.undoSaveA11y', { text: d.text });
  const undo = (removalConfirmed: boolean) => {
    setConfirming(false);
    void store?.undo(storeKey, shown.operationId, { removalConfirmed });
  };
  return (
    <View style={styles.receipt}>
      <Text style={styles.receiptText} accessibilityLiveRegion='polite'>
        {detailReceiptText(t, shown)}
      </Text>
      {shown.kind === 'change' && !current ? (
        <Text style={styles.caption}>{t('savedDetails.historical')}</Text>
      ) : null}
      {canUndo && !confirming ? (
        <Button
          confirmationFocus={undoFocus}
          label={t('taskActions.undo')}
          name={undoName}
          onPress={() => (undoRemoves ? setConfirming(true) : undo(false))}
        />
      ) : null}
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>{t('savedDetails.confirmTitle')}</Text>
          <Text style={styles.confirmBody}>{t('savedDetails.undoSaveConfirm', { text: d.text })}</Text>
          <View style={styles.actions}>
            <Button primary label={t('savedDetails.confirmRemove')} onPress={() => undo(true)} disabled={!view.canWrite} />
            <Button label={t('savedDetails.cancel')} onPress={() => {
              undoFocus.request();
              setConfirming(false);
            }} />
          </View>
        </View>
      ) : null}
      {phase.phase !== 'saved' ? (
        <DetailPhase phase={phase} storeKey={storeKey} store={store} view={view} />
      ) : null}
    </View>
  );
}

/** The unresolved or refused state of one detail key; never a false saved result. */
export function DetailPhase({
  phase,
  storeKey,
  store,
  view,
}: {
  phase: TaskActionPhase;
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const reviewFocus = useConfirmationFocus();
  const line = (value: string, error = false) => (
    <Text style={[styles.status, error && styles.statusError]} accessibilityLiveRegion='polite'>
      {value}
    </Text>
  );
  switch (phase.phase) {
    case 'saving':
      return line(t('taskActions.saving'));
    case 'checking':
      return line(t('taskActions.checking'));
    case 'pending':
    case 'lookup_failed':
      return (
        <View style={styles.block}>
          {line(phase.phase === 'pending' ? t('taskActions.pending') : t('taskActions.lookupFailed'))}
          <Button label={t('taskActions.checkAgain')} onPress={() => void store?.checkAgain(storeKey)} />
        </View>
      );
    case 'not_applied':
      return (
        <View style={styles.block}>
          {line(t('taskActions.notApplied'))}
          <Button
            label={t('taskActions.retry')}
            disabled={!view.canWrite}
            onPress={() => view.canWrite && void store?.retry(storeKey)}
          />
        </View>
      );
    case 'conflict':
      return line(t('savedDetails.conflict'), true);
    case 'detail_exists':
      return line(t('savedDetails.exists'));
    case 'already_undone':
      return line(t('taskActions.alreadyUndone'));
    case 'refused':
      return line(phase.reason === 'profile_fact' ? t('savedDetails.profileFact') : t('taskActions.refused'), true);
    case 'unavailable':
      return line(t('taskActions.unavailable'), true);
    case 'signed_out':
      return line(t('taskActions.signedOut'), true);
    case 'undo_review': {
      const op = phase.proposal.operations[0];
      // The receipt keeps its historical text; the reviewed change names the detail as
      // the service read it now, and only while no newer read contradicts it.
      const current = verifiedCompensationDetail(
        op,
        phase.currentDetail,
        view.status === 'ready' ? view.details : undefined
      );
      if (!current) {
        return (
          <View style={styles.block}>
            {line(t('savedDetails.undoConflict'))}
            {line(t('savedDetails.reviewUnverified'), true)}
            <View style={styles.actions}>
              <Button label={t('taskActions.keepCurrent')} onPress={() => store?.dismiss(storeKey)} />
            </View>
          </View>
        );
      }
      const removes = op.type === 'detail.remove';
      const label =
        op.type === 'detail.update'
          ? t('savedDetails.reviewUpdate', { text: op.text })
          : op.type === 'detail.restore'
            ? t('savedDetails.reviewRestore', { text: current.text })
            : t('savedDetails.reviewRemove', { text: current.text });
      return (
        <View style={styles.block}>
          {line(t('savedDetails.undoConflict'))}
          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>{t('savedDetails.confirmTitle')}</Text>
              <Text style={styles.confirmBody}>{t('savedDetails.confirmBody', { text: current.text })}</Text>
              <View style={styles.actions}>
                <Button
                  primary
                  label={t('savedDetails.confirmRemove')}
                  disabled={!view.canWrite}
                  onPress={() => {
                    setConfirming(false);
                    void store?.approveCompensation(storeKey, { removalConfirmed: true });
                  }}
                />
                <Button label={t('savedDetails.cancel')} onPress={() => {
                  reviewFocus.request();
                  setConfirming(false);
                }} />
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                confirmationFocus={reviewFocus}
                label={label}
                disabled={!view.canWrite}
                onPress={() => (removes ? setConfirming(true) : void store?.approveCompensation(storeKey))}
              />
              <Button label={t('taskActions.keepCurrent')} onPress={() => store?.dismiss(storeKey)} />
            </View>
          )}
        </View>
      );
    }
    default:
      return null;
  }
}

function DetailRow({
  detail,
  store,
  view,
}: {
  detail: SavedDetail;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const key = detailKey(detail.detailId);
  const phase = useTaskActionPhase(store, key);
  const edit = useTaskActionDraft(store, editDraftKey(detail.detailId));
  const [confirming, setConfirming] = useState(false);
  const editFocus = useConfirmationFocus();
  const removeFocus = useConfirmationFocus();
  const busy = isUnresolved(phase);
  const canWrite = view.canWrite && !busy;
  const editing = edit !== undefined;
  const trimmed = edit?.trim() ?? '';
  const editError = editing && !trimmed ? t('savedDetails.required') : null;
  const canSave = canWrite && editing && trimmed.length > 0 && trimmed !== detail.text;

  function save() {
    if (!canSave || !store || edit === undefined) return;
    const submitted = edit;
    void store
      .applyOperation(key, detailUpdateOperation(detail, submitted), { kind: 'ui_control' })
      .then(() => {
        // The typed text is kept unless exactly this text was saved.
        if (store.get(key).phase === 'saved' && store.draft(editDraftKey(detail.detailId)) === submitted)
          store.setDraft(editDraftKey(detail.detailId), undefined);
      });
  }

  function remove() {
    if (!canWrite || !store) return;
    setConfirming(false);
    void store.applyOperation(key, detailRemoveOperation(detail), {
      kind: 'ui_control',
      removal_confirmed: true,
    });
  }

  return (
    <View style={styles.row} testID='saved-detail-row'>
      <Text style={styles.detailText}>{detail.text}</Text>
      <Text style={styles.caption}>
        {detail.source.kind === 'approved_proposal'
          ? t('savedDetails.sourceApproved')
          : t('savedDetails.sourceCommand')}
      </Text>
      {!editing && !confirming ? (
        <View style={styles.actions}>
          <Button
            confirmationFocus={editFocus}
            label={t('savedDetails.edit')}
            name={t('savedDetails.editA11y', { text: detail.text })}
            disabled={!canWrite}
            onPress={() => store?.setDraft(editDraftKey(detail.detailId), detail.text)}
          />
          <Button
            confirmationFocus={removeFocus}
            label={t('savedDetails.remove')}
            name={t('savedDetails.removeA11y', { text: detail.text })}
            disabled={!canWrite}
            onPress={() => setConfirming(true)}
          />
        </View>
      ) : null}
      {editing ? (
        <View style={styles.block}>
          <TextInput
            value={edit}
            onChangeText={text => store?.setDraft(editDraftKey(detail.detailId), text)}
            maxLength={DETAIL_TEXT_MAX}
            multiline
            accessibilityLabel={t('savedDetails.editLabel')}
            style={[styles.input, { minHeight: minTarget() }]}
          />
          {editError ? <Text style={[styles.status, styles.statusError]}>{editError}</Text> : null}
          <View style={styles.actions}>
            <Button primary label={t('savedDetails.save')} disabled={!canSave} onPress={save} />
            <Button
              label={t('savedDetails.cancel')}
              onPress={() => {
                editFocus.request();
                store?.setDraft(editDraftKey(detail.detailId), undefined);
              }}
            />
          </View>
        </View>
      ) : null}
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>{t('savedDetails.confirmTitle')}</Text>
          <Text style={styles.confirmBody}>{t('savedDetails.confirmBody', { text: detail.text })}</Text>
          <View style={styles.actions}>
            <Button primary label={t('savedDetails.confirmRemove')} disabled={!canWrite} onPress={remove} />
            <Button label={t('savedDetails.cancel')} onPress={() => {
              removeFocus.request();
              setConfirming(false);
            }} />
          </View>
        </View>
      ) : null}
      {phase.phase === 'saved' ? (
        <DetailReceipt receipt={phase.receipt} storeKey={key} store={store} view={view} />
      ) : (
        <DetailPhase phase={phase} storeKey={key} store={store} view={view} />
      )}
    </View>
  );
}

/** A detail removed in this session: its removal receipt stays, with its Undo. */
function RemovedDetail({
  storeKey,
  store,
  view,
}: {
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const phase = useTaskActionPhase(store, storeKey);
  return (
    <View style={styles.row}>
      {phase.phase === 'saved' ? (
        <DetailReceipt receipt={phase.receipt} storeKey={storeKey} store={store} view={view} />
      ) : (
        <DetailPhase phase={phase} storeKey={storeKey} store={store} view={view} />
      )}
    </View>
  );
}

/**
 * The account's saved personal details (mobile-app#370), in the Companion sheet: view,
 * edit at the revision shown, and remove after confirmation. Each control authorizes
 * exactly its own change and gets a receipt with a revision-checked Undo. Typed edits live
 * in the account's action store, so closing and reopening the sheet keeps them.
 */
export function SavedDetailsPanel({
  view,
  store,
}: {
  view: TaskProgressView;
  store: TaskActionStore | null;
}) {
  const { t } = useTranslation();
  const live = new Set(view.details.map(d => detailKey(d.detailId)));
  const removedKeys = (store?.keysWith('detail:') ?? []).filter(key => !live.has(key));
  return (
    <View style={styles.root}>
      <Text style={styles.intro}>{t('savedDetails.intro')}</Text>
      {view.stale ? <Text style={styles.status}>{t('taskActions.offline')}</Text> : null}
      {view.details.length === 0 && removedKeys.length === 0 ? (
        <Text style={styles.status}>{t('savedDetails.empty')}</Text>
      ) : null}
      {view.details.map(detail => (
        <DetailRow key={detail.detailId} detail={detail} store={store} view={view} />
      ))}
      {removedKeys.map(key => (
        <RemovedDetail key={key} storeKey={key} store={store} view={view} />
      ))}
    </View>
  );
}

/**
 * Review of one detail the answer suggested (mobile-app#370). It is not saved until the
 * user approves this revision; Not now cancels the draft and saves nothing.
 */
export function DetailProposalPanel({
  proposalId,
  view,
  store,
  onViewDetails,
}: {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  onViewDetails: () => void;
}) {
  const { t } = useTranslation();
  const query = useDetailProposal(proposalId);
  const bound = useTaskActionClient();
  const key = `proposal:${proposalId}`;
  const phase = useTaskActionPhase(store, key);
  const [cancelling, setCancelling] = useState(false);
  const proposal: DetailProposal | undefined =
    phase.phase === 'needs_review' &&
    isDetailProposal(phase.proposal) &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;

  if (!proposal) {
    return (
      <Text style={styles.status} accessibilityLiveRegion='polite'>
        {query.isError ? t('taskActions.unavailable') : t('taskActions.loading')}
      </Text>
    );
  }
  const text = proposal.operation.text;
  const saved = phase.phase === 'saved' ? phase.receipt : proposal.receipt;
  const busy = isUnresolved(phase) || cancelling;
  const canApprove =
    view.canWrite && proposal.status === 'draft' && proposal.sameTextDetails.length === 0 && !busy;

  function approve() {
    if (!canApprove || !store || !proposal) return;
    void store.applyOperation(key, proposal.operation, {
      kind: 'approved_proposal',
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
    });
  }

  async function notNow() {
    if (!bound || !proposal || busy) return;
    setCancelling(true);
    try {
      await bound.client.cancelDetail(proposal.proposalId, proposal.proposalRevision);
    } finally {
      setCancelling(false);
      void query.refetch();
    }
  }

  return (
    <View style={styles.root}>
      {/* The sheet header names the question ("Remember this detail?"). */}
      <Text style={styles.eyebrow}>{t('savedDetails.draftEyebrow')}</Text>
      <Text style={styles.detailText}>{text}</Text>
      {saved ? (
        <>
          <DetailReceipt receipt={saved} storeKey={key} store={store} view={view} />
          <Button label={t('savedDetails.view')} onPress={onViewDetails} />
        </>
      ) : proposal.status === 'cancelled' ? (
        <Text style={styles.status}>{t('savedDetails.notSaved')}</Text>
      ) : (
        <>
          <Text style={styles.status}>{t('savedDetails.reviewBody')}</Text>
          {proposal.sameTextDetails.length > 0 ? (
            <Text style={styles.status}>{t('savedDetails.draftChanged')}</Text>
          ) : null}
          <DetailPhase phase={phase} storeKey={key} store={store} view={view} />
          <View style={styles.actions}>
            <Button primary label={t('savedDetails.rememberThis')} disabled={!canApprove} onPress={approve} />
            <Button label={t('savedDetails.notNow')} disabled={busy} onPress={() => void notNow()} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  intro: { ...typography.secondary, color: INK_SECONDARY },
  eyebrow: { ...typography.caption, color: INK_MUTED },
  row: {
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  detailText: { ...typography.secondary, fontWeight: '600', color: INK },
  caption: { ...typography.caption, color: INK_MUTED },
  block: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    ...typography.secondary,
    color: INK,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    textAlignVertical: 'top',
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
  secondaryButtonText: { ...typography.secondary, fontWeight: '600', color: INK },
  primaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_STRONG,
  },
  primaryButtonText: { ...typography.secondary, fontWeight: '600', color: '#fff' },
  confirm: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: SURFACE_MUTED },
  confirmTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  confirmBody: { ...typography.caption, color: INK_SECONDARY },
  receipt: { gap: 6 },
  receiptText: { ...typography.secondary, color: INK },
  status: { ...typography.secondary, color: INK_SECONDARY },
  statusError: { color: ERROR },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
