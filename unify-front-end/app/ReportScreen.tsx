import { typography } from '@/constants/Typography';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import KeyboardAvoidingView from '@/components/common/KeyboardAvoidingView';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useMutateReport } from '@/hooks/posts/useMutateReport';
import { useToast } from '@/context/ToastContext';
import BackHeader from '@/components/BackHeader';
import { useAnalytics } from '@/utils/analytics';

const MIN_LENGTH = 5;
const MAX_LENGTH = 500;

export default function ReportScreen() {
  const { t } = useTranslation();
  const { postId, userId, type = 'post' } = useLocalSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const mutation = useMutateReport();
  const { trackScreen, trackReportSubmitted } = useAnalytics();

  const [message, setMessage] = useState('');

  const submitting = mutation.isPending;
  const isPost = type === 'post';

  const title = isPost
    ? t('reportScreen.titlePost')
    : t('reportScreen.titleUser');
  const subtitle = isPost
    ? t('reportScreen.subtitlePost')
    : t('reportScreen.subtitleUser');
  const placeholder = isPost
    ? t('reportScreen.placeholderPost')
    : t('reportScreen.placeholderUser');

  const handleSubmit = () => {
    const trimmed = (message || '').trim().slice(0, MAX_LENGTH);
    if (trimmed.length < MIN_LENGTH) {
      Alert.alert(t('common.error'), t('reportScreen.minLengthMessage'));
      return;
    }

    if (isPost && !postId) {
      Alert.alert(t('common.error'), t('reportScreen.missingPostId'));
      return;
    }
    if (!isPost && !userId) {
      Alert.alert(t('common.error'), t('reportScreen.missingUserId'));
      return;
    }

    mutation.mutate(
      {
        postId: isPost ? Number(postId) : undefined,
        userId: !isPost ? String(userId) : undefined,
        isReported: false,
        reason: trimmed,
        type: isPost ? 'post' : 'user',
      },
      {
        onSuccess: () => {
          trackReportSubmitted(isPost ? 'post' : 'user');
          showToast?.(t('reportScreen.submittedToast'));
          router.back();
        },
        onError: err => {
          console.error('Report failed', err);
          Alert.alert(t('common.error'), t('reportScreen.submitFailed'));
        },
      }
    );
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <BackHeader title='' />
      <KeyboardAvoidingView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          multiline
          maxLength={MAX_LENGTH}
          style={styles.input}
          editable={!submitting}
          textAlignVertical='top'
        />
        <Text style={styles.counter}>
          {message.length}/{MAX_LENGTH}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancel]}
            onPress={() => router.back()}
            disabled={submitting}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Text style={styles.buttonText}>{t('report.sendReport')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: 'flex-start',
  },
  header: { marginBottom: 12 },
  title: { ...typography.section, marginBottom: 6, color: '#111' },
  subtitle: { ...typography.caption, color: '#666' },
  input: {
    ...typography.body,
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 12,
    marginTop: 14,
    color: '#111',
  },
  counter: {
    ...typography.caption,
    alignSelf: 'flex-end',
    marginTop: 6,
    color: '#62605B',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#111',
    minWidth: 110,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cancelText: { color: '#111', fontWeight: '600' },
});
