import { typography } from '@/constants/Typography';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { sendGroupRequestEmail } from '@/services/groups/sendGroupRequestEmail';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function showToast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(i18n.t('common.done'), message);
}

export default function RequestGroupModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [audience, setAudience] = useState('');
  const [reason, setReason] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [extraNotes, setExtraNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    },
    []
  );

  const handleDismiss = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    reset();
    onClose();
  };

  const canSubmit = useMemo(() => {
    return (
      groupName.trim().length >= 1 &&
      audience.trim().length >= 1 &&
      reason.trim().length >= 10 &&
      requesterEmail.trim().length >= 5
    );
  }, [groupName, audience, reason, requesterEmail]);

  const reset = () => {
    setGroupName('');
    setAudience('');
    setReason('');
    setRequesterEmail('');
    setExtraNotes('');
    setShowSuccess(false);
  };

  const submit = async () => {
    if (!canSubmit) {
      showToast(t('groups.requiredFields'));
      return;
    }

    setSubmitting(true);
    try {
      await sendGroupRequestEmail({
        groupName: groupName.trim(),
        audience: audience.trim(),
        reason: reason.trim(),
        requesterEmail: requesterEmail.trim(),
        extraNotes: extraNotes.trim(),
      });

      // Show success confirmation
      setShowSuccess(true);

      // Auto-close after 2 seconds. Stored in a ref so the user-initiated
      // close (X / backdrop) can cancel it, and so unmounting clears it.
      autoCloseTimerRef.current = setTimeout(() => {
        autoCloseTimerRef.current = null;
        reset();
        onClose();
      }, 2000);
    } catch (e: any) {
      Alert.alert(
        t('common.error'),
        e?.message ?? t('groups.failedSendRequest')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType='slide'
      transparent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
        <View style={{ flex: 1, justifyContent: 'flex-end', width: '100%' }}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {showSuccess
                  ? t('groups.requestSent')
                  : t('groups.requestGroup')}
              </Text>
              <Pressable onPress={handleDismiss} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {showSuccess ? (
              <View style={styles.successContainer}>
                <Text style={styles.successEmoji}>🎉</Text>
                <Text style={styles.successTitle}>{t('groups.thankYou')}</Text>
                <Text style={styles.successMessage}>
                  {t('groups.requestSentMessage')}
                </Text>
              </View>
            ) : (
              <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
                keyboardShouldPersistTaps='always'
                keyboardDismissMode='on-drag'
                showsVerticalScrollIndicator={false}
                automaticallyAdjustKeyboardInsets
              >
                <Text style={styles.label}>
                  {t('groups.requestForm.groupNameLabel')}
                </Text>
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder={t('groups.requestForm.groupNamePlaceholder')}
                  style={styles.input}
                  editable={!submitting}
                />

                <Text style={styles.label}>
                  {t('groups.requestForm.audienceLabel')}
                </Text>
                <TextInput
                  value={audience}
                  onChangeText={setAudience}
                  placeholder={t('groups.requestForm.audiencePlaceholder')}
                  style={styles.input}
                  editable={!submitting}
                />

                <Text style={styles.label}>
                  {t('groups.requestForm.reasonLabel')}
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder={t('groups.requestForm.reasonPlaceholder')}
                  style={[styles.input, styles.textArea]}
                  multiline
                  editable={!submitting}
                />

                <Text style={styles.label}>
                  {t('groups.requestForm.emailLabel')}
                </Text>
                <TextInput
                  value={requesterEmail}
                  onChangeText={setRequesterEmail}
                  placeholder={t('groups.requestForm.emailPlaceholder')}
                  style={styles.input}
                  autoCapitalize='none'
                  keyboardType='email-address'
                  editable={!submitting}
                />

                <Text style={styles.label}>
                  {t('groups.requestForm.extraNotesLabel')}
                </Text>
                <TextInput
                  value={extraNotes}
                  onChangeText={setExtraNotes}
                  placeholder={t('groups.requestForm.extraNotesPlaceholder')}
                  style={[styles.input, styles.textArea]}
                  multiline
                  editable={!submitting}
                  onFocus={() =>
                    setTimeout(
                      () =>
                        scrollViewRef.current?.scrollToEnd({ animated: true }),
                      300
                    )
                  }
                />

                <Pressable
                  onPress={submit}
                  disabled={!canSubmit || submitting}
                  style={[
                    styles.submitBtn,
                    !canSubmit || submitting ? { opacity: 0.5 } : null,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.submitText}>
                      {t('groups.sendRequest')}
                    </Text>
                  )}
                </Pressable>

                <Text style={styles.helper}>
                  {t('groups.requestForm.helperText')}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '92%',
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...typography.cardTitle },
  closeBtn: { padding: 6 },
  closeText: { ...typography.body },

  content: { padding: 16, gap: 8 },
  label: { ...typography.caption, fontWeight: '600' },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
  },
  submitText: { ...typography.button },
  helper: { ...typography.caption, marginTop: 6, color: '#666' },

  // Success state styles
  successContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  successTitle: { ...typography.section, marginBottom: 8, color: '#000' },
  successMessage: {
    ...typography.secondary,
    color: '#666',
    textAlign: 'center',
  },
});
