import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

interface LessonProgressBarProps {
  completed: number;
  total: number;
}

const LessonProgressBar: React.FC<LessonProgressBarProps> = ({
  completed,
  total,
}) => {
  const { t } = useTranslation();
  const percentage = (completed / total) * 100;

  return (
    <View style={styles.container}>
      {/* Progress Text */}
      <Text style={styles.progressText}>
        {t('learn.lesson.progressLabel', {
          completed: `${completed}/${total}`,
        })}
      </Text>

      {/* Progress Bar Container */}
      <View style={styles.progressBarContainer}>
        {/* Gradient Progress Bar */}
        <ExpoLinearGradient
          colors={['#000000', '#888888']} // Gradient colors
          style={[styles.progressBar, { width: `${percentage}%` }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  progressText: { ...typography.cardTitle, color: '#333', marginBottom: 5 },
  progressBarContainer: {
    height: 10,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
});

export default LessonProgressBar;
