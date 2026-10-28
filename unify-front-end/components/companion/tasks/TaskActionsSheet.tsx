import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import KeyboardAvoidingView from '@/components/common/KeyboardAvoidingView';
import { typography } from '@/constants/Typography';
import { Theme } from '@/constants/Theme';
import { useRefreshingToday } from '@/hooks/checklist/useRefreshingToday';
import { useChecklistProfile } from '@/hooks/checklist/useChecklistProfile';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import { useUserStage } from '@/hooks/onboarding/useUserStage';
import {
  progressFor,
  useTaskActionPhase,
  useTaskActionStore,
  useTaskProgress,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import type { TaskState } from '@/services/companionActions/contract';
import { isUnresolved } from '@/services/companionActions/taskActionStore';
import { getChecklistTaskOrderKey } from '@/utils/checklistOrder';
import { minTarget, squareTarget } from '@/utils/touchTarget';
import { useChecklistTaskTitles } from '@/hooks/checklist/useChecklistTaskTitles';
import { TaskProposalPanel } from './TaskProposalPanel';
import { StepProposalPanel } from './StepProposalPanel';
import { useStepProposal } from '@/hooks/companion/useTaskActions';
import { PlanPanel } from '../plans/PlanPanel';
import type { PlanTarget } from '../plans/PlanEntry';
import { TaskStatePanel } from './TaskStatePanel';

const STATE_ORDER: TaskState[] = [
  'in_progress',
  'waiting',
  'not_started',
  'completed',
];
const INK = '#0F172A';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';

interface TaskActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Open on the review of one task draft (#363) instead of the task list. */
  proposalId?: string | null;
  /** #365: the draft is a change to an existing task, not a new task. */
  proposalKind?: 'task_create' | 'task_edit';
  /** Open straight on one task, e.g. one a command added (#363). */
  initialTask?: { taskRef: string; title: string } | null;
  /** #366: open on the review of suggested steps for one task. */
  stepProposalId?: string | null;
  /** Open on a settlement plan draft or saved plan (#364). */
  plan?: PlanTarget | null;
  /** A task row of the plan was opened (#364). */
  onOpenTask?: (taskRef: string, title: string) => void;
}

/**
 * Direction B bottom sheet for Companion (mobile-app#361): the account's Checklist
 * tasks with their saved state, and the task controls of one task. The
 * conversation and its typed message stay mounted behind it. Closing never
 * cancels a save; the action store keeps an unresolved write for the next visit.
 */
export function TaskActionsSheet({
  visible,
  onClose,
  proposalId = null,
  proposalKind = 'task_create',
  initialTask = null,
  stepProposalId = null,
  plan = null,
  onOpenTask,
}: TaskActionsSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const initialRef = initialTask?.taskRef ?? null;
  useEffect(() => {
    if (visible) setSelectedRef(initialRef);
  }, [visible, initialRef]);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (!cancelled) setReduceMotion(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const back = () => setSelectedRef(null);
  // Opened on a draft or one task: there is no list to go back to.
  const canGoBack =
    Boolean(selectedRef) &&
    !proposalId &&
    !stepProposalId &&
    !initialRef &&
    !plan;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      statusBarTranslucent
      onRequestClose={canGoBack ? back : onClose}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
        >
          <View style={styles.backdrop} />
        </Pressable>
        <KeyboardAvoidingView
          behavior='padding'
          style={styles.keyboardArea}
          pointerEvents='box-none'
        >
          <View
            testID='companion-task-sheet'
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.grabHandle} />
            <View style={styles.header}>
              {canGoBack ? (
                <Pressable
                  onPress={back}
                  style={[styles.iconButton, squareTarget()]}
                  accessibilityRole='button'
                  accessibilityLabel={t('taskActions.backToTasks')}
                >
                  <MaterialIcons
                    name='chevron-left'
                    size={26}
                    color={INK}
                    style={I18nManager.isRTL ? styles.flipped : undefined}
                  />
                </Pressable>
              ) : (
                <View style={[styles.iconButton, squareTarget()]} />
              )}
              <Text style={styles.heading} accessibilityRole='header'>
                {stepProposalId
                  ? t('taskSteps.reviewTitle')
                  : plan
                  ? 'proposalId' in plan
                    ? t('plans.reviewTitle')
                    : t('plans.planTitle')
                  : proposalId
                  ? proposalKind === 'task_edit'
                    ? t('taskEdit.drawerTitle')
                    : t('taskCreate.drawerTitle')
                  : selectedRef
                    ? t('taskActions.drawerTitle')
                    : t('taskActions.listTitle')}
              </Text>
              <Pressable
                onPress={onClose}
                style={[styles.iconButton, squareTarget()]}
                accessibilityRole='button'
                accessibilityLabel={t('taskActions.close')}
              >
                <MaterialIcons name='close' size={22} color={INK} />
              </Pressable>
            </View>
            {visible && stepProposalId ? (
              <StepProposalBody proposalId={stepProposalId} />
            ) : visible && plan ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps='handled'
              >
                <PlanPanel
                  target={plan}
                  onOpenTask={(taskRef, title) => onOpenTask?.(taskRef, title)}
                />
              </ScrollView>
            ) : visible && proposalId ? (
              <ProposalBody proposalId={proposalId} />
            ) : visible ? (
              <SheetBody
                selectedRef={selectedRef}
                fallbackTitle={
                  initialTask && initialTask.taskRef === selectedRef
                    ? initialTask.title
                    : null
                }
                onSelect={setSelectedRef}
                onOpenChecklist={onClose}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ProposalBody({ proposalId }: { proposalId: string }) {
  const view = useTaskProgress();
  const store = useTaskActionStore('companion');
  const titles = useChecklistTaskTitles();
  const titleFor = (taskRef: string) => titles.get(taskRef) ?? null;
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps='handled'
    >
      <TaskProposalPanel
        proposalId={proposalId}
        view={view}
        store={store}
        titleFor={titleFor}
      />
    </ScrollView>
  );
}

function StepProposalBody({ proposalId }: { proposalId: string }) {
  const view = useTaskProgress();
  const store = useTaskActionStore('companion');
  const titles = useChecklistTaskTitles();
  const draft = useStepProposal(proposalId);
  const taskRef = draft.data?.operation.task_ref;
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps='handled'
    >
      <StepProposalPanel
        proposalId={proposalId}
        view={view}
        store={store}
        taskTitle={taskRef ? (titles.get(taskRef) ?? null) : null}
      />
    </ScrollView>
  );
}

function SheetBody({
  selectedRef,
  fallbackTitle,
  onSelect,
  onOpenChecklist,
}: {
  selectedRef: string | null;
  /** The title to show when the Checklist read does not have the task yet. */
  fallbackTitle: string | null;
  onSelect: (taskRef: string) => void;
  onOpenChecklist: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const view = useTaskProgress();
  const store = useTaskActionStore('companion');
  const today = useRefreshingToday();
  const {
    currentStage,
    stageChanged,
    isLoading: stageLoading,
  } = useUserStage(today);
  const {
    persona,
    province,
    isLoading: profileLoading,
  } = useChecklistProfile();
  // The same query and cache as the Checklist screen: one task identity.
  const { tasks, isLoading: tasksLoading } = useChecklistTasks({
    currentStage,
    stageChanged,
    persona,
    isStageLoading: stageLoading,
    province,
  });

  const active = useMemo(
    () => tasks.filter(task => !task.dismissed_at),
    [tasks]
  );
  const selected = active.find(
    task => getChecklistTaskOrderKey(task) === selectedRef
  );
  const phase = useTaskActionPhase(store, selectedRef);
  const selectedTitle = selected?.task.task_name ?? fallbackTitle;

  if (
    view.status === 'loading' ||
    stageLoading ||
    profileLoading ||
    tasksLoading
  ) {
    return (
      <Text style={styles.message} accessibilityLiveRegion='polite'>
        {t('taskActions.loading')}
      </Text>
    );
  }
  if (view.status === 'signed_out') {
    return <Text style={styles.message}>{t('taskActions.signedOut')}</Text>;
  }
  if (view.status === 'unavailable') {
    return <Text style={styles.message}>{t('taskActions.unavailable')}</Text>;
  }

  if (selectedRef && selectedTitle !== null) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps='handled'
      >
        <Text style={styles.eyebrow}>{t('taskActions.existingTask')}</Text>
        <Text style={styles.taskTitle} accessibilityRole='header'>
          {selectedTitle}
        </Text>
        <TaskStatePanel taskRef={selectedRef} view={view} store={store} />
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={t('taskActions.openChecklist')}
          // Leaving while a save is unresolved is allowed: the store keeps it.
          accessibilityHint={
            isUnresolved(phase) ? t('taskActions.checking') : undefined
          }
          onPress={() => {
            onOpenChecklist();
            router.push('/(tabs)/Checklist');
          }}
          style={({ pressed }) => [
            styles.link,
            { minHeight: minTarget() },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.linkText}>{t('taskActions.openChecklist')}</Text>
          <MaterialIcons
            name='chevron-right'
            size={20}
            color={LINK}
            style={I18nManager.isRTL ? styles.flipped : undefined}
          />
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <TaskList
      tasks={active.map(task => ({
        taskRef: getChecklistTaskOrderKey(task),
        title: task.task.task_name,
      }))}
      view={view}
      onSelect={onSelect}
    />
  );
}

function TaskList({
  tasks,
  view,
  onSelect,
}: {
  tasks: { taskRef: string; title: string }[];
  view: TaskProgressView;
  onSelect: (taskRef: string) => void;
}) {
  const { t } = useTranslation();
  const rows = tasks
    .map(task => ({ ...task, state: progressFor(task.taskRef, view).state }))
    .sort(
      (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)
    );

  if (rows.length === 0) {
    return <Text style={styles.message}>{t('taskActions.noTasks')}</Text>;
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.listContent}
    >
      {view.stale ? (
        <Text style={styles.message}>{t('taskActions.offline')}</Text>
      ) : null}
      {rows.map(row => {
        const stateLabel = t(`taskActions.state.${row.state}`);
        return (
          <Pressable
            key={row.taskRef}
            onPress={() => onSelect(row.taskRef)}
            accessibilityRole='button'
            accessibilityLabel={`${row.title}, ${stateLabel}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowState}>{stateLabel}</Text>
            </View>
            <MaterialIcons
              name='chevron-right'
              size={22}
              color={INK_MUTED}
              style={I18nManager.isRTL ? styles.flipped : undefined}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const LINK = '#9A4A00';

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Theme.white,
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
    backgroundColor: BORDER,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    ...typography.cardTitle,
    color: INK,
    flex: 1,
    textAlign: 'center',
  },
  flipped: { transform: [{ scaleX: -1 }] },
  scroll: { flexShrink: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  listContent: { paddingHorizontal: 16, paddingVertical: 8 },
  message: {
    ...typography.secondary,
    color: INK_MUTED,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  eyebrow: { ...typography.caption, color: INK_MUTED },
  taskTitle: { ...typography.section, color: INK, marginTop: -8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  rowState: { ...typography.caption, color: INK_MUTED },
  pressed: { opacity: 0.7 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  linkText: { ...typography.secondary, fontWeight: '600', color: LINK },
});
