import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
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
import { formatRelativeTime } from '@/helpers/dateHelpers';

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
  /** Checklist 2.0: a date the user attached to this task, already formatted. */
  linkedDateLabel?: string | null;
  onSetDate?: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  visible,
  task,
  onClose,
  onLearnHow,
  onMarkComplete,
  isCustomTask = false,
  onDeleteCustomTask,
  linkedDateLabel = null,
  onSetDate,
}) => {
  const [rendered, setRendered] = useState(visible);
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

  return (
    <Modal
      visible={rendered}
      transparent
      animationType='none'
      statusBarTranslucent
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.grabHandle} />

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
                    {priority.label}
                  </Text>
                </View>

                {isCustomTask && onDeleteCustomTask && (
                  <TouchableOpacity
                    onPress={onDeleteCustomTask}
                    style={styles.trashButton}
                    accessibilityRole='button'
                    accessibilityLabel='Delete task'
                    hitSlop={10}
                  >
                    <MaterialIcons
                      name='delete-outline'
                      size={22}
                      color='#64748B'
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Title */}
              <Text style={styles.taskName}>{task.task.task_name}</Text>

              {/* Description */}
              <Text style={styles.taskDescription}>
                {task.task.longer_description?.trim() ||
                  task.task.task_description}
              </Text>

              {/* Completion timestamp */}
              {completedLabel && (
                <View style={styles.completedBanner}>
                  <MaterialIcons
                    name='check-circle'
                    size={16}
                    color='#059669'
                  />
                  <Text style={styles.completedBannerText}>
                    {t('common.completedAgo', { time: completedLabel })}
                  </Text>
                </View>
              )}

              {/* Checklist 2.0: date row */}
              {onSetDate && (
                <TouchableOpacity
                  style={styles.dateRow}
                  onPress={onSetDate}
                  accessibilityRole='button'
                  activeOpacity={0.7}
                >
                  <MaterialIcons name='event' size={18} color='#64748B' />
                  <Text style={styles.dateRowLabel}>
                    {t('checklist.deadline.dateLabel')}
                  </Text>
                  <Text style={styles.dateRowValue}>
                    {linkedDateLabel ?? t('checklist.deadline.setDate')}
                  </Text>
                </TouchableOpacity>
              )}

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
                  {isCompleted ? t('checklist.undoCompletion') : t('checklist.markAsComplete')}
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
                  <Text style={styles.secondaryButtonText}>{t('checklist.learnHow')}</Text>
                  <MaterialIcons
                    name='arrow-forward'
                    size={18}
                    color='#E03B3B'
                  />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </GestureDetector>
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  trashButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  taskName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    lineHeight: 28,
  },
  taskDescription: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    marginTop: 4,
  },
  dateRowLabel: { fontSize: 15, color: '#6B6B6B' },
  dateRowValue: {
    marginLeft: 'auto',
    fontSize: 15,
    fontWeight: '600',
    color: '#F68B26',
  },
  primaryButtonCompleted: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
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
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E03B3B',
  },
});
