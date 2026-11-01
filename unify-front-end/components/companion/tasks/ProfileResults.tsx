import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LiveText as Text } from '@/components/common/LiveText';
import { typography } from '@/constants/Typography';
import { minTarget } from '@/utils/touchTarget';
import { useTaskActionPhase, type TaskProgressView } from '@/hooks/companion/useTaskActions';
import type { TaskActionStore } from '@/services/companionActions/taskActionStore';
import type { TaskReceipt } from '@/services/companionActions/contract';
import type { ProfileProposal } from '@/services/companionActions/profile';
type Props = { view: TaskProgressView; store: TaskActionStore | null };
export function ProfileButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole='button' accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [profileStyles.button, { minHeight: minTarget() }, pressed && profileStyles.pressed, disabled && profileStyles.disabled]}>
    <Text style={profileStyles.buttonText}>{label}</Text>
  </Pressable>;
}
export function ProfileReview({ proposal, onApprove, onCancel, disabled }: {
  proposal: ProfileProposal; onApprove: () => void; onCancel: () => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const value = (s: string | null) => s ?? t('profileActions.notSet');
  return <View style={profileStyles.review}>
    <Text style={profileStyles.title}>{t('profileActions.review')}</Text>
    {proposal.reviewReason === 'context_changed' || proposal.reviewReason === 'restored'
      ? <Text accessibilityLiveRegion='polite'>{t('profileActions.changedReview')}</Text> : null}
    <Text>{t('profileActions.current', { value: value(proposal.context.value) })}</Text>
    <Text>{t('profileActions.proposed', { value: value(proposal.operation.value) })}</Text>
    <ProfileButton label={t('profileActions.save')} onPress={onApprove} disabled={disabled || proposal.status !== 'draft'} />
    <ProfileButton label={t('taskCreate.notNow')} onPress={onCancel} disabled={disabled || proposal.status !== 'draft'} />
  </View>;
}
export function ProfileReceipt({ receipt, storeKey, view, store }: { receipt: TaskReceipt; storeKey: string } & Props) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  const shown = phase.phase === 'saved' ? phase.receipt : receipt;
  if (!shown.profile) return null;
  const p = shown.profile;
  return <View style={profileStyles.review}>
    <Text accessibilityLiveRegion='polite'>{t('profileActions.saved', { field: t(`profileActions.field.${p.field}`),
      before: p.before ?? t('profileActions.notSet'), after: p.after ?? t('profileActions.notSet') })}</Text>
    {shown.kind === 'change' && shown.undoable ? <ProfileButton label={t('taskActions.undo')} onPress={() => void store?.undo(storeKey, shown.operationId)}
      disabled={!view.canWrite || phase.phase === 'saving' || phase.phase === 'checking'} /> : null}
    {phase.phase === 'profile_review' ? <ProfileReview proposal={phase.proposal} disabled={!view.canWrite}
      onApprove={() => void store?.applyOperation(storeKey, phase.proposal.operation, { kind: 'approved_proposal',
        proposal_id: phase.proposal.proposalId, proposal_revision: phase.proposal.proposalRevision })}
      onCancel={() => store?.dismiss(storeKey)} /> : null}
    <ProfileRecovery storeKey={storeKey} store={store} view={view} />
  </View>;
}
export function ProfileRecovery({ storeKey, store, view }: { storeKey: string } & Props) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  if (phase.phase === 'pending' || phase.phase === 'lookup_failed' || phase.phase === 'not_applied') return <View>
    <Text accessibilityLiveRegion='polite'>{t(phase.phase === 'pending' ? 'taskActions.pending' : phase.phase === 'lookup_failed' ? 'taskActions.lookupFailed' : 'taskActions.notApplied')}</Text>
    <ProfileButton label={t(phase.phase === 'not_applied' ? 'taskActions.retry' : 'taskActions.checkAgain')}
      disabled={phase.phase === 'not_applied' && !view.canWrite}
      onPress={() => void (phase.phase === 'not_applied' ? store?.retry(storeKey) : store?.checkAgain(storeKey))} />
  </View>;
  if (['refused','unavailable','conflict','signed_out','already_undone'].includes(phase.phase)) return <Text accessibilityLiveRegion='polite'>{t('profileActions.refresh')}</Text>;
  return null;
}
export const profileStyles = StyleSheet.create({
  body: { gap: 16 }, row: { gap: 6, borderBottomColor: '#E2E8F0', borderBottomWidth: 1, paddingBottom: 12 },
  title: { ...typography.label, fontWeight: '600', color: '#0F172A' }, hint: { ...typography.body, color: '#64748B' },
  review: { gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  input: { ...typography.body, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, color: '#0F172A' },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF4E8' },
  buttonText: { ...typography.label, color: '#9A4A00' }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.5 },
});
