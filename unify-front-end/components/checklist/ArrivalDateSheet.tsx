import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/common/BottomSheet';
import { ArrivalDatePicker } from '@/components/checklist/ArrivalDatePicker';
import { formatLocalDate, parseArrivalDate } from '@/helpers/arrivalDate';
import { getArrivalDateRange } from '@/helpers/arrivalDatePicker';
import { getBottomSheetPadding } from '@/utils/safeAreaSpacing';

interface Props {
  visible: boolean;
  /** Current arrival date, YYYY-MM-DD. */
  arrivalDate: string;
  isSaving: boolean;
  /** Called with the picked YYYY-MM-DD. The parent decides when to close. */
  onSave: (arrivalDate: string) => void;
  onClose: () => void;
}

type Range = ReturnType<typeof getArrivalDateRange>;

const presetFor = (arrivalDate: string, range: Range): Date => {
  const parsed = parseArrivalDate(arrivalDate)?.toDate() ?? new Date();
  if (parsed < range.min) return new Date(range.min);
  if (parsed > range.max) return new Date(range.max);
  return parsed;
};

/** Bottom sheet to change the arrival date. Nothing is saved until Save. */
export function ArrivalDateSheet({
  visible,
  arrivalDate,
  isSaving,
  onSave,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  // Fixed per opening, so the allowed range cannot shift under the picker.
  const range = useMemo(() => getArrivalDateRange(new Date()), [visible]);
  const [selected, setSelected] = useState(() => presetFor(arrivalDate, range));

  // Each opening starts from the saved date; a failed save keeps the pick.
  useEffect(() => {
    if (visible) setSelected(presetFor(arrivalDate, range));
  }, [visible, arrivalDate, range]);

  const selectedDay = formatLocalDate(selected);
  const canSave = selectedDay !== arrivalDate && !isSaving;

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.64}>
      <View
        style={[
          styles.content,
          { paddingBottom: getBottomSheetPadding(insets.bottom) },
        ]}
      >
        <Text style={styles.title} accessibilityRole='header'>
          {t('checklist.arrivalDate.sheetTitle')}
        </Text>
        <ArrivalDatePicker
          value={selected}
          min={range.min}
          max={range.max}
          language={i18n.language}
          onChange={setSelected}
        />
        <Pressable
          onPress={() => canSave && onSave(selectedDay)}
          disabled={!canSave}
          accessibilityRole='button'
          accessibilityLabel={t('checklist.arrivalDate.save')}
          accessibilityState={{ disabled: !canSave, busy: isSaving }}
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && styles.saveButtonDisabled,
            pressed && styles.saveButtonPressed,
          ]}
        >
          {isSaving ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.saveText}>
              {t('checklist.arrivalDate.save')}
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: '#000',
    marginBottom: 12,
  },
  saveButton: {
    marginTop: 'auto',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#059669',
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonPressed: {
    opacity: 0.8,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
