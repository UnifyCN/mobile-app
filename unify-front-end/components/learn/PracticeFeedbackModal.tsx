import { typography } from '@/constants/Typography';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getPracticeFeedback,
  PracticeFeedbackRequest,
} from '@/services/practice/getPracticeFeedback';
import { useTranslation } from 'react-i18next';

interface PracticeFeedbackModalProps {
  visible: boolean;
  questionText: string;
  userAnswer: string;
  expectedAnswer?: string;
  practiceTitle?: string;
  accentColor?: string;
  onClose: () => void;
}

export default function PracticeFeedbackModal({
  visible,
  questionText,
  userAnswer,
  expectedAnswer,
  practiceTitle,
  accentColor = '#575757',
  onClose,
}: PracticeFeedbackModalProps) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchFeedback = async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const request: PracticeFeedbackRequest = {
        questionText,
        userAnswer,
        expectedAnswer,
        practiceTitle,
      };
      const result = await getPracticeFeedback(request);
      if (currentRequestId !== requestIdRef.current) return;
      setFeedback(result);
    } catch (err: any) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(err.message || t('learn.practiceFeedback.errorFallback'));
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (visible && questionText && userAnswer) {
      fetchFeedback();
    }
    if (!visible) {
      requestIdRef.current++;
      setFeedback(null);
      setError(null);
      setLoading(false);
    }
  }, [visible, questionText, userAnswer]);

  const handleRetry = () => {
    fetchFeedback();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.modal}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.iconContainer, { backgroundColor: accentColor }]}
              >
                <Feather name='message-circle' size={16} color='#fff' />
              </View>
              <Text style={styles.headerTitle}>
                {t('learn.practiceFeedback.title')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name='x' size={20} color='#9CA3AF' />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size='small' color={accentColor} />
                <Text style={styles.loadingText}>
                  {t('learn.practiceFeedback.generating')}
                </Text>
              </View>
            )}

            {feedback && (
              <View style={styles.feedbackContainer}>
                <Text style={styles.feedbackText}>{feedback}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: accentColor }]}
                  onPress={handleRetry}
                >
                  <Feather name='refresh-cw' size={14} color='#fff' />
                  <Text style={styles.retryButtonText}>
                    {t('learn.practiceFeedback.tryAgain')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {feedback && (
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: accentColor }]}
              onPress={onClose}
            >
              <Text style={styles.doneButtonText}>
                {t('learn.practiceFeedback.gotIt')}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.cardTitle, color: '#000' },
  scrollContent: {
    flexGrow: 0,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  loadingText: { ...typography.secondary, color: '#6B7280' },
  feedbackContainer: {
    paddingBottom: 8,
  },
  feedbackText: { ...typography.body, color: '#374151' },
  errorContainer: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
  },
  errorText: { ...typography.secondary, color: '#EF4444', textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: { ...typography.button, color: '#fff' },
  doneButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: { ...typography.button, color: '#fff' },
});
