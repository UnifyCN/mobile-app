import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAnalytics } from '@/utils/analytics';
import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import { useDeadlines } from '@/hooks/checklist/useDeadlines';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';
import { setChecklistItemCompletion } from '@/services/checklist/setChecklistItemCompletion';
import {
  deleteCustomChecklistTask,
  setCustomChecklistTaskCompletion,
} from '@/services/checklist/customChecklistTasks';
import {
  createDeadline,
  deleteDeadline,
  setDeadlineCompletion,
  updateDeadline,
} from '@/services/checklist/deadlines';
import {
  cancelDeadlineReminders,
  ensureReminderPermission,
  getReminderPermission,
  scheduleDeadlineReminders,
  type ReminderPermission,
} from '@/services/push/deadlineReminders';
import { TaskDetailModal } from '@/components/checklist/TaskDetailModal';
import { DeadlineSheet } from '@/components/checklist/DeadlineSheet';
import {
  AddDeadlineSheet,
  type AddDeadlinePrefill,
} from '@/components/checklist/AddDeadlineSheet';
import { HorizonItemCard } from '@/components/checklist/HorizonItem';
import {
  HorizonSectionHeader,
  HORIZON_TITLE_KEY,
} from '@/components/checklist/HorizonSectionHeader';
import { supabase } from '@/lib/supabase';
import {
  ChecklistLinkTabSlug,
  UserTaskWithDetails,
} from '@/types/checklist';
import type { Deadline, DeadlineInput } from '@/types/deadlines';
import { getChecklistTaskOrderKey } from '@/utils/checklistOrder';
import {
  buildHorizonRows,
  daysUntil,
  leadingHorizon,
  parseLocalDate,
  MONTH_DAYS,
  WEEK_DAYS,
  type HorizonRow,
} from '@/utils/checklistHorizons';
import TabHeader from '@/components/home/HomeHeader';
import LoadingScreen from '@/components/LoadingScreen';

/**
 * Map checklist tab slug to (tabs) route for "Learn how" navigation.
 * Paths must match tab bar in app/(tabs)/_layout.tsx (Tabs.Screen name):
 * - Social, Gather (Community), companion, Checklist, Learn.
 */
const TAB_SLUG_TO_ROUTE: Record<ChecklistLinkTabSlug, string> = {
  home: '/(tabs)/Social',
  community: '/(tabs)/Gather',
  companion: '/(tabs)/companion',
  checklist: '/(tabs)/Checklist',
  learn: '/(tabs)/Learn',
};

/** Optional aliases if Sanity uses different slug values (e.g. gather → community) */
const TAB_SLUG_ALIASES: Record<string, ChecklistLinkTabSlug> = {
  gather: 'community',
  index: 'home',
  social: 'home',
};

const STAGE_KEYS: Record<number, string> = {
  0: 'checklist.stage.0',
  1: 'checklist.stage.1',
  2: 'checklist.stage.2',
  3: 'checklist.stage.3',
  4: 'checklist.stage.4',
};

const PERSONA_KEYS: Record<string, string> = {
  international_student: 'checklist.persona.international_student',
  refugee: 'checklist.persona.refugee',
  protected_person: 'checklist.persona.protected_person',
  skilled_worker: 'checklist.persona.skilled_worker',
  immigrant: 'checklist.persona.immigrant',
  pr: 'checklist.persona.pr',
};

export default function ChecklistScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ deadlineId?: string }>();
  const {
    trackScreen,
    trackChecklistTaskCompleted,
    trackChecklistTaskUncompleted,
    trackChecklistCustomTaskDeleted,
    trackDeadlineCreated,
    trackDeadlineUpdated,
    trackDeadlineCompleted,
    trackDeadlineUncompleted,
    trackDeadlineDeleted,
    trackDeadlineRemindersScheduled,
  } = useAnalytics();
  const {
    currentStage,
    stageChanged,
    isLoading: stageLoading,
  } = useUserStage();
  const [persona, setPersona] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [selectedTask, setSelectedTask] = useState<UserTaskWithDetails | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState<Deadline | null>(null);
  const [deadlineSheetVisible, setDeadlineSheetVisible] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddDeadlinePrefill | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  const [confettiKey, setConfettiKey] = useState<number | null>(null);
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [today, setToday] = useState(() => new Date());
  const openedFromParamRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const fetchPersona = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const profile = await getOnboardingProfile(user.id);
          setPersona(profile?.persona || null);
        }
      } catch (error) {
        console.error('Error fetching persona:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };
    fetchPersona();
  }, []);

  const {
    tasks,
    isLoading: tasksLoading,
    refetch,
    setTasks,
  } = useChecklistTasks({ currentStage, stageChanged, persona });

  const {
    userId,
    deadlines,
    isLoading: deadlinesLoading,
    setDeadlines,
    refetch: refetchDeadlines,
  } = useDeadlines();

  // Refetch when Checklist tab is focused so new/updated Sanity tasks show up,
  // and re-anchor "today" so day counts stay right across midnight.
  useFocusEffect(
    useCallback(() => {
      trackScreen('Checklist');
      setToday(new Date());
      getReminderPermission().then(setPermission).catch(() => undefined);
      if (currentStage !== null && persona) refetch();
      refetchDeadlines();
    }, [currentStage, persona, refetch, refetchDeadlines, trackScreen])
  );

  // Opened from a reminder notification: show that deadline's sheet once.
  useEffect(() => {
    const id = params.deadlineId;
    if (!id || openedFromParamRef.current === id || deadlines.length === 0) return;
    const d = deadlines.find(x => String(x.id) === id);
    if (d) {
      openedFromParamRef.current = id;
      setSelectedDeadline(d);
      setDeadlineSheetVisible(true);
    }
  }, [params.deadlineId, deadlines]);

  const rows = useMemo(
    () => buildHorizonRows(tasks, deadlines, today),
    [tasks, deadlines, today]
  );
  const lead = useMemo(() => leadingHorizon(rows), [rows]);

  const totalItems = tasks.length + deadlines.length;
  const completedItems =
    tasks.filter(x => x.completed).length + deadlines.filter(x => x.completed).length;
  const progressPercent = totalItems > 0 ? completedItems / totalItems : 0;

  const isLoading = stageLoading || isLoadingProfile || tasksLoading || deadlinesLoading;
  const tabBarHeight = useBottomTabBarHeight();

  const formatDate = useCallback(
    (iso: string) =>
      parseLocalDate(iso).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [i18n.language]
  );

  const reminderCopy = useCallback(
    (d: Deadline) => ({
      title: (n: number) =>
        n === 7
          ? t('checklist.deadline.reminderTitleWeek', { title: d.title })
          : t('checklist.deadline.reminderTitle', { title: d.title, n }),
      body: t('checklist.deadline.reminderBody', { date: formatDate(d.due_date) }),
    }),
    [t, formatDate]
  );

  /* ---------- task sheet ---------- */
  const handleTaskPress = useCallback((task: UserTaskWithDetails) => {
    setSelectedTask(task);
    setModalVisible(true);
  }, []);
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedTask(null);
  }, []);

  const handleLearnHow = () => {
    if (!selectedTask?.task) {
      handleCloseModal();
      return;
    }
    const { linkTab, linkModuleId, linkSubmoduleId } = selectedTask.task;
    handleCloseModal();
    const resolvedTab = linkTab && (TAB_SLUG_ALIASES[linkTab] ?? linkTab);
    if (resolvedTab && TAB_SLUG_TO_ROUTE[resolvedTab]) {
      router.push(TAB_SLUG_TO_ROUTE[resolvedTab] as any);
    } else if (linkSubmoduleId && linkModuleId) {
      router.push(`/(tabs)/Learn/modules/${linkModuleId}/${linkSubmoduleId}` as any);
    } else if (linkModuleId) {
      router.push(`/(tabs)/Learn/modules/${linkModuleId}` as any);
    } else {
      router.push('/(tabs)/Learn');
    }
  };

  const celebrate = () => {
    if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    setConfettiKey(Date.now());
    confettiTimeoutRef.current = setTimeout(() => {
      setConfettiKey(null);
      confettiTimeoutRef.current = null;
    }, 1800);
  };

  const handleMarkComplete = async () => {
    if (!selectedTask) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newCompletedStatus = !selectedTask.completed;
      const completedAt = newCompletedStatus ? new Date().toISOString() : null;

      setTasks(prev =>
        prev.map(task => {
          const isTarget =
            selectedTask.source === 'custom'
              ? task.custom_task_id === selectedTask.custom_task_id
              : task.sanity_checklist_id === selectedTask.sanity_checklist_id;
          return isTarget
            ? { ...task, completed: newCompletedStatus, completed_at: completedAt }
            : task;
        })
      );
      setSelectedTask({ ...selectedTask, completed: newCompletedStatus, completed_at: completedAt });

      const taskTitle = selectedTask.task?.task_name || 'Unknown';
      const taskPriority = selectedTask.task?.priority || 'Unknown';
      const taskSource = selectedTask.source === 'custom' ? 'custom' : 'sanity';
      if (newCompletedStatus) {
        trackChecklistTaskCompleted(taskTitle, taskPriority, taskSource);
        handleCloseModal();
        celebrate();
      } else {
        trackChecklistTaskUncompleted(taskTitle, taskPriority, taskSource);
      }

      if (selectedTask.source === 'custom' && selectedTask.custom_task_id) {
        await setCustomChecklistTaskCompletion({
          userId: user.id,
          customTaskId: selectedTask.custom_task_id,
          completed: newCompletedStatus,
        });
      } else if (selectedTask.sanity_checklist_id) {
        await setChecklistItemCompletion(
          user.id,
          selectedTask.sanity_checklist_id,
          newCompletedStatus
        );
      }
    } catch (error) {
      console.error('Error updating task completion:', error);
      refetch();
    }
  };

  const handleDeleteCustomTask = () => {
    if (!selectedTask || selectedTask.source !== 'custom') return;
    const customTaskId = selectedTask.custom_task_id;
    if (!customTaskId) return;

    Alert.alert(t('checklist.deleteItemTitle'), t('checklist.deleteItemMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const prevTasks = tasks;
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;
            setTasks(prev => prev.filter(task => task.custom_task_id !== customTaskId));
            handleCloseModal();
            trackChecklistCustomTaskDeleted();
            await deleteCustomChecklistTask({ userId: user.id, customTaskId });
          } catch (error) {
            console.error('Error deleting custom checklist task:', error);
            setTasks(prevTasks);
            refetch();
          }
        },
      },
    ]);
  };

  /* ---------- deadlines ---------- */
  const openAdd = useCallback((prefill: AddDeadlinePrefill | null) => {
    setAddPrefill(prefill);
    setAddVisible(true);
  }, []);

  const openSetDateForTask = useCallback(
    (task: UserTaskWithDetails) => {
      const key = getChecklistTaskOrderKey(task);
      const existing = deadlines.find(d => d.linked_task_key === key);
      setModalVisible(false);
      setSelectedTask(null);
      openAdd(
        existing
          ? { deadline: existing }
          : { linkedTaskKey: key, linkedTaskTitle: task.task.task_name }
      );
    },
    [deadlines, openAdd]
  );

  const scheduleFor = useCallback(
    async (d: Deadline) => {
      const perm = await ensureReminderPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        trackDeadlineRemindersScheduled(0, perm);
        return;
      }
      try {
        const n = await scheduleDeadlineReminders(d, reminderCopy(d));
        trackDeadlineRemindersScheduled(n, perm);
      } catch (err) {
        console.error('Failed to schedule deadline reminders:', err);
      }
    },
    [reminderCopy, trackDeadlineRemindersScheduled]
  );

  const handleSaveDeadline = async (input: DeadlineInput) => {
    if (!userId) return;
    setSaving(true);
    try {
      const editing = addPrefill?.deadline;
      let saved: Deadline;
      if (editing) {
        saved = await updateDeadline(userId, editing.id, {
          kind: input.kind,
          title: input.title,
          due_date: input.due_date,
        });
        setDeadlines(prev => prev.map(d => (d.id === saved.id ? saved : d)));
        trackDeadlineUpdated(saved.kind, daysUntil(saved.due_date, today));
      } else {
        saved = await createDeadline(userId, input);
        setDeadlines(prev => [...prev, saved]);
        trackDeadlineCreated(
          saved.kind,
          daysUntil(saved.due_date, today),
          !!saved.linked_task_key
        );
      }
      setAddVisible(false);
      setAddPrefill(null);
      if (selectedDeadline?.id === saved.id) setSelectedDeadline(saved);
      await scheduleFor(saved);
    } catch (err) {
      console.error('Failed to save deadline:', err);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      refetchDeadlines();
    } finally {
      setSaving(false);
    }
  };

  const handleDeadlinePress = useCallback((d: Deadline) => {
    setSelectedDeadline(d);
    setDeadlineSheetVisible(true);
  }, []);

  const closeDeadlineSheet = useCallback(() => {
    setDeadlineSheetVisible(false);
    setSelectedDeadline(null);
  }, []);

  const handleToggleDeadlineDone = async () => {
    if (!selectedDeadline || !userId) return;
    const next = !selectedDeadline.completed;
    const updated: Deadline = {
      ...selectedDeadline,
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
    };
    setDeadlines(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setSelectedDeadline(updated);
    try {
      await setDeadlineCompletion(userId, updated.id, next);
      if (next) {
        trackDeadlineCompleted(updated.kind, daysUntil(updated.due_date, today));
        closeDeadlineSheet();
        celebrate();
        await cancelDeadlineReminders(updated.id);
      } else {
        trackDeadlineUncompleted(updated.kind);
        await scheduleFor(updated);
      }
    } catch (err) {
      console.error('Failed to update deadline:', err);
      refetchDeadlines();
    }
  };

  const handleDeleteDeadline = () => {
    if (!selectedDeadline || !userId) return;
    const target = selectedDeadline;
    Alert.alert(t('checklist.deadline.deleteTitle'), t('checklist.deadline.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeadlines(prev => prev.filter(d => d.id !== target.id));
          closeDeadlineSheet();
          try {
            await deleteDeadline(userId, target.id);
            trackDeadlineDeleted(target.kind);
            await cancelDeadlineReminders(target.id);
          } catch (err) {
            console.error('Failed to delete deadline:', err);
            refetchDeadlines();
          }
        },
      },
    ]);
  };

  /* ---------- render ---------- */
  const renderRow = useCallback(
    ({ item: row, index }: { item: HorizonRow; index: number }) => {
      if (row.type === 'header') {
        // The screen title already names the leading horizon; a second
        // "This week" three lines below it reads as a mistake.
        if (index === 0 && row.horizon === lead) return null;
        return (
          <HorizonSectionHeader
            horizon={row.horizon}
            completedCount={row.completedCount}
            totalCount={row.totalCount}
            today={today}
          />
        );
      }
      if (row.type === 'empty') {
        return (
          <View style={styles.caughtUp}>
            <MaterialIcons name='check-circle-outline' size={20} color='#2E9E5B' />
            <View style={styles.caughtUpText}>
              <Text style={styles.caughtUpTitle}>{t('checklist.horizons.caughtUp')}</Text>
              <Text style={styles.caughtUpHint}>{t('checklist.horizons.caughtUpHint')}</Text>
            </View>
          </View>
        );
      }
      const { item } = row;
      if (item.kind === 'deadline') {
        return (
          <HorizonItemCard item={item} onPress={() => handleDeadlinePress(item.deadline)} />
        );
      }
      return (
        <HorizonItemCard
          item={item}
          onPress={() => handleTaskPress(item.task)}
          onSetDate={() => openSetDateForTask(item.task)}
        />
      );
    },
    [today, t, lead, handleDeadlinePress, handleTaskPress, openSetDateForTask]
  );

  if (isLoading) return <LoadingScreen />;

  const stageDescription =
    currentStage !== null
      ? t(STAGE_KEYS[currentStage as keyof typeof STAGE_KEYS] || 'common.stageNotSet')
      : t('common.stageNotSet');
  const personaDisplay = persona
    ? t(PERSONA_KEYS[persona as keyof typeof PERSONA_KEYS] || 'common.user')
    : t('common.user');

  if (currentStage === null) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t('checklist.title')}</Text>
            </View>
            <Text style={styles.subtitle}>{t('checklist.onboardingRequired')}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const leadHeader = rows[0]?.type === 'header' && rows[0].horizon === lead ? rows[0] : null;
  const fmtShort = (d: Date) =>
    d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
  const addDays = (n: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const leadRange = leadHeader
    ? lead === 'week'
      ? `${fmtShort(today)} – ${fmtShort(addDays(WEEK_DAYS))}`
      : lead === 'month'
        ? t('checklist.horizons.until', { date: fmtShort(addDays(MONTH_DAYS)) })
        : null
    : null;
  const leadCount =
    leadHeader && leadHeader.totalCount > 0
      ? `${leadHeader.completedCount}/${leadHeader.totalCount}`
      : null;

  const selectedTaskKey = selectedTask ? getChecklistTaskOrderKey(selectedTask) : null;
  const selectedTaskDate = selectedTaskKey
    ? deadlines.find(d => d.linked_task_key === selectedTaskKey)
    : undefined;

  const ListHeader = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole='header'>
          {t(HORIZON_TITLE_KEY[lead])}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => openAdd(null)}
          activeOpacity={0.8}
          accessibilityRole='button'
          accessibilityLabel={t('checklist.deadline.addTitle')}
        >
          <MaterialIcons name='add' size={18} color='#fff' />
          <Text style={styles.addButtonLabel}>{t('common.add')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        {personaDisplay} · {stageDescription}
      </Text>
      {leadRange && (
        <Text style={styles.leadRange}>
          {leadRange}
          {leadCount ? `  ·  ${leadCount}` : ''}
        </Text>
      )}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progressPercent * 100}%` }]} />
      </View>
      {deadlines.length === 0 && (
        <TouchableOpacity
          style={styles.emptyBanner}
          onPress={() => openAdd(null)}
          activeOpacity={0.8}
          accessibilityRole='button'
        >
          <MaterialIcons name='event' size={20} color='#7C2D12' />
          <View style={styles.emptyBannerText}>
            <Text style={styles.emptyBannerTitle}>{t('checklist.deadline.emptyTitle')}</Text>
            <Text style={styles.emptyBannerBody}>{t('checklist.deadline.emptyBody')}</Text>
            <Text style={styles.emptyBannerCta}>{t('checklist.deadline.emptyCta')} →</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  const ListFooter = (
    <View>
      <TouchableOpacity
        style={styles.addOwnRow}
        onPress={() => router.push('/(tabs)/Checklist/create-custom-item' as any)}
        activeOpacity={0.7}
        accessibilityRole='button'
      >
        <MaterialIcons name='add-circle-outline' size={22} color='#6B6B6B' />
        <Text style={styles.addOwnRowText}>{t('checklist.addYourOwnItem')}</Text>
      </TouchableOpacity>
      {tasks.length === 0 && deadlines.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('checklist.noTasksAvailable')}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <TabHeader variant='minimal' />
      <FlatList
        data={rows}
        keyExtractor={row => row.key}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      />

      <TaskDetailModal
        visible={modalVisible}
        task={selectedTask}
        onClose={handleCloseModal}
        onLearnHow={handleLearnHow}
        onMarkComplete={handleMarkComplete}
        isCustomTask={selectedTask?.source === 'custom'}
        onDeleteCustomTask={handleDeleteCustomTask}
        linkedDateLabel={selectedTaskDate ? formatDate(selectedTaskDate.due_date) : null}
        onSetDate={selectedTask ? () => openSetDateForTask(selectedTask) : undefined}
      />

      <DeadlineSheet
        visible={deadlineSheetVisible}
        deadline={selectedDeadline}
        permission={permission}
        onClose={closeDeadlineSheet}
        onToggleDone={handleToggleDeadlineDone}
        onEditDate={() => {
          if (!selectedDeadline) return;
          const d = selectedDeadline;
          closeDeadlineSheet();
          openAdd({ deadline: d });
        }}
        onDelete={handleDeleteDeadline}
      />

      <AddDeadlineSheet
        visible={addVisible}
        prefill={addPrefill}
        saving={saving}
        onClose={() => {
          setAddVisible(false);
          setAddPrefill(null);
        }}
        onSave={handleSaveDeadline}
        onAddTaskInstead={() => {
          setAddVisible(false);
          setAddPrefill(null);
          router.push('/(tabs)/Checklist/create-custom-item' as any);
        }}
      />

      {confettiKey !== null && (
        <View pointerEvents='none' style={StyleSheet.absoluteFill}>
          <ConfettiCannon
            key={confettiKey}
            count={120}
            origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
            fadeOut
            autoStart
            explosionSpeed={350}
            fallSpeed={1500}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  header: { marginBottom: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#000', flexShrink: 1 },
  subtitle: { fontSize: 15, color: '#6B6B6B', marginTop: 2 },
  leadRange: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButtonLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  progressContainer: {
    height: 6,
    backgroundColor: '#eaeaea',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 6,
  },
  progressBar: { height: '100%', backgroundColor: '#2E9E5B', borderRadius: 5 },
  emptyBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  emptyBannerText: { flex: 1 },
  emptyBannerTitle: { fontSize: 15, fontWeight: '700', color: '#7C2D12' },
  emptyBannerBody: { fontSize: 13, color: '#7C2D12', lineHeight: 18, marginTop: 2 },
  emptyBannerCta: { fontSize: 13, fontWeight: '700', color: '#7C2D12', marginTop: 6 },
  caughtUp: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D6D5D5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  caughtUpText: { flex: 1 },
  caughtUpTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  caughtUpHint: { fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  addOwnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  addOwnRowText: { fontSize: 15, color: '#6B6B6B', fontWeight: '500' },
  emptyContainer: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#A0AEC0', textAlign: 'center' },
});
