import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LiveText as Text } from '@/components/common/LiveText';
import { minTarget } from '@/utils/touchTarget';
import { useProfileEditor } from '@/hooks/companion/useProfileEditor';
import { type TaskProgressView } from '@/hooks/companion/useTaskActions';
import type { TaskActionStore } from '@/services/companionActions/taskActionStore';
import type { ProfileField } from '@/services/companionActions/profile';

import { ProfileButton as Button, ProfileReview, ProfileReceipt, ProfileRecovery, profileStyles as styles } from './ProfileResults';

type Props = { view: TaskProgressView; store: TaskActionStore | null; proposalId?: string | null };
const PROFILE_FIELDS: ProfileField[] = ['province', 'arrival_date'];
function DelayedStatus({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setShown(true), 300); return () => clearTimeout(timer); }, []);
  return shown ? <Text accessibilityLiveRegion='polite'>{text}</Text> : null;
}
/** Extends the existing bottom sheet. Editors and composer are never keyed by server revisions. */
export function ProfilePanel({ view, store, proposalId = null }: Props) {
  const { t } = useTranslation();
  const editor = useProfileEditor(view, store, proposalId);
  if (!view.profile) return view.status === 'loading' ? <DelayedStatus text={t('taskActions.loading')} /> : <Text accessibilityLiveRegion='polite'>{t('taskActions.unavailable')}</Text>;
  return <View style={styles.body}>
    <Text style={styles.hint}>{t('profileActions.explanation')}</Text>
    {PROFILE_FIELDS.map(field => <View key={field} style={styles.row}>
      <Text style={styles.title}>{t(`profileActions.field.${field}`)}</Text>
      <Text>{(field === 'province' ? view.profile?.province : view.profile?.arrivalDate) ?? t('profileActions.notSet')}</Text>
      <Button label={t(`profileActions.edit.${field}`)} disabled={Boolean(editor.proposal?.status === 'draft') || editor.busy}
        onPress={() => editor.edit(field)} />
    </View>)}
    {editor.editing ? <View style={styles.review}>
      <TextInput accessibilityLabel={t(`profileActions.input.${editor.editing}`)} value={editor.text} onChangeText={editor.setText}
        style={[styles.input, { minHeight: minTarget() }]} autoCapitalize='none' editable={!editor.busy} />
      {editor.editing === 'arrival_date' ? <Text>{t('profileActions.dateHint')}</Text> : null}
      <Button label={t('profileActions.review')} disabled={!view.canWrite || editor.busy || !editor.text.trim()} onPress={() => void editor.prepare()} />
      <Button label={t('taskCreate.notNow')} onPress={editor.clearEditor} disabled={editor.busy} />
    </View> : null}
    {editor.proposal ? <ProfileReview proposal={editor.proposal} onApprove={editor.approve} onCancel={() => void editor.cancel()} disabled={!editor.canApprove} /> : null}
    {editor.receipt ? <ProfileReceipt receipt={editor.receipt} storeKey={editor.key} store={store} view={view} /> : null}
    {editor.waiting ? <DelayedStatus key={editor.loadingKind} text={t(`taskActions.${editor.loadingKind}`)} /> : null}
    {editor.failure || editor.queryFailed ? <Text accessibilityRole='alert'>{t(editor.failure ?? 'taskActions.unavailable')}</Text> : null}
    <ProfileRecovery storeKey={editor.key} store={store} view={view} />
  </View>;
}
