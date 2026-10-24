import { typography } from '@/constants/Typography';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { explainTerm } from '@/services/highlights/explainTerm';
import { useAnalytics } from '@/utils/analytics';
import { useTranslation } from 'react-i18next';

interface ExplainTermModalProps {
  visible: boolean;
  term: string;
  lessonContext?: string;
  lessonId: string;
  onClose: () => void;
}

export default function ExplainTermModal({
  visible,
  term,
  lessonContext,
  lessonId,
  onClose,
}: ExplainTermModalProps) {
  const { t } = useTranslation();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { trackLessonAskAiUsed, trackLessonAskAiRetry } = useAnalytics();
  const requestIdRef = useRef(0);

  const fetchExplanation = async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setExplanation(null);

    try {
      const result = await explainTerm(term, lessonContext);
      if (currentRequestId !== requestIdRef.current) return;
      setExplanation(result);
    } catch (err: any) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(err.message || t('learn.explainTerm.errorFallback'));
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (visible && term) {
      fetchExplanation();
      trackLessonAskAiUsed(lessonId, term);
    }
    if (!visible) {
      // Bump requestId to cancel any in-flight request
      requestIdRef.current++;
      setExplanation(null);
      setError(null);
      setLoading(false);
    }
  }, [visible, term, lessonContext]);

  const handleRetry = () => {
    trackLessonAskAiRetry(lessonId);
    fetchExplanation();
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
              <Feather name='help-circle' size={18} color='#6B7280' />
              <Text style={styles.headerTitle}>
                {t('learn.explainTerm.title')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name='x' size={20} color='#9CA3AF' />
            </TouchableOpacity>
          </View>

          <View style={styles.termContainer}>
            <Text style={styles.termText}>"{term}"</Text>
          </View>

          <View style={styles.content}>
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size='small' color='#6B7280' />
                <Text style={styles.loadingText}>
                  {t('learn.explainTerm.gettingExplanation')}
                </Text>
              </View>
            )}

            {explanation && (
              <Text style={styles.explanationText}>{explanation}</Text>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                >
                  <Feather name='refresh-cw' size={14} color='#fff' />
                  <Text style={styles.retryButtonText}>
                    {t('learn.explainTerm.tryAgain')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    maxHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { ...typography.cardTitle, color: '#374151' },
  termContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  termText: { ...typography.cardTitle, color: '#111827', fontStyle: 'italic' },
  content: {
    minHeight: 60,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: { ...typography.secondary, color: '#6B7280' },
  explanationText: { ...typography.body, color: '#374151' },
  errorContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  errorText: { ...typography.secondary, color: '#EF4444', textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: { ...typography.button, color: '#fff' },
});
