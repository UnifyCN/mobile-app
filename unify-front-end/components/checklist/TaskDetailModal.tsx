import { typography } from '@/constants/Typography';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ScrollView,
  I18nManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { UserTaskWithDetails } from '@/types/checklist';
import {
  PRIORITY_CONFIG,
  type PriorityConfig,
} from '@/constants/ChecklistPriority';
import { normalizeChecklistPriority } from '@/utils/checklistOrder';
import { squareTarget } from '@/utils/touchTarget';
import { formatRelativeTime } from '@/helpers/dateHelpers';
import { LinkedDescription } from './LinkedDescription';
import KeyboardAvoidingView from '@/components/common/KeyboardAvoidingView';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ANIM_IN_MS = 280;
const ANIM_OUT_MS = 220;
const CLOSE_TRANSLATE_THRESHOLD = 120;
const CLOSE_VELOCITY_THRESHOLD = 800;

interface TaskDetailModalProps {
  visible: boolean;
  task: UserTaskWithDetails | null;
  onClose: () => void;
  onLearnHow: () => void;
  onMarkComplete: () => void;
  isCustomTask?: boolean;
  onDeleteCustomTask?: () => void;
  onRemoveSuggestedTask?: () => void;
  /**
   * Task progress controls (mobile-app#361). When set, the sheet offers "Track
   * progress", which shows them in this same sheet instead of a second modal.
   */
  progressPanel?: React.ReactNode;
  /** Saved state label shown next to "Track progress", e.g. "Waiting". */
  progressSummary?: string | null;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  visible,
  task,
  onClose,
  onLearnHow,
  onMarkComplete,
  isCustomTask = false,
  onDeleteCustomTask,
  onRemoveSuggestedTask,
  progressPanel,
  progressSummary,
}) => {
  const [rendered, setRendered] = useState(visible);
  const [mode, setMode] = useState<'detail' | 'progress'>('detail');
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropProgress = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const latestVisibleRef = useRef(visible);
  const { t } = useTranslation();

  useEffect(() => {
    latestVisibleRef.current = visible;
    if (visible) {
      setRendered(true);
      translateY.value = withTiming(0, {
        duration: ANIM_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
      backdropProgress.value = withTiming(1, {
        duration: ANIM_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: ANIM_OUT_MS,
        easing: Easing.in(Easing.cubic),
      });
      backdropProgress.value = withTiming(
        0,
        { duration: ANIM_OUT_MS, easing: Easing.in(Easing.cubic) },
        finished => {
          if (finished && !latestVisibleRef.current) {
            runOnJS(setRendered)(false);
          }
        }
      );
    }
  }, [visible, translateY, backdropProgress]);

  // Each opening starts on the task details.
  useEffect(() => {
    if (visible) setMode('detail');
  }, [visible]);

  const panGesture = Gesture.Pan()
    .onUpdate(event => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        backdropProgress.value = interpolate(
          event.translationY,
          [0, SCREEN_HEIGHT * 0.6],
          [1, 0],
          Extrapolate.CLAMP
        );
      }
    })
    .onEnd(event => {
      const shouldClose =
        event.translationY > CLOSE_TRANSLATE_THRESHOLD ||
        event.velocityY > CLOSE_VELOCITY_THRESHOLD;
      if (shouldClose) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
        backdropProgress.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropProgress.value,
  }));

  if (!task || !rendered) return null;

  const priority: PriorityConfig =
    PRIORITY_CONFIG[normalizeChecklistPriority(task.task.priority)] ??
    PRIORITY_CONFIG['Do now'];
  const isCompleted = task.completed;
  const completedLabel =
    isCompleted && task.completed_at
      ? formatRelativeTime(task.completed_at)
      : null;
  const canShowLearnHow = !isCustomTask;

  const detailContent = (
    <View
      style={[
        styles.content,
        { paddingBottom: 24 + Math.max(insets.bottom, 8) },
      ]}
    >
      {/* Header row: priority pill + trash (custom only) */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.priorityPill,
            { backgroundColor: priority.backgroundColor },
          ]}
        >
          <MaterialIcons
            name={priority.icon}
            size={16}
            color={priority.color}
          />
          <Text style={[styles.priorityLabel, { color: priority.color }]}>
            {t(priority.labelKey)}
          </Text>
        </View>

        {((isCustomTask && onDeleteCustomTask) ||
          (!isCustomTask && onRemoveSuggestedTask)) && (
          <TouchableOpacity
            onPress={isCustomTask ? onDeleteCustomTask : onRemoveSuggestedTask}
            style={styles.trashButton}
            accessibilityRole='button'
            accessibilityLabel={t(
              isCustomTask
                ? 'checklist.deleteTask'
                : 'checklist.removeSuggestedTask'
            )}
            hitSlop={10}
          >
            <MaterialIcons
              name={isCustomTask ? 'delete-outline' : 'visibility-off'}
              size={22}
              color='#64748B'
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Title */}
      <Text style={styles.taskName}>{task.task.task_name}</Text>

      {/* Description */}
      <LinkedDescription
        style={styles.taskDescription}
        text={
          task.task.longer_description?.trim() || task.task.task_description
        }
      />

      {/* Completion timestamp */}
      {completedLabel && (
        <View style={styles.completedBanner}>
          <MaterialIcons name='check-circle' size={16} color='#059669' />
          <Text style={styles.completedBannerText}>
            {t('common.completedAgo', { time: completedLabel })}
          </Text>
        </View>
      )}

      {progressPanel ? (
        <TouchableOpacity
          style={styles.progressEntry}
          onPress={() => setMode('progress')}
          activeOpacity={0.8}
          accessibilityRole='button'
          accessibilityLabel={t('taskActions.progressButton')}
          accessibilityHint={progressSummary ?? undefined}
        >
          <MaterialIcons name='timeline' size={20} color='#0F172A' />
          <View style={styles.progressEntryText}>
            <Text style={styles.progressEntryTitle}>
              {t('taskActions.progressButton')}
            </Text>
            {progressSummary ? (
              <Text style={styles.progressEntrySummary}>{progressSummary}</Text>
            ) : null}
          </View>
          <MaterialIcons
            name='chevron-right'
            size={22}
            color='#64748B'
            style={I18nManager.isRTL ? styles.flipped : undefined}
          />
        </TouchableOpacity>
      ) : null}

      {/* Primary CTA */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          isCompleted && styles.primaryButtonCompleted,
        ]}
        onPress={onMarkComplete}
        activeOpacity={0.85}
        accessibilityRole='button'
      >
        <MaterialIcons
          name={isCompleted ? 'replay' : 'check'}
          size={20}
          color={isCompleted ? '#059669' : '#fff'}
        />
        <Text
          style={[
            styles.primaryButtonText,
            isCompleted && styles.primaryButtonTextCompleted,
          ]}
        >
          {isCompleted
            ? t('checklist.undoCompletion')
            : t('checklist.markAsComplete')}
        </Text>
      </TouchableOpacity>

      {/* Secondary: Learn how (sanity tasks only) */}
      {canShowLearnHow && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onLearnHow}
          activeOpacity={0.8}
          accessibilityRole='button'
        >
          <Text style={styles.secondaryButtonText}>
            {t('checklist.learnHow')}
          </Text>
          <MaterialIcons name='arrow-forward' size={18} color='#E03B3B' />
        </TouchableOpacity>
      )}
    </View>
  );

  const progressContent = (
    <View
      style={[
        styles.progressContent,
        { paddingBottom: 16 + Math.max(insets.bottom, 8) },
      ]}
    >
      <View style={styles.progressHeader}>
        <TouchableOpacity
          onPress={() => setMode('detail')}
          style={[styles.iconButton, squareTarget()]}
          accessibilityRole='button'
          accessibilityLabel={t('taskActions.backToDetails')}
        >
          <MaterialIcons
            name='chevron-left'
            size={26}
            color='#0F172A'
            style={I18nManager.isRTL ? styles.flipped : undefined}
          />
        </TouchableOpacity>
        <Text
          style={styles.progressHeading}
          accessibilityRole='header'
          numberOfLines={2}
        >
          {task.task.task_name}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.iconButton, squareTarget()]}
          accessibilityRole='button'
          accessibilityLabel={t('taskActions.close')}
        >
          <MaterialIcons name='close' size={22} color='#0F172A' />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.progressScroll}
        contentContainerStyle={styles.progressScrollContent}
        keyboardShouldPersistTaps='handled'
      >
        {progressPanel}
      </ScrollView>
    </View>
  );

  // The progress view scrolls, so only the detail view closes on a drag.
  const sheet = (
    <Animated.View
      style={[
        styles.sheet,
        mode === 'progress' && styles.sheetProgress,
        sheetStyle,
      ]}
    >
      <View style={styles.grabHandle} />
      {mode === 'detail' ? detailContent : progressContent}
    </Animated.View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType='none'
      statusBarTranslucent
      onRequestClose={mode === 'progress' ? () => setMode('detail') : onClose}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
            accessible={false}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior='padding'
          style={styles.keyboardArea}
          pointerEvents='box-none'
        >
          {mode === 'detail' ? (
            <GestureDetector gesture={panGesture}>{sheet}</GestureDetector>
          ) : (
            sheet
          )}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  keyboardArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  grabHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  priorityLabel: {
    ...typography.caption,
    letterSpacing: 0.2,
    fontWeight: '700',
  },
  trashButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  taskName: { ...typography.section, color: '#0F172A', marginBottom: 8 },
  taskDescription: {
    ...typography.secondary,
    color: '#475569',
    marginBottom: 20,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    marginBottom: 16,
  },
  completedBannerText: {
    ...typography.caption,
    color: '#166534',
    fontWeight: '600',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    marginBottom: 10,
  },
  primaryButtonCompleted: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  primaryButtonText: { ...typography.button, color: '#fff' },
  primaryButtonTextCompleted: {
    color: '#059669',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    width: '100%',
  },
  secondaryButtonText: { ...typography.button, color: '#E03B3B' },
  progressEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  progressEntryText: { flex: 1 },
  progressEntryTitle: {
    ...typography.secondary,
    fontWeight: '600',
    color: '#0F172A',
  },
  progressEntrySummary: { ...typography.caption, color: '#475569' },
  flipped: { transform: [{ scaleX: -1 }] },
  sheetProgress: { maxHeight: '92%' },
  progressContent: { flexShrink: 1, paddingTop: 4 },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressHeading: {
    ...typography.cardTitle,
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  progressScroll: { flexShrink: 1 },
  progressScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
});
