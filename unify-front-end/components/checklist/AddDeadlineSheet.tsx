import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet from '@/components/common/BottomSheet';
import { DatePickerField } from '@/components/checklist/DatePickerField';
import { DEADLINE_KIND_ICON } from '@/constants/DeadlineKinds';
import { DEADLINE_KINDS, REMINDER_OFFSETS_DAYS } from '@/types/deadlines';
import type { Deadline, DeadlineInput, DeadlineKind } from '@/types/deadlines';

export interface AddDeadlinePrefill {
  /** Editing an existing date. */
  deadline?: Deadline;
  /** Attaching a date to a checklist task. */
  linkedTaskKey?: string;
  linkedTaskTitle?: string;
}

interface Props {
  visible: boolean;
  prefill: AddDeadlinePrefill | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: DeadlineInput) => void;
  onAddTaskInstead?: () => void;
}

export const AddDeadlineSheet: React.FC<Props> = ({
  visible,
  prefill,
  saving,
  onClose,
  onSave,
  onAddTaskInstead,
}) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<DeadlineKind>('study_permit');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState<string | null>(null);

  const isLinked = !!prefill?.linkedTaskKey;
  const isEdit = !!prefill?.deadline;

  useEffect(() => {
    if (!visible) return;
    if (prefill?.deadline) {
      setKind(prefill.deadline.kind);
      setTitle(prefill.deadline.title);
      setDate(prefill.deadline.due_date);
      setTitleTouched(true);
    } else if (prefill?.linkedTaskKey) {
      setKind('other');
      setTitle(prefill.linkedTaskTitle ?? '');
      setDate(null);
      setTitleTouched(true);
    } else {
      setKind('study_permit');
      setTitle('');
      setDate(null);
      setTitleTouched(false);
    }
  }, [visible, prefill]);

  // Untouched titles follow the chosen kind so most users never type.
  const effectiveTitle = titleTouched && title.trim()
    ? title.trim()
    : t(`checklist.deadline.defaultTitles.${kind}`);

  const canSave = !!date && effectiveTitle.length > 0 && !saving;

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={isLinked ? 0.56 : 0.86}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading} numberOfLines={3}>
            {isEdit
              ? t('checklist.deadline.editTitle')
              : isLinked
                ? t('checklist.deadline.setDateFor', { title: prefill?.linkedTaskTitle ?? '' })
                : t('checklist.deadline.addTitle')}
          </Text>

          {!isLinked && (
            <>
              <Text style={styles.label}>{t('checklist.deadline.kindLabel')}</Text>
              <View style={styles.chips}>
                {DEADLINE_KINDS.map(k => {
                  const on = k === kind;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setKind(k)}
                      accessibilityRole='button'
                      accessibilityState={{ selected: on }}
                    >
                      <MaterialIcons
                        name={DEADLINE_KIND_ICON[k]}
                        size={15}
                        color={on ? '#fff' : '#334155'}
                      />
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {t(`checklist.deadline.kinds.${k}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('checklist.deadline.nameLabel')}</Text>
              <TextInput
                style={styles.input}
                value={titleTouched ? title : effectiveTitle}
                onChangeText={v => {
                  setTitleTouched(true);
                  setTitle(v);
                }}
                onFocus={() => {
                  if (!titleTouched) {
                    setTitle(effectiveTitle);
                    setTitleTouched(true);
                  }
                }}
                maxLength={120}
                placeholder={t('checklist.deadline.namePlaceholder')}
                placeholderTextColor='#9AA3AF'
                returnKeyType='done'
              />
            </>
          )}

          <Text style={styles.label}>{t('checklist.deadline.dateLabel')}</Text>
          <DatePickerField
            value={date}
            onChange={setDate}
            placeholder={t('checklist.deadline.pickDate')}
          />

          <Text style={styles.label}>{t('checklist.deadline.remindMe')}</Text>
          <View style={styles.rem}>
            {REMINDER_OFFSETS_DAYS.map(o => (
              <Text key={o} style={styles.remChip}>
                {t('checklist.deadline.daysBefore', { n: o })}
              </Text>
            ))}
          </View>

          <Text style={styles.note}>{t('checklist.deadline.onlyDateSaved')}</Text>

          <TouchableOpacity
            style={[styles.save, !canSave && styles.saveDisabled]}
            disabled={!canSave}
            onPress={() =>
              date &&
              onSave({
                kind: isLinked ? 'other' : kind,
                title: effectiveTitle,
                due_date: date,
                linked_task_key: prefill?.linkedTaskKey ?? prefill?.deadline?.linked_task_key ?? null,
              })
            }
            accessibilityRole='button'
            accessibilityState={{ disabled: !canSave }}
          >
            <Text style={styles.saveText}>{t('checklist.deadline.saveDate')}</Text>
          </TouchableOpacity>

          {!isLinked && !isEdit && onAddTaskInstead && (
            <TouchableOpacity onPress={onAddTaskInstead} style={styles.alt} accessibilityRole='button'>
              <Text style={styles.altText}>{t('checklist.deadline.addTaskInstead')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  heading: { fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B6B6B', marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D6D5D5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  chipTextOn: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#D6D5D5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
  },
  rem: { flexDirection: 'row', gap: 6 },
  remChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  note: { fontSize: 12.5, color: '#94A3B8', lineHeight: 17, marginTop: 12 },
  save: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  alt: { alignItems: 'center', paddingVertical: 14 },
  altText: { color: '#F68B26', fontSize: 15, fontWeight: '600' },
});
