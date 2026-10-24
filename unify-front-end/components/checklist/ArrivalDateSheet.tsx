import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/common/BottomSheet';
import { typography } from '@/constants/Typography';
import { ArrivalDatePicker } from '@/components/checklist/ArrivalDatePicker';
import { formatLocalDate, parseArrivalDate } from '@/helpers/arrivalDate';
import {
  getArrivalDateRange,
  isArrivalDateInRange,
} from '@/helpers/arrivalDatePicker';
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
  const { fontScale } = useWindowDimensions();
  // Larger text needs a taller sheet. The content scrolls when it still does
  // not fit, so Save is always reachable.
  const snapPoint = Math.min(
    MAX_SNAP_POINT,
    BASE_SNAP_POINT + SNAP_POINT_PER_FONT_SCALE * Math.max(0, fontScale - 1)
  );
  // Fixed per opening, so the allowed range cannot shift under the picker.
  const range = useMemo(() => getArrivalDateRange(new Date()), [visible]);
  // Only an explicit pick counts. The saved date is shown as it is, even when
  // it lies outside the range for a new date, and is never turned into a pick.
  const [picked, setPicked] = useState<Date | null>(null);

  // Each opening starts from the saved date; a failed save keeps the pick.
  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible, arrivalDate]);

  const shown = picked ?? parseArrivalDate(arrivalDate)?.toDate() ?? range.min;
  const pickedDay = picked ? formatLocalDate(picked) : null;
  const canSave =
    pickedDay !== null &&
    pickedDay !== arrivalDate &&
    isArrivalDateInRange(pickedDay) &&
    !isSaving;

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={snapPoint}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: getBottomSheetPadding(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.title} accessibilityRole='header'>
          {t('checklist.arrivalDate.sheetTitle')}
        </Text>
        <ArrivalDatePicker
          value={shown}
          min={range.min}
          max={range.max}
          language={i18n.language}
          onChange={setPicked}
        />
        <Pressable
          onPress={() => canSave && pickedDay && onSave(pickedDay)}
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
            <ActivityIndicator color={SAVE_TEXT_COLOR} />
          ) : (
            <Text style={styles.saveText}>
              {t('checklist.arrivalDate.save')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const BASE_SNAP_POINT = 0.64;
const SNAP_POINT_PER_FONT_SCALE = 0.12;
const MAX_SNAP_POINT = 0.9;

// White on this green is 5.48:1, above the 4.5:1 minimum for normal text.
const SAVE_BACKGROUND = '#047857';
// Held down, Save darkens instead of fading: fading over the white sheet
// would drop the label below 4.5:1. White on this green is 7.68:1.
const SAVE_PRESSED_BACKGROUND = '#065F46';
const SAVE_TEXT_COLOR = '#FFFFFF';

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: 4,
  },
  title: {
    ...typography.section,
    color: '#000',
    marginBottom: 12,
  },
  saveButton: {
    marginTop: 'auto',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: SAVE_BACKGROUND,
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonPressed: {
    backgroundColor: SAVE_PRESSED_BACKGROUND,
  },
  saveText: {
    ...typography.button,
    color: SAVE_TEXT_COLOR,
  },
});
