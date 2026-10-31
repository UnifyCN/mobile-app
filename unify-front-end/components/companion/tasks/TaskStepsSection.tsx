import { LiveText as Text } from '@/components/common/LiveText';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { Theme } from '@/constants/Theme';
import {
  STEP_TITLE_MAX,
  setStateOperation,
  stepCreateOperation,
  stepDoneOperation,
  stepRemoveOperation,
  stepUpdateOperation,
  type TaskProgress,
  type TaskState,
  type TaskStep,
} from '@/services/companionActions/contract';
import {
  isUnresolved,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import {
  stepsFor,
  useTaskActionDraft,
  useTaskActionPhase,
  type TaskProgressView,
} from '@/hooks/companion/useTaskActions';
import { minTarget, squareTarget } from '@/utils/touchTarget';
import { ReceiptBlock } from './ReceiptBlock';
import { PhaseMessage } from './TaskStatePanel';

const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const INK_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE_MUTED = '#F8FAFC';
const ACCENT = Theme.primaryGatherRed;
const ACCENT_STRONG = '#9A4A00';
const ACCENT_BG = '#FFF4E8';

/** Store keys: the task's own step list (add, remove) and one step (check, rename). */
export const stepsKey = (taskRef: string) => `steps:${taskRef}`;
export const stepKey = (stepId: string) => `step:${stepId}`;
const newStepDraftKey = (taskRef: string) => `step-new:${taskRef}`;
const editDraftKey = (stepId: string) => `step-edit:${stepId}`;

interface TaskStepsSectionProps {
  taskRef: string;
  progress: TaskProgress;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** A connection, a fresh read and a live task. */
  writable: boolean;
}

/**
 * One level of tracked steps under one Checklist task (mobile-app#366). Each control
 * authorizes exactly its own change: check, add the typed step, rename, or remove
 * after confirmation. Checking every step never completes the task; it offers an
 * explicit completion instead. A completed task keeps its steps as they were.
 * Typed text lives in the action store, so close, reopen and updates keep it.
 */
export function TaskStepsSection({
  taskRef,
  progress,
  view,
  store,
  writable,
}: TaskStepsSectionProps) {
  const { t } = useTranslation();
  const steps = stepsFor(taskRef, view);
  const listPhase = useTaskActionPhase(store, stepsKey(taskRef));
  const taskPhase = useTaskActionPhase(store, taskRef);
  const newStep = useTaskActionDraft(store, newStepDraftKey(taskRef)) ?? '';
  const done = steps.filter(s => s.done).length;
  const completed = progress.state === 'completed';
  // Steps of a completed task are its history: read only until it is reopened.
  const canEdit = writable && !completed;
  const failedAdd =
    listPhase.phase === 'not_applied' &&
    listPhase.write.kind === 'apply' &&
    listPhase.write.operation?.type === 'step.create'
      ? listPhase.write.operation
      : null;
  const changedAdd =
    failedAdd?.titles.length === 1 && newStep.trim() !== failedAdd.titles[0];
  const canAdd =
    canEdit &&
    (!isUnresolved(listPhase) || changedAdd) &&
    newStep.trim().length > 0;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  function add() {
    if (!canAdd || !store) return;
    const submitted = newStep;
    if (changedAdd) store.supersedeNotApplied(stepsKey(taskRef));
    void store
      .applyOperation(
        stepsKey(taskRef),
        stepCreateOperation(taskRef, submitted),
        { kind: 'ui_control' }
      )
      .then(() => {
        // Clear only the text that was saved, never a newer one typed meanwhile.
        if (
          store.get(stepsKey(taskRef)).phase === 'saved' &&
          (store.draft(newStepDraftKey(taskRef)) ?? submitted) === submitted
        )
          store.setDraft(newStepDraftKey(taskRef), undefined);
      });
  }

  function complete() {
    if (!canEdit || !store || isUnresolved(taskPhase)) return;
    void store.setState(setStateOperation(progress, 'completed'));
  }

  const allDone = steps.length > 0 && done === steps.length;
  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel} accessibilityRole='header'>
          {t('taskSteps.title')}
        </Text>
        {steps.length > 0 && (
          <Text style={styles.count}>
            {t('taskSteps.count', { done, total: steps.length })}
          </Text>
        )}
      </View>
      {completed && steps.length > 0 ? (
        <Text style={styles.hint}>
          {t('taskSteps.completedSummary', { done, total: steps.length })}
        </Text>
      ) : (
        <Text style={styles.hint}>{t('taskSteps.hint')}</Text>
      )}
      {steps.length === 0 && !completed && (
        <Text style={styles.hint}>{t('taskSteps.empty')}</Text>
      )}

      <View accessibilityRole='list'>
        {steps.map(step => (
          <StepRow
            key={step.stepId}
            step={step}
            store={store}
            canEdit={canEdit}
            taskRef={taskRef}
          />
        ))}
      </View>

      {allDone && !completed && (
        <View style={styles.offer} accessibilityLiveRegion='polite'>
          <Text style={styles.offerText}>
            {t('taskSteps.allDone', { state: stateLabel(progress.state) })}
          </Text>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskSteps.markComplete')}
            disabled={!canEdit || isUnresolved(taskPhase)}
            accessibilityState={{
              disabled: !canEdit || isUnresolved(taskPhase),
            }}
            onPress={complete}
            style={({ pressed }) => [
              styles.primaryButton,
              { minHeight: minTarget() },
              (!canEdit || isUnresolved(taskPhase)) && styles.disabled,
              pressed && canEdit && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {t('taskSteps.markComplete')}
            </Text>
          </Pressable>
        </View>
      )}

      {!completed && (
        <View style={styles.addRow}>
          <TextInput
            value={newStep}
            onChangeText={text =>
              store?.setDraft(newStepDraftKey(taskRef), text)
            }
            placeholder={t('taskSteps.newStepPlaceholder')}
            placeholderTextColor='#94A3B8'
            maxLength={STEP_TITLE_MAX}
            editable={Boolean(store)}
            accessibilityLabel={t('taskSteps.newStepLabel')}
            returnKeyType='done'
            onSubmitEditing={add}
            style={[styles.input, { minHeight: minTarget() }]}
          />
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('taskSteps.add')}
            disabled={!canAdd}
            accessibilityState={{ disabled: !canAdd }}
            onPress={add}
            style={({ pressed }) => [
              styles.secondaryButton,
              { minHeight: minTarget() },
              !canAdd && styles.disabled,
              pressed && canAdd && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{t('taskSteps.add')}</Text>
          </Pressable>
        </View>
      )}

      <View accessibilityLiveRegion='polite' style={styles.status}>
        <StepPhase
          store={store}
          storeKey={stepsKey(taskRef)}
          writable={canEdit}
          draft={newStep}
          steps={steps}
        />
      </View>
    </View>
  );
}

function StepRow({
  step,
  store,
  canEdit,
  taskRef,
}: {
  step: TaskStep;
  store: TaskActionStore | null;
  canEdit: boolean;
  taskRef: string;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, stepKey(step.stepId));
  const listPhase = useTaskActionPhase(store, stepsKey(taskRef));
  const edit = useTaskActionDraft(store, editDraftKey(step.stepId));
  const [confirming, setConfirming] = useState(false);
  const busy = isUnresolved(phase);
  const canWrite = canEdit && !busy;
  const editing = edit !== undefined;
  const editChanged =
    editing && edit.trim().length > 0 && edit.trim() !== step.title;
  const failedUpdate =
    phase.phase === 'not_applied' &&
    phase.write.kind === 'apply' &&
    phase.write.operation?.type === 'step.update'
      ? phase.write.operation
      : null;
  const changedUpdate =
    failedUpdate !== null &&
    edit !== undefined &&
    edit.trim() !== failedUpdate.title;
  const canSaveEdit = canEdit && editChanged && (!busy || changedUpdate);

  function toggle() {
    if (!canWrite || !store) return;
    void store.applyOperation(
      stepKey(step.stepId),
      stepDoneOperation(step, !step.done),
      { kind: 'ui_control' }
    );
  }

  function saveEdit() {
    if (!canSaveEdit || !store || edit === undefined) return;
    const submitted = edit;
    if (changedUpdate) store.supersedeNotApplied(stepKey(step.stepId));
    void store
      .applyOperation(
        stepKey(step.stepId),
        stepUpdateOperation(step, submitted),
        { kind: 'ui_control' }
      )
      .then(() => {
        if (
          store.get(stepKey(step.stepId)).phase === 'saved' &&
          store.draft(editDraftKey(step.stepId)) === submitted
        )
          store.setDraft(editDraftKey(step.stepId), undefined);
      });
  }

  function remove() {
    if (!canWrite || !store || isUnresolved(listPhase)) return;
    setConfirming(false);
    // The removal's result and its Undo belong to the task's step list: the row goes.
    void store.applyOperation(stepsKey(taskRef), stepRemoveOperation(step), {
      kind: 'ui_control',
      removal_confirmed: true,
    });
  }

  return (
    <View style={styles.step}>
      <View style={styles.stepRow}>
        <Pressable
          accessibilityRole='checkbox'
          accessibilityLabel={step.title}
          accessibilityState={{ checked: step.done, disabled: !canWrite }}
          disabled={!canWrite}
          onPress={toggle}
          style={({ pressed }) => [
            styles.check,
            { minHeight: minTarget() },
            pressed && canWrite && styles.pressed,
          ]}
        >
          <MaterialIcons
            name={step.done ? 'check-box' : 'check-box-outline-blank'}
            size={22}
            color={step.done ? ACCENT : INK_MUTED}
          />
          <Text
            style={[
              styles.stepText,
              step.done && styles.stepTextDone,
              !canEdit && styles.stepTextReadOnly,
            ]}
          >
            {step.title}
          </Text>
        </Pressable>
        {canEdit && !editing && (
          <>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.editA11y', {
                title: step.title,
              })}
              disabled={!canWrite}
              accessibilityState={{ disabled: !canWrite }}
              onPress={() =>
                store?.setDraft(editDraftKey(step.stepId), step.title)
              }
              style={[styles.iconButton, squareTarget()]}
            >
              <MaterialIcons name='edit' size={18} color={INK_MUTED} />
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.removeA11y', {
                title: step.title,
              })}
              disabled={!canWrite}
              accessibilityState={{ disabled: !canWrite }}
              onPress={() => setConfirming(true)}
              style={[styles.iconButton, squareTarget()]}
            >
              <MaterialIcons
                name='delete-outline'
                size={18}
                color={INK_MUTED}
              />
            </Pressable>
          </>
        )}
      </View>

      {editing && (
        <View style={styles.editBlock}>
          <TextInput
            value={edit}
            onChangeText={text =>
              store?.setDraft(editDraftKey(step.stepId), text)
            }
            maxLength={STEP_TITLE_MAX}
            accessibilityLabel={t('taskSteps.editLabel')}
            style={[styles.input, { minHeight: minTarget() }]}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.save')}
              disabled={!canSaveEdit}
              accessibilityState={{ disabled: !canSaveEdit }}
              onPress={saveEdit}
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: minTarget() },
                !canSaveEdit && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {t('taskSteps.save')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.cancelEdit')}
              onPress={() =>
                store?.setDraft(editDraftKey(step.stepId), undefined)
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: minTarget() },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {t('taskSteps.cancelEdit')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {confirming && (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>
            {t('taskSteps.confirmRemove', { title: step.title })}
          </Text>
          <Text style={styles.confirmBody}>
            {t('taskSteps.confirmRemoveBody')}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.remove')}
              disabled={!canWrite}
              accessibilityState={{ disabled: !canWrite }}
              onPress={remove}
              style={({ pressed }) => [
                styles.primaryButton,
                { minHeight: minTarget() },
                !canWrite && styles.disabled,
                pressed && canWrite && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {t('taskSteps.remove')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={t('taskSteps.keep')}
              onPress={() => setConfirming(false)}
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: minTarget() },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {t('taskSteps.keep')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View accessibilityLiveRegion='polite'>
        <StepPhase
          store={store}
          storeKey={stepKey(step.stepId)}
          writable={canEdit}
          draft={edit}
          steps={[step]}
        />
      </View>
    </View>
  );
}

/** The outcome of the last step write of one key, and its receipt with Undo. */
function StepPhase({
  store,
  storeKey,
  writable,
  draft,
  steps,
}: {
  store: TaskActionStore | null;
  storeKey: string;
  writable: boolean;
  draft?: string;
  steps: readonly TaskStep[];
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  const receipt =
    phase.phase === 'saved'
      ? {
          ...phase.receipt,
          current:
            phase.receipt.current &&
            (phase.receipt.steps ?? []).every(recorded => {
              const current = steps.find(
                step => step.stepId === recorded.stepId
              );
              return recorded.removed
                ? !current
                : current?.revision === recorded.afterRevision;
            }),
        }
      : null;
  const operation =
    phase.phase === 'not_applied' && phase.write.kind === 'apply'
      ? phase.write.operation
      : undefined;
  const matchesDraft =
    draft === undefined ||
    (operation?.type === 'step.update'
      ? draft.trim() === operation.title
      : operation?.type === 'step.create'
        ? operation.titles.length === 1 && draft.trim() === operation.titles[0]
        : true);
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  if (phase.phase === 'idle') return null;
  const stepMessage =
    phase.phase === 'conflict'
      ? t('taskSteps.conflict')
      : phase.phase === 'refused' && phase.reason === 'task_completed'
        ? t('taskSteps.taskCompleted')
        : phase.phase === 'refused' &&
            (phase.reason === 'task_removed' ||
              phase.reason === 'task_not_found')
          ? t('taskSteps.removedTask')
          : null;
  return (
    <View style={styles.phase}>
      {stepMessage ? (
        <Text style={[styles.statusText, styles.statusError]}>
          {stepMessage}
        </Text>
      ) : (
        <PhaseMessage
          writable={writable && matchesDraft}
          phase={phase}
          stateLabel={stateLabel}
          store={store}
          taskRef={storeKey}
          steps={steps}
        />
      )}
      {receipt && (
        <ReceiptBlock
          receipt={receipt}
          storeKey={storeKey}
          store={store}
          canWrite={writable && !isUnresolved(phase)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: { ...typography.caption, fontWeight: '600', color: INK },
  count: { ...typography.caption, color: INK_SECONDARY },
  hint: { ...typography.caption, color: INK_MUTED },
  step: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    paddingVertical: 2,
    gap: 6,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  check: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  stepText: { ...typography.secondary, color: INK, flexShrink: 1 },
  stepTextDone: { color: INK_SECONDARY },
  stepTextReadOnly: { color: INK_SECONDARY },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  editBlock: { gap: 8, paddingBottom: 8 },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    ...typography.secondary,
    color: INK,
    flexGrow: 1,
    flexBasis: 180,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    ...typography.secondary,
    fontWeight: '600',
    color: INK,
  },
  primaryButton: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_STRONG,
  },
  primaryButtonText: {
    ...typography.secondary,
    fontWeight: '600',
    color: '#fff',
  },
  offer: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FBD5A5',
    backgroundColor: ACCENT_BG,
  },
  offerText: { ...typography.secondary, color: INK },
  confirm: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: SURFACE_MUTED,
    marginBottom: 8,
  },
  confirmTitle: { ...typography.secondary, fontWeight: '600', color: INK },
  confirmBody: { ...typography.caption, color: INK_SECONDARY },
  status: { gap: 8 },
  phase: { gap: 8, paddingBottom: 6 },
  statusText: { ...typography.secondary, color: INK_SECONDARY },
  statusError: { color: '#B42318' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
